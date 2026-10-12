// HTTP-Schnittstelle für Retell: Custom Function und Call-Webhook.
// Mandant = URL-Pfad + signierte agent_id aus der serverseitigen Konfiguration.
import { SIGNATURE_HEADER, verify } from './signature.js';
import { validateInquiry, ValidationError } from './inquiry.js';
import { deliverPending } from './notify.js';

const MAX_BODY = 1024 * 1024;
const LOCAL_TEST_AGENT = 'lokal-test';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const OPERATION = 'save_catering_inquiry';

class HttpError extends Error {
  constructor(status, body) {
    super(body.grund ?? body.fehler);
    this.status = status;
    this.body = body;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, { fehler: 'anfrage_zu_gross' }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function createApp({ store, tenants, apiKey, adapters, allowUnsignedLocal = false, log = () => {} }) {
  async function authenticate(req, tenantId) {
    const tenant = Object.hasOwn(tenants, tenantId) ? tenants[tenantId] : null;
    if (!tenant) throw new HttpError(404, { fehler: 'unbekannter_mandant' });

    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, { fehler: 'kein_json' });
    }

    const signature = req.headers[SIGNATURE_HEADER];
    let signed = false;
    if (signature) {
      // Retell signiert den JSON-Body; zusätzlich die kompakte Serialisierung
      // akzeptieren, falls Whitespace abweicht. Beides erfordert den Schlüssel.
      signed = verify(raw, apiKey, signature) || verify(JSON.stringify(body), apiKey, signature);
      if (!signed) throw new HttpError(401, { fehler: 'signatur_ungueltig' });
    } else if (!(allowUnsignedLocal && LOOPBACK.has(req.socket.remoteAddress))) {
      throw new HttpError(401, { fehler: 'signatur_fehlt' });
    }

    const call = body?.call;
    const agentId = call?.agent_id;
    const agentAllowed = signed
      ? tenant.retell_agent_ids.includes(agentId)
      : agentId === LOCAL_TEST_AGENT || tenant.retell_agent_ids.includes(agentId);
    if (!agentAllowed) throw new HttpError(403, { fehler: 'falscher_mandant' });

    const callId = call?.call_id;
    if (typeof callId !== 'string' || !/^[\w.:-]{1,128}$/.test(callId)) {
      throw new HttpError(400, { fehler: 'call_id_fehlt' });
    }
    return { tenant, body, callId };
  }

  // Nie zwei Durchläufe gleichzeitig, sonst könnte ein Auftrag doppelt rausgehen.
  let delivering = false;
  let again = false;
  async function dispatchNotifications() {
    if (delivering) {
      again = true;
      return;
    }
    delivering = true;
    try {
      do {
        again = false;
        const results = await deliverPending(store, adapters);
        results.forEach((r) => log(`benachrichtigung ${r.reference} ${r.status}${r.error ? ` (${r.error})` : ''}`));
      } while (again);
    } catch (err) {
      log(`benachrichtigung fehler: ${err.message}`);
    } finally {
      delivering = false;
    }
  }

  async function saveInquiry(req, res, tenantId) {
    const { tenant, body, callId } = await authenticate(req, tenantId);
    if (body.name !== undefined && body.name !== OPERATION) throw new HttpError(400, { fehler: 'falsche_funktion' });

    let inquiry;
    try {
      inquiry = validateInquiry(body.args);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      if (err.grund === 'manipulierte_anfrage') throw new HttpError(403, { gespeichert: false, grund: err.grund });
      log(`anfrage abgelehnt ${tenantId} ${callId}: ${err.grund}`);
      return send(res, 200, { gespeichert: false, grund: err.grund, details: err.details });
    }

    let result;
    try {
      result = store.saveInquiry({ tenantId, callId, operation: OPERATION, inquiry, adapter: tenant.benachrichtigung.adapter });
    } catch (err) {
      log(`speicherfehler ${tenantId} ${callId}: ${err.message}`);
      return send(res, 500, {
        gespeichert: false,
        grund: 'speicherfehler',
        hinweis: 'Die Anfrage konnte nicht gespeichert werden. Keine Aufnahme bestätigen.',
      });
    }

    log(`anfrage ${result.inquiry.reference} ${result.outcome}`);
    if (result.outcome !== 'duplicate') setImmediate(dispatchNotifications);
    const stored = JSON.parse(result.inquiry.data);
    send(res, 200, {
      gespeichert: true,
      referenz: result.inquiry.reference,
      status: stored.status,
      fehlende_angaben: stored.missing_fields,
      hinweis: 'Anfrage gespeichert. Das ist keine Auftragsannahme, keine Preis- und keine Terminzusage.',
    });
  }

  async function webhook(req, res, tenantId) {
    const { body, callId } = await authenticate(req, tenantId);
    // Transkripte und Anrufernummern werden bewusst nicht gespeichert.
    if (body.event === 'call_ended' || body.event === 'call_analyzed') {
      const isNew = store.recordCallEvent({
        tenantId, callId, event: body.event, disconnectionReason: body.call?.disconnection_reason,
      });
      if (isNew) log(`anruf ${callId} ${body.event}`);
    }
    send(res, 204);
  }

  handle.dispatchNotifications = dispatchNotifications;
  return handle;

  async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
      const match = /^\/t\/([a-z0-9-]{1,40})\/retell\/(functions\/save_catering_inquiry|webhook)$/.exec(url.pathname);
      if (!match) return send(res, 404, { fehler: 'nicht_gefunden' });
      if (req.method !== 'POST') return send(res, 405, { fehler: 'nur_post' });
      if (match[2] === 'webhook') return await webhook(req, res, match[1]);
      return await saveInquiry(req, res, match[1]);
    } catch (err) {
      if (err instanceof HttpError) {
        log(`abgelehnt ${req.url}: ${err.status} ${err.message}`);
        if (!res.headersSent) send(res, err.status, err.body);
        return;
      }
      log(`interner fehler: ${err.stack ?? err}`);
      if (!res.headersSent) send(res, 500, { gespeichert: false, grund: 'interner_fehler' });
    }
  }
}
