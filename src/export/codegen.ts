/**
 * Code export: turns the garden you made into copy-paste code with no dependencies.
 * The snippets embed the standalone engine (plain canvas and JS, built by scripts/build-standalone.mjs),
 * so a React component or an HTML page runs by itself once pasted.
 */
import engine from "../standalone/engine.min.js?raw";

/** The inlined engine, so the code view can show it collapsed. */
export const ENGINE_SOURCE = engine;

export type Flavor = "react" | "tailwind" | "css";

export const FLAVORS: { id: Flavor; label: string; file: string; note: string }[] = [
  { id: "react", label: "React", file: "TypeGarden.jsx", note: "A component. Needs only React." },
  { id: "tailwind", label: "HTML + Tailwind", file: "type-garden.html", note: "One page. Tailwind styles the page, the garden needs no libraries." },
  { id: "css", label: "HTML + CSS", file: "type-garden.html", note: "One page. Native CSS, nothing to install." },
];

export interface ExportConfig {
  text: string;
  /** botanical, ocean or crystal */
  theme: string;
  /** name, background, flower, stem and leaf, flower line, type */
  palette: string[];
  flowers: string[];
  /** Colour tweaks only; species left out use their default on the palette. */
  colors: Record<string, string>;
  /** 0 minimal botanical typography ... 1 the garden has taken over. */
  chaos: number;
  /** Character size of the flowers (0 = vector) and of the type (0 = the real font). */
  detail: number;
  textDetail: number;
  interactive: boolean;
}

const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@500;700&family=Playfair+Display:wght@700&display=swap";
const HINT = "type to grow · space cuts · backspace withers · enter clears";

const literal = (c: ExportConfig) =>
  JSON.stringify(
    { text: c.text, theme: c.theme, palette: c.palette, flowers: c.flowers, colors: c.colors, chaos: c.chaos, detail: c.detail, textDetail: c.textDetail, interactive: c.interactive },
    null,
    2,
  );
const indent = (s: string, n: number) => s.split("\n").map((l, i) => (i ? " ".repeat(n) + l : l)).join("\n");
/** A script's text must never contain a closing script tag. */
const inlineSafe = (s: string) => s.replace(/<\/script/gi, "<\\/script");

function react(c: ExportConfig) {
  return `"use client";
// Type Garden (ASCII): a self-contained React component.
// No dependencies besides React: the garden is plain canvas and JavaScript, inlined below.
// Drop this file into your project and render <TypeGarden />. Give its parent a height.
// It loads Playfair Display and JetBrains Mono from Google Fonts by itself.
// Based on Type Garden by Akshat Agarwal: https://type-garden.vercel.app
import { useEffect, useRef } from "react";

/* eslint-disable */
${engine}
/* eslint-enable */

const CONFIG = ${literal(c)};

export default function TypeGarden({ text = CONFIG.text, className = "", style = {} }) {
  const ref = useRef(null);
  useEffect(() => {
    const garden = TypeGardenAscii.mount(ref.current, { ...CONFIG, text });
    return () => garden.destroy();
  }, [text]);
  return (
    <div
      ref={ref}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", minHeight: 360, background: CONFIG.palette[1], ...style }}
    />
  );
}
`;
}

function tailwind(c: ExportConfig) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Type Garden</title>
  <!-- Based on Type Garden by Akshat Agarwal: https://type-garden.vercel.app -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${FONTS}" rel="stylesheet" />
  <!-- Tailwind (Play CDN) only styles this page. Delete the tag if your project already has Tailwind.
       The garden below is plain canvas and JavaScript with no libraries. -->
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="m-0 h-screen overflow-hidden" style="background:${c.palette[1]}">
  <main id="garden" class="relative h-screen w-screen"></main>${
    c.interactive
      ? `
  <p class="pointer-events-none fixed bottom-5 left-6 font-mono text-xs font-medium tracking-wide opacity-60" style="color:${c.palette[5]}">${HINT}</p>`
      : ""
  }
  <script>
${inlineSafe(engine)}
  </script>
  <script>
    TypeGardenAscii.mount(document.getElementById("garden"), ${indent(literal(c), 4)});
  </script>
</body>
</html>
`;
}

function css(c: ExportConfig) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Type Garden</title>
  <!-- Based on Type Garden by Akshat Agarwal: https://type-garden.vercel.app -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${FONTS}" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; overflow: hidden; background: ${c.palette[1]}; }
    #garden { position: relative; width: 100vw; height: 100vh; }${
      c.interactive
        ? `
    .hint {
      position: fixed; left: 24px; bottom: 20px; margin: 0; pointer-events: none;
      font: 500 12px/1 "JetBrains Mono", ui-monospace, monospace; letter-spacing: 0.04em;
      color: ${c.palette[5]}; opacity: 0.6;
    }`
        : ""
    }
  </style>
</head>
<body>
  <main id="garden"></main>${c.interactive ? `\n  <p class="hint">${HINT}</p>` : ""}
  <script>
${inlineSafe(engine)}
  </script>
  <script>
    TypeGardenAscii.mount(document.getElementById("garden"), ${indent(literal(c), 4)});
  </script>
</body>
</html>
`;
}

export function generate(flavor: Flavor, c: ExportConfig): string {
  return flavor === "react" ? react(c) : flavor === "tailwind" ? tailwind(c) : css(c);
}
