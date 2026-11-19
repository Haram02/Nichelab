import {createMetricLoader} from './extension/metric-loader.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {listingFromURL,validID,PORTAL} from './extension/shared.js';
import {extensionRoute} from './extension-server.js';import worker,{normalize} from './dist/server/index.js';
const request=id=>new Request('https://site/api/extension/metrics?id='+id);
const etsy={get:async path=>path.startsWith('shops/')?{transaction_sold_count:1234}:{listing_id:555,shop_id:99,title:'Public item',num_favorers:70,quantity:950}};
test('extension parses real Etsy URLs and rejects other domains',()=>{assert.equal(listingFromURL('https://www.etsy.com/listing/123/item?ref=search'),'123');assert.equal(listingFromURL('https://www.etsy.com/in-en/listing/456/item'),'456');assert.equal(listingFromURL('https://www.etsy.com/search?q=gift'),null);assert.equal(listingFromURL('https://etsy.com.evil.test/listing/123'),null);assert.equal(listingFromURL('http://www.etsy.com/listing/123'),null);assert.equal(validID('-1'),false);assert.equal(validID('9007199254740993'),false)});
test('public metrics never fabricate competitor total or weekly sales',async()=>{const r=await extensionRoute(request(555),{},etsy,normalize);const d=await r.json();assert.equal(r.status,200);assert.equal(d.listing.favorites,70);assert.equal(d.listing.shop_sales,1234);assert.equal(d.total_units_sold,null);assert.equal(d.weekly_units_sold,null);assert.equal(d.tracked,false);assert.equal(d.weekly.net_stock_drop_7d,null);assert.equal(d.weekly.favorite_growth_7d,null)});
test('tracked history produces activity deltas independently of sales availability',async()=>{const today=new Date().toISOString().slice(0,10),prior=new Date(Date.now()-7*86400000).toISOString().slice(0,10);const latest={day:today,favorites:70,quantity:950,shop_sales:1234,observed_at:today+'T08:00:00Z'},baseline={day:prior,favorites:50,quantity:960,shop_sales:1200};const DB={prepare:sql=>({bind(){return this},async first(){if(sql.includes('FROM tracked_listings'))return{listing_id:555};if(sql.includes('count(*)'))return{count:8};if(sql.includes('ORDER BY day'))return latest;return baseline}})};const d=await(await extensionRoute(request(555),{DB},etsy,normalize)).json();assert.equal(d.tracked,true);assert.equal(d.weekly.favorite_growth_7d,20);assert.equal(d.weekly.net_stock_drop_7d,10);assert.equal(d.weekly.history_days,8);assert.equal(d.weekly_units_sold,null);assert.equal(d.total_units_sold,null)});
test('extension validates listing ID before fetching',async()=>{let calls=0;const client={get:async()=>{calls++}};const r=await extensionRoute(request('invalid'),{},client,normalize);assert.equal(r.status,400);assert.equal(calls,0)});
test('missing public shop metric remains missing',async()=>{const client={get:async path=>{if(path.startsWith('shops/'))throw Error('Unavailable');return{listing_id:555,shop_id:99,num_favorers:3}}};const d=await(await extensionRoute(request(555),{},client,normalize)).json();assert.equal(d.listing.shop_sales,null);assert.equal(d.warnings.length,1)});
test('manifest has limited permissions and no external web messaging',()=>{const m=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));assert.equal(m.manifest_version,3);assert.deepEqual(m.permissions,['activeTab','storage']);assert.deepEqual(m.host_permissions,[PORTAL+'/*']);assert.equal(m.externally_connectable,undefined);assert.equal(m.background.type,'module')});
let listener,login=false;const messages=[],updates=[];
globalThis.chrome={
 runtime:{onInstalled:{addListener:()=>{}},id:'extension-test',getURL:path=>'chrome-extension://extension-test/'+path,onMessage:{addListener:fn=>{listener=fn}}},
 tabs:{
  query:async()=>[{id:1,url:PORTAL+'/',status:'complete'}],
  get:async()=>({id:1,url:PORTAL+'/',status:'complete'}),
  create:async o=>({id:1,...o}),
  update:async(id,o)=>{updates.push(o);return{id,...o}},
  sendMessage:async(id,m)=>{
   messages.push(m);
   if(m.type==='NL_BRIDGE_PING')return login?{ok:false,code:'LOGIN'}:{ok:true};
   return{ok:true,data:{listing:{favorites:5},total_units_sold:null,weekly_units_sold:null}};
  }
 }
};
await import('./extension/background.js');
const sender={id:'extension-test',tab:{url:'https://www.etsy.com/search?q=gift'}};
const call=message=>new Promise(resolve=>{const pending=listener(message,sender,resolve);if(!pending)resolve(null)});
test('background uses authenticated website bridge instead of exposing credentials',async()=>{const r=await call({type:'NL_METRICS',listing_id:'555'});assert.equal(r.ok,true);assert.ok(messages.some(m=>m.type==='NL_BRIDGE_METRICS'&&m.listing_id==='555'));assert.equal(messages.some(m=>'token'in m||'api_key'in m),false)});
test('background denies non-extension callers and invalid IDs',async()=>{assert.equal(listener({type:'NL_METRICS',listing_id:'555'},{id:'other',tab:sender.tab},()=>{}),false);const r=await call({type:'NL_METRICS',listing_id:'bad'});assert.equal(r.ok,false)});
test('bridge authentication failures request sign-in rather than bypassing access',async()=>{login=true;const r=await call({type:'NL_METRICS',listing_id:'555',force:true});assert.equal(r.ok,false);assert.equal(r.code,'LOGIN');login=false});

test('hosted extension download is a ZIP attachment',async()=>{const r=await worker.fetch(new Request('https://site/downloads/niche-lab-etsy-extension.zip'),{});assert.equal(r.status,200);assert.match(r.headers.get('Content-Disposition'),/niche-lab-etsy-extension.zip/);const bytes=new Uint8Array(await r.arrayBuffer());assert.equal(bytes[0],80);assert.equal(bytes[1],75);assert.ok(bytes.length>5000)});

test('automatic metric loader reuses cached values and deduplicates inflight requests',async()=>{let calls=0;const loader=createMetricLoader(async()=>{calls++;return{ok:true,data:{favorites:4}}});const [a,b]=await Promise.all([loader.load('1'),loader.load('1')]);assert.equal(calls,1);assert.deepEqual(a,b);await loader.load('1');assert.equal(calls,1);await loader.load('1',{force:true});assert.equal(calls,2)});
test('automatic loader expires cache and retries failures instead of caching them',async()=>{let now=0,calls=0;const loader=createMetricLoader(async()=>{calls++;return{ok:calls>1}},{ttl:100,now:()=>now});await loader.load('1');await loader.load('1');assert.equal(calls,2);await loader.load('1');assert.equal(calls,2);now=101;await loader.load('1');assert.equal(calls,3);loader.invalidate('1');await loader.load('1');assert.equal(calls,4)});
test('automatic lookup concurrency is bounded',async()=>{let active=0,max=0;const resolvers=[];const loader=createMetricLoader(()=>new Promise(resolve=>{active++;max=Math.max(max,active);resolvers.push(()=>{active--;resolve({ok:true})})}),{concurrency:2});const jobs=[loader.load('1'),loader.load('2'),loader.load('3')];await new Promise(setImmediate);assert.equal(resolvers.length,2);resolvers.shift()();await new Promise(setImmediate);assert.equal(resolvers.length,2);for(const finish of resolvers)finish();await Promise.all(jobs);assert.equal(max,2)});
test('automatic loader rejects invalid IDs without issuing a request',async()=>{let calls=0;const loader=createMetricLoader(async()=>{calls++;return{ok:true}});await assert.rejects(()=>loader.load('bad'),/Invalid/);assert.equal(calls,0)});

test('background synchronizes a refreshed listing to Etsy tabs that requested metrics',async()=>{
 messages.length=0;
 const response=await new Promise(resolve=>listener({type:'NL_METRICS',listing_id:'777',force:true},{id:'extension-test',tab:{id:72,url:'https://www.etsy.com/search?q=test'}},resolve));
 assert.equal(response.ok,true);
 const update=messages.find(m=>m.type==='NL_METRICS_UPDATED');assert.equal(update?.listing_id,'777');assert.deepEqual(update.data,response.data);
});
