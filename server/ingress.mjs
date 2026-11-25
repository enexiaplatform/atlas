import { isIP } from "node:net";
import { fail } from "./db.mjs";

const canonical = (ip) => {
  if (!isIP(ip || "")) return null;
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) return ip.slice(7);
  return isIP(ip) === 6
    ? new URL("http://[" + ip + "]/").hostname.slice(1, -1)
    : ip;
};
export function ingressAddress(trustedPeer) {
  const peer = canonical(trustedPeer);
  if (trustedPeer && !peer) throw Error("Invalid trusted ingress peer");
  return (req) => {
    const remote = canonical(req.socket.remoteAddress);
    if (!remote) fail(503, "Ingress unavailable");
    if (!peer || peer !== remote) return remote;
    const forwarded = req.headers["x-forwarded-for"];
    const client = typeof forwarded === "string" && canonical(forwarded);
    if (!client) fail(503, "Ingress unavailable");
    return client;
  };
}
