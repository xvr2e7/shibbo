import { test } from "node:test";
import assert from "node:assert/strict";
import { check } from "../src/check.js";
import { rank, rulesMarkdown } from "../src/rules.js";
import { resolveModel, matchModel, graphite, tells } from "../src/registry.js";
import { proseFromHtml, proseFromMarkdown } from "../src/text.js";
import { toRe2 } from "../src/export.js";

const hit = (text: string, id: string) => check(text, "-", { only: [id], lexicon: false, kind: "markdown" }).findings.length > 0;

test("every registry pattern compiles and every id is unique", () => {
  const ids = new Set<string>();
  for (const t of tells()) {
    assert.ok(!ids.has(t.id), `duplicate ${t.id}`);
    ids.add(t.id);
    if (t.detect.method === "regex") assert.doesNotThrow(() => new RegExp(t.detect.pattern!, [...new Set((t.detect.flags ?? "i") + "g")].join("")), t.id);
  }
});

test("contrastive negation: model forms hit, ordinary human forms don't", () => {
  for (const s of ["This isn't a tool, it's a philosophy.", "It is not a bug, it is a feature.", "It's not about speed — it's about trust.", "That's not laziness; it's focus.", "It's not about speed. It's about trust."]) assert.ok(hit(s, "contrastive-negation"), s);
  for (const s of ["It's not rocket science, but it takes practice.", "This not only saves money, but time.", "It wasn't raining, so we walked.", "The fix was simple: restart it."]) assert.ok(!hit(s, "contrastive-negation"), s);
});

test("density rules only count past their rate", () => {
  const one = check("This is genuinely useful. ".padEnd(400, "word "), "-", { only: ["genuinely"], lexicon: false });
  assert.equal(one.findings.filter((f) => f.counted).length, 0);
  const two = check("This is genuinely useful. It is a genuine win.", "-", { only: ["genuinely"], lexicon: false });
  assert.equal(two.findings.filter((f) => f.counted).length, 2);
});

test("markdown code, inline code and URLs are not checked as prose", () => {
  const md = "Plain text.\n\n```\nlet us delve into it\n```\n\nSee `delve()` at https://x.y/delve.\n";
  assert.ok(!/delve/.test(proseFromMarkdown(md)));
  assert.equal(check(md, "a.md", { lexicon: false }).findings.length, 0);
});

test("html: visible text is prose, scripts and styles are not, offsets are kept", () => {
  const html = '<style>.a{color:red}</style><p>Let us delve in.</p><script>delve()</script>';
  const prose = proseFromHtml(html);
  assert.equal(prose.length, html.length);
  assert.equal((prose.match(/delve/g) ?? []).length, 1);
});

test("ui rules read the raw markup", () => {
  assert.ok(check('<div class="bg-gradient-to-r from-indigo-500 to-blue-500"></div>', "x.html").findings.some((f) => f.id === "purple-gradient"));
  assert.ok(check("h1{font-family: Inter, sans-serif}", "x.css").findings.some((f) => f.id === "inter-everywhere"));
});

test("ignore blocks suppress hits and report the count", () => {
  const r = check("<!-- shibbo-ignore -->\nLet's delve in.\n<!-- /shibbo-ignore -->\n", "a.md", { lexicon: false });
  assert.equal(r.findings.length, 0);
  assert.equal(r.suppressed, 1);
});

test("sloppy text scores far below plain text", () => {
  const slop = "In today's fast-paced digital landscape, caching isn't just a trick — it's a philosophy. This comprehensive guide will walk you through it. At its core, caching is genuinely transformative. That distinction matters.";
  const plain = "We moved sessions to Redis in March. Deploys used to log everyone out. Now a restart costs two seconds of slower requests, and that's it.";
  assert.ok(check(slop, "-").score < 30);
  assert.equal(check(plain, "-").score, 100);
});

test("model ids resolve, including unmeasured newer ids", () => {
  assert.equal(resolveModel("claude-opus-5-5")?.id, "claude-opus-5.5");
  assert.equal(resolveModel("claude-fable-5-1")?.id, "claude-opus-5.5");
  assert.equal(resolveModel("gpt-6")?.id, "gpt-6-astra");
  assert.equal(resolveModel("gemini-9-ultra")?.family, "gemini");
  assert.equal(resolveModel("llama-4"), null);
});

test("an unmeasured model borrows its family's rules but gets no own-model weight", () => {
  assert.equal(matchModel("claude-opus-5-5")?.exact, true);
  assert.equal(matchModel("claude-fable-5-1")?.exact, false);
  const g = graphite()!;
  const term = g.models["claude-opus-5.5"].lexicon[0].term;
  const text = `We met on Monday. ${term}. Then we left.`;
  const sev = (model: string) => check(text, "-", { model }).findings.find((f) => f.origin === "lexicon" && f.model === "claude-opus-5.5")?.severity ?? 0;
  assert.ok(sev("claude-opus-5-5") > 0, term);
  assert.equal(sev("claude-opus-5-5"), sev("claude-fable-5-1") * 8);
});

test("interface and code hits are scored against the whole file", () => {
  const rule = ".card { border-left: 4px solid #6366f1; }\n";
  const filler = Array.from({ length: 400 }, (_, i) => `.item-${i} { margin: 0; padding: 0; color: inherit; }`).join("\n");
  const small = check(rule, "a.css"), large = check(rule + filler, "a.css");
  assert.ok(small.findings.length > 0, "the stripe rule should hit");
  assert.equal(large.findings.length, small.findings.length);
  assert.ok(large.score > small.score, `${large.score} > ${small.score}`);
  assert.ok(large.words > 1000);
});

test("rules are ranked per model", () => {
  const claude = rank({ model: "claude-opus-5" }).map((r) => r.tell.id);
  const gpt = rank({ model: "gpt-6-astra" }).map((r) => r.tell.id);
  assert.ok(claude.indexOf("less-x-more-y") < claude.length);
  assert.ok(gpt.indexOf("corrective-rather-than") < gpt.indexOf("less-x-more-y") || !gpt.includes("less-x-more-y"));
  assert.match(rulesMarkdown({ model: "gpt-6" }), /GPT-6 Astra/);
});

test("vale export skips patterns RE2 can't run", () => {
  assert.equal(toRe2("(?<=a)b"), null);
  assert.equal(toRe2("\\bdelve\\b"), "\\bdelve\\b");
});

test("triads: phrase and clause lists of three hit; names, longer lists and lead-in clauses don't", async () => {
  const { findTriads } = await import("../src/triads.js");
  const n = (s: string) => findTriads(s).length;
  assert.equal(n("People spot AI work: a stock phrase, a purple gradient, a comment that narrates the code."), 1);
  assert.equal(n("It records each tell with its sources, measures which models over-use it, and checks your work."), 1);
  assert.equal(n("Interface tells render as mockups, code tells mark the bad lines, and agent tells replay the exchange."), 1);
  assert.equal(n("It checks your prose, code and interfaces."), 1);
  assert.equal(n("Thankfully, technology has improved and those days are behind us."), 0);
  assert.equal(n("We flew to Paris, Rome and Berlin."), 0);
  assert.equal(n("Bring apples, pears, plums and figs."), 0);
  assert.equal(n("I want jeans for summer, so I don't want jeans that are heavy or stiff."), 0);
  assert.equal(n("A stock phrase in an essay, say, or a purple gradient on a page."), 0);
});
