// Módulo Developer — Entry point

export {
  renderDevInicio, renderDevTickets, filtrarDevTickets, abrirTicketPorId,
  guardarRespuestaTicket, generarPromptIA, copiarPromptIA,
  renderDevProyeccion, toggleRoadmapItem,
  renderDevSeguridad, toggleChecklistItem,
  sincronizarSugerenciasComoTickets,
} from './developer.js';

// ========== SCREEN CONFIG ==========

import { renderDevInicio, renderDevTickets, renderDevProyeccion, renderDevSeguridad } from './developer.js';

export const developerScreenConfig = {
  dev_inicio: {
    title: 'Inicio Desarrollador',
    btn: '',
    fn: null,
    render: () => renderDevInicio(),
  },
  dev_tickets: {
    title: 'Tickets',
    btn: '',
    fn: null,
    render: () => renderDevTickets(),
  },
  dev_proyeccion: {
    title: 'Proyección',
    btn: '',
    fn: null,
    render: () => renderDevProyeccion(),
  },
  dev_seguridad: {
    title: 'Seguridad',
    btn: '',
    fn: null,
    render: () => renderDevSeguridad(),
  },
};

// ========== WINDOW BINDINGS ==========

import {
  filtrarDevTickets, abrirTicketPorId, guardarRespuestaTicket, generarPromptIA, copiarPromptIA,
  toggleRoadmapItem, toggleChecklistItem,
} from './developer.js';

window.renderDevInicio = renderDevInicio;
window.renderDevTickets = renderDevTickets;
window.filtrarDevTickets = filtrarDevTickets;
window.abrirTicketPorId = abrirTicketPorId;
window.guardarRespuestaTicket = guardarRespuestaTicket;
window.generarPromptIA = generarPromptIA;
window.copiarPromptIA = copiarPromptIA;
window.renderDevProyeccion = renderDevProyeccion;
window.toggleRoadmapItem = toggleRoadmapItem;
window.renderDevSeguridad = renderDevSeguridad;
window.toggleChecklistItem = toggleChecklistItem;
