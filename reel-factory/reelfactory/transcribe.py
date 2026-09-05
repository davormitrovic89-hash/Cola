"""Wort-Timings für die Captions — aus Whisper, aus einer SRT oder aus dem Skript."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Word:
    text: str
    start: float
    end: float


@dataclass
class Cue:
    words: list[Word]

    @property
    def start(self) -> float:
        return self.words[0].start

    @property
    def end(self) -> float:
        return self.words[-1].end

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


class TranscriptionError(RuntimeError):
    """Es konnte kein Transkript erzeugt werden."""


# --- Whisper ---------------------------------------------------------------

def from_whisper(audio: Path, *, model_size: str = "base", language: str | None = "de") -> list[Cue]:
    """Lokale Spracherkennung mit faster-whisper (optionale Abhängigkeit)."""
    try:
        from faster_whisper import WhisperModel  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover - hängt von der Umgebung ab
        raise TranscriptionError(
            "faster-whisper ist nicht installiert. Entweder\n"
            "  pip install faster-whisper\n"
            "oder eine fertige SRT mit --srt übergeben, oder --script nutzen."
        ) from exc

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(audio), language=language, word_timestamps=True)

    cues: list[Cue] = []
    for seg in segments:
        words = [
            Word(w.word.strip(), float(w.start), float(w.end))
            for w in (seg.words or [])
            if w.word and w.word.strip()
        ]
        if words:
            cues.append(Cue(words))
        elif (seg.text or "").strip():
            cues.extend(_spread(seg.text.strip(), float(seg.start), float(seg.end)))
    if not cues:
        raise TranscriptionError("Whisper hat keine Sprache im Audio gefunden.")
    return cues


# --- SRT / VTT -------------------------------------------------------------

_TIME_RE = re.compile(r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})")


def _parse_timestamp(value: str) -> float:
    match = _TIME_RE.search(value)
    if match is None:
        raise TranscriptionError(f"Ungültiger Zeitstempel: {value!r}")
    h, m, s, ms = match.groups()
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms.ljust(3, "0")) / 1000.0


def from_srt(path: Path) -> list[Cue]:
    """Liest eine .srt/.vtt und verteilt die Wörter gleichmäßig im Block."""
    text = Path(path).read_text(encoding="utf-8-sig")
    cues: list[Cue] = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [ln for ln in block.splitlines() if ln.strip()]
        timing = next((ln for ln in lines if "-->" in ln), None)
        if timing is None:
            continue
        start_raw, end_raw = timing.split("-->", 1)
        body = " ".join(lines[lines.index(timing) + 1:]).strip()
        body = re.sub(r"<[^>]+>", "", body)
        if body:
            cues.extend(_spread(body, _parse_timestamp(start_raw), _parse_timestamp(end_raw)))
    if not cues:
        raise TranscriptionError(f"{path} enthält keine verwertbaren Untertitel.")
    return cues


# --- Skript ohne Timings ---------------------------------------------------

def from_script(script: str, duration: float) -> list[Cue]:
    """Notlösung: verteilt den Skripttext gleichmäßig über die Videodauer.

    Die Timings sind eine Schätzung — gut genug für einen ersten Durchlauf,
    aber für die finale Version gehört Whisper oder eine echte SRT davor.
    """
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", script) if s.strip()]
    if not sentences:
        raise TranscriptionError("Das Skript enthält keinen Text.")

    weights = [max(len(s.split()), 1) for s in sentences]
    total = sum(weights)
    cues: list[Cue] = []
    cursor = 0.0
    for sentence, weight in zip(sentences, weights):
        span = duration * weight / total
        cues.extend(_spread(sentence, cursor, cursor + span))
        cursor += span
    return cues


def _spread(text: str, start: float, end: float) -> list[Cue]:
    """Verteilt die Wörter eines Textblocks linear zwischen start und end."""
    tokens = [t for t in text.split() if t]
    if not tokens:
        return []
    span = max(end - start, 0.05)
    step = span / len(tokens)
    words = [Word(tok, start + i * step, start + (i + 1) * step) for i, tok in enumerate(tokens)]
    return [Cue(words)]


# --- Gruppierung für die Anzeige -------------------------------------------

def group_words(cues: list[Cue], *, max_words: int, max_chars: int) -> list[Cue]:
    """Fasst Wörter zu bildschirmtauglichen Blöcken zusammen.

    Ein Blockwechsel passiert bei Satzzeichen, bei zu vielen Wörtern/Zeichen
    oder bei einer Sprechpause von mehr als 0,6 Sekunden.
    """
    grouped: list[Cue] = []
    current: list[Word] = []

    def flush() -> None:
        nonlocal current
        if current:
            grouped.append(Cue(current))
            current = []

    for cue in cues:
        for word in cue.words:
            if current and word.start - current[-1].end > 0.6:
                flush()
            current.append(word)
            chars = sum(len(w.text) + 1 for w in current) - 1
            if (
                len(current) >= max_words
                or chars >= max_chars
                or word.text.rstrip().endswith((".", "!", "?", ":", "…"))
            ):
                flush()
    flush()
    return grouped
