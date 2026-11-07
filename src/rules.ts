// Build a short, model-aware rule block for prompts (CLAUDE.md, AGENTS.md, Cursor rules, skills).
import { tells, graphite, resolveModel, models, type Tell, type Model } from "./registry.js";

export interface RuleOptions {
  model?: string | null;
  domains?: string[];
  /** Max registry rules to include. */
  limit?: number;
  /** Include the model's most over-used measured phrases. */
  phrases?: number;
}

export interface RankedTell {
  tell: Tell;
  /** Measured ratio for the chosen model (or max across models), when known. */
  ratio: number | null;
  reason: string;
}

/** Measured strength of a tell for a model: n-gram ratio, else feature ratio. */
export function strength(t: Tell, model: Model | null): number | null {
  const g = graphite();
  if (!g) return null;
  const ids = model ? [model.id] : Object.keys(g.models);
  let best: number | null = null;
  for (const id of ids) {
    const n = g.tells[t.id]?.[id]?.ratio ?? null;
    const f = g.tellFeatures[t.id]?.models[id]?.ratio ?? null;
    // Absence tells (contractions) are stored as human-over-model; invert to "how much stronger than people".
    const v = t.measure?.graphite_absent && n !== null ? 1 / n : n ?? (f !== null && f > 1 ? f : null);
    if (v !== null && (best === null || v > best)) best = v;
  }
  return best;
}

export function rank(opts: RuleOptions = {}): RankedTell[] {
  const model = resolveModel(opts.model ?? null);
  const domains = new Set(opts.domains ?? ["prose", "chat"]);
  const out: Array<RankedTell & { score: number }> = [];
  for (const t of tells()) {
    if (!domains.has(t.domain) || t.severity === 0 || t.status === "retired") continue;
    if (t.detect.method === "stat" && t.detect.fn === "emdash") continue; // weak in current data; don't spend prompt space
    const r = strength(t, model);
    // Score: severity first, then measured strength for this model; rising tells get a nudge, fading ones a cut.
    const trend = t.status === "rising" ? 1.3 : t.status === "fading" ? 0.6 : 1;
    const s = t.severity * trend * (r ? Math.log10(Math.max(r, 1.5)) + 1 : 1);
    out.push({ tell: t, ratio: r, reason: r ? `${model ? model.name : "models"} ${Math.round(r)}× people` : "curated", score: s });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 14)
    .map(({ score, ...rest }) => rest);
}

export function rulesMarkdown(opts: RuleOptions = {}): string {
  const model = resolveModel(opts.model ?? null);
  const ranked = rank(opts);
  const lines: string[] = [];
  lines.push(`## Writing tells to avoid${model ? ` (tuned for ${model.name})` : ""}`);
  lines.push("");
  lines.push("Readers spot these patterns as machine-made. Write the plain version instead.");
  lines.push("");
  for (const { tell: t } of ranked) {
    const q = (x: string) => `"${x.replace(/[.]$/, "")}"`;
    const ex = t.examples?.bad && t.examples?.good ? ` Instead of ${q(t.examples.bad)}, write ${q(t.examples.good)}.` : "";
    lines.push(`- ${t.name} → ${t.fix ?? t.what}${ex}`);
  }
  const n = opts.phrases ?? 12;
  const g = graphite();
  if (n > 0 && g && model) {
    const top = g.models[model.id]?.top.filter((e) => e.kind === "ngram" && e.term.split(" ").length >= 2).slice(0, n) ?? [];
    if (top.length) {
      lines.push("");
      lines.push(`Phrases ${model.name} uses far more than people (Graphite, 2026): ${top.map((e) => `"${e.term}"`).join(", ")}.`);
    }
  }
  lines.push("");
  lines.push("Prefer: specific nouns and numbers, contractions where speech would use them, one reader in mind, and endings that stop when the information does.");
  lines.push("");
  lines.push("Check with `npx shibbo check <file>`.");
  return lines.join("\n");
}

export function modelList(): string {
  return models()
    .models.map((m) => `${m.id.padEnd(18)} ${m.name.padEnd(16)} ${m.released}${m.verified ? "" : " (unverified)"}`)
    .join("\n");
}
