// Ohlimpia — Entry point

// ── Estilos ──
import './styles/main.css';

// ── Shared ──
import { SUPA, supaInit, supaSync, supaDel } from '@shared/supabase.js';
import { DB, PERFILES, MENU, BADGE_MAP, AREAS, LOCALIDADES_BA } from '@shared/state.js';
import { $, initials, avatarEl, badge, formatPeriodo, hoyStr, esFeriado, esFinde, getDiasDelMes, calcularDiasEntre, toTitleCase, cleanText, applyTitleCase, validarCampos, fillSelect, fillDL } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, initModalClickOutside, makeTableSortable, activarOrdenamiento, activarOrdenamientoTabla, handleBuscadorKeydown, confirmarModalInputSimple } from '@shared/ui.js';
import { doLogin, doLogout, loginAsociado, initLoginKeydown, registerAuthCallbacks, restaurarSesion } from '@shared/auth.js';
import { SCREEN_CONFIG, registerScreens, currentScreen, navTo, topAction, construirMenu, busquedaGlobal, registerNavCallbacks, registerSearchFilters } from '@shared/nav.js';

// ── Módulos migrados ──
import { candidatosScreenConfig, filtrarCandidatos, poblarFiltrosColumnasCandidatos, renderCandidatos } from './modules/candidatos/index.js';
import { psicoScreenConfig, filtrarPsico, poblarFiltrosColumnasPsico, renderPsico } from './modules/psicotecnico/index.js';
import { preocupScreenConfig } from './modules/preocupacional/index.js';
import { documScreenConfig } from './modules/documentacion/index.js';
import { altasScreenConfig, filtrarAltas, poblarFiltrosColumnasAltas, renderAltas, poblarSelectsAltas } from './modules/altas/index.js';
import { legajosScreenConfig, filtrarLegajos, renderLegajos } from './modules/legajos/index.js';
import { pedidosScreenConfig, filtrarPedidos } from './modules/pedidos/index.js';
import { reasignacionesScreenConfig } from './modules/reasignaciones/index.js';
import './modules/personal_rrhh/index.js';

// ========== BIND SHARED A WINDOW (PRIMERO) ==========
// Estas funciones las llama el HTML con onclick — deben estar en window
// ANTES de que cualquier otra cosa pueda fallar.

window.doLogin = doLogin;
window.doLogout = doLogout;
window.loginAsociado = loginAsociado;
window.navTo = navTo;
window.topAction = topAction;
window.busquedaGlobal = busquedaGlobal;
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.confirmarModalInputSimple = confirmarModalInputSimple;
window.toast = toast;
window.hoyStr = hoyStr;
window.$ = $;

// ========== REGISTRAR PANTALLAS ==========

registerScreens(candidatosScreenConfig);
registerScreens(psicoScreenConfig);
registerScreens(preocupScreenConfig);
registerScreens(documScreenConfig);
registerScreens(altasScreenConfig);
registerScreens(legajosScreenConfig);
registerScreens(pedidosScreenConfig);
registerScreens(reasignacionesScreenConfig);

// ========== REGISTRAR FILTROS DE BÚSQUEDA GLOBAL ==========

registerSearchFilters({
  candidatos: filtrarCandidatos,
  psicotecnico: filtrarPsico,
  altas: filtrarAltas,
  legajos: filtrarLegajos,
  pedidos: filtrarPedidos,
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

    // Registrar pantallas legacy que necesitan btn en topbar
    registerScreens({
      capacitaciones: { title: 'Capacitaciones', btn: '+ Registrar capacitación', fn: () => abrirModal('modal-capacitacion'), render: () => { if (window.renderCapacitaciones) window.renderCapacitaciones(); } },
      legal: { title: 'Situaciones legales', btn: '+ Nuevo caso', fn: () => abrirModal('modal-legal'), render: () => { if (window.renderLegal) window.renderLegal(); } },
      enfermos: { title: 'Enfermos y accidentes', btn: '+ Nuevo caso', fn: () => abrirModal('modal-enfermo'), render: () => { if (window.renderEnfermos) window.renderEnfermos(); } },
      clientes: { title: 'Clientes', btn: '+ Nuevo cliente', fn: () => abrirModal('modal-cliente'), render: () => { if (window.renderClientes) window.renderClientes(); } },
      objetivos: { title: 'Objetivos / Servicios', btn: '+ Nuevo objetivo', fn: () => abrirModal('modal-objetivo'), render: () => { if (window.renderObjetivos) window.renderObjetivos(); } },
      vacaciones: { title: 'Vacaciones y descanso', btn: '', fn: null, render: () => { if (window.renderVacaciones) window.renderVacaciones(); } },
      competencia: { title: 'Competencia anual', btn: '', fn: null, render: () => { if (window.renderCompetencia) window.renderCompetencia(); } },
      configuracion: { title: 'Configuración', btn: '', fn: null, render: () => { if (window.renderConfiguracion) window.renderConfiguracion(); } },
      smvm: { title: 'SMVM histórico', btn: '', fn: null, render: () => { if (window.renderSMVM) window.renderSMVM(); } },
      feriados: { title: 'Feriados', btn: '+ Agregar feriado', fn: () => abrirModal('modal-feriado'), render: () => { if (window.renderFeriados) window.renderFeriados(); } },
      cobros: { title: 'Gestión de cobros', btn: '', fn: null, render: () => { if (window.renderCobros) window.renderCobros(); } },
      crm: { title: 'CRM Comercial', btn: '+ Nuevo lead', fn: () => abrirModal('modal-lead'), render: () => { if (window.renderCRM) window.renderCRM(); } },
      reclamos: { title: 'Reclamos y NC', btn: '+ Nuevo reclamo', fn: () => abrirModal('modal-reclamo'), render: () => { if (window.renderReclamos) window.renderReclamos(); } },
      precios: { title: 'Gestión de precios', btn: '', fn: null, render: () => { if (window.renderPrecios) window.renderPrecios(); } },
      liquidacion: { title: 'Liquidación de horas', btn: '', fn: null, render: () => { if (window.renderLiquidacion) window.renderLiquidacion(); } },
      liq_admin: { title: 'Liquidación Administración', btn: '', fn: null, render: () => { if (window.renderLiqAdmin) window.renderLiqAdmin(); } },
      retenes: { title: 'Retenes', btn: '', fn: null, render: () => { if (window.renderRetenes) window.renderRetenes(); } },
      mantenimiento: { title: 'Mantenimiento', btn: '', fn: null, render: () => { if (window.renderMantenimiento) window.renderMantenimiento(); } },
      monotributos: { title: 'Monotributos', btn: '+ Nuevo monotributista', fn: () => { if (window.abrirModalNuevoMonotributo) window.abrirModalNuevoMonotributo(); }, render: () => { if (window.renderMonotributos) window.renderMonotributos(); } },
      uniformes: { title: 'Uniformes', btn: '+ Nueva entrega', fn: () => { if (window.abrirModalNuevoUniforme) window.abrirModalNuevoUniforme(); }, render: () => { if (window.renderUniformes) window.renderUniformes(); } },
      retenciones: { title: 'Retenciones', btn: '+ Nueva retención', fn: () => { if (window.abrirModalNuevaRetencion) window.abrirModalNuevaRetencion(); }, render: () => { if (window.renderRetenciones) window.renderRetenciones(); } },
      sanciones: { title: 'Sanciones', btn: '+ Nueva sanción', fn: () => abrirModal('modal-sancion'), render: () => { if (window.renderSanciones) window.renderSanciones(); } },
      paritarias: { title: 'Paritarias', btn: '', fn: null, render: () => { if (window.renderParitarias) window.renderParitarias(); } },
      liquidaciones: { title: 'Liquidaciones', btn: '', fn: null, render: () => { if (window.renderLiquidaciones) window.renderLiquidaciones(); } },
      pedidos_adelantos: { title: 'Pedidos de adelantos', btn: '', fn: null, render: () => { if (window.renderPedidosAdelantos) window.renderPedidosAdelantos(); } },
      gestion_adelantos: { title: 'Gestión de adelantos', btn: '', fn: null, render: () => { if (window.renderGestionAdelantos) window.renderGestionAdelantos(); } },
      sugerencias: { title: 'Reportes y sugerencias', btn: '+ Nueva sugerencia', fn: () => window.abrirModalSugerencia(), render: () => { if (window.renderSugerencias) window.renderSugerencias(); } },
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
  cargarDatos: () => supaInit(DB, toast),
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

// Salvaguarda: si restaurar la sesión (o cargar legacy) se cuelga por algún
// problema de red/datos, no dejar al usuario trabado en pantalla en blanco.
let pantallaResuelta = false;
setTimeout(() => {
  if (!pantallaResuelta) $('login-screen').style.display = 'flex';
}, 6000);

loadLegacy().then(async () => {
  const sesionRestaurada = await restaurarSesion().catch(() => false);
  pantallaResuelta = true;
  if (!sesionRestaurada) $('login-screen').style.display = 'flex';
});

console.log('Ohlimpia v2 — Vite cargado correctamente');
