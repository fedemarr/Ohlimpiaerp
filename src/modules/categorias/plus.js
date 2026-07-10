// Categorías v1 — Tab 3: plus adicionales (Extra Sanidad, Extra
// Nocturno), mismo patrón Corregir/Nueva vigencia que valores.js pero
// sin matriz (es una lista plana).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getPlusById, obtenerValorPlusVigente, idLocalTrunc } from './consultas.js';

function hoyISO() { return new Date().toISOString().slice(0, 10); }

// ========== TAB 3 — LISTA DE PLUS ==========

export function renderPlusAdicionales() {
  const tbody = $('tbody-cat-plus');
  if (!tbody) return;
  const hoy = hoyISO();
  const plus = (DB.plusAdicionales || []).filter(p => !p.anulado)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  tbody.innerHTML = plus.length === 0
    ? '<tr><td colspan="5" style="text-align:center;padding:24px;opacity:.5;">Sin plus cargados</td></tr>'
    : plus.map(p => {
      const version = obtenerValorPlusVigente(p.id, hoy);
      return `<tr style="${!p.activa ? 'opacity:.5;' : ''}">
        <td>${p.nombre}</td>
        <td style="font-size:12px;color:var(--texto-suave);">${p.descripcion || '—'}</td>
        <td style="text-align:right;font-weight:600;">${version ? '$' + Number(version.valorAdicional).toLocaleString('es-AR') : 'sin cargar'}</td>
        <td style="font-size:12px;">${version ? version.vigenciaDesde : '—'}</td>
        <td style="white-space:nowrap;">
          ${version
            ? `<button class="btn btn-xs btn-secondary" onclick="abrirCorregirPlus('${p.id}')">✏️ Corregir</button>
               <button class="btn btn-xs" onclick="abrirNuevaVigenciaPlus('${p.id}')">📅 Nueva vigencia</button>`
            : `<button class="btn btn-xs" onclick="abrirNuevaVigenciaPlus('${p.id}')">+ Cargar valor</button>`}
          <button class="btn btn-xs btn-secondary" onclick="abrirHistorialPlus('${p.id}')">🕐 Historial</button>
          <button class="btn btn-xs" onclick="activarDesactivarPlusPorId('${p.id}')">${p.activa ? '🚫' : '✅'}</button>
        </td>
      </tr>`;
    }).join('');
}

export async function activarDesactivarPlusPorId(plusIdLocal) {
  const p = getPlusById(plusIdLocal);
  if (!p) return;
  p.activa = !p.activa;
  await supaSync('plusAdicionales', p);
  renderPlusAdicionales();
  toast(p.activa ? '✅ Plus activado' : '🚫 Plus desactivado');
}

// ========== MODAL — CORREGIR / NUEVA VIGENCIA ==========

let _plusModo = 'corregir'; // 'corregir' | 'vigencia'
let _plusEditandoId = null;
let _versionPlusEditandoId = null;

function ensureModalPlusVersion() {
  if ($('modal-cat-plus-version')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cat-plus-version';
  m.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header"><h3 id="pv-titulo">Editar plus</h3><button class="btn-close" onclick="cerrarModal('modal-cat-plus-version')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Valor adicional *</label><input type="number" id="pv-valor" min="0" step="0.01"></div>
        <div class="form-group" id="pv-grupo-vigencia" style="display:none;"><label>Vigente desde *</label><input type="date" id="pv-vigencia-desde"></div>
        <div class="form-group"><label>Motivo *</label><textarea id="pv-motivo" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cat-plus-version')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarVersionPlusDesdeModal()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirCorregirPlus(plusIdLocal) {
  const p = getPlusById(plusIdLocal);
  if (!p) return;
  const version = obtenerValorPlusVigente(plusIdLocal, hoyISO());
  if (!version) { toast('⚠️ Este plus no tiene una versión vigente para corregir'); return; }
  _plusModo = 'corregir'; _plusEditandoId = plusIdLocal; _versionPlusEditandoId = version.id;
  ensureModalPlusVersion();
  $('pv-titulo').textContent = `Corregir — ${p.nombre}`;
  $('pv-valor').value = version.valorAdicional;
  $('pv-grupo-vigencia').style.display = 'none';
  $('pv-motivo').value = '';
  abrirModal('modal-cat-plus-version');
}

export function abrirNuevaVigenciaPlus(plusIdLocal) {
  const p = getPlusById(plusIdLocal);
  if (!p) return;
  const version = obtenerValorPlusVigente(plusIdLocal, hoyISO());
  _plusModo = 'vigencia'; _plusEditandoId = plusIdLocal; _versionPlusEditandoId = null;
  ensureModalPlusVersion();
  $('pv-titulo').textContent = `Nueva vigencia — ${p.nombre}`;
  $('pv-valor').value = version ? version.valorAdicional : 0;
  $('pv-grupo-vigencia').style.display = 'block';
  $('pv-vigencia-desde').value = hoyISO();
  $('pv-motivo').value = '';
  abrirModal('modal-cat-plus-version');
}

export async function guardarVersionPlusDesdeModal() {
  const valorAdicional = parseFloat($('pv-valor').value);
  const motivo = ($('pv-motivo').value || '').trim();
  if (isNaN(valorAdicional) || valorAdicional < 0) { toast('⚠️ Ingresá un valor válido'); return; }
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }

  if (_plusModo === 'corregir') {
    const version = (DB.valoresPlus || []).find(v => String(v.id) === String(_versionPlusEditandoId));
    if (!version) { toast('⚠️ No se encontró la versión'); return; }
    version.valorAdicional = valorAdicional;
    version.motivoCarga = motivo;
    version.cargadaPor = currentUser?.nombre || '';
    await supaSync('valoresPlus', version);
    toast('✅ Valor corregido — los cálculos históricos no cambian');
  } else {
    const vigenciaDesde = $('pv-vigencia-desde').value;
    if (!vigenciaDesde) { toast('⚠️ Ingresá la fecha de vigencia'); return; }
    const anterior = obtenerValorPlusVigente(_plusEditandoId, vigenciaDesde);
    if (anterior) {
      const cierre = new Date(vigenciaDesde + 'T00:00:00');
      cierre.setDate(cierre.getDate() - 1);
      anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
      await supaSync('valoresPlus', anterior);
    }
    const nueva = {
      id: Date.now(),
      plusIdLocal: idLocalTrunc(_plusEditandoId),
      valorAdicional, vigenciaDesde, vigenciaHasta: null,
      cargadaPor: currentUser?.nombre || '', motivoCarga: motivo,
    };
    if (!DB.valoresPlus) DB.valoresPlus = [];
    DB.valoresPlus.push(nueva);
    await supaSync('valoresPlus', nueva);
    toast('✅ Nueva vigencia guardada');
  }
  cerrarModal('modal-cat-plus-version');
  renderPlusAdicionales();
}

// ========== MODAL — HISTORIAL ==========

function ensureModalHistorialPlus() {
  if ($('modal-cat-plus-historial')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cat-plus-historial';
  m.innerHTML = `
    <div class="modal" style="max-width:460px;">
      <div class="modal-header"><h3 id="ph-titulo">Historial</h3><button class="btn-close" onclick="cerrarModal('modal-cat-plus-historial')">×</button></div>
      <div class="modal-body" id="ph-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-cat-plus-historial')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirHistorialPlus(plusIdLocal) {
  const p = getPlusById(plusIdLocal);
  if (!p) return;
  ensureModalHistorialPlus();
  $('ph-titulo').textContent = `Historial — ${p.nombre}`;
  const versiones = (DB.valoresPlus || [])
    .filter(v => !v.anulado && String(v.plusIdLocal) === idLocalTrunc(plusIdLocal))
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
  $('ph-cuerpo').innerHTML = versiones.map(v => `<div class="info-item">
      <div class="key">${v.vigenciaDesde} ${v.vigenciaHasta ? 'al ' + v.vigenciaHasta : '(vigente)'}</div>
      <div class="val">$${Number(v.valorAdicional).toLocaleString('es-AR')} — cargado por ${v.cargadaPor}${v.motivoCarga ? ' — ' + v.motivoCarga : ''}</div>
    </div>`).join('') || '<p style="opacity:.5;">Sin historial</p>';
  abrirModal('modal-cat-plus-historial');
}
