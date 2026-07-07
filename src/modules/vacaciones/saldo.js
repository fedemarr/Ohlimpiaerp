// Cálculo de saldo de días de vacaciones — todo al vuelo, sin guardar nada
// (DISENO_vacaciones.md §11.4): saldo = asignados - Σ aprobadas del año -
// Σ en proceso del año (para el soft warning al elevar).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { SECTORES_ADMIN } from '@modules/legajos/index.js';

const ESTADOS_EN_PROCESO = ['Pendiente aprobación Gerente', 'Pendiente aprobación Consejo'];

function vacacionesDelLegajo(legajoIdLocal) {
  return (DB.vacaciones || []).filter(v => !v.anulado && String(v.legajoIdLocal) === String(legajoIdLocal));
}

// 'Anulación rechazada por Consejo' funcionalmente sigue vigente (el
// Consejo mantuvo la vacación aprobada) — cuenta igual que 'Aprobada'
// para no liberar días que en la práctica siguen tomados.
export const ESTADOS_VIGENTES = ['Aprobada', 'Anulación rechazada por Consejo'];

export function diasTomadosEnAnio(legajoIdLocal, anio) {
  return vacacionesDelLegajo(legajoIdLocal)
    .filter(v => ESTADOS_VIGENTES.includes(v.estado) && new Date(v.fechaDesde).getFullYear() === anio)
    .reduce((s, v) => s + (v.diasSolicitados || 0), 0);
}

export function diasEnProcesoEnAnio(legajoIdLocal, anio) {
  return vacacionesDelLegajo(legajoIdLocal)
    .filter(v => ESTADOS_EN_PROCESO.includes(v.estado) && new Date(v.fechaDesde).getFullYear() === anio)
    .reduce((s, v) => s + (v.diasSolicitados || 0), 0);
}

export function diasDisponibles(legajo, anio) {
  const asignados = legajo?.diasVacacionesAnuales || 0;
  const tomados = diasTomadosEnAnio(legajo?.nro, anio);
  const enProceso = diasEnProcesoEnAnio(legajo?.nro, anio);
  return asignados - tomados - enProceso;
}

export function calcularAntiguedad(legajo) {
  if (!legajo?.ingreso) return '';
  const p = legajo.ingreso.split('/');
  if (p.length !== 3) return '';
  const años = Math.floor((new Date() - new Date(`${p[2]}-${p[1]}-${p[0]}`)) / (365.25 * 24 * 3600 * 1000));
  return años >= 0 ? `${años} año${años === 1 ? '' : 's'}` : '';
}

// Superposición con otro legajo (jefe directo o reemplazante) en un rango
// de fechas — vacaciones Aprobada o en proceso.
export function tieneSuperposicion(legajoIdLocal, fechaDesde, fechaHasta) {
  const desde = new Date(fechaDesde), hasta = new Date(fechaHasta);
  return vacacionesDelLegajo(legajoIdLocal).some(v => {
    if (v.estado !== 'Aprobada' && !ESTADOS_EN_PROCESO.includes(v.estado)) return false;
    const vDesde = new Date(v.fechaDesde), vHasta = new Date(v.fechaHasta);
    return desde <= vHasta && hasta >= vDesde;
  });
}

// ========== TAB 3 — PANORAMA DE SALDOS ==========

function filasSaldos() {
  const anio = new Date().getFullYear();
  return (DB.legajos || [])
    .filter(l => l.estado === 'Activo' && l.servicio?.trim().toUpperCase() === 'ADMINISTRATIVO')
    .map(l => {
      const asignados = l.diasVacacionesAnuales || 0;
      const tomados = diasTomadosEnAnio(l.nro, anio);
      const enProceso = diasEnProcesoEnAnio(l.nro, anio);
      const disponibles = asignados - tomados;
      const alertas = [];
      const mesActual = new Date().getMonth(); // 0-indexed: 9=oct,10=nov,11=dic
      if (mesActual >= 9 && disponibles > 10) alertas.push('⚠️ Saldo alto sin tomar');
      if (!asignados) alertas.push('⚠️ Sin días asignados');
      if (asignados && disponibles === 0) alertas.push('✅ Ya tomó todos');
      return { legajo: l, anio, asignados, tomados, enProceso, disponibles, alertas };
    });
}

export function poblarSelectSectorSaldos() {
  const el = $('vac-saldo-sector');
  if (el) el.innerHTML = '<option value="">Todos</option>' + SECTORES_ADMIN.map(s => `<option>${s}</option>`).join('');
}

export function filtrarPanoramaSaldos() { renderPanoramaSaldos(); }

export function renderPanoramaSaldos() {
  let filas = filasSaldos();
  const fSector = ($('vac-saldo-sector') || {}).value || '';
  const soloAlertas = ($('vac-saldo-solo-alertas') || {}).checked;
  if (fSector) filas = filas.filter(f => f.legajo.sector === fSector);
  if (soloAlertas) filas = filas.filter(f => f.alertas.length > 0);

  const tbody = $('tbody-vac-saldos');
  if (!tbody) return;
  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.5;">Sin datos</td></tr>'
    : filas.map(f => `<tr>
        <td>${f.legajo.nombre}<div style="font-size:11px;color:var(--texto-suave);">N° ${f.legajo.nro}</div></td>
        <td><span class="chip">${f.legajo.sector || '—'}</span></td>
        <td>${calcularAntiguedad(f.legajo) || '—'}</td>
        <td>${f.asignados}</td>
        <td>${f.tomados}</td>
        <td>${f.enProceso}</td>
        <td><strong>${f.disponibles}</strong></td>
        <td>${f.alertas.join(' ') || '—'}</td>
      </tr>`).join('');
}

export async function exportarSaldosExcel() {
  const filas = filasSaldos();
  if (!filas.length) { toast('⚠️ No hay datos para exportar'); return; }
  const XLSX = await import('xlsx');
  const datos = filas.map(f => ({
    Asociado: f.legajo.nombre, 'N° Socio': f.legajo.nro, Sector: f.legajo.sector || '',
    Antigüedad: calcularAntiguedad(f.legajo), 'Días asignados': f.asignados,
    'Días tomados': f.tomados, 'Días en proceso': f.enProceso, 'Días disponibles': f.disponibles,
    Alertas: f.alertas.join(' / '),
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Saldos vacaciones');
  XLSX.writeFile(libro, `saldos_vacaciones_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
