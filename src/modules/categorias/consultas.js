// Categorías v1 — funciones puras de consulta, sin efectos
// secundarios. Pensadas para que otros módulos (Enfermos y
// Accidentes, Liquidaciones) las importen cuando existan migrados —
// hoy ninguno lo hace todavía, esta tanda solo deja la API lista.
//
// Guard obligatorio (diseño §7): si no hay valor vigente, se devuelve
// null. Nunca se asume 0 — el módulo consumidor decide cómo fallar.

import { DB } from '@shared/state.js';

// id_local se trunca a 9 dígitos al persistir (supaSync); las
// referencias cruzadas armadas en memoria con el Date.now() de 13
// dígitos completo dejan de matchear tras un reload si no se
// canonicalizan también acá (mismo patrón que sanciones/catalogo.js).
export const idLocalTrunc = (id) => String(id).slice(-9);

// Trunca ambos lados: es idempotente sobre ids ya cortos (seed o
// post-reload), así que funciona igual si "categoriaIdLocal" viene
// vivo (onclick con el id en memoria) o congelado (guardado en otra
// tabla, ej. el historial de valores).
export function getCategoriaById(categoriaIdLocal) {
  return (DB.categoriasBase || []).find(c => !c.anulado && idLocalTrunc(c.id) === idLocalTrunc(categoriaIdLocal)) || null;
}

export function getPlusById(plusIdLocal) {
  return (DB.plusAdicionales || []).find(p => !p.anulado && idLocalTrunc(p.id) === idLocalTrunc(plusIdLocal)) || null;
}

// Valores horas v1.1 — la paritaria dejó de negociar por servicio, solo
// por categoría (feedback Gabi 2026-07). Los registros nuevos se cargan
// con servicioNombre=null ("aplica a toda la categoría"). Se acepta
// `servicioNombre` null en la consulta para pedir explícitamente el
// valor general de la categoría (usado por la matriz nueva). Cuando se
// pasa un servicio puntual (ej. Enfermos y Accidentes, que congela por
// legajo.servicio), un valor histórico específico de ESE servicio le
// gana a uno general si ambos están vigentes — así los datos viejos
// por servicio y los casos médicos ya congelados no se ven afectados
// por la migración al modelo por categoría.
export function obtenerValorHoraVigente(categoriaIdLocal, servicioNombre, fechaISO) {
  const candidatas = (DB.valoresHoraCategoria || []).filter(v =>
    !v.anulado &&
    String(v.categoriaIdLocal) === idLocalTrunc(categoriaIdLocal) &&
    (v.servicioNombre == null || v.servicioNombre === servicioNombre) &&
    v.vigenciaDesde <= fechaISO && (!v.vigenciaHasta || v.vigenciaHasta >= fechaISO)
  );
  candidatas.sort((a, b) => {
    const aEspecifico = a.servicioNombre != null, bEspecifico = b.servicioNombre != null;
    if (aEspecifico !== bEspecifico) return aEspecifico ? -1 : 1;
    return b.vigenciaDesde.localeCompare(a.vigenciaDesde);
  });
  return candidatas[0] || null;
}

export function obtenerValorPlusVigente(plusIdLocal, fechaISO) {
  const candidatas = (DB.valoresPlus || []).filter(v =>
    !v.anulado &&
    String(v.plusIdLocal) === idLocalTrunc(plusIdLocal) &&
    v.vigenciaDesde <= fechaISO && (!v.vigenciaHasta || v.vigenciaHasta >= fechaISO)
  );
  return candidatas.sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0] || null;
}

// Devuelve null si falta el valor base (nunca asume 0). Los plus que
// no tengan valor vigente simplemente no suman (se listan igual en
// referenciasIds.plusSinValor para que el consumidor decida qué hacer).
export function calcularValorEfectivo(categoriaIdLocal, servicioNombre, plusIdLocals, fechaISO) {
  const base = obtenerValorHoraVigente(categoriaIdLocal, servicioNombre, fechaISO);
  if (!base) return null;

  let plusTotal = 0;
  const plusAplicados = [];
  const plusSinValor = [];
  for (const plusIdLocal of (plusIdLocals || [])) {
    const version = obtenerValorPlusVigente(plusIdLocal, fechaISO);
    if (version) {
      plusTotal += Number(version.valorAdicional) || 0;
      plusAplicados.push({ plusIdLocal, valorPlusIdLocal: version.id, valorAdicional: version.valorAdicional });
    } else {
      plusSinValor.push(plusIdLocal);
    }
  }

  const valorBase = Number(base.valorHora) || 0;
  return {
    valorBase,
    plusTotal,
    valorEfectivo: valorBase + plusTotal,
    referenciasIds: { valorHoraIdLocal: base.id, plusAplicados, plusSinValor },
  };
}

// ========== PADRÓN DE CATEGORÍA POR ASOCIADO (v124) ==========
//
// Fuente ÚNICA de la categoría de un operario. Un registro por evento,
// vigencia SIEMPRE a nivel mes (vigencia_desde = primer día del mes).
// La categoría de una persona a una fecha = el registro (no anulado) con
// vigencia_desde más reciente <= esa fecha. Legajos y las grillas de
// Liquidación de horas leen de acá — ver mockup_categorias_padron_1.html.

// Primer día del mes de una fecha ISO (YYYY-MM-DD) — la vigencia del
// padrón se compara siempre contra el mes, no el día.
function _primerDiaDelMes(fechaISO) {
  return String(fechaISO || '').slice(0, 7) + '-01';
}

// Registro de padrón vigente para un asociado a una fecha dada.
// legajoNro: el N° de socio (lo que usa toda la app para referenciar
// legajos). fechaISO: 'YYYY-MM-DD' — default hoy.
export function registroPadronVigente(legajoNro, fechaISO) {
  const ref = _primerDiaDelMes(fechaISO || new Date().toISOString().slice(0, 10));
  const candidatos = (DB.padronCategoriasAsociado || []).filter(r =>
    !r.anulado && String(r.legajoNro) === String(legajoNro) && String(r.vigenciaDesde) <= ref);
  candidatos.sort((a, b) => String(b.vigenciaDesde).localeCompare(String(a.vigenciaDesde)));
  return candidatos[0] || null;
}

// Categoría (objeto de categorias_base) vigente para un asociado a una
// fecha. Devuelve null si el asociado no tiene ningún registro en el
// padrón todavía (nunca inventa — mismo criterio que obtenerValorHoraVigente).
export function categoriaVigenteAsociado(legajoNro, fechaISO) {
  const reg = registroPadronVigente(legajoNro, fechaISO);
  return reg ? getCategoriaById(reg.categoriaIdLocal) : null;
}

// Todo el historial de padrón de un asociado, más nuevo primero.
export function historialPadronAsociado(legajoNro) {
  return (DB.padronCategoriasAsociado || [])
    .filter(r => !r.anulado && String(r.legajoNro) === String(legajoNro))
    .sort((a, b) => String(b.vigenciaDesde).localeCompare(String(a.vigenciaDesde)));
}

// Compat: obtenerCategoriaLegajo() ahora resuelve desde el padrón (a hoy).
// Fallback a legajo.categoriaIdLocal para asociados que todavía no
// tienen registro en el padrón (durante la transición / carga inicial).
export function obtenerCategoriaLegajo(legajoIdLocal, fechaISO) {
  const delPadron = categoriaVigenteAsociado(legajoIdLocal, fechaISO);
  if (delPadron) return delPadron;
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(legajoIdLocal));
  if (!legajo?.categoriaIdLocal) return null;
  return getCategoriaById(legajo.categoriaIdLocal);
}
