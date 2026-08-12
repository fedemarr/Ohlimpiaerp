// Módulo Supervisores — Entry point

export {
  renderSupervisores, actualizarPctSupervisor, toggleActivoSupervisor,
  agregarSupervisorAlCatalogo, poblarSelectNuevoSupervisor, pctComisionSupervisor,
} from './supervisores.js';

// ========== SCREEN CONFIG ==========

import { renderSupervisores, poblarSelectNuevoSupervisor } from './supervisores.js';

export const supervisoresScreenConfig = {
  supervisores: {
    title: 'Supervisores',
    btn: '',
    fn: null,
    render: () => { poblarSelectNuevoSupervisor(); renderSupervisores(); },
  },
};

// ========== WINDOW BINDINGS ==========

import {
  actualizarPctSupervisor, toggleActivoSupervisor, agregarSupervisorAlCatalogo,
} from './supervisores.js';

window.renderSupervisores = renderSupervisores;
window.actualizarPctSupervisor = actualizarPctSupervisor;
window.toggleActivoSupervisor = toggleActivoSupervisor;
window.agregarSupervisorAlCatalogo = agregarSupervisorAlCatalogo;
