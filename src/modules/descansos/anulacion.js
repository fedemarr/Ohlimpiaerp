// Reglas de anulación (DISENO_descansos.md §10.5, §15.6):
//
// Por el supervisor: confirmación simple (sin motivo obligatorio), en
// cualquier estado no final, siempre que fecha_desde > hoy.
// Por un gerente post-aprobación: motivo obligatorio, solo si el
// descanso está Aprobado y fecha_desde > hoy.

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { toast } from '@shared/ui.js';
import { nombreGerenteOperaciones, nombreGerenteRRHH } from './permisos.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { getDescansoById } from './aprobacion.js';

const ESTADOS_ANULABLES_SUPERVISOR = ['Borrador', 'Pendiente aprobación Operaciones', 'Pendiente aprobación RRHH', 'Aprobado'];

export function puedeAnularPorSupervisor(d) {
  return ESTADOS_ANULABLES_SUPERVISOR.includes(d.estado) && new Date(d.fechaDesde) > new Date();
}

export function puedeAnularPostAprobacion(d) {
  return d.estado === 'Aprobado' && new Date(d.fechaDesde) > new Date();
}

export async function anularPorSupervisor(idLocal) {
  const d = getDescansoById(idLocal);
  if (!d || !puedeAnularPorSupervisor(d)) { toast('⚠️ Este descanso ya no se puede anular (ya empezó o no es anulable)'); return; }
  const estadoOriginal = d.estado;
  d.estado = 'Anulado por supervisor';
  d.anuladoPor = currentUser?.nombre || '';
  d.fechaAnulacion = new Date().toISOString();
  await supaSync('descansos', d);

  const destinatarios = [];
  if (estadoOriginal === 'Pendiente aprobación Operaciones') destinatarios.push(nombreGerenteOperaciones());
  if (estadoOriginal === 'Pendiente aprobación RRHH' || estadoOriginal === 'Aprobado') destinatarios.push(nombreGerenteRRHH());
  for (const destinatario of destinatarios) {
    await crearNotificacion({ tipo: 'descanso_anulado_supervisor', entidadTipo: 'descanso', entidadIdLocal: d.id, destinatarioNombre: destinatario, mensaje: `🗑️ El supervisor anuló el descanso de ${d.nombreOperario}.` });
  }
  toast('✓ Descanso anulado');
}

export async function anularPostAprobacion(idLocal, motivo) {
  const d = getDescansoById(idLocal);
  if (!d || !puedeAnularPostAprobacion(d)) { toast('⚠️ Este descanso ya no se puede anular (ya empezó o no está aprobado)'); return; }
  if (!motivo || !motivo.trim()) { toast('⚠️ El motivo de anulación es obligatorio'); return; }
  d.estado = 'Anulado post-aprobación';
  d.anuladoPor = currentUser?.nombre || '';
  d.fechaAnulacion = new Date().toISOString();
  d.motivoAnulacion = motivo.trim();
  await supaSync('descansos', d);
  for (const destinatario of [d.supervisorSolicitante, d.nombreOperario]) {
    await crearNotificacion({ tipo: 'descanso_anulado_post_aprobacion', entidadTipo: 'descanso', entidadIdLocal: d.id, destinatarioNombre: destinatario, mensaje: `🗑️ Se anuló el descanso ya aprobado de ${d.nombreOperario}: ${motivo.trim()}` });
  }
  toast('✓ Descanso anulado');
}
