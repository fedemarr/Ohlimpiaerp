// Módulo Acceso y perfiles (tab dentro de Configuración, no es screen propia:
// no registra screenConfig — la engancha legacy.js en cfgTab('usuarios-cfg')).

export * from './runtime.js';
export {
  renderTabAccesosPerfiles,
  renderMatriz,
  renderGrillaUsuario,
  poblarSelectUsuariosAccesos,
  poblarFormAltaUsuario,
} from './accesos.js';
export { MODULOS_ACCESOS, COLUMNAS_MATRIZ, MATRIZ_SEED } from './catalogo.js';

import {
  renderTabAccesosPerfiles,
} from './accesos.js';

// Bindings para onclick inline del HTML generado.
window.renderTabAccesosPerfiles = renderTabAccesosPerfiles;
