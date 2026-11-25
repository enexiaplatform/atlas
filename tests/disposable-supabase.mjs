import { execFileSync } from "node:child_process";
import pg from "pg";
import { randomUUID } from "node:crypto";

// Only use the stack initialized in a fresh CI runner directory. Ignore external URLs.
export function disposableSupabase(directory) {
  const status = JSON.parse(
    execFileSync("supabase", ["status", "--output", "json"], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  if (
    status.API_URL !== "http://127.0.0.1:54321" ||
    new URL(status.DB_URL).origin !== "null" ||
    new URL(status.DB_URL).host !== "127.0.0.1:54322"
  )
    throw Error("Expected the disposable loopback stack");
  const pool = new pg.Pool({ connectionString: status.DB_URL });
  const query = (...args) => pool.query(...args);
  process.env.SUPABASE_URL = status.API_URL;
  process.env.VITE_SUPABASE_ANON_KEY = status.ANON_KEY;
  async function signup() {
    const response = await fetch(status.API_URL + "/auth/v1/signup", {
      method: "POST",
      headers: { apikey: status.ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        email: randomUUID() + "@example.org",
        password: randomUUID() + "aA1!",
      }),
    });
    if (!response.ok)
      throw Error("Disposable signup returned " + response.status);
    const user = await response.json();
    if (!user.access_token) throw Error("Expected confirmed disposable signup");
    return { id: user.user.id, token: user.access_token };
  }
  async function reload() {
    await query(
      "alter role authenticator set pgrst.db_pre_request='memoire_private.apply_workspace_data_scope'",
    );
    await query("notify pgrst,'reload config'");
    await query("notify pgrst,'reload schema'");
    for (let i = 0; i < 40; i++) {
      const response = await fetch(status.API_URL + "/rest/v1/", {
        headers: {
          apikey: status.ANON_KEY,
          authorization: "Bearer " + status.SERVICE_ROLE_KEY,
        },
      });
      if (
        response.ok &&
        (await response.text()).includes("memoire_atlas_progress_op")
      )
        return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw Error("Disposable Data API schema did not reload");
  }
  return { query, exec: query, close: () => pool.end(), signup, reload };
}
