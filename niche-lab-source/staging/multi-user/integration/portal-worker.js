import market,{createEtsyClient,normalize,normalizeShop,getSalesEstimate,weeklyMetrics} from './market-server.js';
import {createAccessAPI} from '../access-api.js';
import {identity,sessionRoute,attachCookies,requireOrigin,sb,SessionError} from './session.js';
import {PrivateCloud} from './private-cloud.js';

const response=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
function clientFor(env,userID){return createEtsyClient({...env,DB:undefined,RESERVE_ETSY:()=>sb(env,'/rest/v1/rpc/market_reserve',{service:true,method:'POST',body:{p_user:userID}})})}
export async function portalFetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 try{
  if(url.origin!==env.APP_ORIGIN)throw new SessionError('This hostname is not configured.',503);
  const session=await sessionRoute(request,env);if(session)return session;
  const protectedRoute=path.startsWith('/api/')||path==='/dashboard'||path==='/dashboard.js'||path.startsWith('/downloads/');
  if(!protectedRoute){if(!['/','/account','/accounts.js','/public-config.js'].includes(path))return new Response('Not found',{status:404});return env.ASSETS.fetch(new Request(url.origin+(path==='/account'?'/':path),request))}
  const auth=await identity(request,env);
  if(!['GET','HEAD'].includes(request.method))requireOrigin(request,env);
  const finish=r=>attachCookies(r,auth.renewed);
  if(path.startsWith('/api/accounts/')){const headers=new Headers(request.headers);headers.set('Authorization','Bearer '+auth.token);return finish(await createAccessAPI()(new Request(request,{headers}),env))}
  const client=clientFor(env,auth.user.id),cloud=new PrivateCloud(env,auth.user.id,client,normalize,normalizeShop);
  const privateResult=await cloud.route(request);if(privateResult)return finish(privateResult);
  if(path==='/api/status')return finish(response({connected:!!(env.ETSY_KEYSTRING&&env.ETSY_SHARED_SECRET),tracking:'private_cloud',limits:{requests_per_day:5000,local_daily_budget:4500,per_user_daily_budget:2000}}));
  if(path==='/api/extension/metrics'){
   const id=url.searchParams.get('id');if(!/^\d+$/.test(id||'')||!Number.isSafeInteger(Number(id))||Number(id)<=0)throw new SessionError('Invalid listing ID.',400);
   const listing=await client.get('listings/'+id);let shop=null;try{shop=await client.get('shops/'+listing.shop_id)}catch(e){if(e.status===429)throw e}
   const row=normalize(listing,shop),tracked=(await cloud.items()).some(i=>i.kind==='listing'&&i.item_key===id),history=tracked?await cloud.history('listing',id):[],latest=history.at(-1),baseline=latest?history.find(r=>new Date(latest.day)-new Date(r.day)===7*86400000):null;
   return finish(response({account_id:auth.user.id,listing:row,sales_estimate:await getSalesEstimate({listing,shop,client}),tracked,total_units_sold:null,weekly_units_sold:null,weekly:{...weeklyMetrics(latest,baseline),history_days:history.length,last_snapshot:latest?.observed_at||null},warnings:[],cache_note:'Authenticated private watchlist. Etsy metrics may be cached; review cutoff shown in model evidence.'}));
  }
  if(path==='/dashboard'||path==='/dashboard.js'){const mapped=new URL(request.url);mapped.pathname=path==='/dashboard'?'/':'/app.js';return finish(await market.fetch(new Request(mapped,request),{...env,DB:undefined}))}
  if(path==='/downloads/niche-lab-etsy-extension.zip')return finish(await env.ASSETS.fetch(new Request(url.origin+'/extension.zip',request)));
  if(!['/api/search','/api/listing','/api/research/keywords','/api/research/shop','/api/research/listing','/api/research/sales'].includes(path))return finish(response({error:'Not found.'},404));
  return finish(await market.fetch(request,{...env,DB:undefined,RESERVE_ETSY:()=>sb(env,'/rest/v1/rpc/market_reserve',{service:true,method:'POST',body:{p_user:auth.user.id}})}));
 }catch(e){if(path==='/dashboard'&&[401,403].includes(e.status))return Response.redirect(url.origin+'/',303);return response({error:e instanceof SyntaxError?'Invalid JSON.':e.message||'Request failed.'},e.status||502)}
}
export default {fetch:portalFetch,async scheduled(event,env,ctx){ctx.waitUntil((async()=>{const id=await sb(env,'/rest/v1/rpc/market_next_user',{service:true,method:'POST',body:{}});if(!id)return;const cloud=new PrivateCloud(env,id,clientFor(env,id),normalize,normalizeShop);await cloud.step()})().catch(e=>console.error(JSON.stringify({event:'private_collection_failed',status:e.status||502,time:new Date().toISOString()}))))}};
