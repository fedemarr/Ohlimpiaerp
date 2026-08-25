// Módulo Proveedores — entry point (v100)
// Re-exports, screenConfig, window bindings.

export {
  renderProveedores, filtrarProveedores,
  verProveedor, volverProveedores,
  abrirModalProveedor, guardarProveedor, bajaProveedor, reactivarProveedor,
  abrirModalProvContacto, guardarProvContacto, borrarProvContacto,
  poblarRolesProvContacto,
} from './proveedores.js';

import {
  renderProveedores, filtrarProveedores,
  verProveedor, volverProveedores,
  abrirModalProveedor, guardarProveedor, bajaProveedor, reactivarProveedor,
  abrirModalProvContacto, guardarProvContacto, borrarProvContacto,
  poblarRolesProvContacto,
} from './proveedores.js';

export const proveedoresScreenConfig = {
  proveedores: {
    title: 'Proveedores',
    btn: '+ Alta de proveedor',
    fn: () => abrirModalProveedor(),
    render: () => renderProveedores(),
  },
};

window.renderProveedores = renderProveedores;
window.filtrarProveedores = filtrarProveedores;
window.verProveedor = verProveedor;
window.volverProveedores = volverProveedores;
window.abrirModalProveedor = abrirModalProveedor;
window.guardarProveedor = guardarProveedor;
window.bajaProveedor = bajaProveedor;
window.reactivarProveedor = reactivarProveedor;
window.abrirModalProvContacto = abrirModalProvContacto;
window.guardarProvContacto = guardarProvContacto;
window.borrarProvContacto = borrarProvContacto;
window.poblarRolesProvContacto = poblarRolesProvContacto;
