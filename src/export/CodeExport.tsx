import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ENGINE_SOURCE, FLAVORS, generate, type ExportConfig, type Flavor } from "./codegen";
import { highlight } from "./highlight";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The garden as it is now: words, palette, species and colour tweaks. */
  base: Pick<ExportConfig, "text" | "palette" | "flowers" | "colors" | "chaos" | "detail" | "textDetail">;
}

const EXPORT_KEY = "type-garden-ascii:export";
function readExport(): { flavor: Flavor; interactive: boolean } {
  try {
    const j = JSON.parse(localStorage.getItem(EXPORT_KEY) || "{}");
    return { flavor: FLAVORS.some((f) => f.id === j.flavor) ? j.flavor : "react", interactive: j.interactive !== false };
  } catch { return { flavor: "react", interactive: true }; }
}

/** Modal that shows copy-paste code for the current garden (React, HTML + Tailwind, HTML + CSS). */
export default function CodeExport({ open, onClose, base }: Props) {
  const [flavor, setFlavor] = useState<Flavor>(() => readExport().flavor);
  const [text, setText] = useState(base.text);
  const [interactive, setInteractive] = useState(() => readExport().interactive);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setText(base.text); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try { localStorage.setItem(EXPORT_KEY, JSON.stringify({ flavor, interactive })); } catch { /* storage can be blocked */ }
  }, [flavor, interactive]);

  const code = useMemo(
    () => (open ? generate(flavor, { ...base, text, interactive }) : ""),
    [open, flavor, base, text, interactive],
  );
  // syntax-highlighted view of the same code (the inlined engine stays one collapsed block)
  const html = useMemo(() => (open ? highlight(code, flavor, ENGINE_SOURCE) : ""), [open, code, flavor]);

  useLayoutEffect(() => {
    if (!open || !panel.current || !overlay.current) return;
    gsap.fromTo(overlay.current, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" });
    gsap.fromTo(panel.current, { y: 28, scale: 0.97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  if (!open) return null;
  const cur = FLAVORS.find((f) => f.id === flavor)!;

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); }
    catch {
      const t = document.createElement("textarea");
      t.value = code; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    a.download = cur.file;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return (
    <div className="xo" ref={overlay} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="xp glass" ref={panel} role="dialog" aria-label="Export code">
        <div className="xh">
          <div>
            <div className="x-title">Export code</div>
            <div className="x-sub">Copy, paste, done. The engine is inlined, so there is nothing to install.</div>
          </div>
          <button className="x-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="x-tabs" role="tablist">
          {FLAVORS.map((f) => (
            <button key={f.id} role="tab" aria-selected={f.id === flavor} className={"x-tab" + (f.id === flavor ? " on" : "")} onClick={() => setFlavor(f.id)}>{f.label}</button>
          ))}
        </div>
        <div className="x-note">{cur.note}</div>

        <div className="x-opts">
          <label className="x-field">
            <span>Words</span>
            <input value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          </label>
          <label className="x-check"><input type="checkbox" checked={interactive} onChange={(e) => setInteractive(e.target.checked)} /><span>Visitors can type</span></label>
        </div>

        <pre className="x-code" tabIndex={0} aria-label={`${cur.label} code`}><code dangerouslySetInnerHTML={{ __html: html }} /></pre>

        <div className="xf">
          <span className="x-size">{cur.file} · {(code.length / 1024).toFixed(0)} kB</span>
          <div className="x-actions">
            <button className="btn" onClick={download}>Download</button>
            <button className="btn solid" onClick={copy}>{copied ? "Copied" : "Copy code"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
