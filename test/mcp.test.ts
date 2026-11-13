import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { build } from "../src/mcp.js";

const BAD = "This is a genuinely useful approach. That distinction matters. It is not a refactor, it is a rethink.";

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([build().connect(a), client.connect(b)]);
  return client;
}
const text = (r: Awaited<ReturnType<Client["callTool"]>>) => (r.content as Array<{ text: string }>)[0].text;

test("the server reports the package version and four read-only tools", async () => {
  const client = await connect();
  assert.equal(client.getServerVersion()?.version, JSON.parse(readFileSync("package.json", "utf8")).version);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["check_file", "check_text", "rules", "tell"]);
  for (const t of tools) assert.deepEqual(t.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, t.name);
  await client.close();
});

test("each tool answers", async () => {
  const client = await connect();
  assert.match(text(await client.callTool({ name: "check_text", arguments: { text: BAD } })), /^score \d+\/100 .*contrastive-negation/s);
  const file = join(mkdtempSync(join(tmpdir(), "shibbo-mcp-")), "doc.md");
  writeFileSync(file, `# Notes\n\n${BAD}\n`);
  assert.match(text(await client.callTool({ name: "check_file", arguments: { path: file } })), /contrastive-negation/);
  assert.ok((await client.callTool({ name: "check_file", arguments: { path: join(file, "missing") } })).isError);
  assert.match(text(await client.callTool({ name: "rules", arguments: { model: "claude-opus-5-5", domains: ["prose"] } })), /\S/);
  assert.equal(JSON.parse(text(await client.callTool({ name: "tell", arguments: { id: "contrastive-negation" } }))).id, "contrastive-negation");
  const unknown = JSON.parse(text(await client.callTool({ name: "tell", arguments: { id: "no-such-tell" } })));
  assert.match(unknown.error, /unknown tell no-such-tell/);
  assert.ok(unknown.ids.includes("contrastive-negation"));
  await client.close();
});
