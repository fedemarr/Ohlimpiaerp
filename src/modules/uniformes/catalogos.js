// Uniformes v2 — catálogos fijos (DISENO_uniformes.md §4.4).

export const ESTADOS_UNIFORMES = [
  'Borrador',
  'Pendiente autorización RRHH',
  'Autorizado por RRHH, esperando envío a Logística',
  'En preparación por Logística',
  'Enviado por Logística, esperando confirmación RRHH',
  'Recibido por RRHH, listo para retirar Supervisor',
  'Retirado por Supervisor, esperando confirmación Supervisor',
  'Confirmado por Supervisor, en tránsito a operario',
  'Entregado al operario con firma, esperando constancia + viejo',
  'Constancia + viejo entregados por Supervisor, esperando confirmación RRHH',
  'Cerrado',
  'Rechazado por RRHH',
  'Cancelado por Solicitante',
  'Vencido',
  'Descuento aplicado por incumplimiento',
];

export const ESTADOS_FINALES = ['Cerrado', 'Rechazado por RRHH', 'Cancelado por Solicitante', 'Descuento aplicado por incumplimiento'];

export const PRENDAS = ['Chomba', 'Grafa', 'Ambo', 'Polar', 'Campera', 'Zapatos'];

export const TALLES_POR_PRENDA = {
  Chomba: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'],
  Ambo: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'],
  Polar: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'],
  Campera: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'],
  Grafa: ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60', '62'],
  Zapatos: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
};

export const MOTIVOS_SIN_DESCUENTO = ['Ingreso', 'Segunda muda', 'Renovación', 'Reubicación', 'Robo con denuncia', 'Camperas-Polar-Calzado inicial'];
export const MOTIVOS_CON_DESCUENTO = ['Pedido extra', 'Daño o extravío'];
export const MOTIVOS = [...MOTIVOS_SIN_DESCUENTO, ...MOTIVOS_CON_DESCUENTO];
export const ORIGENES = ['Supervisor', 'Auditoría', 'Asociado directo', 'RRHH - Ingreso'];

export function conDescuentoSegunMotivo(motivo) {
  return MOTIVOS_CON_DESCUENTO.includes(motivo);
}

// Camperas/Polar: única entrega inicial marzo-septiembre (política A.11 §1.4).
export function esTemporadaCamperaPolar(fecha = new Date()) {
  const mes = fecha.getMonth() + 1;
  return mes >= 3 && mes <= 9;
}

// Talle propuesto desde el legajo, con fallback a los campos existentes
// ambo/calzado (el legajo no tiene talles_uniforme cargado todavía en
// la mayoría de los casos — sin backfill SQL, ver v032).
export function talleSugerido(legajo, prenda) {
  const guardado = legajo?.tallesUniforme?.[prenda.toLowerCase()];
  if (guardado) return guardado;
  if (prenda === 'Ambo') return legajo?.ambo || '';
  if (prenda === 'Zapatos') return legajo?.calzado ? String(legajo.calzado) : '';
  return '';
}
