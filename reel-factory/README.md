# reel-factory

Higgsfield-Export rein → fertiges 9:16-Reel mit Captions, Hook, CTA und Hashtags raus.
Ein Befehl, kein CapCut.

```bash
pip install -r requirements.txt          # PyYAML + requests
brew install ffmpeg                      # bzw. apt install ffmpeg

python3 reelctl.py render \
  --input ~/Downloads/higgsfield_export.mp4 \
  --hook "80 % schauen ohne Ton"
```

Ergebnis in `out/`:

| Datei | Inhalt |
|---|---|
| `<name>.mp4` | 1080×1920, H.264, AAC, Audio auf −14 LUFS, `faststart` |
| `<name>.caption.txt` | Post-Text mit Hook, Body und Hashtags |
| `<name>.json` | Metadaten: Segmente, Transkript, Hook, Plattformen |

---

## Die drei Fragen, kurz beantwortet

### 1. Kann ich MP4s automatisch schneiden? — Ja, aber mit einer Einschränkung

Was dieses Repo tut, ist **deterministischer Schnitt**: Segmente nach Zeitplan
(Hook 0–3 s, Hauptteil 3–30 s, Outro 30–45 s), Reframing auf 9:16, Wort-für-Wort-
Captions aus der Tonspur, Hook-/CTA-Overlay, Logo, Post-Text mit Hashtags.
Das läuft lokal über ffmpeg und Whisper, kostet nichts pro Video und ist
reproduzierbar. Genau das ist gebaut und getestet.

Was es **nicht** tut: entscheiden, *welche* 30 Sekunden aus einem 45-Minuten-
Podcast die guten sind. Diese semantische Auswahl ("finde die viralen Momente")
ist der einzige Teil, für den ein spezialisiertes Tool besser ist als ein Skript —
siehe Frage 2.

Die praktische Grenze: **ich kann keine Videodatei von dir entgegennehmen.**
Diese Session läuft in einem Container ohne Zugriff auf deine Festplatte. Du
lädst nichts bei mir hoch — du führst das Skript auf deinem Rechner aus. Dafür
läuft es dann auch ohne mich, jeden Tag, für jedes Video.

### 2. Wenn Auswahl nötig ist: welches Tool?

| Tool | Stärke | Wofür in deinem Setup |
|---|---|---|
| **Dieses Repo** | Zeitplan-Schnitt, Captions, Branding, kostenlos, API-frei | Higgsfield-Clips (kurz, du kennst den Inhalt) — der Normalfall |
| **[Reap](https://reap.video/api)** | REST-API, findet Momente in Langvideos, animierte Captions, 100+ Sprachen, Webhooks | Podcast-Folge → 5 Clips, wenn du die Stellen nicht selbst raussuchen willst |
| **Opus Clip / Submagic** | Bester Caption-Look out of the box | Wenn du auf Optik optimierst und den manuellen Klick akzeptierst |

Empfehlung: dieses Repo als Standard, Reap als API-Ergänzung, sobald du
Langform-Podcasts zerschneidest. Beides lässt sich kombinieren — Reap liefert
die Clips, reel-factory macht das Branding drauf.

### 3. Higgsfield + Buffer — der ehrliche Stand

**Higgsfield** hat keine offene Public API für Text-zu-Video. Der Schritt
"Prompt → Video" bleibt manuell. `reelctl.py script` erzeugt dir dafür den
fertigen Prompt zum Kopieren — das ist die einzige Handbewegung in der Kette.

**Buffer** ist seit 2019 für neue Dritt-Apps zu: keine neuen OAuth-Client-IDs.
Aktuell gibt es eine Beta mit persönlichem API-Key auf Antrag, und Medien werden
nur per **öffentlicher URL** referenziert, nicht hochgeladen. Wenn du Buffer
behalten willst, brauchst du also einen Ablageort für das MP4 (S3, Cloudflare R2,
Bunny) — der `buffer`-Provider hier ist genau dafür gebaut.

Wenn du frei wählen kannst, ist **Ayrshare** oder ein **n8n-Webhook** der
geradere Weg; beide sind als Provider implementiert. Das Video braucht in allen
Fällen eine öffentliche URL — daran führt kein Scheduler vorbei.

---

## Der Workflow

```
1. reelctl.py script  --topic "..."     → Skript, Hook, Hashtags, Higgsfield-Prompt
2. Higgsfield                            → Prompt einfügen, Video exportieren   [manuell]
3. reelctl.py render  --input export.mp4 → Schnitt, Captions, Overlays, Post-Text
4. Video zu S3/R2 hochladen              → öffentliche URL                       [einmalig einrichten]
5. reelctl.py publish --provider ...     → Instagram, TikTok, YouTube
```

Schritte 3 und 5 in einem Rutsch:

```bash
python3 reelctl.py run --input export.mp4 --publish \
  --provider ayrshare --media-url https://cdn.example.com/reel.mp4
```

Oder über den Wrapper:

```bash
./run.sh "Warum 90 % der KI-Projekte scheitern"     # Schritt 1
./run.sh --video export.mp4 --script scripts/x.json --post   # Schritte 3–5
```

---

## Captions

Drei Quellen, in dieser Reihenfolge:

1. **`--srt datei.srt`** — exakte Timings, wenn du schon Untertitel hast.
2. **Whisper** (Default) — `pip install faster-whisper`, misst die Timings am
   Ton. Das ist der Weg für die finale Version.
3. **`--script text.txt`** — verteilt den Text gleichmäßig über die Dauer. Nur
   eine Schätzung; die Pipeline warnt entsprechend. Gut für einen schnellen Blick.

Der Look ist Wort-für-Wort-Highlight: die ganze Zeile steht weiß, das aktuell
gesprochene Wort wird in `brand.secondary` eingefärbt und leicht vergrößert.
`captions.style: line` schaltet auf ganze Zeilen um.

`captions.margin_v: 520` hält die untere Bedienleiste von TikTok und Reels frei —
darunter liegen bei beiden Plattformen Buttons.

---

## Konfiguration

Alles in `brand.yaml`, jeder Wert per CLI überschreibbar. Die wichtigsten:

```yaml
brand:
  font: "Montserrat ExtraBold"   # jede installierte Schrift; Fallback: DejaVu Sans
  secondary: "#FFCF40"           # Highlight-Farbe im Caption
  logo: assets/mtvc-logo.png     # PNG mit Alpha, wird oben rechts eingeblendet

reframe:
  mode: crop                     # crop = füllt | blur = weicher Rand | pad = Balken
  focus_x: 0.5                   # 0 = links, 1 = rechts — wenn die Person nicht mittig steht

segments:
  - { name: hook,  start: 0,  end: 3 }
  - { name: main,  start: 3,  end: 30 }
  - { name: outro, start: 30, end: 45 }
```

Ist die Quelle kürzer als der Plan, werden überstehende Segmente gekürzt und
Segmente hinter dem Videoende verworfen — ein 18-Sekunden-Export läuft mit
demselben Plan durch.

Einmaliger Plan ohne YAML-Änderung:

```bash
python3 reelctl.py render -i roh.mp4 --plan "hook=0-3,main=12-38,outro=40-45"
```

---

## Publishing

```yaml
publish:
  provider: dryrun        # dryrun | ayrshare | buffer | webhook
  media_url: https://cdn.example.com/reel.mp4
  platforms: [instagram, tiktok, youtube]
```

| Provider | Auth | Anmerkung |
|---|---|---|
| `dryrun` | — | Default. Schreibt nur `<name>.publish.json`, postet nichts. |
| `ayrshare` | `AYRSHARE_API_KEY` | `POST /api/post` mit `mediaUrls`. |
| `buffer` | `BUFFER_ACCESS_TOKEN` + `profile_ids` | Personal-Key-Beta, Medien per URL. |
| `webhook` | optional `api_key_env` | Generischer JSON-POST an n8n / Make / Zapier. |

`dryrun` ist bewusst der Default: nichts geht raus, bevor du den Provider
explizit setzt.

---

## Skript-Generierung (optional)

```bash
pip install anthropic pydantic
export ANTHROPIC_API_KEY=...
python3 reelctl.py script --topic "Warum 90 % der KI-Projekte scheitern"
```

Liefert Hook, Body, CTA, 8–12 Hashtags, einen englischen Higgsfield-Prompt und
B-Roll-Notizen als JSON. Das JSON geht direkt weiter:

```bash
python3 reelctl.py render -i export.mp4 --script-json scripts/<name>.json
```

Nutzt `claude-opus-5` mit Structured Outputs. Serverseitige Refusal-Fallbacks
sind nicht aktiviert — für Social-Skripte ist das kein realistischer Fall, und
die `messages.parse`-API bleibt so einfacher.

---

## Aufbau

```
reelctl.py            CLI: script | render | publish | run
run.sh                Wrapper für die komplette Kette
brand.yaml            Marke, Schnitt, Caption-Look, Publishing
reelfactory/
  ffmpeg.py           probe / run / Audio-Extraktion
  config.py           YAML laden, Defaults mischen, validieren
  cut.py              Schnittplan + 9:16-Reframing (Pass A)
  transcribe.py       Whisper / SRT / Skript → Wort-Timings
  captions.py         ASS-Generator: Captions, Hook, CTA
  render.py           Pipeline: Pass A → Transkript → Pass B
  publish.py          dryrun / ayrshare / buffer / webhook
  script_gen.py       Claude API → Skript + Higgsfield-Prompt
```

Der Schnitt läuft in zwei ffmpeg-Durchgängen: erst schneiden, zusammenfügen und
auf 9:16 bringen, dann auf dem geschnittenen Ergebnis transkribieren und die
Captions einbrennen. So stimmen die Wort-Timings automatisch mit dem fertigen
Schnitt überein, statt auf die Rohdatei zu zeigen.

---

## Quellen

- [Buffer API in 2026: Status and Best Alternatives](https://postproxy.dev/blog/what-happened-to-buffer-api-alternatives-for-developers/)
- [Buffer API: docs, pricing, keys, and alternatives (2026)](https://zernio.com/blog/buffer-api)
- [Buffer Developers — Authentication](https://developers.buffer.com/api/authentication/)
- [Best Social Media APIs for Developers & AI Agents (2026)](https://www.blotato.com/blog/best-social-media-api-tools)
- [reap — Video Editing API for Clipping, Captioning & Dubbing](https://reap.video/api)
- [Best AI Caption Generators for Video in 2026](https://reap.video/blog/top-ai-captioning-tools-in-2026)
