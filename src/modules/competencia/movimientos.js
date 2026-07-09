// Competencia Anual v2 — el motor: catálogo de reglas + generación de
// eventos/movimientos en cascada + reversión. Reemplaza el cálculo "al
// vuelo" de la versión anterior (generarDatosCompetencia() recorría todo
// en cada render) por un ledger persistente y auditable.

import { DB, currentUser } from '@shared/state.js';
import { toast } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// Mismo truco que capacitaciones/evaluaciones.js y uniformes/flujo.js:
// el único cruce que persiste de verdad es el id_local (9 dígitos), así
// que las tablas hijas guardan la referencia ya truncada.
export const idLocalTrunc = (id) => String(id).slice(-9);

export function esAdministrativo(legajo) {
  return (legajo?.servicio || '').trim().toUpperCase() === 'ADMINISTRATIVO';
}

export function getReglaByCodigo(codigo) {
  return (DB.reglasCompetencia || []).find(r => !r.anulado && r.codigo === codigo);
}

export function getReglaById(reglaIdLocal) {
  return (DB.reglasCompetencia || []).find(r => !r.anulado && String(r.id) === String(reglaIdLocal));
}

// Si hay solape de vigencias (no debería pasar si guardarVersionRegla()
// cierra bien la anterior), gana la de vigencia_desde más reciente.
export function getVersionVigente(reglaIdLocal, fechaISO) {
  const candidatas = (DB.reglasCompetenciaVersiones || []).filter(v =>
    !v.anulado && String(v.reglaIdLocal) === String(reglaIdLocal) &&
    v.vigenciaDesde <= fechaISO && (!v.vigenciaHasta || v.vigenciaHasta >= fechaISO)
  );
  return candidatas.sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0] || null;
}

// Movimientos de un año cerrado no se pueden seguir generando ahí —
// impactan en el año actual (DISENO_competencia_anual.md §3.8).
function calcularAnioCompetencia(fechaISO) {
  const anioEvento = new Date(fechaISO + 'T00:00:00').getFullYear();
  const registro = (DB.aniosCompetencia || []).find(a => a.anio === anioEvento);
  if (registro && registro.cerrado) return new Date().getFullYear();
  return anioEvento;
}

async function crearMovimiento({ eventoIdLocal, regla, version, destinatario, tipoDestinatario, servicioAlMomento, supervisorAlMomento, puntos, fecha, anioCompetencia }) {
  const mov = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    eventoIdLocal,
    reglaIdLocal: regla.id,
    reglaVersionIdLocal: version.id,
    destinatarioIdLocal: String(destinatario.nro),
    nombreDestinatario: destinatario.nombre,
    tipoDestinatario,
    servicioAlMomento,
    supervisorAlMomento,
    puntosCongelados: puntos,
    fechaEvento: fecha,
    anioCompetencia,
  };
  if (!DB.movimientosPuntos) DB.movimientosPuntos = [];
  DB.movimientosPuntos.push(mov);
  await supaSync('movimientosPuntos', mov);
  return mov;
}

// El corazón del motor. protagonista es un objeto de DB.legajos (activo,
// no administrativo). Devuelve { evento, movimientos } o null si la
// regla está inactiva, no tiene versión vigente a esa fecha, o el
// referenciaExterna ya generó un evento antes (idempotencia).
export async function registrarEvento({ reglaCodigo, fecha, protagonista, referenciaExterna, origenModulo, observaciones, generadoPor, puntosOverrideIndividual }) {
  const regla = getReglaByCodigo(reglaCodigo);
  if (!regla || !regla.activa) return null;
  if (!protagonista || esAdministrativo(protagonista)) return null;

  const fechaISO = (fecha || '').slice(0, 10);
  const version = getVersionVigente(regla.id, fechaISO);
  if (!version) return null;

  if (referenciaExterna) {
    const yaExiste = (DB.eventosPuntos || []).some(e => !e.anulado && String(e.reglaIdLocal) === String(regla.id) && e.referenciaExterna === referenciaExterna);
    if (yaExiste) return null;
  }

  const anioCompetencia = calcularAnioCompetencia(fechaISO);

  const evento = {
    id: Date.now(),
    reglaIdLocal: regla.id,
    reglaVersionIdLocal: version.id,
    operarioIdLocal: String(protagonista.nro),
    nombreOperario: protagonista.nombre,
    servicioAlMomento: protagonista.servicio || '',
    supervisorAlMomento: protagonista.supervisor || '',
    fechaEvento: fecha,
    origen: origenModulo === 'Manual' ? 'Manual' : 'Automático',
    moduloOrigen: origenModulo || null,
    referenciaExterna: referenciaExterna || null,
    observaciones: observaciones || '',
    cargadoPor: generadoPor || 'Sistema',
  };
  if (!DB.eventosPuntos) DB.eventosPuntos = [];
  DB.eventosPuntos.push(evento);
  await supaSync('eventosPuntos', evento);

  const eventoIdLocal = idLocalTrunc(evento.id);
  const base = { eventoIdLocal, regla, version, servicioAlMomento: evento.servicioAlMomento, supervisorAlMomento: evento.supervisorAlMomento, fecha, anioCompetencia };

  // puntosOverrideIndividual: usado por "respuesta_correcta" (aciertos
  // × puntos, un solo movimiento agregado en vez de uno por pregunta —
  // mismo criterio que el hook server-side de api/evaluacion-responder.js).
  const puntosOperario = puntosOverrideIndividual != null ? puntosOverrideIndividual : version.puntosIndividual;
  const movimientos = [];
  movimientos.push(await crearMovimiento({ ...base, destinatario: protagonista, tipoDestinatario: 'Operario', puntos: puntosOperario }));

  if (version.puntosPorCompanero) {
    const companeros = (DB.legajos || []).filter(l =>
      l.estado === 'Activo' && !esAdministrativo(l) &&
      l.servicio === protagonista.servicio && String(l.nro) !== String(protagonista.nro)
    );
    for (const c of companeros) {
      movimientos.push(await crearMovimiento({ ...base, destinatario: c, tipoDestinatario: 'Compañero', puntos: version.puntosPorCompanero }));
    }
  }

  if (version.puntosSupervisor && protagonista.supervisor) {
    // No hay FK nombre de supervisor -> legajo (DB.supervisores es un
    // catálogo de strings, legajo.supervisor es texto libre) — se
    // resuelve por nombre exacto contra legajos activos. Si no hay
    // match, se omite en silencio (DISENO_competencia_anual.md §19.11).
    const sup = (DB.legajos || []).find(l => l.estado === 'Activo' && l.nombre === protagonista.supervisor);
    if (sup) {
      movimientos.push(await crearMovimiento({ ...base, destinatario: sup, tipoDestinatario: 'Supervisor', puntos: version.puntosSupervisor }));
    }
  }

  return { evento, movimientos };
}

export async function revertirMovimiento(idLocal, motivo) {
  const mov = (DB.movimientosPuntos || []).find(m => String(m.id) === String(idLocal));
  if (!mov || mov.revertido) { toast('⚠️ Este movimiento ya no está vigente'); return; }
  mov.revertido = true;
  mov.fechaReversion = new Date().toISOString();
  mov.revertidoPor = currentUser?.nombre || '';
  mov.motivoReversion = motivo;
  await supaSync('movimientosPuntos', mov);
  toast('↩️ Movimiento revertido');
}

// eventoIdLocal acá siempre es el valor truncado (idLocalTrunc(evento.id))
// — es el identificador estable que ya usan los movimientos hijos para
// referenciar al evento, independiente de si el evento se acaba de crear
// en esta sesión (id sin truncar en memoria) o vino recién cargado de
// Supabase (id ya truncado).
export async function revertirEventoCompleto(eventoIdLocal, motivo) {
  const evento = (DB.eventosPuntos || []).find(e => idLocalTrunc(e.id) === eventoIdLocal);
  if (!evento || evento.revertido) { toast('⚠️ Este evento ya no está vigente'); return; }
  evento.revertido = true;
  evento.fechaReversion = new Date().toISOString();
  evento.revertidoPor = currentUser?.nombre || '';
  evento.motivoReversion = motivo;
  await supaSync('eventosPuntos', evento);

  const movimientos = (DB.movimientosPuntos || []).filter(m => m.eventoIdLocal === eventoIdLocal && !m.revertido);
  for (const m of movimientos) {
    m.revertido = true;
    m.fechaReversion = evento.fechaReversion;
    m.revertidoPor = evento.revertidoPor;
    m.motivoReversion = motivo;
    await supaSync('movimientosPuntos', m);
  }
  toast(`↩️ Evento revertido (${movimientos.length} movimiento(s))`);
}

// Carga manual desde el Tab Historial (felicitaciones de cliente,
// participación en equipo, sanciones cuando exista el módulo, etc.).
export async function cargaManual({ reglaCodigo, protagonistaNro, fecha, observaciones, referenciaExterna }) {
  const protagonista = (DB.legajos || []).find(l => String(l.nro) === String(protagonistaNro) && l.estado === 'Activo');
  if (!protagonista) { toast('⚠️ No se encontró un legajo activo con ese número de socio'); return null; }
  if (esAdministrativo(protagonista)) { toast('⚠️ Los administrativos no participan del torneo'); return null; }
  if (!fecha) { toast('⚠️ Ingresá la fecha del evento'); return null; }
  const fechaISO = fecha.slice(0, 10);
  if (new Date(fechaISO + 'T00:00:00') > new Date()) { toast('⚠️ La fecha del evento no puede ser futura'); return null; }
  const dosAniosAtras = new Date();
  dosAniosAtras.setFullYear(dosAniosAtras.getFullYear() - 2);
  if (new Date(fechaISO + 'T00:00:00') < dosAniosAtras) {
    if (!confirm('⚠️ Este evento tiene más de 2 años. ¿Confirmás cargarlo igual?')) return null;
  }
  const resultado = await registrarEvento({
    reglaCodigo, fecha: fechaISO, protagonista,
    referenciaExterna: referenciaExterna || `manual:${reglaCodigo}:${protagonistaNro}:${Date.now()}`,
    origenModulo: 'Manual', observaciones, generadoPor: currentUser?.nombre || '',
  });
  if (!resultado) { toast('⚠️ No se pudo generar el movimiento — verificá que la regla esté activa y tenga una versión vigente a esa fecha'); return null; }
  toast(`✅ Movimiento generado (${resultado.movimientos.length} destinatario(s))`);
  return resultado;
}
