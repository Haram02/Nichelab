import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {zipFiles} from './integration/zip.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),out=path.join(here,'integrated-public');
fs.mkdirSync(out,{recursive:true});
const origin='https://niche-lab-account-staging.darharam24.workers.dev';
const files=[];for(const name of fs.readdirSync(path.join(root,'extension'))){if(!/\.(js|json|html|md)$/.test(name))continue;let text=fs.readFileSync(path.join(root,'extension',name),'utf8').replaceAll('https://etsy-niche-lab-personal.jovialghost256.chatgpt.site',origin).replaceAll('1.3.2','1.4.0');if(name==='bridge.js'){
 text=text.replace("const r=await request('/api/status');return r.ok?{ok:true}:r","const r=await request('/api/session');return r.ok?{ok:true,user_id:r.data.user.id}:r");
 text=text.replace("return request('/api/extension/metrics?id='+encodeURIComponent(message.listing_id));","const result=await request('/api/extension/metrics?id='+encodeURIComponent(message.listing_id));if(!result.ok)return result;const current=await request('/api/session');if(!current.ok||current.data.user.id!==result.data.account_id)return {ok:false,code:'LOGIN',error:'Account changed. Reload Etsy metrics.'};return result;");
 text=text.replace("chrome.runtime.onMessage.addListener","chrome.runtime.sendMessage({type:'NL_AUTH_CHANGED'}).catch(()=>{});\n chrome.runtime.onMessage.addListener");
 }
 if(name==='background.js'){
 text=text.replace("const metricLoader=createMetricLoader(id=>fetchFromBridge(id));","const metricLoader=createMetricLoader(id=>fetchFromBridge(id),{ttl:0});");
 text=text.replace("const fromPopup=","if(message?.type==='NL_AUTH_CHANGED'&&sender.tab?.url?.startsWith(PORTAL+'/')){for(const tabID of metricTabs)chrome.tabs.sendMessage(tabID,{type:'NL_SESSION_RESET'}).catch(()=>{});sendResponse({ok:true});return false}\n const fromPopup=");
 }
 if(name==='content.js')text=text.replace("if(m?.type==='NL_METRICS_UPDATED')","if(m?.type==='NL_SESSION_RESET'){autoIDs.clear();for(const state of states){state.data=null;state.done=false;state.failed=false;waiting(state,'Account changed. Load metrics again.')}host?.remove();return false}if(m?.type==='NL_METRICS_UPDATED')");
 if(name==='manifest.json'){const m=JSON.parse(text);m.version='1.4.0';m.name='Niche Lab · Members';text=JSON.stringify(m,null,2)}files.push([name,Buffer.from(text)])}
fs.writeFileSync(path.join(out,'extension.zip'),zipFiles(files));
let account=fs.readFileSync(path.join(here,'public/index.html'),'utf8').replace('Niche Lab · Account staging','Niche Lab · Account').replace('Niche Lab account staging','Niche Lab account').replace('This separate staging interface requires a configured account service. Existing production invitations are unchanged.','Sign in with your approved account to use Etsy research and your private watchlists.').replace('autocomplete="current-password" required minlength="12"','autocomplete="current-password" required').replace('<h2>Your account</h2>','<h2>Your account</h2><p><a href="/dashboard">Open research dashboard</a> · <a href="/downloads/niche-lab-etsy-extension.zip">Download member extension 1.4.0</a></p>');
fs.writeFileSync(path.join(out,'index.html'),account);fs.copyFileSync(path.join(here,'integration/accounts.js'),path.join(out,'accounts.js'));
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('src="/app.js"','src="/dashboard.js"').replace('</aside>','<a class="button" href="/account">Account and user access</a></aside>').replaceAll('1.3.2','1.4.0');
html=html.replace(/<section id="setup"[\s\S]*?<\/section>/,'<section id="setup" class="hidden"><h1>Connection and account</h1><div class="panel setup"><h2 id="connectionTitle">Checking Etsy connection</h2><p>Research runs through the server. Your account has its own watchlists; Etsy request limits are shared.</p><p><a href="/account">Account and user access</a></p><p><a href="/downloads/niche-lab-etsy-extension.zip">Download member extension 1.4.0</a></p></div></section>').replace('sign in to Niche Lab with your allowed ChatGPT account','sign in to Niche Lab with your invited email account');
let js=fs.readFileSync(path.join(root,'app.js'),'utf8').replace("if(!r.ok)throw Error(d.error||'Request failed.');", "if([401,403].includes(r.status)){location.replace('/');throw Error('Your session or membership is no longer active.')}if(!r.ok)throw Error(d.error||'Request failed.');");
// Never offer another browser user's legacy shared watchlist for automatic import.
js=js.replace(/try\{const v=JSON\.parse\(localStorage\.getItem\('nicheLabWatchlist'\)\);.*?catch\{\}/,'');
js=js.replace("schedule?.enabled?'8:00 a.m.'","schedule?.enabled?'Every 5 minutes'");
js=js.replace("await api('/api/watchlist/import',{method:'POST',body:{keywords:v.keywords,listings:real.map(r=>r.listing_id)}})","await (async()=>{const entries=[...v.keywords.map(keyword=>({keyword})),...real.map(r=>({id:r.listing_id}))];for(let i=0;i<entries.length;i+=20){const part=entries.slice(i,i+20);await api('/api/watchlist/import',{method:'POST',body:{keywords:part.filter(r=>r.keyword!==undefined).map(r=>r.keyword),listings:part.filter(r=>r.id!==undefined).map(r=>r.id)}})}})()");
const constants=`const HTML=${JSON.stringify(html)},JS=${JSON.stringify(js)},ZIP='',EXTZIP='',ACCOUNTZIP='',SOURCEZIP='',SUPABASESCHEMA='',INTEGRATIONZIP='',INTEGRATIONSQL='';\n`;
const names=['sales-model.js','extension-server.js','research.js','cloud.js','worker.js'];
const source=names.map(name=>fs.readFileSync(path.join(root,name),'utf8').replace(/^import .*?;\r?\n/gm,'')).join('\n');
fs.writeFileSync(path.join(here,'integration/market-server.js'),constants+source);
console.log('Integrated dashboard, account pages and member extension 1.4.0 built. No secrets are embedded.');
