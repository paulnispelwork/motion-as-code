"use client";

import { useRef } from "react";
import { B } from "@/lib/film/timeline";
import { range, track } from "@/lib/film/motion";
import { css, show } from "./letters";
import { useSeek, type Frame } from "./film-context";

type Rect = { l: number; t: number; r: number; b: number; radius: number };

const box = (cx: number, cy: number, w: number, h: number, radius: number): Rect => ({
  l: cx - w / 2,
  t: cy - h / 2,
  r: cx + w / 2,
  b: cy + h / 2,
  radius,
});

// Every state of the one shape that carries the formats scene.
function states(w: number, h: number) {
  const cx = w / 2;
  const cy = h * 0.47;
  const aW = Math.min(w * 0.84, h * 0.6 * (16 / 9));
  const bH = Math.min(h * 0.62, w * 0.86 * (16 / 9));
  const circle = Math.min(w, h) * 0.42;

  return {
    point: box(cx, cy, 0, 0, 0),
    wide: box(cx, cy, aW, (aW * 9) / 16, 18),
    tall: box(cx, cy, (bH * 9) / 16, bH, 28),
    circle: box(cx, cy, circle, circle, circle / 2),
  };
}

// Left and right edges on different springs, so the shape pours rather than scales.
function shapeAt(t: number, w: number, h: number) {
  const s = states(w, h);
  const keys: [number, Rect][] = [
    [0, s.point],
    [B(16), s.wide],
    [B(24), s.tall],
    [B(32), s.circle],
    [B(38.5), s.point],
  ];
  const edge = (k: keyof Rect, f: number) =>
    track(t, keys.map(([time, rect]) => [time, rect[k]] as [number, number]), f, 0.8);
  return {
    l: edge("l", 1.25),
    r: edge("r", 0.95),
    t: edge("t", 1.15),
    b: edge("b", 0.9),
    radius: Math.max(0, edge("radius", 1.1)),
  };
}

function timecode(t: number) {
  const frames = Math.floor(t * 60);
  const ff = String(frames % 60).padStart(2, "0");
  const ss = String(Math.floor(t) % 60).padStart(2, "0");
  const mm = String(Math.floor(t / 60)).padStart(2, "0");
  return `${mm}:${ss}:${ff}`;
}

export function Shape() {
  const shape = useRef<HTMLDivElement>(null);
  const decor = useRef<HTMLDivElement>(null);
  const aspect = useRef<HTMLSpanElement>(null);
  const tc = useRef<HTMLSpanElement>(null);

  useSeek(({ t, beat, w, h }: Frame) => {
    const r = shapeAt(t, w, h);
    const width = Math.max(0, r.r - r.l);
    const height = Math.max(0, r.b - r.t);
    const visible = beat > 16 && beat < 41 && width > 2 && height > 2;
    show(shape.current, visible);
    if (!visible) return;

    // The frames hang in space: a slow tilt that settles flat as the circle forms.
    const flat = range(beat, 30, 32);
    const tiltY = (1 - flat) * 14 * Math.sin(t * 0.55 + 0.6);
    const tiltX = (1 - flat) * 7 * Math.cos(t * 0.42);
    css(shape.current, "transform", `translate3d(${r.l.toFixed(1)}px, ${r.t.toFixed(1)}px, 0) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`);
    css(shape.current, "width", `${width.toFixed(1)}px`);
    css(shape.current, "height", `${height.toFixed(1)}px`);
    css(shape.current, "border-radius", `${Math.min(r.radius, width / 2, height / 2).toFixed(1)}px`);

    // Frame decor for the film formats.
    show(decor.current, beat > 16.4 && beat < 31.8);
    css(decor.current, "opacity", (1 - range(beat, 30.8, 31.6)).toFixed(3));
    if (aspect.current) aspect.current.textContent = beat < 24 ? "16:9" : "9:16";
    if (tc.current) tc.current.textContent = timecode(t);
  });

  return (
    <div ref={shape} className="shape" style={{ display: "none" }}>
      <div ref={decor} className="absolute inset-3 md:inset-4" style={{ display: "none" }}>
        <span className="corner left-0 top-0 border-l border-t" />
        <span className="corner right-0 top-0 border-r border-t" />
        <span className="corner left-0 bottom-0 border-l border-b" />
        <span className="corner right-0 bottom-0 border-r border-b" />
        <div className="absolute left-3 top-2.5 flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-[var(--text-muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--rose)]" />
          <span ref={tc}>00:00:00</span>
        </div>
        <span ref={aspect} className="absolute right-3 top-2.5 font-mono text-[11px] tracking-[0.12em] text-[var(--text-muted)]">
          16:9
        </span>
      </div>
    </div>
  );
}
