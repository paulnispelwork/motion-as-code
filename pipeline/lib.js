// Shared helpers for the pipeline's Node tools: argument parsing, browser launch, page open.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

// CHROME if set, else the newest full Chromium in the Playwright cache (npx playwright install chromium).
function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME || process.env.USERPROFILE,
    { darwin: "Library/Caches/ms-playwright", win32: "AppData/Local/ms-playwright" }[process.platform] || ".cache/ms-playwright");
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split("-")[1] - +a.split("-")[1]) : [];
  const bins = ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win64/chrome.exe", "chrome-win/chrome.exe"];
  for (const d of dirs) for (const b of bins) { const p = path.join(cache, d, b); if (fs.existsSync(p)) return p; }
  throw new Error("No Playwright Chromium found: run `npx playwright install chromium`, or set CHROME");
}

// --key value pairs into an object; bare --flag becomes true.
function args(argv = process.argv.slice(2)) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2), v = argv[i + 1];
    if (v == null || v.startsWith("--")) o[k] = true; else { o[k] = v; i++; }
  }
  return o;
}

// "film.html?clip=a" relative to cwd, into a file:// URL that keeps the query.
function pageUrl(page) {
  const [file, query] = page.split("?");
  return "file://" + path.resolve(file) + (query ? "?" + query : "");
}

async function launch(opts = {}) {
  const flags = ["--allow-file-access-from-files", "--force-color-profile=srgb", "--disable-gpu-vsync", "--hide-scrollbars"];
  if (opts.gpu) flags.push(...(process.platform === "darwin" ? ["--use-angle=metal"] : []), "--enable-gpu", "--ignore-gpu-blocklist");
  return chromium.launch({ executablePath: chromePath(), args: flags });
}

// Frame size from the page's <meta name="film-size" content="1080x1920">, so layout is measured at the real size.
function filmSize(page) {
  const html = fs.readFileSync(path.resolve(page.split("?")[0]), "utf8");
  const m = html.match(/<meta name="film-size" content="(\d+)x(\d+)"/);
  return m ? { w: +m[1], h: +m[2] } : { w: 1920, h: 1080 };
}

// Open a film page at its own size and wait for READY. Collects page errors into page.__errors.
async function openFilm(browser, page, { dsf = 1 } = {}) {
  const { w, h } = filmSize(page);
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +dsf });
  p.__errors = [];
  p.on("pageerror", (e) => p.__errors.push("PAGEERR " + e.message));
  p.on("console", (m) => m.type() === "error" && p.__errors.push("CONSOLE " + m.text()));
  p.on("requestfailed", (r) => p.__errors.push("REQFAIL " + r.url()));
  await p.goto(pageUrl(page));
  await p.waitForFunction("window.READY === true || !!window.READY_ERROR", null, { timeout: 30000 });
  const err = await p.evaluate(() => window.READY_ERROR || null);
  if (err) throw new Error("Film failed to boot: " + err);
  const film = await p.evaluate(() => window.FILM);
  if (film.width !== w || film.height !== h) throw new Error(`film-size meta ${w}x${h} does not match Film.start ${film.width}x${film.height}`);
  return { p, film };
}

module.exports = { args, launch, openFilm, pageUrl, chromePath, filmSize };
