import { useEffect, useMemo, useRef, useState } from "react";
import { chronology, ym, monthName, labFamily, familyColor, type Milestone } from "../data";
import { models as mapModels } from "./AtlasMap";

// A broken time scale: decades before LLMs are compressed, the measured era gets the most room.
const START = ym("1966-01");
const END = ym("2026-12");
const SEGMENTS: Array<{ from: number; to: number; x0: number; x1: number; label: string }> = [
  { from: START, to: ym("2017-06"), x0: 0, x1: 0.17, label: "Rule-based chatbots and assistants" },
  { from: ym("2017-06"), to: ym("2022-11"), x0: 0.17, x1: 0.38, label: "Pretrained language models" },
  { from: ym("2022-11"), to: ym("2025-01"), x0: 0.38, x1: 0.62, label: "Chat assistants" },
  { from: ym("2025-01"), to: END + 1, x0: 0.62, x1: 1, label: "Measured: Graphite 2026" },
];
export const TIME = { START, END };
const toX = (m: number) => {
  const s = SEGMENTS.find((g) => m < g.to) ?? SEGMENTS.at(-1)!;
  return s.x0 + ((Math.max(m, s.from) - s.from) / (s.to - s.from)) * (s.x1 - s.x0);
};
const fromX = (x: number) => {
  const s = SEGMENTS.find((g) => x <= g.x1) ?? SEGMENTS.at(-1)!;
  return Math.round(s.from + ((x - s.x0) / (s.x1 - s.x0)) * (s.to - s.from));
};

type Mark = { at: number; name: string; lab: string; fam: string; measured: boolean; m?: Milestone };

export function Timeline({ month, setMonth, playing, onPlay }: { month: number; setMonth: (m: number) => void; playing: boolean; onPlay: () => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Mark | null>(null);
  const marks = useMemo<Mark[]>(() => {
    const measured = new Set(mapModels.map((m) => m.name.toLowerCase()));
    const fromChrono: Mark[] = chronology.milestones
      .filter((m) => m.date)
      .map((m) => ({ at: ym(String(m.date).slice(0, 7)), name: m.name, lab: m.lab ?? m.maker ?? "", fam: labFamily(m.lab ?? m.maker), measured: measured.has(m.name.toLowerCase()), m }));
    const fromMap: Mark[] = mapModels
      .filter((m) => !fromChrono.some((c) => c.name.toLowerCase() === m.name.toLowerCase()))
      .map((m) => ({ at: ym(m.released), name: m.name, lab: m.family, fam: m.family, measured: true }));
    return [...fromChrono, ...fromMap].sort((a, b) => a.at - b.at);
  }, []);
  const [W, setW] = useState(1000);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    if (svg.current) ro.observe(svg.current);
    return () => ro.disconnect();
  }, []);
  const H = 64, padX = 8;
  const px = (m: number) => padX + toX(m) * (W - padX * 2);

  const scrub = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, ((clientX - r.left) / r.width) * (W / (W - padX * 2)) - padX / (W - padX * 2)));
    setMonth(Math.min(END, Math.max(START, fromX(x))));
  };
  const years = W > 700 ? [1966, 1990, 2010, 2018, 2020, 2022, 2023, 2024, 2025, 2026] : [1966, 2018, 2022, 2025, 2026];

  return (
    <div className="plate timeline">
      <div className="row">
        <button className="btn primary" type="button" onClick={onPlay} aria-pressed={playing}>
          {playing ? "Pause" : "Play history"}
        </button>
        <output className="date" aria-live="polite">{monthName(month)}</output>
        <span className="muted" style={{ fontSize: "var(--t-1)" }}>
          {hover ? `${hover.name}${hover.lab ? `, ${hover.lab}` : ""}, ${monthName(hover.at, "short")}${hover.measured ? " (measured)" : ""}` : "Drag along the line, or use the arrow keys."}
        </span>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label="Month shown on the map"
        aria-valuemin={START}
        aria-valuemax={END}
        aria-valuenow={month}
        aria-valuetext={monthName(month)}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); scrub(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons) scrub(e.clientX); }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 12 : 1;
          if (e.key === "ArrowRight") { setMonth(Math.min(END, month + step)); e.preventDefault(); }
          if (e.key === "ArrowLeft") { setMonth(Math.max(START, month - step)); e.preventDefault(); }
          if (e.key === "Home") setMonth(START);
          if (e.key === "End") setMonth(END);
        }}
      >
        {SEGMENTS.map((s, i) => (
          <g key={s.label}>
            <rect x={px(s.from)} y={20} width={px(Math.min(s.to, END)) - px(s.from)} height={14} fill={i % 2 ? "var(--land-2)" : "var(--land-1)"} stroke="var(--rule)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
            <text x={px(s.from) + 4} y={14} className="era-label">{s.label}</text>
          </g>
        ))}
        <rect x={px(START)} y={20} width={px(month) - px(START)} height={14} fill="var(--ink)" opacity={0.1} />
        {marks.map((m, i) => (
          <line
            key={`${m.name}-${i}`}
            x1={px(m.at)}
            x2={px(m.at)}
            y1={m.measured ? 17 : 22}
            y2={m.measured ? 37 : 32}
            stroke={familyColor(m.fam)}
            strokeWidth={m.measured ? 3 : 1.6}
            vectorEffect="non-scaling-stroke"
            onPointerEnter={() => setHover(m)}
            onPointerLeave={() => setHover(null)}
          >
            <title>{`${m.name}, ${monthName(m.at, "short")}`}</title>
          </line>
        ))}
        {years.map((y) => (
          <text key={y} x={px(ym(`${y}-01`))} y={52} textAnchor={y === 1966 ? "start" : "middle"}>{y}</text>
        ))}
        <line x1={px(month)} x2={px(month)} y1={16} y2={40} stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <circle cx={px(month)} cy={40} r={4} fill="var(--ink)" />
      </svg>
    </div>
  );
}

/** Playback speed: years fly by before LLMs; months slow down in the measured era. */
export function nextMonth(m: number): number {
  if (m < ym("2017-01")) return Math.min(m + 18, ym("2017-01"));
  if (m < ym("2022-06")) return m + 3;
  return m + 1;
}
