"""Schritt 1 der Kette: Thema -> Reel-Skript, Hook, Hashtags, Higgsfield-Prompt."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from .config import Config

SYSTEM_PROMPT = """Du schreibst Skripte für vertikale Kurzvideos (Reels/TikTok/Shorts).

Regeln:
- Der Hook ist ein einziger Satz, maximal 9 Wörter, und funktioniert ohne Ton.
  Keine Frage, die man mit "nein" beenden kann; keine Floskeln wie "In diesem Video".
- Der Hauptteil liefert genau eine konkrete Aussage mit einem Beleg oder Beispiel.
  Gesprochene Sprache, kurze Sätze, kein Marketing-Sprech, keine Aufzählungslisten.
- Der CTA ist eine konkrete Handlung, kein "Like und Abo".
- Der Higgsfield-Prompt beschreibt Bildinhalt, Kameraführung, Licht und Stimmung
  in einem englischen Absatz — ohne Text-Overlays, die kommen später im Schnitt.
- Hashtags: 8 bis 12 Stück, Mischung aus Reichweite und Nische, ohne Rauten-Spam.
"""


@dataclass
class ReelScript:
    title: str
    hook: str
    body: str
    cta: str
    hashtags: list[str]
    higgsfield_prompt: str
    b_roll_notes: list[str]

    @property
    def spoken_text(self) -> str:
        return f"{self.hook}\n\n{self.body}\n\n{self.cta}".strip()

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=2)

    def save(self, path: str | Path) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.to_json() + "\n", encoding="utf-8")
        return path

    @classmethod
    def load(cls, path: str | Path) -> "ReelScript":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(**data)


def generate_script(topic: str, config: Config) -> ReelScript:
    """Erzeugt ein Reel-Skript über die Claude API.

    Benötigt `pip install anthropic pydantic` und ANTHROPIC_API_KEY
    (oder ein Profil aus `ant auth login`).
    """
    try:
        import anthropic
        from pydantic import BaseModel, Field
    except ImportError as exc:  # pragma: no cover - hängt von der Umgebung ab
        raise RuntimeError(
            "Für die Skript-Generierung fehlen Pakete: pip install anthropic pydantic"
        ) from exc

    class ScriptSchema(BaseModel):
        title: str = Field(description="Kurzer interner Arbeitstitel, wird zum Dateinamen")
        hook: str = Field(description="Erster Satz, max. 9 Wörter")
        body: str = Field(description="Hauptteil, gesprochene Sprache")
        cta: str = Field(description="Konkreter Call-to-Action")
        hashtags: list[str] = Field(description="8-12 Hashtags ohne führendes #")
        higgsfield_prompt: str = Field(description="Englischer Bild-/Kamera-Prompt für Higgsfield")
        b_roll_notes: list[str] = Field(description="Stichpunkte für zusätzliche Schnittbilder")

    settings = config.script
    segments = config.segments
    plan = ", ".join(f"{s.name} {s.start:g}-{s.end:g}s" for s in segments)

    user_prompt = (
        f"Thema: {topic}\n"
        f"Marke: {config.brand['name']} ({config.brand['handle']})\n"
        f"Zielgruppe: {settings.get('audience') or 'nicht näher eingegrenzt'}\n"
        f"Tonalität: {settings.get('tone')}\n"
        f"Sprache: {settings.get('language')}\n"
        f"Gesamtlänge gesprochen: ca. {settings.get('target_seconds')} Sekunden\n"
        f"Schnittplan des fertigen Reels: {plan}\n\n"
        "Schreibe das Skript so, dass der Hook exakt in das erste Segment passt."
    )

    client = anthropic.Anthropic()
    response = client.messages.parse(
        model=settings.get("model", "claude-opus-5"),
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
        output_format=ScriptSchema,
    )
    parsed = response.parsed_output
    if parsed is None:
        raise RuntimeError(f"Die API lieferte kein verwertbares Skript (stop_reason={response.stop_reason}).")

    return ReelScript(
        title=parsed.title,
        hook=parsed.hook,
        body=parsed.body,
        cta=parsed.cta,
        hashtags=[t.lstrip("#") for t in parsed.hashtags],
        higgsfield_prompt=parsed.higgsfield_prompt,
        b_roll_notes=list(parsed.b_roll_notes),
    )
