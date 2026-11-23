import { z } from "zod";
export const types = [
  "Research Report",
  "Market Landscape",
  "Market Sizing",
  "Customer / Institution Profile",
  "Competitor Profile",
  "Product Profile",
  "Product Comparison",
  "Pricing Intelligence",
  "Scientific Application",
  "Technical Workflow",
  "Business Strategy",
  "Go-To-Market Plan",
  "SOP / Playbook",
  "Decision Record",
  "Lessons Learned",
];
export const domains = [
  "Product & Scientific",
  "Market Intelligence",
  "Competitive Intelligence",
  "GTM & Strategy",
];
export const relations = [
  "SUPPORTS",
  "REFERENCES",
  "COMPETES_WITH",
  "USES",
  "TARGETS",
  "HAS_LAB",
];
export const states = [
  "Draft",
  "In Review",
  "Published",
  "Superseded",
  "Archived",
];
export const verification = [
  "Unverified",
  "Partially Verified",
  "Verified",
  "Disputed",
];
export const templates = {
  "Product Profile": [
    "Manufacturer",
    "Brand",
    "Product name",
    "Model / SKU",
    "Category",
    "Technical specifications",
    "Application",
    "Compatible consumables",
  ],
  "Market Sizing": ["Methodology", "As of", "Sources", "TAM", "SAM", "SOM"],
  "Customer / Institution Profile": [
    "Institution type",
    "Geography",
    "Department",
    "Research applications",
  ],
  "Go-To-Market Plan": [
    "Segment",
    "Positioning",
    "Value proposition",
    "Channel",
    "Assumptions",
  ],
  "Product Comparison": [
    "Comparison criteria",
    "Confirmed facts",
    "Estimates",
    "Hypotheses",
  ],
  "Technical Workflow": [
    "Application",
    "Instruments",
    "Reagents",
    "Consumables",
  ],
};
const line = z.string().trim().min(1).max(240);
export const asset = z
  .object({
    title: line,
    asset_type: z.enum(types),
    domain: line,
    description: z.string().trim().max(14000).default(""),
    structured_content: z
      .record(line, z.string().max(4000))
      .refine((o) => Object.keys(o).length <= 40)
      .default({}),
    collection: line.default("General"),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    classification: z.enum(["Workspace", "Shareable"]).default("Workspace"),
    next_review_at: z.iso.date().nullable().default(null),
  })
  .strict()
  .superRefine((a, c) => {
    if (
      a.asset_type === "Market Sizing" &&
      ["TAM", "SAM", "SOM"].some((k) => a.structured_content[k]?.trim()) &&
      (!a.structured_content.Methodology?.trim() ||
        !z.iso.date().safeParse(a.structured_content["As of"]).success ||
        !a.structured_content.Sources?.trim())
    )
      c.addIssue({
        code: "custom",
        message:
          "Market sizing figures require methodology, ISO date and sources",
      });
  });
export const evidence = z
  .object({
    attachment_id: z.uuid().optional(),
    source: line,
    passage: z.string().trim().min(1).max(5000),
    claim: line,
    kind: z.enum(["Fact", "Estimate", "Hypothesis"]),
  })
  .strict();
export const edge = z
  .object({ related_id: z.uuid(), relation: z.enum(relations) })
  .strict();
export const ref = z
  .object({
    application: z.enum(["memoire", "helm", "forge", "flow", "sentinel"]),
    external_id: line,
  })
  .strict();
export const review = z
  .object({
    lifecycle_status: z.enum(states),
    verification_status: z.enum(verification),
  })
  .strict();
export const filter = z
  .object({
    q: z.string().max(200).default(""),
    domain: z.string().max(240).default(""),
    asset_type: z.string().max(240).default(""),
    tag: z.string().max(60).default(""),
    collection: z.string().max(240).default(""),
    status: z.string().max(60).default(""),
    verification_status: z.string().max(60).default(""),
    sort: z.enum(["updated", "title"]).default("updated"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export const view = z.object({
  name: line,
  filters: filter,
  columns: z
    .array(
      z.enum([
        "domain",
        "asset_type",
        "lifecycle_status",
        "version",
        "collection",
      ]),
    )
    .max(5),
});
export const event = z.object({
  seq: z.union([z.number(), z.string()]),
  event_id: z.uuid(),
  event_type: z.enum(
    [
      "created",
      "updated",
      "published",
      "archived",
      "verification_changed",
      "relationship_changed",
    ].map((x) => "atlas.asset." + x + ".v1"),
  ),
  schema_version: z.literal(1),
  organization_id: z.uuid(),
  workspace_id: z.uuid(),
  asset_id: z.uuid(),
  asset_version: z.number().int().positive(),
  source_application: z.literal("atlas"),
  occurred_at: z.iso.datetime(),
  correlation_id: z.uuid(),
  actor_id: z.uuid(),
});

export const transitions = {
  Draft: ["In Review", "Archived"],
  "In Review": ["Draft", "Published", "Archived"],
  Published: ["Draft", "Superseded", "Archived"],
  Superseded: ["Archived", "Draft"],
  Archived: ["Draft"],
};
