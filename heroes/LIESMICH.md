# Hero-Vorlagen

Vier austauschbare erste Bildschirmseiten für Kundenentwürfe. Jede ist eine
einzelne HTML-Datei **ohne externe Abhängigkeit** — kein Framework, kein CDN,
keine Schrift über das Netz. Ein Netzwerkaufruf, unter 30 KB.

| Datei | Effekt | Passt zu |
|---|---|---|
| `1-bild-tiefe.html` | Bildebenen mit Parallax | Handwerk, Architektur, Gastronomie, Praxis |
| `2-scroll-text.html` | Satz hellt sich Wort für Wort auf | Treuhand, Anwalt, Beratung, Arzt |
| `3-shader-verlauf.html` | fliessender WebGL-Verlauf | Agentur, IT, Startup, Coaching |
| `4-produkt-3d.html` | drehbares Produkt in echtem 3D | Getränke, Kosmetik, Handel, Manufaktur |

## Anpassen

Pro Datei nur zwei Stellen:

1. der Block `KONFIG` im `<script>` — Texte, Knöpfe, Bildpfade
2. die Farbwerte in `:root` ganz oben im `<style>`

Wörter in `*Sternchen*` erscheinen in der Akzentfarbe.

Rechne mit einer Stunde für den ersten Entwurf, zwanzig Minuten für jeden
weiteren.

## Was alle vier mitbringen

- `prefers-reduced-motion` wird respektiert — Animationen entfallen dann,
  die Inhalte bleiben vollständig lesbar
- gerechnet wird nur, solange der Hero im Sichtbereich ist
  (`IntersectionObserver`)
- Pixeldichte gedeckelt, damit Retina-Bildschirme nicht das Vierfache rechnen
- Tastaturfokus ist sichtbar, Knöpfe sind bedienbar
- kein seitliches Scrollen auf Handybreite

## Übersicht bauen

```bash
node tools/galerie.mjs      # erzeugt heroes/galerie.html
```

## Vor dem Verschicken

Entwürfe mit fremden Marken hinter ein Passwort legen, nicht indexieren
lassen, nicht ins öffentliche Portfolio stellen.
