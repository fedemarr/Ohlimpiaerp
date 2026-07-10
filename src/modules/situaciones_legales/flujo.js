// Situaciones Legales v1.1 — el motor. Reemplaza guardarLegal() de
// legacy.js, que tenía un bug de llaves real: cuando el asociado
// matcheaba un legajo, el supaSync nunca corría (el caso se perdía) y
// además propagaba estadoLegal al legajo (fuga de confidencialidad —
// visible como badge/banner para cualquier perfil que abra el
// legajo). Acá el caso siempre persiste y nunca se toca el legajo.

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';

// Mismo truco duplicado en todo el repo: el único cruce que persiste
// de verdad es el id_local (9 dígitos).
export const idLocalTrunc = (id) => String(id).slice(-9);

export function esRRHHoAdmin() {
  return ['RRHH', 'Administrador total'].includes(currentUser?.perfil);
}

export function getCasoById(id) {
  return (DB.casosLegales || []).find(c => String(c.id) === String(id));
}

// Supervisor actual: se deriva en vivo del legajo (no se persiste como
// campo que se actualiza por evento — eso requeriría enganchar
// Reasignaciones, fuera de alcance de este módulo).
export function supervisorActual(caso) {
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(caso.nroSocio));
  return legajo?.supervisor || caso.supervisorAlAlta || '—';
}

export async function crearCaso({
  asociado, nroSocio, estado, abogado, estudio, abogadoCooperativa, estudioCooperativa,
  supervisorAlAlta, servicio, fechaInicio, tipoReclamo, tipoCliente, montoReclamado,
  descripcion, relacionOtrosCasos, fechaProximaInstancia,
}) {
  const nuevo = {
    id: Date.now(),
    asociado, nroSocio: nroSocio || '—', estado,
    abogado: abogado || '', estudio: estudio || '',
    abogadoCooperativa: abogadoCooperativa || '', estudioCooperativa: estudioCooperativa || '',
    supervisorAlAlta: supervisorAlAlta || '', servicio: servicio || '',
    fechaInicio: fechaInicio || new Date().toLocaleDateString('es-AR'),
    ultimaNovedad: fechaInicio || new Date().toLocaleDateString('es-AR'),
    tipoReclamo: tipoReclamo || '', tipoCliente: tipoCliente || '',
    montoReclamado: montoReclamado || null, descripcion: descripcion || '',
    relacionOtrosCasos: relacionOtrosCasos || '', fechaProximaInstancia: fechaProximaInstancia || null,
    registradoPor: currentUser?.nombre || '',
  };
  if (!DB.casosLegales) DB.casosLegales = [];
  DB.casosLegales.push(nuevo);
  await supaSync('casosLegales', nuevo);
  return nuevo;
}

export async function cambiarEstadoCaso(casoIdLocal, nuevoEstado) {
  const c = getCasoById(casoIdLocal);
  if (!c) return null;
  c.estado = nuevoEstado;
  await supaSync('casosLegales', c);
  return c;
}

export async function agregarNovedad({ casoIdLocal, fechaEvento, tipoEvento, descripcion, adjuntosSubidos }) {
  const c = getCasoById(casoIdLocal);
  if (!c) return null;
  const novedad = {
    id: Date.now(),
    casoIdLocal: idLocalTrunc(c.id),
    fechaEvento, tipoEvento, descripcion,
    adjuntos: adjuntosSubidos || [],
    cargadaPor: currentUser?.nombre || '',
    cargadaEn: new Date().toISOString(),
  };
  if (!DB.novedadesCasoLegal) DB.novedadesCasoLegal = [];
  DB.novedadesCasoLegal.push(novedad);
  await supaSync('novedadesCasoLegal', novedad);

  // ultimaNovedad queda como campo derivado de la novedad más reciente.
  const todas = (DB.novedadesCasoLegal || [])
    .filter(n => !n.anulado && n.casoIdLocal === idLocalTrunc(c.id))
    .sort((a, b) => (b.fechaEvento || '').localeCompare(a.fechaEvento || ''));
  if (todas.length) {
    c.ultimaNovedad = todas[0].fechaEvento;
    await supaSync('casosLegales', c);
  }
  return novedad;
}

export function novedadesDeCaso(casoIdLocal) {
  return (DB.novedadesCasoLegal || [])
    .filter(n => !n.anulado && n.casoIdLocal === idLocalTrunc(casoIdLocal))
    .sort((a, b) => (b.fechaEvento || '').localeCompare(a.fechaEvento || ''));
}

export async function cerrarCaso({ casoIdLocal, fechaCierre, resultado, montoFinal, observacionesCierre }) {
  const c = getCasoById(casoIdLocal);
  if (!c) return null;
  c.estado = 'Cerrado';
  c.fechaCierre = fechaCierre;
  c.resultado = resultado;
  c.montoFinal = montoFinal || null;
  c.observacionesCierre = observacionesCierre;
  c.cerradoPor = currentUser?.nombre || '';
  await supaSync('casosLegales', c);
  return c;
}
