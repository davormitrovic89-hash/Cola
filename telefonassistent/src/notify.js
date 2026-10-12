// Benachrichtigung des Teams über die Outbox.
// Startpaket: nur lokale Vorschau. Kein Versand an Kunden oder Partner.
// Ein echter Adapter (z. B. E-Mail) wird erst nach Wahl der internen
// Empfängeradresse ergänzt und muss bei Erfolg 'sent' zurückgeben.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LABELS = {
  intent: 'Anliegen', event_type: 'Anlass', event_date: 'Datum', event_date_raw: 'Datum (wörtlich)',
  location: 'Ort', guest_count: 'Gäste', requested_services: 'Leistungen', budget_text: 'Budget',
  contact_name: 'Name', callback_number: 'Rückrufnummer', preferred_callback_time: 'Rückrufwunsch',
  summary: 'Zusammenfassung', declined_fields: 'Verweigerte Angaben', missing_fields: 'Fehlende Angaben',
  status: 'Status',
};

export function renderNotification({ reference, revision, data }) {
  const inquiry = typeof data === 'string' ? JSON.parse(data) : data;
  const lines = [
    `Neue Telefonanfrage ${reference}${revision > 1 ? ` (korrigierte Fassung ${revision})` : ''}`,
    'Hinweis: Nur eine Anfrage – keine Buchung, kein Preis, keine Kapazitätszusage.',
    '',
  ];
  for (const [key, label] of Object.entries(LABELS)) {
    const value = inquiry[key];
    const shown = Array.isArray(value) ? (value.length ? value.join(', ') : '–') : (value ?? '–');
    lines.push(`${label}: ${shown}`);
  }
  return lines.join('\n') + '\n';
}

export function createAdapters({ dataDir }) {
  return {
    vorschau: {
      async send(notification) {
        const dir = join(dataDir, 'vorschau');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${notification.reference}-r${notification.revision}.txt`), renderNotification(notification));
        return 'preview';
      },
    },
  };
}

// Arbeitet offene und fehlgeschlagene Aufträge ab. Fehler bleiben sichtbar
// (status 'failed', last_error) und werden beim nächsten Lauf wiederholt.
export async function deliverPending(store, adapters) {
  const results = [];
  for (const n of store.openNotifications()) {
    const adapter = adapters[n.adapter];
    try {
      if (!adapter) throw new Error(`Adapter '${n.adapter}' ist nicht konfiguriert`);
      const status = await adapter.send(n);
      store.markNotification(n.id, status);
      results.push({ id: n.id, reference: n.reference, status });
    } catch (err) {
      store.markNotification(n.id, 'failed', String(err.message ?? err).slice(0, 500));
      results.push({ id: n.id, reference: n.reference, status: 'failed', error: err.message });
    }
  }
  return results;
}
