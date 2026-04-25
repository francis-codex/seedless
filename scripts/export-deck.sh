#!/usr/bin/env bash
# Export pitch-deck-v3.html to:
#   - assets/deck-v3-export/seedless-deck-v3.pdf  (single PDF, all slides)
#   - assets/deck-v3-export/slide-NN.png          (one PNG per slide, 1280x720)
#
# Uses macOS Chrome headless. No npm install required.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DECK="$ROOT/assets/pitch-deck-v3.html"
OUT="$ROOT/assets/deck-v3-export"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SLIDE_COUNT=13

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at $CHROME"; exit 1
fi
if [ ! -f "$DECK" ]; then
  echo "Deck not found at $DECK"; exit 1
fi

mkdir -p "$OUT"

DECK_URL="file://$DECK"

echo "→ generating PDF"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT/seedless-deck-v3.pdf" \
  --print-to-pdf-no-header \
  --virtual-time-budget=4000 \
  "$DECK_URL" 2>/dev/null

echo "→ generating PNGs ($SLIDE_COUNT slides)"
for i in $(seq 1 $SLIDE_COUNT); do
  N=$(printf "%02d" "$i")
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=1280,720 \
    --virtual-time-budget=4000 \
    --screenshot="$OUT/slide-$N.png" \
    "$DECK_URL?slide=$i" 2>/dev/null
  echo "  · slide-$N.png"
done

echo
echo "done → $OUT"
ls -lh "$OUT"
