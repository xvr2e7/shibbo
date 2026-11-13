// Build a short, model-aware rule block for prompts (CLAUDE.md, AGENTS.md, Cursor rules, skills).
import { tells, graphite, apiRuns, resolveModel, matchModel, models, type Tell, type Model } from "./registry.js";

export interface RuleOptions {
  model?: string | null;
  domains?: string[];
  /** How many agent habits to list after the writing rules (default 6, 0 for none). */
  agentLimit?: number;
  /** Max registry rules to include. */
  limit?: number;
  /** Include the model's most over-used measured phrases. */
  phrases?: number;
  /** Lead with the clarity rules (default true). */
  clarity?: boolean;
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
    if (t.group === "clarity") continue; // these lead the rules in their own section (clarityMarkdown)
    if (t.detect.method === "stat" && t.detect.fn === "emdash") continue; // weak in current data; don't spend prompt space
    const r = strength(t, model);
    // Score: severity first, then measured strength for this model; rising tells get a nudge, fading ones a cut.
    const trend = t.status === "rising" ? 1.3 : t.status === "fading" ? 0.6 : 1;
    const s = t.severity * trend * (r ? Math.log10(Math.max(r, 1.5)) + 1 : 1);
    out.push({ tell: t, ratio: r, reason: r ? `${model ? model.name : "models"} ${Math.round(r)}× human` : "curated", score: s });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 14)
    .map(({ score, ...rest }) => rest);
}

export function rulesMarkdown(opts: RuleOptions = {}): string {
  const matched = matchModel(opts.model ?? null);
  const model = matched?.model ?? null;
  const ranked = rank(opts);
  const lines: string[] = opts.clarity === false ? [] : [clarityMarkdown(), ""];
  lines.push(`## Writing tells to avoid${model ? ` (tuned for ${model.name}${matched!.exact ? "" : ", the nearest measured model"})` : ""}`);
  lines.push("");
  lines.push("Readers spot these patterns as machine-made. Write the plain version instead.");
  lines.push("");
  for (const { tell: t } of ranked) {
    const q = (x: string) => `"${x.replace(/[.]$/, "")}"`;
    const ex = t.examples?.bad && t.examples?.good ? ` Instead of ${q(t.examples.bad)}, write ${q(t.examples.good)}.` : "";
    lines.push(`- ${t.name} → ${t.fix ?? t.what}${ex}`);
  }
  // Agent habits get their own short list, so they never crowd out the writing rules.
  const habits = (opts.domains && !opts.domains.includes("agent")) ? [] : rank({ ...opts, domains: ["agent"], limit: opts.agentLimit ?? 6 });
  if (habits.length) {
    lines.push("");
    lines.push("While working, drop these agent habits:");
    lines.push("");
    for (const { tell: t } of habits) lines.push(`- ${t.name} → ${t.fix ?? t.what}`);
  }
  const n = opts.phrases ?? 12;
  const g = graphite();
  if (n > 0 && g && model) {
    // Graphite's list for its ten models; shibbo's own run (a few hundred articles) for models it measured itself.
    const run = model.source === "shibbo-api" ? apiRuns()?.models.find((m) => m.id === model.id) : undefined;
    const list = run ? run.top : g.models[model.id]?.top ?? [];
    const cite = run ? `shibbo's run of ${run.docs} articles, ${run.date.slice(0, 7)}` : "Graphite, 2026";
    const top = list.filter((e) => e.kind === "ngram" && e.term.split(" ").length >= 2).slice(0, n);
    if (top.length) {
      lines.push("");
      lines.push(`Phrases ${model.name} uses far more than human writers (${cite}): ${top.map((e) => `"${e.term}"`).join(", ")}.`);
    }
  }
  lines.push("");
  lines.push("Prefer: specific nouns and numbers, contractions where speech would use them, one reader in mind, and endings that stop when the information does.");
  lines.push("");
  lines.push("Check with `npx shibbo check <file>`.");
  return lines.join("\n");
}

/**
 * Clarity comes before any list of tells: text can avoid every stock phrase and still make its reader dig.
 * The rules come from the registry's clarity group, so a new entry there lands here.
 */
export function clarityMarkdown(): string {
  const q = (x: string) => `"${x.replace(/[.]$/, "")}"`;
  const of = (domain: string) => tells().filter((t) => t.group === "clarity" && t.domain === domain);
  const line = (t: Tell) => `- ${t.fix}${t.examples?.bad && t.examples?.good ? ` Write ${q(t.examples.good)} for ${q(t.examples.bad)}.` : ""}`;
  const lines = ["## Say it clearly", "", "A reader should never have to decode you. This holds for files you write and for every message you send.", ""];
  for (const t of of("prose")) lines.push(line(t));
  const report = of("agent");
  if (report.length) {
    lines.push("", "When you report on work:", "");
    for (const t of report) lines.push(line(t));
  }
  return lines.join("\n");
}

/**
 * Rules for interface work: what to settle before building, then the commonest visual tells with fixes.
 * Kept short enough to load in every session, since rules in side files go unread.
 */
export function interfaceMarkdown(opts: { limit?: number } = {}): string {
  const ranked = rank({ domains: ["ui"], limit: opts.limit ?? 12 });
  const lines = [
    "## Building an interface",
    "",
    "Settle these before the first line of markup:",
    "",
    "- Start from the subject. List what this product, place or person has that no other does (its objects, words, numbers, routines) and build the page from that list.",
    "- Throw out your first idea if any brief in the same category would get it too. Change one large decision (layout, type, colour or the opening image) until it would not. This counts double for the headline hook and the hero drawing.",
    "- Pick one thing the page will be remembered for and keep the rest quiet.",
    "- Use only facts you were given. A number, quote, customer or logo you weren't given stays off the page; mark sample content as sample.",
    "- Design each screen for its task. A dashboard answers the first question its user has; a landing page shows the product before it describes it.",
    "",
    "Then avoid the defaults viewers read as machine-made:",
    "",
  ];
  for (const { tell: t } of ranked) lines.push(`- ${t.name} → ${t.fix ?? t.what}`);
  lines.push("");
  lines.push("A ban moves to its nearest substitute, so fix the cause: if you drop one stock move, don't reach for the next most common one.");
  lines.push("When the page is built, look at it at phone and desktop widths: no sideways scroll, text you can read against its ground, a visible focus ring on every control.");
  return lines.join("\n");
}

export function modelList(): string {
  return models()
    .models.map((m) => `${m.id.padEnd(18)} ${m.name.padEnd(16)} ${m.released}${m.verified ? "" : " (unverified)"}`)
    .join("\n");
}
