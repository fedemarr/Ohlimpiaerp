// Tab Mínimos (v107) — ticket "Stock de uniformes — talles, mínimos y
// precios" (26/08). Vive en el módulo, NO en Configuración: lo ajusta
// quien mira el stock (mismo motivo que documenta v107 en el SQL).
//
// Vale para uniformes (prenda+talle) Y productos de limpieza (misma
// grilla, sin columna talle) — una sola tabla, un solo flujo de edición.
//
// Patrón de edición: los inputs NO se guardan solos al tipear — se
// acumulan en _pendientes (Map) y el ESTADO se recalcula en vivo contra
// ese valor sin tocar la base todavía. "Guardar cambios" persiste todo
// junto y deja el registro de ajustes (usuario, fecha, valor anterior).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { PRENDAS, TALLES_POR_PRENDA } from './catalogos.js';
import { stockConfig, cargarConfigStock, getMinimoUniforme, getMinimoProducto, estadoStock, fechaHoraTxt } from './stock.js';

function _id(prefijo) { return prefijo + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }

// clave única por fila, para el Map de pendientes y para matchear el
// input con su fila al recalcular.
const claveUnif = (prenda, talle) => `U|${prenda}|${talle}`;
const claveProd = (id) => `P|${id}`;

// Consumo prom./mes: SOLO de las entregas registradas (tipo 'salida' en
// el ledger de movimientos). Aproximación consciente (26/08): los
// movimientos no traen una fecha propia confiable en todo origen —
// created_at lo descarta _toCamel() (supabase.js) — así que se toma el
// total histórico de salidas / N meses (stockConfig.mesesPropuestaMinimo)
// en vez de una ventana calendario exacta. Con el módulo recién
// arrancado (stock inicial del 14/08) el volumen real todavía es bajo;
// cuando haga falta más precisión, agregar columna `fecha` al
// movimiento (mismo criterio que pedidos_eventos.fecha, v106).
function consumoPromedioUniforme(prenda, talle) {
  const total = (DB.stockUniformesMovimientos || [])
    .filter(m => m.tipo === 'salida' && m.prenda === prenda && m.talle === talle)
    .reduce((s, m) => s + Math.abs(m.cantidad || 0), 0);
  return total / Math.max(1, stockConfig.mesesPropuestaMinimo);
}
function consumoPromedioProducto(productoIdLocal) {
  const total = (DB.stockProductosMovimientos || [])
    .filter(m => m.tipo === 'salida' && String(m.productoIdLocal) === String(productoIdLocal))
    .reduce((s, m) => s + Math.abs(m.cantidad || 0), 0);
  return total / Math.max(1, stockConfig.mesesPropuestaMinimo);
}

// ========== ESTADO PENDIENTE (edición en memoria, sin guardar) ==========

let _pendientes = new Map();   // clave -> { categoria, clave(txt), prenda, talle, productoIdLocal, valorAnterior, valorNuevo, motivo }

function valorActual(clave) {
  if (_pendientes.has(clave)) return _pendientes.get(clave).valorNuevo;
  const [tipo, a, b] = clave.split('|');
  return tipo === 'U' ? getMinimoUniforme(a, b) : getMinimoProducto(a);
}

function marcarPendiente(claveKey, valorNuevo, meta, motivo) {
  const valorAnterior = _pendientes.has(claveKey) ? _pendientes.get(claveKey).valorAnterior : meta.valorAnterior;
  if (valorNuevo === valorAnterior) { _pendientes.delete(claveKey); return; }
  _pendientes.set(claveKey, { ...meta, valorAnterior, valorNuevo, motivo: motivo || _pendientes.get(claveKey)?.motivo || null });
}

// ========== RENDER ==========

let _filtroPrendaMin = '';

export function filtrarPrendaMinimos() { _filtroPrendaMin = ($('min-fil-prenda') || { value: '' }).value; renderMinimos(); }

export async function renderMinimos() {
  await cargarConfigStock();
  poblarFiltroPrendaMinimos();
  const nProp = $('min-n-propuesta'); if (nProp && !nProp.value) nProp.value = stockConfig.mesesPropuestaMinimo;
  const tbody = $('tbody-minimos');
  if (!tbody) return;

  const prendasStock = new Map();   // prenda -> [{talle, existencia}]
  for (const s of (DB.stockUniformes || [])) {
    if (_filtroPrendaMin && s.prenda !== _filtroPrendaMin) continue;
    if (!prendasStock.has(s.prenda)) prendasStock.set(s.prenda, []);
    prendasStock.get(s.prenda).push(s);
  }

  let html = '';
  for (const prenda of PRENDAS) {
    const filas = prendasStock.get(prenda);
    if (!filas || !filas.length) continue;
    const orden = TALLES_POR_PRENDA[prenda] || [];
    filas.sort((a, b) => orden.indexOf(a.talle) - orden.indexOf(b.talle));
    const totalUn = filas.reduce((s, f) => s + (f.cantidad || 0), 0);
    html += `<tr class="grp-minimos" style="background:var(--fondo);font-weight:700;">
      <td colspan="4" style="padding:8px 10px;">${prenda} — ${totalUn} unidades en ${filas.length} talle${filas.length === 1 ? '' : 's'}</td>
      <td colspan="2" style="padding:8px 10px;text-align:right;font-weight:400;">
        mínimo general de la prenda
        <input type="number" min="0" id="min-bulk-${prenda}" style="width:70px;text-align:right;padding:3px 6px;border:1.5px solid var(--borde-fuerte);border-radius:6px;" value="${valorActual(claveUnif(prenda, filas[0].talle)) || ''}">
        <button class="btn btn-secondary btn-sm" onclick="aplicarMinimoGeneralPrenda('${prenda}')">Aplicar</button>
      </td>
    </tr>`;
    html += filas.map(s => {
      const ck = claveUnif(prenda, s.talle);
      const min = valorActual(ck);
      const consumo = consumoPromedioUniforme(prenda, s.talle);
      const est = estadoStock(s.cantidad || 0, min);
      return `<tr data-clave="${ck}">
        <td style="padding:5px 10px;border-bottom:1px solid var(--borde);color:var(--texto-suave);">${prenda}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);font-weight:700;">${s.talle}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${s.cantidad || 0}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;color:var(--texto-suave);">${consumo.toFixed(1)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">
          <input type="number" min="0" value="${min || ''}" data-ex="${s.cantidad || 0}"
            style="width:70px;text-align:right;padding:3px 6px;border:1.5px solid var(--borde-fuerte);border-radius:6px;"
            oninput="recalcularMinimo(this,'${ck}','UNIFORMES','${prenda}','${s.talle}',null)">
        </td>
        <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;" class="min-est"><span style="font-size:11px;font-weight:700;color:${est.color};">${est.txt}</span></td>
      </tr>`;
    }).join('');
  }

  // Productos (misma grilla, sin talle) — se listan solo si no hay
  // filtro de prenda activo (el filtro de prenda es un concepto de
  // Uniformes; con uno elegido, Productos queda fuera del recorte).
  if (!_filtroPrendaMin) {
    const productos = (DB.stockProductos || []).filter(s => (s.cantidad || 0) !== 0 || getMinimoProducto(s.productoIdLocal) > 0);
    if (productos.length) {
      html += `<tr class="grp-minimos" style="background:var(--fondo);font-weight:700;"><td colspan="6" style="padding:8px 10px;">🛒 PRODUCTOS DE LIMPIEZA</td></tr>`;
      html += productos.map(s => {
        const prod = (DB.ppProductos || []).find(p => String(p.id) === String(s.productoIdLocal));
        const nombre = prod?.descripcion || s.productoIdLocal;
        const ck = claveProd(s.productoIdLocal);
        const min = valorActual(ck);
        const consumo = consumoPromedioProducto(s.productoIdLocal);
        const est = estadoStock(s.cantidad || 0, min);
        return `<tr data-clave="${ck}">
          <td style="padding:5px 10px;border-bottom:1px solid var(--borde);color:var(--texto-suave);" colspan="2">${nombre}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">${s.cantidad || 0}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;color:var(--texto-suave);">${consumo.toFixed(1)}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:right;">
            <input type="number" min="0" value="${min || ''}" data-ex="${s.cantidad || 0}"
              style="width:70px;text-align:right;padding:3px 6px;border:1.5px solid var(--borde-fuerte);border-radius:6px;"
              oninput="recalcularMinimo(this,'${ck}','PRODUCTOS',null,null,'${s.productoIdLocal}')">
          </td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--borde);text-align:center;" class="min-est"><span style="font-size:11px;font-weight:700;color:${est.color};">${est.txt}</span></td>
        </tr>`;
      }).join('');
    }
  }

  tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5;">Sin stock cargado</td></tr>';
  actualizarBotonGuardarMinimos();
  renderRegistroAjustesMinimos();
}

function poblarFiltroPrendaMinimos() {
  const sel = $('min-fil-prenda');
  if (sel && sel.options.length <= 1) sel.innerHTML = '<option value="">Prenda: todas</option>' + PRENDAS.map(p => `<option>${p}</option>`).join('');
}

function actualizarBotonGuardarMinimos() {
  const btn = $('min-btn-guardar');
  if (btn) { btn.disabled = _pendientes.size === 0; btn.textContent = _pendientes.size ? `💾 Guardar cambios (${_pendientes.size})` : '💾 Guardar cambios'; }
}

// Recalcula el chip de Estado de UNA fila al tipear, sin tocar la base
// (pedido explícito del ticket: "se recalcula mientras se edita, antes
// de guardar").
export function recalcularMinimo(input, claveKey, categoria, prenda, talle, productoIdLocal) {
  const existencia = Number(input.dataset.ex) || 0;
  const nuevo = Math.max(0, parseInt(input.value, 10) || 0);
  const anteriorReal = categoria === 'UNIFORMES' ? getMinimoUniforme(prenda, talle) : getMinimoProducto(productoIdLocal);
  const clave = categoria === 'UNIFORMES' ? `${prenda} ${talle}` : (DB.ppProductos || []).find(p => String(p.id) === String(productoIdLocal))?.descripcion || productoIdLocal;
  marcarPendiente(claveKey, nuevo, { categoria, clave, prenda, talle, productoIdLocal, valorAnterior: anteriorReal });
  const est = estadoStock(existencia, nuevo);
  const cell = input.closest('tr')?.querySelector('.min-est');
  if (cell) cell.innerHTML = `<span style="font-size:11px;font-weight:700;color:${est.color};">${est.txt}</span>`;
  actualizarBotonGuardarMinimos();
}

// "Mínimo general de la prenda" — carga el mismo valor en TODOS los
// talles de la prenda de una vez. Después se retocan los puntuales.
export function aplicarMinimoGeneralPrenda(prenda) {
  const v = Math.max(0, parseInt(($('min-bulk-' + prenda) || {}).value, 10) || 0);
  document.querySelectorAll(`#tbody-minimos tr[data-clave^="U|${prenda}|"]`).forEach(tr => {
    const input = tr.querySelector('input[type=number]');
    if (input) {
      input.value = v;
      input.dispatchEvent(new Event('input'));
      const p = _pendientes.get(tr.dataset.clave);
      if (p) p.motivo = 'mínimo general de la prenda';
    }
  });
  toast(`Mínimo ${v} aplicado a los talles de ${prenda} — revisá y "Guardar cambios"`);
}

// "Propuesta general": mínimo sugerido = N meses de consumo promedio,
// para TODA la grilla visible. "El sistema propone, el humano decide y
// guarda" — solo completa los inputs, no persiste nada solo.
export function aplicarPropuestaGeneral() {
  const n = Math.max(1, parseInt(($('min-n-propuesta') || {}).value, 10) || stockConfig.mesesPropuestaMinimo);
  document.querySelectorAll('#tbody-minimos tr[data-clave]').forEach(tr => {
    const input = tr.querySelector('input[type=number]');
    if (!input) return;
    const ck = tr.dataset.clave;
    const [tipo, a, b] = ck.split('|');
    const consumo = tipo === 'U' ? consumoPromedioUniforme(a, b) : consumoPromedioProducto(a);
    input.value = Math.round(consumo * n);
    input.dispatchEvent(new Event('input'));
    const p = _pendientes.get(ck);
    if (p) p.motivo = `propuesta general (${n} meses de consumo)`;
  });
  toast(`Propuesta aplicada: ${n} mes(es) de consumo promedio — revisá y "Guardar cambios"`);
}

// Persiste TODOS los cambios pendientes: upsert en stock_minimos +
// una fila en el Registro de ajustes por cada cambio, con usuario,
// fecha y valor anterior.
export async function guardarCambiosMinimos() {
  if (!_pendientes.size) { toast('No hay cambios para guardar'); return; }
  const btn = $('min-btn-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  for (const [, p] of _pendientes) {
    const idLocalMin = p.categoria === 'UNIFORMES' ? `${p.prenda}|${p.talle}` : `PROD|${p.productoIdLocal}`;
    let fila = (DB.stockMinimos || []).find(m => m.categoria === p.categoria &&
      (p.categoria === 'UNIFORMES' ? (m.prenda === p.prenda && m.talle === p.talle) : String(m.productoIdLocal) === String(p.productoIdLocal)));
    if (!fila) {
      fila = { id: Date.now() + Math.floor(Math.random() * 1000), categoria: p.categoria, prenda: p.prenda || null, talle: p.talle || null, productoIdLocal: p.productoIdLocal || null, minimo: 0 };
      if (!DB.stockMinimos) DB.stockMinimos = [];
      DB.stockMinimos.push(fila);
    }
    fila.minimo = p.valorNuevo;
    await supaSync('stockMinimos', fila);

    const ajuste = {
      id: _id('STKMIN'), categoria: p.categoria, clave: p.clave,
      valorAnterior: p.valorAnterior || 0, valorNuevo: p.valorNuevo,
      motivo: p.motivo || null, usuario: currentUser?.nombre || 'Sistema',
      fecha: fechaHoraTxt(),
    };
    if (!DB.stockMinimosAjustes) DB.stockMinimosAjustes = [];
    DB.stockMinimosAjustes.push(ajuste);
    await supaSync('stockMinimosAjustes', ajuste);
  }

  toast(`✅ ${_pendientes.size} mínimo(s) guardado(s)`);
  _pendientes.clear();
  if (btn) btn.textContent = '💾 Guardar cambios';
  renderMinimos();
}

function renderRegistroAjustesMinimos() {
  const tbody = $('tbody-minimos-ajustes');
  if (!tbody) return;
  const filas = [...(DB.stockMinimosAjustes || [])].sort((a, b) => String(b.id).localeCompare(String(a.id))).slice(0, 100);
  tbody.innerHTML = filas.length
    ? filas.map(a => `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid var(--borde);font-size:11px;color:var(--texto-suave);">${a.fecha || '—'}</td>
        <td style="padding:4px 8px;border-bottom:1px solid var(--borde);font-size:11px;color:var(--texto-suave);">${a.usuario || '—'}</td>
        <td style="padding:4px 8px;border-bottom:1px solid var(--borde);">${a.clave}: mínimo ${a.valorAnterior ?? 0} → <b>${a.valorNuevo}</b>${a.motivo ? ` (${a.motivo})` : ''}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;padding:16px;opacity:.5;">Sin ajustes registrados todavía</td></tr>';
}
