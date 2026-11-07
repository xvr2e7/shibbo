# Command line

```bash
npx shibbo <command> [options]
```

| Command | Does |
|---|---|
| `check <files \| dirs \| ->` | Score files and list hits with fixes |
| `rules` | Print a rule block for a prompt |
| `init <harness>` | Set up rules, MCP and hooks for a harness |
| `export <target>` | Write the rule block into one file format |
| `show <id>` | One tell with its evidence |
| `list` | All tells |
| `models` | Measured models and release months |
| `mcp` | Start the MCP server on stdio |
| `hook <event>` | Hook entry point for harnesses (reads JSON on stdin) |

## check

```bash
shibbo check README.md docs/ --threshold 80
cat draft.md | shibbo check - --kind markdown
```

| Option | Default | Does |
|---|---|---|
| `--model <id>` | `$SHIBBO_MODEL` | Weigh the phrases this model over-uses more heavily |
| `--threshold <n>` | `0` | Exit 1 when any file scores under `n` |
| `--format <f>` | `text` | `text`, `json` or `github` (Actions annotations) |
| `--all` | off | Also print hits under their density limit, and reader questions |
| `--kind <k>` | from extension | For stdin: `markdown`, `text`, `html`, `css`, `code` |
| `--no-lexicon` | off | Curated rules only, without measured phrases |
| `--disable <ids>` | none | Skip these tell ids, comma-separated |
| `-q`, `--quiet` | off | Print only files under the threshold |

Folders are walked recursively, skipping `node_modules`, `.git`, `dist`, `build` and hidden folders. Exit status: 0 when every file meets the threshold, 1 when one doesn't, 2 on errors.

## rules

```bash
shibbo rules --model gpt-6 --limit 10 --phrases 8
```

| Option | Default | Does |
|---|---|---|
| `--model <id>` | none | Rank tells by this model's measured rates |
| `--domain <list>` | `prose,chat` | Which kinds of tells to include |
| `--limit <n>` | `14` | How many rules |
| `--phrases <n>` | `12` | How many measured phrases to list, when a model is given |

## init

```bash
shibbo init <harness> [--model <id>] [--dir <path>] [--dry-run]
```

Harness ids: `claude`, `codex`, `cursor`, `copilot`, `gemini`, `devin`, `cline`, `roo`, `aider`, `kiro`, `junie`, `amp`, `opencode`, `goose`, `zed`, `continue`, `warp`. See the [support table](/harnesses/).

## export

```bash
shibbo export <claude | agents | cursor | vale> [--model <id>] [--out <dir>]
```

`claude`, `agents` and `cursor` write a marked block that later runs replace. `vale` writes one Vale rule per pattern tell into `styles/Shibbo/`.

## hook

```bash
shibbo hook <session-start | post-edit | stop> [--for <harness>]
```

Reads the harness's hook JSON on stdin and prints its feedback format. `--for` accepts `claude` (default), `codex`, `cursor`, `gemini`, `copilot`, `devin`, `cline`, `kiro`, `junie`. You rarely call this yourself: `init` writes the commands.
