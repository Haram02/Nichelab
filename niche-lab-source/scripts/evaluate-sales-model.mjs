import fs from 'node:fs';
import {evaluateSalesModel,SALES_MODEL_VERSION} from '../sales-model.js';
export function syntheticRows({n=200,seed=12345,listingReviewRate=.25}={}){
 let state=seed;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296};
 const binomial=(count,p)=>{let successes=0;for(let i=0;i<count;i++)if(random()<p)successes++;return successes};
 return Array.from({length:n},(_,i)=>{const total=200+Math.floor(random()*1800),month=Math.floor(total*.3),week=Math.floor(total*.08),r7=binomial(week,listingReviewRate),r30=r7+binomial(month-week,listingReviewRate),reviews=r30+binomial(total-month,listingReviewRate);return{listing_favorites:0,listing_id:i+1,shop_sales:100000,shop_all_reviews:20000,listing_all_reviews:reviews,listing_reviews_7d:r7,listing_reviews_30d:r30,listing_age_days:365,actual_lifetime_sales:total,actual_7d_sales:week,actual_30d_sales:month}});
}
if(process.argv[1]?.endsWith('evaluate-sales-model.mjs')){
 if(process.argv.includes('--synthetic')){
  const baseline=evaluateSalesModel(syntheticRows()),stress=evaluateSalesModel(syntheticRows({listingReviewRate:.05}));
  baseline.validation_type='synthetic_assumption_test';stress.validation_type='synthetic_assumption_test';
  console.log(JSON.stringify({model:SALES_MODEL_VERSION,dataset_kind:'simulated_only_not_real_order_validation',assumptions_match:baseline,review_rate_mismatch_stress:stress},null,2));
 }else{
  const path=process.argv[2];if(!path){console.error('Usage: node scripts/evaluate-sales-model.mjs <authorized-ground-truth.json> OR --synthetic');process.exitCode=1}else{
   const rows=JSON.parse(fs.readFileSync(path,'utf8'));if(!Array.isArray(rows)||rows.length>10000)throw Error('Expected at most 10,000 aggregate rows; do not include buyer details.');
   console.log(JSON.stringify({model:SALES_MODEL_VERSION,...evaluateSalesModel(rows)},null,2));
  }
 }
}
