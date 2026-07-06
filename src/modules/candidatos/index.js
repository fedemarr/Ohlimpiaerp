// Módulo Candidatos — Entry point

export {
  renderCandidatos, tabCandidatos, filtrarCandidatos, poblarFiltrosColumnasCandidatos,
  abrirNuevoCandidato, guardarCandidato, editarCandidatoPorId,
  onChangeZonaCand, onChangeEstadoCand,
  abrirCitarPorId, guardarCita,
  abrirResultadoPorId, guardarResultadoEntrevista,
  aprobarCandidatoPorId, rechazarCandidatoPorId, pasarAPsicoPorId,
  registrarAsistencia,
  getCandById, getIdxById,
  abrirDetalleCandidatoPorId,
} from './candidatos.js';

export {
  renderCalendario, cambiarSemana, irHoy,
  actualizarConfigAgente, agendarTurno,
  poblarSelectResponsable,
} from './calendario.js';

// ========== TAB PRINCIPAL (Base / Calendario / Link) ==========

import { $ } from '@shared/helpers.js';
import { tabCandidatos } from './candidatos.js';
import { renderCalendario } from './calendario.js';

let _candPrincipalTab = 'base';

export function tabCandPrincipal(tab) {
  _candPrincipalTab = tab;
  var sBase = $('cand-section-base');
  var sCal  = $('cand-section-calendario');
  var sLink = $('cand-section-link');
  if (sBase) sBase.style.display = tab === 'base' ? 'block' : 'none';
  if (sCal)  sCal.style.display  = tab === 'calendario' ? 'block' : 'none';
  if (sLink) sLink.style.display = tab === 'link' ? 'block' : 'none';
  ['base', 'calendario', 'link'].forEach(function (t) {
    var btn = $('tab-cand-' + t);
    if (btn) {
      btn.style.background = t === tab ? '#1e3a8a' : '#f1f5f9';
      btn.style.color = t === tab ? 'white' : '#64748b';
    }
  });
  if (tab === 'base') tabCandidatos('activos');
  if (tab === 'calendario') { poblarSelectResponsable(); renderCalendario(); }
}

// ========== SCREEN CONFIG ==========

import { abrirNuevoCandidato } from './candidatos.js';

export const candidatosScreenConfig = {
  candidatos: {
    title: 'Candidatos',
    btn: '+ Nuevo candidato',
    fn: () => abrirNuevoCandidato(),
    render: () => tabCandPrincipal('base'),
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarCandidatos, poblarFiltrosColumnasCandidatos,
  renderCandidatos,
  guardarCandidato, editarCandidatoPorId,
  onChangeZonaCand, onChangeEstadoCand,
  abrirCitarPorId, guardarCita,
  abrirResultadoPorId, guardarResultadoEntrevista,
  aprobarCandidatoPorId, rechazarCandidatoPorId, pasarAPsicoPorId,
  registrarAsistencia,
  abrirDetalleCandidatoPorId,
} from './candidatos.js';

import {
  cambiarSemana, irHoy,
  actualizarConfigAgente, agendarTurno,
  poblarSelectResponsable,
} from './calendario.js';

// Tab principal
window.tabCandPrincipal = tabCandPrincipal;

// Candidatos — acciones desde tabla y modales
window.tabCandidatos = tabCandidatos;
window.filtrarCandidatos = filtrarCandidatos;
window.renderCandidatos = renderCandidatos;
window.abrirNuevoCandidato = abrirNuevoCandidato;
window.guardarCandidato = guardarCandidato;
window.editarCandidatoPorId = editarCandidatoPorId;
window.onChangeZonaCand = onChangeZonaCand;
window.onChangeEstadoCand = onChangeEstadoCand;
window.abrirCitarPorId = abrirCitarPorId;
window.guardarCita = guardarCita;
window.abrirResultadoPorId = abrirResultadoPorId;
window.guardarResultadoEntrevista = guardarResultadoEntrevista;
window.aprobarCandidatoPorId = aprobarCandidatoPorId;
window.rechazarCandidatoPorId = rechazarCandidatoPorId;
window.pasarAPsicoPorId = pasarAPsicoPorId;
window.registrarAsistencia = registrarAsistencia;
window.abrirDetalleCandidatoPorId = abrirDetalleCandidatoPorId;

// Calendario de entrevistas
window.renderCalendario = renderCalendario;
window.cambiarSemana = cambiarSemana;
window.irHoy = irHoy;
window.actualizarConfigAgente = actualizarConfigAgente;
window.agendarTurno = agendarTurno;
