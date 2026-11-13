# Harnesses

`shibbo init <harness>` writes the rules, the MCP server entry and any hooks the harness supports into your project. The rules open with a [Say it clearly](/concepts/clarity) section, then list the writing tells and agent habits to avoid. Run it from the repo root. It merges into existing files, keeps the hooks you already have, and never overwrites a file it can't parse.

```bash
npx shibbo init cursor --model claude-opus-5-5   # rules tuned for the model you use in Cursor
npx shibbo init codex --dry-run                   # show what it would write
```

## Support table

Checked against each harness's own documentation on 7 November 2026.

| Harness | `init` id | Rules file | MCP | After-edit check | Reply check |
|---|---|---|---|---|---|
| [Claude Code](/harnesses/claude-code) | `claude` | `CLAUDE.md` | `.mcp.json` | yes | yes |
| [OpenAI Codex CLI](/harnesses/codex) | `codex` | `AGENTS.md` | `.codex/config.toml` | yes | no |
| [Cursor](/harnesses/cursor) | `cursor` | `AGENTS.md` | `.cursor/mcp.json` | experimental | no |
| [GitHub Copilot](/harnesses/copilot) | `copilot` | `AGENTS.md` | `.vscode/mcp.json`, `.mcp.json` | experimental | no |
| [Gemini CLI](/harnesses/gemini-cli) | `gemini` | `GEMINI.md` | `.gemini/settings.json` | yes | yes |
| [Devin Desktop (Windsurf)](/harnesses/windsurf) | `devin` | `AGENTS.md` | `.devin/mcp_config.json` | experimental | no |
| [Cline](/harnesses/cline) | `cline` | `AGENTS.md` | settings UI | yes | no |
| [Roo Code](/harnesses/cline#roo-code) | `roo` | `AGENTS.md` | `.roo/mcp.json` | no hooks | no |
| [Aider](/harnesses/aider) | `aider` | `CONVENTIONS.md` | not supported | yes, via `lint-cmd` | no |
| [Kiro](/harnesses/others#kiro) | `kiro` | `AGENTS.md` | `.kiro/settings/mcp.json` | experimental | no |
| [JetBrains Junie](/harnesses/others#jetbrains-junie) | `junie` | `AGENTS.md` | `.junie/mcp/mcp.json` | user config only | no |
| [Amp](/harnesses/others#amp) | `amp` | `AGENTS.md` | `.amp/settings.json` | plugin | no |
| [OpenCode](/harnesses/others#opencode) | `opencode` | `AGENTS.md` | `opencode mcp add` | not confirmed | no |
| [Goose](/harnesses/others#goose) | `goose` | `AGENTS.md` | user config | no | no |
| [Zed](/harnesses/others#zed) | `zed` | `AGENTS.md` | user settings | no hooks | no |
| [Continue](/harnesses/others#continue) | `continue` | `.continue/rules/` | `.continue/mcpServers/` | no hooks | no |
| [Warp](/harnesses/others#warp) | `warp` | `AGENTS.md` | `.warp/.mcp.json` | no hooks | no |

**Experimental** means the harness documents the hook but not every field shibbo reads. `init` marks these; if nothing comes back after an edit, fall back to the rules line that asks the agent to call `check_text`.

## One rules file for most of them

Codex, Cursor, Copilot, Devin Desktop, Cline, Roo, Amp, Goose, Junie, Kiro, OpenCode and Warp all read `AGENTS.md` natively. Claude Code reads it when no `CLAUDE.md` exists, or through an `@AGENTS.md` line inside `CLAUDE.md`. Gemini CLI needs `context.fileName` set to include it; Aider needs `read: AGENTS.md`. So if your team uses several harnesses, `npx shibbo export agents` covers most of them at once.

## Choosing the model for the rules

The rule block ranks tells by what one model over-uses. Pass the model you use most with `--model`. If your team mixes models, leave it out: the block then covers the tells every measured model shares.
