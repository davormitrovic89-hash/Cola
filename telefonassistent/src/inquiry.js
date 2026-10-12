// Validierung und Normalisierung einer Anfrage (Datenvertrag schema_version 1).
// tenant_id, call_id und status setzt ausschliesslich der Server.

export const SCHEMA_VERSION = 1;
export const INTENTS = ['new_inquiry', 'existing_order', 'general_question', 'callback'];

const TEXT_FIELDS = {
  event_type: 200,
  event_date_raw: 200,
  location: 300,
  budget_text: 200,
  contact_name: 200,
  callback_number: 40,
  preferred_callback_time: 200,
  summary: 2000,
};
const SERVER_OWNED = ['tenant_id', 'call_id', 'status', 'schema_version'];
const DECLINABLE = ['event_type', 'event_date', 'location', 'guest_count', 'requested_services',
  'budget_text', 'contact_name', 'callback_number', 'preferred_callback_time'];

// Pflichtangaben für eine vollständige Anfrage je Anliegen. Fehlende Angaben
// sind zulässig, die Anfrage wird dann als unvollständig markiert.
const EXPECTED = {
  new_inquiry: ['event_type', 'event_date', 'location', 'guest_count', 'contact_name', 'callback_number'],
  existing_order: ['contact_name', 'callback_number', 'summary'],
  general_question: ['contact_name', 'callback_number', 'summary'],
  callback: ['contact_name', 'callback_number'],
};

export class ValidationError extends Error {
  constructor(grund, details) {
    super(grund);
    this.grund = grund;
    this.details = details;
  }
}

function text(value, field, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError('ungueltiges_feld', `${field} muss Text sein`);
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length > max) throw new ValidationError('ungueltiges_feld', `${field} ist zu lang`);
  return trimmed === '' ? null : trimmed;
}

// Heutiges Datum in der Schweiz als YYYY-MM-DD.
export function todayZurich(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(now);
}

function isoDate(value, today) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError('datum_unklar', 'event_date nur als eindeutiges YYYY-MM-DD, sonst null');
  }
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new ValidationError('datum_unklar', 'event_date ist kein gültiges Kalenderdatum');
  }
  if (value < today) throw new ValidationError('datum_in_vergangenheit', 'event_date liegt in der Vergangenheit');
  return value;
}

// Rohangabe bleibt erhalten. Eine E.164-Form wird nur abgeleitet, wenn die
// Person ausdrücklich eine internationale Vorwahl genannt hat.
function phone(value) {
  const raw = text(value, 'callback_number', TEXT_FIELDS.callback_number);
  if (raw === null) return { raw: null, e164: null };
  if (!/^[0-9+()\/.\- ]+$/.test(raw)) throw new ValidationError('telefonnummer_unklar', 'callback_number enthält ungültige Zeichen');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) throw new ValidationError('telefonnummer_unklar', 'callback_number hat eine unplausible Länge');
  let e164 = null;
  const compact = raw.replace(/[\s()\/.\-]/g, '');
  if (/^\+\d+$/.test(compact)) e164 = compact;
  else if (/^00\d+$/.test(compact)) e164 = '+' + compact.slice(2);
  return { raw, e164 };
}

export function validateInquiry(args, { today = todayZurich() } = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new ValidationError('ungueltige_anfrage', 'args fehlen');
  }
  for (const key of SERVER_OWNED) {
    if (key in args) throw new ValidationError('manipulierte_anfrage', `${key} darf nicht vom Sprachmodell gesetzt werden`);
  }
  if (args.caller_confirmed !== true) {
    throw new ValidationError('nicht_bestaetigt', 'Die anrufende Person hat die Zusammenfassung nicht bestätigt');
  }
  if (!INTENTS.includes(args.intent)) throw new ValidationError('ungueltiges_feld', 'intent unbekannt');

  const out = { schema_version: SCHEMA_VERSION, intent: args.intent };
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    if (field !== 'callback_number') out[field] = text(args[field], field, max);
  }
  out.event_date = isoDate(args.event_date, today);

  const gc = args.guest_count;
  if (gc === undefined || gc === null) out.guest_count = null;
  else if (Number.isInteger(gc) && gc >= 1 && gc <= 100000) out.guest_count = gc;
  else throw new ValidationError('ungueltiges_feld', 'guest_count muss eine ganze Zahl ab 1 sein');

  const services = args.requested_services ?? [];
  if (!Array.isArray(services) || services.length > 30) throw new ValidationError('ungueltiges_feld', 'requested_services muss eine Liste sein');
  out.requested_services = [...new Set(services.map((s, i) => text(s, `requested_services[${i}]`, 200)).filter(Boolean))];

  const { raw, e164 } = phone(args.callback_number);
  out.callback_number = raw;
  out.callback_number_e164 = e164;

  const declined = args.declined_fields ?? [];
  if (!Array.isArray(declined) || declined.some((f) => !DECLINABLE.includes(f))) {
    throw new ValidationError('ungueltiges_feld', 'declined_fields enthält unbekannte Felder');
  }
  out.declined_fields = [...new Set(declined)];
  out.caller_confirmed = true;

  out.missing_fields = EXPECTED[out.intent].filter((f) => out[f] === null);
  out.status = out.missing_fields.length === 0 ? 'inquiry_only' : 'inquiry_incomplete';
  return out;
}
