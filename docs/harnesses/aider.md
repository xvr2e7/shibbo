# Aider

Aider has no MCP support, but its lint loop suits shibbo well: after each edit, Aider runs the lint command on the edited file and sends any failure back to the model.

```bash
npx shibbo init aider   # writes CONVENTIONS.md and prints the config below
```

```yaml
# .aider.conf.yml
read: [CONVENTIONS.md]
lint-cmd:
  - "markdown: npx shibbo check --threshold 80"
auto-lint: true
```

## How it works

Aider runs the command once per edited Markdown file, from the repo root, with the file's path appended. `--threshold 80` makes shibbo exit with status 1 when the file scores under 80; Aider then shows the report to the model with "Fix any errors below". Add a line per language for other file types, such as `"html: npx shibbo check --threshold 80"`.

Aider doesn't read `AGENTS.md` by itself; add it under `read:` if your project keeps rules there.

Sources: [conventions](https://aider.chat/docs/usage/conventions.html), [lint and test](https://aider.chat/docs/usage/lint-test.html), [options](https://aider.chat/docs/config/options.html).
