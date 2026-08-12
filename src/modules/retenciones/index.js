// Módulo Retenciones — Entry point

export {
  renderRetenciones, filtrarRetenciones, poblarSelectsRetenciones,
  abrirNuevaRetencion, abrirReportarInconveniente, abrirEditarRetencionPorId, guardarRetencion,
  liberarRetencionPorId, eliminarRetencionPorId, autocompletarRetencion,
  candidatosAutomaticosRetencion, abrirCandidatoComoCaso,
} from './retenciones.js';

// ========== SCREEN CONFIG ==========

import { currentUser } from '@shared/state.js';
import { renderRetenciones, poblarSelectsRetenciones, abrirNuevaRetencion } from './retenciones.js';

// btn/fn son getters: currentUser recién se conoce al loguear, y
// navTo() lee cfg.btn/cfg.fn de nuevo en cada navegación (src/shared/nav.js),
// así que alcanza con que sean dinámicos — no hace falta duplicar pantalla
// para que el supervisor vea "Reportar inconveniente" en vez de "Nueva
// retención" (mismo botón superior, mismo flujo de abrirNuevaRetencion()
// que ya deriva a abrirReportarInconveniente() si el perfil es Supervisor).
export const retencionesScreenConfig = {
  retenciones: {
    title: 'Retenciones',
    get btn() { return currentUser?.perfil === 'Supervisor' ? '📋 Reportar inconveniente' : '+ Nueva retención'; },
    fn: () => abrirNuevaRetencion(),
    render: () => { poblarSelectsRetenciones(); renderRetenciones(); },
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarRetenciones, abrirReportarInconveniente, abrirEditarRetencionPorId, guardarRetencion,
  liberarRetencionPorId, eliminarRetencionPorId, autocompletarRetencion,
  abrirCandidatoComoCaso,
} from './retenciones.js';

window.renderRetenciones = renderRetenciones;
window.filtrarRetenciones = filtrarRetenciones;
window.poblarSelectsRetenciones = poblarSelectsRetenciones;
window.abrirNuevaRetencion = abrirNuevaRetencion;
window.abrirReportarInconveniente = abrirReportarInconveniente;
window.abrirEditarRetencionPorId = abrirEditarRetencionPorId;
window.guardarRetencion = guardarRetencion;
window.liberarRetencionPorId = liberarRetencionPorId;
window.eliminarRetencionPorId = eliminarRetencionPorId;
window.autocompletarRetencion = autocompletarRetencion;
window.abrirCandidatoComoCaso = abrirCandidatoComoCaso;
