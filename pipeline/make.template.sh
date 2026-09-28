#!/bin/zsh
# Copy to films/<name>/make.sh and fill in the tables. Builds films end to end, one at a time:
#   page QA -> cues -> score -> render (chunked, resumable) -> mux -> file QA.
# Any failed gate stops that film; nothing half-built lands in deliver/.
#   ./make.sh ad-a ad-b
#   GPU=1 ./make.sh film       for a page with a WebGL object
#   MUSIC=1 ./make.sh ad-a     mix under out/<film>/music.wav (fitted with music.py) instead of the synth beds
cd "$(dirname "$0")"
PIPE=../../pipeline
PY=$PIPE/.venv/bin/python
# film key -> page (a query picks a clip: "reels.html?clip=a"), and the delivered file name.
typeset -A PAGE=( ad-a "reels.html?clip=a" ad-b "reels.html?clip=b" film "film.html" )
typeset -A NAME=( ad-a "brand-ad-a-v1" ad-b "brand-ad-b-v1" film "brand-film-v1" )
# Safe area (top,right,bottom,left px). 9:16 on Meta Reels and Stories: keep text out of the bottom 620 px.
typeset -A SAFE=( ad-a "250,60,620,60" ad-b "250,60,620,60" )
STYLE=${STYLE:-bright}   # synth stand-in: warm, bright or dark
mkdir -p qa deliver
for F in "$@"; do
  P=${PAGE[$F]}; O=out/$F; mkdir -p $O
  [[ -z $P ]] && { echo "!! unknown film $F"; continue; }
  echo "== $F $(date +%H:%M:%S)"
  (cd src && node ../$PIPE/qa_page.js --page "$P" ${SAFE[$F]:+--safe ${SAFE[$F]}} --report ../qa/page-$F.json) || { echo "!! $F: page QA failed"; continue; }
  (cd src && node ../$PIPE/export_cues.js --page "$P" --out ../$O/cues.json) || { echo "!! $F: cue export failed"; continue; }
  $PY $PIPE/synth.py $O/cues.json $O/score.wav --lufs -14 --ceiling -2.0 --style $STYLE ${MUSIC:+--music $O/music.wav} || { echo "!! $F: synth failed"; continue; }
  (cd src && nice -n 5 node ../$PIPE/render.js --page "$P" --out ../$O --dsf 1.5 --sub 4 --chunk 240 ${GPU:+--gpu}) || { echo "!! $F: render failed"; continue; }
  $PIPE/finalize.sh $O $O/score.wav deliver/${NAME[$F]} || { echo "!! $F: mux failed"; continue; }
  (cd src && ../$PY ../$PIPE/qa_file.py ../deliver/${NAME[$F]}.mp4 --page "$P" --sheet ../qa/sheet-$F.jpg --report ../qa/file-$F.json) || echo "!! $F: file QA failed"
  echo "== $F done $(date +%H:%M:%S)"
done
