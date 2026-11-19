// Standalone staging component. Intentionally not wired into the live Sites Worker.
// Supabase verifies identity; never trust an email or user ID supplied by the browser.
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const emailOK=s=>typeof s==='string'&&s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export function createAccessAPI(fetcher=fetch){
 return async function accessAPI(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/accounts/'))return null;
  if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY||!env.APP_ORIGIN)return reply({error:'Account service is not configured.'},503);
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL)||url.origin!==env.APP_ORIGIN)return reply({error:'Invalid account service configuration.'},503);
  if(!['GET','POST','DELETE'].includes(request.method))return reply({error:'Method not allowed.'},405);
  if(request.method!=='GET'&&request.headers.get('Origin')!==env.APP_ORIGIN)return reply({error:'Origin rejected.'},403);
  const authorization=request.headers.get('Authorization');
  if(!authorization?.match(/^Bearer [^\s]+$/))return reply({error:'Sign in required.'},401);
  async function provider(path,{method='GET',body,service=false,headers={}}={}){
   const result=await fetcher(env.SUPABASE_URL+path,{method,headers:{apikey:service?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_ANON_KEY,Authorization:service?'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY:authorization,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      if (!result.ok) throw Object.assign(
     Error('Supabase request failed: HTTP ' + result.status),
     { providerStatus: result.status }
   );
   if(result.status===204)return null;return result.json();
  }
  try{
   let user;try{user=await provider('/auth/v1/user')}catch{return reply({error:'Session expired. Sign in again.'},401)}
   if(!user?.id||!user.email_confirmed_at)return reply({error:'A verified account is required.'},403);
   const member=(await provider('/rest/v1/memberships?user_id=eq.'+encodeURIComponent(user.id)+'&select=user_id,email,role,status'))?.[0];
   if(!member||member.status!=='active')return reply({error:'Access is not approved or has been suspended.'},403);
   if(url.pathname==='/api/accounts/me'&&request.method==='GET')return reply({user:{id:user.id,email:user.email},membership:member});
   if(url.pathname==='/api/accounts/watchlist'){
    if(request.method==='GET')return reply({items:await provider('/rest/v1/user_watchlist?select=listing_id,created_at&order=created_at.desc&limit=1000')});
    const body=await request.json();const id=body.listing_id;
    if(!Number.isSafeInteger(id)||id<=0)return reply({error:'A positive listing ID is required.'},400);
    if(request.method==='POST'){await provider('/rest/v1/user_watchlist?on_conflict=user_id,listing_id',{method:'POST',body:{user_id:user.id,listing_id:id},headers:{Prefer:'resolution=ignore-duplicates,return=minimal'}});return reply({saved:true})}
    await provider('/rest/v1/user_watchlist?user_id=eq.'+encodeURIComponent(user.id)+'&listing_id=eq.'+id,{method:'DELETE'});return reply({removed:true});
   }
   if(member.role!=='owner')return reply({error:'Owner access required.'},403);
   if(url.pathname==='/api/accounts/users'&&request.method==='GET')return reply({users:await provider('/rest/v1/memberships?select=user_id,email,role,status,created_at&order=created_at.desc&limit=1000',{service:true})});
   if(request.method!=='POST')return reply({error:'Not found.'},404);
   if(Number(request.headers.get('Content-Length')||0)>4096)return reply({error:'Request too large.'},413);
   const body=await request.json();
   if(url.pathname==='/api/accounts/invite'){
    if(!emailOK(body.email))return reply({error:'Enter a valid email.'},400);
    const email=body.email.trim().toLowerCase();
    const invited=await provider('/auth/v1/invite',{method:'POST',service:true,body:{email}});
    const target=invited.id||invited.user?.id;if(!target)throw Error('Invalid invitation response.');
    await provider('/rest/v1/memberships?on_conflict=user_id',{method:'POST',service:true,body:{user_id:target,email,role:'member',status:'active'},headers:{Prefer:'resolution=ignore-duplicates,return=minimal'}});
    await provider('/rest/v1/access_audit',{method:'POST',service:true,body:{actor_id:user.id,target_id:target,action:'invite'},headers:{Prefer:'return=minimal'}});
    return reply({invited:true,user_id:target});
   }
   if(url.pathname==='/api/accounts/access'){
    if(typeof body.user_id!=='string'||!body.user_id.match(/^[a-f0-9-]{36}$/i)||!['active','suspended'].includes(body.status))return reply({error:'Invalid member change.'},400);
    if(body.user_id===user.id)return reply({error:'The owner cannot suspend their own account.'},409);
    const result=await provider('/rest/v1/memberships?user_id=eq.'+encodeURIComponent(body.user_id)+'&role=eq.member',{method:'PATCH',service:true,body:{status:body.status},headers:{Prefer:'return=representation'}});
    if(!result?.length)return reply({error:'Member not found.'},404);
    await provider('/rest/v1/access_audit',{method:'POST',service:true,body:{actor_id:user.id,target_id:body.user_id,action:body.status==='active'?'restore':'suspend'},headers:{Prefer:'return=minimal'}});
    return reply({updated:true});
   }
   return reply({error:'Not found.'},404);
  }catch(error){return reply({error:error instanceof SyntaxError?'Invalid JSON.':(error.providerStatus ? 'Supabase request failed: HTTP ' + error.providerStatus : 'Account operation failed.')},error instanceof SyntaxError?400:502)}
 };
}
