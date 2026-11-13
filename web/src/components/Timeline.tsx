import { useEffect, useMemo, useRef, useState } from "react";
import { chronology, ym, monthName, type Milestone } from "../data";
import { models as mapModels } from "./AtlasMap";
import { BrandIcon, brandOf } from "./BrandIcon";
import { famName } from "./families";

// The record starts at ChatGPT's launch. Releases sit in one lane per lab, marked with the lab's icon.
const START = ym("2022-11");
/** The latest month with data: playback and the default view stop here. */
export const NOW = Math.max(ym(new Date().toISOString().slice(0, 7)), ...mapModels.map((m) => ym(m.released)));
// The axis runs to the end of the current year, so a new year needs no edit here.
const END = Math.floor(NOW / 12) * 12 + 11;
const YEARS = Array.from({ length: Math.floor(END / 12) - 2022 }, (_, i) => 2023 + i);
export const TIME = { START, END };

const LANES: Array<{ key: string; name: string }> = [
  { key: "openai", name: "OpenAI" },
  { key: "anthropic", name: "Anthropic" },
  { key: "google", name: "Google" },
  { key: "meta", name: "Meta" },
  { key: "mistral", name: "Mistral" },
  { key: "deepseek", name: "DeepSeek" },
  { key: "qwen", name: "Alibaba Qwen" },
  { key: "xai", name: "xAI" },
  { key: "moonshot", name: "Moonshot" },
  { key: "zhipu", name: "Zhipu" },
  { key: "minimax", name: "MiniMax" },
  { key: "other", name: "Others" },
];
const laneOf = (brand: string) => (LANES.some((l) => l.key === brand) ? brand : brand === "gemma" ? "google" : "other");

type Mark = { at: number; date: string; name: string; lab: string; brand: string; lane: string; measured: boolean; weights?: string; m?: Milestone };

export function Timeline({ month, t = month, quiet = [], setMonth, playing, onPlay, onReset }: { month: number; t?: number; quiet?: Array<[number, number]>; setMonth: (m: number) => void; playing: boolean; onPlay: () => void; onReset: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(1000);
  const [hover, setHover] = useState<Mark | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const marks = useMemo<Mark[]>(() => {
    // A milestone lists the measured model ids it stands for, so each model gets one mark.
    const mapIds = new Set(mapModels.map((m) => m.id));
    const claimed = new Set(chronology.milestones.flatMap((m) => m.measured ?? []));
    // A measured model whose release is already a milestone marks that milestone; it gets no second mark.
    const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
    const named = (n: string) => mapModels.find((m) => ` ${norm(n)} `.includes(` ${norm(m.name)} `));
    const out: Mark[] = chronology.milestones
      .filter((m) => m.date && ym(String(m.date).slice(0, 7)) >= START)
      .map((m) => {
        const brand = brandOf(m.lab ?? m.maker);
        return { at: ym(String(m.date).slice(0, 7)), date: String(m.date), name: m.name, lab: m.lab ?? m.maker ?? "", brand, lane: laneOf(brand), measured: (m.measured ?? []).some((id) => mapIds.has(id)) || !!named(m.name), weights: m.weights, m };
      });
    for (const m of chronology.milestones) { const hit = named(m.name); if (hit) claimed.add(hit.id); }
    for (const m of mapModels) {
      if (claimed.has(m.id)) continue;
      const brand = brandOf(m.family);
      const lab = LANES.find((l) => l.key === brand && l.key !== "other")?.name ?? famName(m.family);
      out.push({ at: ym(m.released), date: m.released + (m.verified ? "" : " (month unconfirmed)"), name: m.name, lab, brand, lane: laneOf(brand), measured: true });
    }
    return out.sort((a, b) => a.at - b.at);
  }, []);

  const gutter = 112, laneH = 16, top = 6;
  const lanes = LANES.filter((l) => marks.some((m) => m.lane === l.key));
  const H = top + lanes.length * laneH + 22;
  const x = (m: number) => gutter + ((m - START) / (END - START)) * (W - gutter - 12);
  const toMonth = (px: number) => Math.round(START + ((px - gutter) / (W - gutter - 12)) * (END - START));
  const scrub = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    setMonth(Math.min(END, Math.max(START, toMonth(clientX - r.left))));
  };
  // Nudge icons that would overlap within a lane.
  const placed = useMemo(() => {
    const last = new Map<string, number>();
    return marks.map((m) => {
      const px = x(m.at);
      const prev = last.get(m.lane) ?? -99;
      const p2 = Math.min(W - 16, px - prev < 7 ? prev + 7 : px);
      last.set(m.lane, p2);
      return { ...m, px: p2 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, W]);

  return (
    <div className="plate timeline">
      <div className="row">
        <div className="transport">
          <button className="play" type="button" onClick={onPlay} aria-pressed={playing} aria-label={playing ? "Pause" : month >= NOW ? "Replay the releases" : "Play"} title={playing ? "Pause (space)" : "Play (space)"}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path className="i-play" d="M6.5 4.2v11.6a.8.8 0 0 0 1.2.7l9-5.8a.8.8 0 0 0 0-1.4l-9-5.8a.8.8 0 0 0-1.2.7Z" />
              <g className="i-pause"><rect x="5" y="4" width="3.4" height="12" rx="1" /><rect x="11.6" y="4" width="3.4" height="12" rx="1" /></g>
            </svg>
          </button>
          <button className="reset" type="button" onClick={onReset} data-show={t < NOW || undefined} tabIndex={t < NOW ? 0 : -1} aria-hidden={t < NOW ? undefined : true} aria-label="Back to today" title="Back to today">
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10a6 6 0 1 0 1.8-4.3" /><path d="M4 3.5v3h3" />
            </svg>
          </button>
        </div>
        <output className="date" aria-live="polite">{monthName(month)}</output>
        {quiet.length > 0 && !hover && <span className="quiet-note"><i aria-hidden="true" />No model measured on this layer</span>}
        <span className="hover-note" data-show={hover ? true : undefined}>
          {hover && (
            <>
              <BrandIcon brand={hover.brand} size={14} /> <b>{hover.name}</b>, {hover.lab}, {hover.date}
              {hover.weights ? `, ${hover.weights} weights` : ""}
              {hover.measured ? ", tells measured" : ""}
            </>
          )}
        </span>
      </div>
      <div
        ref={wrap}
        className="lanes"
        role="slider"
        tabIndex={0}
        aria-label="Month shown on the map"
        aria-valuemin={START}
        aria-valuemax={END}
        aria-valuenow={month}
        aria-valuetext={monthName(month)}
        style={{ height: H }}
        onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus({ preventScroll: true }); (e.currentTarget as Element).setPointerCapture?.(e.pointerId); scrub(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons) scrub(e.clientX); }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 12 : 1;
          if (e.key === "ArrowRight") { setMonth(Math.min(END, month + step)); e.preventDefault(); }
          if (e.key === "ArrowLeft") { setMonth(Math.max(START, month - step)); e.preventDefault(); }
          if (e.key === "Home") setMonth(START);
          if (e.key === "End") setMonth(END);
        }}
      >
        <svg width={W} height={H} aria-hidden="true">
          {lanes.map((l, i) => (
            <line key={l.key} x1={gutter} x2={W - 12} y1={top + i * laneH + laneH / 2} y2={top + i * laneH + laneH / 2} className="lane-line" />
          ))}
          {quiet.map(([a, b]) => (
            <g key={a}>
              <rect x={x(a)} width={x(b + 1) - x(a)} y={top - 2} height={lanes.length * laneH + 2} className="quiet-span" />
            </g>
          ))}
          {YEARS.map((y) => (
            <g key={y}>
              <line x1={x(ym(`${y}-01`))} x2={x(ym(`${y}-01`))} y1={top - 2} y2={top + lanes.length * laneH} className="year-line" />
              <text x={x(ym(`${y}-01`)) + 3} y={H - 4}>{y}</text>
            </g>
          ))}
          <line x1={x(t)} x2={x(t)} y1={0} y2={top + lanes.length * laneH + 2} className="playhead" />
        </svg>
        {lanes.map((l, i) => (
          <span key={l.key} className="lane-label" style={{ top: top + i * laneH }}>
            {l.key !== "other" && <BrandIcon brand={l.key} size={12} />} {l.name}
          </span>
        ))}
        {placed.map((m, i) => (
          <button
            key={`${m.name}-${i}`}
            type="button"
            tabIndex={-1}
            className={`release${m.measured ? " measured" : ""}${m.at > month ? " later" : ""}`}
            style={{ left: m.px - 8, top: top + lanes.findIndex((l) => l.key === m.lane) * laneH }}
            onPointerEnter={() => setHover(m)}
            onPointerLeave={() => setHover(null)}
            onPointerDown={(e) => { e.stopPropagation(); setMonth(m.at); }}
            aria-label={`${m.name}, ${m.date}`}
          >
            <BrandIcon brand={m.brand} size={13} label={m.name} />
          </button>
        ))}
      </div>
    </div>
  );
}

