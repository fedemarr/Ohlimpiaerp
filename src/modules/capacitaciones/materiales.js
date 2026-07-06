// Módulo Capacitaciones — Repositorio de materiales (Etapa 1).
// Reusa el bucket de Storage que ya está provisionado (ohlimpia-adjuntos,
// mismo que usa src/shared/adjuntos.js) en vez de pedir uno nuevo — crear
// un bucket requiere el dashboard de Supabase, no se puede por SQL.

import { DB } from '@shared/state.js';
import { $, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { SUPA, supaSync } from '@shared/supabase.js';

const BUCKET = 'ohlimpia-adjuntos';
const ICONOS = { Video: '🎥', PDF: '📄', PowerPoint: '📊', 'Documento Word': '📝', 'Link externo': '🔗' };

const getMaterialById = (id) => (DB.materialesCapacitacion || []).find(m => String(m.id) === String(id));

// ========== RENDER ==========

export function renderMaterialesCap(lista) {
  const el = $('grilla-materiales'); if (!el) return;
  const rows = lista || (DB.materialesCapacitacion || []).filter(m => !m.anulado);
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">📁</div><p>Sin materiales cargados</p></div>';
    return;
  }
  el.innerHTML = rows.map(m => `
    <div style="background:white;border:1px solid var(--borde);border-radius:var(--radio-lg);padding:14px;display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="font-size:24px;">${ICONOS[m.tipo] || '📄'}</div>
        <span class="chip" style="font-size:10px;">${m.tipo}</span>
      </div>
      <div style="font-weight:600;font-size:13px;">${m.nombre}</div>
      <div style="font-size:11px;color:var(--texto-suave);">${m.tipoCapacitacion || 'Material general'}</div>
      ${m.duracion ? `<div style="font-size:11px;color:var(--texto-muy-suave);">⏱ ${m.duracion}</div>` : ''}
      ${m.descripcion ? `<div style="font-size:12px;color:var(--texto-suave);">${m.descripcion}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="btn btn-secondary btn-xs" data-action="abrir" data-id="${m.id}">▶ Abrir</button>
        <button class="btn btn-secondary btn-xs" data-action="editar" data-id="${m.id}">✏️</button>
        <button class="btn btn-danger btn-xs" data-action="eliminar" data-id="${m.id}">🗑️</button>
      </div>
    </div>`).join('');
  el.onclick = (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'abrir') abrirMaterialPorId(id);
    else if (action === 'editar') abrirEditarMaterialPorId(id);
    else if (action === 'eliminar') eliminarMaterialPorId(id);
  };
}

export async function abrirMaterialPorId(id) {
  const m = getMaterialById(id); if (!m) return;
  if (m.origen === 'URL') { window.open(m.url, '_blank'); return; }
  const { data, error } = await SUPA.storage.from(BUCKET).createSignedUrl(m.archivoPath, 300);
  if (error || !data?.signedUrl) { toast('⚠️ No se pudo abrir el archivo'); return; }
  window.open(data.signedUrl, '_blank');
}

// ========== FILTROS ==========

export function filtrarMaterialesCap() {
  const bg = ($('buscar-material') || { value: '' }).value.toLowerCase();
  const tipo = ($('cf-mat-tipo') || { value: '' }).value;
  const cap = ($('cf-mat-cap') || { value: '' }).value;
  renderMaterialesCap((DB.materialesCapacitacion || []).filter(m => !m.anulado).filter(m =>
    (!bg || m.nombre.toLowerCase().includes(bg)) &&
    (!tipo || m.tipo === tipo) &&
    (!cap || (cap === '__sin__' ? !m.tipoCapacitacion : m.tipoCapacitacion === cap))
  ));
}

export function poblarSelectsMateriales() {
  const el = $('cf-mat-cap');
  if (el) el.innerHTML = '<option value="">Todas las capacitaciones</option><option value="__sin__">Sin asociación</option>' + (DB.tiposCapacitacion || []).map(t => `<option>${t}</option>`).join('');
  const modalSel = $('mat-cap-tipo');
  if (modalSel) modalSel.innerHTML = '<option value="">Sin asociación</option>' + (DB.tiposCapacitacion || []).map(t => `<option>${t}</option>`).join('');
}

// ========== AGREGAR / EDITAR ==========

export function toggleOrigenMaterial() {
  const esUrl = ($('mat-origen-url') || {}).checked;
  const urlRow = $('mat-url-row'); if (urlRow) urlRow.style.display = esUrl ? 'block' : 'none';
  const archRow = $('mat-archivo-row'); if (archRow) archRow.style.display = esUrl ? 'none' : 'block';
}

export function abrirNuevoMaterial() {
  ['mat-nombre', 'mat-url', 'mat-duracion', 'mat-desc'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  const fileEl = $('mat-archivo'); if (fileEl) fileEl.value = '';
  ['mat-tipo', 'mat-cap-tipo', 'mat-requiere-eval'].forEach(id => { const el = $(id); if (el) el.selectedIndex = 0; });
  const rUrl = $('mat-origen-url'); if (rUrl) rUrl.checked = true;
  toggleOrigenMaterial();
  const modal = $('modal-material'); if (modal) delete modal.dataset.editId;
  poblarSelectsMateriales();
  abrirModal('modal-material');
}

export function abrirEditarMaterialPorId(id) {
  const m = getMaterialById(id); if (!m) return;
  poblarSelectsMateriales();
  if ($('mat-nombre')) $('mat-nombre').value = m.nombre;
  if ($('mat-tipo')) $('mat-tipo').value = m.tipo;
  if ($('mat-cap-tipo')) $('mat-cap-tipo').value = m.tipoCapacitacion || '';
  if ($('mat-duracion')) $('mat-duracion').value = m.duracion || '';
  if ($('mat-desc')) $('mat-desc').value = m.descripcion || '';
  if ($('mat-requiere-eval')) $('mat-requiere-eval').value = m.requiereEval === false ? 'No' : 'Sí';
  if (m.origen === 'URL') {
    if ($('mat-origen-url')) $('mat-origen-url').checked = true;
    if ($('mat-url')) $('mat-url').value = m.url || '';
  } else if ($('mat-origen-archivo')) {
    $('mat-origen-archivo').checked = true;
  }
  toggleOrigenMaterial();
  $('modal-material').dataset.editId = m.id;
  abrirModal('modal-material');
}

export async function guardarMaterial() {
  const nombre = cleanText(($('mat-nombre') || { value: '' }).value);
  const tipo = ($('mat-tipo') || { value: '' }).value;
  const tipoCapacitacion = ($('mat-cap-tipo') || { value: '' }).value || null;
  const duracion = cleanText(($('mat-duracion') || { value: '' }).value);
  const descripcion = cleanText(($('mat-desc') || { value: '' }).value);
  const requiereEval = ($('mat-requiere-eval') || { value: 'Sí' }).value !== 'No';
  const esUrl = ($('mat-origen-url') || {}).checked;

  if (!nombre) { toast('⚠️ Ingresá el nombre del material'); return; }
  if (!tipo) { toast('⚠️ Seleccioná el tipo'); return; }

  const modal = $('modal-material');
  const editId = modal?.dataset?.editId;
  const existente = editId ? getMaterialById(editId) : null;
  let url = null;
  let archivoPath = existente ? existente.archivoPath : null;

  if (esUrl) {
    url = cleanText(($('mat-url') || { value: '' }).value);
    if (!url) { toast('⚠️ Ingresá la URL'); return; }
    if (!/^https?:\/\//i.test(url)) { toast('⚠️ La URL debe empezar con http:// o https://'); return; }
    archivoPath = null;
  } else {
    const fileInput = $('mat-archivo');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file && !archivoPath) { toast('⚠️ Subí un archivo'); return; }
    if (file) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      const path = `materiales/${crypto.randomUUID()}.${ext}`;
      const { error } = await SUPA.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) { toast('⚠️ Error al subir el archivo: ' + error.message); return; }
      archivoPath = path;
    }
    url = null;
  }

  const m = existente || { id: Date.now(), fechaAlta: new Date().toISOString().slice(0, 10) };
  m.nombre = nombre;
  m.tipo = tipo;
  m.origen = esUrl ? 'URL' : 'Archivo';
  m.url = url;
  m.archivoPath = archivoPath;
  m.tipoCapacitacion = tipoCapacitacion;
  m.duracion = duracion || null;
  m.descripcion = descripcion || null;
  m.requiereEval = requiereEval;

  if (!existente) {
    if (!DB.materialesCapacitacion) DB.materialesCapacitacion = [];
    DB.materialesCapacitacion.push(m);
  }
  if (modal) delete modal.dataset.editId;

  supaSync('materialesCapacitacion', m);
  cerrarModal('modal-material');
  renderMaterialesCap();
  toast(existente ? '✅ Material actualizado' : '✅ Material agregado');
}

export function eliminarMaterialPorId(id) {
  const m = getMaterialById(id); if (!m) return;
  if (!confirm(`¿Eliminar el material "${m.nombre}"?`)) return;
  m.anulado = true;
  supaSync('materialesCapacitacion', m);
  renderMaterialesCap();
  toast('✅ Material eliminado');
}
