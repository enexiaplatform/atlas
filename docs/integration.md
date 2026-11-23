# Atlas v1 integration guide

All routes below are relative to `/api/v1/workspaces/{workspace}`. Authenticate with an Atlas-issued bearer credential, or an HTTP-only browser session. The server verifies the principal and membership on every request. API clients may never specify an actor, organization, owner or database role in the payload. The OpenAPI document covers the seven ecosystem operations, event schema, checkpoint acknowledgement and input constraints. The implementation also supports UI-only endpoints for files, views, administration and imports.

| Operation | Request | Check |
|---|---|---|
| Create and publish knowledge | POST /assets, then POST /assets/{id}/review | Create as draft. Request In Review. A reviewer publishes. |
| Retrieve authorized knowledge | GET /assets/{id} | Membership and RLS. Consumers see only current, published, shareable metadata. |
| Reference knowledge | POST /assets/{id}/reference | Editor or reviewer, draft revision, known application, external ID. |
| Query knowledge | GET /assets?q=... | Ranked, scoped results, optional facets, 25 per page. |
| Report a knowledge update | POST /assets/{id}/edit | Editable draft and matching version. |
| Request knowledge review | POST /assets/{id}/review | Allowed transition and verification status. |
| Resolve an external reference | GET /resolve?application=memoire&external_id=... | Only references visible in the authenticated scope. |

Governed POSTs require a UUID `Idempotency-Key`. Commands on existing assets require an integer `If-Match` equal to the displayed revision. Store the key with the submitted command. On timeout retry the identical method, path, payload, key and version. A request with the same key and different content receives HTTP 409. Every new command uses a fresh key. Review conflicts require the caller to reread the current asset.

## Pull delivery

A mutation stores its audit row, snapshot, metadata event and deduplication receipt in the same transaction. A workspace-specific lock serializes concurrent mutations. Sequence allocation belongs to each workspace. Stable event IDs allow consumer-side deduplication. The schema identifies event type, version, actor, application, organization, workspace, asset, revision, correlation and occurrence time. Publication or archive is the primary event on a compound review. Subscribers reread the released revision for its current verification status.

1. Read GET /checkpoint for the authenticated consumer.
2. Fetch GET /events?after={last_seq}. Process ascending sequence numbers, up to 100 per page. Gaps occur when an event is outside the consumer's release permissions.
3. Deduplicate by event ID in the consumer's own durable store. Apply the pinned version and store its receipt in one consumer transaction.
4. POST /checkpoint with the processed sequence number. The checkpoint moves only forward. An interruption before acknowledgement can replay an event.
5. Log failures with workspace and sequence information. Retry the pull with backoff in the consumer scheduler. Reconcile against the current authorized manifest and reauthorize each content read. A release can be withdrawn between a feed read and retrieval.

The reference adapter is read-through. Its manifest supports reconciliation of deleted visibility and its failure callback records delivery errors. The test injects an interruption, observes a replay and confirms acknowledgement. Atlas does not run an outbound scheduler or promise durable downstream application. Multi-page manifests can change while the caller is paging. Consumers retaining references must repeat reconciliation and authorize reads against Atlas.

## Identity and ownership

Operator-provisioned person and service principals have independent credentials. The optional Supabase adapter checks the JWT with the configured issuer's user endpoint, then looks up the exact issuer-origin and subject binding in Atlas. The pilot uses local, time-limited identities. Cross-product SSO, canonical tenant mapping and live receiver consent require platform approval.

Service consumers are deliberately narrow. The release exposes asset metadata and explicitly stored external references. Human-only files, evidence, graph edges, revision history and audit logs remain protected. A consumer that needs evidence passages requires a separate reviewed disclosure contract.

The Memoire test talks only to the isolated Atlas server. It exercises authorized resolution, retrieval, release, withdrawal, update and replay. No credential or remote write adapter for Memoire is involved. All five application statuses are in the [compatibility matrix](compatibility.md).
