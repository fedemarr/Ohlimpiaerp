// Tab 4 — Calendario mensual de vacaciones administrativas
// (DISENO_vacaciones.md §9). Solo muestra vacaciones "Aprobada" (con
// soft-color para las que están en proceso).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { SECTORES_ADMIN } from '@modules/legajos/index.js';
import { ESTADOS_VIGENTES } from './saldo.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

let _mesVac = new Date().getMonth();
let _anioVac = new Date().getFullYear();

export function mesAnteriorVac() {
  _mesVac--;
  if (_mesVac < 0) { _mesVac = 11; _anioVac--; }
  renderCalendarioVacaciones();
}

export function mesSiguienteVac() {
  _mesVac++;
  if (_mesVac > 11) { _mesVac = 0; _anioVac++; }
  renderCalendarioVacaciones();
}

export function poblarSelectSectorCalendario() {
  const el = $('vac-cal-sector');
  if (el) el.innerHTML = '<option value="">Todos</option>' + SECTORES_ADMIN.map(s => `<option>${s}</option>`).join('');
}

function vacacionesDelMes() {
  const fSector = ($('vac-cal-sector') || {}).value || '';
  const inicioMes = new Date(_anioVac, _mesVac, 1);
  const finMes = new Date(_anioVac, _mesVac + 1, 0);
  return (DB.vacaciones || []).filter(v => {
    if (v.anulado) return false;
    if (!ESTADOS_VIGENTES.includes(v.estado) && v.estado !== 'Pendiente aprobación Gerente' && v.estado !== 'Pendiente aprobación Consejo') return false;
    if (fSector && v.sector !== fSector) return false;
    const desde = new Date(v.fechaDesde), hasta = new Date(v.fechaHasta);
    return desde <= finMes && hasta >= inicioMes;
  });
}

export function renderCalendarioVacaciones() {
  const titulo = $('vac-cal-titulo');
  if (titulo) titulo.textContent = `${MESES[_mesVac]} ${_anioVac}`;

  const vacs = vacacionesDelMes();
  const personas = [...new Map(vacs.map(v => [v.nombreAsociado, v])).values()];
  const diasDelMes = new Date(_anioVac, _mesVac + 1, 0).getDate();
  const hoy = new Date();

  const cont = $('vac-calendario-grilla');
  if (!cont) return;
  if (personas.length === 0) {
    cont.innerHTML = '<div style="padding:32px;text-align:center;opacity:.5;">Nadie de vacaciones este mes</div>';
    return;
  }

  let html = '<div class="tabla-container"><table><thead><tr><th style="position:sticky;left:0;background:white;">Persona</th>';
  for (let d = 1; d <= diasDelMes; d++) {
    const fecha = new Date(_anioVac, _mesVac, d);
    const esFinde = fecha.getDay() === 0 || fecha.getDay() === 6;
    const esHoy = fecha.toDateString() === hoy.toDateString();
    html += `<th style="min-width:26px;font-size:10px;padding:4px 2px;${esFinde ? 'background:var(--fondo);' : ''}${esHoy ? 'border-left:2px solid var(--azul);border-right:2px solid var(--azul);' : ''}">${d}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const persona of personas) {
    const vDePersona = vacs.filter(v => v.nombreAsociado === persona.nombreAsociado);
    html += `<tr><td style="position:sticky;left:0;background:white;cursor:pointer;font-size:12.5px;" onclick="verHistorialDesdeCalendario('${persona.nombreAsociado}')">${persona.nombreAsociado}</td>`;
    for (let d = 1; d <= diasDelMes; d++) {
      const fecha = new Date(_anioVac, _mesVac, d);
      const ocupante = vDePersona.find(v => fecha >= new Date(v.fechaDesde) && fecha <= new Date(v.fechaHasta));
      let color = 'transparent';
      if (ocupante) color = ESTADOS_VIGENTES.includes(ocupante.estado) ? 'var(--verde-suave,#dcfce7)' : 'var(--acento-suave,#fef3c7)';
      const tooltip = ocupante ? `${ocupante.nombreAsociado}: ${ocupante.fechaDesde} a ${ocupante.fechaHasta} (${ocupante.sector})` : '';
      html += `<td title="${tooltip}" style="background:${color};min-width:26px;height:26px;"></td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  cont.innerHTML = html;
}

export function verHistorialDesdeCalendario(nombre) {
  const buscador = $('vac-hist-buscar');
  if (buscador) buscador.value = nombre;
  if (window.cambiarTabVacaciones) window.cambiarTabVacaciones('historial');
}
