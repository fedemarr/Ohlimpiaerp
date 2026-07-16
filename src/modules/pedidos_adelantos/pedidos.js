// Pedidos de Adelantos v1.1 (Operaciones — Supervisor) — Tab "Mis
// pedidos" + Tab "Historial de mi equipo" + modal "Nuevo pedido"
// (Adelanto o Préstamo) + modal detalle. Reemplaza el flujo roto de
// legacy.js (los modales de carga no existían en el DOM).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import {
  getPedidoById, getPrestamoById, crearPedidoAdelanto, crearPedidoPrestamo,
  cancelarPedido, elevarPedido, eventosDePedido,
} from '../adelantos_prestamos_shared/flujo.js';
import { obtenerTopeVigente } from '../adelantos_prestamos_shared/config.js';
import { esSupervisor, esCentralOperaciones } from '../adelantos_prestamos_shared/permisos.js';

const ESTADO_BADGE = {
  'Borrador': 'badge-gris', 'Enviada': 'badge-acento', 'Aprobada RRHH': 'badge-azul',
  'Aprobada': 'badge-verde', 'Rechazada RRHH': 'badge-rojo', 'Rechazada Finanzas': 'badge-rojo',
  'Cancelada': 'badge-gris',
};

function badge(estado) { return `<span class="badge ${ESTADO_BADGE[estado] || 'badge-gris'}">${estado}</span>`; }

function equipoDelSupervisor() {
  if (esCentralOperaciones()) return null; // null = sin filtro, ve todo
  return currentUser?.nombre || '';
}

function todosLosPedidos() {
  const adelantos = (DB.pedidosAdelantos || []).filter(p => !p.anulado).map(p => ({ ...p, tipo: 'Adelanto', nombreMostrar: p.nombreAsociado }));
  const prestamos = (DB.prestamos || []).filter(p => !p.anulado && p.fechaPedido).map(p => ({ ...p, tipo: 'Préstamo', monto: p.monto ?? p.montoSolicitado, nombreMostrar: p.nombre }));
  return [...adelantos, ...prestamos];
}

function pedidosDelEquipo() {
  const equipo = equipoDelSupervisor();
  let pedidos = todosLosPedidos();
  if (equipo) pedidos = pedidos.filter(p => p.supervisorNombre === equipo);
  return pedidos;
}

// ========== TAB MIS PEDIDOS ==========

function filaPedido(p, { mostrarAcciones = true } = {}) {
  return `<tr>
    <td style="font-weight:500;">${p.nombreMostrar}</td>
    <td style="font-size:12px;">${p.tipo}</td>
    <td style="text-align:right;">$${Number(p.monto || 0).toLocaleString('es-AR')}</td>
    <td style="font-size:12px;">${p.tipo === 'Préstamo' ? (p.cuotas || p.cuotasSolicitadas || '—') : '—'}</td>
    <td style="font-size:12px;">${p.fechaPedido}</td>
    <td>${badge(p.estado)}${p.superaTope ? ' <span class="badge badge-naranja" style="font-size:10px;">Supera tope</span>' : ''}</td>
    <td>
      <button class="btn btn-secondary btn-sm" onclick="abrirDetallePedidoAdelanto('${p.tipo}','${p.id}')">👁 Ver</button>
      ${mostrarAcciones && p.estado === 'Borrador' ? `<button class="btn btn-primary btn-sm" onclick="elevarPedidoPorId('${p.tipo}','${p.id}')">📤 Elevar</button>` : ''}
    </td>
  </tr>`;
}

export function renderMisPedidos() {
  const tbody = $('tbody-padl-mios');
  if (!tbody) return;
  const filas = pedidosDelEquipo().filter(p => !['Cancelada', 'Rechazada RRHH'].includes(p.estado) || p.estado === 'Borrador')
    .filter(p => p.estado !== 'Aprobada')
    .sort((a, b) => new Date(b.id) - new Date(a.id));
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:32px;opacity:.5;">Sin pedidos en curso</td></tr>'
    : filas.map(p => filaPedido(p)).join('');
}

export function filtrarMisPedidos() { renderMisPedidos(); }

// ========== TAB HISTORIAL DE MI EQUIPO ==========

export function renderHistorialEquipo() {
  let filas = pedidosDelEquipo().filter(p => ['Aprobada', 'Rechazada RRHH', 'Rechazada Finanzas', 'Cancelada'].includes(p.estado));

  const q = ($('padlh-buscar') || {}).value?.toLowerCase() || '';
  const tipo = ($('padlh-tipo') || {}).value || '';
  const estado = ($('padlh-estado') || {}).value || '';
  const anio = ($('padlh-anio') || {}).value || '';
  if (q) filas = filas.filter(p => p.nombreMostrar.toLowerCase().includes(q));
  if (tipo) filas = filas.filter(p => p.tipo === tipo);
  if (estado) filas = filas.filter(p => p.estado === estado);
  if (anio) filas = filas.filter(p => (p.fechaPedido || '').slice(0, 4) === anio);
  filas.sort((a, b) => new Date(b.id) - new Date(a.id));

  const tbody = $('tbody-padl-historial');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:32px;opacity:.5;">Sin pedidos históricos</td></tr>'
    : filas.map(p => filaPedido(p, { mostrarAcciones: false })).join('');
}

export function filtrarHistorialEquipo() { renderHistorialEquipo(); }

// ========== MODAL — NUEVO PEDIDO ==========

let _legajoSeleccionadoNuevo = null;
let _universoAsociadosNuevo = []; // acota la búsqueda por N° de socio al mismo universo del datalist de nombres (equipo del supervisor, o todos si es Central de Operaciones)

function ensureModalNuevoPedido() {
  if ($('modal-padl-nuevo')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-padl-nuevo';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3>💵 Nuevo pedido</h3><button class="btn-close" onclick="cerrarModal('modal-padl-nuevo')">×</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label><input type="radio" name="npa-tipo" value="Adelanto" checked onchange="cambiarTipoPedidoModal()"> 💵 Adelanto</label>
          <label style="margin-left:16px;"><input type="radio" name="npa-tipo" value="Préstamo" onchange="cambiarTipoPedidoModal()"> 🏦 Préstamo</label>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Asociado * (por nombre)</label><input type="text" id="npa-asociado" list="dl-asoc-padl" oninput="seleccionarAsociadoPedido()"><datalist id="dl-asoc-padl"></datalist></div>
          <div class="form-group"><label>...o por N° de socio</label><input type="text" id="npa-asociado-nro" inputmode="numeric" placeholder="Ej: 1234" oninput="buscarAsociadoPedidoPorNro()"></div>
        </div>
        <div id="npa-info-asociado" style="font-size:12.5px;color:var(--texto-suave);margin-bottom:8px;"></div>

        <div id="npa-seccion-adelanto">
          <div class="form-group"><label>Monto *</label><input type="number" id="npa-monto" min="0" step="100" oninput="chequearTopeModal()"></div>
          <div id="npa-aviso-tope" class="alerta alerta-warn" style="display:none;font-size:12px;"></div>
        </div>
        <div id="npa-seccion-prestamo" style="display:none;">
          <div class="form-group"><label>Monto solicitado *</label><input type="number" id="npa-monto-prestamo" min="0" step="100"></div>
          <p style="font-size:12px;color:var(--texto-suave);margin-top:-6px;">La cantidad de cuotas la define RRHH al revisar el pedido.</p>
        </div>

        <div class="form-group"><label>Fecha del pedido</label><input type="date" id="npa-fecha"></div>
        <div class="form-group"><label>Observaciones</label><textarea id="npa-obs" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-padl-nuevo')">Cancelar</button>
        <button class="btn btn-secondary" onclick="confirmarNuevoPedido(false)">Guardar borrador</button>
        <button class="btn btn-primary" onclick="confirmarNuevoPedido(true)">Guardar y elevar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function cambiarTipoPedidoModal() {
  const tipo = document.querySelector('input[name="npa-tipo"]:checked')?.value;
  $('npa-seccion-adelanto').style.display = tipo === 'Adelanto' ? 'block' : 'none';
  $('npa-seccion-prestamo').style.display = tipo === 'Préstamo' ? 'block' : 'none';
}

function legajoPorMatch(texto) {
  const match = (texto || '').match(/\(N°(\d+)\)\s*$/);
  if (!match) return null;
  return (DB.legajos || []).find(l => String(l.nro) === match[1]) || null;
}

export function seleccionarAsociadoPedido() {
  const legajo = legajoPorMatch($('npa-asociado').value);
  _legajoSeleccionadoNuevo = legajo;
  if ($('npa-asociado-nro')) $('npa-asociado-nro').value = '';
  if (!legajo) { $('npa-info-asociado').innerHTML = ''; return; }
  $('npa-info-asociado').innerHTML = `N° ${legajo.nro} — ${legajo.servicio || '—'} · Supervisor: ${legajo.supervisor || '—'}`;
  chequearTopeModal();
}

export function buscarAsociadoPedidoPorNro() {
  const nro = ($('npa-asociado-nro') || { value: '' }).value.trim();
  if (!nro) { _legajoSeleccionadoNuevo = null; $('npa-info-asociado').innerHTML = ''; return; }
  const legajo = _universoAsociadosNuevo.find(l => String(l.nro) === nro);
  if (!legajo) {
    _legajoSeleccionadoNuevo = null;
    $('npa-info-asociado').innerHTML = '<span style="color:var(--rojo);">No se encontró un asociado activo con ese número en tu equipo</span>';
    return;
  }
  _legajoSeleccionadoNuevo = legajo;
  $('npa-asociado').value = `${legajo.nombre} (N°${legajo.nro})`;
  $('npa-info-asociado').innerHTML = `N° ${legajo.nro} — ${legajo.servicio || '—'} · Supervisor: ${legajo.supervisor || '—'}`;
  chequearTopeModal();
}

export function chequearTopeModal() {
  const monto = parseFloat($('npa-monto').value) || 0;
  const tope = obtenerTopeVigente();
  const aviso = $('npa-aviso-tope');
  if (tope != null && monto > tope) {
    aviso.style.display = 'block';
    aviso.textContent = `Este monto supera el tope vigente de $${tope.toLocaleString('es-AR')}. RRHH lo tratará como autorización especial.`;
  } else {
    aviso.style.display = 'none';
  }
}

export function abrirNuevoPedidoAdelanto() {
  if (esSupervisor() && !(DB.legajos || []).some(l => l.supervisor === currentUser?.nombre)) {
    toast('⚠️ No tenés operarios asignados. Contactá RRHH.');
    return;
  }
  ensureModalNuevoPedido();
  _legajoSeleccionadoNuevo = null;
  const universo = esCentralOperaciones() ? (DB.legajos || []) : (DB.legajos || []).filter(l => l.supervisor === currentUser?.nombre);
  _universoAsociadosNuevo = universo.filter(l => l.estado === 'Activo');
  $('dl-asoc-padl').innerHTML = _universoAsociadosNuevo.map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  document.querySelector('input[name="npa-tipo"][value="Adelanto"]').checked = true;
  cambiarTipoPedidoModal();
  $('npa-asociado').value = '';
  $('npa-asociado-nro').value = '';
  $('npa-info-asociado').innerHTML = '';
  $('npa-monto').value = '';
  $('npa-monto-prestamo').value = '';
  $('npa-aviso-tope').style.display = 'none';
  $('npa-fecha').value = new Date().toISOString().slice(0, 10);
  $('npa-obs').value = '';
  abrirModal('modal-padl-nuevo');
}

export async function confirmarNuevoPedido(elevarAlGuardar) {
  const legajo = _legajoSeleccionadoNuevo;
  if (!legajo) { toast('⚠️ Elegí el asociado'); return; }
  if (legajo.estado !== 'Activo') { toast('❌ El asociado no está activo'); return; }
  const tipo = document.querySelector('input[name="npa-tipo"]:checked')?.value;
  const fechaPedido = $('npa-fecha').value || new Date().toISOString().slice(0, 10);
  const observaciones = $('npa-obs').value.trim();

  let pedido;
  if (tipo === 'Adelanto') {
    const monto = parseFloat($('npa-monto').value);
    if (!monto || monto <= 0) { toast('⚠️ Ingresá un monto válido'); return; }
    pedido = await crearPedidoAdelanto({ legajo, monto, fechaPedido, observaciones });
  } else {
    const monto = parseFloat($('npa-monto-prestamo').value);
    if (!monto || monto <= 0) { toast('⚠️ Ingresá un monto válido'); return; }
    pedido = await crearPedidoPrestamo({ legajo, montoSolicitado: monto, fechaPedido, observaciones });
  }

  if (elevarAlGuardar) {
    const r = await elevarPedido(tipo, pedido.id);
    if (r.error) { toast('⚠️ ' + r.error); return; }
  }

  cerrarModal('modal-padl-nuevo');
  renderMisPedidos();
  toast(elevarAlGuardar ? '✅ Pedido elevado a RRHH' : '✅ Borrador guardado');
}

export function elevarPedidoPorId(tipo, id) {
  elevarPedido(tipo, id).then(r => {
    if (r.error) { toast('⚠️ ' + r.error); return; }
    renderMisPedidos();
    toast('✅ Pedido elevado a RRHH');
  });
}

// ========== MODAL — DETALLE / EDITAR / CANCELAR ==========

function ensureModalDetalle() {
  if ($('modal-padl-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-padl-detalle';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3 id="pd-titulo">Pedido</h3><button class="btn-close" onclick="cerrarModal('modal-padl-detalle')">×</button></div>
      <div class="modal-body" id="pd-cuerpo"></div>
      <div class="modal-footer" id="pd-acciones"><button class="btn btn-secondary" onclick="cerrarModal('modal-padl-detalle')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetallePedidoAdelanto(tipo, id) {
  const p = tipo === 'Préstamo' ? getPrestamoById(id) : getPedidoById(id);
  if (!p) return;
  ensureModalDetalle();
  const nombre = tipo === 'Préstamo' ? p.nombre : p.nombreAsociado;
  $('pd-titulo').textContent = `${tipo === 'Préstamo' ? '🏦' : '💵'} ${nombre}`;
  const eventos = eventosDePedido(p.id);

  $('pd-cuerpo').innerHTML = `
    <div class="info-grid" style="margin-bottom:14px;">
      <div class="info-item"><div class="key">Estado</div><div class="val">${badge(p.estado)}</div></div>
      <div class="info-item"><div class="key">Monto</div><div class="val">$${Number(p.monto ?? p.montoSolicitado ?? 0).toLocaleString('es-AR')}</div></div>
      ${tipo === 'Préstamo' ? `<div class="info-item"><div class="key">Cuotas</div><div class="val">${p.cuotas ?? p.cuotasSolicitadas ?? '—'}</div></div>` : ''}
      <div class="info-item"><div class="key">Fecha del pedido</div><div class="val">${p.fechaPedido}</div></div>
      <div class="info-item"><div class="key">Origen</div><div class="val">${p.origen || 'Formal'}</div></div>
    </div>
    ${p.motivoRechazoRrhh ? `<p style="font-size:13px;"><strong>Motivo rechazo RRHH:</strong> ${p.motivoRechazoRrhh}</p>` : ''}
    ${p.motivoRechazoFinanzas ? `<p style="font-size:13px;"><strong>Motivo rechazo Finanzas:</strong> ${p.motivoRechazoFinanzas}</p>` : ''}
    ${(p.observaciones || p.obs) ? `<p style="font-size:13px;"><strong>Observaciones:</strong> ${p.observaciones || p.obs}</p>` : ''}
    <div class="form-section" style="margin-bottom:8px;">Historial</div>
    <div class="timeline">
      ${eventos.length === 0 ? '<p class="text-muted">Sin eventos</p>' : eventos.map(e => `
        <div class="tl-item"><div class="tl-dot"></div><div class="tl-content">
          <h4>${e.estadoDesde ? e.estadoDesde + ' → ' : ''}${e.estadoHasta}</h4>
          <p>${(e.ejecutadoEn || '').slice(0, 16).replace('T', ' ')} — ${e.ejecutadoPor}${e.observaciones ? ' — ' + e.observaciones : ''}</p>
        </div></div>`).join('')}
    </div>
  `;

  $('pd-acciones').innerHTML = p.estado === 'Borrador' ? `
    <button class="btn" style="background:#fee2e2;color:#991b1b;" onclick="cancelarPedidoPorId('${tipo}','${p.id}')">Cancelar pedido</button>
    <button class="btn btn-primary" onclick="elevarPedidoPorId('${tipo}','${p.id}'); cerrarModal('modal-padl-detalle');">📤 Elevar</button>
    <button class="btn btn-secondary" onclick="cerrarModal('modal-padl-detalle')">Cerrar</button>
  ` : '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-padl-detalle\')">Cerrar</button>';
  abrirModal('modal-padl-detalle');
}

export function cancelarPedidoPorId(tipo, id) {
  if (!confirm('¿Cancelar este pedido?')) return;
  cancelarPedido(tipo, id).then(r => {
    if (r.error) { toast('⚠️ ' + r.error); return; }
    cerrarModal('modal-padl-detalle');
    renderMisPedidos();
    toast('✅ Pedido cancelado');
  });
}
