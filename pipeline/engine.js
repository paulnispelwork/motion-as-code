// Film engine: the shared runtime for every film page in this pipeline.
//
// A film page lays out its scenes in HTML/CSS, includes this file, and calls
//   Film.start({ bpm, beats, width, height, fonts, audio, build })
// build() runs once, after fonts and images have loaded, and returns
//   { seek(t), cues?(), arr?, shutter?(t) }.
// seek(t) must be a pure function of t: no state carried between frames.
//
// Contract with the tools (stills.js, render.js, qa_page.js, export_cues.js):
//   window.READY, window.seek(t), window.DURATION, window.FILM, window.EVENTS,
//   window.ARR, window.SHUTTER(t), window.QA_TEXT().
// URL modes: ?t=12.3 or ?b=18 (one still), ?play (live review with audio).

let BPM = 90, BEAT = 60 / 90;
const at = (b) => b * BEAT;

// ---- springs and curves ------------------------------------------------------
// Closed-form damped spring from 0 to 1. p = [frequency Hz, damping ratio].
const SP = { base: [1.6, 0.86], soft: [1.0, 0.9], snap: [2.4, 0.78], fast: [3.6, 0.92], cut: [7, 1], cam: [0.75, 1],
  lag: [1.2, 0.72], lead: [2.8, 0.82], slam: [3.2, 0.62], mask: [2.3, 1], glide: [1.1, 1], stiff: [4.2, 1] };
function step(tau, p = SP.base) {
  if (tau <= 0) return 0;
  const w = 2 * Math.PI * p[0], z = p[1];
  if (z >= 1) return 1 - Math.exp(-w * tau) * (1 + w * tau);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + (z * w / wd) * Math.sin(wd * tau));
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const expo = (x) => { x = clamp(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); };
const span = (t, b0, b1) => clamp((t - at(b0)) / (at(b1) - at(b0)));
// Sum of springs: one spring per keyframe, so a value can retarget many times and stay pure.
// keys: [[beat, value | [values], preset?], ...]
function track(keys, preset = SP.base) {
  return (t) => {
    const first = keys[0][1];
    if (typeof first === "number") { let v = first; for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * step(t - at(keys[i][0]), keys[i][2] || preset); return v; }
    const v = first.slice();
    for (let i = 1; i < keys.length; i++) { const k = step(t - at(keys[i][0]), keys[i][2] || preset); for (let j = 0; j < v.length; j++) v[j] += (keys[i][1][j] - keys[i - 1][1][j]) * k; }
    return v;
  };
}
// In at inB, out at outB (null = stays). Returns 0..1 visibility.
const inout = (t, inB, outB, pin = SP.base, pout = SP.fast) => clamp(step(t - at(inB), pin) - (outB == null ? 0 : step(t - at(outB), pout)));

// ---- DOM helpers ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const rgb = (c) => `rgb(${c.map((x) => Math.round(clamp(x, 0, 255))).join(",")})`;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function show(el, v) { el.style.opacity = clamp(v).toFixed(4); el.style.visibility = v < 0.002 ? "hidden" : "visible"; }
function reveal(el, t, inB, outB, o = {}) {
  const { dy = 20, sc = 0, pin = SP.base, pout = SP.fast } = o;
  const e = step(t - at(inB), pin), x = outB == null ? 0 : step(t - at(outB), pout);
  show(el, clamp(e - x));
  el.style.transform = `translateY(${((1 - e) * dy - x * dy * 0.5).toFixed(2)}px) scale(${(1 - (1 - e) * sc).toFixed(4)})`;
}
// Word masks: each word rises out of its own baseline mask.
function splitMask(el) {
  const walk = (node) => [...node.childNodes].forEach((ch) => {
    if (ch.nodeType === 3) {
      const frag = document.createDocumentFragment();
      ch.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const m = document.createElement("span"); m.className = "m"; const i = document.createElement("i"); i.textContent = part; m.appendChild(i); frag.appendChild(m);
      });
      ch.replaceWith(frag);
    } else if (ch.nodeType === 1 && ch.tagName !== "BR" && !ch.hasAttribute("data-nosplit")) walk(ch);
  });
  walk(el);
  return [...el.querySelectorAll(".m > i")];
}
function mask(list, t, inB, gap, outB, o = {}) {
  const { outGap = 0.03, rot = 4, p = SP.mask } = o;
  list.forEach((w, i) => {
    const e = step(t - at(inB + i * gap), p), x = outB == null ? 0 : step(t - at(outB + i * outGap), p);
    w.style.transform = `translateY(${((1 - e) * 110 - x * 135).toFixed(2)}%) rotate(${((1 - e) * rot).toFixed(2)}deg)`;
    w.parentNode.style.opacity = e < 0.001 || x > 0.999 ? "0" : "1";
  });
}
// Per-letter reveal: each letter rises from a baseline mask, blurred to sharp on a stiff spring.
function splitLetters(el) {
  const words = splitMask(el), out = [];
  words.forEach((w) => { const s = w.textContent; w.textContent = ""; [...s].forEach((ch) => { const l = document.createElement("b"); l.className = "ltr"; l.textContent = ch; w.appendChild(l); out.push(l); }); w.style.transform = "none"; });
  return out;
}
function letters(list, t, inB, gap, outB, o = {}) {
  const { p = SP.stiff, blur = 10, dy = 90, outGap = 0.012 } = o;
  list.forEach((l, i) => {
    const e = step(t - at(inB) - i * gap * BEAT, p), x = outB == null ? 0 : step(t - at(outB) - i * outGap * BEAT, SP.fast);
    const v = clamp(e - x);
    l.style.opacity = v.toFixed(4);
    l.style.transform = `translateY(${((1 - e) * dy - x * dy * 0.4).toFixed(2)}%)`;
    l.style.filter = v > 0.995 ? "none" : `blur(${((1 - e) * blur + x * blur * 0.6).toFixed(2)}px)`;
    l.parentNode.parentNode.style.opacity = e < 0.001 || x > 0.999 ? "0" : "1";
  });
}
function wipe(el, t, inB, outB) {
  const e = step(t - at(inB), SP.mask), x = outB == null ? 0 : step(t - at(outB), SP.mask);
  el.style.clipPath = `inset(-10% ${((1 - e) * 100).toFixed(2)}% -10% ${Math.min(100, x * 106).toFixed(2)}%)`;
  el.style.opacity = e < 0.001 || x > 0.999 ? "0" : "1";
}
// Draw an SVG path on: k = 0..1 of its length.
function drawOn(path, k, len = path.__len || (path.__len = path.getTotalLength())) {
  // Fully drawn: no dash at all. A dash as long as the path still renders its corners differently depending on
  // earlier frames (an impure seek), and it would hide a dotted style the path should end on.
  path.style.strokeDasharray = k >= 1 ? "none" : `${len} ${len}`;
  path.style.strokeDashoffset = k >= 1 ? "0" : (len * (1 - clamp(k))).toFixed(2);
  // A zero-length dash still paints its round cap as a dot: hide the path until it starts.
  path.style.visibility = k <= 0.0005 ? "hidden" : "visible";
}
// Count up with tabular figures.
const fmtInt = (v) => Math.round(v).toLocaleString("en-US");

// ---- sound cues: the score is built from these ----------------------------------------
const EVENTS = [];
const cue = (b, type, gain = 1) => EVENTS.push({ t: at(b), type, gain });

// ---- atmosphere --------------------------------------------------------------------
let GRAIN = [];
function grainTiles(n = 6, size = 384) {
  const out = [];
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < n; k++) { const c = document.createElement("canvas"); c.width = c.height = size; const x = c.getContext("2d"), d = x.createImageData(size, size); for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } x.putImageData(d, 0, 0); out.push(`url(${c.toDataURL("image/png")})`); }
  return out;
}
// Grain offset per 24 fps frame, like film.
function grain(el, t, opacity) {
  const f = Math.floor(t * 24);
  el.style.backgroundImage = GRAIN[f % GRAIN.length];
  el.style.backgroundPosition = `${(f * 137) % 384}px ${(f * 251) % 384}px`;
  el.style.opacity = opacity;
}

// ---- QA hook: every readable text node on screen, with its box and size -----------------
function effOpacity(el) {
  let o = 1;
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return 0;
    o *= parseFloat(cs.opacity);
    if (o < 0.02) return 0;
  }
  return o;
}
function clipRects(el) {
  const out = [];
  for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.overflow !== "visible" || cs.clipPath !== "none") out.push(e.getBoundingClientRect());
  }
  return out;
}
function QA_TEXT() {
  const W = window.FILM.width, H = window.FILM.height, out = [];
  const root = document.getElementById("stage") || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), words = new Set();
  for (let n; (n = walker.nextNode());) {
    let target = n, el = n.parentElement, o;
    if (el.classList.contains("ltr")) {
      // Per-letter reveals: report the whole word once, at its least visible letter.
      const m = el.closest(".m"); if (words.has(m)) continue; words.add(m);
      target = m; o = Math.min(...[...m.querySelectorAll(".ltr")].map(effOpacity));
    } else o = effOpacity(el);
    const s = target.textContent.trim(); if (!s || o < 0.05) continue;
    const r = document.createRange(); r.selectNodeContents(target);
    const rects = [...r.getClientRects()].filter((q) => q.width > 0 && q.height > 0); if (!rects.length) continue;
    const clips = clipRects(el);
    let area = 0, vis = 0, L = 1e9, T = 1e9, R = -1e9, B = -1e9, hMin = 1e9;
    for (const q of rects) {
      area += q.width * q.height; hMin = Math.min(hMin, q.height);
      let l = Math.max(q.left, 0), t = Math.max(q.top, 0), rr = Math.min(q.right, W), b = Math.min(q.bottom, H);
      for (const c of clips) { l = Math.max(l, c.left); t = Math.max(t, c.top); rr = Math.min(rr, c.right); b = Math.min(b, c.bottom); }
      if (rr > l && b > t) vis += (rr - l) * (b - t);
      L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom);
    }
    const qa = el.closest("[data-qa]");
    out.push({ text: s, id: qa ? qa.dataset.qa : null, box: [L, T, R, B].map((v) => +v.toFixed(1)), visible: +(vis / area).toFixed(3), opacity: +o.toFixed(3), linePx: +hMin.toFixed(1) });
  }
  return out;
}

// ---- boot ----------------------------------------------------------------------
const Film = {
  start(cfg) {
    BPM = cfg.bpm; BEAT = 60 / BPM;
    window.DURATION = cfg.beats * BEAT;
    window.FILM = { bpm: cfg.bpm, beats: cfg.beats, width: cfg.width, height: cfg.height, duration: window.DURATION };
    window.EVENTS = EVENTS;
    window.QA_TEXT = QA_TEXT;
    const q = new URLSearchParams(location.search);
    const imgs = [...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }));
    Promise.all((cfg.fonts || []).map((f) => document.fonts.load(f)))
      .then(() => document.fonts.ready).then(() => Promise.all(imgs))
      .then(async () => {
        GRAIN = grainTiles();
        const scene = await cfg.build(q);
        if (scene.cues) scene.cues();
        EVENTS.sort((a, b) => a.t - b.t);
        window.ARR = scene.arr || {};
        window.seek = (t) => scene.seek(clamp(t, 0, window.DURATION));
        window.SHUTTER = scene.shutter || (() => 0.5);
        window.seek(q.has("b") ? at(parseFloat(q.get("b"))) : q.has("t") ? parseFloat(q.get("t")) : 0);
        window.READY = true;
        if (q.has("play")) play(cfg);
      })
      .catch((e) => { console.error(e); document.title = "ERR " + e.message; window.READY_ERROR = String(e && e.stack || e); });
  },
};
function play(cfg) {
  // Size body to the film before scaling: pages that set body { overflow: hidden } would otherwise clip the scaled film at the viewport width.
  const fit = () => {
    const k = Math.min(innerWidth / cfg.width, innerHeight / cfg.height);
    const x = (innerWidth - cfg.width * k) / 2, y = (innerHeight - cfg.height * k) / 2;
    Object.assign(document.body.style, { width: cfg.width + "px", height: cfg.height + "px", transformOrigin: "0 0", transform: `translate(${x}px, ${y}px) scale(${k})` });
    document.documentElement.style.background = "#000";
  };
  fit(); addEventListener("resize", fit);
  const audio = cfg.audio ? new Audio(cfg.audio) : null;
  let t0 = null, paused = true, tp = 0;
  const now = () => audio ? audio.currentTime : paused ? tp : (performance.now() - t0) / 1000;
  const toggle = () => {
    if (now() >= window.DURATION - 0.05) { if (audio) audio.currentTime = 0; tp = 0; }
    if (audio) { audio.paused ? audio.play().catch(() => {}) : audio.pause(); return; }
    if (paused) { t0 = performance.now() - tp * 1000; paused = false; } else { tp = now(); paused = true; }
  };
  addEventListener("click", toggle);
  addEventListener("keydown", (e) => { if (e.code === "Space") { e.preventDefault(); toggle(); } });
  const tick = () => { window.seek(Math.min(now(), window.DURATION)); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
