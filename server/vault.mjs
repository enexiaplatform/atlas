import {randomUUID} from 'node:crypto';
import {first,rows,fail,digest} from './db.mjs';
import * as schema from '../shared/contracts.mjs';
export async function detail(c,id){
 const a=await first(c,'select * from knowledge_assets where workspace_id=scope() and id=$1',[id]);
 if(!a)fail(404,'Asset unavailable');
 const values=[id];
 const child=table=>rows(c,'select * from '+table+' where workspace_id=scope() and asset_id=$1',values);
 return {...a,evidence:await child('evidence_records'),references:await child('external_entity_references'),
 attachments:await rows(c,'select id,name,media_type,digest,octet_length(content) as size from file_attachments where workspace_id=scope() and asset_id=$1',values),
 links:await rows(c,`select r.relation,r.actor_id,r.created_at,a.id,a.title,a.asset_type,(r.asset_id=$1) as outgoing from knowledge_relationships r join knowledge_assets a on a.workspace_id=r.workspace_id and a.id=case when r.asset_id=$1 then r.related_id else r.asset_id end where r.workspace_id=scope() and $1 in (r.asset_id,r.related_id) order by a.title`,values)};
}
async function record(c,id,action,correlation){
 const a=await detail(c,id);
 await c.query('insert into knowledge_asset_versions values(scope(),$1,$2,$3,actor(),now())',[id,a.version,JSON.stringify(a)]);
 await c.query('insert into audit_logs values(scope(),$1,$2,$3,actor(),now())',[id,a.version,action]);
 await c.query(`insert into integration_events(event_id,event_type,workspace_id,organization_id,asset_id,asset_version,correlation_id,actor_id) values($1,$2,scope(),$3,$4,$5,$6,actor())`,[randomUUID(),'atlas.asset.'+action+'.v1',a.organization_id,id,a.version,correlation]);
 return a;
}
export async function create(c,org,input,correlation=randomUUID()){
 const a=schema.asset.parse(input),id=randomUUID();
 await c.query(`insert into knowledge_assets(id,workspace_id,organization_id,title,asset_type,domain,description,structured_content,owner_id,lifecycle_status,verification_status,version,tags,collection,classification,next_review_at) values($1,scope(),$2,$3,$4,$5,$6,$7,actor(),'Draft','Unverified',1,$8,$9,$10,$11)`,[id,org,a.title,a.asset_type,a.domain,a.description,JSON.stringify(a.structured_content),a.tags,a.collection,a.classification,a.next_review_at]);
 return record(c,id,'created',correlation);
}
const transitions={'Draft':['In Review','Archived'],'In Review':['Draft','Published','Archived'],'Published':['Draft','Superseded','Archived'],'Superseded':['Archived','Draft'],'Archived':['Draft']};
export async function change(c,role,id,expected,op,input,correlation=randomUUID()){
 const a=await detail(c,id);
 if(a.version!==expected)fail(409,'This asset changed. Reopen it before saving.');
 let action='updated';
 if(op==='review'){
  const r=schema.review.parse(input);
  if(role!=='reviewer' && !(a.lifecycle_status==='Draft' && r.lifecycle_status==='In Review' && r.verification_status==='Unverified'))fail(403,'Reviewer access required');
  if(r.lifecycle_status!==a.lifecycle_status && !transitions[a.lifecycle_status].includes(r.lifecycle_status))fail(422,'Invalid lifecycle transition');
  if(['Verified','Partially Verified'].includes(r.verification_status) && !a.evidence.length)fail(422,'Link evidence before verifying');
  if(r.lifecycle_status==='Draft')r.verification_status='Unverified';
  await c.query(`update knowledge_assets set lifecycle_status=$2,verification_status=$3,reviewed_at=case when $4='reviewer' then now() else reviewed_at end where workspace_id=scope() and id=$1`,[id,r.lifecycle_status,r.verification_status,role]);
  action=r.lifecycle_status!==a.lifecycle_status && r.lifecycle_status==='Published'?'published':r.lifecycle_status!==a.lifecycle_status && r.lifecycle_status==='Archived'?'archived':r.verification_status!==a.verification_status?'verification_changed':'updated';
 }else{
  if(a.lifecycle_status!=='Draft' || a.verification_status!=='Unverified')fail(409,'Return the asset to an unverified draft before editing');
  if(op==='edit'){
   const b=schema.asset.parse(input);
   await c.query('update knowledge_assets set title=$2,asset_type=$3,domain=$4,description=$5,structured_content=$6,classification=$7,tags=$8,collection=$9,next_review_at=$10 where workspace_id=scope() and id=$1',[id,b.title,b.asset_type,b.domain,b.description,JSON.stringify(b.structured_content),b.classification,b.tags,b.collection,b.next_review_at]);
  }else if(op==='evidence'){
   const e=schema.evidence.parse(input);
   await c.query('insert into evidence_records values(scope(),$1,$2,$3,$4,$5,$6)',[id,randomUUID(),e.source,e.passage,e.claim,e.kind]);
  }else if(op==='relationship'){
   const e=schema.edge.parse(input);
   const target=await detail(c,e.related_id);
   if(target.id===id)fail(422,'Choose another asset');
   if(e.relation==='COMPETES_WITH' && [a,target].some(x=>!['Product Profile','Competitor Profile'].includes(x.asset_type)))fail(422,'Competition edges require product or competitor profiles');
   await c.query('insert into knowledge_relationships(workspace_id,asset_id,related_id,relation,actor_id) values(scope(),$1,$2,$3,actor())',[id,target.id,e.relation]);action='relationship_changed';
  }else if(op==='reference'){
   const e=schema.ref.parse(input);
   await c.query('insert into external_entity_references values(scope(),$1,$2,$3)',[id,e.application,e.external_id]);
  }else if(op==='attachment'){
   await c.query('insert into file_attachments values(scope(),$1,$2,$3,$4,$5,$6)',[id,randomUUID(),input.name,input.type,input.buffer,digest(input.buffer)]);
  }else fail(404,'Unknown operation');
 }
 await c.query('update knowledge_assets set version=version+1,updated_at=now() where workspace_id=scope() and id=$1',[id]);
 return record(c,id,action,correlation);
}
export async function search(c,query){
 const f=schema.filter.parse(query),vec='search_vector(a.title,a.description,a.structured_content,a.tags)';
 const data=[f.q,f.domain,f.asset_type,f.tag,f.collection,f.status];
 const where=`a.workspace_id=scope() and ($1='' or ${vec} @@ plainto_tsquery('simple',$1) or position(lower($1) in lower(a.title))>0 or exists(select 1 from evidence_records e where e.workspace_id=a.workspace_id and e.asset_id=a.id and to_tsvector('simple',e.source||' '||e.claim||' '||e.passage) @@ plainto_tsquery('simple',$1))) and ($2='' or a.domain=$2) and ($3='' or a.asset_type=$3) and ($4='' or $4=any(a.tags)) and ($5='' or a.collection=$5) and ($6='' or a.lifecycle_status=$6)`;
 const rank=f.sort==='title'?'title,id':`ts_rank(${vec},plainto_tsquery('simple',$1)) desc,updated_at desc,id`;
 return {total:Number((await first(c,'select count(*) n from knowledge_assets a where '+where,data)).n),items:await rows(c,'select a.* from knowledge_assets a where '+where+' order by '+rank+' limit 25 offset $7',[...data,(f.page-1)*25])};
}
export async function dashboard(c){
 return {metrics:await first(c,`select count(*)::int as total,count(*) filter(where lifecycle_status='Published')::int as published,count(*) filter(where lifecycle_status='In Review')::int as reviews,count(*) filter(where verification_status='Unverified')::int as unverified,count(*) filter(where next_review_at<current_date and lifecycle_status not in ('Archived','Superseded'))::int as stale from knowledge_assets`),
 domains:await rows(c,'select domain,count(*)::int as n from knowledge_assets group by domain order by n desc,domain'),
 recent:await rows(c,'select * from knowledge_assets order by updated_at desc,id limit 6'),
 published:await rows(c,"select id,title from knowledge_assets where lifecycle_status='Published' order by updated_at desc limit 4"),
 collections:await rows(c,'select distinct collection from knowledge_assets order by collection'),
 tags:await rows(c,'select distinct unnest(tags) as tag from knowledge_assets order by tag')};
}

