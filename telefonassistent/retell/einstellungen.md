# Retell – Einstellungen und offene Prüfpunkte

Stand 12.10.2026. Es ist noch kein Retell-Konto verbunden. Nichts davon wurde gegen ein echtes Konto getestet.

## Was geprüft ist

Quelle: offizielles npm-Paket `retell-sdk` 6.2.5 (veröffentlicht 09.10.2026), Quellcode gelesen. Die Online-Doku war aus dieser Arbeitsumgebung nicht erreichbar.

| Punkt | Stand im SDK | Umsetzung hier |
|---|---|---|
| Signaturformat | `v=<timestamp_ms>,d=<hex HMAC-SHA256(apiKey, body + timestamp)>`, Toleranz 5 Minuten (`src/lib/webhook_auth.ts`) | `src/signature.js`, mit SDK-Referenzwert getestet |
| Custom Function | `type: "custom"`, `url`, `parameters` (JSON Schema), `args_at_root`, `speak_during_execution`, `speak_after_execution`, `timeout_ms`, `max_retry` (0–5, nur bei idempotentem Endpunkt) | `retell/save_catering_inquiry.tool.json`; Endpunkt ist idempotent, daher `max_retry: 1` |
| Webhook-Ereignisse | Standard: `call_started`, `call_ended`, `call_analyzed` | Server wertet nur `call_ended`/`call_analyzed` aus |
| Datenspeicherung bei Retell | `data_storage_setting`: `everything` (Standard!), `everything_except_pii`, `basic_attributes_only`; `data_storage_retention_days` 1–730 (sonst unbegrenzt) | siehe Empfehlung unten |
| Höchstdauer | `max_call_duration_ms`, Standard 1 Stunde, min. 1 Minute | Empfehlung unten |

## Vor dem ersten Test in der aktuellen Retell-Doku bestätigen

Diese Punkte stammen aus Erfahrungswissen und nicht aus dem SDK. Vor dem ersten Test bestätigen und hier abhaken:

- [ ] Name des Signatur-Headers: im Code `x-retell-signature`
- [ ] Welcher API-Schlüssel signiert (Konto-Schlüssel / Schlüssel mit Webhook-Kennzeichnung)?
- [ ] Werden Custom-Function-Aufrufe genauso signiert wie Webhooks?
- [ ] Body-Form der Custom Function bei `args_at_root: false`: `{ "name", "call", "args" }` mit `call.call_id` und `call.agent_id`
- [ ] Bekommt das Sprachmodell bei HTTP 500 den Antworttext (`gespeichert: false`) oder nur einen generischen Fehler? Im Browsertest „Speicherung schlägt fehl“ prüfen.
- [ ] Gibt es eine eigene Einstellung „Audioaufnahme aus“? Im SDK ist keine eigene Einstellung erkennbar. Aufnahmen werden über `data_storage_setting` gesteuert.

## Empfohlene Agent-Einstellungen für den Pilot

- **Sprache:** Deutsch. Sprachmodell und Stimme erst nach einem Hörtest festlegen (nicht vorab wählen).
- **Systemprompt:** Inhalt von `build/systemprompt-catering.txt` (`npm run prompt`).
- **Wissensbasis:** nur `build/wissensbasis-catering.md` (`npm run wissen:export`). Keine Website automatisch anbinden.
- **Funktion:** `save_catering_inquiry` aus der JSON-Datei. Die `url` erst nach Wahl des Hostings eintragen.
- **Weiterleitung an Menschen:** erst aktivieren, wenn sie konfiguriert und getestet ist. Bis dahin keine Transfer-Funktion anlegen.
- **Webhook-URL:** `https://<host>/t/catering/retell/webhook`.
- **`max_call_duration_ms`:** Vorschlag 600000 (10 Minuten), damit lange Gespräche die Kosten nicht treiben.
- **Datenspeicherung:**
  - Synthetische Browsertests: `everything` mit `data_storage_retention_days` z. B. 7, damit die Gespräche ausgewertet werden können.
  - Echte Kundengespräche: vorher entscheiden. Vorschlag: `basic_attributes_only` (keine Transkripte und Aufnahmen bei Retell). Auch dann verarbeitet Retell während des Gesprächs personenbezogene Daten.
- **Nach dem Anlegen:** die Agent-ID in `config/tenants.json` unter `retell_agent_ids` eintragen. Ohne diesen Eintrag lehnt der Server alle signierten Aufrufe mit 403 ab.
