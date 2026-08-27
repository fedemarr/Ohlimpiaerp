// Stock unificado: uniformes + productos de limpieza (v095).
//
// Extiende el stock original de uniformes (v071) para soportar también
// productos del módulo Pedido de Productos. La UI unifica ambas
// categorías en una sola tabla con filtro.
//
// 3 vistas:
// - Existencias: nivel lógico unificado (uniformes por prenda/talle,
//   productos por producto_id_local) con filtros y valorización.
// - Movimientos: ledger completo (entradas/salidas/ajustes).
// - Inventario: conteo físico periódico.
//
// Salidas automáticas:
// - descontarStockPorPedido(): uniformes (flujo.js → logisticaRecibe)
// - recibirPedidoProductosPP(): productos (pedido_productos → marcarEntregado)

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, SUPA } from '@shared/supabase.js';
import { PRENDAS, TALLES_POR_PRENDA } from './catalogos.js';
import { obtenerPrecioVigente } from './precios.js';

function _id(prefijo) { return prefijo + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function hoyDDMMAAAA() { return new Date().toLocaleDateString('es-AR'); }
function hoyHHMM() { return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
export function fechaHoraTxt() { return `${hoyDDMMAAAA()} ${hoyHHMM()}`; }

// ========== CONFIG (v107): umbral BAJO⚠ y N meses de la propuesta general ==========
// Parametrizable, mismo patrón que pedidos_config (v106): seed SQL, sin
// ABM propia todavía — se edita directo en la tabla stock_config.
export let stockConfig = { umbralBajoCriticoPct: 0.6, mesesPropuestaMinimo: 2 };
let _configStockCargada = false;

export async function cargarConfigStock() {
  if (_configStockCargada) return;
  _configStockCargada = true;
  try {
    const { data } = await SUPA.from('stock_config').select('clave,valor');
    for (const row of (data || [])) {
      if (row.clave === 'umbral_bajo_critico_pct' && typeof row.valor === 'number') stockConfig.umbralBajoCriticoPct = row.valor;
      if (row.clave === 'meses_propuesta_minimo' && typeof row.valor === 'number') stockConfig.mesesPropuestaMinimo = row.valor;
    }
  } catch (e) { /* se queda con el default de arriba */ }
}

// ========== MÍNIMOS (v107): helpers de lectura, usados acá y en minimos.js ==========

export function getMinimoUniforme(prenda, talle) {
  const r = (DB.stockMinimos || []).find(m => m.categoria === 'UNIFORMES' && m.prenda === prenda && m.talle === talle);
  return r ? (Number(r.minimo) || 0) : 0;
}
export function getMinimoProducto(productoIdLocal) {
  const r = (DB.stockMinimos || []).find(m => m.categoria === 'PRODUCTOS' && String(m.productoIdLocal) === String(productoIdLocal));
  return r ? (Number(r.minimo) || 0) : 0;
}

// Estado de 2 niveles (26/08): OK si existencia >= mínimo; si no,
// BAJO⚠ (rojo) cuando además está debajo del umbral crítico (% del
// mínimo, parametrizable) — si no, BAJO (ámbar) simple. Sin mínimo
// cargado (0): no hay contra qué medir, queda OK — evita que TODA la
// grilla salga en rojo el día que se abre el tab antes de cargar nada.
export function estadoStock(existencia, minimo) {
  if (!minimo) return { txt: 'OK', color: 'var(--verde)', chip: 'c-verde' };
  if (existencia >= minimo) return { txt: 'OK', color: 'var(--verde)', chip: 'c-verde' };
  if (existencia < minimo * stockConfig.umbralBajoCriticoPct) return { txt: 'BAJO ⚠', color: 'var(--rojo)', chip: 'c-rojo' };
  return { txt: 'BAJO', color: 'var(--naranja)', chip: 'c-nara' };
}

// ========== STOCK DE UNIFORMES (v071, sin cambios) ==========

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

export async function descontarStockPorPedido(pedido, prendas) {
  for (const pr of prendas) {
    await registrarMovimientoStock({
      tipo: 'salida', prenda: pr.prenda, talle: pr.talle, cantidad: pr.cantidad,
      motivo: 'Pedido de uniforme — ' + (pedido.nombreOperario || ''),
      refTipo: 'pedido', refIdLocal: String(pedido.id).slice(-9),
    });
  }
}

// ========== STOCK DE PRODUCTOS (v095) ==========

function getStockProductoRow(productoIdLocal) {
  return (DB.stockProductos || []).find(s => String(s.productoIdLocal) === String(productoIdLocal));
}

async function ajustarNivelStockProducto(productoIdLocal, cantidadNueva, costoUnitario) {
  let row = getStockProductoRow(productoIdLocal);
  const cantidadAnterior = row ? (row.cantidad || 0) : 0;
  const pppAnterior = row ? (row.costoPpp || 0) : 0;
  const cantidadTotal = cantidadAnterior + cantidadNueva;

  if (!row) {
    row = { id: _id('STKP'), productoIdLocal, cantidad: 0, costoPpp: 0, costoVigente: 0 };
    DB.stockProductos = DB.stockProductos || [];
    DB.stockProductos.push(row);
  }

  // PPP (Costo Promedio Ponderado): recalcula al entrar mercadería
  if (cantidadTotal > 0 && cantidadNueva > 0) {
    const valorAnterior = cantidadAnterior * pppAnterior;
    const valorEntrada = cantidadNueva * costoUnitario;
    row.costoPpp = (valorAnterior + valorEntrada) / cantidadTotal;
  }
  row.cantidad = cantidadTotal;
  // Actualiza costo vigente si se provee uno nuevo
  if (costoUnitario > 0) row.costoVigente = costoUnitario;
  await supaSync('stockProductos', row);
  return row;
}

async function registrarMovimientoStockProducto({ tipo, productoIdLocal, cantidad, costoUnitario, motivo, refTipo, refIdLocal }) {
  const delta = tipo === 'salida' ? -Math.abs(cantidad) : tipo === 'entrada' || tipo === 'refuerzo' ? Math.abs(cantidad) : cantidad;
  await ajustarNivelStockProducto(productoIdLocal, Math.abs(delta), costoUnitario || 0);
  const mov = {
    id: _id('STKPM'),
    tipo, productoIdLocal, cantidad: delta,
    costoUnitario: costoUnitario || 0,
    motivo: motivo || '', refTipo: refTipo || '', refIdLocal: refIdLocal || '',
    registradoPor: currentUser?.nombre || '',
  };
  await supaSync('stockProductosMovimientos', mov);
  if (!DB.stockProductosMovimientos) DB.stockProductosMovimientos = [];
  DB.stockProductosMovimientos.push(mov);
}

// Llamado desde pedido_productos.js → marcarEntregadoPP().
// Cada ítem del pedido genera una ENTRADA al stock, valorizada al costo
// congelado del ítem (el precio que se pagó realmente).
export async function recibirPedidoProductosPP(pedidoId, items) {
  for (const item of items) {
    await registrarMovimientoStockProducto({
      tipo: 'entrada',
      productoIdLocal: item.productoIdLocal,
      cantidad: item.cantAutorizada != null ? item.cantAutorizada : item.cantSolicitada,
      costoUnitario: item.costoCongelado || 0,
      motivo: 'Recepción de pedido de productos',
      refTipo: 'pedido_producto',
      refIdLocal: String(pedidoId).slice(-9),
    });
  }
}

// ========== UNIFICACIÓN: FILTRO Y RENDER COMBINADO ==========

let _filtroCategoriaStock = 'todos';
let _filtroPrendaStock = '';
let _filtroTalleStock = '';
let _filtroEstadoStock = '';

export function filtrarCategoriaStock(cat) {
  _filtroCategoriaStock = cat;
  document.querySelectorAll('#stock-chip-categoria .chip-filtro').forEach(ch => {
    ch.classList.toggle('active', ch.dataset.cat === cat);
  });
  renderStock();
}
export function filtrarPrendaStock() { _filtroPrendaStock = ($('stock-fil-prenda') || { value: '' }).value; renderStock(); }
export function filtrarTalleStock() { _filtroTalleStock = ($('stock-fil-talle') || { value: '' }).value; renderStock(); }
export function filtrarEstadoStock() { _filtroEstadoStock = ($('stock-fil-estado') || { value: '' }).value; renderStock(); }

// Orden lógico de talle DENTRO de una prenda (S→5XL / 35→46 / 36→60):
// el catálogo (catalogos.js) ya guarda cada TALLES_POR_PRENDA en ese
// orden — alfabético pondría "2XL" antes que "L". indexOf() sobre esa
// misma lista es la fuente de verdad, sin inventar un orden aparte acá.
function ordenTalle(prenda, talle) {
  const i = (TALLES_POR_PRENDA[prenda] || []).indexOf(talle);
  return i === -1 ? 999 : i;
}

// ========== TAB: EXISTENCIAS (unificado) ==========

export async function renderStock() {
  await cargarConfigStock();
  poblarFiltrosPrendaTalleStock();
  _renderExistencias();
  _renderMovimientosUnificado();
}

// Puebla los <select> de Prenda/Talle una sola vez (opciones fijas del
// catálogo — no dependen de qué stock haya cargado).
function poblarFiltrosPrendaTalleStock() {
  const selP = $('stock-fil-prenda');
  if (selP && selP.options.length <= 1) {
    selP.innerHTML = '<option value="">Prenda: todas</option>' + PRENDAS.map(p => `<option>${p}</option>`).join('');
  }
  const selT = $('stock-fil-talle');
  if (selT && selT.options.length <= 1) {
    const talles = [...new Set(Object.values(TALLES_POR_PRENDA).flat())];
    // Orden "global" de talles para el filtro (no depende de una prenda
    // en particular): S..5XL primero, después lo numérico tal cual está
    // en el catálogo.
    const ORDEN_LETRA = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
    talles.sort((a, b) => {
      const ia = ORDEN_LETRA.indexOf(a), ib = ORDEN_LETRA.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return (Number(a) || 0) - (Number(b) || 0);
    });
    selT.innerHTML = '<option value="">Talle: todos</option>' + talles.map(t => `<option>${t}</option>`).join('');
  }
}

function _renderExistencias() {
  const tbody = $('tbody-stock-uniformes');
  if (!tbody) return;
  const q = ($('stock-buscar') || {}).value?.toLowerCase() || '';

  // Uniformes: rows (v107 — costo_ppp real de stock_uniformes, vigente
  // del tab Precios, mínimo del tab Mínimos, estado en 2 niveles).
  let filasUniformes = (DB.stockUniformes || []).map(s => {
    const vigente = obtenerPrecioVigente(s.prenda, s.talle)?.precio || 0;
    const minimo = getMinimoUniforme(s.prenda, s.talle);
    return {
      categoria: 'UNIFORMES', nombre: s.prenda, talle: s.talle,
      cantidad: s.cantidad || 0, costoPpp: s.costoPpp || 0, costoVigente: vigente,
      minimo, _ordenTalle: ordenTalle(s.prenda, s.talle),
      _raw: s,
    };
  });

  // Productos: rows
  let filasProductos = (DB.stockProductos || []).map(s => {
    const prod = (DB.ppProductos || []).find(p => String(p.id) === String(s.productoIdLocal));
    return {
      categoria: 'PRODUCTOS', nombre: prod?.descripcion || s.productoIdLocal, talle: '',
      cantidad: s.cantidad || 0, costoPpp: s.costoPpp || 0, costoVigente: s.costoVigente || 0,
      minimo: getMinimoProducto(s.productoIdLocal), _ordenTalle: 0,
      _raw: s,
    };
  });

  let filas = [...filasProductos, ...filasUniformes];

  // Filtro por categoría
  if (_filtroCategoriaStock !== 'todos') {
    filas = filas.filter(f => f.categoria === _filtroCategoriaStock);
  }
  // Prenda/Talle: solo tienen sentido en Uniformes — al elegir uno, las
  // filas de Productos (sin talle/prenda) quedan afuera del recorte.
  if (_filtroPrendaStock) filas = filas.filter(f => f.categoria === 'UNIFORMES' && f.nombre === _filtroPrendaStock);
  if (_filtroTalleStock) filas = filas.filter(f => f.categoria === 'UNIFORMES' && f.talle === _filtroTalleStock);

  // Búsqueda
  if (q) filas = filas.filter(f => f.nombre.toLowerCase().includes(q) || (f.talle || '').toLowerCase().includes(q));

  // Sort: categoría, prenda, y DENTRO de la prenda por el orden lógico
  // del talle (no alfabético — ver ordenTalle()).
  filas.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre) || a._ordenTalle - b._ordenTalle);

  const CAT_CHIP = { PRODUCTOS: '<span style="background:#dbe7ff;color:#1b3f9e;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700;">PRODUCTOS</span>', UNIFORMES: '<span style="background:#ece0fa;color:#5b2ca0;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700;">UNIFORMES</span>' };

  // Estado (después del corte de filtros, para que el chip de Estado
  // filtre sobre lo que realmente se está mostrando).
  filas = filas.map(f => ({ ...f, _estado: estadoStock(f.cantidad, f.minimo) }));
  if (_filtroEstadoStock) {
    filas = filas.filter(f => _filtroEstadoStock === 'BAJO' ? f._estado.txt.startsWith('BAJO') : f._estado.txt === _filtroEstadoStock);
  }

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;opacity:.5;">Sin stock cargado</td></tr>';
    return;
  }

  let totCant = 0, totPpp = 0, totRepo = 0;
  tbody.innerHTML = filas.map(f => {
    const esProd = f.categoria === 'PRODUCTOS';
    const tienePpp = f.costoPpp > 0;
    const tieneVig = f.costoVigente > 0;
    const valorPpp = tienePpp ? f.cantidad * f.costoPpp : null;
    const valorRepo = tieneVig ? f.cantidad * f.costoVigente : null;
    totCant += f.cantidad;
    if (valorPpp != null) totPpp += valorPpp;
    if (valorRepo != null) totRepo += valorRepo;
    return `<tr${f._estado.txt === 'BAJO ⚠' ? ' style="background:var(--rojo-suave);"' : ''}>
      <td style="padding:5px 10px;border-bottom:1px solid var(--borde);font-weight:500;">${f.nombre}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;">${CAT_CHIP[f.categoria]}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;font-weight:700;">${esProd ? '—' : f.talle}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;font-weight:700;color:${f.cantidad < 0 ? 'var(--rojo)' : f.cantidad === 0 ? 'var(--naranja)' : 'var(--texto)'};">${f.cantidad}${f.cantidad < 0 ? ' ⚠️' : ''}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;color:var(--texto-suave);">${tienePpp ? _money(f.costoPpp) : '—'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${tieneVig ? _money(f.costoVigente) : '—'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;color:var(--texto-suave);">${valorPpp != null ? _money(valorPpp) : '—'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;font-weight:700;">${valorRepo != null ? _money(valorRepo) : '—'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;color:var(--texto-suave);">${f.minimo || '—'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;"><span style="font-size:11px;font-weight:700;color:${f._estado.color};">${f._estado.txt}</span></td>
    </tr>`;
  }).join('')
    + `<tr style="background:var(--fondo);font-weight:700;">
      <td colspan="3" style="padding:6px 10px;text-align:right;">TOTAL (${filas.length} fila${filas.length === 1 ? '' : 's'})</td>
      <td style="padding:6px 8px;text-align:right;">${totCant}</td>
      <td></td><td></td>
      <td style="padding:6px 8px;text-align:right;color:var(--texto-suave);">${totPpp ? _money(totPpp) : '—'}</td>
      <td style="padding:6px 8px;text-align:right;">${totRepo ? _money(totRepo) : '—'}</td>
      <td></td><td></td>
    </tr>`;
}

export function filtrarStockUniformes() { renderStock(); }

// ========== TAB: MOVIMIENTOS (unificado) ==========

function _renderMovimientosUnificado() {
  const tbody = $('tbody-stock-movimientos');
  if (!tbody) return;

  const movUniformes = (DB.stockUniformesMovimientos || []).map(m => ({
    ...m, categoria: 'UNIFORMES', producto: m.prenda + (m.talle ? ' / ' + m.talle : ''),
  }));
  const movProductos = (DB.stockProductosMovimientos || []).map(m => {
    const prod = (DB.ppProductos || []).find(p => String(p.id) === String(m.productoIdLocal));
    return { ...m, categoria: 'PRODUCTOS', producto: prod?.descripcion || m.productoIdLocal };
  });

  const todos = [...movUniformes, ...movProductos].sort((a, b) => {
    const fa = a.fecha || a.createdAt || '';
    const fb = b.fecha || b.createdAt || '';
    return String(fb).localeCompare(String(fa));
  });

  const TIPO_LABEL = { entrada: '<span style="background:#d9f2e2;color:#156a3a;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700;">ENTRADA</span>', salida: '<span style="background:#fddede;color:#a11c1c;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700;">SALIDA</span>', ajuste: '<span style="background:#ffe8d6;color:#a04a08;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700;">AJUSTE</span>', refuerzo: '<span style="background:#dbe7ff;color:#1b3f9e;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700;">REFUERZO</span>' };
  const CAT_SMALL = { PRODUCTOS: '<span style="color:#1b3f9e;font-size:9px;font-weight:700;">PROD</span>', UNIFORMES: '<span style="color:#5b2ca0;font-size:9px;font-weight:700;">UNIF</span>' };

  if (!todos.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5;">Sin movimientos registrados</td></tr>';
    return;
  }

  tbody.innerHTML = todos.slice(0, 300).map(m => `<tr>
    <td style="padding:4px 8px;border-bottom:1px solid var(--borde);font-size:11px;">${CAT_SMALL[m.categoria] || ''}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--borde);">${TIPO_LABEL[m.tipo] || m.tipo}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--borde);font-weight:500;">${m.producto}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--borde);text-align:right;font-weight:700;color:${m.cantidad < 0 ? 'var(--rojo)' : 'var(--verde)'};">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--borde);font-size:11px;color:var(--texto-suave);">${m.motivo || '—'}</td>
    <td style="padding:4px 8px;border-bottom:1px solid var(--borde);font-size:11px;color:var(--texto-suave);">${m.registradoPor || '—'}</td>
  </tr>`).join('');
}

// ========== TAB: CONTEO FÍSICO ==========

let _itemsConteoTemp = [];

export function abrirConteoFisico() {
  _itemsConteoTemp = [];
  // Uniformes
  (DB.stockUniformes || []).forEach(s => {
    _itemsConteoTemp.push({ categoria: 'UNIFORMES', clave: s.prenda + ' / ' + s.talle, cantidadSistema: s.cantidad, cantidadContada: s.cantidad, _ref: s });
  });
  // Productos
  (DB.stockProductos || []).forEach(s => {
    const prod = (DB.ppProductos || []).find(p => String(p.id) === String(s.productoIdLocal));
    _itemsConteoTemp.push({ categoria: 'PRODUCTOS', clave: prod?.descripcion || s.productoIdLocal, cantidadSistema: s.cantidad, cantidadContada: s.cantidad, _ref: s });
  });
  const obs = $('conteo-obs'); if (obs) obs.value = '';
  renderItemsConteoTemp();
  abrirModal('modal-conteo-fisico-uniformes');
}

function renderItemsConteoTemp() {
  const cont = $('conteo-items-lista');
  if (!cont) return;
  const CAT_CHIP = { PRODUCTOS: '<span style="color:#1b3f9e;font-size:9px;font-weight:700;">PROD</span>', UNIFORMES: '<span style="color:#5b2ca0;font-size:9px;font-weight:700;">UNIF</span>' };
  cont.innerHTML = _itemsConteoTemp.map((it, i) => {
    const dif = it.cantidadContada - it.cantidadSistema;
    return `<div style="display:grid;grid-template-columns:16px 1fr 70px 80px 60px;gap:6px;align-items:center;margin-bottom:4px;font-size:12px;">
      ${CAT_CHIP[it.categoria] || ''}
      <div>${it.clave}</div>
      <div style="text-align:center;">Sist: ${it.cantidadSistema}</div>
      <input type="number" value="${it.cantidadContada}" onchange="cambiarCantidadContadaConteo(${i}, this.value)" style="width:70px;padding:3px 6px;border:1px solid var(--borde-fuerte);border-radius:4px;text-align:center;">
      <div style="text-align:center;color:${dif === 0 ? 'var(--verde)' : dif > 0 ? 'var(--azul)' : 'var(--rojo)'};font-weight:700;">${dif > 0 ? '+' : ''}${dif}</div>
    </div>`;
  }).join('') || '<p style="opacity:.5;font-size:12px;">No hay stock cargado todavía para contar</p>';
}
export function cambiarCantidadContadaConteo(i, v) { _itemsConteoTemp[i].cantidadContada = parseInt(v) || 0; renderItemsConteoTemp(); }

export async function guardarConteoFisico() {
  if (!_itemsConteoTemp.length) { toast('⚠️ No hay nada para contar'); return; }
  const conteo = {
    id: Date.now(),
    items: _itemsConteoTemp.map(it => ({ ...it, diferencia: it.cantidadContada - it.cantidadSistema, _ref: undefined })),
    observaciones: ($('conteo-obs') || {}).value || '',
    registradoPor: currentUser?.nombre || '',
  };
  const ok = await supaSync('stockConteosUniformes', conteo);
  if (!ok) { toast('⚠️ No se pudo guardar el conteo — reintentá'); return; }
  if (!DB.stockConteosUniformes) DB.stockConteosUniformes = [];
  DB.stockConteosUniformes.push(conteo);

  for (const it of conteo.items) {
    if (it.diferencia === 0) continue;
    if (it.categoria === 'UNIFORMES') {
      const ref = _itemsConteoTemp[conteo.items.indexOf(it)]?._ref;
      if (ref) {
        await registrarMovimientoStock({
          tipo: 'ajuste', prenda: ref.prenda, talle: ref.talle, cantidad: it.diferencia,
          motivo: 'Ajuste por conteo físico' + (conteo.observaciones ? ' — ' + conteo.observaciones : ''),
          refTipo: 'conteo', refIdLocal: String(conteo.id).slice(-9),
        });
      }
    } else {
      const ref = _itemsConteoTemp.find(t => t.clave === it.clave)?._ref;
      if (ref) {
        await registrarMovimientoStockProducto({
          tipo: 'ajuste', productoIdLocal: ref.productoIdLocal, cantidad: it.diferencia,
          costoUnitario: ref.costoPpp || 0,
          motivo: 'Ajuste por conteo físico' + (conteo.observaciones ? ' — ' + conteo.observaciones : ''),
          refTipo: 'conteo', refIdLocal: String(conteo.id).slice(-9),
        });
      }
    }
  }
  cerrarModal('modal-conteo-fisico-uniformes');
  renderStock();
  toast('✅ Conteo guardado y stock ajustado');
}

// ========== IMPORTAR STOCK INICIAL (CSV) ==========
//
// Carga el punto de partida del stock de uniformes a partir del
// inventario físico que releva Logística (ticket "Stock inicial de
// uniformes", 08/2026 — primera carga real: 14/08/2026, 1.080 unidades
// en 6 prendas). Pensado también como herramienta reutilizable para
// futuros recuentos totales de depósito, no solo para la carga inicial.
//
// Enfoque elegido: se reutiliza EXACTAMENTE el mismo mecanismo que
// guardarConteoFisico() (más abajo) — registrarMovimientoStock con
// tipo:'ajuste' y cantidad = diferencia entre lo contado y lo que ya
// hay en el sistema — en vez de inventar un tipo de movimiento nuevo
// ("entrada inicial"). Motivos:
//  1) Es semánticamente lo mismo: reconciliar el sistema contra un
//     conteo físico. El conteo físico manual ya resuelve esto fila por
//     fila; acá se resuelve en lote desde un CSV.
//  2) El delta funciona sin importar si la fila prenda/talle ya existe
//     en stock_uniformes (ajusta desde lo que haya, incluidas las filas
//     de prueba viejas con cantidad negativa) o no existe todavía
//     (ajustarNivelStock la crea en cantidad 0 y el ajuste la deja en
//     el valor del CSV).
//  3) stock_uniformes_movimientos queda como ledger 100% consistente:
//     el nivel siempre es la suma de sus movimientos, sin doble conteo.
//
// Formato del CSV esperado (encabezado en cualquier fila, no
// necesariamente la primera — el archivo real de Logística trae un
// título y una fila en blanco antes del encabezado):
//   PRENDA,TALLE,CANTIDAD
//   BUZO,S,23
//   AMBO,2XL,30
//   ...
// - PRENDA: nombre de la prenda tal como lo usa Logística (ver
//   PRENDA_CSV_MAP) o directamente el nombre del catálogo (Chomba,
//   Ambo, etc.).
// - TALLE: S/M/L/XL/XXL o numérico según la prenda. Se normaliza
//   XXL→2XL, XXXL→3XL, etc. automáticamente.
// - CANTIDAD: entero, unidades físicas contadas.
// Filas con prenda o talle no reconocidos se listan y se excluyen del
// import (no rompen el resto del archivo).

// Equivalencias de nombre CSV (Logística) → prenda del catálogo del
// módulo (ver NOTAS del archivo de stock inicial 08/2026).
const PRENDA_CSV_MAP = {
  BUZO: 'Buzo', AMBO: 'Ambo', CAMPERA: 'Campera',
  CALZADO: 'Zapatos', ZAPATOS: 'Zapatos',
  PANTALON: 'Grafa', 'PANTALÓN': 'Grafa', GRAFA: 'Grafa',
  CHOMBA: 'Chomba', POLAR: 'Polar', GORRA: 'Gorra',
  // REMERA: sin stock informado (0 unidades) y sin prenda propia en el
  // catálogo todavía — si Logística la releva a futuro, agregar acá y
  // en PRENDAS/TALLES_POR_PRENDA (catalogos.js) antes de mapearla.
};

function _normalizeTalle(t) {
  const v = (t || '').trim().toUpperCase();
  const m = v.match(/^(X+)L$/); // XXL→2XL, XXXL→3XL, XXXXL→4XL, ...
  if (m) return m[1].length + 'XL';
  return v;
}

function _parseCSVStock(texto) {
  return texto.split(/\r\n|\r|\n/)
    .filter(l => l.trim() !== '')
    .map(l => {
      const delim = l.split(';').length > l.split(',').length ? ';' : ',';
      return l.split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
    });
}

function _detectarHeaderStock(filas) {
  for (let i = 0; i < filas.length; i++) {
    const row = filas[i].map(c => c.trim().toUpperCase());
    const iPrenda = row.indexOf('PRENDA');
    const iTalle = row.indexOf('TALLE');
    const iCant = row.findIndex(c => c === 'CANTIDAD' || c === 'UNIDADES' || c === 'CANT');
    if (iPrenda >= 0 && iTalle >= 0 && iCant >= 0) return { headerRow: i, iPrenda, iTalle, iCant };
  }
  return null;
}

function _fechaISOaDMY(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

let _importStockFilas = null;

export function abrirImportarStockInicial() {
  _importStockFilas = null;
  const res = $('import-stock-resultado'); if (res) res.innerHTML = '';
  const f = $('import-stock-file'); if (f) f.value = '';
  const fecha = $('import-stock-fecha');
  if (fecha) fecha.value = new Date().toISOString().slice(0, 10);
  const btn = $('import-stock-btn-confirmar'); if (btn) btn.style.display = 'none';
  abrirModal('modal-import-stock-inicial');
}

export function seleccionarArchivoImportStockInicial() {
  const input = $('import-stock-file');
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const texto = String(e.target.result || '');
    const filas = _parseCSVStock(texto);
    const header = _detectarHeaderStock(filas);
    if (!header) {
      toast('⚠️ No se reconocen las columnas esperadas (PRENDA, TALLE, CANTIDAD) — revisá el archivo');
      return;
    }
    const datos = filas.slice(header.headerRow + 1)
      .filter(f => (f[header.iPrenda] || '').trim() && !/^TOTAL/i.test((f[header.iPrenda] || '').trim()));
    if (!datos.length) { toast('⚠️ No se encontraron filas de datos'); return; }

    const reconocidas = [];
    const noReconocidas = [];
    datos.forEach(f => {
      const prendaCsv = (f[header.iPrenda] || '').trim();
      const talleCsv = (f[header.iTalle] || '').trim();
      const cantidadTxt = (f[header.iCant] || '').trim();
      const cantidad = parseInt(cantidadTxt.replace(/\./g, '').replace(',', '.'), 10) || 0;
      const prenda = PRENDA_CSV_MAP[prendaCsv.toUpperCase()] || (PRENDAS.includes(prendaCsv) ? prendaCsv : null);
      if (!prenda) { noReconocidas.push(`${prendaCsv} (prenda no está en el catálogo)`); return; }
      const talle = _normalizeTalle(talleCsv);
      const tallesValidos = TALLES_POR_PRENDA[prenda] || [];
      if (!tallesValidos.includes(talle)) { noReconocidas.push(`${prendaCsv} / ${talleCsv} (talle no está en el catálogo de ${prenda})`); return; }
      reconocidas.push({ prenda, talle, cantidad, actual: getStockRow(prenda, talle)?.cantidad || 0 });
    });

    if (!reconocidas.length) { toast('⚠️ Ninguna fila reconocida — revisá prendas/talles del archivo'); return; }

    _importStockFilas = reconocidas;
    const totalUnidades = reconocidas.reduce((s, r) => s + r.cantidad, 0);
    const conCambio = reconocidas.filter(r => r.cantidad !== r.actual);
    $('import-stock-resultado').innerHTML = `
      <div class="alerta alerta-info" style="font-size:12.5px;">
        ${reconocidas.length} fila(s) reconocidas · ${totalUnidades} unidades totales · ${conCambio.length} combinación(es) prenda/talle van a ajustarse.
        ${noReconocidas.length ? `<br>⚠️ ${noReconocidas.length} fila(s) no reconocidas, no se importan:<br>${noReconocidas.slice(0, 10).join('<br>')}${noReconocidas.length > 10 ? '<br>…' : ''}` : ''}
      </div>`;
    $('import-stock-btn-confirmar').style.display = 'inline-flex';
  };
  reader.readAsText(file, 'UTF-8');
}

export async function confirmarImportarStockInicial() {
  if (!_importStockFilas || !_importStockFilas.length) { toast('⚠️ Elegí un archivo primero'); return; }
  const fechaDMY = _fechaISOaDMY(($('import-stock-fecha') || {}).value) || _fechaISOaDMY(new Date().toISOString().slice(0, 10));
  const btn = $('import-stock-btn-confirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'Importando...'; }

  const loteId = String(Date.now()).slice(-9);
  let aplicadas = 0, sinCambio = 0;
  for (const r of _importStockFilas) {
    const delta = r.cantidad - r.actual;
    if (delta === 0) { sinCambio++; continue; }
    await registrarMovimientoStock({
      tipo: 'ajuste', prenda: r.prenda, talle: r.talle, cantidad: delta,
      motivo: `Stock inicial — inventario físico Logística ${fechaDMY}`,
      refTipo: 'stock_inicial', refIdLocal: loteId,
    });
    aplicadas++;
  }

  cerrarModal('modal-import-stock-inicial');
  renderStock();
  toast(`✅ Stock inicial importado: ${aplicadas} ajuste(s) aplicados${sinCambio ? `, ${sinCambio} ya coincidían` : ''}`);
  if (btn) { btn.disabled = false; btn.textContent = 'Confirmar importación'; }
  _importStockFilas = null;
}

// ========== PANTALLA (tabs) ==========

// Mínimos y Precios viven en módulos aparte (minimos.js, precios.js) —
// para que este archivo no tenga que importarlos (precios.js YA importa
// de acá arriba, así que la vuelta sería circular) se registran sus
// render acá desde index.js al cargar, mismo patrón que
// registerAuthCallbacks/registerNavCallbacks (auth.js/nav.js).
const _renderPorTabExtra = {};
export function registrarTabStockExtra(tab, renderFn) { _renderPorTabExtra[tab] = renderFn; }

export function cambiarTabStockUniformes(tab, btn) {
  document.querySelectorAll('#screen-stock .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-stock .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = $('stock-tab-' + tab);
  if (el) el.classList.add('active');
  if (tab === 'actual') renderStock();
  else if (tab === 'movimientos') _renderMovimientosUnificado();
  else if (_renderPorTabExtra[tab]) _renderPorTabExtra[tab]();
}
