#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== JobPilot Demo Builder ==="

FPS=30
FRAMES_DIR="frames"
AUDIO_DIR="audio"
OUTPUT="output.mp4"
TEMP_DIR=".tmp"

mkdir -p "$FRAMES_DIR" "$AUDIO_DIR" "$TEMP_DIR"

# Scenes configuration
SCENES=(
  "01-home:3"
  "02-login:4"
  "03-onboarding:5"
  "04-matches:6"
  "05-applications:6"
  "06-profile:4"
  "07-usage:3"
  "08-cta:4"
)

# Step 1: Screenshot HTML scenes
echo "[1/4] Capturing scenes..."
if command -v npx &>/dev/null && npx playwright --version &>/dev/null 2>&1; then
  for entry in "${SCENES[@]}"; do
    name="${entry%%:*}"
    html="scenes/${name}.html"
    out="$FRAMES_DIR/$name.png"
    if [ -f "$html" ]; then
      echo "  📸 $name"
      npx playwright screenshot --viewport-size=1920,1080 "$html" "$out" 2>/dev/null || \
        ffmpeg -y -f lavfi -i color=c=#0d0e12:s=1920x1080:d=1 -frames:v 1 "$out" 2>/dev/null
    fi
  done
else
  echo "  ⚠️  Playwright not found. Install: npm install playwright && npx playwright install chromium"
fi

# Step 2: Generate narration audio
echo "[2/4] Generating audio..."
for entry in "${SCENES[@]}"; do
  name="${entry%%:*}"
  dur="${entry##*:}"
  txt="narration/$name.txt"
  out="$AUDIO_DIR/$name.mp3"

  if command -v edge-tts &>/dev/null && [ -f "$txt" ]; then
    echo "  🎤 $name"
    edge-tts --voice en-US-AndrewNeural --file "$out" --text "$(cat "$txt")" 2>/dev/null || \
      ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t "$dur" "$out" 2>/dev/null
  else
    ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t "$dur" "$out" 2>/dev/null
  fi
done

# Step 3: Build video segments
echo "[3/4] Building segments..."
for entry in "${SCENES[@]}"; do
  name="${entry%%:*}"
  dur="${entry##*:}"
  echo "  🎬 $name (${dur}s)"
  ffmpeg -y -loop 1 -i "$FRAMES_DIR/$name.png" -i "$AUDIO_DIR/$name.mp3" \
    -c:v libx264 -t "$dur" -pix_fmt yuv420p -r "$FPS" \
    -c:a aac -b:a 128k -shortest \
    "$TEMP_DIR/seg_$name.mp4" 2>/dev/null
done

# Step 4: Composite with crossfade
echo "[4/4] Compositing final video..."

# Cumulative durations for crossfade offset calculation
# Durations: 3, 4, 5, 6, 6, 4, 3, 4
CUMULATIVE=(3 7 12 18 24 28 31 35)
XFADE_DUR=0.4
OFFSETS=()
for i in $(seq 0 6); do
  off=$(echo "${CUMULATIVE[$i]} - $XFADE_DUR" | bc -l)
  OFFSETS+=("$off")
done

# Build ffmpeg command with all 8 inputs
INPUTS=""
for entry in "${SCENES[@]}"; do
  name="${entry%%:*}"
  INPUTS+=" -i \"$TEMP_DIR/seg_$name.mp4\""
done

FILTER=""
for i in $(seq 0 7); do
  if [ $i -eq 0 ]; then
    FILTER+="[0:v]"
  elif [ $i -eq 1 ]; then
    FILTER+="[1:v]xfade=transition=fade:duration=$XFADE_DUR:offset=${OFFSETS[0]}[s1]"
  else
    prev=$((i-1))
    idx=$((i-1))
    FILTER+="[s$prev][${i}:v]xfade=transition=fade:duration=$XFADE_DUR:offset=${OFFSETS[$idx]}[s$i]"
  fi
  if [ $i -lt 7 ]; then
    FILTER+="; "
  fi
done

# Audio concat
AUDIO_FILTER="[0:a][1:a][2:a][3:a][4:a][5:a][6:a][7:a]concat=n=8:v=0:a=1[aout]"

eval ffmpeg -y $INPUTS \
  -filter_complex "\"${FILTER}; ${AUDIO_FILTER}\"" \
  -map "\"[s7]\"" -map "\"[aout]\"" \
  -c:v libx264 -preset medium -crf 18 \
  -c:a aac -b:a 192k \
  -pix_fmt yuv420p -r "$FPS" \
  "$OUTPUT" 2>&1 | tail -5

echo ""
if [ -f "$OUTPUT" ]; then
  DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT")
  SIZE=$(du -h "$OUTPUT" | cut -f1)
  echo "✅ Done — ${DUR}s, ${SIZE}"
  echo "View: open $OUTPUT"
else
  echo "❌ Failed"
  exit 1
fi
