# Check in CI

## GitHub Actions

```yaml
# .github/workflows/prose.yml
name: prose
on: [pull_request]
jobs:
  shibbo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx shibbo check README.md docs --threshold 80 --format github
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
        files: \.(md|mdx|html)$
```

## Vale

If your team already runs [Vale](https://vale.sh), export shibbo's pattern rules as a Vale style:

```bash
npx shibbo export vale --out .   # writes styles/Shibbo/*.yml
```

Then add `BasedOnStyles = Shibbo` to `.vale.ini`. Vale gets the pattern rules only; the measured phrase list and the density and statistical checks stay in `shibbo check`.

## What to check

Check the prose people read: README, docs, changelogs, landing pages. Code files only get the code rules (emoji in logs, blanket `except`), which are low-confidence; leave them out of a failing gate.
