import { openDb } from "../server/db.mjs";
import { application } from "../server/app.mjs";
import { supabaseVerifier } from "../server/identity.mjs";
import { stagingConfiguration, runtimeReady } from "../server/staging.mjs";

let initializing;
async function initialize(env) {
  const staging = env.ATLAS_ENVIRONMENT === "staging";
  if (staging) stagingConfiguration(env);
  if (!env.ATLAS_DATABASE_URL) throw Error("Missing database configuration");
  const verifyIdentity =
    env.ATLAS_SUPABASE_URL && env.ATLAS_SUPABASE_ANON_KEY
      ? supabaseVerifier(env.ATLAS_SUPABASE_URL, env.ATLAS_SUPABASE_ANON_KEY)
      : null;
  const db = await openDb({ connectionString: env.ATLAS_DATABASE_URL });
  try {
    if (staging && !(await runtimeReady(db)))
      throw Error("Unexpected staging role or schema");
    return application(db, {
      verifyIdentity,
      textOnly: true,
      trustedPeer: env.ATLAS_TRUSTED_PROXY_IP,
    });
  } catch (error) {
    await db.close();
    throw error;
  }
}
export default async function api(req, res) {
  if (req.method === "GET" && req.url.split("?")[0] === "/api/health/live") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ live: true });
  }
  initializing ??= initialize(process.env).catch((error) => {
    initializing = undefined;
    throw error;
  });
  let handler;
  try {
    handler = await initializing;
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(503)
      .json({ error: "Atlas configuration or database unavailable" });
  }
  return handler(req, res);
}
