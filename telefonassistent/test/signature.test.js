import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify } from '../src/signature.js';

// Referenzwert erzeugt mit retell-sdk 6.2.5 (symmetric.sign).
const SDK_BODY = '{"name":"save_catering_inquiry","call":{"call_id":"c1","agent_id":"a1"},"args":{"intent":"callback","caller_confirmed":true}}';
const SDK_SIG = 'v=1791800000000,d=f10733b7723ac22c7e7d1509470b8aa1b5f12b6a6b663cff377ceeee15ed6410';
const SDK_TS = 1791800000000;

test('stimmt mit der SDK-Signatur überein', () => {
  assert.equal(sign(SDK_BODY, 'key_test_123', SDK_TS), SDK_SIG);
  assert.ok(verify(SDK_BODY, 'key_test_123', SDK_SIG, SDK_TS + 1000));
});

test('lehnt veränderten Body, falschen Schlüssel und Formfehler ab', () => {
  assert.ok(!verify(SDK_BODY.replace('callback', 'new_inquiry'), 'key_test_123', SDK_SIG, SDK_TS));
  assert.ok(!verify(SDK_BODY, 'anderer_key', SDK_SIG, SDK_TS));
  assert.ok(!verify(SDK_BODY, 'key_test_123', 'kaputt', SDK_TS));
  assert.ok(!verify(SDK_BODY, 'key_test_123', undefined, SDK_TS));
  assert.ok(!verify(SDK_BODY, '', SDK_SIG, SDK_TS));
});

test('lehnt Signaturen ausserhalb von 5 Minuten ab (Replay)', () => {
  assert.ok(verify(SDK_BODY, 'key_test_123', SDK_SIG, SDK_TS + 5 * 60 * 1000));
  assert.ok(!verify(SDK_BODY, 'key_test_123', SDK_SIG, SDK_TS + 5 * 60 * 1000 + 1));
});
