// Enfermos y Accidentes v1 — Tab 3: casos cerrados de ambos tipos.

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { retirosDeCaso } from './retiros.js';

const ESTADO_BADGE = { 'Cerrado por alta médica': 'badge-verde', 'Cerrado por decisión RRHH': 'badge-gris', 'Anulado': 'badge-gris' };

function duracionDias(fechaInicio, fechaAltaEfectiva) {
  if (!fechaInicio || !fechaAltaEfectiva) return '—';
  const dias = Math.round((new Date(fechaAltaEfectiva + 'T00:00:00') - new Date(fechaInicio + 'T00:00:00')) / 86400000) + 1;
  return isNaN(dias) ? '—' : `${dias} días`;
}

function totalPagado(casoId) {
  return retirosDeCaso(casoId).reduce((s, r) => s + (Number(r.montoRetiro) || 0), 0);
}

function casosHistoricos() {
  return (DB.casosEnfermosAccidentes || []).filter(c => !c.anulado && c.estado !== 'Abierto');
}

function filaHistorico(c) {
  return `<tr>
    <td style="font-weight:500;">${c.nombreAsociado}</td>
    <td style="font-size:12px;">${c.tipoCaso}</td>
    <td style="font-size:12px;">${c.subtipo || '—'}</td>
    <td style="font-size:12px;">${c.fechaInicio}</td>
    <td style="font-size:12px;">${(c.fechaAltaEfectiva || '')}</td>
    <td style="font-size:12px;">${duracionDias(c.fechaInicio, c.fechaAltaEfectiva)}</td>
    <td><span class="badge ${ESTADO_BADGE[c.estado] || 'badge-gris'}">${c.motivoCierre || c.estado}</span></td>
    <td style="text-align:right;">${c.pendienteAdministrativo ? '—' : '$' + totalPagado(c.id).toLocaleString('es-AR')}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="abrirDetalleCasoEnfermos('${c.id}')">👁 Ver</button></td>
  </tr>`;
}

export function renderHistoricoEnfermos() {
  let filas = casosHistoricos();

  const q = ($('enfh-buscar') || {}).value?.toLowerCase() || '';
  const tipo = ($('enfh-tipo') || {}).value || '';
  const anio = ($('enfh-anio') || {}).value || '';
  const servicio = ($('enfh-servicio') || {}).value?.toLowerCase() || '';
  if (q) filas = filas.filter(c => c.nombreAsociado.toLowerCase().includes(q));
  if (tipo) filas = filas.filter(c => c.tipoCaso === tipo);
  if (anio) filas = filas.filter(c => (c.fechaAltaEfectiva || '').slice(0, 4) === anio);
  if (servicio) filas = filas.filter(c => (c.servicio || c.area || '').toLowerCase().includes(servicio));
  filas.sort((a, b) => (b.fechaAltaEfectiva || '').localeCompare(a.fechaAltaEfectiva || ''));

  const tbody = $('tbody-enf-historico');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="9" style="text-align:center;padding:32px;opacity:.5;">Sin casos cerrados</td></tr>'
    : filas.map(filaHistorico).join('');
}

export function filtrarHistoricoEnfermos() { renderHistoricoEnfermos(); }

export async function exportarHistoricoEnfermosExcel() {
  const filas = casosHistoricos();
  if (!filas.length) { toast('⚠️ No hay casos cerrados para exportar'); return; }
  const XLSX = await import('xlsx');
  const datos = filas.map(c => ({
    Asociado: c.nombreAsociado, 'N° Socio': c.nroSocio, Tipo: c.tipoCaso, Subtipo: c.subtipo,
    'Fecha inicio': c.fechaInicio, 'Fecha cierre': c.fechaAltaEfectiva, Motivo: c.motivoCierre,
    'Total pagado': c.pendienteAdministrativo ? '' : totalPagado(c.id),
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Histórico');
  XLSX.writeFile(libro, `enfermos_accidentes_historico_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
