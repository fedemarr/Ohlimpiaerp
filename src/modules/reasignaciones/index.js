// Módulo Reasignaciones — Entry point

export {
  sincronizarConfigReasignaciones,
  tabReas,
  renderReasignaciones, renderReasPend, renderReasHist, renderRotacion,
  filtrarReas, filtrarReasH, filtrarRotacion,
  poblarSelectsReas, autocompletarReas,
  abrirNuevaReasignacion, abrirModalReasDesde, abrirBorradorReasignacionPorId,
  guardarReasignacion, puedeAprobarReasignacion,
  aprobarReasignacionPorId, rechazarReasignacionPorId, anularReasignacionPorId,
  abrirDetalleReasignacionPorId, abrirDetalleRotacionPorNro,
  renderConfigMotivosReas, agregarMotivoReas, eliminarMotivoReasPorId,
  renderConfigAprobadoresReas, agregarAprobadorReas, eliminarAprobadorReasPorId,
} from './reasignaciones.js';

// ========== SCREEN CONFIG ==========

import { renderReasignaciones, abrirNuevaReasignacion } from './reasignaciones.js';

export const reasignacionesScreenConfig = {
  reasignaciones: {
    title: 'Reasignaciones',
    btn: '+ Nueva reasignación',
    fn: () => abrirNuevaReasignacion(),
    render: renderReasignaciones,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  tabReas,
  renderReasPend, renderReasHist, renderRotacion,
  filtrarReas, filtrarReasH, filtrarRotacion,
  poblarSelectsReas, autocompletarReas,
  abrirModalReasDesde, abrirBorradorReasignacionPorId,
  guardarReasignacion, puedeAprobarReasignacion,
  aprobarReasignacionPorId, rechazarReasignacionPorId, anularReasignacionPorId,
  abrirDetalleReasignacionPorId, abrirDetalleRotacionPorNro,
  renderConfigMotivosReas, agregarMotivoReas, eliminarMotivoReasPorId,
  renderConfigAprobadoresReas, agregarAprobadorReas, eliminarAprobadorReasPorId,
} from './reasignaciones.js';

window.tabReas = tabReas;
window.renderReasignaciones = renderReasignaciones;
window.renderReasPend = renderReasPend;
window.renderReasHist = renderReasHist;
window.renderRotacion = renderRotacion;
window.filtrarReas = filtrarReas;
window.filtrarReasH = filtrarReasH;
window.filtrarRotacion = filtrarRotacion;
window.poblarSelectsReas = poblarSelectsReas;
window.autocompletarReas = autocompletarReas;
window.abrirNuevaReasignacion = abrirNuevaReasignacion;
window.abrirModalReasDesde = abrirModalReasDesde;
window.abrirBorradorReasignacionPorId = abrirBorradorReasignacionPorId;
window.guardarReasignacion = guardarReasignacion;
window.puedeAprobarReasignacion = puedeAprobarReasignacion;
window.aprobarReasignacionPorId = aprobarReasignacionPorId;
window.rechazarReasignacionPorId = rechazarReasignacionPorId;
window.anularReasignacionPorId = anularReasignacionPorId;
window.abrirDetalleReasignacionPorId = abrirDetalleReasignacionPorId;
window.abrirDetalleRotacionPorNro = abrirDetalleRotacionPorNro;
window.renderConfigMotivosReas = renderConfigMotivosReas;
window.agregarMotivoReas = agregarMotivoReas;
window.eliminarMotivoReasPorId = eliminarMotivoReasPorId;
window.renderConfigAprobadoresReas = renderConfigAprobadoresReas;
window.agregarAprobadorReas = agregarAprobadorReas;
window.eliminarAprobadorReasPorId = eliminarAprobadorReasPorId;
