// Módulo Uniformes — entrega y control de talles (rehecho de cero,
// política A.11). Antes vivía en legacy.js con 2 bugs reales: editar
// usaba el índice de la fila ya FILTRADA (rompía con la búsqueda
// activa) y guardarUniforme() siempre hacía supaSync del último
// elemento del array (correcto solo al crear, nunca al editar). Acá
// todo es por id, y se agrega soft delete (no existía antes).

import { DB, currentUser } from '@shared/state.js';
import { $, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

const getUniformeById = (id) => (DB.uniformes || []).find(u => String(u.id) === String(id));

function parsearPrendas(str) {
  return (str || '').split(',').map(s => {
    const m = s.trim().match(/^(\d+)x?\s*(.+)$/i);
    return m ? { cantidad: parseInt(m[1], 10), tipo: m[2].trim() } : null;
  }).filter(Boolean);
}

function formatearPrendas(prendas) {
  return (prendas || []).map(p => p.cantidad + 'x ' + p.tipo).join(', ');
}

// ========== RENDER ==========

export function renderUniformes(lista) {
  const tbody = $('tbody-uni'); if (!tbody) return;
  const activas = (DB.uniformes || []).filter(u => !u.anulado);
  const q = ($('uni-buscar') || { value: '' }).value.toLowerCase();
  const rows = lista || activas.filter(u => !q || (u.nombre || '').toLowerCase().includes(q));

  const mesStr = new Date().toISOString().slice(0, 7);
  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-uni-total', activas.length);
  ss('st-uni-mes', activas.filter(u => (u.fecha || '').slice(0, 7) === mesStr).length);
  const totalDesc = activas.reduce((s, u) => s + (parseFloat(u.descuento) || 0), 0);
  ss('st-uni-monto', '$' + totalDesc.toLocaleString('es-AR'));
  ss('st-uni-pendiente', activas.filter(u => u.estado === 'Pendiente').length);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin entregas registradas.</td></tr>';
    return;
  }
  const estadoColor = { Descontado: 'badge-verde', Pendiente: 'badge-naranja', Cancelado: 'badge-gris' };
  tbody.innerHTML = rows.map(u => `<tr>
    <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${u.nombre}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${u.nroSocio || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${u.fecha || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${u.talle || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${formatearPrendas(u.prendas) || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:600;color:var(--rojo);">$${(parseFloat(u.descuento) || 0).toLocaleString('es-AR')}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;"><span class="badge ${estadoColor[u.estado] || 'badge-gris'}">${u.estado || '—'}</span></td>
    <td style="padding:6px 8px;border:1px solid var(--borde);">
      <button data-action="editar" data-id="${u.id}" class="btn btn-xs btn-secondary">✏️</button>
      <button data-action="eliminar" data-id="${u.id}" class="btn btn-xs" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;">🗑️</button>
    </td>
  </tr>`).join('');
  tbody.onclick = (e) => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'editar') abrirEditarUniformePorId(id);
    else eliminarUniformePorId(id);
  };
}

export function filtrarUniformes() { renderUniformes(); }

export function poblarSelectsUniformes() {
  const dl = $('dl-uni-nombre'); if (!dl) return;
  dl.innerHTML = (DB.legajos || []).filter(l => l.estado === 'Activo').map(l => `<option value="${l.nombre}">${l.nombre} — ${l.nro}</option>`).join('');
}

// ========== AGREGAR / EDITAR ==========

export function abrirNuevaEntregaUniforme() {
  poblarSelectsUniformes();
  $('uni-modal-title').textContent = 'Nueva entrega de uniforme';
  ['uni-nombre', 'uni-nroSocio', 'uni-talle', 'uni-descuento', 'uni-obs', 'uni-prendas'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('uni-fecha').value = new Date().toISOString().slice(0, 10);
  $('uni-estado').value = 'Pendiente';
  const modal = $('modal-uniforme'); if (modal) delete modal.dataset.editId;
  abrirModal('modal-uniforme');
}

export function abrirEditarUniformePorId(id) {
  const u = getUniformeById(id); if (!u) return;
  poblarSelectsUniformes();
  $('uni-modal-title').textContent = 'Editar entrega';
  $('uni-nombre').value = u.nombre || '';
  $('uni-nroSocio').value = u.nroSocio || '';
  $('uni-fecha').value = u.fecha || '';
  $('uni-talle').value = u.talle || '';
  $('uni-descuento').value = u.descuento || '';
  $('uni-prendas').value = formatearPrendas(u.prendas);
  $('uni-estado').value = u.estado || 'Pendiente';
  $('uni-obs').value = u.observaciones || '';
  $('modal-uniforme').dataset.editId = u.id;
  abrirModal('modal-uniforme');
}

export function guardarUniforme() {
  const nombre = cleanText(($('uni-nombre') || { value: '' }).value);
  const nroSocio = cleanText(($('uni-nroSocio') || { value: '' }).value);
  const fecha = ($('uni-fecha') || { value: '' }).value;
  if (!nombre) { toast('⚠️ Ingresá el nombre'); return; }
  if (!fecha) { toast('⚠️ Ingresá la fecha de entrega'); return; }

  const modal = $('modal-uniforme');
  const editId = modal?.dataset?.editId;
  const u = editId ? getUniformeById(editId) : { id: Date.now() };
  if (!u) { toast('⚠️ No se encontró la entrega'); return; }

  const leg = (DB.legajos || []).find(l => l.nombre === nombre || (nroSocio && String(l.nro) === nroSocio));

  u.nombre = nombre;
  u.nroSocio = nroSocio || (leg ? String(leg.nro) : null);
  u.legajoIdLocal = leg ? String(leg.nro) : (u.legajoIdLocal || u.nroSocio || null);
  u.fecha = fecha;
  u.talle = cleanText(($('uni-talle') || { value: '' }).value);
  u.prendas = parsearPrendas(($('uni-prendas') || { value: '' }).value);
  u.descuento = parseFloat(($('uni-descuento') || { value: '' }).value) || 0;
  u.estado = ($('uni-estado') || { value: 'Pendiente' }).value;
  u.observaciones = cleanText(($('uni-obs') || { value: '' }).value);
  if (editId) { u.editadoPor = currentUser?.nombre || ''; u.editadoEn = new Date().toISOString(); }

  if (!editId) { if (!DB.uniformes) DB.uniformes = []; DB.uniformes.push(u); }
  if (modal) delete modal.dataset.editId;

  supaSync('uniformes', u);
  cerrarModal('modal-uniforme');
  renderUniformes();
  toast(editId ? '✅ Entrega actualizada' : '✅ Uniforme registrado');
}

// ========== ELIMINAR ==========

export function eliminarUniformePorId(id) {
  const u = getUniformeById(id); if (!u) return;
  if (!confirm(`¿Eliminar la entrega de ${u.nombre}?`)) return;
  u.anulado = true;
  supaSync('uniformes', u);
  renderUniformes();
  toast('✅ Entrega eliminada');
}
