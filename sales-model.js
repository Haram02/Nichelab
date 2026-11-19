// Explicit heuristic scenarios, not a fitted or accuracy-validated model.
export const SALES_MODEL_VERSION='review-scenario-v2';
const salesInt=value=>Number.isSafeInteger(value)&&value>=0;
const salesEmpty=reason=>({estimate:null,scenario_low:null,scenario_high:null,status:'insufficient_evidence',reason});
export function buildSalesEstimate(input){
 const {shop_sales:shopSales,shop_all_reviews:shopReviews,listing_all_reviews:total,listing_reviews_7d:week,listing_reviews_30d:month,listing_favorites:favorites}=input;
 const base={version:SALES_MODEL_VERSION,source:'Etsy listing reviews; explicit heuristic assumptions',validation_status:'not_validated_against_real_orders',experimental:true,time_basis:'review_publication_dates',as_of:input.as_of||null,review_rate:.25,review_rate_source:'assumed_not_observed',review_multiplier:4,active_method:'reviews_plus_favorites',formula:'4 × listing reviews + listing favorites / 4',inputs:{shop_sales:shopSales??null,shop_all_reviews:shopReviews??null,listing_all_reviews:total??null,listing_reviews_7d:week??null,listing_reviews_30d:month??null,listing_favorites:favorites??null},assumptions:['The review component assumes one review per four purchases (25% review participation). This is not an observed or fitted rate.','The default lifetime formula is 4 × reviews + favorites / 4. Its favorite weight is an unvalidated user-specified assumption.','The 2× to 8× review scenarios are sensitivity examples, not confidence intervals or demonstrated error bounds.','Recent estimates use only reviews published in that period. Lifetime favorites are never added to a recent-period estimate.'],limitations:['Neither formula is guaranteed to underestimate or be closer to actual sales than EHunt.','Favorites can come from non-buyers and can overlap with reviewed purchases.','A review supports a reviewed purchase but does not reveal total units, quantities, refunds or all other purchases.','Review dates can substantially lag purchase dates; current-period purchases cannot be recovered exactly.','No real-order accuracy validation has been completed.']};
 const comparisons={reviews_only:null,user_formula:null,legacy_shop_ratio:null};
 const unavailable=(reason,status='insufficient_evidence')=>({...base,status,reason,comparisons,lifetime:salesEmpty(reason),days_7:salesEmpty(reason),days_30:salesEmpty(reason),review_activity_trend:null});
 if(![total,week,month].every(salesInt))return unavailable('Required listing review counts are missing or invalid.');
 if(month>total||week>month)return unavailable('Review windows are inconsistent; no estimate is returned.','inconsistent_inputs');
 if(total===0)return unavailable('No accessible listing reviews. Favorites alone are not used to invent sales.');
 if(salesInt(shopSales)&&total>shopSales)return unavailable('Listing review count exceeds the reported shop sales; evidence is inconsistent.','inconsistent_inputs');
 const cap=value=>salesInt(shopSales)?Math.min(value,shopSales):value;
 function scenario(reviews,label){
  if(reviews===0)return salesEmpty(`No reviews were published ${label}. Sales are unknown, not zero.`);
  const raw=reviews*4;return{estimate:cap(raw),uncapped_estimate:raw,scenario_low:cap(reviews*2),scenario_high:cap(reviews*8),observed_reviews:reviews,capped_by_shop_total:cap(raw)!==raw,status:reviews<5?'thin_review_evidence':'experimental',reason:reviews<5?'Fewer than five reviews support this heuristic.':null};
 }
 const lifetime=scenario(total,'over the accessible history'),days7=scenario(week,'in the last seven days'),days30=scenario(month,'in the last 30 days');
 comparisons.reviews_only={...lifetime,method:'reviews_only',formula:'4 × listing reviews',review_component:total*4,favorite_component:0};
 if(salesInt(favorites)){const extra=favorites/4,raw=total*4+extra;comparisons.user_formula={...lifetime,estimate:cap(Math.round(raw)),uncapped_estimate:raw,scenario_low:cap(Math.floor(total*2+extra)),scenario_high:cap(Math.ceil(total*8+extra)),capped_by_shop_total:cap(Math.round(raw))!==Math.round(raw),method:'reviews_plus_favorites',formula:'4 × listing reviews + listing favorites / 4',review_component:total*4,favorite_component:extra,warning:'Favorites are not purchases and may overlap with reviews. This is not a guaranteed lower bound.'}}
 if(salesInt(shopSales)&&shopSales>0&&salesInt(shopReviews)&&shopReviews>0&&shopReviews<=shopSales&&total<=shopReviews){const rate=shopReviews/shopSales;comparisons.legacy_shop_ratio={estimate:Math.round(total/rate),review_rate:rate,review_multiplier:1/rate,formula:'Listing reviews ÷ shop review-to-sales ratio',active:false,warning:'Diagnostic only. A low shop review ratio can inflate estimates and need not apply to this listing.'}}
 let trend=null;if(input.listing_age_days>=30&&month>=5){const previous=month-week;if(previous===0&&week>0)trend='new_recent_review_activity';else if(previous>0){const ratio=(week/7)/(previous/23);trend=ratio>1.25?'review_activity_rising':ratio<.75?'review_activity_falling':'review_activity_similar'}}
 return{...base,status:'experimental',reason:null,comparisons,lifetime:comparisons.user_formula||salesEmpty('Favorites are unavailable for the selected formula.'),days_7:days7,days_30:days30,review_activity_trend:trend};
}
export async function getSalesEstimate({listing,shop,client,now=Date.now()}){
 const cutoff=Math.floor(now/900000)*900,asOf=new Date(cutoff*1000).toISOString();
 const base={shop_sales:shop?.transaction_sold_count,listing_favorites:listing.num_favorers,as_of:asOf,listing_age_days:listing.original_creation_timestamp?Math.max(0,(now/1000-listing.original_creation_timestamp)/86400):null};

 async function reviewCount(path,minCreated){
  const result=await client.get(`${path}?limit=1&max_created=${cutoff}${minCreated?`&min_created=${minCreated}`:''}`,{ttl:900000});
  if(!salesInt(result.count))throw Error('Etsy did not return a valid review count.');
  if(result.results?.length){const first=result.results[0],created=first.create_timestamp??first.created_timestamp;if(salesInt(created)&&(created>cutoff||(minCreated&&created<minCreated)))throw Error('Review date filter could not be verified.');}
  return result.count;
 }
 try{
  const total=await reviewCount(`listings/${listing.listing_id}/reviews`);
  if(total===0)return buildSalesEstimate({...base,listing_all_reviews:0,listing_reviews_7d:0,listing_reviews_30d:0});
  const month=await reviewCount(`listings/${listing.listing_id}/reviews`,cutoff-30*86400);
  const week=await reviewCount(`listings/${listing.listing_id}/reviews`,cutoff-7*86400);
  // Retained only to explain the previous formula. This count never controls
  // the active review-multiplier estimate and its failure cannot break it.
  let shopReviews=null,diagnosticWarning=null;
  if(shop?.shop_id)try{shopReviews=await reviewCount(`shops/${shop.shop_id}/reviews`)}catch(e){diagnosticWarning='Previous shop-ratio diagnostic unavailable: '+e.message}
  return {...buildSalesEstimate({...base,shop_all_reviews:shopReviews,listing_all_reviews:total,listing_reviews_7d:week,listing_reviews_30d:month}),diagnostic_warning:diagnosticWarning};
 }catch(e){return {...buildSalesEstimate(base),status:'source_unavailable',reason:'Review evidence could not be loaded: '+e.message}}
}
export function evaluateSalesModel(rows){
 const periods=[['lifetime','actual_lifetime_sales'],['days_7','actual_7d_sales'],['days_30','actual_30d_sales']];
 const result={rows:rows.length,skipped:0,validation_type:'user_supplied_ground_truth',note:'These errors describe only the supplied rows. Recent predictions use review dates; actual order dates can differ.',metrics:{}};
 const accum=Object.fromEntries(periods.map(([p])=>[p,{n:0,absolute:0,actual:0,bias:0}]));
 for(const row of rows){const estimate=buildSalesEstimate(row);if(estimate.status!=='experimental'){result.skipped++;continue}for(const [period,key]of periods){const prediction=estimate[period].estimate,actual=row[key];if(prediction===null||!salesInt(actual))continue;const a=accum[period];a.n++;a.absolute+=Math.abs(prediction-actual);a.actual+=actual;a.bias+=prediction-actual}}
 for(const [period,a]of Object.entries(accum))result.metrics[period]={evaluated_rows:a.n,mae:a.n?a.absolute/a.n:null,wape:a.actual?a.absolute/a.actual:null,mean_bias:a.n?a.bias/a.n:null};
 return result;
}
export async function salesRoute(request,env,client,normalize){
 const url=new URL(request.url);if(url.pathname!=='/api/research/sales')return null;
 const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='GET')return reply({error:'Method not allowed'},405);
 const value=(url.searchParams.get('id')||'').trim();let id=value;
 if(!/^\d+$/.test(id)){try{const u=new URL(value);if(u.hostname!=='etsy.com'&&!u.hostname.endsWith('.etsy.com'))throw Error();id=u.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?listing\/(\d+)(?:\/|$)/i)?.[1]}catch{id=null}}
 if(!id||!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<=0)return reply({error:'Enter a positive listing ID or an Etsy listing URL.'},400);
 try{const listing=await client.get(`listings/${id}`);let shop=null;try{shop=await client.get(`shops/${listing.shop_id}`,{ttl:900000})}catch{}
  const model=await getSalesEstimate({listing,shop,client});return reply({listing:normalize(listing,shop),sales_estimate:model,exact_total_sales:null,exact_weekly_sales:null,exact_monthly_sales:null});
 }catch(e){return reply({error:e.message||'Unable to load listing data.'},e.status===429?429:e.status===503?503:502)}
}
