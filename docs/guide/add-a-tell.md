# Add or change a tell

Tells live in `data/tells.yaml` and the files in `data/tells.d/`, one entry each, in any of four layers: prose, interface, code or behavior. The [registry schema](/reference/registry) lists every field.

## Before you add one

A tell needs evidence that models use the pattern at a different rate from people. Measured evidence (Graphite's tables, a paper, a `measure/` report) earns `confidence: high`. Patterns people complain about but nobody has counted belong in the file too, marked `confidence: low`.

## Steps

1. Add the entry with an `id`, a pattern under `detect`, a `fix`, and an example pair. An interface, code or behavior tell also takes a `specimen` that shows it; `npm run validate` warns without one. If no pattern can find the tell, use `method: judge` and write the question a reader should ask.
2. Link it to measured terms with `measure.graphite` if Graphite's tables contain them, then run `npm run import:graphite`.
3. For a prose tell, check it against human writing. `npm run eval -- <articles.jsonl.gz>` prints how often each rule fires on human and on model articles in the train half. A rule that fires on people nearly as often as on models needs a narrower pattern, or `severity: 0` so it reports without scoring.
4. Run `npm test` and `npm run validate`.

## Changing a rule

Keep the `id`. Other tools refer to it in `--disable` lists and ignore settings. If a tell turns into a different pattern, add the new one and list it under the old one's `substitutes`.
