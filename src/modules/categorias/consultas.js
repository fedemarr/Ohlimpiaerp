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

export function obtenerValorHoraVigente(categoriaIdLocal, servicioNombre, fechaISO) {
  const candidatas = (DB.valoresHoraCategoria || []).filter(v =>
    !v.anulado &&
    String(v.categoriaIdLocal) === idLocalTrunc(categoriaIdLocal) &&
    v.servicioNombre === servicioNombre &&
    v.vigenciaDesde <= fechaISO && (!v.vigenciaHasta || v.vigenciaHasta >= fechaISO)
  );
  return candidatas.sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0] || null;
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

export function obtenerCategoriaLegajo(legajoIdLocal) {
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(legajoIdLocal));
  if (!legajo?.categoriaIdLocal) return null;
  return getCategoriaById(legajo.categoriaIdLocal);
}
