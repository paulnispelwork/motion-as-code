"use client";

import { useRef } from "react";
import { hero } from "@/lib/content";
import { B } from "@/lib/film/timeline";
import { range, spring } from "@/lib/film/motion";
import { Letters, css, dissolve, paintGradient, reveal, show } from "../letters";
import { useSeek } from "../film-context";

// Cold open. The headline arrives on load; scrolling dissolves it, and its
// full stop ignites into the orb the camera then dives into.
export function OpenScene() {
  const root = useRef<HTMLDivElement>(null);
  const eyebrow = useRef<HTMLParagraphElement>(null);
  const line1 = useRef<HTMLSpanElement>(null);
  const line2 = useRef<HTMLSpanElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const sub = useRef<HTMLParagraphElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const statement = useRef<HTMLDivElement>(null);
  const statementLine = useRef<HTMLSpanElement>(null);
  const statementSub = useRef<HTMLParagraphElement>(null);

  const measured = useRef(0);

  useSeek(({ t, beat, clock, anchor, layout }) => {
    show(root.current, beat < 16.5);
    if (beat >= 16.5) return;

    paintGradient(line2.current, layout);
    if (measured.current !== layout && root.current && dot.current) {
      const stage = root.current.getBoundingClientRect();
      const d = dot.current.getBoundingClientRect();
      if (d.width > 0) {
        measured.current = layout;
        anchor.x = d.left + d.width / 2 - stage.left;
        anchor.y = d.top + d.height / 2 - stage.top;
        anchor.r = d.width * 0.62;
      }
    }

    // The full stop is a crisp dot until the swarm pours out of it.
    const webgl = root.current?.closest<HTMLElement>("[data-webgl]")?.dataset.webgl === "on";
    css(dot.current, "opacity", (spring(clock - 0.9, 1.2, 1) * (webgl ? 1 - range(beat, 5.2, 6.4) : 1)).toFixed(3));

    const intro = clock;
    css(eyebrow.current, "opacity", (spring(intro - 0.1, 1.2, 1) * (1 - range(beat, 2.5, 4.5))).toFixed(3));

    reveal(line1.current, intro - 0.25);
    reveal(line2.current, intro - 0.6);
    dissolve(line1.current, range(beat, 3.2, 5.2));
    dissolve(line2.current, range(beat, 3.8, 5.8));

    const subIn = spring(intro - 1.3, 1.2, 1);
    dissolve(sub.current, 1 - subIn + range(beat, 2.2, 4.2));
    dissolve(hint.current, 1 - spring(intro - 2.1, 1.2, 1) + range(beat, 0.2, 1));
    css(hint.current, "transform", `translate3d(0, ${(Math.sin(clock * 2.4) * 4).toFixed(1)}px, 0)`);

    // The statement sits under the orb while it spins up.
    show(statement.current, beat > 7.5 && beat < 13);
    reveal(statementLine.current, t - B(8));
    dissolve(statementSub.current, 1 - range(beat, 9, 10));
    dissolve(statement.current, range(beat, 11.4, 12.4));
  });

  return (
    <div ref={root} className="absolute inset-0">
      <div className="absolute inset-x-4 top-[20%] mx-auto max-w-5xl text-center md:top-[22%]">
        <p ref={eyebrow} className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)] md:text-[12px]" style={{ opacity: 0 }}>
          {hero.eyebrow}
        </p>
        <div className="display mt-6 text-[clamp(46px,9vw,136px)] leading-[0.98]">
          <span ref={line1} className="block">
            <Letters text={hero.line1} />
          </span>
          <span className="block whitespace-nowrap">
            <span ref={line2} className="inline-block">
              <Letters text={hero.line2} accent className="serif" />
            </span>
            <span ref={dot} className="orb-dot" />
          </span>
        </div>
        <p ref={sub} className="mx-auto mt-8 max-w-xl text-[16px] leading-relaxed text-[var(--text-muted)] md:text-[18px]" style={{ opacity: 0 }}>
          {hero.sub}
        </p>
      </div>

      <p ref={hint} className="absolute inset-x-4 bottom-24 text-center font-mono text-[10px] uppercase tracking-[0.16em] md:text-[11px] md:tracking-[0.24em] text-[var(--text-muted)]" style={{ opacity: 0 }}>
        {hero.hint} ↓
      </p>

      <div ref={statement} className="absolute inset-x-4 top-[calc(47%+13vmin+28px)] text-center" style={{ display: "none" }}>
        <span ref={statementLine} className="display block text-[clamp(28px,4.4vw,56px)]">
          <Letters text={hero.statement} />
        </span>
        <p ref={statementSub} className="mt-3 text-[15px] text-[var(--text-muted)] md:text-[17px]">
          {hero.statementSub}
        </p>
      </div>
    </div>
  );
}
