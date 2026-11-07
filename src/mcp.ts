// MCP server: lets any agent check its own drafts and pull rules for its model.
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { check, type Report } from "./check.js";
import { rulesMarkdown } from "./rules.js";
import { tells, graphite } from "./registry.js";
import type { FileKind } from "./text.js";

function summary(r: Report): string {
  const hits = r.findings.filter((f) => f.counted && f.severity > 0);
  const lines = [`score ${r.score}/100 [${r.band}], ${r.words} words, ${hits.length} hits`];
  for (const f of hits.slice(0, 40)) lines.push(`- line ${f.line}: ${f.id} "${f.match}" → ${f.fix ?? f.name}`);
  if (hits.length > 40) lines.push(`- …and ${hits.length - 40} more`);
  if (r.judge.length) lines.push("", "Also judge by reading:", ...r.judge.map((j) => `- ${j.id}: ${j.question}`));
  return lines.join("\n");
}

export async function serve() {
  const server = new McpServer({ name: "shibbo", version: "0.1.0" });
  const kinds = ["markdown", "text", "html", "css", "markup-code", "code"] as const;

  server.registerTool(
    "check_text",
    {
      title: "Check text for AI tells",
      description: "Score a draft (0-100, higher is cleaner) and list patterns that read as machine-made, with fixes. Call before presenting prose, docs, PR text or UI copy.",
      inputSchema: { text: z.string(), model: z.string().optional().describe("Model that wrote it, e.g. claude-opus-5-5"), kind: z.enum(kinds).optional() },
    },
    async ({ text, model, kind }) => ({ content: [{ type: "text", text: summary(check(text, "-", { model, kind: (kind as FileKind) ?? "markdown" })) }] }),
  );

  server.registerTool(
    "check_file",
    {
      title: "Check a file for AI tells",
      description: "Like check_text, for a file on disk. Markdown, HTML, CSS and JSX/TSX are understood.",
      inputSchema: { path: z.string(), model: z.string().optional() },
    },
    async ({ path, model }) => ({ content: [{ type: "text", text: summary(check(readFileSync(path, "utf8"), path, { model })) }] }),
  );

  server.registerTool(
    "rules",
    {
      title: "Writing rules for a model",
      description: "A short list of the tells this model over-uses most, with fixes, ranked by measured rates.",
      inputSchema: { model: z.string().optional(), domains: z.array(z.string()).optional() },
    },
    async ({ model, domains }) => ({ content: [{ type: "text", text: rulesMarkdown({ model, domains }) }] }),
  );

  server.registerTool(
    "tell",
    {
      title: "Look up one tell",
      description: "Full registry entry for a tell id, with per-model measurements.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const t = tells().find((x) => x.id === id);
      const g = graphite();
      const body = t ? { ...t, measured: g?.tells[id] ?? null, feature: g?.tellFeatures[id] ?? null } : { error: `unknown tell ${id}`, ids: tells().map((x) => x.id) };
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    },
  );

  await server.connect(new StdioServerTransport());
}
