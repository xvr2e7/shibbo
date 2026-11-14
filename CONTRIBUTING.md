# Contributing

Four kinds of help move the project most. Each has an issue form and a guide.

| You want to | Start here |
|---|---|
| Report a tell shibbo misses | [Suggest a tell](https://github.com/xvr2e7/shibbo/issues/new?template=suggest-a-tell.yml), or add it yourself with [Add or change a tell](docs/guide/add-a-tell.md) |
| Report a rule that fires on your own writing | [Bug report](https://github.com/xvr2e7/shibbo/issues/new?template=bug-report.yml). Paste the sentence and the rule id |
| Measure a model with your own API key | [Measure a new model](docs/guide/measure.md) |
| Point to a study or list shibbo doesn't cite | [Missing source](https://github.com/xvr2e7/shibbo/issues/new?template=missing-source.yml) |

## Set up

Shibbo needs Node 20 or later.

```bash
npm install
npm test && npm run validate
```

`npm run shibbo -- check <file>` runs the checker from source. `npm run web:dev` starts the atlas.

## Pull requests

- Every tell needs a fix and at least one source. `npm run validate` checks both.
- A prose rule must fire on models more often than on people. The [tell guide](docs/guide/add-a-tell.md) has the test.
- Keep a tell's `id` if its rule changes. Other people's settings refer to it.
- Run `npx shibbo check` on any docs you touch.

Small pull requests get merged fastest. For a large change, open an issue first so we can agree on the shape.
