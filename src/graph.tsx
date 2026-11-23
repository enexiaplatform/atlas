import { type Detail } from "./data";
export function Neighborhood({
  asset,
  focus,
}: {
  asset: Detail;
  focus: (id: string) => void;
}) {
  const nodes = asset.links.slice(0, 12),
    height = Math.max(140, nodes.length * 58),
    mid = height / 2;
  return (
    <figure
      className="neighborhood"
      aria-label={"Relationships of " + asset.title}
    >
      <svg
        aria-hidden="true"
        viewBox={"0 0 600 " + height}
        preserveAspectRatio="none"
      >
        {nodes.map((n, i) => (
          <path
            key={n.id + n.relation + n.outgoing}
            d={`M180 ${mid} C250 ${mid},240 ${i * 58 + 30},325 ${i * 58 + 30}`}
            stroke="var(--h,#8baf80)"
            fill="none"
            strokeWidth="1.7"
          />
        ))}
      </svg>
      <div className="graphroot">{asset.title}</div>
      <div className="graphnodes">
        {nodes.map((n) => (
          <button
            key={n.id + n.relation + n.outgoing}
            onClick={() => focus(n.id)}
          >
            <small>
              {n.outgoing ? "→" : "←"} {n.relation.replaceAll("_", " ")}
            </small>
            {n.title}
          </button>
        ))}
      </div>
    </figure>
  );
}
