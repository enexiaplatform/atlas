# Enexia integration compatibility matrix

**Phase 2 update.** Memoire now has a Verified Isolated Integration in its own draft branch. HELM, Sentinel and Forge are planned. Flow is blocked. The matrix below preserves the discovery evidence and Phase 1 baseline. [Current integration and verification report](phase2.md)

Discovery inspected the accessible GitHub organization, default branches, shallow source checkouts and Supabase project inventory before selecting runtime dependencies. A default branch is evidence of source availability. Deployment and inter-application permission mappings require separate validation.

| Dependency | Classification | Evidence and interface | Atlas decision |
|---|---|---|---|
| Memoire commercial API | EXISTS | `memoire@f888f06e5c86108a5509a561bbd72f551bf0cb89`, branch `master`, `docs/architecture/commercial-api-v1.md`, `packages/memoire-sdk`. Bearer-authenticated commercial reads and receive-observation command. | Reuse versioned API, receipt and least-privilege patterns. Memoire's operations stay outside Atlas. |
| Memoire workspace and identity | PARTIAL | Same revision, `api/_workspaceScope.js`, `src/hooks/useAuth.ts`, `docs/architecture/shared-workspaces.md`. Verifies Supabase session and binds the Memoire data workspace. | Atlas verifies issuer subjects and binds independent memberships. A cross-app workspace header alone confers no authority. |
| Memoire webhooks | EXISTS | Same revision, `docs/architecture/commercial-webhooks-v1.md`. Signed, recipient-scoped notifications with durable retries. | Atlas uses a transactional pull feed. Memoire webhook secrets and schemas remain separate. |
| HELM organization and governance | PARTIAL | `helm@428df5fcaad67a3b629ab39570801acaca2c5302`, branch `phase-1-enterprise-ontology`, `supabase/migrations/20260808090000_helm_foundation.sql`, `docs/architecture/security-model.md`. Organization memberships and role predicates. | Reuse database-enforced tenant scoping as a design convention. HELM membership requires explicit mapping. |
| Personal OS private module replicas | EXISTS | `PersonalOS@6fb33555a82d0bd187e17bdb09a16bca83d186c8`, branch `main`, `apps/personal-os-v1/sql/workspace-modules.sql`. Owner-scoped snapshots, hashed publisher credentials. | Keep original writers authoritative. Personal snapshots are outside the pilot import scope. |
| Personal OS UI foundation | PARTIAL | Same revision, `apps/personal-os-v1/design-system/README.md`, `tokens.css`. CSS recipes, native dialogs, keyboard focus and density. | Use the interaction conventions with Atlas-specific typography, color and components. No cross-repository UI package is linked. |
| Forge execution and evidence | EXISTS | `forge@bcecedba0340146e9e49e2a25ea5e3999726e96f`, branch `main`, `docs/architecture/ecosystem-boundaries.md`, `integration/loop3-helm-memory.test.mjs`. Referenced execution episodes and governed intake. | Keep execution commitments, execution evidence and outcomes in Forge. Atlas offers a versioned reference surface. |
| Sentinel discovery | PARTIAL | Accessible implementation inspected. Private repository references are recorded in the local audit supplement. | Atlas can store a reviewed research artifact. Live observations and continuous monitoring remain Sentinel-owned. |
| Flow | UNKNOWN | Organization inventory returned no repository identifiable as Flow. | Require an approved endpoint, identity and workflow contract. |
| Shared application runtime | EXISTS | HELM and Memoire `package.json`, Memoire `vercel.json` and `.github/workflows/ci.yml`. React/Vite, Node verification, SQL migrations and deployable web frontends. | Implement React, TypeScript, Vite, Node API, PostgreSQL, and CI. No cross-product release dependency. |
| Canonical Atlas identity mapping and connection registry | MISSING | Audited sources did not establish an Atlas-specific organization/workspace membership or receiver registration contract. | Atlas-owned IDs and explicit issuer-subject bindings. No inferred mapping by email or display name. |
| Downstream Atlas consumers | PLANNED | Requested ecosystem contracts. No audited evidence establishes deployed Atlas receivers. | Local contract consumer for Memoire. Other receiver implementations remain outstanding. |
| Hosted infrastructure and database ownership | UNKNOWN for Atlas | Read-only inventory returned two Supabase projects, neither named Atlas. Repository SQL demonstrates product ownership conventions. | No target project selected. Keep Atlas in an isolated database/schema with no cross-app database writes. |

## Integration verification

| Application | Verified status | Remaining dependency |
|---|---|---|
| Memoire | **Contract-Tested Adapter** | Isolated consumer reads the real Atlas API. Approve Enexia identity/workspace mapping and implement the receiver inside Memoire. |
| HELM | **Not Implemented** | Agree authorized strategic asset references and governed decision intake. |
| Sentinel | **Not Implemented** | Agree authenticated ingestion, source ownership and input mapping. |
| Forge | **Not Implemented** | Bind pinned Atlas versions to an authorized execution record. |
| Flow | **Blocked by Missing Dependency** | Identify the workflow owner and implemented API. |

Atlas owns the editable knowledge record, source passage, publication revision and outgoing relationship. Incoming references never grant a remote application permission to change a commercial, management or execution record.
