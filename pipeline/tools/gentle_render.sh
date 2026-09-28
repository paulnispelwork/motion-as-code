#!/bin/bash
# RAM-safe, low-priority render: render.js one chunk at a time, gated on free memory, with a watchdog.
#   tools/gentle_render.sh <page> <out-dir> [render.js args...]     (run from the page's folder, like render.js)
# Env: MIN_FREE (default 25) = wait before a chunk until free memory >= this %;
#      KILL_FREE (default 12) = kill the running chunk and retry it later if free memory drops below this %;
#      CHUNK (default 240), NICE (default 15), THREADS (default 2).
# macOS only. Free memory is `memory_pressure`'s system-wide free percentage; it is logged to <out-dir>/mem.log.
# Another session's render can run at the same time: the gate and the watchdog keep the machine out of swap.
# A final full render.js pass skips finished chunks, redoes any a watchdog kill or a fingerprint change left
# missing, and writes chunks.txt, so the result is always complete.
set -m
PAGE=$1; OUT=$2; shift 2
PIPE="$(cd "$(dirname "$0")/.." && pwd)"
MIN_FREE=${MIN_FREE:-25}; KILL_FREE=${KILL_FREE:-12}; CH=${CHUNK:-240}; NICE=${NICE:-15}; THREADS=${THREADS:-2}
mkdir -p "$OUT"
free_pct() { memory_pressure 2>/dev/null | tail -1 | grep -o '[0-9]*' | tail -1; }
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$OUT/mem.log"; }
TOTAL=$(node -e '
const { launch, openFilm } = require(process.argv[1] + "/lib");
(async () => { const b = await launch(); const { film } = await openFilm(b, process.argv[2]); console.log(Math.round(film.duration * 60)); await b.close(); })();
' "$PIPE" "$PAGE") || { echo "could not open $PAGE"; exit 1; }
log "gentle render $PAGE: $TOTAL frames, chunks of $CH, min free $MIN_FREE%, kill below $KILL_FREE%"
run() { nice -n "$NICE" node "$PIPE/render.js" --page "$PAGE" --out "$OUT" --chunk "$CH" --threads "$THREADS" "$@"; }
for ((f0 = 0; f0 < TOTAL; f0 += CH)); do
  for try in 1 2 3; do
    while :; do F=$(free_pct); [ "${F:-0}" -ge "$MIN_FREE" ] && break; log "waiting: free ${F}% < ${MIN_FREE}%"; sleep 20; done
    log "chunk $f0 (try $try), free ${F}%"
    run --from "$f0" --to $((f0 + CH)) "$@" > "$OUT/chunk.log" 2>&1 &
    PID=$!; KILLED=0; n=0
    while kill -0 $PID 2>/dev/null; do
      sleep 5; n=$((n + 1)); F=$(free_pct)
      [ $((n % 2)) -eq 0 ] && log "  free ${F}%"
      if [ "${F:-100}" -lt "$KILL_FREE" ]; then log "  free ${F}% < ${KILL_FREE}%: killing chunk $f0"; kill -TERM -- -$PID 2>/dev/null; KILLED=1; fi
    done
    wait $PID; RC=$?
    [ $KILLED -eq 0 ] && [ $RC -eq 0 ] && break
    log "  chunk $f0 failed (rc $RC, killed $KILLED)"; tail -3 "$OUT/chunk.log"; sleep 30
  done
done
log "final pass (skips finished chunks, writes chunks.txt)"
while :; do F=$(free_pct); [ "${F:-0}" -ge "$MIN_FREE" ] && break; log "waiting: free ${F}%"; sleep 20; done
run "$@" > "$OUT/final.log" 2>&1; RC=$?
tail -3 "$OUT/final.log"; exit $RC
