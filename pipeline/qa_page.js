// Automated QA on a film page, before any render. Exit code 1 on any FAIL.
//   node qa_page.js --page reels.html?clip=a [--safe 250,60,350,60] [--minline 40] [--step 0.0667] [--report qa.json]
//
// Samples the page over its whole duration and checks, for every settled text line
// (fully unmasked and at full opacity):
//   FAIL  page errors (JS errors, failed requests, console errors)
//   FAIL  text outside the frame, or outside the safe area (margins top,right,bottom,left in px)
//   FAIL  text smaller than --minline px line height (small text in motion is never read)
//   FAIL  a headline (element with data-qa) on screen too briefly to read: 0.6 s + 0.22 s per word
//   FAIL  seek(t) not pure: at every sample, text boxes differ between the sequential pass and a fresh seek;
//         and at 4 samples the same t renders differently depending on the previous t (more than 150 px differ;
//         fewer is Skia raster noise on first paint of a path, reported as a warning with both renders saved)
//   WARN  two headlines overlapping, or text left partly clipped by its mask for more than 0.8 s
const fs = require("fs");
const crypto = require("crypto");
const { args, launch, openFilm } = require("./lib");

const PURE_TOL = 150;
let browserRef = null;
// Pixels whose largest channel difference exceeds thr, decoded in a scratch page (no image deps in Node).
async function diffPixels(png1, png2, thr) {
  const q = await browserRef.newPage();
  const n = await q.evaluate(async ([a, b, thr]) => {
    const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    const px = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
    const da = px(A), db = px(B); let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > thr) n++;
    return n;
  }, ["data:image/png;base64," + png1.toString("base64"), "data:image/png;base64," + png2.toString("base64"), thr]);
  await q.close();
  return n;
}

(async () => {
  const a = args();
  const browser = await launch({ gpu: !!a.gpu }); browserRef = browser;
  const { p, film } = await openFilm(browser, a.page);
  const W = film.width, H = film.height, D = film.duration;
  const [sT, sR, sB, sL] = (a.safe || (H > W ? "250,60,350,60" : "54,96,54,96")).split(",").map(Number);
  const minLine = +(a.minline || (H > W ? 40 : 30)), dt = +(a.step || 1 / 15);
  const fails = [], warns = [], seen = new Map(), partial = new Map(), overlapSeen = new Set();
  const once = (list, key, msg) => { if (!list.some((x) => x.key === key)) list.push({ key, msg }); };
  const ids = new Map(), prevBox = new Map();
  for (let t = 0; t <= D + 1e-9; t += dt) {
    await p.evaluate((t) => window.seek(t), t);
    const items = await p.evaluate(() => window.QA_TEXT());
    // Layout purity at every sample: the same t seeked fresh (from 0, as a still or a parallel chunk would be)
    // must place every text where the sequential pass did. Catches state that sticks between frames, e.g. a
    // spring overshooting a size below zero (invalid CSS, so the previous frame's value stays).
    const fresh = await p.evaluate((t) => { window.seek(0); window.seek(t); return window.QA_TEXT(); }, t);
    const key = (it) => (it.id || "") + "|" + it.text;
    // Repeated texts (the same word twice in a headline, identical chat bubbles) are matched in DOM order.
    const fm = new Map(), nth = new Map();
    for (const it of fresh) { if (!fm.has(key(it))) fm.set(key(it), []); fm.get(key(it)).push(it); }
    for (const it of items) {
      const i = nth.get(key(it)) || 0; nth.set(key(it), i + 1);
      const f = (fm.get(key(it)) || [])[i];
      const moved = f && it.box.some((v, j) => Math.abs(v - f.box[j]) > 1);
      if ((!f && it.opacity > 0.1) || moved || (f && Math.abs(f.opacity - it.opacity) > 0.05))
        once(fails, "purelayout:" + key(it), `seek(${t.toFixed(2)}) is not pure: "${it.text}" ${f ? `at [${it.box}] in sequence, [${f.box}] fresh` : "missing when seeked fresh"}`);
    }
    const settledById = new Map(), partialNow = new Set(), boxNow = new Map();
    for (const it of items) {
      const key = it.id || it.text;
      const [L, T, R, B] = it.box;
      // Still = same box as the previous sample: sizes are judged on text at rest, not mid-animation.
      const pb = prevBox.get(key + "|" + it.text), still = pb && pb.every((v, j) => Math.abs(v - it.box[j]) < 1);
      boxNow.set(key + "|" + it.text, it.box);
      if (it.visible >= 0.9 && it.opacity >= 0.9) {
        if (L < -1 || T < -1 || R > W + 1 || B > H + 1) once(fails, "frame:" + key, `t=${t.toFixed(2)} "${it.text}" (${key}) runs outside the frame [${it.box}]`);
        else if (L < sL || T < sT || R > W - sR || B > H - sB) once(fails, "safe:" + key, `t=${t.toFixed(2)} "${it.text}" (${key}) outside the safe area [${it.box}]`);
        if (still && it.linePx < minLine) once(fails, "small:" + key, `t=${t.toFixed(2)} "${it.text}" (${key}) line height ${it.linePx}px < ${minLine}px`);
        if (it.id) { if (!settledById.has(it.id)) settledById.set(it.id, []); settledById.get(it.id).push(it); }
      }
      // Clipped text: cut by more than 3% for over 0.8 s. Mask reveals pass through in a fraction of that, and glyph
      // overhang past a letter mask is about 1%; a label cut at a card edge was 6%.
      if (it.opacity >= 0.9 && it.visible > 0.2 && it.visible < 0.97) {
        partialNow.add(key); partial.set(key, (partial.get(key) || 0) + dt);
        if (partial.get(key) > 0.8) once(warns, "clip:" + key, `t=${t.toFixed(2)} "${it.text}" (${key}) partly clipped (${Math.round(it.visible * 100)}% visible) for > 0.8 s`);
      }
      if (it.id && !ids.has(it.id)) ids.set(it.id, {});
    }
    for (const k of [...partial.keys()]) if (!partialNow.has(k)) partial.delete(k);
    prevBox.clear(); for (const [k, v] of boxNow) prevBox.set(k, v);
    // A headline counts as read-time only while all of its words are settled.
    for (const [id, list] of settledById) { const w = ids.get(id); w.maxSettled = Math.max(w.maxSettled || 0, list.length); w.frames = w.frames || []; w.frames.push({ t, n: list.length }); }
    // Overlap between different headlines.
    const boxes = [...settledById.entries()].map(([id, l]) => ({ id, L: Math.min(...l.map((x) => x.box[0])), T: Math.min(...l.map((x) => x.box[1])), R: Math.max(...l.map((x) => x.box[2])), B: Math.max(...l.map((x) => x.box[3])) }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], Bx = boxes[j], ix = Math.max(0, Math.min(A.R, Bx.R) - Math.max(A.L, Bx.L)), iy = Math.max(0, Math.min(A.B, Bx.B) - Math.max(A.T, Bx.T));
      const small = Math.min((A.R - A.L) * (A.B - A.T), (Bx.R - Bx.L) * (Bx.B - Bx.T));
      const k = [A.id, Bx.id].sort().join("+");
      if (ix * iy > 0.1 * small && !overlapSeen.has(k)) { overlapSeen.add(k); warns.push({ key: "ov:" + k, msg: `t=${t.toFixed(2)} headlines ${A.id} and ${Bx.id} overlap` }); }
    }
  }
  // Read time per headline.
  const dwell = [];
  for (const [id, w] of ids) {
    if (!w.frames) { once(fails, "never:" + id, `headline ${id} is never fully on screen`); continue; }
    const full = w.frames.filter((f) => f.n >= w.maxSettled).length * dt;
    const words = w.maxSettled, need = 0.6 + 0.22 * words;
    dwell.push({ id, words, seconds: +full.toFixed(2), need: +need.toFixed(2) });
    if (full + 1e-6 < need) fails.push({ key: "dwell:" + id, msg: `headline ${id} (${words} words) fully readable for ${full.toFixed(2)} s, needs ${need.toFixed(2)} s` });
  }
  // Purity: the same t must render identically whatever came before.
  const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");
  for (const k of [0.13, 0.41, 0.66, 0.9]) {
    const t = D * k;
    await p.evaluate((t) => window.seek(t), t); const i1 = await p.screenshot({ type: "png" });
    await p.evaluate((t) => window.seek(t), D - t); await p.evaluate((t) => window.seek(t), 0);
    await p.evaluate((t) => window.seek(t), t); const i2 = await p.screenshot({ type: "png" });
    if (md5(i1) !== md5(i2)) {
      // Skia rasters a path slightly differently the first time it paints it than once it is cached, so a few
      // anti-aliased edge pixels may differ (87 px at two line corners, in one case). Real impurity (a stale
      // state, a wrong digit) changes hundreds of pixels or more. Count pixels off by more than 24 levels.
      const n = await diffPixels(i1, i2, 24);
      let where = "";
      if (a.report) { const base = a.report.replace(/\.json$/, ""); fs.writeFileSync(`${base}.pure-${k}-a.png`, i1); fs.writeFileSync(`${base}.pure-${k}-b.png`, i2); where = ` (renders: ${base}.pure-${k}-a/b.png)`; }
      if (n > PURE_TOL) fails.push({ key: "pure:" + k, msg: `seek(${t.toFixed(2)}) is not pure: ${n} px differ after other seeks${where}` });
      else warns.push({ key: "pure:" + k, msg: `seek(${t.toFixed(2)}): ${n} px raster noise after other seeks (tolerance ${PURE_TOL})${where}` });
    }
  }
  for (const e of p.__errors) once(fails, "err:" + e, e);
  await browser.close();
  const report = { page: a.page, size: `${W}x${H}`, duration: +D.toFixed(3), safe: [sT, sR, sB, sL], minLine, fails: fails.map((f) => f.msg), warns: warns.map((w) => w.msg), dwell };
  if (a.report) fs.writeFileSync(a.report, JSON.stringify(report, null, 1));
  console.log(`QA page ${a.page}: ${fails.length ? "FAIL" : "PASS"} (${fails.length} fails, ${warns.length} warnings)`);
  for (const f of report.fails) console.log("  FAIL " + f);
  for (const w of report.warns) console.log("  WARN " + w);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
