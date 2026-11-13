import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeReply, judgeQuestions, judgeConfig, setJudgeFetch, clip, type FetchLike } from "../src/judge.js";
import { runHook } from "../src/hook.js";

// A reply that retells the work and says whether it worked last. No stock phrases, so the surface check passes it.
const buried = [
  "I started by reading the loader in src/load.ts, then traced the call into the parser, where the split used a comma.",
  "After that I looked at the two fixtures under test/fixtures and saw both of them still had tab characters in every row.",
  "I changed the split to use a tab and ran the parser by hand on the larger file to see what came out of it.",
  "Then I updated the fixtures so their header rows match the new column order and ran the whole test suite again twice.",
  "All 42 tests pass and the import now runs on the sample file.",
].join(" ");
const direct = [
  "The import now runs: all 42 tests pass and the sample file loads.",
  "The cause was the split in src/load.ts, which used a comma where the files use tabs.",
  "I changed it to a tab and updated the two fixtures under test/fixtures so their header rows match the new column order.",
  "I ran the parser by hand on the larger file as well, and every row came through with the right number of columns.",
  "One thing is left for you: the export script still writes commas, so a file it writes will not load until that changes too.",
].join(" ");

const answer = (failed: Record<string, string>, lead: string | null = null) => JSON.stringify({
  answers: Object.fromEntries(judgeQuestions().map((q) => [q.id, q.id in failed ? { pass: false, quote: failed[q.id], fix: "Lead with the result." } : { pass: true }])),
  rewrite_lead: lead,
});
const wrap = {
  anthropic: (text: string) => ({ content: [{ type: "text", text }], stop_reason: "end_turn" }),
  openai: (text: string) => ({ choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }] }),
  openrouter: (text: string) => ({ choices: [{ message: { role: "assistant", content: text } }], usage: { cost: 0 } }),
};
type Call = { url: string; headers: Record<string, string>; body: any };
function fake(body: unknown, status = 200): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  return { calls, fetch: async (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return { ok: status < 300, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) }; } };
}
const envFor = (p: keyof typeof wrap) => ({ SHIBBO_JUDGE: `${p}:some-model`, [`${p.toUpperCase()}_API_KEY`]: "test-key" });

test("the questions come from the registry's clarity group", () => {
  const ids = judgeQuestions().map((q) => q.id);
  assert.deepEqual(ids.sort(), ["buried-point", "hidden-actor", "private-labels", "report-buries-result", "unnatural-wording"]);
  assert.deepEqual(judgeQuestions(["agent"]).map((q) => q.id).sort(), ["private-labels", "report-buries-result"]);
});

test("SHIBBO_JUDGE names a provider and a model, or the judge is off", () => {
  assert.deepEqual(judgeConfig({ SHIBBO_JUDGE: "openrouter:google/some-model" }), { provider: "openrouter", model: "google/some-model" });
  assert.equal(judgeConfig({}), null);
  assert.equal(judgeConfig({ SHIBBO_JUDGE: "some-model" }), null);
});

test("a good response parses into a verdict, for each provider's shape", async () => {
  const text = answer({ "report-buries-result": "I started by reading the loader" }, "The import now runs and all 42 tests pass.");
  const urls = { anthropic: /api\.anthropic\.com\/v1\/messages$/, openai: /api\.openai\.com\/v1\/chat\/completions$/, openrouter: /openrouter\.ai\/api\/v1\/chat\/completions$/ };
  for (const p of ["anthropic", "openai", "openrouter"] as const) {
    const f = fake(wrap[p]("```json\n" + text + "\n```"));
    const v = await judgeReply(buried, { env: envFor(p), fetch: f.fetch });
    assert.ok(v, p);
    assert.deepEqual(v.failed, ["report-buries-result"], p);
    assert.equal(v.answers.length, 5, p);
    const bad = v.answers.find((a) => !a.pass)!;
    assert.equal(bad.quote, "I started by reading the loader");
    assert.equal(bad.fix, "Lead with the result.");
    assert.equal(v.rewrite_lead, "The import now runs and all 42 tests pass.");
    assert.equal(f.calls.length, 1);
    assert.match(f.calls[0].url, urls[p]);
    assert.equal(f.calls[0].body.model, "some-model");
    // Only the prompt, the questions and the reply go out.
    const sent = JSON.stringify(f.calls[0].body);
    assert.ok(sent.includes("I started by reading the loader") && sent.includes("report-buries-result"));
    assert.deepEqual(Object.keys(f.calls[0].body).sort(), p === "anthropic" ? ["max_tokens", "messages", "model", "system"] : p === "openai" ? ["max_completion_tokens", "messages", "model", "response_format"] : ["max_tokens", "messages", "model", "response_format"]);
  }
});

test("a fail without a quote from the reply counts as a pass", async () => {
  const f = fake(wrap.openai(answer({ "private-labels": "words that are nowhere in the reply", "hidden-actor": "" })));
  const v = await judgeReply(buried, { env: envFor("openai"), fetch: f.fetch });
  assert.deepEqual(v?.failed, []);
});

test("bad JSON gives null", async () => {
  const why: string[] = [];
  assert.equal(await judgeReply(buried, { env: envFor("openai"), fetch: fake(wrap.openai("Sure! The reply looks fine to me.")).fetch, onError: (w) => why.push(w) }), null);
  assert.equal(await judgeReply(buried, { env: envFor("openai"), fetch: fake(wrap.openai('{"answers": [1, 2]}')).fetch }), null);
  assert.equal(await judgeReply(buried, { env: envFor("anthropic"), fetch: fake("<html>bad gateway</html>").fetch }), null);
  assert.equal(await judgeReply(buried, { env: envFor("openai"), fetch: fake({ error: { message: "no such model" } }, 404).fetch, onError: (w) => why.push(w) }), null);
  assert.equal(why.length, 2);
  assert.match(why[1], /^HTTP 404 .*no such model/);
});

test("an error never carries the key", async () => {
  const why: string[] = [];
  const f = fake({ error: { message: "Incorrect API key provided: test-key" } }, 401);
  assert.equal(await judgeReply(buried, { env: envFor("openai"), fetch: f.fetch, onError: (w) => why.push(w) }), null);
  assert.ok(why[0].startsWith("HTTP 401") && !why[0].includes("test-key"));
});

test("a timeout gives null", async () => {
  let aborted = false;
  const hang: FetchLike = (_url, init) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => { aborted = true; rej(new Error("aborted")); }));
  const t0 = Date.now();
  assert.equal(await judgeReply(buried, { env: envFor("openai"), fetch: hang, timeoutMs: 40 }), null);
  assert.ok(aborted && Date.now() - t0 < 2000);
  // A fetch that ignores the abort signal still can't hold the hook.
  const deaf: FetchLike = () => new Promise(() => {});
  assert.equal(await judgeReply(buried, { env: envFor("openai"), fetch: deaf, timeoutMs: 40 }), null);
});

test("a missing key, a thrown fetch or an unset judge gives null without a call", async () => {
  const f = fake(wrap.openai(answer({})));
  assert.equal(await judgeReply(buried, { env: { SHIBBO_JUDGE: "openai:some-model" }, fetch: f.fetch }), null);
  assert.equal(await judgeReply(buried, { env: { SHIBBO_JUDGE: "openai:some-model", ANTHROPIC_API_KEY: "other" }, fetch: f.fetch }), null);
  assert.equal(await judgeReply(buried, { env: { OPENAI_API_KEY: "test-key" }, fetch: f.fetch }), null);
  assert.equal(await judgeReply(buried, { env: { SHIBBO_JUDGE: "some-model", OPENAI_API_KEY: "test-key" }, fetch: f.fetch }), null);
  assert.equal(f.calls.length, 0);
  assert.equal(await judgeReply(buried, { env: envFor("openai"), fetch: async () => { throw new Error("ECONNRESET"); } }), null);
});

test("a very long reply keeps its head and tail", () => {
  const long = "HEAD " + "x".repeat(40000) + " TAIL";
  const cut = clip(long);
  assert.ok(cut.length < 12000 && cut.startsWith("HEAD ") && cut.endsWith(" TAIL"));
  assert.equal(clip("short"), "short");
});

// The stop hook, run in-process with a fake fetch and captured stdout.
async function stop(input: Record<string, unknown>, env: Record<string, string | undefined>, f: FetchLike): Promise<string> {
  const keys = ["SHIBBO_JUDGE", "OPENAI_API_KEY", "SHIBBO_STOP", "SHIBBO_LOG", "SHIBBO_LOG_TEXT", "SHIBBO_MODEL"];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  const write = process.stdout.write;
  let got = "";
  process.stdout.write = ((chunk: string | Uint8Array) => { got += chunk.toString(); return true; }) as typeof process.stdout.write;
  setJudgeFetch(f);
  try { await runHook("stop", JSON.stringify(input), "claude"); }
  finally {
    process.stdout.write = write;
    setJudgeFetch(null);
    for (const k of keys) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; }
  }
  return got;
}
const on = { SHIBBO_JUDGE: "openai:some-model", OPENAI_API_KEY: "test-key" };
const buriedVerdict = wrap.openai(answer({ "report-buries-result": "I started by reading the loader" }, "The import now runs and all 42 tests pass."));

test("the stop hook blocks a reply that buries its result", async () => {
  const logFile = join(mkdtempSync(join(tmpdir(), "shibbo-judge-")), "log.jsonl");
  const f = fake(buriedVerdict);
  const got = JSON.parse(await stop({ last_assistant_message: buried }, { ...on, SHIBBO_LOG: logFile }, f.fetch));
  assert.equal(got.decision, "block");
  assert.match(got.reason, /^shibbo: a reader would trip on this reply \(a report that retells the work before the result\)/);
  assert.match(got.reason, /- "I started by reading the loader" \(report-buries-result\) → Lead with the result\./);
  assert.match(got.reason, /Open with something like: The import now runs and all 42 tests pass\.$/);
  assert.equal(f.calls.length, 1);
  const line = JSON.parse(readFileSync(logFile, "utf8").trim());
  assert.deepEqual(line.judge, { failed: ["report-buries-result"] });
  assert.equal(line.held, true);
  assert.ok(!JSON.stringify(line).includes("test-key"));
});

test("the stop hook blocks on two failed questions and passes on one that is not the buried result", async () => {
  const two = fake(wrap.openai(answer({ "hidden-actor": "the split used a comma", "private-labels": "the loader" })));
  assert.equal(JSON.parse(await stop({ last_assistant_message: buried }, on, two.fetch)).decision, "block");
  const one = fake(wrap.openai(answer({ "private-labels": "the loader" })));
  assert.equal(await stop({ last_assistant_message: buried }, on, one.fetch), "");
});

test("the stop hook passes a reply that leads with the result", async () => {
  const logFile = join(mkdtempSync(join(tmpdir(), "shibbo-judge-")), "log.jsonl");
  const f = fake(wrap.openai(answer({})));
  assert.equal(await stop({ last_assistant_message: direct }, { ...on, SHIBBO_LOG: logFile }, f.fetch), "");
  assert.equal(f.calls.length, 1);
  const line = JSON.parse(readFileSync(logFile, "utf8").trim());
  assert.deepEqual(line.judge, { failed: [] });
  assert.equal(line.held, false);
});

test("the stop hook does nothing extra when SHIBBO_JUDGE is unset", async () => {
  const logFile = join(mkdtempSync(join(tmpdir(), "shibbo-judge-")), "log.jsonl");
  const f = fake(buriedVerdict);
  assert.equal(await stop({ last_assistant_message: buried }, { OPENAI_API_KEY: "test-key", SHIBBO_LOG: logFile }, f.fetch), "");
  assert.equal(f.calls.length, 0);
  assert.ok(!("judge" in JSON.parse(readFileSync(logFile, "utf8").trim())));
});

test("the stop hook never calls the judge under 80 words, when stop_hook_active is set, or when SHIBBO_STOP is off", async () => {
  const f = fake(buriedVerdict);
  const short = buried.split(" ").slice(0, 70).join(" ") + ".";
  assert.equal(await stop({ last_assistant_message: short }, on, f.fetch), "");
  assert.equal(await stop({ last_assistant_message: buried, stop_hook_active: true }, on, f.fetch), "");
  assert.equal(await stop({ last_assistant_message: buried }, { ...on, SHIBBO_STOP: "off" }, f.fetch), "");
  assert.equal(f.calls.length, 0);
});

test("a judge failure never blocks, and the log says why", async () => {
  const logFile = join(mkdtempSync(join(tmpdir(), "shibbo-judge-")), "log.jsonl");
  assert.equal(await stop({ last_assistant_message: buried }, { ...on, SHIBBO_LOG: logFile }, fake({ error: { message: "no such model" } }, 404).fetch), "");
  const line = JSON.parse(readFileSync(logFile, "utf8").trim());
  assert.equal(line.judge, null);
  assert.match(line.judge_error, /^HTTP 404/);
  assert.equal(line.held, false);
});

test("SHIBBO_STOP=warn notes the verdict without blocking", async () => {
  const got = JSON.parse(await stop({ last_assistant_message: buried }, { ...on, SHIBBO_STOP: "warn" }, fake(buriedVerdict).fetch));
  assert.equal(got.decision, undefined);
  assert.match(got.hookSpecificOutput.additionalContext, /a reader would trip/);
});
