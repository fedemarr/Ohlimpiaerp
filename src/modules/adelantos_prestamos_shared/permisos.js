// Pedidos de Adelantos + Gestión de Adelantos v1.1 — helpers de rol,
// compartidos entre las dos superficies (mismos datos, roles
// distintos). Mismo patrón duplicado-por-módulo del resto de la
// sesión, pero acá SÍ se comparte entre pedidos_adelantos y
// gestion_adelantos porque son, literalmente, el mismo delta.

import { currentUser } from '@shared/state.js';

export function esSupervisor() {
  return currentUser?.perfil === 'Supervisor';
}

// "Central de Operaciones" en el lenguaje del delta = perfil
// Operaciones: ve pedidos de todos los operarios, no solo su equipo.
export function esCentralOperaciones() {
  return currentUser?.perfil === 'Operaciones';
}

export function esRRHHoAdmin() {
  return ['RRHH', 'Administrador total'].includes(currentUser?.perfil);
}

export function esFinanzasOAdmin() {
  return ['Finanzas', 'Administrador total'].includes(currentUser?.perfil);
}
