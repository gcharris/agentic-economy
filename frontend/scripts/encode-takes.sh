#!/bin/sh
# The takes' WebMs (tests/gpu/out, rendered by take-*.spec.ts with TAKE=1) → the 1280 × 720 H.264 MP4s under takes/.
# Needs an ffmpeg with libx264: $FFMPEG, else imageio-ffmpeg's (pip install imageio-ffmpeg; Playwright's is VP8-only).
# GIF=1 also writes takes-gif/<name>.gif (12 fps, 640 px) for chat previews; GIFs are not committed.
set -eu
cd "$(dirname "$0")/.."
FF=${FFMPEG:-$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')}
mkdir -p takes
enc() { # enc <webm in tests/gpu/out> <mp4 name in takes/>
  [ -f "tests/gpu/out/$1" ] || { echo "missing tests/gpu/out/$1 (render it first)"; return; }
  "$FF" -y -loglevel error -i "tests/gpu/out/$1" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "takes/$2.mp4"
  if [ "${GIF:-0}" = 1 ]; then
    mkdir -p takes-gif
    "$FF" -y -loglevel error -i "takes/$2.mp4" -vf "fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=sierra2_4a" "takes-gif/$2.gif"
  fi
  echo "takes/$2.mp4"
}
enc shot-room-t4.webm 01-room-t4
enc door-live.webm 02-door-no-then-yes
enc shot-street-settle-revert.webm 03-street-settle-revert-t7
enc shot-city-netted.webm 04-city-netted
enc shot-city-drifted.webm 05-city-drifted-streets
enc shot-court-rollback.webm 06-court-rollback-t3
enc zoom-room-to-world.webm 07-zoom-room-to-world
enc shot-heartbeat.webm 08-heartbeat-t16
enc shot-streets-seal-unpack.webm 09-streets-seal-unpack
