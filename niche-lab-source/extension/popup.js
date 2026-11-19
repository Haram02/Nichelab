const status=document.getElementById('status');
document.getElementById('connect').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'NL_CONNECT'});if(!r.ok)throw Error(r.error);status.textContent='Sign in to Niche Lab, then return to Etsy.'}catch(e){status.textContent=e.message}};
document.getElementById('analyze').onclick=async()=>{try{const current=await chrome.runtime.sendMessage({type:'NL_CURRENT'});if(!current?.listing_id){status.textContent='Open an Etsy listing first. For search results, use the analysis button beneath a product.';return}const result=await chrome.tabs.sendMessage(current.tab_id,{type:'NL_SHOW_PANEL'});if(!result?.ok)throw Error(result?.error||'Refresh the Etsy page and retry.');window.close()}catch{status.textContent='Refresh your Etsy tab after installation, then retry.'}};

const automatic=document.getElementById('automatic');
chrome.storage.local.get({automaticMetrics:true}).then(v=>{automatic.checked=v.automaticMetrics});
automatic.onchange=()=>chrome.storage.local.set({automaticMetrics:automatic.checked});

const lifetimeMethod=document.getElementById('lifetimeMethod');
chrome.storage.local.get({lifetimeMethod:'reviews_plus_favorites'}).then(v=>{lifetimeMethod.value=v.lifetimeMethod});
lifetimeMethod.onchange=()=>chrome.storage.local.set({lifetimeMethod:lifetimeMethod.value});
