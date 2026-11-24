import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
await import('./extension/content-core.js');
const core=globalThis.NicheLabContent;
const data={listing:{listing_id:123,title:'Example',favorites:568,published_at:'2024-11-24T00:00:00.000Z'},weekly:{},sales_estimate:{as_of:'2026-11-19T00:00:00Z',inputs:{listing_all_reviews:36,listing_favorites:568},comparisons:{user_formula:{estimate:286},reviews_only:{estimate:144}},days_7:{estimate:4},days_30:{estimate:8}}};
test('all surfaces select the approved comparison, preserve raw data and display arithmetic',()=>{
 const before=JSON.stringify(data);
 for(const method of ['reviews_plus_favorites','reviews_only']){
  const selected=core.selectModel(data,method);assert.equal(selected.lifetime.estimate,method==='reviews_only'?144:286);
 }
 assert.equal(JSON.stringify(data),before);assert.match(core.evidence(data),/36 reviews × 4 \+ 568 favorites ÷ 4 = 286/);
 assert.equal(core.selectModel({sales_estimate:{lifetime:{estimate:9999}}}).lifetime,null);
});
test('search card uses its declared listing identity even when nested links point elsewhere',()=>{
 const card={getAttribute:()=> '123'},outer={getAttribute:()=>null};
 const anchor={href:'https://www.etsy.com/listing/999/other',closest:s=>s==='[data-listing-id]'?card:outer};
 const result=core.cardTarget(anchor,()=> '999');assert.equal(result.card,card);assert.equal(result.id,'123');
 assert.equal(core.matchesListing(data,'999'),false);assert.equal(core.matchesListing(data,'123'),true);
});
// Run the real content script with a small DOM fixture, not a browser emulator.
async function mount({listing=false,method='reviews_plus_favorites',duplicate=false}={}){
 const roots=[],elements=new Map(),requests=[];let receive,changed,resolveSettings;
 const settings=new Promise(r=>{resolveSettings=r});
 function element(){return{style:{},dataset:{},isConnected:true,append(){},remove(){this.isConnected=false},getAttribute(){return null},closest(){return null},querySelector(){return null},attachShadow(){const button={addEventListener(){}};const root={innerHTML:'',querySelector:()=>button,getElementById:()=>button};roots.push(root);return root}}}
 const card=element();card.getAttribute=()=> '123';const anchor={href:'https://www.etsy.com/listing/123/item',closest:s=>s==='[data-listing-id]'?card:null};
 const nested=element();
 card.contains=node=>node===card||node===nested;
 nested.getAttribute=card.getAttribute;
 const nestedAnchor={...anchor,closest:s=>s==='[data-listing-id]'?nested:null};
 const title={insertAdjacentElement:(where,node)=>elements.set(node.id,node)};
 const document={visibilityState:'visible',body:{},documentElement:{append:node=>elements.set(node.id,node)},createElement:element,getElementById:id=>elements.get(id),querySelector:()=>title,querySelectorAll:()=>duplicate?[nestedAnchor,anchor]:listing?[]:[anchor],addEventListener(){}};
 const chrome={runtime:{id:'test',sendMessage:async m=>{requests.push(m);return{ok:true,data}},onMessage:{addListener:f=>{receive=f}}},storage:{local:{get:()=>settings},onChanged:{addListener:f=>{changed=f}}}};
 const context=vm.createContext({document,chrome,location:{href:listing?'https://www.etsy.com/listing/123/item':'https://www.etsy.com/search?q=item'},URL,Date,console,setTimeout,setInterval:()=>{},IntersectionObserver:class{constructor(f){this.f=f}observe(target){this.f([{target,isIntersecting:true}])}unobserve(){}},MutationObserver:class{observe(){}}});
 vm.runInContext(fs.readFileSync('extension/content-core.js','utf8'),context);vm.runInContext(fs.readFileSync('extension/content.js','utf8'),context);
 assert.equal(requests.length,0,'no fetch before preferences load');resolveSettings({automaticMetrics:true,lifetimeMethod:method});await new Promise(setImmediate);
 return{roots,requests,receive,changed};
}
test('real search and listing renderers agree after saved preferences load',async()=>{
 for(const method of ['reviews_plus_favorites','reviews_only']){
  const search=await mount({method}),listing=await mount({listing:true,method});
  const expected=method==='reviews_only'?144:286;
  for(const page of [search,listing]){assert.equal(page.requests[0].listing_id,'123');assert.ok(page.roots.some(r=>r.innerHTML.includes(`<strong>${expected}</strong>`)));}
 }
});
test('cross-tab updates change cards and cannot replace another listing',async()=>{
 const page=await mount();const updated=structuredClone(data);updated.sales_estimate.comparisons.user_formula.estimate=300;
 page.receive({type:'NL_METRICS_UPDATED',listing_id:'123',data:updated},{id:'test'},()=>{});assert.ok(page.roots.some(r=>r.innerHTML.includes('<strong>300</strong>')));
 const html=page.roots.map(r=>r.innerHTML).join('');page.receive({type:'NL_METRICS_UPDATED',listing_id:'999',data:updated},{id:'test'},()=>{});assert.equal(page.roots.map(r=>r.innerHTML).join(''),html);
 page.changed({lifetimeMethod:{newValue:'reviews_only'}},'local');assert.ok(page.roots.some(r=>r.innerHTML.includes('<strong>144</strong>')));
});

test('one inline panel per listing and the published date appears in the panel',async()=>{
 for(const listing of [false,true]){
  const page=await mount({listing,duplicate:true});
  assert.equal(page.requests.length,1);
  const panels=page.roots.filter(root=>root.innerHTML.includes('<small>Published date</small>'));
  assert.equal(panels.length,1);
  const date=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(data.listing.published_at));
  assert.ok(panels[0].innerHTML.includes('<strong>'+date+'</strong>'));
 }
});
