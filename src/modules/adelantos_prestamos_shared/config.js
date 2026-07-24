// Pedidos de Adelantos + Gestión de Adelantos v1.1 — configuración
// administrable (tope de adelanto con vigencia temporal, máximo de
// cuotas, umbral de alerta de pedidos por mes). Lógica pura — la UI
// del tab "⚙️ Configuración" vive en gestion_adelantos.

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';

// Mismo fix de huso horario que flujo.js — toISOString() es UTC, acá
// definía "hoy" mal para saber qué tope/config está vigente en este
// momento después de las 21:00 en Argentina.
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function obtenerTopeVigente(fechaISO = hoyISO()) {
  const candidatas = (DB.topesAdelantosVersiones || []).filter(v =>
    !v.anulado && v.vigenciaDesde <= fechaISO && (!v.vigenciaHasta || v.vigenciaHasta >= fechaISO)
  );
  const vigente = candidatas.sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];
  return vigente ? Number(vigente.montoTope) : null;
}

export function historialTopes() {
  return (DB.topesAdelantosVersiones || []).filter(v => !v.anulado)
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
}

// tipoCambio: 'corregir' (edita la versión vigente in-place) | 'vigencia' (cierra la anterior, abre una nueva)
export async function guardarNuevoTope({ tipoCambio, monto, vigenciaDesde, motivo }) {
  const hoy = hoyISO();
  if (tipoCambio === 'corregir') {
    const vigente = (DB.topesAdelantosVersiones || [])
      .filter(v => !v.anulado && v.vigenciaDesde <= hoy && (!v.vigenciaHasta || v.vigenciaHasta >= hoy))
      .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];
    if (!vigente) throw new Error('No hay un tope vigente para corregir');
    vigente.montoTope = monto;
    vigente.motivo = motivo;
    vigente.cargadoPor = currentUser?.nombre || '';
    await supaSync('topesAdelantosVersiones', vigente);
    return vigente;
  }
  const anterior = (DB.topesAdelantosVersiones || [])
    .filter(v => !v.anulado && v.vigenciaDesde <= vigenciaDesde && (!v.vigenciaHasta || v.vigenciaHasta >= vigenciaDesde))
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];
  if (anterior) {
    const cierre = new Date(vigenciaDesde + 'T00:00:00');
    cierre.setDate(cierre.getDate() - 1);
    anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
    await supaSync('topesAdelantosVersiones', anterior);
  }
  const nueva = {
    id: Date.now(), montoTope: monto, vigenciaDesde, vigenciaHasta: null,
    cargadoPor: currentUser?.nombre || '', motivo,
  };
  if (!DB.topesAdelantosVersiones) DB.topesAdelantosVersiones = [];
  DB.topesAdelantosVersiones.push(nueva);
  await supaSync('topesAdelantosVersiones', nueva);
  return nueva;
}

export function obtenerConfigVigente(clave, fechaISO = hoyISO()) {
  const candidatas = (DB.configuracionAdelantosPrestamos || []).filter(c =>
    !c.anulado && c.clave === clave && c.vigenciaDesde <= fechaISO && (!c.vigenciaHasta || c.vigenciaHasta >= fechaISO)
  );
  const vigente = candidatas.sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];
  return vigente ? vigente.valor : null;
}

export function obtenerMaxCuotas() {
  return parseInt(obtenerConfigVigente('max_cuotas'), 10) || 12;
}

export function obtenerUmbralAlertaPedidos() {
  return parseInt(obtenerConfigVigente('umbral_alerta_pedidos'), 10) || 3;
}

export async function guardarConfig(clave, valor, motivo) {
  const hoy = hoyISO();
  const vigente = (DB.configuracionAdelantosPrestamos || [])
    .find(c => !c.anulado && c.clave === clave && c.vigenciaDesde <= hoy && (!c.vigenciaHasta || c.vigenciaHasta >= hoy));
  if (vigente) {
    vigente.valor = String(valor);
    vigente.modificadoPor = currentUser?.nombre || '';
    vigente.modificadoEn = new Date().toISOString();
    if (motivo) vigente.descripcion = motivo;
    await supaSync('configuracionAdelantosPrestamos', vigente);
    return vigente;
  }
  const nueva = {
    id: Date.now(), clave, valor: String(valor), descripcion: motivo || '',
    vigenciaDesde: hoy, vigenciaHasta: null,
    modificadoPor: currentUser?.nombre || '', modificadoEn: new Date().toISOString(),
  };
  if (!DB.configuracionAdelantosPrestamos) DB.configuracionAdelantosPrestamos = [];
  DB.configuracionAdelantosPrestamos.push(nueva);
  await supaSync('configuracionAdelantosPrestamos', nueva);
  return nueva;
}
