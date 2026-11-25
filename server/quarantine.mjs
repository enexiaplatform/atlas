import { createHash } from "node:crypto";
import { checked, decode } from "./files.mjs";

// Private adapter contract. A caller may persist only the bytes returned on success.
// Hosted routes remain text-only until a production scanner is approved.
export async function inspectQuarantined(body, scanner) {
  const { buffer, name, ext } = decode(body);
  if (
    !["pdf", "docx", "xlsx", "pptx"].includes(ext) ||
    typeof scanner?.scan !== "function"
  )
    throw Error("Scan unavailable");
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const signal = AbortSignal.timeout(10000);
  const verdict = await Promise.race([
    scanner.scan({ bytes: Buffer.from(buffer), sha256, signal }),
    new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(Error("Scan timed out")), {
        once: true,
      }),
    ),
  ]);
  if (
    verdict?.status !== "clean" ||
    verdict.sha256 !== sha256 ||
    typeof verdict.engine !== "string" ||
    !verdict.engine.trim()
  )
    throw Error("Scan approval unavailable");
  return checked({ name, data: buffer.toString("base64") });
}
