// Tareas Especiales — funciones puras de consulta (sin DOM), ticket
// "Módulo Tareas Especiales" 18/09 (TAREAS_ESPECIALES_para_Fede.md +
// mockup_tareas_especiales_4.html). Mismo patrón que Retenes
// (src/modules/retenes/consultas.js): la nómina sale sola del padrón
// de categorías (acá CAT-008, no CAT-009) y las horas se leen en vivo
// de las grillas — nada se carga en este módulo.
//
// A DIFERENCIA de Retenes, este grupo SÍ tiene garantía de horas: el
// convenio de 168 hs mensuales (parámetro versionado, ver config.js).
// Reglas cerradas del documento:
//   1) SIN prorrateo — alta/baja a mitad de mes cobra el convenio entero.
//   2) AI descuenta 8 hs del convenio por día (168 − 8×díasAI).
//   3) AJ paga y CUENTA para el convenio; las horas no facturables
//      también cuentan — para el convenio, hora trabajada es hora
//      trabajada, se facture o no (no se filtra por tipoHora).

import { DB } from '@shared/state.js';
import { getDiasDelMes } from '@shared/helpers.js';
import { categoriaVigenteAsociado, obtenerValorHoraVigente } from '@modules/categorias/consultas.js';
import { estadoPeriodo } from '@shared/periodo.js';
import { obtenerConvenioVigente } from './config.js';

export const CODIGO_TAREAS_ESPECIALES = 'CAT-008';

export function esTareaEspecial(legajoNro, fechaISO) {
  const cat = categoriaVigenteAsociado(legajoNro, fechaISO);
  return cat?.codigo === CODIGO_TAREAS_ESPECIALES;
}

export function getTareasEspecialesActivos() {
  const hoy = new Date().toISOString().slice(0, 10);
  return (DB.legajos || [])
    .filter(l => l.estado === 'Activo' && esTareaEspecial(l.nro, hoy))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

function horasCobradasDia(asoc, fechaIso) {
  return window.horasCobradasDia ? window.horasCobradasDia(asoc, fechaIso) : (parseFloat(asoc?.horas?.[fechaIso]) || 0);
}

// Todas las filas de servicio de una persona en el mes, leídas en vivo
// de las grillas — no filtra por tipoHora (mismo criterio que Retenes):
// se muestra TODO lo que tiene cargado en cualquier grilla, con el tipo
// de esa fila como dato informativo, no como filtro de inclusión.
export function serviciosTareaEspecialMes(legajo, mes) {
  const dias = getDiasDelMes(mes);
  const grillasDelMes = (DB.grillasLiq || []).filter(g => g.periodo === mes);
  const servicios = [];

  grillasDelMes.forEach(grilla => {
    const asoc = (grilla.asociados || []).find(a => a.nombre === legajo.nombre);
    if (!asoc) return;
    let tieneAlgo = false;
    let hsServicio = 0;
    const porDia = {};
    dias.forEach(dia => {
      const raw = asoc.horas?.[dia.iso];
      if (raw == null || raw === '') return;
      tieneAlgo = true;
      const cobradas = horasCobradasDia(asoc, dia.iso);
      hsServicio += cobradas;
      porDia[dia.iso] = { raw, cobradas, dia: dia.d, esFinde: dia.esFinde };
    });
    if (!tieneAlgo) return;
    servicios.push({
      codigo: grilla.objCodigo,
      nombre: grilla.nombre,
      supervisor: grilla.supervisor || '—',
      facturable: (asoc.tipoHora || 'facturable') === 'facturable',
      hsServicio,
      porDia,
    });
  });

  return servicios;
}

// Agregado día por día de TODOS los servicios (para la fila de la
// planilla general, que muestra una sola celda por día): si algún
// servicio tiene AI ese día, gana AI (ausencia es un hecho del día, no
// del servicio). Si no hay AI pero sí AJ, gana AJ y suma sus horas
// acreditadas. Si no, suma las horas numéricas de todos los servicios
// ese día (una persona puede estar en 2 servicios el mismo día).
function _diasAgregadosMes(servicios, dias) {
  return dias.map(dia => {
    let esAI = false, esAJ = false, total = 0;
    servicios.forEach(sv => {
      const d = sv.porDia[dia.iso];
      if (!d) return;
      const raw = String(d.raw).toUpperCase();
      if (raw === 'AI') { esAI = true; return; }
      if (raw === 'AJ') esAJ = true;
      total += d.cobradas;
    });
    return { iso: dia.iso, d: dia.d, esFinde: dia.esFinde, esAI, esAJ, total };
  });
}

// Valor hora de la categoría vigente de la persona en el mes — la regla
// dice "el de la categoría Tareas Especiales del padrón", pero se
// resuelve por la categoría REAL vigente de cada uno (normalmente
// CAT-008) para no asumir que todos comparten exactamente la misma fila
// de valores_hora_categoria si alguno tuviera una alternativa aprobada.
// Devuelve null (no 0) si la categoría no existe o no tiene valor hora
// cargado: PERIODO_FUTURO_bug_para_Fede.md (derivado 2) — un $0 silencioso
// con horas de complemento es contradictorio; la UI tiene que poder avisar
// "categoría sin valor hora" en vez de mostrar $0.
function _valorHoraVigente(legajoNro, mes) {
  const fechaISO = mes + '-01';
  const cat = categoriaVigenteAsociado(legajoNro, fechaISO);
  if (!cat) return null;
  const v = obtenerValorHoraVigente(cat.id, null, fechaISO);
  return v?.valorHora || null;
}

// El cálculo completo del convenio para una persona en un mes — las 3
// reglas del documento, cerradas (ver encabezado del archivo).
export function resumenTareaEspecialMes(legajo, mes) {
  const dias = getDiasDelMes(mes);
  const servicios = serviciosTareaEspecialMes(legajo, mes);
  const diasAgregados = _diasAgregadosMes(servicios, dias);

  let reales = 0, ajHs = 0;
  let diasAI = 0;
  diasAgregados.forEach(d => {
    if (d.esAI) { diasAI++; return; }
    reales += d.total;
    if (d.esAJ) ajHs += d.total;
  });

  const convenioParam = obtenerConvenioVigente(mes + '-01');
  // PERIODO_FUTURO_bug_para_Fede.md (derivado 1): el convenio se evalúa
  // sobre el mes en curso o cerrado, NUNCA a futuro — un mes que no arrancó
  // no adeuda complemento (antes octubre mostraba +168 por asociado). En
  // futuro no hay convenio efectivo ni complemento; la UI muestra "—" y
  // Liquidaciones (que solo toma complemento>0) no recibe nada.
  const futuro = estadoPeriodo(mes) === 'futuro';
  const convenioEfectivo = futuro ? 0 : Math.max(0, convenioParam - 8 * diasAI);
  const complemento = futuro ? 0 : Math.max(0, convenioEfectivo - reales);
  const hsACobrar = reales + complemento;
  const vhCrudo = _valorHoraVigente(legajo.nro, mes);
  const sinValorHora = vhCrudo === null;
  const vh = vhCrudo || 0;

  return {
    servicios, diasAgregados,
    reales, ajHs, diasAI,
    convenioParam, convenioEfectivo, complemento, hsACobrar,
    valorHora: vh, sinValorHora, futuro,
    totalMes: Math.round(hsACobrar * vh),
    totalComplemento: Math.round(complemento * vh),
  };
}

// ========== HOOK CON OTROS MÓDULOS (Liquidaciones, Resumen de horas) ==========
//
// LA REGLA DE ORO del documento (§3): a Liquidaciones y al Resumen de
// horas viaja SOLO el complemento — las horas reales YA llegan al
// retiro por las grillas (el bloque "1. Servicios" de renderLiquidaciones,
// que no filtra por tipoHora). Si se sumaran también las reales acá,
// se pagarían dos veces (mismo bug de fondo que ya se encontró y
// corrigió en Retenes esta sesión). Expuesta en window porque
// legacy.js no puede hacer `import` estático de un módulo ES.
export function complementosTareasEspecialesDelMes(mes) {
  const mapa = {};
  getTareasEspecialesActivos().forEach(legajo => {
    const r = resumenTareaEspecialMes(legajo, mes);
    if (r.complemento > 0) {
      mapa[legajo.nombre] = { legajoNro: legajo.nro, hs: r.complemento, valorHora: r.valorHora, monto: r.totalComplemento, convenioParam: r.convenioParam };
    }
  });
  return mapa;
}
