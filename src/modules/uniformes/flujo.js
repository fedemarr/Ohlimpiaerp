// Uniformes v2 — transiciones de estado (DISENO_uniformes.md §11). Mismo
// esqueleto que descansos/aprobacion.js: guard de estado al inicio -> mutar
// campos -> supaSync -> registrar evento -> notificar a cada destinatario
// -> toast.
//
// FIX (ticket "Mejoras del módulo de uniformes", mockup solicitud_uniformes
// 5, 02/09): se sacó RRHH del circuito operativo (confirmado por el
// solicitante — "la política ya validó sola, va directo a Logística"). El
// pedido ya no pasa por autorización RRHH ni por su doble handshake con
// Logística — Logística prepara y avisa directo al Supervisor. Logística
// también pasa a recibir la devolución de constancia+viejo y cerrar el
// pedido (antes lo hacía RRHH — con RRHH afuera del traspaso, tiene más
// sentido que cierre quien maneja el depósito físico).
//
// Logística/Supervisor pueden ser varias personas reales (a diferencia de
// Vacaciones/Descansos, donde el gerente es unipersonal mockeado) — se
// notifica a todos los que resuelva nombresPorPerfil().

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { toast } from '@shared/ui.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { nombresPorPerfil } from './permisos.js';
import { obtenerPrecioVigente } from './precios.js';
import { crearDescuentoPendiente, crearDescuentoPorFaltante } from './descuentos.js';
import { descontarStockPorPedido } from './stock.js';

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
  p.estado = 'Enviado, esperando preparación de Logística';
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, 'Borrador', p.estado);
  await notificarPerfil('Logística', p, 'uniforme_solicitado', `👕 Nuevo pedido de uniforme para ${p.nombreOperario} — a preparar (retiro: ${p.puntoRetiro || 'Recepción'}).`);
  toast('📤 Pedido enviado — directo a la bandeja de Logística');
}

// ========== 1/2 -> cancelado ==========

export async function cancelarPedido(idLocal, motivo) {
  const p = getPedidoById(idLocal);
  if (!p || !['Borrador', 'Enviado, esperando preparación de Logística'].includes(p.estado)) { toast('⚠️ Este pedido ya no se puede cancelar'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Cancelado por Solicitante';
  p.motivoCancelacion = (motivo || '').trim();
  p.canceladoPor = currentUser?.nombre || '';
  p.fechaCancelacion = new Date().toISOString();
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado, p.motivoCancelacion);
  toast('🗑 Pedido cancelado');
}

// ========== 2 -> 3 ==========

export async function logisticaRecibe(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Enviado, esperando preparación de Logística') { toast('⚠️ Este pedido ya no está esperando a Logística'); return; }
  const estadoDesde = p.estado;
  p.estado = 'En preparación por Logística';
  p.fechaRecibidoLogistica = new Date().toISOString();
  p.logisticaRecibePor = currentUser?.nombre || '';
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  // Stock (ticket "Módulo Logística" 08/2026): se descuenta acá, no al
  // entregar — así dos pedidos no pueden "reservar de palabra" la misma
  // prenda mientras Logística arma el paquete.
  await descontarStockPorPedido(p, prendasDelPedido(p.id));
  toast('📥 Marcado como recibido — armando el pedido');
}

// ========== 3 -> 4 ==========

export async function logisticaMarcaListo(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'En preparación por Logística') { toast('⚠️ Este pedido ya no está en preparación'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Listo para retiro';
  p.fechaEnviadoPorLogistica = new Date().toISOString();
  p.logisticaEnviaPor = currentUser?.nombre || '';
  p.alertaHandshakeEnviada = false;
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  await notificarPersona(p.supervisorAsignado, p, 'uniforme_listo_retiro', `👕 El pedido de uniforme de ${p.nombreOperario} está listo para retirar en ${p.puntoRetiro || 'Recepción'}.`);
  toast('✅ Marcado como listo para retiro — se avisó al Supervisor');
}

// ========== 4 -> 5 ==========

export async function supervisorConfirmaRetiro(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Listo para retiro') { toast('⚠️ Este pedido ya no está listo para retiro'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Retirado por Supervisor, en tránsito a operario';
  p.fechaConfirmadoPorSupervisor = new Date().toISOString();
  p.supervisorConfirmaPor = currentUser?.nombre || '';
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  await notificarPerfil('Logística', p, 'uniforme_confirmado_supervisor', `✅ El Supervisor retiró el pedido de ${p.nombreOperario}.`);
  toast('✅ Retiro confirmado — entregalo al operario con firma');
}

// ========== 5 -> 6 (transición crítica) ==========

// legajo: objeto de DB.legajos del operario (para actualizar talles_uniforme).
// adjunto: registro devuelto por subirAdjunto() (con .id bigint real).
export async function supervisorEntregaConFirma(idLocal, legajo, adjunto) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Retirado por Supervisor, en tránsito a operario') { toast('⚠️ Este pedido ya no está listo para entregar'); return false; }
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
  await notificarPerfil('Logística', p, 'uniforme_entregado', `👕 Se entregó el uniforme a ${p.nombreOperario} (con firma).`);
  toast('✅ Entrega confirmada — contás con 15 días para devolver constancia y uniforme viejo');
  return true;
}

// ========== 6 -> 7 ==========

// La constancia policial (robo) se adjunta al PEDIDO cuando se crea
// (motivo = 'Robo con denuncia', ver uniformes.js) — acá no hace falta,
// esta transición es solo la devolución de constancia firmada + viejo.
export async function supervisorDevuelveConstanciaYViejo(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Entregado al operario con firma, esperando constancia + viejo') { toast('⚠️ Este pedido no está esperando la devolución'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Constancia + viejo entregados, esperando cierre de Logística';
  p.fechaDevolucionSupervisor = new Date().toISOString();
  p.supervisorDevuelvePor = currentUser?.nombre || '';
  p.alertaHandshakeEnviada = false;
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado);
  await notificarPerfil('Logística', p, 'uniforme_devolucion_a_logistica', `👕 El Supervisor devolvió constancia + uniforme viejo de ${p.nombreOperario} — confirmar cierre.`);
  toast('📄 Devolución registrada — esperando el cierre de Logística');
}

// ========== 7 -> 8 (con rama a faltante) ==========

// prendasFaltantes: array de strings (prendas que no se devolvieron), o null/[] si vino todo completo.
// FIX: antes cerraba RRHH — con RRHH afuera del circuito, cierra Logística
// (recibe físicamente la devolución en el depósito).
export async function logisticaConfirmaCierre(idLocal, prendasFaltantes) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Constancia + viejo entregados, esperando cierre de Logística') { toast('⚠️ Este pedido no está esperando el cierre'); return; }
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

// ========== Vencido -> 7 (reactivar, caso §17.1) ==========

export async function reactivarDesdeVencido(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Vencido') { toast('⚠️ Este pedido no está vencido'); return; }
  const estadoDesde = p.estado;
  p.estado = 'Constancia + viejo entregados, esperando cierre de Logística';
  p.fechaDevolucionSupervisor = new Date().toISOString();
  p.supervisorDevuelvePor = currentUser?.nombre || '';
  p.alertaHandshakeEnviada = false;
  await supaSync('pedidosUniformes', p);
  await registrarEvento(p, estadoDesde, p.estado, 'Devolución tardía, reactivado antes de aplicar descuento');
  await notificarPerfil('Logística', p, 'uniforme_devolucion_a_logistica', `👕 Devolución tardía de ${p.nombreOperario} — confirmar cierre.`);
  toast('↩️ Reactivado — esperando el cierre de Logística');
}
