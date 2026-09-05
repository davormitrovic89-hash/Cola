"""Erzeugt eine ASS-Datei: Wort-für-Wort-Captions, Hook-Titel und CTA."""

from __future__ import annotations

from pathlib import Path

from .config import Config
from .transcribe import Cue, Word, group_words


def hex_to_ass(value: str, alpha: int = 0) -> str:
    """#RRGGBB -> &HAABBGGRR (ASS speichert BGR, Alpha zuerst, 00 = deckend)."""
    raw = value.strip().lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6:
        raise ValueError(f"Ungültige Farbe: {value!r} (erwartet #RRGGBB)")
    r, g, b = raw[0:2], raw[2:4], raw[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def hex_to_ass_inline(value: str) -> str:
    """#RRGGBB -> &HBBGGRR& — die Form, die Inline-Tags wie \\c erwarten."""
    return f"&H{hex_to_ass(value)[4:]}&"


def ass_time(seconds: float) -> str:
    """Sekunden -> H:MM:SS.cc"""
    seconds = max(seconds, 0.0)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{int(hours)}:{int(minutes):02d}:{int(secs):02d}.{int(round((secs % 1) * 100)):02d}"


def escape(text: str) -> str:
    """Entschärft ASS-Steuerzeichen im Nutzertext."""
    return text.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", r"\N")


def _style_line(
    name: str,
    *,
    font: str,
    size: int,
    primary: str,
    outline_color: str,
    outline: float,
    shadow: float,
    margin_v: int,
    margin_h: int = 80,
    bold: int = -1,
) -> str:
    return (
        f"Style: {name},{font},{size},{primary},{primary},{outline_color},&H80000000,"
        f"{bold},0,0,0,100,100,0,0,1,{outline},{shadow},2,{margin_h},{margin_h},{margin_v},1"
    )


def build_ass(
    config: Config,
    cues: list[Cue],
    duration: float,
    *,
    hook_text: str | None = None,
) -> str:
    """Baut das komplette ASS-Skript für ein Reel."""
    caps = config.captions
    ovl = config.overlays
    width = int(config.output["width"])
    height = int(config.output["height"])

    font = config.brand["font"]
    text_color = hex_to_ass(config.brand["text"])
    accent = hex_to_ass(config.brand["primary"])
    outline_color = hex_to_ass("#000000")
    # Inline-Tags brauchen die 6-stellige Form mit abschließendem &.
    text_inline = hex_to_ass_inline(config.brand["text"])
    highlight_inline = hex_to_ass_inline(config.highlight_color)

    header = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        _style_line(
            "Caption",
            font=font,
            size=int(caps["font_size"]),
            primary=text_color,
            outline_color=outline_color,
            outline=float(caps["outline"]),
            shadow=float(caps["shadow"]),
            margin_v=int(caps["margin_v"]),
        ),
        _style_line(
            "Hook",
            font=font,
            size=int(ovl["hook_font_size"]),
            primary=text_color,
            outline_color=outline_color,
            outline=float(caps["outline"]) + 2,
            shadow=float(caps["shadow"]),
            margin_v=int(ovl["hook_margin_v"]),
            margin_h=100,
        ),
        _style_line(
            "CTA",
            font=font,
            size=int(ovl["cta_font_size"]),
            primary=accent,
            outline_color=outline_color,
            outline=float(caps["outline"]),
            shadow=float(caps["shadow"]),
            margin_v=int(ovl["cta_margin_v"]),
        ),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    events: list[str] = []

    # 1. Hook-Titel über den ersten Sekunden.
    # Nur wenn er explizit gesetzt ist — sonst stünde derselbe Satz doppelt im Bild,
    # einmal als Titel und einmal als Caption.
    hook = hook_text or ovl["hook_text"]
    if hook:
        hook_end = min(config.segments[0].duration if config.segments else 3.0, duration)
        events.append(
            _dialogue(
                0.0,
                max(hook_end, 1.5),
                "Hook",
                r"{\fad(200,250)}" + escape(_maybe_upper(hook, caps["uppercase"])),
                layer=1,
            )
        )

    # 2. Captions
    if caps["enabled"] and cues:
        groups = group_words(cues, max_words=int(caps["max_words"]), max_chars=int(caps["max_chars"]))
        for group in groups:
            events.extend(
                _caption_events(
                    group,
                    duration=duration,
                    uppercase=bool(caps["uppercase"]),
                    style=str(caps["style"]),
                    base=text_inline,
                    highlight=highlight_inline,
                )
            )

    # 3. CTA am Ende
    cta_seconds = float(ovl["cta_seconds"])
    if cta_seconds > 0 and duration > 0:
        cta_start = max(duration - cta_seconds, 0.0)
        events.append(
            _dialogue(
                cta_start,
                duration,
                "CTA",
                r"{\fad(250,150)}" + escape(_maybe_upper(config.cta_text, caps["uppercase"])),
                layer=1,
            )
        )

    return "\n".join(header + events) + "\n"


def _maybe_upper(text: str, uppercase: bool) -> str:
    return text.upper() if uppercase else text


def _dialogue(start: float, end: float, style: str, text: str, *, layer: int = 0) -> str:
    return f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text}"


def _caption_events(
    group: Cue,
    *,
    duration: float,
    uppercase: bool,
    style: str,
    base: str,
    highlight: str,
) -> list[str]:
    words: list[Word] = group.words
    end_of_group = min(group.end, duration)

    if style == "line":
        text = escape(_maybe_upper(group.text, uppercase))
        return [_dialogue(group.start, end_of_group, "Caption", r"{\fad(80,80)}" + text)]

    events: list[str] = []
    for i, word in enumerate(words):
        # Bis zum nächsten Wort stehen lassen, damit nichts flackert.
        stop = words[i + 1].start if i + 1 < len(words) else end_of_group
        stop = min(max(stop, word.start + 0.08), duration)
        if stop <= word.start:
            continue

        parts: list[str] = []
        for j, other in enumerate(words):
            token = escape(_maybe_upper(other.text, uppercase))
            if j == i:
                parts.append(rf"{{\c{highlight}\fscx108\fscy108}}{token}{{\c{base}\fscx100\fscy100}}")
            else:
                parts.append(token)
        events.append(_dialogue(word.start, stop, "Caption", " ".join(parts)))
    return events


def write_ass(path: Path, content: str) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path
