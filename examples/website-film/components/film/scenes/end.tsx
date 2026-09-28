"use client";

import { useRef } from "react";
import { endCard } from "@/lib/content";
import { B } from "@/lib/film/timeline";
import { spring } from "@/lib/film/motion";
import { Letters, css, dissolve, paintGradient, reveal, show } from "../letters";
import { useSeek } from "../film-context";

// The end card: the wordmark in front of the orb, the promise, one call to action.
// It lives outside the aria-hidden film layers so its link stays reachable.
export function EndScene() {
  const root = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const accent = useRef<HTMLSpanElement>(null);
  const cta = useRef<HTMLAnchorElement>(null);

  useSeek(({ t, beat, layout }) => {
    show(root.current, beat > 55.5, "flex");
    if (beat <= 55.5) return;

    paintGradient(accent.current, layout);

    reveal(mark.current, t - B(56.2), 0.07);
    reveal(line.current, t - B(57.6));
    reveal(accent.current, t - B(58.6));

    const p = spring(t - B(59.8), 1.6, 0.75);
    dissolve(cta.current, 1 - p);
    // Keep the link out of the tab order until it can be seen.
    css(cta.current, "visibility", p > 0.05 ? "visible" : "hidden");
  });

  return (
    <div ref={root} className="absolute inset-0 flex-col items-center justify-center px-4 pb-10 text-center" style={{ display: "none" }}>
      <span ref={mark} aria-hidden className="display block text-[clamp(84px,19vw,260px)] font-semibold leading-none tracking-[-0.05em]">
        <Letters text="BRAND" />
      </span>
      <p aria-hidden className="display mt-10 text-[clamp(26px,3.6vw,48px)] leading-tight">
        <span ref={line} className="block [text-shadow:0_2px_24px_rgba(7,8,13,0.9)]">
          <Letters text={endCard.line} />
        </span>
        <span ref={accent} className="block">
          <Letters text={endCard.accent} accent className="serif" />
        </span>
      </p>
      <a ref={cta} href="#start" className="button-primary mt-10" style={{ visibility: "hidden", opacity: 0 }}>
        {endCard.cta} <span aria-hidden>→</span>
      </a>
    </div>
  );
}
