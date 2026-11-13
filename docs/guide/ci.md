# Check in CI

## GitHub Actions

```yaml
# .github/workflows/shibbo.yml
name: shibbo
on: [pull_request]
jobs:
  shibbo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx shibbo check README.md docs src/pages --threshold 80 --format github
```

`--format github` prints annotations, so hits appear on the changed lines of the pull request. `--threshold 80` fails the job when any file scores under 80.

## pre-commit

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: shibbo
        name: shibbo
        entry: npx shibbo check --threshold 80 --quiet
        language: system
        files: \.(md|mdx|html|css)$
```

## Vale

If your team already runs [Vale](https://vale.sh), export shibbo's pattern rules as a Vale style:

```bash
npx shibbo export vale --out .   # writes styles/Shibbo/*.yml
```

Then add `BasedOnStyles = Shibbo` to `.vale.ini`. Vale gets the pattern rules only; the measured phrase list and the density and statistical checks stay in `shibbo check`.

## What to check

Gate what people read: README, docs, changelogs, and the pages and stylesheets of your site. Source files get the code rules alone (emoji in logs, a blanket `except`). No human baseline backs a code score, so report those files and leave them out of a failing gate.
