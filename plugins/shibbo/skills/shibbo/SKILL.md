---
name: shibbo
description: Check and rewrite prose, docs, PR text, READMEs or UI copy for patterns that read as machine-made. Use when writing anything a person will read, when the user asks to remove "AI slop" or make text sound less generated, or when a shibbo hook reports hits.
---

# shibbo

Run the checker on what you wrote, then fix what it finds.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs" check <file-or-dir> --model <your model id>
node "${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs" show <tell-id>      # evidence and fix for one tell
node "${CLAUDE_PLUGIN_ROOT}/bin/shibbo.mjs" rules --model <id>  # the list below, for another model
```

Hits come in two kinds:

- **Rules** (an id like `contrastive-negation`): a curated pattern with a fix. Rewrite the sentence; don't just swap a synonym, since bans move to the nearest substitute.
- **Measured phrases**: n-grams a model uses far more than people, from Graphite's 2026 study. Rephrase unless the phrase is the plainest way to say it.

Leave quotes, code, names and deliberate style alone. A clean score is a floor. Specific nouns, real numbers and a point of view matter more than avoiding a list.

## Writing tells to avoid

Readers spot these patterns as machine-made. Write the plain version instead.

- "It's not X, it's Y" / "not just X, but Y" → State the real claim. Keep a contrast only when someone holds the other view. Instead of "This isn't a tool, it's a philosophy", write "The tool enforces one rule: every commit runs the tests".
- "less like X and more like Y" → Describe Y on its own terms. Instead of "It feels less like a library and more like a language", write "It ships its own syntax and compiler".
- "rather than treating", "not simply whether" → Say what to do. Skip the straw version.
- "This comprehensive guide will walk you through" → Cut the paragraph. Start with the first real point.
- "That distinction matters", "Why X matters" → Show what goes wrong without it. Readers will see that it matters.
- "genuinely", "a genuine", "is a genuinely" → Delete it. If the claim needs it to be believed, add evidence instead. Instead of "This is a genuinely useful tool", write "This tool saved us a day per release".
- "the single most", "the most consequential" → Drop the ranking, or back it with the comparison.
- "X stops being Y and starts being Z" → Describe the change and when it happens.
- "Whether you're a beginner or an expert" → Write for one reader.
- "plays a pivotal role", "marks a turning point" → Show the effect. Readers will judge the size.
- No contractions → Contract where you would in speech.
- "The practical takeaway", "In practice", "trade-off is" → Drop the label and give the takeaway.
- "a particular kind of", "exactly the kind of" → Name the kind.
- "It's important to note", "It's worth noting" → Delete the preamble. The point stands without it.

Prefer: specific nouns and numbers, contractions where speech would use them, one reader in mind, and endings that stop when the information does.


