// Entregas (ticket "Módulo productos" 31/08, puntos 6b y 11 del
// checklist).
//
// RONDA 5 (10/09) — circuito real de Logística: la entrega del mes sale
// del STOCK EXISTENTE, no espera a ninguna compra. "Listo para armar" ya
// NO depende de que la OC del período haya llegado — depende de que haya
// pedido cargado; el stock se chequea por línea (alcanza / falta) pero no
// bloquea. Al ARMAR se descuenta el stock (salida con el servicio de
// destino); si no alcanza, armado parcial y el faltante queda en el
// remito. La compra es un circuito aparte (Compras → Reposición).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

const _idTrunc = (v) => String(v || '').slice(-9);
function _id(prefijo) { return prefijo + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function hoyStr() { return new Date().toISOString().slice(0, 10); }

function getPedidoPP(id) { return (DB.ppPedidos || []).find(p => _idTrunc(p.id) === _idTrunc(id)); }
function getProductoPP(id) { return (DB.ppProductos || []).find(p => _idTrunc(p.id) === _idTrunc(id)); }
function itemsDePedido(pedidoId) { return (DB.ppItems || []).filter(i => _idTrunc(i.pedidoIdLocal) === _idTrunc(pedidoId) && !i.anulado); }
function cantEfectiva(item) { return item.cantAutorizada != null ? item.cantAutorizada : item.cantSolicitada; }

function _stockNivelProd(idTrunc) {
  const s = (DB.stockProductos || []).find(x => _idTrunc(x.productoIdLocal) === _idTrunc(idTrunc));
  return s ? (Number(s.cantidad) || 0) : 0;
}
// RONDA 5: "listo para armar" = tiene ítems cargados. Ya no espera a la
// OC — la entrega sale del stock existente. El stock se muestra por línea
// (alcanza / falta) pero no bloquea el armado (se puede armar parcial).
function pedidoListoParaArmar(pedido) {
  return itemsDePedido(pedido.id).length > 0;
}
// ¿El stock cubre TODO el pedido? (para el chip alcanza/falta del listado)
function stockCubrePedido(pedido) {
  return itemsDePedido(pedido.id).every(i => _stockNivelProd(_idTrunc(i.productoIdLocal)) >= cantEfectiva(i));
}
function itemsFaltantesStock(pedido) {
  return itemsDePedido(pedido.id)
    .map(i => ({ i, falta: cantEfectiva(i) - _stockNivelProd(_idTrunc(i.productoIdLocal)) }))
    .filter(x => x.falta > 0);
}
function remitoDePedido(pedidoId) {
  return (DB.ppRemitos || []).filter(r => !r.anulado && _idTrunc(r.pedidoIdLocal) === _idTrunc(pedidoId)).sort((a, b) => String(b.id).localeCompare(String(a.id)))[0] || null;
}

// RONDA 5 — tabla ÚNICA de servicios del período. Cada fila lleva su
// estado y el estado avanza con el botón de acción (no hay secciones
// separadas). Estados: pendiente → armado → en_reparto → entregado.
function objPP(codigo) { return (DB.objetivos || []).find(o => o.codigo === codigo); }
function zonaDePedidoPP(p) { return objPP(p.servicioCodigo)?.localidad || 'Sin zona'; }
function estadoEntregaPP(p) {
  const r = remitoDePedido(p.id);
  if (!r) return { est: 'pendiente', remito: null };
  return { est: r.estado, remito: r };
}
function _fmtFecha(d) { return d ? new Date(d).toLocaleDateString('es-AR') : '—'; }

export function filasEntregasPP(periodoId) {
  const pedidos = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodoId)
    && ['confirmado', 'autorizado', 'en_compra', 'entregado'].includes(p.estado)
    && itemsDePedido(p.id).length > 0);
  return pedidos.map(p => {
    const { est, remito } = estadoEntregaPP(p);
    return { p, est, remito, zona: zonaDePedidoPP(p) };
  });
}

export function renderEntregasPP() {
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  const tbody = $('tbody-pp-entregas'), kpis = $('pp-entregas-kpis');
  if (!periodoId) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="padding:20px;color:var(--texto-muy-suave);text-align:center;">No hay ningún período habilitado todavía.</td></tr>';
    if (kpis) kpis.innerHTML = '';
    renderHojaRecorridoPP();
    return;
  }
  const filas = filasEntregasPP(periodoId);

  if (kpis) {
    const c = (e) => filas.filter(f => f.est === e).length;
    kpis.innerHTML = `
      <div class="stat-card"><div class="stat-label">Pendientes de armado</div><div class="stat-valor">${c('pendiente')}</div></div>
      <div class="stat-card acento"><div class="stat-label">Armados</div><div class="stat-valor">${c('armado')}</div></div>
      <div class="stat-card azul"><div class="stat-label">En reparto</div><div class="stat-valor">${c('en_reparto')}</div></div>
      <div class="stat-card verde"><div class="stat-label">Entregados</div><div class="stat-valor">${c('entregado')}</div></div>`;
  }

  // poblar filtro de zona con las localidades presentes
  const selZona = $('pp-ent-fil-zona');
  if (selZona) {
    const zonas = [...new Set(filas.map(f => f.zona))].sort((a, b) => a.localeCompare(b, 'es'));
    const cur = selZona.value;
    selZona.innerHTML = '<option value="">Zona: todas</option>' + zonas.map(z => `<option${z === cur ? ' selected' : ''}>${z}</option>`).join('');
  }
  _pintarFilasEntregasPP(filas);
  renderHojaRecorridoPP();
}

export function filtrarEntregasPP() {
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  if (!periodoId) return;
  _pintarFilasEntregasPP(filasEntregasPP(periodoId));
}

const _EST_LABEL = { pendiente: 'PENDIENTE DE ARMADO', armado: 'ARMADO', en_reparto: 'EN REPARTO', entregado: 'ENTREGADO' };
const _EST_COLOR = { pendiente: '#6b7280', armado: '#7c3aed', en_reparto: '#2563eb', entregado: '#16a34a' };

function _pintarFilasEntregasPP(filas) {
  const tbody = $('tbody-pp-entregas'); if (!tbody) return;
  const q = ($('pp-ent-fil-buscar') || { value: '' }).value.trim().toLowerCase();
  const fEst = ($('pp-ent-fil-estado') || { value: '' }).value;
  const fZona = ($('pp-ent-fil-zona') || { value: '' }).value;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  const vis = filas.filter(f => {
    const nom = (objPP(f.p.servicioCodigo)?.nombre || f.p.servicioCodigo).toLowerCase();
    if (q && !nom.includes(q) && !String(f.p.servicioCodigo).toLowerCase().includes(q)) return false;
    if (fEst && f.est !== fEst) return false;
    if (fZona && f.zona !== fZona) return false;
    return true;
  });
  if (!vis.length) { tbody.innerHTML = '<tr><td colspan="8" style="padding:18px;color:var(--texto-muy-suave);text-align:center;">Sin servicios para el filtro.</td></tr>'; return; }

  tbody.innerHTML = vis.map(({ p, est, remito, zona }) => {
    const nom = objPP(p.servicioCodigo)?.nombre || p.servicioCodigo;
    const nItems = itemsDePedido(p.id).length;
    // stock
    let stockCell;
    if (est === 'pendiente') {
      const cubre = stockCubrePedido(p); const falt = itemsFaltantesStock(p).length;
      stockCell = cubre ? '<span class="badge badge-verde" style="font-size:10px;">ALCANZA</span>' : `<span class="badge badge-rojo" style="font-size:10px;">FALTA ${falt}</span>`;
    } else stockCell = '<span class="badge badge-verde" style="font-size:10px;">✔</span>';
    // remito
    const remCell = remito ? `<span style="color:#2563eb;font-weight:600;cursor:pointer;text-decoration:underline;" onclick="imprimirRemitoPP('${remito.id}')">${remito.numero} 🖨</span>` : '<span class="text-muted">—</span>';
    // límite
    let limCell = '<span class="text-muted">—</span>';
    if (p.fechaLimiteEntrega) {
      const d = new Date(p.fechaLimiteEntrega); d.setHours(0, 0, 0, 0);
      const vencido = est !== 'entregado' && d < hoy;
      limCell = `<span style="${vencido ? 'color:var(--rojo);font-weight:700;' : ''}">${_fmtFecha(p.fechaLimiteEntrega)}${vencido ? ' ⚠' : ''}</span>`;
    }
    // estado + acción
    const estCell = est === 'entregado' && remito
      ? `<span class="badge badge-verde" style="font-size:10px;">ENTREGADO ${_fmtFecha(remito.entregadoEn)} · ${remito.entregadoA || '—'}</span>`
      : `<span class="badge" style="background:${_EST_COLOR[est]};color:white;font-size:10px;">${_EST_LABEL[est]}</span>`;
    let accCell;
    if (est === 'pendiente') {
      const cubre = stockCubrePedido(p);
      accCell = `<button class="btn btn-primary btn-xs" onclick="abrirArmadoPedidoPP('${p.id}')">📦 ${cubre ? 'Armar' : 'Armar parcial'}</button>`;
    } else if (est === 'armado') {
      accCell = `<button class="btn btn-primary btn-xs" onclick="marcarEnRepartoPP('${remito.id}')">🚚 En reparto</button>`;
    } else if (est === 'en_reparto') {
      accCell = `<button class="btn btn-primary btn-xs" style="background:var(--verde);" onclick="abrirEntregaFinalPP('${remito.id}')">✔ Registrar entrega</button>`;
    } else {
      accCell = `<span class="text-muted" style="font-size:11px;cursor:pointer;text-decoration:underline;" onclick="imprimirRemitoPP('${remito.id}')">🖨 remito</span>`;
    }
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid var(--borde);font-weight:600;">${nom}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--borde);">${zona}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--borde);text-align:center;">${nItems} ítem(s)</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--borde);text-align:center;">${stockCell}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--borde);text-align:center;">${remCell}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--borde);text-align:center;">${limCell}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--borde);">${estCell}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--borde);">${accCell}</td>
    </tr>`;
  }).join('');
}

export function subTabEntregasPP(sub, btn) {
  document.querySelectorAll('#pp-tab-entregas .stab').forEach(b => b.classList.remove('act'));
  document.querySelectorAll('#pp-tab-entregas .sub').forEach(s => s.classList.remove('act'));
  if (btn) btn.classList.add('act');
  else document.querySelector(`#pp-tab-entregas .stab[data-esub="${sub}"]`)?.classList.add('act');
  $('pp-entregas-sub-' + sub)?.classList.add('act');
  if (sub === 'recorrido') renderHojaRecorridoPP();
}

// ========== REMITO PDF (ventana de impresión — mismo patrón que imprimirLegajo) ==========
export function imprimirRemitoPP(remitoId) {
  const r = (DB.ppRemitos || []).find(x => _idTrunc(x.id) === _idTrunc(remitoId)); if (!r) return;
  const o = objPP(r.servicioCodigo);
  const zona = o?.localidad || '—';
  const sup = o?.supervisor || o?.supervisorAsignado || '—';
  const filas = (r.items || []).map(it => `<tr><td>${it.descripcion || it.productoIdLocal}</td><td style="text-align:right;">${it.cantidad}</td></tr>`).join('');
  const w = window.open('', '_blank', 'width=760,height=800');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Remito ${r.numero}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:13px;padding:32px;max-width:680px;margin:0 auto;color:#1f2430;}
    .rtop{background:#1b2a5e;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:flex-start;border-radius:6px 6px 0 0;}
    .rtop b{font-size:14px;}
    .rbody{border:1px solid #c9cfdd;border-top:none;padding:16px 18px;border-radius:0 0 6px 6px;}
    table{width:100%;border-collapse:collapse;margin-top:10px;}
    th,td{border:1px solid #dfe3ec;padding:6px 9px;font-size:12.5px;}
    th{background:#f3f5fb;text-align:left;}
    .firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:52px;text-align:center;font-size:11px;color:#555d75;}
    .firmas div{border-top:1px solid #8a90a5;padding-top:6px;}
    .mut{color:#8a90a5;font-size:11px;margin-top:8px;}
  </style></head><body>
  <div class="rtop">
    <div><b>COOPERATIVA DE TRABAJO OHLIMPIA LTDA.</b><br><span style="font-size:11px;opacity:.85;">Logística — Remito de entrega de productos</span></div>
    <div style="text-align:right;font-size:11.5px;">REMITO <b>${r.numero}</b><br>Fecha: ${_fmtFecha(new Date())}</div>
  </div>
  <div class="rbody">
    <p><b>Servicio:</b> ${r.servicioCodigo}${o ? ' — ' + o.nombre : ''} &nbsp;·&nbsp; <b>Zona:</b> ${zona} &nbsp;·&nbsp; <b>Supervisor:</b> ${sup}</p>
    <table><tr><th>PRODUCTO</th><th style="text-align:right;">CANTIDAD</th></tr>${filas || '<tr><td colspan="2">Sin productos</td></tr>'}</table>
    ${(r.faltantes && r.faltantes.length) ? `<p class="mut">Armado parcial — ${r.faltantes.length} producto(s) quedaron pendientes de reposición.</p>` : ''}
    <p class="mut">Sin precios: el remito acompaña la mercadería. La valorización queda en el sistema.</p>
    <div class="firmas"><div>Entregó (Logística)<br>firma y aclaración</div><div>Recibió (servicio)<br>firma, aclaración y fecha</div></div>
  </div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

// ========== ARMADO CON CHECKLIST → REMITO ==========

let _ppArmadoPedidoId = null;
export function abrirArmadoPedidoPP(pedidoId) {
  _ppArmadoPedidoId = pedidoId;
  ensureModalArmadoPP();
  renderModalArmadoPP();
  abrirModal('modal-pp-armado');
}
function ensureModalArmadoPP() {
  if ($('modal-pp-armado')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-armado';
  m.innerHTML = `
    <div class="modal" style="max-width:620px;">
      <div class="modal-header"><h3 id="pp-armado-titulo">Armado de pedido</h3><button class="btn-close" onclick="cerrarModal('modal-pp-armado')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Fecha límite de entrega (opcional — Hoja de recorrido)</label><input type="date" id="pp-armado-fecha-limite"></div>
        <div id="pp-armado-checklist" style="margin-top:10px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-armado')">Cancelar</button>
        <button class="btn btn-primary" onclick="generarRemitoPP()">✔ Completar armado y generar remito</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function renderModalArmadoPP() {
  const pedido = getPedidoPP(_ppArmadoPedidoId); if (!pedido) return;
  const obj = (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo);
  $('pp-armado-titulo').textContent = `Armado — ${obj ? obj.nombre : pedido.servicioCodigo}`;
  $('pp-armado-fecha-limite').value = pedido.fechaLimiteEntrega ? pedido.fechaLimiteEntrega.slice(0, 10) : '';
  const items = itemsDePedido(pedido.id).map(i => ({ ...i, _prod: getProductoPP(i.productoIdLocal) })).filter(i => i._prod);
  $('pp-armado-checklist').innerHTML = items.map(i => {
    const pedidoCant = cantEfectiva(i);
    const stock = _stockNivelProd(_idTrunc(i.productoIdLocal));
    const arma = Math.min(pedidoCant, stock);
    const falta = pedidoCant - arma;
    return `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12.8px;border-bottom:1px solid var(--borde);">
      <input type="checkbox" class="pp-armado-check" data-item="${i.id}" ${i.armado ? 'checked' : ''} onchange="marcarItemArmadoPP('${pedido.id}','${i.id}',this.checked)">
      <span style="flex:1;">${i._prod.descripcion} <span class="text-muted" style="font-size:10.5px;">stock ${stock}</span></span>
      <b>${arma}${falta > 0 ? ` <span style="color:var(--rojo);font-weight:700;">(faltan ${falta})</span>` : ''}</b>
    </label>`;
  }).join('');
}
export async function marcarItemArmadoPP(pedidoId, itemId, checked) {
  const item = (DB.ppItems || []).find(i => String(i.id) === String(itemId)); if (!item) return;
  item.armado = checked;
  await supaSync('ppItems', item);
}
function siguienteNumeroRemitoPP() {
  const nums = (DB.ppRemitos || []).map(r => { const m = /R-0*(\d+)/.exec(r.numero || ''); return m ? Number(m[1]) : 0; });
  return `R-${String(Math.max(0, ...nums) + 1).padStart(6, '0')}`;
}
export async function generarRemitoPP() {
  const pedido = getPedidoPP(_ppArmadoPedidoId); if (!pedido) return;
  const items = itemsDePedido(pedido.id);
  const faltan = items.filter(i => !i.armado);
  if (faltan.length) { toast(`⚠️ Faltan tildar ${faltan.length} producto(s) del checklist`); return; }

  const fechaLimite = ($('pp-armado-fecha-limite') || {}).value;
  if (fechaLimite) { pedido.fechaLimiteEntrega = fechaLimite; await supaSync('ppPedidos', pedido); }

  // RONDA 5: el armado SALE DEL STOCK. Por línea se arma min(pedido, stock);
  // si no alcanza, es armado parcial y el faltante queda en el remito
  // (alimenta la prioridad de la reposición y el rastro). La SALIDA de
  // stock se registra ACÁ (antes se hacía recién en la entrega final).
  const lineasArmadas = [];
  const faltantes = [];
  for (const i of items) {
    const prodTrunc = _idTrunc(i.productoIdLocal);
    const pedidoCant = cantEfectiva(i);
    const stock = _stockNivelProd(prodTrunc);
    const arma = Math.max(0, Math.min(pedidoCant, stock));
    const falta = pedidoCant - arma;
    if (arma > 0) lineasArmadas.push({ productoIdLocal: prodTrunc, descripcion: getProductoPP(i.productoIdLocal)?.descripcion || '', cantidad: arma });
    if (falta > 0) faltantes.push({ productoIdLocal: prodTrunc, cantidad: falta });
  }
  if (!lineasArmadas.length) { toast('⚠️ No hay stock de ninguno de los productos — no se puede armar nada todavía'); return; }

  const remito = {
    id: _id('PPREM'), numero: siguienteNumeroRemitoPP(), pedidoIdLocal: _idTrunc(pedido.id), servicioCodigo: pedido.servicioCodigo,
    items: lineasArmadas, faltantes,
    estado: 'armado', armadoPor: currentUser?.nombre || '', armadoEn: new Date().toISOString(),
    firmaCliente: false, anulado: false,
  };
  if (!DB.ppRemitos) DB.ppRemitos = [];
  DB.ppRemitos.push(remito);
  await supaSync('ppRemitos', remito);

  const { registrarMovimientoStockProducto } = await import('@modules/uniformes/stock.js');
  for (const l of lineasArmadas) {
    await registrarMovimientoStockProducto({
      tipo: 'salida', productoIdLocal: l.productoIdLocal, cantidad: l.cantidad, costoUnitario: 0,
      motivo: `Armado ${remito.numero} — ${pedido.servicioCodigo}`, refTipo: 'remito', refIdLocal: _idTrunc(remito.id),
    });
  }

  cerrarModal('modal-pp-armado');
  renderEntregasPP();
  toast(faltantes.length
    ? `✓ Remito ${remito.numero} — ARMADO PARCIAL (${faltantes.length} faltante(s) → reposición)`
    : `✓ Remito ${remito.numero} generado — salida de stock registrada`);
}

export async function marcarEnRepartoPP(remitoId) {
  const r = (DB.ppRemitos || []).find(x => _idTrunc(x.id) === _idTrunc(remitoId)); if (!r || r.estado !== 'armado') return;
  r.estado = 'en_reparto'; r.enRepartoEn = new Date().toISOString();
  await supaSync('ppRemitos', r);
  renderEntregasPP();
  toast(`✓ ${r.numero} en reparto`);
}

// ========== ENTREGA FINAL (firma/foto) ==========

let _ppEntregaRemitoId = null;
export function abrirEntregaFinalPP(remitoId) {
  _ppEntregaRemitoId = remitoId;
  ensureModalEntregaPP();
  const r = (DB.ppRemitos || []).find(x => _idTrunc(x.id) === _idTrunc(remitoId)); if (!r) return;
  const pedido = getPedidoPP(r.pedidoIdLocal);
  const obj = pedido ? (DB.objetivos || []).find(o => o.codigo === pedido.servicioCodigo) : null;
  const cliente = obj?.clienteIdLocal ? (DB.clientes || []).find(c => String(c.idLocal || c.id_local) === String(obj.clienteIdLocal)) : null;
  const pagan = cliente?.productosEnFactura === 'SE FACTURA';
  $('pp-entrega-titulo').textContent = `Entrega — ${r.numero}`;
  $('pp-entrega-a').value = '';
  $('pp-entrega-foto').value = '';
  const boxFirma = $('pp-entrega-firma-box');
  if (boxFirma) boxFirma.style.display = pagan ? 'block' : 'none';
  const firmaCheck = $('pp-entrega-firma'); if (firmaCheck) firmaCheck.checked = false;
  $('pp-entrega-nota').textContent = pagan
    ? 'Servicio PAGAN: el remito firmado respalda la factura a precio venta — se necesita la firma.'
    : 'Servicio NO PAGAN: queda como constancia interna, el costo va al económico del servicio.';
  abrirModal('modal-pp-entrega');
}
function ensureModalEntregaPP() {
  if ($('modal-pp-entrega')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-entrega';
  m.innerHTML = `
    <div class="modal" style="max-width:460px;">
      <div class="modal-header"><h3 id="pp-entrega-titulo">Entrega</h3><button class="btn-close" onclick="cerrarModal('modal-pp-entrega')">×</button></div>
      <div class="modal-body">
        <p id="pp-entrega-nota" style="font-size:12px;color:var(--texto-suave);"></p>
        <div class="form-group"><label>Quién recibió *</label><input type="text" id="pp-entrega-a"></div>
        <div class="form-group"><label>Foto del remito firmado</label><input type="file" id="pp-entrega-foto" accept="image/*"></div>
        <div class="form-group" id="pp-entrega-firma-box" style="display:none;"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="pp-entrega-firma"> El cliente firmó el remito</label></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-entrega')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarEntregaFinalPP()">✔ Confirmar entrega</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
// Confirma la entrega: sube la foto (si hay) y cierra el pedido como
// ENTREGADO. La SALIDA de stock ya se registró al ARMAR (ronda 5) — acá
// no se vuelve a tocar el stock para no descontar dos veces.
export async function confirmarEntregaFinalPP() {
  const r = (DB.ppRemitos || []).find(x => _idTrunc(x.id) === _idTrunc(_ppEntregaRemitoId)); if (!r) return;
  const entregadoA = ($('pp-entrega-a') || {}).value.trim();
  if (!entregadoA) { toast('⚠️ Falta quién recibió'); return; }
  const boxFirma = $('pp-entrega-firma-box');
  const requiereFirma = boxFirma && boxFirma.style.display !== 'none';
  const firmo = !!($('pp-entrega-firma') || {}).checked;
  if (requiereFirma && !firmo) { toast('⚠️ Este servicio PAGAN necesita la firma del cliente para respaldar la factura'); return; }

  const fileInput = $('pp-entrega-foto');
  const file = fileInput?.files?.[0];
  let fotoPath = null;
  if (file) {
    try {
      const { SUPA } = await import('@shared/supabase.js');
      const path = `pedido_productos/remitos/${_idTrunc(r.id)}/${Date.now()}_${file.name}`;
      const { error } = await SUPA.storage.from('ohlimpia-adjuntos').upload(path, file, { upsert: false, contentType: file.type });
      if (!error) fotoPath = path;
    } catch (e) { /* si falla la subida, la entrega igual se registra — no bloquea */ }
  }

  r.entregadoA = entregadoA; r.entregadoEn = new Date().toISOString(); r.fotoPath = fotoPath; r.firmaCliente = firmo; r.estado = 'entregado';
  await supaSync('ppRemitos', r);

  const pedido = getPedidoPP(r.pedidoIdLocal);
  if (pedido) { pedido.estado = 'entregado'; pedido.entregadoEn = new Date().toISOString(); await supaSync('ppPedidos', pedido); }

  cerrarModal('modal-pp-entrega');
  renderEntregasPP();
  toast(`✓ ${r.numero} entregado a ${entregadoA}`);
}

// ========== HOJA DE RECORRIDO (tab propio, ronda 5) ==========
//
// 2 partes: PLANIFICACIÓN (fecha de reparto por zona → se aplica como
// límite a todas las salidas de esa zona) y VISTA DEL REPARTIDOR (cada
// zona con sus salidas, estado y vencimiento, los vencidos arriba).
// Zona = objetivo.localidad. La fecha vive por servicio en
// pedido.fechaLimiteEntrega; el input por zona es un aplicar-en-lote.

function _pedidosDelPeriodoParaRecorrido(periodoId) {
  return (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodoId)
    && ['confirmado', 'autorizado', 'en_compra', 'entregado'].includes(p.estado)
    && itemsDePedido(p.id).length > 0);
}

export function renderHojaRecorridoPP() {
  const contPlan = $('pp-recorrido-planificacion');
  const contRep = $('pp-recorrido-repartidor');
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  if (!contPlan && !contRep) return;
  if (!periodoId) { if (contPlan) contPlan.innerHTML = ''; if (contRep) contRep.innerHTML = ''; return; }

  const filas = _pedidosDelPeriodoParaRecorrido(periodoId).map(p => ({ p, zona: zonaDePedidoPP(p), ...estadoEntregaPP(p) }));
  const porZona = new Map();
  for (const f of filas) {
    if (!porZona.has(f.zona)) porZona.set(f.zona, []);
    porZona.get(f.zona).push(f);
  }
  const zonasOrd = [...porZona.keys()].sort((a, b) => a.localeCompare(b, 'es'));

  // ----- PLANIFICACIÓN -----
  if (contPlan) {
    contPlan.innerHTML = zonasOrd.length ? `<table style="width:100%;border-collapse:collapse;font-size:12.5px;">
      <thead><tr style="background:#374151;color:white;"><th style="padding:7px 10px;text-align:left;">Zona / recorrido</th><th style="padding:7px 8px;text-align:left;">Salidas</th><th style="padding:7px 8px;">Fecha de reparto</th><th style="padding:7px 8px;"></th></tr></thead>
      <tbody>${zonasOrd.map(z => {
        const fs = porZona.get(z);
        const noEntregadas = fs.filter(f => f.est !== 'entregado');
        const fechas = [...new Set(noEntregadas.map(f => f.p.fechaLimiteEntrega).filter(Boolean).map(d => String(d).slice(0, 10)))];
        const val = fechas.length === 1 ? fechas[0] : '';
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid var(--borde);font-weight:600;">${z}</td>
          <td style="padding:6px 8px;border-bottom:1px solid var(--borde);font-size:11.5px;">${fs.length} (${fs.slice(0, 3).map(f => objPP(f.p.servicioCodigo)?.nombre || f.p.servicioCodigo).join(' · ')}${fs.length > 3 ? '…' : ''})</td>
          <td style="padding:6px 8px;border-bottom:1px solid var(--borde);text-align:center;"><input type="date" id="pp-zona-fecha-${_slug(z)}" value="${val}" style="padding:4px 8px;border:1px solid var(--borde-fuerte);border-radius:5px;font-size:12px;"></td>
          <td style="padding:6px 8px;border-bottom:1px solid var(--borde);"><button class="btn btn-secondary btn-xs" onclick="aplicarFechaZonaPP('${encodeURIComponent(z)}')">Aplicar a la zona</button> <span id="pp-zona-ok-${_slug(z)}" class="text-muted" style="font-size:10.5px;"></span></td>
        </tr>`;
      }).join('')}</tbody></table>` : '<p style="padding:14px;color:var(--texto-muy-suave);">Sin servicios en este período.</p>';
  }

  // ----- VISTA DEL REPARTIDOR -----
  if (contRep) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const bloques = zonasOrd.map(z => {
      const fs = porZona.get(z).filter(f => f.est !== 'entregado' && f.remito).map(f => {
        let venc = '<span class="text-muted">sin fecha</span>', ord = 9e9;
        if (f.p.fechaLimiteEntrega) {
          const d = new Date(f.p.fechaLimiteEntrega); d.setHours(0, 0, 0, 0);
          const dias = Math.round((d - hoy) / 86400000); ord = dias;
          venc = dias < 0 ? `<span style="color:var(--rojo);font-weight:700;">⚠ vencido hace ${-dias}d</span>` : dias <= 2 ? `<span style="color:var(--naranja);font-weight:700;">vence en ${dias}d</span>` : `vence en ${dias}d`;
        }
        return { f, venc, ord };
      }).sort((a, b) => a.ord - b.ord);
      if (!fs.length) return '';
      const fecha = fs.find(x => x.f.p.fechaLimiteEntrega)?.f.p.fechaLimiteEntrega;
      return `<div class="card" style="margin-bottom:10px;">
        <div style="background:#e8f0fe;padding:6px 12px;font-weight:700;font-size:12.5px;">📍 ${z}${fecha ? ' — reparto ' + _fmtFecha(fecha) : ''} · ${fs.length} salida(s)</div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;"><tbody>${fs.map(({ f, venc }) => `<tr>
          <td style="padding:5px 12px;border-bottom:1px solid var(--borde);">${objPP(f.p.servicioCodigo)?.nombre || f.p.servicioCodigo}${f.remito ? ` · ${f.remito.numero}` : ''}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);"><span class="badge" style="background:${_EST_COLOR[f.est]};color:white;font-size:10px;">${_EST_LABEL[f.est]}</span></td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;font-size:11.5px;">${venc}</td>
        </tr>`).join('')}</tbody></table>
      </div>`;
    }).filter(Boolean).join('');
    contRep.innerHTML = bloques || '<p style="padding:14px;color:var(--texto-muy-suave);">Sin salidas pendientes de reparto.</p>';
  }
}

function _slug(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-'); }

export async function aplicarFechaZonaPP(zonaEnc) {
  const zona = decodeURIComponent(zonaEnc);
  const inp = $('pp-zona-fecha-' + _slug(zona));
  const fecha = inp ? inp.value : '';
  if (!fecha) { toast('⚠️ Cargá una fecha primero'); return; }
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  const pedidos = _pedidosDelPeriodoParaRecorrido(periodoId)
    .filter(p => zonaDePedidoPP(p) === zona && estadoEntregaPP(p).est !== 'entregado');
  let n = 0;
  for (const p of pedidos) { p.fechaLimiteEntrega = fecha; await supaSync('ppPedidos', p); n++; }
  const ok = $('pp-zona-ok-' + _slug(zona)); if (ok) ok.textContent = `✔ aplicado a ${n} salida(s)`;
  renderEntregasPP();
  toast(`✓ Fecha de reparto aplicada a ${n} salida(s) de ${zona}`);
}
