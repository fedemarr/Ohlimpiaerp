// Módulo Superadmin — Entry point

export {
  renderEmpresas, abrirNuevaEmpresa, abrirEditarEmpresa, guardarEmpresa, eliminarEmpresa,
} from './superadmin.js';

// ========== SCREEN CONFIG ==========

import { renderEmpresas } from './superadmin.js';

export const superadminScreenConfig = {
  empresas: {
    title: 'Empresas clientes',
    btn: '+ Nueva empresa',
    fn: () => { if (window.abrirNuevaEmpresa) window.abrirNuevaEmpresa(); },
    render: renderEmpresas,
  },
};

// ========== WINDOW BINDINGS ==========

import { abrirNuevaEmpresa, abrirEditarEmpresa, guardarEmpresa, eliminarEmpresa } from './superadmin.js';

window.renderEmpresas = renderEmpresas;
window.abrirNuevaEmpresa = abrirNuevaEmpresa;
window.abrirEditarEmpresa = abrirEditarEmpresa;
window.guardarEmpresa = guardarEmpresa;
window.eliminarEmpresa = eliminarEmpresa;
