import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import lockfile from 'proper-lockfile';
import {openDb} from './db.mjs';
export const localRoot=resolve(process.env.ATLAS_LOCAL_DIR||'.local');
export async function localDb(){
 await mkdir(localRoot,{recursive:true});
 const release=await lockfile.lock(localRoot,{realpath:false});
 try{
  const db=await openDb({directory:resolve(localRoot,'postgres')});
  const close=db.close;db.close=async()=>{await close();await release()};
  return db;
 }catch(e){await release();throw e}
}
export const pilotConfig=async()=>JSON.parse(await readFile(resolve(localRoot,'pilot.json'),'utf8'));

