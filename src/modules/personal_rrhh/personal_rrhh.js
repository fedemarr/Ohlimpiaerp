import { DB } from '@shared/state.js';
import { $, toTitleCase, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// Llena la tabla de personal RRHH con las personas no anuladas
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
      <td style="padding:10px 12px;">—</td>
    </tr>`;
  }).join('');
}

// Abre el modal de alta con los campos vacíos
export function abrirNuevoPersonalRrhh() {
  ['pr-apellido', 'pr-nombre', 'pr-puesto'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });
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
  const persona = { id: Date.now(), apellido, nombre, puesto, activa: true, anulado: false };
  if (!DB.personalRrhh) DB.personalRrhh = [];
  DB.personalRrhh.push(persona);
  cerrarModal('modal-personal-rrhh');
  renderPersonalRrhh();
  supaSync('personalRrhh', persona);
  toast('✓ ' + apellido + ', ' + nombre + ' agregada');
}
