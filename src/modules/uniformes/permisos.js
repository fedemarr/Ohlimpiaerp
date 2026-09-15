// Uniformes v2 — permisos y resolución de destinatarios por rol.
// A diferencia de Vacaciones/Descansos (roles unipersonales, Gerente
// mockeado por nombre fijo), acá RRHH/Logística/Supervisor pueden ser
// varias personas reales — se resuelven contra DB.usuarios (cargado
// completo al login, src/shared/auth.js:cargarListaUsuarios()).

import { DB, currentUser } from '@shared/state.js';
import { puedeModificar } from '@modules/accesos/runtime.js';

export function nombresPorPerfil(perfil) {
  return (DB.usuarios || []).filter(u => u.perfil === perfil && u.activo).map(u => u.nombre);
}

// FIX (ticket "Uniformes — permiso editable no se aplicaba", 15/09): las
// 3 funciones de abajo solo miraban currentUser.perfil, ignorando por
// completo la Matriz de Accesos (src/modules/accesos/, v098) — un
// usuario con perfil que NO es Logística/RRHH/Supervisor/Admin pero al
// que Accesos y perfiles le da "Editable" para Uniformes (plantilla del
// perfil, o un override individual — ver puedeModificar()) quedaba
// mostrando la Bandeja pendiente en modo lectura sin ninguna acción,
// pese a que la UI de administración decía "editable". Se agrega el
// chequeo de la matriz como OR — nunca le saca acceso a nadie que ya lo
// tenía por perfil, solo lo suma para quien la matriz habilita.
function _tieneEditableUniformesPorMatriz() {
  return puedeModificar('uniformes', currentUser?.perfil, currentUser?.id);
}

export function esRRHHoAdmin() {
  return ['RRHH', 'Administrador total'].includes(currentUser?.perfil) || _tieneEditableUniformesPorMatriz();
}

export function esLogistica() {
  return ['Logística', 'Administrador total'].includes(currentUser?.perfil) || _tieneEditableUniformesPorMatriz();
}

export function esSupervisor() {
  return currentUser?.perfil === 'Supervisor' || _tieneEditableUniformesPorMatriz();
}
