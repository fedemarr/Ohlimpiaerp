// Color por proveedor — determinístico, sin campo nuevo en Supabase.
//
// Ticket "Colores/badges de proveedores" (05/09): el catálogo pintaba TODOS
// los proveedores con el mismo celeste hardcodeado (#0ea5e9), así que no
// servían para distinguir de un vistazo quién provee cada producto.
//
// Se mapea el id del proveedor a un índice fijo de una paleta por hash —
// mismo proveedor, mismo color, siempre (no depende del orden de carga ni
// de cuántos proveedores haya) — y escala solo: un proveedor nuevo cae en
// el color que le toque de la paleta sin tocar código. Si algún día hace
// falta elegir el color a mano por proveedor, ver
// src/shared/finflow/etiquetas-color.js (chipEtq) — ese sí lee un campo de
// color propio; acá no hace falta porque no hay ficha con ese campo.
//
// Reutiliza textoContraste() de finflow para el texto legible sobre cada
// fondo (mismo criterio de contraste ya usado en Precios/CRM) — no se
// duplica esa cuenta acá.

import { textoContraste } from '@shared/finflow/etiquetas-color.js';

// 10 colores con buen contraste (fondo suficientemente oscuro/saturado
// para que textoContraste() elija texto claro en todos, y suficientemente
// distintos entre sí a simple vista — paleta categórica estándar, no
// gradiente).
const PALETA_PROVEEDOR = [
  '#0ea5e9', '#dc2626', '#16a34a', '#a855f7', '#d97706',
  '#0b6470', '#be123c', '#4f46e5', '#15803d', '#a04a08',
];

function _hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

// id o nombre del proveedor -> color hex de la paleta. Determinístico:
// misma entrada, mismo color, siempre — no importa el orden de renderizado.
export function colorProveedorPP(idOnombre) {
  const key = String(idOnombre || '');
  if (!key) return '#94a3b8'; // gris neutro — "sin proveedor asignado"
  return PALETA_PROVEEDOR[_hash(key) % PALETA_PROVEEDOR.length];
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Badge listo para insertar en un render — mismo color en Catálogo y en
// Sugerencias (y cualquier otra pantalla que lo use), sin duplicar la
// cuenta de color/contraste en cada lugar. Sin proveedor -> "" (celda
// vacía, no un badge gris que confunda "no tiene" con "es de este color").
export function badgeProveedorPP(proveedor) {
  if (!proveedor || !proveedor.nombre) return '';
  const bg = colorProveedorPP(proveedor.id != null ? proveedor.id : proveedor.nombre);
  return `<span class="badge" style="background:${bg};color:${textoContraste(bg)};font-size:10.5px;">${esc(proveedor.nombre)}</span>`;
}
