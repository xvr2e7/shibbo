# AI Tells - data downloads

Companion data for Graphite's *AI Tells* (2026):
https://graphite.io/five-percent/research/ai-tells

Every file covers the same 9,974 topics. For each topic there is one human
article and one article per model.

Corpora, as slug and name:

```
  human                   Human
  gpt41                   GPT-4.1
  gpt5                    GPT-5
  gpt-5-6-sol             GPT-5.6 Sol
  gpt-6-astra             GPT-6 Astra
  claude-opus-4-20250514  Claude Opus 4
  claude-opus-4-6         Claude Opus 4.6
  claude-opus-5           Claude Opus 5
  claude-opus-5-5         Claude Opus 5.5
  gemini-2-5-pro          Gemini 2.5 Pro
  gemini-3-1-pro-preview  Gemini 3.1 Pro
```

## 1. `ai_tells_tells_vs_human.csv.gz`

One row per term and model, comparing that model against human writing.

```
  kind            "ngram" or "frame". In a frame, _ marks the gap.
  term            the n-gram or frame
  n_tokens        length. In a frame each `_` counts as one token.
  model           corpus slug of the model side
  used_more_by    which side uses it more, the model slug or "human"
  model_count     raw occurrences in the model articles
  model_articles  distinct model articles containing it
  model_rate_per1k_positions
                  occurrences per 1,000 positions, model side
  human_count     raw occurrences in the human articles
  human_articles  distinct human articles containing it
  human_rate_per1k_positions
                  occurrences per 1,000 positions, human side
  ratio           rate of the side in `used_more_by` over the other side's
                  rate. `inf` where the other side never uses the term.
  lift            frames only. The ratio divided by the best ratio any single
                  word inside the frame reaches alone.
```

Rates are occurrences per 1,000 positions of that length. The denominator
differs by kind: n-grams count raw-token positions, frames count masked-token
positions.

## 2. `ai_tells_features.csv.gz`

One row per stylistic feature, averaged over the paired articles.

```
  feature                    a per1k suffix means per 1,000 words
  <corpus>_mean              mean per article, one column per corpus slug
  <model>_cohens_d_vs_human  (model mean - human mean) / pooled SD. A
                             positive value means the model scores higher.
```

Paragraph features are not included.

## 3. `ai_tells_articles.jsonl.gz`

One JSON object per line, one line per topic:

```
{"url": "...", "human": "...", "gpt41": "...", ...}
```

Text as collected and as sent to the models, before any cleaning.

## License

We release our measurements (files 1 and 2) under CC BY 4.0. You may use them
for anything, including commercial work, if you give credit.

```
Graphite, "AI Tells" (2026). https://graphite.io/five-percent/research/ai-tells
```

File 3 is not covered. It contains the full text of third-party web pages.
Copyright stays with the publishers. It also contains model output, which is
governed by each provider's terms. See LICENSE.

Each article in file 3 carries its source URL. If you own a page and want it
removed, contact greg@graphitehq.com.
