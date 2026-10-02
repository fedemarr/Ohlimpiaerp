// Corre un archivo .sql de verdad contra STAGING y dice qué consulta no compila.
// Existe porque tres SQL llegué a mandarle a producción sin ejecutar antes y
// los tres fallaron: un GROUP BY de más, una columna que depende de la versión
// del schema, y un RAISE con más argumentos que %.
//
//   node scripts/validar_sql.mjs sql/INVESTIGACION_filas_sin_nombre_READONLY.sql
//
// Sólo escribe si el archivo tiene INSERT/UPDATE/DELETE, y en ese caso avisa:
// para chequeos de lectura conviene apuntarlo a staging y no a producción.
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

// Parte el archivo en sentencias y corre cada una. Manda error al primer
// fallo, con el número de bloque y el mensaje de Postgres.
const file = process.argv[2];
const sql = fs.readFileSync(file, 'utf8');
const escribe = /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/im.test(
  sql.split(/\r?\n/).filter(l => !/^\s*--/.test(l)).join('\n'));
if (escribe && !process.argv.includes('--force')) {
  console.error(`Este archivo tiene escrituras. Para migraciones hay que usar el dry run:`);
  console.error(`  node scripts/dryrun_v185.mjs`);
  console.error(`(o pasá --force sólo si sabés qué hace)`);
  process.exit(1);
}
const bloques = sql.split(/^--\s*={10,}\s*$/m).filter(b => b.trim());

let n = 0;
for (const b of bloques) {
  n++;
  // Una sentencia = lo que va entre ';', ignorando los de funciones $$..$$.
  const stmts = [];
  let depth = 0, cur = '';
  for (const line of b.split(/\r?\n/)) {
    cur += line + '\n';
    depth += (line.match(/\$\$/g) || []).length;
    if (depth === 0 && line.trim().endsWith(';')) { stmts.push(cur); cur = ''; depth = 0; }
  }
  if (cur.trim()) stmts.push(cur);
  for (const s of stmts) {
    // Para detectar el tipo hay que ignorar las líneas de comentario: las
    // consultas arrancan con "-- A) ..." y si no, no matchea nada y el
    // validador dice "todo OK" sin haber corrido una sola sentencia.
    const limpio = s.split(/\r?\n/).filter(l => !/^\s*--/.test(l)).join('\n').trim();
    if (!/^(SELECT|WITH|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)/i.test(limpio)) continue;
    const etiqueta = (s.match(/^\s*--.*?\b([A-Z])\)/m) || [])[1] || `bloque ${n}`;
    try {
      const r = await c.query(s);
      console.log(`OK   ${etiqueta}: ${r.rowCount} fila(s)`);
      if (r.rows.length && r.rows.length <= 40) {
        console.table(r.rows);
      } else if (r.rows.length) {
        console.log(`     (${r.rows.length} filas, no se imprime la tabla)`);
      }
    } catch (e) {
      console.log(`FALLA ${etiqueta}: ${e.message}`);
      console.log(e.position ? `     posición ${e.position}` : '');
      process.exitCode = 1;
    }
  }
}
await c.end();
console.log(process.exitCode ? '\nRESULTADO: hay consultas que NO corren.' : '\nRESULTADO: todo el SQL corre.');