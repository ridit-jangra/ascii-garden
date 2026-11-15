/**
 * A small syntax highlighter for the code export: JavaScript/JSX, HTML and CSS, with no dependencies.
 * It returns escaped HTML with <span class="tk-..."> tokens. The inlined engine (about 50 kB of minified JavaScript) is
 * kept as one plain span, so highlighting stays fast and the view can collapse it to a single line.
 */
import type { Flavor } from "./codegen";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls: string, s: string) => `<span class="tk-${cls}">${esc(s)}</span>`;

// comment | string | keyword | number | function call | JSX tag
const JS_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|import|from|export|default|if|else|for|while|new|class|extends|typeof|await|async|true|false|null|undefined|this|of|in|void)\b|(\b\d[\d._]*\b)|(\b[A-Za-z_$][\w$]*)(?=\()|(<\/?[A-Za-z][\w.]*)/g;

function hlJS(code: string): string {
  let out = "", last = 0;
  for (const m of code.matchAll(JS_RE)) {
    out += esc(code.slice(last, m.index));
    last = (m.index as number) + m[0].length;
    out += span(m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : m[4] ? "n" : m[5] ? "f" : "t", m[0]);
  }
  return out + esc(code.slice(last));
}

// comment | string | colour or number | property name
const CSS_RE = /(\/\*[\s\S]*?\*\/)|("[^"]*"|'[^']*')|(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|vh|vw|em|rem|s|%)?(?![\w-]))|([\w-]+)(?=\s*:)/g;

function hlCSS(code: string): string {
  let out = "", last = 0;
  for (const m of code.matchAll(CSS_RE)) {
    out += esc(code.slice(last, m.index));
    last = (m.index as number) + m[0].length;
    out += span(m[1] ? "c" : m[2] ? "s" : m[3] ? "n" : "a", m[0]);
  }
  return out + esc(code.slice(last));
}

function hlTag(tag: string): string {
  const m = /^(<\/?)([\w-]+)([\s\S]*?)(\/?>)$/.exec(tag);
  if (!m) return esc(tag);
  let attrs = "", last = 0;
  for (const a of m[3].matchAll(/([\w:@-]+)(=)?("[^"]*"|'[^']*')?/g)) {
    attrs += esc(m[3].slice(last, a.index));
    last = (a.index as number) + a[0].length;
    attrs += span("a", a[1]) + (a[2] ? esc("=") : "") + (a[3] ? span("s", a[3]) : "");
  }
  return span("t", m[1] + m[2]) + attrs + esc(m[3].slice(last)) + span("t", m[4]);
}

/** JavaScript with the engine kept whole: the text before and after it is highlighted, the engine itself is one span. */
function hlJSWithEngine(code: string, engine: string): string {
  const i = code.indexOf(engine);
  if (i < 0) return hlJS(code);
  return hlJS(code.slice(0, i)) + `<span class="tk-engine">${esc(engine)}</span>` + hlJS(code.slice(i + engine.length));
}

function hlHTML(code: string, engine: string): string {
  const re = /<script>([\s\S]*?)<\/script>|<style>([\s\S]*?)<\/style>|<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;
  let out = "", last = 0;
  for (const m of code.matchAll(re)) {
    out += esc(code.slice(last, m.index));
    last = (m.index as number) + m[0].length;
    if (m[0].startsWith("<script>")) out += span("t", "<script>") + hlJSWithEngine(m[1], engine) + span("t", "</script>");
    else if (m[0].startsWith("<style>")) out += span("t", "<style>") + hlCSS(m[2]) + span("t", "</style>");
    else if (m[0].startsWith("<!--")) out += span("c", m[0]);
    else out += hlTag(m[0]);
  }
  return out + esc(code.slice(last));
}

/** Highlighted HTML for an export. `engine` is the inlined engine source, kept as one collapsed block. */
export function highlight(code: string, flavor: Flavor, engine: string): string {
  return flavor === "react" ? hlJSWithEngine(code, engine) : hlHTML(code, engine);
}
