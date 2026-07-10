// Sanciones v1 — permisos y resolución de aprobadores. Mismo patrón
// que src/modules/vacaciones/permisos.js y src/modules/descansos/
// permisos.js (mock temporal con placeholders editables, "placeholders
// por ahora, los edito yo cuando tenga la lista definitiva") — cada
// módulo tiene el suyo, no se cruza-importa entre módulos. Se
// duplican acá los mismos valores ya en producción en esos dos
// archivos para que todo el sistema hable de la misma gente.

import { DB, currentUser } from '@shared/state.js';

// TODO: reemplazar cada valor por el nombre real del Gerente de ese
// sector (mismo TODO que ya existe en vacaciones/permisos.js).
const MOCK_GERENTES = {
  'Consejo de Administración': '[Gerente Consejo de Administración]',
  'Coord. General': '[Gerente Coord. General]',
  'Coord. RRHH': '[Gerente Coord. RRHH]',
  'Coord. Operaciones y Planeamiento': '[Gerente Coord. Operaciones y Planeamiento]',
  'Coord. Calidad': '[Gerente Coord. Calidad]',
  'Coord. Logística y Distribución': '[Gerente Coord. Logística y Distribución]',
  'Coord. Marketing y Ventas': '[Gerente Coord. Marketing y Ventas]',
  'Coord. Administración y Finanzas': '[Gerente Coord. Administración y Finanzas]',
};

// TODO: reemplazar por el nombre real del Gerente de Operaciones.
const MOCK_GERENTE_OPERACIONES = '[Gerente de Operaciones]';

// Nombre real, ya en uso en descansos/permisos.js.
const MOCK_GERENTE_RRHH = 'Gabriela Lucero';

function esAdministrativo(legajo) {
  return (legajo?.servicio || '').trim().toUpperCase() === 'ADMINISTRATIVO';
}

// El "Gerente responsable" de un legajo: Gerente de Operaciones si es
// operativo, Gerente del sector si es administrativo (política §1.4,
// aclaración nivel 1).
export function gerenteResponsable(legajo) {
  if (!legajo) return null;
  if (esAdministrativo(legajo)) return MOCK_GERENTES[legajo.sector] || null;
  return MOCK_GERENTE_OPERACIONES;
}

export function esGerenteResponsable(nombre, legajo) {
  return !!nombre && gerenteResponsable(legajo) === nombre;
}

export function esGerenteRRHH(nombre) {
  return !!nombre && MOCK_GERENTE_RRHH === nombre;
}

export function nombreGerenteRRHH() {
  return MOCK_GERENTE_RRHH;
}

export function esSupervisor() {
  return currentUser?.perfil === 'Supervisor';
}

export function esRRHHoAdmin() {
  return ['RRHH', 'Administrador total'].includes(currentUser?.perfil);
}

export function nombresPorPerfil(perfil) {
  return (DB.usuarios || []).filter(u => u.perfil === perfil && u.activo).map(u => u.nombre);
}
