// Uniformes v2 — precios con vigencia temporal (DISENO_uniformes.md §12).
// Vive como vista/modal interna de Uniformes (NO como entrada de MENU):
// ya existe una key 'precios' real en el sistema (Gestión de precios
// comerciales a clientes, sección Ventas) — usar esa key para esto
// colisionaría con un módulo real no relacionado.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { PRENDAS, TALLES_POR_PRENDA } from './catalogos.js';

export function getPrecioById(id) {
  return (DB.preciosUniformes || []).find(p => String(p.id) === String(id));
}

function preciosVigentes() {
  return (DB.preciosUniformes || []).filter(p => !p.anulado && !p.vigenciaHasta);
}

// Prioriza el precio con talle específico sobre el precio general (talle null).
export function obtenerPrecioVigente(prenda, talle, fecha = new Date()) {
  const fechaStr = fecha.toISOString().slice(0, 10);
  const candidatos = (DB.preciosUniformes || []).filter(p =>
    !p.anulado && p.prenda === prenda &&
    (p.talle === talle || !p.talle) &&
    p.vigenciaDesde <= fechaStr &&
    (!p.vigenciaHasta || p.vigenciaHasta >= fechaStr)
  );
  return candidatos.find(p => p.talle === talle) || candidatos.find(p => !p.talle) || null;
}

// ========== VISTA DE PRECIOS VIGENTES ==========

export function renderPreciosUniformes() {
  const tbody = $('tbody-uni-precios');
  if (!tbody) return;
  const filas = preciosVigentes().sort((a, b) => a.prenda.localeCompare(b.prenda) || (a.talle || '').localeCompare(b.talle || ''));
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5;">Sin precios cargados</td></tr>'
    : filas.map(p => `<tr>
        <td>${p.prenda}</td>
        <td>${p.talle || '<em>Todos los talles</em>'}</td>
        <td>$${(p.precio || 0).toLocaleString('es-AR')}</td>
        <td>${p.vigenciaDesde}</td>
        <td>${p.cargadoPor || '—'}</td>
        <td>
          <button class="btn btn-xs btn-secondary" onclick="abrirEditarPrecioUniforme('${p.id}')">✏️ Corregir</button>
          <button class="btn btn-xs" onclick="abrirNuevoPrecioConVigencia('${p.prenda}','${p.talle || ''}')">📅 Nueva vigencia</button>
          <button class="btn btn-xs" onclick="abrirHistorialPrecioUniforme('${p.prenda}','${p.talle || ''}')">🕐 Historial</button>
        </td>
      </tr>`).join('');
}

export function abrirGestionPrecios() {
  renderPreciosUniformes();
  abrirModal('modal-uniformes-precios');
}

// ========== MODAL DE ALTA/EDICIÓN ==========

let _precioModo = 'nuevo'; // 'nuevo' | 'corregir' | 'vigencia'
let _precioEditandoId = null;

function poblarTallesPrecio() {
  const prenda = $('up-prenda').value;
  const sel = $('up-talle');
  sel.innerHTML = '<option value="">Todos los talles</option>' + (TALLES_POR_PRENDA[prenda] || []).map(t => `<option>${t}</option>`).join('');
}

export function cambiarPrendaPrecio() { poblarTallesPrecio(); }

export function abrirNuevoPrecioUniforme() {
  _precioModo = 'nuevo';
  _precioEditandoId = null;
  $('up-modal-title').textContent = 'Nuevo precio';
  $('up-prenda').innerHTML = PRENDAS.map(p => `<option>${p}</option>`).join('');
  poblarTallesPrecio();
  $('up-precio').value = '';
  $('up-vigencia-desde').value = new Date().toISOString().slice(0, 10);
  $('up-motivo').value = '';
  abrirModal('modal-uniformes-precio');
}

// "Corregir error" — edita el registro vigente sin crear uno nuevo (política A.6).
export function abrirEditarPrecioUniforme(id) {
  const p = getPrecioById(id);
  if (!p) return;
  _precioModo = 'corregir';
  _precioEditandoId = p.id;
  $('up-modal-title').textContent = 'Corregir precio (edita el registro, no genera histórico)';
  $('up-prenda').innerHTML = PRENDAS.map(pr => `<option ${pr === p.prenda ? 'selected' : ''}>${pr}</option>`).join('');
  poblarTallesPrecio();
  if (p.talle) $('up-talle').value = p.talle;
  $('up-precio').value = p.precio;
  $('up-vigencia-desde').value = p.vigenciaDesde;
  $('up-motivo').value = p.motivoCarga || '';
  abrirModal('modal-uniformes-precio');
}

// "Cambio con vigencia" — crea un registro nuevo y cierra el anterior.
export function abrirNuevoPrecioConVigencia(prenda, talle) {
  _precioModo = 'vigencia';
  _precioEditandoId = null;
  $('up-modal-title').textContent = 'Nuevo precio con vigencia (mantiene el histórico)';
  $('up-prenda').innerHTML = PRENDAS.map(p => `<option ${p === prenda ? 'selected' : ''}>${p}</option>`).join('');
  poblarTallesPrecio();
  if (talle) $('up-talle').value = talle;
  $('up-precio').value = '';
  $('up-vigencia-desde').value = new Date().toISOString().slice(0, 10);
  $('up-motivo').value = '';
  abrirModal('modal-uniformes-precio');
}

export async function guardarPrecioUniforme() {
  const prenda = $('up-prenda').value;
  const talle = $('up-talle').value || null;
  const precio = parseFloat($('up-precio').value);
  const vigenciaDesde = $('up-vigencia-desde').value;
  const motivo = ($('up-motivo').value || '').trim();
  if (!prenda) { toast('⚠️ Elegí la prenda'); return; }
  if (!precio || precio <= 0) { toast('⚠️ Ingresá un precio válido'); return; }
  if (!vigenciaDesde) { toast('⚠️ Ingresá la fecha de vigencia'); return; }

  if (_precioModo === 'corregir' && _precioEditandoId) {
    const p = getPrecioById(_precioEditandoId);
    p.prenda = prenda; p.talle = talle; p.precio = precio;
    p.vigenciaDesde = vigenciaDesde; p.motivoCarga = motivo;
    p.cargadoPor = currentUser?.nombre || '';
    await supaSync('preciosUniformes', p);
    toast('✅ Precio corregido');
  } else {
    // Cerrar el vigente anterior de la misma prenda+talle (si hay).
    const anterior = preciosVigentes().find(p => p.prenda === prenda && (p.talle || null) === talle);
    if (anterior) {
      const cierre = new Date(vigenciaDesde);
      cierre.setDate(cierre.getDate() - 1);
      anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
      await supaSync('preciosUniformes', anterior);
    }
    const nuevo = {
      id: Date.now(),
      prenda, talle, precio, vigenciaDesde,
      vigenciaHasta: null,
      cargadoPor: currentUser?.nombre || '',
      motivoCarga: motivo,
    };
    if (!DB.preciosUniformes) DB.preciosUniformes = [];
    DB.preciosUniformes.push(nuevo);
    await supaSync('preciosUniformes', nuevo);
    toast('✅ Precio guardado');
  }
  cerrarModal('modal-uniformes-precio');
  renderPreciosUniformes();
  if ($('tbody-uni-precios-grid')) renderPreciosUniformesGrid();
}

// ========== TAB PRECIOS — GRID PRENDA × MES (v107) ==========
//
// Ticket "Stock de uniformes — talles, mínimos y precios" (26/08),
// "misma mecánica que Valores hora de Categorías" (valores.js). Reusa
// TAL CUAL preciosUniformes + obtenerPrecioVigente/guardarPrecioUniforme
// de arriba — la única regla nueva es "SIN excepciones por talle": esta
// vista siempre trabaja con talle null (precio general de la prenda).
//
// azul (cargado ese mes) vs gris itálica (heredado): se distingue
// comparando si la vigencia que resuelve ESE mes empezó justo ese mes
// (v.vigenciaDesde) o es una vigencia de un mes anterior que sigue
// corriendo hacia adelante.

const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

export function poblarFiltroAnioPreciosUniformes() {
  const sel = $('up-grid-anio');
  if (!sel) return;
  const actual = new Date().getFullYear();
  sel.innerHTML = [actual, actual - 1].map(a => `<option value="${a}">${a}</option>`).join('');
}

export function filtrarAnioPreciosUniformes() { renderPreciosUniformesGrid(); }

// PPP actual de la prenda (para la columna de referencia): promedio de
// costo_ppp entre los talles que ya tengan uno cargado. Hoy siempre da
// "—" porque no existe todavía el circuito de "Nueva compra" de
// uniformes (compras_uniformes existe desde v071 sin UI — fuera de
// alcance de este ticket) — la columna queda lista para cuando exista.
function pppActualPrenda(prenda) {
  const filas = (DB.stockUniformes || []).filter(s => s.prenda === prenda && s.costoPpp > 0);
  if (!filas.length) return null;
  return filas.reduce((s, f) => s + f.costoPpp, 0) / filas.length;
}

export function renderPreciosUniformesGrid() {
  poblarFiltroAnioPreciosUniformes();
  const tbody = $('tbody-uni-precios-grid');
  if (!tbody) return;
  const anio = parseInt(($('up-grid-anio') || {}).value, 10) || new Date().getFullYear();
  const hoy = new Date().toISOString().slice(0, 10);

  let sinVigente = [];
  tbody.innerHTML = PRENDAS.map(prenda => {
    const vigenteHoy = obtenerPrecioVigente(prenda, null, new Date());
    if (!vigenteHoy) sinVigente.push(prenda);
    let fila = `<tr${!vigenteHoy ? ' style="background:#fff8f2;"' : ''}><td style="font-weight:600;white-space:nowrap;">${prenda}</td>`;
    fila += MESES_CORTOS.map((_, i) => {
      const fechaMes = `${anio}-${String(i + 1).padStart(2, '0')}-01`;
      const v = obtenerPrecioVigente(prenda, null, new Date(fechaMes + 'T00:00:00'));
      if (!v) return `<td style="text-align:right;color:var(--texto-muy-suave);">—</td>`;
      const cargadoEsteMes = v.vigenciaDesde && v.vigenciaDesde.slice(0, 7) === fechaMes.slice(0, 7);
      const estilo = cargadoEsteMes ? 'color:var(--azul);font-weight:700;' : 'color:var(--texto-muy-suave);font-style:italic;';
      return `<td style="text-align:right;${estilo}">${Number(v.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>`;
    }).join('');
    const ppp = pppActualPrenda(prenda);
    fila += `<td style="text-align:right;color:var(--texto-suave);">${ppp ? ppp.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '—'}</td>`;
    fila += `<td style="white-space:nowrap;">
      <button class="btn btn-xs btn-secondary" onclick="abrirNuevoPrecioConVigencia('${prenda}','')">Cargar</button>
      <button class="btn btn-xs btn-secondary" onclick="abrirHistorialPrecioUniforme('${prenda}','')" title="Historial">🕐</button>
    </td></tr>`;
    return fila;
  }).join('');

  const banner = $('up-alarma-sin-precio');
  if (banner) {
    banner.style.display = sinVigente.length ? 'flex' : 'none';
    banner.textContent = sinVigente.length ? `⚠ Sin precio de reposición vigente: ${sinVigente.join(', ')}. No se puede armar una constancia de entrega con descuento para esa(s) prenda(s) hasta cargarlo.` : '';
  }
}

// ========== CARGA MASIVA DE PRECIOS (v107) ==========
// Mismo patrón que la carga masiva de Categorías (valores.js) + el paso
// extra que pide el ticket: "% de aumento general" que precompleta
// todas las filas sobre su vigente, editable a mano fila por fila.

export function abrirCargaMasivaPreciosUniformes() {
  const tbody = $('cmu-tbody');
  if (!tbody) return;
  tbody.innerHTML = PRENDAS.map(prenda => {
    const v = obtenerPrecioVigente(prenda, null, new Date());
    return `<tr data-cmu-prenda="${prenda}">
      <td>${prenda}</td>
      <td style="text-align:right;">${v ? '$' + Number(v.precio).toLocaleString('es-AR') : 'sin cargar'}</td>
      <td><input type="number" min="0" step="0.01" class="cmu-input-nuevo" data-base="${v ? v.precio : ''}" style="width:110px;" placeholder="—"></td>
    </tr>`;
  }).join('');
  const pct = $('cmu-pct'); if (pct) pct.value = '';
  const vig = $('cmu-vigencia-desde'); if (vig) vig.value = new Date().toISOString().slice(0, 10);
  const mot = $('cmu-motivo'); if (mot) mot.value = '';
  abrirModal('modal-uniformes-precios-masiva');
}

// "⚡ Impactar en todas": aplica el % a cada fila que TENGA vigente. Las
// prendas sin vigente (Remera) quedan en blanco — se cargan solas desde
// su fila, como aclara el mockup.
export function aplicarPorcentajeMasivoPreciosUniformes() {
  const pct = parseFloat((($('cmu-pct') || {}).value || '0').replace(',', '.')) / 100;
  document.querySelectorAll('#cmu-tbody .cmu-input-nuevo').forEach(inp => {
    const base = parseFloat(inp.dataset.base);
    if (!base) return;   // sin vigente: no se toca, se carga a mano si corresponde
    inp.value = Number((base * (1 + pct)).toFixed(2));
  });
}

export async function confirmarCargaMasivaPreciosUniformes() {
  const vigenciaDesde = ($('cmu-vigencia-desde') || {}).value;
  const motivo = (($('cmu-motivo') || {}).value || '').trim();
  if (!vigenciaDesde) { toast('⚠️ Ingresá la fecha de vigencia'); return; }
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }

  const cambios = Array.from(document.querySelectorAll('#cmu-tbody tr')).map(tr => ({
    prenda: tr.getAttribute('data-cmu-prenda'),
    nuevoPrecio: parseFloat(tr.querySelector('.cmu-input-nuevo').value),
  })).filter(f => !isNaN(f.nuevoPrecio) && f.nuevoPrecio >= 0);

  if (!cambios.length) { toast('⚠️ No cargaste ningún precio nuevo'); return; }
  if (!confirm(`Se van a crear ${cambios.length} vigencia(s) nueva(s) desde ${vigenciaDesde}. Las constancias/cuotas ya firmadas no se tocan. ¿Confirmás?`)) return;

  let i = 0;
  for (const cambio of cambios) {
    const anterior = preciosVigentes().find(p => p.prenda === cambio.prenda && !p.talle);
    if (anterior) {
      const cierre = new Date(vigenciaDesde + 'T00:00:00');
      cierre.setDate(cierre.getDate() - 1);
      anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
      await supaSync('preciosUniformes', anterior);
    }
    const nuevo = {
      id: Date.now() + (i++),
      prenda: cambio.prenda, talle: null, precio: cambio.nuevoPrecio, vigenciaDesde,
      vigenciaHasta: null, cargadoPor: currentUser?.nombre || '', motivoCarga: motivo,
    };
    if (!DB.preciosUniformes) DB.preciosUniformes = [];
    DB.preciosUniformes.push(nuevo);
    await supaSync('preciosUniformes', nuevo);
  }

  cerrarModal('modal-uniformes-precios-masiva');
  renderPreciosUniformesGrid();
  toast(`✅ ${cambios.length} precio(s) actualizado(s)`);
}

// ========== HISTORIAL ==========

export function abrirHistorialPrecioUniforme(prenda, talle) {
  const talleFiltro = talle || null;
  const historial = (DB.preciosUniformes || [])
    .filter(p => p.prenda === prenda && (p.talle || null) === talleFiltro)
    .sort((a, b) => (b.vigenciaDesde || '').localeCompare(a.vigenciaDesde || ''));
  $('uph-titulo').textContent = `Historial — ${prenda}${talle ? ' / talle ' + talle : ''}`;
  $('uph-cuerpo').innerHTML = historial.length === 0
    ? '<p style="opacity:.5;">Sin historial</p>'
    : historial.map(p => `<div class="info-item">
        <div class="key">${p.vigenciaDesde} ${p.vigenciaHasta ? 'al ' + p.vigenciaHasta : '(vigente)'}</div>
        <div class="val">$${(p.precio || 0).toLocaleString('es-AR')} — cargado por ${p.cargadoPor || '—'}${p.motivoCarga ? ' — ' + p.motivoCarga : ''}</div>
      </div>`).join('');
  abrirModal('modal-uniformes-precio-historial');
}
