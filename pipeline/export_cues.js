// Export a page's sound cues and arrangement for synth.py.
//   node export_cues.js --page film.html --out cues.json
const fs = require("fs");
const { args, launch, openFilm } = require("./lib");

(async () => {
  const a = args();
  const browser = await launch();
  const { p, film } = await openFilm(browser, a.page);
  const data = await p.evaluate(() => ({ bpm: window.FILM.bpm, beats: window.FILM.beats, duration: window.DURATION, events: window.EVENTS, arr: window.ARR }));
  fs.writeFileSync(a.out, JSON.stringify(data, null, 1));
  console.log(`${a.out}: ${data.events.length} cues, ${data.duration.toFixed(2)} s at ${film.bpm} BPM`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
