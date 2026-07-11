// Pedidos de Adelantos + Gestión de Adelantos v1.1 — el motor único
// para ambos tipos (Adelanto/Préstamo) y ambas superficies. Reemplaza
// ~35 funciones repartidas en legacy.js donde casi ninguna transición
// de estado persistía (solo 8 de esas funciones llamaban supaSync, y
// todas en la creación) y la aprobación item-por-item era código
// muerto (sin ningún onclick que la disparara). Acá cada transición
// siempre persiste y siempre queda auditada en pedidosAdelantosEventos.
//
// Modelo aplanado: una fila por pedido, sin "planilla" contenedora
// (decisión de esta sesión — ver plan). Adelanto vive en
// DB.pedidosAdelantos, Préstamo en DB.prestamos (esa tabla ya era
// plana en el legacy, se extendió con ALTER en vez de crear una
// nueva).

import { DB, currentUser } from '@shared/state.js';
import { supaSync } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { obtenerTopeVigente } from './config.js';
import { generarCompromisosDescuento } from './descuentos.js';

export const idLocalTrunc = (id) => String(id).slice(-9);

function hoyISO() { return new Date().toISOString().slice(0, 10); }

function _arrayYClave(tipo) {
  return tipo === 'Préstamo' ? { arr: 'prestamos', dbKey: 'prestamos' } : { arr: 'pedidosAdelantos', dbKey: 'pedidosAdelantos' };
}

function _getById(tipo, id) {
  const { arr } = _arrayYClave(tipo);
  return (DB[arr] || []).find(p => String(p.id) === String(id));
}

export function getPedidoById(id) { return _getById('Adelanto', id); }
export function getPrestamoById(id) { return _getById('Préstamo', id); }

async function _guardar(tipo, obj) {
  const { dbKey } = _arrayYClave(tipo);
  await supaSync(dbKey, obj);
}

async function _registrarEvento(tipo, pedido, estadoDesde, estadoHasta, observaciones = '') {
  const ev = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    pedidoIdLocal: idLocalTrunc(pedido.id), tipoPedido: tipo,
    estadoDesde, estadoHasta,
    ejecutadoPor: currentUser?.nombre || '', ejecutadoRol: currentUser?.perfil || '',
    ejecutadoEn: new Date().toISOString(), observaciones,
  };
  if (!DB.pedidosAdelantosEventos) DB.pedidosAdelantosEventos = [];
  DB.pedidosAdelantosEventos.push(ev);
  await supaSync('pedidosAdelantosEventos', ev);
}

export function eventosDePedido(pedidoIdLocal) {
  return (DB.pedidosAdelantosEventos || [])
    .filter(e => e.pedidoIdLocal === idLocalTrunc(pedidoIdLocal))
    .sort((a, b) => new Date(b.ejecutadoEn) - new Date(a.ejecutadoEn));
}

// ========== CREACIÓN ==========

export async function crearPedidoAdelanto({ legajo, monto, origen, fechaPedido, observaciones, supervisorNombre }) {
  const fecha = fechaPedido || hoyISO();
  const tope = obtenerTopeVigente(fecha);
  const nuevo = {
    id: Date.now(),
    legajoIdLocal: String(legajo.nro), nroSocio: String(legajo.nro), nombreAsociado: legajo.nombre,
    servicio: legajo.servicio || '',
    supervisorNombre: supervisorNombre || currentUser?.nombre || 'Supervisor',
    origen: origen || 'Formal',
    monto: Number(monto),
    periodo: fecha.slice(0, 7),
    fechaPedido: fecha,
    estado: 'Borrador',
    superaTope: tope != null ? Number(monto) > tope : false,
    topeVigenteAlPedido: tope,
    observaciones: observaciones || '',
    cargadoPor: currentUser?.nombre || '',
  };
  if (!DB.pedidosAdelantos) DB.pedidosAdelantos = [];
  DB.pedidosAdelantos.push(nuevo);
  await _guardar('Adelanto', nuevo);
  await _registrarEvento('Adelanto', nuevo, null, 'Borrador');
  return nuevo;
}

export async function crearPedidoPrestamo({ legajo, montoSolicitado, cuotasSolicitadas, origen, fechaPedido, observaciones, supervisorNombre }) {
  const fecha = fechaPedido || hoyISO();
  const nuevo = {
    id: Date.now(),
    nombre: legajo.nombre, nroSocio: String(legajo.nro), legajoIdLocal: String(legajo.nro),
    servicio: legajo.servicio || '',
    supervisorNombre: supervisorNombre || currentUser?.nombre || 'Supervisor',
    origen: origen || 'Formal',
    montoSolicitado: Number(montoSolicitado), cuotasSolicitadas: parseInt(cuotasSolicitadas, 10),
    montoCuotaSolicitado: Math.round(Number(montoSolicitado) / parseInt(cuotasSolicitadas, 10)),
    monto: null, cuotas: null, montoCuota: null, fechaOtorgamiento: null,
    periodo: fecha.slice(0, 7),
    fechaPedido: fecha,
    estado: 'Borrador',
    obs: observaciones || '',
    cargadoPor: currentUser?.nombre || '',
    pagos: [],
  };
  if (!DB.prestamos) DB.prestamos = [];
  DB.prestamos.push(nuevo);
  await _guardar('Préstamo', nuevo);
  await _registrarEvento('Préstamo', nuevo, null, 'Borrador');
  return nuevo;
}

export async function editarBorrador(tipo, id, cambios) {
  const p = _getById(tipo, id);
  if (!p) return { error: 'No se encontró el pedido' };
  if (p.estado !== 'Borrador') return { error: 'Solo se puede editar mientras está en Borrador' };
  Object.assign(p, cambios);
  if (tipo === 'Adelanto') {
    const tope = obtenerTopeVigente(p.fechaPedido);
    p.superaTope = tope != null ? Number(p.monto) > tope : false;
    p.topeVigenteAlPedido = tope;
  } else if (tipo === 'Préstamo' && cambios.montoSolicitado != null && cambios.cuotasSolicitadas != null) {
    p.montoCuotaSolicitado = Math.round(Number(p.montoSolicitado) / Number(p.cuotasSolicitadas));
  }
  await _guardar(tipo, p);
  return { pedido: p };
}

// ========== TRANSICIONES ==========

export async function cancelarPedido(tipo, id) {
  const p = _getById(tipo, id);
  if (!p) return { error: 'No se encontró el pedido' };
  if (p.estado !== 'Borrador') return { error: 'Solo se puede cancelar mientras está en Borrador — una vez elevado, pedile a RRHH que lo rechace' };
  const estadoDesde = p.estado;
  p.estado = 'Cancelada';
  await _guardar(tipo, p);
  await _registrarEvento(tipo, p, estadoDesde, p.estado);
  return { pedido: p };
}

export async function elevarPedido(tipo, id) {
  const p = _getById(tipo, id);
  if (!p) return { error: 'No se encontró el pedido' };
  if (p.estado !== 'Borrador') return { error: 'Este pedido ya fue elevado' };
  const estadoDesde = p.estado;
  p.estado = 'Enviada';
  await _guardar(tipo, p);
  await _registrarEvento(tipo, p, estadoDesde, p.estado);
  await crearNotificacion({
    tipo: 'adelantos_pedido_enviado', entidadTipo: 'pedido_adelanto', entidadIdLocal: p.id,
    destinatarioNombre: 'RRHH',
    mensaje: `💵 Nuevo pedido de ${tipo.toLowerCase()} de ${tipo === 'Préstamo' ? p.nombre : p.nombreAsociado} — esperando revisión.`,
  });
  return { pedido: p };
}

export async function aprobarRRHH(tipo, id, extra = {}) {
  const p = _getById(tipo, id);
  if (!p) return { error: 'No se encontró el pedido' };
  if (p.estado !== 'Enviada') return { error: 'Este pedido no está esperando aprobación de RRHH' };
  const estadoDesde = p.estado;
  p.estado = 'Aprobada RRHH';
  p.aprobadoPorRrhh = currentUser?.nombre || '';
  p.fechaAprobacionRrhh = new Date().toISOString();
  if (tipo === 'Préstamo') {
    p.cuotas = extra.cuotasAprobadas != null ? parseInt(extra.cuotasAprobadas, 10) : p.cuotasSolicitadas;
    p.monto = extra.montoAprobado != null ? Number(extra.montoAprobado) : p.montoSolicitado;
    p.montoCuota = Math.round(p.monto / p.cuotas);
  }
  await _guardar(tipo, p);
  await _registrarEvento(tipo, p, estadoDesde, p.estado, extra.observaciones || '');
  await crearNotificacion({
    tipo: 'adelantos_aprobado_rrhh', entidadTipo: 'pedido_adelanto', entidadIdLocal: p.id,
    destinatarioNombre: 'Finanzas',
    mensaje: `✅ RRHH aprobó un ${tipo.toLowerCase()} de ${tipo === 'Préstamo' ? p.nombre : p.nombreAsociado} — esperando pago.`,
  });
  return { pedido: p };
}

export async function rechazarRRHH(tipo, id, motivo) {
  const p = _getById(tipo, id);
  if (!p) return { error: 'No se encontró el pedido' };
  if (p.estado !== 'Enviada') return { error: 'Este pedido no está esperando aprobación de RRHH' };
  if (!motivo) return { error: 'El motivo del rechazo es obligatorio' };
  const estadoDesde = p.estado;
  p.estado = 'Rechazada RRHH';
  p.motivoRechazoRrhh = motivo;
  await _guardar(tipo, p);
  await _registrarEvento(tipo, p, estadoDesde, p.estado, motivo);
  await crearNotificacion({
    tipo: 'adelantos_rechazado_rrhh', entidadTipo: 'pedido_adelanto', entidadIdLocal: p.id,
    destinatarioNombre: p.supervisorNombre,
    mensaje: `❌ RRHH rechazó el ${tipo.toLowerCase()} de ${tipo === 'Préstamo' ? p.nombre : p.nombreAsociado}. Motivo: ${motivo}`,
  });
  return { pedido: p };
}

export async function pagarFinanzas(tipo, id) {
  const p = _getById(tipo, id);
  if (!p) return { error: 'No se encontró el pedido' };
  if (p.estado !== 'Aprobada RRHH') return { error: 'Este pedido no está esperando pago' };
  const estadoDesde = p.estado;
  p.estado = 'Aprobada';
  p.pagadoPor = currentUser?.nombre || '';
  p.fechaPago = new Date().toISOString();
  if (tipo === 'Préstamo') p.fechaOtorgamiento = hoyISO();
  await _guardar(tipo, p);
  await _registrarEvento(tipo, p, estadoDesde, p.estado);
  await generarCompromisosDescuento(p, tipo);
  return { pedido: p };
}

export async function pagarFinanzasBulk(tipo, ids) {
  const resultados = [];
  for (const id of ids) resultados.push(await pagarFinanzas(tipo, id));
  return resultados;
}

export async function rechazarFinanzas(tipo, id, motivo) {
  const p = _getById(tipo, id);
  if (!p) return { error: 'No se encontró el pedido' };
  if (p.estado !== 'Aprobada RRHH') return { error: 'Este pedido no está esperando pago' };
  if (!motivo) return { error: 'El motivo del rechazo es obligatorio' };
  const estadoDesde = p.estado;
  p.estado = 'Rechazada Finanzas';
  p.motivoRechazoFinanzas = motivo;
  await _guardar(tipo, p);
  await _registrarEvento(tipo, p, estadoDesde, p.estado, motivo);
  await crearNotificacion({
    tipo: 'adelantos_rechazado_finanzas', entidadTipo: 'pedido_adelanto', entidadIdLocal: p.id,
    destinatarioNombre: 'RRHH',
    mensaje: `↩️ Finanzas devolvió el ${tipo.toLowerCase()} de ${tipo === 'Préstamo' ? p.nombre : p.nombreAsociado}. Motivo: ${motivo}`,
  });
  return { pedido: p };
}

// RRHH ajusta (opcional) y vuelve a aprobar tras un rechazo de Finanzas — mismo ciclo, mismo id_local.
export async function reAprobarTrasRechazoFinanzas(tipo, id, cambios = {}) {
  const p = _getById(tipo, id);
  if (!p) return { error: 'No se encontró el pedido' };
  if (p.estado !== 'Rechazada Finanzas') return { error: 'Este pedido no fue devuelto por Finanzas' };
  const estadoDesde = p.estado;
  if (tipo === 'Adelanto' && cambios.monto != null) p.monto = Number(cambios.monto);
  if (tipo === 'Préstamo') {
    if (cambios.cuotasAprobadas != null) p.cuotas = parseInt(cambios.cuotasAprobadas, 10);
    if (cambios.montoAprobado != null) p.monto = Number(cambios.montoAprobado);
    if (cambios.cuotasAprobadas != null || cambios.montoAprobado != null) p.montoCuota = Math.round(p.monto / p.cuotas);
  }
  p.estado = 'Aprobada RRHH';
  p.aprobadoPorRrhh = currentUser?.nombre || '';
  p.fechaAprobacionRrhh = new Date().toISOString();
  await _guardar(tipo, p);
  await _registrarEvento(tipo, p, estadoDesde, p.estado, 'RRHH reenvía a Finanzas tras devolución');
  await crearNotificacion({
    tipo: 'adelantos_aprobado_rrhh', entidadTipo: 'pedido_adelanto', entidadIdLocal: p.id,
    destinatarioNombre: 'Finanzas',
    mensaje: `✅ RRHH reenvió el ${tipo.toLowerCase()} de ${tipo === 'Préstamo' ? p.nombre : p.nombreAsociado} — esperando pago.`,
  });
  return { pedido: p };
}
