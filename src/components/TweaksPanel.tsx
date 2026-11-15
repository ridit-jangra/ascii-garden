import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import gsap from "gsap";
import Lenis from "lenis";
import { OPEN_KEY } from "../tweaks";

interface RowBase {
  key: string;
  label: string;
  hint: string;
}
export interface RangeRow extends RowBase {
  kind: "range";
  min: number;
  max: number;
  step: number;
  def: number;
  value: number;
  set: (value: number) => void;
}
export interface ToggleRow extends RowBase {
  kind: "toggle";
  def: boolean;
  value: boolean;
  set: (value: boolean) => void;
}
/** Anything that is not a slider or a switch: the flower picker, palette swatches, poster controls. */
export interface NodeRow {
  kind: "node";
  key: string;
  node: ReactNode;
}
export type RowDef = RangeRow | ToggleRow | NodeRow;
export type Group = [title: string, rows: RowDef[]];

const decimals = (step: number) => (step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step))));

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; }
}

function Row({ row, onTip }: { row: RangeRow | ToggleRow; onTip: (row: HTMLElement | null, hint?: string) => void }) {
  const reset = (e: React.MouseEvent) => {
    e.preventDefault();
    (row.set as (v: number | boolean) => void)(row.def);
  };
  const show = (e: React.SyntheticEvent<HTMLElement>) => onTip(e.currentTarget, row.hint);
  return (
    <label className={`tweaks-row ${row.kind}`} onPointerEnter={show} onPointerLeave={() => onTip(null)} onFocus={show} onBlur={() => onTip(null)}>
      <span className="tweaks-label" onDoubleClick={reset}>{row.label}</span>
      {row.kind === "toggle" ? (
        <input type="checkbox" checked={row.value} onChange={(e) => row.set(e.target.checked)} />
      ) : (
        <>
          <output className="tweaks-value">{row.value.toFixed(decimals(row.step))}</output>
          <input
            type="range" min={row.min} max={row.max} step={row.step} value={row.value}
            style={{ "--fill": `${((row.value - row.min) / (row.max - row.min)) * 100}%` } as CSSProperties}
            onChange={(e) => row.set(Number(e.target.value))}
          />
        </>
      )}
    </label>
  );
}

interface Tip {
  hint: string;
  rowRect: DOMRect;
  panelLeft: number;
}

interface Props {
  groups: Group[];
  exportJSON: () => string;
  onReset: () => void;
  /** Small line at the bottom of the panel (the credit). */
  footer?: ReactNode;
}

/** The Tweaks menu, ported from ascii-animals: a liquid-glass panel of grouped sliders, switches and custom rows. */
export default function TweaksPanel({ groups, exportJSON, onReset, footer }: Props) {
  const [open, setOpen] = useState(readOpen);
  const [tip, setTip] = useState<Tip | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [confirmReset, setConfirmReset] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // GSAP: the panel slides in; Lenis smooth-scrolls its body
  useLayoutEffect(() => {
    if (open && panelRef.current) gsap.fromTo(panelRef.current, { x: 28, opacity: 0, scale: 0.98 }, { x: 0, opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" });
  }, [open]);
  useEffect(() => {
    if (!open || !bodyRef.current || !contentRef.current) return;
    const lenis = new Lenis({ wrapper: bodyRef.current, content: contentRef.current, lerp: 0.1, smoothWheel: true });
    const raf = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    return () => { gsap.ticker.remove(raf); lenis.destroy(); };
  }, [open]);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    setTip(null);
    try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* storage unavailable */ }
  };

  const showTip = (row: HTMLElement | null, hint?: string) => {
    if (!row || !hint || !panelRef.current) return setTip(null);
    setTip({ hint, rowRect: row.getBoundingClientRect(), panelLeft: panelRef.current.getBoundingClientRect().left });
  };

  // Place the tooltip beside the panel, centred on the hovered row.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!tip || !el) return;
    const { rowRect, panelLeft } = tip;
    el.style.right = `${window.innerWidth - panelLeft + 10}px`;
    el.style.top = `${Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, rowRect.top + rowRect.height / 2 - el.offsetHeight / 2))}px`;
  }, [tip]);

  useEffect(() => {
    if (!confirmReset) return;
    const id = setTimeout(() => setConfirmReset(false), 3000);
    return () => clearTimeout(id);
  }, [confirmReset]);
  useEffect(() => {
    if (copyLabel === "Copy") return;
    const id = setTimeout(() => setCopyLabel("Copy"), 1400);
    return () => clearTimeout(id);
  }, [copyLabel]);

  const copy = async () => {
    const json = exportJSON();
    try { await navigator.clipboard.writeText(json); setCopyLabel("Copied"); }
    catch { console.log(json); setCopyLabel("In console"); }
  };
  const reset = () => {
    if (!confirmReset) return setConfirmReset(true);
    setConfirmReset(false);
    onReset();
  };

  if (!open) {
    return (
      <button type="button" className="tweaks-open glass" onClick={() => changeOpen(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
          <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
        </svg>
        <span>Tweaks</span>
      </button>
    );
  }

  return (
    <>
      <aside ref={panelRef} className="tweaks glass" aria-label="Tweaks" onPointerDown={(e) => e.stopPropagation()}>
        <header className="tweaks-head">
          <h2>Tweaks</h2>
          <button type="button" className="tweaks-action" onClick={copy}>{copyLabel}</button>
          <button type="button" className={`tweaks-action${confirmReset ? " confirm" : ""}`} onClick={reset}>
            {confirmReset ? "Reset all?" : "Reset"}
          </button>
          <button type="button" className="tweaks-close" aria-label="Close tweaks" onClick={() => changeOpen(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="tweaks-body" ref={bodyRef}>
          <div ref={contentRef}>
            {groups.map(([title, rows]) => (
              <section className="tweaks-group" key={title}>
                <h3>{title}</h3>
                {rows.map((row) => (row.kind === "node" ? <div className="tweaks-node" key={row.key}>{row.node}</div> : <Row key={row.key} row={row} onTip={showTip} />))}
              </section>
            ))}
          </div>
        </div>
        {footer && <footer className="tweaks-foot">{footer}</footer>}
      </aside>
      {tip && (
        <div ref={tipRef} className="tweaks-tip" role="tooltip">
          <span>{tip.hint}</span>
          <small>Double-click the name to reset it.</small>
        </div>
      )}
    </>
  );
}
