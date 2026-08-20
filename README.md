# 3D Illusion Demo — Drehende Dose & Hand-Effekt

Zwei 3D-Illusionen im Browser, ohne Runtime-Abhängigkeiten:

1. **Drehende Getränkedose** — maßstabsgetreue 330-ml-Dose in WebGL, die
   aus einer Werbetafel nach vorne kippt (anamorphe Billboard-Illusion).
   Mit Drag-to-Rotate inkl. Trägheit und Auto-Rotation.
2. **Hand greift aus dem Bildschirm** — ein freigestelltes Foto in vier
   gestaffelten Ebenen (Lochrand, Schatten, Hand, Glanzlicht), die sich
   unterschiedlich schnell gegen die Mausbewegung verschieben.

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
    can-mesh.js            Geometrie der Dose (Boden, Körper, Deckel, Lasche)
    renderer-three.js      WebGL-Renderer mit Billboard-Szene
  three/
    studio-env.js          Environment-Map, zur Laufzeit gezeichnet
  hand/
    hand.js                Ebenen-Parallaxe und Geräteneigung
  assets/
    can-label.png          Label-Textur der Dose (1600×560)
    hand.webp              Freigestelltes Handfoto mit Alphakanal
tools/
  cutout_hand.py           Freistell-Werkzeug für eigene Handfotos
```

## Eigenes Handfoto einsetzen

Fotografiere deine Hand vor einem möglichst gleichmäßigen Hintergrund,
der sich farblich von Haut unterscheidet, und lass sie freistellen:

```bash
pip install numpy pillow scipy
python3 tools/cutout_hand.py mein-foto.jpg src/assets/hand.webp
```

Das Werkzeug trennt Haut vom Hintergrund über den auf die Helligkeit
normierten **Grünanteil**. Der naheliegende Weg — „was rötlich ist, ist
Haut" — scheitert an den Fingernägeln, die blass sind und im Rotanteil
mit dem Boden verschmelzen. Im Grünanteil trennt dagegen alles sauber,
und weil normiert wird, hält die Schwelle auch dort, wo das Bild dunkel
wird.

Passt die Schwelle für dein Foto nicht, sind `GREEN_THRESHOLD` und
`MIN_LUMA` oben in der Datei die beiden Stellschrauben.

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
