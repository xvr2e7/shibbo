# Report format

`shibbo check --format json` prints one report per file (an array when there are several). The Node API returns the same object.

```json
{
  "file": "README.md",
  "kind": "markdown",
  "words": 662,
  "score": 87,
  "band": "clean",
  "penalty": 4,
  "suppressed": 5,
  "findings": [
    {
      "id": "contrastive-negation",
      "name": "\"It's not X, it's Y\" / \"not just X, but Y\"",
      "severity": 3,
      "origin": "registry",
      "line": 12, "col": 5, "offset": 431,
      "match": "isn't a library, it's",
      "fix": "State the real claim. Keep a contrast only when someone holds the other view.",
      "counted": true
    }
  ],
  "judge": [{ "id": "triads", "question": "Are three-item lists used where one or two items would carry the point?" }]
}
```

| Field | Meaning |
|---|---|
| `score` | 0 to 100; see [Scoring](/concepts/scoring) |
| `band` | `clean` 80+, `light` 60+, `moderate` 40+, `heavy` 20+, `saturated` |
| `penalty` | Sum of the weights of counted hits |
| `suppressed` | Hits inside `shibbo-ignore` blocks, not scored |
| `findings[].origin` | `registry` for curated rules, `lexicon` for measured phrases |
| `findings[].counted` | `false` when a density rule stayed under its rate |
| `findings[].model`, `ratio` | For measured phrases: the model that over-uses it, and by how much |
| `judge` | Questions to answer by reading, from tells no pattern can settle. For prose, the three from [Say it clearly](/concepts/clarity) are always among them |
