"""Die komplette Render-Pipeline: schneiden -> transkribieren -> Captions einbrennen."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from . import captions as caps_mod
from . import transcribe as tr
from .config import Config, Segment
from .cut import cut_and_reframe
from .ffmpeg import binary, extract_audio, probe, run


@dataclass
class RenderResult:
    video: Path
    caption_file: Path
    metadata_file: Path
    segments: list[Segment]
    duration: float
    transcript: str
    caption_text: str
    warnings: list[str] = field(default_factory=list)


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "reel"


def _resolve_cues(
    config: Config,
    base_video: Path,
    work_dir: Path,
    duration: float,
    *,
    srt: Path | None,
    script: str | None,
    asr: str,
    whisper_model: str,
    warnings: list[str],
) -> list[tr.Cue]:
    """Wählt die beste verfügbare Transkript-Quelle."""
    if srt is not None:
        return tr.from_srt(srt)

    if asr != "off":
        audio = extract_audio(base_video, work_dir / "audio.wav")
        try:
            return tr.from_whisper(audio, model_size=whisper_model, language=config.script["language"])
        except tr.TranscriptionError as exc:
            if script is None:
                raise
            warnings.append(f"Whisper nicht verfügbar ({exc.args[0].splitlines()[0]}) — Timings aus dem Skript geschätzt.")

    if script:
        warnings.append("Caption-Timings sind aus dem Skript geschätzt, nicht aus dem Audio gemessen.")
        return tr.from_script(script, duration)

    raise tr.TranscriptionError(
        "Keine Transkript-Quelle. Nutze --srt, --script oder installiere faster-whisper."
    )


def _burn_command(
    base_video: Path,
    ass_name: str,
    out_path: Path,
    config: Config,
) -> list[str]:
    """Pass B: Captions einbrennen und optional das Logo einblenden.

    Wird mit cwd=work_dir ausgeführt, damit der ASS-Dateiname keine
    Sonderzeichen für den Filtergraphen enthält.
    """
    args = [binary("ffmpeg"), "-y", "-loglevel", "error", "-i", str(base_video)]

    logo = config.brand.get("logo")
    logo_path = Path(logo).expanduser() if logo else None
    has_logo = logo_path is not None and logo_path.is_file()

    if has_logo:
        margin = int(config.overlays["logo_margin"])
        height = int(config.overlays["logo_height"])
        args += ["-i", str(logo_path)]
        filtergraph = (
            f"[0:v]ass={ass_name}[vsub];"
            f"[1:v]scale=-1:{height}[logo];"
            f"[vsub][logo]overlay=W-w-{margin}:{margin}[vout]"
        )
        args += ["-filter_complex", filtergraph, "-map", "[vout]", "-map", "0:a"]
    else:
        args += ["-vf", f"ass={ass_name}", "-map", "0:v", "-map", "0:a"]

    args += [
        "-c:v", "libx264",
        "-preset", str(config.output["preset"]),
        "-crf", str(config.output["crf"]),
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(out_path),
    ]
    return args


def build_caption_text(config: Config, hook: str, body: str) -> str:
    tags = config.publish["hashtags"]
    hashtags = " ".join(t if t.startswith("#") else f"#{t}" for t in tags)
    template = config.publish["caption_template"]
    text = template.format(hook=hook.strip(), body=body.strip(), hashtags=hashtags)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def render(
    source: str | Path,
    config: Config,
    *,
    out_dir: str | Path = "out",
    name: str | None = None,
    srt: str | Path | None = None,
    script: str | None = None,
    hook_text: str | None = None,
    asr: str = "auto",
    whisper_model: str = "base",
    keep_work: bool = False,
) -> RenderResult:
    """Erzeugt aus einem Rohvideo ein fertiges 9:16-Reel plus Post-Text."""
    source = Path(source).expanduser()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    stem = name or source.stem
    slug = slugify(stem)
    work_dir = out_dir / f".work-{slug}"
    work_dir.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []

    info = probe(source)
    if abs(info.aspect - 9 / 16) < 0.01:
        warnings.append("Quelle ist bereits 9:16 — Reframing lässt das Bild unverändert.")

    # Pass A: schneiden, zusammenfügen, auf 9:16 bringen, Lautheit normalisieren
    base_video = work_dir / "base.mp4"
    segments = cut_and_reframe(source, base_video, config, info)
    base_info = probe(base_video)
    duration = base_info.duration

    # Transkript besorgen
    cues = _resolve_cues(
        config,
        base_video,
        work_dir,
        duration,
        srt=Path(srt) if srt else None,
        script=script,
        asr=asr,
        whisper_model=whisper_model,
        warnings=warnings,
    )
    transcript = " ".join(cue.text for cue in cues).strip()

    # Pass B: Captions + Overlays einbrennen
    ass_content = caps_mod.build_ass(config, cues, duration, hook_text=hook_text)
    caps_mod.write_ass(work_dir / "captions.ass", ass_content)

    final_video = out_dir / f"{slug}.mp4"
    run(
        _burn_command(base_video.resolve(), "captions.ass", final_video.resolve(), config),
        description="Captions einbrennen (Pass B)",
        cwd=work_dir,
    )

    # Post-Text und Metadaten
    hook = hook_text or config.overlays["hook_text"] or (cues[0].text if cues else "")
    body = (script or transcript).strip()
    if hook and body.startswith(hook):
        # Wenn der Hook der erste Satz des Skripts ist, nicht doppelt in den Post-Text.
        body = body[len(hook):].lstrip()
    caption_text = build_caption_text(config, hook, body)

    caption_file = out_dir / f"{slug}.caption.txt"
    caption_file.write_text(caption_text + "\n", encoding="utf-8")

    metadata = {
        "slug": slug,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": str(source),
        "video": str(final_video),
        "duration_seconds": round(duration, 2),
        "resolution": f"{config.output['width']}x{config.output['height']}",
        "fps": config.output["fps"],
        "segments": [
            {"name": s.name, "start": s.start, "end": s.end, "duration": round(s.duration, 2)}
            for s in segments
        ],
        "hook": hook,
        "hashtags": config.publish["hashtags"],
        "platforms": config.publish["platforms"],
        "transcript": transcript,
        "caption": caption_text,
        "warnings": warnings,
    }
    metadata_file = out_dir / f"{slug}.json"
    metadata_file.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not keep_work:
        for leftover in work_dir.iterdir():
            leftover.unlink()
        work_dir.rmdir()

    return RenderResult(
        video=final_video,
        caption_file=caption_file,
        metadata_file=metadata_file,
        segments=segments,
        duration=duration,
        transcript=transcript,
        caption_text=caption_text,
        warnings=warnings,
    )
