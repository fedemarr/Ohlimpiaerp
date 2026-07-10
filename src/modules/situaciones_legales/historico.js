// Situaciones Legales v1.1 — Tab Histórico: casos con estado
// 'Cerrado'. Nuevo (Cambio 6 del delta) — hoy los casos cerrados
// quedaban mezclados con los activos en la misma tabla.

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';

const RESULTADO_BADGE = {
  'Ganado': 'badge-verde', 'Perdido': 'badge-rojo', 'Conciliado': 'badge-azul', 'Archivado sin resolución': 'badge-gris',
};

function duracionDias(fechaInicioDDMM, fechaCierreISO) {
  if (!fechaInicioDDMM || !fechaCierreISO) return '—';
  const [d, m, y] = fechaInicioDDMM.split('/');
  const inicio = new Date(`${y}-${m}-${d}T00:00:00`);
  const cierre = new Date(fechaCierreISO + 'T00:00:00');
  const dias = Math.round((cierre - inicio) / (1000 * 60 * 60 * 24));
  return isNaN(dias) ? '—' : `${dias} días`;
}

function filaHistorico(c) {
  return `<tr>
    <td style="font-weight:500;">${c.asociado}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${c.nroSocio}</td>
    <td style="font-size:12px;">${c.tipoReclamo || '—'}</td>
    <td style="font-size:12px;">${c.fechaInicio}</td>
    <td style="font-size:12px;">${c.fechaCierre || '—'}</td>
    <td style="font-size:12px;">${duracionDias(c.fechaInicio, c.fechaCierre)}</td>
    <td><span class="badge ${RESULTADO_BADGE[c.resultado] || 'badge-gris'}">${c.resultado || '—'}</span></td>
    <td style="text-align:right;">${c.montoFinal ? '$' + Number(c.montoFinal).toLocaleString('es-AR') : '—'}</td>
    <td style="font-size:12px;">${c.cerradoPor || '—'}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="abrirDetalleCasoLegal('${c.id}')">👁 Ver</button></td>
  </tr>`;
}

function casosHistoricos() {
  return (DB.casosLegales || []).filter(c => c.estado === 'Cerrado');
}

export function renderHistoricoLegal() {
  let filas = casosHistoricos();

  const q = ($('legh-buscar') || {}).value?.toLowerCase() || '';
  const anio = ($('legh-anio') || {}).value || '';
  const resultado = ($('legh-resultado') || {}).value || '';
  const tipo = ($('legh-tipo') || {}).value || '';
  if (q) filas = filas.filter(c => c.asociado.toLowerCase().includes(q));
  if (anio) filas = filas.filter(c => (c.fechaCierre || '').slice(0, 4) === anio);
  if (resultado) filas = filas.filter(c => c.resultado === resultado);
  if (tipo) filas = filas.filter(c => c.tipoReclamo === tipo);
  filas.sort((a, b) => (b.fechaCierre || '').localeCompare(a.fechaCierre || ''));

  const tbody = $('tbody-legal-historico');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="10" style="text-align:center;padding:32px;opacity:.5;">Sin casos cerrados</td></tr>'
    : filas.map(filaHistorico).join('');
}

export function filtrarHistoricoLegal() { renderHistoricoLegal(); }

export async function exportarHistoricoLegalExcel() {
  const filas = casosHistoricos();
  if (!filas.length) { toast('⚠️ No hay casos cerrados para exportar'); return; }
  const XLSX = await import('xlsx');
  const datos = filas.map(c => ({
    Asociado: c.asociado, 'N° Socio': c.nroSocio, 'Tipo de reclamo': c.tipoReclamo,
    'Fecha inicio': c.fechaInicio, 'Fecha cierre': c.fechaCierre, Resultado: c.resultado,
    'Monto final': c.montoFinal || '', 'Cerrado por': c.cerradoPor, Observaciones: c.observacionesCierre || '',
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Histórico legal');
  XLSX.writeFile(libro, `situaciones_legales_historico_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
