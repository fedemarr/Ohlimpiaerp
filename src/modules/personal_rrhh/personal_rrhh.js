import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';

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
