/**
 * Standalone entry: the whole ASCII garden with no dependencies (plain canvas and JS).
 * scripts/build-standalone.mjs bundles this into engine.min.js, and the code export pastes that bundle into the
 * React and HTML snippets it generates. It is exposed as a global: TypeGardenAscii.mount(element, config).
 */
import { Garden } from "../engine/garden";

export interface MountConfig {
  /** Words the garden grows. */
  text?: string;
  /** name, background, flower, stem and leaf, flower line, type */
  palette: string[];
  /** What grows: "botanical" (default), "ocean" or "crystal". */
  theme?: string;
  /** Species the flowers are drawn from. */
  flowers?: string[];
  /** Colour tweaks per species (hex). Anything missing uses its default on the palette. */
  colors?: Record<string, string>;
  /** 0 is minimal botanical typography, 1 is the garden taking over. 0.3 matches the original. */
  chaos?: number;
  /** Character size of the flowers: lower is finer, higher is chunkier (0.4 to 1.8). Default 1. */
  detail?: number;
  /** Character size of the type, separately (0.4 to 1.8). Default 1. */
  textDetail?: number;
  /** Let visitors click the garden and type to grow their own. */
  interactive?: boolean;
  /** Load Playfair Display and JetBrains Mono from Google Fonts (default true). */
  fonts?: boolean;
}

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Playfair+Display:wght@700&display=swap";

export function mount(el: HTMLElement, cfg: MountConfig) {
  if (cfg.fonts !== false && !document.querySelector("link[data-type-garden-fonts]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    link.setAttribute("data-type-garden-fonts", "");
    document.head.appendChild(link);
  }

  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.style.overflow = "hidden";
  el.style.outline = "none";
  if (el.tabIndex < 0) el.tabIndex = 0;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:text";
  const input = document.createElement("input");
  input.setAttribute("aria-label", "Type to grow a garden");
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.style.cssText =
    "position:absolute;left:0;top:0;width:1px;height:1px;margin:0;padding:0;border:0;opacity:0;font-size:16px;color:transparent;background:transparent;caret-color:transparent;pointer-events:none";
  el.appendChild(canvas);
  el.appendChild(input);

  const interactive = cfg.interactive !== false;
  const g = new Garden(canvas, input, { onStatus() {}, onBusy() {} });
  g.setCustomPalette(cfg.palette);
  g.setTheme(cfg.theme || "botanical");
  g.setFlowers(cfg.flowers && cfg.flowers.length ? cfg.flowers : "mixed");
  g.setKindColors(cfg.colors || {});
  g.setChaos(typeof cfg.chaos === "number" ? cfg.chaos : 0.3);
  g.setCellScale(typeof cfg.detail === "number" ? cfg.detail : 1);
  g.setTextScale(typeof cfg.textDetail === "number" ? cfg.textDetail : 1);
  // Without interaction, key presses are listened for on a detached element so nothing reaches the garden.
  g.start({ embed: true, keyTarget: interactive ? el : document.createElement("div") });
  // The words are already grown: no typing, no looping, nothing playing. Visitors can still click, lean flowers with the
  // cursor, and type to grow their own.
  if (cfg.text) g.seed(cfg.text);

  const onInput = () => g.inputDiff(input);
  const onDown = (e: PointerEvent) => g.appPointerDown(e);
  const onClick = (e: MouseEvent) => g.appClick(e);
  if (interactive) {
    input.addEventListener("input", onInput);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick);
  }
  const ro = new ResizeObserver(() => g.resize());
  ro.observe(el);

  const live = () => g.letters.filter((l: any) => !l.dead).length;

  return {
    garden: g,
    /** Type some words into the garden. */
    type(text: string) { for (const ch of text) g.add(ch, performance.now()); },
    /** Wither everything. */
    clear() { while (live() > 0) g.wither(performance.now()); },
    destroy() {
      ro.disconnect();
      input.removeEventListener("input", onInput);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick);
      g.destroy();
      canvas.remove();
      input.remove();
    },
  };
}
