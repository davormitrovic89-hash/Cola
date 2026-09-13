#!/usr/bin/env node
/**
 * bericht.mjs — macht aus audits/<domain>/daten.json eine einseitige,
 * versandfertige Kurzanalyse (HTML, druckbar als PDF).
 *
 * Aufruf:
 *   node tools/bericht.mjs audits/beispiel.ch [--firma "Muster AG"] [--absender "Davor Mitrovic"]
 *
 * Screenshots werden als data:-URI eingebettet, damit der Bericht eine
 * einzelne Datei bleibt, die man verschicken oder hochladen kann.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

/**
 * Übersetzung Messwert → Geschäftsfolge. Der Kunde interessiert sich nicht
 * für "LCP", sondern dafür, was ihn das kostet.
 */
const KATALOG = {
  'laedt-nicht-fertig': {
    titel: 'Die Seite wird auf dem Handy gar nicht fertig geladen',
    bedeutung: 'Nach 45 Sekunden war der Hauptinhalt über eine normale Mobilfunkverbindung immer noch nicht vollständig da. In der Praxis sieht das kaum jemand: Besucher brechen im Schnitt nach wenigen Sekunden ab und gehen zum nächsten Suchergebnis.',
    massnahme: 'Ursache sind fast immer unskalierte Fotos. Bilder auf Anzeigegrösse rechnen und in modernen Formaten ausliefern — das allein bringt hier den grössten Sprung.',
  },
  'kein-https': {
    titel: 'Die Seite hat kein gültiges HTTPS',
    bedeutung: 'Chrome und Safari zeigen Besuchern eine Warnung "Nicht sicher" an, bevor sie die Seite überhaupt sehen. Google stuft solche Seiten in den Ergebnissen zurück.',
    massnahme: 'Zertifikat einrichten und den gesamten Verkehr auf https:// umleiten. Kostet nichts und ist in einer Stunde erledigt.',
  },
  'http-ohne-weiterleitung': {
    titel: 'http:// leitet nicht auf die sichere Adresse um',
    bedeutung: 'Wer die Adresse ohne "https" eintippt oder einen alten Link anklickt, landet auf der ungesicherten Fassung. Für Google sind das zwei verschiedene Seiten, die sich gegenseitig die Sichtbarkeit wegnehmen.',
    massnahme: 'Eine permanente Weiterleitung (301) auf die sichere Adresse einrichten.',
  },
  'kein-viewport': {
    titel: 'Die Seite ist technisch nicht für Handys gebaut',
    bedeutung: 'Ohne diese eine Zeile im Seitenkopf zeigt jedes Handy die Desktop-Fassung verkleinert an — Text zum Zoomen, Knöpfe zu klein zum Treffen. Rund zwei Drittel Ihrer Besucher kommen heute vom Handy.',
    massnahme: 'Die Seite responsiv aufbauen, nicht nur den Meta-Tag ergänzen — sonst verschiebt sich das Problem nur.',
  },
  'seitliches-scrollen': {
    titel: 'Am Handy lässt sich die Seite seitlich verschieben',
    bedeutung: 'Ein Element ist breiter als der Bildschirm. Das wirkt beim Scrollen wie ein Fehler und ist der häufigste Grund, warum eine Seite am Handy "kaputt" aussieht, obwohl sie funktioniert.',
    massnahme: 'Das überstehende Element finden und begrenzen. Meist ein Bild oder eine feste Pixelbreite im Layout.',
  },
  'langsam': {
    titel: 'Der Hauptinhalt erscheint zu spät',
    bedeutung: 'Gemessen wird, wann das grösste sichtbare Element steht. Googles Grenzwert liegt bei 2,5 Sekunden; darüber sinkt die Position in der Suche. Etwa die Hälfte der Handy-Besucher bricht ab, bevor eine langsame Seite steht.',
    massnahme: 'Bilder verkleinern und in modernen Formaten ausliefern, unnötige Skripte entfernen, Schriften lokal einbinden.',
  },
  'layout-springt': {
    titel: 'Das Layout springt während des Ladens',
    bedeutung: 'Inhalte verschieben sich noch, während jemand schon liest oder tippt — Besucher klicken dadurch auf das Falsche. Auch das fliesst direkt in die Google-Bewertung ein.',
    massnahme: 'Bildern und Werbeflächen feste Abmessungen geben, damit der Platz von Anfang an reserviert ist.',
  },
  'zu-schwer': {
    titel: 'Ein Seitenaufruf verbraucht zu viel Datenvolumen',
    bedeutung: 'Über Mobilfunk kostet das Zeit und beim Besucher echtes Datenvolumen. Als Richtwert sollte die erste Bildschirmseite unter 1,5 MB bleiben.',
    massnahme: 'Bilder auf die tatsächlich angezeigte Grösse rechnen, WebP/AVIF statt JPEG, ungenutzte Skripte streichen.',
  },
  'alt-texte': {
    titel: 'Bilder ohne Alternativtext',
    bedeutung: 'Blinde Besucher hören stattdessen nichts, und Google kann die Bilder nicht einordnen. Seit Juni 2025 ist Barrierefreiheit für Firmen mit EU-Kundschaft zudem eine rechtliche Anforderung.',
    massnahme: 'Jedem inhaltlich relevanten Bild einen kurzen, beschreibenden Text geben. Dekoratives ausdrücklich als solches auszeichnen.',
  },
  'keine-description': {
    titel: 'Keine Meta-Description hinterlegt',
    bedeutung: 'Google textet den grauen Beschreibungstext im Suchergebnis dann selbst — meist aus zufälligen Satzfetzen der Seite. Das ist die kostenlose Werbefläche, auf der entschieden wird, ob jemand klickt.',
    massnahme: 'Pro Seite einen Satz mit rund 155 Zeichen formulieren, der den Nutzen benennt.',
  },
  'h1-anzahl': {
    titel: 'Die Überschriftenstruktur stimmt nicht',
    bedeutung: 'Genau eine H1-Überschrift sagt Google und Screenreadern, worum es auf der Seite geht. Keine oder mehrere machen das Thema unklar.',
    massnahme: 'Überschriftenebenen sauber vergeben — das ist reine Fleissarbeit im Markup.',
  },
  'jquery': {
    titel: 'Die Seite läuft auf veralteter Technik',
    bedeutung: 'jQuery stammt aus einer Zeit vor dem Smartphone. Es lädt zusätzliches Gewicht, und ältere Versionen haben bekannte Sicherheitslücken.',
    massnahme: 'Im Zuge einer Neuentwicklung ersatzlos entfernen — moderne Browser können alles davon selbst.',
  },
  'tote-dateien': {
    titel: 'Dateien auf der Seite laden nicht mehr',
    bedeutung: 'Der Server antwortet mit einem Fehler. Für Besucher bedeutet das fehlende Bilder oder Funktionen, die nicht reagieren — der stärkste Hinweis darauf, dass eine Seite nicht mehr gepflegt wird.',
    massnahme: 'Die betroffenen Adressen prüfen und ersetzen oder entfernen.',
  },
  'keine-datenschutzerklaerung': {
    titel: 'Keine Datenschutzerklärung verlinkt',
    bedeutung: 'Seit dem revidierten Datenschutzgesetz von 2023 ist sie für praktisch jede Schweizer Firmenseite Pflicht, sobald Personendaten erhoben werden — ein Kontaktformular genügt.',
    massnahme: 'Datenschutzerklärung und Impressum ergänzen und im Fussbereich verlinken.',
  },
  'kein-favicon': {
    titel: 'Kein Favicon hinterlegt',
    bedeutung: 'Im Browser-Tab und in den Lesezeichen erscheint ein leeres Blatt statt Ihres Zeichens. Kleinigkeit — aber eine, die man sieht.',
    massnahme: 'Logo als Favicon in mehreren Grössen hinterlegen.',
  },
  'kein-og-bild': {
    titel: 'Kein Vorschaubild beim Teilen',
    bedeutung: 'Wird Ihre Adresse in WhatsApp, LinkedIn oder per Mail geteilt, erscheint ein grauer Kasten statt eines Bildes. Geteilte Links mit Bild werden deutlich häufiger geöffnet.',
    massnahme: 'Ein Open-Graph-Bild pro Seite hinterlegen.',
  },
  'alte-bildformate': {
    titel: 'Alle Bilder in veralteten Formaten',
    bedeutung: 'JPEG und PNG brauchen bei gleicher Qualität rund ein Drittel mehr Daten als heutige Formate. Das ist verschenkte Ladezeit.',
    massnahme: 'Bilder als WebP oder AVIF ausliefern, mit klassischem Format als Rückfallebene.',
  },
};

const SCHWERE_LABEL = { kritisch: 'Kritisch', hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Gering' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function bildAlsDataUri(datei) {
  try {
    await access(datei);
    const buf = await readFile(datei);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (_) {
    return null;
  }
}

function kennzahl(wert, ziel, gutWennKleiner = true) {
  const gut = gutWennKleiner ? wert <= ziel : wert >= ziel;
  return gut ? 'gut' : 'schlecht';
}

function seite({ firma, absender, kontakt, domain, daten, handyBild, desktopBild }) {
  const h = daten.handy;
  const d = daten.desktop;
  const datum = new Date(daten.geprueftAm).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' });
  const lcpUnbekannt = h.lcpMs === null;
  const lcpSek = lcpUnbekannt ? `> ${Math.round(h.zeitlimitMs / 1000)}` : (h.lcpMs / 1000).toFixed(1);
  const gewichtMb = (h.gewichtKb / 1024).toFixed(2);

  const befunde = daten.befund
    .map((b) => ({ ...b, ...(KATALOG[b.id] || { titel: b.id, bedeutung: '', massnahme: '' }) }))
    .filter((b) => b.titel);

  const kennzahlen = [
    { label: 'Hauptinhalt sichtbar', wert: `${lcpSek} s`, ziel: 'Ziel: unter 2,5 s', status: lcpUnbekannt ? 'schlecht' : kennzahl(h.lcpMs, 2500) },
    { label: 'Datenvolumen pro Aufruf', wert: `${gewichtMb} MB`, ziel: 'Ziel: unter 1,5 MB', status: kennzahl(h.gewichtKb, 1536) },
    { label: 'Layout-Stabilität', wert: h.cls.toFixed(2), ziel: 'Ziel: unter 0,10', status: kennzahl(h.cls, 0.1) },
    { label: 'Gefundene Punkte', wert: `${befunde.length}`, ziel: `davon ${befunde.filter((b) => b.schwere === 'kritisch' || b.schwere === 'hoch').length} dringend`, status: befunde.length > 3 ? 'schlecht' : 'gut' },
  ];

  return `<title>Kurzanalyse ${esc(firma)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=JetBrains+Mono:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<style>
  :root {
    --paper:#E9EAE4; --surface:#F4F5F0; --sunk:#DFE0D9;
    --ink:#16181A; --ink-soft:#565C60; --ink-faint:#878D8F;
    --rule:#C7C9C1; --rule-soft:#D8DAD2;
    --signal:#C41E25; --gut:#3F6B4A; --warn:#9A6B12;
    --f-display:"Archivo","Helvetica Neue",Helvetica,Arial,sans-serif;
    --f-body:"Source Serif 4",Georgia,"Times New Roman",serif;
    --f-mono:"JetBrains Mono",ui-monospace,Menlo,monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:#101214; --surface:#181B1D; --sunk:#0B0D0E;
      --ink:#E7E8E3; --ink-soft:#A0A6A8; --ink-faint:#6E7477;
      --rule:#2E3336; --rule-soft:#23282A;
      --signal:#FF4D52; --gut:#7FB58C; --warn:#D9A441;
    }
  }
  :root[data-theme="dark"] {
    --paper:#101214; --surface:#181B1D; --sunk:#0B0D0E;
    --ink:#E7E8E3; --ink-soft:#A0A6A8; --ink-faint:#6E7477;
    --rule:#2E3336; --rule-soft:#23282A;
    --signal:#FF4D52; --gut:#7FB58C; --warn:#D9A441;
  }

  body { background: var(--paper); color: var(--ink); font-family: var(--f-body); font-size:16.5px; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .blatt { max-width: 860px; margin: 0 auto; padding: 0 clamp(20px,5vw,48px) 72px; }

  .kopf { border-bottom: 2px solid var(--ink); padding: clamp(36px,6vw,64px) 0 22px; }
  .zeile { font-family: var(--f-mono); font-size:11px; letter-spacing:.15em; text-transform:uppercase; color:var(--signal); display:flex; gap:14px; flex-wrap:wrap; margin-bottom:22px; }
  .zeile .dim { color: var(--ink-faint); }
  .kopf h1 { font-family: var(--f-display); font-weight:800; font-size:clamp(2rem,6vw,3.4rem); line-height:1.0; letter-spacing:-.03em; margin:0 0 10px; text-wrap:balance; }
  .kopf .domain { font-family: var(--f-mono); font-size:13px; color:var(--ink-soft); margin:0; }

  .intro { padding: 28px 0; border-bottom:1px solid var(--rule); }
  .intro p { margin:0; max-width:60ch; color:var(--ink-soft); }
  .intro p + p { margin-top:12px; }

  .kennzahlen { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1px; background:var(--rule); border:1px solid var(--rule); border-top:0; }
  .kz { background:var(--surface); padding:18px 16px 16px; }
  .kz .lbl { font-family:var(--f-mono); font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-faint); display:block; margin-bottom:10px; }
  .kz .wert { font-family:var(--f-display); font-weight:800; font-size:2.1rem; line-height:1; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
  .kz.gut .wert { color:var(--gut); }
  .kz.schlecht .wert { color:var(--signal); }
  .kz .ziel { font-family:var(--f-mono); font-size:10.5px; color:var(--ink-faint); margin-top:8px; display:block; }

  h2 { font-family:var(--f-display); font-weight:700; font-size:1.35rem; letter-spacing:-.02em; margin:44px 0 4px; }
  h2 + .unter { font-family:var(--f-mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); margin:0 0 18px; }

  .schuss { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.5fr); gap:16px; align-items:start; }
  @media (max-width:640px){ .schuss{ grid-template-columns:1fr; } }
  .schuss figure { margin:0; }
  .schuss img { width:100%; display:block; border:1px solid var(--rule); background:var(--sunk); }
  .schuss figcaption { font-family:var(--f-mono); font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); margin-top:8px; }

  .befunde { display:grid; gap:1px; background:var(--rule-soft); border-block:1px solid var(--rule-soft); }
  .befund { background:var(--paper); padding:20px 0; display:grid; grid-template-columns:6.5em minmax(0,1fr); gap:clamp(10px,3vw,26px); }
  @media (max-width:600px){ .befund{ grid-template-columns:1fr; gap:8px; } }
  .chip { font-family:var(--f-mono); font-size:9.5px; letter-spacing:.1em; text-transform:uppercase; border:1px solid currentColor; padding:3px 6px; align-self:start; justify-self:start; white-space:nowrap; }
  .chip.kritisch,.chip.hoch { color:var(--signal); }
  .chip.mittel { color:var(--warn); }
  .chip.niedrig { color:var(--ink-faint); }
  .befund h3 { font-family:var(--f-display); font-weight:600; font-size:1.02rem; margin:0 0 6px; }
  .befund h3 .mess { font-family:var(--f-mono); font-size:11px; font-weight:400; color:var(--signal); margin-left:8px; }
  .befund p { margin:0; font-size:.96rem; color:var(--ink-soft); }
  .befund .tun { margin-top:8px; font-size:.9rem; color:var(--ink); border-left:2px solid var(--rule); padding-left:12px; }
  .befund .tun b { font-family:var(--f-display); font-weight:600; }

  .methode { margin-top:14px; background:var(--surface); border:1px solid var(--rule); padding:20px; }
  .methode dl { margin:0; display:grid; grid-template-columns:minmax(0,13em) minmax(0,1fr); gap:8px 18px; font-size:.9rem; }
  @media (max-width:600px){ .methode dl{ grid-template-columns:1fr; gap:2px 0; } .methode dd{ margin-bottom:10px; } }
  .methode dt { font-family:var(--f-mono); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-faint); padding-top:3px; }
  .methode dd { margin:0; color:var(--ink-soft); }

  .schluss { margin-top:44px; border-top:2px solid var(--ink); padding-top:24px; }
  .schluss p { max-width:60ch; }
  .signatur { font-family:var(--f-mono); font-size:12px; color:var(--ink-soft); margin-top:22px; line-height:1.8; }
  .signatur b { font-family:var(--f-display); font-size:14px; color:var(--ink); }

  @media print {
    body { background:#fff; color:#000; font-size:11pt; }
    .blatt { max-width:none; padding:0; }
    .befund, .schuss, .methode { break-inside:avoid; }
    h2 { break-after:avoid; }
  }
</style>

<div class="blatt">

  <header class="kopf">
    <div class="zeile">
      <span>Kurzanalyse Webauftritt</span>
      <span class="dim">${esc(datum)}</span>
      <span class="dim">unverbindlich</span>
    </div>
    <h1>${esc(firma)}</h1>
    <p class="domain">${esc(domain)}</p>
  </header>

  <div class="intro">
    <p>Ich habe Ihre Webseite unter denselben Bedingungen geladen, unter denen Google sie bewertet: als Handy-Aufruf über eine normale Mobilfunkverbindung. Unten stehen die gemessenen Werte, danach die Punkte, die mir aufgefallen sind — jeweils mit dem, was sie praktisch bedeuten.</p>
    <p>Die Analyse ist kostenlos und unverbindlich. Sie können sie auch einfach Ihrem jetzigen Dienstleister weitergeben.</p>
  </div>

  <div class="kennzahlen">
    ${kennzahlen.map((k) => `<div class="kz ${k.status}">
      <span class="lbl">${esc(k.label)}</span>
      <span class="wert">${esc(k.wert)}</span>
      <span class="ziel">${esc(k.ziel)}</span>
    </div>`).join('\n    ')}
  </div>

  ${handyBild || desktopBild ? `
  <h2>So sieht die Seite beim Aufruf aus</h2>
  <p class="unter">Erster Bildschirm, ohne Scrollen</p>
  <div class="schuss">
    ${handyBild ? `<figure><img src="${handyBild}" alt="Startseite von ${esc(firma)} auf dem Handy"><figcaption>Handy — iPhone, 390 px breit</figcaption></figure>` : ''}
    ${desktopBild ? `<figure><img src="${desktopBild}" alt="Startseite von ${esc(firma)} auf dem Desktop"><figcaption>Desktop — 1440 px breit</figcaption></figure>` : ''}
  </div>` : ''}

  <h2>Was mir aufgefallen ist</h2>
  <p class="unter">${befunde.length} Punkte, nach Dringlichkeit sortiert</p>
  ${befunde.length ? `<div class="befunde">
    ${befunde.map((b) => `<div class="befund">
      <span class="chip ${b.schwere}">${SCHWERE_LABEL[b.schwere]}</span>
      <div>
        <h3>${esc(b.titel)}${b.messwert ? `<span class="mess">${esc(b.messwert)}</span>` : ''}</h3>
        <p>${esc(b.bedeutung)}</p>
        <p class="tun"><b>Zu tun:</b> ${esc(b.massnahme)}</p>
      </div>
    </div>`).join('\n    ')}
  </div>` : '<p>Technisch ist an der Seite nichts zu beanstanden — hier ginge es rein um Gestaltung und Wirkung.</p>'}

  <h2>Wie gemessen wurde</h2>
  <p class="unter">Damit Sie die Zahlen nachprüfen können</p>
  <div class="methode">
    <dl>
      <dt>Gerät</dt><dd>iPhone 13, 390 × 844 Punkte, wie von Chrome nachgebildet</dd>
      <dt>Verbindung</dt><dd>1,6 Mbit/s, 150 ms Latenz, vierfach gedrosselte Rechenleistung — die Standardbedingungen von Google PageSpeed Insights</dd>
      <dt>Gemessen am</dt><dd>${esc(datum)}, Startseite, erster Aufruf ohne Zwischenspeicher</dd>
      <dt>Hauptinhalt sichtbar</dt><dd>Largest Contentful Paint: wann das grösste sichtbare Element fertig geladen ist</dd>
      <dt>Layout-Stabilität</dt><dd>Cumulative Layout Shift: wie stark sich Inhalte während des Ladens noch verschieben</dd>
      <dt>Zum Vergleich</dt><dd>${d.lcpMs === null ? 'Auch am Desktop wurde die Seite im Zeitlimit nicht fertig geladen' : `Am Desktop mit schnellem Anschluss steht der Hauptinhalt nach ${(d.lcpMs / 1000).toFixed(1)} s — der Abstand zum Handy zeigt, wie viel Arbeit auf das Gerät und die Mobilfunkverbindung abgewälzt wird`}</dd>
    </dl>
  </div>

  <div class="schluss">
    <h2 style="margin-top:0">Wie es weitergehen könnte</h2>
    <p>Wenn Sie möchten, baue ich Ihnen unverbindlich die Startseite neu — mit Ihren eigenen Texten und Farben, damit Sie sehen, wie es aussehen würde, statt es sich vorstellen zu müssen. Sie bekommen einen Link, schauen es in Ruhe an, und entscheiden danach.</p>
    <p>Wenn Sie kein Interesse haben, ist das völlig in Ordnung — dann melde ich mich nicht wieder.</p>
    <p class="signatur"><b>${esc(absender)}</b><br>${esc(kontakt)}</p>
  </div>

</div>`;
}

// ---- Aufruf ----------------------------------------------------------------

const args = process.argv.slice(2);
const ordner = args[0];
if (!ordner) {
  console.error('Aufruf: node tools/bericht.mjs audits/<ordner> [--firma "Name"] [--domain muster.ch] [--absender "Name"] [--kontakt "mail · telefon"]');
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 && args[i + 1] ? args[i + 1] : fallback;
};

const daten = JSON.parse(await readFile(path.join(ordner, 'daten.json'), 'utf8'));
const domain = opt('domain', new URL(daten.url).hostname.replace(/^www\./, ''));
const firma = opt('firma', domain);
const absender = opt('absender', 'Davor Mitrovic');
const kontakt = opt('kontakt', 'davor.mtvc@gmail.com · Zürich');

const html = seite({
  firma,
  absender,
  kontakt,
  domain,
  daten,
  handyBild: await bildAlsDataUri(path.join(ordner, 'handy.jpg')),
  desktopBild: await bildAlsDataUri(path.join(ordner, 'desktop.jpg')),
});

const ziel = path.join(ordner, 'bericht.html');
await writeFile(ziel, html);
console.log(ziel);
