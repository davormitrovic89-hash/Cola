"""Dünne Wrapper um ffmpeg / ffprobe."""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


class FFmpegError(RuntimeError):
    """ffmpeg/ffprobe fehlt oder ist mit Fehler beendet worden."""


def binary(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise FFmpegError(
            f"'{name}' wurde nicht gefunden. Installiere ffmpeg:\n"
            "  macOS:   brew install ffmpeg\n"
            "  Ubuntu:  sudo apt install ffmpeg\n"
            "  Windows: winget install Gyan.FFmpeg"
        )
    return path


def run(args: list[str], *, description: str = "ffmpeg", cwd: str | Path | None = None) -> str:
    """Führt ein Kommando aus und gibt stdout zurück. Wirft FFmpegError bei Exit != 0."""
    proc = subprocess.run(args, capture_output=True, text=True, cwd=cwd)
    if proc.returncode != 0:
        tail = "\n".join(proc.stderr.strip().splitlines()[-25:])
        raise FFmpegError(f"{description} fehlgeschlagen (exit {proc.returncode}):\n{tail}")
    return proc.stdout


@dataclass(frozen=True)
class MediaInfo:
    path: Path
    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool

    @property
    def aspect(self) -> float:
        return self.width / self.height if self.height else 0.0


def _parse_fps(value: str | None) -> float:
    if not value or value in ("0/0", "0"):
        return 0.0
    if "/" in value:
        num, den = value.split("/", 1)
        den_f = float(den)
        return float(num) / den_f if den_f else 0.0
    return float(value)


def probe(path: str | Path) -> MediaInfo:
    """Liest Dauer, Auflösung, FPS und Audio-Präsenz aus einer Mediendatei."""
    path = Path(path)
    if not path.is_file():
        raise FFmpegError(f"Datei nicht gefunden: {path}")

    raw = run(
        [
            binary("ffprobe"),
            "-v", "error",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        description=f"ffprobe {path.name}",
    )
    data = json.loads(raw)

    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    if video is None:
        raise FFmpegError(f"{path.name} enthält keinen Videostream.")
    has_audio = any(s.get("codec_type") == "audio" for s in data.get("streams", []))

    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0.0)
    if duration <= 0:
        raise FFmpegError(f"Konnte die Dauer von {path.name} nicht bestimmen.")

    fps = _parse_fps(video.get("avg_frame_rate")) or _parse_fps(video.get("r_frame_rate")) or 30.0

    return MediaInfo(
        path=path,
        duration=duration,
        width=int(video["width"]),
        height=int(video["height"]),
        fps=fps,
        has_audio=has_audio,
    )


def extract_audio(video: str | Path, out_wav: str | Path, *, sample_rate: int = 16000) -> Path:
    """Extrahiert Mono-WAV (für die Spracherkennung)."""
    out_wav = Path(out_wav)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            binary("ffmpeg"), "-y", "-loglevel", "error",
            "-i", str(video),
            "-vn", "-ac", "1", "-ar", str(sample_rate),
            "-c:a", "pcm_s16le",
            str(out_wav),
        ],
        description="Audio-Extraktion",
    )
    return out_wav
