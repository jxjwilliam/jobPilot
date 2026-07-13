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
  "01-home:4.0"
  "02-onboarding:5.9"
  "03-matches:5.0"
  "04-applications:6.1"
  "05-profile:4.6"
  "06-usage:4.0"
  "07-cta:2.9"
)

# edge-tts rate (speed up voiceover to fit scene durations)
TTS_RATE="+30%"
TTS_VOICE="en-US-AndrewNeural"

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
    edge-tts --voice "$TTS_VOICE" --rate="$TTS_RATE" --write-media "$out" -f "$txt" 2>/dev/null || \
      ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t "$dur" "$out" 2>/dev/null
  else
    echo "  ⚠️  edge-tts not found. Install: pip3 install edge-tts"
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

XFADE_DUR=0.4
N=${#SCENES[@]}

# Build cumulative offsets
declare -a OFFSETS
cumul=0
for ((i=0; i<N-1; i++)); do
  dur="${SCENES[$i]#*:}"
  cumul=$(echo "$cumul + $dur - $XFADE_DUR" | bc -l)
  OFFSETS+=("$cumul")
done

# Build ffmpeg inputs
INPUTS=()
for entry in "${SCENES[@]}"; do
  name="${entry%%:*}"
  INPUTS+=(-i "$TEMP_DIR/seg_$name.mp4")
done

# Build xfade filter chain
FILTER=""
for ((i=0; i<N; i++)); do
  if [ $i -eq 0 ]; then
    FILTER+="[0:v]"
  elif [ $i -eq 1 ]; then
    FILTER+="[1:v]xfade=transition=fade:duration=${XFADE_DUR}:offset=${OFFSETS[0]}[s1]"
  else
    prev=$((i-1))
    idx=$((i-1))
    FILTER+=";[s$prev][${i}:v]xfade=transition=fade:duration=${XFADE_DUR}:offset=${OFFSETS[$idx]}[s$i]"
  fi
done

# Build audio concat
AUDIO_INPUTS="$(printf "[%d:a]" $(seq 0 $((N-1))))"
AUDIO_FILTER="${AUDIO_INPUTS}concat=n=${N}:v=0:a=1[aout]"

ffmpeg -y "${INPUTS[@]}" \
  -filter_complex "${FILTER};${AUDIO_FILTER}" \
  -map "[s$((N-1))]" -map "[aout]" \
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
