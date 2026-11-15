import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { Ascii } from "ascii.rest/react";
import * as cherryBlossom from "ascii.rest/pieces/cherry-blossom";
import { Garden, PAL, PRESETS, FLOWERS, THEMES, THEMES_ENABLED, defaultKindColor, renderKindPreview, type Mode } from "./engine/garden";
import CodeExport from "./export/CodeExport";
import { exportGif } from "./export/gif";
import { startRecording, type Recording, type Clip } from "./export/record";
import LiquidGlassFilter from "./components/LiquidGlassFilter";
import GlassChoices from "./components/GlassChoices";
import TweaksPanel, { type Group } from "./components/TweaksPanel";
import { GLASS, KNOB_DEFAULTS, MIN_CELL, OPEN_KEY, loadSaved, save } from "./tweaks";

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

/**
 * Smooth hovers for every button-like control: GSAP fades the background and text colour instead of snapping.
 * Nothing moves; it is a pure colour fade. Selected and primary buttons keep their own look.
 */
function useHoverFade() {
  useEffect(() => {
    const SEL = ".export-menu button, .pill, .tool, .tweaks-action, .tweaks-close, .btn, .x-close, .x-tab";
    const root = document.documentElement;
    const css = (v: string) => getComputedStyle(root).getPropertyValue(v).trim();
    const find = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.(SEL) as HTMLElement | null;
    const skip = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.matches(".on, .primary, .solid, .confirm, .menu-discard");
    /** The same colour fully transparent, so fading in from "no background" does not pass through black. */
    const clear = (c: string) => c.replace(/rgba?\(([^)]*)\)/, (_m, inner) => { const [r, g, b] = inner.split(",").map((x: string) => x.trim()); return `rgba(${r}, ${g}, ${b}, 0)`; });
    const over = (e: PointerEvent) => {
      const el = find(e.target);
      if (!el || skip(el) || (e.relatedTarget && el.contains(e.relatedTarget as Node))) return;
      const cs = getComputedStyle(el);
      if (!el.dataset.rest) el.dataset.rest = cs.backgroundColor + "|" + cs.color;
      const hover = css("--chip-hover");
      if (/,\s*0\)$/.test(cs.backgroundColor) || cs.backgroundColor === "transparent") gsap.set(el, { backgroundColor: clear(hover) });
      gsap.to(el, { backgroundColor: hover, color: css("--text"), duration: 0.28, ease: "power2.out", overwrite: "auto" });
    };
    const out = (e: PointerEvent) => {
      const el = find(e.target);
      if (!el || (e.relatedTarget && el.contains(e.relatedTarget as Node))) return;
      const rest = el.dataset.rest;
      if (!rest) return;
      const [bg, color] = rest.split("|");
      const toBg = /,\s*0\)$/.test(bg) || bg === "transparent" ? clear(css("--chip-hover")) : bg;
      gsap.to(el, {
        backgroundColor: toBg, color, duration: 0.4, ease: "power2.out", overwrite: "auto",
        onComplete: () => { gsap.set(el, { clearProps: "backgroundColor,color,x" }); delete el.dataset.rest; },
      });
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => { document.removeEventListener("pointerover", over); document.removeEventListener("pointerout", out); };
  }, []);
}

export default function App() {
  useHoverFade();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const garden = useRef<Garden | null>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const saved = useRef(loadSaved(ALL, PAL.length)).current;
  const posterEl = useRef<HTMLCanvasElement | null>(null);
  // the saved theme and the saved species that belong to it (anything else falls back to the whole theme)
  const initTheme = (THEMES_ENABLED && THEMES.find((t) => t.id === saved.theme)) || THEMES[0];
  const initFlowers = (() => { const f = saved.flowers.filter((k) => initTheme.kinds.includes(k)); return f.length ? f : initTheme.kinds; })();

  const [mode, setMode] = useState<Mode>(saved.mode);
  const [typed, setTyped] = useState(saved.text);
  const [palette, setPalette] = useState(saved.palette);
  const [theme, setTheme] = useState(initTheme.id);
  const [flowers, setFlowers] = useState<string[]>(initFlowers);
  const themeObj = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  const [colors, setColors] = useState<Record<string, string>>(saved.colors);
  const [knobs, setKnobs] = useState(saved.knobs);
  const [preset, setPreset] = useState(PRESETS.some((x) => x.id === saved.poster.preset) ? saved.poster.preset : "breathe");
  const [pText, setPText] = useState(saved.poster.text);
  const [seed, setSeed] = useState(saved.poster.seed);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [count, setCount] = useState(0);
  const [videoLabel, setVideoLabel] = useState("Export loop");
  // recording the live Type tab as MP4 or GIF
  const [rec, setRec] = useState<{ sec: number } | null>(null);
  const [clip, setClip] = useState<Clip | null>(null); // a finished recording waiting for MP4 or GIF
  const [recMsg, setRecMsg] = useState("");
  const recRef = useRef<Recording | null>(null);
  const lastStatus = useRef("");
  const [menuOpen, setMenuOpen] = useState(false);
  const chevRef = useRef<SVGSVGElement>(null);
  // while the Tweaks panel is open the garden is centred in the space beside it, so nothing slides underneath
  const [panelOpen, setPanelOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; } });
  const [exportOpen, setExportOpen] = useState(false);
  const [exportText, setExportText] = useState("ASCII Garden");

  const row = PAL[palette];
  const bg = row[1], accent = row[2], fg = row[5];
  const light = luminance(bg) > 0.5;
  const setKnob = <K extends keyof typeof knobs>(k: K, v: (typeof knobs)[K]) => setKnobs((o) => ({ ...o, [k]: v }));

  // engine lifetime
  useEffect(() => {
    const g = new Garden(canvasRef.current!, inputRef.current!, { onStatus: (s) => { lastStatus.current = s; setStatus(s); }, onBusy: setBusy, onCount: setCount, onText: setTyped });
    garden.current = g;
    g.setTheme(initTheme.id);
    g.setFlowers(initFlowers);
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
    save({ palette, theme, flowers, colors, knobs, text: typed, mode, poster: { text: pText, preset, seed } });
  }, [palette, theme, flowers, colors, knobs, typed, mode, pText, preset, seed]);

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

  // theme: what grows out of the letters. Everything on screen regrows in the new theme.
  const changeTheme = (id: string) => {
    const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
    setTheme(t.id);
    setFlowers(t.kinds);
    const g = garden.current; if (!g) return;
    g.setTheme(t.id);
    g.setFlowers(t.kinds);
    if (mode === "poster") g.setPoster({ text: pText, preset, seed }); else { g.regrow(); g.refocus(); }
  };

  const goMode = (m: Mode) => {
    if (m === mode) return;
    if (m === "poster") setPText(garden.current?.liveText() || pText);
    setMode(m);
  };

  const stopRec = useCallback(async () => {
    const r = recRef.current;
    if (!r) return;
    recRef.current = null;
    setRec(null);
    setMenuOpen(false);
    setRecMsg("Processing…");
    try {
      const out = await r.stop();
      if (typeof out === "string") setRecMsg(out);
      else { setRecMsg(""); setClip(out); } // now they choose MP4 or GIF
    } catch (err) { console.error(err); setRecMsg("Recording failed."); }
  }, []);
  const toggleRec = () => {
    const g = garden.current; if (!g) return;
    if (recRef.current) { void stopRec(); return; }
    setClip(null); setMenuOpen(false); setRecMsg("");
    recRef.current = startRecording(g, (sec) => setRec({ sec }), () => void stopRec());
    setRec({ sec: 0 });
    g.refocus(); // keep typing: keys go to the garden, not the button
  };
  const saveClip = async (kind: "video" | "gif") => {
    const c = clip; if (!c) return;
    setClip(null);
    if (kind === "video") setRecMsg(c.saveVideo());
    else { setRecMsg("Encoding GIF 0%"); setRecMsg(await c.saveGif((p) => setRecMsg(`Encoding GIF ${p}%`))); }
    window.setTimeout(() => setRecMsg(""), 6000);
    garden.current?.refocus();
  };
  // leaving the Type tab ends a recording and drops an unsaved clip (it only captures the Type view)
  useEffect(() => { if (mode !== "type") { if (recRef.current) void stopRec(); setClip(null); } }, [mode, stopRec]);
  useEffect(() => {
    if (!clip) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setClip(null); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [clip]);

  /**
   * The normal export, from the Type tab: the words on the garden become the same clean 1080 x 1080 loop the Poster tab
   * makes (with the chosen motion preset), as an MP4, a GIF or PNG frames.
   */
  const exportLoop = async (kind: "mp4" | "gif" | "frames") => {
    const g = garden.current;
    if (!g || g.state.busy) return;
    setMenuOpen(false);
    setRecMsg("");
    if (mode === "type") g.setPoster({ text: g.liveText() || pText, preset, seed }); // the Poster tab already has its own words
    if (kind === "mp4") await g.exportVideo();
    else if (kind === "gif") await exportGif(g);
    else await g.exportFrames();
    setRecMsg(lastStatus.current);
    window.setTimeout(() => setRecMsg(""), 6000);
  };
  // GSAP: the chevron points up (the menu opens above the dock) and turns to point down while it is open
  useEffect(() => {
    if (chevRef.current) gsap.to(chevRef.current, { rotation: menuOpen ? 180 : 0, duration: 0.3, ease: "power3.out" });
  }, [menuOpen]);
  // close the Export menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const down = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest(".export-menu, .export-btn")) setMenuOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key); };
  }, [menuOpen]);

  const openExport = () => {
    setExportText(mode === "poster" ? pText : garden.current?.liveText() || "ASCII Garden");
    setExportOpen(true);
  };
  const closeExport = useCallback(() => { setExportOpen(false); garden.current?.refocus(); }, []);
  const exportBase = useMemo(
    () => ({ text: exportText, theme, palette: row, flowers, colors, chaos: knobs.chaos, detail: knobs.detail, textDetail: knobs.textDetail }),
    [exportText, theme, row, flowers, colors, knobs.chaos, knobs.detail, knobs.textDetail],
  );

  const resetAll = () => {
    setPalette(0); setColors({}); setKnobs(KNOB_DEFAULTS); changeTheme("botanical");
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
  if (mode === "type") {
    groups.push(["Export loop", [{ kind: "node", key: "presets", node: <PresetPicker preset={preset} onPreset={(id) => setPreset(id)} /> }]]);
  }
  groups.push(["Garden", [
    ...(THEMES_ENABLED ? [{ kind: "node" as const, key: "theme", node: <ThemeSwitch value={theme} onChange={changeTheme} /> }] : []),
    { kind: "range", key: "chaos", label: "Chaos", min: 0, max: 1, step: 0.01, def: KNOB_DEFAULTS.chaos, value: knobs.chaos, set: (v) => setKnob("chaos", v), hint: "From minimal botanical typography to the garden taking over: stems, branches, flower size and leaves all grow with it." },
    { kind: "node", key: "chaos-cap", node: <ChaosCaption value={knobs.chaos} /> },
    { kind: "range", key: "detail", label: "Flower cell size", min: MIN_CELL, max: 1.8, step: 0.05, def: KNOB_DEFAULTS.detail, value: knobs.detail, set: (v) => setKnob("detail", v), hint: "Size of the characters the flowers are made of. Lower is finer and more detailed, higher is chunkier." },
    { kind: "range", key: "textDetail", label: "Text cell size", min: MIN_CELL, max: 1.8, step: 0.05, def: KNOB_DEFAULTS.textDetail, value: knobs.textDetail, set: (v) => setKnob("textDetail", v), hint: "Size of the characters the letters are made of, set separately from the flowers." },
    { kind: "range", key: "recoil", label: "Recoil", min: 0, max: 80, step: 1, def: KNOB_DEFAULTS.recoil, value: knobs.recoil, set: (v) => setKnob("recoil", v), hint: "How far a stem snaps back when you cut it with space." },
    { kind: "toggle", key: "boil", label: "Boil", def: KNOB_DEFAULTS.boil, value: knobs.boil, set: (v) => setKnob("boil", v), hint: "Hand-drawn jitter on every stem and flower." },
    { kind: "toggle", key: "grid", label: "Cell grid", def: KNOB_DEFAULTS.grid, value: knobs.grid, set: (v) => setKnob("grid", v), hint: "Faint grid lines behind the characters." },
  ]]);
  groups.push([themeObj.group, [{
    kind: "node", key: "flowers",
    node: (
      <FlowerPicker
        kinds={themeObj.kinds} flowers={flowers} colors={colors} row={row}
        onToggle={toggleFlower} onSolo={(id) => applyFlowers([id])} onAll={() => applyFlowers(themeObj.kinds)}
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

  const menuItem = (title: string, sub: string, onClick: () => void) => (
    <button key={title} type="button" role="menuitem" onClick={onClick}><b>{title}</b><small>{sub}</small></button>
  );
  const videoName = videoLabel.includes("unavailable") ? "Video (unavailable)" : videoLabel.replace(/^Export | loop$/g, "");
  const exportBtn = (
    <button type="button" className="pill export-btn" disabled={busy || !!rec} aria-haspopup="menu" aria-expanded={menuOpen} {...hoverTween} onClick={() => setMenuOpen((o) => !o)}>
      Export
      <svg ref={chevRef} className="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
    </button>
  );
  // everything you can export lives in this one menu
  const exportMenu = menuOpen && (
    <div className="export-menu glass" role="menu" style={{ ["--blur" as any]: "14px" }}>
      {mode === "type" && (
        <>
          <div className="menu-title">Image</div>
          {menuItem("PNG", "the garden as a picture", () => { setMenuOpen(false); garden.current?.savePNG(); garden.current?.refocus(); })}
          {menuItem("SVG", "made of text, scales forever", () => { setMenuOpen(false); garden.current?.saveSVG(); garden.current?.refocus(); })}
        </>
      )}
      <div className="menu-title">{mode === "type" ? "Loop · preset in Tweaks" : "Loop"}</div>
      {menuItem(videoName, "1080 × 1080 video of the words growing", () => exportLoop("mp4"))}
      {menuItem("GIF", "600 × 600, small enough for a README", () => exportLoop("gif"))}
      {menuItem("PNG frames", "every frame, as a .zip", () => exportLoop("frames"))}
      <div className="menu-title">Code</div>
      {menuItem("React / HTML", "copy-paste, no dependencies", () => { setMenuOpen(false); openExport(); })}
    </div>
  );
  // after you stop recording: save it as video or as a GIF
  const clipMenu = clip && (
    <div className="export-menu glass" role="dialog" aria-label="Save recording" style={{ ["--blur" as any]: "14px" }}>
      <div className="menu-title">Save this {Math.max(1, Math.round(clip.seconds))}s recording as</div>
      {clip.videoExt && menuItem(clip.videoExt.toUpperCase() + " video", "full quality, plays anywhere", () => saveClip("video"))}
      {menuItem("GIF", `${clip.gifFrames} frames, loops, great for a README`, () => saveClip("gif"))}
      <button type="button" className="menu-discard" onClick={() => setClip(null)}>Discard</button>
    </div>
  );

  return (
    <>
      <LiquidGlassFilter refraction={GLASS.refraction} ripple={GLASS.ripple} />
      <div
        className="app"
        data-tg="app"
        style={{ background: bg, ["--accent" as any]: accent, ["--panel" as any]: panelOpen ? "300px" : "0px" }}
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
              {rec ? (
                <span className="rec-status"><i className="rec-dot" />Recording {Math.floor(rec.sec / 60)}:{String(Math.floor(rec.sec % 60)).padStart(2, "0")} · type away, then press Stop</span>
              ) : clip ? (
                <span className="status">Recording ready · choose a format</span>
              ) : busy ? (
                <span className="status">{status}</span>
              ) : recMsg ? (
                <span className="status">{recMsg}</span>
              ) : (
                <div className="keys">
                  <span className="fine"><kbd>type</kbd>grow</span><span className="coarse"><kbd>tap</kbd>type</span>
                  <span><kbd>space</kbd>cut</span>
                  <span><kbd>⌫</kbd>wither</span>
                  <span><kbd>↵</kbd>clear</span>
                  <span className="fine"><kbd>2×click</kbd>rose</span>
                </div>
              )}
              <div className="actions">
                <button
                  type="button" className={"pill rec-btn" + (rec ? " on" : "")} disabled={busy}
                  title="Record the garden: press, type, then press Stop and choose MP4 or GIF"
                  {...hoverTween} onClick={toggleRec}
                >{rec ? "■ Stop" : <><i className="rec-dot-sm" />Record</>}</button>
                {exportBtn}
                {clipMenu}
                {exportMenu}
              </div>
            </>
          ) : (
            <>
              <span className="status" ref={statusRef}>{status || `${(PRESETS.find((x) => x.id === preset)?.T ?? 3000) / 1000}s loop · 1080 × 1080 · 30 fps`}</span>
              <div className="actions">
                {exportBtn}
                {exportMenu}
              </div>
            </>
          )}
        </div>

        <TweaksPanel
          groups={groups} exportJSON={exportJSON} onReset={resetAll} onOpenChange={setPanelOpen}
          footer={<>Based on <a href="https://type-garden.vercel.app/" target="_blank" rel="noopener noreferrer">Type Garden</a> by Akshat Agarwal</>}
        />
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

/** A small drawing of one flower, in its current colour, drawn by the engine itself. */
function FlowerPreview({ kind, color, line }: { kind: string; color: string; line: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) renderKindPreview(ref.current, kind, color, line, 40); }, [kind, color, line]);
  return <canvas ref={ref} className="chip-prev" aria-hidden="true" />;
}

/** Botanical, Ocean or Crystal: what grows out of the letters. */
function ThemeSwitch({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="theme-seg" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id} type="button" role="radio" aria-checked={t.id === value} className={"tool" + (t.id === value ? " on" : "")}
          onClick={(e) => { e.stopPropagation(); onChange(t.id); }}
        >{t.label}</button>
      ))}
    </div>
  );
}

interface PickerProps {
  /** The species of the current theme. */
  kinds: string[];
  flowers: string[]; colors: Record<string, string>; row: string[];
  onToggle: (id: string) => void; onSolo: (id: string) => void; onAll: () => void;
  onColor: (id: string, hex: string) => void; onReset: () => void;
}

/** Multi-select flower chips: toggle any species into your own mix, and tweak each one's colour. */
function FlowerPicker({ kinds, flowers, colors, row, onToggle, onSolo, onAll, onColor, onReset }: PickerProps) {
  const custom = Object.keys(colors).length > 0;
  const allOn = kinds.every((k) => flowers.includes(k));
  return (
    <div className="picker" aria-label="Flowers">
      <div className="chips">
        {FLOWERS.filter((f) => kinds.includes(f.id)).map((f) => {
          const sel = flowers.includes(f.id);
          const col = colors[f.id] || defaultKindColor(f.id, row);
          return (
            <span key={f.id} className={"chip" + (sel ? " on" : "")} style={{ ["--c" as any]: col }}>
              <button
                type="button" className="chip-main" aria-pressed={sel}
                title="Click to add or remove · Shift-click to grow only this one"
                onClick={(e) => { e.stopPropagation(); if (e.shiftKey) onSolo(f.id); else onToggle(f.id); }}
              >
                <span className="chip-glyph"><FlowerPreview kind={f.id} color={col} line={row[4]} /></span>
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
      <PresetPicker preset={p.preset} onPreset={p.onPreset} />
    </div>
  );
}

/** The motion presets (how the loop moves). Used by the Poster tab and by the Type tab's Export menu. */
function PresetPicker({ preset, onPreset }: { preset: string; onPreset: (id: string) => void }) {
  return (
    <div className="presets">
      {PRESETS.map((x) => (
        <button key={x.id} type="button" className={"preset" + (preset === x.id ? " on" : "")} onClick={(e) => { e.stopPropagation(); onPreset(x.id); }}>
          <span>{x.label}</span>
          <small>{x.sub}</small>
        </button>
      ))}
    </div>
  );
}
