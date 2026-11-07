// Gather everything the web app shows into web/src/data/*.json.
//   npm run web:data
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { tells, models, graphite, sources, root } from "../src/registry.js";
import { rulesMarkdown, strength } from "../src/rules.js";

const R = root();
const OUT = join(R, "web", "src", "data");
mkdirSync(OUT, { recursive: true });
const g = graphite();
if (!g) throw new Error("run npm run import:graphite first");
const ms = models();

/** Typographic quotes and apostrophes for display text (patterns are left alone). */
const sq = (x?: string) =>
  x === undefined ? x : x.replace(/(^|[\s(\[{\/])"/g, "$1“").replace(/"/g, "”").replace(/(^|[\s(\[{])'/g, "$1‘").replace(/'/g, "’");
const display = <T extends { name: string; what: string; label?: string; fix?: string; false_positives?: string; examples?: { bad?: string; good?: string }; substitutes?: string[] }>(t: T): T => ({
  ...t,
  name: sq(t.name)!,
  label: sq(t.label),
  what: sq(t.what)!,
  fix: sq(t.fix),
  false_positives: sq(t.false_positives),
  examples: t.examples ? { bad: sq(t.examples.bad), good: sq(t.examples.good) } : undefined,
  substitutes: t.substitutes?.map((x) => sq(x)!),
});

const tellRows = tells().map(display).map((t) => {
  const perModel = Object.fromEntries(
    ms.models.map((m) => {
      const n = g.tells[t.id]?.[m.id];
      const f = g.tellFeatures[t.id]?.models[m.id];
      const hasTerms = !!n && Object.values(g.tells[t.id]).some((x) => x.ratio !== null);
      if (hasTerms && n!.ratio !== null) return [m.id, { ratio: n!.ratio, term: n!.term ?? null, counts: n!.counts ?? null, floor: !!n!.floor, via: "phrase" }];
      if (!hasTerms && f && f.ratio !== null) return [m.id, { ratio: f.ratio, term: null, counts: null, floor: false, via: "feature" }];
      return [m.id, null];
    }),
  );
  return {
    ...t,
    perModel,
    feature: g.tellFeatures[t.id] ? { name: g.tellFeatures[t.id].feature, human: g.tellFeatures[t.id].human } : null,
    strength: strength(t, null),
  };
});

const modelRows = ms.models.map((m) => ({
  ...m,
  maker: ms.families[m.family].maker,
  familyName: ms.families[m.family].name,
  tells: g.models[m.id].tells,
  shared: g.models[m.id].shared_with_previous,
  top: g.models[m.id].top.slice(0, 40),
  under: g.models[m.id].under.slice(0, 20),
  rules: rulesMarkdown({ model: m.id, limit: 10, phrases: 10 }),
  features: Object.fromEntries(
    ["layer1__punct_emdash_per1k", "layer5__llm_delve_per1k", "layer5__llm_crucial_per1k", "layer1__sent_len_mean", "layer5__bullet_line_per1k", "layer5__selfref_last_mirrors_first"].map((f) => [f, { mean: g.features[f].models[m.id].mean, d: g.features[f].models[m.id].d, human: g.features[f].human }]),
  ),
}));

const chronoPath = join(R, "data", "chronology.yaml");
const chronology = existsSync(chronoPath) ? YAML.parse(readFileSync(chronoPath, "utf8")) : { milestones: [], tells: [] };
for (const t of chronology.tells ?? []) { t.evidence = sq(t.evidence); t.tell = sq(t.tell); }
for (const m of chronology.milestones ?? []) m.note = sq(m.note);

const evalPath = join(R, "data/measured/eval.json");
const evalData = existsSync(evalPath) ? JSON.parse(readFileSync(evalPath, "utf8")) : null;
if (evalData) delete evalData.rules_train;

writeFileSync(join(OUT, "registry.json"), JSON.stringify({
  built: new Date().toISOString().slice(0, 10),
  tells: tellRows,
  models: modelRows,
  families: ms.families,
  eras: ms.eras,
  sources: sources(),
  graphite: { attribution: g.attribution, license: g.license, url: g.url, threshold: g.threshold },
  eval: evalData,
}));
writeFileSync(join(OUT, "chronology.json"), JSON.stringify(chronology));
copyFileSync(join(R, "data/measured/map.json"), join(OUT, "map.json"));
console.log(`web data: ${tellRows.length} tells, ${modelRows.length} models, ${chronology.milestones?.length ?? 0} milestones, ${chronology.tells?.length ?? 0} historical tells`);
