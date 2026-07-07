import { DB, PERFILES, MENU, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { activarOrdenamiento } from '@shared/ui.js';

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
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
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
  MENU.forEach(sec => {
    const items = sec.items.filter(i => esDeveloper
      ? (perfil && perfil.modulos.includes(i.key))
      : (i.disabled || !perfil || perfil.modulos.includes(i.key)));
    if (!items.length) return;
    const sDiv = document.createElement('div');
    sDiv.className = 'nav-section';
    sDiv.textContent = sec.section;
    nav.appendChild(sDiv);
    items.forEach(item => {
      const tieneAcceso = !item.disabled && perfil && perfil.modulos.includes(item.key);
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
