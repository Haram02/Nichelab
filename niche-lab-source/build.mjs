import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
execFileSync('python',['scripts/package-staging.py']);
execFileSync('python',['scripts/package-source.py']);
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
const SOURCEZIP=fs.readFileSync('niche-lab-source.zip').toString('base64');
const SUPABASESCHEMA=fs.readFileSync('staging/multi-user/schema.sql','utf8');
const ACCOUNTZIP=fs.readFileSync('niche-lab-account-staging.zip').toString('base64');
const extensionZip=fs.readFileSync('niche-lab-etsy-extension.zip').toString('base64');
const assets=`const HTML=${JSON.stringify(fs.readFileSync('index.html','utf8'))};\nconst JS=${JSON.stringify(fs.readFileSync('app.js','utf8'))};\nconst ZIP=${JSON.stringify(fs.readFileSync('etsy-tracker.zip').toString('base64'))};\n`;
fs.writeFileSync('dist/server/index.js',assets+`const EXTZIP=${JSON.stringify(extensionZip)};\nconst ACCOUNTZIP=${JSON.stringify(ACCOUNTZIP)};\nconst SOURCEZIP=${JSON.stringify(SOURCEZIP)};\nconst SUPABASESCHEMA=${JSON.stringify(SUPABASESCHEMA)};\n`+fs.readFileSync('sales-model.js','utf8')+'\n'+fs.readFileSync('extension-server.js','utf8').replace("import {weeklyMetrics} from './cloud.js';",'').replace("import {getSalesEstimate} from './sales-model.js';",'')+'\n'+fs.readFileSync('research.js','utf8')+'\n'+fs.readFileSync('cloud.js','utf8')+'\n'+fs.readFileSync('worker.js','utf8').replace("import {HTML,JS,ZIP} from './assets.js';",'').replace("import {cloudRoute,reserveEtsyRequest} from './cloud.js';",'').replace("import {researchRoute,normalizeShop} from './research.js';",'').replace("import {extensionRoute} from './extension-server.js';",'').replace("import {salesRoute} from './sales-model.js';",''));
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');

fs.cpSync('drizzle','dist/drizzle',{recursive:true});
