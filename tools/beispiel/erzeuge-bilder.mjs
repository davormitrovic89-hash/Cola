#!/usr/bin/env node
/**
 * Erzeugt die (absichtlich viel zu grossen) Bilder für die Beispielseite
 * "Muster AG". Damit ist das Testmaterial reproduzierbar und muss nicht als
 * Binärdatei im Repository liegen.
 *
 *   node tools/beispiel/erzeuge-bilder.mjs
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const ZIEL = path.join('tools', 'beispiel', 'muster-ag', 'bilder');

/** Rauschen sorgt dafür, dass JPEG sich nicht wegkomprimieren lässt — wie bei einem echten Foto. */
const malen = (w, h, ton) => `
  const c = document.createElement('canvas');
  c.width = ${w}; c.height = ${h};
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, ${w}, ${h});
  ${ton.map((stop, i) => `g.addColorStop(${(i / (ton.length - 1)).toFixed(2)}, '${stop}');`).join('\n  ')}
  x.fillStyle = g; x.fillRect(0, 0, ${w}, ${h});
  for (let i = 0; i < 900; i++) {
    x.globalAlpha = 0.05 + Math.random() * 0.2;
    x.fillStyle = ['#fff', '#000', '#c9a227', '#4a5a6a'][i % 4];
    x.beginPath();
    x.ellipse(Math.random() * ${w}, Math.random() * ${h}, Math.random() * 340, Math.random() * 240, Math.random() * 3, 0, 7);
    x.fill();
  }
  x.globalAlpha = 1;
  const img = x.getImageData(0, 0, ${w}, ${h});
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 46;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  document.body.style.margin = '0';
  document.body.appendChild(c);
`;

const BILDER = [
  { datei: 'gebaeude.jpg', w: 3000, h: 1800, ton: ['#8fa3b8', '#5b6d80', '#2f3b47'] },
  { datei: 'team.jpg', w: 2400, h: 1600, ton: ['#c9b79a', '#8a7457', '#3d3327'] },
  { datei: 'werkstatt.jpg', w: 2400, h: 1600, ton: ['#a8b0a0', '#6e7a66', '#33392f'] },
];

await mkdir(ZIEL, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });

for (const b of BILDER) {
  const page = await browser.newPage({ viewport: { width: b.w, height: b.h }, deviceScaleFactor: 1 });
  await page.setContent('<body></body>');
  await page.evaluate(malen(b.w, b.h, b.ton));
  const ziel = path.join(ZIEL, b.datei);
  await page.screenshot({ path: ziel, type: 'jpeg', quality: 82 });
  await page.close();
  console.log(`${ziel}  ${b.w}×${b.h}`);
}

await browser.close();
