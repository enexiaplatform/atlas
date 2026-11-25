import { openDb } from "../server/db.mjs";
import { application } from "../server/app.mjs";
import { supabaseVerifier } from "../server/identity.mjs";
import { stagingConfiguration, runtimeReady } from "../server/staging.mjs";
let handler;
export default async function api(req, res) {
  if (!process.env.ATLAS_DATABASE_URL)
    return res.status(503).json({ error: "Atlas database is not configured" });
  if (!handler) {
    const staging = process.env.ATLAS_ENVIRONMENT === "staging";
    if (staging) {
      try {
        stagingConfiguration(process.env);
      } catch {
        return res
          .status(503)
          .json({ error: "Staging configuration unavailable" });
      }
    }
    const db = await openDb({
      connectionString: process.env.ATLAS_DATABASE_URL,
    });
    if (staging && !(await runtimeReady(db).catch(() => false))) {
      await db.close();
      return res.status(503).json({ error: "Staging database unavailable" });
    }
    const verifyIdentity =
      process.env.ATLAS_SUPABASE_URL && process.env.ATLAS_SUPABASE_ANON_KEY
        ? supabaseVerifier(
            process.env.ATLAS_SUPABASE_URL,
            process.env.ATLAS_SUPABASE_ANON_KEY,
          )
        : null;
    handler = application(db, {
      verifyIdentity,
      textOnly: true,
      trustedPeer: process.env.ATLAS_TRUSTED_PROXY_IP,
    });
  }
  return handler(req, res);
}
