import { parentPort, workerData } from "node:worker_threads";
import { readSheet } from "read-excel-file/node";
const rows = await readSheet(Buffer.from(workerData.buffer), 1);
if (workerData.textOnly) {
  let passage = "";
  for (const row of rows) {
    for (const value of row) {
      if (value != null)
        passage += (String(value) + " ").slice(0, 64000 - passage.length);
      if (passage.length >= 64000) break;
    }
    if (passage.length >= 64000) break;
  }
  parentPort.postMessage(passage.trim());
} else
  parentPort.postMessage(
    rows.length <= 201 && rows.every((row) => row.length <= 9) ? rows : null,
  );
