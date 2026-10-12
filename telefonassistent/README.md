# Telefonassistent Catering

Eigene Integration für einen KI-Telefonassistenten auf Basis von Retell. Er beantwortet Fragen mit freigegebenem Unternehmenswissen und nimmt Anfragen und Rückrufwünsche auf. Er bucht nicht und sagt nichts verbindlich zu.

> **Stand 12.10.2026:** Gesprächsregeln, Datenvertrag, Serverfunktion und automatisierte Tests sind vorbereitet. Es gibt **keinen** Retell-Zugang, **keinen** Telefonanschluss, **kein** Hosting und **keine** durchgeführten Sprachtests. Das ist noch kein fertiger Telefonassistent.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `prompt/systemprompt.de.md` | Versionierter Systemprompt mit Platzhalter `{{FIRMENNAME}}` |
| `wissen/catering/unternehmen.json` | Unternehmenswissen mit Status, Quelle und Freigabedatum je Angabe (aktuell alles offen) |
| `config/tenants.json` | Mandanten → erlaubte Retell-Agent-IDs, Wissensdatei, Benachrichtigungsadapter |
| `retell/save_catering_inquiry.tool.json` | Funktionsdefinition für den Retell-Agenten |
| `retell/einstellungen.md` | Geprüfte Fakten, offene Prüfpunkte, empfohlene Agent-Einstellungen |
| `src/` | Integrationsserver (Signaturprüfung, Validierung, SQLite-Ablage, Outbox) |
| `test/` | Automatisierte Tests (`npm test`) |
| `tests/gespraechstests.md` | Protokollvorlage für mindestens 20 Gesprächstests |

## Einrichtung auf dem MacBook

Voraussetzung: Node.js 22.13 oder neuer (`node --version`). Es gibt keine weiteren Abhängigkeiten, `npm install` ist nicht nötig.

```bash
cd telefonassistent
cp .env.example .env      # Schlüssel erst eintragen, wenn ein Retell-Konto besteht
npm test                  # automatisierte Tests
npm run wissen            # Übersicht: welche Angaben sind noch offen?
npm run prompt:entwurf    # Prompt-Entwurf nach build/ (Firmenname als [OFFEN] markiert)
```

Lokal ohne Retell ausprobieren (nur synthetische Daten):

```bash
npm run dev               # Server mit erlaubten unsignierten Anfragen von 127.0.0.1
npm run test-anfrage      # zweites Terminal: Testanfrage senden
npm run anfragen          # Anfragen, Benachrichtigungsstatus, Anrufe ohne Anfrage
```

Die Benachrichtigungsvorschau liegt danach unter `data/vorschau/`.

## Schnittstellen

- `POST /t/<mandant>/retell/functions/save_catering_inquiry`: Custom Function für Retell
- `POST /t/<mandant>/retell/webhook`: Anrufereignisse (`call_ended`, `call_analyzed`)
- `GET /healthz`

Antwort der Funktion an das Sprachmodell: `{ "gespeichert": true, "referenz": …, "status": …, "fehlende_angaben": [...] }`. Im Fehlerfall: `{ "gespeichert": false, "grund": … }`.

Mögliche Gründe:

- `nicht_bestaetigt`
- `datum_unklar`
- `datum_in_vergangenheit`
- `telefonnummer_unklar`
- `ungueltiges_feld`
- `speicherfehler` (HTTP 500)

## Verhalten des Servers

- **Signatur:** Jeder Aufruf braucht eine gültige Retell-Signatur (HMAC-SHA256, 5 Minuten Toleranz). Unsignierte Aufrufe gibt es nur bei `ALLOW_UNSIGNED_LOCAL=1`, von 127.0.0.1 und nicht mit `NODE_ENV=production`.
- **Mandant:** Er ergibt sich aus dem URL-Pfad und der signierten `agent_id`. Versucht das Sprachmodell, `tenant_id`, `call_id`, `status` oder `schema_version` mitzuschicken, wird der Aufruf abgelehnt (403).
- **Deduplizierung:** Pro Mandant, Call-ID und Operation wird nur ein Eintrag gespeichert. Kommt derselbe Inhalt erneut, entsteht keine neue Anfrage und keine neue Benachrichtigung. Ein korrigierter Inhalt erzeugt eine neue Revision. Gespeichert bleiben nur die korrigierten Angaben.
- **Speicherung:** Anfrage und Benachrichtigungsauftrag werden in einer Transaktion geschrieben. Die Erfolgsmeldung kommt erst nach dem Commit.
- **Benachrichtigung:** Sie läuft über eine Outbox mit den Status `pending`, `preview`, `sent` und `failed`. Nach einem Fehler wird automatisch alle 5 Minuten erneut versucht. Von Hand: `npm run anfragen -- --erneut-senden`.
- **Telefonnummer:** Sie bleibt als bestätigte Rohangabe gespeichert. Eine E.164-Form wird nur abgeleitet, wenn die Person ausdrücklich `+` oder `00` genannt hat.
- **Datenschutz:** Transkripte und Anrufernummern aus Webhooks werden nicht gespeichert.

## Datenvertrag (schema_version 1)

Der Vertrag entspricht dem Startpaket mit drei Ergänzungen:

- `declined_fields`: Angaben, die die Person ausdrücklich verweigert hat
- `missing_fields`: vom Server berechnet
- `callback_number_e164`: vom Server abgeleitet

`status` ist `inquiry_only` (vollständig) oder `inquiry_incomplete`.

## Nächste Schritte (brauchen Davor)

1. Unternehmenswissen in `wissen/catering/unternehmen.json` bestätigen: Wert, `status: "freigegeben"`, Quelle und Freigabedatum.
2. Retell-Konto anlegen. Den Schlüssel nur in `.env` eintragen, nicht in den Chat.
3. Den Dokumentationsabgleich in `retell/einstellungen.md` lesen: Signatur und Datenformat sind bestätigt; echte Verbindung, Fehlerreaktionen und Speichereinstellungen bleiben zu testen. `RETELL_API_KEY` muss für Webhooks der im Dashboard markierte Signaturschlüssel sein.
4. Hosting wählen: Node mit persistentem Speicher für `data/`. Dann die Funktions-URL setzen und die Agent-ID in `config/tenants.json` eintragen.
5. Browser-Sprachtest durchführen und Stimme und Modell nach Hörtest festlegen. Die Gesprächstests in `tests/gespraechstests.md` protokollieren.
6. Interne Empfängeradresse festlegen. Dann den Benachrichtigungsadapter ergänzen (aktuell nur Vorschau).
7. Erst danach den Telefonieanbieter und eine Testnummer anbinden.
