// Uniformes v2 — permisos y resolución de destinatarios por rol.
// A diferencia de Vacaciones/Descansos (roles unipersonales, Gerente
// mockeado por nombre fijo), acá RRHH/Logística/Supervisor pueden ser
// varias personas reales — se resuelven contra DB.usuarios (cargado
// completo al login, src/shared/auth.js:cargarListaUsuarios()).

import { DB, currentUser } from '@shared/state.js';

export function nombresPorPerfil(perfil) {
  return (DB.usuarios || []).filter(u => u.perfil === perfil && u.activo).map(u => u.nombre);
}

export function esRRHHoAdmin() {
  return ['RRHH', 'Administrador total'].includes(currentUser?.perfil);
}

export function esLogistica() {
  return ['Logística', 'Administrador total'].includes(currentUser?.perfil);
}

export function esSupervisor() {
  return currentUser?.perfil === 'Supervisor';
}
