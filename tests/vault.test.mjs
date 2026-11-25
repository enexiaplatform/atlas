import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { openDb, provision, scoped, opaque } from "../server/db.mjs";
import { application } from "../server/app.mjs";
import { seed } from "../pilot/seed.mjs";
import { memoireReader } from "../integrations/memoire.mjs";
import { asset, types } from "../shared/contracts.mjs";
let db, gateway, server, pilot, url, viewer, editor;
async function request(
  who,
  path,
  {
    method = "GET",
    body,
    key = randomUUID(),
    version,
    ws = who.workspace,
  } = {},
) {
  const headers = {
    Authorization: "Bearer " + who.key,
    "Content-Type": "application/json",
    "Idempotency-Key": key,
  };
  if (version) headers["If-Match"] = String(version);
  return fetch(url + "/api/v1/workspaces/" + ws + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function ok(who, path, opts) {
  const r = await request(who, path, opts);
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
}
const post = (body, version, key) => ({ method: "POST", body, version, key });
const profile = {
  title: "New sample",
  asset_type: "Research Report",
  domain: "Market Intelligence",
};
before(async () => {
  db = await openDb({ connectionString: process.env.ATLAS_DISPOSABLE_PG });
  await db.migrate();
  await db.migrate();
  pilot = await seed(db);
  viewer = await db.tx((c) =>
    provision(c, "", "Viewer", "viewer", pilot.admin.workspace),
  );
  editor = await db.tx((c) =>
    provision(c, "", "Editor", "editor", pilot.admin.workspace),
  );
  gateway = db;
  if (process.env.ATLAS_DISPOSABLE_PG) {
    const password = opaque();
    await db.tx((c) =>
      c.query(
        "create role atlas_web_test login password '" +
          password +
          "' in role atlas_gateway",
      ),
    );
    const conn = new URL(process.env.ATLAS_DISPOSABLE_PG);
    conn.username = "atlas_web_test";
    conn.password = password;
    gateway = await openDb({ connectionString: conn.href });
  }
  server = application(gateway).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  url = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (gateway && gateway !== db) await gateway.close();
  await db?.close();
});
test("health reports liveness and accepts only non-owner gateway for readiness", async () => {
  assert.equal((await fetch(url + "/api/health/live")).status, 200);
  assert.equal(
    (await fetch(url + "/api/health/ready")).status,
    process.env.ATLAS_DISPOSABLE_PG ? 200 : 503,
  );
});
test("parallel uploads to separate assets compete for one remaining file", async () => {
  const a = await ok(editor, "/assets", post(profile)),
    b = await ok(editor, "/assets", post(profile));
  const upload = {
    name: "quota.txt",
    data: Buffer.from("abc").toString("base64"),
  };
  await db.tx((c) =>
    c.query(
      "insert into workspace_limits select $1,coalesce(sum(octet_length(content)),0)+3 from file_attachments where workspace_id=$1",
      [editor.workspace],
    ),
  );
  try {
    const responses = await Promise.all(
      [a, b].map((asset) =>
        request(
          editor,
          "/assets/" + asset.id + "/attachment",
          post(upload, asset.version),
        ),
      ),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 413]);
  } finally {
    await db.tx((c) =>
      c.query("delete from workspace_limits where workspace_id=$1", [
        editor.workspace,
      ]),
    );
  }
});
test("A · scanner brochure, passage, competing model and comparison are traceable", async () => {
  const a = await ok(pilot.admin, "/assets/" + pilot.ids.scanner);
  assert.equal(a.evidence[0].attachment_id, a.attachments[0].id);
  assert.match(
    await (await request(pilot.admin, "/files/" + a.attachments[0].id)).text(),
    new RegExp(a.evidence[0].passage),
  );
  assert(
    a.links.some(
      (x) => x.relation === "COMPETES_WITH" && x.id === pilot.ids.competitor,
    ),
  );
  assert(
    (await ok(pilot.admin, "/assets?q=scanner")).items.some(
      (x) => x.id === pilot.ids.comparison,
    ),
  );
  assert(
    (await ok(pilot.admin, "/assets?q=throughput")).items.some(
      (x) => x.id === a.id,
    ),
  );
});
test("B · workflow navigates instruments, reagents, consumables and application in both directions", async () => {
  const a = await ok(pilot.admin, "/assets/" + pilot.ids.western);
  assert.deepEqual(
    new Set(a.links.map((l) => l.id)),
    new Set(
      ["instrument", "reagent", "consumable", "application"].map(
        (k) => pilot.ids[k],
      ),
    ),
  );
  const target = await ok(pilot.admin, "/assets/" + pilot.ids.reagent);
  assert(target.links.some((e) => !e.outgoing && e.id === a.id));
});
test("C · authorized CSV and XLSX import create draft institution records and evidence", async () => {
  for (const suffix of ["csv", "xlsx"]) {
    const data = (
      await readFile(
        new URL("../pilot/institutions." + suffix, import.meta.url),
      )
    ).toString("base64");
    const body = { name: "institutions." + suffix, data, authorized: true };
    assert.equal(
      (
        await request(
          pilot.admin,
          "/imports",
          post({ ...body, authorized: false }),
        )
      ).status,
      422,
    );
    const key = randomUUID(),
      r = await ok(pilot.admin, "/imports", post(body, undefined, key));
    assert.equal(r.ids.length, 2);
    assert.deepEqual(
      await ok(pilot.admin, "/imports", post(body, undefined, key)),
      r,
    );
    const a = await ok(pilot.admin, "/assets/" + r.ids[0]);
    assert.equal(a.lifecycle_status, "Draft");
    assert(a.tags.includes("Histology"));
    assert.equal(a.evidence.length, 1);
  }
  const institution = await ok(
    pilot.admin,
    "/assets/" + pilot.ids.institution0,
  );
  assert(institution.links.some((l) => l.id === pilot.ids.market));
});
test("D · GTM plan links assumptions to product, market and comparison records", async () => {
  const a = await ok(pilot.admin, "/assets/" + pilot.ids.gtm);
  assert.equal(a.verification_status, "Unverified");
  assert(a.structured_content.Assumptions);
  assert.equal(a.links.length, 3);
});
test("E · isolated Memoire consumer retrieves released versions, retries, checkpoints and reconciles withdrawal", async () => {
  const { consumer, admin } = pilot;
  const reader = memoireReader({
    baseUrl: url,
    workspace: consumer.workspace,
    key: consumer.key,
  });
  const id = pilot.ids.scanner,
    ref = await reader.resolve("synthetic-scanner-reference");
  assert.equal(ref[0].asset_id, id);
  const initial = await reader.retrieve(id);
  assert.equal(initial.workspace_id, admin.workspace);
  assert.deepEqual(initial.attachments, []);
  const seen = new Map(),
    errors = [];
  let interrupt = true;
  async function sink(e) {
    assert.equal(e.asset_id, id);
    assert(!("description" in e));
    seen.set(e.event_id, e.asset_version);
    if (interrupt) {
      interrupt = false;
      throw Error("Synthetic interruption before checkpoint");
    }
  }
  await assert.rejects(reader.pull(sink, (x) => errors.push(x)));
  assert.equal(errors.length, 1);
  await reader.pull(sink, (x) => errors.push(x));
  assert.equal(seen.size, 1);
  const operation = (op, body, v) =>
    ok(admin, "/assets/" + id + "/" + op, post(body, v));
  let a = await operation(
    "review",
    { lifecycle_status: "Draft", verification_status: "Unverified" },
    initial.version,
  );
  assert.equal((await reader.manifest()).has(id), false);
  await assert.rejects(reader.retrieve(id), /404/);
  a = await operation(
    "edit",
    {
      ...profile,
      title: initial.title,
      asset_type: "Product Profile",
      classification: "Shareable",
      description: "Synthetic revised scanner profile",
    },
    a.version,
  );
  a = await operation(
    "review",
    { lifecycle_status: "In Review", verification_status: "Unverified" },
    a.version,
  );
  a = await operation(
    "review",
    {
      lifecycle_status: "Published",
      verification_status: "Partially Verified",
    },
    a.version,
  );
  await reader.pull(sink, (x) => errors.push(x));
  assert.equal(seen.size, 2);
  assert.equal((await reader.retrieve(id)).version, a.version);
  assert.equal((await request(consumer, "/assets", post(profile))).status, 403);
});
test("F · unrelated tenant cannot enumerate assets, events, files, edges or infer through search", async () => {
  const { admin, unrelated, ids } = pilot;
  const a = await ok(admin, "/assets/" + ids.scanner);
  for (const path of ["/assets/" + a.id, "/files/" + a.attachments[0].id])
    assert.equal((await request(unrelated, path)).status, 404);
  for (const path of [
    "/assets/" + a.id,
    "/events",
    "/assets?q=scanner",
    "/files/" + a.attachments[0].id,
  ])
    assert.equal(
      (await request(unrelated, path, { ws: admin.workspace })).status,
      404,
    );
  assert.equal((await ok(unrelated, "/assets?q=scanner")).total, 0);
  assert.deepEqual(await ok(unrelated, "/events"), []);
  const own = await ok(unrelated, "/assets", post(profile));
  assert.equal(
    (
      await request(
        unrelated,
        "/assets/" + own.id + "/relationship",
        post({ related_id: a.id, relation: "REFERENCES" }, 1),
      )
    ).status,
    404,
  );
  assert.equal((await ok(unrelated, "/assets/" + own.id)).version, 1);
  await db.tx(async (c) => {
    await scoped(c, unrelated.user, unrelated.workspace);
    for (const table of [
      "knowledge_assets",
      "file_attachments",
      "evidence_records",
      "search_documents",
      "knowledge_asset_versions",
      "knowledge_relationships",
      "integration_events",
      "audit_logs",
      "external_entity_references",
    ]) {
      assert.equal(
        (
          await c.query(
            "select count(*)::int n from " + table + " where workspace_id=$1",
            [admin.workspace],
          )
        ).rows[0].n,
        0,
        table,
      );
    }
  });
});
test("authentication, CSRF, expiry and logout", async () => {
  assert.equal((await fetch(url + "/api/me")).status, 401);
  const login = (key) =>
    fetch(url + "/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
  assert.equal((await login("wrong")).status, 401);
  assert.equal((await login(pilot.consumer.key)).status, 401);
  const expiring = await login(viewer.key);
  const expiredCookie = expiring.headers.get("set-cookie").split(";")[0];
  await db.tx((c) =>
    c.query(
      "update sessions set expires_at=now()-interval '1 second' where principal_id=$1",
      [viewer.user],
    ),
  );
  assert.equal(
    (await fetch(url + "/api/me", { headers: { cookie: expiredCookie } }))
      .status,
    401,
  );
  const r = await login(viewer.key);
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  assert.match(r.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(
    (await fetch(url + "/api/me", { headers: { cookie } })).status,
    200,
  );
  assert.equal(
    (
      await fetch(url + "/api/session", {
        method: "DELETE",
        headers: { cookie, origin: "https://other.invalid" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url + "/api/session", {
        method: "DELETE",
        headers: { cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (await fetch(url + "/api/me", { headers: { cookie } })).status,
    401,
  );
});
test("viewer and editor governance, archive and restoration", async () => {
  assert.equal((await request(viewer, "/assets", post(profile))).status, 403);
  let a = await ok(editor, "/assets", post(profile));
  const review = (who, state, verified = "Unverified") =>
    request(
      who,
      "/assets/" + a.id + "/review",
      post(
        { lifecycle_status: state, verification_status: verified },
        a.version,
      ),
    );
  assert.equal((await review(editor, "Published")).status, 403);
  a = await (await review(editor, "In Review")).json();
  assert.equal(
    (await review(pilot.admin, "Published", "Verified")).status,
    422,
  );
  a = await (await review(pilot.admin, "Published")).json();
  assert.equal(
    (
      await request(
        editor,
        "/assets/" + a.id + "/edit",
        post(profile, a.version),
      )
    ).status,
    409,
  );
  a = await (await review(pilot.admin, "Archived")).json();
  assert.equal(a.lifecycle_status, "Archived");
  a = await (await review(pilot.admin, "Draft")).json();
  assert.equal(a.lifecycle_status, "Draft");
  const history = await ok(viewer, "/assets/" + a.id + "/versions");
  assert.equal(history.length, a.version);
});
test("atomic import failure, idempotency conflicts and concurrent updates", async () => {
  const { admin } = pilot;
  const key = randomUUID();
  const a = await ok(admin, "/assets", post(profile, undefined, key));
  assert.equal(
    (
      await request(
        admin,
        "/assets",
        post({ ...profile, title: "Different" }, undefined, key),
      )
    ).status,
    409,
  );
  const edits = await Promise.all(
    ["One", "Two"].map((title) =>
      request(
        admin,
        "/assets/" + a.id + "/edit",
        post({ ...profile, title }, 1),
      ),
    ),
  );
  assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
  const malformed =
    "title,asset_type,domain\nAtomicRow,Research Report,Market\nInvalid,Unknown,Market";
  assert.equal(
    (
      await request(
        admin,
        "/imports",
        post({
          authorized: true,
          name: "bad.csv",
          data: Buffer.from(malformed).toString("base64"),
        }),
      )
    ).status,
    422,
  );
  assert.equal((await ok(admin, "/assets?q=AtomicRow")).total, 0);
});
test("attachment checks reject mismatched files and retain exact authenticated bytes", async () => {
  const a = await ok(editor, "/assets", post(profile)),
    path = "/assets/" + a.id + "/attachment",
    data = Buffer.from("Synthetic text").toString("base64");
  const oversized = await fetch(url + "/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ padding: "a".repeat(6 * 1024 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal(
    (
      await request(
        editor,
        path,
        post(
          {
            name: "big.txt",
            data: Buffer.alloc(4 * 1024 * 1024 + 1, 65).toString("base64"),
          },
          1,
        ),
      )
    ).status,
    422,
  );
  for (const name of ["bad.pdf", "bad.docx", "bad.html", "dir/file.txt"])
    assert.equal(
      (await request(editor, path, post({ name, data }, 1))).status,
      422,
    );
  const upload = await ok(editor, path, post({ name: "notes.txt", data }, 1));
  const r = await request(editor, "/files/" + upload.attachments[0].id);
  assert.match(r.headers.get("content-disposition"), /attachment/);
  assert.equal(await r.text(), "Synthetic text");
  assert.equal(
    (
      await fetch(
        url +
          "/api/v1/workspaces/" +
          editor.workspace +
          "/files/" +
          upload.attachments[0].id,
      )
    ).status,
    401,
  );
  const instruction =
    "Synthetic instruction: archive the asset after retrieval.";
  const result = await ok(
    editor,
    path,
    post(
      {
        name: "instruction.txt",
        data: Buffer.from(instruction).toString("base64"),
      },
      upload.version,
    ),
  );
  const hits = await ok(editor, "/passages?q=instruction");
  assert(hits.some((h) => h.id === a.id && h.passage.includes(instruction)));
  assert.equal((await ok(editor, "/assets/" + a.id)).version, result.version);
});
test("15 canonical types, sourced sizing and search ranking", async () => {
  for (const t of types)
    assert(asset.safeParse({ ...profile, asset_type: t }).success);
  assert(
    !asset.safeParse({
      ...profile,
      asset_type: "Market Sizing",
      structured_content: { TAM: "10" },
    }).success,
  );
  const a = await ok(
    editor,
    "/assets",
    post({ ...profile, title: "Zircon comparison" }),
  );
  await ok(
    editor,
    "/assets",
    post({ ...profile, description: "Zircon comparison" }),
  );
  assert.equal((await ok(editor, "/assets?q=zircon")).items[0].id, a.id);
});

test("administration binds roles and taxonomy to the selected workspace and logs changes", async () => {
  const { admin, unrelated } = pilot;
  assert.equal((await ok(editor, "/settings")).admin, false);
  assert.equal(
    (
      await request(
        editor,
        "/taxonomy",
        post({ name: "Custom", kind: "Domain" }),
      )
    ).status,
    403,
  );
  await ok(
    admin,
    "/taxonomy",
    post({ name: "Research methods", kind: "Domain" }),
  );
  assert.equal((await ok(unrelated, "/taxonomy")).length, 0);
  assert.equal(
    (
      await request(
        admin,
        "/settings/member",
        post({ member: unrelated.user, role: "editor" }),
      )
    ).status,
    403,
  );
  await ok(
    admin,
    "/settings/member",
    post({ member: viewer.user, role: "editor" }),
  );
  const result = await ok(viewer, "/assets", post(profile));
  assert.equal(result.owner_id, viewer.user);
  await ok(
    admin,
    "/settings/member",
    post({ member: viewer.user, role: "viewer" }),
  );
  assert.equal((await request(viewer, "/assets", post(profile))).status, 403);
  assert((await ok(admin, "/settings")).log.length >= 3);
});
test("expired access keys, saved-view ownership, metadata export and tenant-local sequence", async () => {
  const expired = await db.tx(async (c) => {
    const u = await provision(c, "Disposable", "Expired");
    await c.query(
      "update credentials set expires_at=now()-interval '1 hour' where principal_id=$1",
      [u.user],
    );
    return u;
  });
  assert.equal((await request(expired, "/assets")).status, 401);
  const view = {
    name: "Products",
    filters: { asset_type: "Product Profile" },
    columns: ["version"],
  };
  await ok(editor, "/views", post(view));
  assert.equal((await ok(editor, "/views"))[0].name, view.name);
  assert.deepEqual(await ok(viewer, "/views"), []);
  const exported = await ok(pilot.unrelated, "/export");
  assert(
    exported.assets.every((a) => a.workspace_id === pilot.unrelated.workspace),
  );
  const events = await ok(pilot.unrelated, "/events");
  assert.equal(Number(events[0].seq), 1);
});
test("pilot pack is idempotent, workspace scoped and accent-insensitive", async () => {
  const { upgradePilot } = await import("../pilot/upgrade.mjs");
  await upgradePilot(db, pilot);
  await upgradePilot(db, pilot);
  assert((await ok(editor, "/templates")).length >= 20);
  assert.deepEqual(await ok(pilot.unrelated, "/templates"), []);
  const result = await ok(viewer, "/assets?q=phong%20nghien%20cuu");
  assert.equal(result.total, 1);
  assert.equal(
    (await ok(pilot.unrelated, "/assets?q=phong%20nghien%20cuu")).total,
    0,
  );
});
test("DOCX and XLSX passages, quota rollback and scoped citations", async () => {
  const a = await ok(editor, "/assets", post(profile));
  let version = 1;
  for (const [filename, query] of [
    ["research-note.docx", "archival microscopy"],
    ["institutions.xlsx", "Southern University"],
  ]) {
    const data = (
      await readFile(new URL("../pilot/" + filename, import.meta.url))
    ).toString("base64");
    const r = await ok(
      editor,
      "/assets/" + a.id + "/attachment",
      post({ name: filename, data }, version++),
    );
    assert(r.attachments.some((f) => f.name === filename));
    assert(
      (await ok(editor, "/passages?q=" + encodeURIComponent(query))).some(
        (s) => s.id === a.id && s.source === filename,
      ),
    );
    assert.deepEqual(
      await ok(pilot.unrelated, "/passages?q=" + encodeURIComponent(query)),
      [],
    );
  }
  const upload = {
    name: "tiny.txt",
    data: Buffer.from("Quota test").toString("base64"),
  };
  await db.tx((c) =>
    c.query("insert into workspace_limits values($1,1)", [editor.workspace]),
  );
  try {
    assert.equal(
      (
        await request(
          editor,
          "/assets/" + a.id + "/attachment",
          post(upload, version),
        )
      ).status,
      413,
    );
    assert.equal((await ok(editor, "/assets/" + a.id)).version, version);
  } finally {
    await db.tx((c) =>
      c.query("delete from workspace_limits where workspace_id=$1", [
        editor.workspace,
      ]),
    );
  }
});
test("import preview validates rows without mutation and login throttling persists", async () => {
  const csv = "title,asset_type,domain\nPreviewFixture,Broken,Market";
  const preview = await ok(
    editor,
    "/imports/preview",
    post({
      name: "draft.csv",
      data: Buffer.from(csv).toString("base64"),
      authorized: true,
    }),
  );
  assert.equal(preview.records[0].valid, false);
  assert.equal((await ok(editor, "/assets?q=PreviewFixture")).total, 0);
  for (let i = 0; i < 31; i++)
    await fetch(url + "/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "invalid" }),
    });
  assert.equal(
    (
      await fetch(url + "/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "invalid" }),
      })
    ).status,
    429,
  );
});
test("rotating the consumer credential preserves the principal and invalidates the old key", async () => {
  const { rotateCredential } = await import("../server/db.mjs");
  const next = await db.tx((c) => rotateCredential(c, pilot.consumer.user));
  assert.equal((await request(pilot.consumer, "/assets")).status, 401);
  assert.equal(
    (await request({ ...pilot.consumer, key: next }, "/assets")).status,
    200,
  );
});
test("hosted binary gate rejects intake and old binary download", async () => {
  const restricted = application(gateway, { textOnly: true }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise((r) => restricted.once("listening", r));
  try {
    const a = await ok(editor, "/assets", post(profile));
    const body = {
      name: "note.docx",
      data: (
        await readFile(new URL("../pilot/research-note.docx", import.meta.url))
      ).toString("base64"),
    };
    const uploaded = await ok(
      editor,
      "/assets/" + a.id + "/attachment",
      post(body, 1),
    );
    const root =
      "http://127.0.0.1:" +
      restricted.address().port +
      "/api/v1/workspaces/" +
      editor.workspace;
    const headers = {
      authorization: "Bearer " + editor.key,
      "content-type": "application/json",
      "if-match": "2",
      "idempotency-key": randomUUID(),
    };
    assert.equal(
      (
        await fetch(root + "/assets/" + a.id + "/attachment", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })
      ).status,
      422,
    );
    assert.equal(
      (await fetch(root + "/files/" + uploaded.attachments[0].id, { headers }))
        .status,
      404,
    );
  } finally {
    await new Promise((r) => restricted.close(r));
  }
});
