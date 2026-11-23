export function supabaseVerifier(url,anonKey){
 const issuer=new URL(url);
 if(issuer.protocol!=='https:')throw Error('Configure an HTTPS identity issuer');
 return async token=>{
  const res=await fetch(new URL('/auth/v1/user',issuer),{headers:{authorization:'Bearer '+token,apikey:anonKey},redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw Object.assign(Error('Identity could not be verified'),{status:401});
  const user=await res.json();return issuer.origin+'#'+user.id;
 };
}

