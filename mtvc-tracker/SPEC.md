# MTVC – Claude-Code-Prompt: Lead & Conversation Tracker

Diese Datei enthält die vollständige Spezifikation plus einen fertigen Copy-Paste-Prompt für ein separates Claude-Code-Projekt (z. B. lokal oder in einem eigenen Repo). Ein funktionierender MVP wurde bereits parallel gebaut und getestet (siehe `mtvc-tracker.zip`) – dieser Prompt beschreibt denselben Funktionsumfang, damit du ihn bei Bedarf sauber in einem eigenen Repo neu aufsetzen, versionieren oder weiterentwickeln lassen kannst.

---

## 1. Strategische Einordnung

Internes MTVC-Werkzeug (kein Kundenprodukt). Unterstützt die aktuelle Akquisephase: individuelle, recherchierte Erstkontakte, Diagnosegespräche, Follow-ups (siehe MTVC-Prinzip „Erst diagnostizieren, dann verkaufen"). Kein Bestandteil der drei Umsatzsysteme (Nachfrage/Auslastung/Umsatz), sondern Vertriebsinfrastruktur für MTVC selbst.

## 2. Problem

Bei mehreren parallelen, individuell geführten Kontakten über verschiedene Kanäle (Instagram DM, WhatsApp, persönlich) besteht das Risiko, dass Gesprächsstand, Antworten und Follow-ups nicht mehr zentral nachvollziehbar sind und Kontakte „einschlafen".

## 3. Nutzer

Ein einzelner Nutzer (Davor Mitrović, Founder). Kein Mehrbenutzerbetrieb im MVP.

## 4. Gewünschtes Ergebnis

Eine zentrale, schnell einsehbare Übersicht: wer wurde wann wie kontaktiert, was kam zurück, welche Pain Points wurden genannt, was ist der nächste Schritt und wann ist er fällig.

## 5. MVP-Funktionsumfang

- Kontakte anlegen mit: Unternehmen/Name, Segment, Standort, Kontaktweg, Instagram-Handle, persönlicher Bezug (z. B. „ehem. Kontakt aus Zürcher Gastronomie")
- Status-Workflow: Kontaktiert → Geantwortet → Gespräch vereinbart → Diagnose/Audit → Angebot → Kunde / Kein Interesse / Keine Rückmeldung
- Verlauf/Timeline pro Kontakt: chronologische Liste von Interaktionen (Nachricht gesendet, Antwort erhalten, Gespräch geführt, Notiz), jeweils mit Datum und Freitext
- Pain-Point-/Diagnose-Notizfeld pro Kontakt
- Nächster Schritt + Fälligkeitsdatum, überfällige/fällige Schritte visuell hervorgehoben
- Übersichtsliste mit Filter nach Segment, Status, Volltextsuche über Name/Ort/Notizen, Schnellfilter „nur fällige"
- Kontakt löschen (mit Bestätigung)

## 6. Explizit NICHT im MVP

- Kein Login/Mehrbenutzerbetrieb, keine Rechteverwaltung
- Kein automatischer Import aus Instagram/WhatsApp/E-Mail
- Kein Reporting/Dashboard, keine Auswertungsgrafiken
- Keine Automatisierung von Nachrichten (keine Spam-/Automatikfunktion – Personalisierung bleibt zentral, siehe MTVC-Grundsatz)
- Kein Hosting/Deployment-Setup

## 7. Daten/Input

Ausschließlich manuelle Eingabe durch den Nutzer nach jedem Kontakt/Gespräch. Es werden nur Geschäftskontaktdaten verarbeitet (Unternehmen, öffentlich auffindbare Ansprechpartner), keine sensiblen Daten Dritter.

## 8. Output

- Übersichtsliste (Tabelle), filter- und durchsuchbar, sortiert nach Fälligkeit
- Detailansicht pro Kontakt mit editierbaren Stammdaten und chronologischem Verlauf

## 9. User Flow

1. Neuen Kontakt anlegen (inkl. optional erster Nachricht als erster Verlaufseintrag)
2. Nach Antwort/Gespräch: Verlaufseintrag hinzufügen, Status aktualisieren, Pain Point notieren
3. Nächsten Schritt + Datum setzen
4. In der Übersicht per Filter „nur fällige" sehen, wer als Nächstes dran ist

## 10. Designanforderungen

MTVC-Markenwelt konsequent umsetzen:

- Warmes Grau/Off-White als Hintergrund (kein Tiefschwarz)
- Gold als Akzentfarbe (z. B. für primäre Buttons, Hervorhebungen)
- Hochwertige Serifenschrift für Überschriften (z. B. Playfair Display), reduzierte Sans-Serif für Fließtext/UI (z. B. Inter)
- Viel Weißraum, reduzierte Gestaltung, keine bunte/überladene SaaS-Optik
- Mobil nutzbar (responsive, da unterwegs genutzt)
- Funktion vor Dekoration – es ist ein internes Arbeitswerkzeug, kein Verkaufsobjekt

## 11. Technische Anforderungen

- Einfacher Tech-Stack, MVP-Priorität „einfach, schnell, verständlich" vor Skalierbarkeit
- Empfehlung: Python + Flask + SQLite (lokale Datei-Datenbank, kein externer DB-Server nötig) – serverseitig gerenderte Templates (Jinja2), minimales JavaScript
- Single-User-Betrieb lokal, kein Cloud-Backend im MVP
- Struktur so anlegen, dass eine spätere Erweiterung (z. B. Export von Pain Points für das Auslastungs-Audit-Tool, spätere Mehrbenutzerfähigkeit) nicht durch grundlegende Architekturentscheidungen blockiert wird

## 12. Datenschutz-/Sicherheitsanforderungen

Nur Geschäftskontaktdaten, kein besonders sensibler Datenschutzfall. Dennoch: Datenbank nicht öffentlich zugänglich machen, keine Klartext-Zugangsdaten im Repo, `.db`-Datei nicht versionieren (in `.gitignore`).

---

## 13. Fertiger Prompt für Claude Code (zum Kopieren)

```
Baue ein internes Web-Tool namens „MTVC Lead & Conversation Tracker" – ein
Single-User-CRM-MVP zur Verfolgung von Akquise-Kontakten für ein Beauty-/
Ästhetik-B2B-Unternehmen (MTVC, Zürich).

KONTEXT
MTVC führt aktuell individuelle, persönlich recherchierte Erstkontakte zu
Beauty- und Ästhetikunternehmen (Nagelstudios, Kosmetikstudios, medizinisch-
ästhetische Praxen etc.). Ziel des Tools: kein Kontakt darf verloren gehen,
Gesprächsstand und Pain Points müssen jederzeit nachvollziehbar sein.

FUNKTIONSUMFANG (MVP)
- Kontakte anlegen mit Feldern: Unternehmen/Name (Pflicht), Segment
  (Auswahl: Nagelstudio, Wimpernstudio, Kosmetikstudio, Laserstudio,
  Medical Aesthetics, Klinik/mehrere Standorte, Sonstiges), Standort,
  Kontaktweg (Instagram DM, WhatsApp, Persönlich, E-Mail, Sonstiges),
  Instagram-Handle, persönlicher Bezug (Freitext)
- Status-Feld mit festen Werten: Kontaktiert, Geantwortet, Gespräch
  vereinbart, Diagnose/Audit, Angebot, Kunde, Kein Interesse, Keine
  Rückmeldung
- Pro Kontakt eine chronologische Verlaufs-/Timeline-Ansicht mit Einträgen
  (Datum, Typ: Nachricht gesendet / Antwort erhalten / Gespräch geführt /
  Notiz, Freitext-Notiz)
- Pain-Point-/Diagnose-Notizfeld pro Kontakt (Freitext)
- Feld „Nächster Schritt" (Freitext) + Fälligkeitsdatum; in der
  Übersichtsliste sollen fällige/überfällige Schritte visuell hervorgehoben
  werden (z. B. farblich)
- Übersichtsliste aller Kontakte, sortiert nach Fälligkeit (offene, fällige
  zuerst), mit Filtern nach Segment und Status, Volltextsuche über Name/
  Standort/Pain-Point, sowie einem Schnellfilter „nur fällige"
- Kontakt bearbeiten und löschen (mit Bestätigungsdialog beim Löschen)
- Zwei einfache Kennzahlen oben auf der Übersicht: Anzahl aktiver Kontakte
  (nicht „Kunde"/"Kein Interesse"), Anzahl fälliger/überfälliger Schritte

AUSDRÜCKLICH NICHT BAUEN
- Kein Login/Mehrbenutzerbetrieb
- Kein automatischer Import aus Instagram/WhatsApp
- Kein Dashboard/Reporting mit Diagrammen
- Keine automatisierte Nachrichtenversendung
- Kein Deployment-Setup (nur lokal lauffähig)

TECH-STACK
- Python 3 + Flask, serverseitig gerenderte Jinja2-Templates
- SQLite als lokale Datei-Datenbank (Tabellen: contacts, interactions mit
  Fremdschlüssel auf contacts), Schema beim ersten Start automatisch
  anlegen
- Minimales JavaScript (nur wo für UX nötig, z. B. Filterformular)
- `.gitignore` für die SQLite-Datei

DESIGN
Luxuriöse, ruhige Markenwelt statt typischer SaaS-Optik:
- Hintergrund: warmes Grau/Off-White (kein Tiefschwarz)
- Akzentfarbe: warmes Gold
- Headlines in einer hochwertigen Serifenschrift (z. B. „Playfair Display"),
  Fließtext/UI in einer reduzierten Sans-Serif (z. B. „Inter")
- Viel Weißraum, klare Tabellen, keine bunten Diagramme, keine grellen
  Farben
- Responsive/mobil nutzbar

PROJEKTSTRUKTUR
- app.py (Flask-App, Routen, DB-Zugriff)
- templates/ (base.html, index.html, new_contact.html, contact.html)
- static/style.css
- requirements.txt
- README.md mit Setup- und Startanleitung (pip install, python app.py,
  Standardport z. B. 5050) sowie Hinweis, wie das Tool im selben WLAN
  vom Handy aus erreichbar ist

QUALITÄT
- Sauberer, gut lesbarer Code, sinnvolle Kommentare wo nötig
- Grundlegende Validierung (Pflichtfeld Name)
- Kurzer manueller Testdurchlauf der Kernflows (Kontakt anlegen, Verlauf
  hinzufügen, Filtern, Löschen) vor Abschluss

Bitte nach dem Bauen kurz zusammenfassen, was gebaut wurde und wie es
gestartet wird.
```

---

## 14. Hinweis

Der oben beschriebene MVP wurde bereits in dieser Session gebaut, getestet (inkl. Screenshots der Kernansichten) und als lauffähiges Projekt geliefert (`mtvc-tracker.zip`). Dieser Prompt ist für den Fall gedacht, dass du das Tool in einem eigenen, versionierten Repo (z. B. mit Git, eigenem Deployment) sauber neu aufsetzen oder von einer separaten Claude-Code-Instanz weiterentwickeln lassen willst.
