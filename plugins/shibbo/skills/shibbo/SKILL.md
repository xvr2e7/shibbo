---
name: shibbo
description: Write prose and build interfaces that don't read as machine-made. Use when writing anything a person will read (docs, PR text, READMEs, UI copy), when building or restyling a page, screen or component, when the user asks to remove "AI slop", or when a shibbo hook reports hits.
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

## Say it clearly

A reader should never have to decode you. This holds for files you write and for every message you send.

- Make the actor the subject and the action the verb. Write "She walked up to the counter and asked for a refund" for "Upon arrival at the counter, a request for a refund was made".
- Use the name people use. Unpack a stack of nouns into a clause. Write "The kids opened a lemonade stand on the corner" for "The kids opened a beverage retailer on the corner".
- Put the point first. Cut each sentence that adds no fact. Write "The cache is the cause" for "There are several factors worth weighing here, and the picture is nuanced. Ultimately the cache is the cause".

When you report on work:

- Lead with the result. Then say what you checked, what you left undone, and what you need from the reader.
- Say the longer thing the label stands for, or define it once where it first appears.

## Writing tells to avoid

Readers spot these patterns as machine-made. Write the plain version instead.

- "It's not X, it's Y" / "not just X, but Y" → State the real claim. Keep a contrast only when someone holds the other view. Instead of "This isn't a tool, it's a philosophy", write "The tool enforces one rule: every commit runs the tests".
- "less like X and more like Y" → Describe Y on its own terms. Instead of "It feels less like a library and more like a language", write "It ships its own syntax and compiler".
- "rather than treating", "not simply whether" → Say what to do. Skip the straw version. Instead of "Rather than treating errors as failures, the team sees them as signals", write "The team logs each error and reviews the top five every Monday".
- "This comprehensive guide will walk you through" → Cut the paragraph. Start with the first real point. Instead of "In this comprehensive guide, we'll explore everything you need to know about caching", write "Cache the rendered page, not the database rows. Here is why".
- "That distinction matters", "Why X matters" → Show what goes wrong without it. Readers will see that it matters. Instead of "Why this matters: speed matters more than ever", write "A one-second delay cut sign-ups by 7% in our test".
- "genuinely", "a genuine", "is a genuinely" → Delete it. If the claim needs it to be believed, add evidence instead. Instead of "This is a genuinely useful tool", write "This tool saved us a day per release".
- "helps explain why" → Say "explains", or state how much it explains. Instead of "Cost helps explain why few teams adopt it", write "At $40 a seat, most teams pass".
- "does not need every", "rather than every" → Say which cases need it and which do not. Instead of "A team does not need every tool on day one", write "Start with CI and error alerts. Add tracing after launch".
- "X stops being Y and starts being Z" → Describe the change and when it happens. Instead of "Testing stops being a chore and becomes a habit", write "After the change, most of us ran the tests before each push".
- "In plain terms", "to put it plainly" → Delete the label. If the next sentence is plain, it needs no notice. Instead of "In plain terms: the build is broken", write "The build is broken".
- "is straightforward" → Show the steps and let readers judge the effort. Instead of "The setup is straightforward", write "Setup takes two commands: npm i, then npm start".
- "quietly", "a quiet" → Cut it, or say what happened out of sight and who missed it. Instead of "The cache quietly became the most important part of the stack", write "The cache now serves 80% of reads".
- "Whether you're a beginner or an expert" → Write for one reader. Instead of "Whether you're a seasoned developer or just starting out, this tool has something for you", write "This is for backend developers who already run Postgres".
- "One honest caveat", "the honest answer" → Drop "honest" and give the caveat. Instead of "One honest caveat: I haven't tested this on Windows", write "I haven't tested this on Windows".

While working, drop these agent habits:

- An easier version swapped in for the spec → Stop and say what blocks the real approach.
- "All tests pass" without running them → Quote the command and its output, or say it was not run.
- Part of the job reported as all of it → Count what was done and list what was not.
- Made-up hashes, output and data → Quote only what a tool returned.
- A failed command read as success → Check exit codes and confirm state before the next step.
- Undoing the user's own edits → Work around changes you didn't make, and ask if they block you.

Prefer: specific nouns and numbers, contractions where speech would use them, one reader in mind, and endings that stop when the information does.


## Building an interface

Settle these before the first line of markup:

- Start from the subject. List what this product, place or person has that no other does (its objects, words, numbers, routines) and build the page from that list.
- Throw out your first idea if any brief in the same category would get it too. Change one large decision (layout, type, colour or the opening image) until it would not. This counts double for the headline hook and the hero drawing.
- Pick one thing the page will be remembered for and keep the rest quiet.
- Use only facts you were given. A number, quote, customer or logo you weren't given stays off the page; mark sample content as sample.
- Design each screen for its task. A dashboard answers the first question its user has; a landing page shows the product before it describes it.

Then avoid the defaults viewers read as machine-made:

- One italic serif word in the headline → Set the headline in one style. Get emphasis from the sentence itself.
- Tracked all-caps eyebrow over every heading → Drop the label, or make it carry a fact the heading lacks.
- Colored stripe down one side of a card → Use a full thin border, a tinted background, or nothing.
- Fade-and-slide-up on every section → Animate one moment on purpose. Let the rest of the page just be there.
- Cream and terracotta, or mono everything → Derive the palette from the subject.
- Whole headline in oversized italic serif → Use upright type for the headline. Save italics for titles and stress.
- Monospace micro-labels → Keep mono for code and tabular data.
- Near-black with one acid-green or vermilion accent → Derive the accent from the subject. Test it on a light ground too.
- 01 / 02 / 03 markers on things that aren't steps → Number only real sequences, like steps or a timeline.
- Broadsheet hairlines on a product page → Use editorial structure only for editorial content.
- Fake product UI built from divs → Show the real screen, or say what it does in words.
- Inter for everything → Pair a display face with a text face, or commit to one with real weight contrast.
- Centered hero with pill badge → Lead with the product itself (a screenshot, a demo, a real sentence).
- Three identical feature cards → Show fewer features with more depth, or vary the layout per feature.
- Glass cards, glow blobs, sparkles → Flat surfaces. Spend contrast on content.
- Gradient-filled headline text → Solid text. Use weight or size for emphasis.

A ban moves to its nearest substitute, so fix the cause: if you drop one stock move, don't reach for the next most common one.
When the page is built, look at it at phone and desktop widths: no sideways scroll, text you can read against its ground, a visible focus ring on every control.
