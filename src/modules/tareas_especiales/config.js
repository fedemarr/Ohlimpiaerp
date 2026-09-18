// Tareas Especiales — parámetro "Convenio 168 hs" versionado, con
// historial (TAREAS_ESPECIALES_para_Fede.md §2: "168 es parámetro de
// Configuración (editable, con historial), no hardcodeado"). Mismo
// molde que adelantos_prestamos_shared/config.js (tope de adelanto):
// versiones con vigencia_desde/vigencia_hasta, "corregir" (edita la
// versión vigente in-place) vs "vigencia" (cierra la anterior, abre
// una nueva).

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fallback 168 si todavía no se cargó ninguna versión (no debería pasar
// una vez corrida la migración con el seed inicial, pero nunca romper
// el cálculo del convenio por un dato de configuración ausente).
export function obtenerConvenioVigente(fechaISO = hoyISO()) {
  const candidatas = (DB.tareasEspecialesConvenioVersiones || []).filter(v =>
    !v.anulado && v.vigenciaDesde <= fechaISO && (!v.vigenciaHasta || v.vigenciaHasta >= fechaISO)
  );
  const vigente = candidatas.sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];
  return vigente ? Number(vigente.horasConvenio) : 168;
}

export function historialConvenio() {
  return (DB.tareasEspecialesConvenioVersiones || []).filter(v => !v.anulado)
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
}

// tipoCambio: 'corregir' (edita la versión vigente in-place) | 'vigencia' (cierra la anterior, abre una nueva)
export async function guardarNuevoConvenio({ tipoCambio, horas, vigenciaDesde, motivo }) {
  const hoy = hoyISO();
  if (tipoCambio === 'corregir') {
    const vigente = (DB.tareasEspecialesConvenioVersiones || [])
      .filter(v => !v.anulado && v.vigenciaDesde <= hoy && (!v.vigenciaHasta || v.vigenciaHasta >= hoy))
      .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];
    if (!vigente) throw new Error('No hay un convenio vigente para corregir');
    vigente.horasConvenio = horas;
    vigente.motivo = motivo;
    vigente.cargadoPor = currentUser?.nombre || '';
    await supaSync('tareasEspecialesConvenioVersiones', vigente);
    return vigente;
  }
  const anterior = (DB.tareasEspecialesConvenioVersiones || [])
    .filter(v => !v.anulado && v.vigenciaDesde <= vigenciaDesde && (!v.vigenciaHasta || v.vigenciaHasta >= vigenciaDesde))
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0];
  if (anterior) {
    const cierre = new Date(vigenciaDesde + 'T00:00:00');
    cierre.setDate(cierre.getDate() - 1);
    anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
    await supaSync('tareasEspecialesConvenioVersiones', anterior);
  }
  const nueva = {
    id: Date.now(), horasConvenio: horas, vigenciaDesde, vigenciaHasta: null,
    cargadoPor: currentUser?.nombre || '', motivo,
  };
  if (!DB.tareasEspecialesConvenioVersiones) DB.tareasEspecialesConvenioVersiones = [];
  DB.tareasEspecialesConvenioVersiones.push(nueva);
  await supaSync('tareasEspecialesConvenioVersiones', nueva);
  return nueva;
}
