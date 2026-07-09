// Uniformes v2 — las 15 transiciones de estado con doble handshake
// (DISENO_uniformes.md §11). Mismo esqueleto que descansos/aprobacion.js:
// guard de estado al inicio -> mutar campos -> supaSync -> registrar
// evento -> notificar a cada destinatario -> toast.
//
// RRHH/Logística/Supervisor pueden ser varias personas reales (a
// diferencia de Vacaciones/Descansos, donde el gerente es unipersonal
// mockeado) — se notifica a todos los que resuelva nombresPorPerfil().

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { toast } from '@shared/ui.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { nombresPorPerfil } from './permisos.js';
import { obtenerPrecioVigente } from './precios.js';
import { crearDescuentoPendiente, crearDescuentoPorFaltante } from './descuentos.js';

export function getPedidoById(id) {
  return (DB.pedidosUniformes || []).find(p => String(p.id) === String(id));
}

// Mismo truco que capacitaciones/evaluaciones.js: el único cruce que
// persiste de verdad es el id_local (9 dígitos), así que las tablas
// hijas guardan la referencia ya truncada.
export const idLocalTrunc = (id) => String(id).slice(-9);

export function prendasDelPedido(pedidoId) {
  return (DB.pedidoUniformePrendas || []).filter(p => !p.anulado && p.pedidoIdLocal === idLocalTrunc(pedidoId));
}

async function registrarEvento(pedido, estadoDesde, estadoHasta, observaciones = '') {
  const ev = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    pedidoIdLocal: idLocalTrunc(pedido.id),
    estadoDesde, estadoHasta,
    ejecutadoPor: currentUser?.nombre || '',
    ejecutadoEn: new Date().toISOString(),
    observaciones,
  };
  if (!DB.pedidoUniformeEventos) DB.pedidoUniformeEventos = [];
  DB.pedidoUniformeEventos.push(ev);
  await supaSync('pedidoUniformeEventos', ev);
}

async function notificarPerfil(perfil, pedido, tipo, mensaje) {
  for (const destinatario of nombresPorPerfil(perfil)) {
    await crearNotificacion({ tipo, entidadTipo: 'uniforme', entidadIdLocal: pedido.id, destinatarioNombre: destinatario, mensaje });
  }
}

async function notificarPersona(nombre, pedido, tipo, mensaje) {
  if (!nombre) return;
  await crearNotificacion({ tipo, entidadTipo: 'uniforme', entidadIdLocal: pedido.id, destinatarioNombre: nombre, mensaje });
}

// ========== 1 -> 2 ==========

export async function elevarPedido(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Borrador') { toast('⚠️ Este pedido ya no está en Borrador'); return; }
  if (!prendasDelPedido(p.id).length) { toast('⚠️ Agregá al menos una prenda antes de elevar'); return; }
  p.estado = 'Pendiente autorización RRHH';
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, 'Borrador', p.estado);
  await notificarPerfil('RRHH', p, 'uniforme_solicitado', `👕 Nuevo pedido de uniforme para ${p.nombreOperario}, esperando autorización.`);
  toast('📤 Pedido elevado — esperando autorización de RRHH');
}

// ========== 2 -> 3 ==========

export async function autorizarPedido(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Pendiente autorización RRHH') { toast('⚠️ Este pedido ya no está pendiente de autorización'); return; }
  p.estado = 'Autorizado por RRHH, esperando envío a Logística';
  p.autorizadoPorRrhh = currentUser?.nombre || '';
  p.fechaAutorizacion = new Date().toISOString();
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, 'Pendiente autorización RRHH', p.estado);
  await notificarPerfil('Logística', p, 'uniforme_autorizado', `👕 Pedido de uniforme autorizado para ${p.nombreOperario} — a preparar.`);
  await notificarPersona(p.solicitadoPor, p, 'uniforme_autorizado', `✅ Tu pedido de uniforme para ${p.nombreOperario} fue autorizado.`);
  toast('✅ Autorizado — pasa a Logística');
}

// ========== 2 -> 12 ==========

export async function rechazarPedido(idLocal, motivo) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Pendiente autorización RRHH') { toast('⚠️ Este pedido ya no está pendiente de autorización'); return; }
  if (!motivo || !motivo.trim()) { toast('⚠️ El motivo de rechazo es obligatorio'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Rechazado por RRHH';
  p.motivoRechazo = motivo.trim();
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado, motivo.trim());
  await notificarPersona(p.solicitadoPor, p, 'uniforme_rechazado', `❌ El pedido de uniforme para ${p.nombreOperario} fue rechazado: ${motivo.trim()}`);
  toast('❌ Rechazado');
}

// ========== 1/2 -> 13 ==========

export async function cancelarPedido(idLocal, motivo) {
  const p = getPedidoById(idLocal);
  if (!p || !['Borrador', 'Pendiente autorización RRHH'].includes(p.estado)) { toast('⚠️ Este pedido ya no se puede cancelar'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Cancelado por Solicitante';
  p.motivoCancelacion = (motivo || '').trim();
  p.canceladoPor = currentUser?.nombre || '';
  p.fechaCancelacion = new Date().toISOString();
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado, p.motivoCancelacion);
  toast('🗑 Pedido cancelado');
}

// ========== 3 -> 4 ==========

export async function logisticaRecibe(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Autorizado por RRHH, esperando envío a Logística') { toast('⚠️ Este pedido ya no está esperando a Logística'); return; }
  const estadoDesde = p.estado;
  p.estado = 'En preparación por Logística';
  p.fechaRecibidoLogistica = new Date().toISOString();
  p.logisticaRecibePor = currentUser?.nombre || '';
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  toast('📥 Marcado como recibido — armando el pedido');
}

// ========== 4 -> 5 ==========

export async function logisticaEnvia(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'En preparación por Logística') { toast('⚠️ Este pedido ya no está en preparación'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Enviado por Logística, esperando confirmación RRHH';
  p.fechaEnviadoPorLogistica = new Date().toISOString();
  p.logisticaEnviaPor = currentUser?.nombre || '';
  p.alertaHandshakeEnviada = false;
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  await notificarPerfil('RRHH', p, 'uniforme_enviado_a_rrhh', `👕 Logística envió el pedido de ${p.nombreOperario} — confirmar recepción.`);
  toast('📤 Marcado como enviado a RRHH');
}

// ========== 5 -> 6 ==========

export async function rrhhConfirmaRecepcionLogistica(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Enviado por Logística, esperando confirmación RRHH') { toast('⚠️ Este pedido ya no está esperando confirmación'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Recibido por RRHH, listo para retirar Supervisor';
  p.fechaRecibidoPorRrhh = new Date().toISOString();
  p.rrhhRecibePor = currentUser?.nombre || '';
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  await notificarPerfil('Logística', p, 'uniforme_confirmado_rrhh', `✅ RRHH confirmó la recepción del pedido de ${p.nombreOperario}.`);
  toast('✅ Recepción confirmada — listo para que lo retire el Supervisor');
}

// ========== 6 -> 7 ==========

export async function rrhhMarcaRetiroSupervisor(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Recibido por RRHH, listo para retirar Supervisor') { toast('⚠️ Este pedido ya no está listo para retiro'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Retirado por Supervisor, esperando confirmación Supervisor';
  p.fechaRetiradoSupervisor = new Date().toISOString();
  p.rrhhEntregaASupervisorPor = currentUser?.nombre || '';
  p.alertaHandshakeEnviada = false;
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  await notificarPersona(p.supervisorAsignado, p, 'uniforme_retirado_supervisor', `👕 El pedido de uniforme de ${p.nombreOperario} está listo — pasá a confirmar que lo tenés.`);
  toast('🚚 Marcado como retirado por el Supervisor');
}

// ========== 7 -> 8 ==========

export async function supervisorConfirmaRetiro(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Retirado por Supervisor, esperando confirmación Supervisor') { toast('⚠️ Este pedido ya no está esperando tu confirmación'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Confirmado por Supervisor, en tránsito a operario';
  p.fechaConfirmadoPorSupervisor = new Date().toISOString();
  p.supervisorConfirmaPor = currentUser?.nombre || '';
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  await notificarPerfil('RRHH', p, 'uniforme_confirmado_supervisor', `✅ El Supervisor confirmó que tiene el pedido de ${p.nombreOperario}.`);
  toast('✅ Confirmado — entregalo al operario con firma');
}

// ========== 8 -> 9 (transición crítica) ==========

// legajo: objeto de DB.legajos del operario (para actualizar talles_uniforme).
// adjunto: registro devuelto por subirAdjunto() (con .id bigint real).
export async function supervisorEntregaConFirma(idLocal, legajo, adjunto) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Confirmado por Supervisor, en tránsito a operario') { toast('⚠️ Este pedido ya no está listo para entregar'); return false; }
  if (!adjunto?.id) { toast('⚠️ Falta adjuntar la foto de la constancia firmada'); return false; }

  const prendas = prendasDelPedido(p.id);
  // Congelar precios — guard: si falta precio vigente de alguna prenda, no se puede entregar.
  for (const pr of prendas) {
    const vigente = obtenerPrecioVigente(pr.prenda, pr.talle, new Date());
    if (!vigente) { toast(`⚠️ No hay precio vigente cargado para ${pr.prenda} talle ${pr.talle} — cargalo en "Gestionar precios" antes de entregar`); return false; }
    pr.precioUnitarioCongelado = vigente.precio;
    pr.precioIdLocalReferencia = idLocalTrunc(vigente.id);
    await supaSync('pedidoUniformePrendas', pr);
  }

  const estadoDesde = p.estado;
  p.estado = 'Entregado al operario con firma, esperando constancia + viejo';
  p.fechaEntregaOperario = new Date().toISOString();
  p.supervisorEntregaPor = currentUser?.nombre || '';
  p.constanciaFirmadaAdjuntoId = adjunto.id;
  p.alertaHandshakeEnviada = false;
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);

  // Actualizar talles_uniforme en el legajo si cambiaron.
  if (legajo) {
    const talles = { ...(legajo.tallesUniforme || {}) };
    let cambio = false;
    for (const pr of prendas) {
      const clave = pr.prenda.toLowerCase();
      if (talles[clave] !== pr.talle) { talles[clave] = pr.talle; cambio = true; }
    }
    if (cambio) {
      legajo.tallesUniforme = talles;
      await supaSync('legajos', legajo);
    }
  }

  // Descuento en 4 cuotas, si el motivo lo requiere.
  if (p.conDescuento) {
    const montoTotal = prendas.reduce((s, pr) => s + (pr.precioUnitarioCongelado || 0) * pr.cantidad, 0);
    await crearDescuentoPendiente(p, montoTotal, 'Pedido con descuento');
  }

  await notificarPersona(p.solicitadoPor, p, 'uniforme_entregado', `👕 Se entregó el uniforme a ${p.nombreOperario}. Quedan 15 días para devolver constancia + uniforme viejo.`);
  await notificarPerfil('RRHH', p, 'uniforme_entregado', `👕 Se entregó el uniforme a ${p.nombreOperario} (con firma).`);
  toast('✅ Entrega confirmada — contás con 15 días para devolver constancia y uniforme viejo');
  return true;
}

// ========== 9 -> 10 ==========

// La constancia policial (robo) se adjunta al PEDIDO cuando se crea
// (motivo = 'Robo con denuncia', ver uniformes.js) — acá no hace falta,
// esta transición es solo la devolución de constancia firmada + viejo.
export async function supervisorDevuelveConstanciaYViejo(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Entregado al operario con firma, esperando constancia + viejo') { toast('⚠️ Este pedido no está esperando la devolución'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Constancia + viejo entregados por Supervisor, esperando confirmación RRHH';
  p.fechaDevolucionSupervisor = new Date().toISOString();
  p.supervisorDevuelvePor = currentUser?.nombre || '';
  p.alertaHandshakeEnviada = false;
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  await notificarPerfil('RRHH', p, 'uniforme_devolucion_a_rrhh', `👕 El Supervisor devolvió constancia + uniforme viejo de ${p.nombreOperario} — confirmar cierre.`);
  toast('📄 Devolución registrada — esperando confirmación de RRHH');
}

// ========== 10 -> 11 (con rama a faltante) ==========

// prendasFaltantes: array de strings (prendas que no se devolvieron), o null/[] si vino todo completo.
export async function rrhhConfirmaCierre(idLocal, prendasFaltantes) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Constancia + viejo entregados por Supervisor, esperando confirmación RRHH') { toast('⚠️ Este pedido no está esperando el cierre'); return; }
  const estadoDesde = p.estado;
  const faltante = Array.isArray(prendasFaltantes) && prendasFaltantes.length > 0;
  p.estado = 'Cerrado';
  p.fechaCierre = new Date().toISOString();
  p.rrhhCierraPor = currentUser?.nombre || '';
  p.faltoPrendaKitDevuelto = faltante;
  p.prendasFaltantesDevolucion = faltante ? prendasFaltantes.join(', ') : '';
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado, faltante ? `Faltó: ${p.prendasFaltantesDevolucion}` : '');

  if (faltante) {
    await crearDescuentoPorFaltante(p, prendasFaltantes);
  }

  await notificarPersona(p.supervisorAsignado, p, 'uniforme_cerrado', `✅ Se cerró el pedido de uniforme de ${p.nombreOperario}.`);
  await notificarPersona(p.solicitadoPor, p, 'uniforme_cerrado', `✅ Se cerró el pedido de uniforme de ${p.nombreOperario}.`);
  toast(faltante ? '✅ Cerrado — se generó un descuento por prenda faltante' : '✅ Pedido cerrado');
}

// ========== 14 -> 10 (reactivar desde vencido, caso §17.1) ==========

export async function reactivarDesdeVencido(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Vencido') { toast('⚠️ Este pedido no está vencido'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Constancia + viejo entregados por Supervisor, esperando confirmación RRHH';
  p.fechaDevolucionSupervisor = new Date().toISOString();
  p.supervisorDevuelvePor = currentUser?.nombre || '';
  p.alertaHandshakeEnviada = false;
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado, 'Devolución tardía, reactivado antes de aplicar descuento');
  await notificarPerfil('RRHH', p, 'uniforme_devolucion_a_rrhh', `👕 Devolución tardía de ${p.nombreOperario} — confirmar cierre.`);
  toast('↩️ Reactivado — esperando confirmación de RRHH');
}
