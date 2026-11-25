export function stagingConfiguration(env) {
  const db = new URL(env.ATLAS_DATABASE_URL);
  const issuer = new URL(env.ATLAS_SUPABASE_URL);
  if (
    env.NODE_ENV !== "production" ||
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    !db.username ||
    db.pathname.slice(1) !== env.ATLAS_STAGING_DATABASE ||
    !env.ATLAS_STAGING_DATABASE ||
    db.searchParams.get("sslmode") !== "verify-full" ||
    issuer.origin + "/" !== issuer.href ||
    issuer.protocol !== "https:" ||
    !env.ATLAS_SUPABASE_ANON_KEY
  )
    throw Error("Invalid staging configuration");
}
export async function runtimeReady(db) {
  return db.tx(async (c) => {
    const {
      rows: [role],
    } =
      await c.query(`select not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)
   and pg_has_role(current_user,'atlas_gateway','member')
   and not has_schema_privilege(current_user,'atlas','create')
   and not exists(select 1 from pg_roles r where (r.rolsuper or r.rolbypassrls or r.rolcreaterole) and pg_has_role(current_user,r.oid,'member'))
   and not exists(select 1 from pg_database d where d.datname=current_database() and pg_has_role(current_user,d.datdba,'member'))
   and not exists(select 1 from pg_namespace n where n.nspname='atlas' and pg_has_role(current_user,n.nspowner,'member'))
   and not exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname='atlas' and pg_has_role(current_user,t.relowner,'member'))
   and to_regclass('atlas.workspace_templates') is not null as ok from pg_roles where rolname=current_user`);
    if (!role?.ok) return false;
    await c.query("set local role atlas_runtime");
    await c.query("select 1 from atlas.knowledge_assets limit 0");
    return true;
  });
}
