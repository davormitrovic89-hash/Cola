# AGENTS.md – Telefonassistent Catering

Regeln für Claude Code, Codex und andere Agenten in diesem Ordner. Grundlage: Startpaket vom 12.10.2026.

## Abgrenzung
- Dieser Ordner ist das einzige Projekt für den Telefonassistenten. Keine zweite parallele Anwendung anlegen.
- Die Website im Repository-Stamm (`../index.html`) wird von hier aus nicht verändert.
- Status: Pilot in Vorbereitung. Den Stand nie als „fertigen Telefonassistenten“ bezeichnen, solange kein Sprach- und Telefontest bestanden ist.

## Geheimnisse und Daten
- Zugangsdaten nur in `.env` (lokal) oder im Secret Store des Hosters, nie im Repository oder im Chat.
- Nur synthetische Testdaten committen. `data/` und `build/` sind ignoriert.
- Keine Transkripte, Audioaufnahmen oder Anrufernummern serverseitig speichern, ohne dass das ausdrücklich entschieden ist.

## Fachliche Regeln (nicht aufweichen)
- Die erste Version erfasst Anfragen und verkauft nicht. Keine Buchungs-, Preis-, Kapazitäts-, Allergen- oder Fristzusagen.
- `tenant_id`, `call_id` und `status` setzt nur der Server. Mandant = URL-Pfad + signierte `agent_id` aus `config/tenants.json`.
- Erfolg nur nach tatsächlicher Speicherung melden. Ein Versandfehler löscht nie eine Anfrage.
- Wissen nur mit `status: "freigegeben"`, Quelle und Freigabedatum verwenden. Unbekanntes bleibt `null`. Website-Inhalte nicht automatisch übernehmen.
- Kein Versand an Kunden oder Partner. Benachrichtigung bis zur Wahl einer internen Adresse nur als lokale Vorschau.

## Technik
- Node ≥ 22.13, keine Laufzeitabhängigkeiten (`node:http`, `node:sqlite`, `node:crypto`, `node:test`).
- Vor dem Ändern von Retell-Feldern die aktuelle Retell-Doku bzw. das `retell-sdk` prüfen und `retell/einstellungen.md` nachführen.
- Prompt-Änderungen nur in `prompt/systemprompt.de.md`. Die Version im Kopfkommentar hochzählen.
- Vor jedem Commit `npm test` ausführen.
- Weitere Mandanten, Benutzerverwaltung und WhatsApp erst nach dem Catering-Pilot.
