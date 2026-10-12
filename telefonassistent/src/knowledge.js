// Freigegebenes Unternehmenswissen laden, prüfen und für Prompt bzw.
// Retell-Wissensbasis aufbereiten. Unbekannte Werte bleiben unbekannt.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.js';

export function loadKnowledge(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf8'));
}

export function isApproved(fact) {
  return fact.status === 'freigegeben' && fact.wert !== null && fact.wert !== ''
    && Boolean(fact.quelle) && /^\d{4}-\d{2}-\d{2}$/.test(fact.freigabedatum ?? '');
}

// Liste aller Einträge mit Problem, z. B. "freigegeben" ohne Quelle.
export function auditKnowledge(knowledge) {
  return Object.entries(knowledge.fakten).map(([key, fact]) => {
    let problem = null;
    if (fact.status === 'freigegeben' && !isApproved(fact)) problem = 'freigegeben, aber Wert, Quelle oder Freigabedatum fehlt';
    return { key, frage: fact.frage, status: fact.status, oeffentlich: fact.oeffentlich, problem };
  });
}

// Markdown für die Wissensbasis: nur freigegebene, öffentliche Fakten.
export function exportPublicMarkdown(knowledge) {
  const facts = Object.values(knowledge.fakten).filter((f) => f.oeffentlich && isApproved(f));
  const lines = ['# Freigegebenes Unternehmenswissen', ''];
  if (facts.length === 0) lines.push('(Noch keine freigegebenen Angaben.)');
  for (const f of facts) lines.push(`## ${f.frage}`, '', String(f.wert), '', `Stand: ${f.freigabedatum}`, '');
  return lines.join('\n') + '\n';
}

// Füllt {{FIRMENNAME}}. Ohne Freigabe nur als markierter Entwurf.
export function renderPrompt(template, knowledge, { draft = false } = {}) {
  const name = knowledge.fakten.firmenname;
  const body = template.replace(/<!--[\s\S]*?-->\s*/, '');
  if (isApproved(name)) return body.replaceAll('{{FIRMENNAME}}', name.wert);
  if (!draft) throw new Error('Firmenname ist nicht freigegeben (status, Quelle, Freigabedatum). Für einen Entwurf --entwurf verwenden.');
  return body.replaceAll('{{FIRMENNAME}}', '[FIRMENNAME OFFEN]');
}
