// Ohlimpia — Entry point
// Acá se van a importar los módulos a medida que se migren.

import { SUPA, supaInit, supaSync, supaDel } from '@shared/supabase.js';
import { DB, PERFILES, MENU, BADGE_MAP, AREAS, LOCALIDADES_BA, currentUser } from '@shared/state.js';
import { $, initials, avatarEl, badge, formatPeriodo, hoyStr, esFeriado, esFinde, getDiasDelMes, calcularDiasEntre, toTitleCase, cleanText, applyTitleCase, validarCampos, fillSelect, fillDL } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, initModalClickOutside, makeTableSortable, activarOrdenamiento, activarOrdenamientoTabla, handleBuscadorKeydown } from '@shared/ui.js';
import { doLogin, loginDemo, iniciarSesion, doLogout, loginAsociado, initLoginKeydown, registerAuthCallbacks } from '@shared/auth.js';
import { SCREEN_CONFIG, registerScreens, currentScreen, navTo, topAction, construirMenu, busquedaGlobal, registerNavCallbacks, registerSearchFilters } from '@shared/nav.js';

// ── Módulos ──
import { candidatosScreenConfig, filtrarCandidatos, poblarFiltrosColumnasCandidatos, renderCandidatos } from './modules/candidatos/index.js';
import { psicoScreenConfig, filtrarPsico, poblarFiltrosColumnasPsico, renderPsico } from './modules/psicotecnico/index.js';

// Registrar pantallas de módulos
registerScreens(candidatosScreenConfig);
registerScreens(psicoScreenConfig);

// Registrar filtros de búsqueda global
registerSearchFilters({
  candidatos: filtrarCandidatos,
  psicotecnico: filtrarPsico,
});

console.log('Ohlimpia v2 — Vite cargado correctamente');
console.log('Supabase client:', SUPA ? 'OK' : 'ERROR');
console.log('DB servicios:', DB.servicios.length);
console.log('Perfiles:', Object.keys(PERFILES).length);
console.log('Menu secciones:', MENU.length);
console.log('Localidades BA:', LOCALIDADES_BA.length);
console.log('Helpers OK:', typeof $ === 'function' && typeof badge === 'function' && typeof hoyStr === 'function');
console.log('UI OK:', typeof toast === 'function' && typeof abrirModal === 'function' && typeof activarOrdenamiento === 'function');
console.log('Auth OK:', typeof doLogin === 'function' && typeof loginAsociado === 'function');
console.log('Nav OK:', typeof navTo === 'function' && typeof construirMenu === 'function' && typeof busquedaGlobal === 'function');
console.log('Candidatos OK:', typeof renderCandidatos === 'function');
console.log('Psicotécnico OK:', typeof renderPsico === 'function');
