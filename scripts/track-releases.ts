// Watch public model lists and changelogs for new releases, and check expected models against them.
//   npx tsx scripts/track-releases.ts [--since 2026-08-01] [--offline DIR]
//
// Reads (no keys needed):
//   OpenRouter /api/v1/models      ids with a `created` date
//   models.dev /api.json            ids with release_date, per provider
//   LiteLLM price map               ids only; new keys show up by diffing the stored snapshot
//   Hugging Face, per watched org   open-weight uploads with createdAt
//   Anthropic and Gemini changelogs, OpenAI news feed: text searched for expected-model names
//
// Writes:
//   data/tracking/seen.json        every id seen so far, with first-seen date and source (the diff baseline)
//   data/tracking/candidates.yaml  new ids from watched makers that the release timeline lacks, for a person to review
//   data/tracking/expected.yaml    updated in place: last_checked, any sighting, and `expired` once past its date
// A day that finds nothing leaves `updated` and `last_checked` alone, so the files show no diff.
//
// Nothing here edits data/chronology*.yaml or data/models.yaml. The timeline's rule is that a person reads each
// date on the cited page, so the job only proposes. Exit code is 0 whether or not anything changed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { root } from "../src/registry.js";

const R = root();
const DIR = join(R, "data", "tracking");
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? undefined : process.argv[i + 1]; };
const today = new Date().toISOString().slice(0, 10);
const since = arg("since") ?? new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
const offline = arg("offline");

// Makers whose releases the timeline covers. Keys are OpenRouter / models.dev prefixes; values are display names.
const MAKERS: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", google: "Google", "x-ai": "xAI", xai: "xAI", meta: "Meta", "meta-llama": "Meta",
  deepseek: "DeepSeek", qwen: "Alibaba", alibaba: "Alibaba", mistralai: "Mistral", mistral: "Mistral", moonshotai: "Moonshot",
  "z-ai": "Zhipu", zai: "Zhipu", minimax: "MiniMax", xiaomi: "Xiaomi", tencent: "Tencent", nvidia: "NVIDIA", amazon: "Amazon",
  cohere: "Cohere", microsoft: "Microsoft", "bytedance-seed": "ByteDance", baidu: "Baidu", apple: "Apple",
};
const HF_ORGS = ["openai", "google", "meta-llama", "deepseek-ai", "Qwen", "mistralai", "moonshotai", "zai-org", "MiniMaxAI", "XiaomiMiMo", "tencent", "nvidia", "microsoft", "CohereLabs", "ibm-granite", "allenai"];
// Variants that repeat a model already listed: tiers, modes, dated snapshots, fine-tunes for one field.
const VARIANT = /(:free|:batch|:extended|:thinking|:online|:nitro|:floor)$|^~|^(stealth|openrouter)\//;
const NOISE = /(^|-)(image|video|imagine|veo|imagen|lyria|tts|whisper|dall-e|sora|nano-banana|translate|mt\d?)(-|$)|-(legal|medical|finance|guard|safeguard|embed(ding)?|rerank|tts|audio|realtime|transcribe|search-preview|moderation)\b|-(gguf|awq|gptq|fp8|bnb|mlx|int4|int8|bf16|nvfp4|mxfp8|fp4|base(-\d+k)?)\b/i;

interface Seen { first_seen: string; source: string; name?: string; released?: string }
interface Candidate { id: string; name: string; maker: string; released: string | null; first_seen: string; sources: string[]; url: string; price?: string; note?: string }
interface Expected {
  id: string; name: string; maker: string; status: "rumoured" | "announced" | "released" | "expired";
  match: string[]; claim: string; source: { title: string; url: string; date: string; kind: string };
  first_seen: string; expires: string; last_checked?: string; sighting?: { where: string; url: string; date: string; id: string };
}

/** Canonical form for matching ids across sources: no provider, no date or tier suffix, dots as dashes. */
export function norm(id: string): string {
  return id.toLowerCase()
    .replace(/^[^/]+\//, "")
    .replace(/:[a-z-]+$/, "")
    .replace(/-(\d{8}|\d{4}-\d{2}-\d{2}|\d{2}-\d{4}|\d{4})$/, "")
    .replace(/[._ ]/g, "-")
    .replace(/-(preview|latest|exp|instruct|chat)$/, "");
}

async function get(url: string, name: string, as: "json" | "text" = "json"): Promise<any> {
  if (offline) {
    const p = join(offline, name);
    if (!existsSync(p)) return null;
    const s = readFileSync(p, "utf8");
    return as === "json" ? JSON.parse(s) : s;
  }
  try {
    const r = await fetch(url, { headers: { "user-agent": "shibbo-release-tracker (+https://github.com/xvr2e7/shibbo)" }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) { console.warn(`skip ${name}: HTTP ${r.status}`); return null; }
    return as === "json" ? await r.json() : await r.text();
  } catch (e) { console.warn(`skip ${name}: ${(e as Error).message}`); return null; }
}

/** An expected model's patterns. A hit must not run on into more digits, so the 6-2 of gpt-6-2026-09-03 is no GPT-6.2. */
export const matchers = (match: string[]) => match.map((m) => new RegExp(`(?:${m})(?!\\d)`, "i"));

type Found = { id: string; name: string; sources: Set<string>; url: string };
type Page = { where: string; url: string; text: string };

/** Look for each open expected model, then expire stale rumours. `live` is false when no source answered: then nothing expires. */
export function checkExpected(expected: Expected[], found: Iterable<Found>, pages: Page[], today: string, live: boolean): string[] {
  const changes: string[] = [];
  for (const e of expected) {
    if (e.status === "released" || e.status === "expired") continue;
    const res = matchers(e.match);
    let hit: Expected["sighting"] | undefined;
    for (const f of found) if (res.some((r) => r.test(f.id) || r.test(f.name))) { hit = { where: [...f.sources].join(", "), url: f.url, date: today, id: f.id }; break; }
    if (!hit) for (const p of pages) { const r = res.find((x) => x.test(p.text)); if (r) { hit = { where: p.where, url: p.url, date: today, id: (p.text.match(r) ?? [""])[0] }; break; } }
    if (hit && !e.sighting) { e.sighting = hit; changes.push(`${e.name}: seen in ${hit.where} as "${hit.id}". Confirm on a first-party page, then add it to the timeline.`); }
    if (live && !e.sighting && e.expires < today) { e.status = "expired"; changes.push(`${e.name}: no sighting by ${e.expires}; marked expired. Renew it only with a newer source.`); }
  }
  return changes;
}

/** The summary's source line: who answered, and who did not. */
export function sourceLine(read: string[], failed: string[], ids: number): string {
  return `Sources read: ${read.join(", ") || "none"}. ${failed.length ? `No answer from: ${failed.join(", ")}. ` : ""}${ids} ids from watched makers.`;
}

async function main() {
  const load = <T>(f: string, d: T): T => (existsSync(join(DIR, f)) ? (f.endsWith(".json") ? JSON.parse(readFileSync(join(DIR, f), "utf8")) : YAML.parse(readFileSync(join(DIR, f), "utf8")) ?? d) : d);
  mkdirSync(DIR, { recursive: true });
  const seen: Record<string, Seen> = load("seen.json", {});
  const firstRun = Object.keys(seen).length === 0;
  const priorFile = load<{ updated?: string; candidates?: Candidate[] }>("candidates.yaml", {});
  const prior: Candidate[] = priorFile.candidates ?? [];
  const expected: Expected[] = load<{ expected?: Expected[] }>("expected.yaml", {}).expected ?? [];

  // Everything the timeline and measured set already know, by canonical id and by name.
  const known = new Set<string>();
  for (const f of ["chronology.yaml", "chronology-releases.yaml"]) {
    for (const m of YAML.parse(readFileSync(join(R, "data", f), "utf8")).milestones ?? []) { known.add(norm(m.id)); known.add(norm(m.name)); }
  }
  for (const m of YAML.parse(readFileSync(join(R, "data", "models.yaml"), "utf8")).models ?? []) { known.add(norm(m.id)); known.add(norm(m.name)); }
  const isKnown = (id: string, name: string) => known.has(norm(id)) || known.has(norm(name.replace(/^[^:]+:\s*/, "")));

  // Ids seen this run: canonical id -> what we learned.
  const found = new Map<string, { id: string; name: string; maker: string; released: string | null; sources: Set<string>; url: string; price?: string }>();
  function add(prefix: string, id: string, name: string, released: string | null, source: string, url: string, price?: string) {
    const maker = MAKERS[prefix];
    if (!maker || VARIANT.test(id) || NOISE.test(id)) return;
    const k = norm(id);
    const f = found.get(k) ?? { id: k, name: name.replace(/^[^:]+:\s*/, ""), maker, released, sources: new Set<string>(), url, price };
    f.sources.add(source);
    if (released && (!f.released || released < f.released)) f.released = released;
    if (price && !f.price) f.price = price;
    found.set(k, f);
  }

  // Which sources answered this run, and which did not.
  const read: string[] = [], failed: string[] = [];
  const note = (name: string, ok: unknown) => { (ok ? read : failed).push(name); };

  // 1. OpenRouter
  const or = await get("https://openrouter.ai/api/v1/models", "openrouter.json");
  note("OpenRouter", or);
  for (const m of or?.data ?? []) {
    const prefix = m.id.split("/")[0];
    const per = (x: string) => (+x * 1e6).toFixed(2);
    add(prefix, m.id, m.name, m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null, "openrouter", `https://openrouter.ai/${m.id}`,
      m.pricing?.prompt && +m.pricing.prompt >= 0 ? `$${per(m.pricing.prompt)} / $${per(m.pricing.completion)} per M tokens` : undefined);
  }
  // 2. models.dev, first-party providers only (resellers repeat the same models)
  const md = await get("https://models.dev/api.json", "models-dev.json");
  note("models.dev", md);
  // Each first-party provider also lists some models it merely hosts; keep ids that carry the maker's own family names.
  const OWN: Record<string, RegExp> = {
    openai: /^(gpt|o\d|chatgpt|codex)/, anthropic: /^claude/, google: /^(gemini|gemma)/, xai: /^grok/, deepseek: /^deepseek/,
    mistral: /^(mistral|ministral|codestral|devstral|magistral|pixtral|voxtral)/, moonshotai: /^kimi/, zai: /^glm/, alibaba: /^(qwen|qwq)/, minimax: /^minimax/,
  };
  for (const [p, own] of Object.entries(OWN)) {
    for (const m of Object.values<any>(md?.[p]?.models ?? {})) {
      if (!own.test(m.id) || (m.modalities?.output && !m.modalities.output.includes("text"))) continue;
      add(p, m.id, m.name ?? m.id, m.release_date ?? null, "models.dev", `https://models.dev/?search=${encodeURIComponent(m.id)}`);
    }
  }
  // 3. LiteLLM: keys carry a provider prefix only for some providers; map the bare first-party ids by shape.
  const ll = await get("https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json", "litellm.json");
  note("LiteLLM", ll);
  const llPrefix = (k: string, v: any) => {
    const p = String(v?.litellm_provider ?? "");
    if (p === "openai" || p === "anthropic" || p === "deepseek" || p === "mistral" || p === "xai" || p === "moonshot") return p === "xai" ? "x-ai" : p === "moonshot" ? "moonshotai" : p === "mistral" ? "mistralai" : p;
    if (p === "gemini" || p === "vertex_ai-language-models") return "google";
    return k.includes("/") ? k.split("/")[0] : "";
  };
  for (const [k, v] of Object.entries<any>(ll ?? {})) if (k !== "sample_spec") add(llPrefix(k, v), k, k, null, "litellm", "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json");
  // 4. Hugging Face, newest uploads per org; keep base releases, drop quantised and adapter repos
  const hfDown: string[] = [];
  for (const org of HF_ORGS) {
    const list = await get(`https://huggingface.co/api/models?author=${org}&sort=createdAt&direction=-1&limit=20`, `hf-${org}.json`);
    if (!list) hfDown.push(org);
    const prefix = { "meta-llama": "meta", "deepseek-ai": "deepseek", Qwen: "qwen", "zai-org": "z-ai", MiniMaxAI: "minimax", XiaomiMiMo: "xiaomi", CohereLabs: "cohere", "ibm-granite": "", allenai: "" }[org] ?? org;
    for (const m of list ?? []) {
      if (!m.createdAt || (m.tags ?? []).some((t: string) => /^(adapter|quantized|base_model:quantized|base_model:adapter|base_model:finetune)/.test(t))) continue;
      // Language models only: text and vision-language chat models, not image, speech, time-series or embedding models.
      if (!["text-generation", "image-text-to-text", "any-to-any"].includes(m.pipeline_tag)) continue;
      add(prefix, m.id, m.id.split("/")[1], m.createdAt.slice(0, 10), "huggingface", `https://huggingface.co/${m.id}`);
    }
  }

  if (hfDown.length < HF_ORGS.length) read.push("Hugging Face");
  if (hfDown.length) failed.push(`Hugging Face (${hfDown.join(", ")})`);

  // Changelog text, searched only for expected-model names.
  const pages: Array<{ where: string; url: string; text: string }> = [];
  for (const [where, url, name] of [
    ["Anthropic API release notes", "https://platform.claude.com/docs/en/release-notes/api.md", "anthropic-notes.md"],
    ["Gemini API changelog", "https://ai.google.dev/gemini-api/docs/changelog.md.txt", "gemini-changelog.md"],
    ["OpenAI news feed", "https://openai.com/news/rss.xml", "openai-news.xml"],
  ] as const) {
    const text = await get(url, name, "text");
    note(where, text);
    if (text) pages.push({ where, url, text: String(text).slice(0, 400000) });
  }

  // New ids: not seen before (or, on the first run, released since --since), from a watched maker, absent from the timeline.
  const fresh: Candidate[] = [];
  let newIds = 0;
  for (const f of found.values()) {
    const was = seen[f.id];
    if (!was) newIds++;
    if (!was) seen[f.id] = { first_seen: today, source: [...f.sources].join(","), name: f.name, ...(f.released ? { released: f.released } : {}) };
    const isNew = firstRun ? (f.released ?? "") >= since : !was;
    if (!isNew || isKnown(f.id, f.name) || prior.some((c) => c.id === f.id)) continue;
    // An id from LiteLLM alone has no date and is often a reseller alias; only keep it when it looks like a new version.
    if (f.sources.size === 1 && f.sources.has("litellm") && firstRun) continue;
    fresh.push({ id: f.id, name: f.name, maker: f.maker, released: f.released, first_seen: today, sources: [...f.sources].sort(), url: f.url, ...(f.price ? { price: f.price } : {}),
      ...(f.sources.size === 1 && f.sources.has("litellm") ? { note: "Only in LiteLLM's price map; entries there sometimes appear before launch and get pulled." } : {}) });
  }
  const candidates = [...prior.filter((c) => !isKnown(c.id, c.name)), ...fresh]
    .sort((a, b) => (b.released ?? b.first_seen).localeCompare(a.released ?? a.first_seen));

  // Stamp today's date only when the run found something, so a quiet day leaves the files as they were.
  const changes = checkExpected(expected, found.values(), pages, today, read.length > 0);
  const kept = candidates.filter((c) => !(load<{ ignore?: string[] }>("ignore.yaml", {}).ignore ?? []).includes(c.id));
  const dirty = changes.length > 0 || fresh.length > 0 || newIds > 0 || YAML.stringify(kept) !== YAML.stringify(priorFile.candidates ?? []);
  if (dirty) for (const e of expected) e.last_checked = today;

  writeFileSync(join(DIR, "seen.json"), JSON.stringify(Object.fromEntries(Object.entries(seen).sort()), null, 1) + "\n");
  writeFileSync(join(DIR, "candidates.yaml"),
    `# New models from watched makers that the release timeline lacks. Written by scripts/track-releases.ts.\n` +
    `# To accept one: read the date on the maker's own page and add it to data/chronology-releases.yaml. To reject: add its id to data/tracking/ignore.yaml.\n` +
    YAML.stringify({ updated: dirty ? today : priorFile.updated ?? today, candidates: kept }, { lineWidth: 0 }));
  if (expected.length) {
    const head = readFileSync(join(DIR, "expected.yaml"), "utf8").split("\n").filter((l) => l.startsWith("#")).join("\n");
    writeFileSync(join(DIR, "expected.yaml"), `${head}\n${YAML.stringify({ expected }, { lineWidth: 0 })}`);
  }

  // Summary for the pull request body.
  const lines = [`## Release tracker, ${today}`, ""];
  lines.push(sourceLine(read, failed, found.size), "");
  if (changes.length) lines.push("### Expected models", "", ...changes.map((c) => `- ${c}`), "");
  if (fresh.length) {
    lines.push(`### ${fresh.length} new model${fresh.length > 1 ? "s" : ""} not in the timeline`, "", "| Model | Maker | Released | Sources | Price |", "|---|---|---|---|---|");
    for (const c of fresh.slice(0, 60)) lines.push(`| [${c.name}](${c.url}) \`${c.id}\` | ${c.maker} | ${c.released ?? "?"} | ${c.sources.join(", ")} | ${c.price ?? ""} |`);
    if (fresh.length > 60) lines.push(``, `…and ${fresh.length - 60} more in data/tracking/candidates.yaml.`);
    lines.push("");
  }
  if (!changes.length && !fresh.length) lines.push("Nothing new.");
  lines.push("", "This job only proposes. Dates go into the timeline after a person reads them on the maker's page; measuring a model is the separate, manual `measure` workflow.");
  writeFileSync(join(DIR, "summary.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}

// Importing this file (tests) runs nothing.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
