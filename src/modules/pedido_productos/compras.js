// Compras por proveedor (ticket "Módulo productos" 31/08, puntos 6a y 10
// del checklist). Cambio de fondo del MD: Logística NO compra por
// servicio — compra el CONSOLIDADO por proveedor. Es un circuito
// separado de "Mis pedidos"/Auditoría (unidad: servicio): acá la unidad
// es el PROVEEDOR.
//
// 5 subtabs, en el orden del proceso real:
//   1. Consolidado del período — junta todo lo aprobado, todavía sin ordenar.
//   2. Sugerencias — equivalentes más baratos (grupos de equivalencia).
//   3. Simulación mensual — cuánto se ahorraría si se tomaran todas.
//   4. Órdenes y seguimiento — CONFIRMADA→ENVIADA→RECIBIDA→factura (PPP+cta cte).
//   5. Comparador de precios — administración de los grupos de equivalencia.
//
// NO va (aclarado en el MD): solicitud de presupuesto/cotización previa
// — Logística ya tiene el pedido completo del mes, compra a lista.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

function _id(prefijo) { return prefijo + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
const _idTrunc = (v) => String(v || '').slice(-9);
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function hoyStr() { return new Date().toISOString().slice(0, 10); }

function getPeriodoPP(id) { return (DB.ppPeriodos || []).find(p => _idTrunc(p.id) === _idTrunc(id)); }
function getPedidoPP(id) { return (DB.ppPedidos || []).find(p => _idTrunc(p.id) === _idTrunc(id)); }
function getProductoPP(id) { return (DB.ppProductos || []).find(p => _idTrunc(p.id) === _idTrunc(id)); }
function getProveedorPP(id) { return (DB.proveedores || []).find(p => String(p.id) === String(id) && !p.anulado); }
function cantEfectiva(item) { return item.cantAutorizada != null ? item.cantAutorizada : item.cantSolicitada; }
function precioVigente(productoId, fechaISO = hoyStr()) {
  const precios = (DB.ppPrecios || []).filter(pr => _idTrunc(pr.productoIdLocal) === _idTrunc(productoId) && !pr.anulado);
  const vigente = precios.find(pr => pr.vigenciaDesde <= fechaISO && (!pr.vigenciaHasta || pr.vigenciaHasta >= fechaISO));
  return vigente ? Number(vigente.costoUnit) || 0 : 0;
}

// ========== CONSOLIDADO DEL PERÍODO (subtab 1) ==========
//
// Toma ítems de pedidos ya aprobados (confirmado/autorizado) que TODAVÍA
// no estén en ninguna orden (item.ordenCompraIdLocal null) — así una
// orden ya generada no vuelve a aparecer acá, y un pedido aprobado
// DESPUÉS de la primera consolidación del mes entra en la siguiente.
function itemsConsolidablesPP(periodoId) {
  const pedidosDelPeriodo = (DB.ppPedidos || []).filter(p => !p.anulado && _idTrunc(p.periodoIdLocal) === _idTrunc(periodoId) && ['confirmado', 'autorizado'].includes(p.estado));
  const idsPedidos = new Set(pedidosDelPeriodo.map(p => _idTrunc(p.id)));
  return (DB.ppItems || []).filter(i => !i.anulado && !i.ordenCompraIdLocal && idsPedidos.has(_idTrunc(i.pedidoIdLocal)) && cantEfectiva(i) > 0);
}

// Map proveedorId -> { proveedor, lineas: Map(productoId -> {producto, cantidad, costoUnit, importe}), total }
export function consolidadoPorProveedorPP(periodoId) {
  const items = itemsConsolidablesPP(periodoId);
  const porProveedor = new Map();
  for (const it of items) {
    const prod = getProductoPP(it.productoIdLocal);
    if (!prod || !prod.proveedorIdLocal) continue;   // sin proveedor asignado: no se puede armar una orden — queda afuera (ver aviso en el render)
    const provId = String(prod.proveedorIdLocal);
    if (!porProveedor.has(provId)) porProveedor.set(provId, { proveedor: getProveedorPP(provId), lineas: new Map(), total: 0 });
    const grupo = porProveedor.get(provId);
    const key = _idTrunc(prod.id);
    if (!grupo.lineas.has(key)) grupo.lineas.set(key, { producto: prod, cantidad: 0, costoUnit: precioVigente(prod.id) });
    grupo.lineas.get(key).cantidad += cantEfectiva(it);
  }
  for (const grupo of porProveedor.values()) {
    grupo.total = [...grupo.lineas.values()].reduce((s, l) => s + l.cantidad * l.costoUnit, 0);
  }
  return porProveedor;
}
function itemsSinProveedorPP(periodoId) {
  return itemsConsolidablesPP(periodoId).filter(i => { const p = getProductoPP(i.productoIdLocal); return !p || !p.proveedorIdLocal; });
}

export function renderConsolidadoPP() {
  const cont = $('pp-compras-consolidado'); if (!cont) return;
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  if (!periodoId) { cont.innerHTML = '<p style="padding:20px;color:var(--texto-muy-suave);">No hay ningún período habilitado todavía.</p>'; return; }
  const porProveedor = consolidadoPorProveedorPP(periodoId);
  const sinProv = itemsSinProveedorPP(periodoId);

  if (!porProveedor.size) {
    cont.innerHTML = '<p style="padding:20px;color:var(--texto-muy-suave);">Nada para consolidar todavía — no hay pedidos aprobados sin ordenar en este período.</p>';
  } else {
    cont.innerHTML = [...porProveedor.entries()].map(([provId, g]) => `
      <div class="card" style="margin-bottom:14px;">
        <div class="card-header"><h3>${g.proveedor ? g.proveedor.nombre : provId} <span style="font-weight:400;color:var(--texto-suave);font-size:12px;">— ${g.lineas.size} línea(s)</span></h3></div>
        <div class="tabla-wrap"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead><tr style="background:#374151;color:white;">
            <th style="padding:6px 10px;text-align:left;">Producto</th><th style="padding:6px 8px;text-align:right;">Costo unit.</th>
            <th style="padding:6px 8px;text-align:right;">Cantidad</th><th style="padding:6px 8px;text-align:right;">Importe</th>
          </tr></thead>
          <tbody>${[...g.lineas.values()].map(l => `<tr>
            <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${l.producto.descripcion}${l.producto.codigoMonica ? ` <span style="color:var(--texto-suave);font-size:10.5px;">(${l.producto.codigoMonica})</span>` : ''}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${l.costoUnit ? _money(l.costoUnit) : '<span style="color:var(--rojo);">sin precio</span>'}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${l.cantidad}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;font-weight:600;">${_money(l.cantidad * l.costoUnit)}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3" style="padding:6px 10px;text-align:right;font-weight:700;">TOTAL ${g.proveedor ? g.proveedor.nombre : ''}</td><td style="padding:6px 8px;text-align:right;font-weight:700;">${_money(g.total)}</td></tr></tfoot>
        </table></div>
      </div>`).join('')
      + `<div style="display:flex;gap:10px;">
          <button class="btn btn-primary" onclick="generarOrdenesCompraPP()">✔ Confirmar pedido → generar orden(es) de compra</button>
          <button class="btn btn-secondary" onclick="exportarConsolidadoPP()">⬇ Exportar (CSV)</button>
        </div>
        <p style="font-size:11.5px;color:var(--texto-suave);margin-top:8px;">La orden sale a los precios de LISTA vigentes del catálogo. Antes de confirmar, revisá 2 · Sugerencias.</p>`;
  }
  if (sinProv.length) {
    cont.innerHTML += `<div class="alerta alerta-warning" style="margin-top:10px;">⚠️ ${sinProv.length} línea(s) de productos sin proveedor asignado en el Catálogo — no se pueden incluir en ninguna orden. Asignales proveedor en 🧴 Catálogo → Editar.</div>`;
  }
}

export function exportarConsolidadoPP() {
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  const porProveedor = consolidadoPorProveedorPP(periodoId);
  const filas = [['Proveedor', 'Cod. Monica', 'Producto', 'Costo unit.', 'Cantidad', 'Importe']];
  for (const g of porProveedor.values()) {
    for (const l of g.lineas.values()) {
      filas.push([g.proveedor?.nombre || '', l.producto.codigoMonica || '', l.producto.descripcion, l.costoUnit, l.cantidad, l.cantidad * l.costoUnit]);
    }
  }
  const csv = filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `consolidado_compra_${hoyStr()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ========== SUGERENCIAS EN LA COMPRA (subtab 2) ==========
//
// Cruza cada línea consolidada contra pp_grupos_equivalencia: si el
// producto pertenece a un grupo y OTRO miembro (de otro proveedor) sale
// más barato por unidad común, se sugiere el cambio — nunca se aplica
// solo. "Mantener" pide motivo (queda en _decisionesSugerenciasPP, se usa
// al generar las órdenes).
function grupoDeProductoPP(productoId) {
  const item = (DB.ppGruposEquivalenciaItems || []).find(gi => _idTrunc(gi.productoIdLocal) === _idTrunc(productoId));
  return item ? (DB.ppGruposEquivalencia || []).find(g => g.idLocal === item.grupoIdLocal || _idTrunc(g.id) === _idTrunc(item.grupoIdLocal)) : null;
}
function $porUnidadComunPP(productoId) {
  const item = (DB.ppGruposEquivalenciaItems || []).find(gi => _idTrunc(gi.productoIdLocal) === _idTrunc(productoId));
  if (!item) return null;
  const costo = precioVigente(productoId);
  const factor = Number(item.factorConversion) || 1;
  return costo > 0 ? costo / factor : null;
}
export function sugerenciasEquivalentesPP(periodoId) {
  const porProveedor = consolidadoPorProveedorPP(periodoId);
  const sugerencias = [];
  for (const g of porProveedor.values()) {
    for (const l of g.lineas.values()) {
      const grupo = grupoDeProductoPP(l.producto.id);
      if (!grupo) continue;
      const miembros = (DB.ppGruposEquivalenciaItems || []).filter(gi => (gi.grupoIdLocal === grupo.idLocal || _idTrunc(gi.grupoIdLocal) === _idTrunc(grupo.id)) && _idTrunc(gi.productoIdLocal) !== _idTrunc(l.producto.id));
      const actual = $porUnidadComunPP(l.producto.id);
      if (actual == null) continue;
      let mejor = null;
      for (const m of miembros) {
        const otroProd = getProductoPP(m.productoIdLocal);
        if (!otroProd) continue;
        const $u = $porUnidadComunPP(otroProd.id);
        if ($u != null && $u < actual && (!mejor || $u < mejor.$u)) mejor = { producto: otroProd, $u, factor: Number(m.factorConversion) || 1 };
      }
      if (mejor) sugerencias.push({ grupo, actual: l.producto, actualCosto: l.costoUnit, actual$u: actual, cantidad: l.cantidad, sugerido: mejor.producto, sugeridoCosto: precioVigente(mejor.producto.id), sugerido$u: mejor.$u });
    }
  }
  return sugerencias;
}

const _decisionesSugerenciasPP = new Map(); // productoIdLocal(actual) -> {aceptada, motivo}
export function renderSugerenciasPP() {
  const cont = $('pp-compras-sugerencias'); if (!cont) return;
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  const sugerencias = periodoId ? sugerenciasEquivalentesPP(periodoId) : [];
  if (!sugerencias.length) { cont.innerHTML = '<p style="padding:20px;color:var(--texto-muy-suave);">Sin sugerencias — ninguna línea consolidada tiene un equivalente más barato cargado (o no hay grupos de equivalencia armados todavía, ver 🔍 Comparador de precios).</p>'; return; }
  cont.innerHTML = `<div class="tabla-wrap"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">
    <thead><tr style="background:#374151;color:white;">
      <th style="padding:6px 10px;text-align:left;">Grupo</th><th style="padding:6px 8px;text-align:left;">Pedido (actual)</th>
      <th style="padding:6px 8px;text-align:right;">$/unidad común</th><th style="padding:6px 8px;text-align:left;">Sugerido</th>
      <th style="padding:6px 8px;text-align:right;">$/unidad común</th><th style="padding:6px 8px;text-align:right;">Ahorro estimado</th><th style="padding:6px 8px;">Decisión</th>
    </tr></thead>
    <tbody>${sugerencias.map(s => {
      const key = _idTrunc(s.actual.id);
      const dec = _decisionesSugerenciasPP.get(key);
      const ahorro = (s.actual$u - s.sugerido$u) * s.cantidad * (s.actual.id ? 1 : 1); // aprox: ahorro por unidad común × cantidad pedida (misma unidad de compra)
      return `<tr>
        <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${s.grupo.nombre}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);">${s.actual.descripcion}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(s.actual$u)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);color:var(--verde);font-weight:600;">${s.sugerido.descripcion}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;color:var(--verde);">${_money(s.sugerido$u)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(ahorro)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);white-space:nowrap;">
          ${dec ? `<span style="font-size:11px;color:${dec.aceptada ? 'var(--verde)' : 'var(--texto-suave)'};">${dec.aceptada ? '✓ Aceptada' : '✓ Mantener: ' + dec.motivo}</span> <button class="btn btn-xs btn-secondary" onclick="deshacerDecisionSugerenciaPP('${key}')">↺</button>`
            : `<button class="btn btn-xs" style="background:var(--verde);color:white;" onclick="aceptarSugerenciaPP('${key}','${_idTrunc(s.sugerido.id)}')">Aceptar</button> <button class="btn btn-xs btn-secondary" onclick="mantenerSugerenciaPP('${key}')">Mantener</button>`}
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}
export function aceptarSugerenciaPP(actualProductoIdTrunc, sugeridoProductoIdTrunc) {
  _decisionesSugerenciasPP.set(actualProductoIdTrunc, { aceptada: true, sustitutoIdLocal: sugeridoProductoIdTrunc });
  renderSugerenciasPP();
}
export function mantenerSugerenciaPP(actualProductoIdTrunc) {
  const motivo = prompt('Motivo para mantener el producto actual (obligatorio):');
  if (!motivo) { toast('⚠️ El motivo es obligatorio para mantener'); return; }
  _decisionesSugerenciasPP.set(actualProductoIdTrunc, { aceptada: false, motivo });
  renderSugerenciasPP();
}
export function deshacerDecisionSugerenciaPP(actualProductoIdTrunc) {
  _decisionesSugerenciasPP.delete(actualProductoIdTrunc);
  renderSugerenciasPP();
}

// ========== SIMULACIÓN MENSUAL (subtab 3) ==========

export function renderSimulacionPP() {
  const cont = $('pp-compras-simulacion'); if (!cont) return;
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  if (!periodoId) { cont.innerHTML = '<p style="padding:20px;color:var(--texto-muy-suave);">No hay ningún período habilitado todavía.</p>'; return; }
  const porProveedor = consolidadoPorProveedorPP(periodoId);
  const totalActual = [...porProveedor.values()].reduce((s, g) => s + g.total, 0);
  const sugerencias = sugerenciasEquivalentesPP(periodoId);
  const ahorroPosible = sugerencias.reduce((s, sug) => s + (sug.actual$u - sug.sugerido$u) * sug.cantidad, 0);
  const ahorroTomado = sugerencias.filter(s => _decisionesSugerenciasPP.get(_idTrunc(s.actual.id))?.aceptada)
    .reduce((s, sug) => s + (sug.actual$u - sug.sugerido$u) * sug.cantidad, 0);
  cont.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat-card"><div class="stat-label">Compra como está</div><div class="stat-valor">${_money(totalActual)}</div></div>
      <div class="stat-card verde"><div class="stat-label">Compra optimizada (con sugerencias)</div><div class="stat-valor">${_money(totalActual - ahorroPosible)}</div></div>
      <div class="stat-card acento"><div class="stat-label">Ahorro posible este mes</div><div class="stat-valor">${_money(ahorroPosible)}</div></div>
    </div>
    <p style="font-size:12.5px;color:var(--texto-suave);">De ese ahorro posible, hoy tenés <b style="color:var(--verde);">${_money(ahorroTomado)}</b> tomado (sugerencias ya aceptadas en 2 · Sugerencias) y <b style="color:var(--rojo);">${_money(ahorroPosible - ahorroTomado)}</b> sin tomar todavía.</p>
    <p style="font-size:11.5px;color:var(--texto-muy-suave);">// TODO: pendiente mockup — el reporte ANUAL de ahorro tomado/no tomado (histórico mes a mes) no está construido; esto es solo la simulación del período actual.</p>`;
}

// ========== GENERAR ÓRDENES (cierra Consolidado + Sugerencias) ==========

function siguienteNumeroOrdenPP() {
  const anio = new Date().getFullYear();
  const nums = (DB.ppOrdenesCompra || []).map(o => { const m = /OC-\d+-(\d+)/.exec(o.numero || ''); return m ? Number(m[1]) : 0; });
  return `OC-${anio}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
}
export async function generarOrdenesCompraPP() {
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  if (!periodoId) return;
  const periodo = getPeriodoPP(periodoId);
  const porProveedor = consolidadoPorProveedorPP(periodoId);
  if (!porProveedor.size) { toast('⚠️ No hay nada consolidado para generar órdenes'); return; }
  if (!confirm(`Se van a generar ${porProveedor.size} orden(es) de compra, una por proveedor. ¿Confirmás?`)) return;

  let creadas = 0;
  for (const [provId, g] of porProveedor) {
    const lineas = [...g.lineas.values()].map(l => {
      const key = _idTrunc(l.producto.id);
      const dec = _decisionesSugerenciasPP.get(key);
      if (dec?.aceptada) {
        const sustituto = getProductoPP(dec.sustitutoIdLocal);
        if (sustituto) return { productoIdLocal: _idTrunc(sustituto.id), codigoProveedor: sustituto.codigoMonica || '', descripcion: sustituto.descripcion, costoUnit: precioVigente(sustituto.id), cantidad: l.cantidad, cantidadRecibida: 0, obsLinea: `SUSTITUIDO POR EQUIVALENTE (era ${l.producto.descripcion})` };
      }
      return { productoIdLocal: _idTrunc(l.producto.id), codigoProveedor: l.producto.codigoMonica || '', descripcion: l.producto.descripcion, costoUnit: l.costoUnit, cantidad: l.cantidad, cantidadRecibida: 0, obsLinea: dec && !dec.aceptada ? `Mantener — ${dec.motivo}` : '' };
    });
    const orden = {
      id: _id('PPOC'), numero: siguienteNumeroOrdenPP(), periodoIdLocal: _idTrunc(periodoId), proveedorIdLocal: provId,
      estado: 'confirmada', items: lineas, total: lineas.reduce((s, l) => s + l.cantidad * l.costoUnit, 0),
      confirmadaPor: currentUser?.nombre || '', confirmadaEn: new Date().toISOString(), anulado: false,
    };
    if (!DB.ppOrdenesCompra) DB.ppOrdenesCompra = [];
    DB.ppOrdenesCompra.push(orden);
    await supaSync('ppOrdenesCompra', orden);

    // Marca los ítems como ya incluidos en esta orden — no vuelven a
    // aparecer en una consolidación futura del mismo período.
    for (const it of itemsConsolidablesPP(periodoId)) {
      const prod = getProductoPP(it.productoIdLocal);
      if (prod && String(prod.proveedorIdLocal) === provId) {
        it.ordenCompraIdLocal = _idTrunc(orden.id);
        await supaSync('ppItems', it);
      }
    }
    creadas++;
  }
  _decisionesSugerenciasPP.clear();
  renderConsolidadoPP(); renderSugerenciasPP();
  toast(`✓ ${creadas} orden(es) de compra generada(s)`);
}

// ========== ÓRDENES Y SEGUIMIENTO (subtab 4) ==========

const PIPE_ORDEN = ['confirmada', 'enviada', 'recibida_parcial', 'recibida_completa'];
const LABEL_ORDEN = { confirmada: 'Confirmada', enviada: 'Enviada', recibida_parcial: 'Recibida parcial', recibida_completa: 'Recibida completa' };
const COLOR_ORDEN = { confirmada: '#0ea5e9', enviada: '#2563eb', recibida_parcial: '#0b6470', recibida_completa: '#16a34a' };

export function renderOrdenesPP() {
  const cont = $('pp-compras-ordenes'); const tbody = $('tbody-pp-compras-ordenes');
  const periodoId = ($('pp-compra-periodo-sel') || {}).value;
  const ordenes = (DB.ppOrdenesCompra || []).filter(o => !o.anulado && _idTrunc(o.periodoIdLocal) === _idTrunc(periodoId));
  if (cont) {
    cont.innerHTML = ordenes.length ? ordenes.map(o => {
      const prov = getProveedorPP(o.proveedorIdLocal);
      const recibidas = o.items.filter(l => (l.cantidadRecibida || 0) >= l.cantidad).length;
      return `<div class="card" style="cursor:pointer;" onclick="abrirDetalleOrdenPP('${o.id}')">
        <div style="display:flex;align-items:center;gap:10px;">
          <b>${o.numero}</b> <span class="badge" style="background:#0ea5e9;color:white;">${prov ? prov.nombre : o.proveedorIdLocal}</span>
          <span style="margin-left:auto;" class="badge" style="background:${COLOR_ORDEN[o.estado]};color:white;">${LABEL_ORDEN[o.estado]}</span>
        </div>
        <div style="font-size:12.5px;margin-top:6px;">${o.items.length} línea(s) · ${_money(o.total)} · confirmada ${o.confirmadaEn ? new Date(o.confirmadaEn).toLocaleDateString('es-AR') : ''}${o.estado !== 'confirmada' ? ` · recibidas ${recibidas}/${o.items.length}` : ''}</div>
      </div>`;
    }).join('') : '<p style="padding:20px;color:var(--texto-muy-suave);">Sin órdenes en este período todavía.</p>';
  }
  if (tbody) {
    tbody.innerHTML = ordenes.length ? ordenes.map(o => {
      const prov = getProveedorPP(o.proveedorIdLocal);
      return `<tr>
        <td style="padding:6px 12px;border:1px solid var(--borde);font-weight:600;">${o.numero}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);">${prov ? prov.nombre : o.proveedorIdLocal}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${o.items.length}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;">${_money(o.total)}</td>
        <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;"><span class="badge" style="background:${COLOR_ORDEN[o.estado]};color:white;">${LABEL_ORDEN[o.estado]}</span></td>
        <td style="padding:6px 8px;border:1px solid var(--borde);">
          ${o.facturaRegistradoEn ? `✓ ${o.facturaNro}` : (o.estado.startsWith('recibida') ? `<button class="btn btn-xs btn-secondary" onclick="abrirFacturaOrdenPP('${o.id}')">Registrar factura</button>` : '<span class="text-muted">esperando recepción</span>')}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--texto-muy-suave);">Sin órdenes en este período todavía.</td></tr>';
  }
}

export async function enviarOrdenPP(ordenId) {
  const o = (DB.ppOrdenesCompra || []).find(x => _idTrunc(x.id) === _idTrunc(ordenId)); if (!o || o.estado !== 'confirmada') return;
  o.estado = 'enviada'; o.enviadaEn = new Date().toISOString();
  await supaSync('ppOrdenesCompra', o);
  cerrarModal('modal-pp-orden-detalle');
  renderOrdenesPP();
  toast(`✓ Orden ${o.numero} enviada al proveedor`);
}

let _ppOrdenModalId = null;
export function abrirDetalleOrdenPP(ordenId) {
  _ppOrdenModalId = ordenId;
  ensureModalOrdenDetallePP();
  renderModalOrdenDetallePP();
  abrirModal('modal-pp-orden-detalle');
}
function ensureModalOrdenDetallePP() {
  if ($('modal-pp-orden-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-orden-detalle';
  m.innerHTML = `
    <div class="modal" style="max-width:820px;">
      <div class="modal-header"><h3 id="pp-orden-titulo">Orden de compra</h3><button class="btn-close" onclick="cerrarModal('modal-pp-orden-detalle')">×</button></div>
      <div class="modal-body">
        <div id="pp-orden-resumen" style="margin-bottom:12px;font-size:12.5px;"></div>
        <div id="pp-orden-backorder" style="display:none;margin-bottom:12px;padding:10px 14px;border-radius:var(--radio);background:#fff3e0;border:1px solid #ffcc80;font-size:12.5px;"></div>
        <div class="tabla-wrap"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">
          <thead><tr style="background:#374151;color:white;">
            <th style="padding:6px 10px;text-align:left;">Producto</th><th style="padding:6px 8px;text-align:right;">Costo</th>
            <th style="padding:6px 8px;text-align:right;">Pedido</th><th style="padding:6px 8px;text-align:right;width:110px;">Recibido</th><th style="padding:6px 8px;text-align:left;">Obs.</th>
          </tr></thead>
          <tbody id="pp-orden-tbody"></tbody>
        </table></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-orden-detalle')">Cerrar</button>
        <button class="btn btn-secondary" id="pp-orden-btn-enviar" onclick="">Marcar ENVIADA</button>
        <button class="btn btn-primary" id="pp-orden-btn-recibir" onclick="">Guardar recepción</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function renderModalOrdenDetallePP() {
  const o = (DB.ppOrdenesCompra || []).find(x => _idTrunc(x.id) === _idTrunc(_ppOrdenModalId)); if (!o) return;
  const prov = getProveedorPP(o.proveedorIdLocal);
  const editableRecepcion = ['enviada', 'recibida_parcial'].includes(o.estado);
  $('pp-orden-titulo').textContent = `${o.numero} — ${prov ? prov.nombre : o.proveedorIdLocal}`;
  $('pp-orden-resumen').innerHTML = `${o.items.length} línea(s) · ${_money(o.total)} · <span class="badge" style="background:${COLOR_ORDEN[o.estado]};color:white;">${LABEL_ORDEN[o.estado]}</span>`;
  $('pp-orden-tbody').innerHTML = o.items.map((l, i) => `<tr>
      <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${l.descripcion}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(l.costoUnit)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${l.cantidad}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">
        <input type="number" min="0" max="${l.cantidad}" value="${l.cantidadRecibida || 0}" ${editableRecepcion ? '' : 'disabled'} data-idx="${i}" class="pp-orden-recibido-input" style="width:70px;padding:3px 6px;border:1px solid var(--borde-fuerte);border-radius:4px;text-align:right;">
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);font-size:11px;color:var(--texto-suave);">${l.obsLinea || ''}</td>
    </tr>`).join('');
  const btnEnviar = $('pp-orden-btn-enviar'), btnRecibir = $('pp-orden-btn-recibir'), boxBackorder = $('pp-orden-backorder');
  if (btnEnviar) { btnEnviar.setAttribute('onclick', `enviarOrdenPP('${o.id}')`); btnEnviar.style.display = o.estado === 'confirmada' ? 'inline-flex' : 'none'; }
  if (btnRecibir) { btnRecibir.setAttribute('onclick', `guardarRecepcionOrdenPP('${o.id}')`); btnRecibir.style.display = editableRecepcion ? 'inline-flex' : 'none'; }
  if (boxBackorder) {
    const pendientes = o.items.filter(l => (l.cantidadRecibida || 0) < l.cantidad);
    boxBackorder.style.display = editableRecepcion && pendientes.length ? 'block' : 'none';
    if (pendientes.length) boxBackorder.innerHTML = `<b>Backorder:</b> ${pendientes.map(l => `${l.descripcion} (${l.cantidad - (l.cantidadRecibida || 0)} un.)`).join(', ')} — <label>fecha comprometida: <input type="date" id="pp-orden-backorder-fecha" value="${o.backorderFechaComprometida || ''}"></label>`;
  }
}
// Guarda la recepción (completa o parcial): actualiza cantidadRecibida de
// cada línea, calcula el estado de la orden, registra la ENTRADA al
// stock por la diferencia recibida en ESTA carga (no duplica lo ya
// cargado antes), y marca "listo para armar" los pp_items de los
// pedidos cuya línea quedó 100% recibida (ver entregas.js).
export async function guardarRecepcionOrdenPP(ordenId) {
  const o = (DB.ppOrdenesCompra || []).find(x => _idTrunc(x.id) === _idTrunc(ordenId)); if (!o) return;
  const inputs = [...document.querySelectorAll('.pp-orden-recibido-input')];
  const { registrarMovimientoStockProducto } = await import('@modules/uniformes/stock.js');
  let algunoParcial = false;
  for (const inp of inputs) {
    const i = Number(inp.dataset.idx);
    const linea = o.items[i];
    const nuevoRecibido = Math.max(0, Math.min(linea.cantidad, parseFloat(inp.value) || 0));
    const delta = nuevoRecibido - (linea.cantidadRecibida || 0);
    if (delta > 0) {
      await registrarMovimientoStockProducto({
        tipo: 'entrada', productoIdLocal: linea.productoIdLocal, cantidad: delta, costoUnitario: linea.costoUnit,
        motivo: `Recepción orden ${o.numero}`, refTipo: 'orden_compra', refIdLocal: _idTrunc(o.id),
      });
    }
    linea.cantidadRecibida = nuevoRecibido;
    if (nuevoRecibido < linea.cantidad) algunoParcial = true;
  }
  const fechaBackorder = ($('pp-orden-backorder-fecha') || {}).value;
  if (fechaBackorder) o.backorderFechaComprometida = fechaBackorder;
  o.estado = algunoParcial ? 'recibida_parcial' : 'recibida_completa';
  o.recibidaEn = new Date().toISOString();
  await supaSync('ppOrdenesCompra', o);

  // Marca cantidadRecibida en los pp_items que se abastecen de esta
  // orden — "listo para armar" en Entregas lo lee de acá.
  const itemsDeEstaOrden = (DB.ppItems || []).filter(it => it.ordenCompraIdLocal === _idTrunc(o.id));
  for (const it of itemsDeEstaOrden) {
    const linea = o.items.find(l => l.productoIdLocal === _idTrunc(it.productoIdLocal));
    if (linea) { it.cantidadRecibida = linea.cantidadRecibida; await supaSync('ppItems', it); }
  }

  renderModalOrdenDetallePP();
  renderOrdenesPP();
  toast(o.estado === 'recibida_completa' ? `✓ Orden ${o.numero} recibida completa` : `✓ Recepción parcial de ${o.numero} guardada`);
}

// ========== FACTURA DEL PROVEEDOR (alimenta PPP + cta cte) ==========

export function abrirFacturaOrdenPP(ordenId) {
  _ppOrdenModalId = ordenId;
  ensureModalFacturaPP();
  const o = (DB.ppOrdenesCompra || []).find(x => _idTrunc(x.id) === _idTrunc(ordenId)); if (!o) return;
  $('pp-fact-titulo').textContent = `Registrar factura — ${o.numero}`;
  $('pp-fact-nro').value = ''; $('pp-fact-fecha').value = hoyStr(); $('pp-fact-monto').value = o.total;
  abrirModal('modal-pp-factura');
}
function ensureModalFacturaPP() {
  if ($('modal-pp-factura')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-factura';
  m.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header"><h3 id="pp-fact-titulo">Registrar factura</h3><button class="btn-close" onclick="cerrarModal('modal-pp-factura')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>N° de factura *</label><input type="text" id="pp-fact-nro"></div>
        <div class="form-group"><label>Fecha *</label><input type="date" id="pp-fact-fecha"></div>
        <div class="form-group"><label>Monto *</label><input type="number" min="0" step="0.01" id="pp-fact-monto"></div>
        <p style="font-size:11.5px;color:var(--texto-suave);">Lo realmente pagado alimenta el PPP de cada producto (costo promedio ponderado) y genera el movimiento en la cuenta corriente del proveedor.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-factura')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarFacturaOrdenPP()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
export async function confirmarFacturaOrdenPP() {
  const o = (DB.ppOrdenesCompra || []).find(x => _idTrunc(x.id) === _idTrunc(_ppOrdenModalId)); if (!o) return;
  const nro = ($('pp-fact-nro') || {}).value.trim();
  const fecha = ($('pp-fact-fecha') || {}).value;
  const monto = parseFloat(($('pp-fact-monto') || {}).value);
  if (!nro) { toast('⚠️ Falta el N° de factura'); return; }
  if (!fecha) { toast('⚠️ Falta la fecha'); return; }
  if (!monto || monto <= 0) { toast('⚠️ Falta el monto'); return; }

  o.facturaNro = nro; o.facturaFecha = fecha; o.facturaMonto = monto;
  o.facturaRegistradoPor = currentUser?.nombre || ''; o.facturaRegistradoEn = new Date().toISOString();
  await supaSync('ppOrdenesCompra', o);

  // Si lo facturado difiere del total a lista, se prorratea la diferencia
  // por línea (proporcional al importe) para que el PPP de cada producto
  // refleje lo REALMENTE pagado, no el precio de lista con el que se
  // armó la orden.
  const { registrarMovimientoStockProducto } = await import('@modules/uniformes/stock.js');
  const diferencia = monto - o.total;
  for (const l of o.items) {
    if (!l.cantidadRecibida) continue;
    const importeLinea = l.cantidad * l.costoUnit;
    const costoRealUnit = o.total > 0 ? l.costoUnit + (diferencia * (importeLinea / o.total)) / l.cantidad : l.costoUnit;
    // Ajuste de PPP: se registra como un "ajuste" de costo (cantidad 0) si
    // ya se había cargado la entrada al recibir — evita duplicar
    // unidades, solo corrige el costo promedio con el precio real.
    if (Math.abs(costoRealUnit - l.costoUnit) > 0.01) {
      await registrarMovimientoStockProducto({
        tipo: 'ajuste', productoIdLocal: l.productoIdLocal, cantidad: 0, costoUnitario: costoRealUnit,
        motivo: `Ajuste de costo por factura ${nro} (${o.numero})`, refTipo: 'orden_compra_factura', refIdLocal: _idTrunc(o.id),
      });
    }
  }

  const mov = {
    id: _id('CTACTE'), proveedorIdLocal: o.proveedorIdLocal, tipo: 'factura', monto,
    motivo: `Factura ${nro} — orden ${o.numero}`, refTipo: 'orden_compra', refIdLocal: _idTrunc(o.id),
    registradoPor: currentUser?.nombre || '', fecha,
  };
  if (!DB.proveedoresCtaCteMovimientos) DB.proveedoresCtaCteMovimientos = [];
  DB.proveedoresCtaCteMovimientos.push(mov);
  await supaSync('proveedoresCtaCteMovimientos', mov);

  cerrarModal('modal-pp-factura');
  renderOrdenesPP();
  toast(`✓ Factura ${nro} registrada — PPP y cuenta corriente actualizados`);
}

// ========== COMPARADOR DE PRECIOS / GRUPOS DE EQUIVALENCIA (subtab 5) ==========

export function renderComparadorPreciosPP() {
  const cont = $('pp-compras-comparador'); if (!cont) return;
  const grupos = (DB.ppGruposEquivalencia || []).filter(g => !g.anulado);
  if (!grupos.length) { cont.innerHTML = '<p style="padding:20px;color:var(--texto-muy-suave);">Sin grupos de equivalencia todavía.</p>'; return; }
  cont.innerHTML = grupos.map(g => {
    const gid = g.idLocal || _idTrunc(g.id);
    const miembros = (DB.ppGruposEquivalenciaItems || []).filter(gi => gi.grupoIdLocal === gid || _idTrunc(gi.grupoIdLocal) === _idTrunc(gid));
    const filas = miembros.map(m => {
      const prod = getProductoPP(m.productoIdLocal);
      if (!prod) return null;
      const $u = $porUnidadComunPP(prod.id);
      return { prod, $u, factor: m.factorConversion };
    }).filter(Boolean).sort((a, b) => (a.$u ?? Infinity) - (b.$u ?? Infinity));
    const masBarato = filas[0];
    return `<div class="card" style="margin-bottom:12px;">
      <div class="card-header"><h3>${g.nombre} <span style="font-weight:400;color:var(--texto-suave);font-size:12px;">— unidad: ${g.unidadComun}</span></h3></div>
      <div class="tabla-wrap"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="background:#374151;color:white;"><th style="padding:6px 10px;text-align:left;">Producto</th><th style="padding:6px 8px;text-align:right;">Precio lista</th><th style="padding:6px 8px;text-align:right;">Factor</th><th style="padding:6px 8px;text-align:right;">$/unidad común</th><th style="padding:6px 8px;"></th></tr></thead>
        <tbody>${filas.map(f => `<tr${f === masBarato ? ' style="background:var(--verde-suave,#e8f8ee);"' : ''}>
          <td style="padding:5px 10px;border-bottom:1px solid var(--borde);">${f.prod.descripcion}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${_money(precioVigente(f.prod.id))}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">×${f.factor}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;font-weight:700;">${f.$u != null ? _money(f.$u) : '—'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);">${f === masBarato ? '<span class="badge" style="background:#16a34a;color:white;">MÁS BARATO</span>' : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }).join('')
  + '<p style="font-size:11.5px;color:var(--texto-muy-suave);">// TODO: pendiente mockup — la evolución de precios a 3 meses (▲/▼ %) no está construida, se necesita historial de vigencias por grupo.</p>';
}

let _ppGrupoEditandoId = null;
let _ppGrupoItemsTemp = [];
export function abrirNuevoGrupoEquivalenciaPP() {
  _ppGrupoEditandoId = null; _ppGrupoItemsTemp = [];
  ensureModalGrupoPP();
  $('pp-grupo-nombre').value = ''; $('pp-grupo-unidad').value = '';
  renderItemsGrupoTemp();
  abrirModal('modal-pp-grupo');
}
function ensureModalGrupoPP() {
  if ($('modal-pp-grupo')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-pp-grupo';
  m.innerHTML = `
    <div class="modal" style="max-width:600px;">
      <div class="modal-header"><h3>+ Nuevo grupo de equivalencia</h3><button class="btn-close" onclick="cerrarModal('modal-pp-grupo')">×</button></div>
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Nombre *</label><input type="text" id="pp-grupo-nombre" placeholder="Ej: Bolsa 60x90 negra"></div>
          <div class="form-group"><label>Unidad común *</label><input type="text" id="pp-grupo-unidad" placeholder="Ej: BOLSA, LITRO"></div>
        </div>
        <div class="form-section">Miembros</div>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <input type="text" id="pp-grupo-add-buscar" placeholder="🔍 Buscar producto para agregar..." style="flex:1;padding:6px 10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);" oninput="buscarProductoParaGrupoPP()">
        </div>
        <div id="pp-grupo-add-resultados" style="max-height:120px;overflow-y:auto;margin-bottom:10px;"></div>
        <div id="pp-grupo-items-lista"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-pp-grupo')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarGrupoEquivalenciaPP()">Guardar grupo</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
export function buscarProductoParaGrupoPP() {
  const q = (($('pp-grupo-add-buscar') || {}).value || '').toLowerCase();
  const cont = $('pp-grupo-add-resultados'); if (!cont) return;
  if (!q || q.length < 2) { cont.innerHTML = ''; return; }
  const yaAgregados = new Set(_ppGrupoItemsTemp.map(i => i.productoIdLocal));
  const resultados = (DB.ppProductos || []).filter(p => !p.anulado && !yaAgregados.has(_idTrunc(p.id)) && p.descripcion.toLowerCase().includes(q)).slice(0, 8);
  cont.innerHTML = resultados.map(p => `<div style="padding:5px 8px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--borde);" onclick="agregarProductoAGrupoPP('${p.id}')">${p.descripcion} <span class="text-muted">(${getProveedorPP(p.proveedorIdLocal)?.nombre || 'sin proveedor'})</span></div>`).join('') || '<p class="text-muted" style="font-size:11px;padding:4px;">Sin resultados</p>';
}
export function agregarProductoAGrupoPP(productoId) {
  _ppGrupoItemsTemp.push({ productoIdLocal: _idTrunc(productoId), factorConversion: 1 });
  $('pp-grupo-add-buscar').value = ''; $('pp-grupo-add-resultados').innerHTML = '';
  renderItemsGrupoTemp();
}
export function quitarProductoDeGrupoPP(productoIdTrunc) {
  _ppGrupoItemsTemp = _ppGrupoItemsTemp.filter(i => i.productoIdLocal !== productoIdTrunc);
  renderItemsGrupoTemp();
}
export function cambiarFactorGrupoPP(productoIdTrunc, valor) {
  const it = _ppGrupoItemsTemp.find(i => i.productoIdLocal === productoIdTrunc);
  if (it) it.factorConversion = parseFloat(valor) || 1;
}
function renderItemsGrupoTemp() {
  const cont = $('pp-grupo-items-lista'); if (!cont) return;
  cont.innerHTML = _ppGrupoItemsTemp.length ? _ppGrupoItemsTemp.map(it => {
    const prod = getProductoPP(it.productoIdLocal);
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px;">
      <span style="flex:1;">${prod ? prod.descripcion : it.productoIdLocal}</span>
      <label style="white-space:nowrap;">factor <input type="number" min="0.01" step="0.01" value="${it.factorConversion}" style="width:70px;padding:3px 6px;border:1px solid var(--borde-fuerte);border-radius:4px;" onchange="cambiarFactorGrupoPP('${it.productoIdLocal}',this.value)"></label>
      <button class="btn btn-xs btn-secondary" onclick="quitarProductoDeGrupoPP('${it.productoIdLocal}')">Quitar</button>
    </div>`;
  }).join('') : '<p class="text-muted" style="font-size:11px;">Agregá al menos 2 productos para poder comparar.</p>';
}
export async function guardarGrupoEquivalenciaPP() {
  const nombre = ($('pp-grupo-nombre') || {}).value.trim();
  const unidad = ($('pp-grupo-unidad') || {}).value.trim();
  if (!nombre) { toast('⚠️ Falta el nombre'); return; }
  if (!unidad) { toast('⚠️ Falta la unidad común'); return; }
  if (_ppGrupoItemsTemp.length < 2) { toast('⚠️ Agregá al menos 2 productos'); return; }

  const grupo = { id: _id('PPGEQ'), nombre, unidadComun: unidad, anulado: false };
  if (!DB.ppGruposEquivalencia) DB.ppGruposEquivalencia = [];
  DB.ppGruposEquivalencia.push(grupo);
  await supaSync('ppGruposEquivalencia', grupo);
  const gid = _idTrunc(grupo.id);
  for (const it of _ppGrupoItemsTemp) {
    const item = { id: _id('PPGEQI'), grupoIdLocal: gid, productoIdLocal: it.productoIdLocal, factorConversion: it.factorConversion };
    if (!DB.ppGruposEquivalenciaItems) DB.ppGruposEquivalenciaItems = [];
    DB.ppGruposEquivalenciaItems.push(item);
    await supaSync('ppGruposEquivalenciaItems', item);
  }
  cerrarModal('modal-pp-grupo');
  renderComparadorPreciosPP();
  toast(`✓ Grupo "${nombre}" guardado con ${_ppGrupoItemsTemp.length} producto(s)`);
}
