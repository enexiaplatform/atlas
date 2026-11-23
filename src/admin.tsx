import { useEffect, useState } from "react";
import { Field } from "./editor";
import { api } from "./data";
type Control = {
  admin: boolean;
  members: { id: string; name: string; role: string }[];
  terms: { id: string; kind: string; name: string }[];
  log: { id: string; action: string; detail: string }[];
};
export function WorkspaceControls({
  base,
  updated,
}: {
  base: string;
  updated: () => void;
}) {
  const [data, S] = useState<Control>(),
    [err, E] = useState(""),
    [r, R] = useState(0),
    [busy, B] = useState(false);
  useEffect(() => {
    let live = true;
    api<Control>(base + "/settings")
      .then((x) => {
        if (live) S(x);
      })
      .catch((e) => {
        if (live) E(String(e));
      });
    return () => {
      live = false;
    };
  }, [base, r]);
  async function save(form: HTMLFormElement, path: string) {
    B(true);
    try {
      await api(base + path, "POST", Object.fromEntries(new FormData(form)));
      form.reset();
      R(r + 1);
      updated();
      E("");
    } catch (e) {
      E(String(e));
    } finally {
      B(false);
    }
  }
  return (
    <div className="panel reader">
      <h2>Workspace controls</h2>
      {err && <p role="alert">{err}</p>}
      {!data ? (
        <p>Loading settings…</p>
      ) : !data.admin ? (
        <p>Configuration is managed by workspace administrators.</p>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(e.currentTarget, "/settings/name");
            }}
          >
            <Field label="Workspace name">
              <input name="name" required maxLength={120} />
            </Field>
            <button disabled={busy}>Rename workspace</button>
          </form>
          <h2>Access permissions</h2>
          {data.members.map((m) => (
            <div className="row" key={m.id}>
              {m.name}
              <small>{m.role}</small>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(e.currentTarget, "/settings/member");
            }}
          >
            <div className="pair">
              <Field label="Existing member">
                <select name="member">
                  {data.members
                    .filter((m) => m.role !== "consumer")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Role">
                <select name="role">
                  <option>viewer</option>
                  <option>editor</option>
                  <option>reviewer</option>
                </select>
              </Field>
            </div>
            <button disabled={busy}>Update access</button>
          </form>
          <h2>Workspace taxonomy</h2>
          {data.terms.map((t) => (
            <div className="row" key={t.id}>
              <span>{t.name}</span>
              <small>{t.kind}</small>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(e.currentTarget, "/taxonomy");
            }}
          >
            <div className="pair">
              <Field label="Term">
                <input required name="name" maxLength={80} />
              </Field>
              <Field label="Kind">
                <select name="kind">
                  <option>Domain</option>
                  <option>Collection</option>
                  <option>Tag</option>
                </select>
              </Field>
            </div>
            <button disabled={busy}>Add term</button>
          </form>
          {data.log.length > 0 && (
            <>
              <h2>Administration history</h2>
              {data.log.map((x) => (
                <div key={x.id} className="row">
                  {x.action}
                  <small>{x.detail}</small>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
