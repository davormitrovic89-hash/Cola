// Lokale Übersicht: gespeicherte Anfragen, Benachrichtigungsstatus und Anrufe ohne Anfrage.
// --erneut-senden versucht offene/fehlgeschlagene Benachrichtigungen erneut.
import { join } from 'node:path';
import { loadEnv } from '../src/config.js';
import { createAdapters, deliverPending } from '../src/notify.js';
import { openStore } from '../src/store.js';

const tenantId = process.argv.find((a) => a.startsWith('--mandant='))?.split('=')[1] ?? 'catering';
const env = loadEnv({ ...process.env, ALLOW_UNSIGNED_LOCAL: '1', NODE_ENV: 'development' });
const store = openStore(join(env.dataDir, 'anfragen.sqlite'));

if (process.argv.includes('--erneut-senden')) {
  console.table(await deliverPending(store, createAdapters({ dataDir: env.dataDir })));
}

console.log('\nAnfragen');
console.table(store.listInquiries(tenantId).map((i) => {
  const d = JSON.parse(i.data);
  return { referenz: i.reference, revision: i.revision, status: i.status, anliegen: d.intent, datum: d.event_date ?? d.event_date_raw, gaeste: d.guest_count, fehlend: d.missing_fields.join(', '), erstellt: i.created_at };
}));
console.log('Benachrichtigungen');
console.table(store.listNotifications(tenantId).map((n) => ({ referenz: n.reference, revision: n.revision, adapter: n.adapter, status: n.status, versuche: n.attempts, fehler: n.last_error ?? '' })));
console.log('Beendete Anrufe ohne gespeicherte Anfrage');
console.table(store.callsWithoutInquiry(tenantId).map((c) => ({ call_id: c.call_id, grund: c.disconnection_reason ?? '', zeit: c.received_at })));
store.close();
