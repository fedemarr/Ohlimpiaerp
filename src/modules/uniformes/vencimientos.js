// Uniformes v2 — chequeos automáticos de vencimiento (DISENO_uniformes.md
// §11.3, §19.1 opción A: chequeo al abrir el módulo, sin cron real).

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { nombresPorPerfil } from './permisos.js';

const VEINTICUATRO_HS = 24 * 3600 * 1000;
const QUINCE_DIAS = 15 * 24 * 3600 * 1000;

// Estado de espera -> campo con la fecha en que se entró a ese estado.
// FIX (mockup solicitud_uniformes 5, 02/09): sin RRHH en el medio, los
// handshakes que quedan son Logística->Supervisor (listo para retiro) y
// Supervisor->Logística (devolución de constancia+viejo).
const FECHA_POR_ESTADO_HANDSHAKE = {
  'Listo para retiro': 'fechaEnviadoPorLogistica',
  'Constancia + viejo entregados, esperando cierre de Logística': 'fechaDevolucionSupervisor',
};

async function notificarPerfil(perfil, pedido, tipo, mensaje) {
  for (const destinatario of nombresPorPerfil(perfil)) {
    await crearNotificacion({ tipo, entidadTipo: 'uniforme', entidadIdLocal: pedido.id, destinatarioNombre: destinatario, mensaje });
  }
}

export async function chequearAlertas24hs() {
  const pendientes = (DB.pedidosUniformes || []).filter(p => !p.anulado && !p.alertaHandshakeEnviada && FECHA_POR_ESTADO_HANDSHAKE[p.estado]);
  for (const p of pendientes) {
    const campoFecha = FECHA_POR_ESTADO_HANDSHAKE[p.estado];
    const fecha = p[campoFecha];
    if (!fecha || (Date.now() - new Date(fecha).getTime()) < VEINTICUATRO_HS) continue;
    p.alertaHandshakeEnviada = true;
    await supaSync('pedidosUniformes', p);
    await notificarPerfil('Logística', p, 'uniforme_alerta_24hs', `⏰ El pedido de uniforme de ${p.nombreOperario} lleva más de 24hs sin confirmar (${p.estado}).`);
    if (p.supervisorAsignado) {
      await crearNotificacion({ tipo: 'uniforme_alerta_24hs', entidadTipo: 'uniforme', entidadIdLocal: p.id, destinatarioNombre: p.supervisorAsignado, mensaje: `⏰ El pedido de uniforme de ${p.nombreOperario} lleva más de 24hs sin confirmar.` });
    }
  }
}

export async function chequear15Dias() {
  const enEspera = (DB.pedidosUniformes || []).filter(p => !p.anulado && p.estado === 'Entregado al operario con firma, esperando constancia + viejo');
  for (const p of enEspera) {
    if (!p.fechaEntregaOperario || (Date.now() - new Date(p.fechaEntregaOperario).getTime()) < QUINCE_DIAS) continue;
    p.estado = 'Vencido';
    p.fechaVencido = new Date().toISOString();
    p.vencidoConstancia = true;
    p.vencidoUniformeViejo = true;
    await supaSync('pedidosUniformes', p);
    await notificarPerfil('Logística', p, 'uniforme_vencido_15_dias', `🚨 Pasaron 15 días y ${p.nombreOperario} no devolvió constancia + uniforme viejo.`);
    if (p.supervisorAsignado) {
      await crearNotificacion({ tipo: 'uniforme_vencido_15_dias', entidadTipo: 'uniforme', entidadIdLocal: p.id, destinatarioNombre: p.supervisorAsignado, mensaje: `🚨 Pasaron 15 días y ${p.nombreOperario} no devolvió constancia + uniforme viejo.` });
    }
  }
}
