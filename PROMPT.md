# Prompt für Claude Code

Kopiere den folgenden Text komplett und füge ihn in Claude Code (im Terminal, im Projektordner) ein.
Claude Code liest dann automatisch die `index.html` in diesem Ordner und baut darauf auf.

---

```
Ich habe eine Demo-Webseite (index.html) mit zwei 3D-Illusions-Effekten:

1. Eine drehende Getränkedose, gebaut mit reinem CSS 3D (viele schmale
   rotierte Segmente bilden einen Zylinder, mit dynamischer Beleuchtung
   per JavaScript), mit Drag-to-Rotate und automatischer Drehung. Keine
   externen Libraries.
2. Eine "Hand greift aus dem Bildschirm"-Illusion, gebaut mit reinem CSS
   (Perspective, Parallax auf Mausbewegung, Schatten-Tiefe).

Bitte hilf mir, dieses Projekt professionell auszubauen. Gehe Schritt für Schritt vor
und frage nach, wenn dir Informationen fehlen (z. B. Marke, Produktfotos, Zielgruppe).

## Aufgaben, priorisiert:

1. **Projektstruktur aufräumen**
   - Trenne HTML/CSS/JS in eigene Dateien (index.html, styles.css, main.js).
   - Richte ein einfaches Build-Setup mit Vite ein (npm create vite@latest -- --template vanilla),
     damit ich lokal mit Hot-Reload entwickeln kann.

2. **Dose realistischer machen**
   - Aktuell ist die Dose ein reiner CSS-3D-Zylinder (viele rotierte Div-Segmente
     mit einer Bild-Textur als Hintergrund). Das funktioniert überall ohne
     Abhängigkeiten, hat aber Grenzen bei Beleuchtung/Reflexionen.
   - Option A (leichtgewichtig, im CSS-Ansatz bleiben): mehr Segmente für
     glattere Rundung, feinere Beleuchtungsberechnung pro Segment, eigene
     hochauflösende Label-Grafik statt der generischen Platzhalter-Textur,
     Glanzlicht-Layer verstärken, leichte "Kondenstropfen"-Textur überlagern.
   - Option B (mehr Realismus, mehr Aufwand): auf Three.js/WebGL migrieren
     für echte Reflexionen (Environment-Map/HDRI), Materialien mit
     Metalness/Roughness und optional ein glTF-Dosenmodell statt Zylinder-
     Primitiv. Sinnvoll, wenn dir Fotorealismus wichtiger ist als
     Ladezeit/Einfachheit.
   - In beiden Fällen: baue eine sanfte Boden-Reflexion/Schatten unter der Dose.

3. **Hand-Illusion verbessern**
   - Ersetze die SVG-Hand durch ein freigestelltes Foto (PNG mit Alpha-Kanal),
     das ich noch liefere.
   - Verstärke den Tiefeneffekt mit mehreren Ebenen (Loch-Rand, Innenschatten,
     Hand, Fingerspitzen-Highlight) und leichtem Gyroskop-Support fürs Handy
     (bereits als Grundgerüst mit deviceorientation vorhanden — bitte robuster
     machen inkl. iOS-Berechtigungsabfrage für DeviceOrientationEvent.requestPermission()).
   - Füge beim Scrollen in die Sektion eine Eintritts-Animation hinzu (Hand "wächst"
     langsam aus dem Loch heraus), z. B. mit GSAP + ScrollTrigger.

4. **Allgemeine Qualität**
   - Performance: Lazy-Init für die Three.js-Szene erst, wenn die Sektion in den
     Viewport scrollt (IntersectionObserver), damit die Seite auf Mobilgeräten
     schnell lädt.
   - Reduziere die Auflösung/Framerate automatisch auf schwachen Geräten
     (z. B. via navigator.hardwareConcurrency oder devicePixelRatio-Cap).
   - Accessibility: prefers-reduced-motion respektieren (Animationen dann
     deutlich reduzieren/abschalten), sinnvolle alt-Texte, Tastaturbedienbarkeit
     für Buttons.
   - SEO/Meta: Open-Graph-Tags, Meta-Description, Favicon.
   - Responsive Feinschliff für Tablet- und Handy-Breakpoints.

5. **Deployment**
   - Richte ein Deployment auf Vercel oder Netlify ein (vercel.json bzw. netlify.toml),
     inklusive Build-Command für Vite.
   - Erstelle eine kurze README mit Setup-Anleitung (npm install, npm run dev,
     npm run build).

## Wichtig:
- Keine echten Markenlogos, Schutzmarken oder Original-Werbematerial verwenden —
  die Dose bleibt ein generisches "Cola"-Design, es sei denn ich liefere eigene,
  lizenzierte Assets.
- Bitte committe in sinnvollen, kleinen Schritten (git init, falls noch nicht
  geschehen) und erkläre kurz, was sich in jedem Schritt ändert.
- Frage mich zuerst, mit welcher der obigen Aufgaben ich beginnen möchte, bevor
  du alles auf einmal umsetzt.
```

---

## Hinweise zur Nutzung

- Lege die Datei `index.html` (aus diesem Ordner) in ein leeres Projektverzeichnis,
  öffne dort ein Terminal und starte `claude` (Claude Code).
- Füge dann den Prompt oben ein.
- Du kannst den Prompt jederzeit kürzen oder nur einzelne Nummern (z. B. nur "3. Hand-Illusion verbessern") reinkopieren, wenn du gezielt an einem Teil arbeiten willst.
- Eigene Fotos/Logos legst du am besten in einen Ordner `/assets` und erwähnst den Dateinamen im Prompt.
