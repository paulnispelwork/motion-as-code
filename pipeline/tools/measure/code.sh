#!/bin/zsh
# Code metrics for film page sources: grep counts that tell a DOM film from a shader-led one,
# springs from eases, and how big the palette and font set are.
#   pipeline/tools/measure/code.sh <label> <file> [file ...]
#   e.g. code.sh demo films/example/src/ad.html
# Columns: bytes; webgl = getContext('webgl'/'webgl2') or THREE. uses; 2d = canvas 2D contexts;
# frag = fragment-shader outputs; march = raymarch/SDF/path-trace terms; spring = spring/track/preset calls;
# ease = ease/cubic/smoothstep/expo calls; hex = distinct 6-digit hex colours; fonts = distinct font-family
# declarations; post = grain/vignette/bloom/ACES/chromatic terms; cues = cue calls.
[[ $# -lt 2 ]] && { sed -n 2,9p $0; exit 1; }
n=$1; shift
all=$(cat "$@")
cnt() { print -r -- "$all" | grep -o $1 -E "$2" | wc -l | tr -d ' '; }
bytes=$(print -rn -- "$all" | wc -c | tr -d ' ')
webgl=$(cnt "" "getContext\(['\"]webgl2?['\"]|THREE\.")
c2d=$(cnt "" "getContext\(['\"]2d['\"]")
frag=$(cnt "" "gl_FragColor|out vec4|fragColor")
march=$(cnt -i "raymarch|sdf|pathtrac|bounce")
spring=$(cnt "" "spring\(|track\(|springs?\.|SPR\.|preset")
ease=$(cnt "" "ease[A-Za-z]*\(|cubic|smoothstep|expo[A-Za-z]*\(")
hex=$(print -r -- "$all" | grep -o -i -E "#[0-9a-f]{6}\b" | tr a-f A-F | sort -u | wc -l | tr -d ' ')
fonts=$(print -r -- "$all" | grep -o -E "font-family:\s*[^;,}]+" | sort -u | wc -l | tr -d ' ')
post=$(cnt -i "grain|vignette|bloom|aces|chromatic")
cue=$(cnt "" "cue\(|cues\.push|CUES|events\.push")
printf "%-26s %7s webgl=%-3s 2d=%-3s frag=%-3s march=%-3s spring=%-4s ease=%-4s hex=%-3s fonts=%-2s post=%-3s cues=%s\n" \
  $n $bytes $webgl $c2d $frag $march $spring $ease $hex $fonts $post $cue
