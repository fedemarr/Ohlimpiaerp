import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';

// Render del listado de documentación de ingreso (esqueleto)
export function renderDocum() {
  const tbody = $('tbody-docum');
  if (!tbody) return;
  const lista = (DB.documentacionIngreso || []).filter(d => !d.anulado && d.estado === 'En proceso');
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">Sin registros en documentación de ingreso todavía.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(d =>
    '<tr>'
    + '<td>' + (d.nombre || '') + '</td>'
    + '<td>' + (d.dni || '') + '</td>'
    + '<td>' + (d.zona || '') + '</td>'
    + '<td>' + (d.antecResultado || 'Pendiente') + '</td>'
    + '<td>' + (d.libretaAplica ? '✓' : '—') + '</td>'
    + '<td>' + (d.cursoTiene ? '✓' : '—') + '</td>'
    + '<td>' + (d.estado || 'En proceso') + '</td>'
    + '<td>—</td>'
    + '</tr>'
  ).join('');
}
