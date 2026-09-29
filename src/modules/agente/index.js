export * from './agente.js';
export * from './riesgo.js';
export * from './dispatcher.js';
export * from './estados.js';
export * from './resolucion.js';
export * from './auditoria.js';

import { renderAgente } from './agente.js';

export const agenteScreenConfig = {
  agente: {
    title: '🤖 Agente de tickets',
    btn: null,
    fn: null,
    render: () => renderAgente(),
  },
};

// window bindings — el HTML de index.html llama estas funciones con
// onclick inline (mismo patrón que el resto de los módulos migrados).
import {
  toggleSeleccionTicketAgente, toggleModoSimulacionAgente, enviarSeleccionAlAgente,
  abrirDetalleCorridaAgente, aprobarMigracionAgente, rechazarMigracionAgente,
  confirmarMigracionAplicadaAgente, reintentarCorridaAgente, descartarCorridaAgente,
  abrirResolucionAgente, copiarResolucionAgente, enviarResolucionAgente,
} from './agente.js';

window.renderAgente = renderAgente;
window.toggleSeleccionTicketAgente = toggleSeleccionTicketAgente;
window.toggleModoSimulacionAgente = toggleModoSimulacionAgente;
window.enviarSeleccionAlAgente = enviarSeleccionAlAgente;
window.abrirDetalleCorridaAgente = abrirDetalleCorridaAgente;
window.aprobarMigracionAgente = aprobarMigracionAgente;
window.rechazarMigracionAgente = rechazarMigracionAgente;
window.confirmarMigracionAplicadaAgente = confirmarMigracionAplicadaAgente;
window.reintentarCorridaAgente = reintentarCorridaAgente;
window.descartarCorridaAgente = descartarCorridaAgente;
window.abrirResolucionAgente = abrirResolucionAgente;
window.copiarResolucionAgente = copiarResolucionAgente;
window.enviarResolucionAgente = enviarResolucionAgente;
