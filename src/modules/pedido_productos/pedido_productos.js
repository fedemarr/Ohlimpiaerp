// Módulo Pedido de Productos (Logística) — diseño Lautaro + Claude web,
// 11/07/2026 (docs/MODULO_PEDIDO_PRODUCTOS.md), sql/v085.
//
// Reemplaza la planilla Excel de pedido mensual de productos/insumos por
// servicio. Flujo de estados: borrador (supervisor) → cerrado_supervisor →
// en_auditoria (auditor ajusta) → autorizado → en_compra → entregado
// (Logística).
//
// "Auditor interno" no tiene perfil propio en el sistema todavía — la
// etapa de auditoría queda dentro del perfil Logística (ver comentario en
// PERFILES, state.js). No se inventó un perfil nuevo sin que lo pida el
// negocio.

import { DB, currentUser } from '@shared/state.js';
import { $, hoyStr } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getSupervisorDeCodigo } from '@modules/servicios_supervisor/servicios_supervisor.js';

const LABEL_TIPO_USO = {
  apertura: 'Apertura de servicio',
  tratamiento_piso: 'Tratamiento de piso',
  con_autorizacion: 'Con autorización',
  normal: 'Normal',
};
const COLOR_TIPO_USO = { apertura: '#f59e0b', tratamiento_piso: '#7c3aed', con_autorizacion: '#0ea5e9', normal: '#6b7280' };

function _id(prefijo) { return prefijo + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }); }

function getProductoPP(id) { return (DB.ppProductos || []).find(p => String(p.id) === String(id)); }
function getPedidoPP(id) { return (DB.ppPedidos || []).find(p => String(p.id) === String(id)); }
function getPeriodoPP(id) { return (DB.ppPeriodos || []).find(p => String(p.id) === String(id)); }
function getProveedorPP(id) { return (DB.proveedores || []).find(p => String(p.id) === String(id) && !p.anulado); }
function itemsDePedido(pedidoId) { return (DB.ppItems || []).filter(i => String(i.pedidoIdLocal) === String(pedidoId) && !i.anulado); }

function precioVigente(productoId, fechaISO = hoyStr()) {
  const precios = (DB.ppPrecios || []).filter(pr => String(pr.productoIdLocal) === String(productoId) && !pr.anulado);
  const vigente = precios.find(pr => pr.vigenciaDesde <= fechaISO && (!pr.vigenciaHasta || pr.vigenciaHasta >= fechaISO));
  return vigente ? Number(vigente.costoUnit) || 0 : 0;
}
function cantEfectiva(item) { return item.cantAutorizada != null ? item.cantAutorizada : item.cantSolicitada; }
// Antes del cierre no hay costo_congelado todavía — se usa el precio
// vigente en vivo para que el semáforo se pueda ver mientras se carga.
function costoAplicable(item) { return item.costoCongelado > 0 ? item.costoCongelado : precioVigente(item.productoIdLocal); }

function totalPedidoPP(pedidoId) {
  return itemsDePedido(pedidoId).reduce((s, i) => s + cantEfectiva(i) * costoAplicable(i), 0);
}
function desglosePorCategoriaPP(pedidoId) {
  const grupos = { apertura: 0, tratamiento_piso: 0, con_autorizacion: 0, normal: 0 };
  itemsDePedido(pedidoId).forEach(i => {
    const prod = getProductoPP(i.productoIdLocal);
    const tipo = prod?.tipoUso || 'normal';
    grupos[tipo] = (grupos[tipo] || 0) + cantEfectiva(i) * costoAplicable(i);
  });
  return grupos;
}

function badgeTipoUsoPP(tipo) {
  return `<span class="badge" style="background:${COLOR_TIPO_USO[tipo] || '#6b7280'};color:white;">${LABEL_TIPO_USO[tipo] || tipo}</span>`;
}
function badgeEstadoPedidoPP(estado) {
  const map = {
    borrador: ['#f59e0b', 'Borrador'], cerrado_supervisor: ['#0ea5e9', 'Cerrado (en cola)'],
    en_auditoria: ['#7c3aed', 'En auditoría'], autorizado: ['#16a34a', 'Autorizado'],
    en_compra: ['#2563eb', 'En compra'], entregado: ['#059669', 'Entregado'],
  };
  const [color, label] = map[estado] || ['#6b7280', estado];
  return `<span class="badge" style="background:${color};color:white;">${label}</span>`;
}
function badgeEstadoPeriodoPP(estado) {
  return estado === 'abierto'
    ? '<span class="badge" style="background:#16a34a;color:white;">Abierto</span>'
    : '<span class="badge" style="background:#6b7280;color:white;">Cerrado</span>';
}

// Semáforo del 6% — informativo, no bloqueante (§2.1 del diseño): muestra
// el desglose por categoría para que el auditor vea de un vistazo cuánto
// del exceso es esperable (Apertura/Tratamiento de piso).
function renderSemaforoHTML(pedido) {
  const total = totalPedidoPP(pedido.id);
  const tope = (pedido.facturacionNeta || 0) * (pedido.porcentajeTope || 0.06);
  const pct = pedido.facturacionNeta > 0 ? (total / pedido.facturacionNeta * 100) : 0;
  const excede = tope > 0 && total > tope;
  const color = !pedido.facturacionNeta ? '#6b7280' : (excede ? '#dc2626' : '#16a34a');
  const desglose = desglosePorCategoriaPP(pedido.id);
  const excesoEsperable = (desglose.apertura || 0) + (desglose.tratamiento_piso || 0);
  const filas = Object.keys(LABEL_TIPO_USO).map(k => `<div style="display:flex;justify-content:space-between;font-size:11.5px;padding:2px 0;">
    <span>${LABEL_TIPO_USO[k]}</span><span>${_money(desglose[k] || 0)}</span>
  </div>`).join('');
  return `
    <div style="padding:12px 14px;border-radius:var(--radio);background:${color}18;border:1px solid ${color}55;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">
        <strong style="color:${color};font-size:14px;">${_money(total)} ${pedido.facturacionNeta ? `(${pct.toFixed(1)}% de la facturación)` : ''}</strong>
        ${pedido.facturacionNeta
          ? `<span style="font-size:11.5px;color:var(--texto-suave);">Tope ${(pedido.porcentajeTope * 100).toFixed(0)}%: ${_money(tope)}</span>`
          : '<span style="font-size:11.5px;color:var(--rojo);">Sin facturación cargada — no se puede calcular el %</span>'}
      </div>
      ${excede ? `<div style="font-size:11.5px;color:${color};margin-bottom:6px;">⚠️ Supera el tope informativo${excesoEsperable > 0 ? ` — ${_money(excesoEsperable)} corresponden a Apertura/Tratamiento de piso (esperable)` : ''}.</div>` : ''}
      ${filas}
    </div>`;
}

// ========== PROVEEDORES DEMO (seed si la tabla está vacía) ==========
function _seedProveedoresDemo() {
  if ((DB.proveedores || []).length > 0) return;
  const demo = [
    { nombre: 'THAMES', codigo: 'PROV-001', estado: 'activo', contacto: '' },
    { nombre: 'DIVERSEY', codigo: 'PROV-002', estado: 'activo', contacto: '' },
  ];
  demo.forEach(d => {
    const prov = { id: _id('PROV'), ...d, anulado: false };
    DB.proveedores.push(prov);
    supaSync('proveedores', prov);
  });
}

// ========== PANTALLA PRINCIPAL / TABS ==========

export function renderPedidoProductos() {
  _seedProveedoresDemo();
  const esLogistica = ['Administrador total', 'Logística'].includes(currentUser?.perfil);
  const esSupervisor = currentUser?.perfil === 'Supervisor';
  ['pp-tab-btn-catalogo', 'pp-tab-btn-periodos', 'pp-tab-btn-auditoria', 'pp-tab-btn-compras'].forEach(id => {
    const el = $(id); if (el) el.style.display = esLogistica ? '' : 'none';
  });
  const btnMis = $('pp-tab-btn-mispedidos'); if (btnMis) btnMis.style.display = esSupervisor ? '' : 'none';
  poblarSelectsPeriodoPP();
  const tabInicial = (esSupervisor && !esLogistica) ? 'mispedidos' : 'catalogo';
  tabPP(tabInicial, $('pp-tab-btn-' + tabInicial));
}

export function tabPP(tab, btn) {
  document.querySelectorAll('#screen-pedido_productos .tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#screen-pedido_productos .tab-btn').forEach(b => b.classList.remove('active'));
  const el = $('pp-tab-' + tab); if (el) el.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'catalogo') renderCatalogoPP();
  if (tab === 'periodos') renderPeriodosPP();
  if (tab === 'mispedidos') renderMisPedidosPP();
  if (tab === 'auditoria') renderAuditoriaPP();
  if (tab === 'compras') renderComprasPP();
}

export function poblarSelectsPeriodoPP() {
  const periodos = (DB.ppPeriodos || []).filter(p => !p.anulado).sort((a, b) => b.mes.localeCompare(a.mes));
  ['pp-sup-periodo-sel', 'pp-aud-periodo-sel', 'pp-compra-periodo-sel'].forEach(id => {
    const sel = $(id); if (!sel) return;
    const actual = sel.value;
    sel.innerHTML = periodos.map(p => `<option value="${p.id}">${p.mes}${p.estado === 'cerrado' ? ' (cerrado)' : ''}</option>`).join('');
    if (actual && periodos.some(p => String(p.id) === actual)) sel.value = actual;
  });
  _poblarFiltroProveedorPP();
}

function _poblarFiltroProveedorPP() {
  const sel = $('pp-cat-filtro-prov'); if (!sel) return;
  const actual = sel.value;
  const provs = (DB.proveedores || []).filter(p => !p.anulado).sort((a, b) => a.nombre.localeCompare(b.nombre));
  sel.innerHTML = '<option value="">Todos los proveedores</option>' + provs.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  if (actual && provs.some(p => String(p.id) === actual)) sel.value = actual;
}

// ========== CATÁLOGO ==========

export function renderCatalogoPP() {
  const tbody = $('tbody-pp-catalogo'); if (!tbody) return;
  const q = ($('pp-cat-buscar') || { value: '' }).value.toLowerCase();
  const filtroTipo = ($('pp-cat-filtro-tipo') || { value: '' }).value;
  const filtroProv = ($('pp-cat-filtro-prov') || { value: '' }).value;
  const rows = (DB.ppProductos || []).filter(p => !p.anulado)
    .filter(p => !q || p.descripcion.toLowerCase().includes(q) || (p.codigoMonica || '').toLowerCase().includes(q))
    .filter(p => !filtroTipo || p.tipoUso === filtroTipo)
    .filter(p => !filtroProv || String(p.proveedorIdLocal || '') === String(filtroProv))
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin productos en el catálogo.</td></tr>'; return; }
  tbody.innerHTML = rows.map(p => {
    const costo = precioVigente(p.id);
    const prov = p.proveedorIdLocal ? getProveedorPP(p.proveedorIdLocal) : null;
    return `<tr>
      <td style="padding:6px 12px;border:1px solid var(--borde);">${p.codigoMonica || '—'}</td>
      <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:500;">${p.descripcion}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${prov ? `<span class="badge" style="background:#0ea5e9;color:white;font-size:10.5px;">${prov.nombre}</span>` : '<span style="color:var(--texto-suave);">—</span>'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badgeTipoUsoPP(p.tipoUso)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${costo ? _money(costo) : '<span style="color:var(--rojo);">sin precio</span>'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;white-space:nowrap;">
        <button class="btn btn-xs" onclick="abrirEditarProductoPP('${p.id}')">Editar</button>
        <button class="btn btn-xs" onclick="abrirNuevoPrecioPP('${p.id}')">💲 Precio</button>
        <button class="btn btn-xs btn-secondary" onclick="anularProductoPP('${p.id}')">Anular</button>
      </td>
    </tr>`;
  }).join('');
}

let _ppProductoEditandoId = null;
function _poblarSelectProveedorPP() {
  const sel = $('pp-prod-proveedor'); if (!sel) return;
  const provs = (DB.proveedores || []).filter(p => !p.anulado).sort((a, b) => a.nombre.localeCompare(b.nombre));
  sel.innerHTML = '<option value="">Sin proveedor</option>' + provs.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
}
export function abrirNuevoProductoPP() {
  _ppProductoEditandoId = null;
  ensureModalProductoPP(); _poblarSelectProveedorPP();
  $('pp-prod-descripcion').value = ''; $('pp-prod-codigo').value = ''; $('pp-prod-tipo-uso').value = 'normal'; $('pp-prod-costo-inicial').value = ''; $('pp-prod-proveedor').value = '';
  $('pp-prod-modal-titulo').textContent = 'Nuevo producto';
  abrirModal('modal-pp-producto');
}
export function abrirEditarProductoPP(id) {
  const p = getProductoPP(id); if (!p) return;
  _ppProductoEditandoId = id;
  ensureModalProductoPP(); _poblarSelectProveedorPP();
  $('pp-prod-descripcion').value = p.descripcion; $('pp-prod-codigo').value = p.codigoMonica || ''; $('pp-prod-tipo-uso').value = p.tipoUso || 'normal';
  $('pp-prod-proveedor').value = p.proveedorIdLocal || '';
  $('pp-prod-costo-inicial').value = '';
  $('pp-prod-modal-titulo').textContent = 'Editar producto';
  abrirModal('modal-pp-producto');
}
function ensureModalProductoPP() {
  if ($('modal-pp-producto')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-producto';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3 id="pp-prod-modal-titulo">Nuevo producto</h3><button class="btn-close" onclick="cerrarModal('modal-pp-producto')">×</button></div>
      <div class="modal-body">
        <label style="font-size:12px;font-weight:600;">Descripción</label>
        <input type="text" id="pp-prod-descripcion" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 10px;">
        <label style="font-size:12px;font-weight:600;">Código Mónica (opcional)</label>
        <input type="text" id="pp-prod-codigo" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 10px;">
        <label style="font-size:12px;font-weight:600;">Tipo de uso</label>
        <select id="pp-prod-tipo-uso" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 10px;">
          <option value="normal">Normal</option>
          <option value="apertura">Apertura de servicio</option>
          <option value="tratamiento_piso">Tratamiento de piso</option>
          <option value="con_autorizacion">Con autorización</option>
        </select>
        <label style="font-size:12px;font-weight:600;">Proveedor</label>
        <select id="pp-prod-proveedor" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin:4px 0 10px;">
          <option value="">Sin proveedor</option>
        </select>
        <label style="font-size:12px;font-weight:600;">Costo unitario inicial (opcional, vigente desde hoy)</label>
        <input type="number" id="pp-prod-costo-inicial" min="0" step="0.01" style="width:100%;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);margin-top:4px;">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-producto')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarProductoPP()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
export function guardarProductoPP() {
  const descripcion = ($('pp-prod-descripcion').value || '').trim();
  if (!descripcion) { toast('⚠️ Falta la descripción'); return; }
  const codigoMonica = ($('pp-prod-codigo').value || '').trim();
  const tipoUso = $('pp-prod-tipo-uso').value;
  const proveedorIdLocal = $('pp-prod-proveedor').value || null;
  const costoInicial = parseFloat($('pp-prod-costo-inicial').value) || 0;
  let prod;
  if (_ppProductoEditandoId) {
    prod = getProductoPP(_ppProductoEditandoId); if (!prod) return;
    prod.descripcion = descripcion; prod.codigoMonica = codigoMonica; prod.tipoUso = tipoUso; prod.proveedorIdLocal = proveedorIdLocal;
  } else {
    prod = { id: _id('PPP'), descripcion, codigoMonica, tipoUso, proveedorIdLocal, anulado: false };
    if (!DB.ppProductos) DB.ppProductos = [];
    DB.ppProductos.push(prod);
  }
  supaSync('ppProductos', prod);
  if (costoInicial > 0) {
    const precio = { id: _id('PPR'), productoIdLocal: prod.id, costoUnit: costoInicial, vigenciaDesde: hoyStr(), vigenciaHasta: null, anulado: false };
    if (!DB.ppPrecios) DB.ppPrecios = [];
    DB.ppPrecios.push(precio);
    supaSync('ppPrecios', precio);
  }
  cerrarModal('modal-pp-producto');
  renderCatalogoPP();
  toast(`✓ ${descripcion} guardado`);
}
export function anularProductoPP(id) {
  const p = getProductoPP(id); if (!p) return;
  p.anulado = true;
  supaSync('ppProductos', p);
  renderCatalogoPP();
  toast(`${p.descripcion} anulado del catálogo`);
}

// ========== PRECIOS (vigencia temporal, A.6) ==========

let _ppPrecioProductoId = null;
export function abrirNuevoPrecioPP(productoId) {
  const prod = getProductoPP(productoId); if (!prod) return;
  _ppPrecioProductoId = productoId;
  ensureModalPrecioPP();
  renderModalPrecioPP();
  $('pp-precio-nuevo-monto').value = '';
  $('pp-precio-nuevo-desde').value = hoyStr();
  abrirModal('modal-pp-precio');
}
function ensureModalPrecioPP() {
  if ($('modal-pp-precio')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-precio';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3 id="pp-precio-titulo">Precios</h3><button class="btn-close" onclick="cerrarModal('modal-pp-precio')">×</button></div>
      <div class="modal-body">
        <div id="pp-precio-historial" style="margin-bottom:14px;max-height:220px;overflow-y:auto;"></div>
        <div style="border-top:1px solid var(--borde);padding-top:12px;">
          <strong style="font-size:12.5px;">Nuevo aumento (cierra el precio vigente y arranca uno nuevo — no toca el pasado)</strong>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <input type="number" id="pp-precio-nuevo-monto" placeholder="Costo unitario" min="0" step="0.01" style="flex:1;min-width:120px;padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);">
            <input type="date" id="pp-precio-nuevo-desde" style="padding:7px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);">
            <button class="btn btn-primary btn-sm" onclick="guardarNuevoPrecioPP()">Agregar</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-precio')">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function renderModalPrecioPP() {
  const prod = getProductoPP(_ppPrecioProductoId); if (!prod) return;
  $('pp-precio-titulo').textContent = `Precios — ${prod.descripcion}`;
  const precios = (DB.ppPrecios || []).filter(p => String(p.productoIdLocal) === String(prod.id) && !p.anulado).sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
  if (!precios.length) { $('pp-precio-historial').innerHTML = '<p style="font-size:12px;color:var(--texto-suave);">Sin precios cargados todavía.</p>'; return; }
  $('pp-precio-historial').innerHTML = precios.map(p => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--borde);font-size:12.5px;">
      <span>${_money(p.costoUnit)} <span style="color:var(--texto-suave);">— desde ${p.vigenciaDesde}${p.vigenciaHasta ? ` hasta ${p.vigenciaHasta}` : ' (vigente)'}</span></span>
      <button class="btn btn-xs" onclick="corregirPrecioPP('${p.id}')">✏️ Corregir</button>
    </div>`).join('');
}
export function guardarNuevoPrecioPP() {
  const prod = getProductoPP(_ppPrecioProductoId); if (!prod) return;
  const monto = parseFloat($('pp-precio-nuevo-monto').value);
  const desde = $('pp-precio-nuevo-desde').value;
  if (!monto || monto <= 0) { toast('⚠️ Falta el costo unitario'); return; }
  if (!desde) { toast('⚠️ Falta la fecha de vigencia'); return; }
  const vigenteActual = (DB.ppPrecios || []).find(p => String(p.productoIdLocal) === String(prod.id) && !p.anulado && !p.vigenciaHasta);
  if (vigenteActual) {
    const diaAntes = new Date(desde + 'T12:00:00'); diaAntes.setDate(diaAntes.getDate() - 1);
    vigenteActual.vigenciaHasta = diaAntes.toISOString().slice(0, 10);
    supaSync('ppPrecios', vigenteActual);
  }
  const nuevo = { id: _id('PPR'), productoIdLocal: prod.id, costoUnit: monto, vigenciaDesde: desde, vigenciaHasta: null, anulado: false };
  if (!DB.ppPrecios) DB.ppPrecios = [];
  DB.ppPrecios.push(nuevo);
  supaSync('ppPrecios', nuevo);
  renderModalPrecioPP();
  renderCatalogoPP();
  toast(`✓ Nuevo precio de ${prod.descripcion} desde ${desde}`);
}
export function corregirPrecioPP(precioId) {
  const precio = (DB.ppPrecios || []).find(p => String(p.id) === String(precioId)); if (!precio) return;
  const nuevoMonto = prompt('Corregir costo unitario (error de carga, no un aumento):', precio.costoUnit);
  if (nuevoMonto == null) return;
  const n = parseFloat(nuevoMonto);
  if (isNaN(n) || n < 0) { toast('⚠️ Valor inválido'); return; }
  precio.costoUnit = n;
  supaSync('ppPrecios', precio);
  renderModalPrecioPP();
  renderCatalogoPP();
  toast('✓ Precio corregido');
}

// ========== PERÍODOS ==========

export function renderPeriodosPP() {
  const tbody = $('tbody-pp-periodos'); if (!tbody) return;
  const rows = (DB.ppPeriodos || []).filter(p => !p.anulado).sort((a, b) => b.mes.localeCompare(a.mes));
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="5" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin períodos habilitados todavía.</td></tr>'; return; }
  tbody.innerHTML = rows.map(p => {
    const pedidosDelPeriodo = (DB.ppPedidos || []).filter(x => x.periodoIdLocal === p.id && !x.anulado);
    const cerrados = pedidosDelPeriodo.filter(x => x.estado !== 'borrador').length;
    return `<tr>
      <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:600;">${p.mes}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badgeEstadoPeriodoPP(p.estado)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${pedidosDelPeriodo.length}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${cerrados}/${pedidosDelPeriodo.length}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
        ${p.estado === 'abierto' ? `<button class="btn btn-xs btn-secondary" onclick="cerrarPeriodoPP('${p.id}')">Cerrar período</button>` : '—'}
      </td>
    </tr>`;
  }).join('');
}

export function abrirPeriodoPP() {
  const mes = ($('pp-periodo-nuevo') || { value: '' }).value;
  if (!mes) { toast('⚠️ Elegí el mes'); return; }
  if ((DB.ppPeriodos || []).some(p => p.mes === mes && !p.anulado)) { toast('⚠️ Ese período ya existe'); return; }
  const periodo = { id: _id('PPPER'), mes, estado: 'abierto', abiertoPor: currentUser?.nombre || '', abiertoEn: new Date().toISOString(), cerradoEn: null, anulado: false };
  if (!DB.ppPeriodos) DB.ppPeriodos = [];
  DB.ppPeriodos.push(periodo);
  supaSync('ppPeriodos', periodo);

  // Nace un pedido en Borrador para cada servicio Operativo (§3 del diseño).
  const activos = (DB.objetivos || []).filter(o => o.estado === 'Operativo');
  let creados = 0;
  activos.forEach(o => {
    const facturacionNeta = (typeof window !== 'undefined' && window.calcularFacturacionMensualObjetivo) ? (window.calcularFacturacionMensualObjetivo(o) || 0) : 0;
    const supervisor = o.supervisorAsignado || getSupervisorDeCodigo(o.codigo) || '';
    const pedido = {
      id: _id('PPPED'), periodoIdLocal: periodo.id, servicioCodigo: o.codigo,
      facturacionNeta, porcentajeTope: 0.06, estado: 'borrador', tipoPedido: 'mensual',
      supervisor, anulado: false,
    };
    if (!DB.ppPedidos) DB.ppPedidos = [];
    DB.ppPedidos.push(pedido);
    supaSync('ppPedidos', pedido);
    creados++;
  });
  if ($('pp-periodo-nuevo')) $('pp-periodo-nuevo').value = '';
  poblarSelectsPeriodoPP();
  renderPeriodosPP();
  toast(`✓ Período ${mes} habilitado — ${creados} pedido(s) de servicio creado(s)`);
  if (!activos.length) toast('⚠️ No hay servicios en estado Operativo en Objetivos — no se creó ningún pedido', 8000);
}

export function cerrarPeriodoPP(id) {
  const periodo = getPeriodoPP(id); if (!periodo) return;
  if (periodo.estado === 'cerrado') { toast('Ya está cerrado'); return; }
  periodo.estado = 'cerrado'; periodo.cerradoEn = new Date().toISOString();
  supaSync('ppPeriodos', periodo);
  poblarSelectsPeriodoPP();
  renderPeriodosPP();
  toast(`Período ${periodo.mes} cerrado — los supervisores ya no pueden cargar`);
}

// ========== MIS PEDIDOS (Supervisor) ==========

export function renderMisPedidosPP() {
  const tbody = $('tbody-pp-mispedidos'); if (!tbody) return;
  const periodoId = ($('pp-sup-periodo-sel') || { value: '' }).value;
  if (!periodoId) { tbody.innerHTML = '<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">No hay ningún período habilitado todavía.</td></tr>'; return; }
  const misCodigos = new Set((DB.serviciosSupervisor || []).filter(s => s.supervisor === currentUser?.nombre).map(s => s.codigo));
  const rows = (DB.ppPedidos || []).filter(p => !p.anulado && p.periodoIdLocal === periodoId && misCodigos.has(p.servicioCodigo));
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">No hay servicios tuyos en este período (revisá que estés cargado como supervisor en Configuración → Servicios).</td></tr>'; return; }
  tbody.innerHTML = rows.map(p => {
    const obj = (DB.objetivos || []).find(o => o.codigo === p.servicioCodigo);
    const total = totalPedidoPP(p.id);
    const pct = p.facturacionNeta > 0 ? (total / p.facturacionNeta * 100) : 0;
    return `<tr>
      <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:500;">${obj ? obj.nombre : p.servicioCodigo}<br><span style="font-size:10px;color:var(--texto-suave);">${p.servicioCodigo}</span></td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badgeEstadoPedidoPP(p.estado)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(total)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;${pct > 100 ? 'color:var(--rojo);font-weight:600;' : ''}">${p.facturacionNeta > 0 ? pct.toFixed(1) + '%' : '—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;white-space:nowrap;">
        ${p.estado === 'borrador'
          ? `<button class="btn btn-xs btn-primary" onclick="abrirCargaPedidoPP('${p.id}')">Cargar</button> <button class="btn btn-xs btn-secondary" onclick="cerrarPedidoSupervisorPP('${p.id}')">Cerrar</button>`
          : `<button class="btn btn-xs" onclick="abrirCargaPedidoPP('${p.id}')">Ver</button>`}
      </td>
    </tr>`;
  }).join('');
}

let _ppPedidoModalId = null;
export function abrirCargaPedidoPP(pedidoId) {
  const pedido = getPedidoPP(pedidoId); if (!pedido) return;
  _ppPedidoModalId = pedidoId;
  ensureModalCargaPP();
  renderModalCargaPP();
  abrirModal('modal-pp-carga');
}
function ensureModalCargaPP() {
  if ($('modal-pp-carga')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-carga';
  m.innerHTML = `
    <div class="modal" style="max-width:760px;">
      <div class="modal-header"><h3 id="pp-carga-titulo">Pedido de productos</h3><button class="btn-close" onclick="cerrarModal('modal-pp-carga')">×</button></div>
      <div class="modal-body">
        <div id="pp-carga-resumen" style="margin-bottom:14px;"></div>
        <div style="max-height:420px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead><tr style="background:#374151;color:white;">
              <th style="padding:6px 10px;text-align:left;">Producto</th>
              <th style="padding:6px 8px;text-align:center;">Tipo de uso</th>
              <th style="padding:6px 8px;text-align:right;">Costo unit.</th>
              <th style="padding:6px 8px;text-align:center;width:110px;">Cantidad</th>
              <th style="padding:6px 8px;text-align:right;">Subtotal</th>
            </tr></thead>
            <tbody id="pp-carga-tbody"></tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-carga')">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function renderModalCargaPP() {
  const pedido = getPedidoPP(_ppPedidoModalId); if (!pedido) return;
  const obj = (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo);
  const periodo = getPeriodoPP(pedido.periodoIdLocal);
  const soloLectura = pedido.estado !== 'borrador';
  $('pp-carga-titulo').textContent = `${obj ? obj.nombre : pedido.servicioCodigo}${periodo ? ' — ' + periodo.mes : ''}`;
  const productos = (DB.ppProductos || []).filter(p => !p.anulado).sort((a, b) => (a.tipoUso || '').localeCompare(b.tipoUso || '') || a.descripcion.localeCompare(b.descripcion));
  const items = itemsDePedido(pedido.id);
  const porProducto = new Map(items.map(i => [String(i.productoIdLocal), i]));
  $('pp-carga-tbody').innerHTML = productos.map(p => {
    const item = porProducto.get(String(p.id));
    const costo = precioVigente(p.id);
    const cant = item ? item.cantSolicitada : 0;
    const subtotal = cant * costo;
    return `<tr>
      <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${p.descripcion}${p.codigoMonica ? ` <span style="color:var(--texto-suave);font-size:10.5px;">(${p.codigoMonica})</span>` : ''}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;">${badgeTipoUsoPP(p.tipoUso)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${costo ? _money(costo) : '<span style="color:var(--rojo);">sin precio</span>'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;">
        <input type="number" min="0" step="1" value="${cant || ''}" ${soloLectura ? 'disabled' : ''} style="width:70px;padding:3px 6px;border:1px solid var(--borde-fuerte);border-radius:4px;text-align:center;"
          onchange="guardarItemPedidoPP('${pedido.id}','${p.id}',this.value)">
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(subtotal)}</td>
    </tr>`;
  }).join('');
  $('pp-carga-resumen').innerHTML = renderSemaforoHTML(pedido);
}
export function guardarItemPedidoPP(pedidoId, productoId, valor) {
  const pedido = getPedidoPP(pedidoId); if (!pedido || pedido.estado !== 'borrador') { toast('⚠️ Este pedido ya no se puede editar'); return; }
  const cant = parseFloat(valor) || 0;
  let item = (DB.ppItems || []).find(i => String(i.pedidoIdLocal) === String(pedidoId) && String(i.productoIdLocal) === String(productoId) && !i.anulado);
  if (!item) {
    if (cant <= 0) return;
    item = { id: _id('PPI'), pedidoIdLocal: pedidoId, productoIdLocal: productoId, cantSolicitada: cant, cantAutorizada: null, costoCongelado: 0, anulado: false };
    if (!DB.ppItems) DB.ppItems = [];
    DB.ppItems.push(item);
  } else {
    item.cantSolicitada = cant;
  }
  supaSync('ppItems', item);
  renderModalCargaPP();
}
export function cerrarPedidoSupervisorPP(pedidoId) {
  const pedido = getPedidoPP(pedidoId); if (!pedido || pedido.estado !== 'borrador') return;
  const periodo = getPeriodoPP(pedido.periodoIdLocal);
  if (periodo && periodo.estado === 'cerrado') { toast('⚠️ El período ya está cerrado'); return; }
  const items = itemsDePedido(pedidoId);
  if (!items.length) { toast('⚠️ Cargá al menos un producto antes de cerrar'); return; }
  // Se congela el costo vigente de cada ítem al cerrar (§4.5) — de acá en
  // adelante el total del pedido no se mueve aunque cambie el precio.
  items.forEach(i => { i.costoCongelado = precioVigente(i.productoIdLocal); supaSync('ppItems', i); });
  pedido.estado = 'cerrado_supervisor';
  pedido.cerradoPor = currentUser?.nombre || '';
  pedido.cerradoEn = new Date().toISOString();
  supaSync('ppPedidos', pedido);
  cerrarModal('modal-pp-carga');
  renderMisPedidosPP();
  toast('✓ Pedido cerrado — pasa a auditoría');
}

// ========== AUDITORÍA ==========

export function renderAuditoriaPP() {
  const tbody = $('tbody-pp-auditoria'); if (!tbody) return;
  const periodoId = ($('pp-aud-periodo-sel') || { value: '' }).value;
  if (!periodoId) { tbody.innerHTML = '<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">No hay ningún período habilitado todavía.</td></tr>'; return; }
  const orden = { cerrado_supervisor: 0, en_auditoria: 1, autorizado: 2, en_compra: 3, entregado: 4 };
  const rows = (DB.ppPedidos || []).filter(p => !p.anulado && p.periodoIdLocal === periodoId && orden[p.estado] != null)
    .sort((a, b) => orden[a.estado] - orden[b.estado]);
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">Todavía no hay pedidos cerrados por sus supervisores en este período.</td></tr>'; return; }
  tbody.innerHTML = rows.map(p => {
    const obj = (DB.objetivos || []).find(o => o.codigo === p.servicioCodigo);
    const total = totalPedidoPP(p.id);
    const pct = p.facturacionNeta > 0 ? (total / p.facturacionNeta * 100) : 0;
    return `<tr>
      <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:500;">${obj ? obj.nombre : p.servicioCodigo}<br><span style="font-size:10px;color:var(--texto-suave);">${p.supervisor || '—'}</span></td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badgeEstadoPedidoPP(p.estado)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(total)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;${pct > 100 ? 'color:var(--rojo);font-weight:600;' : ''}">${p.facturacionNeta > 0 ? pct.toFixed(1) + '%' : '—'}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
        ${['cerrado_supervisor', 'en_auditoria'].includes(p.estado) ? `<button class="btn btn-xs btn-primary" onclick="abrirAuditoriaPedidoPP('${p.id}')">Auditar</button>` : `<button class="btn btn-xs" onclick="abrirAuditoriaPedidoPP('${p.id}')">Ver</button>`}
      </td>
    </tr>`;
  }).join('');
}

let _ppAuditoriaModalId = null;
export function abrirAuditoriaPedidoPP(pedidoId) {
  _ppAuditoriaModalId = pedidoId;
  ensureModalAuditoriaPP();
  renderModalAuditoriaPP();
  abrirModal('modal-pp-auditoria');
}
function ensureModalAuditoriaPP() {
  if ($('modal-pp-auditoria')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-auditoria';
  m.innerHTML = `
    <div class="modal" style="max-width:800px;">
      <div class="modal-header"><h3 id="pp-aud-titulo">Auditoría de pedido</h3><button class="btn-close" onclick="cerrarModal('modal-pp-auditoria')">×</button></div>
      <div class="modal-body">
        <div id="pp-aud-resumen" style="margin-bottom:14px;"></div>
        <div style="max-height:400px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
            <thead><tr style="background:#374151;color:white;">
              <th style="padding:6px 10px;text-align:left;">Producto</th>
              <th style="padding:6px 8px;text-align:center;">Pedido</th>
              <th style="padding:6px 8px;text-align:center;width:110px;">Autorizado</th>
              <th style="padding:6px 8px;text-align:right;">Costo cong.</th>
              <th style="padding:6px 8px;text-align:right;">Subtotal</th>
            </tr></thead>
            <tbody id="pp-aud-tbody"></tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-auditoria')">Cerrar</button>
        <button class="btn btn-primary" id="pp-aud-btn-autorizar" onclick="">Autorizar compra</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function renderModalAuditoriaPP() {
  const pedido = getPedidoPP(_ppAuditoriaModalId); if (!pedido) return;
  const obj = (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo);
  const soloLectura = !['cerrado_supervisor', 'en_auditoria'].includes(pedido.estado);
  $('pp-aud-titulo').textContent = `${obj ? obj.nombre : pedido.servicioCodigo} — supervisor: ${pedido.supervisor || '—'}`;
  const items = itemsDePedido(pedido.id).map(i => ({ ...i, _prod: getProductoPP(i.productoIdLocal) })).filter(i => i._prod)
    .sort((a, b) => a._prod.descripcion.localeCompare(b._prod.descripcion));
  $('pp-aud-tbody').innerHTML = items.map(i => {
    const autorizada = i.cantAutorizada != null ? i.cantAutorizada : i.cantSolicitada;
    const subtotal = autorizada * (i.costoCongelado || 0);
    const ajustado = i.ajustadoPor ? `<div style="font-size:10px;color:var(--rojo);">antes: ${i.cantAntesAjuste} · ${i.ajustadoPor}</div>` : '';
    return `<tr>
      <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${i._prod.descripcion}${ajustado}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;">${i.cantSolicitada}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;">
        <input type="number" min="0" step="1" value="${autorizada}" ${soloLectura ? 'disabled' : ''} style="width:70px;padding:3px 6px;border:1px solid var(--borde-fuerte);border-radius:4px;text-align:center;"
          onchange="ajustarCantidadAuditoriaPP('${i.id}',this.value)">
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(i.costoCongelado || 0)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(subtotal)}</td>
    </tr>`;
  }).join('');
  $('pp-aud-resumen').innerHTML = renderSemaforoHTML(pedido);
  const btnAutorizar = $('pp-aud-btn-autorizar');
  if (btnAutorizar) {
    btnAutorizar.setAttribute('onclick', `autorizarPedidoPP('${pedido.id}')`);
    btnAutorizar.style.display = soloLectura ? 'none' : 'inline-flex';
  }
}
export function ajustarCantidadAuditoriaPP(itemId, valor) {
  const item = (DB.ppItems || []).find(i => String(i.id) === String(itemId)); if (!item) return;
  const nuevo = parseFloat(valor) || 0;
  const anterior = item.cantAutorizada != null ? item.cantAutorizada : item.cantSolicitada;
  if (nuevo === anterior) return;
  // No se pisa lo que pidió el supervisor — queda registrado el ajuste
  // completo del auditor (quién, cuándo, de cuánto a cuánto — A.7).
  item.cantAntesAjuste = anterior;
  item.cantAutorizada = nuevo;
  item.ajustadoPor = currentUser?.nombre || '';
  item.ajustadoEn = new Date().toISOString();
  supaSync('ppItems', item);
  const pedido = getPedidoPP(item.pedidoIdLocal);
  if (pedido && pedido.estado === 'cerrado_supervisor') {
    pedido.estado = 'en_auditoria';
    supaSync('ppPedidos', pedido);
  }
  renderModalAuditoriaPP();
  renderAuditoriaPP();
}
export function autorizarPedidoPP(pedidoId) {
  const pedido = getPedidoPP(pedidoId); if (!pedido) return;
  if (!['cerrado_supervisor', 'en_auditoria'].includes(pedido.estado)) { toast('⚠️ Este pedido no está en auditoría'); return; }
  itemsDePedido(pedidoId).forEach(i => {
    if (i.cantAutorizada == null) { i.cantAutorizada = i.cantSolicitada; supaSync('ppItems', i); }
  });
  pedido.estado = 'autorizado';
  pedido.auditadoPor = currentUser?.nombre || '';
  pedido.auditadoEn = new Date().toISOString();
  pedido.autorizadoPor = currentUser?.nombre || '';
  pedido.autorizadoEn = new Date().toISOString();
  supaSync('ppPedidos', pedido);
  cerrarModal('modal-pp-auditoria');
  renderAuditoriaPP();
  toast(`✓ Pedido de ${pedido.servicioCodigo} autorizado`);
}

// ========== COMPRA Y ENTREGA ==========

export function renderComprasPP() {
  const tbody = $('tbody-pp-compras'); if (!tbody) return;
  const periodoId = ($('pp-compra-periodo-sel') || { value: '' }).value;
  if (!periodoId) { tbody.innerHTML = '<tr><td colspan="4" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">No hay ningún período habilitado todavía.</td></tr>'; return; }
  const rows = (DB.ppPedidos || []).filter(p => !p.anulado && p.periodoIdLocal === periodoId && ['autorizado', 'en_compra', 'entregado'].includes(p.estado));
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="4" style="padding:30px;text-align:center;color:var(--texto-muy-suave);">Todavía no hay pedidos autorizados en este período.</td></tr>'; return; }
  tbody.innerHTML = rows.map(p => {
    const obj = (DB.objetivos || []).find(o => o.codigo === p.servicioCodigo);
    const total = totalPedidoPP(p.id);
    return `<tr>
      <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:500;">${obj ? obj.nombre : p.servicioCodigo}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badgeEstadoPedidoPP(p.estado)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(total)}</td>
      <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">
        ${p.estado === 'autorizado' ? `<button class="btn btn-xs btn-primary" onclick="marcarEnCompraPP('${p.id}')">Marcar en compra</button>` : ''}
        ${p.estado === 'en_compra' ? `<button class="btn btn-xs btn-primary" onclick="marcarEntregadoPP('${p.id}')">Marcar entregado</button>` : ''}
        ${p.estado === 'entregado' ? '✓ Entregado' : ''}
      </td>
    </tr>`;
  }).join('');
}
export function marcarEnCompraPP(pedidoId) {
  const pedido = getPedidoPP(pedidoId); if (!pedido || pedido.estado !== 'autorizado') return;
  pedido.estado = 'en_compra'; pedido.enCompraEn = new Date().toISOString();
  supaSync('ppPedidos', pedido);
  renderComprasPP();
  toast('✓ Marcado en compra');
}
export async function marcarEntregadoPP(pedidoId) {
  const pedido = getPedidoPP(pedidoId); if (!pedido || pedido.estado !== 'en_compra') return;
  const items = (DB.ppItems || []).filter(it => String(it.pedidoIdLocal) === String(pedido.id));
  pedido.estado = 'entregado'; pedido.entregadoEn = new Date().toISOString();
  await supaSync('ppPedidos', pedido);
  // Genera ENTRADAS al stock unificado (v095)
  try {
    const { recibirPedidoProductosPP } = await import('@modules/uniformes/stock.js');
    await recibirPedidoProductosPP(pedido.id, items);
  } catch (_) { /* stock module no disponible, skip */ }
  renderComprasPP();
  toast('✓ Pedido entregado — stock actualizado');
}
