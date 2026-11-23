import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, FileText, Link2 } from "lucide-react";
import { api, date, fileData, type Detail, type Asset } from "./data";
import { Field, Editor } from "./editor";
import { states, verification, relations } from "../shared/contracts.mjs";
export function AssetDetail({
  id,
  base,
  role,
  open,
  back,
  changed,
}: {
  id: string;
  base: string;
  role: string;
  open: (id: string) => void;
  back: () => void;
  changed: () => void;
}) {
  const [a, set] = useState<Detail>(),
    [error, err] = useState(""),
    [edit, setEdit] = useState(false),
    [tab, T] = useState("Overview"),
    [busy, B] = useState(false),
    [versions, V] = useState<
      { version: number; snapshot: Detail; created_at: string }[]
    >([]),
    [targets, S] = useState<Asset[]>([]),
    [term, Q] = useState(""),
    [preview, P] = useState("");
  useEffect(() => {
    let live = true;
    api<Detail>(base + "/assets/" + id)
      .then((x) => {
        if (live) set(x);
      })
      .catch((e) => {
        if (live) err(e.message);
      });
    return () => {
      live = false;
    };
  }, [base, id]);
  useEffect(() => {
    let live = true;
    if (tab === "History")
      api<typeof versions>(base + "/assets/" + id + "/versions")
        .then((x) => {
          if (live) V(x);
        })
        .catch((e) => {
          if (live) err(e.message);
        });
    if (tab === "Relationships")
      api<{ items: Asset[] }>(base + "/assets?q=" + encodeURIComponent(term))
        .then((x) => {
          if (live) S(x.items);
        })
        .catch((e) => {
          if (live) err(e.message);
        });
    return () => {
      live = false;
    };
  }, [tab, term, id, base, a?.version]);
  if (!a)
    return (
      <section>
        <button onClick={back}>Back</button>
        <p role="status">{error || "Loading asset…"}</p>
      </section>
    );
  const item = a,
    can = ["editor", "reviewer"].includes(role),
    draft =
      can &&
      a.lifecycle_status === "Draft" &&
      a.verification_status === "Unverified";
  async function mutate(op: string, input: unknown) {
    const updated = await api<Detail>(
      base + "/assets/" + id + "/" + op,
      "POST",
      input,
      item.version,
    );
    set(updated);
    changed();
    err("");
  }
  async function form(e: FormEvent<HTMLFormElement>, op: string) {
    e.preventDefault();
    const f = e.currentTarget,
      data = new FormData(f);
    B(true);
    try {
      await mutate(
        op,
        op === "attachment"
          ? await fileData(data.get("file") as File)
          : Object.fromEntries(
              Array.from(data).filter(([k, v]) => k !== "attachment_id" || v),
            ),
      );
      f.reset();
    } catch (e) {
      err(String(e));
    } finally {
      B(false);
    }
  }
  return (
    <section>
      <button className="link" onClick={back}>
        <ArrowLeft size={15} /> Workspace
      </button>
      <div className="pagehead">
        <div>
          <div className="eyebrow">{a.asset_type}</div>
          <h1>{a.title}</h1>
          <p>
            {a.domain} · {a.collection} · Version {a.version}
          </p>
        </div>
        {draft && <button onClick={() => setEdit(true)}>Edit asset</button>}
      </div>
      <div className="pills">
        <span className="pill">{a.lifecycle_status}</span>
        <span>{a.verification_status}</span>
        <span>{a.classification}</span>
        {a.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="tabs">
        {[
          "Overview",
          "Evidence & files",
          "Relationships",
          "History",
          "Governance",
        ].map((t) => (
          <button
            key={t}
            aria-current={t === tab ? "page" : undefined}
            onClick={() => T(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="panel reader">
        {tab === "Overview" && (
          <>
            <h2>Summary</h2>
            <p>{a.description || "No summary yet."}</p>
            <dl>
              {Object.entries(a.structured_content).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "Unknown"}</dd>
                </div>
              ))}
              <div>
                <dt>Owner ID</dt>
                <dd>{a.owner_id}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{date(a.updated_at)}</dd>
              </div>
            </dl>
          </>
        )}
        {tab === "Evidence & files" && (
          <>
            <h2>Evidence records</h2>
            {a.evidence.map((e) => (
              <blockquote key={e.id}>
                <b>{e.claim}</b>
                <p>{e.passage}</p>
                <small>
                  {e.source} · {e.kind}
                </small>
                {e.attachment_id && (
                  <a href={base + "/files/" + e.attachment_id} download>
                    Download cited file
                  </a>
                )}
              </blockquote>
            ))}
            {!a.evidence.length && <p>No evidence linked.</p>}
            {draft && (
              <form onSubmit={(e) => form(e, "evidence")}>
                <div className="pair">
                  {["source", "claim"].map((k) => (
                    <Field key={k} label={k}>
                      <input name={k} required />
                    </Field>
                  ))}
                </div>
                {a.attachments.length > 0 && (
                  <Field label="Supporting attachment">
                    <select name="attachment_id">
                      <option value="">External source</option>
                      {a.attachments.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Source passage">
                  <textarea name="passage" required />
                </Field>
                <Field label="Claim type">
                  <select name="kind">
                    <option>Fact</option>
                    <option>Estimate</option>
                    <option>Hypothesis</option>
                  </select>
                </Field>
                <button disabled={busy}>Link evidence</button>
              </form>
            )}
            <h2>Attachments</h2>
            {a.attachments.map((f) => (
              <div className="file" key={f.id}>
                <FileText size={16} />
                <a href={base + "/files/" + f.id} download>
                  {f.name}
                </a>
                <small>{f.size.toLocaleString()} bytes</small>
                {f.media_type === "text/plain" && (
                  <button
                    onClick={async () => {
                      try {
                        const r = await fetch(base + "/files/" + f.id);
                        if (!r.ok) throw Error("File unavailable");
                        P(await r.text());
                      } catch (e) {
                        err(String(e));
                      }
                    }}
                  >
                    Preview
                  </button>
                )}
              </div>
            ))}
            {preview && <pre>{preview}</pre>}
            {draft && (
              <form onSubmit={(e) => form(e, "attachment")}>
                <Field label="Private attachment · 4 MiB maximum">
                  <input
                    required
                    type="file"
                    name="file"
                    accept=".txt,.pdf,.docx,.pptx,.xlsx"
                  />
                </Field>
                <button disabled={busy}>Upload file</button>
              </form>
            )}
          </>
        )}
        {tab === "Relationships" && (
          <>
            <h2>Linked knowledge</h2>
            {a.links.length === 0 && <p>No relationships recorded.</p>}
            {a.links.map((l) => (
              <button
                className="row"
                key={l.id + l.relation + l.outgoing}
                onClick={() => open(l.id)}
              >
                <Link2 size={16} />
                <span>
                  {l.title}
                  <small>
                    {l.outgoing ? "Outgoing" : "Incoming"} · {l.relation}
                  </small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {draft && (
              <form onSubmit={(e) => form(e, "relationship")}>
                <Field label="Find target asset">
                  <input value={term} onChange={(e) => Q(e.target.value)} />
                </Field>
                <div className="pair">
                  <Field label="Target">
                    <select required name="related_id">
                      {targets
                        .filter((t) => t.id !== id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Relationship">
                    <select name="relation">
                      {relations.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <button disabled={busy}>Create link</button>
              </form>
            )}
            <h2>External references</h2>
            {a.references.map((r) => (
              <p key={r.application + r.external_id}>
                {r.application} · {r.external_id}
              </p>
            ))}
            {draft && (
              <form onSubmit={(e) => form(e, "reference")}>
                <Field label="Application">
                  <select name="application">
                    {["memoire", "helm", "forge", "flow", "sentinel"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="External record ID">
                  <input name="external_id" required />
                </Field>
                <button disabled={busy}>Add reference</button>
              </form>
            )}
          </>
        )}
        {tab === "History" && (
          <>
            <h2>Version history</h2>
            {versions.map((v) => (
              <details key={v.version}>
                <summary>
                  Version {v.version} · {v.snapshot.lifecycle_status} ·{" "}
                  {date(v.created_at)}
                </summary>
                <pre>{JSON.stringify(v.snapshot, null, 2)}</pre>
              </details>
            ))}
          </>
        )}
        {tab === "Governance" && (
          <>
            <h2>Review & publication</h2>
            <p>Next review · {a.next_review_at || "Unscheduled"}</p>
            {can && (
              <form key={a.version} onSubmit={(e) => form(e, "review")}>
                <Field label="Lifecycle">
                  <select
                    name="lifecycle_status"
                    defaultValue={a.lifecycle_status}
                  >
                    {states.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Verification">
                  <select
                    name="verification_status"
                    defaultValue={a.verification_status}
                  >
                    {verification.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <button disabled={busy}>Save review</button>
              </form>
            )}
          </>
        )}
      </div>
      {edit && (
        <Editor
          base={base}
          initial={a}
          close={() => setEdit(false)}
          save={(x) => mutate("edit", x)}
        />
      )}
    </section>
  );
}
