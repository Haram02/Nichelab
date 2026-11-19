import {sb,SessionError} from './session.js';
import {weeklyMetrics} from '../../../cloud.js';
const day=()=>new Date().toISOString().slice(0,10),now=()=>new Date().toISOString();
const encode=encodeURIComponent;
function id(value){if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<=0)throw new SessionError('Enter a positive listing/shop ID.',400);return String(value)}
function keyword(value){if(typeof value!=='string'||!value.trim()||value.trim().length>200)throw new SessionError('Enter a keyword of 1–200 characters.',400);return value.trim().toLowerCase()}
export class PrivateCloud{
 constructor(env,userID,client,normalize,normalizeShop,fetcher=fetch){Object.assign(this,{env,userID,client,normalize,normalizeShop,fetcher})}
 db(path,options={}){return sb(this.env,path,{...options,service:true},this.fetcher)}
 filter(){return 'user_id=eq.'+encode(this.userID)}
 async items(){let values=[];for(let offset=0;offset<1100;offset+=500){const part=await this.db('/rest/v1/market_watchlists?'+this.filter()+'&select=*&order=kind,item_key&limit=500&offset='+offset);values.push(...part);if(part.length<500)break}return values}
 async put(kind,key,payload){await this.db('/rest/v1/rpc/market_save',{method:'POST',body:{p_user:this.userID,p_kind:kind,p_key:String(key),p_payload:payload}})}
 async snapshot(kind,key,payload){const metrics={favorites:payload.favorites??null,quantity:payload.quantity??null,views:payload.views??null,shop_sales:kind==='shop'?payload.shop_sales??payload.sales??null:payload.shop_sales??null,active_listings:payload.active_listings??null,review_count:payload.review_count??null};await this.db('/rest/v1/market_snapshots?on_conflict=user_id,kind,item_key,day',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{user_id:this.userID,kind,item_key:String(key),day:day(),metrics,observed_at:now()}})}
 async saveListing(value){const listing=await this.client.get('listings/'+id(value));let shop=null;try{shop=await this.client.get('shops/'+listing.shop_id,{ttl:900000})}catch(e){if(e.status===429)throw e}const row=this.normalize(listing,shop);await this.put('listing',row.listing_id,row);await this.snapshot('listing',row.listing_id,row);return row}
 async saveShop(value){const row=this.normalizeShop(await this.client.get('shops/'+id(value)));await this.put('shop',row.shop_id,row);await this.snapshot('shop',row.shop_id,row);return row}
 async history(kind,key){const rows=await this.db('/rest/v1/market_snapshots?'+this.filter()+'&kind=eq.'+kind+'&item_key=eq.'+encode(key)+'&select=*&order=day.desc&limit=90');return rows.reverse().map(r=>({...r.metrics,day:r.day,observed_at:r.observed_at}))}
 async view(){const items=await this.items(),counts=(await this.db('/rest/v1/rpc/market_counts',{method:'POST',body:{p_user:this.userID}}))||[];const listings=[],shops=[];const today=day(),prior=new Date(Date.now()-7*86400000).toISOString().slice(0,10);let snapshots=[];for(let offset=0;offset<2200;offset+=500){const part=await this.db('/rest/v1/market_snapshots?'+this.filter()+'&day=in.('+today+','+prior+')&select=*&order=kind,item_key,day&limit=500&offset='+offset);snapshots.push(...part);if(part.length<500)break}
 for(const item of items){if(item.kind==='keyword')continue;const rows=snapshots.filter(r=>r.kind===item.kind&&r.item_key===item.item_key),current=rows.find(r=>r.day===today),base=rows.find(r=>r.day===prior);const latest=current?{...current.metrics,day:current.day}:item.observed_at?{day:item.observed_at.slice(0,10),...item.payload}:null;const row={...item.payload,...weeklyMetrics(latest,base?{...base.metrics,day:base.day}:null),last_snapshot:item.observed_at,history_days:Number(counts.find(c=>c.kind===item.kind&&c.item_key===item.item_key)?.observations||0),last_error:null};(item.kind==='shop'?shops:listings).push(row)}
 return{keywords:items.filter(r=>r.kind==='keyword').map(r=>r.item_key),listings,shops,snapshot_count:counts.reduce((n,c)=>n+Number(c.observations),0),collection:this.status(items),storage:'private_cloud',today,schedule:{enabled:true,label:'Pending observations collected in batches every five minutes; daily budget applies.'}}}
 status(items){const pending=items.filter(r=>!r.observed_at||r.observed_at.slice(0,10)!==day()).length;return{day:day(),status:pending?'pending':'complete',total:items.length,done:items.length-pending,pending,failed:0,warnings:0,errors:[]}}
 async step(){const token=crypto.randomUUID();const lease=await this.db('/rest/v1/rpc/market_lease',{method:'POST',body:{p_user:this.userID,p_token:token}});if(!lease)return{...this.status(await this.items()),busy:true};
 try{const tasks=(await this.items()).filter(r=>!r.observed_at||r.observed_at.slice(0,10)!==day()).slice(0,3);for(const item of tasks){
  if(item.kind==='listing')await this.saveListing(item.item_key);
  else if(item.kind==='shop')await this.saveShop(item.item_key);
  else{const results=await this.client.get('listings/active?keywords='+encode(item.item_key)+'&limit=10&sort_on=score&sort_order=desc');const known=new Set((await this.items()).filter(r=>r.kind==='listing').map(r=>r.item_key));for(const listing of results.results||[]){if(known.has(String(listing.listing_id)))continue;const row=this.normalize(listing,null);await this.put('listing',row.listing_id,{...row,_pending:true});known.add(String(listing.listing_id))}await this.db('/rest/v1/market_watchlists?'+this.filter()+'&kind=eq.keyword&item_key=eq.'+encode(item.item_key),{method:'PATCH',body:{observed_at:now()},headers:{Prefer:'return=minimal'}});break}
 }return this.status(await this.items())}finally{await this.db('/rest/v1/market_collector?'+this.filter()+'&token=eq.'+encode(token),{method:'PATCH',body:{expires_at:now()},headers:{Prefer:'return=minimal'}})}}
 async route(request){const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/watchlist')&&!path.startsWith('/api/collector'))return null;
 const response=value=>Response.json(value,{headers:{'Cache-Control':'no-store'}});
 if(path==='/api/watchlist'&&request.method==='GET')return response(await this.view());
 if(path==='/api/watchlist/history'&&request.method==='GET')return response({history:await this.history('listing',id(url.searchParams.get('id')))});
 if(path==='/api/watchlist/shop-history'&&request.method==='GET')return response({history:await this.history('shop',id(url.searchParams.get('id')))});
 if(path==='/api/collector/status'&&request.method==='GET')return response(this.status(await this.items()));
 if(request.method==='DELETE'&&['/api/watchlist/listings','/api/watchlist/shops','/api/watchlist/keywords'].includes(path)){const kind=path.endsWith('keywords')?'keyword':path.endsWith('shops')?'shop':'listing';const key=kind==='keyword'?keyword(url.searchParams.get('keyword')):id(url.searchParams.get('id'));await this.db('/rest/v1/market_watchlists?'+this.filter()+'&kind=eq.'+kind+'&item_key=eq.'+encode(key),{method:'DELETE'});return response({removed:true})}
 if(request.method!=='POST')return response({error:'Not found.'});const raw=await request.text();if(raw.length>2000000)throw new SessionError('Import too large.',413);const body=JSON.parse(raw||'{}');
 if(path==='/api/watchlist/listings')return response({saved:true,listing:await this.saveListing(body.listing_id)});
 if(path==='/api/watchlist/shops')return response({saved:true,shop:await this.saveShop(body.shop_id)});
 if(path==='/api/watchlist/keywords'){const key=keyword(body.keyword);await this.put('keyword',key,{keyword:key});return response({saved:true})}
 if(path==='/api/watchlist/import'){if(!Array.isArray(body.keywords)||!Array.isArray(body.listings)||body.keywords.length+body.listings.length>20)throw new SessionError('Import at most 20 items per batch.',400);for(const k of body.keywords)keyword(k);for(const listing of body.listings)id(listing);const existing=await this.items(),ids=new Set(existing.filter(i=>i.kind==='listing').map(i=>i.item_key));for(const k of body.keywords){const key=keyword(k);await this.put('keyword',key,{keyword:key})}for(const value of body.listings){const key=id(value);if(!ids.has(key)){await this.put('listing',key,{listing_id:Number(key),title:'Awaiting first observation'});ids.add(key)}}return response({imported:true})}
 if(path==='/api/collector/start')return response(this.status(await this.items()));
 if(path==='/api/collector/step')return response(await this.step());
 return Response.json({error:'Not found.'},{status:404});
 }
}
