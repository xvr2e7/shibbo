// Join the root habits in data/roots.yaml to the registry and write web/src/data/roots.json for the layers view.
//   npm run web:roots
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { tells, root } from "../src/registry.js";

/** The four surfaces a person meets; chat tells sit with prose, agent tells are conduct. */
const LAYER: Record<string, "prose" | "code" | "interface" | "conduct"> = { prose: "prose", chat: "prose", code: "code", ui: "interface", agent: "conduct" };

interface RootIn { id: string; name: string; what: string; tells: Record<string, string[]> }

const R = root();
const doc = YAML.parse(readFileSync(join(R, "data", "roots.yaml"), "utf8")) as { roots: RootIn[] };
const byId = new Map(tells().map((t) => [t.id, t]));
const missing: string[] = [];

const roots = doc.roots.map((r) => {
  const seen = new Set<string>();
  const members = Object.entries(r.tells).flatMap(([domain, ids]) =>
    (ids ?? []).flatMap((id) => {
      const t = byId.get(id);
      if (!t) { missing.push(`${r.id}: ${id}`); return []; }
      if (seen.has(id)) return [];
      seen.add(id);
      const first = t.era?.first_seen;
      return [{ id, name: t.name, layer: LAYER[t.domain] ?? LAYER[domain], first_seen: first === undefined ? null : +String(first).slice(0, 4) }];
    }),
  );
  return { id: r.id, name: r.name, what: r.what, tells: members };
});

const out = join(R, "web", "src", "data", "roots.json");
writeFileSync(out, JSON.stringify({ roots }, null, 1) + "\n");
console.log(`roots.json: ${roots.length} roots, ${roots.reduce((n, r) => n + r.tells.length, 0)} links`);
if (missing.length) console.warn(`skipped ${missing.length} ids not in the registry:\n  ${missing.join("\n  ")}`);
