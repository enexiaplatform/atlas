import test from "node:test";
import assert from "node:assert/strict";
import { openDb, scoped } from "../server/db.mjs";
import { seed } from "../pilot/seed.mjs";
import { detail } from "../server/vault.mjs";
test("disposable backup restores original bytes, revision and restricted visibility", async () => {
  const original = await openDb();
  let restored;
  try {
    await original.migrate();
    const p = await seed(original);
    const backup = await original.backup();
    restored = await openDb({ backup });
    await restored.migrate();
    const fetchFile = (db) =>
      db.tx(async (c) => {
        await scoped(c, p.admin.user, p.admin.workspace);
        const a = await detail(c, p.ids.scanner);
        const f = await c.query(
          "select content from file_attachments where id=$1",
          [a.attachments[0].id],
        );
        return {
          version: a.version,
          data: Buffer.from(f.rows[0].content).toString("base64"),
        };
      });
    assert.deepEqual(await fetchFile(restored), await fetchFile(original));
    await restored.tx(async (c) => {
      await scoped(c, p.unrelated.user, p.unrelated.workspace);
      assert.equal(
        (await c.query("select * from file_attachments")).rows.length,
        0,
      );
    });
  } finally {
    await restored?.close();
    await original.close();
  }
});
