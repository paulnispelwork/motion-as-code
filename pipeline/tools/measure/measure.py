"""Run motion.py and peaks.py on rendered films and flag the CRAFT.md self-check floors.

    python measure.py film.mp4 [more.mp4 ...] [--ad] [--json]

--ad    also check the ad-only floors (length 10-12 s, >= 5 hits per 10 s)
--json  print the merged metrics as JSON lines instead of the table

These floors were measured on films that worked. Passing them rules out common failures;
it does not make a film good. Only a person watching it play can judge that.
"""
import sys, json
from motion import analyse
from peaks import an

args = [a for a in sys.argv[1:] if not a.startswith("--")]
AD = "--ad" in sys.argv
AS_JSON = "--json" in sys.argv


def floors(m):
    out = []
    def chk(name, ok, val):
        out.append((name, "ok" if ok else "LOW", val))
    chk("audio track", m["audio"], m["audio"])
    chk("top-10% share >= 55", m["top10share"] >= 55, m["top10share"])
    chk("peak ratio >= 8", m["peak"] >= 8, m["peak"])
    chk("longest hold <= 2.5 s", m["hold_max"] <= 2.5, m["hold_max"])
    chk("palette bins (90%) <= 10", m["pal90"] <= 10, m["pal90"])
    dark = m["L_med"] < 128
    if dark:
        chk("dark grade: p5 <= 12", m["L_p5"] <= 12, m["L_p5"])
        chk("dark grade: median <= 30", m["L_med"] <= 30, m["L_med"])
    else:
        chk("light grade: p5 <= 40", m["L_p5"] <= 40, m["L_p5"])
        chk("light grade: p95 >= 235", m["L_p95"] >= 235, m["L_p95"])
    if AD:
        chk("ad length 10-12 s", 10 <= m["dur"] <= 12.05, m["dur"])
        chk("hits per 10 s >= 5", m["hits_per10"] >= 5, m["hits_per10"])
    return out


for f in args:
    m = {**analyse(f), **{k: v for k, v in an(f).items() if k != "file"}}
    if AS_JSON:
        print(json.dumps(m))
        continue
    print(f"\n{m['file']}  {m['ar']}  {m['dur']} s")
    print(f"  motion {m['motion']}  still {m['still_pct']} %  holds>1s {m['holds_gt1s']}  cuts/10s {m['cuts_per10']}")
    print(f"  luminance p5/med/p95 {m['L_p5']}/{m['L_med']}/{m['L_p95']}")
    for name, st, val in floors(m):
        print(f"  {st:4} {name:30} {val}")
