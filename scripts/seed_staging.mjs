#!/usr/bin/env node
// Seed sintético de STAGING (OHLIMPIA_TESTS_STAGING.md, Parte 1).
//
// Se corre DESPUÉS de scripts/reset_staging.mjs (que ya deja el schema
// vacío y las 173 migraciones aplicadas — incluida la semilla real de
// mono_tablas que trae v117). Este script solo INSERTA datos de negocio
// sintéticos — nunca un dump de producción (prohibido explícitamente por
// el spec: acá vive monotributo/claves fiscales/liquidaciones reales de
// 411 personas).
//
// Es idempotente: borra sus propias filas (reconocibles por el prefijo
// 'seed_' en id_local, o nro >= 900000 para legajos/prestamos) antes de
// volver a insertar, así se puede correr de nuevo sin resetear el schema
// entero si solo cambió este archivo.
//
// IMPORTANTE — "montos literales en constantes arriba, no calculados"
// (pedido explícito de Fede): todos los montos que un test de Nivel 1 va
// a comparar están escritos a mano acá abajo, y las cuentas que los
// respaldan están en el comentario de al lado — si algo no cierra a mano,
// es un bug de ESTE archivo, no una fórmula reusada del propio código de
// la app (que sería circular: probaría que el código está de acuerdo
// consigo mismo, no que el resultado es el correcto).

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
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

function abortar(msg) { console.error(`\nABORTADO — ${msg}\n`); process.exit(1); }

const ref = process.env.STAGING_PROJECT_REF;
const host = process.env.STAGING_DB_HOST;
const user = process.env.STAGING_DB_USER;
const password = process.env.STAGING_DB_PASSWORD;
const port = Number(process.env.STAGING_DB_PORT || 5432);
const database = process.env.STAGING_DB_NAME || 'postgres';

if (!ref || !host || !user || !password) abortar('Faltan STAGING_PROJECT_REF/STAGING_DB_HOST/STAGING_DB_USER/STAGING_DB_PASSWORD (.env.staging o env de CI).');
if (REFS_PRODUCCION_PROHIBIDOS.includes(ref)) abortar(`El ref "${ref}" está en la lista negra de producción. Este script no corre ahí, nunca.`);
if (user !== `postgres.${ref}`) abortar(`STAGING_DB_USER ("${user}") no coincide con STAGING_PROJECT_REF ("${ref}") — no continúo.`);

// =====================================================================
// CONSTANTES — todo lo que un test de Nivel 1 puede llegar a comparar
// vive acá, escrito a mano, con la cuenta al lado.
// =====================================================================

export const MES_CERRADO = '2026-08';   // congelado=true — no se puede tocar
export const MES_ABIERTO = '2026-09';   // congelado=false — el mes en curso

export const LEGAJO_LIQUIDACION_OK = {
  nro: 900001,
  nombre: 'Gómez Marcela (SEED)',
  servicio: 'SEED.LIMPIEZA.A',
  categoriaIdLocal: 'seed_cat_opA',
  valorHora: 1000,                       // $1.000/hora, categoría Operario A, vigente desde MES_CERRADO
  // Vigencias (caso borde pedido: "un valor con vigente-desde posterior no
  // afecta un período anterior"): esta misma categoría tiene OTRO valor
  // hora más nuevo, vigente recién desde el mes siguiente al cerrado. La
  // liquidación de MES_CERRADO tiene que seguir usando 1000, no 1500.
  valorHoraPosterior: 1500,
  vigenciaPosteriorDesde: '2026-09-01',
  horasPorDia: 8,
  diasTrabajados: 22,                    // 22 días hábiles de agosto/2026, sin ausencias 'AI'
  // Cuenta a mano:
  //   horas totales = 22 × 8 = 176
  //   bruto         = 176 × 1000        = 176000
  //   presentismo   = round(176000*0.03) = 5280   (sin AI, las 2 funciones de legacy.js coinciden)
  //   neto          = 176000 + 5280      = 181280
  BRUTO_ESPERADO: 176000,
  PRESENTISMO_ESPERADO: 5280,
  NETO_ESPERADO: 181280,
};

// Caso borde "alguien fuera de categoría": tiene un registro en el padrón,
// pero ese código de categoría NO tiene ningún valor-hora vigente cargado
// para su servicio (ni general) — obtenerValorHoraVigente() tiene que
// devolver null, nunca inventar un 0. Sirve para probar que el cálculo NO
// tapa el hueco con un valor plausible.
export const LEGAJO_FUERA_DE_CATEGORIA = {
  nro: 900002,
  nombre: 'Díaz Roberto (SEED — sin valor hora)',
  servicio: 'SEED.LIMPIEZA.A',
  categoriaIdLocal: 'seed_cat_sin_valor', // existe en categorias_base, pero SIN fila en valores_hora_categoria
};

export const PRESTAMO_MITAD_DE_PLAN = {
  nroSocio: 900003,
  nombre: 'Fernández Lucas (SEED)',
  capital: 400000,
  tasaInteres: 10,                       // %
  cuotas: 4,
  // Cuenta a mano:
  //   montoTotal = round(400000 * 1.10) = 440000
  //   montoCuota = floor(440000 / 4)    = 110000  (exacto, sin resto en la última)
  MONTO_TOTAL_ESPERADO: 440000,
  MONTO_CUOTA_ESPERADO: 110000,
  // Cuota 1 (agosto/2026, MES_CERRADO) ya Debitada — a mitad de plan.
  // Saldo = montoTotal - debitadas = 440000 - 110000 = 330000.
  SALDO_ESPERADO_A_MITAD_DE_PLAN: 330000,
};

// Monotributo — CUR congelado. Los valores de ARCA categoría 'A' vigencia
// 2026-08-01 YA los siembra sql/v117 (no se reinventan acá, se copian
// literal de ese archivo para que la cuenta sea verificable contra la
// fuente real):
//   impuesto_integrado = 5585.77
//   sipa               = 18246.86
//   obra_social        = 25694.55
//   total              = 5585.77 + 18246.86 + 25694.55 = 49527.18
export const MONOTRIBUTO_CONGELADO = {
  nroSocio: 900004,
  nombre: 'Alonso Patricia (SEED)',
  periodo: MES_CERRADO,
  organismo: 'ARCA',
  categoria: 'A',
  TOTAL_CONGELADO_ESPERADO: 49527.18,
};
// Tabla POSTERIOR (vigencia futura, con valores bien distintos) — el
// cálculo de MONOTRIBUTO_CONGELADO tiene que seguir dando 49527.18 aunque
// esta tabla nueva exista, porque mono_pagos_mes.pagado=true la protege.
export const MONO_TABLA_POSTERIOR = {
  vigenciaDesde: '2026-10-01',
  categoria: 'A',
  impuestoIntegrado: 7000.00,
  sipa: 20000.00,
  obraSocial: 27000.00,
  // (no se usa en ningún assert — existe solo para probar que NO afecta al mes congelado)
};

// Dos "empresas" con nombres parecidos (registro de Superadmin,
// empresas_cliente) — ver nota en el propio test de Nivel 1: en este
// proyecto el multi-tenant real es "un proyecto de Supabase por empresa"
// (sql/v089, comentario explícito: "no hay empresa_id compartido en
// ninguna tabla operativa"), así que esto NO prueba aislamiento de datos
// operativos — prueba que una consulta filtrada por id_local nunca cruza
// el registro de una empresa con el de otra parecida, que es lo único
// real que hay para probar acá sin inventar una arquitectura que no existe.
export const EMPRESA_A = { idLocal: 'seed_emp_a', nombre: 'Clean Solutions SRL', supabaseUrl: 'https://proyecto-clean-srl.supabase.co' };
export const EMPRESA_B = { idLocal: 'seed_emp_b', nombre: 'Clean Solutions SA', supabaseUrl: 'https://proyecto-clean-sa.supabase.co' };

// =====================================================================
// Colaboradores de relleno (volumen para explorar la pantalla a mano —
// no son parte de ningún assert de Nivel 1, por eso no necesitan montos
// verificados, solo variedad realista).
// =====================================================================
const NOMBRES_RELLENO = [
  'Acosta Braian', 'Benítez Yamila', 'Cabrera Nahuel', 'Domínguez Ayelén', 'Escobar Tomás',
  'Farías Camila', 'Gimenez Ezequiel', 'Herrera Sofía', 'Ibarra Lucas', 'Juárez Valentina',
  'Leiva Franco', 'Medina Martina', 'Nuñez Agustín', 'Ortiz Catalina', 'Paz Joaquín',
  'Quiroga Milagros', 'Rojas Bautista', 'Sosa Delfina', 'Torres Benjamín', 'Vega Emilia',
];

async function limpiarSeedAnterior(client) {
  console.log('Limpiando datos de un seed anterior (si había)...');
  await client.query(`delete from public.lotes_pago_items where legajo_nro::bigint >= 900000`);
  await client.query(`delete from public.lotes_pago where id_local like 'seed_%'`);
  await client.query(`delete from public.grillas_liq where id_local like 'seed_%'`);
  await client.query(`delete from public.periodos_liquidacion where periodo in ($1,$2)`, [MES_CERRADO, MES_ABIERTO]);
  await client.query(`delete from public.padron_categorias_asociado where legajo_nro::bigint >= 900000`);
  await client.query(`delete from public.mono_pagos_mes where id_local like 'seed_%'`);
  await client.query(`delete from public.monotributos where nro_socio::bigint >= 900000`);
  await client.query(`delete from public.mono_tablas where id_local like 'seed_%'`);
  await client.query(`delete from public.prestamos where nro_socio::bigint >= 900000`);
  await client.query(`delete from public.legajos where nro >= 900000`);
  await client.query(`delete from public.valores_hora_categoria where id_local like 'seed_%'`);
  await client.query(`delete from public.categorias_base where id_local like 'seed_%'`);
  await client.query(`delete from public.objetivos where codigo like 'SEED.%'`);
  await client.query(`delete from public.clientes where id_local like 'seed_%'`);
  await client.query(`delete from public.empresas_cliente where id_local in ($1,$2)`, [EMPRESA_A.idLocal, EMPRESA_B.idLocal]);
}

async function seedClientesYServicios(client) {
  console.log('Sembrando clientes y servicios (objetivos)...');
  const clientes = [
    { idLocal: 'seed_cli_1', razon: 'Consorcio Seed Uno', tipo: 'Consorcio' },
    { idLocal: 'seed_cli_2', razon: 'Empresa Seed Dos SA', tipo: 'Empresa' },
  ];
  for (const c of clientes) {
    await client.query(
      `insert into public.clientes (id_local, nombre, razon, tipo_contrato, estado)
       values ($1,$2,$2,$3,'Activo') on conflict (id_local) do nothing`,
      [c.idLocal, c.razon, 'Contrato firmado'],
    );
  }

  const servicios = [
    { codigo: 'SEED.LIMPIEZA.A', nombre: 'Limpieza Consorcio Seed Uno', clienteIdLocal: 'seed_cli_1' },
    { codigo: 'SEED.LIMPIEZA.B', nombre: 'Limpieza Empresa Seed Dos', clienteIdLocal: 'seed_cli_2' },
    { codigo: 'SEED.MANTENIMIENTO.C', nombre: 'Mantenimiento Seed Tres', clienteIdLocal: 'seed_cli_1' },
    { codigo: 'SEED.EVENTOS.D', nombre: 'Evento Seed Cuatro', clienteIdLocal: 'seed_cli_2' },
  ];
  for (const s of servicios) {
    await client.query(
      `insert into public.objetivos (id_local, cliente_id_local, codigo, nombre, tipo, modelo_precio, cargado_por, estado, anulado)
       values ($1,$2,$3,$4,'Limpieza','Por EFT','seed_staging.mjs','Operativo',false)
       on conflict (id_local) do nothing`,
      [s.codigo.toLowerCase().replace(/\./g, '_'), s.clienteIdLocal, s.codigo, s.nombre],
    );
  }
}

async function seedCategoriasYValoresHora(client) {
  console.log('Sembrando categorías y valores hora...');
  await client.query(
    `insert into public.categorias_base (id_local, codigo, nombre, grupo, activa, anulado)
     values ($1,'OPERARIO_A_SEED','Operario A (seed)','Operativo',true,false)
     on conflict (id_local) do nothing`,
    [LEGAJO_LIQUIDACION_OK.categoriaIdLocal],
  );
  await client.query(
    `insert into public.categorias_base (id_local, codigo, nombre, grupo, activa, anulado)
     values ($1,'SIN_VALOR_SEED','Categoría sin valor hora (seed)','Operativo',true,false)
     on conflict (id_local) do nothing`,
    [LEGAJO_FUERA_DE_CATEGORIA.categoriaIdLocal],
  );
  // A propósito: NO se inserta ninguna fila en valores_hora_categoria para
  // LEGAJO_FUERA_DE_CATEGORIA.categoriaIdLocal — ese es el punto del caso borde.
  await client.query(
    `insert into public.valores_hora_categoria (id_local, categoria_id_local, servicio_nombre, valor_hora, vigencia_desde, cargada_por, anulado)
     values ('seed_vh_opA', $1, null, $2, $3, 'seed_staging.mjs', false)
     on conflict (id_local) do nothing`,
    [LEGAJO_LIQUIDACION_OK.categoriaIdLocal, LEGAJO_LIQUIDACION_OK.valorHora, `${MES_CERRADO}-01`],
  );
  // Vigencia posterior (ver comentario en la constante) — NO tiene que
  // afectar el cálculo de MES_CERRADO.
  await client.query(
    `insert into public.valores_hora_categoria (id_local, categoria_id_local, servicio_nombre, valor_hora, vigencia_desde, cargada_por, anulado)
     values ('seed_vh_opA_posterior', $1, null, $2, $3, 'seed_staging.mjs', false)
     on conflict (id_local) do nothing`,
    [LEGAJO_LIQUIDACION_OK.categoriaIdLocal, LEGAJO_LIQUIDACION_OK.valorHoraPosterior, LEGAJO_LIQUIDACION_OK.vigenciaPosteriorDesde],
  );
}

async function seedLegajos(client) {
  console.log('Sembrando legajos (3 de prueba + 20 de relleno)...');
  const legajosPrueba = [
    { nro: LEGAJO_LIQUIDACION_OK.nro, nombre: LEGAJO_LIQUIDACION_OK.nombre, servicio: LEGAJO_LIQUIDACION_OK.servicio },
    { nro: LEGAJO_FUERA_DE_CATEGORIA.nro, nombre: LEGAJO_FUERA_DE_CATEGORIA.nombre, servicio: LEGAJO_FUERA_DE_CATEGORIA.servicio },
    { nro: PRESTAMO_MITAD_DE_PLAN.nroSocio, nombre: PRESTAMO_MITAD_DE_PLAN.nombre, servicio: 'SEED.LIMPIEZA.B' },
    { nro: MONOTRIBUTO_CONGELADO.nroSocio, nombre: MONOTRIBUTO_CONGELADO.nombre, servicio: 'SEED.MANTENIMIENTO.C' },
  ];
  // limpiarSeedAnterior() ya borró todo nro>=900000 — inserta directo, sin
  // ON CONFLICT (legajos.nro no tiene constraint único real en este schema).
  for (const l of legajosPrueba) {
    await client.query(
      `insert into public.legajos (nro, nombre, servicio, estado, dni)
       values ($1,$2,$3,'Activo',$4)`,
      [l.nro, l.nombre, l.servicio, String(30000000 + l.nro)],
    );
  }
  for (let i = 0; i < NOMBRES_RELLENO.length; i++) {
    const nro = 900100 + i;
    const servicio = ['SEED.LIMPIEZA.A', 'SEED.LIMPIEZA.B', 'SEED.MANTENIMIENTO.C', 'SEED.EVENTOS.D'][i % 4];
    await client.query(
      `insert into public.legajos (nro, nombre, servicio, estado, dni)
       values ($1,$2,$3,'Activo',$4)`,
      [nro, `${NOMBRES_RELLENO[i]} (SEED)`, servicio, String(31000000 + i)],
    );
  }
}

async function seedPadron(client) {
  console.log('Sembrando padrón de categorías...');
  await client.query(
    `insert into public.padron_categorias_asociado (id_local, legajo_nro, categoria_id_local, vigencia_desde, origen, cargado_por, anulado)
     values ($1,$2,$3,$4,'MASIVO','seed_staging.mjs',false)
     on conflict (legajo_nro, vigencia_desde) where not anulado do nothing`,
    ['seed_padron_ok', String(LEGAJO_LIQUIDACION_OK.nro), LEGAJO_LIQUIDACION_OK.categoriaIdLocal, `${MES_CERRADO}-01`],
  );
  await client.query(
    `insert into public.padron_categorias_asociado (id_local, legajo_nro, categoria_id_local, vigencia_desde, origen, cargado_por, anulado)
     values ($1,$2,$3,$4,'MASIVO','seed_staging.mjs',false)
     on conflict (legajo_nro, vigencia_desde) where not anulado do nothing`,
    ['seed_padron_fuera', String(LEGAJO_FUERA_DE_CATEGORIA.nro), LEGAJO_FUERA_DE_CATEGORIA.categoriaIdLocal, `${MES_CERRADO}-01`],
  );
}

async function seedPeriodosYGrilla(client) {
  console.log('Sembrando períodos (uno cerrado, uno abierto) y la grilla del mes cerrado...');
  await client.query(
    `insert into public.periodos_liquidacion (id_local, periodo, congelado, congelado_por, confirmado, confirmado_por)
     values ('seed_per_cerrado',$1,true,'seed_staging.mjs',true,'seed_staging.mjs')
     on conflict (periodo) do update set congelado=true, confirmado=true`,
    [MES_CERRADO],
  );
  await client.query(
    `insert into public.periodos_liquidacion (id_local, periodo, congelado, confirmado)
     values ('seed_per_abierto',$1,false,false)
     on conflict (periodo) do update set congelado=false`,
    [MES_ABIERTO],
  );

  // Días 1 a 22 de agosto/2026 (calendario simple, no "días hábiles" reales
  // — así el total de horas es siempre exactamente 22×8, sin depender de
  // qué día de la semana cae el 1° de agosto ese año) con 8hs parejas y
  // sin ningún día 'AI', para que el presentismo sea SIEMPRE bruto*0.03
  // sin ambigüedad entre las dos implementaciones que tiene legacy.js (ver
  // investigación).
  const dias = Array.from({ length: LEGAJO_LIQUIDACION_OK.diasTrabajados }, (_, i) => `${MES_CERRADO}-${String(i + 1).padStart(2, '0')}`);
  const horas = Object.fromEntries(dias.map((f) => [f, LEGAJO_LIQUIDACION_OK.horasPorDia]));

  const asociados = [{
    nombre: LEGAJO_LIQUIDACION_OK.nombre,
    nro: LEGAJO_LIQUIDACION_OK.nro,
    categoria: LEGAJO_LIQUIDACION_OK.categoriaIdLocal,
    horas,
  }, {
    // Mismo servicio, la categoría "fuera de categoría" — sin valor hora
    // vigente: queda en la grilla pero el cálculo de $ tiene que dar null,
    // nunca 0 (ver test de Nivel 1).
    nombre: LEGAJO_FUERA_DE_CATEGORIA.nombre,
    nro: LEGAJO_FUERA_DE_CATEGORIA.nro,
    categoria: LEGAJO_FUERA_DE_CATEGORIA.categoriaIdLocal,
    horas,
  }];

  await client.query(
    `insert into public.grillas_liq (id_local, objetivo_codigo, nombre, periodo, tipo, estado, asociados, total_a_pagar)
     values ('seed_grilla_cerrada', $1, $2, $3, 'servicio', 'Cerrada', $4::jsonb, $5)
     on conflict (id_local) do update set asociados=excluded.asociados, total_a_pagar=excluded.total_a_pagar`,
    [LEGAJO_LIQUIDACION_OK.servicio, 'Limpieza Consorcio Seed Uno', MES_CERRADO, JSON.stringify(asociados), LEGAJO_LIQUIDACION_OK.NETO_ESPERADO],
  );

  // El lote de pago ya confirmado — el registro INMUTABLE real de lo que
  // se pagó (DB.lqsPagos es solo memoria del navegador, esto sí persiste).
  await client.query(
    `insert into public.lotes_pago (id_local, nro_lote, periodo, tipo, cantidad, total, confirmado_por, confirmado_en, anulado)
     values ('seed_lote_1', 900001, $1, 'operarios', 1, $2, 'seed_staging.mjs', now(), false)
     on conflict (id_local) do update set total=excluded.total`,
    [MES_CERRADO, LEGAJO_LIQUIDACION_OK.NETO_ESPERADO],
  );
  await client.query(
    `insert into public.lotes_pago_items (id_local, lote_id_local, legajo_nro, nombre_asociado, monto)
     values ('seed_lote_1_item_1', 'seed_lote_1', $1, $2, $3)
     on conflict (id_local) do update set monto=excluded.monto`,
    [String(LEGAJO_LIQUIDACION_OK.nro), LEGAJO_LIQUIDACION_OK.nombre, LEGAJO_LIQUIDACION_OK.NETO_ESPERADO],
  );
}

async function seedMonotributo(client) {
  console.log('Sembrando monotributo (CUR congelado + tabla posterior)...');
  await client.query(
    `insert into public.monotributos (id_local, nombre, nro_socio, categoria, zona, condicion, estado, obra_social, iibb_aporta)
     values ('seed_mono_1', $1, $2, $3, 'provincia', 'comun', 'Activo', true, false)
     on conflict (id_local) do update set categoria=excluded.categoria`,
    [MONOTRIBUTO_CONGELADO.nombre, String(MONOTRIBUTO_CONGELADO.nroSocio), MONOTRIBUTO_CONGELADO.categoria],
  );

  await client.query(
    `insert into public.mono_pagos_mes (id_local, periodo, nro_socio, nombre, cur_congelado, total,
        imp_integrado_congelado, sipa_congelado, obra_social_congelado, categoria_congelada, condicion_congelada, pagado, pagado_por, pagado_en)
     values ('seed_mono_pago_1', $1, $2, $3, $4, $4, 5585.77, 18246.86, 25694.55, $5, 'comun', true, 'seed_staging.mjs', now())
     on conflict (id_local) do update set total=excluded.total, pagado=true`,
    [MONOTRIBUTO_CONGELADO.periodo, String(MONOTRIBUTO_CONGELADO.nroSocio), MONOTRIBUTO_CONGELADO.nombre, MONOTRIBUTO_CONGELADO.TOTAL_CONGELADO_ESPERADO, MONOTRIBUTO_CONGELADO.categoria],
  );

  // Tabla posterior con valores bien distintos — el mes de arriba, con
  // pagado=true, NO tiene que moverse aunque esto exista.
  await client.query(
    `insert into public.mono_tablas (id_local, organismo, categoria, vigencia_desde, impuesto_integrado, sipa, obra_social)
     values ('seed_mt_posterior', 'ARCA', $1, $2, $3, $4, $5)
     on conflict (organismo, categoria, vigencia_desde) do nothing`,
    [MONO_TABLA_POSTERIOR.categoria, MONO_TABLA_POSTERIOR.vigenciaDesde, MONO_TABLA_POSTERIOR.impuestoIntegrado, MONO_TABLA_POSTERIOR.sipa, MONO_TABLA_POSTERIOR.obraSocial],
  );
}

async function seedPrestamo(client) {
  console.log('Sembrando préstamo a mitad de plan (1 de 4 cuotas debitada)...');
  const planCuotas = [
    { numero: 1, periodo: MES_CERRADO, monto: PRESTAMO_MITAD_DE_PLAN.MONTO_CUOTA_ESPERADO, estado: 'Debitada', fechaDebito: `${MES_CERRADO}-15` },
    { numero: 2, periodo: MES_ABIERTO, monto: PRESTAMO_MITAD_DE_PLAN.MONTO_CUOTA_ESPERADO, estado: 'Pendiente' },
    { numero: 3, periodo: '2026-10', monto: PRESTAMO_MITAD_DE_PLAN.MONTO_CUOTA_ESPERADO, estado: 'Pendiente' },
    { numero: 4, periodo: '2026-11', monto: PRESTAMO_MITAD_DE_PLAN.MONTO_CUOTA_ESPERADO, estado: 'Pendiente' },
  ];
  const movimientos = [{ tipo: 'Débito cuota', monto: PRESTAMO_MITAD_DE_PLAN.MONTO_CUOTA_ESPERADO, cuotaNro: 1, fecha: `${MES_CERRADO}-15` }];

  const nroSocioStr = String(PRESTAMO_MITAD_DE_PLAN.nroSocio);
  await client.query(
    `insert into public.prestamos (id_local, nombre, nro_socio, legajo_id_local, servicio, monto, cuotas, monto_cuota,
        tasa_interes, monto_total, plan_cuotas, movimientos, historial_reprogramaciones, estado, periodo, fecha_pedido, cargado_por, anulado)
     values ('seed_prestamo_1',$1,$2,$3,'SEED.LIMPIEZA.B',$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'[]'::jsonb,'Aprobada',$11,$12,'seed_staging.mjs',false)
     on conflict (id_local) do update set plan_cuotas=excluded.plan_cuotas, movimientos=excluded.movimientos`,
    [
      PRESTAMO_MITAD_DE_PLAN.nombre, nroSocioStr, nroSocioStr,
      PRESTAMO_MITAD_DE_PLAN.capital, PRESTAMO_MITAD_DE_PLAN.cuotas, PRESTAMO_MITAD_DE_PLAN.MONTO_CUOTA_ESPERADO,
      PRESTAMO_MITAD_DE_PLAN.tasaInteres, PRESTAMO_MITAD_DE_PLAN.MONTO_TOTAL_ESPERADO,
      JSON.stringify(planCuotas), JSON.stringify(movimientos),
      MES_CERRADO, `${MES_CERRADO}-01`,
    ],
  );
}

async function seedEmpresasParecidas(client) {
  console.log('Sembrando 2 empresas con nombres parecidos (registro de Superadmin)...');
  for (const e of [EMPRESA_A, EMPRESA_B]) {
    await client.query(
      `insert into public.empresas_cliente (id_local, nombre, estado, supabase_url, anulado)
       values ($1,$2,'Activa',$3,false)
       on conflict (id_local) do update set nombre=excluded.nombre, supabase_url=excluded.supabase_url`,
      [e.idLocal, e.nombre, e.supabaseUrl],
    );
  }
}

async function main() {
  const client = new Client({ host, port, user, password, database, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log(`Seed de staging (ref ${ref}) — arrancando...`);
  try {
    await limpiarSeedAnterior(client);
    await seedClientesYServicios(client);
    await seedCategoriasYValoresHora(client);
    await seedLegajos(client);
    await seedPadron(client);
    await seedPeriodosYGrilla(client);
    await seedMonotributo(client);
    await seedPrestamo(client);
    await seedEmpresasParecidas(client);
    console.log('\nListo — seed aplicado.');
    console.log(`  Legajos de prueba: ${LEGAJO_LIQUIDACION_OK.nro}, ${LEGAJO_FUERA_DE_CATEGORIA.nro}, ${PRESTAMO_MITAD_DE_PLAN.nroSocio}, ${MONOTRIBUTO_CONGELADO.nroSocio}`);
    console.log(`  + ${NOMBRES_RELLENO.length} legajos de relleno (900100+).`);
  } finally {
    await client.end();
  }
}

// Permite `import { LEGAJO_LIQUIDACION_OK, ... } from './seed_staging.mjs'`
// desde los tests de Nivel 1 sin volver a correr el seed.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
}
