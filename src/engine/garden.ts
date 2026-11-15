/**
 * Type Garden, in ASCII.
 * A TypeScript port of Akshat Agarwal's Type Garden (type-garden.vercel.app): type and stems and roses grow
 * out of the letters. Space cuts the stems, backspace withers, enter clears. The drawing and motion follow the
 * original; every pixel goes through AsciiSurface, so the whole garden is made of text.
 * The frame loop runs on GSAP's ticker.
 */
import gsap from "gsap";
import { AsciiSurface, clamp, tones } from "./ascii";

export type Mode = "type" | "poster";

export interface Callbacks {
  onStatus: (s: string) => void;
  onBusy: (b: boolean) => void;
  /** Number of live letters, so the UI can show an empty state. */
  onCount?: (n: number) => void;
}

export const PRESETS = [
  { id: "breathe", label: "Breathe", sub: "Slow sway · 3s", T: 3000 },
  { id: "grow", label: "Grow & wither", sub: "Bloom, then back · 6s", T: 6000 },
  { id: "typed", label: "Typed", sub: "Type, cut, repeat · 5s", T: 5000 },
  { id: "wind", label: "Gust", sub: "Wind sweeps through · 4s", T: 4000 },
  { id: "reach", label: "Reach", sub: "Stems follow a light · 6s", T: 6000 },
  { id: "scatter", label: "Scatter", sub: "Random bloom, fade · 6s", T: 6000 },
  { id: "visit", label: "Visitor", sub: "Butterfly drops by · 7s", T: 7000 },
];

// name, background, flower, stem & leaf, flower line, type
export const PAL: string[][] = [
  ["Rose noir", "#000000", "#FF1400", "#3257FF", "#FFB4A8", "#FFFFFF"],
  ["Paper", "#F3EEE4", "#FF3B1F", "#1C2B8F", "#FFD2C4", "#111111"],
  ["Midnight", "#0D1B4C", "#FF5A4E", "#9FB4FF", "#FFD6CF", "#FFFFFF"],
  ["Citrus", "#0E1A12", "#FF8A00", "#1FA463", "#FFE2B8", "#FFF6E8"],
  ["Orchid", "#140A1F", "#E63CFF", "#2FB8A6", "#F9D1FF", "#FFFFFF"],
  ["Moss", "#133A2A", "#FFB7C5", "#7FD18B", "#FFFFFF", "#F6F1E7"],
  ["Tomato", "#FF1400", "#FFF1E0", "#0B0B0B", "#FF1400", "#000000"],
  ["Butter", "#FFE9A8", "#E4002B", "#0F5132", "#FFC2C2", "#1A1A1A"],
  ["Blush", "#FAD4D8", "#C8102E", "#274690", "#FFE3E6", "#1A1A1A"],
  ["Mono", "#000000", "#F2F2F2", "#6E6E6E", "#000000", "#FFFFFF"],
];

const POSTER_CELL = { cw: 7, ch: 10 };

export class Garden {
  [key: string]: any;

  F = '"Playfair Display",Georgia,serif';
  SENT = String.fromCharCode(0x200b); // kept in the hidden field so Backspace on an empty field still reports
  props = { boil: true, recoil: 20, density: 1 };
  state = { mode: "type" as Mode, preset: "breathe", palette: 0, text: "in bloom", seed: 7, busy: false };

  constructor(public canvas: HTMLCanvasElement, public input: HTMLInputElement, public cb: Callbacks) {}

  // ---------- lifecycle ----------
  start() {
    this.letters = [];
    this.uid = 1;
    this.cache = {};
    this.Sd = 0;
    this.St = 0;
    this.wrapped = false;
    this.t0 = performance.now();
    this.lastKey = 0;
    this.rand = Math.random;
    this.gifts = [];
    this.flies = [];
    this.perch = [];
    this.fa = {};
    this.mx = null;
    this.chCur = 14;
    this.surface = new AsciiSurface(this.canvas);
    this.mctx = document.createElement("canvas").getContext("2d");
    this.applyRoles();

    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.onKey = (e: KeyboardEvent) => this.key(e);
    window.addEventListener("keydown", this.onKey);
    this.onMove = (e: PointerEvent) => { this.mx = e.clientX; this.my = e.clientY; };
    this.onLeave = () => { this.mx = null; };
    window.addEventListener("pointermove", this.onMove);
    document.addEventListener("pointerleave", this.onLeave);

    // phone
    this.touch = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
    if (this.touch) document.documentElement.setAttribute("data-touch", "");
    this.ptype = "mouse";
    this.onPD = (e: PointerEvent) => { this.ptype = e.pointerType || "mouse"; };
    window.addEventListener("pointerdown", this.onPD, true);
    this.onUp = (e: PointerEvent) => { if (e.pointerType && e.pointerType !== "mouse") this.mx = null; };
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    const fld = this.input;
    this.iv = this.SENT;
    if (fld) fld.value = this.SENT;
    this.onCS = () => { this.composing = true; };
    this.onCE = () => { this.composing = false; setTimeout(() => { if (this.input && !this.composing) this.inputDiff(this.input); }, 0); };
    if (fld) { fld.addEventListener("compositionstart", this.onCS); fld.addEventListener("compositionend", this.onCE); }
    this.vv = window.visualViewport || null;
    this.vvMax = 0;
    this.onVV = () => this.syncVV();
    if (this.vv && this.touch) { this.vv.addEventListener("resize", this.onVV); this.vv.addEventListener("scroll", this.onVV); this.syncVV(); }

    // double-click / double-tap on the garden leaves a rose
    this.onPlant = (e: PointerEvent) => {
      if (this.state.mode !== "type" || e.target !== this.canvas) return;
      const now = performance.now(), lp = this.lastTap;
      this.lastTap = { t: now, x: e.clientX, y: e.clientY };
      if (lp && now - lp.t < 340 && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) < 40 && now - (this.lastPlant || 0) > 1800) {
        this.lastPlant = now;
        this.lastTap = null;
        this.liveRose({ x: Math.round((e.clientX / this.W) * 1000) / 1000, y: Math.round((e.clientY / this.H) * 1000) / 1000, s: Math.floor(Math.random() * 1e6) });
      }
    };
    window.addEventListener("pointerdown", this.onPlant);

    this.resize();
    if (document.fonts) document.fonts.load(`700 100px ${this.F}`).then(() => { this.cache = {}; this.layout(); this.buildPoster(); }).catch(() => {});
    this.vmime = typeof MediaRecorder !== "undefined"
      ? ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(m => MediaRecorder.isTypeSupported(m)) || null
      : null;
    this.buildPoster();
    this.tick = () => this.frame();
    gsap.ticker.add(this.tick);
    if (!this.touch) setTimeout(() => this.input && this.input.focus({ preventScroll: true }), 50);
  }

  destroy() {
    if (this.tick) gsap.ticker.remove(this.tick);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("pointermove", this.onMove);
    document.removeEventListener("pointerleave", this.onLeave);
    window.removeEventListener("pointerdown", this.onPD, true);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    window.removeEventListener("pointerdown", this.onPlant);
    if (this.vv) { this.vv.removeEventListener("resize", this.onVV); this.vv.removeEventListener("scroll", this.onVV); }
    if (this.input) { this.input.removeEventListener("compositionstart", this.onCS); this.input.removeEventListener("compositionend", this.onCE); }
  }

  // ---------- public controls (called by the React UI) ----------
  roles() {
    const p = this.PALrow();
    return { bg: p[1], red: p[2], blue: p[3], line: p[4], text: p[5] };
  }
  PALrow() { return PAL[this.state.palette] || PAL[0]; }
  applyRoles() {
    const r = this.roles();
    if (this.surface) this.surface.setRoles(r);
    if (this.pSurface) this.pSurface.setRoles(r);
  }
  setPalette(i: number) { this.state.palette = i; this.applyRoles(); }
  setMode(m: Mode) {
    this.state.mode = m;
    if (m === "type") requestAnimationFrame(() => { this.resize(); this.input && this.input.focus({ preventScroll: true }); });
  }
  setPoster(p: { text: string; preset: string; seed: number }) {
    this.state.text = p.text; this.state.preset = p.preset; this.state.seed = p.seed;
    this.buildPoster();
  }
  attachPoster(c: HTMLCanvasElement | null) {
    this.pcanvas = c;
    if (!c) { this.pSurface = null; return; }
    this.pSurface = new AsciiSurface(c);
    this.pSurface.setRoles(this.roles());
    this.pSurface.resize(1080, 1080, 1, POSTER_CELL.cw, POSTER_CELL.ch);
    this.pt0 = performance.now();
  }
  liveText(): string { return (this.letters || []).filter((l: any) => !l.dead).map((l: any) => l.ch).join("").trim(); }
  refocus() { if (this.ptype === "mouse" && this.state.mode === "type" && this.input) this.input.focus({ preventScroll: true }); }
  appPointerDown(ev: any) {
    if (this.state.mode !== "type" || !this.input) return;
    const touch = ev.pointerType && ev.pointerType !== "mouse", onCanvas = ev.target === this.canvas;
    // touch: leave focus (and the keyboard) where it is while tapping; the tap's click opens the keyboard
    if (touch) { if (ev.cancelable && (onCanvas || (ev.target.closest && ev.target.closest("button")))) ev.preventDefault(); }
    else this.input.focus({ preventScroll: true });
    if (onCanvas) this.spawnFly(ev.clientX, ev.clientY);
  }
  appClick(ev: any) {
    if (this.state.mode === "type" && this.input && this.ptype !== "mouse" && ev.target === this.canvas) this.input.focus({ preventScroll: true });
  }

  // ---------- butterflies ----------
  spawnFly(cx: number, cy: number) {
    if (this.flies.length >= 6) { const o = this.flies.find((f: any) => f.st !== "leave"); if (o) this.flyOff(o); }
    const taken = new Set(this.flies.filter((f: any) => f.st !== "leave").map((f: any) => f.pid));
    let best: any = null, bd = 1e9;
    for (const p of this.perch) { if (taken.has(p.id)) continue; const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = p; } }
    const left = cx < this.W / 2, sz = Math.max(9, this.Sd * 0.09);
    this.flies.push({ x: left ? -40 : this.W + 40, y: cy + (Math.random() - 0.5) * this.H * 0.4, vx: 0, vy: 0,
      st: best ? "fly" : "wander", pid: best ? best.id : null, hx: cx, hy: cy, t0: performance.now(), ph: Math.random() * 6, sz, seed: Math.random() * 100, ang: 0 });
  }
  flyOff(f: any) { f.st = "leave"; f.pid = null; f.ex = f.x < this.W / 2 ? -80 : this.W + 80; f.ey = f.y - this.H * 0.3; }
  drawFlies(B: any, now: number, C: any) {
    const dt = Math.min(48, now - (this._fl || now)); this._fl = now;
    const byId: any = {}; for (const p of this.perch) byId[p.id] = p;
    this.flies = this.flies.filter((f: any) => {
      const t = (now - f.t0) / 1000;
      let tx = 0, ty = 0;
      if (f.st === "sit" || f.st === "fly") {
        const p = byId[f.pid];
        if (!p) { this.flyOff(f); }
        else { tx = p.x + p.R * 0.05; ty = p.y - p.R * 0.55; }
      }
      if (f.st === "wander") {
        tx = f.hx + Math.sin(t * 1.3 + f.seed) * 70; ty = f.hy + Math.sin(t * 2.1 + f.seed) * 40;
        if (t > 3.5) this.flyOff(f);
      }
      if (f.st === "leave") { tx = f.ex; ty = f.ey; }
      if (f.st === "sit") {
        f.x += (tx - f.x) * 0.35; f.y += (ty - f.y) * 0.35; f.ang *= 0.85;
        f.ph += dt * 0.004;
        const burst = Math.sin(now / 1000 * 0.9 + f.seed) > 0.75;
        f.open = burst ? 0.2 + 0.8 * Math.abs(Math.cos(now / 1000 * 9 + f.seed)) : 0.25 + 0.15 * Math.sin(f.ph);
      } else {
        const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1, sp = f.st === "leave" ? 0.42 : Math.min(0.34, 0.06 + d * 0.0016);
        const flut = Math.sin(t * 7 + f.seed) * 0.12, wob = Math.cos(t * 4.3 + f.seed) * 0.1;
        const ax = (dx / d * sp + wob) - f.vx, ay = (dy / d * sp + flut) - f.vy;
        f.vx += ax * 0.06 * dt / 16; f.vy += ay * 0.06 * dt / 16;
        f.x += f.vx * dt; f.y += f.vy * dt + Math.sin(t * 13 + f.seed) * 0.6;
        f.ang += (Math.max(-0.5, Math.min(0.5, f.vx * 1.4)) - f.ang) * 0.1;
        f.open = Math.abs(Math.cos(t * 17 + f.seed));
        if (f.st === "fly" && d < 5) { f.st = "sit"; f.ph = 0; }
        if (f.st === "leave" && (f.x < -60 || f.x > this.W + 60 || f.y < -60)) return false;
      }
      this.butterfly(B, f.x, f.y, f.sz, f.ang, f.open, C);
      return true;
    });
  }
  butterfly(B: any, x: number, y: number, s: number, ang: number, o: number, C: any) {
    const ca = Math.cos(ang), sa = Math.sin(ang), T = (px: number, py: number) => [x + (px * ca - py * sa) * s, y + (px * sa + py * ca) * s];
    const wing = (cx: number, cy: number, rx: number, ry: number, a: number, side: number) => {
      const pts: any[] = [], c = Math.cos(a), sn = Math.sin(a);
      for (let k = 0; k < 22; k++) { const th = k / 22 * Math.PI * 2, r = 1 + 0.08 * Math.sin(th * 3), lx = Math.cos(th) * rx * r, ly = Math.sin(th) * ry * r; pts.push(T(side * (cx + lx * c - ly * sn) * (0.12 + 0.88 * o), cy + lx * sn + ly * c)); }
      return pts;
    };
    for (const sd of [-1, 1]) {
      B.fill(wing(0.46, 0.28, 0.36, 0.3, 0.5 * sd * sd, sd), C.text);
      B.fill(wing(0.55, -0.32, 0.55, 0.36, -0.55, sd), C.text);
      if (o > 0.35) B.fill(wing(0.66, -0.4, 0.13, 0.11, 0, sd), C.red);
    }
    const body: any[] = []; for (let k = 0; k < 18; k++) { const th = k / 18 * Math.PI * 2; body.push(T(Math.cos(th) * 0.08, Math.sin(th) * 0.48)); }
    B.fill(body, C.blue);
    const lw = Math.max(0.8, s * 0.05);
    B.stroke([T(0, -0.42), T(-0.14, -0.72), T(-0.24, -0.86)], C.blue, lw);
    B.stroke([T(0, -0.42), T(0.14, -0.72), T(0.24, -0.86)], C.blue, lw);
  }
  faceTurn(e: any, x: number, y: number) {
    let wx = 0, wy = 0;
    const A = this.near(x, y);
    if (A) {
      const dx = A[0] - x, dy = A[1] - y, d = Math.hypot(dx, dy), reach = 300;
      if (d < reach && d > 0.001) {
        const w = 1 - d / reach, s = w * w * (3 - 2 * w) * Math.min(1, d / 40);
        wx = dx / d * s; wy = dy / d * s;
      }
    }
    const c = this.fa[e.id] || [0, 0];
    c[0] += (wx - c[0]) * 0.09; c[1] += (wy - c[1]) * 0.09;
    this.fa[e.id] = c;
    return c;
  }
  near(_x: number, _y: number) { return this.mx != null ? [this.mx, this.my] : null; }
  liveRose(g: any) {
    if (!g || typeof g.x !== "number" || typeof g.y !== "number") return;
    const r = this.rng((g.s | 0) || 1);
    this.gifts.push({ x: Math.min(1, Math.max(0, g.x)), y: Math.min(1, Math.max(0, g.y)), t0: performance.now(), rot: (r() - 0.5) * 0.8,
      e: { ph1: r() * 6.283, ph2: r() * 6.283, turns: 1.4 + r() * 0.5 } });
    if (this.gifts.length > 14) this.gifts.shift();
  }

  // ---------- math ----------
  h(n: number) { const x = Math.sin(n) * 43758.5453; return x - Math.floor(x); }
  spr(t: number, k = 7, w = 16) { if (t <= 0) return 0; return 1 - Math.exp(-t * k) * Math.cos(t * w); }
  eo(t: number) { if (t <= 0) return 0; if (t >= 1) return 1; return 1 - Math.pow(1 - t, 3); }
  rng(seed: number) {
    let s = seed | 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  bez(a: number[], b: number[], c: number[], d: number[], n: number) {
    const P: number[][] = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t;
      P.push([u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0], u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]]); }
    return P;
  }
  at(P: number[][], u: number): [number[], number] {
    const n = P.length; const i = Math.min(n - 2, Math.max(1, Math.round(u * (n - 1))));
    return [P[i], Math.atan2(P[i+1][1] - P[i-1][1], P[i+1][0] - P[i-1][0])];
  }
  jit(id: number, f: number, amp: number) {
    if (!amp) return [0, 0, 0];
    return [(this.h(id*1.37 + f*7.13)*2 - 1)*amp, (this.h(id*2.71 + f*3.11)*2 - 1)*amp, (this.h(id*5.3 + f*1.7)*2 - 1)*0.035];
  }
  path(c: any, p: number[][], closed: boolean) {
    const n = p.length; if (n < 2) return;
    const m = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (closed) {
      const s = m(p[n-1], p[0]); c.moveTo(s[0], s[1]);
      for (let i = 0; i < n; i++) { const q = m(p[i], p[(i+1) % n]); c.quadraticCurveTo(p[i][0], p[i][1], q[0], q[1]); }
      c.closePath();
    } else {
      c.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < n - 1; i++) { const q = m(p[i], p[i+1]); c.quadraticCurveTo(p[i][0], p[i][1], q[0], q[1]); }
      c.lineTo(p[n-1][0], p[n-1][1]);
    }
  }
  backend(g: CanvasRenderingContext2D) {
    return {
      fill: (p: number[][], col: string) => { g.beginPath(); this.path(g, p, true); g.fillStyle = col; g.fill(); },
      stroke: (p: number[][], col: string, w: number) => { g.beginPath(); this.path(g, p, false); g.strokeStyle = col; g.lineWidth = Math.max(w, this.minLw || 0); g.lineCap = "round"; g.lineJoin = "round"; g.stroke(); },
      rect: (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); },
      /** Fill with a radial shade: stops are [offset, colour] pairs; the nearest tone decides each cell's glyph density. */
      fillGrad: (p: number[][], cx: number, cy: number, r: number, stops: [number, string][]) => {
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
        for (const [o, c] of stops) gr.addColorStop(o, c);
        g.beginPath(); this.path(g, p, true); g.fillStyle = gr; g.fill();
      },
      outline: (p: number[][], col: string, w: number) => { g.beginPath(); this.path(g, p, true); g.strokeStyle = col; g.lineWidth = Math.max(w, this.minLw || 0); g.lineJoin = "round"; g.stroke(); },
      text: (ch: string, x: number, y: number, S: number, col: string) => { g.font = `700 ${S}px ${this.F}`; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = col; g.fillText(ch, x, y); },
    };
  }
  vine(base: number[], dir: number, len: number, amp: number, waves: number, ph: number, bend: number, n: number) {
    n = n || 40; const P = [[base[0], base[1]]], step = len / n; let x = base[0], y = base[1];
    for (let i = 1; i <= n; i++) {
      const u = i / n, a = dir + bend * u + amp * Math.sin(u * Math.PI * waves + ph) * Math.min(1, u * 3);
      x += Math.cos(a) * step; y += Math.sin(a) * step; P.push([x, y]);
    }
    return P;
  }
  curl(P: number[][], sign: number, rad: number) {
    const n = P.length, e = P[n - 1], a = Math.atan2(e[1] - P[n - 2][1], e[0] - P[n - 2][0]);
    const c = [e[0] - Math.sin(a) * sign * rad, e[1] + Math.cos(a) * sign * rad];
    const a0 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    for (let i = 1; i <= 14; i++) { const u = i / 14, t = a0 + sign * u * Math.PI * 1.6, rr = rad * (1 - 0.5 * u); P.push([c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr]); }
    return P;
  }
  weave(r: () => number, startLayer: number) {
    const cuts: number[] = []; const nc = 1 + Math.floor(r() * 3);
    for (let i = 0; i < nc; i++) cuts.push(0.15 + r() * 0.7);
    cuts.sort((a, b) => a - b);
    const segs: any[] = []; let u0 = 0, layer = startLayer;
    for (const c of cuts) {
      if (c <= u0) continue;
      segs.push({ u0, u1: c, layer });
      if (r() < 0.3) { const g = 0.02 + r() * 0.03; u0 = Math.min(0.98, c + g); } else u0 = c;
      layer = 1 - layer;
    }
    segs.push({ u0, u1: 1, layer });
    return segs;
  }
  layerAt(segs: any[], u: number) { for (const s of segs) if (u >= s.u0 && u <= s.u1) return s.layer; return segs[segs.length - 1].layer; }

  // ---------- layout ----------
  resize() {
    const c = this.canvas, r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    if (!r.width) return;
    this.W = r.width; this.H = r.height; this.dpr = d;
    this.layout(true);
    this.chCur = this.targetCh();
    this.applyCell();
  }
  /** Bigger type gets bigger characters; wrapped type gets finer ones so letters stay readable. */
  targetCh() { return clamp((this.St || this.H * 0.28) / 17, 7, 12); }
  applyCell() {
    const ch = Math.round(this.chCur), cw = Math.max(6, Math.round(ch / 1.45));
    this.surface.resize(this.W, this.H, this.dpr, cw, ch);
  }
  mw(ch: string) {
    if (this.cache[ch] != null) return this.cache[ch];
    this.mctx.font = `700 100px ${this.F}`;
    let w = this.mctx.measureText(ch).width / 100;
    if (ch === " ") w *= 1.4;
    return (this.cache[ch] = w);
  }
  // sets tx/ty/tw on letters; keeps headroom for the garden above and below the type
  layoutCore(A: any[], W: number, H: number, prevWrapped: boolean) {
    const maxW = W * 0.8, S0 = H * 0.28, LH = 2.1;
    const ws = A.map(l => this.mw(l.ch));
    const words: any[] = []; let cur: any = null;
    A.forEach((l, i) => {
      if (l.ch === " ") { if (cur) { words.push(cur); cur = null; } words.push({ sp: true, idx: [i] }); }
      else { if (!cur) cur = { idx: [] }; cur.idx.push(i); }
    });
    if (cur) words.push(cur);
    const lineW = (li: number[], S: number) => { let e = li.length; while (e > 0 && A[li[e-1]].ch === " ") e--; let w = 0; for (let k = 0; k < e; k++) w += ws[li[k]]; return w * S; };
    const wrap = (S: number) => {
      const lines: number[][] = [[]]; let lw = 0;
      for (const w of words) {
        const ww = w.idx.reduce((s: number, i: number) => s + ws[i], 0) * S;
        if (!w.sp && lw > 0 && lw + ww > maxW) { lines.push([]); lw = 0; }
        lines[lines.length - 1].push(...w.idx); lw += ww;
      }
      return lines;
    };
    let lines: number[][] = [A.map((_, i) => i)];
    const unit = lineW(lines[0], 1);
    let S = unit > 0 ? Math.min(S0, maxW / unit) : S0;
    const multi = words.filter(w => !w.sp).length > 1;
    let wrapped = multi && (S < H * 0.1 || (prevWrapped && S < H * 0.14));
    if (wrapped) {
      let lo = H * 0.03, hi = H * 0.15;
      for (let k = 0; k < 22; k++) {
        const mid = (lo + hi) / 2, ls = wrap(mid);
        const ok = ls.every(li => lineW(li, mid) <= maxW) && ls.length * LH * mid <= H * 0.82;
        if (ok) lo = mid; else hi = mid;
      }
      S = lo; lines = wrap(S);
      if (lines.length < 2) wrapped = false;
    }
    const n = lines.length, lh = LH * S;
    lines.forEach((li, k) => {
      let x = W / 2 - lineW(li, S) / 2;
      const y = H / 2 + (k - (n - 1) / 2) * lh + 0.33 * S;
      li.forEach(i => { const l = A[i], w = ws[i] * S; l.tx = x + w / 2; l.ty = y; l.tw = w; l.line = k; x += w; });
    });
    return { S, wrapped, n };
  }
  layout(snap?: boolean) {
    if (!this.W) return;
    const A = this.letters.filter((l: any) => !l.dead);
    if (this.cb.onCount && A.length !== this._cnt) { this._cnt = A.length; this.cb.onCount(A.length); }
    const res = this.layoutCore(A, this.W, this.H, this.wrapped);
    this.wrapped = res.wrapped;
    A.forEach((l: any) => { if (l.x == null) { l.x = l.tx; l.y = l.ty; } });
    const S = res.S, last = A[A.length - 1];
    this.St = S;
    this.ctx_ = last ? last.tx + last.tw / 2 + 0.07 * S : this.W / 2;
    this.cty = last ? last.ty - 0.33 * S : this.H / 2;
    if (snap || !this.Sd) { this.Sd = S; this.cx = this.ctx_; this.cy = this.cty; A.forEach((l: any) => { l.x = l.tx; l.y = l.ty; }); }
  }

  // ---------- phone: keyboard + visible area ----------
  syncVV() {
    const vv = this.vv; if (!vv) return;
    const w = Math.round(vv.width);
    if (this.vvW !== w) { this.vvW = w; this.vvMax = 0; }
    this.vvMax = Math.max(this.vvMax, vv.height);
    const kb = this.vvMax - vv.height > 120, de = document.documentElement;
    de.style.setProperty("--tg-top", vv.offsetTop + "px");
    de.style.setProperty("--tg-h", vv.height + "px");
    if (kb) de.setAttribute("data-kb", ""); else de.removeAttribute("data-kb");
    if (!kb && this.kbWas && document.activeElement === this.input) this.input.blur();
    this.kbWas = kb;
    this.resize();
  }
  wither(now: number) {
    const A = this.letters.filter((l: any) => !l.dead), last = A[A.length - 1];
    if (!last) return;
    last.dead = now;
    const pv = A[A.length - 2];
    if (pv && pv.ch !== " ") { pv.cut = null; pv.endEls = null; pv.tb = now; }
    this.layout();
  }
  // phone keyboards often write into the field instead of sending key events: mirror the field and apply the difference
  inputDiff(el: HTMLInputElement) {
    const S = this.SENT;
    if (this.state.mode !== "type" || this._kd) { this.iv = this.composing ? el.value : S; if (!this.composing) el.value = S; return; }
    const old = this.iv == null ? S : this.iv, cur = el.value;
    let p = 0; while (p < old.length && p < cur.length && old[p] === cur[p]) p++;
    let dels = old.length - p;
    if (p === 0 && old[0] === S && old.length > 1) dels -= 1;
    const now = performance.now(); this.lastKey = now;
    for (let i = 0; i < dels; i++) this.wither(now);
    for (const ch of cur.slice(p)) {
      if (ch === S) continue;
      if (ch.charCodeAt(0) === 10) { this.letters = []; this.layout(); } else this.add(ch, now);
    }
    if (this.composing) this.iv = cur; else { el.value = S; this.iv = S; }
  }

  // ---------- input ----------
  key(e: KeyboardEvent) {
    if (this.state.mode !== "type") return;
    if (e.metaKey || e.ctrlKey || e.altKey) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.shiftKey ? this.saveSVG() : this.savePNG(); }
      return;
    }
    if (e.target && (e.target as HTMLElement).tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
    const now = performance.now();
    const A = this.letters.filter((l: any) => !l.dead), last = A[A.length - 1];
    if (e.key === "Backspace") {
      e.preventDefault(); this.mark(); if (!last) return;
      last.dead = now;
      const pv = A[A.length - 2];
      if (pv && pv.ch !== " ") { pv.cut = null; pv.endEls = null; pv.tb = now; }
      this.layout(); return;
    }
    if (e.key === "Enter") { e.preventDefault(); this.mark(); this.letters = []; this.layout(); return; }
    if (e.key.length !== 1) return;
    e.preventDefault(); this.mark();
    this.add(e.key, now);
  }
  mark() { this.lastKey = performance.now(); this._kd = true; setTimeout(() => { this._kd = false; }, 0); }
  add(ch: string, now: number) {
    const A = this.letters.filter((l: any) => !l.dead), last = A[A.length - 1];
    if (ch === " ") {
      if (last && last.ch !== " ") { last.cut = now; this.genEnd(last, now - last.birth); }
      this.letters.push({ ch: " ", id: this.uid++, birth: now, els: [] });
      this.layout(); return;
    }
    const same = last && last.ch !== " ";
    const l: any = { ch, id: this.uid++, birth: now, tb: now, ws: same ? last.ws : Math.floor(this.rand() * 1e9), wi: same ? last.wi + 1 : 0, prev: same ? last : null };
    this.gen(l);
    this.letters.push(l);
    this.layout();
  }

  // ---------- growth ----------
  wordParams(ws: number) {
    const r = this.rng(ws * 7 + 13), dens = this.props.density ?? 1;
    return { roseP: 0.3 + r() * 0.3, leafy: (0.6 + r() * 0.8) * dens, dens, lean: (r() - 0.5) * 0.6, big: 0.85 + r() * 0.45, curvy: 0.8 + r() * 0.6, bridgeP: Math.min(0.95, (0.45 + r() * 0.35) * dens), w: 0.5 };
  }
  grow(r: () => number, E: any[], nid: () => number, p: any, o: any) {
    const tip = o.tip || (r() < p.roseP ? "rose" : r() < 0.45 ? "fan" : r() < 0.6 ? "leaf" : "curl");
    let P = o.pts || this.vine(o.base, o.dir, o.len, (0.35 + r() * 0.45) * p.curvy, 1 + r() * 1.6, r() * 6.28, (r() - 0.5) * 1.2, 40);
    if (tip === "curl") P = this.curl(P, r() < 0.5 ? -1 : 1, 0.05 + r() * 0.05);
    const segs = this.weave(r, o.layer0 != null ? o.layer0 : (r() < 0.5 ? 0 : 1));
    const dur = Math.max(320, (o.len || 0.8) * 620);
    const thorns: any[] = []; const nt = Math.floor(r() * 2.5);
    for (let i = 0; i < nt; i++) thorns.push({ u: 0.15 + r() * 0.65, s: r() < 0.5 ? -1 : 1 });
    E.push({ t: "stem", id: nid(), pts: P, segs, d0: o.d0, dur, w: o.depth ? 0.82 : 1, thorns });
    const nl = Math.floor(r() * 2.8 * p.leafy);
    let sd = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < nl; i++) {
      const u = 0.25 + r() * 0.6, [q, a] = this.at(P, u); sd = -sd;
      E.push({ t: "leaf", id: nid(), x: q[0], y: q[1], a: a + sd * (0.55 + r() * 0.5), L: (0.14 + r() * 0.2) * (o.depth ? 0.8 : 1), bend: (r() - 0.5) * 1.2, layer: this.layerAt(segs, u), d0: o.d0 + dur * u });
    }
    const [tp, ta] = this.at(P, 1), td = o.d0 + dur * 0.8, tl = this.layerAt(segs, 1);
    if (tip === "rose") {
      const R = (0.13 + r() * 0.15) * p.big * (o.depth ? 0.75 : 1);
      // legibility: a rose sitting over the letter body mostly goes behind it
      const over = tp[1] > -0.78 && tp[1] < 0.05 && Math.abs(tp[0]) < p.w * 0.5;
      const layer = over ? (r() < 0.22 ? 1 : 0) : (r() < 0.6 ? 1 : tl);
      E.push({ t: "rose", id: nid(), x: tp[0], y: tp[1], R, rot: (r() - 0.5) * 1.0, ph1: r() * 6.28, ph2: r() * 6.28, turns: 1.8 + r() * 1, layer, d0: td });
      if (r() < 0.2) { const oo = ta + (r() < 0.5 ? 1 : -1) * 1.3; E.push({ t: "rose", id: nid(), x: tp[0] + Math.cos(oo) * R * 1.4, y: tp[1] + Math.sin(oo) * R * 1.4, R: R * (0.6 + r() * 0.3), rot: (r() - 0.5) * 1.2, ph1: r() * 6.28, ph2: r() * 6.28, turns: 1.8 + r(), layer, d0: td + 120 }); }
    } else if (tip === "fan") {
      const spread = 0.6 + r() * 0.3;
      for (let j = 0; j < 2; j++) E.push({ t: "leaf", id: nid(), x: tp[0], y: tp[1], a: ta + (j - 0.5) * spread, L: 0.2 + r() * 0.2, bend: (j - 0.5) * 0.8, layer: tl, d0: td + j * 60 });
    } else if (tip === "leaf") {
      E.push({ t: "leaf", id: nid(), x: tp[0], y: tp[1], a: ta + (r() - 0.5) * 0.3, L: 0.16 + r() * 0.16, bend: (r() - 0.5), layer: tl, d0: td });
    }
    if (!o.depth && r() < 0.3) {
      const u = 0.35 + r() * 0.35, [q, a] = this.at(P, u);
      this.grow(r, E, nid, p, { base: q, dir: a + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.4), len: (o.len || 0.8) * (0.35 + r() * 0.2), d0: o.d0 + dur * u, depth: 1, layer0: this.layerAt(segs, u) });
    }
    return P;
  }
  gen(l: any) {
    const r = this.rng((l.ws ^ Math.imul(l.wi + 1, 2654435761)) + Math.floor(this.rand() * 1e6));
    const p = this.wordParams(l.ws), E: any[] = []; let k0 = 0; const nid = () => l.id * 100 + (k0++);
    const w = this.mw(l.ch), inX = () => (r() - 0.5) * w * 0.7; p.w = w;
    const nUp = 1 + (r() < 0.45 * p.dens ? 1 : 0);
    for (let i = 0; i < nUp; i++) {
      this.grow(r, E, nid, p, { base: [inX(), -r() * 0.3], dir: -Math.PI / 2 + p.lean * 0.5 + (r() - 0.5) * 0.7, len: 0.6 + r() * 0.5, d0: 40 + i * 130, tip: l.wi === 0 && i === 0 ? "rose" : null });
    }
    if (r() < 0.4 * p.dens) this.grow(r, E, nid, p, { base: [inX(), -0.1 - r() * 0.35], dir: Math.PI / 2 + (r() - 0.5) * 0.8, len: 0.35 + r() * 0.35, d0: 160 });
    if (l.prev && r() < p.bridgeP) {
      const px = -(this.mw(l.prev.ch) + w) / 2;
      const a = [inX(), -0.05 - r() * 0.55], b = [px + (r() - 0.5) * 0.25, -0.05 - r() * 0.55];
      const bulge = (r() < 0.55 ? -1 : 1) * (0.4 + r() * 0.4), dx = b[0] - a[0];
      let P = this.bez(a, [a[0] + dx * 0.15, a[1] + bulge], [b[0] - dx * 0.15, b[1] + bulge * 0.9], b, 40);
      if (r() < 0.45) P = P.slice(0, Math.floor(P.length * (0.7 + r() * 0.2)));
      this.grow(r, E, nid, p, { pts: P, len: Math.abs(dx) + Math.abs(bulge), d0: 90, tip: r() < 0.5 ? "curl" : r() < 0.5 ? "leaf" : "rose" });
    }
    if (l.wi === 0) this.grow(r, E, nid, p, { base: [-w * 0.3, -0.15 - r() * 0.4], dir: Math.PI + (r() - 0.5) * 1.2, len: 0.45 + r() * 0.3, d0: 120, tip: "curl" });
    l.els = E;
    l.endEls = null;
    const T: any[] = [], tr = this.rng(l.id * 977 + Math.floor(this.rand() * 1e6));
    this.grow(tr, T, () => l.id * 100 + 90 + T.length, p, { base: [w * 0.25, -0.1 - tr() * 0.45], dir: (tr() - 0.5) * 1.4, len: 0.45 + tr() * 0.25, d0: 0, tip: "curl", depth: 1 });
    l.tend = T.filter(e => e.t === "stem").slice(0, 1);
  }
  genEnd(l: any, rel: number) {
    const r = this.rng(l.ws + l.wi * 31 + Math.floor(this.rand() * 1e6)), p = this.wordParams(l.ws), E: any[] = [];
    let k0 = 50; const nid = () => l.id * 100 + (k0++);
    const w = this.mw(l.ch), n = 1 + Math.floor(r() * 2.5); p.w = w;
    for (let i = 0; i < n; i++) {
      const dir = -Math.PI / 2 + 0.6 + (i - (n - 1) / 2) * 0.9 + (r() - 0.5) * 0.4;
      this.grow(r, E, nid, p, { base: [(r() - 0.2) * w * 0.6, -r() * 0.5], dir, len: 0.4 + r() * 0.45, d0: rel + 40 + i * 90, depth: 1, tip: i === 0 || r() < 0.5 ? "rose" : "fan" });
    }
    l.endEls = E;
  }

  strokeRange(B: any, P: number[][], a: number, b: number, col: string, w: number) {
    const n = P.length - 1, ia = a * n, ib = b * n;
    const lerp = (t: number) => { const i = Math.min(n - 1, Math.floor(t)), f = t - i; return [P[i][0] + (P[i+1][0] - P[i][0]) * f, P[i][1] + (P[i+1][1] - P[i][1]) * f]; };
    const pts = [lerp(ia)];
    for (let i = Math.floor(ia) + 1; i < ib; i++) pts.push(P[i]);
    pts.push(lerp(ib));
    if (pts.length >= 2) B.stroke(pts, col, w);
  }
  thorn(B: any, P: number[][], u: number, s: number, S: number) {
    const [p, a] = this.at(P, u), d = a + s * 2.3, L = S * 0.045;
    B.stroke([p, [p[0] + Math.cos(d) * L, p[1] + Math.sin(d) * L]], this.cc.blue, S * 0.022);
  }
  leaf(B: any, bx: number, by: number, a: number, L: number, bend: number) {
    if (L < 0.5) return;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const ax = (u: number) => { const b = Math.sin(Math.PI * u) * bend * 0.15 * L; return [bx + ca * u * L + px * b, by + sa * u * L + py * b]; };
    const hw = (u: number) => L * 0.18 * Math.sin(Math.PI * Math.pow(u, 0.8));
    const N = 12, s1: number[][] = [], s2: number[][] = [];
    for (let i = 0; i <= N; i++) { const u = i / N, c = ax(u), w = hw(u); s1.push([c[0] + px * w, c[1] + py * w]); s2.push([c[0] - px * w, c[1] - py * w]); }
    const tip = ax(1), base = ax(0);
    // two-tone leaf: lit half, shadow half, and a light midrib down the middle
    B.fill([base, ...s1.slice(1, N), tip], this.cc.blue);
    B.fill([tip, ...s2.slice(1, N).reverse(), base], this.cc.blueD);
    if (L > 14) {
      const rib: number[][] = [];
      for (let i = 1; i <= 8; i++) rib.push(ax(0.06 + 0.74 * i / 8));
      B.stroke(rib, this.cc.blueL, Math.max(0.8, L * 0.03));
    }
  }
  rose(B: any, cx: number, cy: number, R: number, rot: number, e: any, a: number, tl: number[] | null) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const tm = tl ? Math.hypot(tl[0], tl[1]) : 0, ux = tm ? tl![0] / tm : 0, uy = tm ? tl![1] / tm : 0, sq = -0.28 * tm;
    const T = (x: number, y: number, z = 0) => {
      let dx = x * cr - y * sr, dy = x * sr + y * cr;
      if (tm) { const k = (dx * ux + dy * uy) * sq; dx += k * ux + tl![0] * R * z; dy += k * uy + tl![1] * R * z; }
      return [cx + dx, cy + dy];
    };
    // petals, back to front: [cx, cy, rx, ry, angle, depth, edge]
    const P = [
      [0, -0.36, 0.56, 0.54, 0, 0, 0],
      [-0.5, -0.06, 0.6, 0.6, -0.35, 0, 0],
      [0.52, -0.06, 0.6, 0.6, 0.35, 0, 0],
      [-0.42, 0.3, 0.62, 0.48, 0.2, 0.12, 1],
      [0.47, 0.3, 0.62, 0.48, -0.2, 0.12, 1],
      [0.05, 0.42, 0.56, 0.38, 0, 0.14, 0],
    ];
    const ax0 = 0, ay0 = 0.5, lw = Math.max(0.8, R * 0.045), st = 85;
    P.forEach((q, i) => {
      const s = this.spr((a - i * st) / 1000, 8, 14); if (s <= 0.001) return;
      const open = (1 - Math.min(1, s)) * (q[0] < 0 ? 0.5 : -0.5), ang = q[4] + open, ca = Math.cos(ang), sa = Math.sin(ang);
      const pt = (th: number) => {
        const rr = 1 + 0.08 * Math.sin(3 * th + e.ph1 + i) + 0.04 * Math.sin(5 * th + e.ph2);
        const lx = Math.cos(th) * q[2] * rr, ly = Math.sin(th) * q[3] * rr;
        const px = q[0] + lx * ca - ly * sa, py = q[1] + lx * sa + ly * ca;
        return T((ax0 + (px - ax0) * s) * R, (ay0 + (py - ay0) * s) * R, q[5]);
      };
      const pts: number[][] = []; for (let k = 0; k < 26; k++) pts.push(pt(k / 26 * Math.PI * 2));
      // shaded petal: back petals fall into shadow at the rim, front petals catch the light
      let mx = 0, my = 0; for (const q2 of pts) { mx += q2[0]; my += q2[1]; } mx /= pts.length; my /= pts.length;
      const front = i >= 3, rr = R * (front ? 0.62 : 0.78) * Math.min(1, s);
      const stops: [number, string][] = front
        ? [[0, this.cc.redL], [0.5, this.cc.red], [1, this.cc.redD]]
        : [[0, this.cc.red], [0.55, this.cc.red], [1, this.cc.redD]];
      B.fillGrad(pts, mx - R * 0.14, my - R * 0.18, rr, stops);
      if (R >= 16 && s > 0.5) B.outline(pts, this.cc.redD, lw * 0.6);
      if (q[6] && R >= 12 && s > 0.4) {
        const arc: number[][] = []; for (let k = 0; k <= 14; k++) arc.push(pt(Math.PI * (1.18 + 0.64 * k / 14)));
        this.strokeRange(B, arc, 0, Math.min(1, (s - 0.4) / 0.5), this.cc.line, lw * 0.8);
      }
    });
    const fr = this.eo((a - P.length * st - 80) / 520);
    if (fr > 0 && R > 3) {
      const sp: number[][] = [], scl: number[][] = [];
      const turns = R < 20 ? Math.min(e.turns, 1.3) : R < 32 ? e.turns * 0.8 : e.turns;
      for (let i = 0; i <= 70; i++) { const u = i / 70, th = e.ph1 + u * turns * Math.PI * 2, rr = R * (0.08 + 0.57 * u); sp.push(T(Math.cos(th) * rr * 1.05, Math.sin(th) * rr * 0.72 - 0.12 * R, 0.34 - 0.24 * u)); }
      this.strokeRange(B, sp, 0, fr, this.cc.line, lw);
      if (R >= 14) {
        for (let i = 0; i <= 36; i++) { const u = i / 36; scl.push(T((-0.72 + 1.5 * u) * R, 0.36 * R + 0.16 * R * Math.abs(Math.sin(u * Math.PI * 3)), 0.18)); }
        this.strokeRange(B, scl, 0, fr, this.cc.line, lw);
      }
    }
  }

  // ---------- render (shared by typing view + poster) ----------
  frame() {
    const now = performance.now(), dt = Math.min(64, now - (this.lt || now)); this.lt = now;
    if (this.state.mode === "poster") {
      if (this.pSurface && !this.state.busy) this.drawPoster(this.pSurface, now - (this.pt0 || 0));
      return;
    }
    const k = 1 - Math.exp(-dt / 80);
    this.Sd += (this.St - this.Sd) * k;
    this.cx += (this.ctx_ - this.cx) * k; this.cy += (this.cty - this.cy) * k;
    for (const l of this.letters) if (!l.dead && l.tx != null) { l.x += (l.tx - l.x) * k; l.y += (l.ty - l.y) * k; }
    this.letters = this.letters.filter((l: any) => !(l.dead && now - l.dead > 300));
    const tgt = this.targetCh();
    if (Math.abs(tgt - this.chCur) >= 1.5) { this.chCur = tgt; this.applyCell(); }
    this.paint(now, true);
  }
  pal() {
    const p = this.PALrow();
    if (this._palRow !== p) {
      const rt = tones(p[2]), bt = tones(p[3]);
      this._palRow = p;
      this._palC = { red: p[2], blue: p[3], line: p[4], text: p[5], vein: p[1], redD: rt.dark, redL: rt.light, blueD: bt.dark, blueL: bt.light };
    }
    return { bg: p[1], C: this._palC };
  }
  mainState() { return { letters: this.letters, S: this.Sd, C: this.pal().C, boil: this.props.boil ?? true, recoil: this.props.recoil ?? 20, speed: 1, wither: 260, face: true }; }
  paint(now: number, caret: boolean) {
    const s = this.surface;
    this.minLw = s.minLw;
    const g = s.beginMask();
    const B = this.backend(g), st: any = this.mainState();
    this.render(B, now, st);
    this.drawFlies(B, now, st.C);
    if (caret && this.gifts && this.gifts.length) {
      const LIFE = 60000; this.gifts = this.gifts.filter((gf: any) => now - gf.t0 < LIFE);
      for (const gf of this.gifts) {
        const age = now - gf.t0, w = 1 - this.eo((age - (LIFE - 2200)) / 2200);
        g.globalAlpha = Math.max(0, w);
        this.rose(B, gf.x * this.W, gf.y * this.H + (1 - w) * this.Sd * 0.3, this.Sd * 0.24 * (0.65 + 0.35 * w), gf.rot + (1 - w) * 0.6, gf.e, age, null);
      }
      g.globalAlpha = 1;
    }
    if (caret) {
      const S = this.Sd, on = now - this.lastKey < 500 || Math.floor(now / 530) % 2 === 0, hf = this.eo((now - this.t0) / 600);
      if (on && hf > 0) { const h = 0.8 * S * hf, w = Math.max(2, S * 0.03); B.rect(this.cx - w / 2, this.cy - h / 2, w, h, st.C.text); }
    }
    s.present(now / 1000);
  }
  render(B: any, now: number, st: any) {
    const S = st.S, L = st.letters, act = L.filter((l: any) => !l.dead), sp = st.speed || 1;
    this.cc = st.C; this._now = now; if (st.face) this.perch = [];
    if (st.face) for (const l of L) {
      let tx = 0, ty = 0;
      const A = !l.dead && l.ch !== " " ? this.near(l.x, l.y - S * 0.6) : null;
      if (A) {
        const dx = A[0] - l.x, dy = A[1] - (l.y - S * 0.6), d = Math.hypot(dx, dy), reach = Math.max(260, S * 3.2);
        if (d < reach && d > 1) { const w = 1 - d / reach, s = w * w * (3 - 2 * w); tx = dx / d * s; ty = dy / d * s; }
      }
      const c = l.lean || (l.lean = [0, 0]);
      c[0] += (tx - c[0]) * 0.07; c[1] += (ty - c[1]) * 0.07;
    }
    const f = st.boil ? Math.floor(now / 120) : 0, amp = st.boil ? Math.max(0.8, S * 0.01) : 0;
    const kd = (l: any) => l.dead ? 1 - this.eo((now - l.dead) / st.wither) : 1;
    const draw = (layer: number) => {
      for (const l of L) {
        if (l.ch === " " || !l.els) continue;
        const age = (now - l.birth) * sp, kk = kd(l);
        const each = (e: any) => { if (e.t === "stem") this.drawStem(B, e, l, age, kk, st, f, amp, layer); else if (e.layer === layer) this.drawEl(B, e, l, age, kk, st, f, amp); };
        l.els.forEach(each);
        if (l.endEls) l.endEls.forEach(each);
        const i = act.indexOf(l), nx = i >= 0 ? act[i + 1] : null;
        if (l.tend && (l.dead || !nx || nx.ch === " ")) {
          let fr = this.eo(((now - l.tb) * sp - 150) / 450);
          if (l.cut != null) fr *= 1 - this.eo((now - l.cut) * sp / 150) * Math.min(0.85, st.recoil / (0.6 * S));
          for (const e of l.tend) this.drawStem(B, e, l, age, kk, st, f, amp, layer, fr * kk);
        }
      }
    };
    draw(0);
    for (const l of L) if (l.ch !== " " && (st.textAll || !l.dead)) B.text(l.ch, l.x, l.y, S, st.C.text);
    draw(1);
  }
  wpt(st: any, l: any, x: number, y: number) {
    if (l.birth != null && this._now != null) {
      const t = (this._now - l.birth) * (st.speed || 1) / 1000;
      if (t > 0 && t < 2.5) {
        const hh = Math.max(0, (l.y - y) / st.S), dmp = Math.exp(-t * 3.2), dir = (l.id % 2 ? 1 : -1);
        x += st.S * 0.07 * hh * dmp * Math.sin(t * 11) * dir;
        y += st.S * 0.035 * hh * dmp * Math.sin(t * 11 + 1.2);
      }
    }
    if (st.face && l.lean) {
      const hh = Math.min(2.5, Math.max(0, (l.y - y) / st.S)), f = hh * hh * 0.5 + hh * 0.5;
      x += l.lean[0] * st.S * 0.1 * f;
      y += l.lean[1] * st.S * 0.05 * f;
    }
    return st.warp ? st.warp(x, y, l) : [x, y];
  }
  drawStem(B: any, e: any, l: any, age: number, kk: number, st: any, f: number, amp: number, layer: number, frO?: number) {
    const S = st.S, fr = frO != null ? frO : this.eo((age - e.d0) / e.dur) * kk; if (fr <= 0) return;
    const j = this.jit(e.id, f, amp);
    const P = e.pts.map((p: number[]) => this.wpt(st, l, l.x + p[0] * S + j[0], l.y + p[1] * S + j[1]));
    for (const sg of e.segs) {
      if (sg.layer !== layer) continue;
      const b = Math.min(sg.u1, fr); if (b <= sg.u0) continue;
      this.strokeRange(B, P, sg.u0, b, st.C.blue, S * 0.022 * (e.w || 1));
    }
    for (const th of e.thorns) if (fr > th.u && this.layerAt(e.segs, th.u) === layer) this.thorn(B, P, th.u, th.s, S);
  }
  drawEl(B: any, e: any, l: any, age: number, kk: number, st: any, f: number, amp: number) {
    const S = st.S, j = this.jit(e.id, f, amp), wx = (x: number, y: number) => this.wpt(st, l, l.x + x * S + j[0], l.y + y * S + j[1]);
    const rw = st.rotw ? st.rotw(e) : 0;
    if (e.t === "leaf") {
      const sc = this.spr((age - e.d0) / 1000, 7, 15) * kk; if (sc <= 0) return;
      const p = wx(e.x, e.y); this.leaf(B, p[0], p[1], e.a + j[2] + rw, e.L * S * sc, e.bend);
    } else if (e.t === "rose") {
      const a = age - e.d0; if (a < 0) return;
      if (kk <= 0.001) return;
      const p = wx(e.x, e.y), tl = st.face ? this.faceTurn(e, p[0], p[1]) : null;
      if ((st.face || st.perchOn) && !l.dead && a > 700) this.perch.push({ id: e.id, x: p[0], y: p[1], R: e.R * S * kk });
      this.rose(B, p[0], p[1], e.R * S * kk, e.rot + j[2] + rw + (tl ? tl[0] * 0.22 : 0), e, a, tl);
    }
  }

  // ---------- poster ----------
  preset() { return PRESETS.find(p => p.id === this.state.preset) || PRESETS[0]; }
  buildPoster() {
    if (!this.mctx) return;
    const s = this.state, pr = this.preset(), text = (s.text || "").slice(0, 40) || " ";
    this.rand = this.rng(s.seed * 7919 + 1);
    const L: any[] = []; let prev: any = null, uid = 1;
    for (const ch of text) {
      if (ch === " ") { const sp = { ch: " ", id: 9000 + uid++, els: [] as any[] }; L.push(sp); prev = sp; continue; }
      const same = prev && prev.ch !== " ";
      const l: any = { ch, id: 9000 + uid++, ws: same ? prev.ws : Math.floor(this.rand() * 1e9), wi: same ? prev.wi + 1 : 0, prev: same ? prev : null };
      this.gen(l); L.push(l); prev = l;
    }
    const n = L.length;
    const step = pr.id === "grow" ? Math.min(110, 3000 / n) : pr.id === "typed" ? Math.min(85, 3600 / n) : 0;
    const off = pr.id === "grow" ? 200 : pr.id === "typed" ? 300 : 0;
    L.forEach((l, i) => { l.b = off + i * step; });
    if (pr.id === "scatter") { const r = this.rng(s.seed * 31 + 5); L.forEach(l => { l.b = 150 + r() * 2400; }); }
    const wd = Math.min(60, 900 / n);
    L.forEach((l, i) => {
      l.d = pr.id === "scatter" ? 4700 + i * 8 : 4200 + (n - 1 - i) * wd;
      const nx = L[i + 1];
      l.cutRel = null;
      if (pr.id !== "scatter" && l.ch !== " " && nx && nx.ch === " ") { l.cutRel = Math.max(30, nx.b - l.b); this.genEnd(l, l.cutRel); }
    });
    this.rand = Math.random;
    const res = this.layoutCore(L, 1080, 1080, false);
    // fit the whole garden (not just the type) inside a 6% margin
    const S = res.S; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const addP = (l: any, x: number, y: number, r?: number) => { const X = l.tx + x * S, Y = l.ty + y * S, R = (r || 0) * S; x0 = Math.min(x0, X - R); x1 = Math.max(x1, X + R); y0 = Math.min(y0, Y - R); y1 = Math.max(y1, Y + R); };
    for (const l of L) {
      if (l.ch === " ") continue;
      addP(l, -l.tw / S / 2, -0.75); addP(l, l.tw / S / 2, 0.1);
      const all = [...l.els, ...(l.endEls || [])];
      for (const e of all) {
        if (e.t === "stem") e.pts.forEach((q: number[]) => addP(l, q[0], q[1], 0.02));
        else if (e.t === "leaf") addP(l, e.x, e.y, e.L);
        else addP(l, e.x, e.y, e.R * 1.15);
      }
    }
    // centre on the type itself; shrink just enough for the garden to clear the margins on every side
    let tx0 = 1e9, tx1 = -1e9, ty0 = 1e9, ty1 = -1e9;
    for (const l of L) if (l.ch !== " ") { tx0 = Math.min(tx0, l.tx - l.tw / 2); tx1 = Math.max(tx1, l.tx + l.tw / 2); ty0 = Math.min(ty0, l.ty - 0.72 * S); ty1 = Math.max(ty1, l.ty); }
    const Z = 1080, half = Z * 0.44, bcx = (tx0 + tx1) / 2, bcy = (ty0 + ty1) / 2;
    const k = Math.min(1.25, half / Math.max(1, bcx - x0, x1 - bcx), half / Math.max(1, bcy - y0, y1 - bcy));
    L.forEach(l => { l.tx = Z / 2 + (l.tx - bcx) * k; l.ty = Z / 2 + (l.ty - bcy) * k; l.tw *= k; l.x = l.tx; l.y = l.ty; });
    this.P = { letters: L, S: S * k, T: pr.T, preset: pr.id };
    this.pt0 = performance.now();
  }
  posterFly(B: any, tt: number, P: any, C: any) {
    const ps = this.perch.slice().sort((a: any, b: any) => a.x - b.x);
    if (!ps.length) return;
    const p1 = ps[Math.floor(ps.length * 0.25)], p2 = ps[Math.min(ps.length - 1, Math.floor(ps.length * 0.75))];
    const A = [-80, 300], s1 = [p1.x, p1.y - p1.R * 0.55], s2 = [p2.x, p2.y - p2.R * 0.55], E = [1160, 260];
    const sz = Math.max(12, P.S * 0.09), t = tt / 1000, eo = (v: number) => this.eo(Math.max(0, Math.min(1, v)));
    const leg = (a: number[], b: number[], u: number, lift: number) => { const e = eo(u); return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e - Math.sin(e * Math.PI) * lift]; };
    let p: number[], flying = true, vx = 0;
    if (t < 1.8) { p = leg(A, s1, t / 1.8, 160); vx = 1; }
    else if (t < 3.4) { p = s1; flying = false; }
    else if (t < 4.6) { p = leg(s1, s2, (t - 3.4) / 1.2, 140); vx = s2[0] > s1[0] ? 1 : -1; }
    else if (t < 5.8) { p = s2; flying = false; }
    else { p = leg(s2, E, (t - 5.8) / 1.2, 60); vx = 1; }
    let o: number, ang: number;
    if (flying) { o = Math.abs(Math.cos(t * 17)); p = [p[0] + Math.sin(t * 7) * 6, p[1] + Math.sin(t * 13) * 4]; ang = vx * 0.3; }
    else { const burst = (t > 2.4 && t < 2.8) || (t > 5 && t < 5.3); o = burst ? 0.2 + 0.8 * Math.abs(Math.cos(t * 9)) : 0.3 + 0.1 * Math.sin(t * 3); ang = 0; }
    this.butterfly(B, p[0], p[1], sz, ang, o, C);
  }
  /** One poster frame through a surface (the preview canvas or an export canvas). */
  drawPoster(surface: AsciiSurface, t: number) {
    this.minLw = surface.minLw;
    const g = surface.beginMask();
    this.posterDraw(g, t);
    surface.present(t / 1000);
  }
  posterDraw(g: CanvasRenderingContext2D, t: number) {
    const P = this.P; if (!P) return;
    const pc = this.pal();
    const tt = ((t % P.T) + P.T) % P.T, L = P.letters, B = this.backend(g);
    const st: any = { letters: L, S: P.S, C: pc.C, boil: this.props.boil ?? true, recoil: this.props.recoil ?? 20, speed: 1, wither: 600, textAll: true };
    L.forEach((l: any) => { l.x = l.tx; l.y = l.ty; l.dead = null; });
    const set = (base: number) => L.forEach((l: any) => { l.birth = base + l.b; l.tb = l.birth; l.cut = l.cutRel != null ? l.birth + l.cutRel : null; });
    if (P.preset === "breathe") {
      set(-1e5);
      const ph = tt / P.T * Math.PI * 2, S = P.S;
      st.warp = (x: number, y: number, l: any) => { const h = Math.max(0, (l.y - y) / S); return [x + Math.sin(ph + l.x * 0.004 + h * 1.1) * S * 0.03 * h, y + Math.cos(ph + x * 0.003) * S * 0.008 * h]; };
      st.rotw = (e: any) => Math.sin(ph + e.id * 0.7) * 0.12;
    } else if (P.preset === "grow" || P.preset === "scatter") {
      set(0);
      L.forEach((l: any) => { if (tt >= l.d) l.dead = l.d; });
    } else if (P.preset === "wind") {
      set(-1e5);
      const S = P.S, u = tt / P.T, front = -0.35 + u * 1.9;
      st.warp = (x: number, y: number, l: any) => {
        const hh = Math.max(0, (l.y - y) / S), d = l.x / 1080 - front;
        const gg = d < 0 ? Math.exp(d * 2.2) * Math.cos(-d * 9) : Math.exp(-d * d * 30);
        const idle = Math.sin(tt / 1000 * 1.6 + l.x * 0.01) * 0.012;
        return [x + (gg * 0.13 + idle) * S * hh * hh * 0.6 + (gg * 0.13 + idle) * S * hh * 0.4, y + Math.abs(gg) * 0.02 * S * hh];
      };
      st.rotw = (e: any) => { const d = e.x / 1080 - front; return (d < 0 ? Math.exp(d * 2.2) * Math.cos(-d * 9) : Math.exp(-d * d * 30)) * 0.35; };
    } else if (P.preset === "reach") {
      set(-1e5);
      const S = P.S, ph = tt / P.T * Math.PI * 2, lx = 540 + Math.sin(ph) * 430, ly = 540 + Math.sin(ph * 2) * 260;
      this._light = [lx, ly];
      st.warp = (x: number, y: number, l: any) => {
        const dx = lx - l.x, dy = ly - (l.y - S * 0.6), d = Math.hypot(dx, dy) || 1, w = Math.max(0, 1 - d / 560), s = w * w * (3 - 2 * w);
        const hh = Math.min(2.5, Math.max(0, (l.y - y) / S)), f = hh * hh * 0.5 + hh * 0.5;
        return [x + dx / d * s * S * 0.12 * f, y + dy / d * s * S * 0.06 * f];
      };
      st.rotw = (e: any) => { const a = Math.atan2(ly - e.y, lx - e.x); return Math.sin(a) * 0.15; };
    } else if (P.preset === "visit") {
      set(-1e5);
      st.perchOn = true; this.perch = [];
      const ph = tt / P.T * Math.PI * 2;
      st.warp = (x: number, y: number, l: any) => { const hh = Math.max(0, (l.y - y) / P.S); return [x + Math.sin(ph + l.x * 0.004 + hh) * P.S * 0.015 * hh, y]; };
    } else {
      if (tt >= 4400) return;
      set(0);
      st.letters = L.filter((l: any) => tt >= l.birth);
      st.textAll = false;
    }
    this.render(B, tt, st);
    if (P.preset === "reach") {
      const [lx, ly] = this._light, r = P.S * 0.09, pts: number[][] = [];
      for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; pts.push([lx + Math.cos(a) * r, ly + Math.sin(a) * r]); }
      B.fill(pts, st.C.line);
    }
    if (P.preset === "visit") this.posterFly(B, tt, P, st.C);
    if (P.preset === "typed") {
      const born = st.letters, last = born[born.length - 1], S = P.S;
      if (Math.floor(tt / 400) % 2 === 0 || (last && tt - last.birth < 300)) {
        const x = last ? last.tx + last.tw / 2 + 0.07 * S : 540, y = last ? last.ty - 0.33 * S : 540, w = Math.max(2, S * 0.03), h = 0.8 * S;
        B.rect(x - w / 2, y - h / 2, w, h, st.C.text);
      }
    }
  }

  // ---------- export ----------
  dl(blob: Blob, name: string) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  savePNG() {
    this.paint(performance.now(), false);
    this.canvas.toBlob(b => b && this.dl(b, "garden.png"));
  }
  /** The garden as an SVG made of text. */
  saveSVG() {
    this.paint(performance.now(), false);
    this.dl(new Blob([this.surface.toSVG()], { type: "image/svg+xml" }), "garden.svg");
  }
  fname() { return "garden-" + (this.state.text || "loop").trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 24) + "-" + this.state.preset; }
  exportSurface() {
    const c = document.createElement("canvas");
    const s = new AsciiSurface(c);
    s.setRoles(this.roles());
    s.resize(1080, 1080, 1, POSTER_CELL.cw, POSTER_CELL.ch);
    return s;
  }
  setBusy(b: boolean, status: string) { this.state.busy = b; this.cb.onBusy(b); this.cb.onStatus(status); }
  async exportVideo() {
    if (!this.vmime || this.state.busy) { this.cb.onStatus("Video export isn’t supported in this browser. Use PNG frames."); return; }
    const P = this.P, S = this.exportSurface(), c = S.canvas;
    const stream = (c as any).captureStream(0), track = stream.getVideoTracks()[0];
    const rec = new MediaRecorder(stream, { mimeType: this.vmime, videoBitsPerSecond: 14e6 }), chunks: Blob[] = [];
    rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
    const done = new Promise(r => { rec.onstop = r; });
    this.setBusy(true, "Recording…");
    this.drawPoster(S, 0); rec.start();
    const N = Math.round(P.T / 1000 * 30), wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      this.drawPoster(S, i * 1000 / 30);
      if (track.requestFrame) track.requestFrame();
      if (i % 15 === 0) this.cb.onStatus(`Recording ${Math.round(i / N * 100)}%`);
      const target = t0 + (i + 1) * 1000 / 30; await wait(Math.max(0, target - performance.now()));
    }
    rec.stop(); await done;
    const ext = this.vmime.includes("mp4") ? "mp4" : "webm";
    this.dl(new Blob(chunks, { type: this.vmime.split(";")[0] }), `${this.fname()}.${ext}`);
    this.setBusy(false, `Saved ${ext.toUpperCase()} · ${N} frames`);
  }
  async exportFrames() {
    if (this.state.busy) return;
    const P = this.P, S = this.exportSurface(), c = S.canvas, N = Math.round(P.T / 1000 * 30), files: { name: string; data: Uint8Array }[] = [];
    this.setBusy(true, "Rendering frames…");
    for (let i = 0; i < N; i++) {
      this.drawPoster(S, i * 1000 / 30);
      const b: Blob = await new Promise(r => c.toBlob(r as any, "image/png") as any);
      files.push({ name: `frame_${String(i + 1).padStart(4, "0")}.png`, data: new Uint8Array(await b.arrayBuffer()) });
      if (i % 10 === 0) this.cb.onStatus(`Rendering ${Math.round(i / N * 100)}%`);
    }
    this.dl(this.zip(files), `${this.fname()}-frames.zip`);
    this.setBusy(false, `Saved ${N} PNG frames · 30 fps`);
  }
  zip(files: { name: string; data: Uint8Array }[]) {
    const crcT = this._crcT || (this._crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })());
    const crc = (d: Uint8Array) => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const enc = new TextEncoder(), parts: any[] = [], cen: any[] = []; let off = 0;
    for (const f of files) {
      const nm = enc.encode(f.name), cr = crc(f.data), sz = f.data.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint16(12, 33, true);
      h.setUint32(14, cr, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, nm.length, true);
      parts.push(h.buffer, nm, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 33, true);
      c.setUint32(16, cr, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      cen.push(c.buffer, nm);
      off += 30 + nm.length + sz;
    }
    const cs = cen.reduce((s: number, b: any) => s + (b.byteLength || b.length), 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cen, e.buffer], { type: "application/zip" });
  }
}
