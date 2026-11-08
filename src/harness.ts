// What each agent harness reads, and how shibbo plugs into it.
// Facts verified against each harness's docs on 2026-11-07 (see docs/harnesses). Anything the docs left open is
// marked `experimental` and printed for the user to check, never written silently.
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { upsertBlock } from "./export.js";
import { rulesMarkdown } from "./rules.js";

export type HookFlavor = "claude" | "codex" | "cursor" | "gemini" | "copilot" | "devin" | "cline" | "kiro" | "junie";

const MCP = { command: "npx", args: ["shibbo", "mcp"] };
const hook = (event: string, flavor: HookFlavor) => `npx shibbo hook ${event}${flavor === "claude" ? "" : ` --for ${flavor}`}`;

interface Step {
  kind: "rules" | "mcp" | "hooks" | "note";
  file?: string;
  /** Merge into a JSON file at this path of keys. */
  json?: { path: string[]; value: unknown };
  write?: string;
  executable?: boolean;
  text?: string;
  experimental?: boolean;
}

export interface Harness {
  id: string;
  name: string;
  steps: (rules: string) => Step[];
}

export const HARNESSES: Harness[] = [
  {
    id: "claude",
    name: "Claude Code",
    steps: () => [
      { kind: "rules", file: "CLAUDE.md" },
      { kind: "mcp", file: ".mcp.json", json: { path: ["mcpServers", "shibbo"], value: MCP } },
      {
        kind: "hooks",
        file: ".claude/settings.json",
        json: {
          path: ["hooks"],
          value: {
            SessionStart: [{ hooks: [{ type: "command", command: hook("session-start", "claude"), timeout: 10 }] }],
            PostToolUse: [{ matcher: "Write|Edit|MultiEdit", hooks: [{ type: "command", command: hook("post-edit", "claude"), timeout: 15 }] }],
            Stop: [{ hooks: [{ type: "command", command: hook("stop", "claude"), timeout: 15 }] }],
          },
        },
      },
      { kind: "note", text: "Or install the plugin, which bundles the same hooks: /plugin marketplace add xvr2e7/shibbo, then /plugin install shibbo@shibbo." },
    ],
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "mcp", file: ".codex/config.toml", write: `\n[mcp_servers.shibbo]\ncommand = "npx"\nargs = ["shibbo", "mcp"]\n` },
      {
        kind: "hooks",
        file: ".codex/hooks.json",
        json: { path: ["hooks"], value: { PostToolUse: [{ matcher: "apply_patch", hooks: [{ type: "command", command: hook("post-edit", "codex"), timeout: 30 }] }] } },
      },
      { kind: "note", text: "Codex runs project hooks and .codex/config.toml only in trusted projects; approve the hook in /hooks." },
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "mcp", file: ".cursor/mcp.json", json: { path: ["mcpServers", "shibbo"], value: { type: "stdio", ...MCP } } },
      {
        kind: "hooks",
        file: ".cursor/hooks.json",
        json: { path: ["hooks", "postToolUse"], value: [{ matcher: "Write", command: hook("post-edit", "cursor") }] },
        experimental: true,
      },
      { kind: "note", text: "Cursor documents the postToolUse input fields only in general terms; if the hook stays silent after edits, tell the agent in AGENTS.md to call the check_text tool." },
    ],
  },
  {
    id: "copilot",
    name: "GitHub Copilot (VS Code, CLI and coding agent)",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "mcp", file: ".vscode/mcp.json", json: { path: ["servers", "shibbo"], value: { type: "stdio", ...MCP } } },
      { kind: "mcp", file: ".mcp.json", json: { path: ["mcpServers", "shibbo"], value: MCP } },
      {
        kind: "hooks",
        file: ".github/hooks/shibbo.json",
        json: { path: [], value: { version: 1, hooks: { postToolUse: [{ type: "command", bash: hook("post-edit", "copilot"), timeoutSec: 30 }] } } },
        experimental: true,
      },
      { kind: "note", text: "The cloud coding agent takes MCP servers from Repo Settings → Copilot → MCP servers, with \"tools\": [\"*\"]." },
    ],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    steps: () => [
      { kind: "rules", file: "GEMINI.md" },
      { kind: "mcp", file: ".gemini/settings.json", json: { path: ["mcpServers", "shibbo"], value: MCP } },
      {
        kind: "hooks",
        file: ".gemini/settings.json",
        json: {
          path: ["hooks"],
          value: {
            AfterTool: [{ matcher: "write_file|replace", hooks: [{ name: "shibbo-check", type: "command", command: hook("post-edit", "gemini"), timeout: 30000 }] }],
            AfterAgent: [{ hooks: [{ name: "shibbo-reply", type: "command", command: hook("stop", "gemini"), timeout: 30000 }] }],
          },
        },
      },
    ],
  },
  {
    id: "devin",
    name: "Devin Desktop (formerly Windsurf)",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "mcp", file: ".devin/mcp_config.json", json: { path: ["mcpServers", "shibbo"], value: MCP } },
      {
        kind: "hooks",
        file: ".devin/hooks.v1.json",
        json: { path: ["PostToolUse"], value: [{ matcher: "write|edit|apply_patch", hooks: [{ type: "command", command: hook("post-edit", "devin") }] }] },
        experimental: true,
      },
      { kind: "note", text: "Devin Desktop also imports Claude Code hooks from .claude/settings.json." },
    ],
  },
  {
    id: "cline",
    name: "Cline",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      {
        kind: "hooks",
        file: ".clinerules/hooks/PostToolUse",
        write: `#!/usr/bin/env bash\n# shibbo: check prose files Cline edits; findings reach the model on its next request.\nexec ${hook("post-edit", "cline")}\n`,
        executable: true,
      },
      { kind: "note", text: "Enable hooks in Cline settings (or: cline config set hooks-enabled=true). Add the MCP server under MCP Servers → Configure: command npx, args [\"shibbo\", \"mcp\"]." },
    ],
  },
  {
    id: "roo",
    name: "Roo Code",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "mcp", file: ".roo/mcp.json", json: { path: ["mcpServers", "shibbo"], value: { ...MCP, alwaysAllow: ["check_text", "check_file", "rules", "tell"], disabled: false } } },
      { kind: "note", text: "Roo Code has no hooks, so the rules ask the agent to call check_text. The project was archived in May 2026." },
    ],
  },
  {
    id: "aider",
    name: "Aider",
    steps: () => [
      { kind: "rules", file: "CONVENTIONS.md" },
      { kind: "note", text: "Add to .aider.conf.yml:\n  read: [CONVENTIONS.md]\n  lint-cmd:\n    - \"markdown: npx shibbo check --threshold 80\"\n  auto-lint: true\nAider runs it on each edited Markdown file and sends any failure back to the model." },
    ],
  },
  {
    id: "kiro",
    name: "Kiro",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "mcp", file: ".kiro/settings/mcp.json", json: { path: ["mcpServers", "shibbo"], value: { ...MCP, disabled: false, autoApprove: [] } } },
      {
        kind: "hooks",
        file: ".kiro/hooks/shibbo.json",
        json: { path: [], value: { version: "v1", hooks: [{ name: "shibbo-check", trigger: "PostFileSave", matcher: "\\.(md|mdx|html)$", action: { type: "command", command: hook("post-edit", "kiro") } }] } },
        experimental: true,
      },
    ],
  },
  {
    id: "junie",
    name: "JetBrains Junie",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "mcp", file: ".junie/mcp/mcp.json", json: { path: ["mcpServers", "shibbo"], value: { ...MCP, env: {} } } },
      { kind: "note", text: `Junie CLI reads hooks from ~/.junie/config.json only. Add a PostToolUse hook whose command is "${hook("post-edit", "junie")}".` },
    ],
  },
  {
    id: "amp",
    name: "Amp",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "mcp", file: ".amp/settings.json", json: { path: ["amp.mcpServers", "shibbo"], value: MCP } },
      { kind: "note", text: "Approve the workspace server once: amp mcp approve shibbo." },
    ],
  },
  {
    id: "opencode",
    name: "OpenCode",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "note", text: "Add the MCP server with: opencode mcp add shibbo -- npx shibbo mcp" },
    ],
  },
  {
    id: "goose",
    name: "Goose",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "note", text: "Add the extension: goose session --with-extension \"npx shibbo mcp\", or add it under extensions in ~/.config/goose/config.yaml." },
    ],
  },
  {
    id: "zed",
    name: "Zed",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "note", text: "Zed reads AGENTS.md only when none of .rules, .cursorrules, .windsurfrules, .clinerules, .github/copilot-instructions.md or AGENT.md exist. Add the server to your settings: \"context_servers\": { \"shibbo\": { \"command\": \"npx\", \"args\": [\"shibbo\", \"mcp\"], \"env\": {} } }" },
    ],
  },
  {
    id: "continue",
    name: "Continue",
    steps: () => [
      { kind: "rules", file: ".continue/rules/shibbo.md" },
      { kind: "mcp", file: ".continue/mcpServers/shibbo.yaml", write: "name: shibbo\nversion: 0.0.1\nschema: v1\nmcpServers:\n  - name: shibbo\n    type: stdio\n    command: npx\n    args: [\"shibbo\", \"mcp\"]\n" },
    ],
  },
  {
    id: "warp",
    name: "Warp",
    steps: () => [
      { kind: "rules", file: "AGENTS.md" },
      { kind: "mcp", file: ".warp/.mcp.json", json: { path: ["mcpServers", "shibbo"], value: MCP } },
    ],
  },
];

const AGENT_LINE = "\n\nAfter writing prose a person will read (docs, READMEs, PR text, UI copy), call the shibbo `check_text` tool or run `npx shibbo check <file>`, and fix what it reports.";

function setPath(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  if (!path.length) return { ...obj, ...(value as Record<string, unknown>) };
  let cur: Record<string, unknown> = obj;
  for (const k of path.slice(0, -1)) {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = path.at(-1)!;
  const prev = cur[last];
  if (prev && typeof prev === "object" && !Array.isArray(prev) && value && typeof value === "object" && !Array.isArray(value)) cur[last] = { ...prev, ...value };
  else cur[last] = value;
  return obj;
}

export interface InitResult { file?: string; action: string; experimental?: boolean }

/** Apply a harness's steps under `dir`. Never overwrites a file it can't parse; reports that instead. */
export function init(id: string, opts: { dir: string; model: string | null; dryRun: boolean }): InitResult[] {
  const h = HARNESSES.find((x) => x.id === id);
  if (!h) throw new Error(`unknown harness "${id}". Known: ${HARNESSES.map((x) => x.id).join(", ")}`);
  const rules = rulesMarkdown({ model: opts.model, limit: 10, phrases: 8 }) + AGENT_LINE;
  const out: InitResult[] = [];
  for (const step of h.steps(rules)) {
    if (step.kind === "note") { out.push({ action: `note: ${step.text}` }); continue; }
    const p = join(opts.dir, step.file!);
    if (step.kind === "rules") {
      if (step.file!.endsWith("shibbo.md") && !opts.dryRun) {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, `---\nname: shibbo writing rules\nalwaysApply: true\n---\n\n${rules}\n`);
        out.push({ file: step.file, action: "wrote rules" });
      } else out.push({ file: step.file, action: opts.dryRun ? "would add rules block" : `${upsertBlock(p, rules)} rules block` });
      continue;
    }
    if (step.write !== undefined) {
      const exists = existsSync(p);
      if (exists && readFileSync(p, "utf8").includes("shibbo")) { out.push({ file: step.file, action: "already set up", experimental: step.experimental }); continue; }
      if (!opts.dryRun) {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, (exists && step.file!.endsWith(".toml") ? readFileSync(p, "utf8") : "") + step.write);
        if (step.executable) chmodSync(p, 0o755);
      }
      out.push({ file: step.file, action: opts.dryRun ? "would write" : exists ? "appended" : "created", experimental: step.experimental });
      continue;
    }
    if (step.json) {
      let obj: Record<string, unknown> = {};
      if (existsSync(p)) {
        try { obj = JSON.parse(readFileSync(p, "utf8")); } catch { out.push({ file: step.file, action: "skipped: existing file is not plain JSON (comments?); add the shibbo entry by hand", experimental: step.experimental }); continue; }
      }
      const existed = existsSync(p);
      const next = setPath(obj, step.json.path, step.json.value);
      if (!opts.dryRun) {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, JSON.stringify(next, null, 2) + "\n");
      }
      out.push({ file: step.file, action: opts.dryRun ? "would merge" : existed ? "merged" : "created", experimental: step.experimental });
    }
  }
  return out;
}
