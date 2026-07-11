// Enfermos y Accidentes v1 — wrapper delgado sobre el módulo
// Categorías (dependencia crítica: congela el valor hora vigente al
// momento de abrir el caso). Se importa directo como ES module — el
// diseño original asumía un global window.categoriasAPI que no existe;
// el módulo real (esta sesión) expone funciones vía
// src/modules/categorias/consultas.js, mismo patrón ya usado por
// Sanciones al importar registrarEvento desde competencia/movimientos.js.

import { obtenerValorHoraVigente, getCategoriaById } from '../categorias/consultas.js';

export function esAdministrativo(legajo) {
  return (legajo?.servicio || '').trim().toUpperCase() === 'ADMINISTRATIVO';
}

// Administrativos: cálculo económico pendiente de clarificar con Gabi
// (TODO explícito del diseño) — no bloquea, solo marca el caso.
// Operativos: si no hay valor hora vigente para categoría+servicio,
// devuelve null — el caller debe bloquear la apertura del caso.
export function congelarValorHora(legajo, categoriaIdLocal, fechaISO) {
  if (esAdministrativo(legajo)) {
    return { pendienteAdministrativo: true, valorHoraCongelado: null, valorHoraIdLocal: null };
  }
  const version = obtenerValorHoraVigente(categoriaIdLocal, legajo.servicio, fechaISO);
  if (!version) return null;
  return {
    pendienteAdministrativo: false,
    valorHoraCongelado: version.valorHora,
    valorHoraIdLocal: version.id,
    servicioAlIngreso: legajo.servicio,
  };
}

// Jornada estándar según nombre de categoría (diseño §8.2).
export function horasPorDia(categoriaIdLocal) {
  const cat = getCategoriaById(categoriaIdLocal);
  return cat?.nombre?.includes('Media Jornada') ? 4 : 8;
}

export { getCategoriaById };
