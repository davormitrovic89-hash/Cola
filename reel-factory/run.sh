#!/usr/bin/env bash
# Ein Befehl von Skript bis Scheduler.
#
#   ./run.sh "Warum 90 % der KI-Projekte scheitern"     # Skript + Higgsfield-Prompt
#   ./run.sh --video ~/Downloads/higgsfield.mp4         # Schneiden + Captions
#   ./run.sh --video ~/Downloads/higgsfield.mp4 --post  # ... und posten
#
set -euo pipefail

cd "$(dirname "$0")"

TOPIC=""
VIDEO=""
POST=0
SCRIPT_JSON=""
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --video)  VIDEO="$2"; shift 2 ;;
    --script) SCRIPT_JSON="$2"; shift 2 ;;
    --post)   POST=1; shift ;;
    --)       shift; EXTRA+=("$@"); break ;;
    -*)       EXTRA+=("$1"); shift ;;
    *)        TOPIC="$1"; shift ;;
  esac
done

PY="${PYTHON:-python3}"

if [[ -z "$VIDEO" ]]; then
  if [[ -z "$TOPIC" ]]; then
    echo "Nutzung: ./run.sh \"<Thema>\"  |  ./run.sh --video <datei.mp4> [--post]" >&2
    exit 2
  fi
  echo "▶ Schritt 1/4 — Skript und Higgsfield-Prompt"
  "$PY" reelctl.py script --topic "$TOPIC" "${EXTRA[@]+"${EXTRA[@]}"}"
  echo
  echo "▶ Schritt 2/4 — Video in Higgsfield erzeugen (manuell), dann:"
  echo "    ./run.sh --video <export.mp4> --script scripts/<name>.json --post"
  exit 0
fi

echo "▶ Schritt 3/4 — Schneiden, Captions, Overlays"
ARGS=(render --input "$VIDEO")
[[ -n "$SCRIPT_JSON" ]] && ARGS+=(--script-json "$SCRIPT_JSON")
[[ $POST -eq 1 ]] && ARGS[0]="run" && ARGS+=(--publish)
"$PY" reelctl.py "${ARGS[@]}" "${EXTRA[@]+"${EXTRA[@]}"}"

if [[ $POST -eq 0 ]]; then
  echo
  echo "▶ Schritt 4/4 — Posten mit:"
  echo "    $PY reelctl.py publish --video out/<name>.mp4 --provider <ayrshare|buffer|webhook>"
fi
