// Dauerhafte Ablage in SQLite (node:sqlite, ab Node 22.13 ohne Flag).
// Anfrage und Benachrichtigungsauftrag werden in einer Transaktion
// geschrieben; ein fehlgeschlagener Versand löscht nie eine Anfrage.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS inquiries (
  id           INTEGER PRIMARY KEY,
  reference    TEXT NOT NULL UNIQUE,
  tenant_id    TEXT NOT NULL,
  call_id      TEXT NOT NULL,
  operation    TEXT NOT NULL,
  revision     INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  data         TEXT NOT NULL,
  status       TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (tenant_id, call_id, operation)
);
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY,
  inquiry_id  INTEGER NOT NULL REFERENCES inquiries(id),
  revision    INTEGER NOT NULL,
  adapter     TEXT NOT NULL,
  status      TEXT NOT NULL,          -- pending | sent | preview | failed
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (inquiry_id, revision, adapter)
);
CREATE TABLE IF NOT EXISTS call_events (
  tenant_id           TEXT NOT NULL,
  call_id             TEXT NOT NULL,
  event               TEXT NOT NULL,
  disconnection_reason TEXT,
  received_at         TEXT NOT NULL,
  PRIMARY KEY (tenant_id, call_id, event)
);
`;

const now = () => new Date().toISOString();

function reference(tenantId) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const suffix = [...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join('');
  const day = now().slice(0, 10).replaceAll('-', '');
  return `${tenantId.slice(0, 3).toUpperCase()}-${day}-${suffix}`;
}

export function openStore(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  const q = {
    find: db.prepare('SELECT * FROM inquiries WHERE tenant_id = ? AND call_id = ? AND operation = ?'),
    insert: db.prepare(`INSERT INTO inquiries
      (reference, tenant_id, call_id, operation, revision, payload_hash, data, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`),
    revise: db.prepare(`UPDATE inquiries SET revision = revision + 1, payload_hash = ?, data = ?, status = ?, updated_at = ?
      WHERE id = ?`),
    byId: db.prepare('SELECT * FROM inquiries WHERE id = ?'),
    enqueue: db.prepare(`INSERT OR IGNORE INTO notifications (inquiry_id, revision, adapter, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?)`),
    open: db.prepare(`SELECT n.*, i.reference, i.tenant_id, i.data FROM notifications n
      JOIN inquiries i ON i.id = n.inquiry_id WHERE n.status IN ('pending', 'failed') ORDER BY n.id`),
    mark: db.prepare(`UPDATE notifications SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`),
    callEvent: db.prepare(`INSERT OR IGNORE INTO call_events (tenant_id, call_id, event, disconnection_reason, received_at)
      VALUES (?, ?, ?, ?, ?)`),
    listInquiries: db.prepare('SELECT * FROM inquiries WHERE tenant_id = ? ORDER BY id DESC LIMIT ?'),
    listNotifications: db.prepare(`SELECT n.*, i.reference FROM notifications n JOIN inquiries i ON i.id = n.inquiry_id
      WHERE i.tenant_id = ? ORDER BY n.id DESC LIMIT ?`),
    callsWithoutInquiry: db.prepare(`SELECT c.* FROM call_events c WHERE c.tenant_id = ? AND c.event = 'call_ended'
      AND NOT EXISTS (SELECT 1 FROM inquiries i WHERE i.tenant_id = c.tenant_id AND i.call_id = c.call_id)
      ORDER BY c.received_at DESC LIMIT ?`),
  };

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return {
    // Idempotent je (Mandant, Call-ID, Operation):
    //   gleicher Inhalt erneut  -> 'duplicate', keine neue Benachrichtigung
    //   korrigierter Inhalt     -> 'revised', neue Revision mit eigener Benachrichtigung
    saveInquiry({ tenantId, callId, operation, inquiry, adapter }) {
      const data = JSON.stringify(inquiry);
      const hash = createHash('sha256').update(data).digest('hex');
      return tx(() => {
        const existing = q.find.get(tenantId, callId, operation);
        let row;
        let outcome;
        if (!existing) {
          const ts = now();
          const { lastInsertRowid } = q.insert.run(reference(tenantId), tenantId, callId, operation, hash, data, inquiry.status, ts, ts);
          row = q.byId.get(lastInsertRowid);
          outcome = 'created';
        } else if (existing.payload_hash === hash) {
          return { outcome: 'duplicate', inquiry: existing };
        } else {
          q.revise.run(hash, data, inquiry.status, now(), existing.id);
          row = q.byId.get(existing.id);
          outcome = 'revised';
        }
        const ts = now();
        q.enqueue.run(row.id, row.revision, adapter, ts, ts);
        return { outcome, inquiry: row };
      });
    },

    openNotifications: () => q.open.all(),
    markNotification(id, status, error = null) {
      q.mark.run(status, error, now(), id);
    },

    // Liefert true, wenn das Ereignis neu war.
    recordCallEvent({ tenantId, callId, event, disconnectionReason }) {
      return q.callEvent.run(tenantId, callId, event, disconnectionReason ?? null, now()).changes === 1;
    },

    listInquiries: (tenantId, limit = 50) => q.listInquiries.all(tenantId, limit),
    listNotifications: (tenantId, limit = 50) => q.listNotifications.all(tenantId, limit),
    callsWithoutInquiry: (tenantId, limit = 50) => q.callsWithoutInquiry.all(tenantId, limit),
    close: () => db.close(),
  };
}
