#!/usr/bin/env node
/**
 * galerie.mjs — baut aus den Dateien in heroes/ eine einzelne Übersichtsseite.
 *
 *   node tools/galerie.mjs
 *
 * Jede Vorlage läuft in der Galerie in einem eigenen iframe, das seinen Inhalt
 * über srcdoc mitbekommt. Damit bleibt die Galerie eine einzige Datei — kein
 * Server nötig, keine Pfade, die beim Verschicken brechen — und die Vorlagen
 * können sich gegenseitig weder im CSS noch im JavaScript ins Gehege kommen.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VORLAGEN = [
  {
    datei: '1-bild-tiefe.html',
    nummer: '01',
    name: 'Bild mit Tiefe',
    passt: 'Handwerk · Architektur · Restaurant · Hotel · Praxis',
    text: 'Zwei Bildebenen wandern beim Scrollen und bei Mausbewegung unterschiedlich schnell. Der sicherste Hero: funktioniert mit jedem halbwegs brauchbaren Foto und wirkt sofort wertiger als das Original.',
    braucht: 'Ein gutes Querformat-Foto. Optional ein freigestelltes PNG für die vordere Ebene.',
  },
  {
    datei: '2-scroll-text.html',
    nummer: '02',
    name: 'Text, der sich aufhellt',
    passt: 'Treuhand · Anwalt · Beratung · Arzt · Versicherung',
    text: 'Der Satz baut sich Wort für Wort auf, während man scrollt — dasselbe Prinzip wie GSAP SplitText, hier ohne Bibliothek. Kommt ganz ohne Bildmaterial aus.',
    braucht: 'Nur einen guten Satz. Genau der Fall, wenn der Kunde keine brauchbaren Fotos hat.',
  },
  {
    datei: '3-shader-verlauf.html',
    nummer: '03',
    name: 'Fliessender Verlauf',
    passt: 'Agentur · IT · Startup · Coaching · Labor',
    text: 'Ein WebGL-Shader zeichnet einen langsam driftenden Verlauf, der der Maus folgt. Auf schwachen Geräten und bei „Bewegung reduzieren“ schaltet die Vorlage selbstständig auf einen statischen Verlauf um.',
    braucht: 'Drei Farben. Sonst nichts.',
  },
  {
    datei: '4-produkt-3d.html',
    nummer: '04',
    name: 'Produkt in 3D',
    passt: 'Getränke · Kosmetik · Lebensmittel · Handel · Manufaktur',
    text: 'Ein Zylinder aus 44 gedrehten Flächen, jede pro Bild neu beleuchtet. Ziehbar, dreht beim Scrollen mit. Kein Video, keine Bildsequenz — der stärkste „Wie haben Sie das gemacht?“-Moment im Repertoire.',
    braucht: 'Nichts zwingend — ohne Etikett wird eines gezeichnet. Mit Etikett-Abwicklung als Bild wird es echt.',
  },
];

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const geladen = await Promise.all(
  VORLAGEN.map(async (v) => ({ ...v, quelle: await readFile(path.join('heroes', v.datei), 'utf8') }))
);

const html = `<title>Hero-Baukasten</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=JetBrains+Mono:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<style>
  :root {
    --paper:#E9EAE4; --surface:#F4F5F0; --sunk:#DFE0D9;
    --ink:#16181A; --ink-soft:#565C60; --ink-faint:#878D8F;
    --rule:#C7C9C1; --rule-soft:#D8DAD2; --signal:#C41E25;
    --f-display:"Archivo","Helvetica Neue",Helvetica,Arial,sans-serif;
    --f-body:"Source Serif 4",Georgia,"Times New Roman",serif;
    --f-mono:"JetBrains Mono",ui-monospace,Menlo,monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:#101214; --surface:#181B1D; --sunk:#0B0D0E;
      --ink:#E7E8E3; --ink-soft:#A0A6A8; --ink-faint:#6E7477;
      --rule:#2E3336; --rule-soft:#23282A; --signal:#FF4D52;
    }
  }
  :root[data-theme="dark"] {
    --paper:#101214; --surface:#181B1D; --sunk:#0B0D0E;
    --ink:#E7E8E3; --ink-soft:#A0A6A8; --ink-faint:#6E7477;
    --rule:#2E3336; --rule-soft:#23282A; --signal:#FF4D52;
  }

  body { background:var(--paper); color:var(--ink); font-family:var(--f-body); font-size:17px; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1180px; margin:0 auto; padding:0 clamp(20px,4vw,56px) 80px; }

  header { border-bottom:2px solid var(--ink); padding:clamp(44px,8vw,88px) 0 26px; }
  .zeile { font-family:var(--f-mono); font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--signal); display:flex; gap:14px; flex-wrap:wrap; margin-bottom:24px; }
  .zeile .dim { color:var(--ink-faint); }
  h1 { font-family:var(--f-display); font-weight:800; font-size:clamp(2.3rem,7vw,4.6rem); line-height:.98; letter-spacing:-.035em; margin:0 0 20px; text-wrap:balance; }
  .vorspann { font-size:clamp(1rem,2vw,1.2rem); color:var(--ink-soft); max-width:56ch; margin:0; }

  .anleitung { border-bottom:1px solid var(--rule); padding:26px 0; display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); }
  .anleitung > div { padding:4px 22px; border-left:1px solid var(--rule-soft); }
  .anleitung > div:first-child { border-left:0; padding-left:0; }
  .anleitung b { display:block; font-family:var(--f-display); font-size:.95rem; font-weight:600; margin-bottom:5px; }
  .anleitung p { margin:0; font-size:.9rem; color:var(--ink-soft); }
  .anleitung code { font-family:var(--f-mono); font-size:.82em; }

  .stueck { border-bottom:1px solid var(--rule); padding:clamp(38px,6vw,64px) 0; }
  .kopf { display:grid; grid-template-columns:4em minmax(0,1fr); gap:clamp(14px,3vw,30px); align-items:start; margin-bottom:22px; }
  @media (max-width:640px){ .kopf{ grid-template-columns:1fr; gap:6px; } }
  .nr { font-family:var(--f-mono); font-size:12px; color:var(--signal); padding-top:8px; }
  h2 { font-family:var(--f-display); font-weight:700; font-size:clamp(1.4rem,3.2vw,2.1rem); letter-spacing:-.025em; margin:0 0 6px; }
  .passt { font-family:var(--f-mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-faint); margin:0 0 12px; }
  .kopf p.text { margin:0; max-width:64ch; color:var(--ink-soft); font-size:.98rem; }
  .braucht { margin-top:10px; font-size:.9rem; border-left:2px solid var(--rule); padding-left:12px; color:var(--ink); }
  .braucht b { font-family:var(--f-display); font-weight:600; }

  .rahmen { border:1px solid var(--rule); background:var(--sunk); position:relative; }
  .rahmen iframe { display:block; width:100%; height:min(78vh,620px); border:0; }
  .fuss { display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:center; margin-top:10px; font-family:var(--f-mono); font-size:11px; color:var(--ink-faint); }
  .fuss code { color:var(--ink); }

  .schluss { padding:clamp(40px,6vw,72px) 0 0; }
  .schluss h2 { margin-bottom:14px; }
  .schluss p { max-width:62ch; color:var(--ink-soft); }
  .schluss p + p { margin-top:14px; }
</style>

<div class="wrap">

  <header>
    <div class="zeile">
      <span>Hero-Vorlagen</span>
      <span class="dim">Vier Stück, austauschbar</span>
      <span class="dim">ohne Bibliothek, ohne Ladezeit</span>
    </div>
    <h1>Vier Anfänge, in einer Stunde auf einen Kunden umgestellt.</h1>
    <p class="vorspann">Jede Vorlage läuft unten live — ziehen, scrollen, Maus bewegen. Alle vier sind eine einzelne HTML-Datei ohne externe Abhängigkeit: kein Framework, kein CDN, keine Schriftdatei über das Netz.</p>
  </header>

  <div class="anleitung">
    <div><b>Anpassen</b><p>In jeder Datei nur den Block <code>KONFIG</code> und die Farbwerte in <code>:root</code>. Der Rest bleibt.</p></div>
    <div><b>Hervorheben</b><p>Wörter in <code>*Sternchen*</code> erscheinen in der Akzentfarbe.</p></div>
    <div><b>Einsetzen</b><p>Direkt hochladen, oder in Framer als Embed einbinden.</p></div>
    <div><b>Gemessen</b><p>Alle unter 30 KB, ein einziger Netzwerkaufruf, 60 Bilder pro Sekunde.</p></div>
  </div>

${geladen.map((v) => `  <section class="stueck">
    <div class="kopf">
      <span class="nr">${v.nummer}</span>
      <div>
        <h2>${esc(v.name)}</h2>
        <p class="passt">${esc(v.passt)}</p>
        <p class="text">${esc(v.text)}</p>
        <p class="braucht"><b>Braucht:</b> ${esc(v.braucht)}</p>
      </div>
    </div>
    <div class="rahmen">
      <iframe title="Vorschau: ${attr(v.name)}" loading="lazy" srcdoc="${attr(v.quelle)}"></iframe>
    </div>
    <div class="fuss">
      <span>Datei: <code>heroes/${v.datei}</code></span>
      <span>${Math.round(Buffer.byteLength(v.quelle) / 1024)} KB · 0 externe Aufrufe</span>
    </div>
  </section>
`).join('\n')}

  <section class="schluss">
    <h2>So wird daraus ein Kundenentwurf</h2>
    <p>Vorlage auswählen, die zur Branche passt. Im <code>KONFIG</code>-Block Markenzeile, Titel, Unterzeile und die beiden Knöpfe mit dem <em>echten</em> Text des Kunden füllen — nie mit Platzhaltern, das ist der ganze Punkt. Dann die zwei bis drei Farben aus dem bestehenden Logo übernehmen.</p>
    <p>Rechnen Sie mit einer Stunde für die erste, zwanzig Minuten für jede weitere. Den Entwurf hinter ein Passwort legen und nicht indexieren lassen — er zeigt fremde Marken und gehört nicht ins öffentliche Portfolio.</p>
  </section>

</div>`;

const ziel = path.join('heroes', 'galerie.html');
await writeFile(ziel, html);
console.log(`${ziel}  ${Math.round(Buffer.byteLength(html) / 1024)} KB`);
