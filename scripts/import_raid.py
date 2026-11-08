"""Measure 2022-23 instruct and chat models from RAID (Dugan et al., ACL 2024; MIT) against the human texts they were paired with.

    uv run --with pandas python -I scripts/import_raid.py <raid-dir> <graphite tells_vs_human.csv.gz> <tells.yaml> <out.json>

RAID links every generation to the human text it was prompted from (source_id). For each chat model we count
phrase rates in its generations and in exactly the human texts behind them, the same matched design as
Graphite's study. Only the attack-free split, default sampling without repetition penalty, prose genres.
Writes per-model log2 ratios for every phrase Graphite measured, plus registry terms and a few style rates.
The texts stay local; only these derived rates are published.
"""
import json, os, sys

import pandas as pd

raid_dir, graphite_csv, tells_yaml, out_path = sys.argv[1:5]

# Instruct and chat models only, labelled with the checkpoints the RAID paper names (Table 10; queried Nov 2023).
# Release months: OpenAI 0613 snapshots from the 2023-06-13 API post; text-davinci-002 and Cohere Command lack an
# official dated page, so they are marked unverified.
MODELS = {
    "gpt3": {"id": "text-davinci-002", "name": "GPT-3 (text-davinci-002)", "lab": "OpenAI", "family": "gpt", "released": "2022-03", "verified": False},
    "chatgpt": {"id": "gpt-3.5-turbo-0613", "name": "GPT-3.5 Turbo (June 2023)", "lab": "OpenAI", "family": "gpt", "released": "2023-06", "verified": True},
    "gpt4": {"id": "gpt-4-0613", "name": "GPT-4 (June 2023)", "lab": "OpenAI", "family": "gpt", "released": "2023-06", "verified": True},
    "llama-chat": {"id": "llama-2-70b-chat", "name": "Llama 2 70B Chat", "lab": "Meta", "family": "meta", "released": "2023-07"},
    "mistral-chat": {"id": "mistral-7b-instruct", "name": "Mistral 7B Instruct", "lab": "Mistral AI", "family": "mistral", "released": "2023-09"},
    "mpt-chat": {"id": "mpt-30b-chat", "name": "MPT-30B Chat", "lab": "MosaicML", "family": "mosaic", "released": "2023-06"},
    "cohere-chat": {"id": "cohere-command-chat", "name": "Cohere Command (chat)", "lab": "Cohere", "family": "cohere", "released": "2023-03", "verified": False},
}
GENRES = {"abstracts", "books", "news", "recipes", "reddit", "reviews", "wiki"}

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # explicit: shared counting module
from tellcount import load_terms, make_counter, log2ratios, style  # noqa: E402

terms = load_terms(graphite_csv, tells_yaml)
count = make_counter(terms)


frames = []
for name in ("train_none.csv", "extra_none.csv"):
    try:
        frames.append(pd.read_csv(f"{raid_dir}/{name}", usecols=["id", "source_id", "model", "decoding", "repetition_penalty", "domain", "generation"]))
    except FileNotFoundError:
        pass
df = pd.concat(frames, ignore_index=True)
df = df[df["domain"].isin(GENRES)]
human = df[df["model"] == "human"].set_index("id")["generation"]
print(f"rows {len(df)}, human texts {len(human)}", file=sys.stderr)

out = {"source": {"title": "RAID: A Shared Benchmark for Robust Evaluation of Machine-Generated Text Detectors (Dugan et al., ACL 2024)", "url": "https://github.com/liamdugan/raid", "license": "MIT"},
       "design": "Each model's generations against exactly the human texts they were prompted from (matched by source_id). Attack-free split, sampling without repetition penalty, genres: " + ", ".join(sorted(GENRES)) + ".",
       "models": []}
for raid_name, meta in MODELS.items():
    sub = df[(df["model"] == raid_name) & (df["decoding"] == "sampling") & (df["repetition_penalty"] == "no")]
    if sub.empty:
        print(f"skip {raid_name}: no rows", file=sys.stderr)
        continue
    hum = human.reindex(sub["source_id"].unique()).dropna()
    mc, mpos, mwords = count(sub["generation"].astype(str))
    hc, hpos, hwords = count(hum.astype(str))
    ratios = log2ratios(terms, (mc, mpos, mwords), (hc, hpos, hwords))
    entry = dict(meta, raid=raid_name, docs=int(len(sub)), human_docs=int(len(hum)), words=mwords, human_words=hwords,
                 style=style(sub["generation"].astype(str).tolist()), human_style=style(hum.astype(str).tolist()), log2ratio=ratios)
    out["models"].append(entry)
    print(f"{raid_name:13s} docs {len(sub):6d} human {len(hum):6d} words {mwords:9d} terms {len(ratios)}", file=sys.stderr)

json.dump(out, open(out_path, "w"))
