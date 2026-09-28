"use client";

import { useRef } from "react";
import { DURATION, sceneAt } from "@/lib/film/timeline";
import { css } from "./letters";
import { useSeek } from "./film-context";

// The viewer chrome: timecode, scene and a play button with sound.
export function Hud({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  const progress = useRef<HTMLSpanElement>(null);
  const tc = useRef<HTMLSpanElement>(null);
  const scene = useRef<HTMLSpanElement>(null);

  useSeek(({ t }) => {
    css(progress.current, "transform", `scaleX(${(t / DURATION).toFixed(4)})`);
    if (tc.current) tc.current.textContent = `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
    if (scene.current) scene.current.textContent = sceneAt(t).label;
  });

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 md:px-8 md:pb-6">
      <div className="relative h-px w-full bg-[var(--border)]">
        <span ref={progress} className="absolute inset-0 origin-left bg-[var(--text-muted)]" style={{ transform: "scaleX(0)" }} />
      </div>
      <div className="mt-3 flex items-center gap-4 font-mono text-[11px] tracking-[0.14em] text-[var(--text-muted)]">
        <span aria-hidden className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--rose)]" />
          <span ref={tc} className="tabular-nums">
            00:00.00
          </span>
        </span>
        <span ref={scene} aria-hidden className="hidden uppercase md:inline">
          Cold open
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 uppercase text-[var(--text)] transition-colors hover:border-[var(--text-muted)]"
        >
          {playing ? (
            <>
              <span aria-hidden>❚❚</span> Pause
            </>
          ) : (
            <>
              <span aria-hidden>▶</span> Play with sound
            </>
          )}
        </button>
      </div>
    </div>
  );
}
