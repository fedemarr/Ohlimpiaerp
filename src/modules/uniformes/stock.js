// Stock de uniformes (ticket "Módulo Logística" 08/2026, fase 2 — Stock).
// El circuito de pedidos, precios de venta/descuento a operarios y
// devoluciones YA existían (uniformes.js/flujo.js/precios.js/
// descuentos.js) — esto agrega el control de stock físico que faltaba
// (reemplaza el ítem "Próximamente" del menú).
//
// 3 vistas + 1 acción integrada al flujo existente:
// - Stock actual: nivel lógico por prenda/talle.
// - Movimientos: ledger completo (entradas/salidas/ajustes), auditoría
//   y base para una futura Previsión de compras (consumo histórico).
// - Compras: alta de un lote de compra a proveedor (costo real pagado —
//   distinto de precios_uniformes, que es lo que se le cobra al
//   operario por pérdida/daño, no lo que la cooperativa pagó).
// - Conteo físico: Logística carga el conteo real del depósito de vez
//   en cuando: precarga con el stock lógico, el usuario corrige lo que
//   difiera, y al guardar se generan movimientos de tipo 'ajuste' con
//   la diferencia real — no automatiza el conteo en sí (requeriría
//   lector de código de barras, fuera de alcance).
//
// Salida automática: descontarStockPorPedido() se llama desde
// flujo.js → logisticaRecibe() (mismo módulo, sin indirección por
// window) al pasar el pedido a "En preparación por Logística" — así
// dos pedidos no pueden reservar la misma prenda "de palabra".

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { PRENDAS, TALLES_POR_PRENDA } from './catalogos.js';

// ========== NIVEL DE STOCK + MOVIMIENTOS (ledger) ==========

function getStockRow(prenda, talle) {
  return (DB.stockUniformes || []).find(s => s.prenda === prenda && s.talle === talle);
}

async function ajustarNivelStock(prenda, talle, delta) {
  let row = getStockRow(prenda, talle);
  if (!row) {
    row = { id: Date.now() + Math.floor(Math.random() * 1000), prenda, talle, cantidad: 0 };
    DB.stockUniformes = DB.stockUniformes || [];
    DB.stockUniformes.push(row);
  }
  row.cantidad = (row.cantidad || 0) + delta;
  await supaSync('stockUniformes', row);
  return row;
}

// Único punto de entrada para tocar stock — siempre registra el
// movimiento Y actualiza el nivel en la misma llamada. 'entrada'/
// 'salida': cantidad se pasa siempre positiva (el signo lo pone el
// tipo). 'ajuste' (conteo físico): cantidad ya viene con el signo real
// de la diferencia (puede ser negativa).
export async function registrarMovimientoStock({ tipo, prenda, talle, cantidad, motivo, refTipo, refIdLocal }) {
  const delta = tipo === 'salida' ? -Math.abs(cantidad) : tipo === 'entrada' ? Math.abs(cantidad) : cantidad;
  await ajustarNivelStock(prenda, talle, delta);
  const mov = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    tipo, prenda, talle, cantidad: delta, motivo: motivo || '',
    refTipo: refTipo || '', refIdLocal: refIdLocal || '',
    registradoPor: currentUser?.nombre || '',
  };
  await supaSync('stockUniformesMovimientos', mov);
  if (!DB.stockUniformesMovimientos) DB.stockUniformesMovimientos = [];
  DB.stockUniformesMovimientos.push(mov);
}

// Llamado desde flujo.js (logisticaRecibe). Si algún ítem queda en
// negativo no bloquea el pedido — la prioridad es no trabar el
// circuito por un desfasaje de stock — pero el nivel negativo queda
// visible en la pantalla de Stock como alerta (⚠️).
export async function descontarStockPorPedido(pedido, prendas) {
  for (const pr of prendas) {
    await registrarMovimientoStock({
      tipo: 'salida', prenda: pr.prenda, talle: pr.talle, cantidad: pr.cantidad,
      motivo: 'Pedido de uniforme — ' + (pedido.nombreOperario || ''),
      refTipo: 'pedido', refIdLocal: String(pedido.id).slice(-9),
    });
  }
}

// ========== TAB: STOCK ACTUAL ==========

export function renderStockUniformes() {
  const tbody = $('tbody-stock-uniformes');
  if (!tbody) return;
  const q = ($('stock-buscar') || {}).value?.toLowerCase() || '';
  let filas = [...(DB.stockUniformes || [])];
  if (q) filas = filas.filter(s => s.prenda.toLowerCase().includes(q) || s.talle.toLowerCase().includes(q));
  filas.sort((a, b) => a.prenda.localeCompare(b.prenda) || String(a.talle).localeCompare(String(b.talle), undefined, { numeric: true }));
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="3" style="text-align:center;padding:24px;opacity:.5;">Sin stock cargado — sumá una compra</td></tr>'
    : filas.map(s => `<tr>
        <td>${s.prenda}</td>
        <td>${s.talle}</td>
        <td style="font-weight:700;color:${s.cantidad < 0 ? 'var(--rojo)' : s.cantidad === 0 ? 'var(--naranja)' : 'var(--azul)'};">${s.cantidad}${s.cantidad < 0 ? ' ⚠️' : ''}</td>
      </tr>`).join('');
}
export function filtrarStockUniformes() { renderStockUniformes(); }

// ========== TAB: MOVIMIENTOS ==========

export function renderMovimientosStockUniformes() {
  const tbody = $('tbody-stock-movimientos');
  if (!tbody) return;
  // No hay timestamp confiable del lado del cliente antes de recargar
  // desde Supabase (created_at lo pone el default de la tabla) — se
  // usa el orden de carga (más reciente al final) y se invierte.
  const movs = [...(DB.stockUniformesMovimientos || [])].reverse();
  const TIPO_LABEL = { entrada: '⬆️ Entrada', salida: '⬇️ Salida', ajuste: '⚖️ Ajuste' };
  tbody.innerHTML = movs.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5;">Sin movimientos registrados</td></tr>'
    : movs.slice(0, 300).map(m => `<tr>
        <td>${TIPO_LABEL[m.tipo] || m.tipo}</td>
        <td>${m.prenda}</td>
        <td>${m.talle}</td>
        <td style="font-weight:700;color:${m.cantidad < 0 ? 'var(--rojo)' : 'var(--verde)'};">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</td>
        <td style="font-size:12px;color:var(--texto-suave);">${m.motivo || '—'}</td>
        <td style="font-size:12px;color:var(--texto-suave);">${m.registradoPor || '—'}</td>
      </tr>`).join('');
}

// ========== TAB: COMPRAS (alta de lote) ==========

let _itemsCompraTemp = [];

export function abrirNuevaCompra() {
  _itemsCompraTemp = [];
  const f = $('compra-fecha'); if (f) f.value = new Date().toISOString().slice(0, 10);
  const p = $('compra-proveedor'); if (p) p.value = '';
  const nf = $('compra-nro-factura'); if (nf) nf.value = '';
  const obs = $('compra-obs'); if (obs) obs.value = '';
  renderItemsCompraTemp();
  abrirModal('modal-nueva-compra-uniformes');
}

export function agregarItemCompra() {
  _itemsCompraTemp.push({ prenda: PRENDAS[0], talle: TALLES_POR_PRENDA[PRENDAS[0]][0], cantidad: 1, costoUnitario: 0 });
  renderItemsCompraTemp();
}
export function quitarItemCompra(i) { _itemsCompraTemp.splice(i, 1); renderItemsCompraTemp(); }
export function cambiarPrendaItemCompra(i, prenda) { _itemsCompraTemp[i].prenda = prenda; _itemsCompraTemp[i].talle = TALLES_POR_PRENDA[prenda][0]; renderItemsCompraTemp(); }
export function cambiarTalleItemCompra(i, talle) { _itemsCompraTemp[i].talle = talle; }
export function cambiarCantidadItemCompra(i, v) { _itemsCompraTemp[i].cantidad = Math.max(1, parseInt(v) || 1); renderItemsCompraTemp(); }
export function cambiarCostoItemCompra(i, v) { _itemsCompraTemp[i].costoUnitario = Math.max(0, parseFloat(v) || 0); renderItemsCompraTemp(); }

function renderItemsCompraTemp() {
  const cont = $('compra-items-lista');
  if (!cont) return;
  cont.innerHTML = _itemsCompraTemp.map((it, i) => `
    <div style="display:grid;grid-template-columns:1fr 1fr 80px 120px 32px;gap:6px;align-items:center;margin-bottom:6px;">
      <select onchange="cambiarPrendaItemCompra(${i}, this.value)">${PRENDAS.map(p => `<option ${p === it.prenda ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <select onchange="cambiarTalleItemCompra(${i}, this.value)">${(TALLES_POR_PRENDA[it.prenda] || []).map(t => `<option ${t === it.talle ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input type="number" min="1" value="${it.cantidad}" onchange="cambiarCantidadItemCompra(${i}, this.value)">
      <input type="number" min="0" step="0.01" placeholder="Costo unit." value="${it.costoUnitario}" onchange="cambiarCostoItemCompra(${i}, this.value)">
      <button type="button" class="btn btn-danger btn-xs" onclick="quitarItemCompra(${i})">✕</button>
    </div>`).join('') || '<p style="opacity:.5;font-size:12px;">Sin ítems — agregá al menos una prenda</p>';
  const totalEl = $('compra-total');
  if (totalEl) totalEl.textContent = '$' + _itemsCompraTemp.reduce((s, it) => s + it.cantidad * it.costoUnitario, 0).toLocaleString('es-AR');
}

export async function guardarCompraUniformes() {
  if (!_itemsCompraTemp.length) { toast('⚠️ Agregá al menos una prenda'); return; }
  const fecha = ($('compra-fecha') || {}).value;
  if (!fecha) { toast('⚠️ Ingresá la fecha de la compra'); return; }
  const total = _itemsCompraTemp.reduce((s, it) => s + it.cantidad * it.costoUnitario, 0);
  const compra = {
    id: Date.now(), fecha,
    proveedor: ($('compra-proveedor') || {}).value || '',
    nroFactura: ($('compra-nro-factura') || {}).value || '',
    items: [..._itemsCompraTemp], total,
    observaciones: ($('compra-obs') || {}).value || '',
    registradoPor: currentUser?.nombre || '',
  };
  const ok = await supaSync('comprasUniformes', compra);
  if (!ok) { toast('⚠️ No se pudo guardar la compra — reintentá'); return; }
  if (!DB.comprasUniformes) DB.comprasUniformes = [];
  DB.comprasUniformes.push(compra);
  for (const it of _itemsCompraTemp) {
    await registrarMovimientoStock({
      tipo: 'entrada', prenda: it.prenda, talle: it.talle, cantidad: it.cantidad,
      motivo: 'Compra' + (compra.proveedor ? ' — ' + compra.proveedor : '') + (compra.nroFactura ? ' (Fact. ' + compra.nroFactura + ')' : ''),
      refTipo: 'compra', refIdLocal: String(compra.id).slice(-9),
    });
  }
  cerrarModal('modal-nueva-compra-uniformes');
  renderStockUniformes();
  renderMovimientosStockUniformes();
  renderComprasUniformes();
  toast('✅ Compra registrada — stock actualizado');
}

export function renderComprasUniformes() {
  const tbody = $('tbody-stock-compras');
  if (!tbody) return;
  const compras = [...(DB.comprasUniformes || [])].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  tbody.innerHTML = compras.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5;">Sin compras registradas</td></tr>'
    : compras.map(c => `<tr>
        <td>${c.fecha}</td>
        <td>${c.proveedor || '—'}</td>
        <td>${c.nroFactura || '—'}</td>
        <td style="font-size:12px;">${(c.items || []).map(it => `${it.cantidad}x ${it.prenda} (${it.talle})`).join(', ')}</td>
        <td style="font-weight:700;">$${(c.total || 0).toLocaleString('es-AR')}</td>
        <td style="font-size:12px;color:var(--texto-suave);">${c.registradoPor || '—'}</td>
      </tr>`).join('');
}

// ========== TAB: CONTEO FÍSICO ==========

let _itemsConteoTemp = [];

export function abrirConteoFisico() {
  // Precarga con el stock lógico actual — Logística solo corrige lo
  // que difiera del conteo real, no tipea todo de cero.
  _itemsConteoTemp = (DB.stockUniformes || []).map(s => ({ prenda: s.prenda, talle: s.talle, cantidadSistema: s.cantidad, cantidadContada: s.cantidad }));
  const obs = $('conteo-obs'); if (obs) obs.value = '';
  renderItemsConteoTemp();
  abrirModal('modal-conteo-fisico-uniformes');
}

function renderItemsConteoTemp() {
  const cont = $('conteo-items-lista');
  if (!cont) return;
  cont.innerHTML = _itemsConteoTemp.map((it, i) => {
    const dif = it.cantidadContada - it.cantidadSistema;
    return `<div style="display:grid;grid-template-columns:1fr 80px 90px 70px;gap:6px;align-items:center;margin-bottom:4px;font-size:12px;">
      <div>${it.prenda} / ${it.talle}</div>
      <div style="text-align:center;">Sistema: ${it.cantidadSistema}</div>
      <input type="number" value="${it.cantidadContada}" onchange="cambiarCantidadContadaConteo(${i}, this.value)">
      <div style="text-align:center;color:${dif === 0 ? 'var(--verde)' : dif > 0 ? 'var(--azul)' : 'var(--rojo)'};font-weight:700;">${dif > 0 ? '+' : ''}${dif}</div>
    </div>`;
  }).join('') || '<p style="opacity:.5;font-size:12px;">No hay stock cargado todavía para contar</p>';
}
export function cambiarCantidadContadaConteo(i, v) { _itemsConteoTemp[i].cantidadContada = parseInt(v) || 0; renderItemsConteoTemp(); }

export async function guardarConteoFisico() {
  if (!_itemsConteoTemp.length) { toast('⚠️ No hay nada para contar'); return; }
  const conteo = {
    id: Date.now(),
    items: _itemsConteoTemp.map(it => ({ ...it, diferencia: it.cantidadContada - it.cantidadSistema })),
    observaciones: ($('conteo-obs') || {}).value || '',
    registradoPor: currentUser?.nombre || '',
  };
  const ok = await supaSync('stockConteosUniformes', conteo);
  if (!ok) { toast('⚠️ No se pudo guardar el conteo — reintentá'); return; }
  if (!DB.stockConteosUniformes) DB.stockConteosUniformes = [];
  DB.stockConteosUniformes.push(conteo);
  // Ajusta el stock lógico al conteo real — un movimiento 'ajuste' por
  // cada diferencia real (0 no genera movimiento, no hay nada que
  // corregir), con motivo explícito para no perder trazabilidad de por
  // qué cambió el número.
  for (const it of conteo.items) {
    if (it.diferencia !== 0) {
      await registrarMovimientoStock({
        tipo: 'ajuste', prenda: it.prenda, talle: it.talle, cantidad: it.diferencia,
        motivo: 'Ajuste por conteo físico' + (conteo.observaciones ? ' — ' + conteo.observaciones : ''),
        refTipo: 'conteo', refIdLocal: String(conteo.id).slice(-9),
      });
    }
  }
  cerrarModal('modal-conteo-fisico-uniformes');
  renderStockUniformes();
  renderMovimientosStockUniformes();
  toast('✅ Conteo guardado y stock ajustado');
}

// ========== PANTALLA (tabs) ==========

export function cambiarTabStockUniformes(tab, btn) {
  document.querySelectorAll('#screen-stock .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-stock .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = $('stock-tab-' + tab);
  if (el) el.classList.add('active');
  if (tab === 'actual') renderStockUniformes();
  if (tab === 'movimientos') renderMovimientosStockUniformes();
  if (tab === 'compras') renderComprasUniformes();
}

export function renderStock() {
  renderStockUniformes();
  renderMovimientosStockUniformes();
  renderComprasUniformes();
}
