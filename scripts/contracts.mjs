import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import * as s from "../shared/contracts.mjs";
const uuid = z.uuid(),
  version = z.number().int().positive();
const schemas = {
  AssetInput: s.asset,
  Review: s.review,
  Evidence: s.evidence,
  Relationship: s.edge,
  ExternalReference: s.ref,
  Query: s.filter,
  Event: s.event,
  View: s.view,
  AssetRecord: z
    .object({
      id: uuid,
      workspace_id: uuid,
      organization_id: uuid,
      title: z.string(),
      asset_type: z.enum(s.types),
      domain: z.string(),
      description: z.string(),
      structured_content: z.record(z.string(), z.string()),
      owner_id: uuid,
      lifecycle_status: z.enum(s.states),
      classification: z.enum(["Workspace", "Shareable"]),
      verification_status: z.enum(s.verification),
      version,
      tags: z.array(z.string()),
      collection: z.string(),
      next_review_at: z.iso.date().nullable(),
      created_at: z.iso.datetime(),
      updated_at: z.iso.datetime(),
      reviewed_at: z.iso.datetime().nullable(),
    })
    .passthrough(),
  ReferenceResolution: z.array(
    z.object({
      asset_id: uuid,
      application: z.string(),
      external_id: z.string(),
    }),
  ),
  Checkpoint: z.object({
    seq: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  }),
};
const ref = (name) => ({ $ref: "#/components/schemas/" + name });
const params = (names) =>
  names.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
const base = "/api/v1/workspaces/{workspace}",
  paths = {};
function operation(method, path, id, body, result, description, write = false) {
  const parameters = params(
    path.includes("{id}") ? ["workspace", "id"] : ["workspace"],
  );
  if (write) {
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", format: "uuid" },
    });
    if (path.includes("{id}"))
      parameters.push({
        name: "If-Match",
        in: "header",
        required: true,
        schema: { type: "integer", minimum: 1 },
      });
  }
  const op = {
    operationId: id,
    description,
    parameters,
    responses: {
      200: {
        description: "Authorized result",
        content: { "application/json": { schema: result } },
      },
      401: { description: "Sign in required" },
      403: { description: "Insufficient role" },
      404: { description: "Unavailable" },
      409: { description: "Version or receipt conflict" },
      422: { description: "Invalid input" },
    },
  };
  if (body)
    op.requestBody = {
      required: true,
      content: { "application/json": { schema: ref(body) } },
    };
  (paths[base + path] ??= {})[method] = op;
  return op;
}
const listing = operation(
  "get",
  "/assets",
  "queryKnowledge",
  null,
  {
    type: "object",
    required: ["items", "total"],
    properties: {
      items: { type: "array", items: ref("AssetRecord") },
      total: { type: "integer" },
    },
  },
  "Permission-filtered search with 25 records per page.",
);
const query = z.toJSONSchema(s.filter).properties;
for (const [name, schema] of Object.entries(query))
  listing.parameters.push({ name, in: "query", schema });
operation(
  "post",
  "/assets",
  "createKnowledgeDraft",
  "AssetInput",
  ref("AssetRecord"),
  "Creates an unverified draft.",
  true,
);
operation(
  "get",
  "/assets/{id}",
  "retrieveAuthorizedAsset",
  null,
  ref("AssetRecord"),
  "Returns scoped detail, available links and source records.",
);
operation(
  "post",
  "/assets/{id}/edit",
  "reportKnowledgeUpdate",
  "AssetInput",
  ref("AssetRecord"),
  "Requires editable draft.",
  true,
);
operation(
  "post",
  "/assets/{id}/review",
  "requestReviewOrPublish",
  "Review",
  ref("AssetRecord"),
  "Request review with In Review. Publish with Published as reviewer after review submission.",
  true,
);
for (const [op, body] of [
  ["reference", "ExternalReference"],
  ["relationship", "Relationship"],
  ["evidence", "Evidence"],
])
  operation(
    "post",
    "/assets/{id}/" + op,
    op + "KnowledgeAsset",
    body,
    ref("AssetRecord"),
    "Adds to the current draft and records a revision.",
    true,
  );
const resolve = operation(
  "get",
  "/resolve",
  "resolveExternalReference",
  null,
  ref("ReferenceResolution"),
  "References only, subject to workspace and release policy.",
);
for (const name of ["application", "external_id"])
  resolve.parameters.push({
    name,
    in: "query",
    required: true,
    schema: { type: "string" },
  });
const feed = operation(
  "get",
  "/events",
  "readUpdates",
  null,
  { type: "array", items: ref("Event") },
  "Ordered metadata feed. Consumers see current released versions.",
);
feed.parameters.push({
  name: "after",
  in: "query",
  schema: { type: "integer", minimum: 0 },
});
operation(
  "post",
  "/checkpoint",
  "acknowledgeUpdate",
  "Checkpoint",
  { type: "object", properties: { acknowledged: { type: "integer" } } },
  "Monotonic, per-principal acknowledgement of a visible event.",
);
const document = {
  openapi: "3.1.0",
  info: { title: "Enexia Atlas integration API", version: "1.0.0" },
  security: [{ bearer: [] }, { session: [] }],
  components: {
    securitySchemes: {
      bearer: { type: "http", scheme: "bearer" },
      session: { type: "apiKey", in: "cookie", name: "atlas_session" },
    },
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([k, v]) => [
        k,
        z.toJSONSchema(v, { io: "input", unrepresentable: "any" }),
      ]),
    ),
  },
  paths,
};
const out = new URL("../contracts/atlas-v1.json", import.meta.url),
  data = JSON.stringify(document, null, 2) + "\n";
if (process.argv.includes("--check"))
  assert.equal(
    (await readFile(out, "utf8")).replaceAll("\r\n", "\n"),
    data,
    "Regenerate contracts with npm run contracts",
  );
else {
  await mkdir(new URL("../contracts/", import.meta.url), { recursive: true });
  await writeFile(out, data);
}
