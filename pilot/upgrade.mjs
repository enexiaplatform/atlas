import { scoped } from "../server/db.mjs";
import { create, change, detail } from "../server/vault.mjs";
const packs = [
  [
    "Product & Scientific",
    "Product Profile",
    ["Product profile"],
    [
      "Manufacturer",
      "Brand",
      "Product name",
      "Model / SKU",
      "Category",
      "Technical specifications",
      "Application",
      "Workflow compatibility",
      "Related consumables",
      "Competitor models",
      "Source references",
      "Last verified date",
    ],
  ],
  [
    "Market Intelligence",
    "Customer / Institution Profile",
    [
      "University profile",
      "Research institute profile",
      "Laboratory / department",
    ],
    [
      "Geography",
      "Institution type",
      "Research application",
      "Parent institution",
      "Evidence needed",
    ],
  ],
  [
    "Market Intelligence",
    "Market Landscape",
    [
      "Market landscape",
      "Scientific application demand",
      "Research market segmentation",
    ],
    [
      "Geography",
      "Segment",
      "Research application",
      "Observed demand",
      "Assumptions",
    ],
  ],
  [
    "Market Intelligence",
    "Market Sizing",
    ["TAM / SAM / SOM"],
    ["TAM", "SAM", "SOM", "Methodology", "As of", "Sources"],
  ],
  [
    "Competitive Intelligence",
    "Product Comparison",
    [
      "Product benchmark",
      "Specification comparison",
      "Portfolio overlap",
      "Differentiation matrix",
    ],
    [
      "Comparison criteria",
      "Confirmed specifications",
      "Estimates",
      "Hypotheses",
      "Source references",
    ],
  ],
  [
    "Competitive Intelligence",
    "Competitor Profile",
    ["Competitor profile", "Distributor intelligence"],
    ["Portfolio", "Geography", "Confirmed facts", "Estimates", "Hypotheses"],
  ],
  [
    "Competitive Intelligence",
    "Pricing Intelligence",
    ["Pricing intelligence"],
    [
      "Currency",
      "Date",
      "Source",
      "Confirmed price",
      "Estimate",
      "Assumptions",
    ],
  ],
  [
    "GTM & Strategy",
    "Go-To-Market Plan",
    [
      "Market entry",
      "Segment prioritization",
      "Product positioning",
      "Scientific value proposition",
      "Distributor strategy",
      "GTM assumptions",
      "Competitive positioning",
    ],
    [
      "Segment",
      "Positioning",
      "Value proposition",
      "Channel",
      "Assumptions",
      "Evidence needed",
    ],
  ],
];
export async function upgradePilot(db, pilot) {
  return db.tx(async (c) => {
    const { admin, ids } = pilot;
    // The template insert is also the transaction marker. Failed upgrades roll back in full.
    const marker = await c.query(
      "select 1 from workspace_templates where workspace_id=$1 and name=$2",
      [admin.workspace, "Product profile"],
    );
    if (marker.rows.length) return;
    for (const [domain, type, names, fields] of packs)
      for (const name of names)
        await c.query(
          "insert into workspace_templates values($1,$2,$3,$4,$5)",
          [admin.workspace, name, type, domain, fields],
        );
    await scoped(c, admin.user, admin.workspace, true);
    for (const term of [
      "Histology and tissue processing",
      "Molecular biology",
      "Cell biology",
      "Southern Vietnam",
      "Central Vietnam",
      "Northern Vietnam",
    ])
      await c.query(
        "insert into knowledge_taxonomies values(scope(),gen_random_uuid(),'Tag',$1) on conflict do nothing",
        [term],
      );
    const add = (title, asset_type, domain, structured_content) =>
      create(c, admin.org, {
        title,
        asset_type,
        domain,
        description: "Fictional research evaluation record.",
        collection: "Pilot research",
        tags: ["Synthetic"],
        structured_content,
      });
    const lab = await add(
      "Phòng nghiên cứu Minh An (synthetic)",
      "Customer / Institution Profile",
      "Market Intelligence",
      {
        Geography: "Southern Vietnam",
        "Institution type": "University laboratory",
      },
    );
    const app = await add(
      "Histology and tissue processing",
      "Scientific Application",
      "Product & Scientific",
      { Application: "Academic histology" },
    );
    for (const name of ["Molecular biology", "Cell biology"])
      await add(name, "Scientific Application", "Product & Scientific", {
        Application: "Academic research",
      });
    for (const [source, target, relation] of [
      [lab.id, app.id, "USES"],
      [app.id, ids.scanner, "USES"],
      [lab.id, ids.institution0, "REFERENCES"],
      [lab.id, ids.market, "REFERENCES"],
    ]) {
      const a = await detail(c, source);
      await change(c, "reviewer", source, a.version, "relationship", {
        related_id: target,
        relation,
      });
    }
  });
}
