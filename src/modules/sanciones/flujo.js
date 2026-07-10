// Sanciones v1 — el motor: niveles 0 (Verbal), 1 (Observación) y 2
// (Apercibimiento con doble aprobación + descargo obligatorio de 48hs).
// Niveles 3 (Suspensión) y 4 (Exclusión), con sumario formal y
// votación de Consejo, quedan para una tanda aparte.

import { DB, currentUser } from '@shared/state.js';
import { toast } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { registrarEvento, revertirEventoCompleto, idLocalTrunc as idLocalTruncCompetencia } from '../competencia/movimientos.js';
import { gerenteResponsable, nombreGerenteRRHH } from './permisos.js';

// Mismo truco duplicado en todo el repo: el único cruce que persiste
// de verdad es el id_local (9 dígitos).
export const idLocalTrunc = (id) => String(id).slice(-9);

const CUARENTA_Y_OCHO_HS_MS = 48 * 3600 * 1000;

export function getSancionById(id) {
  return (DB.sancionesDisciplinarias || []).find(s => String(s.id) === String(id));
}

function getInfraccion(infraccionIdLocal) {
  return (DB.catalogoInfracciones || []).find(i => !i.anulado && String(i.id) === String(infraccionIdLocal));
}

function getVersionInfraccionVigente(infraccionIdLocal, fechaISO) {
  const candidatas = (DB.catalogoInfraccionesVersiones || []).filter(v =>
    !v.anulado && String(v.infraccionIdLocal) === idLocalTrunc(infraccionIdLocal) &&
    v.vigenciaDesde <= fechaISO && (!v.vigenciaHasta || v.vigenciaHasta >= fechaISO)
  );
  return candidatas.sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))[0] || null;
}

async function registrarEventoSancion(sancion, estadoDesde, estadoHasta, observaciones = '') {
  const ev = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    sancionIdLocal: idLocalTrunc(sancion.id),
    estadoDesde, estadoHasta,
    ejecutadoPor: currentUser?.nombre || '',
    ejecutadoRol: currentUser?.perfil || '',
    ejecutadoEn: new Date().toISOString(),
    observaciones,
  };
  if (!DB.sancionEventos) DB.sancionEventos = [];
  DB.sancionEventos.push(ev);
  await supaSync('sancionEventos', ev);
}

function baseSancion({ protagonista, infraccionIdLocal, fechaHecho, descripcionHecho, generadoPor, nivel, nombreNivel }) {
  const version = getVersionInfraccionVigente(infraccionIdLocal, (fechaHecho || '').slice(0, 10));
  const infraccion = getInfraccion(infraccionIdLocal);
  const esAdministrativo = (protagonista.servicio || '').trim().toUpperCase() === 'ADMINISTRATIVO';
  return {
    id: Date.now(),
    legajoIdLocal: String(protagonista.nro),
    nroSocio: String(protagonista.nro),
    nombreSancionado: protagonista.nombre,
    tipoSancionado: esAdministrativo ? 'Administrativo' : 'Operativo',
    servicio: protagonista.servicio || '',
    supervisor: protagonista.supervisor || '',
    areaAdministrativa: esAdministrativo ? (protagonista.sector || '') : '',
    nivel, nombreNivel,
    infraccionIdLocal: idLocalTrunc(infraccion?.id ?? infraccionIdLocal),
    nombreInfraccion: infraccion?.nombre || '',
    categoriaInfraccion: infraccion?.categoria || '',
    gravedad: version?.gravedad || '',
    fechaHecho, fechaDeteccion: new Date().toISOString().slice(0, 10),
    descripcionHecho,
    propuestaPorLegajo: generadoPor || currentUser?.nombre || '',
    propuestaPorRol: currentUser?.perfil || '',
    fechaIniciacion: new Date().toISOString(),
    estado: 'Borrador',
    descargoRequerido: nivel >= 2,
  };
}

async function guardarNueva(sancion) {
  if (!DB.sancionesDisciplinarias) DB.sancionesDisciplinarias = [];
  DB.sancionesDisciplinarias.push(sancion);
  await supaSync('sancionesDisciplinarias', sancion);
}

// ========== NIVEL 0 — Llamado verbal (informal) ==========

export async function crearSancionNivel0({ protagonista, infraccionIdLocal, fechaHecho, descripcionHecho, generadoPor }) {
  const s = baseSancion({ protagonista, infraccionIdLocal, fechaHecho, descripcionHecho, generadoPor, nivel: 0, nombreNivel: 'Llamado verbal (informal)' });
  s.estado = 'Ejecutada';
  s.fechaNotificacionAsociado = new Date().toISOString();
  s.notificacionMetodo = 'Sistema';
  await guardarNueva(s);
  await registrarEventoSancion(s, 'Borrador', 'Ejecutada', 'Registro informal — no cuenta como sanción');
  toast('✅ Llamado verbal registrado — no cuenta como sanción');
  return s;
}

// ========== NIVEL 1 — Observación ==========

export async function crearYEjecutarNivel1({ protagonista, infraccionIdLocal, fechaHecho, descripcionHecho, generadoPor }) {
  const s = baseSancion({ protagonista, infraccionIdLocal, fechaHecho, descripcionHecho, generadoPor, nivel: 1, nombreNivel: 'Observación' });
  s.estado = 'Ejecutada';
  s.fechaNotificacionAsociado = new Date().toISOString();
  s.notificacionMetodo = 'Sistema';
  await guardarNueva(s);
  await registrarEventoSancion(s, 'Borrador', 'Ejecutada');

  const resultado = await registrarEvento({
    reglaCodigo: 'sancion_observacion', fecha: fechaHecho, protagonista,
    referenciaExterna: 'sancion:' + idLocalTrunc(s.id), origenModulo: 'Sanciones',
    observaciones: `Observación — ${s.nombreInfraccion}`, generadoPor: currentUser?.nombre || 'Sistema',
  });
  if (resultado?.evento) {
    s.eventoCompetenciaIdLocal = idLocalTruncCompetencia(resultado.evento.id);
    await supaSync('sancionesDisciplinarias', s);
  }

  const gerente = gerenteResponsable(protagonista);
  if (gerente) {
    await crearNotificacion({ tipo: 'sancion_observacion_aplicada', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: gerente, mensaje: `⚠️ Se aplicó una Observación a ${s.nombreSancionado} (${s.nombreInfraccion}). Podés revertirla con motivo desde tu bandeja.` });
  }
  toast('✅ Observación aplicada — se notificó al Gerente responsable');
  return s;
}

export async function revertirNivel1(idLocal, motivo) {
  const s = getSancionById(idLocal);
  if (!s || s.estado !== 'Ejecutada' || s.nivel !== 1) { toast('⚠️ Esta sanción ya no se puede revertir'); return; }
  const estadoDesde = s.estado;
  s.estado = 'Revertida por Gerente';
  s.motivoRechazo = motivo;
  s.editadoPor = currentUser?.nombre || '';
  s.editadoEn = new Date().toISOString();
  await supaSync('sancionesDisciplinarias', s);
  await registrarEventoSancion(s, estadoDesde, s.estado, motivo);

  if (s.eventoCompetenciaIdLocal) {
    await revertirEventoCompleto(s.eventoCompetenciaIdLocal, `Observación revertida por Gerente: ${motivo}`);
  }

  await crearNotificacion({ tipo: 'sancion_revertida_por_gerente', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: s.propuestaPorLegajo, mensaje: `↩️ La Observación a ${s.nombreSancionado} fue revertida por el Gerente: ${motivo}` });
  await crearNotificacion({ tipo: 'sancion_revertida_por_gerente', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: nombreGerenteRRHH(), mensaje: `↩️ La Observación a ${s.nombreSancionado} fue revertida por el Gerente: ${motivo}` });
  toast('↩️ Observación revertida');
}

// ========== NIVEL 2 — Apercibimiento ==========

export async function crearBorradorNivel2({ protagonista, infraccionIdLocal, fechaHecho, descripcionHecho, generadoPor }) {
  const s = baseSancion({ protagonista, infraccionIdLocal, fechaHecho, descripcionHecho, generadoPor, nivel: 2, nombreNivel: 'Apercibimiento' });
  await guardarNueva(s);
  toast('💾 Borrador de apercibimiento guardado');
  return s;
}

export async function elevarNivel2(idLocal) {
  const s = getSancionById(idLocal);
  if (!s || s.estado !== 'Borrador' || s.nivel !== 2) { toast('⚠️ Esta sanción ya no está en Borrador'); return; }
  const estadoDesde = s.estado;
  s.estado = 'Pendiente aprobación 1';
  await supaSync('sancionesDisciplinarias', s);
  await registrarEventoSancion(s, estadoDesde, s.estado);

  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(s.legajoIdLocal));
  const gerente = gerenteResponsable(legajo);
  if (gerente) {
    await crearNotificacion({ tipo: 'sancion_pendiente_aprobacion', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: gerente, mensaje: `📋 Apercibimiento propuesto a ${s.nombreSancionado} (${s.nombreInfraccion}) — esperando tu aprobación.` });
  }
  toast('📤 Elevado — esperando aprobación del Gerente responsable');
}

export async function aprobarPrimeraInstancia(idLocal) {
  const s = getSancionById(idLocal);
  if (!s || s.estado !== 'Pendiente aprobación 1') { toast('⚠️ Esta sanción ya no está pendiente de esta aprobación'); return; }
  const estadoDesde = s.estado;
  s.aprobadaPorLegajo = currentUser?.nombre || '';
  s.aprobadaPorRol = 'Gerente responsable';
  s.fechaAprobacion = new Date().toISOString();
  s.estado = 'Pendiente aprobación 2';
  await supaSync('sancionesDisciplinarias', s);
  await registrarEventoSancion(s, estadoDesde, s.estado);

  await crearNotificacion({ tipo: 'sancion_pendiente_aprobacion', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: nombreGerenteRRHH(), mensaje: `📋 Apercibimiento a ${s.nombreSancionado} — esperando tu aprobación (RRHH).` });
  toast('✅ Aprobado — pasa a RRHH');
}

export async function rechazarSancion(idLocal, motivo) {
  const s = getSancionById(idLocal);
  if (!s || !['Pendiente aprobación 1', 'Pendiente aprobación 2'].includes(s.estado)) { toast('⚠️ Esta sanción ya no se puede rechazar'); return; }
  if (!motivo || !motivo.trim()) { toast('⚠️ El motivo de rechazo es obligatorio'); return; }
  const estadoDesde = s.estado;
  s.estado = 'Rechazada';
  s.motivoRechazo = motivo.trim();
  await supaSync('sancionesDisciplinarias', s);
  await registrarEventoSancion(s, estadoDesde, s.estado, motivo.trim());

  await crearNotificacion({ tipo: 'sancion_rechazada', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: s.propuestaPorLegajo, mensaje: `❌ El apercibimiento a ${s.nombreSancionado} fue rechazado: ${motivo.trim()}` });
  toast('❌ Rechazado');
}

export async function aprobarSegundaInstancia(idLocal) {
  const s = getSancionById(idLocal);
  if (!s || s.estado !== 'Pendiente aprobación 2') { toast('⚠️ Esta sanción ya no está pendiente de esta aprobación'); return; }
  const estadoDesde = s.estado;
  s.aprobacionSecundariaLegajo = currentUser?.nombre || '';
  s.aprobacionSecundariaRol = 'Gerente RRHH';
  s.fechaAprobacionSecundaria = new Date().toISOString();
  s.estado = 'Pendiente descargo';
  s.descargoSolicitadoEn = new Date().toISOString();
  s.fechaLimiteDescargo = new Date(Date.now() + CUARENTA_Y_OCHO_HS_MS).toISOString();
  await supaSync('sancionesDisciplinarias', s);
  await registrarEventoSancion(s, estadoDesde, s.estado);

  await crearNotificacion({ tipo: 'sancion_solicitud_descargo', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: s.nombreSancionado, mensaje: `📝 Se te propuso un Apercibimiento (${s.nombreInfraccion}). Tenés 48hs para presentar tu descargo.` });
  toast('✅ Aprobado — se solicitó el descargo al asociado (48hs)');
}

// Chequeo al abrir el módulo (sin cron real, mismo patrón que Uniformes/
// Competencia): sanciones con plazo de descargo vencido y sin descargo
// presentado pasan solas a "Descargo recibido" con la observación
// correspondiente — no bloquea el proceso (política §3.9/§20.6).
export async function chequearDescargosVencidos() {
  const vencidas = (DB.sancionesDisciplinarias || []).filter(s =>
    !s.anulado && s.estado === 'Pendiente descargo' && !s.descargoIdLocal &&
    s.fechaLimiteDescargo && new Date(s.fechaLimiteDescargo).getTime() < Date.now()
  );
  for (const s of vencidas) {
    const estadoDesde = s.estado;
    s.estado = 'Descargo recibido';
    s.observaciones = (s.observaciones ? s.observaciones + ' — ' : '') + 'Sin descargo presentado (plazo de 48hs vencido)';
    await supaSync('sancionesDisciplinarias', s);
    await registrarEventoSancion(s, estadoDesde, s.estado, 'Plazo de descargo vencido sin presentación');
    await crearNotificacion({ tipo: 'sancion_alerta_descargo_vencido', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: nombreGerenteRRHH(), mensaje: `⏰ Venció el plazo de descargo de ${s.nombreSancionado} sin presentación — listo para revisar y ejecutar.` });
  }
}

export async function ejecutarNivel2(idLocal) {
  const s = getSancionById(idLocal);
  if (!s || s.estado !== 'Descargo recibido') { toast('⚠️ Esta sanción no está lista para ejecutar'); return; }
  const estadoDesde = s.estado;
  s.estado = 'Ejecutada';
  s.fechaNotificacionAsociado = new Date().toISOString();
  s.notificacionMetodo = 'Sistema';
  await supaSync('sancionesDisciplinarias', s);
  await registrarEventoSancion(s, estadoDesde, s.estado);

  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(s.legajoIdLocal));
  if (legajo) {
    const resultado = await registrarEvento({
      reglaCodigo: 'sancion_apercibimiento', fecha: s.fechaHecho, protagonista: legajo,
      referenciaExterna: 'sancion:' + idLocalTrunc(s.id), origenModulo: 'Sanciones',
      observaciones: `Apercibimiento — ${s.nombreInfraccion}`, generadoPor: currentUser?.nombre || 'Sistema',
    });
    if (resultado?.evento) {
      s.eventoCompetenciaIdLocal = idLocalTruncCompetencia(resultado.evento.id);
      await supaSync('sancionesDisciplinarias', s);
    }
  }

  for (const destinatario of [s.nombreSancionado, s.supervisor, nombreGerenteRRHH()]) {
    if (!destinatario) continue;
    await crearNotificacion({ tipo: 'sancion_ejecutada', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: destinatario, mensaje: `⚠️ Se ejecutó un Apercibimiento a ${s.nombreSancionado} (${s.nombreInfraccion}).` });
  }
  toast('✅ Apercibimiento ejecutado');
}
