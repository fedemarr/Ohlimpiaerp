// Enfermos y Accidentes v1 — confidencialidad del diagnóstico
// (diseño §3.9/§9.2). El resto del módulo ya está gateado a
// ['Administrador total', 'RRHH', 'Operaciones'] por MENU/PERFILES —
// el único gate adicional acá es el CIE-10.

import { currentUser } from '@shared/state.js';

export function esRRHHoAdmin() {
  return ['RRHH', 'Administrador total'].includes(currentUser?.perfil);
}

export function puedeVerDiagnostico() {
  return esRRHHoAdmin();
}
