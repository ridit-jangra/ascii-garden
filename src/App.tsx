import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import Lenis from "lenis";
import { Ascii, Banner } from "ascii.rest/react";
import * as butterfly from "ascii.rest/pieces/butterfly";
import * as cherryBlossom from "ascii.rest/pieces/cherry-blossom";
import { Garden, PAL, PRESETS, type Mode } from "./engine/garden";

/** GSAP hover tween shared by every button: grows on enter, springs back on leave. */
const hoverTween = {
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
    gsap.to(e.currentTarget, { scale: 1.1, duration: 0.18, ease: "power2.out", overwrite: "auto" });
  },
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
    const sel = e.currentTarget.dataset.sel === "1";
    gsap.to(e.currentTarget, { scale: sel ? 1.1 : 1, duration: 0.5, ease: "elastic.out(1, 0.45)", overwrite: "auto" });
  },
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const garden = useRef<Garden | null>(null);
  const emptyRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>("type");
  const [palette, setPalette] = useState(0);
  const [preset, setPreset] = useState("breathe");
  const [pText, setPText] = useState("in bloom");
  const [seed, setSeed] = useState(7);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [count, setCount] = useState(0);
  const [videoLabel, setVideoLabel] = useState("Export loop");

  const pal = PAL[palette];
  const bg = pal[1], flower = pal[2], stem = pal[3], text = pal[5];

  // engine lifetime
  useEffect(() => {
    const g = new Garden(canvasRef.current!, inputRef.current!, {
      onStatus: setStatus,
      onBusy: setBusy,
      onCount: setCount,
    });
    garden.current = g;
    g.start();
    setVideoLabel(g.vmime ? `Export ${g.vmime.includes("mp4") ? "MP4" : "WebM"} loop` : "Video export unavailable");
    return () => { g.destroy(); garden.current = null; };
  }, []);

  useEffect(() => { garden.current?.setPalette(palette); }, [palette]);
  useEffect(() => {
    const g = garden.current; if (!g) return;
    g.setMode(mode);
    if (mode === "poster") g.setPoster({ text: pText, preset, seed });
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const attachPoster = useCallback((c: HTMLCanvasElement | null) => { garden.current?.attachPoster(c); }, []);

  const rebuild = (patch: Partial<{ text: string; preset: string; seed: number }>) => {
    const next = { text: pText, preset, seed, ...patch };
    if (patch.text !== undefined) setPText(patch.text);
    if (patch.preset !== undefined) setPreset(patch.preset);
    if (patch.seed !== undefined) setSeed(patch.seed);
    garden.current?.setPoster(next);
  };

  const goMode = (m: Mode) => {
    if (m === mode) return;
    if (m === "poster") setPText(garden.current?.liveText() || pText);
    setMode(m);
  };

  // GSAP: entrance for the type view
  useLayoutEffect(() => {
    if (mode !== "type") return;
    const ctx = gsap.context(() => {
      gsap.from(".fx-in", { opacity: 0, y: 14, duration: 0.8, stagger: 0.09, ease: "power3.out" });
    });
    return () => ctx.revert();
  }, [mode]);

  // GSAP: selected swatch grows
  useEffect(() => {
    if (mode !== "type") return;
    gsap.to(".sw", { scale: (_i, el) => (el.dataset.sel === "1" ? 1.1 : 1), duration: 0.45, ease: "back.out(2.2)" });
  }, [palette, mode]);

  // GSAP: the cherry blossom invites you to type, then leaves once you do
  useEffect(() => {
    if (!emptyRef.current) return;
    gsap.to(emptyRef.current, { opacity: count === 0 && mode === "type" ? 0.8 : 0, y: count === 0 ? 0 : -16, duration: 0.6, ease: "power2.out" });
  }, [count, mode]);

  // GSAP: status line fades in on change
  const statusRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (statusRef.current && status) gsap.fromTo(statusRef.current, { opacity: 0 }, { opacity: 1, duration: 0.35 }); }, [status]);

  return (
    <div
      className="app"
      data-tg="app"
      style={{ background: bg, ["--fg" as any]: text, ["--bg" as any]: bg, ["--flower" as any]: flower, ["--stem" as any]: stem }}
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

      {mode === "type" && (
        <>
          <div className="logo fx-in" aria-label="Type Garden">
            <Banner text="type garden" font="slim" color={[flower, text]} style={{ width: "clamp(150px, 20vw, 230px)" }} />
          </div>

          <div className="empty" ref={emptyRef} aria-hidden="true">
            <Ascii piece={cherryBlossom} className="art" style={{ fontSize: "clamp(5px, 0.9vw, 9px)", color: flower }} />
            <div className="empty-label">start typing</div>
          </div>
        </>
      )}

      <div className="modes fx-in" data-tg="modes">
        {([["type", "Type"], ["poster", "Poster"]] as [Mode, string][]).map(([id, label]) => (
          <button
            key={id}
            className="mode"
            style={{ background: mode === id ? "#FFFFFF" : "transparent", color: mode === id ? "#000000" : "#BDBDBD" }}
            onClick={() => goMode(id)}
          >{label}</button>
        ))}
      </div>

      {mode === "type" && (
        <div className="bar fx-in" data-tg="bar" style={{ color: text }}>
          <div className="hints">
            <span className="fine">type to grow</span><span className="coarse">tap to type</span>
            <span>space cuts</span>
            <span className="fine">backspace withers</span><span className="coarse">⌫ withers</span>
            <span className="fine">enter clears</span><span className="coarse">return clears</span>
          </div>
          <div className="ctrls">
            <div className="pal" style={{ background: bg }}>
              {PAL.map((p, i) => (
                <button
                  key={p[0]}
                  className="sw sw-dot"
                  data-sel={i === palette ? "1" : "0"}
                  aria-label={p[0]}
                  title={p[0]}
                  style={{ background: p[1], borderColor: i === palette ? text : p[1] === bg ? "#3A3A3A" : "transparent" }}
                  onClick={(e) => { e.stopPropagation(); setPalette(i); garden.current?.refocus(); }}
                  {...hoverTween}
                >
                  <span className="dot" style={{ background: p[2] }} />
                </button>
              ))}
            </div>
            <button className="btn" {...hoverTween} onClick={() => { garden.current?.savePNG(); garden.current?.refocus(); }}>PNG</button>
            <button className="btn" {...hoverTween} onClick={() => { garden.current?.saveSVG(); garden.current?.refocus(); }}>SVG</button>
          </div>
        </div>
      )}

      {mode === "poster" && (
        <PosterView
          pText={pText} preset={preset} palette={palette} busy={busy} status={status} statusRef={statusRef} videoLabel={videoLabel}
          onText={(t) => rebuild({ text: t })}
          onReshuffle={() => rebuild({ seed: Math.floor(Math.random() * 1e6) })}
          onPreset={(id) => rebuild({ preset: id })}
          onPalette={setPalette}
          onVideo={() => garden.current?.exportVideo()}
          onFrames={() => garden.current?.exportFrames()}
          attachPoster={attachPoster}
          flower={flower} text={text}
        />
      )}
    </div>
  );
}

interface PosterProps {
  pText: string; preset: string; palette: number; busy: boolean; status: string; videoLabel: string;
  statusRef: React.RefObject<HTMLDivElement>;
  onText: (t: string) => void; onReshuffle: () => void; onPreset: (id: string) => void; onPalette: (i: number) => void;
  onVideo: () => void; onFrames: () => void; attachPoster: (c: HTMLCanvasElement | null) => void;
  flower: string; text: string;
}

function PosterView(p: PosterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // GSAP entrance + Lenis smooth scroll on the settings panel
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".p-in", { opacity: 0, x: -18, duration: 0.7, stagger: 0.07, ease: "power3.out" });
      gsap.from(".stage-wrap", { opacity: 0, scale: 0.96, duration: 0.8, ease: "power3.out" });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!panelRef.current || !contentRef.current) return;
    const lenis = new Lenis({ wrapper: panelRef.current, content: contentRef.current, lerp: 0.1, smoothWheel: true });
    const raf = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    return () => { gsap.ticker.remove(raf); lenis.destroy(); };
  }, []);

  return (
    <div className="poster" ref={rootRef}>
      <div className="panel" ref={panelRef} data-tg="panel">
        <div className="panel-in" ref={contentRef}>
          <div className="p-in head">
            <Ascii piece={butterfly} className="art" style={{ fontSize: "4.6px", color: p.flower }} />
            <div className="title">Poster</div>
            <div className="muted">1:1 · {(PRESETS.find((x) => x.id === p.preset)?.T ?? 3000) / 1000}s loop · 30 fps · ASCII</div>
          </div>

          <div className="p-in block">
            <div className="label">Words</div>
            <input className="words" value={p.pText} spellCheck={false} onChange={(e) => p.onText(e.target.value)} />
            <button className="btn ghost" {...hoverTween} onClick={p.onReshuffle}>Regrow garden</button>
          </div>

          <div className="p-in block">
            <div className="label">Motion</div>
            <div className="grid2">
              {PRESETS.map((x) => (
                <button
                  key={x.id}
                  className="preset"
                  style={{ background: p.preset === x.id ? "#161616" : "transparent", borderColor: p.preset === x.id ? "#FFFFFF" : "#2A2A2A" }}
                  onClick={() => p.onPreset(x.id)}
                >
                  <span className="pl">{x.label}</span>
                  <span className="muted small">{x.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-in block">
            <div className="label">Palette</div>
            <div className="grid2">
              {PAL.map((x, i) => (
                <button
                  key={x[0]}
                  className="pal-card"
                  aria-label={x[0]}
                  style={{ borderColor: p.palette === i ? "#FFFFFF" : "#2A2A2A" }}
                  onClick={() => p.onPalette(i)}
                >
                  <span className="pal-prev" style={{ background: x[1] }}>
                    <span className="pd" style={{ background: x[2], width: 18, height: 18 }} />
                    <span className="pd" style={{ background: x[3], width: 12, height: 12, marginLeft: -4 }} />
                    <span className="aa" style={{ color: x[5] }}>Aa</span>
                  </span>
                  <span className="pn">{x[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-in block exp">
            <div className="label">Export · 1080 × 1080 loop</div>
            <button className="btn solid" disabled={p.busy} {...hoverTween} onClick={p.onVideo}>{p.busy ? "Exporting…" : p.videoLabel}</button>
            <button className="btn ghost" disabled={p.busy} {...hoverTween} onClick={p.onFrames}>PNG frames (.zip)</button>
            <div className="muted status" ref={p.statusRef}>{p.status}</div>
          </div>
        </div>
      </div>

      <div className="stage" data-tg="stage">
        <div className="stage-wrap">
          <canvas ref={p.attachPoster} className="pcanvas" data-tg="pcanvas" width={1080} height={1080} />
        </div>
      </div>
    </div>
  );
}
