// Lógica de aprobación en dos niveles (DISENO_vacaciones.md §11):
// Nivel 1 — Gerente del sector (unipersonal).
// Nivel 2 — Consejo de Administración, 3 miembros, mayoría 2/3. El miembro
// del Consejo que es el propio solicitante no vota sobre sí mismo.

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { toast } from '@shared/ui.js';
import { rolEnConsejo, gerenteDeSector, nombresConsejo } from './permisos.js';
import { crearNotificacion } from '@shared/notificaciones.js';

const CAMPO_VOTO = { Presidente: 'votoPresidente', Tesorero: 'votoTesorero', Secretario: 'votoSecretario' };
const CAMPO_VOTO_FECHA = { Presidente: 'votoPresidenteFecha', Tesorero: 'votoTesoreroFecha', Secretario: 'votoSecretarioFecha' };
const CAMPO_VOTO_MOTIVO = { Presidente: 'votoPresidenteMotivo', Tesorero: 'votoTesoreroMotivo', Secretario: 'votoSecretarioMotivo' };

// Evalúa si ya se alcanzó mayoría (2 de 3) entre los votos registrados.
// Excluye null/undefined (los que aún no votaron).
export function evaluarConsejo(v) {
  const votos = [v.votoPresidente, v.votoTesorero, v.votoSecretario].filter(x => x != null && x !== '');
  const aprobar = votos.filter(x => x === 'Aprobar').length;
  const rechazar = votos.filter(x => x === 'Rechazar').length;
  if (aprobar >= 2) return 'Aprobada';
  if (rechazar >= 2) return 'Rechazada por Consejo';
  return 'Pendiente aprobación Consejo';
}

export function getVacacionById(id) {
  return (DB.vacaciones || []).find(v => String(v.id) === String(id));
}

export async function aprobarComoGerente(idLocal) {
  const v = getVacacionById(idLocal);
  if (!v || v.estado !== 'Pendiente aprobación Gerente') { toast('⚠️ Esta solicitud ya no está pendiente del Gerente'); return; }
  v.estado = 'Pendiente aprobación Consejo';
  v.aprobadoPorGerente = currentUser?.nombre || '';
  v.fechaAprobacionGerente = new Date().toISOString();
  await supaSync('vacaciones', v);
  const { presidente, tesorero, secretario } = nombresConsejo();
  for (const destinatario of [presidente, tesorero, secretario, v.nombreAsociado]) {
    await crearNotificacion({
      tipo: 'vacacion_a_consejo', entidadIdLocal: v.id,
      destinatarioNombre: destinatario,
      mensaje: `🏖️ La solicitud de vacaciones de ${v.nombreAsociado} (${v.fechaDesde} a ${v.fechaHasta}) pasó al Consejo.`,
    });
  }
  toast('✅ Aprobado — pasa al Consejo de Administración');
}

export async function rechazarComoGerente(idLocal, motivo) {
  const v = getVacacionById(idLocal);
  if (!v || v.estado !== 'Pendiente aprobación Gerente') { toast('⚠️ Esta solicitud ya no está pendiente del Gerente'); return; }
  if (!motivo || !motivo.trim()) { toast('⚠️ El motivo de rechazo es obligatorio'); return; }
  v.estado = 'Rechazada por Gerente';
  v.motivoRechazoGerente = motivo.trim();
  await supaSync('vacaciones', v);
  await crearNotificacion({ tipo: 'vacacion_rechazada_gerente', entidadIdLocal: v.id, destinatarioNombre: v.nombreAsociado, mensaje: `❌ Tu solicitud de vacaciones fue rechazada por tu Gerente: ${motivo.trim()}` });
  toast('❌ Solicitud rechazada');
}

// voto: 'Aprobar' | 'Rechazar'
export async function votarConsejo(idLocal, voto, motivo) {
  const v = getVacacionById(idLocal);
  if (!v || v.estado !== 'Pendiente aprobación Consejo') { toast('⚠️ Esta solicitud ya no está pendiente del Consejo'); return; }
  const rol = rolEnConsejo(currentUser?.nombre);
  if (!rol) { toast('⚠️ No sos miembro del Consejo'); return; }
  if (v.nombreAsociado === currentUser?.nombre) { toast('⚠️ No podés votar tu propia solicitud'); return; }
  const campoVoto = CAMPO_VOTO[rol];
  if (v[campoVoto]) { toast('⚠️ Ya emitiste tu voto sobre esta solicitud'); return; }
  if (voto === 'Rechazar' && (!motivo || !motivo.trim())) { toast('⚠️ El motivo de rechazo es obligatorio'); return; }

  v[campoVoto] = voto;
  v[CAMPO_VOTO_FECHA[rol]] = new Date().toISOString();
  if (voto === 'Rechazar') v[CAMPO_VOTO_MOTIVO[rol]] = motivo.trim();

  const nuevoEstado = evaluarConsejo(v);
  v.estado = nuevoEstado;
  if (nuevoEstado === 'Aprobada') v.fechaAprobacionConsejo = new Date().toISOString();
  if (nuevoEstado === 'Rechazada por Consejo') v.fechaRechazoConsejo = new Date().toISOString();

  await supaSync('vacaciones', v);

  if (nuevoEstado === 'Aprobada') {
    await crearNotificacion({ tipo: 'vacacion_aprobada', entidadIdLocal: v.id, destinatarioNombre: v.nombreAsociado, mensaje: `✅ Tu solicitud de vacaciones (${v.fechaDesde} a ${v.fechaHasta}) fue aprobada.` });
    await crearNotificacion({ tipo: 'vacacion_aprobada', entidadIdLocal: v.id, destinatarioNombre: v.reemplazanteNombre, mensaje: `✅ Fuiste confirmado como reemplazante de ${v.nombreAsociado}.` });
    const gerente = gerenteDeSector(v.sector);
    if (gerente) await crearNotificacion({ tipo: 'vacacion_aprobada', entidadIdLocal: v.id, destinatarioNombre: gerente, mensaje: `✅ El Consejo aprobó la vacación de ${v.nombreAsociado}.` });
  } else if (nuevoEstado === 'Rechazada por Consejo') {
    await crearNotificacion({ tipo: 'vacacion_rechazada_consejo', entidadIdLocal: v.id, destinatarioNombre: v.nombreAsociado, mensaje: `❌ Tu solicitud de vacaciones fue rechazada por el Consejo.` });
  }
  toast(nuevoEstado === 'Pendiente aprobación Consejo' ? '✓ Voto registrado — esperando al resto del Consejo' : (nuevoEstado === 'Aprobada' ? '✅ Mayoría alcanzada — Aprobada' : '❌ Mayoría alcanzada — Rechazada'));
}
