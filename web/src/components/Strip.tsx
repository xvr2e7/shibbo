import { ordered, familyColor, describe, FAMS, type Tell } from "../data";

/**
 * One tell across every measured model, on a log scale centred on the human rate.
 * Left of centre: people use it more. Right: the model does. Older releases are smaller and paler;
 * a thin line joins each family's releases in order.
 */
export function Strip({ tell, width = 300, labels = true }: { tell: Tell; width?: number; labels?: boolean }) {
  const H = labels ? 44 : 30, pad = 10, mid = width / 2;
  const LIM = 3; // 10^3 either way
  const x = (r: number) => mid + (Math.max(-LIM, Math.min(LIM, Math.log10(r))) / LIM) * (mid - pad);
  const fams = FAMS.filter((f) => ordered.some((m) => m.family === f && tell.perModel[m.id]));
  const step = Math.min(7, 20 / Math.max(1, fams.length - 1));
  const rowY = (f: string) => 5 + fams.indexOf(f) * step;
  const summary = ordered
    .map((m) => ({ m, v: tell.perModel[m.id] }))
    .filter((e) => e.v)
    .map((e) => `${describe(e.v!, e.m)}`)
    .join("; ");
  return (
    <svg className="strip" viewBox={`0 0 ${width} ${H}`} role="img" aria-label={summary || "Not measured for any model"}>
      <line x1={pad} x2={width - pad} y1={15} y2={15} className="grid" />
      <line x1={mid} x2={mid} y1={2} y2={28} className="base" />
      {[-2, -1, 1, 2].map((e) => (
        <line key={e} x1={x(10 ** e)} x2={x(10 ** e)} y1={11} y2={19} className="grid" />
      ))}
      {fams.map((f) => {
        const seq = ordered.filter((m) => m.family === f).map((m) => ({ m, v: tell.perModel[m.id] })).filter((e) => e.v);
        return (
          <g key={f}>
            {seq.length > 1 && <polyline points={seq.map((e) => `${x(e.v!.ratio)},${rowY(f)}`).join(" ")} fill="none" stroke={familyColor(f)} strokeWidth={1} opacity={0.5} />}
            {seq.map((e, i) => {
              const newest = i === seq.length - 1 && e.m.id === ordered.filter((m) => m.family === f).at(-1)!.id;
              return (
                <circle key={e.m.id} cx={x(e.v!.ratio)} cy={rowY(f)} r={newest ? 4 : 2.6} fill={familyColor(f)} opacity={newest ? 1 : 0.55} stroke="var(--sheet)" strokeWidth={1}>
                  <title>{describe(e.v!, e.m)}</title>
                </circle>
              );
            })}
          </g>
        );
      })}
      {labels && (
        <>
          <text x={pad} y={40}>people use more</text>
          <text x={mid} y={40} textAnchor="middle">same</text>
          <text x={width - pad} y={40} textAnchor="end">models use more</text>
        </>
      )}
    </svg>
  );
}
