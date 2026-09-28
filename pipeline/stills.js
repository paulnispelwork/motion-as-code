// Render review stills from a film page.
//   node stills.js --page film.html --out review/sheet --beats 0:72:0.5
//   node stills.js --page film.html --out review/strip --beats 11.5:12.5:0.1
//   node stills.js --page film.html --out review/pick --t 3.2,7.75 [--dsf 1] [--png]
// Files are named by beat (b012.500.jpg) or time (t0003.200.jpg).
const fs = require("fs");
const { args, launch, openFilm } = require("./lib");

(async () => {
  const a = args();
  fs.mkdirSync(a.out, { recursive: true });
  const browser = await launch({ gpu: !!a.gpu });
  const { p, film } = await openFilm(browser, a.page, { dsf: a.dsf || 1 });
  const beat = 60 / film.bpm, list = [];
  if (a.beats) { const [b0, b1, st] = a.beats.split(":").map(Number); for (let b = b0; b <= b1 + 1e-9; b += st) list.push({ t: b * beat, name: `b${b.toFixed(3).padStart(7, "0")}` }); }
  if (a.t) for (const t of String(a.t).split(",").map(Number)) list.push({ t, name: `t${t.toFixed(3).padStart(8, "0")}` });
  for (const { t, name } of list) {
    await p.evaluate((t) => window.seek(t), Math.min(t, film.duration));
    await p.screenshot({ path: `${a.out}/${name}.${a.png ? "png" : "jpg"}`, type: a.png ? "png" : "jpeg", ...(a.png ? {} : { quality: 88 }) });
  }
  if (p.__errors.length) console.log(p.__errors.join("\n"));
  console.log(`${list.length} stills -> ${a.out}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
