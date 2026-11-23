import { rows } from "./db.mjs";
import { filter } from "../shared/contracts.mjs";
export async function passages(c, raw) {
  const f = filter.parse(raw),
    q = f.q.trim();
  if (!q) return [];
  const hits = await rows(
    c,
    `with sources as (
 select e.asset_id,e.workspace_id,e.id source_id,e.source,e.passage,e.claim,e.kind from evidence_records e
 union all select d.asset_id,d.workspace_id,d.attachment_id,f.name,d.passage,'Extracted document passage','Document' from search_documents d join file_attachments f on (f.workspace_id,f.asset_id,f.id)=(d.workspace_id,d.asset_id,d.attachment_id))
 select a.id,a.title,a.version,a.verification_status,s.source_id,s.source,s.claim,s.kind,s.passage from sources s join knowledge_assets a on (a.workspace_id,a.id)=(s.workspace_id,s.asset_id)
 where a.workspace_id=scope() and ($2='' or a.domain=$2) and ($3='' or a.asset_type=$3) and ($4='' or $4=any(a.tags)) and ($5='' or a.collection=$5) and ($6='' or a.lifecycle_status=$6) and ($7='' or a.verification_status=$7) and to_tsvector('simple',folded(s.claim||' '||s.passage)) @@ plainto_tsquery('simple',folded($1))
 order by ts_rank(to_tsvector('simple',folded(s.claim||' '||s.passage)),plainto_tsquery('simple',folded($1))) desc,s.source_id limit 12`,
    [
      q,
      f.domain,
      f.asset_type,
      f.tag,
      f.collection,
      f.status,
      f.verification_status,
    ],
  );
  const fold = (s) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replaceAll("đ", "d");
  return hits.map((h) => {
    const token = fold(q).split(/\s+/)[0],
      pos = fold(h.passage).indexOf(token),
      start = Math.max(0, pos - 100);
    return {
      ...h,
      passage:
        (start ? "…" : "") +
        h.passage.slice(start, start + 480) +
        (h.passage.length > start + 480 ? "…" : ""),
    };
  });
}
