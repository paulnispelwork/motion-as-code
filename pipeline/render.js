// Render a film page to video chunks: supersampled capture, sub-frame motion blur, BT.709 tagged H.264.
//   node render.js --page film.html --out out/film [--fps 60] [--sub 4] [--dsf 1.5] [--chunk 240]
//                  [--from 0] [--to N] [--crf 10] [--q 92] [--threads 3] [--gpu]
//
// Chunks land in <out>/chunks/c_000000.mp4 (one fresh browser each) and are skipped on a rerun when
// they already hold the right frame count and colour tags, so a crash loses one chunk at most.
// Each output frame is S stills over the shutter (window.SHUTTER(t), default 0.5 of a frame),
// averaged once per output frame (split/select/mix, not tmix). Captured at dsf x the film size,
// downscaled with Lanczos. JPEG capture only: PNG is ~15x slower.
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { args, launch, openFilm } = require("./lib");

const TAGS = ["-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];

function probe(file) {
  try {
    const o = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets,color_primaries,color_space", "-of", "json", file], { stdio: ["ignore", "pipe", "ignore"] }).toString());
    const s = o.streams[0]; return { frames: +s.nb_read_packets, tagged: s.color_primaries === "bt709" && s.color_space === "bt709" };
  } catch { return { frames: 0, tagged: false }; }
}

async function renderChunk(a, film, f0, f1, out) {
  const FPS = +(a.fps || 60), S = +(a.sub || 4), DSF = +(a.dsf || 1.5), Q = +(a.q || 92), T = String(a.threads || 3);
  const browser = await launch({ gpu: !!a.gpu });
  const { p } = await openFilm(browser, a.page, { dsf: DSF });
  const W = film.width, H = film.height;
  const split = [...Array(S).keys()];
  // --sub 1 (pages that draw their own motion blur): ffmpeg's mix needs 2+ inputs, so skip the blend.
  const blend = S === 1 ? "[0:v]" : `[0:v]split=${S}${split.map((k) => `[a${k}]`).join("")};` +
    split.map((k) => `[a${k}]select='eq(mod(n\\,${S})\\,${k})',setpts=N/(${FPS}*TB)[b${k}]`).join(";") + ";" +
    `${split.map((k) => `[b${k}]`).join("")}mix=inputs=${S}:duration=shortest,`;
  const fc = blend +
    `scale=${W}:${H}:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv,format=yuv420p[v]`;
  const tmp = out.replace(/\.mp4$/, ".part.mp4");
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS * S), "-i", "-",
    "-filter_complex", fc, "-map", "[v]", "-filter_threads", T, "-r", String(FPS),
    "-c:v", "libx264", "-threads", T, "-preset", "slow", "-crf", String(a.crf || 10), "-profile:v", "high", ...TAGS, "-movflags", "+faststart", tmp],
    { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((r) => ff.on("close", r));
  for (let f = f0; f < f1; f++) {
    const sh = await p.evaluate((t) => window.SHUTTER(t), f / FPS);
    for (let s = 0; s < S; s++) {
      const t = (f + ((s - (S - 1) / 2) / S) * sh) / FPS;
      await p.evaluate((t) => window.seek(Math.max(0, t)), t);
      const buf = await p.screenshot({ type: "jpeg", quality: Q });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    }
  }
  ff.stdin.end();
  const code = await done;
  const errs = p.__errors;
  await browser.close();
  if (errs.length) throw new Error(errs.join("\n"));
  if (code !== 0) throw new Error("ffmpeg exited " + code);
  const pr = probe(tmp);
  if (pr.frames !== f1 - f0 || !pr.tagged) throw new Error(`chunk ${f0}: ${pr.frames}/${f1 - f0} frames, tagged=${pr.tagged}`);
  fs.renameSync(tmp, out);
}

(async () => {
  const a = args();
  const FPS = +(a.fps || 60), CH = +(a.chunk || 240);
  const dir = path.join(a.out, "chunks");
  fs.mkdirSync(dir, { recursive: true });
  const browser = await launch();
  const { film } = await openFilm(browser, a.page);
  await browser.close();
  const total = Math.round(film.duration * FPS);
  // Chunks from an older version of the page are stale: fingerprint the page's folder, the engine and
  // the render settings, and clear the chunks when any of them changed. Resume only ever continues the same build.
  const crypto = require("crypto"), src = path.dirname(path.resolve(a.page.split("?")[0]));
  const hash = crypto.createHash("md5");
  for (const dir of [src, path.join(src, "../brand"), __dirname]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) { const p = path.join(dir, f); if (fs.statSync(p).isFile() && /\.(html|js|css|json|svg|woff2|png|jpg)$/.test(f)) hash.update(f).update(fs.readFileSync(p)); }
  }
  hash.update(JSON.stringify([a.page, a.fps, a.sub, a.dsf, a.chunk, a.crf, a.q]));
  const fp = hash.digest("hex"), fpFile = path.join(dir, ".fingerprint");
  if (fs.existsSync(fpFile) && fs.readFileSync(fpFile, "utf8") !== fp) {
    for (const f of fs.readdirSync(dir)) if (/^c_\d+(\.part)?\.mp4$/.test(f)) fs.unlinkSync(path.join(dir, f));
    console.log("page or settings changed since the last render: cleared old chunks");
  }
  fs.writeFileSync(fpFile, fp);
  const from = +(a.from || 0), to = Math.min(total, +(a.to || total));
  const t0 = Date.now(); let doneFrames = 0;
  const log = (s) => { console.log(s); fs.appendFileSync(path.join(a.out, "render.log"), s + "\n"); };
  log(`${a.page}: ${film.width}x${film.height}, ${total} frames at ${FPS} fps, chunks of ${CH}, rendering ${from}-${to}`);
  for (let f0 = Math.floor(from / CH) * CH; f0 < to; f0 += CH) {
    const f1 = Math.min(f0 + CH, total), out = path.join(dir, `c_${String(f0).padStart(6, "0")}.mp4`);
    const pr = probe(out);
    if (pr.frames === f1 - f0 && pr.tagged) { log(`skip ${path.basename(out)} (complete)`); continue; }
    const c0 = Date.now();
    await renderChunk(a, film, f0, f1, out);
    doneFrames += f1 - f0;
    const rate = (Date.now() - t0) / 1000 / doneFrames, left = Math.max(0, to - f1);
    log(`${path.basename(out)} ${f1 - f0} frames in ${((Date.now() - c0) / 1000).toFixed(0)} s, ~${((left * rate) / 60).toFixed(1)} min left`);
  }
  const list = fs.readdirSync(dir).filter((f) => /^c_\d+\.mp4$/.test(f)).sort().map((f) => `file '${path.resolve(dir, f)}'`).join("\n");
  fs.writeFileSync(path.join(a.out, "chunks.txt"), list + "\n");
  log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
})().catch((e) => { console.error(e); process.exit(1); });
