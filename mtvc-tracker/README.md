# MTVC Lead & Conversation Tracker

Internes Akquise-Werkzeug für MTVC. Ein Nutzer, lokal betrieben, ohne Login und
ohne Cloud. Zweck: Bei mehreren parallel laufenden, individuell geführten
Erstkontakten (Instagram DM, WhatsApp, persönlich) bleibt jederzeit
nachvollziehbar, wer wann wie angesprochen wurde, was zurückkam, welche Pain
Points genannt wurden und welcher Schritt als Nächstes fällig ist.

Kein Kundenprodukt, kein Bestandteil der drei Umsatzsysteme – Vertriebs-
infrastruktur für MTVC selbst.

## Setup (einmalig)

Voraussetzung: Python 3.9 oder neuer.

```bash
cd mtvc-tracker
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Starten

```bash
python3 app.py
```

Dann im Browser öffnen: <http://localhost:5050>

Die Datenbank (`mtvc_tracker.db`, SQLite) wird beim ersten Start im
Projektordner automatisch angelegt. Ein anderer Port oder Speicherort geht per
Umgebungsvariable:

```bash
PORT=5060 MTVC_DB_PATH=~/mtvc/tracker.db python3 app.py
```

## Vom Handy aus nutzen (gleiches WLAN)

Die App lauscht auf `0.0.0.0`, ist im lokalen Netz also direkt erreichbar:

1. Auf dem Rechner, auf dem die App läuft, die lokale IP herausfinden
   (macOS/Linux: `ipconfig getifaddr en0` bzw. `hostname -I`; Windows:
   `ipconfig` → IPv4-Adresse). Meist etwas wie `192.168.x.x`.
2. Auf dem Handy im selben WLAN aufrufen: `http://<diese-IP>:5050`

Zugriff von unterwegs bräuchte ein Hosting – bewusst nicht Teil des MVP.

## Funktionsumfang

- **Kontakte anlegen**: Unternehmen/Name (Pflichtfeld), Segment, Standort,
  Kontaktweg, Instagram-Handle, persönlicher Bezug. Die Erstansprache kann
  direkt als erster Verlaufseintrag mitgegeben werden.
- **Status-Workflow**: Kontaktiert → Geantwortet → Gespräch vereinbart →
  Diagnose/Audit → Angebot → Kunde / Kein Interesse / Keine Rückmeldung.
- **Verlauf pro Kontakt**: chronologische Timeline aus Einträgen mit Datum, Typ
  (Nachricht gesendet / Antwort erhalten / Gespräch geführt / Notiz) und
  Freitext.
- **Pain Point / Diagnose-Notizen** als eigenes Feld pro Kontakt.
- **Nächster Schritt + Fälligkeitsdatum**: überfällige Schritte werden rot,
  heute fällige gold markiert – in der Liste und in der Detailansicht.
- **Übersicht**: sortiert nach Fälligkeit (offene Schritte zuerst), Filter nach
  Segment und Status, Volltextsuche über Name, Standort, Pain Point,
  persönlichen Bezug, nächsten Schritt und **alle Verlaufsnotizen**, plus
  Schnellfilter „nur fällige".
- **Zwei Kennzahlen** oben: aktive Kontakte (alles ausser Kunde / Kein
  Interesse) und fällige bzw. überfällige Schritte. Beide immer über den
  Gesamtbestand, unabhängig vom gesetzten Filter.
- **Bearbeiten und Löschen** (Löschen mit Bestätigungsdialog; Verlaufseinträge
  werden per Fremdschlüssel mitgelöscht).

## Bewusst nicht enthalten (MVP-Scope)

Kein Login/Mehrbenutzerbetrieb, kein automatischer Import aus
Instagram/WhatsApp/E-Mail, kein Reporting/Dashboard mit Diagrammen, keine
automatisierte Nachrichtenversendung (Personalisierung bleibt zentral), kein
Deployment-Setup.

## Tests

Smoke-Tests der Kernflows (anlegen, Verlauf, Status, Filter, löschen) laufen
gegen eine temporäre Datenbank, ohne laufenden Server:

```bash
python3 tests/test_flows.py
```

Ausgabe pro Test `ok` / `FAIL`; Exit-Code 1 bei Fehlern. Mit installiertem
pytest funktioniert alternativ `pytest tests/`.

## Datenschutz

Verarbeitet werden nur Geschäftskontaktdaten (Unternehmen, öffentlich
auffindbare Ansprechpartner). Trotzdem:

- `mtvc_tracker.db` ist über `.gitignore` vom Repo ausgeschlossen und gehört
  nicht in ein Cloud-Backup ohne Verschlüsselung.
- Es liegen keine Zugangsdaten im Repo. Der Session-Key für Hinweismeldungen
  wird bei jedem Start neu erzeugt oder aus `MTVC_SECRET_KEY` gelesen.
- Die App ist für den Betrieb im eigenen Netz gedacht. `debug=True` ist nur für
  den lokalen Gebrauch – bei einem späteren Hosting muss das aus und ein
  richtiger WSGI-Server davor.

## Projektstruktur

```
mtvc-tracker/
├── app.py                 Flask-App: Routen, Validierung, DB-Zugriff, Schema
├── templates/
│   ├── base.html          Rahmen, Navigation, Hinweismeldungen
│   ├── index.html         Übersicht mit Kennzahlen, Filtern, Liste
│   ├── new_contact.html   Formular „Neuer Kontakt"
│   ├── contact.html       Detailansicht: Stammdaten + Verlauf + Löschen
│   └── 404.html           Kontakt nicht gefunden
├── static/style.css       Gestaltung (Off-White, Gold, Playfair/Inter)
├── tests/test_flows.py    Smoke-Tests der Kernflows
├── requirements.txt
└── .gitignore             schliesst die SQLite-Datei aus
```

Die App ist als Factory (`create_app(db_path=…)`) aufgebaut und die Datenhaltung
liegt hinter wenigen Funktionen. Spätere Ausbaustufen – Export der Pain Points
für das Auslastungs-Audit-Tool, Erinnerungen bei fälligen Schritten, echter
Mehrbenutzerbetrieb – sind damit nicht durch Architekturentscheidungen
blockiert.

## Design

Warmes Off-White als Hintergrund statt Tiefschwarz, Gold als einziger Akzent,
Playfair Display für Überschriften, Inter für UI und Fliesstext, viel
Weissraum. Auf dem Handy wird die Tabelle zur Kartenliste. Die Schriften kommen
von Google Fonts; ohne Internet greifen die System-Fallbacks – funktional
bleibt alles gleich.
