// Módulo Supervisores — Entry point

export {
  renderSupervisores, toggleActivoSupervisor, eliminarSupervisor,
  agregarSupervisorAlCatalogo, poblarSelectNuevoSupervisor,
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
  toggleActivoSupervisor, eliminarSupervisor, agregarSupervisorAlCatalogo,
} from './supervisores.js';

window.renderSupervisores = renderSupervisores;
window.toggleActivoSupervisor = toggleActivoSupervisor;
window.eliminarSupervisor = eliminarSupervisor;
window.agregarSupervisorAlCatalogo = agregarSupervisorAlCatalogo;
