import {parentPort,workerData} from 'node:worker_threads';
import {readSheet} from 'read-excel-file/node';
const rows=await readSheet(Buffer.from(workerData),1);
parentPort.postMessage(rows.length<=201 && rows.every(row=>row.length<=9)?rows:null);

