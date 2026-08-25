// Genera sql/v098_matriz_accesos_perfiles.sql desde el CSV exportado de la
// planilla MATRIZ_ACCESOS_PERFILES (hoja MATRIZ PERFILES). Fuente única de
// verdad: los valores del seed salen del parseo del CSV, no de transcripción.
'use strict';
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'MATRIZ_ACCESOS_PERFILES - MATRIZ PERFILES.csv');
const OUT_SQL = path.join(__dirname, '..', 'sql', 'v098_matriz_accesos_perfiles.sql');
const OUT_JS = path.join(__dirname, '..', 'src', 'modules', 'accesos', 'catalogo.js');

// ── Parser CSV mínimo (comillas dobles + comas dentro de comillas) ──
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const raw = fs.readFileSync(CSV_PATH, 'utf8');
// El archivo puede venir UTF-8 o Latin-1 según cómo Excel lo exportó.
let text = raw;
if (text.includes('\uFFFD') || /Ã|Â/.test(text)) text = Buffer.from(raw, 'latin1').toString('utf8');
const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');

// Buscar la fila de encabezado (empieza con "ÁREA") — antes hay título y nota
const headerIdx = lines.findIndex(l => l.startsWith('ÁREA'));
if (headerIdx === -1) { console.error('No se encontró la fila de encabezado ÁREA'); process.exit(1); }
const header = parseCsvLine(lines[headerIdx]);
const PERFIL_COLS = header.slice(2, 13).map(s => s.trim());
if (PERFIL_COLS.length !== 11 || !PERFIL_COLS[0]) {
  console.error('Header inesperado:', JSON.stringify(header));
  process.exit(1);
}

// Planilla → perfil key del sistema (mapeo confirmado por Fede)
const PERFIL_MAP = {
  'ADMIN': 'Administrador total',
  'GERENCIA GRAL': 'Gerencia General',
  'CONSEJO': 'Consejo Directivo',
  'FINANZAS': 'Finanzas',
  'RRHH': 'RRHH',
  'LOGÍSTICA': 'Logística',
  'AUDITOR': 'Auditor',
  'SUPERVISOR': 'Supervisor',
  'VENTAS': 'Comercial',
  'OPERACIONES': 'Operaciones',
  'SISTEMAS/DEV': 'DEVELOPER',
};

// Módulo planilla → key de pantalla/menú del sistema
const MODULO_KEY = {
  'Liquidación Administración': 'liq_admin',
  'Liquidación de horas': 'liquidacion',
  'Mantenimiento': 'mantenimiento',
  'Reasignaciones': 'reasignaciones',
  'Retenes': 'retenes',
  'Clientes': 'clientes',
  'Comisiones': 'comisiones',
  'CRM Comercial': 'crm',
  'Gestión de cobros': 'cobros',
  'Gestión de precios': 'precios',
  'Reclamos y NC': 'reclamos',
  'Servicios': 'objetivos',
  'Supervisión de servicios': 'supervision',
  'Supervisores': 'supervisores',
  'Legajos': 'legajos',
  'Capacitaciones': 'capacitaciones',
  'Competencia anual': 'competencia',
  'Descansos': 'descansos',
  'Enfermos y accidentes': 'enfermos',
  'Sanciones': 'sanciones',
  'Situaciones legales': 'legal',
  'Vacaciones': 'vacaciones',
  'Monotributos': 'monotributos',
  'Uniformes': 'uniformes',
  'Categorías': 'categorias',
  'Feriados': 'feriados',
  'Paritarias': 'paritarias',
  'SMVM histórico': 'smvm',
  'Configuración': 'configuracion',
  'Pedido de productos': 'pedido_productos',
  'Proveedores': 'proveedores',
  'Stock': 'stock',
  'Máquinas': 'maquinas',
  'Cuenta corriente (futuro)': 'futuro_cuenta_corriente',
  'Contable (futuro)': 'futuro_contable',
  'Políticas (futuro)': 'futuro_politicas',
  'Seguros (futuro)': 'futuro_seguros',
};

const NIVEL = { 'M': 2, 'L': 1, '—': 0 };

const rows = [];
for (let i = headerIdx + 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const area = (cols[0] || '').trim();
  const modulo = (cols[1] || '').trim();
  if (!area || !modulo) { console.error(`Fila ${i + 1} sin área/módulo:`, JSON.stringify(cols)); process.exit(1); }
  const valores = cols.slice(2, 13).map(s => s.trim());
  if (valores.length !== 11) { console.error(`Fila ${i + 1} (${modulo}): ${valores.length} valores, esperaba 11`); process.exit(1); }
  const nota = (cols[13] || '').trim();
  for (let j = 0; j < 11; j++) {
    if (!(valores[j] in NIVEL)) { console.error(`Fila ${i + 1} (${modulo}) col "${PERFIL_COLS[j]}": valor raro "${valores[j]}"`); process.exit(1); }
    rows.push({ area, modulo, perfilCol: PERFIL_COLS[j], nivel: NIVEL[valores[j]], nota });
  }
}

console.log(`Parseadas ${rows.length / 11} filas × 11 perfiles = ${rows.length} celdas.`);

// ── SQL ──
function q(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

let sql = [];
sql.push(`-- =============================================================================`);
sql.push(`-- Migración: v098 — Matriz de accesos y perfiles (tab "Acceso y perfiles")`);
sql.push(`-- Fecha:     2026-08-24`);
sql.push(`-- Fuente:    MATRIZ_ACCESOS_PERFILES.xlsx — hoja "MATRIZ PERFILES"`);
sql.push(`--            (seed generado por scripts/gen_v098.cjs desde el CSV exportado)`);
sql.push(`-- =============================================================================`);
sql.push(`--`);
sql.push(`-- MODELO`);
sql.push(`-- ------`);
sql.push(`-- * perfil_accesos: la PLANTILLA editable por perfil ("El perfil es la`);
sql.push(`--   PLANTILLA que precarga la grilla del usuario; después se ajusta`);
sql.push(`--   individual" — nota de la propia planilla). Nivel: 2=M modificar,`);
sql.push(`--   1=L solo lectura, 0=— sin acceso.`);
sql.push(`-- * usuario_accesos: override INDIVIDUAL por usuario (misma escala).`);
sql.push(`--   Efectivo = override usuario ?? plantilla perfil ?? fallback PERFILES.`);
sql.push(`--   Los 4 módulos "(futuro)" se persisten igual aunque todavía no tengan`);
sql.push(`--   pantalla, para que cuando existan ya estén configurados.`);
sql.push(`-- * RLS: lectura para cualquier autenticado (el menú la necesita para`);
sql.push(`--   decidir qué mostrar); escritura SOLO Administrador total (mismo`);
sql.push(`--   patrón que usuarios_update_propio_o_admin en v013).`);
sql.push(`--`);
sql.push(`BEGIN;`);
sql.push(``);
sql.push(`CREATE TABLE IF NOT EXISTS public.perfil_accesos (`);
sql.push(`  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,`);
sql.push(`  perfil     text NOT NULL,`);
sql.push(`  modulo_key text NOT NULL,`);
sql.push(`  nivel      smallint NOT NULL DEFAULT 0 CHECK (nivel IN (0,1,2)),`);
sql.push(`  created_at timestamptz NOT NULL DEFAULT now(),`);
sql.push(`  UNIQUE (perfil, modulo_key)`);
sql.push(`);`);
sql.push(``);
sql.push(`CREATE TABLE IF NOT EXISTS public.usuario_accesos (`);
sql.push(`  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,`);
sql.push(`  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,`);
sql.push(`  modulo_key text NOT NULL,`);
sql.push(`  nivel      smallint NOT NULL DEFAULT 0 CHECK (nivel IN (0,1,2)),`);
sql.push(`  created_at timestamptz NOT NULL DEFAULT now(),`);
sql.push(`  UNIQUE (usuario_id, modulo_key)`);
sql.push(`);`);
sql.push(``);
sql.push(`ALTER TABLE public.perfil_accesos ENABLE ROW LEVEL SECURITY;`);
sql.push(`ALTER TABLE public.usuario_accesos ENABLE ROW LEVEL SECURITY;`);
sql.push(``);
sql.push(`DROP POLICY IF EXISTS "accesos_select_authenticated" ON public.perfil_accesos;`);
sql.push(`CREATE POLICY "accesos_select_authenticated" ON public.perfil_accesos`);
sql.push(`  FOR SELECT TO authenticated USING (true);`);
sql.push(`DROP POLICY IF EXISTS "accesos_write_admin_total" ON public.perfil_accesos;`);
sql.push(`CREATE POLICY "accesos_write_admin_total" ON public.perfil_accesos`);
sql.push(`  FOR ALL TO authenticated`);
sql.push(`  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'))`);
sql.push(`  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'));`);
sql.push(``);
sql.push(`DROP POLICY IF EXISTS "usuario_accesos_select_authenticated" ON public.usuario_accesos;`);
sql.push(`CREATE POLICY "usuario_accesos_select_authenticated" ON public.usuario_accesos`);
sql.push(`  FOR SELECT TO authenticated USING (true);`);
sql.push(`DROP POLICY IF EXISTS "usuario_accesos_write_admin_total" ON public.usuario_accesos;`);
sql.push(`CREATE POLICY "usuario_accesos_write_admin_total" ON public.usuario_accesos`);
sql.push(`  FOR ALL TO authenticated`);
sql.push(`  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'))`);
sql.push(`  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.perfil = 'Administrador total'));`);
sql.push(``);
sql.push(`-- -----------------------------------------------------------------------------`);
sql.push(`-- SEED — exacto a la hoja "MATRIZ PERFILES" (M=2 · L=1 · —=0)`);
sql.push(`-- -----------------------------------------------------------------------------`);

// Agrupar por módulo para INSERTs legibles ordenados como la planilla
const modulosOrden = [];
const porModulo = new Map();
for (const r of rows) {
  const k = r.area + '|' + r.modulo;
  if (!porModulo.has(k)) { porModulo.set(k, []); modulosOrden.push({ area: r.area, modulo: r.modulo, nota: r.nota }); }
  porModulo.get(k).push(r.nivel);
}

const values = [];
for (const m of modulosOrden) {
  const key = MODULO_KEY[m.modulo];
  if (!key) { console.error('Módulo sin mapeo de key:', m.modulo); process.exit(1); }
  const niveles = porModulo.get(m.area + '|' + m.modulo);
  PERFIL_COLS.forEach((col, j) => {
    values.push(`(${q(PERFIL_MAP[col])}, ${q(key)}, ${niveles[j]})`);
  });
}
sql.push(`INSERT INTO public.perfil_accesos (perfil, modulo_key, nivel) VALUES`);
for (let i = 0; i < values.length; i += 6) {
  sql.push('  ' + values.slice(i, i + 6).join(', ') + (i + 6 < values.length ? ',' : ''));
}
sql.push(`ON CONFLICT (perfil, modulo_key) DO NOTHING;`);
sql.push(``);
sql.push(`COMMIT;`);
sql.push(``);
sql.push(`-- =============================================================================`);
sql.push(`-- DESPUÉS DE EJECUTAR:`);
sql.push(`--   1. Recargar la app: Configuración → Acceso y perfiles muestra la matriz`);
sql.push(`--      precargada y editable (los cambios se guardan en perfil_accesos).`);
sql.push(`--   2. Los usuarios siguen creándose en Supabase Auth (trigger de v013`);
sql.push(`--      autoprovisiona public.usuarios) o vía api/crear-usuario.js; el`);
sql.push(`--      override individual por usuario vive en usuario_accesos.`);
sql.push(`-- =============================================================================`);
fs.writeFileSync(OUT_SQL, sql.join('\n'), 'utf8');
console.log('SQL escrito:', OUT_SQL, `(${values.length} filas de seed)`);

// ── Catálogo JS (modules/accesos/catalogo.js) ──
// Se escribe DIRECTO el módulo para que el CSV siga siendo la única fuente
// de verdad: si Gabi actualiza la planilla, correr este script regenera
// catálogo y seed juntos.
function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

let js = [];
js.push(`// =============================================================================`);
js.push(`// GENERADO — NO editar a mano. Fuente: MATRIZ_ACCESOS_PERFILES hoja`);
js.push(`// "MATRIZ PERFILES" vía scripts/gen_v098.cjs (regenera sql/v098 también).`);
js.push(`// =============================================================================`);
js.push(``);
js.push(`export const MODULOS_ACCESOS = [`);
let lastArea = null;
for (const m of modulosOrden) {
  if (m.area !== lastArea && lastArea !== null) js.push(`  // ── fin ${esc(lastArea)} ──`);
  js.push(`  { key: '${MODULO_KEY[m.modulo]}', label: '${esc(m.modulo)}', area: '${esc(m.area)}'${m.nota ? `, nota: '${esc(m.nota)}'` : ''} },`);
  lastArea = m.area;
}
js.push(`];`);
js.push('');
js.push(`export const COLUMNAS_MATRIZ = [`);
for (const col of PERFIL_COLS) {
  js.push(`  { col: '${esc(col)}', perfil: '${esc(PERFIL_MAP[col])}' },`);
}
js.push(`];`);
js.push('');
js.push(`// Snapshot exacto de la planilla (nivel por perfil y módulo). Alimenta el`);
js.push(`// botón "Restaurar valores de la planilla" de la matriz.`);
js.push(`export const MATRIZ_SEED = {`);
for (const m of modulosOrden) {
  const niveles = porModulo.get(m.area + '|' + m.modulo);
  const pares = PERFIL_COLS.map((col, j) => `'${esc(PERFIL_MAP[col])}': ${niveles[j]}`).join(', ');
  js.push(`  ${MODULO_KEY[m.modulo]}: { ${pares} },`);
}
js.push(`};`);
fs.writeFileSync(OUT_JS, js.join('\n'), 'utf8');
console.log('Catálogo JS escrito:', OUT_JS);
