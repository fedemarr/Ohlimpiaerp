// Módulo Reasignaciones — Entry point

export {
  sincronizarConfigReasignaciones, chequearEjecucionesPendientes,
  tabReas, renderReasignacionesInicial,
  renderReasignaciones, renderReasPend, renderReasHist, renderRotacion,
  filtrarReas, filtrarReasH, filtrarRotacion,
  poblarSelectsReas, autocompletarReas, onChangeServicioDestinoReas,
  abrirNuevaReasignacion, abrirModalReasDesde, abrirBorradorReasignacionPorId,
  guardarReasignacion, puedeAprobarReasignacion,
  aprobarReasignacionPorId, rechazarReasignacionPorId, anularReasignacionPorId,
  abrirDetalleReasignacionPorId, abrirDetalleRotacionPorNro,
  renderConfigMotivosReas, agregarMotivoReas, eliminarMotivoReasPorId,
  renderConfigAprobadoresReas, agregarAprobadorReas, eliminarAprobadorReasPorId,
  abrirSugeridorDestino, elegirSugerenciaDestino, abrirReasignacionDesdePrepedido,
  setModoReas,
} from './reasignaciones.js';

// ========== SCREEN CONFIG ==========

import { renderReasignacionesInicial, abrirNuevaReasignacion, abrirReasignacionDesdePrepedido } from './reasignaciones.js';

export const reasignacionesScreenConfig = {
  reasignaciones: {
    title: 'Reubicación',
    btn: '+ Nueva reubicación',
    fn: () => abrirNuevaReasignacion(),
    render: renderReasignacionesInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  tabReas,
  renderReasPend, renderReasHist, renderRotacion,
  filtrarReas, filtrarReasH, filtrarRotacion,
  poblarSelectsReas, autocompletarReas, onChangeServicioDestinoReas,
  abrirModalReasDesde, abrirBorradorReasignacionPorId,
  guardarReasignacion, puedeAprobarReasignacion,
  aprobarReasignacionPorId, rechazarReasignacionPorId, anularReasignacionPorId,
  abrirDetalleReasignacionPorId, abrirDetalleRotacionPorNro,
  renderConfigMotivosReas, agregarMotivoReas, eliminarMotivoReasPorId,
  renderConfigAprobadoresReas, agregarAprobadorReas, eliminarAprobadorReasPorId,
  abrirSugeridorDestino, elegirSugerenciaDestino, setModoReas,
} from './reasignaciones.js';

window.tabReas = tabReas;
window.setModoReas = setModoReas;
window.abrirReasignacionDesdePrepedido = abrirReasignacionDesdePrepedido;
window.abrirSugeridorDestino = abrirSugeridorDestino;
window.elegirSugerenciaDestino = elegirSugerenciaDestino;
window.renderReasPend = renderReasPend;
window.renderReasHist = renderReasHist;
window.renderRotacion = renderRotacion;
window.filtrarReas = filtrarReas;
window.filtrarReasH = filtrarReasH;
window.filtrarRotacion = filtrarRotacion;
window.poblarSelectsReas = poblarSelectsReas;
window.autocompletarReas = autocompletarReas;
window.onChangeServicioDestinoReas = onChangeServicioDestinoReas;
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
