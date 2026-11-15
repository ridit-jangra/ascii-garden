import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import gsap from "gsap";

export interface Choice {
  value: string;
  label: string;
}

interface Props {
  options: Choice[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}

/** Radio group with a sliding glass "thumb" behind the selected option (ported from ascii-animals' AnimalPicker). */
export default function GlassChoices({ options, value, onChange, label }: Props) {
  const thumbRef = useRef<HTMLSpanElement>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const placed = useRef(false);
  // GSAP slides the thumb: it jumps into place on first paint, then springs between options
  const placeThumb = useCallback(() => {
    const b = buttons.current[value];
    const t = thumbRef.current;
    if (!b || !t) return;
    const to = { x: b.offsetLeft, width: b.offsetWidth };
    if (!placed.current) { gsap.set(t, to); placed.current = true; }
    else gsap.to(t, { ...to, duration: 0.5, ease: "back.out(1.5)", overwrite: "auto" });
  }, [value]);

  useLayoutEffect(placeThumb, [placeThumb]);
  useEffect(() => {
    void document.fonts?.ready.then(placeThumb);
    window.addEventListener("resize", placeThumb);
    return () => window.removeEventListener("resize", placeThumb);
  }, [placeThumb]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = options.findIndex((o) => buttons.current[o.value] === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    buttons.current[next.value]?.focus();
    onChange(next.value);
  };

  return (
    <div className="choices glass" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      <span ref={thumbRef} className="thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          ref={(el) => { buttons.current[o.value] = el; }}
          type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
