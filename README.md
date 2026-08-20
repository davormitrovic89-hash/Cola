# 3D Illusion Demo — Drehende Dose & Hand-Effekt

Zwei 3D-Illusionen im Browser, ohne Runtime-Abhängigkeiten:

1. **Drehende Getränkedose** — ein Zylinder aus 56 schmalen, rotierten
   `<div>`-Segmenten mit CSS-3D-Transforms. Die Beleuchtung wird pro Segment
   aus seinem Winkel zur Lichtquelle berechnet. Mit Drag-to-Rotate (inkl.
   Trägheit) und Auto-Rotation.
2. **Hand greift aus dem Bildschirm** — Perspektive, Parallaxe auf
   Mausbewegung und Schatten-Tiefe, rein in CSS.

## Setup

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install     # Abhängigkeiten installieren (nur Vite, nur zur Entwicklung)
npm run dev     # Dev-Server mit Hot-Reload, öffnet http://localhost:5173
npm run build   # Production-Build nach dist/
npm run preview # den erzeugten Build lokal testen
```

Der Build ist rein statisch — `dist/` kann auf jedem Static-Hosting liegen.

## Projektstruktur

```
index.html                 Markup, lädt src/main.js als ES-Modul
src/
  main.js                  Einstiegspunkt, startet beide Effekte
  styles.css               alle Styles
  can/
    can.js                 Controller der Dose: Zustand, Eingabe, Animationsschleife
    renderer-css.js        CSS-3D-Renderer (Segmente, Deckel, Beleuchtung)
  hand/
    hand.js                Parallaxe und Geräteneigung der Hand-Illusion
  assets/
    can-label.png          Label-Textur der Dose (1600×560)
```

### Austauschbarer Renderer

`can.js` kennt die Dose nur über ein schmales Interface:

```js
{
  mount(hostElement),   // Geometrie aufbauen
  setRotation(degrees), // Drehung um die Y-Achse setzen
  dispose(),            // wieder abbauen
}
```

`renderer-css.js` ist die aktuelle Implementierung. Ein WebGL-Renderer
(Three.js, mit Environment-Map und Metalness/Roughness) kann dieselbe
Schnittstelle implementieren und per `initCan({ renderer })` eingesetzt
werden, ohne dass sich an Eingabe- oder Animationslogik etwas ändert.

## Assets & Marken

Alle Assets sind generisch und markenfrei erzeugt. Die Dose trägt eine
eigene Wortmarke in einer generischen Schrift — kein echtes Markenlogo,
keine geschützten Gestaltungselemente. Beim Ersetzen durch eigene Assets
bitte auf die entsprechenden Lizenzen achten.
