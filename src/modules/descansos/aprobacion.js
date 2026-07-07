// Lógica de aprobación en dos niveles unipersonales (DISENO_descansos.md
// §10): Gerente de Operaciones → Gerente de RRHH. Sin votación múltiple
// (a diferencia de Vacaciones/Consejo) — cada nivel es una sola persona.

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { toast } from '@shared/ui.js';
import { nombreGerenteRRHH } from './permisos.js';
import { crearNotificacion } from '@shared/notificaciones.js';

export function getDescansoById(id) {
  return (DB.descansos || []).find(d => String(d.id) === String(id));
}

// Superposición por servicio (§10.4) — soft warning al aprobar
// Operaciones, no bloquea.
export function buscarSuperposicionesServicio(servicio, desde, hasta, excluirId) {
  const d1 = new Date(desde), h1 = new Date(hasta);
  return (DB.descansos || []).filter(d => {
    if (d.anulado || String(d.id) === String(excluirId)) return false;
    if (d.servicio !== servicio || d.estado !== 'Aprobado') return false;
    const d2 = new Date(d.fechaDesde), h2 = new Date(d.fechaHasta);
    return d1 <= h2 && h1 >= d2;
  });
}

export async function aprobarOperaciones(idLocal) {
  const d = getDescansoById(idLocal);
  if (!d || d.estado !== 'Pendiente aprobación Operaciones') { toast('⚠️ Este pedido ya no está pendiente de Operaciones'); return; }
  d.estado = 'Pendiente aprobación RRHH';
  d.aprobadoPorOperaciones = currentUser?.nombre || '';
  d.fechaAprobacionOperaciones = new Date().toISOString();
  await supaSync('descansos', d);
  const gerenteRRHH = nombreGerenteRRHH();
  for (const destinatario of [gerenteRRHH, d.supervisorSolicitante]) {
    await crearNotificacion({ tipo: 'descanso_a_rrhh', entidadTipo: 'descanso', entidadIdLocal: d.id, destinatarioNombre: destinatario, mensaje: `👷 El pedido de descanso de ${d.nombreOperario} pasó a RRHH.` });
  }
  toast('✅ Aprobado — pasa a RRHH');
}

export async function rechazarOperaciones(idLocal, motivo) {
  const d = getDescansoById(idLocal);
  if (!d || d.estado !== 'Pendiente aprobación Operaciones') { toast('⚠️ Este pedido ya no está pendiente de Operaciones'); return; }
  if (!motivo || !motivo.trim()) { toast('⚠️ El motivo de rechazo es obligatorio'); return; }
  d.estado = 'Rechazado por Operaciones';
  d.motivoRechazoOperaciones = motivo.trim();
  await supaSync('descansos', d);
  await crearNotificacion({ tipo: 'descanso_rechazado_operaciones', entidadTipo: 'descanso', entidadIdLocal: d.id, destinatarioNombre: d.supervisorSolicitante, mensaje: `❌ El pedido de descanso de ${d.nombreOperario} fue rechazado por Operaciones: ${motivo.trim()}` });
  toast('❌ Rechazado');
}

export async function aprobarRRHH(idLocal) {
  const d = getDescansoById(idLocal);
  if (!d || d.estado !== 'Pendiente aprobación RRHH') { toast('⚠️ Este pedido ya no está pendiente de RRHH'); return; }
  d.estado = 'Aprobado';
  d.aprobadoPorRrhh = currentUser?.nombre || '';
  d.fechaAprobacionRrhh = new Date().toISOString();
  await supaSync('descansos', d);
  for (const destinatario of [d.supervisorSolicitante, d.nombreOperario]) {
    await crearNotificacion({ tipo: 'descanso_aprobado', entidadTipo: 'descanso', entidadIdLocal: d.id, destinatarioNombre: destinatario, mensaje: `✅ El descanso de ${d.nombreOperario} (${d.fechaDesde} a ${d.fechaHasta}) quedó aprobado.` });
  }
  toast('✅ Descanso aprobado');
}

export async function rechazarRRHH(idLocal, motivo) {
  const d = getDescansoById(idLocal);
  if (!d || d.estado !== 'Pendiente aprobación RRHH') { toast('⚠️ Este pedido ya no está pendiente de RRHH'); return; }
  if (!motivo || !motivo.trim()) { toast('⚠️ El motivo de rechazo es obligatorio'); return; }
  d.estado = 'Rechazado por RRHH';
  d.motivoRechazoRrhh = motivo.trim();
  await supaSync('descansos', d);
  await crearNotificacion({ tipo: 'descanso_rechazado_rrhh', entidadTipo: 'descanso', entidadIdLocal: d.id, destinatarioNombre: d.supervisorSolicitante, mensaje: `❌ El descanso de ${d.nombreOperario} fue rechazado por RRHH: ${motivo.trim()}` });
  toast('❌ Rechazado');
}
