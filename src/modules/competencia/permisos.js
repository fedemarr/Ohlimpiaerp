// Competencia Anual v2 — permisos y resolución de destinatarios por rol.
// Mismo patrón que src/modules/uniformes/permisos.js — cada módulo tiene
// el suyo, no se importa cross-módulo.

import { DB, currentUser } from '@shared/state.js';

export function nombresPorPerfil(perfil) {
  return (DB.usuarios || []).filter(u => u.perfil === perfil && u.activo).map(u => u.nombre);
}

export function esRRHHoAdmin() {
  return ['RRHH', 'Administrador total'].includes(currentUser?.perfil);
}

export function esSupervisor() {
  return currentUser?.perfil === 'Supervisor';
}
