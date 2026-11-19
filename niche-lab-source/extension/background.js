import {createMetricLoader} from './metric-loader.js';
import {PORTAL,listingFromURL,validID} from './shared.js';
let portalPromise=null;
const metricTabs=new Set();
async function publishMetrics(id,result){if(!result?.ok)return;await Promise.all([...metricTabs].map(async tabID=>{try{await chrome.tabs.sendMessage(tabID,{type:"NL_METRICS_UPDATED",listing_id:String(id),data:result.data})}catch{metricTabs.delete(tabID)}}))}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function portalTab(active=false){
 const tabs=await chrome.tabs.query({url:PORTAL+'/*'});
 let tab=tabs.find(t=>t.url?.startsWith(PORTAL+'/'));
 if(!tab)tab=await chrome.tabs.create({url:PORTAL+'/?extension=1',active});
 else if(active)await chrome.tabs.update(tab.id,{active:true});
 return tab;
}
async function bridge(){
 if(portalPromise)return portalPromise;
 portalPromise=(async()=>{let tab=await portalTab();for(let i=0;i<25;i++){
  try{tab=await chrome.tabs.get(tab.id);if(tab.status==='complete'&&tab.url?.startsWith(PORTAL+'/')){const pong=await chrome.tabs.sendMessage(tab.id,{type:'NL_BRIDGE_PING'});if(pong?.ok)return tab.id;if(pong?.code==='LOGIN')throw Object.assign(Error('Sign in to Niche Lab with an allowed account, then retry.'),{code:'LOGIN'})}}
  catch(e){if(e.code==='LOGIN')throw e}
  await delay(600);
 }throw Object.assign(Error('Open Niche Lab, sign in, and refresh its tab before retrying.'),{code:'LOGIN'})})().finally(()=>{portalPromise=null});return portalPromise;
}
let loginUntil=0;
async function fetchFromBridge(id,track=false){
 if(Date.now()<loginUntil&&!track)return{ok:false,code:'LOGIN',error:'Sign in to Niche Lab, then use Retry or reload Etsy.'};
 try{
  const tabID=await bridge();const result=await chrome.tabs.sendMessage(tabID,{type:track?'NL_BRIDGE_TRACK':'NL_BRIDGE_METRICS',listing_id:String(id)});
  if(!result)throw Error('Niche Lab did not return a response. Refresh its tab and retry.');
  if(result.code==='LOGIN')loginUntil=Date.now()+30000;
  return result;
 }catch(e){if(e.code==='LOGIN')loginUntil=Date.now()+30000;return{ok:false,error:e.message,code:e.code||'REQUEST_FAILED'}}
}
const metricLoader=createMetricLoader(id=>fetchFromBridge(id));
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id)return false;
 const fromPopup=sender.url?.startsWith(chrome.runtime.getURL(''));
 const fromEtsy=sender.tab?.url&&(()=>{try{const h=new URL(sender.tab.url).hostname;return h==='etsy.com'||h.endsWith('.etsy.com')}catch{return false}})();
 if(!fromPopup&&!fromEtsy)return false;
 if(!['NL_CONNECT','NL_METRICS','NL_TRACK','NL_CURRENT'].includes(message?.type))return false;
 (async()=>{
  if(message.type==='NL_CONNECT'){loginUntil=0;await portalTab(true);return{ok:true}}
  if(message.type==='NL_CURRENT'){const tabs=await chrome.tabs.query({active:true,currentWindow:true});return{ok:true,listing_id:listingFromURL(tabs[0]?.url),tab_id:tabs[0]?.id}}
  if(!validID(message.listing_id))throw Error('Invalid Etsy listing ID.');
  if(fromEtsy&&sender.tab.id!=null)metricTabs.add(sender.tab.id);
  if(message.force)loginUntil=0;
  if(message.type==='NL_TRACK'){const result=await fetchFromBridge(message.listing_id,true);if(result.ok){metricLoader.invalidate(message.listing_id);await publishMetrics(message.listing_id,result)}return result}
  const result=await metricLoader.load(message.listing_id,{force:!!message.force});await publishMetrics(message.listing_id,result);return result;
 })().then(sendResponse).catch(e=>sendResponse({ok:false,error:e.message,code:e.code||'REQUEST_FAILED'}));
 return true;
});

chrome.runtime.onInstalled.addListener(()=>chrome.storage.local.set({lifetimeMethod:'reviews_plus_favorites'}));
