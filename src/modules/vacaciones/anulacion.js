// Reglas de anulación por estado (DISENO_vacaciones.md §3.11):
//
// Borrador             → el solicitante anula libre.
// Pendiente Gerente     → el solicitante anula libre, o el Gerente anula.
// Pendiente Consejo     → solo el Gerente puede anular (el solicitante debe
//                         pedírselo fuera del sistema).
// Aprobada              → el solicitante NO puede anular directo: pide una
//                         "Solicitud de anulación" que el Consejo vota
//                         (Invalidar/Mantener, mayoría 2/3).

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { toast } from '@shared/ui.js';
import { rolEnConsejo, gerenteDeSector, nombresConsejo } from './permisos.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { getVacacionById } from './aprobacion.js';

const CAMPO_VOTO_ANUL = { Presidente: 'votoAnulPresidente', Tesorero: 'votoAnulTesorero', Secretario: 'votoAnulSecretario' };

export function puedeAnularSolicitante(v) {
  return v.estado === 'Borrador' || v.estado === 'Pendiente aprobación Gerente';
}

export function puedeAnularGerente(v) {
  return v.estado === 'Pendiente aprobación Gerente' || v.estado === 'Pendiente aprobación Consejo';
}

// Vacación Aprobada y fecha desde todavía no pasó (§16.7).
export function puedeSolicitarAnulacion(v) {
  return v.estado === 'Aprobada' && new Date(v.fechaDesde) > new Date();
}

export async function anularPorSolicitante(idLocal, motivo) {
  const v = getVacacionById(idLocal);
  if (!v || !puedeAnularSolicitante(v)) { toast('⚠️ Esta solicitud ya no se puede anular directamente'); return; }
  const estadoOriginal = v.estado;
  v.estado = 'Anulada por solicitante';
  v.anuladoPorNombre = currentUser?.nombre || '';
  v.fechaAnulacion = new Date().toISOString();
  v.motivoAnulacion = motivo || '';
  await supaSync('vacaciones', v);
  if (estadoOriginal === 'Pendiente aprobación Gerente') {
    const gerente = gerenteDeSector(v.sector);
    if (gerente) await crearNotificacion({ tipo: 'vacacion_anulada_solicitante', entidadIdLocal: v.id, destinatarioNombre: gerente, mensaje: `🗑️ ${v.nombreAsociado} anuló su solicitud de vacaciones.` });
  }
  toast('✓ Solicitud anulada');
}

export async function anularPorGerente(idLocal, motivo) {
  const v = getVacacionById(idLocal);
  if (!v || !puedeAnularGerente(v)) { toast('⚠️ Esta solicitud ya no se puede anular'); return; }
  v.estado = 'Anulada por Gerente';
  v.anuladoPorNombre = currentUser?.nombre || '';
  v.fechaAnulacion = new Date().toISOString();
  v.motivoAnulacion = motivo || '';
  await supaSync('vacaciones', v);
  await crearNotificacion({ tipo: 'vacacion_anulada_gerente', entidadIdLocal: v.id, destinatarioNombre: v.nombreAsociado, mensaje: `🗑️ Tu Gerente anuló tu solicitud de vacaciones.` });
  toast('✓ Solicitud anulada');
}

export async function solicitarAnulacion(idLocal, motivo) {
  const v = getVacacionById(idLocal);
  if (!v || !puedeSolicitarAnulacion(v)) { toast('⚠️ Esta vacación no se puede anular (ya empezó o no está aprobada)'); return; }
  if (!motivo || !motivo.trim()) { toast('⚠️ Contá el motivo de la anulación'); return; }
  v.estado = 'Solicitud de anulación pendiente';
  v.solicitudAnulacionMotivo = motivo.trim();
  v.votoAnulPresidente = null;
  v.votoAnulTesorero = null;
  v.votoAnulSecretario = null;
  await supaSync('vacaciones', v);
  const { presidente, tesorero, secretario } = nombresConsejo();
  for (const destinatario of [presidente, tesorero, secretario]) {
    await crearNotificacion({ tipo: 'vacacion_anulacion_solicitada', entidadIdLocal: v.id, destinatarioNombre: destinatario, mensaje: `🚫 ${v.nombreAsociado} pidió anular su vacación aprobada.` });
  }
  toast('✓ Solicitud de anulación enviada al Consejo');
}

function evaluarAnulacionConsejo(v) {
  const votos = [v.votoAnulPresidente, v.votoAnulTesorero, v.votoAnulSecretario].filter(x => x != null && x !== '');
  const invalidar = votos.filter(x => x === 'Invalidar').length;
  const mantener = votos.filter(x => x === 'Mantener').length;
  if (invalidar >= 2) return 'Anulada por Consejo';
  if (mantener >= 2) return 'Anulación rechazada por Consejo';
  return 'Solicitud de anulación pendiente';
}

// voto: 'Invalidar' | 'Mantener'
export async function votarAnulacionConsejo(idLocal, voto) {
  const v = getVacacionById(idLocal);
  if (!v || v.estado !== 'Solicitud de anulación pendiente') { toast('⚠️ Esta solicitud de anulación ya no está pendiente'); return; }
  const rol = rolEnConsejo(currentUser?.nombre);
  if (!rol) { toast('⚠️ No sos miembro del Consejo'); return; }
  if (v.nombreAsociado === currentUser?.nombre) { toast('⚠️ No podés votar tu propia solicitud'); return; }
  const campo = CAMPO_VOTO_ANUL[rol];
  if (v[campo]) { toast('⚠️ Ya votaste sobre esta anulación'); return; }

  v[campo] = voto;
  const nuevoEstado = evaluarAnulacionConsejo(v);
  v.estado = nuevoEstado;
  await supaSync('vacaciones', v);

  if (nuevoEstado === 'Anulada por Consejo') {
    const gerente = gerenteDeSector(v.sector);
    for (const destinatario of [v.nombreAsociado, v.reemplazanteNombre, gerente].filter(Boolean)) {
      await crearNotificacion({ tipo: 'vacacion_anulada', entidadIdLocal: v.id, destinatarioNombre: destinatario, mensaje: `✅ El Consejo aprobó la anulación de la vacación de ${v.nombreAsociado}.` });
    }
  } else if (nuevoEstado === 'Anulación rechazada por Consejo') {
    await crearNotificacion({ tipo: 'vacacion_anulacion_rechazada', entidadIdLocal: v.id, destinatarioNombre: v.nombreAsociado, mensaje: `❌ El Consejo rechazó tu pedido de anulación — la vacación sigue vigente.` });
  }
  toast(nuevoEstado === 'Solicitud de anulación pendiente' ? '✓ Voto registrado' : (nuevoEstado === 'Anulada por Consejo' ? '✅ Anulación aprobada' : '❌ Anulación rechazada — vacación vigente'));
}
