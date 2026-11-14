// Copy the measured layer maps the web atlas reads (code-map.json) from data/measured/ to web/src/data/.
// A layer whose map is missing is left out, and the atlas shows it as "measuring now".
// Behavior reads the report map (scripts/report_map.py): every model writes up the same finished work logs.
//   npx tsx scripts/copy-layer-maps.ts
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
for (const [layer, file] of [["code", "code-map.json"], ["behavior", "report-map.json"]]) {
  const src = join(ROOT, "data/measured", file), dest = join(ROOT, "web/src/data", `${layer}-map.json`);
  if (existsSync(src)) { copyFileSync(src, dest); console.log(`${layer}: copied ${file}`); }
  else { if (existsSync(dest)) rmSync(dest); console.log(`${layer}: no map yet, shown as measuring now`); }
}
