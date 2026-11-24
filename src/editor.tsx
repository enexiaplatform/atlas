import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { X } from "lucide-react";
import {
  asset as assetSchema,
  types,
  domains,
  templates,
} from "../shared/contracts.mjs";
import { api, type Asset } from "./data";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-label={title} onCancel={onClose}>
      <header>
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}
export function Editor({
  initial,
  save,
  close,
  base,
}: {
  base: string;
  initial?: Asset;
  save: (x: unknown) => Promise<void>;
  close: () => void;
}) {
  type Preset = {
    name: string;
    fields: string[];
    asset_type: string;
    domain: string;
  };
  const [presets, setPresets] = useState<Preset[]>([]),
    [preset, setPreset] = useState<Preset>();
  const [domain, setDomain] = useState(initial?.domain || domains[0]);
  const [terms, setTerms] = useState<{ kind: string; name: string }[]>([]);
  useEffect(() => {
    api<Preset[]>(base + "/templates")
      .then(setPresets)
      .catch((e) => setError(String(e)));
    api<typeof terms>(base + "/taxonomy")
      .then(setTerms)
      .catch((e) => setError(String(e)));
  }, [base]);
  const [type, setType] = useState(initial?.asset_type || "Research Report"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>(
    initial?.structured_content || {},
  );
  const keys = Array.from(
    new Set([
      ...(preset?.fields || templates[type as keyof typeof templates] || []),
      ...Object.keys(fields),
    ]),
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const value = assetSchema.parse({
        title: f.get("title"),
        asset_type: type,
        domain: f.get("domain"),
        description: f.get("description"),
        structured_content: fields,
        classification: f.get("classification"),
        collection: f.get("collection"),
        tags: String(f.get("tags"))
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        next_review_at: f.get("next_review_at") || null,
      });
      await save(value);
      close();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initial ? "Edit asset" : "Create knowledge asset"}
      onClose={close}
    >
      <form onSubmit={submit}>
        {!initial && presets.length > 0 && (
          <Field label="Workspace template">
            <select
              value={preset?.name || ""}
              onChange={(e) => {
                const p = presets.find((x) => x.name === e.target.value);
                setPreset(p);
                if (p) {
                  setType(p.asset_type);
                  setDomain(p.domain);
                }
              }}
            >
              <option value="">Choose a template</option>
              {presets.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Title">
          <input
            name="title"
            required
            maxLength={240}
            autoFocus
            defaultValue={initial?.title}
          />
        </Field>
        <div className="pair">
          <Field label="Asset type">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPreset(undefined);
              }}
            >
              {types.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Domain">
            <input
              list="domain-options"
              name="domain"
              required
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <datalist id="domain-options">
              {Array.from(
                new Set([
                  ...domains,
                  ...terms
                    .filter((t) => t.kind === "Domain")
                    .map((t) => t.name),
                ]),
              ).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Summary">
          <textarea name="description" defaultValue={initial?.description} />
        </Field>
        <div className="pair">
          <Field label="Collection">
            <datalist id="collection-options">
              {terms
                .filter((t) => t.kind === "Collection")
                .map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
            </datalist>
            <input
              list="collection-options"
              required
              name="collection"
              defaultValue={initial?.collection || "General"}
            />
          </Field>
          <Field label="Tags (comma separated)">
            <datalist id="tag-options">
              {terms
                .filter((t) => t.kind === "Tag")
                .map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
            </datalist>
            <input
              list="tag-options"
              name="tags"
              defaultValue={initial?.tags.join(", ")}
            />
          </Field>
          <Field label="Classification">
            <select
              name="classification"
              defaultValue={initial?.classification}
            >
              <option>Workspace</option>
              <option>Shareable</option>
            </select>
          </Field>
          <Field label="Next review">
            <input
              type="date"
              name="next_review_at"
              defaultValue={initial?.next_review_at || ""}
            />
          </Field>
        </div>
        {keys.map((k) => (
          <Field key={k} label={k}>
            <input
              value={fields[k] || ""}
              onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
            />
          </Field>
        ))}
        <Field label="Add structured field">
          <input
            placeholder="Field name · press Enter"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const k = e.currentTarget.value.trim();
                if (k) {
                  setFields({ ...fields, [k]: fields[k] || "" });
                  e.currentTarget.value = "";
                }
              }
            }}
          />
        </Field>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : initial ? "Save revision" : "Create draft"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
