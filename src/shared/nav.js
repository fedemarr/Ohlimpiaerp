import { DB, PERFILES, MENU, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { activarOrdenamiento, toast } from '@shared/ui.js';

// Multi-empresa (18/08/2026): qué módulos le vendiste a la empresa de
// ESTE deploy — ver src/modules/superadmin/ para el registro de todas.
// Sin esta variable configurada (caso de Ohlimpia hoy), MODULOS_CONTRATADOS
// queda null y no restringe nada — el menú se arma solo con PERFILES,
// exactamente como siempre. Solo los deploys de empresas clientes nuevas
// necesitan setear VITE_MODULOS_CONTRATADOS (lista separada por comas de
// las mismas keys que usa MENU, ej. "legajos,liquidacion,liq_admin").
export const MODULOS_CONTRATADOS = import.meta.env.VITE_MODULOS_CONTRATADOS
  ? import.meta.env.VITE_MODULOS_CONTRATADOS.split(',').map(s => s.trim()).filter(Boolean)
  : null;

// ========== SCREEN CONFIG ==========
// Se registra desde fuera con registerScreens() porque las funciones render/fn
// pertenecen a módulos que aún no están migrados.

export const SCREEN_CONFIG = {};

export function registerScreens(screens) {
  Object.assign(SCREEN_CONFIG, screens);
}

// ========== ESTADO DE NAVEGACIÓN ==========

let currentTopFn = null;
export let currentScreen = '';

// ========== NAVEGACIÓN ==========

// Callback para poblarFiltrosColumnas — se registra desde fuera
let _poblarFiltrosColumnas = () => {};

export function registerNavCallbacks(cbs) {
  if (cbs.poblarFiltrosColumnas) _poblarFiltrosColumnas = cbs.poblarFiltrosColumnas;
}

export function navTo(sec, el) {
  // Multi-empresa: bloquear acá, no solo en construirMenu(). Las tarjetas
  // de acceso directo del Inicio (renderInicio, legacy.js) navegan con
  // navTo() directo, sin pasar por el sidebar — sin este chequeo, el
  // filtro de módulos contratados se podía saltear con un click ahí.
  if (sec !== 'inicio' && MODULOS_CONTRATADOS && !MODULOS_CONTRATADOS.includes(sec)) {
    console.warn('navTo: módulo "' + sec + '" no contratado para esta empresa — navegación bloqueada');
    toast('⚠️ Este módulo no está disponible en tu plan');
    return;
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  // OJO: NO tocar .tab-content acá. Antes se le sacaba "active" a las
  // pestañas de TODOS los módulos en cada navegación, pero como cada
  // módulo pone su propia clase "active" en sus pestañas al click (no acá),
  // el resultado era que la pantalla quedaba con datos cargados pero sin
  // ninguna pestaña visible hasta que el usuario clickeaba una a mano
  // (bug reportado en Reasignaciones y Vacaciones). Es seguro no tocarlo:
  // .screen:not(.active) ya está display:none, así que no hay bleed-through
  // de pestañas de pantallas ocultas.
  const screenEl = $('screen-' + sec);
  if (screenEl) screenEl.classList.add('active');
  if (el) el.classList.add('active');
  else {
    document.querySelectorAll('.nav-item').forEach(n => {
      if (n.textContent.trim().startsWith(SCREEN_CONFIG[sec]?.title?.slice(0, 6) || '?'))
        n.classList.add('active');
    });
  }
  const cfg = SCREEN_CONFIG[sec];
  if (!cfg) return;
  $('topbar-title').textContent = cfg.title;
  const btn = $('btn-top');
  btn.textContent = cfg.btn;
  btn.style.display = cfg.btn ? 'inline-flex' : 'none';
  currentTopFn = cfg.fn;
  currentScreen = sec;
  cfg.render();
  setTimeout(() => { activarOrdenamiento(); _poblarFiltrosColumnas(); }, 50);
}

export function topAction() {
  if (currentTopFn) currentTopFn();
}

// ========== MENÚ DINÁMICO SEGÚN PERFIL ==========

export function construirMenu() {
  const nav = $('sidebar-nav');
  nav.innerHTML = '';
  const perfil = PERFILES[currentUser.perfil];
  if (!perfil) console.warn('construirMenu: no se encontró PERFILES["' + currentUser.perfil + '"] — revisar el campo perfil del usuario');
  // El perfil DEVELOPER solo ve sus propias 4 secciones — nada más del ERP,
  // ni siquiera los placeholders "Próximamente" que ven todos los demás.
  const esDeveloper = currentUser.perfil === 'DEVELOPER';
  // Además del perfil, tiene que estar entre los módulos contratados de
  // esta empresa (MODULOS_CONTRATADOS null = sin restricción, caso de
  // Ohlimpia hoy). Los ítems deshabilitados ("Próximamente") no se filtran
  // por contrato — son placeholders sin funcionalidad real detrás. 'inicio'
  // tampoco se filtra — es la pantalla de bienvenida, no algo vendible (por
  // eso ni aparece como checkbox en el alta de empresa, ver superadmin.js).
  const contratado = key => key === 'inicio' || !MODULOS_CONTRATADOS || MODULOS_CONTRATADOS.includes(key);
  MENU.forEach(sec => {
    const items = sec.items.filter(i => esDeveloper
      ? (perfil && perfil.modulos.includes(i.key) && contratado(i.key))
      : (i.disabled || !perfil || (perfil.modulos.includes(i.key) && contratado(i.key))));
    if (!items.length) return;
    const sDiv = document.createElement('div');
    sDiv.className = 'nav-section';
    sDiv.textContent = sec.section;
    nav.appendChild(sDiv);
    items.forEach(item => {
      const tieneAcceso = !item.disabled && perfil && perfil.modulos.includes(item.key) && contratado(item.key);
      const div = document.createElement('div');
      div.className = 'nav-item' + (item.disabled || !tieneAcceso ? ' disabled' : '');
      const badgeCount =
        item.badge === 'legal' ? DB.casosLegales.filter(c => c.estado !== 'Cerrado').length :
        item.badge === 'enf' ? DB.enfermos.filter(e => e.estado === 'Activo — sin trabajar').length :
        item.badge === 'reas' ? (DB.reasignaciones || []).filter(r => r.estado === 'Pendiente').length :
        item.badge === 'crm' ? (DB.leads || []).filter(l => l.etapa !== 'Cerrado ganado' && l.etapa !== 'Cerrado perdido').length :
        item.badge === 'rec' ? (DB.reclamos || []).filter(r => r.estado === 'Abierto').length :
        item.badge === 'prec' ? (DB.propuestasPrecios || []).filter(p => p.estado === 'Pendiente aprobación gerente').length :
        item.badge === 'par' ? (DB.paritarias || []).filter(p => p.homologada && p.estadoAplicacion === 'Sin aplicar').length :
        item.badge === 'liqh' ? (DB.alertasLiquidacion || []).filter(a => !a.resuelta).length :
        0;
      div.innerHTML = `<span class="icon">${item.icon}</span>${item.label}${badgeCount ? `<span class="nav-badge">${badgeCount}</span>` : ''}`;
      if (!item.disabled && tieneAcceso) div.onclick = () => navTo(item.key, div);
      nav.appendChild(div);
    });
  });
}

// ========== BUSCADOR GLOBAL ==========

// Callbacks de filtrado por módulo — se registran desde fuera
const _filtros = {};

export function registerSearchFilters(filters) {
  Object.assign(_filtros, filters);
}

export function busquedaGlobal() {
  const val = ($('buscador-global') || { value: '' }).value.toLowerCase();
  if (!val) return;
  const fn = _filtros[currentScreen];
  if (fn) fn();
}
