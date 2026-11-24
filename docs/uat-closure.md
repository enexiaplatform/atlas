# Servicebio Synthetic Pilot 2.0 UAT closure

**Synthetic pilot closure — GO** for the four workflows below. **Production deployment — NO-GO** pending hosted verification and operational controls.

## Owner acceptance

| Workflow | User-reported result | Evidence source | Defect status |
|---|---|---|---|
| Product Intelligence | PASS | Product owner feedback | None reported |
| Western Blot Workflow | PASS | Product owner feedback | None reported |
| University & Lab Mapping | PASS | Product owner feedback | None reported |
| GTM Knowledge | PASS | Product owner feedback | None reported |

The owner reported no UX blockers. For each row, the owner’s individual actions were not independently observed. Acceptance covers the four synthetic workflows only. Completion of other guide steps, use of real Servicebio data and hosted behavior remain unverified.

## Regression evidence

Both local checkouts matched their open draft PR heads before testing. Atlas used `8f3b81eab8a237f9b08a95295597029cbceff0ee` and Memoire used `0714c31851ff85044e711c0ccdc190b8b49b8b23`. Previously successful CI is separately recorded for [Atlas](https://github.com/enexiaplatform/atlas/actions/runs/45193280438) and [Memoire](https://github.com/enexiaplatform/memoire/actions/runs/45192749467).

| Closure rerun | Result | Scope |
|---|---|---|
| `npm test` | 19/19 passed | Synthetic scanner evidence and comparison records, bidirectional Western blot relationships, institution imports and market links, lab lookup, GTM assumptions and links, versions, file access, isolation and local restore |
| `npm run test:pg` | 18/18 passed | Shared API and governance cases on disposable native PostgreSQL with a non-owner application login |
| `npm run test:e2e` | 1 browser suite passed | Desktop and mobile, including creation from a product benchmark template, comparison, evidence, history and graph traversal |
| `npm run test:interop` | 1 isolated integration suite passed | Real Memoire receiver and receipt SQL with local Supabase transport fixture. Revision, replay, withdrawal, archive and scope denial |
| `npm run contracts:check` | Passed | Checked generated API schema for drift |
| `npm run build` | Passed | TypeScript and Vite production build. Vite emitted the existing lucide-react client-directive warnings |

## Defect register and functional severity

Confirmed defects: 0

| S0 critical | S1 core workflow unusable | S2 failure with workaround | S3 minor reproducible issue |
|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 |

Product code delta: 0

## Release-readiness matrix

| Release item | Status | Evidence or outstanding gate |
|---|---|---|
| Hosted identity and issuer mapping | UNVERIFIED | Operator approval and validation with the hosted issuer remain outstanding. |
| Hosted Atlas–Memoire integration | UNVERIFIED | Isolated receiver verified. Hosted credentials, workspace mapping and withdrawal require staging validation. |
| Malware quarantine and scanning | BLOCKED | Hosted binary intake requires an approved scanning service. The existing binary gate passed its regression. |
| Hosted file upload constraints | UNVERIFIED | Local size checks and workspace quota passed. Effective hosted ingress limits still need measurement. |
| Local backup and restore | VERIFIED | Disposable PGlite restore preserved original bytes, revision and restricted visibility. |
| Hosted backup and restore | UNVERIFIED | A hosted restore rehearsal is outstanding. |
| Rate limiting behind trusted ingress | UNVERIFIED | Local login throttling passed. Proxy address handling and shared allowances need hosted verification. |
| Operational synchronization ownership | UNVERIFIED | The reviewed evidence identifies no assigned owner for polling, reconciliation and failure response. |
| Advanced document and AI capabilities | DEFERRED | PDF text extraction, OCR, semantic retrieval and model-generated answers remain outside this pilot. |
