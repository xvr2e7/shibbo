# Read a report

```text
docs/intro.md: 71/100 [light] (530 words, 2 hits in shibbo-ignore blocks)
  12:5     high contrastive-negation     "isn't a library, it's"
                → State the real claim. Keep a contrast only when someone holds the other view.
  20:33    low  measured                 "the practical takeaway"
                → "the practical takeaway" (Claude Opus 5 used it 293 times in Graphite's articles; people, never)
```

## The score

The score falls as hits pile up per 1,000 words; [Scoring](/concepts/scoring) has the formula. The bands:

| Score | Band | Reading |
|---|---|---|
| 80 to 100 | clean | Fine to ship. One or two hits may still be worth a look. |
| 60 to 79 | light | A few tells. A quick edit pass fixes them. |
| 40 to 59 | moderate | Generated in places. |
| 20 to 39 | heavy | Generated throughout. |
| 0 to 19 | saturated | Rewrite it from scratch. |

On Graphite's held-out articles, one human article in nine still scored under 80. Treat a low score as a reason to reread the draft.

## The hits

Each line shows the line and column, the weight (`high`, `med`, `low`), the tell's id, and the matched text. The arrow line is the fix. Two kinds of hits appear:

- **Rules** carry an id such as `contrastive-negation`. They come from the curated registry and catch a pattern in any wording. Look one up with `shibbo show <id>` or in the [field guide](/../#/tells).
- **Measured** hits are phrases that one model writes many times more often than people, from Graphite's study. They're weaker evidence on their own and weigh less. Sometimes the phrase is the plainest way to say it, and then it should stay.

## Notes and judge questions

`--all` also prints hits that stayed under their density limit (one “crucial” in a long page counts for nothing; four do) and a few questions for a human or an agent to answer by reading, such as “are three-item lists used where one or two items would carry the point?”. Patterns can't settle those.

## Fixing well

Swapping a flagged word for a synonym rarely helps: bans move to the nearest substitute, and the registry tracks those too. Rewrite the sentence around what you mean, usually by naming the specific thing, number or person.
