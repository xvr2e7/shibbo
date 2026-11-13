// Run shibbo's checker over many files at once, restricted to chosen registry domains, and print the tell ids each
// file trips. The CLI picks domains by file extension (a README gets prose and chat rules, never code rules), so the
// code and conduct extractors call the checker through here instead.
//
//   echo '[{"file": "a.py", "domains": ["code"]}, {"file": "t.md", "domains": ["agent", "chat"]}]' | npx tsx measure/tells-of.ts
//   -> {"a.py": ["section-divider-comments"], "t.md": ["let-me-narration"]}
// Only counted hits (those over their density limit) count; the measured phrase lexicon stays off.
import { readFileSync } from "node:fs";
import { check } from "../src/check.js";

const items = JSON.parse(readFileSync(0, "utf8")) as Array<{ file: string; domains: string[] }>;
const out: Record<string, string[]> = {};
for (const { file, domains } of items) {
  const r = check(readFileSync(file, "utf8"), file, { domains, lexicon: false });
  out[file] = [...new Set(r.findings.filter((f) => f.counted && f.origin === "registry").map((f) => f.id))].sort();
}
process.stdout.write(JSON.stringify(out));
