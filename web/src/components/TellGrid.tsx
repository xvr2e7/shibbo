// One layer's tells as a grid: groups down the side, the year each tell was first seen across the top.
// Tells with no recorded year sit in a strip under their group's years. Interface tells show their rendered
// specimen, drawn only once the thumbnail nears the screen. Below 760 px the grid becomes a list by group.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { label, type Tell } from "../data";
import { Specimen, hasSpecimen } from "./Specimen";
import { UNDATED, YEARS, groupName, groupOf, groupsOf, yearOf, type LayerId } from "./layers";
import { groupAnchor } from "./tellAnchors";

function Thumb({ t }: { t: Tell }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <span ref={ref} className="tg-thumb" aria-hidden="true">{shown && hasSpecimen(t) ? <Specimen t={t} /> : null}</span>;
}

const isWords = (t: Tell) => t.domain === "prose" || t.domain === "chat";
const byName = (a: Tell, b: Tell) => label(a).localeCompare(label(b));

// The column a tell sits in. A year before the first column or after the last goes in the nearest end column.
const FIRST = YEARS[0];
const LAST = YEARS[YEARS.length - 1];
const colOf = (t: Tell): number => {
  const y = yearOf(t);
  return y === UNDATED ? UNDATED : Math.min(LAST, Math.max(FIRST, y));
};

function Item({ t, ui }: { t: Tell; ui: boolean }) {
  return (
    <li className="tg-item">
      <Link to={`/tells/${t.id}`}>
        {ui && <Thumb t={t} />}
        <span className={isWords(t) ? "specimen nm" : "nm"}>{label(t)}</span>
      </Link>
    </li>
  );
}

export function TellGrid({ layer, tells, compact }: { layer: LayerId; tells: Tell[]; compact: boolean }) {
  const ui = layer === "interface";
  const groups = groupsOf(layer, tells);
  const inGroup = new Map(groups.map((g) => [g, tells.filter((t) => groupOf(t) === g).sort(byName)]));
  const cls = `tell-grid${ui ? " is-ui" : ""}`;

  if (compact) {
    return (
      <div className={`${cls} compact`}>
        {groups.map((g) => {
          const all = inGroup.get(g)!;
          const years = [...YEARS.filter((y) => all.some((t) => colOf(t) === y)), ...(all.some((t) => colOf(t) === UNDATED) ? [UNDATED] : [])];
          return (
            <section key={g} id={groupAnchor(layer, g)} className="tg-group">
              <h3>{groupName(g)} <span className="n">{all.length}</span></h3>
              {years.map((y) => (
                <div key={y} className="tg-year">
                  <h4 className={y === UNDATED ? "tg-undated-h" : undefined}>{y === UNDATED ? "Year not recorded" : y}</h4>
                  <ul className="cell">{all.filter((t) => colOf(t) === y).map((t) => <Item key={t.id} t={t} ui={ui} />)}</ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    );
  }

  // Wider columns where a year holds more tells; a year with none shrinks to its label.
  const most = YEARS.map((y) => Math.max(0, ...groups.map((g) => inGroup.get(g)!.filter((t) => colOf(t) === y).length)));
  const cols = most.map((n) => (n === 0 ? "3.5rem" : `minmax(${ui ? "170px" : "7.5rem"}, ${Math.max(1, Math.pow(n, ui ? 0.8 : 0.5)).toFixed(2)}fr)`));
  const template = `9.5rem ${cols.join(" ")}`;

  return (
    <div className={cls} style={{ gridTemplateColumns: template }} role="table" aria-label="Tells by group and the year each was first seen">
      <div className="tg-head" role="row">
        <span role="columnheader"><span className="sr">Group</span></span>
        {YEARS.map((y, i) => <span key={y} role="columnheader" className={most[i] ? undefined : "empty"}>{y}</span>)}
      </div>
      {groups.map((g) => {
        const all = inGroup.get(g)!;
        const undated = all.filter((t) => colOf(t) === UNDATED);
        return (
          <div key={g} id={groupAnchor(layer, g)} className="tg-rowgroup" role="rowgroup">
            <div className="tg-row" role="row">
              <h3 role="rowheader">{groupName(g)} <span className="n">{all.length}</span></h3>
              {YEARS.map((y) => {
                const list = all.filter((t) => colOf(t) === y);
                return (
                  <div key={y} role="cell">
                    {list.length > 0 && <ul className="cell">{list.map((t) => <Item key={t.id} t={t} ui={ui} />)}</ul>}
                  </div>
                );
              })}
            </div>
            {undated.length > 0 && (
              <div className="tg-row tg-undated" role="row">
                <span role="rowheader" className="tg-undated-h">Year not recorded</span>
                <div role="cell" aria-colspan={YEARS.length} className="tg-span">
                  <ul className="cell">{undated.map((t) => <Item key={t.id} t={t} ui={ui} />)}</ul>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
