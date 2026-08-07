// Código de servicio → supervisor asignado (lista puente, sin objetivo
// comercial formal todavía — ver sql/v067). Pantalla en Configuración →
// Servicios, mismo patrón que src/modules/personal_rrhh/. Sirve para que
// Altas/Reasignaciones autocompleten el supervisor cuando el código no
// tiene un objetivo real cargado en DB.objetivos (ver onChangeServicioAlta
// en altas.js).
//
// A diferencia de personal_rrhh (soft delete, política A.7 — son personas,
// con historial que conviene conservar), acá el borrado es real: es una
// lista de referencia operativa, no un registro de auditoría.

import { DB } from '@shared/state.js';
import { $, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, supaDel, getLastSupaSyncError } from '@shared/supabase.js';

// Refresca DB.servicios (array plano de códigos) desde DB.serviciosSupervisor
// recién cargado — mismo criterio que sincronizarConfigReasignaciones() en
// reasignaciones.js, para no tener que tocar los 9+ consumidores existentes
// de window.obtenerServiciosActivos() (legacy.js), que siguen leyendo
// DB.servicios directamente.
export function sincronizarServiciosSupervisor() {
  if ((DB.serviciosSupervisor || []).length) {
    DB.servicios = DB.serviciosSupervisor.map(s => s.codigo);
  }
}

function getServicioSupervisorById(id) {
  return (DB.serviciosSupervisor || []).find(s => String(s.id) === String(id));
}

// Usado por onChangeServicioAlta() (altas.js) como fallback cuando el
// código no tiene un objetivo comercial cargado todavía.
export function getSupervisorDeCodigo(codigo) {
  const s = (DB.serviciosSupervisor || []).find(x => x.codigo === codigo);
  return s ? s.supervisor : '';
}

// ========== RENDER ==========

export function renderServiciosSupervisor() {
  const tbody = $('tbody-servicios-supervisor');
  if (!tbody) return;
  const buscar = (($('ss-buscar') || {}).value || '').toLowerCase();
  const lista = (DB.serviciosSupervisor || [])
    .filter(s => !buscar || s.codigo.toLowerCase().includes(buscar) || s.supervisor.toLowerCase().includes(buscar))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'));
  const contEl = $('ss-contador');
  if (contEl) contEl.textContent = lista.length + ' código(s)';
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8;">Sin códigos cargados</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(s => `<tr>
    <td style="padding:8px 12px;font-family:'DM Mono',monospace;font-size:12px;">${s.codigo}</td>
    <td style="padding:8px 12px;">${s.supervisor}</td>
    <td style="padding:8px 12px;">
      <button data-action="editar" data-id="${s.id}" style="background:#e2e8f0;color:#374151;padding:4px 8px;border:none;border-radius:4px;cursor:pointer;margin-right:4px;" title="Editar">✏️</button>
      <button data-action="eliminar" data-id="${s.id}" style="background:#fee2e2;color:#b91c1c;padding:4px 8px;border:none;border-radius:4px;cursor:pointer;" title="Eliminar">🗑️</button>
    </td>
  </tr>`).join('');
  tbody.onclick = function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'editar') editarServicioSupervisor(id);
    else if (btn.dataset.action === 'eliminar') eliminarServicioSupervisor(id);
  };
}

export function filtrarServiciosSupervisor() {
  renderServiciosSupervisor();
}

// ========== CRUD ==========

function poblarDatalistSupervisoresSS() {
  const dl = $('dl-ss-supervisores');
  if (dl) dl.innerHTML = (DB.supervisores || []).map(s => '<option value="' + s + '">').join('');
}

export function abrirNuevoServicioSupervisor() {
  poblarDatalistSupervisoresSS();
  const codEl = $('ss-codigo'); if (codEl) { codEl.value = ''; codEl.disabled = false; }
  const supEl = $('ss-supervisor'); if (supEl) supEl.value = '';
  const tit = $('modal-servicio-supervisor-titulo'); if (tit) tit.textContent = 'Nuevo código de servicio';
  const modal = $('modal-servicio-supervisor'); if (modal) delete modal.dataset.editId;
  abrirModal('modal-servicio-supervisor');
}

export function editarServicioSupervisor(id) {
  const s = getServicioSupervisorById(id);
  if (!s) { toast('⚠️ No se encontró el registro'); return; }
  poblarDatalistSupervisoresSS();
  const codEl = $('ss-codigo'); if (codEl) { codEl.value = s.codigo; codEl.disabled = true; } // código = clave, no se reedita
  const supEl = $('ss-supervisor'); if (supEl) supEl.value = s.supervisor;
  const tit = $('modal-servicio-supervisor-titulo'); if (tit) tit.textContent = 'Editar — ' + s.codigo;
  const modal = $('modal-servicio-supervisor'); if (modal) modal.dataset.editId = s.id;
  abrirModal('modal-servicio-supervisor');
}

export async function guardarServicioSupervisor() {
  const codigo = cleanText(($('ss-codigo') || {}).value || '').toUpperCase();
  const supervisor = cleanText(($('ss-supervisor') || {}).value || '');
  if (!codigo || !supervisor) { toast('⚠️ Completá código y supervisor'); return; }

  const modal = $('modal-servicio-supervisor');
  const editId = modal && modal.dataset && modal.dataset.editId;

  if (editId) {
    const s = getServicioSupervisorById(editId);
    if (!s) { toast('⚠️ No se encontró el registro'); return; }
    const snapshot = { ...s };
    s.supervisor = supervisor;
    const ok = await supaSync('serviciosSupervisor', s);
    if (!ok) {
      Object.assign(s, snapshot);
      const err = getLastSupaSyncError();
      toast('⚠️ No se pudo guardar' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
      return;
    }
    toast('✓ ' + s.codigo + ' actualizado');
  } else {
    const duplicado = (DB.serviciosSupervisor || []).some(s => s.codigo === codigo);
    if (duplicado) { toast('⚠️ Ya existe ese código'); return; }
    const nuevo = { id: Date.now(), codigo, supervisor };
    const ok = await supaSync('serviciosSupervisor', nuevo);
    if (!ok) {
      const err = getLastSupaSyncError();
      toast('⚠️ No se pudo guardar' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
      return;
    }
    if (!DB.serviciosSupervisor) DB.serviciosSupervisor = [];
    DB.serviciosSupervisor.push(nuevo);
    toast('✓ ' + codigo + ' agregado');
  }
  sincronizarServiciosSupervisor();
  cerrarModal('modal-servicio-supervisor');
  renderServiciosSupervisor();
}

export async function eliminarServicioSupervisor(id) {
  const s = getServicioSupervisorById(id);
  if (!s) return;
  if (!confirm('¿Eliminar el código "' + s.codigo + '"? Deja de aparecer para elegir en Altas/Reasignaciones.')) return;
  const ok = await supaDel('serviciosSupervisor', id);
  if (!ok) {
    const err = getLastSupaSyncError();
    toast('⚠️ No se pudo eliminar' + (err?.message ? ' (' + err.message + ')' : '') + ' — reintentá');
    return;
  }
  const idx = (DB.serviciosSupervisor || []).findIndex(x => String(x.id) === String(id));
  if (idx >= 0) DB.serviciosSupervisor.splice(idx, 1);
  sincronizarServiciosSupervisor();
  renderServiciosSupervisor();
  toast('🗑️ ' + s.codigo + ' eliminado');
}

// ========== EXPORTAR CSV ==========

export function exportarServiciosSupervisorCSV() {
  const lista = [...(DB.serviciosSupervisor || [])].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'));
  const esc = v => '"' + String(v || '').replace(/"/g, '""') + '"';
  const csv = 'codigo,supervisor\n' + lista.map(s => esc(s.codigo) + ',' + esc(s.supervisor)).join('\n') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'servicios_supervisor.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ========== IMPORTAR CSV ==========
// Mismo patrón que legajos/importador.js: parser propio (sin librerías,
// ver esa nota ahí sobre las vulnerabilidades de xlsx/SheetJS), preview
// con validación antes de confirmar, reentrancia + progreso en el botón
// (bug real encontrado con el importador de legajos: sin esto, un import
// largo con doble click generaba escrituras duplicadas en paralelo).

let _ssFilasParseadas = [];

function parseCSV(texto) {
  const finPrimeraLinea = texto.search(/\r\n|\r|\n/);
  const cabecera = finPrimeraLinea === -1 ? texto : texto.slice(0, finPrimeraLinea);
  const delim = cabecera.split(';').length > cabecera.split(',').length ? ';' : ',';
  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      dentroComillas = true;
    } else if (c === delim) {
      fila.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

function normalizarHeader(h) {
  return (h || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
const ALIAS_HEADERS = { codigo: 'codigo', código: 'codigo', supervisor: 'supervisor', supervisor_asignado: 'supervisor' };

export function abrirImportadorServiciosSupervisor() {
  _ssFilasParseadas = [];
  const fileEl = $('imp-ss-file'); if (fileEl) fileEl.value = '';
  const prevEl = $('imp-ss-preview'); if (prevEl) prevEl.innerHTML = '';
  const resEl = $('imp-ss-resumen'); if (resEl) resEl.textContent = '';
  const btn = $('btn-confirmar-importacion-ss');
  if (btn) { btn.style.display = 'none'; btn.disabled = false; btn.textContent = '✅ Confirmar importación'; }
  abrirModal('modal-importar-servicios-supervisor');
}

export function seleccionarArchivoImportacionSS() {
  const input = $('imp-ss-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const filas = parseCSV(String(e.target.result || ''));
    if (!filas.length) { toast('⚠️ El archivo está vacío'); return; }
    const headers = filas[0].map(h => ALIAS_HEADERS[normalizarHeader(h)] || normalizarHeader(h));
    const filasDatos = filas.slice(1).filter(f => f.some(v => (v || '').trim() !== ''));
    _ssFilasParseadas = filasDatos.map(f => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (f[i] || '').trim(); });
      return obj;
    });
    renderPreviewImportacionSS();
  };
  reader.readAsText(file, 'UTF-8');
}

function renderPreviewImportacionSS() {
  const cont = $('imp-ss-preview');
  if (!cont) return;
  if (!_ssFilasParseadas.length) { cont.innerHTML = '<p style="padding:10px;">Sin filas para importar</p>'; return; }

  const existentes = new Map((DB.serviciosSupervisor || []).map(s => [s.codigo, s]));
  const vistos = new Set();
  let nuevos = 0, actualizan = 0, invalidos = 0;

  const filasHtml = _ssFilasParseadas.map(f => {
    const codigo = (f.codigo || '').toUpperCase().trim();
    const supervisor = (f.supervisor || '').trim();
    const problemas = [];
    if (!codigo) problemas.push('falta código');
    if (!supervisor) problemas.push('falta supervisor');
    if (codigo && vistos.has(codigo)) problemas.push('código repetido en el archivo');
    if (codigo) vistos.add(codigo);

    const ok = problemas.length === 0;
    f._valido = ok;
    f._codigo = codigo;
    f._supervisor = supervisor;
    let accion = '—';
    if (ok) {
      if (existentes.has(codigo)) { accion = 'actualiza supervisor'; actualizan++; }
      else { accion = 'nuevo'; nuevos++; }
    } else invalidos++;

    return '<tr style="' + (ok ? '' : 'background:#fef2f2;') + '">'
      + '<td style="padding:5px 8px;font-size:12px;font-family:\'DM Mono\',monospace;">' + (codigo || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (supervisor || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:11px;">' + (problemas.length ? '<span style="color:#dc2626;">' + problemas.join(', ') + '</span>' : accion) + '</td>'
      + '</tr>';
  }).join('');

  cont.innerHTML = '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="background:#1e3a8a;color:white;">'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Código</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Supervisor</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Acción</th>'
    + '</tr></thead><tbody>' + filasHtml + '</tbody></table>';

  const resEl = $('imp-ss-resumen');
  if (resEl) resEl.textContent = nuevos + ' nuevo(s), ' + actualizan + ' a actualizar, ' + invalidos + ' con problemas (no se importan)';
  const btn = $('btn-confirmar-importacion-ss');
  if (btn) btn.style.display = (nuevos + actualizan) > 0 ? 'inline-flex' : 'none';
}

let _ssImportando = false;

export async function confirmarImportacionServiciosSupervisor() {
  if (_ssImportando) return;
  const validas = _ssFilasParseadas.filter(f => f._valido && !f._yaImportado);
  if (!validas.length) { toast('⚠️ No hay filas válidas para importar'); return; }

  _ssImportando = true;
  const btn = $('btn-confirmar-importacion-ss');
  if (btn) { btn.disabled = true; btn.textContent = 'Importando 0 / ' + validas.length + '…'; }
  const resEl = $('imp-ss-resumen');

  const existentes = new Map((DB.serviciosSupervisor || []).map(s => [s.codigo, s]));
  let importados = 0;
  const fallos = [];

  for (const [i, f] of validas.entries()) {
    if (btn) btn.textContent = 'Importando ' + (i + 1) + ' / ' + validas.length + '…';
    if (resEl) resEl.textContent = 'Importando ' + (i + 1) + ' / ' + validas.length + '…';

    const existente = existentes.get(f._codigo);
    const registro = existente
      ? Object.assign(existente, { supervisor: f._supervisor })
      : { id: Date.now() + i, codigo: f._codigo, supervisor: f._supervisor };
    const ok = await supaSync('serviciosSupervisor', registro);
    if (ok) {
      if (!existente) { if (!DB.serviciosSupervisor) DB.serviciosSupervisor = []; DB.serviciosSupervisor.push(registro); existentes.set(f._codigo, registro); }
      f._yaImportado = true;
      importados++;
    } else {
      const err = getLastSupaSyncError();
      fallos.push({ codigo: f._codigo, error: (err && err.message) || 'Error desconocido' });
    }
  }

  sincronizarServiciosSupervisor();
  renderServiciosSupervisor();
  if (fallos.length > 0) {
    toast('⚠️ ' + importados + ' importado(s), ' + fallos.length + ' con error — ' + fallos.map(x => x.codigo + ': ' + x.error).join(' | '));
    if (resEl) resEl.innerHTML = importados + ' importado(s) correctamente.<br><span style="color:#dc2626;">' + fallos.length + ' con error:</span><br>' + fallos.map(x => '• ' + x.codigo + ': ' + x.error).join('<br>');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar importación'; }
    _ssImportando = false;
  } else {
    toast('✅ ' + importados + ' código(s) importado(s) correctamente');
    _ssImportando = false;
    abrirImportadorServiciosSupervisor();
  }
}
