import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash,randomBytes,randomUUID} from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
export function fail(status,message){throw Object.assign(new Error(message),{status})}
export async function openDb({directory,connectionString}={}){
 let engine, transact;
 if(connectionString){
  engine=new pg.Pool({connectionString});
  transact=async fn=>{
   const c=await engine.connect();
   try{await c.query('begin');const result=await fn(c);await c.query('commit');return result}
   catch(e){await c.query('rollback');throw e}finally{c.release()}
  };
 }else{
  if(directory)await mkdir(directory,{recursive:true});
  engine=new PGlite(directory);
  transact=fn=>engine.transaction(fn);
 }
 const tx=fn=>transact(async c=>{await c.query('set local search_path=atlas,pg_catalog');return fn(c)});
 return {tx,close:()=>connectionString?engine.end():engine.close(),migrate:()=>transact(async c=>{
  if((await c.query("select to_regclass('atlas.knowledge_assets') as installed")).rows[0].installed)return;
  const sql=await readFile(new URL('../db/001_atlas.sql',import.meta.url),'utf8');
  if(c.exec)await c.exec(sql);else await c.query(sql);
 })};
}
export const rows=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
export const first=async(c,sql,args=[])=>(await rows(c,sql,args))[0];
export async function scoped(c,user,workspace,write=false){
 const member=await first(c,'select role from memberships where principal_id=$1 and workspace_id=$2',[user,workspace]);
 if(!member)fail(404,'Workspace unavailable');
 if(write){
  if(!['reviewer','editor'].includes(member.role))fail(403,'Editor access required');
  // Serializes version changes, receipt checks and outbox ordering within a workspace.
  await c.query('select id from workspaces where id=$1 for update',[workspace]);
 }
 await c.query("select set_config('atlas.actor',$1,true),set_config('atlas.workspace',$2,true)",[user,workspace]);
 await c.query('set local role atlas_runtime');
 return member.role;
}
export async function provision(c,name,label,role='reviewer',workspace){
 let org;
 if(!workspace){
  org=randomUUID();workspace=randomUUID();
  await c.query('insert into organizations values($1,$2)',[org,name]);
  await c.query('insert into workspaces values($1,$2,$3)',[workspace,org,name]);
 }
 const user=randomUUID(),key=opaque();
 await c.query('insert into principals(id,name,kind) values($1,$2,$3)',[user,label,role==='consumer'?'consumer':'person']);
 await c.query('insert into memberships values($1,$2,$3)',[workspace,user,role]);
 await c.query("insert into credentials values($1,$2,now()+interval '30 days')",[digest(key),user]);
 return {org,workspace,user,key};
}

