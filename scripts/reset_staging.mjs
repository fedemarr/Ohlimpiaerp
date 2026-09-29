#!/usr/bin/env node
// Reset de la base de STAGING: borra el schema `public` entero y lo rearma
// corriendo TODAS las migraciones de sql/ en orden, desde cero.
//
// Nunca toca producción: aborta si el ref no matchea STAGING_PROJECT_REF, si
// matchea la lista negra explícita de refs de producción conocidos, o si el
// usuario de conexión no coincide con el ref declarado.
//
// Uso: node scripts/reset_staging.mjs
// Lee credenciales de .env.staging (gitignored, local) o de variables de
// entorno ya seteadas (en CI vienen de GitHub Secrets — no hace falta el
// archivo ahí).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Lista negra explícita — además del chequeo de que matchee el ref de
// staging declarado. Doble guarda a propósito (pedido explícito: "que el
// script aborte si el project ref es el de producción, como lista negra
// explícita además del chequeo de que matchee staging").
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

function abortar(msg) {
  console.error(`\nABORTADO — ${msg}\n`);
  process.exit(1);
}

const ref = process.env.STAGING_PROJECT_REF;
const host = process.env.STAGING_DB_HOST;
const user = process.env.STAGING_DB_USER;
const password = process.env.STAGING_DB_PASSWORD;
const port = Number(process.env.STAGING_DB_PORT || 5432);
const database = process.env.STAGING_DB_NAME || 'postgres';

if (!ref || !host || !user || !password) {
  abortar('Faltan STAGING_PROJECT_REF / STAGING_DB_HOST / STAGING_DB_USER / STAGING_DB_PASSWORD (.env.staging o env de CI).');
}
if (REFS_PRODUCCION_PROHIBIDOS.includes(ref)) {
  abortar(`El ref "${ref}" está en la lista negra de producción. Este script no corre ahí, nunca.`);
}
if (user !== `postgres.${ref}`) {
  abortar(`STAGING_DB_USER ("${user}") no coincide con STAGING_PROJECT_REF ("${ref}") — posible mezcla de credenciales, no continúo.`);
}

// Migraciones que son arreglos puntuales de datos REALES de producción, con
// guardas explícitas (RAISE EXCEPTION) que verifican que existan exactamente
// esos registros — nunca van a pasar contra una base sintética/vacía, y no
// tiene sentido que pasen (no son schema, son curas de un incidente puntual
// ya resuelto en producción). Se excluyen del replay a propósito, no por un
// fallo transitorio.
const EXCLUIR_DEL_REPLAY = new Set([
  // "se esperaban 5 legajos activos en el grupo B y hay 0" — limpieza de
  // altas de prueba/duplicados de una carga masiva puntual (21/09/2026).
  'v154_limpieza_altas_prueba_y_duplicados.sql',
  // "se esperaban 7 pedidos PAGAN en confirmado_revision" — corrección de
  // los pedidos trabados en la bandeja del auditor (25/09/2026, ver
  // TICKET del mismo día / commit 23ed3a0).
  'v169_pp_bandeja_solo_no_pagan.sql',
]);

const SQL_DIR = join(ROOT, 'sql');
const archivos = readdirSync(SQL_DIR)
  .filter((f) => /^v\d+[a-z]?_.*\.sql$/.test(f))
  .filter((f) => !EXCLUIR_DEL_REPLAY.has(f))
  .sort();

if (!archivos.length) abortar('No encontré migraciones en sql/ — revisá la ruta.');

console.log(`Reset de staging (ref ${ref}) — ${archivos.length} migraciones a aplicar.`);

const client = new Client({ host, port, user, password, database, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query('select current_database() as db');
console.log(`Conectado: ${host} / db "${rows[0].db}"`);

console.log('Recreando el schema public desde cero...');
await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
await client.query('CREATE SCHEMA public;');
await client.query(`
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
`);

let ok = 0;
for (const archivo of archivos) {
  process.stdout.write(`  ${archivo} ... `);
  const sql = readFileSync(join(SQL_DIR, archivo), 'utf8');
  try {
    await client.query(sql);
    console.log('ok');
    ok++;
  } catch (e) {
    console.log('FALLÓ');
    console.error(`\n${archivo}: ${e.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(`\nListo: ${ok}/${archivos.length} migraciones aplicadas sobre staging.`);
await client.end();
