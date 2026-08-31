// Runtime de la Matriz de Accesos (v098) — funciones PURAS sobre DB global.
// Sin DOM: así se testea en vitest sin montar la app.
//
// Modelo:
//   nivel 2 = M (puede modificar) · 1 = L (solo lectura) · 0 = — (sin acceso)
//   Efectivo = override del usuario (usuario_accesos)
//              ?? plantilla del perfil (perfil_accesos, seed = planilla)
//              ?? fallback PERFILES[perfil].modulos (2 si está incluido).
//
// Los módulos que NO figuran en la matriz (agrupados como "OTROS" en
// modulosEfectivos) siguen sin plantilla de perfil — nivel de base
// PERFILES.modulos como siempre — pero SÍ admiten override individual por
// usuario (fix 31/08: "Pedido de personal" no se podía activar para Jimena
// porque el override se ignoraba para todo módulo fuera de la planilla).

import { DB, PERFILES, MENU } from '@shared/state.js';
import { MODULOS_ACCESOS } from './catalogo.js';

const _keysMatriz = new Set(MODULOS_ACCESOS.map(m => m.key));

/**
 * Lista de módulos para pintar las grillas: la planilla + todo módulo del
 * menú que no esté en ella (REGLAS #1 y #4: las columnas salen del registro
 * de módulos del sistema, no de una lista fija — un módulo nuevo aparece
 * solo, con acceso "—" por defecto para todos porque el fallback de
 * nivelAcceso() da 0 cuando nadie lo cubre).
 */
export function modulosEfectivos() {
  const vistos = new Set();
  const out = [];
  for (const m of MODULOS_ACCESOS) {
    if (vistos.has(m.key)) continue;
    vistos.add(m.key);
    out.push(m);
  }
  for (const sec of MENU) {
    for (const i of sec.items) {
      if (i.disabled || vistos.has(i.key)) continue;
      vistos.add(i.key);
      out.push({ key: i.key, label: i.label || i.key, area: 'OTROS', nota: 'Módulo fuera de la planilla — sin acceso por defecto (REGLAS #4).' });
    }
  }
  return out;
}

export function enMatriz(moduloKey) {
  return _keysMatriz.has(moduloKey);
}

export const NIVELES = { SIN: 0, LECTURA: 1, MODIFICAR: 2 };

export function etiquetaNivel(n) {
  if (n === 2) return 'M';
  if (n === 1) return 'L';
  return '—';
}

/** Mapa modulo_key → nivel para un perfil, según perfil_accesos. */
export function plantillaPerfil(perfil) {
  const map = new Map();
  for (const r of (DB.perfilAccesos || [])) {
    if (r.perfil === perfil && r.anulado !== true) map.set(r.moduloKey, r.nivel);
  }
  return map;
}

/** Mapa modulo_key → nivel con override individual del usuario. */
export function overridesUsuario(usuarioId) {
  const map = new Map();
  if (usuarioId == null) return map;
  for (const r of (DB.usuarioAccesos || [])) {
    if (String(r.usuarioId) === String(usuarioId)) map.set(r.moduloKey, r.nivel);
  }
  return map;
}

/**
 * Nivel efectivo de acceso a un módulo.
 * @param {string} moduloKey  clave interna del módulo (ej: 'liquidacion')
 * @param {string} perfil     nombre del perfil del usuario
 * @param {string|null} [usuarioId]  id (uuid) del usuario para overrides
 */
export function nivelAcceso(moduloKey, perfil, usuarioId = null) {
  // El override individual manda siempre, esté o no el módulo en la
  // planilla — si no, un módulo "Otros" (fuera de MODULOS_ACCESOS) nunca
  // podría tener acceso puntual por usuario (bug: ver "Pedido de personal"
  // agrupado en Otros, 31/08).
  const o = overridesUsuario(usuarioId).get(moduloKey);
  if (o !== undefined) return o;
  if (!enMatriz(moduloKey)) {
    const def = PERFILES[perfil];
    return def && def.modulos.includes(moduloKey) ? 2 : 0;
  }
  const p = plantillaPerfil(perfil).get(moduloKey);
  if (p !== undefined) return p;
  const def = PERFILES[perfil];
  return def && def.modulos.includes(moduloKey) ? 2 : 0;
}

/** ¿El usuario puede VER el módulo? (menú / navegación) */
export function puedeVer(moduloKey, perfil, usuarioId = null) {
  if (moduloKey === 'inicio') return true;
  return nivelAcceso(moduloKey, perfil, usuarioId) > 0;
}

/** ¿Puede MODIFICAR? Nivel 2. La lectura (L) permite ver pero no editar. */
export function puedeModificar(moduloKey, perfil, usuarioId = null) {
  return nivelAcceso(moduloKey, perfil, usuarioId) === 2;
}

/** ¿El perfil tiene al menos una fila en la matriz? Si no, todo su acceso
 *  viene del fallback PERFILES (perfiles "fuera de planilla": DEVELOPER,
 *  Superadmin, Asociado…). */
export function perfilCubiertoPorMatriz(perfil) {
  return (DB.perfilAccesos || []).some(r => r.perfil === perfil);
}

/** Siguiente nivel del ciclo M(2) → L(1) → —(0) → M(2). */
export function siguienteNivel(n) {
  return ((n || 0) + 2) % 3; // 2→1 · 1→0 · 0→2
}
