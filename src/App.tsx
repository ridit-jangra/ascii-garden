import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { Ascii } from "ascii.rest/react";
import * as cherryBlossom from "ascii.rest/pieces/cherry-blossom";
import { Garden, PAL, PRESETS, FLOWERS, defaultKindColor, type Mode } from "./engine/garden";
import CodeExport from "./export/CodeExport";
import LiquidGlassFilter from "./components/LiquidGlassFilter";
import GlassChoices from "./components/GlassChoices";
import TweaksPanel, { type Group } from "./components/TweaksPanel";
import { GLASS, KNOB_DEFAULTS, loadSaved, save } from "./tweaks";

const ALL = FLOWERS.map((f) => f.id);
const MODES = [{ value: "type", label: "Type" }, { value: "poster", label: "Poster" }];

const CHAOS_STEPS: [number, string][] = [
  [0.12, "minimal botanical"], [0.35, "tended"], [0.6, "wild"], [0.85, "overgrown"], [1.01, "THE GARDEN HAS TAKEN OVER"],
];
const chaosLabel = (v: number) => CHAOS_STEPS.find(([t]) => v < t)![1];

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
};

/** GSAP hover tweens shared by buttons and chips. */
const hoverTween = {
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => { gsap.to(e.currentTarget, { scale: 1.06, duration: 0.18, ease: "power2.out", overwrite: "auto" }); },
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => { gsap.to(e.currentTarget, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.45)", overwrite: "auto" }); },
};
const hoverSoft = {
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => { gsap.to(e.currentTarget, { y: -2, duration: 0.2, ease: "power2.out", overwrite: "auto" }); },
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => { gsap.to(e.currentTarget, { y: 0, duration: 0.45, ease: "elastic.out(1, 0.5)", overwrite: "auto" }); },
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const garden = useRef<Garden | null>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const saved = useRef(loadSaved(ALL, PAL.length)).current;
  const posterEl = useRef<HTMLCanvasElement | null>(null);

  const [mode, setMode] = useState<Mode>(saved.mode);
  const [typed, setTyped] = useState(saved.text);
  const [palette, setPalette] = useState(saved.palette);
  const [flowers, setFlowers] = useState<string[]>(saved.flowers);
  const [colors, setColors] = useState<Record<string, string>>(saved.colors);
  const [knobs, setKnobs] = useState(saved.knobs);
  const [preset, setPreset] = useState(PRESETS.some((x) => x.id === saved.poster.preset) ? saved.poster.preset : "breathe");
  const [pText, setPText] = useState(saved.poster.text);
  const [seed, setSeed] = useState(saved.poster.seed);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [count, setCount] = useState(0);
  const [videoLabel, setVideoLabel] = useState("Export loop");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState("in bloom");

  const row = PAL[palette];
  const bg = row[1], accent = row[2], fg = row[5];
  const light = luminance(bg) > 0.5;
  const setKnob = <K extends keyof typeof knobs>(k: K, v: (typeof knobs)[K]) => setKnobs((o) => ({ ...o, [k]: v }));

  // engine lifetime
  useEffect(() => {
    const g = new Garden(canvasRef.current!, inputRef.current!, { onStatus: setStatus, onBusy: setBusy, onCount: setCount, onText: setTyped });
    garden.current = g;
    g.setFlowers(saved.flowers);
    g.setKindColors(saved.colors);
    g.setChaos(saved.knobs.chaos);
    g.setBoil(saved.knobs.boil);
    g.setRecoil(saved.knobs.recoil);
    g.setGrid(saved.knobs.grid);
    g.setCellScale(saved.knobs.detail);
    g.setTextScale(saved.knobs.textDetail);
    g.setPalette(saved.palette);
    g.start({ ticker: gsap.ticker });
    if (saved.text) g.seed(saved.text); // last time's words, already grown
    if (posterEl.current) g.attachPoster(posterEl.current); // reopened in Poster mode
    setVideoLabel(g.vmime ? `Export ${g.vmime.includes("mp4") ? "MP4" : "WebM"} loop` : "Video export unavailable");
    return () => { g.destroy(); garden.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // page theme: liquid glass where the browser supports it, light or dark by the palette's background
  useEffect(() => {
    const ua = navigator.userAgent;
    document.documentElement.classList.toggle("liquid", /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox/.test(ua));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    document.body.style.background = bg;
  }, [light, bg]);
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--tint", String(GLASS.tint));
    r.setProperty("--edge", String(GLASS.edge));
  }, []);

  // knobs and choices flow into the engine
  useEffect(() => { garden.current?.setPalette(palette); }, [palette]);
  useEffect(() => { garden.current?.setKindColors(colors); }, [colors]);
  useEffect(() => { garden.current?.setBoil(knobs.boil); }, [knobs.boil]);
  useEffect(() => { garden.current?.setRecoil(knobs.recoil); }, [knobs.recoil]);
  useEffect(() => { garden.current?.setGrid(knobs.grid); }, [knobs.grid]);
  useEffect(() => { garden.current?.setCellScale(knobs.detail); }, [knobs.detail]);
  useEffect(() => { garden.current?.setTextScale(knobs.textDetail); }, [knobs.textDetail]);
  useEffect(() => {
    save({ palette, flowers, colors, knobs, text: typed, mode, poster: { text: pText, preset, seed } });
  }, [palette, flowers, colors, knobs, typed, mode, pText, preset, seed]);

  // chaos: the engine follows the slider at once; what is on screen regrows shortly after you stop moving it
  const firstChaos = useRef(true);
  useEffect(() => {
    const g = garden.current; if (!g) return;
    g.setChaos(knobs.chaos);
    if (firstChaos.current) { firstChaos.current = false; return; }
    const id = window.setTimeout(() => { if (mode === "poster") g.setPoster({ text: pText, preset, seed }); else g.regrow(); }, 140);
    return () => window.clearTimeout(id);
  }, [knobs.chaos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = garden.current; if (!g) return;
    g.setMode(mode);
    if (mode === "poster") g.setPoster({ text: pText, preset, seed });
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const attachPoster = useCallback((c: HTMLCanvasElement | null) => { posterEl.current = c; garden.current?.attachPoster(c); }, []);

  const rebuild = (patch: Partial<{ text: string; preset: string; seed: number }>) => {
    const next = { text: pText, preset, seed, ...patch };
    if (patch.text !== undefined) setPText(patch.text);
    if (patch.preset !== undefined) setPreset(patch.preset);
    if (patch.seed !== undefined) setSeed(patch.seed);
    garden.current?.setPoster(next);
  };

  // flowers: any subset, so people can build their own mix
  const applyFlowers = (next: string[]) => {
    if (!next.length) return;
    setFlowers(next);
    const g = garden.current; if (!g) return;
    g.setFlowers(next);
    // live: flowers already on screen swap to the new mix and bloom again
    if (mode === "poster") g.setPoster({ text: pText, preset, seed }); else { g.rekind(); g.refocus(); }
  };
  const toggleFlower = (id: string) => applyFlowers(flowers.includes(id) ? flowers.filter((k) => k !== id) : [...flowers, id]);

  const goMode = (m: Mode) => {
    if (m === mode) return;
    if (m === "poster") setPText(garden.current?.liveText() || pText);
    setMode(m);
  };

  const openExport = () => {
    setExportText(mode === "poster" ? pText : garden.current?.liveText() || "in bloom");
    setExportOpen(true);
  };
  const closeExport = useCallback(() => { setExportOpen(false); garden.current?.refocus(); }, []);
  const exportBase = useMemo(
    () => ({ text: exportText, palette: row, flowers, colors, chaos: knobs.chaos, detail: knobs.detail, textDetail: knobs.textDetail }),
    [exportText, row, flowers, colors, knobs.chaos, knobs.detail, knobs.textDetail],
  );

  const resetAll = () => {
    setPalette(0); setColors({}); setKnobs(KNOB_DEFAULTS); applyFlowers(ALL);
  };

  // GSAP: glass chrome slides in
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".fx-in", { opacity: 0, y: 16, duration: 0.8, stagger: 0.09, ease: "power3.out" });
    });
    return () => ctx.revert();
  }, [mode]);

  // GSAP: the cherry blossom invites you to type, then leaves once you do
  useEffect(() => {
    if (!emptyRef.current) return;
    gsap.to(emptyRef.current, { opacity: count === 0 && mode === "type" ? 0.85 : 0, y: count === 0 ? 0 : -16, duration: 0.6, ease: "power2.out" });
  }, [count, mode]);

  const statusRef = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (statusRef.current && status) gsap.fromTo(statusRef.current, { opacity: 0 }, { opacity: 1, duration: 0.35 }); }, [status]);

  // ----- Tweaks menu -----
  const groups: Group[] = [];
  if (mode === "poster") {
    groups.push(["Poster", [{
      kind: "node", key: "poster",
      node: (
        <PosterControls
          text={pText} preset={preset}
          onText={(t) => rebuild({ text: t })}
          onReshuffle={() => rebuild({ seed: Math.floor(Math.random() * 1e6) })}
          onPreset={(id) => rebuild({ preset: id })}
        />
      ),
    }]]);
  }
  groups.push(["Garden", [
    { kind: "range", key: "chaos", label: "Chaos", min: 0, max: 1, step: 0.01, def: KNOB_DEFAULTS.chaos, value: knobs.chaos, set: (v) => setKnob("chaos", v), hint: "From minimal botanical typography to the garden taking over: stems, branches, flower size and leaves all grow with it." },
    { kind: "node", key: "chaos-cap", node: <ChaosCaption value={knobs.chaos} /> },
    { kind: "range", key: "detail", label: "Flower cell size", min: 0, max: 1.8, step: 0.05, def: KNOB_DEFAULTS.detail, value: knobs.detail, set: (v) => setKnob("detail", v), hint: "Size of the characters the flowers are made of. Lower is finer and more detailed, higher is chunkier. At 0 the flowers are not ASCII at all: smooth vector art." },
    { kind: "range", key: "textDetail", label: "Text cell size", min: 0, max: 1.8, step: 0.05, def: KNOB_DEFAULTS.textDetail, value: knobs.textDetail, set: (v) => setKnob("textDetail", v), hint: "Size of the characters the letters are made of, set separately from the flowers. At 0 the type is not ASCII: it is drawn in the real font." },
    { kind: "range", key: "recoil", label: "Recoil", min: 0, max: 80, step: 1, def: KNOB_DEFAULTS.recoil, value: knobs.recoil, set: (v) => setKnob("recoil", v), hint: "How far a stem snaps back when you cut it with space." },
    { kind: "toggle", key: "boil", label: "Boil", def: KNOB_DEFAULTS.boil, value: knobs.boil, set: (v) => setKnob("boil", v), hint: "Hand-drawn jitter on every stem and flower." },
    { kind: "toggle", key: "grid", label: "Cell grid", def: KNOB_DEFAULTS.grid, value: knobs.grid, set: (v) => setKnob("grid", v), hint: "Faint grid lines behind the characters." },
  ]]);
  groups.push(["Flowers", [{
    kind: "node", key: "flowers",
    node: (
      <FlowerPicker
        flowers={flowers} colors={colors} row={row}
        onToggle={toggleFlower} onSolo={(id) => applyFlowers([id])} onAll={() => applyFlowers(ALL)}
        onColor={(id, hex) => setColors((c) => ({ ...c, [id]: hex }))} onReset={() => setColors({})}
      />
    ),
  }]]);
  groups.push(["Palette", [{
    kind: "node", key: "palette",
    node: (
      <div className="pal-grid">
        {PAL.map((p, i) => (
          <button
            key={p[0]} type="button" className={"sw" + (i === palette ? " on" : "")} aria-label={p[0]} title={p[0]}
            style={{ background: p[1] }}
            onClick={() => { setPalette(i); garden.current?.refocus(); }}
            {...hoverTween}
          >
            <span className="dot" style={{ background: p[2] }} />
            <span className="dot small" style={{ background: p[3] }} />
          </button>
        ))}
      </div>
    ),
  }]]);
  const exportJSON = () => JSON.stringify({ palette: row[0], flowers, colors, knobs }, null, 2);
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <>
      <LiquidGlassFilter refraction={GLASS.refraction} ripple={GLASS.ripple} />
      <div
        className="app"
        data-tg="app"
        style={{ background: bg, ["--accent" as any]: accent }}
        onPointerDown={(e) => garden.current?.appPointerDown(e)}
        onClick={(e) => garden.current?.appClick(e)}
      >
        <canvas ref={canvasRef} className="garden" style={{ display: mode === "type" ? "block" : "none" }} />
        <input
          ref={inputRef}
          className="hidden-input"
          aria-label="Type to grow a garden"
          autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
          onInput={(e) => garden.current?.inputDiff(e.currentTarget)}
        />

        {mode === "poster" && (
          <div className="poster-stage">
            <canvas ref={attachPoster} className="pcanvas" width={1080} height={1080} />
          </div>
        )}

        {mode === "type" && (
          <div className="empty" ref={emptyRef} aria-hidden="true">
            <Ascii piece={cherryBlossom} className="art" style={{ fontSize: "clamp(5px, 0.9vw, 9px)", color: accent }} />
            <div className="empty-label">start typing</div>
          </div>
        )}

        <a
          className="gh glass fx-in" href="https://github.com/ridit-jangra/ascii-garden" target="_blank" rel="noopener noreferrer"
          aria-label="View the source on GitHub" title="ridit-jangra/ascii-garden on GitHub" onPointerDown={stop}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>

        <div className="top-bar fx-in" onPointerDown={stop}>
          <GlassChoices options={MODES} value={mode} onChange={(v) => goMode(v as Mode)} label="Mode" />
        </div>


        <div
          className="dock glass fx-in"
          data-tg="bar"
          onPointerDown={stop}
          style={{ borderRadius: GLASS.radius, ["--blur" as any]: `${GLASS.blur}px` }}
        >
          {mode === "type" ? (
            <>
              <div className="keys">
                <span className="fine"><kbd>type</kbd>grow</span><span className="coarse"><kbd>tap</kbd>type</span>
                <span><kbd>space</kbd>cut</span>
                <span><kbd>⌫</kbd>wither</span>
                <span><kbd>↵</kbd>clear</span>
                <span className="fine"><kbd>2×click</kbd>rose</span>
              </div>
              <div className="actions">
                <button type="button" className="pill" {...hoverTween} onClick={() => { garden.current?.savePNG(); garden.current?.refocus(); }}>PNG</button>
                <button type="button" className="pill" {...hoverTween} onClick={() => { garden.current?.saveSVG(); garden.current?.refocus(); }}>SVG</button>
                <button type="button" className="pill primary" {...hoverTween} onClick={openExport}>{"</>"} Code</button>
              </div>
            </>
          ) : (
            <>
              <span className="status" ref={statusRef}>{status || `${(PRESETS.find((x) => x.id === preset)?.T ?? 3000) / 1000}s loop · 1080 × 1080 · 30 fps`}</span>
              <div className="actions">
                <button type="button" className="pill primary" disabled={busy} {...hoverTween} onClick={() => garden.current?.exportVideo()}>{busy ? "Exporting…" : videoLabel}</button>
                <button type="button" className="pill" disabled={busy} {...hoverTween} onClick={() => garden.current?.exportFrames()}>PNG frames</button>
                <button type="button" className="pill" {...hoverTween} onClick={openExport}>{"</>"} Code</button>
              </div>
            </>
          )}
        </div>

        <TweaksPanel groups={groups} exportJSON={exportJSON} onReset={resetAll} />
      </div>

      <CodeExport open={exportOpen} onClose={closeExport} base={exportBase} />
    </>
  );
}

/** The live caption under the Chaos slider; it escalates as the garden takes over. */
function ChaosCaption({ value }: { value: number }) {
  const cap = useRef<HTMLDivElement>(null);
  const label = chaosLabel(value);
  const last = useRef(label);
  useEffect(() => {
    if (!cap.current || label === last.current) return;
    last.current = label;
    gsap.fromTo(cap.current, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" });
    if (label.startsWith("THE")) gsap.fromTo(cap.current, { x: -4 }, { x: 0, duration: 0.6, ease: "elastic.out(1, 0.15)" });
  }, [label]);
  return <div className={"chaos-cap" + (label.startsWith("THE") ? " max" : "")} ref={cap}>{label}</div>;
}

interface PickerProps {
  flowers: string[]; colors: Record<string, string>; row: string[];
  onToggle: (id: string) => void; onSolo: (id: string) => void; onAll: () => void;
  onColor: (id: string, hex: string) => void; onReset: () => void;
}

/** Multi-select flower chips: toggle any species into your own mix, and tweak each one's colour. */
function FlowerPicker({ flowers, colors, row, onToggle, onSolo, onAll, onColor, onReset }: PickerProps) {
  const custom = Object.keys(colors).length > 0;
  const allOn = flowers.length === FLOWERS.length;
  return (
    <div className="picker" aria-label="Flowers">
      <div className="chips">
        {FLOWERS.map((f) => {
          const sel = flowers.includes(f.id);
          const col = colors[f.id] || defaultKindColor(f.id, row);
          return (
            <span key={f.id} className={"chip" + (sel ? " on" : "")} style={{ ["--c" as any]: col }} {...hoverSoft}>
              <button
                type="button" className="chip-main" aria-pressed={sel}
                title="Click to add or remove · Shift-click to grow only this one"
                onClick={(e) => { e.stopPropagation(); if (e.shiftKey) onSolo(f.id); else onToggle(f.id); }}
              >
                <span className="chip-glyph">{f.glyph}</span>
                <span className="chip-label">{f.label}</span>
              </button>
              <label className="chip-pick" title={`Tweak the ${f.label.toLowerCase()} colour`} onClick={(e) => e.stopPropagation()}>
                <input type="color" value={col.toLowerCase()} onChange={(e) => onColor(f.id, e.target.value)} aria-label={`${f.label} colour`} />
              </label>
            </span>
          );
        })}
      </div>
      <div className="picker-tools">
        <button type="button" className={"tool" + (allOn ? " on" : "")} onClick={(e) => { e.stopPropagation(); onAll(); }}>All</button>
        {custom && <button type="button" className="tool" onClick={(e) => { e.stopPropagation(); onReset(); }} title="Back to each flower's default colour">Reset colours</button>}
      </div>
    </div>
  );
}

function PosterControls(p: { text: string; preset: string; onText: (t: string) => void; onReshuffle: () => void; onPreset: (id: string) => void }) {
  return (
    <div className="poster-controls">
      <input className="words" value={p.text} spellCheck={false} aria-label="Poster words" onChange={(e) => p.onText(e.target.value)} />
      <button type="button" className="tool" onClick={p.onReshuffle}>Regrow garden</button>
      <div className="presets">
        {PRESETS.map((x) => (
          <button key={x.id} type="button" className={"preset" + (p.preset === x.id ? " on" : "")} onClick={() => p.onPreset(x.id)}>
            <span>{x.label}</span>
            <small>{x.sub}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
