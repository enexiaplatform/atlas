import type { Asset } from "./data";
export function Comparison({
  items,
  open,
  clear,
}: {
  items: Asset[];
  open: (id: string) => void;
  clear: () => void;
}) {
  const keys = [
    ...new Set(items.flatMap((a) => Object.keys(a.structured_content))),
  ];
  function exportRecords() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(items, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "atlas-selected-records.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel reader">
      <div className="panelhead">
        <h2>Record comparison</h2>
        <div>
          <button onClick={exportRecords}>Export selected</button>{" "}
          <button onClick={clear}>Clear selection</button>
        </div>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              {items.map((a) => (
                <th key={a.id}>
                  <button className="link" onClick={() => open(a.id)}>
                    {a.title}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Authority</th>
              {items.map((a) => (
                <td key={a.id}>
                  {a.verification_status} · v{a.version}
                </td>
              ))}
            </tr>
            {keys.map((k) => (
              <tr key={k}>
                <th>{k}</th>
                {items.map((a) => (
                  <td key={a.id}>
                    {a.structured_content[k] || "Not recorded"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
