"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";

export type Anchor = { x: number; y: number; r: number };

export type Frame = {
  t: number; // film time in seconds
  beat: number; // film time in beats
  clock: number; // seconds since the page loaded, for ambient motion only
  w: number;
  h: number;
  anchor: Anchor; // the full stop the orb is born from, measured by the cold open
  layout: number; // bumps on resize and font load; measurements compare against it
};

export type SeekFn = (frame: Frame) => void;

export type FilmRegistry = {
  seeks: Set<SeekFn>;
};

export const FilmContext = createContext<FilmRegistry | null>(null);

function useRegistry() {
  const film = useContext(FilmContext);
  if (!film) throw new Error("Scene rendered outside <Film>");
  return film;
}

// A scene's seek(frame): called once per frame, writes styles, keeps no state.
export function useSeek(fn: SeekFn) {
  const film = useRegistry();
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    const seek: SeekFn = (frame) => latest.current(frame);
    film.seeks.add(seek);
    return () => {
      film.seeks.delete(seek);
    };
  }, [film]);
}
