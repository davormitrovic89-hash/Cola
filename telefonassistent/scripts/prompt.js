// Erzeugt den einsetzbaren Systemprompt aus Vorlage und freigegebenem Wissen.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadTenants } from '../src/config.js';
import { loadKnowledge, renderPrompt } from '../src/knowledge.js';

const tenantId = process.argv.find((a) => a.startsWith('--mandant='))?.split('=')[1] ?? 'catering';
const tenant = loadTenants()[tenantId];
if (!tenant) throw new Error(`Unbekannter Mandant '${tenantId}'`);
const template = readFileSync(join(ROOT, 'prompt/systemprompt.de.md'), 'utf8');

try {
  const prompt = renderPrompt(template, loadKnowledge(tenant.wissen), { draft: process.argv.includes('--entwurf') });
  const out = join(ROOT, 'build', `systemprompt-${tenantId}.txt`);
  mkdirSync(join(ROOT, 'build'), { recursive: true });
  writeFileSync(out, prompt);
  console.log(`Systemprompt geschrieben: ${out}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
