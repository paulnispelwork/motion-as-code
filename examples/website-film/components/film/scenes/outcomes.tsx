"use client";

import { useRef } from "react";
import { outcomes, outcomesTitle } from "@/lib/content";
import { B, OUTCOME_BEATS, OUTCOME_FROM } from "@/lib/film/timeline";
import { range } from "@/lib/film/motion";
import { Letters, css, dissolve, paintGradient, reveal, show } from "../letters";
import { useSeek } from "../film-context";

const LAST = OUTCOME_FROM + outcomes.length * OUTCOME_BEATS;

// What a film does for you: one outcome at a time, next to the morphing object.
export function OutcomesScene() {
  const root = useRef<HTMLDivElement>(null);
  const eyebrow = useRef<HTMLParagraphElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const titles = useRef<(HTMLSpanElement | null)[]>([]);
  const texts = useRef<(HTMLParagraphElement | null)[]>([]);
  const rail = useRef<HTMLDivElement>(null);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);

  useSeek(({ t, beat, layout }) => {
    show(root.current, beat > OUTCOME_FROM - 0.5 && beat < LAST + 0.5);
    if (beat <= OUTCOME_FROM - 0.5 || beat >= LAST + 0.5) return;

    const fade = range(beat, OUTCOME_FROM - 0.5, OUTCOME_FROM + 0.5) * (1 - range(beat, LAST - 0.6, LAST + 0.2));
    css(eyebrow.current, "opacity", fade.toFixed(3));
    css(rail.current, "opacity", fade.toFixed(3));

    outcomes.forEach((_, i) => {
      const start = OUTCOME_FROM + i * OUTCOME_BEATS;
      const end = start + OUTCOME_BEATS;
      show(items.current[i], beat > start && beat < end);
      if (i % 2 === 1 && beat > start && beat < end) paintGradient(titles.current[i], layout);
      reveal(titles.current[i], t - B(start + 0.3));
      dissolve(texts.current[i], 1 - range(beat, start + 1, start + 1.8));
      dissolve(items.current[i], range(beat, end - 0.8, end - 0.1), 30);
      css(fills.current[i], "transform", `scaleX(${range(beat, start, end).toFixed(3)})`);
    });
  });

  return (
    <div ref={root} className="absolute inset-0" style={{ display: "none" }}>
      <p ref={eyebrow} className="absolute inset-x-6 top-[12%] text-center font-mono min-[900px]:left-[8%] min-[900px]:text-left text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)] md:text-[12px]">
        {outcomesTitle}
      </p>

      {outcomes.map((outcome, i) => (
        <div
          key={outcome.title}
          ref={(el) => {
            items.current[i] = el;
          }}
          className="absolute inset-x-6 top-[50%] text-center min-[900px]:left-[8%] min-[900px]:right-auto min-[900px]:top-1/2 min-[900px]:w-[46%] min-[900px]:-translate-y-1/2 min-[900px]:text-left"
          style={{ display: "none" }}
        >
          <span
            ref={(el) => {
              titles.current[i] = el;
            }}
            className="display block text-[clamp(48px,8vw,128px)] leading-none"
          >
            <Letters text={outcome.title} accent={i % 2 === 1} className={i % 2 === 1 ? "serif" : undefined} />
          </span>
          <p
            ref={(el) => {
              texts.current[i] = el;
            }}
            className="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-[var(--text-muted)] md:text-[20px] min-[900px]:mx-0"
          >
            {outcome.text}
          </p>
        </div>
      ))}

      <div ref={rail} className="absolute inset-x-0 bottom-24 mx-auto flex w-[min(360px,calc(100%-32px))] gap-1.5" style={{ opacity: 0 }}>
        {outcomes.map((outcome, i) => (
          <span key={outcome.title} className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-[var(--border)]">
            <span
              ref={(el) => {
                fills.current[i] = el;
              }}
              className="absolute inset-0 origin-left bg-[var(--text)]"
              style={{ transform: "scaleX(0)" }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
