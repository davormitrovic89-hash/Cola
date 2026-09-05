#!/usr/bin/env python3
"""reelctl — CLI für die Reel-Pipeline.

  ./reelctl.py script  --topic "..."                 Skript + Higgsfield-Prompt erzeugen
  ./reelctl.py render  --input roh.mp4               Schneiden, Captions, Overlays
  ./reelctl.py publish --video out/reel.mp4          An den Scheduler übergeben
  ./reelctl.py run     --input roh.mp4 --publish     Alles in einem Rutsch
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from reelfactory.config import load_config
from reelfactory.cut import CutError, parse_plan
from reelfactory.ffmpeg import FFmpegError
from reelfactory.publish import PublishError, publish
from reelfactory.render import RenderResult, render
from reelfactory.transcribe import TranscriptionError

DEFAULT_CONFIG = Path(__file__).with_name("brand.yaml")


# --- Hilfsfunktionen --------------------------------------------------------

def _overrides(args: argparse.Namespace) -> dict[str, Any]:
    """Baut CLI-Overrides, die über die brand.yaml gelegt werden."""
    over: dict[str, Any] = {}
    if getattr(args, "plan", None):
        over["segments"] = parse_plan(args.plan)
    if getattr(args, "reframe", None):
        over.setdefault("reframe", {})["mode"] = args.reframe
    if getattr(args, "no_captions", False):
        over.setdefault("captions", {})["enabled"] = False
    if getattr(args, "provider", None):
        over.setdefault("publish", {})["provider"] = args.provider
    if getattr(args, "media_url", None):
        over.setdefault("publish", {})["media_url"] = args.media_url
    if getattr(args, "schedule_at", None):
        over.setdefault("publish", {})["schedule_at"] = args.schedule_at
    if getattr(args, "platforms", None):
        over.setdefault("publish", {})["platforms"] = [p.strip() for p in args.platforms.split(",")]
    return over


def _config_path(args: argparse.Namespace) -> Path | None:
    if args.config:
        return Path(args.config)
    return DEFAULT_CONFIG if DEFAULT_CONFIG.is_file() else None


def _read_script(args: argparse.Namespace) -> tuple[str | None, str | None]:
    """Gibt (gesprochener Text, Hook) aus --script oder --script-json zurück."""
    if getattr(args, "script_json", None):
        from reelfactory.script_gen import ReelScript

        data = ReelScript.load(args.script_json)
        return data.spoken_text, data.hook
    if getattr(args, "script", None):
        return Path(args.script).read_text(encoding="utf-8"), getattr(args, "hook", None)
    return None, getattr(args, "hook", None)


def _report(result: RenderResult) -> None:
    print(f"\n✅ Reel fertig: {result.video}")
    print(f"   Länge:     {result.duration:.1f}s ({len(result.segments)} Segmente)")
    print(f"   Segmente:  " + ", ".join(f"{s.name} {s.duration:.1f}s" for s in result.segments))
    print(f"   Post-Text: {result.caption_file}")
    print(f"   Metadaten: {result.metadata_file}")
    for warning in result.warnings:
        print(f"   ⚠️  {warning}")


# --- Subcommands ------------------------------------------------------------

def cmd_script(args: argparse.Namespace) -> int:
    from reelfactory.script_gen import generate_script

    config = load_config(_config_path(args), overrides=_overrides(args))
    topic = args.topic or config.script.get("topic")
    if not topic:
        print("Fehler: --topic angeben oder script.topic in der brand.yaml setzen.", file=sys.stderr)
        return 2

    script = generate_script(topic, config)
    out = Path(args.out or f"scripts/{script.title.lower().replace(' ', '-')}.json")
    script.save(out)

    print(f"\n📝 Skript: {out}\n")
    print(f"HOOK    {script.hook}")
    print(f"BODY    {script.body}")
    print(f"CTA     {script.cta}")
    print(f"\nHASHTAGS  {' '.join('#' + t for t in script.hashtags)}")
    print(f"\n--- Higgsfield-Prompt (kopieren) ---\n{script.higgsfield_prompt}\n")
    if script.b_roll_notes:
        print("B-Roll:")
        for note in script.b_roll_notes:
            print(f"  - {note}")
    return 0


def _do_render(args: argparse.Namespace) -> RenderResult:
    config = load_config(_config_path(args), overrides=_overrides(args))
    script_text, hook = _read_script(args)

    result = render(
        args.input,
        config,
        out_dir=args.out_dir,
        name=args.name,
        srt=args.srt,
        script=script_text,
        hook_text=hook,
        asr=args.asr,
        whisper_model=args.whisper_model,
        keep_work=args.keep_work,
    )
    _report(result)
    return result


def cmd_render(args: argparse.Namespace) -> int:
    _do_render(args)
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    config = load_config(_config_path(args), overrides=_overrides(args))
    video = Path(args.video)
    caption_file = Path(args.caption) if args.caption else video.with_suffix(".caption.txt")
    if not caption_file.is_file():
        print(f"Fehler: Post-Text {caption_file} nicht gefunden (--caption angeben).", file=sys.stderr)
        return 2

    result = publish(caption_file.read_text(encoding="utf-8").strip(), video, config.publish)
    print(f"\n📤 {result.provider}: {result.detail}")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    rendered = _do_render(args)
    if not args.publish:
        print("\n(Nicht gepostet — mit --publish an den Scheduler übergeben.)")
        return 0

    config = load_config(_config_path(args), overrides=_overrides(args))
    result = publish(rendered.caption_text, rendered.video, config.publish)
    print(f"\n📤 {result.provider}: {result.detail}")
    return 0


# --- Argumente --------------------------------------------------------------

def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("-c", "--config", help="Pfad zur brand.yaml (Default: neben reelctl.py)")


def _add_render_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("-i", "--input", required=True, help="Rohvideo (z. B. Higgsfield-Export)")
    parser.add_argument("-o", "--out-dir", default="out", help="Zielordner (Default: out)")
    parser.add_argument("--name", help="Basisname der Ausgabedateien (Default: Name der Quelle)")
    parser.add_argument("--plan", help="Schnittplan, z. B. hook=0-3,main=3-30,outro=30-45")
    parser.add_argument("--reframe", choices=["crop", "blur", "pad"], help="9:16-Modus")
    parser.add_argument("--srt", help="Vorhandene .srt/.vtt statt Spracherkennung")
    parser.add_argument("--script", help="Skript als .txt (Timings werden geschätzt)")
    parser.add_argument("--script-json", help="Skript-JSON aus 'reelctl.py script'")
    parser.add_argument("--hook", help="Hook-Text für das Overlay (überschreibt alles andere)")
    parser.add_argument("--asr", choices=["auto", "off"], default="auto", help="Spracherkennung an/aus")
    parser.add_argument("--whisper-model", default="base", help="faster-whisper Modellgröße")
    parser.add_argument("--no-captions", action="store_true", help="Captions nicht einbrennen")
    parser.add_argument("--keep-work", action="store_true", help="Zwischendateien behalten")


def _add_publish_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--provider", choices=["dryrun", "ayrshare", "buffer", "webhook"])
    parser.add_argument("--media-url", help="Öffentliche URL des hochgeladenen MP4")
    parser.add_argument("--platforms", help="Kommaliste, z. B. instagram,tiktok,youtube")
    parser.add_argument("--schedule-at", help="ISO-8601-Zeitpunkt, sonst sofort/Queue")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="reelctl", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_script = sub.add_parser("script", help="Skript, Hook, Hashtags und Higgsfield-Prompt erzeugen")
    _add_common(p_script)
    p_script.add_argument("--topic", help="Thema der Folge")
    p_script.add_argument("--out", help="Zieldatei (JSON)")
    p_script.set_defaults(func=cmd_script)

    p_render = sub.add_parser("render", help="Video schneiden, Captions und Overlays einbrennen")
    _add_common(p_render)
    _add_render_args(p_render)
    p_render.set_defaults(func=cmd_render)

    p_publish = sub.add_parser("publish", help="Fertiges Reel an den Scheduler übergeben")
    _add_common(p_publish)
    _add_publish_args(p_publish)
    p_publish.add_argument("--video", required=True)
    p_publish.add_argument("--caption", help="Post-Text (.txt), Default: <video>.caption.txt")
    p_publish.set_defaults(func=cmd_publish)

    p_run = sub.add_parser("run", help="Render und optional Publish in einem Schritt")
    _add_common(p_run)
    _add_render_args(p_run)
    _add_publish_args(p_run)
    p_run.add_argument("--publish", action="store_true", help="Nach dem Rendern posten")
    p_run.set_defaults(func=cmd_run)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args))
    except (FFmpegError, CutError, TranscriptionError, PublishError, FileNotFoundError, ValueError) as exc:
        print(f"\n❌ {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
