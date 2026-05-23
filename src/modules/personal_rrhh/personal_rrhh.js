import { DB } from '@shared/state.js';
import { $, toTitleCase, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// Llena la tabla de personal RRHH con las personas no anuladas
// Busca una persona por id (== para tolerar string del dataset vs number)
function getPersonaById(id) {
  return (DB.personalRrhh || []).find(p => p.id == id);
}

export function renderPersonalRrhh() {
  const tbody = $('tbody-personal-rrhh');
  if (!tbody) return;
  const lista = (DB.personalRrhh || []).filter(p => !p.anulado);
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8;">Sin personal de RRHH cargado</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(p => {
    const nombreCompleto = (p.apellido ? p.apellido + ', ' : '') + (p.nombre || '');
    return `<tr>
      <td style="padding:10px 12px;">${nombreCompleto}</td>
      <td style="padding:10px 12px;">${p.puesto || '—'}</td>
      <td style="padding:10px 12px;">
        <button data-action="editar" data-id="${p.id}" style="background:#e2e8f0;color:#374151;padding:4px 8px;border:none;border-radius:4px;cursor:pointer;">✏️</button>
      </td>
    </tr>`;
  }).join('');
  tbody.onclick = function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'editar') editarPersonalRrhh(btn.dataset.id);
  };
}

// Abre el modal de alta con los campos vacíos
export function abrirNuevoPersonalRrhh() {
  ['pr-apellido', 'pr-nombre', 'pr-puesto'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });
  const tit = $('modal-personal-rrhh-titulo');
  if (tit) tit.textContent = 'Nueva persona — Personal RRHH';
  const btn = $('modal-personal-rrhh-btn');
  if (btn) btn.textContent = 'Crear persona';
  const modal = $('modal-personal-rrhh');
  if (modal) delete modal.dataset.editId;
  abrirModal('modal-personal-rrhh');
}

// Abre el modal precargado para editar una persona existente
export function editarPersonalRrhh(id) {
  const p = getPersonaById(id);
  if (!p) { toast('⚠️ Persona no encontrada'); return; }
  $('pr-apellido').value = p.apellido || '';
  $('pr-nombre').value   = p.nombre || '';
  $('pr-puesto').value   = p.puesto || '';
  const tit = $('modal-personal-rrhh-titulo');
  if (tit) tit.textContent = 'Editar persona — ' + p.apellido + ', ' + p.nombre;
  const btn = $('modal-personal-rrhh-btn');
  if (btn) btn.textContent = 'Guardar cambios';
  const modal = $('modal-personal-rrhh');
  if (modal) modal.dataset.editId = p.id;
  abrirModal('modal-personal-rrhh');
}

// Guarda una persona nueva en DB y en Supabase
export function guardarPersonalRrhh() {
  const apellido = toTitleCase(cleanText($('pr-apellido').value));
  const nombre   = toTitleCase(cleanText($('pr-nombre').value));
  const puesto   = cleanText($('pr-puesto').value);
  if (!apellido || !nombre) {
    toast('⚠️ Completá apellido y nombre');
    return;
  }
  const modal = $('modal-personal-rrhh');
  const editId = modal && modal.dataset && modal.dataset.editId;
  if (editId) {
    const p = getPersonaById(editId);
    if (!p) { toast('⚠️ Persona no encontrada'); return; }
    Object.assign(p, { apellido, nombre, puesto });
    supaSync('personalRrhh', p);
    delete modal.dataset.editId;
    toast('✓ ' + apellido + ', ' + nombre + ' actualizada');
  } else {
    const persona = { id: Date.now(), apellido, nombre, puesto, activa: true, anulado: false };
    if (!DB.personalRrhh) DB.personalRrhh = [];
    DB.personalRrhh.push(persona);
    supaSync('personalRrhh', persona);
    toast('✓ ' + apellido + ', ' + nombre + ' agregada');
  }
  cerrarModal('modal-personal-rrhh');
  renderPersonalRrhh();
}
