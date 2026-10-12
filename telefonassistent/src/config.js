import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadTenants(file = join(ROOT, 'config/tenants.json')) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const tenants = {};
  for (const [id, cfg] of Object.entries(raw)) {
    if (id.startsWith('_')) continue;
    if (!Array.isArray(cfg.retell_agent_ids) || !cfg.benachrichtigung?.adapter || !cfg.wissen) {
      throw new Error(`Mandant '${id}' ist unvollständig konfiguriert`);
    }
    tenants[id] = cfg;
  }
  return tenants;
}

export function loadEnv(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const allowUnsignedLocal = !production && env.ALLOW_UNSIGNED_LOCAL === '1';
  if (!env.RETELL_API_KEY && !allowUnsignedLocal) {
    throw new Error('RETELL_API_KEY fehlt (siehe .env.example). Für rein lokale Tests ALLOW_UNSIGNED_LOCAL=1 setzen.');
  }
  return {
    apiKey: env.RETELL_API_KEY || null,
    port: Number(env.PORT || 8787),
    dataDir: resolve(ROOT, env.DATA_DIR || './data'),
    allowUnsignedLocal,
  };
}
