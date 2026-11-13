#!/usr/bin/env node
// One page to rate every built page across sets, saving as you go.
//   node eval/ui/rate.mjs [--sets v2,opus55,sonnet] [--port 4310]      then open http://127.0.0.1:4310
//
// Ratings save on every change to eval/ui/ratings/ratings.json and ratings.md. Both stay blind (letters only)
// until you press Finish, which also writes ratings-decoded.md with results by arm. Needs report.mjs run first,
// since it reads runs/<set>/scores.json for the letters.
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SETS = arg("sets", "v2,opus55,sonnet").split(",");
const PORT = +arg("port", 4310);
const OUT = join(HERE, "ratings");
mkdirSync(OUT, { recursive: true });
const briefs = JSON.parse(readFileSync(join(HERE, "briefs.json"), "utf8"));
const MODEL = { v2: "Fable 5.1", opus55: "Opus 5.5", sonnet: "Sonnet 5.5", main: "Fable 5.1 (first run)" };

// Items, blind: set, brief, letter. The arm and the real folder (named after the arm) stay server-side;
// the browser asks for /p/<set>/<brief>/<letter>/<file>.
const items = [], arms = {}, dirs = {};
for (const set of SETS) {
  const p = join(HERE, "runs", set, "scores.json");
  if (!existsSync(p)) { console.warn(`skip ${set}: run report.mjs --tag ${set} first`); continue; }
  for (const r of JSON.parse(readFileSync(p, "utf8"))) {
    const key = `${set}/${r.brief}/${r.letter}`;
    arms[key] = r.arm;
    dirs[key] = join(HERE, r.path);
    items.push({ key, set, brief: r.brief, letter: r.letter, path: `p/${key}` });
  }
}
items.sort((a, b) => SETS.indexOf(a.set) - SETS.indexOf(b.set) || briefs.findIndex((x) => x.id === a.brief) - briefs.findIndex((x) => x.id === b.brief) || a.letter.localeCompare(b.letter));

const file = join(OUT, "ratings.json");
let state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { ratings: {}, best: {}, worst: {}, notes: {}, setNotes: {}, general: "" };

function markdown(decoded) {
  const L = [`# Interface eval ratings${decoded ? " (decoded)" : ""}`, "", `Saved ${new Date().toISOString().slice(0, 16).replace("T", " ")}. Rated ${Object.keys(state.ratings).length} of ${items.length} pages.`, ""];
  if (state.general) L.push("## General notes", "", state.general, "");
  for (const set of SETS) {
    const its = items.filter((i) => i.set === set);
    if (!its.length) continue;
    L.push(`## ${set} (${MODEL[set] ?? set})`, "");
    if (state.setNotes[set]) L.push(state.setNotes[set], "");
    for (const b of briefs) {
      const bi = its.filter((i) => i.brief === b.id);
      if (!bi.length) continue;
      const g = `${set}/${b.id}`;
      const name = (l) => (l ? (decoded ? `${l} (${arms[`${g}/${l}`]})` : l) : "-");
      L.push(`### ${b.name}`, "", `Best: ${name(state.best[g])} · Most machine-made: ${name(state.worst[g])}`, "", "| Page | Rating | Note |", "|---|---|---|");
      for (const i of bi) L.push(`| ${decoded ? `${i.letter} (${arms[i.key]})` : i.letter} | ${state.ratings[i.key] ?? ""} | ${(state.notes[i.key] ?? "").replace(/\|/g, "/").replace(/\n/g, " ")} |`);
      L.push("");
    }
  }
  if (decoded) {
    L.push("## By arm", "", "| Set | Arm | Rated | Mean | Best picks | Worst picks |", "|---|---|---|---|---|---|");
    for (const set of SETS) {
      const byArm = {};
      for (const i of items.filter((x) => x.set === set)) {
        const a = (byArm[arms[i.key]] ??= { r: [], best: 0, worst: 0 });
        if (state.ratings[i.key]) a.r.push(+state.ratings[i.key]);
      }
      for (const [g, l] of Object.entries(state.best)) if (g.startsWith(set + "/") && byArm[arms[`${g}/${l}`]]) byArm[arms[`${g}/${l}`]].best++;
      for (const [g, l] of Object.entries(state.worst)) if (g.startsWith(set + "/") && byArm[arms[`${g}/${l}`]]) byArm[arms[`${g}/${l}`]].worst++;
      for (const [a, v] of Object.entries(byArm).sort()) L.push(`| ${set} | ${a} | ${v.r.length} | ${v.r.length ? (v.r.reduce((s, x) => s + x, 0) / v.r.length).toFixed(2) : ""} | ${v.best} | ${v.worst} |`);
    }
    L.push("");
  }
  return L.join("\n");
}
function save() {
  writeFileSync(file, JSON.stringify(state, null, 1));
  writeFileSync(join(OUT, "ratings.md"), markdown(false));
}

const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const body = (req) => new Promise((ok) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => ok(s)); });

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") { res.writeHead(200, { "content-type": TYPES[".html"] }); return res.end(PAGE); }
  if (url.pathname === "/api/state") { res.writeHead(200, { "content-type": TYPES[".json"] }); return res.end(JSON.stringify({ items, briefs, models: MODEL, sets: SETS, state })); }
  if (url.pathname === "/api/save" && req.method === "POST") { state = JSON.parse(await body(req)); save(); res.writeHead(204); return res.end(); }
  if (url.pathname === "/api/finish" && req.method === "POST") {
    save(); const md = markdown(true); writeFileSync(join(OUT, "ratings-decoded.md"), md);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); return res.end(md);
  }
  // Built pages and their screenshots, by letter only.
  let m = null;
  try { m = decodeURIComponent(url.pathname).match(/^\/p\/([^/]+\/[^/]+\/[^/]+)\/(.+)$/); } catch { /* bad escape: 404 */ }
  const dir = m && dirs[m[1]], p = dir && normalize(join(dir, m[2]));
  if (!p || !p.startsWith(dir + sep) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(PORT, "127.0.0.1", () => console.log(`rater: http://127.0.0.1:${PORT}  (${items.length} pages; saving to ${OUT})`));

const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Rate the pages</title>
<style>
:root{--ink:#1b1b1b;--muted:#5d5b56;--line:#d9d6cf;--paper:#f5f4f0;--card:#fff;--accent:#1b5fd1;--best:#1d7a46;--worst:#b3261e}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;color:var(--ink);background:var(--paper)}
header{position:sticky;top:0;z-index:5;background:var(--paper);border-bottom:1px solid var(--line);padding:10px 24px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
header h1{font-size:17px;margin:0}header nav{display:flex;gap:4px;flex-wrap:wrap}header nav button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--card);padding:3px 10px;border-radius:4px;cursor:pointer}
header nav button[aria-current=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
.progress{font-size:13px;color:var(--muted);margin-left:auto}.saved{font-size:12px;color:var(--muted);min-width:70px}
button.finish{font:inherit;font-size:13px;background:var(--ink);color:#fff;border:0;padding:6px 14px;border-radius:4px;cursor:pointer}
main{padding:20px 24px 80px;max-width:1500px;margin:0 auto}.help{color:var(--muted);font-size:14px;max-width:80ch;margin:0 0 8px}
h2{font-size:20px;margin:32px 0 2px}h3{font-size:16px;margin:26px 0 2px}.brief{color:var(--muted);margin:0 0 10px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px;outline:none}.card:focus-within,.card.on{border-color:var(--accent);box-shadow:0 0 0 2px #1b5fd133}
.card.rated{border-color:#9db8a6}.top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}.letter{font-weight:700;font-size:17px}
.top a{font-size:12px;color:var(--muted);margin-left:8px}.shot{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border:1px solid #ebe8e2;border-radius:3px;cursor:zoom-in;background:#eee}
.stars{display:flex;gap:4px;margin:8px 0 4px}.stars button{flex:1;font:inherit;font-size:14px;padding:4px 0;border:1px solid var(--line);background:#fff;border-radius:4px;cursor:pointer}
.stars button[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
.picks{display:flex;gap:6px}.picks button{flex:1;font:inherit;font-size:12px;padding:3px 0;border:1px solid var(--line);background:#fff;border-radius:4px;cursor:pointer;color:var(--muted)}
.picks .b[aria-pressed=true]{background:var(--best);color:#fff;border-color:var(--best)}.picks .w[aria-pressed=true]{background:var(--worst);color:#fff;border-color:var(--worst)}
textarea{width:100%;font:inherit;font-size:13px;border:1px solid var(--line);border-radius:4px;padding:5px 7px;margin-top:6px;resize:vertical;min-height:34px}
.setnote{max-width:900px;min-height:50px}
button:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
dialog{width:min(1400px,96vw);height:94vh;border:0;border-radius:8px;padding:0;background:var(--card)}dialog::backdrop{background:#0009}
.dv{display:grid;grid-template-columns:1fr 300px;height:100%}.dv .view{overflow:auto;background:#e9e7e2;position:relative}.dv iframe{width:100%;height:100%;border:0;background:#fff}
.dv .view img{display:block;margin:0 auto;max-width:100%}.dv aside{padding:16px;border-left:1px solid var(--line);overflow:auto}
.tabs{display:flex;gap:4px;margin:8px 0}.tabs button{font:inherit;font-size:12px;border:1px solid var(--line);background:#fff;padding:3px 8px;border-radius:4px;cursor:pointer}.tabs button[aria-pressed=true]{background:var(--ink);color:#fff}
kbd{font:12px ui-monospace,monospace;border:1px solid var(--line);border-bottom-width:2px;border-radius:3px;padding:0 4px;background:#fff}
pre.result{white-space:pre-wrap;background:#fff;border:1px solid var(--line);padding:14px;font-size:13px}
</style>
<header><h1>Rate the pages</h1><nav id="nav"></nav><span class="progress" id="prog"></span><span class="saved" id="saved"></span><button class="finish" id="finish">Finish and decode</button></header>
<main>
<p class="help">Rate each page from 1 (looks generated) to 5 (looks made by a designer for this subject), and per brief mark the best and the most machine-made. Letters hide how each page was built. Everything saves as you go to <code>eval/ui/ratings/</code>. Click a shot to open the live page with the controls beside it; there, <kbd>1</kbd>–<kbd>5</kbd> rate, <kbd>b</kbd> / <kbd>w</kbd> pick best or worst, <kbd>→</kbd> / <kbd>←</kbd> move between pages, <kbd>Esc</kbd> closes. Press Finish when done to see results by arm.</p>
<label for="general" class="help" style="display:block;margin-top:14px">General notes (anything across all sets)</label><textarea id="general" class="setnote"></textarea>
<div id="root"></div><div id="result"></div>
</main>
<dialog id="dlg" aria-label="Page viewer"><div class="dv"><div class="view" id="view"></div><aside id="side"></aside></div></dialog>
<script>
let D, S, timer;
const $ = (s, e = document) => e.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const group = (i) => i.set + "/" + i.brief;
function save() {
  clearTimeout(timer); $("#saved").textContent = "saving…";
  timer = setTimeout(async () => { await fetch("/api/save", { method: "POST", body: JSON.stringify(S) }); $("#saved").textContent = "saved"; }, 300);
  progress();
}
function progress() { const n = Object.keys(S.ratings).length; $("#prog").textContent = n + " of " + D.items.length + " rated"; }
function controls(i) {
  const g = group(i);
  return '<div class="stars" role="group" aria-label="Rating for ' + i.letter + '">' + [1,2,3,4,5].map((n) => '<button data-k="' + i.key + '" data-r="' + n + '" aria-pressed="' + (S.ratings[i.key] == n) + '">' + n + '</button>').join("") + '</div>' +
    '<div class="picks"><button class="b" data-g="' + g + '" data-l="' + i.letter + '" aria-pressed="' + (S.best[g] === i.letter) + '">best</button><button class="w" data-g="' + g + '" data-l="' + i.letter + '" aria-pressed="' + (S.worst[g] === i.letter) + '">most machine-made</button></div>' +
    '<textarea data-n="' + i.key + '" placeholder="note" aria-label="Note for ' + i.letter + '">' + esc(S.notes[i.key]) + '</textarea>';
}
function render() {
  $("#nav").innerHTML = D.sets.filter((s) => D.items.some((i) => i.set === s)).map((s) => '<button data-jump="' + s + '">' + esc(D.models[s] || s) + '</button>').join("");
  let h = "";
  for (const set of D.sets) {
    const its = D.items.filter((i) => i.set === set); if (!its.length) continue;
    h += '<section id="set-' + set + '"><h2>' + esc(D.models[set] || set) + ' <small style="color:var(--muted);font-weight:400">' + its.length + ' pages</small></h2>';
    h += '<textarea class="setnote" data-set="' + set + '" placeholder="Notes on this set (optional)">' + esc(S.setNotes[set]) + '</textarea>';
    for (const b of D.briefs) {
      const bi = its.filter((i) => i.brief === b.id); if (!bi.length) continue;
      h += '<h3>' + esc(b.name) + '</h3><p class="brief">' + esc(b.brief) + '</p><div class="grid">';
      for (const i of bi) h += '<div class="card' + (S.ratings[i.key] ? " rated" : "") + '" data-card="' + i.key + '"><div class="top"><span class="letter">' + i.letter + '</span><span><a href="/' + i.path + '/index.html" target="_blank">live</a><a href="/' + i.path + '/full.png" target="_blank">full</a><a href="/' + i.path + '/phone.png" target="_blank">phone</a></span></div><img class="shot" src="/' + i.path + '/hero.png" alt="First screen of page ' + i.letter + '" data-open="' + i.key + '" tabindex="0">' + controls(i) + '</div>';
      h += '</div>';
    }
    h += '</section>';
  }
  $("#root").innerHTML = h; $("#general").value = S.general || ""; progress();
}
function refresh(key) {
  for (const c of document.querySelectorAll('[data-card]')) {
    const i = D.items.find((x) => x.key === c.dataset.card);
    if (key && group(i) !== group(D.items.find((x) => x.key === key))) continue;
    c.classList.toggle("rated", !!S.ratings[i.key]);
    for (const b of c.querySelectorAll("[data-r]")) b.setAttribute("aria-pressed", S.ratings[i.key] == b.dataset.r);
    c.querySelector(".b").setAttribute("aria-pressed", S.best[group(i)] === i.letter);
    c.querySelector(".w").setAttribute("aria-pressed", S.worst[group(i)] === i.letter);
  }
  if ($("#dlg").open) side(cur);
}
function act(t) {
  if (t.dataset.r) { S.ratings[t.dataset.k] = +t.dataset.r; save(); refresh(t.dataset.k); return true; }
  if (t.classList.contains("b") || t.classList.contains("w")) { const k = t.classList.contains("b") ? "best" : "worst"; S[k][t.dataset.g] = S[k][t.dataset.g] === t.dataset.l ? undefined : t.dataset.l; if (!S[k][t.dataset.g]) delete S[k][t.dataset.g]; save(); refresh(t.dataset.g + "/" + t.dataset.l); return true; }
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("button,img[data-open]"); if (!t) return;
  if (t.dataset.jump) return document.getElementById("set-" + t.dataset.jump).scrollIntoView();
  if (t.dataset.open) return open(t.dataset.open);
  act(t);
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.n) { S.notes[t.dataset.n] = t.value; if (!t.value) delete S.notes[t.dataset.n]; }
  else if (t.dataset.set) S.setNotes[t.dataset.set] = t.value;
  else if (t.id === "general") S.general = t.value; else return;
  save();
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset?.open) open(e.target.dataset.open); });
// Viewer
let cur = null, mode = "live";
function open(key) { cur = key; $("#dlg").open || $("#dlg").showModal(); show(); }
function show() {
  const i = D.items.find((x) => x.key === cur);
  $("#view").innerHTML = mode === "live" ? '<iframe src="/' + i.path + '/index.html" title="Page ' + i.letter + '"></iframe>' : '<img src="/' + i.path + '/' + mode + '.png" alt="">';
  side(cur);
}
function side(key) {
  const i = D.items.find((x) => x.key === key), b = D.briefs.find((x) => x.id === i.brief);
  const n = D.items.indexOf(i) + 1;
  $("#side").innerHTML = '<div style="font-size:12px;color:var(--muted)">' + esc(D.models[i.set] || i.set) + ' · ' + n + ' of ' + D.items.length + '</div><h3 style="margin:4px 0">' + esc(b.name) + ' · ' + i.letter + '</h3><p class="brief">' + esc(b.brief) + '</p>' +
    '<div class="tabs">' + ["live", "full", "phone"].map((m) => '<button data-mode="' + m + '" aria-pressed="' + (mode === m) + '">' + m + '</button>').join("") + '</div>' + controls(i) +
    '<p class="help" style="margin-top:12px"><kbd>1</kbd>–<kbd>5</kbd> rate · <kbd>b</kbd> best · <kbd>w</kbd> worst · <kbd>←</kbd><kbd>→</kbd> move · <kbd>Esc</kbd> close</p>';
}
$("#side").addEventListener("click", (e) => { const t = e.target.closest("button"); if (!t) return; if (t.dataset.mode) { mode = t.dataset.mode; show(); } else act(t); e.stopPropagation(); });
$("#dlg").addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA") return;
  const i = D.items.find((x) => x.key === cur), k = D.items.indexOf(i);
  if (/^[1-5]$/.test(e.key)) { S.ratings[cur] = +e.key; save(); refresh(cur); }
  else if (e.key === "b" || e.key === "w") { const f = e.key === "b" ? "best" : "worst", g = group(i); if (S[f][g] === i.letter) delete S[f][g]; else S[f][g] = i.letter; save(); refresh(cur); }
  else if (e.key === "ArrowRight" && k < D.items.length - 1) { cur = D.items[k + 1].key; show(); }
  else if (e.key === "ArrowLeft" && k > 0) { cur = D.items[k - 1].key; show(); }
});
$("#dlg").addEventListener("close", () => document.querySelector('[data-open="' + cur + '"]')?.focus());
$("#finish").onclick = async () => {
  if (!confirm("Decode the letters and write ratings-decoded.md? You can keep rating afterwards.")) return;
  const md = await (await fetch("/api/finish", { method: "POST" })).text();
  $("#result").innerHTML = '<h2>Results</h2><p class="help">Written to eval/ui/ratings/ratings-decoded.md.</p><pre class="result">' + esc(md) + '</pre>';
  $("#result").scrollIntoView();
};
fetch("/api/state").then((r) => r.json()).then((d) => { D = d; S = d.state; S.ratings ??= {}; S.best ??= {}; S.worst ??= {}; S.notes ??= {}; S.setNotes ??= {}; render(); });
</script></html>`;
