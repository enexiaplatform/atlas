import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Boxes,
  ChevronRight,
  Clock3,
  Database,
  FileCheck2,
  FileSearch,
  Files,
  FolderOpen,
  Globe2,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  api,
  date,
  type Me,
  type Workspace,
  type Summary,
  type Asset,
  type Filters,
} from "./data";
import { Mark, Topography, AssetIcon, domainColor } from "./visual";
import { WorkspaceControls } from "./admin";
import { Library } from "./library";
import { AssetDetail } from "./detail";
import { Editor, Field } from "./editor";
import "./style.css";

const nav = [
  ["Overview", LayoutDashboard],
  ["Knowledge library", FolderOpen],
  ["Intelligence database", Database],
  ["Knowledge graph", Network],
  ["Research workspace", FileSearch],
  ["Strategy & GTM", Target],
  ["Knowledge assistant", Sparkles],
  ["Administration", Settings2],
] as const;
function Login({ done }: { done: (m: Me) => void }) {
  const [cfg, C] = useState({ pilot: false, supabase: false }),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  useEffect(() => {
    api<typeof cfg>("/api/config")
      .then(C)
      .catch((e) => E(e.message));
  }, []);
  async function sign(body: unknown) {
    B(true);
    try {
      await api("/api/session", "POST", body);
      done(await api<Me>("/api/me"));
    } catch (e) {
      E(String(e));
    } finally {
      B(false);
    }
  }
  return (
    <main className="login">
      <div className="loginbox">
        <div className="brand">
          <Mark /> ENEXIA <b>ATLAS</b>
        </div>
        <Topography />
        <div className="loginbody">
          <h1>Open your workspace</h1>
          {cfg.pilot && (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => sign({ pilot: true })}
              >
                Open synthetic Servicebio pilot <ArrowRight size={16} />
              </button>
              <hr />
            </>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              sign({
                [f.get("identity") === "issuer" ? "identityToken" : "key"]:
                  f.get("key"),
              });
            }}
          >
            {cfg.supabase && (
              <select name="identity">
                <option value="key">Atlas access key</option>
                <option value="issuer">Supabase session token</option>
              </select>
            )}
            <Field label="Workspace access credential">
              <input name="key" required type="password" autoComplete="off" />
            </Field>
            <button disabled={busy}>Sign in</button>
          </form>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
    </main>
  );
}
function App() {
  const [me, M] = useState<Me | null>(),
    [workspace, W] = useState(() => location.hash.slice(1).split("/")[0] || ""),
    [error, E] = useState("");
  useEffect(() => {
    api<{ signedIn: boolean }>("/api/config")
      .then(async (c) => M(c.signedIn ? await api<Me>("/api/me") : null))
      .catch((e) => E(e.message));
  }, []);
  if (error)
    return (
      <main className="login">
        <p role="alert">{error}</p>
      </main>
    );
  if (me === undefined) return <main className="login">Opening Atlas…</main>;
  if (!me) return <Login done={M} />;
  const w = me.workspaces.find((x) => x.id === workspace) || me.workspaces[0];
  if (!w) return <p>No workspace membership.</p>;
  return (
    <Shell
      key={w.id}
      w={w}
      me={me}
      switchWorkspace={(s) => {
        history.replaceState(null, "", location.pathname);
        W(s);
      }}
      refresh={() => api<Me>("/api/me").then(M)}
      logout={async () => {
        await api("/api/session", "DELETE");
        W("");
        M(null);
      }}
    />
  );
}
function Shell({
  w,
  me,
  switchWorkspace,
  logout,
  refresh,
}: {
  w: Workspace;
  me: Me;
  switchWorkspace: (s: string) => void;
  refresh: () => void;
  logout: () => void;
}) {
  const base = "/api/v1/workspaces/" + w.id;
  const [page, P] = useState("Overview"),
    [id, I] = useState(() =>
      location.hash.startsWith("#" + w.id + "/")
        ? location.hash.split("/")[1] || ""
        : "",
    ),
    [initial, F] = useState<Partial<Filters>>({}),
    [summary, S] = useState<Summary>(),
    [error, E] = useState(""),
    [editor, A] = useState(false),
    [rev, R] = useState(0),
    [mobile, N] = useState(false),
    [navKey, K] = useState(0),
    [pilot, Demo] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ pilot: boolean }>("/api/config").then((x) => {
      if (live) Demo(x.pilot);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    api<Summary>(base + "/overview")
      .then((d) => {
        if (live) {
          S(d);
          E("");
        }
      })
      .catch((e) => {
        if (live) E(e.message);
      });
    return () => {
      live = false;
    };
  }, [base, rev]);
  useEffect(() => {
    const restore = () =>
      I(
        location.hash.startsWith("#" + w.id + "/")
          ? location.hash.split("/")[1] || ""
          : "",
      );
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [w.id]);
  function go(p: string, f: Partial<Filters> = {}) {
    I("");
    if (location.hash) history.pushState(null, "", location.pathname);
    P(p);
    F(p === "Strategy & GTM" ? { domain: "GTM & Strategy", ...f } : f);
    K((n) => n + 1);
    N(false);
    window.scrollTo(0, 0);
  }
  function open(s: string) {
    history.pushState(null, "", "#" + w.id + "/" + s);
    I(s);
    N(false);
    window.scrollTo(0, 0);
  }
  const can = w.role === "editor" || w.role === "reviewer";
  return (
    <div className="shell">
      {mobile && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => N(false)}
        />
      )}
      <aside className={mobile ? "side visible" : "side"}>
        <div className="brand">
          <Mark />
          <span>
            ENEXIA <b>ATLAS</b>
          </span>
        </div>
        <label className="workspace">
          <span className="wsicon">
            <Boxes size={19} />
          </span>
          <span>
            <small>Workspace</small>
            <select
              aria-label="Active workspace"
              value={w.id}
              onChange={(e) => switchWorkspace(e.target.value)}
            >
              {me.workspaces.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <nav>
          {nav.map(([name, Icon], i) => (
            <div key={name}>
              {[0, 4, 7].includes(i) && (
                <div className="navlabel">
                  {i === 0 ? "Workspace" : i === 4 ? "Intelligence" : "Manage"}
                </div>
              )}
              <button
                className={page === name ? "active" : ""}
                onClick={() => go(name)}
              >
                <Icon size={17} />
                {name}
              </button>
            </div>
          ))}
        </nav>
        <div className="profile">
          <div className="avatar">
            {me.name
              .split(" ")
              .slice(0, 2)
              .map((s) => s[0])
              .join("")}
          </div>
          <span>
            {me.name}
            <small>{w.role}</small>
          </span>
          <button title="Sign out" aria-label="Sign out" onClick={logout}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="body">
        <header className="top">
          <button
            className="hamb"
            aria-label="Open navigation"
            onClick={() => N(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className="crumb">
            <Map size={15} /> Atlas <ChevronRight size={12} />{" "}
            <strong>{page}</strong>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go("Knowledge library", {
                q: String(new FormData(e.currentTarget).get("q") || ""),
              });
            }}
          >
            <Search size={15} />
            <input
              name="q"
              aria-label="Search all assets"
              placeholder="Search workspace…"
            />
          </form>
        </header>
        <main className="content">
          {error && <p role="alert">{error}</p>}
          {id ? (
            <AssetDetail
              key={id}
              id={id}
              base={base}
              role={w.role}
              open={open}
              back={() => {
                history.pushState(null, "", location.pathname);
                I("");
              }}
              changed={() => R((n) => n + 1)}
            />
          ) : !summary ? (
            <p>Loading workspace…</p>
          ) : page === "Overview" ? (
            <>
              <div className="pagehead">
                <div>
                  <div className="eyebrow">
                    <span className="dot" /> Workspace overview
                  </div>
                  <h1>Knowledge overview</h1>
                  <p>
                    {w.name}
                    {pilot ? " · Synthetic pilot workspace" : ""}
                  </p>
                </div>
                {can && (
                  <button className="primary" onClick={() => A(true)}>
                    <Plus size={16} /> New asset
                  </button>
                )}
              </div>
              <div className="hero">
                <Topography />
                <div>
                  <span className="eyebrow">
                    <Globe2 size={14} /> ENEXIA ATLAS
                  </span>
                  <h2>Knowledge atlas</h2>
                  <p>
                    {summary.domains.length} domains connected in your workspace
                  </p>
                  <button onClick={() => go("Knowledge graph")}>
                    Explore graph <ArrowRight size={14} />
                  </button>
                </div>
              </div>
              <div className="metrics">
                {(
                  [
                    [
                      "Knowledge assets",
                      summary.metrics.total,
                      Files,
                      () => go("Knowledge library"),
                    ],
                    [
                      "Published",
                      summary.metrics.published,
                      FileCheck2,
                      () => go("Knowledge library", { status: "Published" }),
                    ],
                    [
                      "Pending review",
                      summary.metrics.reviews,
                      Clock3,
                      () => go("Knowledge library", { status: "In Review" }),
                    ],
                    [
                      "Unverified",
                      summary.metrics.unverified,
                      ShieldCheck,
                      () =>
                        go("Research workspace", {
                          verification_status: "Unverified",
                        }),
                    ],
                  ] as const
                ).map(([t, n, Icon, click]) => (
                  <button onClick={click} key={t}>
                    <span>
                      <Icon size={16} />
                      {t}
                    </span>
                    <strong>{n}</strong>
                  </button>
                ))}
              </div>
              <div className="dashgrid">
                <section className="panel">
                  <div className="panelhead">
                    <h2>Recently updated</h2>
                    <button
                      className="link"
                      onClick={() => go("Knowledge library")}
                    >
                      View library <ArrowRight size={14} />
                    </button>
                  </div>
                  {summary.recent.map((a) => (
                    <button
                      className="row"
                      key={a.id}
                      onClick={() => open(a.id)}
                    >
                      <AssetIcon domain={a.domain} />
                      <span>
                        {a.title}
                        <small>
                          {a.asset_type} · v{a.version}
                        </small>
                      </span>
                      <em className="pill">{a.lifecycle_status}</em>
                    </button>
                  ))}
                  {!summary.recent.length && (
                    <p className="empty">Create the first knowledge asset.</p>
                  )}
                </section>
                <section className="panel coverage">
                  <div className="panelhead">
                    <h2>Domain coverage</h2>
                    <Globe2 size={17} />
                  </div>
                  <p>Assets by knowledge domain</p>
                  <div className="stack">
                    {summary.domains.map((d) => (
                      <i
                        key={d.domain}
                        className={domainColor(d.domain)}
                        style={{ flex: d.n }}
                      />
                    ))}
                  </div>
                  {summary.domains.map((d) => (
                    <button
                      key={d.domain}
                      onClick={() =>
                        go("Knowledge library", { domain: d.domain })
                      }
                    >
                      <i className={domainColor(d.domain)} />
                      <span>{d.domain}</span>
                      <b>{d.n}</b>
                    </button>
                  ))}
                </section>
              </div>
              <div className="dashgrid">
                <section className="panel reader">
                  <h2>Recently published</h2>
                  {summary.published.length ? (
                    summary.published.map((a) => (
                      <button
                        className="row"
                        key={a.id}
                        onClick={() => open(a.id)}
                      >
                        {a.title}
                        <ArrowRight size={14} />
                      </button>
                    ))
                  ) : (
                    <p>No published assets.</p>
                  )}
                </section>
                <section className="panel reader">
                  <h2>Workspace health</h2>
                  <p>{summary.metrics.stale} overdue reviews</p>
                  <button className="link" onClick={() => go("Administration")}>
                    Integration status <ArrowRight size={14} />
                  </button>
                </section>
              </div>
            </>
          ) : page === "Administration" ? (
            <Admin
              base={base}
              w={w}
              refresh={() => {
                refresh();
                R((n) => n + 1);
              }}
            />
          ) : (
            <>
              {can && (
                <button className="floating primary" onClick={() => A(true)}>
                  <Plus size={15} /> New asset
                </button>
              )}
              <Library
                key={page + navKey}
                page={page}
                base={base}
                initial={initial}
                summary={summary}
                open={open}
                editor={can}
                reload={() => R((n) => n + 1)}
              />
            </>
          )}
        </main>
      </div>
      {editor && (
        <Editor
          base={base}
          close={() => A(false)}
          save={async (x) => {
            const a = await api<Asset>(base + "/assets", "POST", x);
            R((n) => n + 1);
            open(a.id);
          }}
        />
      )}
    </div>
  );
}
function Admin({
  base,
  w,
  refresh,
}: {
  base: string;
  w: Workspace;
  refresh: () => void;
}) {
  const [audit, S] = useState<
      {
        asset_id: string;
        version: number;
        action: string;
        occurred_at: string;
      }[]
    >([]),
    [error, E] = useState("");
  useEffect(() => {
    api<typeof audit>(base + "/audit")
      .then(S)
      .catch((e) => E(e.message));
  }, [base]);
  return (
    <section>
      <div className="pagehead">
        <div>
          <div className="eyebrow">Workspace settings</div>
          <h1>Administration</h1>
          <p>
            {w.name} · {w.role} access
          </p>
        </div>
        <a
          className="button"
          href={base + "/export"}
          download="atlas-workspace.json"
        >
          <ArrowDownToLine size={16} /> Export
        </a>
      </div>
      <div className="panel reader">
        <h2>Ecosystem integrations</h2>
        <p>
          Memoire supports versioned references in isolated evaluation. All five
          applications require an authorized connection for live
          synchronization.
        </p>
        {["Memoire", "HELM", "Sentinel", "Forge", "Flow"].map((x) => (
          <div className="row" key={x}>
            {x}
            <small>
              {x === "Memoire" ? "Isolated receiver" : "Disconnected"}
            </small>
          </div>
        ))}
      </div>
      <WorkspaceControls base={base} updated={refresh} />
      <div className="panel reader">
        <h2>Audit trail</h2>
        {error && <p role="alert">{error}</p>}
        {audit.map((a) => (
          <div className="row" key={a.asset_id + a.version}>
            <Activity size={14} />
            <span>
              {a.action} · v{a.version}
              <small>{a.asset_id}</small>
            </span>
            <small>{date(a.occurred_at)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
