# OpenAI Codex CLI

```bash
npx shibbo init codex
```

## What it writes

**Rules** go into `AGENTS.md`, which Codex reads natively, one file per directory from the repo root down.

**MCP**, in `.codex/config.toml`:

```toml
[mcp_servers.shibbo]
command = "npx"
args = ["shibbo", "mcp"]
```

Or for your user: `codex mcp add shibbo -- npx shibbo mcp`.

**Hook**, in `.codex/hooks.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "apply_patch", "hooks": [{ "type": "command", "command": "npx shibbo hook post-edit --for codex", "timeout": 30 }] }
    ]
  }
}
```

## How it works

Codex edits files through `apply_patch`, and the hook receives the patch text instead of a file path. Shibbo reads the paths from the patch's `*** Update File:` and `*** Add File:` lines, checks those files, and sends hits inside the added lines back as `hookSpecificOutput.additionalContext`.

## Caveats

- Project hooks and `.codex/config.toml` load only in trusted projects; approve the hook once in `/hooks`.
- The patch header format isn't spelled out on the hooks page. If a future version changes it, the hook goes quiet and never misreports.

Sources: [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [hooks](https://learn.chatgpt.com/docs/hooks).
