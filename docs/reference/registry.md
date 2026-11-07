# Registry schema

`data/tells.yaml` holds one entry per tell: a pattern that models use at a very different rate from people.

```yaml
- id: corrective-rather-than        # kebab-case, never renamed
  name: '"rather than treating", "not simply whether"'
  label: '"rather than treating"'   # optional short name for charts
  domain: prose                     # prose | chat | code | ui
  kind: structural                  # lexical | structural | visual | behavioral
  severity: 2                       # 0 advisory (never scored), 1 low, 2 medium, 3 high
  what: Defines a view by the wrong view it replaces.
  detect:
    method: regex                   # regex | stat | judge
    pattern: '\brather than (?:treating|presenting|assuming)\b'   # JavaScript regex source
    flags: i                        # optional; default "i"
    density: {count: 2, per: 300}   # optional; count hits only past this rate
    judge: Is a view defined by a straw version of another?        # optional question for a reader
  measure:
    graphite: [rather than treating, than treating]   # exact terms in Graphite's tables
    graphite_feature: layer5__hedge_stack_mean_per_sent  # or a per-article style feature
    graphite_absent: ["it's"]       # for tells of absence (people use it, models don't)
  era: {first_seen: 2025, peak: unknown}
  status: rising                    # rising | peaking | steady | fading | retired
  substitutes: [contrastive-negation]   # what it turns into once banned (ids or plain text)
  fix: Say what to do. Skip the straw version.
  examples: {bad: "...", good: "..."}
  false_positives: When a real person holds the other view.
  confidence: high                  # high | medium | low
  sources: [graphite-2026]          # keys in data/sources.yaml
```

## Notes on the fields

The `measure` block links a tell to data, and `npm run import:graphite` attaches per-model rates from it. Tells differ by model family and change between versions, so a tool should load the rules for the model doing the writing, which is what `shibbo rules --model <id>` returns.

Use `substitutes` to record where a pattern goes once people ban it. Purple gradients gave way to cream and terracotta.
<!-- shibbo-ignore-next-line -->
"It's not X, it's Y" gave way to "less like X, more like Y". A substitute on the rise is the next entry.

Set `status` from data where data exists. A tell moves to `fading` once it drops in every family that used it, and to `retired` once current models stop producing it above the human rate.

Use `confidence` to separate measured tells from ones people complain about but nobody has counted. Folk tells belong in the file too, marked `low` until measured.

Set `severity: 0` for advice that the test showed to be unreliable. The flat sentence-length check is one: on Graphite's articles it fired on people about as often as on models, so it reports but never scores.

## Quoted examples

To quote a tell without being scored for it, wrap the passage:

```markdown
<!-- shibbo-ignore -->
"Delve" gave away GPT-4 in 2024.
<!-- /shibbo-ignore -->
```

`<!-- shibbo-ignore-next-line -->` covers one line. Reports always print how many hits these blocks held back.
