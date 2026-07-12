// Módulo Uniformes v2 — rediseño completo (política A.11,
// DISENO_uniformes.md). Reemplaza la versión simple v024 (tabla
// `uniformes`, sin ciclo de estados) por el modelo de 6 tablas / 15
// estados con doble handshake. La tabla vieja `uniformes` queda
// intacta como archivo histórico, sin migrar (decisión del usuario).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, abrirModalInput } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { subirAdjunto } from '@shared/adjuntos.js';
import { esRRHHoAdmin, esLogistica, esSupervisor } from './permisos.js';
import {
  PRENDAS, TALLES_POR_PRENDA, MOTIVOS, ORIGENES, ESTADOS_UNIFORMES,
  ESTADOS_FINALES, conDescuentoSegunMotivo, esTemporadaCamperaPolar, talleSugerido,
} from './catalogos.js';
import {
  getPedidoById, prendasDelPedido, idLocalTrunc,
  elevarPedido, autorizarPedido, rechazarPedido, cancelarPedido,
  logisticaRecibe, logisticaEnvia, rrhhConfirmaRecepcionLogistica, rrhhMarcaRetiroSupervisor,
  supervisorConfirmaRetiro, supervisorEntregaConFirma, supervisorDevuelveConstanciaYViejo,
  rrhhConfirmaCierre, reactivarDesdeVencido,
} from './flujo.js';
import { aplicarDescuentoIncumplimiento } from './descuentos.js';

const ESTADO_BADGE = {
  'Borrador': 'badge-gris',
  'Pendiente autorización RRHH': 'badge-acento',
  'Autorizado por RRHH, esperando envío a Logística': 'badge-acento',
  'En preparación por Logística': 'badge-acento',
  'Enviado por Logística, esperando confirmación RRHH': 'badge-acento',
  'Recibido por RRHH, listo para retirar Supervisor': 'badge-acento',
  'Retirado por Supervisor, esperando confirmación Supervisor': 'badge-acento',
  'Confirmado por Supervisor, en tránsito a operario': 'badge-acento',
  'Entregado al operario con firma, esperando constancia + viejo': 'badge-acento',
  'Constancia + viejo entregados por Supervisor, esperando confirmación RRHH': 'badge-acento',
  'Cerrado': 'badge-verde',
  'Rechazado por RRHH': 'badge-rojo',
  'Cancelado por Solicitante': 'badge-gris',
  'Vencido': 'badge-rojo',
  'Descuento aplicado por incumplimiento': 'badge-rojo',
};

// ========== HELPERS ==========

function legajoPorMatch(texto) {
  const match = (texto || '').match(/\(N°(\d+)\)\s*$/);
  if (!match) return null;
  return (DB.legajos || []).find(l => String(l.nro) === match[1]) || null;
}

function btn(label, fn, color) {
  return `<button class="btn btn-xs" style="${color ? `background:${color};color:white;` : ''}" onclick="${fn}">${label}</button>`;
}

function resumenPrendas(pedidoId) {
  return prendasDelPedido(pedidoId).map(p => `${p.cantidad}x ${p.prenda} (${p.talle})`).join(', ') || '—';
}

function diasEnEstadoActual(p) {
  const fechaRef = p.fechaEntregaOperario && p.estado.startsWith('Entregado')
    ? p.fechaEntregaOperario
    : p.fechaDevolucionSupervisor && p.estado.startsWith('Constancia')
      ? p.fechaDevolucionSupervisor
      : p.fechaSolicitud;
  const dias = Math.floor((Date.now() - new Date(fechaRef).getTime()) / (24 * 3600 * 1000));
  const color = dias <= 2 ? 'badge-verde' : dias <= 7 ? 'badge-acento' : 'badge-rojo';
  return `<span class="badge ${color}">${dias}d</span>`;
}

function filaPedido(p, { acciones = [] } = {}) {
  return `<tr>
    <td>${p.nombreOperario}<div style="font-size:11px;color:var(--texto-suave);">N° ${p.nroSocio}</div></td>
    <td><span class="chip">${p.servicio || '—'}</span></td>
    <td>${p.supervisorAsignado || '—'}</td>
    <td>${p.motivo}</td>
    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${resumenPrendas(p.id).replace(/"/g, '&quot;')}">${resumenPrendas(p.id)}</td>
    <td>${p.conDescuento ? '<span class="badge badge-rojo">Con descuento</span>' : '<span class="badge badge-verde">Sin descuento</span>'}</td>
    <td>${(p.fechaSolicitud || '').slice(0, 10)}</td>
    <td>${diasEnEstadoActual(p)}</td>
    <td><span class="badge ${ESTADO_BADGE[p.estado] || 'badge-gris'}">${p.estado}</span></td>
    <td style="white-space:nowrap;">${acciones.join(' ')}</td>
  </tr>`;
}

function accionesParaPedido(p) {
  const nombre = currentUser?.nombre;
  const acciones = [];
  const esMio = p.solicitadoPor === nombre;

  if (esMio && p.estado === 'Borrador') {
    acciones.push(btn('✏️ Editar', `abrirEditarPedidoUniforme('${p.id}')`));
    acciones.push(btn('📤 Elevar', `elevarPedidoUniformePorId('${p.id}')`, '#1b4fa8'));
    acciones.push(btn('🗑 Cancelar', `abrirCancelarPedidoUniforme('${p.id}')`));
  }
  if (esMio && p.estado === 'Pendiente autorización RRHH') {
    acciones.push(btn('🗑 Cancelar', `abrirCancelarPedidoUniforme('${p.id}')`));
  }
  if (esRRHHoAdmin()) {
    if (p.estado === 'Pendiente autorización RRHH') {
      acciones.push(btn('✅ Autorizar', `autorizarPedidoUniformePorId('${p.id}')`, '#16a34a'));
      acciones.push(btn('❌ Rechazar', `abrirRechazoPedidoUniforme('${p.id}')`, '#dc2626'));
    }
    if (p.estado === 'Enviado por Logística, esperando confirmación RRHH') {
      acciones.push(btn('✅ Confirmar recepción', `rrhhConfirmaRecepcionPorId('${p.id}')`, '#16a34a'));
    }
    if (p.estado === 'Recibido por RRHH, listo para retirar Supervisor') {
      acciones.push(btn('🚚 Retiró el Supervisor', `rrhhMarcaRetiroPorId('${p.id}')`, '#1b4fa8'));
    }
    if (p.estado === 'Constancia + viejo entregados por Supervisor, esperando confirmación RRHH') {
      acciones.push(btn('✅ Confirmar cierre', `abrirConfirmarCierrePedido('${p.id}')`, '#16a34a'));
    }
    if (p.estado === 'Vencido') {
      acciones.push(btn('💸 Aplicar descuento', `abrirAplicarDescuentoIncumplimiento('${p.id}')`, '#dc2626'));
      acciones.push(btn('↩️ Devolución tardía', `reactivarDesdeVencidoPorId('${p.id}')`));
    }
  }
  if (esLogistica()) {
    if (p.estado === 'Autorizado por RRHH, esperando envío a Logística') {
      acciones.push(btn('📥 Marcar recibido', `logisticaRecibePorId('${p.id}')`, '#1b4fa8'));
    }
    if (p.estado === 'En preparación por Logística') {
      acciones.push(btn('📤 Marcar enviado', `logisticaEnviaPorId('${p.id}')`, '#1b4fa8'));
    }
  }
  if (esSupervisor() && p.supervisorAsignado === nombre) {
    if (p.estado === 'Retirado por Supervisor, esperando confirmación Supervisor') {
      acciones.push(btn('✅ Confirmar que lo tengo', `supervisorConfirmaRetiroPorId('${p.id}')`, '#16a34a'));
    }
    if (p.estado === 'Confirmado por Supervisor, en tránsito a operario') {
      acciones.push(btn('👕 Entregar con firma', `abrirEntregaConFirma('${p.id}')`, '#1b4fa8'));
    }
    if (p.estado === 'Entregado al operario con firma, esperando constancia + viejo') {
      acciones.push(btn('📄 Devolví constancia + viejo', `confirmarDevolucionConstanciaYViejo('${p.id}')`, '#1b4fa8'));
    }
  }
  acciones.push(btn('👁', `abrirDetallePedidoUniforme('${p.id}')`));
  return acciones;
}

// ========== TAB 1 — PENDIENTES ==========

export function filtrarPendientesUniformes() { renderPendientesUniformes(); }

export function renderPendientesUniformes() {
  const nombre = currentUser?.nombre;
  const NO_FINALES = (DB.pedidosUniformes || []).filter(p => !p.anulado && !ESTADOS_FINALES.includes(p.estado));
  let bandeja = NO_FINALES.filter(p => p.solicitadoPor === nombre);
  if (esRRHHoAdmin()) bandeja.push(...NO_FINALES);
  if (esLogistica()) bandeja.push(...NO_FINALES.filter(p => ['Autorizado por RRHH, esperando envío a Logística', 'En preparación por Logística'].includes(p.estado)));
  if (esSupervisor()) bandeja.push(...NO_FINALES.filter(p => p.supervisorAsignado === nombre));
  bandeja = [...new Map(bandeja.map(p => [p.id, p])).values()];

  const q = ($('uni-pend-buscar') || {}).value?.toLowerCase() || '';
  const fServicio = ($('uni-pend-servicio') || {}).value || '';
  const fEstado = ($('uni-pend-estado') || {}).value || '';
  if (q) bandeja = bandeja.filter(p => p.nombreOperario.toLowerCase().includes(q));
  if (fServicio) bandeja = bandeja.filter(p => p.servicio === fServicio);
  if (fEstado) bandeja = bandeja.filter(p => p.estado === fEstado);
  bandeja.sort((a, b) => new Date(a.fechaSolicitud) - new Date(b.fechaSolicitud));

  const tbody = $('tbody-uni-pendientes');
  if (!tbody) return;
  tbody.innerHTML = bandeja.length === 0
    ? '<tr><td colspan="10" style="text-align:center;padding:32px;opacity:.5;">No hay pedidos pendientes</td></tr>'
    : bandeja.map(p => filaPedido(p, { acciones: accionesParaPedido(p) })).join('');
}

export function poblarSelectsUniformesTab() {
  const fS = (id, items) => { const el = $(id); if (el) el.innerHTML = '<option value="">Todos</option>' + items.map(s => `<option>${s}</option>`).join(''); };
  fS('uni-pend-servicio', window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : (DB.servicios || []));
  fS('uni-hist-servicio', window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : (DB.servicios || []));
  fS('uni-pend-estado', ESTADOS_UNIFORMES);
  fS('uni-hist-estado', ESTADOS_UNIFORMES);
}

// ========== TAB 2 — TODOS LOS PEDIDOS ==========

export function filtrarTodosUniformes() { renderTodosUniformes(); }

export function renderTodosUniformes() {
  let lista = (DB.pedidosUniformes || []).filter(p => !p.anulado);
  const q = ($('uni-hist-buscar') || {}).value?.toLowerCase() || '';
  const fServicio = ($('uni-hist-servicio') || {}).value || '';
  const fEstado = ($('uni-hist-estado') || {}).value || '';
  const fAnio = ($('uni-hist-anio') || {}).value || '';
  if (q) lista = lista.filter(p => p.nombreOperario.toLowerCase().includes(q));
  if (fServicio) lista = lista.filter(p => p.servicio === fServicio);
  if (fEstado) lista = lista.filter(p => p.estado === fEstado);
  if (fAnio) lista = lista.filter(p => new Date(p.fechaSolicitud).getFullYear() === parseInt(fAnio));
  lista.sort((a, b) => new Date(b.fechaSolicitud) - new Date(a.fechaSolicitud));

  const tbody = $('tbody-uni-todos');
  if (!tbody) return;
  tbody.innerHTML = lista.length === 0
    ? '<tr><td colspan="10" style="text-align:center;padding:32px;opacity:.5;">Sin pedidos</td></tr>'
    : lista.map(p => filaPedido(p, { acciones: [btn('👁', `abrirDetallePedidoUniforme('${p.id}')`)] })).join('');
}

// ========== MODAL — NUEVO PEDIDO / EDITAR BORRADOR ==========

let _pedidoEditandoId = null;
let _prendasModal = []; // [{prenda, talle, cantidad}]

function ensureModalPedido() {
  if ($('modal-uni-pedido')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-uni-pedido';
  m.innerHTML = `
    <div class="modal" style="max-width:760px;">
      <div class="modal-header"><h3 id="up2-titulo">👕 Nuevo pedido de uniforme</h3><button class="btn-close" onclick="cerrarModal('modal-uni-pedido')">×</button></div>
      <div class="modal-body">
        <div class="form-section">Origen del pedido</div>
        <div class="form-group"><label>Origen *</label>
          <select id="up2-origen">${ORIGENES.map(o => `<option>${o}</option>`).join('')}</select>
        </div>

        <div class="form-section">Operario</div>
        <div class="form-group"><label>Operario *</label>
          <input type="text" id="up2-operario" list="dl-up2-operario" oninput="seleccionarOperarioPedidoUniforme()">
          <datalist id="dl-up2-operario"></datalist>
        </div>
        <div id="up2-info-operario" style="display:flex;flex-direction:column;gap:4px;font-size:13px;background:var(--fondo);border-radius:var(--radio);padding:12px;margin:8px 0 12px;"></div>

        <div class="form-section">Motivo</div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Motivo *</label>
            <select id="up2-motivo" onchange="recalcularPedidoUniforme()">${MOTIVOS.map(m2 => `<option>${m2}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>&nbsp;</label><div id="up2-badge-descuento"></div></div>
        </div>
        <div class="form-group" id="up2-grupo-policial" style="display:none;">
          <label>Constancia policial (foto, opcional)</label>
          <input type="file" id="up2-adjunto-policial" accept="application/pdf,image/jpeg,image/png">
        </div>
        <div id="up2-avisos" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>

        <div class="form-section">Prendas</div>
        <div id="up2-prendas"></div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="agregarPrendaPedidoUniforme()">+ Agregar prenda</button>

        <div class="form-section">Observaciones</div>
        <div class="form-group"><textarea id="up2-obs" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-uni-pedido')">Cancelar</button>
        <button class="btn btn-secondary" onclick="guardarBorradorPedidoUniforme()">💾 Guardar borrador</button>
        <button class="btn btn-primary" onclick="elevarPedidoDesdeModalUniforme()">📤 Elevar para autorización</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

function operariosDisponibles() {
  return (DB.legajos || []).filter(l => l.estado === 'Activo');
}

function renderFilasPrendas() {
  $('up2-prendas').innerHTML = _prendasModal.map((pr, i) => `
    <div class="form-grid" style="grid-template-columns:1fr 1fr 80px 32px;gap:8px;align-items:end;margin-bottom:6px;">
      <div class="form-group"><label>Prenda</label>
        <select onchange="cambiarPrendaModal(${i}, this.value)">${PRENDAS.map(p2 => `<option ${p2 === pr.prenda ? 'selected' : ''}>${p2}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Talle</label>
        <select onchange="cambiarTalleModal(${i}, this.value)">${(TALLES_POR_PRENDA[pr.prenda] || []).map(t => `<option ${t === pr.talle ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Cant.</label>
        <input type="number" min="1" value="${pr.cantidad}" onchange="cambiarCantidadModal(${i}, this.value)">
      </div>
      <button type="button" class="btn btn-xs" style="background:#fee2e2;color:#991b1b;" onclick="quitarPrendaModal(${i})">🗑</button>
    </div>`).join('') || '<p style="opacity:.5;font-size:13px;">Sin prendas agregadas</p>';
}

export function agregarPrendaPedidoUniforme() {
  _prendasModal.push({ prenda: PRENDAS[0], talle: TALLES_POR_PRENDA[PRENDAS[0]][0], cantidad: 1 });
  renderFilasPrendas();
}
export function cambiarPrendaModal(i, prenda) { _prendasModal[i].prenda = prenda; _prendasModal[i].talle = TALLES_POR_PRENDA[prenda][0]; renderFilasPrendas(); recalcularPedidoUniforme(); }
export function cambiarTalleModal(i, talle) { _prendasModal[i].talle = talle; recalcularPedidoUniforme(); }
export function cambiarCantidadModal(i, cant) { _prendasModal[i].cantidad = Math.max(1, parseInt(cant) || 1); }
export function quitarPrendaModal(i) { _prendasModal.splice(i, 1); renderFilasPrendas(); recalcularPedidoUniforme(); }

function pintarInfoOperario(legajo) {
  $('up2-info-operario').innerHTML = `
    <div><strong>${legajo.nombre}</strong> — N° ${legajo.nro}</div>
    <div>Servicio: ${legajo.servicio || '—'} · Supervisor: ${legajo.supervisor || '—'}</div>
  `;
}

export function seleccionarOperarioPedidoUniforme() {
  const legajo = legajoPorMatch($('up2-operario').value);
  if (!legajo) { $('up2-info-operario').innerHTML = ''; return; }
  pintarInfoOperario(legajo);
  // Pre-cargar talles sugeridos en las prendas ya agregadas.
  _prendasModal.forEach(pr => { pr.talle = talleSugerido(legajo, pr.prenda) || pr.talle; });
  renderFilasPrendas();
  recalcularPedidoUniforme();
}

export function recalcularPedidoUniforme() {
  const motivo = $('up2-motivo').value;
  const conDescuento = conDescuentoSegunMotivo(motivo);
  $('up2-badge-descuento').innerHTML = conDescuento
    ? '<span class="badge badge-rojo">Con descuento (4 cuotas)</span>'
    : '<span class="badge badge-verde">Sin descuento</span>';
  $('up2-grupo-policial').style.display = motivo === 'Robo con denuncia' ? 'block' : 'none';

  const avisos = [];
  if (!esTemporadaCamperaPolar() && motivo !== 'Camperas-Polar-Calzado inicial' && _prendasModal.some(pr => ['Campera', 'Polar'].includes(pr.prenda))) {
    avisos.push('⚠️ Camperas/Polar se entregan de marzo a septiembre — fuera de temporada.');
  }
  if (motivo === 'Robo con denuncia' && !$('up2-adjunto-policial')?.files?.length) {
    avisos.push('⚠️ No adjuntaste la constancia policial (opcional, pero recomendado).');
  }
  $('up2-avisos').innerHTML = avisos.map(a => `<div style="padding:8px 10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;font-size:12.5px;">${a}</div>`).join('');
}

export function abrirNuevaEntregaUniforme() {
  _pedidoEditandoId = null;
  _prendasModal = [];
  ensureModalPedido();
  $('up2-titulo').textContent = '👕 Nuevo pedido de uniforme';
  $('up2-origen').value = 'Supervisor';
  $('up2-operario').value = '';
  $('up2-info-operario').innerHTML = '';
  $('dl-up2-operario').innerHTML = operariosDisponibles().map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  $('up2-motivo').value = MOTIVOS[0];
  $('up2-obs').value = '';
  renderFilasPrendas();
  recalcularPedidoUniforme();
  abrirModal('modal-uni-pedido');
}

export function abrirEditarPedidoUniforme(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p || p.estado !== 'Borrador') { toast('⚠️ Solo se puede editar un borrador'); return; }
  _pedidoEditandoId = p.id;
  _prendasModal = prendasDelPedido(p.id).map(pr => ({ prenda: pr.prenda, talle: pr.talle, cantidad: pr.cantidad }));
  ensureModalPedido();
  $('up2-titulo').textContent = '👕 Editar pedido de uniforme';
  $('up2-origen').value = p.origen;
  $('up2-operario').value = `${p.nombreOperario} (N°${p.nroSocio})`;
  $('dl-up2-operario').innerHTML = operariosDisponibles().map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(p.legajoIdLocal));
  if (legajo) pintarInfoOperario(legajo);
  $('up2-motivo').value = p.motivo;
  $('up2-obs').value = p.observaciones || '';
  renderFilasPrendas();
  recalcularPedidoUniforme();
  abrirModal('modal-uni-pedido');
}

function validarPedido(legajo) {
  if (!legajo) { toast('⚠️ Elegí un operario de la lista'); return false; }
  if (!$('up2-motivo').value) { toast('⚠️ Elegí el motivo'); return false; }
  if (!_prendasModal.length) { toast('⚠️ Agregá al menos una prenda'); return false; }
  return true;
}

async function armarObjetoPedido(legajo, estado) {
  const motivo = $('up2-motivo').value;
  return {
    id: _pedidoEditandoId || Date.now(),
    legajoIdLocal: String(legajo.nro),
    nroSocio: String(legajo.nro),
    nombreOperario: legajo.nombre,
    servicio: legajo.servicio || '',
    supervisorAsignado: legajo.supervisor || '',
    origen: $('up2-origen').value,
    solicitadoPor: currentUser?.nombre || '',
    fechaSolicitud: _pedidoEditandoId ? undefined : new Date().toISOString(),
    motivo,
    conDescuento: conDescuentoSegunMotivo(motivo),
    observaciones: $('up2-obs').value,
    estado,
  };
}

async function guardarPrendasDelPedido(pedidoId) {
  const existentes = prendasDelPedido(pedidoId);
  for (const ex of existentes) { ex.anulado = true; await supaSync('pedidoUniformePrendas', ex); }
  const nuevas = [];
  for (const pr of _prendasModal) {
    const obj = { id: Date.now() + Math.floor(Math.random() * 1000), pedidoIdLocal: idLocalTrunc(pedidoId), prenda: pr.prenda, talle: pr.talle, cantidad: pr.cantidad };
    nuevas.push(obj);
    await supaSync('pedidoUniformePrendas', obj);
  }
  if (!DB.pedidoUniformePrendas) DB.pedidoUniformePrendas = [];
  DB.pedidoUniformePrendas.push(...nuevas);
}

async function subirConstanciaPolicialSiCorresponde(pedido, legajo) {
  if (pedido.motivo !== 'Robo con denuncia') return;
  const file = $('up2-adjunto-policial')?.files?.[0];
  if (!file) return;
  try {
    const adj = await subirAdjunto({ dni: legajo.dni, etapa: 'uniformes', tipo: 'denuncia-policial-uniforme', file });
    pedido.constanciaPolicialAdjuntoId = adj.id;
    await supaSync('pedidosUniformes', pedido);
  } catch (e) {
    toast('⚠️ No se pudo subir la constancia policial: ' + e.message);
  }
}

export async function guardarBorradorPedidoUniforme() {
  const legajo = legajoPorMatch($('up2-operario').value);
  if (!validarPedido(legajo)) return;
  const p = await armarObjetoPedido(legajo, 'Borrador');
  let registro;
  if (_pedidoEditandoId) {
    registro = getPedidoById(_pedidoEditandoId);
    Object.assign(registro, p, { fechaSolicitud: registro.fechaSolicitud });
  } else {
    registro = p;
    if (!DB.pedidosUniformes) DB.pedidosUniformes = [];
    DB.pedidosUniformes.push(registro);
  }
  await supaSync('pedidosUniformes', registro);
  await guardarPrendasDelPedido(registro.id);
  await subirConstanciaPolicialSiCorresponde(registro, legajo);
  cerrarModal('modal-uni-pedido');
  renderPendientesUniformes();
  toast('💾 Borrador guardado');
}

export async function elevarPedidoDesdeModalUniforme() {
  const legajo = legajoPorMatch($('up2-operario').value);
  if (!validarPedido(legajo)) return;
  const p = await armarObjetoPedido(legajo, 'Borrador');
  let registro;
  if (_pedidoEditandoId) {
    registro = getPedidoById(_pedidoEditandoId);
    Object.assign(registro, p, { fechaSolicitud: registro.fechaSolicitud });
  } else {
    registro = p;
    if (!DB.pedidosUniformes) DB.pedidosUniformes = [];
    DB.pedidosUniformes.push(registro);
  }
  await supaSync('pedidosUniformes', registro);
  await guardarPrendasDelPedido(registro.id);
  await subirConstanciaPolicialSiCorresponde(registro, legajo);
  cerrarModal('modal-uni-pedido');
  await elevarPedido(registro.id);
  renderPendientesUniformes();
}

export function elevarPedidoUniformePorId(idLocal) { elevarPedido(idLocal).then(renderPendientesUniformes); }

export function abrirCancelarPedidoUniforme(idLocal) {
  abrirModalInput({ titulo: 'Cancelar pedido', etiqueta: 'Motivo (opcional)', obligatorio: false }, (motivo) => {
    cancelarPedido(idLocal, motivo).then(renderPendientesUniformes);
  });
}

// ========== ACCIONES DE FILA (wrappers sobre flujo.js) ==========

export function autorizarPedidoUniformePorId(idLocal) { autorizarPedido(idLocal).then(renderPendientesUniformes); }

export function abrirRechazoPedidoUniforme(idLocal) {
  abrirModalInput({ titulo: 'Rechazar pedido', etiqueta: 'Motivo del rechazo (obligatorio)' }, (motivo) => {
    rechazarPedido(idLocal, motivo).then(renderPendientesUniformes);
  });
}

export function logisticaRecibePorId(idLocal) { logisticaRecibe(idLocal).then(renderPendientesUniformes); }
export function logisticaEnviaPorId(idLocal) { logisticaEnvia(idLocal).then(renderPendientesUniformes); }
export function rrhhConfirmaRecepcionPorId(idLocal) { rrhhConfirmaRecepcionLogistica(idLocal).then(renderPendientesUniformes); }
export function rrhhMarcaRetiroPorId(idLocal) { rrhhMarcaRetiroSupervisor(idLocal).then(renderPendientesUniformes); }
export function supervisorConfirmaRetiroPorId(idLocal) { supervisorConfirmaRetiro(idLocal).then(renderPendientesUniformes); }
export function reactivarDesdeVencidoPorId(idLocal) { reactivarDesdeVencido(idLocal).then(renderPendientesUniformes); }

export function confirmarDevolucionConstanciaYViejo(idLocal) {
  if (!confirm('¿Confirmás que devolviste la constancia firmada y el uniforme viejo?')) return;
  supervisorDevuelveConstanciaYViejo(idLocal).then(renderPendientesUniformes);
}

// ---- Entrega con firma (8 -> 9): modal con adjunto obligatorio ----

let _pedidoEntregandoId = null;

function ensureModalEntregaFirma() {
  if ($('modal-uni-entrega-firma')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-uni-entrega-firma';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>👕 Entregar con firma</h3><button class="btn-close" onclick="cerrarModal('modal-uni-entrega-firma')">×</button></div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--texto-suave);">Subí la foto de la constancia de entrega firmada por el operario. A partir de acá empieza a correr el plazo de 15 días para devolver la constancia + el uniforme viejo.</p>
        <div class="form-group"><label>Constancia firmada (foto/PDF) *</label><input type="file" id="uef-adjunto" accept="application/pdf,image/jpeg,image/png"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-uni-entrega-firma')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarEntregaConFirma()">✅ Confirmar entrega</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirEntregaConFirma(idLocal) {
  _pedidoEntregandoId = idLocal;
  ensureModalEntregaFirma();
  $('uef-adjunto').value = '';
  abrirModal('modal-uni-entrega-firma');
}

export async function confirmarEntregaConFirma() {
  const p = getPedidoById(_pedidoEntregandoId);
  if (!p) return;
  const file = $('uef-adjunto')?.files?.[0];
  if (!file) { toast('⚠️ Adjuntá la foto de la constancia firmada'); return; }
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(p.legajoIdLocal));
  if (!legajo?.dni) { toast('⚠️ El legajo del operario no tiene DNI cargado — no se puede subir el adjunto'); return; }
  let adjunto;
  try {
    adjunto = await subirAdjunto({ dni: legajo.dni, etapa: 'uniformes', tipo: 'constancia-uniforme', file });
  } catch (e) {
    toast('⚠️ No se pudo subir la constancia: ' + e.message);
    return;
  }
  const ok = await supervisorEntregaConFirma(p.id, legajo, adjunto);
  if (ok) { cerrarModal('modal-uni-entrega-firma'); renderPendientesUniformes(); }
}

// ---- Confirmar cierre (10 -> 11): checklist de prendas faltantes ----

let _pedidoCerrandoId = null;

function ensureModalCierre() {
  if ($('modal-uni-cierre')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-uni-cierre';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>✅ Confirmar cierre</h3><button class="btn-close" onclick="cerrarModal('modal-uni-cierre')">×</button></div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--texto-suave);">Marcá las prendas del kit viejo que NO se devolvieron (si falta alguna, se genera un descuento de una sola cuota).</p>
        <div id="uc-checklist"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-uni-cierre')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarCierrePedidoUniforme()">✅ Cerrar pedido</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirConfirmarCierrePedido(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p) return;
  _pedidoCerrandoId = idLocal;
  ensureModalCierre();
  $('uc-checklist').innerHTML = prendasDelPedido(p.id).map(pr => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;">
      <input type="checkbox" class="uc-check" data-prenda="${pr.prenda}"> Faltó devolver: ${pr.prenda} (${pr.talle})
    </label>`).join('') || '<p style="opacity:.5;">Este pedido no tiene prendas cargadas.</p>';
  abrirModal('modal-uni-cierre');
}

export function confirmarCierrePedidoUniforme() {
  const faltantes = Array.from(document.querySelectorAll('.uc-check')).filter(c => c.checked).map(c => c.dataset.prenda);
  rrhhConfirmaCierre(_pedidoCerrandoId, faltantes).then(() => { cerrarModal('modal-uni-cierre'); renderPendientesUniformes(); });
}

// ---- Descuento por incumplimiento (14 -> 15) ----

export function abrirAplicarDescuentoIncumplimiento(idLocal) {
  abrirModalInput({ titulo: 'Aplicar descuento por incumplimiento', etiqueta: 'Motivo (obligatorio)' }, (motivo) => {
    abrirModalInput({ titulo: 'Monto del descuento', etiqueta: 'Monto en pesos', placeholder: 'Ej: 15000' }, (montoTexto) => {
      const monto = parseFloat(montoTexto);
      aplicarDescuentoIncumplimiento(idLocal, motivo, monto).then(renderPendientesUniformes);
    });
  });
}

// ========== MODAL DE DETALLE (solo lectura, con timeline) ==========

function ensureModalDetalle() {
  if ($('modal-uni-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-uni-detalle';
  m.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header"><h3>👕 Detalle del pedido</h3><button class="btn-close" onclick="cerrarModal('modal-uni-detalle')">×</button></div>
      <div class="modal-body" id="ud-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-uni-detalle')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetallePedidoUniforme(idLocal) {
  const p = getPedidoById(idLocal);
  if (!p) return;
  ensureModalDetalle();
  const eventos = (DB.pedidoUniformeEventos || []).filter(e => e.pedidoIdLocal === String(p.id).slice(-9)).sort((a, b) => new Date(a.ejecutadoEn) - new Date(b.ejecutadoEn));
  $('ud-cuerpo').innerHTML = `
    <div class="info-item"><div class="key">Operario</div><div class="val">${p.nombreOperario} — N° ${p.nroSocio} — ${p.servicio}</div></div>
    <div class="info-item"><div class="key">Supervisor</div><div class="val">${p.supervisorAsignado} (solicitado por ${p.solicitadoPor}, origen ${p.origen})</div></div>
    <div class="info-item"><div class="key">Motivo</div><div class="val">${p.motivo} ${p.conDescuento ? '(con descuento)' : '(sin descuento)'}</div></div>
    <div class="info-item"><div class="key">Prendas</div><div class="val">${resumenPrendas(p.id)}</div></div>
    <div class="info-item"><div class="key">Estado actual</div><div class="val"><span class="badge ${ESTADO_BADGE[p.estado] || 'badge-gris'}">${p.estado}</span></div></div>
    ${p.motivoRechazo ? `<div class="info-item"><div class="key">Motivo rechazo</div><div class="val">${p.motivoRechazo}</div></div>` : ''}
    ${p.motivoCancelacion ? `<div class="info-item"><div class="key">Motivo cancelación</div><div class="val">${p.motivoCancelacion}</div></div>` : ''}
    ${p.observaciones ? `<div class="info-item"><div class="key">Observaciones</div><div class="val">${p.observaciones}</div></div>` : ''}
    <div class="form-section">Historial</div>
    ${eventos.map(e => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--borde);">${(e.ejecutadoEn || '').slice(0, 16).replace('T', ' ')} — ${e.ejecutadoPor}: ${e.estadoDesde ? e.estadoDesde + ' → ' : ''}${e.estadoHasta}${e.observaciones ? ' (' + e.observaciones + ')' : ''}</div>`).join('') || '<p style="opacity:.5;">Sin eventos registrados</p>'}
  `;
  abrirModal('modal-uni-detalle');
}

// ========== AUTOMÁTICO DESDE ALTAS ==========
// Redirige el hook YA EXISTENTE (llamado desde confirmarAlta() en
// src/modules/altas/altas.js — no se toca ese archivo) para crear un
// Borrador de pedidos_uniformes en vez de una fila de la tabla vieja
// `uniformes`.
export async function crearEntregaUniformeDesdeAlta(legajo) {
  const p = {
    id: Date.now(),
    legajoIdLocal: String(legajo.nro),
    nroSocio: String(legajo.nro),
    nombreOperario: legajo.nombre,
    servicio: legajo.servicio || '',
    supervisorAsignado: legajo.supervisor || '',
    origen: 'RRHH - Ingreso',
    solicitadoPor: currentUser?.nombre || '',
    fechaSolicitud: new Date().toISOString(),
    motivo: 'Ingreso',
    conDescuento: false,
    observaciones: 'Generado automáticamente al dar de alta — completar prendas del kit inicial.',
    estado: 'Borrador',
  };
  if (!DB.pedidosUniformes) DB.pedidosUniformes = [];
  DB.pedidosUniformes.push(p);
  await supaSync('pedidosUniformes', p);

  // Pre-cargar Ambo/Zapatos si el alta ya trajo esos talles.
  const prendasIniciales = [];
  if (legajo.ambo) prendasIniciales.push({ prenda: 'Ambo', talle: legajo.ambo, cantidad: 1 });
  if (legajo.calzado) prendasIniciales.push({ prenda: 'Zapatos', talle: String(legajo.calzado), cantidad: 1 });
  for (const pr of prendasIniciales) {
    const obj = { id: Date.now() + Math.floor(Math.random() * 1000), pedidoIdLocal: idLocalTrunc(p.id), ...pr };
    if (!DB.pedidoUniformePrendas) DB.pedidoUniformePrendas = [];
    DB.pedidoUniformePrendas.push(obj);
    await supaSync('pedidoUniformePrendas', obj);
  }
  renderPendientesUniformes();
}
