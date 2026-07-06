// Módulo Retenciones — retenciones sobre haberes (rehecho de cero,
// política A.11). Antes vivía en legacy.js con los mismos 2 bugs que
// Uniformes: editar/liberar usaban el índice de la fila ya FILTRADA
// (rompía con el filtro por tipo activo) y guardarRetencion() siempre
// hacía supaSync del último elemento del array (correcto solo al crear).
// Acá todo es por id, y se agrega soft delete (no existía antes).

import { DB, currentUser } from '@shared/state.js';
import { $, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

const getRetencionById = (id) => (DB.retenciones || []).find(r => String(r.id) === String(id));

// ========== RENDER ==========

export function renderRetenciones(lista) {
  const tbody = $('tbody-ret2'); if (!tbody) return;
  const activas = (DB.retenciones || []).filter(r => !r.anulado);
  const filtro = ($('ret2-filtro') || { value: '' }).value;
  const rows = lista || activas.filter(r => !filtro || r.tipo === filtro);

  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-ret2-total', activas.length);
  ss('st-ret2-conflicto', activas.filter(r => r.tipo === 'conflicto' && r.estado === 'Activa').length);
  ss('st-ret2-enfermedad', activas.filter(r => r.tipo === 'enfermedad' && r.estado === 'Activa').length);
  const totalMonto = activas.filter(r => r.estado === 'Activa').reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
  ss('st-ret2-monto', '$' + totalMonto.toLocaleString('es-AR'));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin retenciones registradas.</td></tr>';
    return;
  }
  const tipoLabel = { conflicto: '⚡ Conflicto', enfermedad: '🏥 Enfermedad', otra: '📋 Otra' };
  const estadoColor = { Activa: 'badge-rojo', Liberada: 'badge-verde', Pendiente: 'badge-naranja' };
  tbody.innerHTML = rows.map(r => `<tr>
    <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${r.nombre}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.nroSocio || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);"><span class="chip" style="font-size:11px;">${tipoLabel[r.tipo] || r.tipo || '—'}</span></td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.periodo || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:600;color:var(--rojo);">$${(parseFloat(r.monto) || 0).toLocaleString('es-AR')}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;max-width:200px;">${r.motivo || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;"><span class="badge ${estadoColor[r.estado] || 'badge-gris'}">${r.estado || '—'}</span></td>
    <td style="padding:6px 8px;border:1px solid var(--borde);">
      <button data-action="editar" data-id="${r.id}" class="btn btn-xs btn-secondary">✏️</button>
      ${r.estado === 'Activa' ? `<button data-action="liberar" data-id="${r.id}" class="btn btn-xs" style="background:#dcfce7;color:#065f46;border:1px solid #9fdaba;">Liberar</button>` : ''}
      <button data-action="eliminar" data-id="${r.id}" class="btn btn-xs" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;">🗑️</button>
    </td>
  </tr>`).join('');
  tbody.onclick = (e) => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'editar') abrirEditarRetencionPorId(id);
    else if (action === 'liberar') liberarRetencionPorId(id);
    else eliminarRetencionPorId(id);
  };
}

export function filtrarRetenciones() { renderRetenciones(); }

export function poblarSelectsRetenciones() {
  const dl = $('dl-ret2-nombre'); if (!dl) return;
  dl.innerHTML = (DB.legajos || []).filter(l => l.estado === 'Activo').map(l => `<option value="${l.nombre}">${l.nombre} — ${l.nro}</option>`).join('');
}

// Autocompleta N° de socio apenas se elige un asociado del datalist.
export function autocompletarRetencion() {
  const val = ($('ret2-nombre') || { value: '' }).value;
  const leg = (DB.legajos || []).find(l => l.nombre === val);
  if (!leg) return;
  if ($('ret2-nroSocio')) $('ret2-nroSocio').value = leg.nro;
}

// ========== AGREGAR / EDITAR ==========

export function abrirNuevaRetencion() {
  poblarSelectsRetenciones();
  $('ret2-modal-title').textContent = 'Nueva retención';
  ['ret2-nombre', 'ret2-nroSocio', 'ret2-monto', 'ret2-motivo'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('ret2-tipo').value = 'conflicto';
  $('ret2-periodo').value = new Date().toISOString().slice(0, 7);
  $('ret2-estado').value = 'Activa';
  const modal = $('modal-retencion'); if (modal) delete modal.dataset.editId;
  abrirModal('modal-retencion');
}

export function abrirEditarRetencionPorId(id) {
  const r = getRetencionById(id); if (!r) return;
  poblarSelectsRetenciones();
  $('ret2-modal-title').textContent = 'Editar retención';
  $('ret2-nombre').value = r.nombre || '';
  $('ret2-nroSocio').value = r.nroSocio || '';
  $('ret2-tipo').value = r.tipo || 'conflicto';
  $('ret2-periodo').value = r.periodo || '';
  $('ret2-monto').value = r.monto || '';
  $('ret2-motivo').value = r.motivo || '';
  $('ret2-estado').value = r.estado || 'Activa';
  $('modal-retencion').dataset.editId = r.id;
  abrirModal('modal-retencion');
}

export function guardarRetencion() {
  const nombre = cleanText(($('ret2-nombre') || { value: '' }).value);
  const nroSocio = cleanText(($('ret2-nroSocio') || { value: '' }).value);
  if (!nombre) { toast('⚠️ Ingresá el nombre'); return; }

  const modal = $('modal-retencion');
  const editId = modal?.dataset?.editId;
  const r = editId ? getRetencionById(editId) : { id: Date.now() };
  if (!r) { toast('⚠️ No se encontró la retención'); return; }

  const leg = (DB.legajos || []).find(l => l.nombre === nombre || (nroSocio && String(l.nro) === nroSocio));

  r.nombre = nombre;
  r.nroSocio = nroSocio || (leg ? String(leg.nro) : null);
  r.legajoIdLocal = leg ? String(leg.nro) : (r.legajoIdLocal || r.nroSocio || null);
  r.tipo = ($('ret2-tipo') || { value: 'conflicto' }).value;
  r.periodo = ($('ret2-periodo') || { value: '' }).value;
  r.monto = parseFloat(($('ret2-monto') || { value: '' }).value) || 0;
  r.motivo = cleanText(($('ret2-motivo') || { value: '' }).value);
  r.estado = ($('ret2-estado') || { value: 'Activa' }).value;
  if (editId) { r.editadoPor = currentUser?.nombre || ''; r.editadoEn = new Date().toISOString(); }

  if (!editId) { if (!DB.retenciones) DB.retenciones = []; DB.retenciones.push(r); }
  if (modal) delete modal.dataset.editId;

  supaSync('retenciones', r);
  cerrarModal('modal-retencion');
  renderRetenciones();
  toast(editId ? '✅ Retención actualizada' : '✅ Retención guardada');
}

// ========== LIBERAR / ELIMINAR ==========

export function liberarRetencionPorId(id) {
  const r = getRetencionById(id); if (!r) return;
  if (!confirm(`¿Liberar la retención de ${r.nombre}?`)) return;
  r.estado = 'Liberada';
  r.fechaLiberacion = new Date().toISOString().slice(0, 10);
  supaSync('retenciones', r);
  renderRetenciones();
  toast('✅ Retención liberada');
}

export function eliminarRetencionPorId(id) {
  const r = getRetencionById(id); if (!r) return;
  if (!confirm(`¿Eliminar la retención de ${r.nombre}?`)) return;
  r.anulado = true;
  supaSync('retenciones', r);
  renderRetenciones();
  toast('✅ Retención eliminada');
}
