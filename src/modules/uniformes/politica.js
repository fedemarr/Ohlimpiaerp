// Uniformes v2 — motor de política automática (ticket "Mejoras del módulo
// de uniformes", mockup solicitud_uniformes 5, 02/09). Confirmado por el
// solicitante: la política se calcula sola contra el historial real de
// entregas, no queda a criterio del supervisor.
//
// NO reemplaza conDescuentoSegunMotivo() (catalogos.js) — esa sigue siendo
// la fuente de verdad de qué motivo carga descuento. Esto es una CAPA DE
// AYUDA: calcula el historial real por legajo+prenda y (a) sugiere el
// motivo más probable, (b) avisa si lo que el supervisor cargó contradice
// lo que el historial indica — no bloquea, el supervisor puede igual elegir
// "Pedido extra"/"Daño o extravío" con descuento aunque técnicamente le
// tocaría gratis (ej. quiere una segunda unidad).

import { DB, currentUser } from '@shared/state.js';
import { serviciosDeSupervisor } from '@modules/servicios_supervisor/index.js';
import { esMismoSupervisor } from '@modules/supervision/supervision.js';
import { prendasDelPedido } from './flujo.js';

// Prendas de renovación periódica (cada 6 meses, política A.11 §1.4).
const PRENDAS_RENOVACION = ['Ambo', 'Chomba', 'Grafa', 'Buzo', 'Gorra', 'Remera'];
const MESES_RENOVACION = 6;
// Prendas que solo se entregan SIN CARGO la primera vez (mockup: Campera,
// Calzado de seguridad — acá "Zapatos" es el nombre real del catálogo).
const PRENDAS_PRIMERA_VEZ = ['Campera', 'Zapatos'];

function pedidosCerradosDelLegajo(legajoNro) {
  return (DB.pedidosUniformes || []).filter(p => !p.anulado && p.estado === 'Cerrado' && String(p.legajoIdLocal) === String(legajoNro));
}

// Última entrega CERRADA de una prenda a este legajo — null si nunca se le
// entregó. La fecha de referencia es fechaEntregaOperario (cuándo la tuvo
// en la mano, no cuándo se pidió).
export function ultimaEntregaDe(legajoNro, prenda) {
  const conEsaPrenda = pedidosCerradosDelLegajo(legajoNro)
    .filter(p => prendasDelPedido(p.id).some(pr => pr.prenda === prenda))
    .sort((a, b) => new Date(b.fechaEntregaOperario || b.fechaSolicitud) - new Date(a.fechaEntregaOperario || a.fechaSolicitud));
  const ultimo = conEsaPrenda[0];
  if (!ultimo) return null;
  return { fecha: ultimo.fechaEntregaOperario || ultimo.fechaSolicitud, sinCargo: !ultimo.conDescuento };
}

// Chip informativo por prenda (mockup §2: "✔ DISPONIBLE — última muda...",
// "Campera: Ya entregada... → CON DESCUENTO"). null = prenda sin regla
// especial (ej. Gafas de seguridad, sin ventana ni tope de unidades).
export function hintPoliticaPrenda(legajoNro, prenda) {
  if (PRENDAS_PRIMERA_VEZ.includes(prenda)) {
    const previa = ultimaEntregaDe(legajoNro, prenda);
    if (!previa) return { ok: true, texto: `Nunca entregada · SIN CARGO` };
    return { ok: false, texto: `Ya entregada ${(previa.fecha || '').slice(0, 10)} (única sin cargo) → CON DESCUENTO` };
  }
  if (PRENDAS_RENOVACION.includes(prenda)) {
    const previa = ultimaEntregaDe(legajoNro, prenda);
    if (!previa) return { ok: true, texto: `Sin entregas previas · SIN CARGO` };
    const meses = (Date.now() - new Date(previa.fecha).getTime()) / (30.44 * 24 * 3600 * 1000);
    if (meses >= MESES_RENOVACION) return { ok: true, texto: `Renovación disponible ✔ (última ${(previa.fecha || '').slice(0, 10)})` };
    return { ok: false, texto: `Renovada hace ${Math.floor(meses)} mes(es) — recién a los ${MESES_RENOVACION} meses` };
  }
  return null;
}

// Sugerencia de motivo según historial — no fuerza, el supervisor puede
// elegir otro. Si alguna prenda seleccionada "no le toca todavía" (ok:
// false), no sugiere nada: que decida a mano (Pedido extra / Daño).
export function sugerirMotivo(legajoNro, prendas) {
  if (!prendas || !prendas.length) return null;
  const hints = prendas.map(pr => hintPoliticaPrenda(legajoNro, pr.prenda)).filter(Boolean);
  if (hints.some(h => !h.ok)) return null;
  const esPrimeraVezPrimeraVez = prendas.some(pr => PRENDAS_PRIMERA_VEZ.includes(pr.prenda)) &&
    prendas.filter(pr => PRENDAS_PRIMERA_VEZ.includes(pr.prenda)).every(pr => !ultimaEntregaDe(legajoNro, pr.prenda));
  return esPrimeraVezPrimeraVez ? 'Camperas-Polar-Calzado inicial' : 'Renovación';
}

// "Mis asociados a cargo" (mockup: "el sistema arma la lista solo" según
// el usuario logueado). Un Supervisor ve solo los legajos de sus propios
// servicios; RRHH/Logística/Admin siguen viendo a todos (necesitan poder
// cargar por cualquier operario). Mismo criterio serviciosDeSupervisor()
// ya unificado en Pedidos de personal/Liquidación (26/08) — evita
// duplicar la lógica de "es mi supervisor" acá.
export function operariosParaSolicitante() {
  const activos = (DB.legajos || []).filter(l => l.estado === 'Activo');
  if (currentUser?.perfil !== 'Supervisor') return activos;
  const misCodigos = new Set(serviciosDeSupervisor(currentUser?.nombre || ''));
  return activos.filter(l => misCodigos.has(l.servicio) || esMismoSupervisor(l.supervisor, currentUser?.nombre));
}
