import test from "node:test";
import assert from "node:assert/strict";
import { supabaseVerifier } from "../server/identity.mjs";
import { withinOfficeLimits } from "../server/files.mjs";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { inspectQuarantined } from "../server/quarantine.mjs";
import { ingressAddress } from "../server/ingress.mjs";
import { stagingConfiguration } from "../server/staging.mjs";
test("verified identity requires the configured issuer, subject and unexpired token", async () => {
  const user = "f08c5270-be3a-41d9-b186-dae5042ad167",
    url = "https://issuer.invalid",
    claims = {
      iss: url + "/auth/v1",
      sub: user,
      exp: Math.floor(Date.now() / 1000) + 30,
    };
  const verify = supabaseVerifier(url, "fixture", async () =>
    Response.json({ id: user }),
  );
  const envelope = (c) =>
    [
      "fixture",
      Buffer.from(JSON.stringify(c)).toString("base64url"),
      "fixture",
    ].join(".");
  assert.equal((await verify(envelope(claims))).expiresAt, claims.exp);
  for (const overrides of [
    { exp: 0 },
    { sub: "wrong" },
    { iss: "https://other.invalid/auth/v1" },
  ])
    await assert.rejects(verify(envelope({ ...claims, ...overrides })), {
      status: 401,
    });
});
test("Office archive entry and expanded-size boundaries", () => {
  const limit = 12 * 1024 * 1024;
  assert(withinOfficeLimits(500, limit));
  assert(!withinOfficeLimits(501, 1));
  assert(!withinOfficeLimits(1, limit + 1));
});
test("scanner approves only validated identical bytes", async () => {
  const bytes = await readFile(
    new URL("../pilot/research-note.docx", import.meta.url),
  );
  const body = { name: "sample.docx", data: bytes.toString("base64") };
  for (const scanner of [
    null,
    { scan: async () => ({ status: "unknown" }) },
    {
      scan: async () => ({
        status: "clean",
        sha256: "different",
        engine: "test",
      }),
    },
  ])
    await assert.rejects(inspectQuarantined(body, scanner));
  const result = await inspectQuarantined(body, {
    scan: async ({ sha256 }) => ({
      status: "clean",
      sha256,
      engine: "fixture",
    }),
  });
  assert.deepEqual(result.buffer, bytes);
});
test("staging configuration requires named database, TLS and HTTPS origin", () => {
  const env = {
    NODE_ENV: "production",
    ATLAS_DATABASE_URL: "postgres://gateway@db/stage?sslmode=verify-full",
    ATLAS_STAGING_DATABASE: "stage",
    ATLAS_SUPABASE_URL: "https://issuer.invalid",
    ATLAS_SUPABASE_ANON_KEY: "fixture",
  };
  stagingConfiguration(env);
  for (const key of Object.keys(env))
    assert.throws(() => stagingConfiguration({ ...env, [key]: "" }));
});
test("reverse proxy overwrites incoming forwarding information with socket address", async () => {
  const address = ingressAddress("127.0.0.1");
  const backend = http.createServer((req, res) => res.end(address(req)));
  const listen = async (server, host) => {
    server.listen(0, host);
    await new Promise((resolve, reject) =>
      server.once("listening", resolve).once("error", reject),
    );
    return server.address().port;
  };
  const port = await listen(backend, "127.0.0.1");
  const proxy = http.createServer(async (req, res) => {
    const upstream = await fetch("http://127.0.0.1:" + port, {
      headers: { "x-forwarded-for": req.socket.remoteAddress },
    });
    res.end(await upstream.text());
  });
  try {
    const front = await listen(proxy, "::");
    for (const [host, expected] of [
      ["127.0.0.1", "127.0.0.1"],
      ["[::1]", "::1"],
    ]) {
      assert.equal(
        await (
          await fetch("http://" + host + ":" + front, {
            headers: { "x-forwarded-for": "192.0.2.1" },
          })
        ).text(),
        expected,
      );
    }
    assert.equal(
      ingressAddress(null)({
        socket: { remoteAddress: "127.0.0.1" },
        headers: { "x-forwarded-for": "192.0.2.1" },
      }),
      "127.0.0.1",
    );
  } finally {
    await Promise.all(
      [backend, proxy].map((s) => new Promise((r) => s.close(r))),
    );
  }
});
