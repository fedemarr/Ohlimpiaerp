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
