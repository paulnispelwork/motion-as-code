"use client";

import { useRef } from "react";
import { formats } from "@/lib/content";
import { B } from "@/lib/film/timeline";
import { range } from "@/lib/film/motion";
import { Letters, css, dissolve, reveal, show } from "../letters";
import { useSeek } from "../film-context";

const FROM = 16;
const EACH = 8;

// Launch films, ad reels, brand stings: one per shape state, one headline at a time.
export function FormatsScene() {
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const titles = useRef<(HTMLSpanElement | null)[]>([]);
  const details = useRef<(HTMLDivElement | null)[]>([]);
  const eyebrow = useRef<HTMLParagraphElement>(null);

  useSeek(({ t, beat, w, h }) => {
    show(root.current, beat > 16 && beat < 40);
    if (beat <= 16 || beat >= 40) return;

    dissolve(eyebrow.current, 1 - range(beat, 16.6, 17.4) + range(beat, 38.2, 39));

    formats.forEach((_, i) => {
      const start = FROM + i * EACH;
      const end = start + EACH;
      show(items.current[i], beat > start && beat < end);
      reveal(titles.current[i], t - B(start + 1.2));
      dissolve(details.current[i], 1 - range(beat, start + 2.2, start + 3.2));
      dissolve(items.current[i], range(beat, end - 1.3, end - 0.4), 24);

      // The brand sting sits under its circle so the orb inside stays clear.
      const below = i === 2;
      const cy = h * 0.47;
      const top = below ? cy + Math.min(w, h) * 0.21 + 28 : cy;
      css(items.current[i], "top", `${top.toFixed(1)}px`);
      css(items.current[i], "translate", below ? "0 0" : "0 -50%");
    });
  });

  return (
    <div ref={root} className="absolute inset-0" style={{ display: "none" }}>
      <p ref={eyebrow} className="absolute inset-x-0 top-[9%] text-center font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)] md:text-[12px]">
        What we make
      </p>
      {formats.map((format, i) => (
        <div
          key={format.title}
          ref={(el) => {
            items.current[i] = el;
          }}
          className="absolute inset-x-6 text-center"
          style={{ display: "none" }}
        >
          <p className="font-mono text-[11px] tracking-[0.2em] text-[var(--text-muted)]">0{i + 1} / 03</p>
          <span
            ref={(el) => {
              titles.current[i] = el;
            }}
            className="display mt-3 block text-[clamp(40px,6vw,92px)] leading-none"
          >
            <Letters text={format.title} />
          </span>
          <div
            ref={(el) => {
              details.current[i] = el;
            }}
            className="mx-auto mt-5 max-w-sm"
          >
            <p className="font-mono text-[12px] tracking-[0.14em] text-[var(--ember)] md:text-[13px]">{format.meta}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)] md:text-[17px]">{format.use}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
