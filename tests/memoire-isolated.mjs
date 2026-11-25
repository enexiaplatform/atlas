import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import express from "express";
import { openDb, opaque } from "../server/db.mjs";
import { application } from "../server/app.mjs";
import { seed } from "../pilot/seed.mjs";
const sibling = resolve(
  process.env.MEMOIRE_CHECKOUT || "../Memoire-atlas-receiver",
);
const { atlasReceiver } = await import(
  pathToFileURL(join(sibling, "api/_atlasReference.js"))
);
const stack = process.env.ATLAS_DISPOSABLE_SUPABASE_DIR;
const memo = stack
    ? (await import("./disposable-supabase.mjs")).disposableSupabase(stack)
    : new PGlite(),
  atlas = await openDb(),
  servers = [];
async function serve(app) {
  const s = app.listen(0, "127.0.0.1");
  servers.push(s);
  await new Promise((r) => s.once("listening", r));
  return "http://127.0.0.1:" + s.address().port;
}
try {
  await atlas.migrate();
  const { admin, consumer, ids, unrelated } = await seed(atlas),
    origin = await serve(application(atlas));
  const mapping = {
    origin,
    permissions: ["reference.read", "reference.pin", "events.sync"],
    user: randomUUID(),
    workspace: randomUUID(),
    owner: randomUUID(),
    organization: admin.org,
    atlasWorkspace: admin.workspace,
    servicePrincipal: consumer.user,
  };
  let login = opaque(),
    foreign = opaque(),
    otherUser = randomUUID();
  if (stack) {
    const primary = await memo.signup(),
      other = await memo.signup();
    mapping.user = primary.id;
    login = primary.token;
    otherUser = other.id;
    foreign = other.token;
    await memo.exec(
      "create table public.memoire_personal_workspaces(user_id uuid,id uuid,name text,primary key(user_id,id))",
    );
  } else
    await memo.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;create table public.memoire_personal_workspaces(user_id uuid,id uuid,name text,primary key(user_id,id));`);
  const migration = async (name) =>
    readFile(join(sibling, "supabase/migrations", name), "utf8");
  const scopeDDL = await migration(
    "20261116042500_native_workspace_data_scope.sql",
  );
  await memo.exec(scopeDDL.slice(0, scopeDDL.indexOf("-- The Data API hook")));
  await memo.exec(
    await migration("20261123010000_atlas_reference_receipts.sql"),
  );
  await memo.exec(await migration("20261125010000_atlas_consumer_state.sql"));
  process.env.MEMOIRE_ATLAS_PROGRESS_KEY = opaque();
  await memo.query(
    "insert into memoire_private.atlas_receiver_keys values($1,$2,$3,$4,sha256(convert_to($5,'UTF8')))",
    [
      mapping.owner,
      mapping.organization,
      mapping.atlasWorkspace,
      mapping.servicePrincipal,
      process.env.MEMOIRE_ATLAS_PROGRESS_KEY,
    ],
  );
  if (stack)
    await memo.query("insert into auth.users(id) values($1)", [mapping.owner]);
  else
    await memo.query("insert into auth.users values($1),($2),($3)", [
      mapping.user,
      mapping.owner,
      otherUser,
    ]);
  await memo.query(
    "insert into memoire_personal_workspaces values($1,$2,'Pilot')",
    [mapping.user, mapping.workspace],
  );
  await memo.query(
    "insert into memoire_private.workspace_data_owners values($1,$2,$3,now())",
    [mapping.user, mapping.workspace, mapping.owner],
  );
  // Local transport fixture implements only the Supabase endpoints used by the actual receiver.
  // Its RLS policies, workspace resolver, pre-request hook and receipt RPC execute in PostgreSQL.
  if (stack) await memo.reload();
  else {
    const facade = express();
    facade.use(express.json());
    facade.use(async (req, res) => {
      const user =
        req.headers.authorization === "Bearer " + login
          ? mapping.user
          : req.headers.authorization === "Bearer " + foreign
            ? otherUser
            : null;
      if (!user) return res.sendStatus(401);
      if (req.path === "/auth/v1/user")
        return res.json({
          id: user,
          aud: "authenticated",
          role: "authenticated",
        });
      const data = await memo.transaction(async (c) => {
        await c.query("set local role authenticated");
        await c.query(
          "select set_config('request.headers',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.jwt.claim.sub',$3,true)",
          [
            JSON.stringify(req.headers),
            JSON.stringify({ role: "authenticated", sub: user }),
            user,
          ],
        );
        await c.query("select memoire_private.apply_workspace_data_scope()");
        if (req.path.endsWith("/rpc/memoire_get_native_workspace_scope"))
          return (
            (
              await c.query(
                "select * from memoire_get_native_workspace_scope($1)",
                [req.body.p_workspace],
              )
            ).rows[0] || null
          );
        if (req.path.endsWith("/rpc/memoire_active_data_owner"))
          return (await c.query("select memoire_active_data_owner() id"))
            .rows[0].id;
        if (req.path.endsWith("/rpc/memoire_atlas_progress_op")) {
          const b = req.body;
          return (
            await c.query(
              "select memoire_atlas_progress_op($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) state",
              [
                b.p_org,
                b.p_workspace,
                b.p_principal,
                b.p_action,
                b.p_key,
                b.p_expected ?? 0,
                b.p_seq ?? 0,
                b.p_asset,
                b.p_version,
                b.p_event,
              ],
            )
          ).rows[0].state;
        }
        if (req.path.endsWith("/rpc/memoire_pin_atlas_reference")) {
          const b = req.body;
          await c.query("select memoire_pin_atlas_reference($1,$2,$3,$4,$5)", [
            b.p_org,
            b.p_workspace,
            b.p_asset,
            b.p_version,
            b.p_event,
          ]);
          return null;
        }
        if (req.path.endsWith("/memoire_atlas_pins"))
          return (
            await c.query(
              "select version from memoire_atlas_pins where owner_id=$1 and atlas_org=$2 and atlas_workspace=$3 and asset_id=$4",
              ["owner_id", "atlas_org", "atlas_workspace", "asset_id"].map(
                (k) => req.query[k].slice(3),
              ),
            )
          ).rows;
        throw Error("Unknown fixture route");
      });
      res.json(data);
    });
    process.env.SUPABASE_URL = await serve(facade);
    process.env.VITE_SUPABASE_ANON_KEY = opaque();
  }
  mapping.issuer = process.env.SUPABASE_URL;
  let loseAck = true;
  const mapp = express();
  mapp.use(express.json());
  mapp.all(
    "/api/commercial",
    atlasReceiver({
      mapping,
      credential: consumer.key,
      fetchImpl: (url, opts) => {
        if (
          loseAck &&
          String(url).endsWith("/checkpoint") &&
          opts.method === "POST"
        ) {
          loseAck = false;
          throw Error("simulated interrupted acknowledgement");
        }
        return fetch(url, opts);
      },
    }),
  );
  const mUrl = (await serve(mapp)) + "/api/commercial?resource=atlas-reference";
  const id = ids.scanner;
  function call(
    body,
    token = login,
    workspace = mapping.workspace,
    asset = id,
  ) {
    return fetch(mUrl + "&asset=" + asset, {
      headers: {
        authorization: "Bearer " + token,
        "x-memoire-data-workspace": workspace,
        "content-type": "application/json",
      },
      method: body ? "POST" : "GET",
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  const expect = async (p, status = 200) => {
    const r = await p;
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify(data));
    return data;
  };
  await expect(call({ command: "pin", asset: id }));
  const initial = await expect(call());
  assert.equal(initial.version, initial.pinned_version);
  await expect(call({ command: "sync" }), 503);
  await expect(call({ command: "sync" }), 429);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await expect(call({ command: "sync" }));
  assert.equal(
    (await memo.query("select count(*)::int n from memoire_atlas_receipts"))
      .rows[0].n,
    1,
  );
  const root =
    origin + "/api/v1/workspaces/" + admin.workspace + "/assets/" + id + "/";
  async function review(state, v) {
    return expect(
      fetch(root + "review", {
        method: "POST",
        headers: {
          authorization: "Bearer " + admin.key,
          "if-match": String(v),
          "idempotency-key": randomUUID(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          lifecycle_status: state,
          verification_status: "Unverified",
        }),
      }),
    );
  }
  let a = await review("Draft", initial.version);
  await expect(call(), 404);
  a = await expect(
    fetch(root + "edit", {
      method: "POST",
      headers: {
        authorization: "Bearer " + admin.key,
        "if-match": String(a.version),
        "idempotency-key": randomUUID(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Revised synthetic scanner",
        asset_type: "Product Profile",
        domain: "Product & Scientific",
        classification: "Shareable",
      }),
    }),
  );
  a = await review("In Review", a.version);
  a = await review("Published", a.version);
  const latest = await expect(call());
  assert.equal(latest.title, "Revised synthetic scanner");
  assert.equal(latest.pinned_version, initial.version);
  await expect(call({ command: "sync" }));
  assert.equal((await expect(call())).pinned_version, a.version);
  a = await review("Draft", a.version);
  a = await review("In Review", a.version);
  a = await review("Published", a.version);
  const missed = await expect(call());
  assert(missed.pinned_version < missed.version);
  await expect(call({ command: "pin", asset: id }));
  assert.equal((await expect(call())).pinned_version, a.version);
  await expect(call(undefined, foreign), 404);
  await expect(call(undefined, login, randomUUID()), 404);
  await expect(call({ command: "pin", asset: unrelated.user }), 404);
  const correctIssuer = mapping.issuer;
  mapping.issuer = "https://unmapped.invalid";
  await expect(call(), 503);
  mapping.issuer = correctIssuer;
  mapping.permissions = ["events.sync"];
  await expect(call(), 403);
  mapping.permissions.push("reference.read", "reference.pin");
  const org = mapping.organization;
  delete mapping.organization;
  await expect(call(), 503);
  mapping.organization = org;
  await expect(call(undefined, opaque()), 401);
  await review("Archived", a.version);
  await expect(call(), 404);
  assert.equal(
    (await memo.query("select count(*)::int n from memoire_atlas_pins")).rows[0]
      .n,
    1,
  );
  const diag = await expect(
    fetch(mUrl + "&diagnostics=1", {
      headers: {
        authorization: "Bearer " + login,
        "x-memoire-data-workspace": mapping.workspace,
      },
    }),
  );
  assert.equal(diag.retry_count, 0);
  assert(BigInt(diag.checkpoint) > 0n);
  assert(diag.last_success);
  if (!stack) {
    const snapshot = await memo.dumpDataDir();
    const recovered = new PGlite({ loadDataDir: snapshot });
    try {
      for (const table of [
        "memoire_atlas_progress",
        "memoire_atlas_receipts",
        "memoire_atlas_pins",
      ]) {
        const query = "select * from " + table + " order by 1,2,3,4";
        assert.deepEqual(
          (await recovered.query(query)).rows,
          (await memo.query(query)).rows,
        );
      }
    } finally {
      await recovered.close();
    }
  }
  await atlas.tx((c) =>
    c.query("delete from credentials where principal_id=$1", [consumer.user]),
  );
  await expect(call(), 503);
  console.log(
    "PASS isolated Memoire API + real receipt SQL: pin, revision, duplicate receipt, interrupted acknowledgement, withdrawal, archive and identity/workspace denial.",
  );
} finally {
  for (const s of servers) await new Promise((r) => s.close(r));
  await atlas.close();
  await memo.close();
}
