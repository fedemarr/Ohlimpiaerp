// Wrappers sobre el sistema global de permisos y facultades — que
// TODAVÍA NO EXISTE en el proyecto (DISENO_descansos.md §11.2 ya lo
// anticipaba). Mock temporal con placeholders editables, mismo criterio
// que src/modules/vacaciones/permisos.js.
//
// TODO: reemplazar por el sistema global de permisos y facultades cuando
// exista. El punto de reemplazo son estas 2 funciones exportadas.

// TODO: reemplazar por el nombre real del Gerente de Operaciones.
const MOCK_GERENTE_OPERACIONES = '[Gerente de Operaciones]';

// Nombre real dado por el propio diseño (DISENO_descansos.md §11.2).
const MOCK_GERENTE_RRHH = 'Gabriela Lucero';

export function esGerenteDeOperaciones(nombre) {
  return !!nombre && MOCK_GERENTE_OPERACIONES === nombre;
}

export function esGerenteDeRRHH(nombre) {
  return !!nombre && MOCK_GERENTE_RRHH === nombre;
}

export function nombreGerenteOperaciones() {
  return MOCK_GERENTE_OPERACIONES;
}

export function nombreGerenteRRHH() {
  return MOCK_GERENTE_RRHH;
}
