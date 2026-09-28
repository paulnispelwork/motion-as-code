// Reusable animation mechanics. No look: colours, type, layout and copy stay in each project.
// Needs engine.js (step, track, at, SP, clamp, lerp, ease, drawOn). Each was proven in a delivered film.

const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, parent) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
const rectOf = (el) => { const r = el.getBoundingClientRect(); return { L: r.left, R: r.right, T: r.top, B: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; };
// Union of word masks (the .m parents of splitMask words).
const unionOf = (words) => { const rs = words.map((w) => rectOf(w.parentNode)); return { L: Math.min(...rs.map((r) => r.L)), R: Math.max(...rs.map((r) => r.R)), T: Math.min(...rs.map((r) => r.T)), B: Math.max(...rs.map((r) => r.B)) }; };

// ---- one morphing shape -------------------------------------------------------------------
// A single rectangle whose edges, radius and fill retarget over time: highlighter -> full-frame flood ->
// card -> stamp -> highlighter. states: [{ b, box: {L,R,T,B}, r, p?, pe?: {L,R,T,B} }]; p is the preset
// for the move INTO that state, pe overrides it per edge (LIQUID pours left to right).
const LIQUID = { L: SP.lag, R: SP.lead };
function shapeTrack(states) {
  const edge = (e) => track(states.map((s) => [s.b, s.box[e], (s.pe && s.pe[e]) || s.p]));
  const E = { L: edge("L"), R: edge("R"), T: edge("T"), B: edge("B"), r: track(states.map((s) => [s.b, s.r || 0, s.p])) };
  return (t) => ({ L: E.L(t), R: E.R(t), T: E.T(t), B: E.B(t), r: E.r(t) });
}
// Fill colour as a track too; cut between very different fills with SP.cut (blending them looks muddy).
function placeShape(el, s, fill) {
  const w = Math.max(0, s.R - s.L), h = Math.max(0, s.B - s.T);
  Object.assign(el.style, { position: "absolute", left: `${s.L.toFixed(2)}px`, top: `${s.T.toFixed(2)}px`, width: `${w.toFixed(2)}px`, height: `${h.toFixed(2)}px`,
    borderRadius: `${Math.max(0, Math.min(s.r, w / 2, h / 2)).toFixed(2)}px`, background: fill, visibility: w < 0.5 || h < 0.5 ? "hidden" : "visible" });
}
// Highlighter box around words: tight on the left (else it bleeds into the previous word), a little air on the right.
const hlBox = (r, fontPx, padL = 4, padR = 14) => ({ L: r.L - padL, R: r.R + padR, T: r.T + 0.2 * fontPx, B: r.B - 0.12 * fontPx });
const hlStart = (box) => ({ L: box.L, R: box.L, T: box.T, B: box.B });
// Text turns ink-coloured exactly where the highlighter is behind it. px/py: highlighter right/bottom
// relative to the word's own left/top; pass -1e4 to switch it off.
function inkBehind(w, px, py, base, ink) {
  Object.assign(w.style, { color: "transparent", webkitBackgroundClip: "text", backgroundClip: "text", backgroundColor: base,
    backgroundImage: `linear-gradient(${ink}, ${ink})`, backgroundRepeat: "no-repeat", backgroundPosition: "0 0",
    backgroundSize: `${Math.max(0, px).toFixed(1)}px ${Math.max(0, py).toFixed(1)}px` });
}

// ---- floods and flights ---------------------------------------------------------------------
// A full-frame layer opening as a circle from a focal point (the moment of proof). Returns progress 0..1.
function flood(el, t, b, [x, y], { p = SP.snap, radius = 2400 } = {}) {
  const e = step(t - at(b), p), R = e * radius;
  el.style.clipPath = `circle(${R.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`;
  el.style.display = R > 0.5 ? "" : "none";
  return e;
}
// A point that springs from A to B starting at beat b: (t) => [x, y].
function flight(A, B, b, p = SP.base) { const X = track([[0, A[0]], [b, B[0], p]]), Y = track([[0, A[1]], [b, B[1], p]]); return (t) => [X(t), Y(t)]; }
// Position along an SVG path at k = 0..1 (for a pen dot riding a drawn line).
function alongPath(path, k) { const L = path.__len || (path.__len = path.getTotalLength()); const q = path.getPointAtLength(L * clamp(k)); return [q.x, q.y]; }
// A travelling segment of a path: the tail follows the head, so it reads as a moving line, not a growing one.
function comet(path, head, tail) { const L = path.__len || (path.__len = path.getTotalLength()), a = clamp(tail) * L, b = clamp(head) * L; path.style.strokeDasharray = `0 ${a.toFixed(1)} ${Math.max(0, b - a).toFixed(1)} ${L}`; }

// ---- logos ----------------------------------------------------------------------------------
// A logo that draws itself: a centreline stroke masks the real filled mark, so the last frame is the exact logo.
// spec: { viewBox, mark (filled path d), line (centreline d, traced by hand once per brand), strokeWidth (covers the
// band plus ~40%), word: [path d, ...] (optional), wordClipX (x left of which the word hides, for slide-outs) }.
// For logos that are not one line, use line = a sweep path across the mark (a wipe), or skip draw() and use word().
let LOGO_N = 0;
function drawableLogo(spec, { color = "#000", tip = "#F3B545", tipR = 2 } = {}) {
  const n = ++LOGO_N;
  const svg = svgEl("svg", { viewBox: spec.viewBox, overflow: "visible" });
  const defs = svgEl("defs", {}, svg);
  const m = svgEl("mask", { id: `dl${n}`, maskUnits: "userSpaceOnUse", x: -1e3, y: -1e3, width: 3e3, height: 3e3 }, defs);
  const line = svgEl("path", { d: spec.line, fill: "none", stroke: "#fff", "stroke-width": spec.strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round" }, m);
  const mark = svgEl("path", { d: spec.mark, fill: color, mask: `url(#dl${n})` }, svg);
  let letters = [];
  if (spec.word) {
    const clip = svgEl("clipPath", { id: `dc${n}` }, defs);
    svgEl("rect", { x: spec.wordClipX, y: -1e3, width: 3e3, height: 3e3 }, clip);
    const g = svgEl("g", { "clip-path": `url(#dc${n})` }, svg);
    letters = spec.word.map((d) => svgEl("path", { d, fill: color }, g));
  }
  const pen = svgEl("circle", { r: tipR, fill: tip, opacity: 0 }, svg);
  return {
    el: svg, mark, letters, line,
    draw(k) {
      drawOn(line, k);
      if (k > 0.001 && k < 0.999) { const [x, y] = alongPath(line, k); pen.setAttribute("cx", x.toFixed(3)); pen.setAttribute("cy", y.toFixed(3)); pen.setAttribute("opacity", 1); }
      else pen.setAttribute("opacity", 0);
    },
    // Letters slide out from behind the mark, one after another; fn(i) -> 0..1.
    word(fn, dist = 12) { letters.forEach((l, i) => { const e = clamp(fn(i)); l.setAttribute("transform", `translate(${(-(1 - e) * (dist + i * dist / 2)).toFixed(3)} 0)`); l.setAttribute("opacity", clamp(e * 3).toFixed(3)); }); },
    color(c) { mark.setAttribute("fill", c); letters.forEach((l) => l.setAttribute("fill", c)); },
    // Screen position of a point in logo units, given the element's box (for handing a DOM pen over to the SVG pen).
    toScreen([x, y], box) { const [vx, vy, vw, vh] = spec.viewBox.split(/\s+/).map(Number), s = (box.R - box.L) / vw; return [box.L + (x - vx) * s, box.T + (y - vy) * s]; },
    start() { const p = line.getPointAtLength(0); return [p.x, p.y]; },
  };
}

// ---- small UI motions -------------------------------------------------------------------------
// Pop in: fade quickly, scale up from `from`.
function popIn(el, e, from = 0.4) { el.style.opacity = clamp(e * 3).toFixed(4); el.style.visibility = e < 0.002 ? "hidden" : "visible"; el.style.transform = `scale(${(from + (1 - from) * e).toFixed(4)})`; }
// Count up with an optional suffix once finished ("2,600+").
function countUp(t, b0, b1, value, suffix = "") { const k = ease(span(t, b0, b1)); return Math.round(value * k).toLocaleString("en-US") + (k >= 1 ? suffix : ""); }
// Typing: the visible prefix of text at chars-per-second from beat b.
function typed(text, t, b, cps = 22) { return text.slice(0, clamp(Math.floor((t - at(b)) * cps), 0, text.length)); }
// Card flip about Y: out at bOut (0 -> 90 deg), the replacement in at bIn (-90 -> 0 deg).
function flipOut(el, t, bOut) { const f = step(t - at(bOut), SP.fast); el.style.transform = `perspective(1400px) rotateY(${(f * 90).toFixed(2)}deg)`; return f; }
function flipIn(el, t, bIn) { const f = step(t - at(bIn), SP.base); el.style.transform = `perspective(1400px) rotateY(${((1 - f) * -90).toFixed(2)}deg)`; return f; }
// Grow a card out of a point (a map pin) into its layout position; transform-origin 0 0.
function growFrom(el, t, b, [px, py], box) { const k = step(t - at(b), SP.base); el.style.transformOrigin = "0 0"; el.style.transform = `translate(${lerp(px - box.L, 0, k).toFixed(1)}px, ${lerp(py - box.T, 0, k).toFixed(1)}px) scale(${(0.08 + 0.92 * k).toFixed(4)})`; return k; }
// Screen shake/pulse after a hit at beat b.
const punch = (t, b, amp = 0.02) => (t > at(b) ? amp * Math.exp(-(t - at(b)) / 0.2) * Math.cos((t - at(b)) * 20) : 0);
// Exposure flash after a hit (drive a screen-blended radial layer); 0..1.
const flash = (t, b, decay = 0.12) => (t > at(b) ? Math.exp(-(t - at(b)) / decay) : 0);

// ---- 3D camera and routes (canvas) ------------------------------------------------------------------
const v3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; }, mix: (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)] };
// Perspective projector: p -> [x, y, F/z] or null behind the camera. Scale sizes with min(cap, k * F/z), never linearly.
function camera(pos, look, W, H, fov = 50) {
  const f = v3.norm(v3.sub(look, pos)), r = v3.norm(v3.cross(f, [0, 1, 0])), u = v3.cross(r, f), F = (H / 2) / Math.tan((fov * Math.PI) / 360);
  return (p) => { const d = v3.sub(p, pos), z = v3.dot(d, f); if (z < 0.3) return null; return [W / 2 + (F * v3.dot(d, r)) / z, H / 2 - (F * v3.dot(d, u)) / z, F / z]; };
}
// Catmull-Rom through points: k 0..1 -> point.
function curve(pts) {
  const seg = pts.length - 1;
  return (k) => { const s = clamp(k) * seg, i = Math.min(seg - 1, Math.floor(s)), u = s - i, p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(seg, i + 2)];
    return [0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u * u + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u * u * u)); };
}
// Chase heading: blend the route's local turn (over a wide window) with a steady travel direction,
// or the camera whips at sharp turns.
function chaseHeading(R, k, travel = [1, 0, 0], localWeight = 0.3) { const a = R(Math.max(0, k - 0.1)), b = R(Math.min(1, k + 0.15)); return v3.norm(v3.mix(v3.norm(travel), v3.norm([b[0] - a[0] + 1e-6, 0, b[2] - a[2]]), localWeight)); }

// ---- dot maps (from tools/dotmap.py) ---------------------------------------------------------------
async function loadDots(url) { return (await fetch(url)).json(); }
// Source-image pixel to map units, for pins placed from the source illustration.
const dotUnits = (map, [x, y]) => [(x - map.src[0]) / map.src[2], (y - map.src[1]) / map.src[2]];
function drawDots(ctx, dots, proj, r, colorFn) {
  for (let i = 0; i < dots.length; i++) {
    const [x, y] = dots[i], p = proj(x, y); if (!p) continue;
    const c = colorFn(i, x, y); if (!c) continue;
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p[0], p[1], r * p[2], 0, Math.PI * 2); ctx.fill();
  }
}

// ---- hops and drops (less proven: use sparingly) -----------------------------------------------------
// A ball hopping between landing points: keys [{ b, p: [x, y], h? }], one landing per key. Each hop is a
// parabola (x linear in time, y quadratic), lifted h px above the chord's midpoint (default h0).
// Returns (t) => { x, y, vy, air, since, i }: since = seconds since the latest landing (negative before the first).
function hops(keys, h0 = 180) {
  return (t) => {
    const K0 = keys[0];
    if (t <= at(K0.b)) return { x: K0.p[0], y: K0.p[1], vy: 0, air: false, since: -1, i: 0 };
    for (let i = 1; i < keys.length; i++) {
      const A = keys[i - 1], B = keys[i];
      if (t < at(B.b)) {
        const T = at(B.b) - at(A.b), u = (t - at(A.b)) / T, h = B.h == null ? h0 : B.h;
        return { x: lerp(A.p[0], B.p[0], u), y: lerp(A.p[1], B.p[1], u) - 4 * h * u * (1 - u),
          vy: (B.p[1] - A.p[1] - 4 * h * (1 - 2 * u)) / T, air: true, since: t - at(A.b), i: i - 1 };
      }
    }
    const L = keys[keys.length - 1];
    return { x: L.p[0], y: L.p[1], vy: 0, air: false, since: t - at(L.b), i: keys.length - 1 };
  };
}
// Squash and stretch for a hops() state: [sx, sy]. A damped squash right after each landing (and take-off),
// a stretch along fast vertical motion in the air.
function squash(s, amt = 0.28) {
  const d = s.since;
  const q = d >= 0 && d < 0.6 ? amt * Math.exp(-d / 0.075) * Math.cos(d * 30) : 0;
  const k = s.air ? Math.min(0.16, Math.abs(s.vy) / 11000) : 0;
  return [1 + q - k * 0.6, 1 - q + k];
}
// A drop under gravity from y0 to rest at y1 from beat b, with restitution bounces. Screen px, down is +.
// dropLand(...) gives the seconds after b of the first impact (for the sound cue).
function drop(t, b, y0, y1, { g = 5200, e = 0.32, n = 3 } = {}) {
  let dt = t - at(b); if (dt <= 0) return y0;
  let v = Math.sqrt(2 * g * Math.max(0, y1 - y0)); const tf = v / g;
  if (dt < tf) return y0 + 0.5 * g * dt * dt;
  dt -= tf; v *= e;
  for (let k = 0; k < n; k++) { const T = (2 * v) / g; if (dt < T) return y1 - (v * dt - 0.5 * g * dt * dt); dt -= T; v *= e; }
  return y1;
}
const dropLand = (y0, y1, g = 5200) => Math.sqrt((2 * Math.max(0, y1 - y0)) / g);
