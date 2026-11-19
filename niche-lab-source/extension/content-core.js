// Shared by search cards, listing pages and detail panels. No DOM scraping of metrics.
(()=>{
 const defaultMethod='reviews_plus_favorites';
 function selectModel(data,method=defaultMethod){
  const model=data?.sales_estimate;if(!model)return null;
  const user=method!=='reviews_only';
  return {...model,active_method:user?defaultMethod:'reviews_only',
   lifetime:(user?model.comparisons?.user_formula:model.comparisons?.reviews_only)||null,
   formula:user?'4 × listing reviews + favorites / 4':'4 × listing reviews'};
 }
 function matchesListing(data,id){return String(data?.listing?.listing_id)===String(id)}
 function cardTarget(anchor,listingFromURL){
  const card=anchor.closest('[data-listing-id]')||anchor.closest('li');if(!card)return null;
  const declared=card.getAttribute('data-listing-id');
  if(declared&&(!/^\d+$/.test(declared)||Number(declared)<=0||!Number.isSafeInteger(Number(declared))))return null;
  const id=declared||listingFromURL(anchor.href);return id?{card,id:String(id)}:null;
 }
 function evidence(data,method=defaultMethod){
  const model=selectModel(data,method),reviews=model?.inputs?.listing_all_reviews,favorites=model?.inputs?.listing_favorites;
  if(model?.lifetime?.estimate==null)return model?.reason||'Insufficient evidence for this formula.';
  const formula=model.active_method===defaultMethod?`${reviews} reviews × 4 + ${favorites} favorites ÷ 4`:`${reviews} reviews × 4`;
  return `${formula} = ${model.lifetime.estimate} (rounded${model.lifetime.capped_by_shop_total?', capped by shop total':''}).`;
 }
 globalThis.NicheLabContent={selectModel,matchesListing,cardTarget,evidence,defaultMethod};
})();
