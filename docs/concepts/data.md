# Data, tests and limits

## Where the measurements come from

| Era | Source | Design | Models |
|---|---|---|---|
| 2025 to 2026 | Graphite, AI Tells (CC BY 4.0) | 9,984 human web articles published before ChatGPT's launch (30 Nov 2022); each model wrote one article per topic from the same summary | GPT-4.1, GPT-5, GPT-5.6 Sol, GPT-6 Astra, Claude Opus 4, 4.6 and 5, Gemini 2.5 Pro and 3.1 Pro |
| 2022 to 2023 | RAID (Dugan et al., ACL 2024; MIT), measured by shibbo | 11,600 generations per model across 7 genres, each compared with the human text it was prompted from. RAID queried the OpenAI and Cohere models in November 2023 | Instruct and chat models: GPT-3 (text-davinci-002 per the RAID paper; RAID's README says text-davinci-003), ChatGPT (gpt-3.5-turbo-0613), GPT-4 (gpt-4-0613), Llama 2 70B Chat, Mistral 7B Instruct, MPT-30B Chat, Cohere Command (unversioned) |
| 2023 to 2024 | Cited studies | Excess-word counts in published papers and reviews | Whole corpora, without model labels |

The texts behind both measured sources stay local; only derived rates are published. When people never used a phrase, the ratio is undefined, so shibbo reports the raw counts (“411 vs 0”).

## How shibbo counts

Graphite's published table lists each phrase only for the models where it passed Graphite's own cut, so a blank cell means "not listed" and says nothing about size. In the old atlas those blanks counted as "no difference", though about two in five of them hid gaps of 4× or more. Shibbo now counts every phrase of one to three words, plus Graphite's gapped frames, straight from the paired articles (`scripts/dense_count.py`). Its counts match Graphite's to within 5% for 97% of listed model cells.

Before counting, every text loses web-page clutter: lines found on three or more human pages (cookie banners, sign-up boxes), lines with page-chrome words, and bare nav words. This removes boilerplate such as "skip to content" and "all rights reserved" that people's pages carried and models never wrote.

A phrase reaches the atlas when, for at least one model (`scripts/dense_map.py`):

| Check | Rule |
|---|---|
| Size | One side uses it at least 4× as often, per position of that phrase length |
| Test | A paired sign test over topics, model article against its human twin, Benjamini-Hochberg q < 0.01 |
| Reach | The side that uses it more does so in at least 150 articles (1.5% of topics) |
| Spread | The five heaviest topics hold at most 25% of its uses |
| Topic echo | A model phrase found mainly on topics where the human page used it too is content, so it's dropped |
| Readable | No stray letters or numbers; a gapped frame needs enough fixed words and must beat its strongest single word by 1.5× |
| Not a fragment | A phrase whose uses mostly sit inside a longer mapped phrase gives way to it |

About 11,000 phrases pass; the atlas draws the 5,000 most lopsided and common.

**Layout.** A correspondence analysis of the phrase × corpus count table, with people as one of ten corpora, places people, models and phrases in one plane (the first two axes hold 51% of the variation). Each phrase lands at the average of the corpus points weighted by who uses it, so a phrase people and models share lands between them. People carry 19% of the variation, the most of any corpus. RAID models are placed as extra corpora, each relative to its own human texts.

**How much is shared.** Models and people share most of their words. On the same topics, 70 to 78% of each model's word use matches people's; for two-word phrases, 52 to 65%; for three-word phrases, 37 to 52%. People's pages on *different* topics match each other more closely still (about 95% for single words), so models do write differently; the atlas shows only the most lopsided phrases.

## The held-out test

Topics split in half by a hash of the URL. The phrase list, score scale and model weighting came from the training half; results come from the other 5,044 topics. On the same topic, a model's article scored worse than the person's 97 to 99 times in 100, and one human article in nine still scored under 80. Pooled across topics (AUC), a random model article scored worse than a random human one 95 to 97 times in 100; the curated rules alone reached 0.85 to 0.93. Naming the model ranks articles better (0.97 to 0.99) but flags about one human article in five, because the score scale wasn't refit for that mode.

The curated rules run in every one of these setups, and they were written after reading Graphite's full tell lists, test half included. So every figure here runs somewhat high, not just the rules-only one.

## Limits

Graphite's test covers one genre, web articles; chat replies, code comments and UI copy have no matched human baseline yet.

The atlas axes come from 2025–26 vocabulary. RAID models sit on them relative to their own human texts, but their phrases sit where 2025–26 usage puts them, often far from the model's marker. RAID's genres also differ from Graphite's.

Shibbo's counts split text at sentence ends and line breaks, while Graphite's don't, so a few listed figures differ slightly. Tell pages keep Graphite's figure where Graphite lists one and fill the rest from shibbo's count, marked †.

Interface and code tells are documented, with no per-model measurements yet.

A score describes the tells in a draft. It can't say who wrote the draft, so treat shibbo as an editor and never as a detector.
