// Dry run de v185 contra staging, con las 29 sospechosas repartidas en VARIOS
// períodos. El primer dry run usaba sólo 2026-09/2026-10, que es justo lo que
// hizo que la migración fallara en producción (encontró 23 de 29).
//
// Se comprueba lo importante: que la migración funcione sin filtro de período,
// que respete el total de 29, y que las 3 post-condiciones den 0.
import fs from 'fs';
import pg from 'pg';

const env = {};
for (const line of fs.readFileSync('.env.staging', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const c = new pg.Client({
  host: env.STAGING_DB_HOST, port: +env.STAGING_DB_PORT,
  user: env.STAGING_DB_USER, password: env.STAGING_DB_PASSWORD,
  database: env.STAGING_DB_NAME, ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query('BEGIN');

// ── Dataset: 29 sospechosas en 4 períodos, con la FORMA de producción ──────
// N° 9957xx porque staging ya tiene legajos con 5486/5581 y el DISTINCT ON
// ataba al socio equivocado (el dry run dio "Sequeira → Sosa").
const LEG = {
  995703: 'Sosa Silvio Fernando', 995705: 'Martinez Federico Eduardo',
  995706: 'Cocha Nicol', 995707: 'Sequeira Nicole',
  995708: 'Recalde Victoria Gabriela', 995709: 'Avalos Alan Sebastian',
  995710: 'Quiroga Bustos Karen Gimena', 995711: 'Cacerez Mayra Luján',
  995712: 'Díaz Daniela Candelaria',
};
// [periodo, nro, nombre en la fila] — 23 en sep/oct + 6 en otros períodos.
const FILAS = [
  // 2026-09: 12 sospechosas (2 huérfanos + 1 duplicado x4 + 3 huérfanos sueltos)
  ['2026-09', '995701', '113'], ['2026-09', '995702', '4734'], ['2026-09', '995702', '4734'],
  ['2026-09', '995704', '5495'],
  ['2026-09', '995707', '5580'], ['2026-09', '995707', '5580'],
  ['2026-09', '995707', '5578'], ['2026-09', '995707', '5578'],
  ['2026-09', '995703', ''], ['2026-09', '995705', '5579'], ['2026-09', '995706', '5583'],
  ['2026-09', '995708', '5486'],
  // 2026-10: 11 sospechosas
  ['2026-10', '995701', '113'], ['2026-10', '995704', '5495'],
  ['2026-10', '995712', '5583'], ['2026-10', '995712', '5583'],
  ['2026-10', '995707', '5580'], ['2026-10', '995707', '5578'],
  ['2026-10', '995707', '5578'], ['2026-10', '995707', '5580'],
  ['2026-10', '995709', '5579'], ['2026-10', '995710', '5580'], ['2026-10', '995711', '5581'],
  // Otros períodos: 6. Estas son las que el filtro por período dejaba afuera.
  ['2026-07', '995703', '5486'], ['2026-07', '995707', '5580'], ['2026-07', '995707', '5578'],
  ['2026-06', '995702', '4734'], ['2026-06', '995712', '5583'], ['2026-06', '995712', '5583'],
];

const cols = async (t) => new Set((await c.query(
  `SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1`, [t])).rows.map(r => r.column_name));
const cPagos = await cols('mono_pagos_mes');
const cLeg = await cols('legajos');
const cMon = await cols('monotributos');

// Idempotente: hay que borrar también las filas numéricas del rango usado, no
// sólo las 'dry-%'. Con una corrida anterior abortada, el id 700000000 quedaba
// y la siguiente moría con duplicate key.
await c.query(`DELETE FROM mono_pagos_mes WHERE id_local LIKE 'dry-%'`);
await c.query(`DELETE FROM mono_pagos_mes WHERE id_local IN (
  SELECT i FROM (SELECT id_local i FROM mono_pagos_mes WHERE id_local ~ '^[0-9]+$') s
  WHERE i::bigint BETWEEN 700000000 AND 700000999)`);
await c.query(`DELETE FROM mono_cambios WHERE id_local LIKE 'v185-%' OR id_local LIKE 'dry-%'`);
await c.query(`DELETE FROM legajos WHERE id_local LIKE 'dry-%' OR id_local LIKE 'v185-%'`);
await c.query(`DELETE FROM monotributos WHERE id_local LIKE 'dry-%'`);
await c.query(`DROP TABLE IF EXISTS mono_pagos_mes_v185_backup`);

for (const [nro, nombre] of Object.entries(LEG)) {
  const d = { id_local: `dry-${nro}`, nro: Number(nro), nombre, estado: 'Activo' };
  const k = Object.keys(d).filter(x => cLeg.has(x));
  await c.query(`INSERT INTO legajos (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')})
                 ON CONFLICT (id_local) DO NOTHING`, k.map(x => d[x]));
}
// El Padrón de 995712 queda con el placeholder que dejó la conciliación vieja.
{
  const d = { id_local: 'dry-p-995712', nro_socio: '995712', nombre: 'SOCIO 5582 (sin legajo encontrado)' };
  const k = Object.keys(d).filter(x => cMon.has(x));
  if (k.length >= 2) await c.query(`INSERT INTO monotributos (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT (id_local) DO NOTHING`, k.map(x => d[x]));
}

let id = 700000000;
for (const [periodo, nro, nombre] of FILAS) {
  const d = { id_local: String(id++), periodo, nro_socio: nro, nombre, total: 49527.18 };
  const k = Object.keys(d).filter(x => cPagos.has(x));
  await c.query(`INSERT INTO mono_pagos_mes (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')})`, k.map(x => d[x]));
}
console.log(`sembradas ${FILAS.length} sospechosas en ${new Set(FILAS.map(f => f[0])).size} períodos, ${Object.keys(LEG).length} legajos`);

// Staging está más atrás que producción: no tiene las columnas de v181, que
// v185 exige. Se agregan acá DENTRO de la transacción (se revierte al final)
// para simular el estado real de producción sin aplicar v181 en staging.
for (const col of [
  'excluido_mes boolean',
  'en_revision_motivo text',
]) {
  const nombre = col.split(' ')[0];
  const tipo = col.split(' ').slice(1).join(' ');
  await c.query(`ALTER TABLE mono_pagos_mes ADD COLUMN IF NOT EXISTS ${nombre} ${tipo}`);
}
console.log('columnas de v181 simuladas (se revierten con el ROLLBACK)');

// ── La migración ───────────────────────────────────────────────────────────
// Se le sacan BEGIN y COMMIT. El archivo trae los suyos y, al correrlo tal
// cual, ese COMMIT cerraba la transacción del harness: el ROLLBACK de abajo no
// deshacía nada y los datos de prueba quedaban commiteados de verdad en
// staging. Para un dry run hay que correrlo dentro de la transacción propia.
const crudo = fs.readFileSync('sql/v185_mono_conciliacion_filas_import.sql', 'utf8');
const sql = crudo.replace(/^\s*BEGIN;/m, '').replace(/^\s*COMMIT;/m, '');
if (sql === crudo) console.log('AVISO: no se encontró BEGIN/COMMIT en la migración; revisar el harness.');
try {
  await c.query(sql);
  console.log('OK   la migración corrió sin abortar');
} catch (e) {
  console.log(`FALLA la migración: ${e.message}`);
  await c.query('ROLLBACK'); await c.end(); process.exit(1);
}

const check = async (etq, t) => {
  const r = await c.query(t);
  const ok = r.rows[0].n === '0';
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${etq} = ${r.rows[0].n} (esperado 0)`);
  if (!ok) console.table(r.rows);
  return ok;
};
let todo = true;
todo = await check('sospechosas visibles',
  `SELECT count(*)::text n FROM mono_pagos_mes
   WHERE (to_jsonb(mono_pagos_mes)->>'excluido_mes') IS DISTINCT FROM 'true'
     AND (nombre IS NULL OR btrim(nombre)='' OR btrim(nombre) ~ '^\\(?\\d+\\)?\\s*(\\([A-Za-zÁ-Úá-ú]\\))?\\s*$')`) && todo;
todo = await check('personas con != 1 fila visible',
  `SELECT count(*)::text n FROM (
     SELECT periodo, nro_socio FROM mono_pagos_mes p JOIN legajos l ON l.nro::text=p.nro_socio
     WHERE (to_jsonb(p)->>'excluido_mes') IS DISTINCT FROM 'true'
     GROUP BY 1,2 HAVING count(*) <> 1) t`) && todo;
todo = await check('nombres cruzados',
  `SELECT count(*)::text n FROM mono_pagos_mes p JOIN legajos l ON l.nro::text=p.nro_socio
   WHERE (to_jsonb(p)->>'excluido_mes') IS DISTINCT FROM 'true' AND p.nombre IS DISTINCT FROM l.nombre`) && todo;

const res = await c.query(
  `SELECT count(*) FILTER (WHERE (to_jsonb(mono_pagos_mes)->>'excluido_mes')='true')::int descartadas,
          count(*) FILTER (WHERE (to_jsonb(mono_pagos_mes)->>'excluido_mes') IS DISTINCT FROM 'true')::int conservadas
   FROM mono_pagos_mes WHERE id_local ~ '^[0-9]+$'`);
console.log(`\ndescartadas=${res.rows[0].descartadas}  conservadas=${res.rows[0].conservadas}  (de ${FILAS.length})`);
const log = await c.query(`SELECT count(*)::int n FROM mono_cambios WHERE motivo LIKE 'v185 —%'`);
console.log(`entradas en mono_cambios=${log.rows[0].n}`);
const pad = await c.query(`SELECT nombre FROM monotributos WHERE nro_socio='995712'`);
console.log(`Padrón 995712 ahora: "${pad.rows[0]?.nombre}"`);
const dist = await c.query(
  `SELECT periodo, count(*)::int total,
          count(*) FILTER (WHERE (to_jsonb(mono_pagos_mes)->>'excluido_mes')='true')::int descartadas
   FROM mono_pagos_mes WHERE id_local ~ '^[0-9]+$' GROUP BY periodo ORDER BY periodo`);
console.table(dist.rows);

await c.query('ROLLBACK');
await c.end();
console.log(todo ? '\nRESULTADO: la migración hace lo que dice, en todos los períodos.'
                 : '\nRESULTADO: alguna post-condición NO se cumple.');