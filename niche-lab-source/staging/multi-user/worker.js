import {createAccessAPI} from './access-api.js';
const accounts=createAccessAPI();
export default {async fetch(request,env){
 const response=await accounts(request,env);if(response)return response;
 const path=new URL(request.url).pathname;
 // Never forward unimplemented research/collector routes around account checks.
 if(path.startsWith('/api/'))return Response.json({error:'This staging API is not implemented.'},{status:404});
 return env.ASSETS.fetch(request);
}};
