// Uniformes v2 — catálogos fijos (DISENO_uniformes.md §4.4).

import { DB } from '@shared/state.js';

// FIX (ticket "Mejoras del módulo de uniformes", mockup solicitud_uniformes
// 5, 02/09): se saca RRHH del circuito operativo — confirmado por el
// solicitante ("la política ya validó sola, va directo a Logística"). Antes
// había 3 idas y vueltas con RRHH en el medio (autorizar el envío a
// Logística, confirmar que Logística lo recibió, entregarlo al Supervisor);
// ahora Logística prepara y avisa directo al Supervisor, y también recibe
// la devolución de constancia+viejo y cierra el pedido (antes lo hacía
// RRHH — tiene más sentido que quien maneja el depósito físico sea quien
// cierra, ya que RRHH deja de ser parte del traspaso).
export const ESTADOS_UNIFORMES = [
  'Borrador',
  'Enviado, esperando preparación de Logística',
  'En preparación por Logística',
  'Listo para retiro',
  'Retirado por Supervisor, en tránsito a operario',
  'Entregado al operario con firma, esperando constancia + viejo',
  'Constancia + viejo entregados, esperando cierre de Logística',
  'Cerrado',
  'Cancelado por Solicitante',
  'Vencido',
  'Descuento aplicado por incumplimiento',
];

export const ESTADOS_FINALES = ['Cerrado', 'Cancelado por Solicitante', 'Descuento aplicado por incumplimiento'];

// Puntos de retiro (mockup: "el punto de retiro viaja con el pedido").
export const PUNTOS_RETIRO = ['Recepción', 'Depósito Maure'];

// + Buzo, Gorra (ticket "Uniforme" de Altas, 08/2026): faltaban en el
// catálogo — el resto de las prendas pedidas (Chomba, Grafa/pantalón,
// Campera) ya estaban acá.
// + Remera (ticket "Stock de uniformes — talles, mínimos y precios",
// 26/08): el import de stock inicial la dejó afuera del catálogo a
// propósito porque llegó en 0 unidades (sin relevar), pero el tab
// Precios nuevo la necesita como fila propia desde el día uno — el
// ticket pide explícitamente "cargar los precios... y Remera cuando
// corresponda" y el mockup la muestra con alarma de "sin precio
// vigente". Talles asumidos S..5XL como Chomba/Ambo/Polar/Campera/Buzo
// (no hay dato real todavía — no hay stock que valide otra cosa).
export const PRENDAS = ['Chomba', 'Grafa', 'Ambo', 'Polar', 'Campera', 'Zapatos', 'Buzo', 'Gorra', 'Remera'];

// Notación de talles unificada a S/M/L/XL/2XL/3XL/4XL/5XL (ticket "Stock
// inicial de uniformes", 08/2026): antes esta lista usaba XXL/XXXL/XXXXL
// (7 talles) mientras el select de "Talle de ambo" en Altas/Documentación
// ya usaba S..XL,XXL,XXXL,4XL,5XL (8 talles, notación mixta) — dos
// convenciones para lo mismo. El inventario físico real (stock inicial,
// relevado por Logística 14/08/2026) llega en notación numérica pura
// hasta 5XL para Buzo y Ambo, así que se adopta esa como única convención
// y se extiende a Chomba/Polar/Campera para no tener una tercera lista.
export const TALLES_POR_PRENDA = {
  Chomba: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
  Ambo: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
  Polar: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
  Campera: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
  Buzo: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
  Remera: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
  // Grafa ya venía de 2 en 2 desde antes de este ticket (era la duda que
  // planteaba: "verificar si van de 2 en 2 o de 1 en 1") — se mantiene
  // el mismo criterio ya usado acá, no uno nuevo.
  Grafa: ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60', '62'],
  Zapatos: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  // Talle único: se modela como una lista de una sola opción (en vez de
  // un caso especial en cada pantalla que lee TALLES_POR_PRENDA) — así
  // Gorra funciona igual que cualquier otra prenda en los selects
  // existentes (Uniformes → Precios/Pedidos) sin código nuevo ahí.
  Gorra: ['Único'],
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

// Cuotas de descuento — parametrizable (mockup: "cantidad de cuotas
// parametrizable en Configuración, hoy 4"). Mismo patrón que
// pedidosConfig/stockConfig: clave/valor editable directo en la tabla
// mientras no tenga pantalla propia (uniformes_config, v112).
export function cuotasDescuento() {
  const fila = (DB.uniformesConfig || []).find(c => c.clave === 'cuotas_descuento');
  const n = fila ? parseInt(fila.valor, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 4;
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
