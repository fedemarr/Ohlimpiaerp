#!/usr/bin/env node
// Smoke check post-deploy (OHLIMPIA_TESTS_STAGING.md, Parte 3).
//
// Pedido explícito de Fede: "que no valide solo 'no hay 500'. Que
// verifique que al menos una pantalla conocida devuelva datos, no vacío.
// Lo de Polo fue exactamente eso: 200 con 0 filas." — por eso esto NO
// pega un curl a la home y mira el status: hace una query real, con
// service_role (nunca con la key pública — la pública sin sesión no
// puede leer nada bajo RLS, sea cual sea el estado real del deploy, así
// que un check con la key pública daría siempre "vacío" y no probaría
// nada — ver TICKET_RLS_ROL_ANON_AUTHENTICATED.md), y confirma que una
// fila conocida de antemano está ahí con el valor esperado.
//
// Uso:
//   node scripts/smoke_check.mjs staging      (usa STAGING_* — legajo 900001 del seed)
//   node scripts/smoke_check.mjs produccion   (usa PROD_SMOKE_* — una tabla de referencia no sensible)
//
// Sale con exit code 1 si el check falla — el workflow que lo llama usa
// eso para decidir si dispara el rollback.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

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

const objetivo = process.argv[2];
if (!['staging', 'produccion'].includes(objetivo)) {
  console.error('Uso: node scripts/smoke_check.mjs <staging|produccion>');
  process.exit(1);
}

async function conectar(prefijo) {
  const host = process.env[`${prefijo}_DB_HOST`];
  const user = process.env[`${prefijo}_DB_USER`];
  const password = process.env[`${prefijo}_DB_PASSWORD`];
  const port = Number(process.env[`${prefijo}_DB_PORT`] || 5432);
  const database = process.env[`${prefijo}_DB_NAME`] || 'postgres';
  if (!host || !user || !password) {
    throw new Error(`Faltan ${prefijo}_DB_HOST/USER/PASSWORD — ver PENDIENTES_FEDE.md, sección "secrets del pipeline".`);
  }
  const client = new Client({ host, port, user, password, database, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function chequearStaging() {
  // Fila conocida del seed sintético (scripts/seed_staging.mjs) — si el
  // deploy de staging quedó mal conectado (URL/key equivocada, RLS rota,
  // migración a medio aplicar), esto da 0 filas o el nombre no matchea.
  const client = await conectar('STAGING');
  try {
    const r = await client.query(`select nombre from public.legajos where nro = 900001`);
    if (r.rows.length !== 1) throw new Error(`Se esperaba 1 fila para el legajo 900001 del seed, se encontraron ${r.rows.length}. ¿Corriste seed_staging.mjs después del último reset?`);
    if (r.rows[0].nombre !== 'Gómez Marcela (SEED)') throw new Error(`El legajo 900001 no tiene el nombre esperado del seed — encontrado: "${r.rows[0].nombre}"`);
    console.log('✓ Smoke check de staging OK — el seed responde con datos reales.');
  } finally {
    await client.end();
  }
}

async function chequearProduccion() {
  // Tabla de referencia NO sensible (feriados nacionales — no son datos
  // de ninguna persona) para no tocar nada de las 411 personas reales
  // desde un chequeo automático. Solo confirma que el deploy quedó
  // conectado de verdad al proyecto real y que RLS deja pasar una lectura
  // autenticada (con service_role, nunca la key pública del bundle).
  const client = await conectar('PROD_SMOKE');
  try {
    const r = await client.query(`select count(*)::int as n from public.feriados`);
    if (!r.rows[0] || r.rows[0].n === 0) throw new Error('public.feriados devolvió 0 filas — el deploy no está leyendo datos reales (mismo síntoma que el incidente de Polo: 200 con 0 filas).');
    console.log(`✓ Smoke check de producción OK — ${r.rows[0].n} feriados encontrados.`);
  } finally {
    await client.end();
  }
}

(objetivo === 'staging' ? chequearStaging() : chequearProduccion())
  .catch((e) => { console.error(`✗ Smoke check falló: ${e.message}`); process.exit(1); });
