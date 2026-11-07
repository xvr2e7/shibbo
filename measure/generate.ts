// Send the fixed prompt set to a Claude model and save the outputs as JSONL.
//
//   npx tsx measure/generate.ts --model claude-opus-5-5 [--limit 30] [--dry-run]
//
// This spends API credit (about 30 requests of ~1,200 output tokens each). Outputs from other providers can be
// produced with their own tools and saved in the same JSONL shape: {"model","topic","text","stop_reason"}.
//
// No refusal fallback on purpose: a fallback would swap in another model's text and corrupt the measurement.
// Refusals are recorded and skipped by the analyzer.
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { root } from "../src/registry.js";

const { values } = parseArgs({ options: { model: { type: "string", default: "claude-opus-5-5" }, limit: { type: "string" }, "dry-run": { type: "boolean", default: false } } });
const R = root();
const spec = YAML.parse(readFileSync(join(R, "measure/prompts.yaml"), "utf8")) as { version: number; instruction: string; topics: string[] };
const topics = spec.topics.slice(0, values.limit ? +values.limit : undefined);
const model = values.model!;
const day = new Date().toISOString().slice(0, 10);
const dir = join(R, "measure", "runs", model);
const out = join(dir, `${day}.jsonl`);

if (values["dry-run"]) {
  console.log(`would send ${topics.length} prompts to ${model} and write ${out}`);
  console.log(`first prompt:\n${spec.instruction}\n\nTitle: ${topics[0]}`);
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
const done = new Set(existsSync(out) ? readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).topic) : []);
const client = new Anthropic();

for (const topic of topics) {
  if (done.has(topic)) continue;
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      messages: [{ role: "user", content: `${spec.instruction}\n\nTitle: ${topic}` }],
    });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    appendFileSync(out, JSON.stringify({ model, topic, prompts_version: spec.version, text, stop_reason: response.stop_reason, usage: response.usage }) + "\n");
    console.log(`${response.stop_reason === "end_turn" ? "ok     " : response.stop_reason!.padEnd(7)} ${topic}`);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error(`rate limited on "${topic}"; rerun later to resume`);
      break;
    } else if (error instanceof Anthropic.APIError) {
      console.error(`API error ${error.status} on "${topic}": ${error.message}`);
    } else throw error;
  }
}
console.log(`saved to ${out}`);
