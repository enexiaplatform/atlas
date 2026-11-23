import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Upload,
  Bookmark,
  Network,
} from "lucide-react";
import {
  api,
  blank,
  date,
  fileData,
  type Asset,
  type Detail,
  type Filters,
  type Summary,
} from "./data";
import { types, states, verification } from "../shared/contracts.mjs";
import { Modal, Field } from "./editor";
import { Comparison } from "./comparison";
import { Neighborhood } from "./graph";
import { AssetIcon } from "./visual";
const columns = [
  "domain",
  "asset_type",
  "lifecycle_status",
  "version",
  "collection",
];
const labels: Record<string, string> = {
  domain: "Domain",
  asset_type: "Type",
  lifecycle_status: "Status",
  verification_status: "Verification",
  version: "Version",
  collection: "Collection",
};
export function Library({
  page,
  base,
  initial,
  summary,
  open,
  reload,
  editor,
}: {
  page: string;
  base: string;
  initial: Partial<Filters>;
  summary: Summary;
  open: (id: string) => void;
  reload: () => void;
  editor: boolean;
}) {
  type Citation = {
    id: string;
    source_id: string;
    title: string;
    source: string;
    passage: string;
    claim: string;
    kind: string;
    version: number;
    verification_status: string;
  };
  const [citations, setCitations] = useState<Citation[]>([]),
    [preview, setPreview] = useState<{
      count: number;
      records: {
        row: number;
        title: string;
        valid: boolean;
        issues: string[];
      }[];
    }>();
  const [compared, compare] = useState<Asset[]>([]);
  const [f, F] = useState<Filters>({ ...blank, ...initial }),
    [list, L] = useState<{ total: number; items: Asset[] }>(),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [show, S] = useState(false),
    [dialog, D] = useState(""),
    [cols, C] = useState(["domain", "lifecycle_status", "version"]),
    [views, V] = useState<
      { name: string; settings: { filters: Filters; columns: string[] } }[]
    >([]),
    [rev, R] = useState(0),
    [result, A] = useState<Detail[]>([]),
    [focus, G] = useState<Detail>();
  const graph = page === "Knowledge graph",
    assistant = page === "Knowledge assistant",
    database = page === "Intelligence database";
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams(
          Object.entries(f).map(([k, v]) => [k, String(v)]),
        );
        const r = await api<{ total: number; items: Asset[] }>(
          base + "/assets?" + query,
        );
        const sources =
          page === "Research workspace"
            ? await Promise.all(
                r.items
                  .slice(0, 5)
                  .map((a) => api<Detail>(base + "/assets/" + a.id)),
              )
            : [];
        const citations =
          assistant && f.q.trim()
            ? await api<Citation[]>(base + "/passages?" + query)
            : [];
        if (live) {
          setCitations(citations);
          if (graph && !focus && r.items.length) {
            const first = await api<Detail>(base + "/assets/" + r.items[0].id);
            if (!live) return;
            G((old) => old || first);
          }
          L(r);
          A(sources);
          E("");
        }
      } catch (e) {
        if (live) E(String(e));
      }
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [base, f, rev, assistant, page]);
  useEffect(() => {
    let live = true;
    if (database)
      api<typeof views>(base + "/views")
        .then((x) => {
          if (live) V(x);
        })
        .catch((e) => {
          if (live) E(String(e));
        });
    return () => {
      live = false;
    };
  }, [base, rev, database]);
  async function graphFocus(id: string) {
    try {
      G(await api<Detail>(base + "/assets/" + id));
    } catch (e) {
      E(String(e));
    }
  }
  const update = (key: keyof Filters, value: string) =>
    F({ ...f, [key]: value, page: 1 });
  return (
    <section>
      <div className="pagehead">
        <div>
          <div className="eyebrow">
            {page === "Strategy & GTM" ? "Strategy" : "Knowledge workspace"}
          </div>
          <h1>{page}</h1>
        </div>
        {editor && !assistant && !graph && (
          <button
            onClick={() => {
              setPreview(undefined);
              D("Import records");
            }}
          >
            <Upload size={15} /> Import
          </button>
        )}
      </div>
      {assistant && (
        <p className="notice">
          Evidence retrieval is available. No language model is connected.
        </p>
      )}
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search knowledge"
            placeholder={
              assistant
                ? "Search for a claim or source passage…"
                : "Search titles, content and evidence…"
            }
            value={f.q}
            onChange={(e) => update("q", e.target.value)}
          />
        </label>
        <button onClick={() => S(!show)} aria-expanded={show}>
          <SlidersHorizontal size={15} /> Filters
        </button>
        {database && (
          <button onClick={() => D("Save view")}>
            <Bookmark size={15} /> Save view
          </button>
        )}
      </div>
      {show && (
        <div className="filters panel">
          {(
            [
              ["domain", summary.domains.map((d) => d.domain)],
              ["asset_type", types],
              ["status", states],
              ["verification_status", verification],
              ["tag", summary.tags.map((t) => t.tag)],
              ["collection", summary.collections.map((c) => c.collection)],
              ["sort", ["updated", "title"]],
            ] as [keyof Filters, string[]][]
          ).map(([k, options]) => (
            <Field key={k} label={labels[k] || k}>
              <select value={f[k]} onChange={(e) => update(k, e.target.value)}>
                {k !== "sort" && <option value="">All</option>}
                {options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      )}
      {database && (
        <div className="options">
          {columns.map((c) => (
            <label key={c}>
              <input
                type="checkbox"
                checked={cols.includes(c)}
                onChange={() =>
                  C(
                    cols.includes(c)
                      ? cols.filter((x) => x !== c)
                      : [...cols, c],
                  )
                }
              />
              {labels[c]}
            </label>
          ))}
          {views.length > 0 && (
            <select
              aria-label="Saved views"
              defaultValue=""
              onChange={(e) => {
                const v = views.find((x) => x.name === e.target.value);
                if (v) {
                  F(v.settings.filters);
                  C(v.settings.columns);
                }
              }}
            >
              <option value="">Saved views</option>
              {views.map((v) => (
                <option key={v.name}>{v.name}</option>
              ))}
            </select>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {!list ? (
        <p>Loading records…</p>
      ) : (
        <>
          {assistant && f.q.trim() && (
            <section className="panel reader">
              <h2>Cited passages</h2>
              {!citations.length && (
                <p>No supporting passage was found for this query.</p>
              )}
              {citations.map((c) => (
                <blockquote key={c.source_id}>
                  <b>{c.claim}</b>
                  <p>{c.passage}</p>
                  <button className="link" onClick={() => open(c.id)}>
                    {c.source} · {c.title} · v{c.version}
                  </button>
                  <small>
                    {c.kind} · {c.verification_status}
                  </small>
                </blockquote>
              ))}
            </section>
          )}
          {page === "Research workspace" && (
            <div className="panel reader">
              <h2>{assistant ? "Source passages" : "Evidence notebook"}</h2>
              {result.every((a) => !a.evidence.length) && (
                <p>No linked evidence in the first five results.</p>
              )}
              {result.flatMap((a) =>
                a.evidence.map((e) => (
                  <blockquote key={e.id}>
                    <b>{e.claim}</b>
                    <p>{e.passage}</p>
                    <button className="link" onClick={() => open(a.id)}>
                      {e.source} · {a.title}
                    </button>
                    <small>
                      {e.kind} · {a.verification_status}
                    </small>
                  </blockquote>
                )),
              )}
            </div>
          )}
          {graph && (
            <div className="panel reader">
              <div className="eyebrow">
                <Network size={15} /> Relationship explorer
              </div>
              {focus ? (
                <>
                  <h2>{focus.title}</h2>
                  <button className="link" onClick={() => open(focus.id)}>
                    Open asset →
                  </button>
                  <Neighborhood asset={focus} focus={graphFocus} />
                  {!focus.links.length && <p>No edges from this record.</p>}
                </>
              ) : (
                <p>
                  Select a record below to explore its incoming and outgoing
                  relationships.
                </p>
              )}
            </div>
          )}
          {database && compared.length > 0 && (
            <Comparison
              items={compared}
              open={open}
              clear={() => compare([])}
            />
          )}
          <div className="panel tablewrap">
            <table>
              <thead>
                <tr>
                  {database && <th>Compare</th>}
                  <th>Knowledge asset</th>
                  {(database ? cols : ["domain", "lifecycle_status"]).map(
                    (c) => (
                      <th key={c}>{labels[c]}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {list.items.map((a) => (
                  <tr key={a.id}>
                    {database && (
                      <td>
                        <input
                          aria-label={"Compare " + a.title}
                          type="checkbox"
                          checked={compared.some((x) => x.id === a.id)}
                          disabled={
                            compared.length >= 4 &&
                            !compared.some((x) => x.id === a.id)
                          }
                          onChange={(e) =>
                            compare(
                              e.target.checked
                                ? [...compared, a]
                                : compared.filter((x) => x.id !== a.id),
                            )
                          }
                        />
                      </td>
                    )}
                    <td>
                      <button
                        className="assetlink"
                        onClick={() => (graph ? graphFocus(a.id) : open(a.id))}
                      >
                        <AssetIcon domain={a.domain} />
                        <span>
                          {a.title}
                          <small>
                            {a.asset_type} · {date(a.updated_at)}
                          </small>
                        </span>
                      </button>
                    </td>
                    {(database ? cols : ["domain", "lifecycle_status"]).map(
                      (c) => (
                        <td key={c}>
                          {c === "lifecycle_status" ? (
                            <span className="pill">{a.lifecycle_status}</span>
                          ) : (
                            String(a[c as keyof Asset])
                          )}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.total && (
              <p className="empty">No records match these filters.</p>
            )}
            <div className="pagination">
              <small>
                {list.total} records · Page {f.page}
              </small>
              <button
                aria-label="Previous page"
                disabled={f.page === 1}
                onClick={() => F({ ...f, page: f.page - 1 })}
              >
                <ArrowLeft size={14} />
              </button>
              <button
                aria-label="Next page"
                disabled={f.page * 25 >= list.total}
                onClick={() => F({ ...f, page: f.page + 1 })}
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
      {dialog && (
        <Modal title={dialog} onClose={() => D("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              B(true);
              try {
                if (dialog === "Save view") {
                  await api(base + "/views", "POST", {
                    name: form.get("name"),
                    filters: f,
                    columns: cols,
                  });
                } else {
                  if (!preview) {
                    setPreview(
                      await api(base + "/imports/preview", "POST", {
                        ...(await fileData(form.get("file") as File)),
                        authorized: form.has("authorized"),
                      }),
                    );
                    return;
                  }
                  await api(base + "/imports", "POST", {
                    ...(await fileData(form.get("file") as File)),
                    authorized: form.has("authorized"),
                  });
                  reload();
                }
                R(rev + 1);
                D("");
                E("");
              } catch (e) {
                E(String(e));
              } finally {
                B(false);
              }
            }}
          >
            {dialog === "Save view" ? (
              <Field label="View name">
                <input name="name" required />
              </Field>
            ) : (
              <>
                <p>Import up to 200 records as unverified drafts.</p>
                <a href="/institutions.csv" download>
                  Download synthetic CSV template
                </a>
                <Field label="CSV or XLSX file">
                  <input
                    type="file"
                    required
                    name="file"
                    accept=".csv,.xlsx"
                    onChange={() => setPreview(undefined)}
                  />
                  {preview && (
                    <div>
                      <p>
                        {preview.count} rows reviewed ·{" "}
                        {preview.records.filter((x) => !x.valid).length} invalid
                      </p>
                      {preview.records
                        .filter((x) => !x.valid)
                        .slice(0, 10)
                        .map((x) => (
                          <p key={x.row}>
                            Row {x.row} · {x.issues.join(", ")}
                          </p>
                        ))}
                    </div>
                  )}
                </Field>
                <label>
                  <input type="checkbox" required name="authorized" /> I am
                  authorized to import these records.
                </label>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <footer>
              <button
                className="primary"
                disabled={
                  busy ||
                  (dialog === "Import records" &&
                    preview?.records.some((r) => !r.valid))
                }
              >
                {busy
                  ? "Working…"
                  : dialog === "Import records" && !preview
                    ? "Validate import"
                    : dialog}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
