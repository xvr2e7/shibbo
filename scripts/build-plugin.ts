// Bundle the engine + data into plugins/shibbo so the Claude Code plugin runs without npm install.
//   npm run plugin
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "../src/registry.js";
import { rulesMarkdown } from "../src/rules.js";

const R = root();
const P = join(R, "plugins", "shibbo");
const version = JSON.parse(readFileSync(join(R, "package.json"), "utf8")).version;

rmSync(join(P, "bin"), { recursive: true, force: true });
rmSync(join(P, "data"), { recursive: true, force: true });
mkdirSync(join(P, "data", "measured"), { recursive: true });

await build({
  entryPoints: [join(R, "src/cli.ts")],
  outfile: join(P, "bin", "shibbo.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  legalComments: "none",
  logLevel: "warning",
});

for (const f of ["tells.yaml", "sources.yaml", "models.yaml"]) cpSync(join(R, "data", f), join(P, "data", f));
cpSync(join(R, "data/measured/graphite.json"), join(P, "data/measured/graphite.json"));
cpSync(join(R, "data/raw/graphite/LICENSE"), join(P, "data/measured/GRAPHITE-LICENSE"));

writeFileSync(join(P, ".claude-plugin", "plugin.json"), JSON.stringify({
  name: "shibbo",
  version,
  description: "Checks prose, docs and UI that Claude writes for tells that read as machine-made, using measured per-model data.",
  license: "MIT",
  keywords: ["writing", "lint", "style", "ai-slop", "docs"],
}, null, 2) + "\n");

writeFileSync(join(P, "hooks", "hooks.json"), JSON.stringify({
  hooks: {
    SessionStart: [{ hooks: [{ type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs" hook session-start', timeout: 10 }] }],
    PostToolUse: [{ matcher: "Write|Edit|MultiEdit", hooks: [{ type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs" hook post-edit', timeout: 15 }] }],
    Stop: [{ hooks: [{ type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs" hook stop', timeout: 15 }] }],
  },
}, null, 2) + "\n");

writeFileSync(join(P, ".mcp.json"), JSON.stringify({
  mcpServers: { shibbo: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs", "mcp"] } },
}, null, 2) + "\n");

const skill = `---
name: shibbo
description: Check and rewrite prose, docs, PR text, READMEs or UI copy for patterns that read as machine-made. Use when writing anything a person will read, when the user asks to remove "AI slop" or make text sound less generated, or when a shibbo hook reports hits.
---

# shibbo

Run the checker on what you wrote, then fix what it finds.

\`\`\`bash
node "\${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs" check <file-or-dir> --model <your model id>
node "\${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs" show <tell-id>      # evidence and fix for one tell
node "\${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs" rules --model <id>  # the list below, for another model
\`\`\`

Hits come in two kinds:

- **Rules** (an id like \`contrastive-negation\`): a curated pattern with a fix. Rewrite the sentence; don't just swap a synonym, since bans move to the nearest substitute.
- **Measured phrases**: n-grams a model uses far more than people, from Graphite's 2026 study. Rephrase unless the phrase is the plainest way to say it.

Leave quotes, code, names and deliberate style alone. A clean score is a floor. Specific nouns, real numbers and a point of view matter more than avoiding a list.

${rulesMarkdown({ limit: 14, phrases: 0 }).replace("Check with `npx shibbo check <file>`.", "")}
`;
mkdirSync(join(P, "skills", "shibbo"), { recursive: true });
writeFileSync(join(P, "skills", "shibbo", "SKILL.md"), skill);

console.log(`plugin: ${P} (v${version})`);
