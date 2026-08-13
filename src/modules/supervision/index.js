// Módulo Supervisión de Servicios — Entry point

import {
  renderSupervision, tabSupervision, cambiarMesSup,
  setPctClienteSup, setPctServicioSup, confirmarVigenciaSup,
  heredarClienteSup, heredarServicioSup, abrirHistorialServicioSup,
  pctEfectivoObjetivo, pctGeneralVigente, esEditorSupervision,
  esMismoSupervisor, adicionalSupervisionDe, detalleAdicionalSupervision,
} from './supervision.js';

export {
  renderSupervision, tabSupervision, cambiarMesSup,
  setPctClienteSup, setPctServicioSup, confirmarVigenciaSup,
  heredarClienteSup, heredarServicioSup, abrirHistorialServicioSup,
  pctEfectivoObjetivo, pctGeneralVigente, esEditorSupervision,
  esMismoSupervisor, adicionalSupervisionDe, detalleAdicionalSupervision,
};

// ========== SCREEN CONFIG ==========

export const supervisionScreenConfig = {
  supervision: {
    title: 'Supervisión de servicios',
    btn: '',
    fn: null,
    render: () => renderSupervision(),
  },
};

// ========== WINDOW BINDINGS ==========

window.renderSupervision = renderSupervision;
window.tabSupervision = tabSupervision;
window.cambiarMesSup = cambiarMesSup;
window.setPctClienteSup = setPctClienteSup;
window.setPctServicioSup = setPctServicioSup;
window.confirmarVigenciaSup = confirmarVigenciaSup;
window.heredarClienteSup = heredarClienteSup;
window.heredarServicioSup = heredarServicioSup;
window.abrirHistorialServicioSup = abrirHistorialServicioSup;
// Expuestos también para legacy.js (renderLiqAdmin usa adicional/ajuste y
// el drill-down del adicional por supervisor).
window.pctEfectivoObjetivo = pctEfectivoObjetivo;
window.pctGeneralVigente = pctGeneralVigente;
window.esEditorSupervision = esEditorSupervision;
window.esMismoSupervisor = esMismoSupervisor;
window.adicionalSupervisionDe = adicionalSupervisionDe;
window.detalleAdicionalSupervision = detalleAdicionalSupervision;
