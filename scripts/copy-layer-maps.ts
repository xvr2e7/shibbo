// Copy the measured layer maps the web atlas reads (code-map.json) from data/measured/ to web/src/data/.
// A layer whose map is missing is left out, and the atlas shows it as "measuring now".
// The conduct map stays in data/measured/ and off the site: its runs came from one maker's agent only.
//   npx tsx scripts/copy-layer-maps.ts
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
for (const layer of ["code"]) {
  const src = join(ROOT, "data/measured", `${layer}-map.json`), dest = join(ROOT, "web/src/data", `${layer}-map.json`);
  if (existsSync(src)) { copyFileSync(src, dest); console.log(`${layer}: copied ${layer}-map.json`); }
  else { if (existsSync(dest)) rmSync(dest); console.log(`${layer}: no map yet, shown as measuring now`); }
}
