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
    await original.tx((c) =>
      c.query(
        "insert into sync_checkpoints select $1,$2,max(seq),now() from integration_events where workspace_id=$1",
        [p.admin.workspace, p.consumer.user],
      ),
    );
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
          asset: a.id,
          evidence: a.evidence,
          version: a.version,
          history: (
            await c.query(
              "select asset_id,version,snapshot from knowledge_asset_versions order by asset_id,version",
            )
          ).rows,
          events: (
            await c.query(
              "select seq,event_id,asset_version from integration_events order by seq",
            )
          ).rows,
          data: Buffer.from(f.rows[0].content).toString("base64"),
        };
      });
    assert.deepEqual(await fetchFile(restored), await fetchFile(original));
    for (const db of [original, restored]) {
      await db.tx(async (c) => {
        const {
          rows: [cursor],
        } = await c.query(
          "select s.last_seq,e.seq from sync_checkpoints s join integration_events e on (e.workspace_id,e.seq)=(s.workspace_id,s.last_seq) where s.principal_id=$1",
          [p.consumer.user],
        );
        assert(cursor && Number(cursor.seq) > 0);
        assert.equal(cursor.last_seq, cursor.seq);
      });
    }
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
