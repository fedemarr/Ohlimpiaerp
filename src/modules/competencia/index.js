// Módulo Competencia Anual — Entry point

export {
  tabComp, generarDatosCompetencia, calcularEquipos, calcularSupervisores,
  renderCompetencia, renderTablaIndividual, renderTablaEquipos, renderTablaSupervisores,
  renderTablaNoParticipan, poblarFiltrosCompetencia, poblarAniosCompetencia,
  filtrarCompInd, filtrarCompEq, verRankingPublico,
  notificarAsociado, notificarNoParticipantes, analizarNoParticipantesIA, notificarGrupoSupervisor,
} from './competencia.js';

export {
  renderReglas, sincronizarReglasCompetencia, abrirModalEditarReglas, guardarReglas,
} from './reglas.js';

// ========== SCREEN CONFIG ==========

import { tabComp, poblarAniosCompetencia, renderCompetencia } from './competencia.js';

export const competenciaScreenConfig = {
  competencia: {
    title: 'Competencia Anual',
    btn: '',
    fn: null,
    render: () => { poblarAniosCompetencia(); tabComp('individual'); renderCompetencia(); },
  },
};

// ========== WINDOW BINDINGS ==========

import {
  generarDatosCompetencia, calcularEquipos, calcularSupervisores,
  renderTablaIndividual, renderTablaEquipos, renderTablaSupervisores, renderTablaNoParticipan,
  poblarFiltrosCompetencia, filtrarCompInd, filtrarCompEq, verRankingPublico,
  notificarAsociado, notificarNoParticipantes, analizarNoParticipantesIA, notificarGrupoSupervisor,
} from './competencia.js';

import { renderReglas, abrirModalEditarReglas, guardarReglas } from './reglas.js';

window.tabComp = tabComp;
window.generarDatosCompetencia = generarDatosCompetencia;
window.calcularEquipos = calcularEquipos;
window.calcularSupervisores = calcularSupervisores;
window.renderCompetencia = renderCompetencia;
window.renderTablaIndividual = renderTablaIndividual;
window.renderTablaEquipos = renderTablaEquipos;
window.renderTablaSupervisores = renderTablaSupervisores;
window.renderTablaNoParticipan = renderTablaNoParticipan;
window.poblarFiltrosCompetencia = poblarFiltrosCompetencia;
window.poblarAniosCompetencia = poblarAniosCompetencia;
window.filtrarCompInd = filtrarCompInd;
window.filtrarCompEq = filtrarCompEq;
window.verRankingPublico = verRankingPublico;
window.notificarAsociado = notificarAsociado;
window.notificarNoParticipantes = notificarNoParticipantes;
window.analizarNoParticipantesIA = analizarNoParticipantesIA;
window.notificarGrupoSupervisor = notificarGrupoSupervisor;

window.renderReglas = renderReglas;
window.abrirModalEditarReglas = abrirModalEditarReglas;
window.guardarReglas = guardarReglas;
