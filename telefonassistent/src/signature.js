// Prüfung der Retell-Signatur.
// Nachgebaut nach retell-sdk 6.2.5 (src/lib/webhook_auth.ts):
//   Header-Wert "v=<timestamp_ms>,d=<hex(HMAC-SHA256(apiKey, body + timestamp))>",
//   Toleranz 5 Minuten. Bewusst ohne SDK-Abhängigkeit, damit der Server
//   nur Node-Bordmittel braucht. Bei SDK-Updates gegen dessen Code abgleichen.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-retell-signature';
const TOLERANCE_MS = 5 * 60 * 1000;

export function sign(body, apiKey, timestamp = Date.now()) {
  const digest = createHmac('sha256', apiKey).update(body + timestamp).digest('hex');
  return `v=${timestamp},d=${digest}`;
}

export function verify(body, apiKey, signature, now = Date.now()) {
  if (!apiKey || typeof signature !== 'string') return false;
  const match = /^v=(\d+),d=([0-9a-f]{64})$/i.exec(signature);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > TOLERANCE_MS) return false;
  const expected = createHmac('sha256', apiKey).update(body + timestamp).digest();
  const given = Buffer.from(match[2], 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
