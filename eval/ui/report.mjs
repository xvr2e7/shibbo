#!/usr/bin/env node
// Score every cell and build two pages:
//   blind-<tag>.html  arms hidden behind letters (in page links too), for a person to rate (1-5), pick best and worst, and export
//   key-<tag>.html    letters decoded; shibbo checker hits, rendered checks, sameness between repeat builds, cost, time
// Run render.mjs and shot.mjs first. Then: node eval/ui/report.mjs [--tag NAME]
// After judging, save the export as eval/ui/picks-<tag>.json and run tally.mjs.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const TAG = arg("tag", "main");
const RUNS = join(HERE, "runs", TAG);
const briefs = JSON.parse(readFileSync(join(HERE, "briefs.json"), "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const json = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

// Stable shuffle per brief, so letters stay put between rebuilds.
function shuffled(items, seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 2 ** 32;
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const UI_IDS = new Set(execFileSync("npx", ["tsx", join(REPO, "src", "cli.ts"), "list", "--domain", "ui"], { cwd: REPO, encoding: "utf8" })
  .split("\n").map((l) => l.split(/\s+/)[0]).filter(Boolean));

function checker(file) {
  try {
    const rep = JSON.parse(execFileSync("npx", ["tsx", join(REPO, "src", "cli.ts"), "check", file, "--format", "json"], { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 26 }));
    const hits = (rep.findings ?? []).filter((f) => f.counted !== false);
    const ui = hits.filter((f) => UI_IDS.has(f.id));
    return { ui: ui.length, prose: hits.length - ui.length, score: rep.score, ids: [...new Set(ui.map((f) => f.id))] };
  } catch (e) { return { error: String(e.message).slice(0, 200), ids: [] }; }
}

const rows = [];
for (const b of briefs) {
  if (!existsSync(join(RUNS, b.id))) continue;
  const cells = readdirSync(join(RUNS, b.id)).filter((c) => json(join(RUNS, b.id, c, "run.json"))?.ok && existsSync(join(RUNS, b.id, c, "index.html"))).sort();
  shuffled(cells, b.id + TAG).forEach((cell, i) => {
    const dir = join(RUNS, b.id, cell);
    const [arm, rep] = cell.split("__");
    const render = json(join(dir, "render.json"));
    rows.push({ brief: b, cell, arm, rep: +(rep ?? 1), letter: "ABCDEFGHIJKL"[i], path: `runs/${TAG}/${b.id}/${cell}`,
      run: json(join(dir, "run.json")), render: render?.summary ?? null, fp: render?.desktop?.fingerprint ?? null,
      bytes: readFileSync(join(dir, "index.html")).length, ...checker(join(dir, "index.html")) });
  });
}
writeFileSync(join(RUNS, "scores.json"), JSON.stringify(rows.map(({ brief, ...r }) => ({ brief: brief.id, ...r })), null, 2));
// The blind page reaches each page through runs/<tag>/p/<brief>/<letter>, a link to the real folder, so no URL it shows names the arm.
rmSync(join(RUNS, "p"), { recursive: true, force: true });
for (const r of rows) {
  const at = join(RUNS, "p", r.brief.id);
  mkdirSync(at, { recursive: true });
  symlinkSync(relative(at, join(HERE, r.path)), join(at, r.letter), "dir");
}
writeFileSync(join(HERE, `letters-${TAG}.json`), JSON.stringify(Object.fromEntries(rows.map((r) => [`${r.brief.id}-${r.letter}`, r.arm])), null, 1));

// Sameness between two builds of one brief by one arm: shared headline words, same fonts, same main colour.
const words = (s) => new Set(String(s ?? "").toLowerCase().match(/[a-z0-9:]+/g) ?? []);
function alike(a, b) {
  if (!a || !b) return null;
  const [x, y] = [words(a.h1), words(b.h1)];
  const inter = [...x].filter((w) => y.has(w)).length;
  return {
    headline: x.size + y.size ? +(inter / new Set([...x, ...y]).size).toFixed(2) : 0,
    font: a.headingFont === b.headingFont,
    colour: a.colours?.[0] === b.colours?.[0] || a.colours?.[1] === b.colours?.[1],
    h1: [a.h1, b.h1],
  };
}
const arms = [...new Set(rows.map((r) => r.arm))].sort();
const same = [];
for (const b of briefs) for (const arm of arms) {
  const rs = rows.filter((r) => r.brief.id === b.id && r.arm === arm).sort((p, q) => p.rep - q.rep);
  if (rs.length >= 2) same.push({ brief: b, arm, ...alike(rs[0].fp, rs[1].fp) });
}
// Sameness across arms: how many distinct headlines a brief got overall.
const hooks = briefs.filter((b) => rows.some((r) => r.brief.id === b.id)).map((b) => ({ brief: b, h1: rows.filter((r) => r.brief.id === b.id).map((r) => `${r.arm}: ${r.fp?.h1 ?? "?"}`) }));

const css = `body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:32px;background:#f4f3f0;color:#1b1b1b}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:40px 0 4px}h3{font-size:15px;margin:24px 0 6px}p{margin:0 0 14px;max-width:72ch;color:#444}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.card{background:#fff;border:1px solid #d8d6d0;padding:12px}.card img{width:100%;display:block;border:1px solid #e6e4de;aspect-ratio:16/10;object-fit:cover;object-position:top}
.head{display:flex;gap:12px;align-items:baseline;margin-bottom:8px}.letter{font-weight:700;font-size:18px}.head a{font-size:13px}label{font-size:13px;margin-right:10px;white-space:nowrap}textarea{width:100%;box-sizing:border-box;height:44px;margin-top:8px;font:inherit;font-size:13px}
.rate{margin-top:8px;font-size:13px}.rate span{margin-right:6px;color:#555}
table{border-collapse:collapse;font-size:13px;background:#fff;margin-bottom:16px}td,th{border:1px solid #d8d6d0;padding:4px 8px;text-align:left;vertical-align:top}button{font:inherit;padding:6px 12px}pre{background:#fff;border:1px solid #d8d6d0;padding:12px;white-space:pre-wrap;font-size:12px}
:focus-visible{outline:2px solid #1b5fd1;outline-offset:2px}`;

const card = (b, r, at = `runs/${TAG}/p/${b.id}/${r.letter}`) => `<div class="card"><div class="head"><span class="letter">${r.letter}</span><a href="${at}/index.html" target="_blank">open page</a><a href="${at}/full.png" target="_blank">full page</a><a href="${at}/phone.png" target="_blank">phone</a></div>
<a href="${at}/index.html" target="_blank"><img src="${at}/hero.png" alt="First screen of page ${r.letter}"></a>
<div class="rate"><span>Rate</span>${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${b.id}-${r.letter}-rate" value="${n}"> ${n}</label>`).join("")}</div>
<div class="rate"><label><input type="radio" name="${b.id}-best" value="${r.letter}"> best</label><label><input type="radio" name="${b.id}-worst" value="${r.letter}"> most machine-made</label></div>
<textarea data-k="${b.id}-${r.letter}-note" placeholder="note (optional)"></textarea></div>`;

const blind = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Blind review (${esc(TAG)})</title><style>${css}</style>
<h1>Blind review: ${esc(TAG)}</h1>
<p>The same model built each brief several ways, some of them twice. Letters hide which way. For each page give a rating from 1 (looks generated) to 5 (looks made by a designer for this subject). For each brief, also pick the best page and the most machine-made one. Click a shot to open the live page. Your answers save in this browser as you go. When done, press Export and save the text as <code>eval/ui/picks-${esc(TAG)}.json</code>.</p>
${briefs.filter((b) => rows.some((r) => r.brief.id === b.id)).map((b) => `<h2>${esc(b.name)}</h2><p>${esc(b.brief)}</p><div class="grid">${rows.filter((r) => r.brief.id === b.id).sort((x, y) => x.letter.localeCompare(y.letter)).map((r) => card(b, r)).join("")}</div>`).join("")}
<h2>Export</h2><button id="x">Export my ratings</button> <button id="c">Copy</button><pre id="out"></pre>
<script>
const K="shibbo-blind-${esc(TAG)}";const s=JSON.parse(localStorage.getItem(K)||"{}");const save=()=>localStorage.setItem(K,JSON.stringify(s));
for(const e of document.querySelectorAll("input[type=radio]")){if(s[e.name]===e.value)e.checked=true;e.onchange=()=>{s[e.name]=e.value;save()}}
for(const e of document.querySelectorAll("textarea")){e.value=s[e.dataset.k]||"";e.oninput=()=>{s[e.dataset.k]=e.value;save()}}
const out=document.getElementById("out");
document.getElementById("x").onclick=()=>{out.textContent=JSON.stringify(Object.fromEntries(Object.entries(s).filter(([,v])=>v)),null,1)};
document.getElementById("c").onclick=()=>{document.getElementById("x").click();navigator.clipboard.writeText(out.textContent)};
</script></html>`;
writeFileSync(join(HERE, `blind-${TAG}.html`), blind);

// Per-arm totals.
const sum = (rs, f) => rs.reduce((t, r) => t + (f(r) ?? 0), 0);
const mean = (rs, f) => (rs.length ? (sum(rs, f) / rs.length).toFixed(1) : "");
const armRows = arms.map((arm) => {
  const rs = rows.filter((r) => r.arm === arm);
  const ss = same.filter((x) => x.arm === arm && x.headline !== undefined);
  return `<tr><td>${esc(arm)}</td><td>${rs.length}</td><td>${sum(rs, (r) => r.ui)}</td><td>${sum(rs, (r) => r.prose)}</td>
<td>${rs.filter((r) => r.ui > 0).length}</td><td>${rs.filter((r) => r.render?.lowContrast > 0).length}</td><td>${rs.filter((r) => r.render?.tinyText > 0).length}</td><td>${rs.filter((r) => r.render?.noFocus > 0).length}</td><td>${rs.filter((r) => r.render?.overflowX).length}</td>
<td>${ss.length ? (ss.reduce((t, x) => t + x.headline, 0) / ss.length).toFixed(2) : ""}</td><td>${ss.length ? `${ss.filter((x) => x.font).length}/${ss.length}` : ""}</td>
<td>${mean(rs, (r) => r.run?.seconds / 60)}</td><td>${mean(rs, (r) => r.run?.costUSD)}</td></tr>`;
}).join("\n");

const key = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Key (${esc(TAG)})</title><style>${css}</style>
<h1>Key and scores: ${esc(TAG)}</h1>
<p>Open after judging. Columns: <b>shibbo UI / prose</b> are hits from shibbo's own checker, which the shibbo arms were steered against, so they favour those arms. The <b>pages with</b> columns count pages with at least one failure, since one muted grey repeated across a dashboard can add hundreds of hits to a single page. Contrast, tiny text, focus and sideways scroll come from rendering each page in Chrome at 390 and 1440 px (render.mjs); tiny text and focus overlap two shibbo tells, the other two don't. <b>Headline overlap</b> is the share of headline words two builds of the same brief by the same arm have in common (0 = different hooks, 1 = same words); <b>same font</b> counts repeat pairs whose headline font matches.</p>
<h2>By arm</h2>
<table><tr><th>Arm</th><th>Pages</th><th>shibbo UI</th><th>shibbo prose</th><th>Pages with shibbo UI hits</th><th>Pages with low contrast</th><th>Pages with tiny text</th><th>Pages missing focus</th><th>Pages that scroll sideways</th><th>Headline overlap</th><th>Same font</th><th>Minutes</th><th>$ / page</th></tr>
${armRows}</table>
<h2>Every page</h2>
<table><tr><th>Brief</th><th>Letter</th><th>Arm</th><th>Rep</th><th>shibbo UI</th><th>UI tell ids</th><th>Prose</th><th>Contrast</th><th>Tiny</th><th>No focus</th><th>H1</th><th>Fonts</th><th>Min</th><th>$</th></tr>
${rows.map((r) => `<tr><td>${esc(r.brief.name)}</td><td>${r.letter}</td><td>${esc(r.arm)}</td><td>${r.rep}</td><td>${r.ui ?? "?"}</td><td>${esc(r.ids.join(", "))}</td><td>${r.prose ?? "?"}</td><td>${r.render?.lowContrast ?? ""}</td><td>${r.render?.tinyText ?? ""}</td><td>${r.render?.noFocus ?? ""}/${r.render?.focusTried ?? ""}</td><td>${esc(r.fp?.h1)}</td><td>${esc(r.fp?.headingFont)} / ${esc(r.fp?.bodyFont)}</td><td>${r.run?.seconds ? (r.run.seconds / 60).toFixed(1) : ""}</td><td>${r.run?.costUSD?.toFixed(2) ?? ""}</td></tr>`).join("\n")}
</table>
<h2>Headlines per brief</h2>
${hooks.map((h) => `<h3>${esc(h.brief.name)}</h3><pre>${esc(h.h1.join("\n"))}</pre>`).join("")}
</html>`;
writeFileSync(join(HERE, `key-${TAG}.html`), key);
console.log(`wrote blind-${TAG}.html, key-${TAG}.html, letters-${TAG}.json, runs/${TAG}/scores.json (${rows.length} pages)`);
