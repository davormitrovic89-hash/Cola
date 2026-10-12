import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInquiry, ValidationError } from '../src/inquiry.js';

const today = '2026-10-12';
const base = { intent: 'new_inquiry', caller_confirmed: true };
const grund = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ValidationError);
    return err.grund;
  }
  assert.fail('keine ValidationError');
};

test('speichert nur nach Bestätigung durch die anrufende Person', () => {
  assert.equal(grund(() => validateInquiry({ ...base, caller_confirmed: false }, { today })), 'nicht_bestaetigt');
  assert.equal(grund(() => validateInquiry({ intent: 'new_inquiry' }, { today })), 'nicht_bestaetigt');
});

test('Firmenapéro mit 40 Gästen: bekannte Angaben übernehmen, fehlende kennzeichnen', () => {
  const r = validateInquiry({ ...base, event_type: 'Firmenapéro', event_date: '2026-11-20', location: 'Zürich', guest_count: 40 }, { today });
  assert.equal(r.guest_count, 40);
  assert.equal(r.status, 'inquiry_incomplete');
  assert.deepEqual(r.missing_fields, ['contact_name', 'callback_number']);
  assert.equal(r.tenant_id, undefined);
});

test('mehrdeutiges Datum bleibt null, Rohangabe bleibt erhalten', () => {
  const r = validateInquiry({ ...base, event_date: null, event_date_raw: 'nächsten Freitag' }, { today });
  assert.equal(r.event_date, null);
  assert.equal(r.event_date_raw, 'nächsten Freitag');
  assert.ok(r.missing_fields.includes('event_date'));
});

test('ungültige, unklare und vergangene Daten werden abgelehnt', () => {
  assert.equal(grund(() => validateInquiry({ ...base, event_date: '2026-02-30' }, { today })), 'datum_unklar');
  assert.equal(grund(() => validateInquiry({ ...base, event_date: '20.11.2026' }, { today })), 'datum_unklar');
  assert.equal(grund(() => validateInquiry({ ...base, event_date: '2025-11-20' }, { today })), 'datum_in_vergangenheit');
  assert.equal(validateInquiry({ ...base, event_date: today }, { today }).event_date, today);
});

test('Telefonnummer bleibt Rohangabe; E.164 nur bei ausdrücklicher Landesvorwahl', () => {
  assert.deepEqual(
    [validateInquiry({ ...base, callback_number: '079 123 45 67' }, { today })].map((r) => [r.callback_number, r.callback_number_e164])[0],
    ['079 123 45 67', null],
  );
  assert.equal(validateInquiry({ ...base, callback_number: '+41 79 123 45 67' }, { today }).callback_number_e164, '+41791234567');
  assert.equal(validateInquiry({ ...base, callback_number: '0041 79 123 45 67' }, { today }).callback_number_e164, '+41791234567');
  assert.equal(grund(() => validateInquiry({ ...base, callback_number: 'ruf mich an' }, { today })), 'telefonnummer_unklar');
  assert.equal(grund(() => validateInquiry({ ...base, callback_number: '123' }, { today })), 'telefonnummer_unklar');
});

test('serverseitige Felder dürfen nicht vom Sprachmodell kommen', () => {
  for (const key of ['tenant_id', 'call_id', 'status', 'schema_version']) {
    assert.equal(grund(() => validateInquiry({ ...base, [key]: 'x' }, { today })), 'manipulierte_anfrage');
  }
});

test('verweigerte Angaben werden gekennzeichnet, unbekannte Feldnamen abgelehnt', () => {
  const r = validateInquiry({ ...base, declined_fields: ['budget_text', 'contact_name'] }, { today });
  assert.deepEqual(r.declined_fields, ['budget_text', 'contact_name']);
  assert.equal(r.status, 'inquiry_incomplete');
  assert.equal(grund(() => validateInquiry({ ...base, declined_fields: ['passwort'] }, { today })), 'ungueltiges_feld');
});

test('Rückrufwunsch ist mit Name und Nummer vollständig', () => {
  const r = validateInquiry({ intent: 'callback', caller_confirmed: true, contact_name: ' Muster ', callback_number: '+41 44 000 00 00' }, { today });
  assert.equal(r.contact_name, 'Muster');
  assert.equal(r.status, 'inquiry_only');
});

test('ungültige Typen werden abgelehnt', () => {
  assert.equal(grund(() => validateInquiry({ ...base, intent: 'booking' }, { today })), 'ungueltiges_feld');
  assert.equal(grund(() => validateInquiry({ ...base, guest_count: 0 }, { today })), 'ungueltiges_feld');
  assert.equal(grund(() => validateInquiry({ ...base, guest_count: '40' }, { today })), 'ungueltiges_feld');
  assert.equal(grund(() => validateInquiry({ ...base, location: 42 }, { today })), 'ungueltiges_feld');
  assert.equal(grund(() => validateInquiry(null, { today })), 'ungueltige_anfrage');
});
