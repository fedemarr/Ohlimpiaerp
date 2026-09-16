// Cuentas CBU v1 — Padrón de cuentas bancarias (ver consultas.js para el
// modelo de datos y el porqué). Este archivo tiene el render de los 3
// tabs (Pendientes / Padrón / Historial), los modales y el import masivo.

import { DB, currentUser } from '@shared/state.js';
import { $, avatarEl } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import {
  cbuChecksumValido, deducirBanco, getCuentaCbu, guardarCuentaCbu, historialCuentaCbu,
} from './consultas.js';

function _soloDigitos(s) { return (s || '').replace(/\D/g, ''); }
function _legajoActivos() { return (DB.legajos || []).filter(l => l.estado === 'Activo'); }
function _fmtFecha(iso) { return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-AR') : '—'; }
function _diasDesde(iso) { if (!iso) return null; return Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000); }

// Estado efectivo de un legajo: la fila de cuentas_cbu si existe, o un
// "SIN_CUENTA" virtual si el asociado todavía no tiene ninguna fila (caso
// de legajos ya cargados antes de este módulo, previo al import inicial).
function _estadoCbu(legajoNro) {
  return getCuentaCbu(legajoNro) || { legajoNro: String(legajoNro), estado: 'SIN_CUENTA' };
}

const _CHIP_ESTADO = {
  ACTIVA: '<span class="badge badge-verde">ACTIVA</span>',
  EN_TRAMITE: '<span class="badge badge-naranja">EN TRÁMITE</span>',
  SIN_CUENTA: '<span class="badge badge-rojo">SIN CUENTA</span>',
};

// ========== TABS ==========

const RENDER_POR_TAB = {
  pendientes: renderCbuPendientes,
  padron: renderCbuPadron,
  historial: renderCbuHistorial,
};

export function tabCbu(tab, btn) {
  document.querySelectorAll('#screen-cuentas_cbu .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-cuentas_cbu .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-cuentas_cbu .tab-btn[data-cbu-tab="${tab}"]`)?.classList.add('active');
  $('cbu-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

export function renderCuentasCbu() {
  _renderKpisCbu();
  tabCbu('pendientes');
}

function _renderKpisCbu() {
  const activos = _legajoActivos();
  let activas = 0, enTramite = 0, sinCuenta = 0, sumaDiasTramite = 0;
  activos.forEach(l => {
    const c = _estadoCbu(l.nro);
    if (c.estado === 'ACTIVA') activas++;
    else if (c.estado === 'EN_TRAMITE') { enTramite++; sumaDiasTramite += (_diasDesde(c.tramiteFecha) || 0); }
    else sinCuenta++;
  });
  const promDias = enTramite ? Math.round(sumaDiasTramite / enTramite) : 0;
  if ($('kpi-cbu-activa')) $('kpi-cbu-activa').textContent = activas;
  if ($('kpi-cbu-tramite')) $('kpi-cbu-tramite').textContent = enTramite + (enTramite ? ` · prom. ${promDias}d` : '');
  if ($('kpi-cbu-sin')) $('kpi-cbu-sin').textContent = sinCuenta;
  const badgePend = $('cbu-badge-pendientes');
  if (badgePend) {
    const total = enTramite + sinCuenta;
    badgePend.textContent = total;
    badgePend.style.display = total ? 'inline-block' : 'none';
  }
}

// ========== TAB PENDIENTES (bandeja) ==========

export function renderCbuPendientes() {
  const tbody = $('tbody-cbu-pendientes');
  if (!tbody) return;
  const filas = _legajoActivos()
    .map(l => ({ l, c: _estadoCbu(l.nro) }))
    .filter(({ c }) => c.estado !== 'ACTIVA')
    .sort((a, b) => {
      // EN_TRAMITE primero (más días esperando primero), después SIN_CUENTA
      if (a.c.estado !== b.c.estado) return a.c.estado === 'EN_TRAMITE' ? -1 : 1;
      if (a.c.estado === 'EN_TRAMITE') return (_diasDesde(b.c.tramiteFecha) || 0) - (_diasDesde(a.c.tramiteFecha) || 0);
      return String(a.l.nombre).localeCompare(String(b.l.nombre), 'es');
    });

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;opacity:.5;">Todos los asociados activos tienen CBU cargado. 🎉</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(({ l, c }) => {
    const dias = c.estado === 'EN_TRAMITE' ? _diasDesde(c.tramiteFecha) : null;
    const tramiteCel = c.estado === 'EN_TRAMITE'
      ? `${c.tramiteBanco || '—'} · pedido ${_fmtFecha(c.tramiteFecha)}<br><span class="text-muted" style="font-size:10.5px;">${c.tramitePor || ''}${dias != null ? ' · hace ' + dias + ' día(s)' : ''}</span>`
      : '<span class="text-muted">— sin iniciar</span>';
    const accion = c.estado === 'EN_TRAMITE'
      ? `<button class="btn btn-primary btn-xs" onclick="abrirCargarCbuModal('${l.nro}')">Cargar CBU</button>`
      : `<button class="btn btn-secondary btn-xs" onclick="abrirIniciarTramiteCbu('${l.nro}')">Iniciar trámite</button> <button class="btn btn-primary btn-xs" onclick="abrirCargarCbuModal('${l.nro}')">Cargar CBU</button>`;
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px;">${avatarEl(l.nombre, 26)}<div><div style="font-weight:600;">${l.nro} · ${l.nombre}</div><div class="text-muted" style="font-size:10.5px;">alta ${l.ingreso || '—'}</div></div></div></td>
      <td style="font-size:12px;">${l.cuit || '—'}</td>
      <td>${_CHIP_ESTADO[c.estado]}</td>
      <td style="font-size:12px;">${tramiteCel}</td>
      <td style="white-space:nowrap;">${accion}</td>
    </tr>`;
  }).join('');
}

// ========== TAB PADRÓN (solo ACTIVAS) ==========

export function filtrarPadronCbu() { renderCbuPadron(); }

export function renderCbuPadron() {
  const tbody = $('tbody-cbu-padron');
  if (!tbody) return;
  const q = ($('cbu-padron-buscar') || { value: '' }).value.trim().toLowerCase();
  const fBanco = ($('cbu-padron-fil-banco') || { value: '' }).value;

  let filas = (DB.cuentasCbu || []).filter(c => !c.anulado && c.estado === 'ACTIVA');
  if (fBanco) filas = filas.filter(c => c.banco === fBanco);
  if (q) {
    filas = filas.filter(c =>
      String(c.legajoNro).includes(q) ||
      (c.nombreAsociado || '').toLowerCase().includes(q) ||
      (c.cuitTitular || '').includes(q) ||
      _soloDigitos(c.cbu).includes(_soloDigitos(q)));
  }
  filas.sort((a, b) => String(a.nombreAsociado).localeCompare(String(b.nombreAsociado), 'es'));

  _poblarFiltroBancoCbu();

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;opacity:.5;">Sin cuentas activas para el filtro.</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(c => {
    const l = (DB.legajos || []).find(x => String(x.nro) === String(c.legajoNro));
    const cuitAsoc = l ? _soloDigitos(l.cuit) : '';
    const esTercero = c.esTercero || (cuitAsoc && c.cuitTitular && _soloDigitos(c.cuitTitular) !== cuitAsoc);
    const dedu = deducirBanco(c.cbu);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px;">${avatarEl(c.nombreAsociado || l?.nombre || '?', 26)}<div style="font-weight:600;">${c.legajoNro} · ${c.nombreAsociado || l?.nombre || '—'}</div></div></td>
      <td style="font-size:12px;">${l?.cuit || '—'}</td>
      <td>${_CHIP_ESTADO.ACTIVA}</td>
      <td><span class="badge badge-azul">${c.banco || '—'}</span>${dedu.esExcepcion ? ' <span class="badge badge-naranja" style="font-size:9px;">EXCEPCIÓN</span>' : ''}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;">${c.cbu}</td>
      <td>${esTercero ? '<span class="badge badge-naranja" title="El CUIT del titular no es el del asociado">⚠ TERCERO</span>' : '<span class="badge badge-verde">PROPIA</span>'}</td>
      <td style="font-size:12px;">${c.vigenteDesde ? c.vigenteDesde.slice(0, 7) : '—'}</td>
      <td><button class="btn btn-secondary btn-xs" onclick="abrirCargarCbuModal('${c.legajoNro}')">Cambiar</button></td>
    </tr>`;
  }).join('');
}

function _poblarFiltroBancoCbu() {
  const sel = $('cbu-padron-fil-banco');
  if (!sel || sel.dataset.poblado) return;
  const bancos = [...new Set((DB.cuentasCbu || []).filter(c => c.estado === 'ACTIVA').map(c => c.banco).filter(Boolean))].sort();
  if (!bancos.length) return;
  sel.innerHTML = '<option value="">Banco: todos</option>' + bancos.map(b => `<option>${b}</option>`).join('');
  sel.dataset.poblado = '1';
}

export function exportarPadronCbu() {
  const filas = [['N° socio', 'Asociado', 'CUIT titular', 'Banco', 'CBU', 'Alias', 'Vigente desde']];
  (DB.cuentasCbu || []).filter(c => !c.anulado && c.estado === 'ACTIVA')
    .sort((a, b) => String(a.nombreAsociado).localeCompare(String(b.nombreAsociado), 'es'))
    .forEach(c => filas.push([c.legajoNro, c.nombreAsociado, c.cuitTitular, c.banco, c.cbu, c.alias || '', c.vigenteDesde || '']));
  const csv = filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `padron_cuentas_cbu_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ========== TAB HISTORIAL ==========

export function filtrarHistorialCbu() { renderCbuHistorial(); }

export function renderCbuHistorial() {
  const tbody = $('tbody-cbu-historial');
  if (!tbody) return;
  const q = ($('cbu-hist-buscar') || { value: '' }).value.trim().toLowerCase();
  let filas = [...(DB.cuentasCbuHistorial || [])];
  if (q) filas = filas.filter(h => (h.nombreAsociado || '').toLowerCase().includes(q) || String(h.legajoNro).includes(q));
  filas.sort((a, b) => String(b.cargadoEn).localeCompare(String(a.cargadoEn)));

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;opacity:.5;">Todavía no hay cambios registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(h => `<tr>
    <td style="font-size:12px;">${new Date(h.cargadoEn).toLocaleString('es-AR')}</td>
    <td>${h.legajoNro} · ${h.nombreAsociado || '—'}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px;">${h.cbuAnterior ? '…' + h.cbuAnterior.slice(-6) : '(nueva)'} → …${(h.cbuNuevo || '').slice(-6)}</td>
    <td style="font-size:12px;">${h.motivo || '—'}</td>
    <td style="font-size:12px;">${h.cargadoPor || '—'}</td>
  </tr>`).join('');
}

// ========== MODAL: INICIAR TRÁMITE ==========

const BANCOS_TRAMITE = ['BBVA', 'Macro', 'Bco. Provincia', 'Nación', 'Galicia', 'Santander'];
let _tramiteLegajoNro = null;

export function abrirIniciarTramiteCbu(legajoNro) {
  _tramiteLegajoNro = String(legajoNro);
  ensureModalTramite();
  const l = (DB.legajos || []).find(x => String(x.nro) === String(legajoNro));
  $('cbu-tramite-titulo').textContent = `Iniciar trámite bancario — ${legajoNro} · ${l ? l.nombre : ''}`;
  $('cbu-tramite-banco').innerHTML = BANCOS_TRAMITE.map(b => `<option>${b}</option>`).join('') + '<option value="__otro__">Otro banco...</option>';
  $('cbu-tramite-banco-otro').style.display = 'none';
  $('cbu-tramite-banco-otro').value = '';
  $('cbu-tramite-fecha').value = new Date().toISOString().slice(0, 10);
  $('cbu-tramite-obs').value = '';
  abrirModal('modal-cbu-tramite');
}
export function onChangeBancoTramiteCbu() {
  const esOtro = $('cbu-tramite-banco').value === '__otro__';
  $('cbu-tramite-banco-otro').style.display = esOtro ? 'block' : 'none';
}
function ensureModalTramite() {
  if ($('modal-cbu-tramite')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-cbu-tramite';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3 id="cbu-tramite-titulo">Iniciar trámite bancario</h3><button class="btn-close" onclick="cerrarModal('modal-cbu-tramite')">×</button></div>
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Banco *</label><select id="cbu-tramite-banco" onchange="onChangeBancoTramiteCbu()"></select></div>
          <div class="form-group"><label>Fecha del pedido *</label><input type="date" id="cbu-tramite-fecha"></div>
        </div>
        <input type="text" id="cbu-tramite-banco-otro" placeholder="Nombre del banco" style="display:none;width:100%;padding:8px;border:1px solid #ccd3e4;border-radius:7px;font-size:13px;margin-bottom:10px;">
        <div class="form-group"><label>Observaciones</label><textarea id="cbu-tramite-obs" rows="2" placeholder="Documentación enviada, contacto del banco..."></textarea></div>
        <div class="alerta alerta-info" style="margin:0;font-size:12px;">RRHH abre la cuenta → el asociado se contacta con el banco → el banco le informa el CBU a Finanzas, que lo carga acá. Mientras, la fila queda EN TRÁMITE con el contador de días.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cbu-tramite')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarIniciarTramiteCbu()">Iniciar trámite</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
export async function guardarIniciarTramiteCbu() {
  const legajoNro = _tramiteLegajoNro;
  const l = (DB.legajos || []).find(x => String(x.nro) === String(legajoNro));
  const selBanco = $('cbu-tramite-banco').value;
  const banco = selBanco === '__otro__' ? ($('cbu-tramite-banco-otro').value || '').trim() : selBanco;
  const fecha = $('cbu-tramite-fecha').value;
  if (!banco) { toast('⚠️ Elegí el banco'); return; }
  if (!fecha) { toast('⚠️ Elegí la fecha del pedido'); return; }
  const fila = await guardarCuentaCbu({
    legajoNro, nombreAsociado: l?.nombre, estado: 'EN_TRAMITE',
    tramiteBanco: banco, tramiteFecha: fecha, tramitePor: currentUser?.nombre || '',
    tramiteObservaciones: ($('cbu-tramite-obs').value || '').trim(),
    motivo: 'Inicio de trámite bancario',
  });
  if (!fila) { toast('⚠️ No se pudo guardar — reintentá'); return; }
  cerrarModal('modal-cbu-tramite');
  renderCuentasCbu();
  toast(`✓ Trámite iniciado — ${banco}, visible para Finanzas`);
}

// ========== MODAL: CARGAR / CAMBIAR CBU ==========

let _cargaLegajoNro = null;

export function abrirCargarCbuModal(legajoNro) {
  _cargaLegajoNro = String(legajoNro);
  ensureModalCargar();
  const l = (DB.legajos || []).find(x => String(x.nro) === String(legajoNro));
  const c = getCuentaCbu(legajoNro);
  $('cbu-carga-titulo').textContent = `${c && c.estado === 'ACTIVA' ? 'Cambiar' : 'Cargar'} CBU — ${legajoNro} · ${l ? l.nombre : ''}`;
  $('cbu-carga-cbu').value = '';
  $('cbu-carga-val').textContent = 'El sistema valida los dígitos verificadores y deduce el banco solo.';
  $('cbu-carga-val').style.color = '#889';
  $('cbu-carga-cuit-titular').value = c?.cuitTitular || l?.cuit || '';
  $('cbu-carga-cuit-asoc').value = l?.cuit || '—';
  $('cbu-carga-titular-aviso').innerHTML = '';
  $('cbu-carga-alias').value = c?.alias || '';
  $('cbu-carga-vigencia').value = new Date().toISOString().slice(0, 10);
  $('cbu-carga-motivo').value = '';
  abrirModal('modal-cbu-cargar');
}
export function validarCbuInputCuentas() {
  const el = $('cbu-carga-val');
  const raw = $('cbu-carga-cbu').value.replace(/\D/g, '');
  if (raw.length < 22) { el.style.color = '#889'; el.textContent = `${raw.length}/22 dígitos...`; return; }
  const ok = cbuChecksumValido(raw);
  const dedu = deducirBanco(raw);
  if (ok) {
    el.style.color = 'var(--verde)';
    el.textContent = `✔ CBU válido · ${dedu.nombre} (deducido solo)` + (dedu.esExcepcion ? ' — ⚠ EXCEPCIÓN: no es BBVA ni Macro' : '');
  } else {
    el.style.color = 'var(--rojo)';
    el.textContent = '✘ CBU inválido — los dígitos verificadores no cierran. Revisá el número.';
  }
}
export function chequearTitularCuentas() {
  const t = _soloDigitos($('cbu-carga-cuit-titular').value);
  const a = _soloDigitos(($('cbu-carga-cuit-asoc').value || ''));
  const el = $('cbu-carga-titular-aviso');
  if (t.length >= 11 && a.length >= 11 && t !== a) {
    el.innerHTML = '<span class="badge badge-naranja">⚠ CUENTA DE TERCERO</span> <span class="text-muted" style="font-size:11px;">el CUIT del titular no es el del asociado — se permite pero queda marcado y registrado.</span>';
  } else {
    el.innerHTML = '';
  }
}
function ensureModalCargar() {
  if ($('modal-cbu-cargar')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-cbu-cargar';
  m.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header"><h3 id="cbu-carga-titulo">Cargar CBU</h3><button class="btn-close" onclick="cerrarModal('modal-cbu-cargar')">×</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label>CBU (22 dígitos) *</label>
          <input type="text" id="cbu-carga-cbu" maxlength="22" inputmode="numeric" placeholder="Pegá o tipeá el CBU..." oninput="validarCbuInputCuentas()">
          <div id="cbu-carga-val" style="font-size:12px;margin-top:5px;font-weight:600;color:#889;"></div>
        </div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>CUIT del titular *</label><input type="text" id="cbu-carga-cuit-titular" oninput="chequearTitularCuentas()"></div>
          <div class="form-group"><label>CUIT del asociado</label><input type="text" id="cbu-carga-cuit-asoc" readonly style="background:#f2f4f9;"></div>
        </div>
        <div id="cbu-carga-titular-aviso" style="font-size:12px;margin-bottom:10px;"></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Alias (opcional)</label><input type="text" id="cbu-carga-alias"></div>
          <div class="form-group"><label>Vigente desde</label><input type="date" id="cbu-carga-vigencia"></div>
        </div>
        <div class="form-group"><label>Motivo / observaciones</label><textarea id="cbu-carga-motivo" rows="2" placeholder="Ej: CBU informado por el banco — trámite iniciado..."></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cbu-cargar')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarCargaCbu()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
export async function guardarCargaCbu() {
  const legajoNro = _cargaLegajoNro;
  const l = (DB.legajos || []).find(x => String(x.nro) === String(legajoNro));
  const cbu = $('cbu-carga-cbu').value.replace(/\D/g, '');
  if (!cbuChecksumValido(cbu)) { toast('⚠️ CBU inválido — revisá los dígitos verificadores'); return; }
  const cuitTitular = ($('cbu-carga-cuit-titular').value || '').trim();
  if (!cuitTitular) { toast('⚠️ Ingresá el CUIT del titular'); return; }
  const cuitAsoc = _soloDigitos(l?.cuit);
  const esTercero = cuitAsoc && _soloDigitos(cuitTitular) !== cuitAsoc;
  const dedu = deducirBanco(cbu);
  const fila = await guardarCuentaCbu({
    legajoNro, nombreAsociado: l?.nombre, estado: 'ACTIVA', cbu,
    banco: dedu.nombre, cuitTitular, esTercero,
    alias: ($('cbu-carga-alias').value || '').trim(),
    vigenteDesde: $('cbu-carga-vigencia').value || new Date().toISOString().slice(0, 10),
    tramiteBanco: '', tramiteFecha: null, tramitePor: '', tramiteObservaciones: '',
    motivo: ($('cbu-carga-motivo').value || '').trim(),
  });
  if (!fila) { toast('⚠️ No se pudo guardar — reintentá'); return; }
  cerrarModal('modal-cbu-cargar');
  renderCuentasCbu();
  toast('✅ Cuenta ACTIVA — el CBU ya está disponible en el legajo (solo lectura)');
}

// ========== IMPORT MASIVO (carga inicial) ==========

let _cbuImportFilas = null;

export function abrirImportCbuMasivo() {
  ensureModalImport();
  _cbuImportFilas = null;
  $('cbu-imp-file').value = '';
  $('cbu-imp-preview').innerHTML = '';
  $('cbu-imp-resumen').textContent = '';
  $('cbu-imp-btn').style.display = 'none';
  abrirModal('modal-cbu-import');
}
function ensureModalImport() {
  if ($('modal-cbu-import')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-cbu-import';
  m.innerHTML = `
    <div class="modal" style="max-width:820px;">
      <div class="modal-header"><h3>⬆ Import masivo de CBU</h3><button class="btn-close" onclick="cerrarModal('modal-cbu-import')">×</button></div>
      <div class="modal-body">
        <p style="font-size:12px;color:var(--texto-suave);">CSV con columnas: <b>N° socio</b>, <b>CBU</b> y <b>CUIT titular</b> (Apellido y nombre y Banco, si vienen, se ignoran — el nombre se toma del legajo y el banco se deduce solo del CBU). Las filas sin coincidencia, con CBU inválido o repetidas se muestran pero no se importan.</p>
        <div class="form-group"><label>Archivo CSV</label><input type="file" id="cbu-imp-file" accept=".csv,text/csv" onchange="seleccionarArchivoImportCbu()"></div>
        <div id="cbu-imp-resumen" style="margin:8px 0;font-size:13px;font-weight:600;color:var(--texto-suave);"></div>
        <div id="cbu-imp-preview" style="max-height:360px;overflow:auto;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cbu-import')">Cancelar</button>
        <button class="btn btn-primary" id="cbu-imp-btn" style="display:none;" onclick="confirmarImportCbuMasivo()">Importar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function _parseCsv(texto) {
  const lineas = texto.split(/\r\n|\r|\n/).filter(l => l.trim() !== '');
  const delim = (lineas[0].split(';').length > lineas[0].split(',').length) ? ';' : ',';
  return lineas.map(l => l.split(delim).map(c => c.trim().replace(/^"|"$/g, '')));
}
function _normalizarHeader(h) {
  return (h || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
const _ALIASES_HEADER = {
  n_socio: 'nro', numero_de_socio: 'nro', nro_socio: 'nro', n_asociado: 'nro',
  cbu: 'cbu', cb_u: 'cbu',
  cuit_titular: 'cuitTitular', cuit: 'cuitTitular',
  banco: 'banco',
  apellido_y_nombre: 'nombre',
};
export function seleccionarArchivoImportCbu() {
  const file = ($('cbu-imp-file') || {}).files?.[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const filas = _parseCsv(String(e.target.result || ''));
    if (filas.length < 2) { toast('⚠️ El CSV está vacío'); return; }
    const headers = filas[0].map(h => _ALIASES_HEADER[_normalizarHeader(h)] || _normalizarHeader(h));
    const datos = filas.slice(1).filter(f => f.some(v => (v || '').trim() !== ''));
    const nrosVistos = new Set();
    _cbuImportFilas = datos.map(cols => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (cols[i] || '').trim(); });
      const nro = _soloDigitos(obj.nro);
      const cbu = _soloDigitos(obj.cbu);
      const legajo = (DB.legajos || []).find(l => String(l.nro) === nro);
      let estado = 'ok', msg = '';
      if (!nro) { estado = 'error'; msg = 'falta N° de socio'; }
      else if (!legajo) { estado = 'error'; msg = 'no hay asociado con ese N° de socio'; }
      else if (!cbu) { estado = 'error'; msg = 'falta CBU'; }
      else if (!cbuChecksumValido(cbu)) { estado = 'error'; msg = 'CBU inválido (dígitos verificadores)'; }
      else if (nrosVistos.has(nro)) { estado = 'error'; msg = 'N° de socio repetido en el archivo'; }
      if (estado === 'ok') nrosVistos.add(nro);
      return { nro, cbu, cuitTitular: obj.cuitTitular || '', legajo, estado, msg };
    });
    _renderPreviewImportCbu();
  };
  r.readAsText(file, 'UTF-8');
}
function _renderPreviewImportCbu() {
  const cont = $('cbu-imp-preview'); if (!cont) return;
  const ok = _cbuImportFilas.filter(f => f.estado === 'ok').length;
  const err = _cbuImportFilas.length - ok;
  cont.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11.5px;">
    <thead><tr style="background:#374151;color:white;"><th style="padding:4px 6px;text-align:left;">N° socio</th><th style="padding:4px 6px;text-align:left;">Asociado</th><th style="padding:4px 6px;text-align:left;">CBU</th><th style="padding:4px 6px;text-align:left;">CUIT titular</th><th style="padding:4px 6px;text-align:left;">Resultado</th></tr></thead>
    <tbody>${_cbuImportFilas.map(f => `<tr style="${f.estado !== 'ok' ? 'background:#fef2f2;' : ''}">
      <td style="padding:3px 6px;">${f.nro || '—'}</td>
      <td style="padding:3px 6px;">${f.legajo ? f.legajo.nombre : '—'}</td>
      <td style="padding:3px 6px;font-family:'DM Mono',monospace;">${f.cbu || '—'}</td>
      <td style="padding:3px 6px;">${f.cuitTitular || '—'}</td>
      <td style="padding:3px 6px;">${f.estado === 'ok' ? '<span style="color:var(--verde);">→ ACTIVA</span>' : `<span style="color:var(--rojo);">${f.msg}</span>`}</td>
    </tr>`).join('')}</tbody></table>`;
  $('cbu-imp-resumen').innerHTML = `<span style="color:var(--verde);">${ok} fila(s) a importar</span>` + (err ? ` · <span style="color:var(--rojo);">${err} con problema (no se importan)</span>` : '');
  const btn = $('cbu-imp-btn');
  if (btn) btn.style.display = ok > 0 ? 'inline-flex' : 'none';
}
export async function confirmarImportCbuMasivo() {
  const validas = (_cbuImportFilas || []).filter(f => f.estado === 'ok');
  if (!validas.length) { toast('⚠️ No hay filas válidas'); return; }
  const btn = $('cbu-imp-btn');
  if (btn) { btn.disabled = true; }
  let n = 0;
  for (const f of validas) {
    const dedu = deducirBanco(f.cbu);
    const ok = await guardarCuentaCbu({
      legajoNro: f.nro, nombreAsociado: f.legajo.nombre, estado: 'ACTIVA',
      cbu: f.cbu, banco: dedu.nombre, cuitTitular: f.cuitTitular,
      esTercero: _soloDigitos(f.legajo.cuit) && _soloDigitos(f.cuitTitular) !== _soloDigitos(f.legajo.cuit),
      vigenteDesde: new Date().toISOString().slice(0, 10),
      motivo: 'Carga inicial (import masivo)',
    });
    if (ok) n++;
    if (btn) btn.textContent = `Importando ${n} / ${validas.length}…`;
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Importar'; }
  cerrarModal('modal-cbu-import');
  renderCuentasCbu();
  toast(`✅ ${n} cuenta(s) importada(s) como ACTIVA`);
}
