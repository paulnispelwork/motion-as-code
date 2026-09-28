#!/bin/zsh
# Mux rendered chunks and the score into deliverables. Writes to temp names and moves into place,
# so a crash never leaves a half-written file where a good one was.
#   finalize.sh <render-dir> <score.wav> <deliver-dir>/<name>
# Produces <name>-hq.mp4 (the CRF 10 render, stream-copied) and <name>.mp4 (web: CRF 18, capped bitrate).
# The audio is padded to the picture (apad + -shortest), so the video is never trimmed to the score.
set -e
DIR=$1; WAV=$2; OUT=$3
mkdir -p "$(dirname $OUT)"
TAGS=(-x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709)
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i $DIR/chunks.txt -i $WAV -map 0:v -map 1:a \
  -c:v copy -af apad -c:a aac -b:a 320k -ar 48000 -shortest -movflags +faststart $OUT-hq.part.mp4
mv $OUT-hq.part.mp4 $OUT-hq.mp4
# The web file is re-encoded from the HQ file: same colour path (BT.709 in, BT.709 out), tags written by x264 itself.
ffmpeg -y -hide_banner -loglevel error -i $OUT-hq.mp4 -map 0:v -map 0:a \
  -vf "scale=in_color_matrix=bt709:in_range=tv:out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 18 -maxrate 14M -bufsize 28M -profile:v high $TAGS -c:a copy -movflags +faststart $OUT.part.mp4
mv $OUT.part.mp4 $OUT.mp4
ls -la $OUT.mp4 $OUT-hq.mp4
