"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BEAT, DURATION, END_BEAT } from "@/lib/film/timeline";
import { clamp } from "@/lib/film/motion";
import { playScore, type Score } from "@/lib/film/score";
import { StaticContent } from "@/components/static-content";
import { FilmContext, type Anchor, type FilmRegistry, type Frame } from "./film-context";
import { createWorld, worldAt, type Pointer } from "./world";
import { Shape } from "./shape";
import { Hud } from "./hud";
import { OpenScene } from "./scenes/open";
import { FormatsScene } from "./scenes/formats";
import { OutcomesScene } from "./scenes/outcomes";
import { EndScene } from "./scenes/end";

// Scroll distance per beat, in % of the viewport height.
const SVH_PER_BEAT = 16;

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

// The homepage is a film: one page, one seek(t), every style a function of t.
// Scrolling scrubs it; "Play with sound" runs it in real time with a score
// synthesized from the page's cue list.
export function Film() {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <StaticContent />;
  return (
    <>
      <div className="visually-hidden static-copy">
        <StaticContent />
      </div>
      <FilmStage />
    </>
  );
}

function FilmStage() {
  const scroller = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const score = useRef<Score | null>(null);
  const now = useRef(0); // the film time currently on screen
  const [registry] = useState<FilmRegistry>(() => ({ seeks: new Set() }));
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    score.current?.stop();
    score.current = null;
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (score.current) {
      stop();
      return;
    }
    const from = now.current >= DURATION - 0.5 ? 0 : now.current;
    try {
      score.current = playScore(from);
      setPlaying(true);
    } catch (error) {
      console.error("Could not start the score", error);
    }
  }, [stop]);

  useEffect(() => {
    const el = scroller.current;
    const st = stage.current;
    const cv = canvas.current;
    if (!el || !st || !cv) return;

    // ?t=12.3 opens the film on that frame, like the review mode of a film page.
    // Review stills always render at full quality.
    const requested = Number(new URLSearchParams(window.location.search).get("t"));
    const world = createWorld(cv, !(requested > 0));
    st.dataset.webgl = world ? "on" : "off";

    // Pointer parallax: the camera leans toward the cursor, eased per frame.
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const aim: Pointer = { x: 0, y: 0 };
    const pointer: Pointer = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      aim.x = (e.clientX / window.innerWidth) * 2 - 1;
      aim.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (finePointer) window.addEventListener("pointermove", onPointer, { passive: true });

    const anchor: Anchor = { x: 0, y: 0, r: 0 };
    let w = 0;
    let h = 0;
    let top = 0;
    let height = 0;
    let pxPerBeat = 1;
    let layoutVersion = 1;

    const layout = () => {
      w = st.clientWidth;
      h = st.clientHeight;
      top = el.getBoundingClientRect().top + window.scrollY;
      height = el.offsetHeight;
      pxPerBeat = Math.max(1, (height - h) / END_BEAT);
      world?.resize(w, h);
      layoutVersion++;
    };
    layout();

    const scrollTime = () => clamp((window.scrollY - top) / pxPerBeat, 0, END_BEAT) * BEAT;
    const scrollToTime = (t: number) => window.scrollTo(0, top + (t / BEAT) * pxPerBeat);

    if (requested > 0) scrollToTime(Math.min(requested, DURATION));

    let shown = scrollTime();
    let last = performance.now();
    const born = last;
    let raf = 0;

    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (time - last) / 1000);
      last = time;

      const s = score.current;
      if (s) {
        shown = Math.min(s.time(), DURATION);
        if (shown >= DURATION) stop();
        scrollToTime(shown);
      } else {
        // Ease toward the scroll position so wheel steps become motion, not jumps.
        const target = scrollTime();
        shown += (target - shown) * (1 - Math.exp(-dt * 9));
        if (Math.abs(target - shown) < 0.001) shown = target;
      }
      now.current = shown;
      const ease = 1 - Math.exp(-dt * 3);
      pointer.x += (aim.x - pointer.x) * ease;
      pointer.y += (aim.y - pointer.y) * ease;

      // Nothing to draw once the film has scrolled away.
      if (window.scrollY > top + height) return;

      const frame: Frame = {
        t: shown,
        beat: shown / BEAT,
        clock: (time - born) / 1000,
        w,
        h,
        anchor,
        layout: layoutVersion,
      };
      registry.seeks.forEach((seek) => seek(frame));
      world?.draw(worldAt(frame.t, w, h, anchor, pointer), frame.clock);
    };
    raf = requestAnimationFrame(tick);

    const resize = new ResizeObserver(layout);
    resize.observe(st);
    resize.observe(el);
    document.fonts?.ready.then(() => layoutVersion++).catch(() => undefined);

    // Any manual scroll takes the wheel back from the player.
    const interrupt = () => {
      if (score.current) stop();
    };
    const onKey = (e: KeyboardEvent) => {
      const onButton = e.target instanceof HTMLButtonElement;
      if (SCROLL_KEYS.has(e.key) && !(e.key === " " && onButton)) interrupt();
    };
    const onVisibility = () => {
      if (document.hidden) interrupt();
    };
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchstart", interrupt, { passive: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      score.current?.stop();
      score.current = null;
      world?.dispose();
    };
  }, [registry, stop]);

  return (
    <FilmContext.Provider value={registry}>
      <div ref={scroller} className="film-stage relative" style={{ height: `${100 + END_BEAT * SVH_PER_BEAT}svh` }}>
        <div ref={stage} className="sticky top-0 h-[100svh] overflow-hidden">
          <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
          <div aria-hidden className="absolute inset-0 [perspective:1400px]">
            <Shape />
            <OpenScene />
            <FormatsScene />
            <OutcomesScene />
          </div>
          <EndScene />
          <div aria-hidden className="vignette" />
          <Hud playing={playing} onToggle={toggle} />
        </div>
      </div>
    </FilmContext.Provider>
  );
}
