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
} from './candidatos.js';

export {
  renderCalendario, cambiarSemana, irHoy,
  actualizarConfigAgente, agendarTurno,
} from './calendario.js';

// ========== SCREEN CONFIG ==========

import { renderCandidatos, tabCandidatos, abrirNuevoCandidato } from './candidatos.js';

export const candidatosScreenConfig = {
  candidatos: {
    title: 'Candidatos',
    btn: '+ Nuevo candidato',
    fn: () => abrirNuevoCandidato(),
    render: () => tabCandidatos('activos'),
  },
};

// ========== WINDOW BINDINGS ==========
// Las funciones que el HTML llama con onclick deben estar en window
// hasta que se migre el HTML a event listeners.

import {
  filtrarCandidatos, poblarFiltrosColumnasCandidatos,
  guardarCandidato, editarCandidatoPorId,
  onChangeZonaCand, onChangeEstadoCand,
  abrirCitarPorId, guardarCita,
  abrirResultadoPorId, guardarResultadoEntrevista,
  aprobarCandidatoPorId, rechazarCandidatoPorId, pasarAPsicoPorId,
  registrarAsistencia,
} from './candidatos.js';

import {
  renderCalendario, cambiarSemana, irHoy,
  actualizarConfigAgente, agendarTurno,
} from './calendario.js';

// Candidatos — acciones desde tabla y modales
window.tabCandidatos = tabCandidatos;
window.filtrarCandidatos = filtrarCandidatos;
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

// Calendario de entrevistas
window.renderCalendario = renderCalendario;
window.cambiarSemana = cambiarSemana;
window.irHoy = irHoy;
window.actualizarConfigAgente = actualizarConfigAgente;
window.agendarTurno = agendarTurno;
