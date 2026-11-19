import {salesRoute} from './sales-model.js';
import {extensionRoute} from './extension-server.js';
import {researchRoute,normalizeShop} from './research.js';
import {cloudRoute,reserveEtsyRequest} from './cloud.js';
import {HTML,JS,ZIP} from './assets.js';
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let requestQueue=Promise.resolve(),lastRequestAt=0;
const cache=new Map();
// Serial pacing applies across concurrent requests handled by this isolate.
// Etsy remains authoritative across isolates and other apps using this key.
export async function pacedFetch(url,options){
  const run=requestQueue.catch(()=>{}).then(async()=>{await sleep(Math.max(0,300-(Date.now()-lastRequestAt)));lastRequestAt=Date.now();return fetch(url,options)});
  requestQueue=run.then(()=>{},()=>{});return run;
}
export function normalize(r,shop){const age=r.original_creation_timestamp?Math.max(0,(Date.now()/1000-r.original_creation_timestamp)/86400):null;return{listing_id:r.listing_id,shop_id:r.shop_id??null,title:r.title,price:r.price?.divisor?r.price.amount/r.price.divisor:null,currency:r.price?.currency_code,age_days:age===null?null:Math.round(age*100)/100,favorites:r.num_favorers??null,quantity:r.quantity??null,views:r.views??null,shop_sales:shop?.transaction_sold_count??null,trend_velocity:age===null||r.num_favorers==null?null:Math.round(r.num_favorers/Math.max(age,1)*100)/100,tags:r.tags||[],listing_type:r.listing_type??null,demo:false}}
export function createEtsyClient(env){
 let upstreamCalls=0;const client={quota:null};
 client.get=async(path,{ttl=300000,fresh=false}={})=>{
  if(!env.ETSY_KEYSTRING||!env.ETSY_SHARED_SECRET){const e=Error('Etsy credentials are not configured.');e.status=503;throw e}
  const key=env.ETSY_KEYSTRING+':'+path,cached=cache.get(key);if(!fresh&&cached&&cached.expires>Date.now())return cached.data;
  if(upstreamCalls>=40)throw Error('Shop enrichment limit reached for this request. Use a 20-listing sample for complete shop lookups.');upstreamCalls++;
  if(env.RESERVE_ETSY)await env.RESERVE_ETSY();else if(env.DB)await reserveEtsyRequest(env.DB);
  const r=await pacedFetch(`https://openapi.etsy.com/v3/application/${path}`,{headers:{'x-api-key':`${env.ETSY_KEYSTRING}:${env.ETSY_SHARED_SECRET}`},signal:AbortSignal.timeout(10000)});
  const remaining=r.headers.get('x-remaining-today');if(remaining!==null)client.quota={remaining_today:Number(remaining),limit_per_day:Number(r.headers.get('x-limit-per-day')||5000)};
  if(!r.ok){const error=new Error(r.status===429?'Etsy rate limit reached. Retry later; this app has a 5,000-request daily allowance.':`Etsy returned HTTP ${r.status}. Check app access; the listing may be unavailable.`);error.status=r.status;throw error;}
  const data=await r.json();if(cache.size>=250)cache.delete(cache.keys().next().value);cache.set(key,{data,expires:Date.now()+ttl});return data;
 };return client;
}
export default {async fetch(request,env){
 const url=new URL(request.url),client=createEtsyClient(env);
 const sales=await salesRoute(request,env,client,normalize);if(sales)return sales;
 const extension=await extensionRoute(request,env,client,normalize);if(extension)return extension;
 const cloud=await cloudRoute(request,env,client,normalize,normalizeShop);if(cloud)return cloud;
 const research=await researchRoute(request,env,client,normalize);if(research)return research;
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 if(url.pathname==='/api/status')return json({connected:!!(env.ETSY_KEYSTRING&&env.ETSY_SHARED_SECRET),limits:{requests_per_second:5,requests_per_day:5000,local_daily_budget:4500},tracking:env.DB?'cloud':'unavailable'});
 if(url.pathname==='/api/search'||url.pathname==='/api/listing'){
  const single=url.pathname==='/api/listing',keyword=(url.searchParams.get('keyword')||'').trim(),limit=Number(url.searchParams.get('limit')||20),id=url.searchParams.get('id');
  if(single?!/^\d+$/.test(id||'')||Number(id)<=0:!keyword||keyword.length>200||!Number.isInteger(limit)||limit<1||limit>100)return json({error:single?'Enter a positive numeric Etsy listing ID.':'Enter a keyword (1–200 characters) and a sample size of 1–100.'},400);
  const warnings=[];
  try{
   const result=await client.get(single?`listings/${id}`:`listings/active?keywords=${encodeURIComponent(keyword)}&limit=${limit}&sort_on=score&sort_order=desc`);
   const items=single?[result]:result.results||[],shops=new Map();let rateLimited=false;
   for(const row of items)if(row.shop_id&&!shops.has(row.shop_id)){
    if(rateLimited){shops.set(row.shop_id,null);continue}
    try{shops.set(row.shop_id,await client.get(`shops/${row.shop_id}`,{ttl:900000}))}catch(e){shops.set(row.shop_id,null);if(e.status===429)rateLimited=true;warnings.push(`Shop ${row.shop_id}: ${e.message}`)}
   }
   return json({listings:items.map(r=>normalize(r,shops.get(r.shop_id))),warnings:[...new Set(warnings)],quota:client.quota,source:'etsy',observed_at:new Date().toISOString(),cache_note:'Listings may be cached for up to 5 minutes; shops for up to 15 minutes.'});
  }catch(e){return json({error:e.message||'Unable to reach Etsy. Try again later.'},e.status===429?429:e.status===503?503:502)}
 }
 if(url.pathname==='/downloads/niche-lab-etsy-extension.zip'){const bytes=Uint8Array.from(atob(EXTZIP),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="niche-lab-etsy-extension.zip"','Cache-Control':'no-store'}})}
 if(url.pathname==='/downloads/niche-lab-member-integration.zip'){const bytes=Uint8Array.from(atob(INTEGRATIONZIP),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="niche-lab-member-integration.zip"','Cache-Control':'no-store'}})}
 if(url.pathname==='/downloads/niche-lab-member-migration.sql')return new Response(INTEGRATIONSQL,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="niche-lab-member-migration.sql"','Cache-Control':'no-store'}});
 if(url.pathname==='/downloads/niche-lab-source.zip'){const bytes=Uint8Array.from(atob(SOURCEZIP),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="niche-lab-source.zip"','Cache-Control':'no-store'}})}
 if(url.pathname==='/downloads/niche-lab-supabase-schema.sql')return new Response(SUPABASESCHEMA,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="niche-lab-supabase-schema.sql"','Cache-Control':'no-store'}});
 if(url.pathname==='/downloads/niche-lab-account-staging.zip'){const bytes=Uint8Array.from(atob(ACCOUNTZIP),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="niche-lab-account-staging.zip"','Cache-Control':'no-store'}})}
 if(url.pathname==='/downloads/etsy-tracker.zip'){const bytes=Uint8Array.from(atob(ZIP),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="etsy-tracker.zip"'}})}
 if(url.pathname==='/app.js')return new Response(JS,{headers:{'Content-Type':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff'}});
 if(url.pathname!=='/')return new Response('Not found',{status:404});
 return new Response(HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}})
}};
