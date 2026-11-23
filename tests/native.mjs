import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { opaque } from "../server/db.mjs";
const probe = createServer().listen(0, "127.0.0.1");
await new Promise((r) => probe.once("listening", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const password = opaque(),
  directory = await mkdtemp(join(tmpdir(), "atlas-native-"));
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  port,
  password,
  user: "postgres",
  persistent: false,
  authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
});
try {
  await pg.initialise();
  await pg.start();
  const child = spawn(process.execPath, ["--test", "tests/vault.test.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      ATLAS_DISPOSABLE_PG:
        "postgres://postgres:" + password + "@127.0.0.1:" + port + "/postgres",
    },
  });
  process.exitCode = await new Promise((r) => child.once("exit", r));
} finally {
  await pg.stop();
}
