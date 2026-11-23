import { event } from "../shared/contracts.mjs";
// A read-through adapter. The consumer never persists confidential asset bodies.
// A sink must atomically deduplicate event_id and apply a version before acknowledging.
export function memoireReader({ baseUrl, workspace, key, fetchImpl = fetch }) {
  const root = new URL("/api/v1/workspaces/" + workspace + "/", baseUrl);
  if (
    root.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(root.hostname)
  )
    throw Error("HTTPS required");
  async function call(path, body) {
    const reply = await fetchImpl(new URL(path, root), {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer " + key,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!reply.ok) throw Error("Atlas returned HTTP " + reply.status);
    return reply.json();
  }
  return {
    retrieve: (id) => call("assets/" + encodeURIComponent(id)),
    resolve: (id) =>
      call("resolve?application=memoire&external_id=" + encodeURIComponent(id)),
    async pull(sink, logFailure) {
      let after = (await call("checkpoint")).last_seq;
      try {
        for (;;) {
          const events = await call("events?after=" + after);
          for (const input of events) {
            const e = event.parse(input);
            if (e.workspace_id !== workspace || BigInt(e.seq) <= BigInt(after))
              throw Error("Unexpected event scope or ordering");
            await sink(e);
            await call("checkpoint", { seq: e.seq });
            after = e.seq;
          }
          if (events.length < 100) return after;
        }
      } catch (error) {
        await logFailure({ workspace, after, message: error.message });
        throw error;
      }
    },
    // A fresh authoritative manifest supports reconciliation after a missed or withdrawn release.
    async manifest() {
      const records = new Map();
      for (let page = 1; ; page++) {
        const r = await call("assets?sort=title&page=" + page);
        for (const a of r.items) records.set(a.id, a.version);
        if (page * 25 >= r.total) return records;
      }
    },
  };
}
