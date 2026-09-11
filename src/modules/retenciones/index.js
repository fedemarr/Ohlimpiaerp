// Módulo Retenciones — Entry point (rediseño v126, ver retenciones.js)

export {
  renderRetenciones, cambiarTabRetencion, poblarSelectsRetenciones, filtrarRetenciones,
  abrirNuevaRetencion, guardarNuevaRetencion, autocompletarRetencion,
  toggleAlcanceRetencion, agregarAdjuntoRetencion, quitarAdjuntoPendiente,
  abrirLiberarRetencion, confirmarLiberarRetencion,
  abrirAplicarRetencion, confirmarAplicarRetencion,
  abrirConfirmarPagoMovimiento, confirmarPagoMovimiento,
  sugerenciasRetencion, crearRetencionDesdeSugerencia,
} from './retenciones.js';

// ========== SCREEN CONFIG ==========

import { currentUser } from '@shared/state.js';
import { renderRetenciones, poblarSelectsRetenciones, abrirNuevaRetencion } from './retenciones.js';

// Decisión del usuario (AskUserQuestion, ticket "Módulo Retenciones"): se
// elimina el reporte del supervisor — el mockup deja el módulo 100% en
// manos de RRHH/Finanzas. Supervisor conserva el ítem de menú (así lo
// define PERFILES en state.js) pero en modo solo lectura, mismo patrón
// que ya usa Liquidaciones con el perfil Finanzas.
export const retencionesScreenConfig = {
  retenciones: {
    title: 'Retenciones',
    get btn() { return currentUser?.perfil === 'Supervisor' ? null : '+ Nueva retención'; },
    fn: () => abrirNuevaRetencion(),
    render: () => { poblarSelectsRetenciones(); renderRetenciones(); },
  },
};

// ========== WINDOW BINDINGS ==========

import {
  cambiarTabRetencion, guardarNuevaRetencion, autocompletarRetencion,
  toggleAlcanceRetencion, agregarAdjuntoRetencion, quitarAdjuntoPendiente,
  abrirLiberarRetencion, confirmarLiberarRetencion,
  abrirAplicarRetencion, confirmarAplicarRetencion,
  abrirConfirmarPagoMovimiento, confirmarPagoMovimiento,
  crearRetencionDesdeSugerencia,
} from './retenciones.js';

window.renderRetenciones = renderRetenciones;
window.cambiarTabRetencion = cambiarTabRetencion;
window.poblarSelectsRetenciones = poblarSelectsRetenciones;
window.abrirNuevaRetencion = abrirNuevaRetencion;
window.guardarNuevaRetencion = guardarNuevaRetencion;
window.autocompletarRetencion = autocompletarRetencion;
window.toggleAlcanceRetencion = toggleAlcanceRetencion;
window.agregarAdjuntoRetencion = agregarAdjuntoRetencion;
window.quitarAdjuntoPendiente = quitarAdjuntoPendiente;
window.abrirLiberarRetencion = abrirLiberarRetencion;
window.confirmarLiberarRetencion = confirmarLiberarRetencion;
window.abrirAplicarRetencion = abrirAplicarRetencion;
window.confirmarAplicarRetencion = confirmarAplicarRetencion;
window.abrirConfirmarPagoMovimiento = abrirConfirmarPagoMovimiento;
window.confirmarPagoMovimiento = confirmarPagoMovimiento;
window.crearRetencionDesdeSugerencia = crearRetencionDesdeSugerencia;
