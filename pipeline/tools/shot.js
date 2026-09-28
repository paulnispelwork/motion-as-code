// Screenshot a web page, a local HTML/SVG file or an image, for research and asset checks.
//   node tools/shot.js <url|file> <out.png> [--w 1440] [--h 900] [--full] [--dsf 1] [--bg #fff] [--wait 1500] [--hide "css,selectors"] [--clip x,y,w,h] [--scroll y]
// Local SVGs are shown centred on --bg, so a logo can be checked on light and dark grounds.
const path = require("path");
const fs = require("fs");
const { launch, args } = require("../lib");

(async () => {
  const a = args(), [src, out] = a._;
  if (!src || !out) { console.error("usage: shot.js <url|file> <out.png> [--w --h --full --dsf --bg --wait]"); process.exit(2); }
  const w = +(a.w || 1440), h = +(a.h || 900);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +(a.dsf || 1) });
  if (/^https?:/.test(src)) {
    await page.goto(src, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  } else if (/\.(svg|png|jpe?g|webp|gif)$/i.test(src)) {
    const ext = path.extname(src).slice(1).toLowerCase(), mime = ext === "svg" ? "image/svg+xml" : "image/" + ext.replace("jpg", "jpeg");
    const url = `data:${mime};base64,` + fs.readFileSync(src).toString("base64");  // about:blank cannot load file:// images
    await page.setContent(`<body style="margin:0;height:100vh;display:grid;place-items:center;background:${a.bg || "#fff"}">
      <img src="${url}" style="width:80vw;max-height:80vh;object-fit:contain"></body>`);
  } else {
    await page.goto("file://" + path.resolve(src));
  }
  await page.waitForTimeout(+(a.wait || 1500));
  // Hide cookie banners, chat widgets and the like before the shot.
  if (a.hide) await page.addStyleTag({ content: `${a.hide} { display: none !important; }` });
  if (a.scroll) { await page.evaluate((y) => window.scrollTo(0, y), +a.scroll); await page.waitForTimeout(800); }
  const clip = a.clip ? (([x, y, width, height]) => ({ x, y, width, height }))(a.clip.split(",").map(Number)) : undefined;
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out, fullPage: !!a.full, clip });
  await browser.close();
  console.log(out);
})();
