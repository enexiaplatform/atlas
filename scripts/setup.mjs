import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {localDb,localRoot} from '../server/local.mjs';
import {seed} from '../pilot/seed.mjs';
const db=await localDb();
try{
 await db.migrate();
 if((await db.tx(c=>c.query('select id from organizations limit 1'))).rows.length)console.log('Existing workspace retained.');
 else{
  const pilot=await seed(db);
  await writeFile(resolve(localRoot,'pilot.json'),JSON.stringify(pilot,null,2),{mode:0o600,flag:'wx'});
  console.log('Synthetic pilot ready. Local access keys are in the ignored .local/pilot.json file.');
 }
}finally{await db.close()}

