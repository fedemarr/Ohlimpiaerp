// Tab 3 — Calendario mensual de descansos operativos
// (DISENO_descansos.md §8). Solo muestra descansos "Aprobado". Vista
// global por defecto, con filtro por servicio y supervisor.

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

let _mesDesc = new Date().getMonth();
let _anioDesc = new Date().getFullYear();

export function mesAnteriorDesc() {
  _mesDesc--;
  if (_mesDesc < 0) { _mesDesc = 11; _anioDesc--; }
  renderCalendarioDescansos();
}

export function mesSiguienteDesc() {
  _mesDesc++;
  if (_mesDesc > 11) { _mesDesc = 0; _anioDesc++; }
  renderCalendarioDescansos();
}

export function poblarSelectsCalendarioDescansos() {
  const fS = (id, items) => { const el = $(id); if (el) el.innerHTML = '<option value="">Todos</option>' + items.map(s => `<option>${s}</option>`).join(''); };
  fS('desc-cal-servicio', window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : (DB.servicios || []));
  fS('desc-cal-supervisor', DB.supervisores || []);
}

function descansosDelMes() {
  const fServicio = ($('desc-cal-servicio') || {}).value || '';
  const fSupervisor = ($('desc-cal-supervisor') || {}).value || '';
  const inicioMes = new Date(_anioDesc, _mesDesc, 1);
  const finMes = new Date(_anioDesc, _mesDesc + 1, 0);
  return (DB.descansos || []).filter(d => {
    if (d.anulado || d.estado !== 'Aprobado') return false;
    if (fServicio && d.servicio !== fServicio) return false;
    if (fSupervisor && d.supervisor !== fSupervisor) return false;
    const desde = new Date(d.fechaDesde), hasta = new Date(d.fechaHasta);
    return desde <= finMes && hasta >= inicioMes;
  });
}

export function renderCalendarioDescansos() {
  const titulo = $('desc-cal-titulo');
  if (titulo) titulo.textContent = `${MESES[_mesDesc]} ${_anioDesc}`;

  const descansos = descansosDelMes();
  const operarios = [...new Map(descansos.map(d => [d.nombreOperario, d])).values()];
  const diasDelMes = new Date(_anioDesc, _mesDesc + 1, 0).getDate();
  const hoy = new Date();

  const cont = $('desc-calendario-grilla');
  if (!cont) return;
  if (operarios.length === 0) {
    cont.innerHTML = '<div style="padding:32px;text-align:center;opacity:.5;">Nadie de descanso este mes</div>';
    return;
  }

  let html = '<div class="tabla-container"><table><thead><tr><th style="position:sticky;left:0;background:white;">Operario</th>';
  for (let d = 1; d <= diasDelMes; d++) {
    const fecha = new Date(_anioDesc, _mesDesc, d);
    const esFinde = fecha.getDay() === 0 || fecha.getDay() === 6;
    const esHoy = fecha.toDateString() === hoy.toDateString();
    html += `<th style="min-width:26px;font-size:10px;padding:4px 2px;${esFinde ? 'background:var(--fondo);' : ''}${esHoy ? 'border-left:2px solid var(--azul);border-right:2px solid var(--azul);' : ''}">${d}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const operario of operarios) {
    const dDelOperario = descansos.filter(d => d.nombreOperario === operario.nombreOperario);
    html += `<tr><td style="position:sticky;left:0;background:white;cursor:pointer;font-size:12.5px;" onclick="verHistorialDesdeCalendarioDescansos('${operario.nombreOperario}')">${operario.nombreOperario}<div style="font-size:10px;color:var(--texto-suave);">${operario.servicio}</div></td>`;
    for (let d = 1; d <= diasDelMes; d++) {
      const fecha = new Date(_anioDesc, _mesDesc, d);
      const ocupante = dDelOperario.find(x => fecha >= new Date(x.fechaDesde) && fecha <= new Date(x.fechaHasta));
      const color = ocupante ? 'var(--verde-suave,#dcfce7)' : 'transparent';
      const tooltip = ocupante ? `${ocupante.nombreOperario}: ${ocupante.fechaDesde} a ${ocupante.fechaHasta} — ${ocupante.servicio} (sup. ${ocupante.supervisor}) — ${ocupante.motivo}` : '';
      html += `<td title="${tooltip.replace(/"/g, '&quot;')}" style="background:${color};min-width:26px;height:26px;">${ocupante ? '🏖' : ''}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  cont.innerHTML = html;
}

export function verHistorialDesdeCalendarioDescansos(nombre) {
  const buscador = $('desc-hist-buscar');
  if (buscador) buscador.value = nombre;
  if (window.cambiarTabDescansos) window.cambiarTabDescansos('historial');
}
