import { createServer } from 'node:http';
import { join } from 'node:path';
import { createApp } from './app.js';
import { loadEnv, loadTenants } from './config.js';
import { createAdapters } from './notify.js';
import { openStore } from './store.js';

const RETRY_INTERVAL_MS = 5 * 60 * 1000;

const env = loadEnv();
const tenants = loadTenants();
const store = openStore(join(env.dataDir, 'anfragen.sqlite'));
const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

const app = createApp({
  store,
  tenants,
  apiKey: env.apiKey,
  adapters: createAdapters({ dataDir: env.dataDir }),
  allowUnsignedLocal: env.allowUnsignedLocal,
  log,
});

// Liegengebliebene oder fehlgeschlagene Benachrichtigungen regelmässig erneut versuchen.
setInterval(app.dispatchNotifications, RETRY_INTERVAL_MS).unref();

const server = createServer(app).listen(env.port, () => {
  log(`Integrationsserver auf Port ${env.port}, Mandanten: ${Object.keys(tenants).join(', ')}`);
  if (env.allowUnsignedLocal) log('ACHTUNG: unsignierte Anfragen von 127.0.0.1 erlaubt (nur lokal).');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    store.close();
    process.exit(0);
  }));
}
