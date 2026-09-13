#!/usr/bin/env node
/**
 * audit.mjs — misst eine Webseite so, wie ein Handy-Besucher sie erlebt.
 *
 * Aufruf:
 *   node tools/audit.mjs https://beispiel.ch [weitere URLs ...]
 *   node tools/audit.mjs --liste firmen.txt
 *
 * Hinter einem Proxy zusaetzlich NODE_USE_ENV_PROXY=1 setzen, damit auch die
 * Transport-Pruefung (HTTPS/Weiterleitung) hinauskommt.
 *
 * Ergebnis: audits/<domain>/daten.json plus Screenshots (Handy + Desktop).
 *
 * Die Drosselung bildet ein durchschnittliches 4G-Handy nach (1.6 Mbit/s,
 * 150 ms Latenz, vierfach langsamere CPU) — dieselben Bedingungen, die auch
 * Google PageSpeed Insights für seine Mobil-Bewertung ansetzt.
 */

import { chromium, devices } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const MOBILE_NETWORK = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};
const CPU_SLOWDOWN = 4;
const NAV_TIMEOUT = 45_000;
const SETTLE_MS = 3_000;

/** Sammelt im Browser die Werte, die erst nach dem Rendern feststehen. */
const inPageProbe = `(() => {
  const imgs = [...document.images];
  const sample = (el) => ({
    tag: el.tagName,
    src: (el.currentSrc || el.src || '').slice(0, 200),
    w: el.naturalWidth || 0,
    h: el.naturalHeight || 0,
  });
  return {
    title: document.title || '',
    lang: document.documentElement.getAttribute('lang') || '',
    viewportMeta: !!document.querySelector('meta[name="viewport"]'),
    description: (document.querySelector('meta[name="description"]')?.content || '').trim(),
    ogImage: !!document.querySelector('meta[property="og:image"]'),
    favicon: !!document.querySelector('link[rel~="icon"]'),
    h1Count: document.querySelectorAll('h1').length,
    imgTotal: imgs.length,
    imgWithoutAlt: imgs.filter((i) => !i.getAttribute('alt')).length,
    imgOversized: imgs.filter((i) => i.naturalWidth > i.clientWidth * 3 && i.clientWidth > 0).map(sample).slice(0, 5),
    layoutTables: document.querySelectorAll('table:not([role="table"])').length,
    iframes: document.querySelectorAll('iframe').length,
    formsWithoutHttps: [...document.forms].filter((f) => f.action.startsWith('http:')).length,
    jquery: (window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery) || null,
    flash: !!document.querySelector('object[type*="flash"], embed[type*="flash"]'),
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    docHeight: document.documentElement.scrollHeight,
    textLength: (document.body.innerText || '').replace(/\\s+/g, ' ').trim().length,
    yearsInText: [...new Set((document.body.innerText.match(/\\b(19|20)\\d{2}\\b/g) || []))].sort().slice(-4),
    cookieBanner: /cookie|datenschutz/i.test(document.body.innerText.slice(0, 4000)),
    hasImpressum: !!([...document.querySelectorAll('a')].find((a) => /impressum|kontakt/i.test(a.textContent))),
    hasDatenschutz: !!([...document.querySelectorAll('a')].find((a) => /datenschutz|privacy/i.test(a.textContent))),
    metrics: window.__m || {},
  };
})()`;

/** Wird vor dem Laden injiziert, damit LCP und CLS von Anfang an mitlaufen. */
const observerInit = () => {
  window.__m = { lcp: 0, cls: 0, fcp: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__m.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
  } catch (_) { /* ältere Browser: Werte bleiben 0 */ }
};

function classify(url, headers) {
  const type = (headers['content-type'] || '').split(';')[0];
  if (type.startsWith('image/')) return 'bild';
  if (type.includes('javascript')) return 'javascript';
  if (type.includes('css')) return 'css';
  if (type.startsWith('font/') || type.includes('font')) return 'schrift';
  if (type.startsWith('video/')) return 'video';
  if (type.includes('html')) return 'html';
  return 'sonstiges';
}

async function measure(browser, url, { mobile }) {
  const context = await browser.newContext(
    mobile
      ? { ...devices['iPhone 13'], locale: 'de-CH' }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'de-CH' }
  );
  await context.addInitScript(observerInit);

  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  if (mobile) {
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', MOBILE_NETWORK);
    await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  }

  const resources = [];
  page.on('response', async (res) => {
    try {
      const headers = await res.allHeaders();
      const declared = Number(headers['content-length'] || 0);
      resources.push({
        url: res.url(),
        status: res.status(),
        kind: classify(res.url(), headers),
        bytes: declared,
      });
    } catch (_) { /* Antwort war schon weg */ }
  });

  const started = Date.now();
  let navError = null;
  let response = null;
  try {
    response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT });
  } catch (err) {
    navError = err.message.split('\n')[0];
    try { await page.waitForTimeout(1000); } catch (_) { /* egal */ }
  }
  const loadMs = Date.now() - started;

  await page.waitForTimeout(SETTLE_MS);

  let probe = {};
  try { probe = await page.evaluate(inPageProbe); } catch (err) { probe = { error: err.message }; }

  // Übertragene Bytes, wo der Server keine Content-Length schickt, aus dem
  // Performance-Eintrag nachziehen (encodedBodySize ist die reale Menge).
  let transfer = { total: 0, byKind: {} };
  try {
    const entries = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((e) => ({
        name: e.name, size: e.encodedBodySize || e.transferSize || 0, type: e.initiatorType,
      }))
    );
    const sizeFor = new Map(entries.map((e) => [e.name, e.size]));
    for (const r of resources) {
      const bytes = Math.max(r.bytes, sizeFor.get(r.url) || 0);
      r.bytes = bytes;
      transfer.total += bytes;
      transfer.byKind[r.kind] = (transfer.byKind[r.kind] || 0) + bytes;
    }
  } catch (_) { /* Seite nicht auswertbar */ }

  const shotDir = path.join('audits', new URL(url).hostname.replace(/^www\./, ''));
  await mkdir(shotDir, { recursive: true });
  const shot = path.join(shotDir, mobile ? 'handy.jpg' : 'desktop.jpg');
  try { await page.screenshot({ path: shot, type: 'jpeg', quality: 72, fullPage: false }); } catch (_) { /* egal */ }

  const heaviest = [...resources].sort((a, b) => b.bytes - a.bytes).slice(0, 6)
    .map((r) => ({ kind: r.kind, kb: Math.round(r.bytes / 1024), url: r.url.slice(0, 120) }));

  const imageFormats = {};
  for (const r of resources.filter((r) => r.kind === 'bild')) {
    const ext = (r.url.split('?')[0].split('.').pop() || '?').toLowerCase().slice(0, 5);
    imageFormats[ext] = (imageFormats[ext] || 0) + 1;
  }

  const abgebrochen = !!navError;
  const rohLcp = Math.round(probe.metrics?.lcp || 0);

  const out = {
    modus: mobile ? 'handy' : 'desktop',
    endUrl: page.url(),
    status: response?.status() ?? null,
    navError,
    abgebrochen,
    zeitlimitMs: NAV_TIMEOUT,
    ladezeitMs: loadMs,
    // Kein LCP trotz Abbruch heisst: das groesste Element war nach dem
    // Zeitlimit immer noch nicht da. Dann ist der Wert unbekannt, nicht null.
    lcpMs: rohLcp || (abgebrochen ? null : 0),
    fcpMs: Math.round(probe.metrics?.fcp || 0),
    cls: Number((probe.metrics?.cls || 0).toFixed(3)),
    gewichtKb: Math.round(transfer.total / 1024),
    gewichtNachTyp: Object.fromEntries(
      Object.entries(transfer.byKind).map(([k, v]) => [k, Math.round(v / 1024)])
    ),
    anfragen: resources.length,
    fehlerhafteAnfragen: resources.filter((r) => r.status >= 400).length,
    schwersteDateien: heaviest,
    bildformate: imageFormats,
    screenshot: shot,
    ...probe,
  };
  delete out.metrics;

  await context.close();
  return out;
}

async function checkTransport(url) {
  const host = new URL(url).hostname;
  const result = { httpsErreichbar: false, httpLeitetWeiter: null, hsts: false, server: null };
  try {
    const res = await fetch(`https://${host}/`, { redirect: 'follow' });
    result.httpsErreichbar = res.ok || res.status < 400;
    result.hsts = !!res.headers.get('strict-transport-security');
    result.server = res.headers.get('server');
  } catch (err) {
    result.httpsFehler = err.message.split('\n')[0];
  }
  try {
    const res = await fetch(`http://${host}/`, { redirect: 'manual' });
    const loc = res.headers.get('location') || '';
    result.httpLeitetWeiter = loc.startsWith('https://') ? 'ja' : (res.status >= 300 ? `nur ${loc}` : 'nein');
  } catch (_) {
    result.httpLeitetWeiter = 'nicht prüfbar';
  }
  return result;
}

async function auditOne(browser, url) {
  process.stderr.write(`\n▶ ${url}\n`);
  const transport = await checkTransport(url);
  const handy = await measure(browser, url, { mobile: true });
  const desktop = await measure(browser, url, { mobile: false });

  const istLokal = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(new URL(url).hostname);

  // Befunde werden als Datensätze ausgegeben, nicht als fertige Sätze: die
  // Formulierung für den Kunden steht im Berichtsgenerator (tools/bericht.mjs).
  const befund = [];
  const add = (id, schwere, messwert) => befund.push({ id, schwere, messwert });

  if (!istLokal && !transport.httpsErreichbar) add('kein-https', 'kritisch', null);
  if (!istLokal && transport.httpLeitetWeiter === 'nein') add('http-ohne-weiterleitung', 'hoch', null);
  if (!handy.viewportMeta) add('kein-viewport', 'kritisch', null);
  if (handy.horizontalOverflow > 8) add('seitliches-scrollen', 'hoch', `${handy.horizontalOverflow} px`);
  if (handy.lcpMs === null) {
    add('laedt-nicht-fertig', 'kritisch', `über ${Math.round(handy.zeitlimitMs / 1000)} s`);
  } else if (handy.lcpMs > 2500) {
    add('langsam', handy.lcpMs > 4000 ? 'kritisch' : 'hoch', `${(handy.lcpMs / 1000).toFixed(1)} s`);
  }
  if (handy.cls > 0.1) add('layout-springt', 'mittel', handy.cls.toFixed(2));
  if (handy.gewichtKb > 2000) add('zu-schwer', 'hoch', `${(handy.gewichtKb / 1024).toFixed(1)} MB`);
  if (handy.imgWithoutAlt > 0) add('alt-texte', 'mittel', `${handy.imgWithoutAlt} von ${handy.imgTotal}`);
  if (!handy.description) add('keine-description', 'mittel', null);
  if (handy.h1Count !== 1) add('h1-anzahl', 'niedrig', `${handy.h1Count} gefunden`);
  if (handy.jquery) add('jquery', 'niedrig', handy.jquery);
  if (handy.fehlerhafteAnfragen > 0) add('tote-dateien', 'hoch', `${handy.fehlerhafteAnfragen}`);
  if (!istLokal && !handy.hasDatenschutz) add('keine-datenschutzerklaerung', 'hoch', null);
  if (!handy.favicon) add('kein-favicon', 'niedrig', null);
  if (!handy.ogImage) add('kein-og-bild', 'niedrig', null);

  const modern = (handy.bildformate.webp || 0) + (handy.bildformate.avif || 0);
  const altFormat = (handy.bildformate.jpg || 0) + (handy.bildformate.jpeg || 0) + (handy.bildformate.png || 0);
  if (altFormat > 0 && modern === 0) add('alte-bildformate', 'mittel', `${altFormat} Bilder`);

  const rang = { kritisch: 0, hoch: 1, mittel: 2, niedrig: 3 };
  befund.sort((a, b) => rang[a.schwere] - rang[b.schwere]);

  return { url, geprueftAm: new Date().toISOString(), transport, handy, desktop, befund };
}

const args = process.argv.slice(2);
let urls = [];
if (args[0] === '--liste') {
  urls = (await readFile(args[1], 'utf8')).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
} else {
  urls = args;
}
if (!urls.length) {
  console.error('Aufruf: node tools/audit.mjs <url> [...]  |  node tools/audit.mjs --liste datei.txt');
  process.exit(1);
}

// In abgeschotteten Umgebungen (CI, Container) laeuft der Verkehr ueber einen
// Proxy — Chromium liest HTTPS_PROXY nicht von selbst.
const nurLokal = urls.every((u) => /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u));
const proxyServer = nurLokal ? null : (process.env.HTTPS_PROXY || process.env.https_proxy);
const browser = await chromium.launch({
  args: ['--no-sandbox'],
  ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
});
const alle = [];
for (const url of urls) {
  try {
    const r = await auditOne(browser, url.startsWith('http') ? url : `https://${url}`);
    const dir = path.join('audits', new URL(r.url).hostname.replace(/^www\./, ''));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'daten.json'), JSON.stringify(r, null, 2));
    alle.push(r);
    process.stderr.write(`  LCP ${(r.handy.lcpMs / 1000).toFixed(1)}s · ${r.handy.gewichtKb} KB · ${r.befund.length} Befunde\n`);
  } catch (err) {
    process.stderr.write(`  ✗ ${err.message.split('\n')[0]}\n`);
    alle.push({ url, fehler: err.message.split('\n')[0] });
  }
}
await browser.close();
console.log(JSON.stringify(alle, null, 2));
