// This personal shared workspace relies on the Site's owner and invited-viewer allowlist.
// Service collectors use Sites service authorization; no Etsy secrets leave the server.
const UTC_DAY=()=>new Date().toISOString().slice(0,10);
const iso=()=>new Date().toISOString();
const activeSQL="(l.watched=1 OR EXISTS (SELECT 1 FROM keyword_listings k WHERE k.listing_id=l.listing_id))";
class TrackerError extends Error{constructor(message,status=400){super(message);this.status=status}}
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const all=async(db,sql,...args)=>(await stmt(db,sql,...args).all()).results;
const first=(db,sql,...args)=>stmt(db,sql,...args).first();
const run=(db,sql,...args)=>stmt(db,sql,...args).run();
export function weeklyMetrics(latest,baseline,today=UTC_DAY()){
 const valid=latest&&baseline&&new Date(latest.day+'T00:00:00Z').getTime()-new Date(baseline.day+'T00:00:00Z').getTime()===7*86400000;
 const delta=(key,stock=false)=>valid&&latest[key]!=null&&baseline[key]!=null?(stock?baseline[key]-latest[key]:latest[key]-baseline[key]):null;
 const favorites=delta('favorites');return{favorite_growth_7d:favorites,net_stock_drop_7d:delta('quantity',true),views_growth_7d:delta('views'),shop_sales_growth_7d:delta('shop_sales'),breakout:!!(valid&&latest.day===today&&favorites!==null&&favorites>=Math.max(10,(baseline.favorites||0)*.25)),stale:!latest||latest.day!==today,baseline_day:valid?baseline.day:null};
}
export async function reserveEtsyRequest(db){
 const day=UTC_DAY();const budget=await first(db,'INSERT INTO etsy_request_budget(day,requests) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1 WHERE requests<4500 RETURNING requests',day);
 if(!budget)throw new TrackerError('The tracker’s 4,500-request daily safety budget is used. Collection can resume tomorrow.',429);
 const now=Date.now(),slot=await first(db,'INSERT INTO etsy_rate_gate(id,next_ms) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET next_ms=MAX(next_ms,?)+300 RETURNING next_ms',now+300,now);
 const wait=Math.max(0,slot.next_ms-300-Date.now());if(wait>15000)throw new TrackerError('Collector is busy. Retry in a moment.',429);if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
}
function listingUpsert(db,row,watched=0){const now=iso();return stmt(db,`INSERT INTO tracked_listings(listing_id,payload,watched,created_at,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tracked_listings WHERE listing_id=?) OR (SELECT count(*) FROM tracked_listings)<1000 ON CONFLICT(listing_id) DO UPDATE SET payload=excluded.payload,watched=MAX(tracked_listings.watched,excluded.watched),updated_at=excluded.updated_at,last_error=NULL`,row.listing_id,JSON.stringify(row),watched,now,now,row.listing_id)}
function snapshotStatement(db,row,day=UTC_DAY()){return stmt(db,'INSERT OR IGNORE INTO daily_snapshots(listing_id,day,observed_at,favorites,quantity,views,shop_sales) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tracked_listings WHERE listing_id=?)',row.listing_id,day,iso(),row.favorites??null,row.quantity??null,row.views??null,row.shop_sales??null,row.listing_id)}
async function storeLive(db,row,watched=0){await db.batch([listingUpsert(db,row,watched),snapshotStatement(db,row)]);const found=await first(db,'SELECT listing_id FROM tracked_listings WHERE listing_id=?',row.listing_id);if(!found)throw new TrackerError('1,000 stored listing limit reached. Remove unused listings to make room.',409)}
export async function collectionStatus(db,day=UTC_DAY()){
 const job=await first(db,'SELECT * FROM collection_runs WHERE day=?',day);
 if(!job)return {day,status:'not_started',pending:0,done:0,failed:0,warnings:0,total:0};
 const counts=await first(db,"SELECT count(*) total,COALESCE(sum(state='pending'),0) pending,COALESCE(sum(state='done'),0) done,COALESCE(sum(state='error'),0) failed,COALESCE(sum(state='done' AND error IS NOT NULL),0) warnings FROM collection_tasks WHERE day=?",day);
 const errors=await all(db,'SELECT kind,item_key,error FROM collection_tasks WHERE day=? AND error IS NOT NULL LIMIT 8',day);
 return {...job,...counts,errors};
}
async function finishIfReady(db,day){const status=await collectionStatus(db,day);if(!status.pending){await run(db,'UPDATE collection_runs SET status=?,finished_at=? WHERE day=?',status.failed||status.warnings?'partial':'complete',iso(),day)}return collectionStatus(db,day)}
export async function startCollection(db){
 const day=UTC_DAY(),now=iso();
 await db.batch([
  stmt(db,"INSERT OR IGNORE INTO collection_runs(day,started_at,status) VALUES (?,?,'running')",day,now),
  stmt(db,"INSERT OR IGNORE INTO collection_tasks(day,kind,item_key) SELECT ?,'keyword',keyword FROM keywords",day),
  stmt(db,`INSERT OR IGNORE INTO collection_tasks(day,kind,item_key) SELECT ?,'listing',CAST(l.listing_id AS TEXT) FROM tracked_listings l WHERE ${activeSQL}`,day),
  stmt(db,"INSERT OR IGNORE INTO collection_tasks(day,kind,item_key) SELECT ?,'shop',CAST(shop_id AS TEXT) FROM tracked_shops",day),
  stmt(db,"UPDATE collection_tasks SET state='pending',error=NULL WHERE day=? AND state='error' AND attempts<3",day),
  stmt(db,"UPDATE collection_runs SET status='running',finished_at=NULL WHERE day=? AND EXISTS (SELECT 1 FROM collection_tasks WHERE day=? AND state='pending')",day,day),
 ]);
 return finishIfReady(db,day);
}
export async function stepCollection(db,day,client,normalize,shopNormalizer){
 if(day!==UTC_DAY())throw new TrackerError('Start a new collection for today; historical days cannot be backfilled from current data.',409);
 if(!await first(db,'SELECT day FROM collection_runs WHERE day=?',day))throw new TrackerError('Start collection before processing it.',409);
 const token=crypto.randomUUID(),now=Date.now();
 const lease=await first(db,'INSERT INTO collector_lease(id,token,expires_ms) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_ms=excluded.expires_ms WHERE expires_ms<? RETURNING token',token,now+120000,now);
 if(!lease)return {...await collectionStatus(db,day),busy:true};
 try{
  await run(db,"UPDATE collection_tasks SET state='error',error='Attempt limit reached. A future daily run will try again.' WHERE day=? AND state='pending' AND attempts>=3",day);
  let tasks=await all(db,"SELECT * FROM collection_tasks WHERE day=? AND state='pending' AND attempts<3 ORDER BY CASE kind WHEN 'keyword' THEN 0 ELSE 1 END,item_key LIMIT 3",day);
  if(tasks[0]?.kind==='keyword')tasks=tasks.slice(0,1);
  let stop=false;
  for(const task of tasks){
   if(stop)break;
   await run(db,'UPDATE collection_tasks SET attempts=attempts+1 WHERE day=? AND kind=? AND item_key=?',day,task.kind,task.item_key);
   let warning=null;
   try{
    if(task.kind==='keyword'){
     if(await first(db,'SELECT keyword FROM keywords WHERE keyword=?',task.item_key)){
      const result=await client.get(`listings/active?keywords=${encodeURIComponent(task.item_key)}&limit=20&sort_on=score&sort_order=desc`,{fresh:true});
      const statements=[];
      for(const item of result.results||[]){const row=normalize(item,null);statements.push(listingUpsert(db,row));statements.push(stmt(db,'INSERT OR IGNORE INTO keyword_listings(keyword,listing_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM tracked_listings WHERE listing_id=?) AND EXISTS(SELECT 1 FROM keywords WHERE keyword=?)',task.item_key,row.listing_id,row.listing_id,task.item_key));statements.push(stmt(db,"INSERT OR IGNORE INTO collection_tasks(day,kind,item_key) SELECT ?,'listing',? WHERE EXISTS(SELECT 1 FROM tracked_listings WHERE listing_id=?)",day,String(row.listing_id),row.listing_id))}
      if(statements.length)await db.batch(statements);
      const count=await first(db,'SELECT count(*) count FROM tracked_listings');if(count.count>=1000)warning='1,000-listing storage limit reached; discovery may be limited.';
     }
    }else if(task.kind==='shop'){
     const watched=await first(db,'SELECT shop_id FROM tracked_shops WHERE shop_id=?',Number(task.item_key));
     if(watched&&!await first(db,'SELECT shop_id FROM shop_daily_snapshots WHERE shop_id=? AND day=?',watched.shop_id,day)){const row=shopNormalizer(await client.get(`shops/${watched.shop_id}`,{fresh:true}));await storeShop(db,row)}
    }else{
     const watched=await first(db,`SELECT l.listing_id FROM tracked_listings l WHERE l.listing_id=? AND ${activeSQL}`,Number(task.item_key));
     if(watched){
      const already=await first(db,'SELECT listing_id FROM daily_snapshots WHERE listing_id=? AND day=?',watched.listing_id,day);
      if(!already){const item=await client.get(`listings/${watched.listing_id}`,{fresh:true});let shop=null;
       try{shop=await client.get(`shops/${item.shop_id}`,{ttl:900000})}catch(e){warning=`Shop metrics unavailable: ${e.message}`;if(e.status===429)stop=true}
       const row=normalize(item,shop);await storeLive(db,row);if(warning)await run(db,'UPDATE tracked_listings SET last_error=? WHERE listing_id=?',warning,watched.listing_id);
      }
     }
    }
    await run(db,"UPDATE collection_tasks SET state='done',error=? WHERE day=? AND kind=? AND item_key=?",warning,day,task.kind,task.item_key);
   }catch(e){
    await run(db,"UPDATE collection_tasks SET state='error',error=? WHERE day=? AND kind=? AND item_key=?",String(e.message).slice(0,500),day,task.kind,task.item_key);
    if(task.kind==='shop')await run(db,'UPDATE tracked_shops SET last_error=? WHERE shop_id=?',String(e.message).slice(0,500),Number(task.item_key));
    if(task.kind==='listing')await run(db,'UPDATE tracked_listings SET last_error=? WHERE listing_id=?',String(e.message).slice(0,500),Number(task.item_key));
    if(e.status===429){stop=true;await run(db,"UPDATE collection_tasks SET state='error',error='Daily collection paused after Etsy or local rate limit; retry later.' WHERE day=? AND state='pending'",day)}
   }
  }
  return finishIfReady(db,day);
 }finally{await run(db,'DELETE FROM collector_lease WHERE id=1 AND token=?',token)}
}
async function storeShop(db,row){
 const now=iso(),day=UTC_DAY();
 await db.batch([
 stmt(db,'INSERT INTO tracked_shops(shop_id,payload,created_at,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM tracked_shops WHERE shop_id=?) OR (SELECT count(*) FROM tracked_shops)<50 ON CONFLICT(shop_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,last_error=NULL',row.shop_id,JSON.stringify(row),now,now,row.shop_id),
 stmt(db,'INSERT OR IGNORE INTO shop_daily_snapshots(shop_id,day,observed_at,favorites,shop_sales,active_listings,review_count) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tracked_shops WHERE shop_id=?)',row.shop_id,day,now,row.favorites??null,row.shop_sales??null,row.active_listings??null,row.review_count??null,row.shop_id)
 ]);
 if(!await first(db,'SELECT shop_id FROM tracked_shops WHERE shop_id=?',row.shop_id))throw new TrackerError('50-shop tracking limit reached.',409);
}
async function watchlistData(db){
 const keywordRows=await all(db,'SELECT keyword FROM keywords ORDER BY keyword');
 const records=await all(db,`SELECT l.*,s.day,s.observed_at,s.favorites,s.quantity,s.views,s.shop_sales,b.day baseline_day,b.favorites baseline_favorites,b.quantity baseline_quantity,b.views baseline_views,b.shop_sales baseline_shop_sales,(SELECT count(*) FROM daily_snapshots h WHERE h.listing_id=l.listing_id) history_days FROM tracked_listings l LEFT JOIN daily_snapshots s ON s.listing_id=l.listing_id AND s.day=(SELECT MAX(h.day) FROM daily_snapshots h WHERE h.listing_id=l.listing_id) LEFT JOIN daily_snapshots b ON b.listing_id=l.listing_id AND b.day=date(s.day,'-7 days') WHERE ${activeSQL} ORDER BY l.updated_at DESC`);
 const listings=records.map(r=>{const row=JSON.parse(r.payload),latest=r.day?{day:r.day,favorites:r.favorites,quantity:r.quantity,views:r.views,shop_sales:r.shop_sales}:null,baseline=r.baseline_day?{day:r.baseline_day,favorites:r.baseline_favorites,quantity:r.baseline_quantity,views:r.baseline_views,shop_sales:r.baseline_shop_sales}:null;return {...row,...weeklyMetrics(latest,baseline),last_snapshot:r.observed_at||null,history_days:r.history_days,last_error:r.last_error,explicitly_watched:!!r.watched}});
 const lastRun=await first(db,'SELECT day FROM collection_runs ORDER BY day DESC LIMIT 1');const job=lastRun?await collectionStatus(db,lastRun.day):null;
 const count=await first(db,'SELECT count(*) count FROM daily_snapshots');
 const settings=await first(db,"SELECT value FROM tracker_settings WHERE key='schedule'");
 const shopRecords=await all(db,`SELECT s.*,h.day,h.observed_at,h.favorites,h.shop_sales,h.active_listings,b.day baseline_day,b.favorites baseline_favorites,b.shop_sales baseline_shop_sales,b.active_listings baseline_active_listings,(SELECT count(*) FROM shop_daily_snapshots q WHERE q.shop_id=s.shop_id) history_days FROM tracked_shops s LEFT JOIN shop_daily_snapshots h ON h.shop_id=s.shop_id AND h.day=(SELECT MAX(q.day) FROM shop_daily_snapshots q WHERE q.shop_id=s.shop_id) LEFT JOIN shop_daily_snapshots b ON b.shop_id=s.shop_id AND b.day=date(h.day,'-7 days') ORDER BY s.updated_at DESC`);
 const shops=shopRecords.map(r=>{const weekly=weeklyMetrics(r.day?{day:r.day,favorites:r.favorites,shop_sales:r.shop_sales}:null,r.baseline_day?{day:r.baseline_day,favorites:r.baseline_favorites,shop_sales:r.baseline_shop_sales}:null);return{...JSON.parse(r.payload),...weekly,active_listing_growth_7d:r.day&&r.baseline_day&&r.active_listings!=null&&r.baseline_active_listings!=null?r.active_listings-r.baseline_active_listings:null,last_snapshot:r.observed_at||null,history_days:r.history_days,last_error:r.last_error}});
 return{shops,keywords:keywordRows.map(r=>r.keyword),listings,collection:job,snapshot_count:count.count,schedule:settings?JSON.parse(settings.value):null,storage:'cloud',today:UTC_DAY()};
}
async function bodyJSON(request){const length=Number(request.headers.get('Content-Length')||0);if(length>2e6)throw new TrackerError('Request is too large.',413);const text=await request.text();if(text.length>2e6)throw new TrackerError('Request is too large.',413);try{return JSON.parse(text||'{}')}catch{throw new TrackerError('Expected JSON request body.')}}
const keywordValue=value=>{if(typeof value!=='string')throw new TrackerError('Enter a keyword.');const key=value.trim().toLocaleLowerCase();if(!key||key.length>200)throw new TrackerError('Keyword must have 1–200 characters.');return key};
const listingID=value=>{if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<=0)throw new TrackerError('Enter a positive numeric Etsy listing ID.');return Number(value)};
export async function cloudRoute(request,env,client,normalize,shopNormalizer){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/api/watchlist')&&!path.startsWith('/api/collector'))return null;
 const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 try{
  if(!env.DB)throw new TrackerError('Cloud database is not configured.',503);
  // This access-restricted Site accepts service calls without visitor identity. Dispatch
  // authenticates those requests before forwarding; never expose this Site publicly.
  if(!['GET','POST','DELETE'].includes(request.method))throw new TrackerError('Method not allowed.',405);
  const origin=request.headers.get('Origin');if(request.method!=='GET'&&origin&&origin!==url.origin)throw new TrackerError('Cross-origin writes are not allowed.',403);
  const db=env.DB;
  if(path==='/api/watchlist'&&request.method==='GET')return reply(await watchlistData(db));
  if(path==='/api/watchlist/keywords'&&request.method==='POST'){const b=await bodyJSON(request),key=keywordValue(b.keyword);await run(db,'INSERT OR IGNORE INTO keywords(keyword,created_at) SELECT ?,? WHERE (SELECT count(*) FROM keywords)<50',key,iso());if(!await first(db,'SELECT keyword FROM keywords WHERE keyword=?',key))throw new TrackerError('50-keyword limit reached.',409);return reply({keyword:key,saved:true})}
  if(path==='/api/watchlist/keywords'&&request.method==='DELETE'){const key=keywordValue(url.searchParams.get('keyword'));await run(db,'DELETE FROM keywords WHERE keyword=?',key);return reply({removed:true})}
  if(path==='/api/watchlist/listings'&&request.method==='POST'){const b=await bodyJSON(request),id=listingID(b.listing_id),item=await client.get(`listings/${id}`,{fresh:true});let shop=null,warnings=[];try{shop=await client.get(`shops/${item.shop_id}`,{ttl:900000})}catch(e){warnings.push(e.message)}const row=normalize(item,shop);await storeLive(db,row,1);return reply({listing:row,warnings,saved:true})}
  if(path==='/api/watchlist/listings'&&request.method==='DELETE'){const id=listingID(url.searchParams.get('id'));await run(db,'DELETE FROM tracked_listings WHERE listing_id=?',id);return reply({removed:true,note:'Tracking and history removed. Saved keywords may discover this product again.'})}
  if(path==='/api/watchlist/shops'&&request.method==='POST'){const b=await bodyJSON(request),id=listingID(b.shop_id),shop=shopNormalizer(await client.get(`shops/${id}`,{fresh:true}));await storeShop(db,shop);return reply({saved:true,shop})}
  if(path==='/api/watchlist/shops'&&request.method==='DELETE'){const id=listingID(url.searchParams.get('id'));await run(db,'DELETE FROM tracked_shops WHERE shop_id=?',id);return reply({removed:true})}
  if(path==='/api/watchlist/shop-history'&&request.method==='GET'){const id=listingID(url.searchParams.get('id'));return reply({shop_id:id,history:await all(db,'SELECT * FROM (SELECT day,observed_at,favorites,shop_sales,active_listings,review_count FROM shop_daily_snapshots WHERE shop_id=? ORDER BY day DESC LIMIT 90) ORDER BY day',id)})}
  if(path==='/api/watchlist/history'&&request.method==='GET'){const id=listingID(url.searchParams.get('id'));return reply({listing_id:id,history:await all(db,'SELECT * FROM (SELECT day,observed_at,favorites,quantity,views,shop_sales FROM daily_snapshots WHERE listing_id=? ORDER BY day DESC LIMIT 90) ORDER BY day',id)})}
  if(path==='/api/watchlist/import'&&request.method==='POST'){
   const b=await bodyJSON(request);if(!Array.isArray(b.keywords)||!Array.isArray(b.listings)||b.keywords.length>50||b.listings.length>1000)throw new TrackerError('Import must contain up to 50 keywords and 1,000 listing IDs.');
   const keywords=[...new Set(b.keywords.map(keywordValue))],ids=[...new Set(b.listings.map(v=>listingID(typeof v==='object'?v.listing_id:v)))];
   const existing=await all(db,'SELECT keyword FROM keywords');if(new Set([...existing.map(r=>r.keyword),...keywords]).size>50)throw new TrackerError('Import would exceed the 50-keyword limit.',409);
   const statements=keywords.map(k=>stmt(db,'INSERT OR IGNORE INTO keywords(keyword,created_at) VALUES (?,?)',k,iso()));
   for(const id of ids){const now=iso();statements.push(stmt(db,`INSERT INTO tracked_listings(listing_id,payload,watched,created_at,updated_at) SELECT ?,?,1,?,? WHERE EXISTS(SELECT 1 FROM tracked_listings WHERE listing_id=?) OR (SELECT count(*) FROM tracked_listings)<1000 ON CONFLICT(listing_id) DO UPDATE SET watched=1`,id,JSON.stringify({listing_id:id,title:`Listing ${id} — waiting for first cloud observation`,demo:false}),now,now,id))}
   for(let i=0;i<statements.length;i+=75)await db.batch(statements.slice(i,i+75));
   return reply({imported:true,requested_keywords:keywords.length,requested_listings:ids.length,note:'Existing data preserved. Listing IDs are queued for real Etsy observations; client-provided metrics were not imported. The 1,000 stored-listing cap applies.'});
  }
  if(path==='/api/collector/status'&&request.method==='GET'){const day=url.searchParams.get('day')||UTC_DAY();if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new TrackerError('Invalid collection date.');return reply(await collectionStatus(db,day))}
  if(path==='/api/collector/start'&&request.method==='POST')return reply(await startCollection(db));
  if(path==='/api/collector/step'&&request.method==='POST'){const b=await bodyJSON(request);return reply(await stepCollection(db,b.day||UTC_DAY(),client,normalize,shopNormalizer))}
  if(path==='/api/collector/schedule'&&request.method==='POST'){const b=await bodyJSON(request);if(typeof b.enabled!=='boolean'||typeof b.label!=='string'||b.label.length>150)throw new TrackerError('Invalid schedule metadata.');await run(db,"INSERT INTO tracker_settings(key,value) VALUES ('schedule',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify({enabled:b.enabled,label:b.label,updated_at:iso()}));return reply({saved:true})}
  throw new TrackerError('Route not found.',404);
 }catch(e){return reply({error:e instanceof TrackerError||e.status?e.message:'The cloud tracker could not complete this request. Please retry.'},e.status||500)}
}
