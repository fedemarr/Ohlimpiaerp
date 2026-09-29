// Conexión compartida a la base de STAGING para los tests de Nivel 1
// (OHLIMPIA_TESTS_STAGING.md, Parte 2). Mismas guardas que
// scripts/reset_staging.mjs y scripts/seed_staging.mjs — nunca corre
// contra producción, ni por accidente.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const REFS_PRODUCCION_PROHIBIDOS = ['caeqsieiuunqvicfpudu'];

function cargarEnvArchivo(path) {
  if (!existsSync(path)) return;
  for (const linea of readFileSync(path, 'utf8').split('\n')) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const idx = l.indexOf('=');
    if (idx === -1) continue;
    const key = l.slice(0, idx).trim();
    const val = l.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}
cargarEnvArchivo(join(ROOT, '.env.staging'));

export async function conectarStaging() {
  const ref = process.env.STAGING_PROJECT_REF;
  const host = process.env.STAGING_DB_HOST;
  const user = process.env.STAGING_DB_USER;
  const password = process.env.STAGING_DB_PASSWORD;
  const port = Number(process.env.STAGING_DB_PORT || 5432);
  const database = process.env.STAGING_DB_NAME || 'postgres';

  if (!ref || !host || !user || !password) {
    throw new Error('Faltan variables de staging (.env.staging o env de CI) — ver scripts/reset_staging.mjs');
  }
  if (REFS_PRODUCCION_PROHIBIDOS.includes(ref)) {
    throw new Error(`El ref "${ref}" es de producción — los tests de Nivel 1 nunca corren ahí.`);
  }
  if (user !== `postgres.${ref}`) {
    throw new Error(`STAGING_DB_USER no coincide con STAGING_PROJECT_REF — posible mezcla de credenciales.`);
  }

  const client = new Client({ host, port, user, password, database, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}
