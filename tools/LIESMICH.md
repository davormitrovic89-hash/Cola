# Werkzeuge

## `audit.mjs` — Webseite messen

```bash
npm install
node tools/audit.mjs https://beispiel.ch
node tools/audit.mjs --liste firmen.txt
```

Lädt die Seite zweimal: einmal als iPhone über eine gedrosselte
Mobilfunkverbindung (1,6 Mbit/s, 150 ms Latenz, vierfach langsamere CPU — die
Bedingungen, unter denen auch Google PageSpeed Insights misst), einmal als
Desktop. Schreibt nach `audits/<domain>/`:

- `daten.json` — alle Messwerte und die Befundliste
- `handy.jpg`, `desktop.jpg` — Bildschirmfotos des ersten Bildschirms

Hinter einem Proxy zusätzlich `NODE_USE_ENV_PROXY=1` setzen.

## `bericht.mjs` — Kurzanalyse erzeugen

```bash
node tools/bericht.mjs audits/beispiel.ch \
  --firma "Muster AG" \
  --domain "muster-ag.ch" \
  --absender "Davor Mitrovic" \
  --kontakt "mail@example.ch · 8000 Zürich"
```

Erzeugt `audits/<domain>/bericht.html`: eine einseitige, versandfertige
Analyse mit eingebetteten Bildschirmfotos. Im Browser über „Drucken → Als PDF
sichern“ wird daraus ein PDF.

Die Formulierungen für den Kunden stehen im Katalog oben in `bericht.mjs` —
dort anpassen, nicht im Messwerkzeug.

## `beispiel/` — Testmaterial

`beispiel/muster-ag/` ist eine **frei erfundene** Firmenseite im Stil der
frühen 2010er-Jahre, um die Werkzeuge zu testen, ohne fremde Seiten
anzufassen. Siehe `beispiel/muster-ag/LIESMICH.md`.

```bash
node tools/beispiel/erzeuge-bilder.mjs   # Bilder erzeugen
npm run beispiel                          # auf Port 8081 ausliefern
node tools/audit.mjs http://127.0.0.1:8081/index.html
```
