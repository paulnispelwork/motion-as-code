import { Fragment } from "react";
import { clamp, spring } from "@/lib/film/motion";
import { cn } from "@/lib/cn";

// Text split into words and letters. Each letter rises out of its word's
// baseline mask, blurred to sharp on a stiff spring.
export function Letters({ text, accent, className }: { text: string; accent?: boolean; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={cn("letters", accent && "accent", className)}>
      {words.map((word, wi) => (
        <Fragment key={wi}>
          <span className="word">
            {Array.from(word).map((ch, ci) => (
              <span key={ci} className="ch">
                {ch}
              </span>
            ))}
          </span>
          {wi < words.length - 1 && " "}
        </Fragment>
      ))}
    </span>
  );
}

// Style writes are skipped when the value has not changed since last frame.
const lastWrite = new WeakMap<HTMLElement, Record<string, string>>();

export function css(el: HTMLElement | null, prop: string, value: string) {
  if (!el) return;
  let cache = lastWrite.get(el);
  if (!cache) {
    cache = {};
    lastWrite.set(el, cache);
  }
  if (cache[prop] === value) return;
  cache[prop] = value;
  el.style.setProperty(prop, value);
}

// Show or hide a whole layer. display, not visibility: hidden layers must not leak.
export function show(el: HTMLElement | null, visible: boolean, display = "block") {
  css(el, "display", visible ? display : "none");
}

const charCache = new WeakMap<HTMLElement, HTMLElement[]>();

function chars(root: HTMLElement) {
  let list = charCache.get(root);
  if (!list) {
    list = Array.from(root.querySelectorAll<HTMLElement>(".ch"));
    charCache.set(root, list);
  }
  return list;
}

// Per-letter reveal. local is seconds since this line's reveal started.
export function reveal(root: HTMLElement | null, local: number, stagger = 0.026) {
  if (!root) return;
  chars(root).forEach((ch, i) => {
    const p = spring(local - i * stagger, 2.3, 0.7);
    const k = 1 - p;
    css(ch, "transform", Math.abs(k) < 0.002 ? "none" : `translate3d(0, ${(k * 108).toFixed(2)}%, 0)`);
    css(ch, "filter", k > 0.02 ? `blur(${(k * 9).toFixed(1)}px)` : "none");
    css(ch, "opacity", clamp(p * 1.6).toFixed(3));
  });
}

// Dissolve a line: blur plus fade. u runs 0 → 1.
export function dissolve(el: HTMLElement | null, u: number, rise = 0) {
  const k = clamp(u);
  css(el, "opacity", (1 - k).toFixed(3));
  css(el, "filter", k > 0.01 ? `blur(${(k * 14).toFixed(1)}px)` : "none");
  css(el, "transform", rise && k > 0 ? `translate3d(0, ${(-k * rise).toFixed(1)}px, 0)` : "none");
}

const painted = new WeakMap<HTMLElement, number>();

// Per-letter gradients need each letter's real offset in the line,
// otherwise the gradient restarts on every letter and shows seams.
// Measured once per layout version, and only once the line is on screen.
export function paintGradient(root: HTMLElement | null, layout: number) {
  if (!root || painted.get(root) === layout) return;
  const list = chars(root);
  const rects = list.map((ch) => ch.getBoundingClientRect());
  if (rects.length === 0 || rects[0].width === 0) return;
  painted.set(root, layout);
  // The gradient spans the letters themselves, not the (possibly wider) line box.
  const left = Math.min(...rects.map((r) => r.left));
  const width = Math.max(...rects.map((r) => r.right)) - left;
  list.forEach((ch, i) => {
    ch.style.backgroundSize = `${width}px 100%`;
    ch.style.backgroundPosition = `${-(rects[i].left - left)}px 0`;
  });
}
