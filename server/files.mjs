import {extname} from 'node:path';
import yauzl from 'yauzl';
import {Worker} from 'node:worker_threads';
import {parse} from 'csv-parse/sync';
import {fail} from './db.mjs';
const office={docx:'word/document.xml',pptx:'ppt/presentation.xml',xlsx:'xl/workbook.xml'};
const types={txt:'text/plain',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv'};
export function decode(body){
 if(typeof body?.name!=='string'||body.name.length>150|| /[\\/:*?"<>|\x00-\x1f]/.test(body.name)||typeof body.data!=='string'||body.data.length>5600000||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data))fail(422,'Invalid file');
 const buffer=Buffer.from(body.data,'base64');
 if(!buffer.length||buffer.length>4*1024*1024)fail(422,'Files must be 1 byte to 4 MiB');
 return {name:body.name,ext:extname(body.name).slice(1).toLowerCase(),buffer};
}
async function checkOffice(buffer,required){
 await new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true},(err,zip)=>{
  if(err)return reject(err);
  const names=new Set();let size=0;
  const stop=()=>{zip.close();reject(new Error('Unsupported Office package'))};
  zip.on('error',reject);
  zip.on('entry',entry=>{
   size+=entry.uncompressedSize;
   if(names.size>=500||size>12*1024*1024||names.has(entry.fileName)||entry.generalPurposeBitFlag&1||/vbaproject|activex|embeddings\//i.test(entry.fileName))return stop();
   names.add(entry.fileName);
   zip.openReadStream(entry,(err,stream)=>{
    if(err)return stop();
    let count=0;
    stream.on('data',chunk=>{count+=chunk.length;if(count>entry.uncompressedSize){stream.destroy();stop()}});
    stream.on('error',stop);stream.on('end',()=>zip.readEntry());
   });
  });
  zip.on('end',()=>names.has(required)&&names.has('[Content_Types].xml')?resolve():reject(new Error('Invalid Office package')));
  zip.readEntry();
 }));
}
export async function checked(body,allowed=['pdf','txt','docx','pptx','xlsx']){
 const f=decode(body);
 if(!allowed.includes(f.ext))fail(422,'Unsupported file extension');
 try{
  if(office[f.ext])await checkOffice(f.buffer,office[f.ext]);
  else if(f.ext==='pdf'){if(!f.buffer.subarray(0,5).equals(Buffer.from('%PDF-'))||!f.buffer.subarray(-1024).includes(Buffer.from('%%EOF')))throw Error()}
  else {new TextDecoder('utf-8',{fatal:true}).decode(f.buffer);if(f.buffer.includes(0))throw Error()}
 }catch{fail(422,'File contents do not match an accepted format')}
 return {...f,type:types[f.ext]};
}
export async function importRows(body){
 const f=await checked(body,['csv','xlsx']);let table;
 try{
  table=f.ext==='csv'?parse(f.buffer,{bom:true,skip_empty_lines:true,max_record_size:12000,to:202}):await new Promise((resolve,reject)=>{
   const worker=new Worker(new URL('./xlsx-worker.mjs',import.meta.url),{workerData:f.buffer,resourceLimits:{maxOldGenerationSizeMb:64}});
   const timer=setTimeout(()=>{worker.terminate();reject(Error())},5000);
   worker.once('error',reject);worker.once('message',resolve);worker.once('exit',()=>{clearTimeout(timer);reject(Error())});
  });
 }catch{fail(422,'Could not read the import file')}
 if(!Array.isArray(table)||table.length<2||table.length>201)fail(422,'Import 1–200 records at a time');
 const headers=table.shift().map(x=>String(x??'').trim());
 const allowed=['title','asset_type','domain','description','collection','tags','source','passage','claim'];
 if(!['title','asset_type','domain'].every(x=>headers.includes(x))||headers.some(x=>!allowed.includes(x))||new Set(headers).size!==headers.length)fail(422,'Invalid import headers. Use the CSV template.');
 return table.map((r,i)=>{
  if(r.length>headers.length)fail(422,'Unexpected columns on row '+(i+2));
  const o=Object.fromEntries(headers.map((h,j)=>[h,String(r[j]??'').trim()]));
  const {source,passage,claim,...a}=o;
  if(a.tags)a.tags=a.tags.split('|').map(x=>x.trim());else delete a.tags;
  if(!a.collection)delete a.collection;
  if([source,passage,claim].some(Boolean)&&![source,passage,claim].every(Boolean))fail(422,'Incomplete evidence on row '+(i+2));
  return {asset:a,evidence:source?{source,passage,claim,kind:'Hypothesis'}:null};
 });
}

