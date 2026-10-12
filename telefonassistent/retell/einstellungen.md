# Retell – Einstellungen und offene Prüfpunkte

Stand 12.10.2026. Codex hat die offizielle Online-Dokumentation und den Branch `claude/telefonassistent-catering` (Basis `1d92c2d`) geprüft. Kein Retell-Konto verbunden, keine Sprachtests durchgeführt. Dokumentationsabgleich ist keine Abnahme einer echten Verbindung.

## Die sechs Prüfpunkte aus der Übergabe

| Nr. | Ergebnis des Dokumentationsabgleichs | Umsetzung / Restprüfung |
|---|---|---|
| 1 | Bestätigt: Header `X-Retell-Signature`; in Node kleingeschrieben. [1] | `SIGNATURE_HEADER` passt. |
| 2 | Bestätigt für Webhooks: den im Dashboard als Webhook Key markierten API-Schlüssel verwenden. [1][4] | `.env.example` präzisiert. Die Custom-Function-Doku nennt einen API-Schlüssel, aber keinen gesonderten Auswahlmechanismus: Zuordnung beim echten Aufruf verifizieren. |
| 3 | Bestätigt: Custom Functions verwenden ebenfalls `Retell.verify` über den Originalbody und den Signatur-Header. [2] | Prüfung vereinheitlicht; Neu-Serialisierung entfernt. |
| 4 | Bestätigt: bei ausgeschaltetem Args-only-Modus enthält der Body `name`, `call`, `args`, einschliesslich `call.call_id` und `call.agent_id`. [2] | `args_at_root: false` bleibt; Agent-ID noch einzutragen. |
| 5 | Teilweise geklärt: Fehler gehen an das Modell; eine unveränderte Durchgabe des HTTP-500-Bodys ist nicht zugesichert. [2] | Prompt Version 2 behandelt generische Fehler/Timeouts. Exakten Fehlerinhalt und gesprochene Reaktion live testen. |
| 6 | Dokumentiert ist `data_storage_setting`; ein eigener Recording-off-Schalter ist in den geprüften Seiten nicht belegt. [3][5] | `basic_attributes_only` verhindert dauerhafte Transkript-/Aufnahmespeicherung. Das garantiert nicht, dass keine temporäre Aufnahme entsteht: Webhooks können solche Daten samt kurzlebigem Aufnahmelink erhalten. [5] |

## Signaturprüfung

Format und HMAC-SHA256 stimmen mit dem bisherigen SDK-Abgleich überein: `v=<timestamp_ms>,d=<hex>`, Originalbody plus Zeitstempel, fünf Minuten Toleranz. Ausschliesslich den empfangenen Text prüfen; erst anschliessend JSON parsen. [1]

Die vorherige zusätzliche Prüfung von `JSON.stringify(body)` ist entfernt. Integrationstests prüfen beide Endpunkte mit korrekt signiertem formatiertem JSON und weisen eine Signatur für eine andere Serialisierung zurück. Der bestehende SDK-Referenztest bleibt erhalten.

## Funktion und Fehlerbehandlung

Unsere Konfiguration bleibt POST, `args_at_root: false`, Timeout 10000 ms, `max_retry: 1`. Retell erlaubt Wiederholungen bei fehlgeschlagenen Aufrufen; sie können auch nach 4xx/5xx erfolgen. [2] Die bestehende Deduplizierung ist daher weiter erforderlich. Kein Test gegen den echten Dienst ist damit ersetzt.

Eigene Regel: Nur ein ausdrücklich bestätigtes `gespeichert: true` berechtigt zur Aufnahmebestätigung. Fachliche Fehler bleiben HTTP 200 mit `gespeichert: false`; Speicherfehler bleiben HTTP 500. Timeout oder verlorene Antwort können auch nach einer tatsächlichen Speicherung auftreten. Dann den Ausgang als unbestätigt beschreiben, nicht als sicher fehlgeschlagen.

## Empfohlene Agent-Einstellungen für den Pilot

- **Sprache:** Deutsch. Modell und Stimme nach Hörtest auswählen.
- **Systemprompt:** `build/systemprompt-catering.txt`, neu mit `npm run prompt` erzeugen. Ohne freigegebenen Namen nur den klar markierten Entwurf generieren.
- **Wissen:** ausschliesslich `build/wissensbasis-catering.md` aus `npm run wissen:export`. Kein automatischer Website-Import.
- **Funktion:** `save_catering_inquiry` aus der vorhandenen JSON-Datei; URL erst nach Wahl des Hostings ersetzen. Das Feld `_hinweis` ist eine lokale Erläuterung, kein zu sendender API-Parameter.
- **Weiterleitung:** erst nach eigener Konfiguration und Test aktivieren.
- **Webhook-URL:** `https://<host>/t/catering/retell/webhook`; Ereignisse `call_ended` und `call_analyzed` auswählen.
- **Dauer:** vorläufig 600000 ms (zehn Minuten), eine eigene Pilotentscheidung.
- **Speicherung:** zunächst `basic_attributes_only` für den Pilot vorschlagen. Für bewusst gewählte synthetische Debugging-Gespräche wäre `everything` mit sieben Tagen Aufbewahrung möglich; das ist noch nicht aktiviert.
- **Aufbewahrung:** explizit entscheiden. Laut API gilt sonst `everything` und ohne gesetzte Frist keine automatische Löschung; `data_storage_retention_days` erlaubt 1–730 Tage. [3]
- **Lokaler Server:** Webhook-Bodies nicht protokollieren oder komplett speichern. Der bestehende Handler übernimmt nur die benötigten Ereignisfelder. Das ist auch bei eingeschränkter Retell-Speicherung nötig. [5]
- **Agent-ID:** in `config/tenants.json` eintragen. Ohne Eintrag werden signierte Aufrufe abgelehnt.
- **Öffentlicher Testendpunkt:** nur mit Signaturprüfung betreiben; `ALLOW_UNSIGNED_LOCAL=0`, vorzugsweise `NODE_ENV=production`. Ein lokaler Tunnel kann externen Verkehr als Loopback erscheinen lassen. Den Entwicklungsmodus deshalb nicht mit einem öffentlichen Tunnel verbinden.

## Vor dem ersten Browser-Sprachtest noch offen

- [ ] Firmenname und benötigtes Wissen freigeben.
- [ ] Retell-Konto, markierten Signaturschlüssel und Agent-ID lokal konfigurieren; keine Schlüssel in den Chat.
- [ ] Öffentlich erreichbaren Endpunkt mit persistentem Speicher bereitstellen.
- [ ] Tatsächlichen Custom-Function-Aufruf und Call-Webhooks signiert prüfen.
- [ ] HTTP 500, Timeout und verlorene Antwort getrennt testen; Verhalten des Modells dokumentieren.
- [ ] Deduplizierung bei einer echten Retell-Wiederholung kontrollieren.
- [ ] Speichereinstellungen prüfen; nur synthetische Daten verwenden.
- [ ] Stimme, Unterbrechungen, Schweizerdeutsch und die übrigen Fälle in `tests/gespraechstests.md` testen.

## Quellen

Offizielle Retell-Dokumentation, abgerufen am 12.10.2026:

1. [Secure the webhook](https://docs.retellai.com/features/secure-webhook)
2. [Custom Functions](https://docs.retellai.com/build/single-multi-prompt/custom-function)
3. [Create Voice Agent](https://docs.retellai.com/api-references/create-agent)
4. [Manage API keys](https://docs.retellai.com/accounts/manage-api-keys)
5. [Data Storage Settings](https://docs.retellai.com/accounts/privacy-disable)

Historische Grundlage laut Claude-Übergabe: Quellcode von `retell-sdk` 6.2.5. SDK-Paket in diesem Abgleich nicht erneut heruntergeladen; der vorhandene Referenztest wurde ausgeführt.
