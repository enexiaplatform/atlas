import express from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {digest,opaque,scoped,first,rows,fail} from './db.mjs';
import {create,change,detail,search,dashboard} from './vault.mjs';
import {checked,importRows} from './files.mjs';
import {view} from '../shared/contracts.mjs';

export function application(db,{previewUser=null,verifyIdentity=null}={}){
 const app=express();
 app.disable('x-powered-by');
 app.use('/api',(req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  if(!['GET','HEAD'].includes(req.method) && req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origin mismatch'});
  next();
 },express.json({limit:'6mb'}));
 const sessionId=req=>/^atlas_session=([A-Za-z0-9_-]{43})$/.exec((req.headers.cookie||'').split(/;\s*/).find(x=>x.startsWith('atlas_session='))||'')?.[1];
 async function auth(c,req){
  const bearer=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  const token=bearer||sessionId(req);
  if(!token)fail(401,'Sign in to Atlas');
  const table=bearer?'credentials':'sessions';
  const p=await first(c,'select p.id,p.name,p.kind from '+table+' k join principals p on p.id=k.principal_id where digest=$1 and expires_at>now()',[digest(token)]);
  if(!p)fail(401,'Session or access key expired');return p;
 }
 const previewAllowed=req=>previewUser&&['localhost','127.0.0.1'].includes(req.hostname)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
 app.get('/api/config',(req,res)=>res.json({pilot:!!previewAllowed(req),supabase:!!verifyIdentity}));
 app.post('/api/session',async(req,res)=>{
  const session=opaque();
  await db.tx(async c=>{
   let p;
   if(req.body?.pilot&&previewAllowed(req))p={id:previewUser};
   else if(req.body?.identityToken && verifyIdentity){
    const subject=await verifyIdentity(z.string().max(8192).parse(req.body.identityToken));
    p=await first(c,"select id from principals where subject=$1 and kind='person'",[subject]);
   }else{
    const key=z.string().max(128).parse(req.body?.key);
    p=await first(c,"select p.id from credentials k join principals p on p.id=k.principal_id where digest=$1 and expires_at>now() and kind='person'",[digest(key)]);
   }
   if(!p)fail(401,'Identity unavailable');
   await c.query("insert into sessions values($1,$2,now()+interval '8 hours')",[digest(session),p.id]);
  });
  res.cookie('atlas_session',session,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:8*3600000,path:'/api'}).json({ok:true});
 });
 app.delete('/api/session',async(req,res)=>{await db.tx(c=>c.query('delete from sessions where digest=$1',[digest(sessionId(req)||'')]));res.clearCookie('atlas_session',{path:'/api'}).json({ok:true})});
 app.get('/api/me',async(req,res)=>res.json(await db.tx(async c=>{
  const p=await auth(c,req);
  return {...p,workspaces:await rows(c,'select w.*,m.role from memberships m join workspaces w on w.id=m.workspace_id where principal_id=$1 order by w.name',[p.id])};
 })));
 const base='/api/v1/workspaces/:workspace';
 function route(method,path,fn,{write=false,member=false,binary=false}={}){
  app[method](base+path,async(req,res)=>{
   const result=await db.tx(async c=>{
    const p=await auth(c,req),w=z.uuid().parse(req.params.workspace);
    const role=await scoped(c,p.id,w,write);
    if(member&&role==='consumer')fail(403,'Human membership required');
    const org=(await first(c,'select organization_id from atlas.workspace_context()')).organization_id;
    let key,hash;
    if(write){
     key=z.uuid().parse(req.headers['idempotency-key']);
     hash=digest(JSON.stringify([req.method,req.path,req.body,req.headers['if-match']]));
     const old=await first(c,'select * from receipts where workspace_id=scope() and principal_id=actor() and key=$1',[key]);
     if(old){if(hash!==old.digest)fail(409,'Idempotency key reused');return old.result}
    }
    const result=await fn(c,req,{p,role,org,key});
    if(write)await c.query('insert into receipts values(scope(),actor(),$1,$2,$3)',[key,hash,JSON.stringify(result)]);
    return result;
   });
   if(binary){res.attachment(result.name).set('Content-Type','application/octet-stream').send(Buffer.from(result.content))}
   else res.json(result);
  });
 }
 route('get','/overview',dashboard,{member:true});
 route('get','/assets',(c,r)=>search(c,r.query));
 route('post','/assets',(c,r,x)=>create(c,x.org,r.body,x.key),{write:true});
 route('get','/assets/:id',(c,r)=>detail(c,z.uuid().parse(r.params.id)));
 route('get','/assets/:id/versions',(c,r)=>rows(c,'select * from knowledge_asset_versions where workspace_id=scope() and asset_id=$1 order by version desc',[z.uuid().parse(r.params.id)]),{member:true});
 route('post','/assets/:id/:operation',async(c,r,x)=>{
  const input=r.params.operation==='attachment'?await checked(r.body):r.body;
  return change(c,x.role,z.uuid().parse(r.params.id),z.coerce.number().int().positive().parse(r.headers['if-match']),r.params.operation,input,x.key);
 },{write:true});
 route('get','/files/:id',async(c,r)=>{
  const f=await first(c,'select content,name from file_attachments where workspace_id=scope() and id=$1',[z.uuid().parse(r.params.id)]);
  if(!f)fail(404,'File unavailable');return f;
 },{member:true,binary:true});
 route('post','/imports',async(c,r,x)=>{
  if(r.body?.authorized!==true)fail(422,'Confirm authorization to import');
  const input=await importRows(r.body),ids=[];
  for(const row of input){
   const a=await create(c,x.org,row.asset,x.key);ids.push(a.id);
   if(row.evidence)await change(c,x.role,a.id,1,'evidence',row.evidence,x.key);
  }return {ids};
 },{write:true});
 route('get','/resolve',(c,r)=>rows(c,'select asset_id,application,external_id from external_entity_references where workspace_id=scope() and application=$1 and external_id=$2',[z.string().parse(r.query.application),z.string().parse(r.query.external_id)]));
 route('get','/events',(c,r)=>rows(c,'select * from integration_events where workspace_id=scope() and seq>$1 order by seq limit 100',[z.coerce.number().int().nonnegative().parse(r.query.after||0)]));
 route('get','/checkpoint',async c=>await first(c,'select last_seq from sync_checkpoints where workspace_id=scope() and principal_id=actor()')||{last_seq:0});
 route('post','/checkpoint',async(c,r)=>{
  const seq=z.coerce.number().int().positive().parse(r.body?.seq);
  if(!await first(c,'select seq from integration_events where seq=$1',[seq]))fail(404,'Event unavailable');
  await c.query('insert into sync_checkpoints values(scope(),actor(),$1,now()) on conflict(workspace_id,principal_id) do update set last_seq=greatest(sync_checkpoints.last_seq,excluded.last_seq),updated_at=now()',[seq]);return {acknowledged:seq};
 });
 route('get','/audit',c=>rows(c,'select * from audit_logs order by occurred_at desc,version desc limit 100'),{member:true});
 route('get','/views',c=>rows(c,'select name,settings from saved_views order by name'),{member:true});
 route('post','/views',async(c,r)=>{
  const v=view.parse(r.body);await c.query('insert into saved_views values(scope(),actor(),$1,$2) on conflict(workspace_id,principal_id,name) do update set settings=excluded.settings',[v.name,JSON.stringify(v)]);return v;
 },{member:true});
 route('get','/export',async c=>({format:'atlas-v1',assets:await Promise.all((await rows(c,'select id from knowledge_assets order by id')).map(a=>detail(c,a.id)))}),{member:true});
 app.use('/api',(req,res)=>res.status(404).json({error:'Unknown endpoint'}));
 app.use((err,req,res,next)=>{
  if(!req.path.startsWith('/api'))return next(err);
  const status=err instanceof z.ZodError?422:err.status||({'23505':409,'23503':422,'42501':403}[err.code])||500;
  if(status===500)console.error('Atlas request failed',err.code||err.name,err.message);
  const message=err instanceof z.ZodError?err.issues.map(i=>[i.path.join('.'),i.message].filter(Boolean).join(' ')).join(', '):err.status?err.message:status===409?'Record already exists':'Request could not be completed';
  res.status(status).json({error:message});
 });
 return app;
}

