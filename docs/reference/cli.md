# Command line

```bash
npx shibbo <command> [options]
```

| Command | Does |
|---|---|
| `check <files \| dirs \| ->` | Score files and list hits with fixes |
| `rules` | Print the rule block for an instructions file |
| `init <harness>` | Set up rules, MCP and hooks for a harness |
| `export <target>` | Write the rule block into one file format |
| `show <id>` | One tell with its evidence |
| `list` | All tells; filter with `--domain` or `--status` |
| `models` | Measured models and release months |
| `mcp` | Start the MCP server on stdio |
| `hook <event>` | Hook entry point for harnesses (reads JSON on stdin) |
| `doctor` | Report on this install and on what the project has set up |
| `--version` | Print the installed version |

## check

```bash
shibbo check README.md docs/ --threshold 80
cat draft.md | shibbo check - --kind markdown
```

| Option | Default | Does |
|---|---|---|
| `--model <id>` | `$SHIBBO_MODEL` | Weigh the phrases this model over-uses more heavily |
| `--threshold <n>` | `0` | Exit 1 when any file scores under `n`. A value that isn't a number exits 2 |
| `--format <f>` | `text` | `text`, `json` or `github` (Actions annotations) |
| `--all` | off | Also print hits under their density limit, and the questions to judge by reading |
| `--kind <k>` | from extension | For stdin: `markdown`, `text`, `html`, `css`, `code` |
| `--no-lexicon` | off | Curated rules only, without measured phrases |
| `--disable <ids>` | none | Skip these tell ids, comma-separated |
| `-q`, `--quiet` | off | Print only files under the threshold |

The file's extension picks the rules: prose tells for Markdown and text, prose and interface tells for HTML, interface tells for CSS, interface and code tells for JSX, TSX, Vue, Svelte and Astro, and code tells for other source files.

Folders are walked recursively, skipping `node_modules`, `.git`, `dist`, `build` and hidden folders. Exit status: 0 when every file meets the threshold, 1 when one doesn't, 2 on errors.

## rules

```bash
shibbo rules --model gpt-6 --limit 10 --phrases 8
```

| Option | Default | Does |
|---|---|---|
| `--model <id>` | none | Rank tells by this model's measured rates |
| `--domain <list>` | `prose,chat` | Which tells to rank: `prose`, `chat`, `code`, `ui`, `agent` |
| `--limit <n>` | `14` | How many rules |
| `--phrases <n>` | `12` | How many measured phrases to list, when a model is given |

The block opens with a [Say it clearly](/concepts/clarity) section and, unless `--domain` leaves out `agent`, closes its list with six agent habits.

## init

```bash
shibbo init <harness> [--model <id>] [--dir <path>] [--dry-run]
```

`init` merges into existing config files, and hooks you already have stay. Harness ids: `claude`, `codex`, `cursor`, `copilot`, `gemini`, `devin`, `cline`, `roo`, `aider`, `kiro`, `junie`, `amp`, `opencode`, `goose`, `zed`, `continue`, `warp`. See the [support table](/harnesses/).

## export

```bash
shibbo export <claude | agents | cursor | vale> [--model <id>] [--out <dir>]
```

`claude` and `agents` write a marked block that later runs replace, and its first line records the version that wrote it. `cursor` writes a whole file. `vale` writes one Vale rule per pattern tell into `styles/Shibbo/`.

## hook

```bash
shibbo hook <session-start | post-edit | stop> [--for <harness>]
```

Reads the harness's hook JSON on stdin and prints its feedback format. `--for` accepts `claude` (default), `codex`, `cursor`, `gemini`, `copilot`, `devin`, `cline`, `kiro`, `junie`. You rarely call this yourself: `init` writes the commands.

## doctor

```bash
shibbo doctor [--dir <path>] [--offline] [--json]
```

| Option | Default | Does |
|---|---|---|
| `--dir <path>` | `.` | The project to inspect |
| `--offline` | off | Skip the lookup of the newest version on npm |
| `--json` | off | Print the report as JSON |

`doctor` prints the version that runs and where it runs from, then four groups of checks:

| Group | Checks |
|---|---|
| Install | Whether npm has a newer version; Node 20 or later; the data loads; the checker finds the tells in a sample sentence |
| Project | Each file `init` writes: rules, MCP server and hooks. Warns when a harness has some of its files and lacks others, and when a rule block was written by an older version |
| Claude Code plugin | The installed plugin version, with a warning when the plugin and `.claude/settings.json` both run the hooks |
| Settings | `SHIBBO_EDIT` or `SHIBBO_STOP` set to `off`, other `SHIBBO_` variables in effect, and the last line of the `SHIBBO_LOG` file |

Exit status is 1 when a check fails: Node is too old, the data doesn't load or the checker finds nothing. Warnings exit 0. The npm lookup sends the package name and nothing else. See [Update and diagnose](/guide/updating).
