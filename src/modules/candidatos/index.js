// Módulo Candidatos — Entry point

export {
  renderCandidatos, tabCandidatos, filtrarCandidatos, poblarFiltrosColumnasCandidatos,
  abrirNuevoCandidato, guardarCandidato, editarCandidatoPorId,
  onChangeZonaCand, onChangePartidoCand, onChangeLocalidadCand, onChangeEstadoCand,
  abrirCitarPorId, guardarCita,
  abrirResultadoPorId, guardarResultadoEntrevista,
  aprobarCandidatoPorId, aprobarPrecandidatoPorId, rechazarCandidatoPorId,
  onChangeMotivoRechCand, confirmarRechazoCandidato,
  pasarAPsicoPorId,
  registrarAsistencia, desmarcarAsistenciaPorId,
  getCandById, getIdxById,
  abrirDetalleCandidatoPorId,
  abrirBajaCandidatoPorId, confirmarBajaCandidato, onChangeEstadoBajaCand,
  eliminarCandidatoPorId,
  seleccionarArchivoEntrevistaCand, verAdjuntoEntrevistaCand, eliminarAdjuntoEntrevistaCand,
  seleccionarArchivoProcesoCand, verAdjuntoProcesoCand, eliminarAdjuntoProcesoCand,
} from './candidatos.js';

export {
  renderCalendario, cambiarSemana, irHoy,
  actualizarConfigAgente, agendarTurno,
  confirmarCalTurno, eliminarCalTurno, vincularCandidatoTurno,
  poblarSelectResponsable,
} from './calendario.js';

export { renderLinkPublico, copiarLinkPostulacion } from './linkPublico.js';

export {
  abrirImportadorCandidatosHistorico, descargarPlantillaCandidatosHistorico,
  seleccionarArchivoImportacionCandidatos, confirmarImportacionCandidatosHistorico,
} from './importadorHistorico.js';

// ========== TAB PRINCIPAL (Base / Calendario / Link / Importar) ==========

import { $ } from '@shared/helpers.js';
import { tabCandidatos } from './candidatos.js';
import { renderCalendario } from './calendario.js';
import { renderLinkPublico } from './linkPublico.js';
import { abrirImportadorCandidatosHistorico } from './importadorHistorico.js';

let _candPrincipalTab = 'base';

export function tabCandPrincipal(tab) {
  _candPrincipalTab = tab;
  var sBase = $('cand-section-base');
  var sCal  = $('cand-section-calendario');
  var sLink = $('cand-section-link');
  var sImp  = $('cand-section-importar');
  if (sBase) sBase.style.display = tab === 'base' ? 'block' : 'none';
  if (sCal)  sCal.style.display  = tab === 'calendario' ? 'block' : 'none';
  if (sLink) sLink.style.display = tab === 'link' ? 'block' : 'none';
  if (sImp)  sImp.style.display  = tab === 'importar' ? 'block' : 'none';
  ['base', 'calendario', 'link', 'importar'].forEach(function (t) {
    var btn = $('tab-cand-' + t);
    if (btn) {
      btn.style.background = t === tab ? '#1e3a8a' : '#f1f5f9';
      btn.style.color = t === tab ? 'white' : '#64748b';
    }
  });
  if (tab === 'base') tabCandidatos('activos');
  if (tab === 'calendario') { poblarSelectResponsable(); renderCalendario(); }
  if (tab === 'link') renderLinkPublico();
  if (tab === 'importar') abrirImportadorCandidatosHistorico();
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
  onChangeZonaCand, onChangePartidoCand, onChangeLocalidadCand, onChangeEstadoCand,
  abrirCitarPorId, guardarCita,
  abrirResultadoPorId, guardarResultadoEntrevista,
  aprobarCandidatoPorId, aprobarPrecandidatoPorId, rechazarCandidatoPorId,
  onChangeMotivoRechCand, confirmarRechazoCandidato,
  pasarAPsicoPorId,
  registrarAsistencia, desmarcarAsistenciaPorId,
  abrirDetalleCandidatoPorId,
  abrirBajaCandidatoPorId, confirmarBajaCandidato, onChangeEstadoBajaCand,
  eliminarCandidatoPorId,
  seleccionarArchivoEntrevistaCand, verAdjuntoEntrevistaCand, eliminarAdjuntoEntrevistaCand,
  seleccionarArchivoProcesoCand, verAdjuntoProcesoCand, eliminarAdjuntoProcesoCand,
} from './candidatos.js';

import {
  cambiarSemana, irHoy,
  actualizarConfigAgente, agendarTurno,
  confirmarCalTurno, eliminarCalTurno, vincularCandidatoTurno,
  poblarSelectResponsable,
} from './calendario.js';

import { copiarLinkPostulacion } from './linkPublico.js';

import {
  descargarPlantillaCandidatosHistorico,
  seleccionarArchivoImportacionCandidatos, confirmarImportacionCandidatosHistorico,
} from './importadorHistorico.js';

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
window.onChangePartidoCand = onChangePartidoCand;
window.onChangeLocalidadCand = onChangeLocalidadCand;
window.onChangeEstadoCand = onChangeEstadoCand;
window.abrirCitarPorId = abrirCitarPorId;
window.guardarCita = guardarCita;
window.abrirResultadoPorId = abrirResultadoPorId;
window.guardarResultadoEntrevista = guardarResultadoEntrevista;
window.aprobarCandidatoPorId = aprobarCandidatoPorId;
window.aprobarPrecandidatoPorId = aprobarPrecandidatoPorId;
window.rechazarCandidatoPorId = rechazarCandidatoPorId;
window.onChangeMotivoRechCand = onChangeMotivoRechCand;
window.confirmarRechazoCandidato = confirmarRechazoCandidato;
window.pasarAPsicoPorId = pasarAPsicoPorId;
window.registrarAsistencia = registrarAsistencia;
window.desmarcarAsistenciaPorId = desmarcarAsistenciaPorId;
window.abrirDetalleCandidatoPorId = abrirDetalleCandidatoPorId;
window.abrirBajaCandidatoPorId = abrirBajaCandidatoPorId;
window.confirmarBajaCandidato = confirmarBajaCandidato;
window.onChangeEstadoBajaCand = onChangeEstadoBajaCand;
window.eliminarCandidatoPorId = eliminarCandidatoPorId;
window.seleccionarArchivoEntrevistaCand = seleccionarArchivoEntrevistaCand;
window.verAdjuntoEntrevistaCand = verAdjuntoEntrevistaCand;
window.eliminarAdjuntoEntrevistaCand = eliminarAdjuntoEntrevistaCand;
window.seleccionarArchivoProcesoCand = seleccionarArchivoProcesoCand;
window.verAdjuntoProcesoCand = verAdjuntoProcesoCand;
window.eliminarAdjuntoProcesoCand = eliminarAdjuntoProcesoCand;

// Calendario de entrevistas
window.renderCalendario = renderCalendario;
window.cambiarSemana = cambiarSemana;
window.irHoy = irHoy;
window.actualizarConfigAgente = actualizarConfigAgente;
window.agendarTurno = agendarTurno;
window.confirmarCalTurno = confirmarCalTurno;
window.eliminarCalTurno = eliminarCalTurno;
window.vincularCandidatoTurno = vincularCandidatoTurno;

// Link público de postulación
window.copiarLinkPostulacion = copiarLinkPostulacion;

// WhatsApp — funciones invocadas desde onclick inline del modal dinámico
import { onWhatsAppTemplateChange, copiarMensajeWhatsApp, enviarMensajeWhatsApp } from './candidatos.js';
window.onWhatsAppTemplateChange = onWhatsAppTemplateChange;
window.copiarMensajeWhatsApp = copiarMensajeWhatsApp;
window.enviarMensajeWhatsApp = enviarMensajeWhatsApp;

// Importar histórico desde CSV
window.abrirImportadorCandidatosHistorico = abrirImportadorCandidatosHistorico;
window.descargarPlantillaCandidatosHistorico = descargarPlantillaCandidatosHistorico;
window.seleccionarArchivoImportacionCandidatos = seleccionarArchivoImportacionCandidatos;
window.confirmarImportacionCandidatosHistorico = confirmarImportacionCandidatosHistorico;
