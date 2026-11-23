# Servicebio Vietnam pilot evaluation

This is the original 12-record baseline. Pilot 2.0 upgrades it to 16 synthetic assets. [Current nontechnical UAT guide](pilot-uat.md) · [Continuation QA](phase2.md)

The pilot uses synthetic material prepared for this repository. It contains no real SKU, specification, price, market size, institution buying intent or CRM records. The scope is universities and research institutes, with a Southern Vietnam emphasis. The initial SQL dashboard reports 12 assets, four domains, one published asset and two pending reviews.

| Scenario | How to exercise it | Verified outcome |
|---|---|---|
| A · Product intelligence | Search for scanner, open Digital slide scanner, then Evidence & files and Relationships. Open the comparison record. | Published sample carries an explicit competing profile and a demonstration claim bound to the training brochure. The downloaded original contains the cited passage. Searching an indexed brochure term also finds the profile. |
| B · Workflow | Select Western blot workflow in Knowledge graph. Follow a reagent, instrument, consumable or application edge. | All four neighbors persist. Incoming navigation links back to the workflow. Browser test follows the transfer membrane edge. |
| C · Institution mapping | Import either pilot/institutions.csv or pilot/institutions.xlsx through the library. Confirm material authorization. | Both formats create two unverified draft profiles with tags and evidence. Replaying an identical API command preserves the original IDs. An invalid row rolls back the batch. |
| D · Strategy | Open Vietnam research-market entry plan from Strategy & GTM. Inspect assumptions and Relationships. | Plan links market, scanner and comparison records. Lifecycle is In Review and factual status is Unverified. |
| E · Memoire contract | Run the HTTP contract suite. | Isolated service principal resolves the released scanner, consumes revisions, retries after interruption, loses access on withdrawal and sees a higher version after republication. It cannot write a knowledge asset. |
| F · Tenant isolation | Run the same suite with the unrelated organization and its own valid credential. | Direct IDs, foreign-workspace routes, text search, edges, files and event feed stay isolated. Non-owner SQL confirms policies across nine domain tables. |

## Verification record

| Check | Result |
|---|---|
| TypeScript and production Vite build | Passed. The bundler advises about ignored client directives in lucide-react. |
| Generated JSON API contracts | Schema drift check passed. |
| PGlite HTTP, governance, contract and SQL suite | 13 passed. |
| Native PostgreSQL HTTP, governance, contract and RLS suite | Same 13 passed with a non-owner application login. |
| Browser E2E | Passed at 1440×960 and 390×844. Sign-in, create/edit, evidence capture, private upload, text preview, history, search, saved views, graph traversal, taxonomy and mobile navigation. No unexpected console warnings or errors. |
| Host browser | Opened loopback preview, entered the synthetic pilot and navigated to its populated library. |
| Package advisory check | npm audit --omit=dev reported zero known vulnerabilities at verification time. |

Screenshots in [qa](qa/) show only the isolated synthetic test workspace. The mobile screenshot includes the one synthetic record created during E2E. Evaluation did not exercise a hosted issuer, a production database, a real Servicebio dataset, real sibling receivers, load at enterprise scale or public deployment.
