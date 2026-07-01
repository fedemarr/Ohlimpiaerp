// Módulo Reasignaciones — Entry point

export {
  tabReas,
  renderReasignaciones, renderReasPend, renderReasHist, renderRotacion, verDetalleRotacion,
  filtrarReas, filtrarReasH, filtrarRotacion,
  poblarSelectsReas, autocompletarReas,
  guardarReasignacion, puedeAprobarReasignacion, aprobarReasignacion, rechazarReasignacion,
  verDetalleReas, abrirModalReasDesde,
  renderConfigMotivosReas, agregarMotivoReas, eliminarMotivoReas,
  renderConfigAprobadoresReas, agregarAprobadorReas, eliminarAprobadorReas,
  sugerirServiciosIA, seleccionarSugerenciaIA,
} from './reasignaciones.js';

// ========== SCREEN CONFIG ==========

import { renderReasignaciones } from './reasignaciones.js';
import { abrirModal } from '@shared/ui.js';

export const reasignacionesScreenConfig = {
  reasignaciones: {
    title: 'Reasignaciones',
    btn: '+ Nueva reasignación',
    fn: () => abrirModal('modal-reasignacion'),
    render: renderReasignaciones,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  tabReas,
  renderReasPend, renderReasHist, renderRotacion, verDetalleRotacion,
  filtrarReas, filtrarReasH, filtrarRotacion,
  poblarSelectsReas, autocompletarReas,
  guardarReasignacion, puedeAprobarReasignacion, aprobarReasignacion, rechazarReasignacion,
  verDetalleReas, abrirModalReasDesde,
  renderConfigMotivosReas, agregarMotivoReas, eliminarMotivoReas,
  renderConfigAprobadoresReas, agregarAprobadorReas, eliminarAprobadorReas,
  sugerirServiciosIA, seleccionarSugerenciaIA,
} from './reasignaciones.js';

window.tabReas = tabReas;
window.renderReasignaciones = renderReasignaciones;
window.renderReasPend = renderReasPend;
window.renderReasHist = renderReasHist;
window.renderRotacion = renderRotacion;
window.verDetalleRotacion = verDetalleRotacion;
window.filtrarReas = filtrarReas;
window.filtrarReasH = filtrarReasH;
window.filtrarRotacion = filtrarRotacion;
window.poblarSelectsReas = poblarSelectsReas;
window.autocompletarReas = autocompletarReas;
window.guardarReasignacion = guardarReasignacion;
window.puedeAprobarReasignacion = puedeAprobarReasignacion;
window.aprobarReasignacion = aprobarReasignacion;
window.rechazarReasignacion = rechazarReasignacion;
window.verDetalleReas = verDetalleReas;
window.abrirModalReasDesde = abrirModalReasDesde;
window.renderConfigMotivosReas = renderConfigMotivosReas;
window.agregarMotivoReas = agregarMotivoReas;
window.eliminarMotivoReas = eliminarMotivoReas;
window.renderConfigAprobadoresReas = renderConfigAprobadoresReas;
window.agregarAprobadorReas = agregarAprobadorReas;
window.eliminarAprobadorReas = eliminarAprobadorReas;
window.sugerirServiciosIA = sugerirServiciosIA;
window.seleccionarSugerenciaIA = seleccionarSugerenciaIA;
