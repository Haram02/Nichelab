// Isolated content script. No window.postMessage or page-exposed credential bridge.
(()=>{
 if(globalThis.__nicheLabBridge)return;globalThis.__nicheLabBridge=true;
 const origin='https://etsy-niche-lab-personal.jovialghost256.chatgpt.site';
 if(location.origin!==origin)return;
 async function request(path,body){
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
  if(response.redirected||[401,403].includes(response.status)||!response.headers.get('content-type')?.includes('application/json'))return{ok:false,code:'LOGIN',error:'Sign in to Niche Lab with an allowed account, then retry.'};
  const data=await response.json();if(!response.ok)return{ok:false,code:response.status===429?'RATE_LIMIT':'REQUEST_FAILED',error:data.error||'Niche Lab request failed.'};return{ok:true,data};
 }
 chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(sender.id!==chrome.runtime.id)return false;
  if(!['NL_BRIDGE_PING','NL_BRIDGE_METRICS','NL_BRIDGE_TRACK'].includes(message?.type))return false;
  if(message.type!=='NL_BRIDGE_PING'&&(!/^\d+$/.test(String(message.listing_id))||!Number.isSafeInteger(Number(message.listing_id))||Number(message.listing_id)<=0)){sendResponse({ok:false,error:'Invalid listing ID.'});return false}
  (async()=>{
   if(message.type==='NL_BRIDGE_PING'){const r=await request('/api/status');return r.ok?{ok:true}:r}
   if(message.type==='NL_BRIDGE_TRACK'){const saved=await request('/api/watchlist/listings',{listing_id:Number(message.listing_id)});if(!saved.ok)return saved}
   return request('/api/extension/metrics?id='+encodeURIComponent(message.listing_id));
  })().then(sendResponse).catch(e=>sendResponse({ok:false,error:e.name==='TimeoutError'?'Niche Lab took too long. Please retry.':e.message}));
  return true;
 });
})();
