"""Schnitt-Plan (Hook / Hauptteil / Outro) und 9:16-Reframing."""

from __future__ import annotations

from pathlib import Path

from .config import Config, Segment
from .ffmpeg import FFmpegError, MediaInfo, binary, run


class CutError(RuntimeError):
    """Der Schnittplan passt nicht zum Quellmaterial."""


def resolve_segments(config: Config, info: MediaInfo) -> list[Segment]:
    """Passt den konfigurierten Schnittplan an die tatsächliche Quelldauer an.

    Segmente hinter dem Videoende werden verworfen, ein überstehendes Segment
    wird gekürzt. So funktioniert derselbe Plan auch für einen 20-Sekunden-
    Higgsfield-Export.
    """
    resolved: list[Segment] = []
    for seg in config.segments:
        if seg.start >= info.duration:
            continue
        end = min(seg.end, info.duration)
        if end - seg.start < 0.2:  # zu kurz für einen sinnvollen Schnitt
            continue
        resolved.append(Segment(seg.name, seg.start, end))

    if not resolved:
        raise CutError(
            f"Kein Segment liegt im Quellvideo (Dauer {info.duration:.1f}s). "
            "Passe 'segments' in der brand.yaml an oder nutze --plan."
        )
    return resolved


def parse_plan(plan: str) -> list[dict[str, float | str]]:
    """Parst '--plan hook=0-3,main=3-30,outro=30-45' in Segment-Dicts."""
    segments: list[dict[str, float | str]] = []
    for chunk in plan.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "=" not in chunk or "-" not in chunk:
            raise CutError(f"Ungültiges Segment '{chunk}'. Format: name=start-end (Sekunden).")
        name, span = chunk.split("=", 1)
        start, end = span.split("-", 1)
        segments.append({"name": name.strip(), "start": float(start), "end": float(end)})
    if not segments:
        raise CutError("--plan enthält keine Segmente.")
    return segments


def _reframe_filters(config: Config) -> list[str]:
    """Filterkette, die beliebiges Quellmaterial auf 9:16 bringt."""
    width = int(config.output["width"])
    height = int(config.output["height"])
    mode = config.reframe["mode"]

    if mode == "crop":
        fx = min(max(float(config.reframe["focus_x"]), 0.0), 1.0)
        fy = min(max(float(config.reframe["focus_y"]), 0.0), 1.0)
        return [
            f"scale={width}:{height}:force_original_aspect_ratio=increase",
            f"crop={width}:{height}:(iw-ow)*{fx}:(ih-oh)*{fy}",
        ]

    if mode == "pad":
        color = config.reframe["pad_color"].lstrip("#")
        return [
            f"scale={width}:{height}:force_original_aspect_ratio=decrease",
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=0x{color}",
        ]

    # mode == "blur": unscharfer Hintergrund + eingepasstes Original
    return ["__BLUR__"]


def _blur_graph(config: Config, src_label: str, out_label: str) -> str:
    width = int(config.output["width"])
    height = int(config.output["height"])
    return (
        f"[{src_label}]split=2[bgsrc][fgsrc];"
        f"[bgsrc]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},gblur=sigma=28[bg];"
        f"[fgsrc]scale={width}:{height}:force_original_aspect_ratio=decrease[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2[{out_label}]"
    )


def build_base_command(
    source: Path,
    info: MediaInfo,
    segments: list[Segment],
    out_path: Path,
    config: Config,
) -> list[str]:
    """Baut das ffmpeg-Kommando für Pass A: schneiden, zusammenfügen, 9:16, Audio normalisieren."""
    fps = int(config.output["fps"])
    args = [binary("ffmpeg"), "-y", "-loglevel", "error", "-i", str(source)]

    # Stummes Video: Stille als zweite Quelle, damit concat immer einen Audiotrack hat.
    audio_input = "0:a"
    if not info.has_audio:
        args += ["-f", "lavfi", "-t", f"{info.duration:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
        audio_input = "1:a"

    parts: list[str] = []
    concat_labels = ""
    for i, seg in enumerate(segments):
        parts.append(
            f"[0:v]trim=start={seg.start:.3f}:end={seg.end:.3f},setpts=PTS-STARTPTS[v{i}]"
        )
        parts.append(
            f"[{audio_input}]atrim=start={seg.start:.3f}:end={seg.end:.3f},asetpts=PTS-STARTPTS[a{i}]"
        )
        concat_labels += f"[v{i}][a{i}]"

    parts.append(f"{concat_labels}concat=n={len(segments)}:v=1:a=1[vcat][acat]")

    reframe = _reframe_filters(config)
    if reframe == ["__BLUR__"]:
        parts.append(_blur_graph(config, "vcat", "vre"))
    else:
        parts.append(f"[vcat]{','.join(reframe)}[vre]")

    parts.append(f"[vre]fps={fps},format=yuv420p[vout]")

    if config.output["loudnorm"]:
        parts.append("[acat]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]")
    else:
        parts.append("[acat]aresample=48000[aout]")

    args += ["-filter_complex", ";".join(parts), "-map", "[vout]", "-map", "[aout]"]
    args += _encode_args(config)
    args += [str(out_path)]
    return args


def _encode_args(config: Config) -> list[str]:
    out = config.output
    args = [
        "-c:v", "libx264",
        "-preset", str(out["preset"]),
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", str(out["audio_bitrate"]),
        "-ar", "48000",
        "-movflags", "+faststart",
    ]
    if out.get("video_bitrate"):
        args += ["-b:v", str(out["video_bitrate"])]
    else:
        args += ["-crf", str(out["crf"])]
    return args


def cut_and_reframe(source: Path, out_path: Path, config: Config, info: MediaInfo) -> list[Segment]:
    """Pass A ausführen. Gibt die tatsächlich verwendeten Segmente zurück."""
    segments = resolve_segments(config, info)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        run(build_base_command(source, info, segments, out_path, config), description="Schnitt (Pass A)")
    except FFmpegError as exc:
        raise CutError(str(exc)) from exc
    return segments
