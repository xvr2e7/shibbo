# Read a report

The example below is a Markdown file. A page, stylesheet or source file gets the same report with interface or code tells in it.

```text
docs/intro.md: 58/100 [moderate] (134 words, 1 hits in shibbo-ignore blocks)
  13:6     high contrastive-negation     "isn't a library, it's"
                → State the real claim. Keep a contrast only when someone holds the other view.
  23:4     low  measured                 "Next steps"
                → "next steps" (GPT-5 uses it 8.3× as often as human writers)
  25:77    low  measured                 "useful"
                → "useful" (GPT-6 Astra uses it 17× as often as human writers)
```

## The score

The score falls as hits pile up per 1,000 words; [Scoring](/concepts/scoring) has the formula. The bands:

| Score | Band | Reading |
|---|---|---|
| 80 to 100 | clean | Fine to ship. Still read any hits it lists. |
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

`--all` also prints hits that stayed under their density limit (one “crucial” in a long page counts for nothing; four do) and the questions a person or an agent must answer by reading. Patterns can't settle those. For prose, the list always holds the three questions from [Say it clearly](/concepts/clarity): is the one who acts the subject, would a person use these words, and does the first sentence give the point? A file can score 100 and still fail them.

## Fixing well

Swapping a flagged word for a synonym rarely helps: bans move to the nearest substitute, and the registry tracks those too. Rewrite the sentence around what you mean, usually by naming the specific thing, number or person.
