# Operations and release preparation

## Local evaluation

Follow the root README. Setup operates on the local PGlite directory only. It never consults hosted database credentials. The default entry point binds to 127.0.0.1. The generated pilot keys and local database are ignored by Git. Keep confidential data out of the one-click evaluator. To back up a local evaluation, stop the process cleanly and copy the entire local directory to protected storage.

## Dedicated PostgreSQL environment

The following is an operator runbook for an approved isolated environment. No hosted database was provisioned or migrated during implementation.

1. Use a dedicated PostgreSQL database and trusted migration owner able to create roles. Ensure the `atlas` schema and cluster roles `atlas_runtime` and `atlas_gateway` are available for Atlas. Prefer a separate cluster when product owners differ.
2. Take and verify a backup. Apply the scripts in `db/` in numerical order, each in a transaction, against the selected isolated database. The test harness calls `openDb(...).migrate()` and checks repeat application. Migration 003 translates existing durable checkpoints when establishing workspace-local sequences. Stop any consumers during upgrade and reconcile their manifests afterward.
3. Provision application login credentials outside source control. Give the web login membership in `atlas_gateway`. The login must have inherited gateway privileges and permission to SET ROLE atlas_runtime, with no superuser, BYPASSRLS, ownership or migration authority. The native test exercises this arrangement. Keep Atlas schemas outside public PostgREST exposure.
4. Provision the initial organization, workspace, principal and membership using the protected operator connection. `server/db.mjs` exports the transactional `provision` helper. Its initial workspace reviewer is also a workspace administrator. The helper returns an opaque access key for secure handoff and stores only its hash in the database. Additional principals receive explicitly assigned memberships. Never use the synthetic seed to provision a real tenant.
5. Set server-only `ATLAS_DATABASE_URL` to the dedicated gateway login over verified TLS. Optional `ATLAS_SUPABASE_URL` and `ATLAS_SUPABASE_ANON_KEY` configure the trusted issuer adapter. Provision person subjects as the issuer origin, a hash sign and the verified user ID. Set production mode so session cookies require HTTPS.
6. Build the frontend and stage the Vercel handler only after authorization. Verify original API paths, PostgreSQL pooling, cold starts, sign-in, revoke, retrieval and file limits in the actual hosting environment. Git deployments are disabled in the supplied Vercel configuration.

The app supports private originals up to 4 MiB locally. JSON/base64 overhead can exceed a serverless request limit. Test the platform limit and lower the production cap or move to a validated, private direct-upload flow. Add malware quarantine, backup retention, restore drills, observability, rate limiting, key rotation and per-tenant storage quotas before allowing real documents.

## Recovery and rollback

A failed transactional migration rolls back its DDL and data changes. While testing, create a new isolated database rather than dropping a shared schema. For a shipped schema change, pause writers and consumers, preserve the current data, restore the verified pre-change backup into another dedicated database, select the matching application revision, run the isolation and pilot checks, and switch the staging connection after verification. Reconcile receipts, cursors and revisions before resuming writes. Removing schema objects destroys history and is outside the application rollback path.

For individual records, archive through Governance. Reviewers restore to an unverified draft. The export endpoint returns current metadata, links, evidence and file descriptors. Download private originals individually. The JSON export is not a full database backup.
