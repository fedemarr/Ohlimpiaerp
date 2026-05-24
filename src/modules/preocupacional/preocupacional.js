import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';

// Render del listado de pre-ocupacionales (esqueleto: tabla simple)
export function renderPreocup() {
  const tbody = $('tbody-preocup');
  if (!tbody) return;
  const lista = (DB.preocupacionales || []).filter(p => !p.anulado);
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">Sin registros en pre-ocupacional todavía.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(p =>
    '<tr>'
    + '<td>' + (p.nombre || '') + '</td>'
    + '<td>' + (p.dni || '') + '</td>'
    + '<td>' + (p.zona || '') + '</td>'
    + '<td>' + (p.fechaTurno || '—') + '</td>'
    + '<td>' + (p.prestador || '—') + '</td>'
    + '<td>' + (p.resultado || 'Pendiente') + '</td>'
    + '<td>' + (p.estado || 'En proceso') + '</td>'
    + '<td>—</td>'
    + '</tr>'
  ).join('');
}
