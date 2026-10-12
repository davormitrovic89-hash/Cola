import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadTenants } from '../src/config.js';
import { auditKnowledge, exportPublicMarkdown, loadKnowledge, renderPrompt } from '../src/knowledge.js';

const template = readFileSync(join(ROOT, 'prompt/systemprompt.de.md'), 'utf8');
const fact = (over) => ({ frage: 'F', wert: null, status: 'offen', quelle: null, freigabedatum: null, oeffentlich: true, ...over });

test('Prompt nur mit freigegebenem Firmennamen, sonst klar markierter Entwurf', () => {
  const offen = { fakten: { firmenname: fact() } };
  assert.throws(() => renderPrompt(template, offen), /nicht freigegeben/);
  const entwurf = renderPrompt(template, offen, { draft: true });
  assert.match(entwurf, /\[FIRMENNAME OFFEN\]/);
  assert.doesNotMatch(entwurf, /\{\{FIRMENNAME\}\}|<!--/);

  const frei = { fakten: { firmenname: fact({ wert: 'Beispiel Catering', status: 'freigegeben', quelle: 'Davor', freigabedatum: '2026-10-13' }) } };
  assert.match(renderPrompt(template, frei), /digitale Assistentin von Beispiel Catering\./);
});

test('Wissensbasis-Export enthält nur freigegebene, öffentliche Fakten', () => {
  const k = { fakten: {
    a: fact({ frage: 'Einsatzgebiet', wert: 'Region Test', status: 'freigegeben', quelle: 'Davor', freigabedatum: '2026-10-13' }),
    b: fact({ frage: 'Intern', wert: 'geheim@example.invalid', status: 'freigegeben', quelle: 'Davor', freigabedatum: '2026-10-13', oeffentlich: false }),
    c: fact({ frage: 'Vorschlag', wert: 'nur Vorschlag', status: 'vorschlag', quelle: 'Startpaket' }),
  } };
  const md = exportPublicMarkdown(k);
  assert.match(md, /Region Test/);
  assert.doesNotMatch(md, /geheim|nur Vorschlag/);
});

test('Audit meldet «freigegeben» ohne Quelle oder Datum', () => {
  const rows = auditKnowledge({ fakten: { x: fact({ wert: 'y', status: 'freigegeben' }) } });
  assert.ok(rows[0].problem);
});

test('mitgelieferte Wissensdatei ist konsistent und enthält keine erfundenen Freigaben', () => {
  for (const [id, tenant] of Object.entries(loadTenants())) {
    const rows = auditKnowledge(loadKnowledge(tenant.wissen));
    assert.deepEqual(rows.filter((r) => r.problem), [], id);
  }
});
