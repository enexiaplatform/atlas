import { openDb } from "../server/db.mjs";
import { application } from "../server/app.mjs";
import { supabaseVerifier } from "../server/identity.mjs";
let handler;
export default async function api(req, res) {
  if (!process.env.ATLAS_DATABASE_URL)
    return res.status(503).json({ error: "Atlas database is not configured" });
  if (!handler) {
    const db = await openDb({
      connectionString: process.env.ATLAS_DATABASE_URL,
    });
    const verifyIdentity =
      process.env.ATLAS_SUPABASE_URL && process.env.ATLAS_SUPABASE_ANON_KEY
        ? supabaseVerifier(
            process.env.ATLAS_SUPABASE_URL,
            process.env.ATLAS_SUPABASE_ANON_KEY,
          )
        : null;
    handler = application(db, { verifyIdentity });
  }
  return handler(req, res);
}
