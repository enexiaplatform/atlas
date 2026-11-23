export type Asset={id:string,title:string,domain:string,asset_type:string,description:string,structured_content:Record<string,string>,tags:string[],collection:string,classification:string,lifecycle_status:string,verification_status:string,version:number,updated_at:string,next_review_at:string|null,owner_id:string,reviewed_at:string|null};
export type Detail=Asset&{links:{id:string,title:string,relation:string,outgoing:boolean}[],evidence:{id:string,source:string,claim:string,passage:string,kind:string}[],attachments:{id:string,name:string,size:number,media_type:string}[],references:{application:string,external_id:string}[]};
export type Workspace={id:string,name:string,role:string,organization_id:string};
export type Me={name:string,workspaces:Workspace[]};
export type Summary={metrics:{total:number,published:number,reviews:number,unverified:number,stale:number},recent:Asset[],published:{id:string,title:string}[],domains:{domain:string,n:number}[],collections:{collection:string}[],tags:{tag:string}[]};
export type Filters={q:string,domain:string,asset_type:string,tag:string,collection:string,status:string,sort:string,page:number};
export const blank:Filters={q:'',domain:'',asset_type:'',tag:'',collection:'',status:'',sort:'updated',page:1};
export async function api<T>(url:string,method='GET',body?:unknown,version?:number):Promise<T>{
 const headers:Record<string,string>={};
 if(method!=='GET'){headers['Content-Type']='application/json';headers['Idempotency-Key']=crypto.randomUUID()}
 if(version)headers['If-Match']=String(version);
 const res=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed');return data;
}
export async function fileData(f:File){
 if(f.size>4194304)throw Error('Maximum file size is 4 MiB');
 const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('File read failed'));r.readAsDataURL(f)});
 return {name:f.name,data};
}
export const date=(v:string)=>new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

