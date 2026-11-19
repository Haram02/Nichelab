const cookieNames={access:'__Host-nl_access',refresh:'__Host-nl_refresh'};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export class SessionError extends Error{constructor(message,status){super(message);this.status=status}}
export function requireOrigin(request,env){if(request.headers.get('Origin')!==env.APP_ORIGIN)throw new SessionError('Origin rejected.',403)}
export function authConfig(env){if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL||'')||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY||!/^https:\/\//.test(env.APP_ORIGIN||''))throw new SessionError('Account service is not configured.',503)}
export async function sb(env,path,{token,service=false,method='GET',body,headers={}}={},fetcher=fetch){
 const key=service?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_ANON_KEY;
 const authorization=service?(key.startsWith('sb_secret_')?null:'Bearer '+key):token?'Bearer '+token:null;
 const r=await fetcher(env.SUPABASE_URL+path,{method,headers:{apikey:key,...(authorization?{Authorization:authorization}:{}),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!r.ok){const d=await r.json().catch(()=>({}));throw new SessionError(r.status===429?'Provider rate limit reached. Retry later.':d.code==='P0001'?'Request budget or tracking limit reached.':`Account provider returned HTTP ${r.status}.`,r.status===401?401:r.status===429||d.code==='P0001'?429:502)}
 if(r.status===204||r.headers.get('content-length')==='0')return null;
 const text=await r.text();return text?JSON.parse(text):null;
}
function cookies(request){return Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(s=>s.trim().split(/=(.*)/s).slice(0,2)).filter(p=>p.length===2))}
export function sessionHeaders(session){return [cookieNames.access+'='+session.access_token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+Math.min(session.expires_in||3600,3600),cookieNames.refresh+'='+session.refresh_token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000']}
export function attachCookies(response,session){if(!session)return response;const r=new Response(response.body,response);for(const value of sessionHeaders(session))r.headers.append('Set-Cookie',value);return r}
export async function identity(request,env,fetcher=fetch){
 authConfig(env);const jar=cookies(request);let token=jar[cookieNames.access],renewed=null,user;
 if(token)try{user=await sb(env,'/auth/v1/user',{token},fetcher)}catch(e){if(e.status!==401)throw e}
 if(!user&&jar[cookieNames.refresh]){try{renewed=await sb(env,'/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:jar[cookieNames.refresh]}},fetcher);token=renewed.access_token;user=await sb(env,'/auth/v1/user',{token},fetcher)}catch(e){if(e.status===502)throw e;throw new SessionError('Sign in again.',401)}}
 if(!user?.id||!user.email_confirmed_at)throw new SessionError('Sign in with a verified account.',401);
 const member=(await sb(env,'/rest/v1/memberships?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id,email,role,status',{token},fetcher))?.[0];
 if(!member||member.status!=='active')throw new SessionError('Access is not approved or has been suspended.',403);
 return{user,member,token,renewed};
}
export async function sessionRoute(request,env,fetcher=fetch){
 const path=new URL(request.url).pathname;if(!path.startsWith('/api/session'))return null;
 try{
  authConfig(env);if(request.method!=='GET')requireOrigin(request,env);
  if(path==='/api/session'&&request.method==='GET'){const auth=await identity(request,env,fetcher);return attachCookies(json({user:{id:auth.user.id,email:auth.user.email},membership:auth.member}),auth.renewed)}
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(path==='/api/session/logout'){const token=cookies(request)[cookieNames.access];if(token)try{await sb(env,'/auth/v1/logout?scope=local',{token,method:'POST'},fetcher)}catch{}const response=json({signed_out:true});for(const name of Object.values(cookieNames))response.headers.append('Set-Cookie',name+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return response}
  const raw=await request.text();if(raw.length>16384)return json({error:'Request too large.'},413);const body=JSON.parse(raw);
  if(path==='/api/session/login'||path==='/api/session/accept'){
   let session;
   if(path.endsWith('/login')){
    if(typeof body.email!=='string'||body.email.length>254||typeof body.password!=='string'||!body.password||body.password.length>1024)return json({error:'Enter email and password.'},400);
    try{session=await sb(env,'/auth/v1/token?grant_type=password',{method:'POST',body:{email:body.email.trim(),password:body.password}},fetcher)}catch{return json({error:'Sign-in failed. Check your account details or retry later.'},401)}
   }else{if(typeof body.access_token!=='string'||typeof body.refresh_token!=='string'||!/^[-\w.]+$/.test(body.access_token)||!/^[-\w.]+$/.test(body.refresh_token))return json({error:'Invalid invitation session.'},400);session={access_token:body.access_token,refresh_token:body.refresh_token,expires_in:3600}}
   const headers=new Headers(request.headers);headers.set('Cookie',cookieNames.access+'='+session.access_token);
   const auth=await identity(new Request(request.url,{headers}),env,fetcher);
   return attachCookies(json({signed_in:true,role:auth.member.role}),session);
  }
  if(path==='/api/session/password'){const auth=await identity(request,env,fetcher);if(typeof body.password!=='string'||body.password.length<12||body.password.length>1024)return json({error:'Use at least 12 characters.'},400);await sb(env,'/auth/v1/user',{token:auth.token,method:'PUT',body:{password:body.password}},fetcher);return attachCookies(json({updated:true}),auth.renewed)}
  return json({error:'Not found.'},404);
 }catch(e){return json({error:e instanceof SyntaxError?'Invalid JSON.':e.message},e.status||502)}
}
