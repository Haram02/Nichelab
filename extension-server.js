import {getSalesEstimate} from './sales-model.js';
import {weeklyMetrics} from './cloud.js';
export async function extensionRoute(request,env,client,normalize){
 const url=new URL(request.url);if(url.pathname!=='/api/extension/metrics')return null;
 const reply=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='GET')return reply({error:'Method not allowed'},405);
 const id=url.searchParams.get('id');if(!/^\d+$/.test(id||'')||!Number.isSafeInteger(Number(id))||Number(id)<=0)return reply({error:'Enter a positive numeric Etsy listing ID.'},400);
 try{
  const item=await client.get(`listings/${id}`);let shop=null;const warnings=[];
  if(item.shop_id)try{shop=await client.get(`shops/${item.shop_id}`,{ttl:900000})}catch(e){warnings.push('Shop-wide sales are unavailable for this lookup.')}
  let tracked=false,latest=null,baseline=null,historyDays=0;
  if(env.DB){
   const record=await env.DB.prepare('SELECT listing_id FROM tracked_listings l WHERE listing_id=? AND (watched=1 OR EXISTS(SELECT 1 FROM keyword_listings k WHERE k.listing_id=l.listing_id))').bind(Number(id)).first();tracked=!!record;
   if(tracked){latest=await env.DB.prepare('SELECT * FROM daily_snapshots WHERE listing_id=? ORDER BY day DESC LIMIT 1').bind(Number(id)).first();
    if(latest)baseline=await env.DB.prepare("SELECT * FROM daily_snapshots WHERE listing_id=? AND day=date(?,'-7 days')").bind(Number(id),latest.day).first();
    historyDays=(await env.DB.prepare('SELECT count(*) count FROM daily_snapshots WHERE listing_id=?').bind(Number(id)).first()).count;
   }
  }
  const salesEstimate=await getSalesEstimate({listing:item,shop,client});
  return reply({sales_estimate:salesEstimate,listing:normalize(item,shop),tracked,total_units_sold:null,weekly_units_sold:null,sales_availability:'Exact competitor listing sales are not disclosed by Etsy. Shop totals and stock changes cannot establish product units sold.',weekly:{...weeklyMetrics(latest,baseline),history_days:historyDays,last_snapshot:latest?.observed_at||null},warnings,cache_note:'Public listing data may be cached for up to 5 minutes; shop data for up to 15 minutes. Weekly activity uses recorded daily snapshots.'});
 }catch(e){return reply({error:e.message||'Unable to load public Etsy metrics.'},e.status===429?429:e.status===503?503:502)}
}
