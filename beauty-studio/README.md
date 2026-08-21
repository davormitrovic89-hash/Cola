# Maison Éclat — Landingpage (Demo)

Single-Page-Landingpage für ein fiktives Beauty-Studio in Zürich.
Dark Canvas, Spline-3D im Hero, GSAP-ScrollTrigger-Inszenierung, Lenis Smooth Scroll.

**Kein Build-Step.** Drei Dateien, alle Libraries über CDN.

```
beauty-studio/
├── index.html      # Struktur, Meta/OG-Tags, CDN-Einbindungen, JSON-LD
├── styles.css      # Design-Tokens, Layout, 3D-Bühne, CSS-Fallback-Objekt
├── script.js       # Lenis, ScrollTrigger-Effekte, Spline-Loader, Formular
├── netlify.toml    # Deploy-Konfiguration Netlify
└── vercel.json     # Deploy-Konfiguration Vercel
```

---

## 1. Lokal starten

Die Seite braucht einen HTTP-Server (`file://` blockiert ES-Module und damit den
Spline-Viewer):

```bash
cd beauty-studio
python3 -m http.server 8080
#  oder:  npx serve .
#  oder:  npx live-server .
```

→ <http://localhost:8080>

---

## 2. Eigene Spline-Szene einbinden

Die 3D-Szene hängt an **einem einzigen Attribut** in `index.html`:

```html
<div class="stage" id="splineStage"
     data-spline-url="https://prod.spline.design/XXXXXXXX/scene.splinecode">
```

So kommen Sie an Ihre URL:

1. Szene in [spline.design](https://spline.design) bauen oder aus der Community
   kopieren (*Community → Szene öffnen → Remix*).
2. **Export → Web / Code**, Variante **Viewer** wählen.
3. Spline zeigt eine URL im Format
   `https://prod.spline.design/<id>/scene.splinecode` — diese in
   `data-spline-url` eintragen. Fertig, kein weiterer Code nötig.

Alternativ als `<iframe>` (kein JS, dafür kein Zugriff auf Szenen-Variablen) —
statt des `<div class="stage">`-Inhalts:

```html
<iframe src="https://my.spline.design/<id>/" frameborder="0"
        loading="lazy" title="3D-Szene"></iframe>
```

> **Hinweis zur mitgelieferten Demo-URL:** in `index.html` steht eine öffentliche
> Community-Szene als Platzhalter. Sie war aus der Build-Umgebung heraus nicht
> erreichbar und ist damit **nicht verifiziert**. Läuft sie nicht, greift
> automatisch der CSS-Fallback (siehe unten) — die Seite bleibt intakt. Für den
> produktiven Einsatz in jedem Fall die eigene Szenen-URL eintragen.

### Rotation per Scroll steuern

`script.js` schiebt den Scroll-Fortschritt (0–1) laufend in die Szene:

```js
app.setVariable("scrollProgress", progress);
```

Damit das wirkt, in Spline eine Variable anlegen:

*Variables → + → Name `scrollProgress`, Typ `Number`, Default `0`* — und sie über
einen **Variable-Event** an die Y-Rotation des Objekts binden. Existiert die
Variable nicht, wird der Aufruf still verworfen; nichts bricht.

### Fallback-Objekt

Solange Spline nicht geladen ist — oder gar nicht geladen wird — steht ein reines
CSS-Objekt (`#orb` in `styles.css`) auf der Bühne, das ebenfalls auf den
Scroll-Fortschritt reagiert. Spline wird **absichtlich nicht geladen** bei:

* `prefers-reduced-motion: reduce`
* aktiviertem Datensparmodus (`navigator.connection.saveData`)
* `deviceMemory <= 4 GB` oder 2G-Verbindung

Nach 9 Sekunden ohne `load-complete` bleibt ebenfalls der Fallback stehen.

### Spline-Logo

Die kostenlose Spline-Stufe blendet ein eigenes Logo in die Szene ein. Für den
produktiven Einsatz braucht der Kunde einen bezahlten Spline-Plan.

---

## 3. Die Scroll-Effekte

Alle vier Effekte laufen über `ScrollTrigger.create()` in `script.js`:

| Section      | Effekt                                     | Umsetzung                                              |
|--------------|--------------------------------------------|--------------------------------------------------------|
| Hero         | Intro-Fade, 3D-Bühne blendet aus           | `gsap.timeline()` + `scrub`-Trigger auf `#hero`        |
| Features     | Gestaffeltes Fade-In (opacity + translateY)| `stagger: 0.16`, `once: true`                          |
| Social Proof | Horizontaler Parallax, zwei Reihen         | `scrub: 1`, gegenläufiges `x`, `invalidateOnRefresh`   |
| Pricing      | Scale 0.95 → 1                             | `scrub: 0.6` pro Karte                                 |
| Outro        | Zeilenweiser Mask-Reveal                   | SplitType `lines` + `overflow: hidden`-Wrapper         |

Smooth Scroll (Lenis) teilt sich den GSAP-Ticker — kein zweiter rAF-Loop:

```js
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

Der Outro-Reveal wird erst nach `document.fonts.ready` gesplittet (sonst brechen
die Zeilen mit der Fallback-Schrift um) und bei echten Breiten­änderungen neu
aufgebaut.

**Reduced Motion:** bei `prefers-reduced-motion: reduce` werden alle Elemente
direkt im Endzustand gesetzt, Lenis bleibt aus, Spline lädt nicht.

---

## 4. Formular scharfschalten

`script.js` validiert clientseitig und zeigt eine Demo-Bestätigung. Für echten
Versand eine der drei Varianten:

**Netlify Forms** — in `index.html`:

```html
<form class="form" id="bookingForm" name="booking" method="POST" data-netlify="true">
  <input type="hidden" name="form-name" value="booking" />
```
…und in `script.js` das `event.preventDefault()` im Submit-Handler entfernen.

**Formspree** — `<form action="https://formspree.io/f/XXXX" method="POST">`.

**Eigene API** — im Submit-Handler statt der Demo-Meldung:

```js
await fetch("/api/booking", { method: "POST", body: new FormData(form) });
```

---

## 5. Deployment

Beide Konfigurationen liegen im Ordner. Wichtig: Dieses Repository enthält im
Root noch ein anderes Projekt — als **Root-/Publish-Verzeichnis `beauty-studio`**
angeben.

### Netlify

```bash
npm i -g netlify-cli
cd beauty-studio
netlify deploy --prod --dir .
```

Über die UI: *Add new site → Import from Git* → Build command leer lassen,
**Publish directory: `beauty-studio`**. `netlify.toml` setzt Cache- und
Security-Header.

### Vercel

```bash
npm i -g vercel
cd beauty-studio
vercel --prod
```

Über die UI: *New Project* → Framework Preset **Other**, **Root Directory:
`beauty-studio`**, Build Command leer.

### GitHub Pages

`Settings → Pages → Deploy from a branch`. Da Pages nur Root oder `/docs`
ausliefert, den Ordner nach `docs/` kopieren oder die drei Dateien ins Root legen.

---

## 6. Performance

Gemessen ohne Bilder — die Seite kommt komplett ohne Rasterbilder aus (Icons und
Logos sind Inline-SVG bzw. Text).

| Ressource                      | Größe (gzip)      | Laden                          |
|--------------------------------|-------------------|--------------------------------|
| `index.html`                   | 5.2 KB            | sofort                         |
| `styles.css`                   | 5.6 KB            | render-blocking (gewollt)      |
| `script.js`                    | 4.7 KB            | `defer`                        |
| GSAP + ScrollTrigger           | 45 KB             | `defer`                        |
| Lenis + SplitType              | 9 KB              | `defer`                        |
| Inter + Playfair (Subset latin)| ~125 KB           | `display=swap`, `preconnect`   |
| Spline-Viewer + Szene          | 1–3 MB            | **erst nach `window.load`**    |

Kritischer Pfad bis zum ersten Frame: rund **16 KB** (HTML + CSS), danach die
Schriften. Die Spline-Szene ist das einzige schwere Asset und liegt bewusst
hinter dem `load`-Event.

Damit ist das LCP-Element (die Hero-Headline) nur von HTML, CSS und der Schrift
abhängig; der schwere 3D-Renderer wird bewusst erst nach dem `load`-Event
nachgezogen und blockiert weder FCP noch LCP.

Weitere Hebel für die Produktion:

* Szene in Spline abspecken (Polycount, Texturgrößen) — der größte Faktor.
* Fonts selbst hosten (`woff2`, nur `latin`) statt über Google Fonts.
* Libraries lokal ablegen und mit `Cache-Control: immutable` ausliefern.

---

## 7. Anpassen

Alle Farben, Abstände und Schriften liegen als CSS-Custom-Properties in
`:root` (`styles.css`):

```css
--bg: #0b0b0f;        /* Canvas          */
--ink: #f5f5f7;       /* Text            */
--accent: #e6c8a6;    /* Champagner      */
--stage-h: min(34svh, 300px);   /* Höhe der 3D-Bühne auf Mobile */
--header-h: 64px;     /* 78px ab 900px   */
```

Studio, Adresse, Preise und Partnerlogos sind erfunden und stehen direkt im
Markup von `index.html`.
