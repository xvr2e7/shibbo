# Add or change a tell

Tells live in `data/tells.yaml`, one entry each. The [registry schema](/reference/registry) lists every field.

## Before you add one

A tell needs evidence that models use the pattern at a different rate from people. Measured evidence (Graphite's tables, a paper, a `measure/` report) earns `confidence: high`. Patterns people complain about but nobody has counted belong in the file too, marked `confidence: low`.

## Steps

1. Add the entry with an `id`, a pattern under `detect`, a `fix`, and an example pair.
2. Link it to measured terms with `measure.graphite` if Graphite's tables contain them, then run `npm run import:graphite`.
3. Check it against human writing. `npm run eval -- <articles.jsonl.gz>` prints how often each rule fires on human and on model articles in the train half. A rule that fires on people nearly as often as on models needs a narrower pattern, or `severity: 0` so it reports without scoring.
4. Run `npm test`.

## Changing a rule

Keep the `id`. Other tools refer to it in `--disable` lists and ignore settings. If a tell turns into a different pattern, add the new one and list it under the old one's `substitutes`.
