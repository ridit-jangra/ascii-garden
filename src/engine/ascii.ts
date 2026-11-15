/**
 * ASCII rasterizer.
 *
 * The garden is drawn with ordinary vector calls onto a hidden low-resolution "mask" canvas
 * (SX x SY sub-pixels per character cell). Every cell is then read back and turned into text,
 * the way the ascii-animals engine does it:
 *   - mostly covered cells become a block of colour with a dense glyph on top
 *   - thin or elongated shapes (stems, edges, swirls) become line glyphs that follow their angle: - \ | /
 *   - partly covered cells become a soft glyph that fades into the background
 * Because the mask is a real canvas, z-order, overlap and anti-aliasing come for free.
 */

export type RGB = [number, number, number];

/** Sub-pixels per cell along x and y. */
/** Most sub-pixel samples per cell along x and y. Smaller cells use fewer (see resize). */
export const SX = 4;
export const SY = 6;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Cheap integer hash -> [0, 1). */
export function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hex2rgb(h: string): RGB {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

const pack = (r: number, g: number, b: number) =>
  (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);

const cssCache = new Map<number, string>();
function css(p: number) {
  let s = cssCache.get(p);
  if (!s) {
    s = `rgb(${p >>> 16},${(p >>> 8) & 255},${p & 255})`;
    cssCache.set(p, s);
  }
  return s;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A glyph colour that reads against a block of `fill`. */
function onFill(f: RGB): RGB {
  const lum = (0.3 * f[0] + 0.59 * f[1] + 0.11 * f[2]) / 255;
  return lum > 0.55
    ? [f[0] * 0.42, f[1] * 0.42, f[2] * 0.42]
    : [Math.min(255, f[0] * 1.45 + 55), Math.min(255, f[1] * 1.45 + 55), Math.min(255, f[2] * 1.45 + 55)];
}

/** The line glyph closest to a screen-space angle (y down). */
export function lineGlyph(angle: number) {
  let a = angle % Math.PI;
  if (a < 0) a += Math.PI;
  return a < Math.PI / 8 || a >= (7 * Math.PI) / 8 ? "-" : a < (3 * Math.PI) / 8 ? "\\" : a < (5 * Math.PI) / 8 ? "|" : "/";
}

// Roles: 0 background, 1 flower, 2 stem and leaf, 3 flower line, 4 type,
// 5 flower shadow, 6 flower highlight, 7 leaf shadow, 8 leaf highlight.
// Shadows get dense glyphs, highlights get sparse ones, so shading reads as texture.
const BASE_SETS = ["", "O0o*&", ":;+=x*", "()/~|", "#@8&%B", "@%#8&W", ".:'`,", "#%=xX", ".:'`;"];
/** Which flower/leaf/line/type family a role belongs to. */
const BASE_FAM = [0, 1, 2, 3, 4, 1, 1, 2, 2];
/** 0 base colour, 1 shadow, 2 highlight. */
const BASE_TONE = [0, 0, 0, 0, 0, 1, 2, 1, 2];
const RAMP = ".',:;+=";

/**
 * Every species other than the rose gets its own colour and its own glyph family
 * [shadow, base, highlight], so each flower has a texture of its own as well as a colour.
 */
export const KIND_GLYPHS: Record<string, [string, string, string]> = {
  tulip: ["HM#%W", "Yy+*=", ".'`:,"],
  daisy: ["@08O", "o*:+.", "'`.,;"],
  poppy: ["&@%#8", "O0o*^", "`'.,:"],
  blossom: ["%&$@8", "*+x:;", ".'`,-"],
  lily: ["W#M%@", "&Zz+=", "`.'~:"],
  bell: ["B#8%@", "nu+:=", ".'`;,"],
  lavender: ["!|#I1", "li!:;", ".'`,:"],
  fern: ["X%#/Y", "/V+x*", ".:'`;"],
  dandelion: ["O@0&#", "o*+:.", "'`.,-"],
  // ocean
  coral: ["%&@#8", "*oO+0", ";:'.,"],
  anemone: ["@%&#W", "~*+=o", ".:'`;"],
  jellyfish: ["O0@%o", "()~oc", ".:'`,"],
  kelp: ["#%{}8", "}{)(|", "'`.:,"],
  // crystal
  quartz: ["#H%@M", "/\\<>^", ".'`:,"],
  cluster: ["@#M%W", "^vAV*", ".'`,;"],
  gem: ["#@%MW", "<>^v+", "*.'`:"],
};

const toRGB = (hex: string) => hex2rgb(hex);
const toHex = (c: RGB) => "#" + (pack(c[0], c[1], c[2]) | 0x1000000).toString(16).slice(1);
/** A darker and a lighter version of a colour, as hex. Shared by the garden (to draw) and the surface (to read back). */
export function tones(hex: string) {
  const c = toRGB(hex);
  return { dark: toHex(mix(c, [0, 0, 0], 0.46)), light: toHex(mix(c, [255, 255, 255], 0.42)) };
}
const SPARKLE: RGB = [255, 250, 240];

const CELL_NONE = 0;
const CELL_SOLID = 1;
const CELL_SOFT = 2;

export interface Roles {
  bg: string;
  red: string;
  blue: string;
  line: string;
  text: string;
  /** Colour of each species other than the rose (the rose uses `red`). */
  kinds?: Record<string, string>;
}

export class AsciiSurface {
  cw = 11;
  ch = 16;
  cols = 0;
  rows = 0;
  W = 0;
  H = 0;
  dpr = 1;
  fontFamily = '"JetBrains Mono", "DM Mono", ui-monospace, Menlo, monospace';

  readonly mask = document.createElement("canvas");
  readonly mg: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;
  private bgCanvas = document.createElement("canvas");
  private bgDirty = true;
  private roles: RGB[] = [];
  private fam: number[] = BASE_FAM;
  private sets: string[] = BASE_SETS;
  private tone: number[] = BASE_TONE;
  private nr = 9;
  /** 15-bit colour -> role index, rebuilt whenever the roles change. */
  private lut = new Uint8Array(32768);

  private flag = new Uint8Array(0);
  private fill = new Uint32Array(0);
  private color = new Uint32Array(0);
  private glyph = new Uint16Array(0);

  private an = new Int32Array(9);
  private asx = new Float64Array(9);
  private asy = new Float64Array(9);
  private asxx = new Float64Array(9);
  private asyy = new Float64Array(9);
  private asxy = new Float64Array(9);
  private sx = SX;
  private sy = SY;
  private th = 0;
  private ratio = 1;
  private pxs: number[] = [];
  private pys: number[] = [];

  /** Paint characters over whatever is already on the canvas: no background, no clearing (the text and front layers). */
  private overlay = false;

  constructor(public canvas: HTMLCanvasElement, opts: { overlay?: boolean } = {}) {
    this.overlay = !!opts.overlay;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    const mg = this.mask.getContext("2d", { willReadFrequently: true });
    if (!mg) throw new Error("2D canvas unavailable");
    this.mg = mg;
    this.setRoles({ bg: "#000000", red: "#ff1400", blue: "#3257ff", line: "#ffb4a8", text: "#ffffff" });
  }

  /** Faint cell grid behind the characters. */
  grid = true;
  setGrid(on: boolean) { this.grid = on; this.bgDirty = true; }

  /** Minimum stroke width (px) so thin lines still register as a glyph. */
  get minLw() {
    return this.cw * 0.5;
  }

  setRoles(r: Roles) {
    const rt = tones(r.red), bt = tones(r.blue);
    const hexes = [r.bg, r.red, r.blue, r.line, r.text, rt.dark, rt.light, bt.dark, bt.light];
    const fam = BASE_FAM.slice(), sets = BASE_SETS.slice(), tone = BASE_TONE.slice();
    let f = 5;
    for (const [kind, hex] of Object.entries(r.kinds || {})) {
      const g = KIND_GLYPHS[kind];
      if (!g) continue;
      const t = tones(hex);
      hexes.push(t.dark, hex, t.light);
      fam.push(f, f, f);
      tone.push(1, 0, 2);
      sets.push(g[0], g[1], g[2]);
      f++;
    }
    this.roles = hexes.map(hex2rgb);
    this.fam = fam; this.sets = sets; this.tone = tone; this.nr = hexes.length;
    const n = this.nr;
    this.an = new Int32Array(n); this.asx = new Float64Array(n); this.asy = new Float64Array(n);
    this.asxx = new Float64Array(n); this.asyy = new Float64Array(n); this.asxy = new Float64Array(n);
    // colour lookup: every 15-bit colour -> the nearest role (0 = background)
    const lut = this.lut, rr = this.roles, bg = rr[0];
    for (let i = 0; i < 32768; i++) {
      const cr = ((i >> 10) & 31) * 8 + 4, cg = ((i >> 5) & 31) * 8 + 4, cb = (i & 31) * 8 + 4;
      let best = 0, bd = (cr - bg[0]) ** 2 + (cg - bg[1]) ** 2 + (cb - bg[2]) ** 2;
      for (let k = 1; k < n; k++) {
        const q = rr[k], d = (cr - q[0]) ** 2 + (cg - q[1]) ** 2 + (cb - q[2]) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      lut[i] = best;
    }
    this.bgDirty = true;
  }

  resize(W: number, H: number, dpr: number, cw: number, ch: number) {
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.cw = cw;
    this.ch = ch;
    this.cols = Math.ceil(W / cw);
    this.rows = Math.ceil(H / ch);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.bgCanvas.width = this.canvas.width;
    this.bgCanvas.height = this.canvas.height;
    this.sx = clamp(Math.round(cw / 2.2), 1, SX);
    this.sy = clamp(Math.round(ch / 2.2), 1, SY);
    this.mask.width = this.cols * this.sx;
    this.mask.height = this.rows * this.sy;
    const n = this.cols * this.rows;
    this.flag = new Uint8Array(n);
    this.fill = new Uint32Array(n);
    this.color = new Uint32Array(n);
    this.glyph = new Uint16Array(n);
    this.pxs = Array.from({ length: this.sx }, (_, i) => ((i + 0.5) * cw) / this.sx);
    this.pys = Array.from({ length: this.sy }, (_, j) => ((j + 0.5) * ch) / this.sy);
    this.bgDirty = true;
  }

  /** Clear the mask to the background colour and set it up to draw in CSS pixels. */
  beginMask() {
    const g = this.mg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = css(pack(...this.roles[0]));
    g.fillRect(0, 0, this.mask.width, this.mask.height);
    g.setTransform(this.sx / this.cw, 0, 0, this.sy / this.ch, 0, 0);
    return g;
  }

  private paintBackground() {
    const g = this.bgCanvas.getContext("2d");
    if (!g) return;
    const { W, H, dpr, cw, ch } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = css(pack(...this.roles[0]));
    g.fillRect(0, 0, W, H);
    const b = this.roles[0];
    const light = (0.3 * b[0] + 0.59 * b[1] + 0.11 * b[2]) / 255 > 0.5;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.grid) { this.bgDirty = false; return; }
    g.strokeStyle = light ? "rgba(30,34,60,0.055)" : "rgba(255,255,255,0.045)";
    g.lineWidth = 1;
    g.beginPath();
    for (let c = 0; c <= Math.ceil(W / cw); c++) {
      const x = Math.round(c * cw * dpr) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, H * dpr);
    }
    for (let r = 0; r <= Math.ceil(H / ch); r++) {
      const y = Math.round(r * ch * dpr) + 0.5;
      g.moveTo(0, y);
      g.lineTo(W * dpr, y);
    }
    g.stroke();
    this.bgDirty = false;
  }

  /** Principal axis of one family's sub-pixels (all its tones together) inside the current cell. */
  private axis(f: number) {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let k = 1; k < this.nr; k++) {
      if (this.fam[k] !== f) continue;
      n += this.an[k]; sx += this.asx[k]; sy += this.asy[k]; sxx += this.asxx[k]; syy += this.asyy[k]; sxy += this.asxy[k];
    }
    if (n === 0) { this.th = 0; this.ratio = 1; return; }
    const mx = sx / n;
    const my = sy / n;
    const cxx = sxx / n - mx * mx;
    const cyy = syy / n - my * my;
    const cxy = sxy / n - mx * my;
    const half = (cxx - cyy) / 2;
    const rad = Math.sqrt(half * half + cxy * cxy);
    const mean = (cxx + cyy) / 2;
    this.th = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    this.ratio = (mean + rad) / (mean - rad + 0.35);
  }

  /** Read the mask back, turn it into cells and paint them. `t` is in seconds. */
  present(t: number) {
    const { cols, rows, cw, ch, roles, flag, fill, color, glyph, an, asx, asy, asxx, asyy, asxy, pxs, pys, fam, sets, tone, nr, lut } = this;
    if (!cols) return;
    const SXn = this.sx, SYn = this.sy;
    const w = cols * SXn;
    const h = rows * SYn;
    const data = this.mg.getImageData(0, 0, w, h).data;
    flag.fill(CELL_NONE);
    const N = SXn * SYn;
    const bg = roles[0];
    const [bgR, bgG, bgB] = bg;
    const rr = roles;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        an.fill(0); asx.fill(0); asy.fill(0); asxx.fill(0); asyy.fill(0); asxy.fill(0);
        for (let j = 0; j < SYn; j++) {
          const row = (r * SYn + j) * w + c * SXn;
          const py = pys[j];
          for (let i = 0; i < SXn; i++) {
            const o = (row + i) * 4;
            const cr = data[o], cg = data[o + 1], cb = data[o + 2];
            if (cr === bgR && cg === bgG && cb === bgB) continue;
            const best = lut[((cr >> 3) << 10) | ((cg >> 3) << 5) | (cb >> 3)];
            if (best === 0) continue;
            const px = pxs[i];
            an[best]++; asx[best] += px; asy[best] += py; asxx[best] += px * px; asyy[best] += py * py; asxy[best] += px * py;
          }
        }
        let total = 0;
        for (let k = 1; k < nr; k++) total += an[k];
        if (total < 3) continue;
        let dom = 1;
        for (let k = 2; k < nr; k++) if (an[k] > an[dom]) dom = k;
        const domFam = fam[dom];
        const cov = total / N;
        const idx = r * cols + c;
        const key = (hash3(c, r, 17) * 4294967295) >>> 0;
        const roll = hash3(key, Math.floor(t * 2.4 + (key % 997) / 97), 7);
        const base = rr[dom];
        this.axis(domFam);
        const domTh = this.th;
        const domRatio = this.ratio;
        const lineish = domFam === 4 ? 1.5 : 1.9;
        const solid = cov >= 0.8 || (cov >= 0.58 && domRatio < 2.3);

        if (solid) {
          // a second family in the cell, e.g. a flower's swirl line over its petals
          let sec = 0;
          for (let k = 1; k < nr; k++) if (fam[k] !== domFam && an[k] >= 4 && (sec === 0 || an[k] > an[sec])) sec = k;
          let fillC: RGB;
          let glyphC: RGB;
          let ch0: string;
          if (domFam === 4) {
            fillC = mix(base, bg, 0.82);
            glyphC = base;
          } else {
            // highlights stay bright, shadows sink a little into the background
            const tn = tone[dom];
            fillC = mix(base, bg, tn === 2 ? 0.05 : tn === 1 ? 0.3 : 0.2);
            glyphC = onFill(fillC);
          }
          const set = sets[dom];
          ch0 = set[(key >>> 8) % set.length];
          if (sec) {
            this.axis(fam[sec]);
            glyphC = rr[sec];
            ch0 = this.ratio > 1.6 ? lineGlyph(this.th) : "o";
          }
          if (roll < 0.045) glyphC = mix(glyphC, SPARKLE, 0.75);
          flag[idx] = CELL_SOLID;
          fill[idx] = pack(fillC[0], fillC[1], fillC[2]);
          color[idx] = pack(glyphC[0], glyphC[1], glyphC[2]);
          glyph[idx] = ch0.charCodeAt(0);
          continue;
        }

        if (cov < 0.1) continue;
        const f = clamp(0.62 - cov, 0, 0.5) * 0.9;
        const col = mix(base, bg, f);
        let g0: string;
        if (domRatio > lineish) g0 = lineGlyph(domTh);
        else g0 = RAMP[clamp(Math.floor(((cov - 0.1) / 0.5) * RAMP.length), 0, RAMP.length - 1)];
        flag[idx] = CELL_SOFT;
        color[idx] = pack(col[0], col[1], col[2]);
        glyph[idx] = g0.charCodeAt(0);
      }
    }
    this.draw();
  }

  private draw() {
    if (this.bgDirty && !this.overlay) this.paintBackground();
    const { ctx, cols, rows, cw, ch, flag, fill, color, glyph, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.overlay) ctx.drawImage(this.bgCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `700 ${Math.round(ch * 0.78)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let last = -1;
    const n = cols * rows;
    if (ch < 5) {
      // fine mosaic: one coloured block per cell
      for (let i = 0; i < n; i++) {
        const f = flag[i];
        if (!f) continue;
        const x = (i % cols) * cw;
        const y = ((i / cols) | 0) * ch;
        const c = f === CELL_SOLID ? fill[i] : color[i];
        if (c !== last) { ctx.fillStyle = css(c); last = c; }
        ctx.fillRect(x, y, cw, ch);
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      const f = flag[i];
      if (!f) continue;
      const x = (i % cols) * cw;
      const y = ((i / cols) | 0) * ch;
      if (f === CELL_SOLID) {
        ctx.fillStyle = css(fill[i]);
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
        last = -1;
      }
      if (color[i] !== last) {
        ctx.fillStyle = css(color[i]);
        last = color[i];
      }
      ctx.fillText(String.fromCharCode(glyph[i]), x + cw / 2, y + ch / 2 + 1);
    }
  }

  /** The last presented frame as SVG pieces: colour blocks, and a text group sized to this grid's characters. */
  svgParts() {
    const { cols, rows, cw, ch, flag, fill, color, glyph } = this;
    const hex = (p: number) => "#" + (p | 0x1000000).toString(16).slice(1);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const blocks: string[] = [];
    const texts: string[] = [];
    for (let i = 0; i < cols * rows; i++) {
      const f = flag[i];
      if (!f) continue;
      const x = (i % cols) * cw;
      const y = ((i / cols) | 0) * ch;
      if (f === CELL_SOLID) blocks.push(`<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${hex(fill[i])}"/>`);
      texts.push(`<text x="${(x + cw / 2).toFixed(1)}" y="${(y + ch / 2 + 1).toFixed(1)}" fill="${hex(color[i])}">${esc(String.fromCharCode(glyph[i]))}</text>`);
    }
    return {
      blocks: blocks.join(""),
      text: `<g font-family="JetBrains Mono, DM Mono, monospace" font-weight="700" font-size="${Math.round(ch * 0.78)}" text-anchor="middle" dominant-baseline="central">${texts.join("")}</g>`,
      bg: hex(pack(...this.roles[0])),
      W: cols * cw,
      H: rows * ch,
    };
  }
}

/**
 * Three layers of characters on one canvas, so the type and the flowers can each have their own character size:
 * flowers behind the type, then the type, then flowers in front. The flower layers share one grid size and the type
 * has its own.
 */
export class LayeredSurface {
  readonly back: AsciiSurface;
  readonly text: AsciiSurface;
  readonly front: AsciiSurface;

  constructor(public canvas: HTMLCanvasElement) {
    this.back = new AsciiSurface(canvas);
    this.text = new AsciiSurface(canvas, { overlay: true });
    this.front = new AsciiSurface(canvas, { overlay: true });
  }

  setRoles(r: Roles) { this.back.setRoles(r); this.text.setRoles(r); this.front.setRoles(r); }
  /** The faint grid is drawn once, at the flowers' cell size. */
  setGrid(on: boolean) { this.back.setGrid(on); }

  resize(W: number, H: number, dpr: number, fcw: number, fch: number, tcw: number, tch: number) {
    this.back.resize(W, H, dpr, fcw, fch);
    this.text.resize(W, H, dpr, tcw, tch);
    this.front.resize(W, H, dpr, fcw, fch);
  }

  /** The last presented frame as an SVG made of text, all three layers in order. */
  toSVG() {
    const a = this.back.svgParts(), b = this.text.svgParts(), c = this.front.svgParts();
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${a.W}" height="${a.H}" viewBox="0 0 ${a.W} ${a.H}">` +
      `<rect width="100%" height="100%" fill="${a.bg}"/>` +
      `${a.blocks}${a.text}${b.blocks}${b.text}${c.blocks}${c.text}</svg>`
    );
  }
}
