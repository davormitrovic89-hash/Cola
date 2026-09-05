"""Laden und Validieren der brand.yaml."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

DEFAULTS: dict[str, Any] = {
    "brand": {
        "name": "MTVC",
        "handle": "@mtvc",
        "primary": "#E0263A",
        "secondary": "#FFCF40",
        "text": "#FFFFFF",
        "font": "DejaVu Sans",
        "logo": None,
    },
    "output": {
        "width": 1080,
        "height": 1920,
        "fps": 30,
        "crf": 20,
        "preset": "veryfast",
        "video_bitrate": None,
        "audio_bitrate": "160k",
        "loudnorm": True,
    },
    "reframe": {
        "mode": "crop",       # crop | blur | pad
        "focus_x": 0.5,       # 0.0 = links, 1.0 = rechts (nur bei mode: crop)
        "focus_y": 0.5,
        "pad_color": "#000000",
    },
    "segments": [
        {"name": "hook", "start": 0, "end": 3},
        {"name": "main", "start": 3, "end": 30},
        {"name": "outro", "start": 30, "end": 45},
    ],
    "captions": {
        "enabled": True,
        "style": "word",      # word = Wort-für-Wort-Highlight, line = ganze Zeile
        "font_size": 76,
        "max_chars": 24,
        "max_words": 4,
        "margin_v": 520,      # Abstand von unten in px (TikTok-/Reels-UI freihalten)
        "outline": 6,
        "shadow": 2,
        "uppercase": True,
        "highlight": None,    # None => brand.secondary
    },
    "overlays": {
        "hook_text": None,        # None => erste Caption-Zeile
        "hook_font_size": 96,
        "hook_margin_v": 1250,    # Abstand von unten (obere Bildhälfte)
        "cta_text": None,         # None => "Folge {handle}"
        "cta_font_size": 64,
        "cta_seconds": 5.0,       # CTA in den letzten N Sekunden
        "cta_margin_v": 300,
        "logo_height": 90,
        "logo_margin": 60,
    },
    "publish": {
        "provider": "dryrun",     # dryrun | ayrshare | buffer | webhook
        "platforms": ["instagram", "tiktok", "youtube"],
        "hashtags": [],
        "caption_template": "{hook}\n\n{body}\n\n{hashtags}",
        "endpoint": None,         # nur für provider: webhook
        "profile_ids": [],        # nur für provider: buffer
        "media_url": None,        # öffentlich erreichbare URL des Videos
        "schedule_at": None,      # ISO-8601, None = sofort/Queue
    },
    "script": {
        "model": "claude-opus-5",
        "language": "de",
        "target_seconds": 45,
        "topic": None,
        "audience": None,
        "tone": "direkt, konkret, ohne Buzzwords",
    },
}


@dataclass(frozen=True)
class Segment:
    name: str
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class Config:
    data: dict[str, Any]
    path: Path | None = None
    _segments: list[Segment] = field(default_factory=list)

    def __post_init__(self) -> None:
        self._segments = [
            Segment(str(s.get("name", f"seg{i}")), float(s["start"]), float(s["end"]))
            for i, s in enumerate(self.data["segments"])
        ]

    # -- Zugriff -----------------------------------------------------------
    def section(self, name: str) -> dict[str, Any]:
        return self.data[name]

    @property
    def brand(self) -> dict[str, Any]:
        return self.data["brand"]

    @property
    def output(self) -> dict[str, Any]:
        return self.data["output"]

    @property
    def reframe(self) -> dict[str, Any]:
        return self.data["reframe"]

    @property
    def captions(self) -> dict[str, Any]:
        return self.data["captions"]

    @property
    def overlays(self) -> dict[str, Any]:
        return self.data["overlays"]

    @property
    def publish(self) -> dict[str, Any]:
        return self.data["publish"]

    @property
    def script(self) -> dict[str, Any]:
        return self.data["script"]

    @property
    def segments(self) -> list[Segment]:
        return list(self._segments)

    @property
    def highlight_color(self) -> str:
        return self.captions["highlight"] or self.brand["secondary"]

    @property
    def cta_text(self) -> str:
        return self.overlays["cta_text"] or f"Folge {self.brand['handle']}"


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def _validate(data: dict[str, Any]) -> None:
    if data["reframe"]["mode"] not in ("crop", "blur", "pad"):
        raise ValueError("reframe.mode muss crop, blur oder pad sein.")
    if data["captions"]["style"] not in ("word", "line"):
        raise ValueError("captions.style muss word oder line sein.")
    if not data["segments"]:
        raise ValueError("Es muss mindestens ein Segment definiert sein.")
    for seg in data["segments"]:
        if float(seg["end"]) <= float(seg["start"]):
            raise ValueError(f"Segment '{seg.get('name')}': end muss größer als start sein.")
    for key in ("width", "height"):
        if int(data["output"][key]) % 2 != 0:
            raise ValueError(f"output.{key} muss gerade sein (H.264-Anforderung).")


def load_config(path: str | Path | None = None, *, overrides: dict[str, Any] | None = None) -> Config:
    """Lädt brand.yaml und mischt sie über die Defaults."""
    data = copy.deepcopy(DEFAULTS)
    resolved: Path | None = None

    if path is not None:
        resolved = Path(path)
        if not resolved.is_file():
            raise FileNotFoundError(f"Konfiguration nicht gefunden: {resolved}")
        loaded = yaml.safe_load(resolved.read_text(encoding="utf-8")) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"{resolved} muss ein YAML-Mapping enthalten.")
        data = _deep_merge(data, loaded)

    if overrides:
        data = _deep_merge(data, overrides)

    _validate(data)
    return Config(data=data, path=resolved)
