// Pedidos de Adelantos + Gestión de Adelantos — nomenclatura única de
// estados (PEDIDOS_ADELANTOS_para_Fede_2.md §1): "una sola nomenclatura
// en Pedidos, Gestión e Historial". Antes cada superficie tenía su
// propio mapa de labels (pedidos.js y historico.js duplicaban
// ESTADO_BADGE con textos distintos: "Pendiente de pago"/"Pagado" en
// una, el nombre interno crudo en la otra) — fuente única acá.
//
// El valor real de p.estado (Borrador/Enviada/Aprobada RRHH/Aprobada/
// Rechazada RRHH/Rechazada Finanzas/Cancelada) NO cambia — sigue siendo
// lo que persiste flujo.js y lo que filtran las queries de cada tab.
// Esto es solo la etiqueta que ve el usuario, mapeada a los 4 estados
// del circuito (PENDIENTE → APROBADO/RECHAZADO → DEPOSITADO) + los 2
// que quedan fuera de ese circuito (Borrador, previo a elevar; Devuelto
// por Finanzas, transitorio hasta que RRHH lo re-decide).
export const ESTADO_LABEL = {
  'Borrador': 'Borrador',
  'Enviada': 'PENDIENTE',
  'Aprobada RRHH': 'APROBADO',
  'Aprobada': 'DEPOSITADO',
  'Rechazada RRHH': 'RECHAZADO',
  'Rechazada Finanzas': 'Devuelto por Finanzas',
  'Cancelada': 'Cancelado',
};

export const ESTADO_BADGE = {
  'Borrador': 'badge-gris',
  'Enviada': 'badge-naranja',
  'Aprobada RRHH': 'badge-azul',
  'Aprobada': 'badge-verde',
  'Rechazada RRHH': 'badge-rojo',
  'Rechazada Finanzas': 'badge-naranja',
  'Cancelada': 'badge-gris',
};

export function labelEstado(estado) { return ESTADO_LABEL[estado] || estado; }

export function badgeEstado(estado, extra = '') {
  return `<span class="badge ${ESTADO_BADGE[estado] || 'badge-gris'}">${labelEstado(estado)}</span>${extra}`;
}
