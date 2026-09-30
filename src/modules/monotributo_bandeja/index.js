// Monotributo — Bandeja de Pendientes: window bindings (el módulo
// Monotributos vive en legacy.js, ver bandeja.js).
import {
  renderMonoPendientes, iniciarTramiteMono, abrirMonoTramite, cerrarTramiteMono, filasBandejaMono,
  actualizarFechaLimiteMono, subirComprobanteMonoBandeja,
} from './bandeja.js';

export {
  renderMonoPendientes, iniciarTramiteMono, abrirMonoTramite, cerrarTramiteMono, filasBandejaMono,
  actualizarFechaLimiteMono, subirComprobanteMonoBandeja,
};

window.renderMonoPendientes = renderMonoPendientes;
window.iniciarTramiteMono = iniciarTramiteMono;
window.abrirMonoTramite = abrirMonoTramite;
window.cerrarTramiteMono = cerrarTramiteMono;
window.actualizarFechaLimiteMono = actualizarFechaLimiteMono;
window.subirComprobanteMonoBandeja = subirComprobanteMonoBandeja;
