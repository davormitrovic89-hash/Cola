# Briefing für Codex / ChatGPT: Telefonassistent Catering

Stand: 12.10.2026. Verfasst von Claude Code für die Übergabe an Codex oder ChatGPT.

## Worum es geht

Davor Mitrović baut für einen Cateringbetrieb einen eigenen KI-Telefonassistenten. Als Sprachplattform ist vorläufig Retell gewählt; zuerst wird im Browser getestet, eine Schweizer Rufnummer kommt erst später dazu. Fonio bleibt eine mögliche Übergangslösung.

Die erste Version beantwortet Fragen mit freigegebenem Unternehmenswissen und nimmt Anfragen und Rückrufwünsche auf. Sie **bucht nicht** und macht keine verbindlichen Zusagen zu Preis, Verfügbarkeit oder Allergenen. Ziel ist ein begrenzter Pilot bis Ende Oktober 2026.

Grundlage ist das „Startpaket“ vom 12.10.2026. Dessen Regeln sind im Code und in `AGENTS.md` umgesetzt.

## Wo der Code liegt

- Repository: `davormitrovic89-hash/Cola`
- Branch: `claude/telefonassistent-catering` (gepusht, noch kein Pull Request)
- Ordner: `telefonassistent/`
- Der Rest des Repos ist eine unabhängige Cola-Demo-Website (`index.html`, `PROMPT.md`). **Nicht verändern.**

**Bitte zuerst lesen:** `telefonassistent/AGENTS.md` (verbindliche Regeln), danach `README.md` und `retell/einstellungen.md`.

## Ehrlicher Status

Fertig sind Gesprächskonfiguration, Datenvertrag, Integrationsserver und automatisierte Tests. Es gibt **keinen** Retell-Zugang, **kein** Hosting, **keine** Telefonnummer und **keine** durchgeführten Sprachtests.

Den Stand nie als „fertigen Telefonassistenten“ bezeichnen.

Was geprüft ist:

- `npm test`: 28 von 28 Tests bestanden (Node 22)
- Lokaler End-to-End-Durchlauf mit echtem Server und synthetischer Testanfrage hat funktioniert

## Was gebaut wurde

| Pfad | Inhalt |
|---|---|
| `prompt/systemprompt.de.md` | Versionierter Systemprompt mit Platzhalter `{{FIRMENNAME}}`. `npm run prompt` füllt ihn nur mit freigegebenem Namen, sonst Abbruch. `npm run prompt:entwurf` setzt `[FIRMENNAME OFFEN]` ein. |
| `wissen/catering/unternehmen.json` | 13 Angaben mit `wert`, `status` (offen / vorschlag / freigegeben), `quelle`, `freigabedatum`, `oeffentlich`. **Alle noch offen.** „S&D Catering GmbH“ ist nur ein unbestätigter Arbeitsstand. |
| `config/tenants.json` | Mandant `catering` → erlaubte Retell-Agent-IDs (noch leer), Wissensdatei, Benachrichtigungsadapter `vorschau` |
| `retell/save_catering_inquiry.tool.json` | Custom-Function-Definition für Retell. Die URL ist ein Platzhalter. |
| `retell/einstellungen.md` | Geprüfte Fakten, offene Prüfpunkte, empfohlene Agent-Einstellungen |
| `src/` | Integrationsserver, siehe unten |
| `test/` | Automatisierte Tests (`node:test`) |
| `tests/gespraechstests.md` | Protokollvorlage für 24 synthetische Gesprächstests |
| `scripts/` | `wissen`, `prompt`, `anfragen` (Übersicht und erneuter Versand), `test-anfrage` |

### Integrationsserver

Node ≥ 22.13 ohne Laufzeitabhängigkeiten: nur `node:http`, `node:sqlite`, `node:crypto` und `node:test`.

| Datei | Aufgabe |
|---|---|
| `signature.js` | Retell-Signaturprüfung im Format `v=<ts_ms>,d=<hex HMAC-SHA256(apiKey, body+ts)>`, 5 Minuten Toleranz. Nachgebaut aus `retell-sdk` 6.2.5; ein Test vergleicht das Ergebnis mit einem vom SDK erzeugten Wert. |
| `inquiry.js` | Validierung des Datenvertrags `schema_version: 1` (Details unten) |
| `store.js` | SQLite-Ablage (Details unten) |
| `notify.js` | Outbox-Zustellung. Einziger Adapter: `vorschau`, schreibt eine Textdatei nach `data/vorschau/`. Fehler → `failed` mit `last_error`, der nächste Lauf wiederholt. |
| `app.js` | HTTP-Routen und Mandantenprüfung (Details unten) |
| `server.js` | Start des Servers, erneuter Versand alle 5 Minuten |

**Validierung (`inquiry.js`):**

- Gespeichert wird nur mit `caller_confirmed: true`.
- `event_date` nur als gültiges `YYYY-MM-DD`, nicht in der Vergangenheit (Zeitzone Europe/Zurich).
- Die Telefonnummer bleibt als Rohangabe gespeichert. Eine E.164-Form wird nur bei ausdrücklichem `+` oder `00` abgeleitet.
- `tenant_id`, `call_id`, `status` und `schema_version` in den Argumenten werden als manipuliert abgelehnt.
- Der Server berechnet `missing_fields` und den Status: `inquiry_only` (vollständig) oder `inquiry_incomplete`.

**Ablage (`store.js`):**

- Tabellen `inquiries`, `notifications` (Outbox) und `call_events`.
- Eindeutig ist die Kombination aus Mandant, `call_id` und Operation.
- Gleicher Inhalt erneut → `duplicate`, keine neue Benachrichtigung.
- Korrigierter Inhalt → neue Revision mit eigener Benachrichtigung.
- Anfrage und Outbox-Eintrag werden in einer Transaktion geschrieben.

**HTTP-Schnittstelle (`app.js`):**

- `POST /t/<mandant>/retell/functions/save_catering_inquiry`
- `POST /t/<mandant>/retell/webhook` (nur `call_ended` und `call_analyzed`; keine Transkripte oder Anrufernummern speichern)
- `GET /healthz`
- Der Mandant ergibt sich aus dem URL-Pfad **und** der signierten `call.agent_id`.
- Unsignierte Aufrufe nur bei `ALLOW_UNSIGNED_LOCAL=1`, von 127.0.0.1 und nie mit `NODE_ENV=production`; dann auch mit Agent-ID `lokal-test`.

**Antworten an das Sprachmodell:**

- Erfolg: `{gespeichert: true, referenz, status, fehlende_angaben, hinweis}`
- Fachlicher Fehler: HTTP 200 mit `{gespeichert: false, grund}`
- Speicherfehler: HTTP 500
- Falscher Mandant oder Manipulation: 403
- Signatur fehlt oder ist ungültig: 401

## Regeln, die nicht aufgeweicht werden dürfen

- Keine Zusagen zu Buchung, Preis, Kapazität, Allergenfreiheit oder Rückruffrist – weder im Prompt noch im Code.
- `tenant_id`, `call_id` und `status` setzt nur der Server.
- Erfolg erst melden, wenn die Anfrage tatsächlich gespeichert ist. Ein Versandfehler löscht nie eine Anfrage.
- Wissen nur verwenden, wenn `status` „freigegeben“ ist und Quelle und Freigabedatum vorhanden sind. Unbekanntes bleibt `null`. Website-Inhalte nicht automatisch übernehmen.
- Keine Geheimnisse ins Repository oder in den Chat; sie gehören in `.env` oder den Secret Store des Hosters. Nur synthetische Testdaten.
- Kein Versand an Kunden oder Partner. Benachrichtigung nur als Vorschau, bis Davor eine interne Adresse festlegt.
- Weitere Mandanten, Benutzerverwaltung und WhatsApp erst nach dem Pilot.
- Vor jedem Commit `npm test` ausführen. Prompt-Änderungen nur in `prompt/systemprompt.de.md`, mit hochgezählter Version.

## Nicht verifiziert – vor dem ersten Retell-Test prüfen

Die Retell-Online-Doku war in Claudes Umgebung gesperrt. Geprüft wurde nur der Quellcode von `retell-sdk` 6.2.5. Diese Punkte beruhen auf Erfahrungswissen und stehen als Prüfliste in `retell/einstellungen.md`:

1. Name des Signatur-Headers: im Code `x-retell-signature`
2. Welcher API-Schlüssel signiert?
3. Werden Custom-Function-Aufrufe genauso signiert wie Webhooks?
4. Body-Form bei `args_at_root: false`: `{name, call, args}` mit `call.call_id` und `call.agent_id`
5. Sieht das Sprachmodell bei HTTP 500 den Antworttext oder nur einen generischen Fehler?
6. Gibt es eine eigene Einstellung „Audioaufnahme aus“? Laut SDK läuft das nur über `data_storage_setting`, und der Standard ist `everything` mit unbegrenzter Aufbewahrung.

Wenn du die aktuelle Doku erreichst, prüf diese Punkte, korrigier den Code falls nötig und hak sie in `retell/einstellungen.md` ab.

## Offene Entscheidungen bei Davor

1. Unternehmenswissen in `wissen/catering/unternehmen.json` bestätigen, vor allem Firmenname und Rechtsform
2. Retell-Konto anlegen; den Schlüssel nur in `.env` eintragen
3. Hosting wählen: Node mit persistentem Speicher für `data/`
4. Interne Empfängeradresse für Benachrichtigungen festlegen
5. Telefonieanbieter und Schweizer Testnummer wählen (erst nach bestandenem Browsertest)

## Sinnvolle nächste Aufgaben

1. Die offenen Retell-Prüfpunkte gegen die aktuelle Doku klären.
2. Nach der Wahl des Hostings: Deployment-Konfiguration ergänzen, Funktions-URL setzen, Agent-ID in `config/tenants.json` eintragen.
3. Nach der Festlegung der Empfängeradresse: echten Benachrichtigungsadapter in `src/notify.js` ergänzen, z. B. E-Mail. Er gibt bei Erfolg `sent` zurück und wirft bei Fehlern. Dazu Tests schreiben.
4. Browser-Sprachtest begleiten: Stimme und Modell erst nach dem Hörtest festlegen; Ergebnisse in `tests/gespraechstests.md` protokollieren.

## Befehle

```bash
cd telefonassistent
npm test                  # 28 Tests
npm run wissen            # was ist noch offen?
npm run prompt:entwurf    # Prompt-Entwurf nach build/
npm run dev               # lokaler Server, unsignierte Anfragen von 127.0.0.1 erlaubt
npm run test-anfrage      # synthetische Testanfrage senden
npm run anfragen          # Anfragen, Benachrichtigungen, Anrufe ohne Anfrage
```
