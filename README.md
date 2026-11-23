# Enexia Atlas

Atlas is an independently runnable knowledge vault for evidence, structured records, relationships and governed publication. The Servicebio Vietnam evaluation workspace contains 12 synthetic assets across four domains, a training brochure and two fictional academic institutions. The second organization exercises tenant isolation.

## Open the local pilot

Use Node 24 and npm. From the repository root run:

```sh
npm ci
npm run setup
npm run build
npm start
```

Open [the local workspace](http://127.0.0.1:4173) and choose **Open synthetic Servicebio pilot**. Changes persist under the ignored `.local/` directory. Setup retains existing records. Stop the server before rerunning setup to apply migrations. A filesystem lock prevents simultaneous PGlite processes. Set `ATLAS_LOCAL_DIR` to a fresh directory for another evaluation database.

The local pilot button signs in as a reviewer and workspace administrator on the loopback server. Use this database for synthetic evaluation only. **Workspace access credential** accepts a provisioned personal access key. The setup file `.local/pilot.json` holds separate random, time-limited keys for the reviewer, a read-only Memoire consumer and an unrelated reviewer. Treat it as a secret. A browser session lasts eight hours. Sign out to revoke it.

## Evaluate the product

- **Overview** reads totals, domain coverage, recent releases, overdue dates and review counts from authorized rows.
- **Knowledge library** searches titles, structured fields, tags, evidence and bounded text-file extracts. Filters, collections and paging work together. Select **New asset** to use a typed template.
- **Intelligence database** configures visible columns and saves personal views. **Import** accepts authorized CSV and XLSX files as new unverified drafts in one transaction. The example workbook and CSV are in `pilot/`.
- **Knowledge graph** explores a selected record and its typed neighbors. **Research workspace** opens source passages and their assets. **Strategy & GTM** filters the knowledge library by domain.
- On an asset, **Evidence & files** records claims, passages and source references, privately stores originals and previews text. **Relationships** binds typed edges and external references. **History** exposes immutable snapshots. **Governance** handles review, publication, archive and restoration.
- **Knowledge assistant** retrieves source passages without a model or API key. Generation, semantic retrieval and automatic conflict detection are deferred.
- **Administration** exports metadata, shows integration status and audit trails, and lets a workspace administrator manage names, taxonomy and existing human roles. Initial identities and workspace membership are operator-provisioned.

## Engineering and release

| Evidence | Location |
|---|---|
| Repository audit and compatibility decisions | [Compatibility matrix](docs/compatibility.md) |
| Domain model, ERD and controls | [Architecture and threat model](docs/architecture.md) |
| Authorized API and event delivery | [Integration guide](docs/integration.md) and [OpenAPI 3.1](contracts/atlas-v1.json) |
| Deployment preparation and rollback | [Operations](docs/operations.md) |
| Pilot acceptance and verification | [Evaluation report](docs/evaluation.md) |

```sh
npm run contracts:check
npm test
npm run test:pg
npm run build
npx playwright install chromium
npm run test:e2e
```

The native test starts its own disposable PostgreSQL cluster on loopback. The browser suite runs against a separate in-memory pilot. It can use installed Chrome on Windows or an executable selected by `ATLAS_CHROME`. Screenshots go to `test-results/`. GitHub Actions runs the same checks. The deployment entry point remains unconfigured and Git-triggered Vercel deployments are disabled.

