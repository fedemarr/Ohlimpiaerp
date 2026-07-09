// Uniformes v2 — devoluciones por baja (DISENO_uniformes.md §13).
// Al dar de baja a un asociado, se genera automáticamente una orden con
// las prendas que se le entregaron sin cargo (política: debe devolverlas
// sin costo; si no las devuelve, descuento en una sola cuota).
//
// Simplificación deliberada respecto al pseudocódigo del diseño: se
// suman TODAS las prendas de pedidos Cerrados sin descuento del legajo,
// sin intentar reconstruir cronológicamente qué se "canjeó" en
// Renovación/Reubicación — evita una lógica de inventario por prenda
// que el diseño tampoco especifica con precisión. RRHH revisa y
// confirma manualmente qué se devolvió antes de cerrar la orden.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, abrirModalInput } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { nombresPorPerfil } from './permisos.js';
import { prendasDelPedido } from './flujo.js';
import { obtenerPrecioVigente } from './precios.js';

export function getDevolucionById(id) {
  return (DB.devolucionesPorBaja || []).find(d => String(d.id) === String(id));
}

function prendasEntregadasSinCargo(legajoIdLocal) {
  const pedidos = (DB.pedidosUniformes || []).filter(p => !p.anulado && String(p.legajoIdLocal) === String(legajoIdLocal) && p.estado === 'Cerrado' && !p.conDescuento);
  const totales = {};
  for (const p of pedidos) {
    for (const pr of prendasDelPedido(p.id)) {
      totales[pr.prenda] = (totales[pr.prenda] || 0) + pr.cantidad;
    }
  }
  return Object.entries(totales).map(([prenda, cantidad]) => ({ prenda, cantidad }));
}

async function notificarRRHH(orden, tipo, mensaje) {
  for (const destinatario of nombresPorPerfil('RRHH')) {
    await crearNotificacion({ tipo, entidadTipo: 'uniforme', entidadIdLocal: orden.id, destinatarioNombre: destinatario, mensaje });
  }
}

// Llamado desde legajos.js:guardarEdicionLegajo() al detectar la
// transición a estado 'Baja'.
export async function generarOrdenDevolucionUniformes(legajo, fechaBaja) {
  const prendas = prendasEntregadasSinCargo(legajo.nro);
  if (!prendas.length) return;
  const orden = {
    id: Date.now(),
    legajoIdLocal: String(legajo.nro),
    nombreOperario: legajo.nombre,
    fechaBaja,
    fechaGenerada: new Date().toISOString(),
    prendasADevolver: prendas,
    estado: 'Pendiente devolución',
  };
  if (!DB.devolucionesPorBaja) DB.devolucionesPorBaja = [];
  DB.devolucionesPorBaja.push(orden);
  await supaSync('devolucionesPorBaja', orden);
  await notificarRRHH(orden, 'devolucion_por_baja_pendiente', `👕 ${legajo.nombre} causó baja — tiene uniformes pendientes de devolución.`);
  renderDevolucionesBaja();
}

export function abrirGenerarOrdenManual() {
  abrirModalInput({
    titulo: 'Generar orden de devolución manual',
    etiqueta: 'N° de socio',
    placeholder: 'Ej: 1234',
  }, async (nroTexto) => {
    const legajo = (DB.legajos || []).find(l => String(l.nro) === nroTexto.trim());
    if (!legajo) { toast('⚠️ No se encontró un legajo con ese número de socio'); return; }
    const fechaBaja = legajo.fechaBaja ? legajo.fechaBaja.split('/').reverse().join('-') : new Date().toISOString().slice(0, 10);
    await generarOrdenDevolucionUniformes(legajo, fechaBaja);
    toast('✅ Orden generada (si el legajo tenía uniformes sin cargo pendientes)');
  });
}

// ========== CIERRE DE ORDEN ==========

let _ordenCerrandoId = null;

export function abrirCierreDevolucion(idLocal) {
  const orden = getDevolucionById(idLocal);
  if (!orden || orden.estado !== 'Pendiente devolución') { toast('⚠️ Esta orden ya no está pendiente'); return; }
  _ordenCerrandoId = orden.id;
  $('mdb-titulo').textContent = `Devolución — ${orden.nombreOperario}`;
  $('mdb-checklist').innerHTML = (orden.prendasADevolver || []).map((p, i) => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;">
      <input type="checkbox" class="mdb-check" data-prenda="${p.prenda}" checked> ${p.cantidad}x ${p.prenda}
    </label>`).join('');
  abrirModal('modal-devolucion-baja');
}

export async function confirmarCierreDevolucion() {
  const orden = getDevolucionById(_ordenCerrandoId);
  if (!orden) return;
  const checks = Array.from(document.querySelectorAll('.mdb-check'));
  const devueltas = checks.filter(c => c.checked).map(c => c.dataset.prenda);
  const faltantes = checks.filter(c => !c.checked).map(c => c.dataset.prenda);

  orden.prendasDevueltas = (orden.prendasADevolver || []).filter(p => devueltas.includes(p.prenda));
  orden.fechaConfirmada = new Date().toISOString();
  orden.confirmadaPor = currentUser?.nombre || '';

  if (faltantes.length === 0) {
    orden.estado = 'Devuelto completo';
    await supaSync('devolucionesPorBaja', orden);
    toast('✅ Devolución completa registrada');
  } else {
    const monto = (orden.prendasADevolver || [])
      .filter(p => faltantes.includes(p.prenda))
      .reduce((s, p) => s + (obtenerPrecioVigente(p.prenda, null)?.precio || 0) * p.cantidad, 0);
    orden.estado = 'Descuento aplicado por faltante';
    orden.montoDescuento = monto;
    await supaSync('devolucionesPorBaja', orden);

    if (monto > 0) {
      const hoy = new Date().toISOString().slice(0, 10);
      const d = {
        id: Date.now(),
        pedidoIdLocal: String(orden.id).slice(-9),
        legajoIdLocal: orden.legajoIdLocal,
        montoTotal: monto,
        cuotasTotales: 1,
        cuotasCobradas: 0,
        montoCuota: monto,
        fechaGenerado: new Date().toISOString(),
        fechaPrimeraCuota: hoy,
        fechaUltimaCuota: hoy,
        estado: 'En curso',
        motivoGeneracion: `Uniforme no devuelto al causar baja: ${faltantes.join(', ')}`,
      };
      if (!DB.descuentosUniformePendientes) DB.descuentosUniformePendientes = [];
      DB.descuentosUniformePendientes.push(d);
      await supaSync('descuentosUniformePendientes', d);
    }
    toast('⚠️ Devolución incompleta — se generó el descuento correspondiente');
  }
  cerrarModal('modal-devolucion-baja');
  renderDevolucionesBaja();
}

// ========== TAB 4 ==========

export function filtrarDevolucionesBaja() { renderDevolucionesBaja(); }

export function renderDevolucionesBaja() {
  let filas = (DB.devolucionesPorBaja || []).filter(d => !d.anulado);
  const q = ($('uni-dev-buscar') || {}).value?.toLowerCase() || '';
  const fEstado = ($('uni-dev-estado') || {}).value || '';
  if (q) filas = filas.filter(d => d.nombreOperario.toLowerCase().includes(q));
  if (fEstado) filas = filas.filter(d => d.estado === fEstado);
  filas.sort((a, b) => new Date(b.fechaGenerada) - new Date(a.fechaGenerada));

  const tbody = $('tbody-uni-devoluciones');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5;">Sin órdenes de devolución</td></tr>'
    : filas.map(d => {
      const resumen = (d.prendasADevolver || []).map(p => `${p.cantidad}x ${p.prenda}`).join(', ');
      const acciones = d.estado === 'Pendiente devolución'
        ? `<button class="btn btn-xs btn-secondary" onclick="abrirCierreDevolucion('${d.id}')">✅ Cerrar orden</button>`
        : '';
      return `<tr>
        <td>${d.nombreOperario}</td>
        <td>${d.fechaBaja}</td>
        <td>${resumen || '—'}</td>
        <td><span class="badge ${d.estado === 'Devuelto completo' ? 'badge-verde' : d.estado === 'Pendiente devolución' ? 'badge-acento' : 'badge-rojo'}">${d.estado}</span></td>
        <td>${d.montoDescuento ? '$' + d.montoDescuento.toLocaleString('es-AR') : '—'}</td>
        <td>${acciones}</td>
      </tr>`;
    }).join('');
}
