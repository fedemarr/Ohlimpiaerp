// Ohlimpia — Entry point

// ── Estilos ──
import './styles/main.css';

// ── Shared ──
import { SUPA, supaInit, supaSync, supaDel } from '@shared/supabase.js';
import { DB, PERFILES, MENU, BADGE_MAP, AREAS, LOCALIDADES_BA, currentUser } from '@shared/state.js';
import { $, initials, avatarEl, badge, formatPeriodo, hoyStr, esFeriado, esFinde, getDiasDelMes, calcularDiasEntre, toTitleCase, cleanText, applyTitleCase, validarCampos, fillSelect, fillDL } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, initModalClickOutside, makeTableSortable, activarOrdenamiento, activarOrdenamientoTabla, handleBuscadorKeydown } from '@shared/ui.js';
import { doLogin, loginDemo, iniciarSesion, doLogout, loginAsociado, initLoginKeydown, registerAuthCallbacks } from '@shared/auth.js';
import { SCREEN_CONFIG, registerScreens, currentScreen, navTo, topAction, construirMenu, busquedaGlobal, registerNavCallbacks, registerSearchFilters } from '@shared/nav.js';

// ── Módulos migrados ──
import { candidatosScreenConfig, filtrarCandidatos, poblarFiltrosColumnasCandidatos, renderCandidatos } from './modules/candidatos/index.js';
import { psicoScreenConfig, filtrarPsico, poblarFiltrosColumnasPsico, renderPsico } from './modules/psicotecnico/index.js';
import { altasScreenConfig, filtrarAltas, poblarFiltrosColumnasAltas, renderAltas, poblarSelectsAltas } from './modules/altas/index.js';
import { legajosScreenConfig, filtrarLegajos, renderLegajos } from './modules/legajos/index.js';

// ========== BIND SHARED A WINDOW (PRIMERO) ==========
// Estas funciones las llama el HTML con onclick — deben estar en window
// ANTES de que cualquier otra cosa pueda fallar.

window.doLogin = doLogin;
window.loginDemo = loginDemo;
window.doLogout = doLogout;
window.loginAsociado = loginAsociado;
window.navTo = navTo;
window.topAction = topAction;
window.busquedaGlobal = busquedaGlobal;
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.toast = toast;
window.hoyStr = hoyStr;
window.$ = $;

// ========== REGISTRAR PANTALLAS ==========

registerScreens(candidatosScreenConfig);
registerScreens(psicoScreenConfig);
registerScreens(altasScreenConfig);
registerScreens(legajosScreenConfig);

// ========== REGISTRAR FILTROS DE BÚSQUEDA GLOBAL ==========

registerSearchFilters({
  candidatos: filtrarCandidatos,
  psicotecnico: filtrarPsico,
  altas: filtrarAltas,
  legajos: filtrarLegajos,
});

// ========== LEGACY (import dinámico) ==========
// Se carga async para que un error en legacy no bloquee el login ni los módulos migrados.

let poblarSelects = () => {};
let renderInicio = () => {};

async function loadLegacy() {
  try {
    const legacy = await import('./legacy.js');
    poblarSelects = legacy.poblarSelects;
    renderInicio = legacy.renderInicio;

    // Registrar pantalla inicio con la función real
    registerScreens({
      inicio: { title: 'Inicio', btn: '', fn: null, render: renderInicio },
    });

    console.log('Legacy cargado correctamente');
  } catch (e) {
    console.error('Error cargando legacy.js:', e);
  }
}

// ========== CALLBACKS DE AUTH ==========

registerAuthCallbacks({
  construirMenu,
  poblarSelects() {
    poblarSelects();
    poblarSelectsAltas();
  },
  navTo,
  poblarFiltrosColumnas() {
    poblarFiltrosColumnasCandidatos();
    poblarFiltrosColumnasPsico();
    poblarFiltrosColumnasAltas();
  },
  verificarAccionesVencidas() {},
});

// ========== CALLBACKS DE NAV ==========

registerNavCallbacks({
  poblarFiltrosColumnas() {
    poblarFiltrosColumnasCandidatos();
    poblarFiltrosColumnasPsico();
    poblarFiltrosColumnasAltas();
  },
});

// ========== SCREEN CONFIG — INICIO (placeholder hasta que legacy cargue) ==========

registerScreens({
  inicio: { title: 'Inicio', btn: '', fn: null, render: () => renderInicio() },
});

// ========== INIT ==========

initLoginKeydown();
initModalClickOutside();

loadLegacy().then(() => {
  supaInit(DB, toast).then(() => {
    if (currentUser) renderInicio();
  }).catch(() => {}).finally(() => {
    if (!currentUser) $('login-screen').style.display = 'flex';
  });
});

console.log('Ohlimpia v2 — Vite cargado correctamente');
