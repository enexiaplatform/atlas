import {readFile} from 'node:fs/promises';
import {provision,scoped} from '../server/db.mjs';
import {create,change} from '../server/vault.mjs';
import {importRows} from '../server/files.mjs';
import {domains} from '../shared/contracts.mjs';
export async function seed(db){
 const admin=await db.tx(c=>provision(c,'Servicebio Vietnam','Pilot reviewer'));
 const consumer=await db.tx(c=>provision(c,'','Memoire contract consumer','consumer',admin.workspace));
 const unrelated=await db.tx(c=>provision(c,'Independent workspace','Independent reviewer'));
 const ids=await db.tx(async c=>{
  await scoped(c,admin.user,admin.workspace,true);
  const assets={};
  async function add(key,title,type,d,description,fields={}){
   assets[key]=await create(c,admin.org,{title,asset_type:type,domain:domains[d],description,structured_content:fields,collection:['Scientific portfolio','Institution mapping','Competitive landscape','Strategy desk'][d],tags:['Synthetic'],classification:key==='scanner'?'Shareable':'Workspace'});
  }
  async function update(k,op,value){const a=assets[k];assets[k]=await change(c,'reviewer',a.id,a.version,op,value)}
  const link=(k,other,relation)=>update(k,'relationship',{related_id:assets[other].id,relation});
  await add('scanner','Digital slide scanner','Product Profile',0,'Synthetic training profile for academic slide imaging. Manufacturer specifications await primary evidence.',{'Category':'Digital slide imaging','Technical specifications':'Awaiting authorized brochure'});
  await add('competitor','Alternative slide scanner','Product Profile',2,'Synthetic competing model placeholder. Model and price await evidence.');
  await add('comparison','Slide scanner comparison','Product Comparison',2,'Comparison criteria for two illustrative scanner records.',{'Comparison criteria':'Application fit, document provenance and specification coverage'});
  await link('scanner','competitor','COMPETES_WITH');await link('comparison','scanner','REFERENCES');
  await link('comparison','competitor','REFERENCES');
  const brochure=await readFile(new URL('./scanner-brochure.txt',import.meta.url));
  await update('scanner','attachment',{name:'scanner-brochure.txt',type:'text/plain',buffer:brochure});
  await update('scanner','evidence',{source:'scanner-brochure.txt',claim:'The training profile represents digital slide imaging.',passage:'This unnamed scanner is a placeholder for a digital slide imaging workflow.',kind:'Fact'});
  await update('scanner','reference',{application:'memoire',external_id:'synthetic-scanner-reference'});
  await add('western','Western blot workflow','Technical Workflow',0,'Conceptual inventory of instruments, reagents and consumables used in protein analysis.');
  for(const [k,title,type] of [['instrument','Imaging instrument','Product Profile'],['reagent','Detection reagents','Product Profile'],['consumable','Transfer membrane','Product Profile'],['application','Protein expression analysis','Scientific Application']]){
   await add(k,title,type,0,'Synthetic catalog entry for workflow navigation.');await link('western',k,k==='application'?'SUPPORTS':'USES');
  }
  await add('market','Southern Vietnam research landscape','Market Landscape',1,'Pilot segmentation framework for universities and research institutes. Demand and market size await research.');
  const csv=await readFile(new URL('./institutions.csv',import.meta.url));
  for(const [i,row] of (await importRows({name:'institutions.csv',data:csv.toString('base64')})).entries()){
   const k='institution'+i;assets[k]=await create(c,admin.org,row.asset);await update(k,'evidence',row.evidence);await link(k,'market','REFERENCES');
  }
  await add('gtm','Vietnam research-market entry plan','Go-To-Market Plan',3,'Draft application-led positioning for academic research groups.',{Segment:'Universities and research institutes',Assumptions:'Demand, channel fit and purchasing authority require validation.'});
  for(const k of ['market','scanner','comparison'])await link('gtm',k,'REFERENCES');
  for(const k of ['scanner','market','gtm'])await update(k,'review',{lifecycle_status:'In Review',verification_status:'Unverified'});
  await update('scanner','review',{lifecycle_status:'Published',verification_status:'Unverified'});
  return Object.fromEntries(Object.entries(assets).map(([k,v])=>[k,v.id]));
 });
 return {admin,consumer,unrelated,ids};
}

