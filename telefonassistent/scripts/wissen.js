// Übersicht über das Unternehmenswissen; mit --export die Wissensbasis-Datei erzeugen.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadTenants } from '../src/config.js';
import { auditKnowledge, exportPublicMarkdown, loadKnowledge } from '../src/knowledge.js';

const tenantId = process.argv.find((a) => a.startsWith('--mandant='))?.split('=')[1] ?? 'catering';
const tenant = loadTenants()[tenantId];
if (!tenant) throw new Error(`Unbekannter Mandant '${tenantId}'`);
const knowledge = loadKnowledge(tenant.wissen);

const rows = auditKnowledge(knowledge);
console.table(rows.map(({ frage, status, oeffentlich, problem }) => ({ frage, status, oeffentlich, problem: problem ?? '' })));
const offen = rows.filter((r) => r.status !== 'freigegeben').length;
console.log(`${offen} von ${rows.length} Angaben noch nicht freigegeben.`);

if (process.argv.includes('--export')) {
  const out = join(ROOT, 'build', `wissensbasis-${tenantId}.md`);
  mkdirSync(join(ROOT, 'build'), { recursive: true });
  writeFileSync(out, exportPublicMarkdown(knowledge));
  console.log(`Wissensbasis geschrieben: ${out}`);
}
if (rows.some((r) => r.problem)) process.exitCode = 1;
