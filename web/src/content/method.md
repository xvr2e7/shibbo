# Method

## Where the numbers come from

Graphite's AI Tells study (2026) took 9,984 human web articles published before November 2022. For each one, nine models wrote an article from a summary of the same piece, at the same length. A phrase counts as a tell for a model when it appears at least twice as often as in the human articles, in at least 20 of that model's articles. Graphite publishes the counts under CC BY 4.0; shibbo ships them in `data/raw/graphite` with their license.

When people never used a phrase at all, the ratio is undefined. Shibbo shows the raw counts instead: "411 vs 0" means the model wrote it 411 times and the people never did.

Before 2025, there are no per-model measurements on matched topics. The timeline draws on cited studies of the period, such as Kobak and colleagues' count of excess words in PubMed abstracts, and on documented reports. Each historical entry names its source.

## How the map is drawn

Each model is a row of log ratios over 5,000 phrases, with phrases inside the cutoff counted as zero, the human rate. A principal component analysis without centering keeps people at the origin, so distance from the center means "writes unlike people". The first two components hold two thirds of the variation between models. Each phrase is placed near the models that over-use it, weighted by how strongly, then spread out so dots don't stack. Land height is the density of strong phrases; it carries no meaning beyond "many tells crowd here".

## How the checker was tested

Topics were split in half by a hash of the URL. Everything tunable came from the training half: a phrase list rebuilt from n-gram counts, the score scale, and the weight on a model's own phrases. The shipped phrase list saw every article, so it was not used in the test. Results come from the other half.

The curated rules were written after reading Graphite's full tell lists, so their numbers run high. And the whole test covers one genre, web articles. Chat replies, code comments and UI copy have no human baseline yet.
