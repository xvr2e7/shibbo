# Command line

```bash
npx shibbo <command> [options]
```

## check

```bash
shibbo check <files | folders | ->
```

Reads Markdown, plain text, HTML, stylesheets and JSX. Code blocks, inline code and URLs are skipped. On HTML, the visible text gets the prose rules and the markup gets the UI rules.

| Option | Does |
|---|---|
| `--model <id>` | Weights the phrases that model over-uses. Accepts ids like `claude-opus-5-5` or `gpt-6`. |
| `--threshold <n>` | Exit with status 1 when any file scores under `n`. |
| `--format json` | One report object per file. |
| `--format github` | Annotations for GitHub Actions. |
| `--all` | Also show hits that stayed under their density limit. |
| `--no-lexicon` | Curated rules only, without the measured phrase list. |
| `--disable a,b` | Skip these tell ids. |

## rules

```bash
shibbo rules --model gpt-6 --limit 10
```

Prints a short block of rules for a prompt, ranked by what that model over-uses most.

## export

```bash
shibbo export claude    # writes a block into CLAUDE.md
shibbo export agents    # AGENTS.md
shibbo export cursor    # .cursor/rules/shibbo.mdc
shibbo export vale      # styles/Shibbo/*.yml for Vale
```

Exports are idempotent: running one again replaces its block and leaves the rest of the file alone.

## show, list, models

`shibbo show <id>` prints one tell with its evidence. `shibbo list --status rising` lists tells. `shibbo models` lists the measured models and their release months.

## Quoting a tell on purpose

Wrap quoted examples so they don't count against you. Every report prints how many hits these blocks held back.

```markdown
<!-- shibbo-ignore -->
"Delve" gave away GPT-4 in 2024.
<!-- /shibbo-ignore -->
```
