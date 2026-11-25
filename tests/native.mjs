import EmbeddedPostgres from "embedded-postgres";
import assert from "node:assert/strict";
import { mkdtemp, cp, rm, realpath } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { opaque, openDb, scoped } from "../server/db.mjs";
const probe = createServer().listen(0, "127.0.0.1");
await new Promise((r) => probe.once("listening", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const password = opaque(),
  directory = await mkdtemp(join(tmpdir(), "atlas-native-"));
const settings = {
  databaseDir: directory,
  port,
  password,
  user: "postgres",
  persistent: true,
  authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
};
const pg = new EmbeddedPostgres(settings);
const restoredDir = await mkdtemp(join(tmpdir(), "atlas-restored-"));
const restored = new EmbeddedPostgres({
  ...settings,
  databaseDir: restoredDir,
});
const connectionString =
  "postgres://postgres:" + password + "@127.0.0.1:" + port + "/postgres";
async function snapshot() {
  const db = await openDb({ connectionString });
  try {
    return await db.tx(async (c) => {
      const data = {};
      for (const table of [
        "organizations",
        "memberships",
        "knowledge_assets",
        "knowledge_asset_versions",
        "evidence_records",
        "file_attachments",
        "integration_events",
        "sync_checkpoints",
      ]) {
        const { rows } = await c.query(
          "select to_jsonb(t) record from " +
            table +
            " t order by to_jsonb(t)::text",
        );
        assert(rows.length > 0, table);
        data[table] = rows;
      }
      const {
        rows: [member],
      } = await c.query(
        "select workspace_id,principal_id from memberships where role='consumer' limit 1",
      );
      await scoped(c, member.principal_id, member.workspace_id);
      for (const table of [
        "knowledge_assets",
        "integration_events",
        "file_attachments",
      ])
        assert.equal(
          (
            await c.query(
              "select count(*)::int n from " +
                table +
                " where workspace_id<>$1",
              [member.workspace_id],
            )
          ).rows[0].n,
          0,
        );
      return data;
    });
  } finally {
    await db.close();
  }
}
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
  if (process.exitCode === 0) {
    const before = await snapshot();
    await pg.stop();
    await cp(directory, restoredDir, { recursive: true });
    await restored.start();
    assert.deepEqual(await snapshot(), before);
    console.log(
      "PASS native PostgreSQL cold restore: original bytes, evidence, revisions, all workspace event rows, checkpoints and tenant visibility.",
    );
  }
} finally {
  await restored.stop();
  await pg.stop();
  const root = await realpath(tmpdir());
  for (const dir of [directory, restoredDir]) {
    const actual = await realpath(dir);
    if (
      dirname(actual) === root &&
      /^atlas-(native|restored)-/.test(basename(actual))
    )
      await rm(actual, { recursive: true });
  }
}
