import { test } from "node:test";
import assert from "node:assert/strict";
import { matchers, checkExpected, sourceLine, norm } from "../scripts/track-releases.js";

const expected = () => [{
  id: "gpt-6-2", name: "GPT-6.2", maker: "OpenAI", status: "rumoured" as const, match: ["gpt[-. ]?6[-.]2"], claim: "",
  source: { title: "", url: "", date: "2026-10-01", kind: "press" }, first_seen: "2026-10-01", expires: "2026-11-01", last_checked: "2026-10-20",
}];
const found = (id: string) => [{ id: norm(id), name: id, sources: new Set(["litellm"]), url: "u" }];

test("a dated snapshot of another model is no sighting", () => {
  const [r] = matchers(["gpt[-. ]?6[-.]2"]);
  assert.ok(!r.test("gpt-6-2026-09-03"));
  assert.ok(!r.test("gpt-6-20260903"));
  assert.ok(r.test("gpt-6.2-astra"));
  assert.ok(r.test("GPT-6.2"));
  assert.ok(r.test("gpt-6-2-2026-09-03"));
  const e = expected();
  assert.deepEqual(checkExpected(e, found("gpt-6-2026-09-03"), [], "2026-10-25", true), []);
  assert.equal(e[0].sighting, undefined);
  assert.equal(checkExpected(e, found("gpt-6.2-astra"), [], "2026-10-25", true).length, 1);
  assert.equal(e[0].sighting?.id, "gpt-6-2-astra");
});

test("nothing expires on a day no source answered, and a quiet run leaves the entry as it was", () => {
  const e = expected();
  assert.deepEqual(checkExpected(e, [], [], "2026-11-12", false), []);
  assert.deepEqual(e, expected());
  assert.match(checkExpected(e, [], [], "2026-11-12", true)[0], /marked expired/);
  assert.equal(e[0].status, "expired");
});

test("a changelog page can carry the sighting", () => {
  const e = expected();
  checkExpected(e, [], [{ where: "OpenAI news feed", url: "u", text: "Today we launch GPT-6.2 for all." }], "2026-10-25", true);
  assert.equal(e[0].sighting?.where, "OpenAI news feed");
});

test("the summary names the sources that failed", () => {
  assert.equal(sourceLine(["OpenRouter"], ["LiteLLM", "Hugging Face (Qwen)"], 3), "Sources read: OpenRouter. No answer from: LiteLLM, Hugging Face (Qwen). 3 ids from watched makers.");
  assert.equal(sourceLine(["OpenRouter"], [], 3), "Sources read: OpenRouter. 3 ids from watched makers.");
});
