// Retenes v2 — funciones puras de consulta (sin DOM), ticket "Módulo
// Retenes" 18/09 (RETENES_para_Fede.md + mockup_retenes.html).
//
// El concepto cambió: el retén NO tiene garantía de horas — cobra por
// las horas que los supervisores le cargan en las grillas de los
// servicios, como cualquier asociado (la garantía de mínimo, 168hs, es
// de "Tareas Especiales", otro grupo, fuera de alcance acá). Retenes
// pasa a ser pura visibilidad: leer en vivo las grillas y mostrar.
//
// Ser retén = tener la categoría "Retén Hora Base" (CAT-009) vigente en
// el padrón de Categorías → Asociados — no hay alta ni baja en este
// módulo, la lista se arma sola (mismo patrón que Resumen de horas).

import { DB } from '@shared/state.js';
import { getDiasDelMes } from '@shared/helpers.js';
import { categoriaVigenteAsociado } from '@modules/categorias/consultas.js';

export const CODIGO_RETEN_HORA_BASE = 'CAT-009';

export function esRetenHoraBase(legajoNro, fechaISO) {
  const cat = categoriaVigenteAsociado(legajoNro, fechaISO);
  return cat?.codigo === CODIGO_RETEN_HORA_BASE;
}

// Todos los legajos activos que HOY tienen la categoría Retén Hora Base
// vigente en el padrón.
export function getRetenesActivos() {
  const hoy = new Date().toISOString().slice(0, 10);
  return (DB.legajos || [])
    .filter(l => l.estado === 'Activo' && esRetenHoraBase(l.nro, hoy))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

// Horas que cuentan para el PAGO de un día — mismo criterio que Grillas
// (F/AI=0, AJ=horas acreditadas, número=el número). Se reutiliza la
// función real de legacy.js (expuesta a propósito en window) para no
// duplicar la regla de negocio en dos lugares que puedan divergir.
function horasCobradasDia(asoc, fechaIso) {
  return window.horasCobradasDia ? window.horasCobradasDia(asoc, fechaIso) : (parseFloat(asoc?.horas?.[fechaIso]) || 0);
}

// Todas las filas de servicio de UN retén en el mes, leídas en vivo de
// las grillas — no filtra por tipoHora: se muestra TODO lo que esa
// persona tiene cargado en cualquier grilla, con el tipo de esa fila
// como dato informativo (chip ✅ Facturable / ❌ No facturable), no como
// filtro de inclusión.
export function serviciosRetenMes(legajo, mes) {
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

// Resumen agregado del mes para un retén: totales fac/no fac, cantidad
// de servicios distintos, rechazos (AI en cualquier servicio) y el
// estado de HOY.
export function resumenRetenMes(legajo, mes, hoyIso) {
  const servicios = serviciosRetenMes(legajo, mes);
  let hsFac = 0, hsNoFac = 0, rechazos = 0;
  let estadoHoy = null; // {tipo:'servicio'|'rechazo', servicio}
  servicios.forEach(sv => {
    Object.entries(sv.porDia).forEach(([iso, d]) => {
      if (String(d.raw).toUpperCase() === 'AI') {
        rechazos++;
        if (iso === hoyIso) estadoHoy = { tipo: 'rechazo' };
      } else {
        if (sv.facturable) hsFac += d.cobradas; else hsNoFac += d.cobradas;
        if (iso === hoyIso && d.cobradas > 0 && !estadoHoy) estadoHoy = { tipo: 'servicio', servicio: sv.nombre };
      }
    });
  });
  if (!estadoHoy) estadoHoy = { tipo: 'base' };
  return { servicios, hsFac, hsNoFac, hsTotal: hsFac + hsNoFac, rechazos, estadoHoy };
}
