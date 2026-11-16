/** Everything the Tweaks panel controls, and how it is saved. */

/**
 * The smallest character size the sliders allow. Below about 0.4 the characters get too small to read and vanish.
 * (Vector fallback below it exists in the engine but is switched off: see VECTOR_BELOW in garden.ts.)
 */
export const MIN_CELL = 0.4;

/** The liquid-glass look is fixed (the Glass tweaks were removed). */
export const GLASS = { blur: 6, refraction: 40, ripple: 0.007, tint: 0, edge: 0.55, radius: 24 };

export interface GardenKnobs {
  chaos: number;
  boil: boolean;
  recoil: number;
  /** The flowers' character size: lower is finer and more detailed, higher is chunkier (MIN_CELL to 1.8). */
  detail: number;
  /** The type's character size, on its own (MIN_CELL to 1.8). */
  textDetail: number;
  grid: boolean;
}

export const KNOB_DEFAULTS: GardenKnobs = { chaos: 0.3, boil: true, recoil: 20, detail: 1, textDetail: 1, grid: true };

export interface Saved {
  palette: number;
  flowers: string[];
  colors: Record<string, string>;
  knobs: GardenKnobs;
  /** What grows: botanical, ocean or crystal. */
  theme: string;
  /** The words on the garden when you last left, restored fully grown. */
  text: string;
  mode: "type" | "poster";
  poster: { text: string; preset: string; seed: number };
}

export const STORE = "type-garden-ascii:v3";
export const OPEN_KEY = "type-garden-ascii:tweaks-open";

const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Reads the saved settings, falling back to defaults for anything missing or invalid. */
export function loadSaved(all: string[], paletteCount: number): Saved {
  let j: any = {};
  try { j = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { /* storage can be blocked */ }
  const flowers: string[] = Array.isArray(j.flowers) ? j.flowers.filter((k: string) => all.includes(k)) : all;
  const k = j.knobs || {};
  return {
    palette: Number.isInteger(j.palette) && j.palette >= 0 && j.palette < paletteCount ? j.palette : 0,
    flowers: flowers.length ? flowers : all,
    colors: j.colors && typeof j.colors === "object" ? j.colors : {},
    theme: typeof j.theme === "string" ? j.theme : "botanical",
    text: typeof j.text === "string" ? j.text.slice(0, 200) : "",
    mode: j.mode === "poster" ? "poster" : "type",
    poster: {
      text: typeof j.poster?.text === "string" ? j.poster.text.slice(0, 40) : "ASCII Garden",
      preset: typeof j.poster?.preset === "string" ? j.poster.preset : "wind",
      seed: num(j.poster?.seed, 7, 0, 1e9),
    },
    knobs: {
      chaos: num(k.chaos, KNOB_DEFAULTS.chaos, 0, 1),
      boil: typeof k.boil === "boolean" ? k.boil : KNOB_DEFAULTS.boil,
      recoil: num(k.recoil, KNOB_DEFAULTS.recoil, 0, 80),
      detail: num(k.detail, KNOB_DEFAULTS.detail, MIN_CELL, 1.8),
      textDetail: num(k.textDetail, KNOB_DEFAULTS.textDetail, MIN_CELL, 1.8),
      grid: typeof k.grid === "boolean" ? k.grid : KNOB_DEFAULTS.grid,
    },
  };
}

export function save(s: Saved) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage can be blocked */ }
}
