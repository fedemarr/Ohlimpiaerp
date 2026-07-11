// Gestión de Adelantos v1.1 — Tab "⚙️ Configuración": tope de
// adelanto con vigencia temporal (Corregir/Nueva vigencia), máximo de
// cuotas, umbral de alerta de pedidos por mes.

import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import {
  obtenerTopeVigente, historialTopes, guardarNuevoTope,
  obtenerMaxCuotas, obtenerUmbralAlertaPedidos, guardarConfig,
} from '../adelantos_prestamos_shared/config.js';

export function renderConfiguracionAdelantos() {
  const tope = obtenerTopeVigente();
  if ($('cfg-tope-actual')) $('cfg-tope-actual').textContent = tope != null ? '$' + tope.toLocaleString('es-AR') : 'Sin cargar';
  if ($('cfg-max-cuotas-actual')) $('cfg-max-cuotas-actual').textContent = obtenerMaxCuotas();
  if ($('cfg-umbral-actual')) $('cfg-umbral-actual').textContent = obtenerUmbralAlertaPedidos();
}

// ========== MODAL — MODIFICAR TOPE ==========

let _topeModo = 'corregir';

function ensureModalTope() {
  if ($('modal-cfg-tope')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cfg-tope';
  m.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3 id="cft-titulo">Modificar tope</h3><button class="btn-close" onclick="cerrarModal('modal-cfg-tope')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Tipo de cambio *</label>
          <label style="display:block;font-weight:400;"><input type="radio" name="cft-tipo" value="corregir" checked onchange="cambiarTipoCambioTope()"> Corregir error</label>
          <label style="display:block;font-weight:400;"><input type="radio" name="cft-tipo" value="vigencia" onchange="cambiarTipoCambioTope()"> Cambio con vigencia</label>
        </div>
        <div class="form-group"><label>Nuevo monto *</label><input type="number" id="cft-monto" min="0" step="1000"></div>
        <div class="form-group" id="cft-grupo-vigencia" style="display:none;"><label>Vigente desde *</label><input type="date" id="cft-vigencia-desde"></div>
        <div class="form-group"><label>Motivo *</label><textarea id="cft-motivo" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cfg-tope')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarModificarTope()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function cambiarTipoCambioTope() {
  _topeModo = document.querySelector('input[name="cft-tipo"]:checked')?.value || 'corregir';
  $('cft-grupo-vigencia').style.display = _topeModo === 'vigencia' ? 'block' : 'none';
}

export function abrirModificarTope() {
  ensureModalTope();
  document.querySelector('input[name="cft-tipo"][value="corregir"]').checked = true;
  _topeModo = 'corregir';
  $('cft-grupo-vigencia').style.display = 'none';
  $('cft-monto').value = obtenerTopeVigente() || '';
  $('cft-vigencia-desde').value = new Date().toISOString().slice(0, 10);
  $('cft-motivo').value = '';
  abrirModal('modal-cfg-tope');
}

export async function confirmarModificarTope() {
  const monto = parseFloat($('cft-monto').value);
  const motivo = ($('cft-motivo').value || '').trim();
  if (!monto || monto <= 0) { toast('⚠️ Ingresá un monto válido'); return; }
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }
  const vigenciaDesde = _topeModo === 'vigencia' ? $('cft-vigencia-desde').value : null;
  if (_topeModo === 'vigencia' && !vigenciaDesde) { toast('⚠️ Ingresá la fecha de vigencia'); return; }
  try {
    await guardarNuevoTope({ tipoCambio: _topeModo, monto, vigenciaDesde, motivo });
    cerrarModal('modal-cfg-tope');
    renderConfiguracionAdelantos();
    toast('✅ Tope actualizado');
  } catch (e) {
    toast('⚠️ ' + e.message);
  }
}

// ========== MODAL — HISTORIAL DE TOPES ==========

function ensureModalHistorialTope() {
  if ($('modal-cfg-tope-historial')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cfg-tope-historial';
  m.innerHTML = `
    <div class="modal" style="max-width:460px;">
      <div class="modal-header"><h3>Historial del tope</h3><button class="btn-close" onclick="cerrarModal('modal-cfg-tope-historial')">×</button></div>
      <div class="modal-body" id="cfth-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-cfg-tope-historial')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirHistorialTope() {
  ensureModalHistorialTope();
  const versiones = historialTopes();
  $('cfth-cuerpo').innerHTML = versiones.map(v => `<div class="info-item">
      <div class="key">${v.vigenciaDesde} ${v.vigenciaHasta ? 'al ' + v.vigenciaHasta : '(vigente)'}</div>
      <div class="val">$${Number(v.montoTope).toLocaleString('es-AR')} — cargado por ${v.cargadoPor}${v.motivo ? ' — ' + v.motivo : ''}</div>
    </div>`).join('') || '<p style="opacity:.5;">Sin historial</p>';
  abrirModal('modal-cfg-tope-historial');
}

// ========== MODAL — MÁXIMO DE CUOTAS / UMBRAL DE ALERTA ==========

let _configEditando = null; // 'max_cuotas' | 'umbral_alerta_pedidos'

function ensureModalConfigSimple() {
  if ($('modal-cfg-simple')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cfg-simple';
  m.innerHTML = `
    <div class="modal" style="max-width:380px;">
      <div class="modal-header"><h3 id="cfs-titulo">Modificar</h3><button class="btn-close" onclick="cerrarModal('modal-cfg-simple')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label id="cfs-label">Valor *</label><input type="number" id="cfs-valor" min="1"></div>
        <div class="form-group"><label>Motivo</label><textarea id="cfs-motivo" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cfg-simple')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarConfigSimple()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirModificarMaxCuotas() {
  _configEditando = 'max_cuotas';
  ensureModalConfigSimple();
  $('cfs-titulo').textContent = 'Máximo de cuotas';
  $('cfs-label').textContent = 'Máximo de cuotas (soft warning) *';
  $('cfs-valor').value = obtenerMaxCuotas();
  $('cfs-motivo').value = '';
  abrirModal('modal-cfg-simple');
}

export function abrirModificarUmbral() {
  _configEditando = 'umbral_alerta_pedidos';
  ensureModalConfigSimple();
  $('cfs-titulo').textContent = 'Umbral de alerta de pedidos';
  $('cfs-label').textContent = 'Cantidad de pedidos por mes que gatilla alerta *';
  $('cfs-valor').value = obtenerUmbralAlertaPedidos();
  $('cfs-motivo').value = '';
  abrirModal('modal-cfg-simple');
}

export async function confirmarConfigSimple() {
  const valor = parseInt($('cfs-valor').value, 10);
  if (!valor || valor <= 0) { toast('⚠️ Ingresá un valor válido'); return; }
  await guardarConfig(_configEditando, valor, ($('cfs-motivo').value || '').trim());
  cerrarModal('modal-cfg-simple');
  renderConfiguracionAdelantos();
  toast('✅ Configuración actualizada');
}
