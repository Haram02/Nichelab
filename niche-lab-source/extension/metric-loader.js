import {validID} from './shared.js';
export function createMetricLoader(fetchMetrics,{ttl=300000,maxEntries=300,concurrency=2,now=()=>Date.now()}={}){
 const cache=new Map(),pending=new Map(),queue=[];let active=0;
 function pump(){while(active<concurrency&&queue.length){const task=queue.shift();active++;Promise.resolve().then(()=>fetchMetrics(task.id)).then(result=>{if(result?.ok){cache.delete(task.id);cache.set(task.id,{result,expires:now()+ttl});while(cache.size>maxEntries)cache.delete(cache.keys().next().value)}active--;pending.delete(task.id);task.resolve(result);pump()},error=>{active--;pending.delete(task.id);task.reject(error);pump()})}}
 return{load(value,{force=false}={}){if(!validID(value))return Promise.reject(Error('Invalid Etsy listing ID.'));const id=String(value),existing=cache.get(id);if(!force&&existing&&existing.expires>now())return Promise.resolve(existing.result);if(pending.has(id))return pending.get(id);const promise=new Promise((resolve,reject)=>queue.push({id,resolve,reject}));pending.set(id,promise);pump();return promise},invalidate(value){cache.delete(String(value))}};
}
