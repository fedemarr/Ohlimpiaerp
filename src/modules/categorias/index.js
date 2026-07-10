// Módulo Categorías v1 — Entry point (Etapas 1-4: catálogo, valores
// hora, plus adicionales, auditoría). Infraestructura transversal,
// sin consumidores todavía (Enfermos y Liquidaciones no están
// migrados) — ver consultas.js para la API que usarán más adelante.

import { $ } from '@shared/helpers.js';

export {
  renderCatalogoCategorias, activarDesactivarCategoriaPorId, verValoresDeCategoria,
  abrirNuevaCategoria, abrirEditarCategoria, guardarCategoriaDesdeModal,
  renderHistorialCategorias, filtrarHistorialCategorias, exportarHistorialCategoriasExcel,
} from './categorias.js';

export {
  poblarFiltrosMatrizValores, renderMatrizValores, filtrarMatrizValores,
  abrirCargarValor, abrirCorregirValor, abrirNuevaVigenciaValor, guardarValorDesdeModal,
  abrirHistorialValor, abrirCargaMasiva, confirmarCargaMasiva,
} from './valores.js';

export {
  renderPlusAdicionales, activarDesactivarPlusPorId,
  abrirCorregirPlus, abrirNuevaVigenciaPlus, guardarVersionPlusDesdeModal, abrirHistorialPlus,
} from './plus.js';

export {
  getCategoriaById, getPlusById, obtenerValorHoraVigente, obtenerValorPlusVigente,
  calcularValorEfectivo, obtenerCategoriaLegajo,
} from './consultas.js';

// ========== TABS ==========

import { renderCatalogoCategorias, renderHistorialCategorias } from './categorias.js';
import { poblarFiltrosMatrizValores, renderMatrizValores } from './valores.js';
import { renderPlusAdicionales } from './plus.js';

const RENDER_POR_TAB = {
  catalogo: renderCatalogoCategorias,
  valores: () => { poblarFiltrosMatrizValores(); renderMatrizValores(); },
  plus: renderPlusAdicionales,
  historial: renderHistorialCategorias,
};

export function tabCat(tab, btn) {
  document.querySelectorAll('#screen-categorias .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-categorias .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-categorias .tab-btn[data-cat-tab="${tab}"]`)?.classList.add('active');
  $('cat-tab-' + tab)?.classList.add('active');
  (RENDER_POR_TAB[tab] || (() => {}))();
}

function renderCategoriasInicial() {
  tabCat('catalogo');
}

// ========== SCREEN CONFIG ==========

import { abrirNuevaCategoria } from './categorias.js';

export const categoriasScreenConfig = {
  categorias: {
    title: 'Categorías',
    btn: '+ Nueva categoría',
    fn: () => window.abrirNuevaCategoria(),
    render: renderCategoriasInicial,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  activarDesactivarCategoriaPorId, verValoresDeCategoria, abrirEditarCategoria, guardarCategoriaDesdeModal,
  filtrarHistorialCategorias, exportarHistorialCategoriasExcel,
} from './categorias.js';
import {
  filtrarMatrizValores, abrirCargarValor, abrirCorregirValor, abrirNuevaVigenciaValor,
  guardarValorDesdeModal, abrirHistorialValor, abrirCargaMasiva, confirmarCargaMasiva,
} from './valores.js';
import {
  activarDesactivarPlusPorId, abrirCorregirPlus, abrirNuevaVigenciaPlus,
  guardarVersionPlusDesdeModal, abrirHistorialPlus,
} from './plus.js';

window.tabCat = tabCat;
window.abrirNuevaCategoria = abrirNuevaCategoria;
window.abrirEditarCategoria = abrirEditarCategoria;
window.verValoresDeCategoria = verValoresDeCategoria;
window.activarDesactivarCategoriaPorId = activarDesactivarCategoriaPorId;
window.guardarCategoriaDesdeModal = guardarCategoriaDesdeModal;
window.filtrarHistorialCategorias = filtrarHistorialCategorias;
window.exportarHistorialCategoriasExcel = exportarHistorialCategoriasExcel;

window.filtrarMatrizValores = filtrarMatrizValores;
window.abrirCargarValor = abrirCargarValor;
window.abrirCorregirValor = abrirCorregirValor;
window.abrirNuevaVigenciaValor = abrirNuevaVigenciaValor;
window.guardarValorDesdeModal = guardarValorDesdeModal;
window.abrirHistorialValor = abrirHistorialValor;
window.abrirCargaMasiva = abrirCargaMasiva;
window.confirmarCargaMasiva = confirmarCargaMasiva;

window.activarDesactivarPlusPorId = activarDesactivarPlusPorId;
window.abrirCorregirPlus = abrirCorregirPlus;
window.abrirNuevaVigenciaPlus = abrirNuevaVigenciaPlus;
window.guardarVersionPlusDesdeModal = guardarVersionPlusDesdeModal;
window.abrirHistorialPlus = abrirHistorialPlus;
