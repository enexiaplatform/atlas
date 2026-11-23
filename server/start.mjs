import express from "express";
import { resolve } from "node:path";
import { application } from "./app.mjs";
import { localDb, pilotConfig } from "./local.mjs";
const db = await localDb();
let pilot;
try {
  pilot = await pilotConfig();
} catch {
  throw Error("Run npm run setup before starting the local workspace");
}
const app = application(db, {
  previewUser: process.env.NODE_ENV !== "production" ? pilot.admin.user : null,
});
app.use(express.static(resolve("dist")));
app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
const port = Number(process.env.PORT || 4173);
const server = app.listen(port, "127.0.0.1", () =>
  console.log("Atlas preview http://127.0.0.1:" + port),
);
async function stop() {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
