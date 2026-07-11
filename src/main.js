// Ohlimpia — Entry point

// ── Estilos ──
import './styles/main.css';

// ── Shared ──
import { SUPA, supaInit, supaSync, supaDel, fetchCandidatosYTurnos, fetchSugerencias } from '@shared/supabase.js';
import { DB, PERFILES, MENU, BADGE_MAP, AREAS, LOCALIDADES_BA, currentUser } from '@shared/state.js';
import { $, initials, avatarEl, badge, formatPeriodo, hoyStr, esFeriado, esFinde, getDiasDelMes, calcularDiasEntre, toTitleCase, cleanText, applyTitleCase, validarCampos, fillSelect, fillDL } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, initModalClickOutside, makeTableSortable, activarOrdenamiento, activarOrdenamientoTabla, handleBuscadorKeydown, confirmarModalInputSimple } from '@shared/ui.js';
import { doLogin, doLogout, loginAsociado, initLoginKeydown, registerAuthCallbacks, restaurarSesion } from '@shared/auth.js';
import { SCREEN_CONFIG, registerScreens, currentScreen, navTo, topAction, construirMenu, busquedaGlobal, registerNavCallbacks, registerSearchFilters } from '@shared/nav.js';

// ── Módulos migrados ──
import { candidatosScreenConfig, filtrarCandidatos, poblarFiltrosColumnasCandidatos, renderCandidatos, renderCalendario } from './modules/candidatos/index.js';
import { psicoScreenConfig, filtrarPsico, poblarFiltrosColumnasPsico, renderPsico } from './modules/psicotecnico/index.js';
import { preocupScreenConfig, filtrarPreocup, poblarFiltrosColumnasPreocup } from './modules/preocupacional/index.js';
import { documScreenConfig, filtrarDocum, poblarFiltrosColumnasDocum } from './modules/documentacion/index.js';
import { altasScreenConfig, filtrarAltas, poblarFiltrosColumnasAltas, renderAltas, poblarSelectsAltas } from './modules/altas/index.js';
import { legajosScreenConfig, filtrarLegajos, renderLegajos } from './modules/legajos/index.js';
import { pedidosScreenConfig, filtrarPedidos } from './modules/pedidos/index.js';
import { reasignacionesScreenConfig, sincronizarConfigReasignaciones } from './modules/reasignaciones/index.js';
import { capacitacionesScreenConfig, filtrarCapacitaciones } from './modules/capacitaciones/index.js';
import { uniformesScreenConfig } from './modules/uniformes/index.js';
import { retencionesScreenConfig, filtrarRetenciones } from './modules/retenciones/index.js';
import { competenciaScreenConfig } from './modules/competencia/index.js';
import { developerScreenConfig, sincronizarSugerenciasComoTickets, renderDevInicio, renderDevTickets } from './modules/developer/index.js';
import { vacacionesScreenConfig } from './modules/vacaciones/index.js';
import { descansosScreenConfig } from './modules/descansos/index.js';
import { sancionesScreenConfig } from './modules/sanciones/index.js';
import { categoriasScreenConfig } from './modules/categorias/index.js';
import { situacionesLegalesScreenConfig } from './modules/situaciones_legales/index.js';
import { enfermosAccidentesScreenConfig } from './modules/enfermos_accidentes/index.js';
import { renderCampanaNotificaciones, fetchNotificacionesPendientes, toggleCampanaDropdown, marcarNotifLeidaYRefrescar } from '@shared/notificaciones.js';
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
window.toggleCampanaDropdown = toggleCampanaDropdown;
window.marcarNotifLeidaYRefrescar = marcarNotifLeidaYRefrescar;

// ========== REGISTRAR PANTALLAS ==========

registerScreens(candidatosScreenConfig);
registerScreens(psicoScreenConfig);
registerScreens(preocupScreenConfig);
registerScreens(documScreenConfig);
registerScreens(altasScreenConfig);
registerScreens(legajosScreenConfig);
registerScreens(pedidosScreenConfig);
registerScreens(reasignacionesScreenConfig);
registerScreens(capacitacionesScreenConfig);
registerScreens(uniformesScreenConfig);
registerScreens(retencionesScreenConfig);
registerScreens(competenciaScreenConfig);
registerScreens(developerScreenConfig);
registerScreens(vacacionesScreenConfig);
registerScreens(descansosScreenConfig);
registerScreens(sancionesScreenConfig);
registerScreens(categoriasScreenConfig);
registerScreens(situacionesLegalesScreenConfig);
registerScreens(enfermosAccidentesScreenConfig);

// ========== REGISTRAR FILTROS DE BÚSQUEDA GLOBAL ==========

registerSearchFilters({
  candidatos: filtrarCandidatos,
  psicotecnico: filtrarPsico,
  preocupacional: filtrarPreocup,
  documentacion: filtrarDocum,
  altas: filtrarAltas,
  legajos: filtrarLegajos,
  pedidos: filtrarPedidos,
  capacitaciones: filtrarCapacitaciones,
  retenciones: filtrarRetenciones,
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
    // (capacitaciones/uniformes/retenciones se sacan de acá — ahora los
    // registran los módulos migrados, más abajo)
    registerScreens({
      clientes: { title: 'Clientes', btn: '+ Nuevo cliente', fn: () => abrirModal('modal-cliente'), render: () => { if (window.renderClientes) window.renderClientes(); } },
      objetivos: { title: 'Objetivos / Servicios', btn: '+ Nuevo objetivo', fn: () => abrirModal('modal-objetivo'), render: () => { if (window.renderObjetivos) window.renderObjetivos(); } },
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

// Chequeo periódico de candidatos/turnos nuevos (postulaciones del
// formulario público) — así no hace falta refrescar la página a mano.
const INTERVALO_POLLING_MS = 25000;
let pollingId = null;

async function chequearPostulacionesNuevas() {
  const datos = await fetchCandidatosYTurnos();
  if (!datos) return;

  const idsActuales = new Set((DB.candidatos || []).map(c => String(c.id)));
  const nuevos = datos.candidatos.filter(c => !idsActuales.has(String(c.id)));

  DB.candidatos = datos.candidatos;
  DB.turnos = datos.turnos;

  if (nuevos.length) {
    nuevos.forEach(c => {
      const nombreCompleto = (c.apellido ? c.apellido + ', ' : '') + (c.nombre || '');
      toast('🆕 Nueva postulación: ' + nombreCompleto);
    });
    if (currentScreen === 'candidatos') { renderCandidatos(); renderCalendario(); }
  }
}

function iniciarPolling() {
  if (pollingId) return;
  pollingId = setInterval(chequearPostulacionesNuevas, INTERVALO_POLLING_MS);
}

function detenerPolling() {
  if (pollingId) { clearInterval(pollingId); pollingId = null; }
}

// Chequeo periódico de sugerencias nuevas (perfil DEVELOPER) — mismo
// patrón que chequearPostulacionesNuevas, para que los tickets aparezcan
// en vivo sin necesidad de relogueaarse.
const INTERVALO_POLLING_TICKETS_MS = 25000;
let pollingTicketsId = null;

async function chequearTicketsNuevosDev() {
  const sugerencias = await fetchSugerencias();
  if (!sugerencias) return;
  DB.sugerencias = sugerencias;
  const antes = (DB.tickets || []).length;
  await sincronizarSugerenciasComoTickets();
  const nuevos = (DB.tickets || []).length - antes;
  if (nuevos > 0) {
    toast('🎫 ' + nuevos + ' ticket(s) nuevo(s) desde sugerencias');
    if (currentScreen === 'dev_inicio') renderDevInicio();
    if (currentScreen === 'dev_tickets') renderDevTickets();
  }
}

function iniciarPollingTickets() {
  if (pollingTicketsId) return;
  pollingTicketsId = setInterval(chequearTicketsNuevosDev, INTERVALO_POLLING_TICKETS_MS);
}

function detenerPollingTickets() {
  if (pollingTicketsId) { clearInterval(pollingTicketsId); pollingTicketsId = null; }
}

// Chequeo periódico de la campana de notificaciones (todos los perfiles
// logueados, ver shared/notificaciones.js) — se creó de cero esta sesión,
// no existía nada parecido en el proyecto.
const INTERVALO_POLLING_CAMPANA_MS = 25000;
let pollingCampanaId = null;

async function chequearNotificacionesNuevas() {
  if (!currentUser?.nombre) return;
  const pendientes = await fetchNotificacionesPendientes(currentUser.nombre);
  const otros = (DB.notificacionesSistema || []).filter(n => n.destinatarioNombre !== currentUser.nombre);
  DB.notificacionesSistema = [...otros, ...pendientes];
  renderCampanaNotificaciones();
}

function iniciarPollingCampana() {
  if (pollingCampanaId) return;
  chequearNotificacionesNuevas();
  pollingCampanaId = setInterval(chequearNotificacionesNuevas, INTERVALO_POLLING_CAMPANA_MS);
}

function detenerPollingCampana() {
  if (pollingCampanaId) { clearInterval(pollingCampanaId); pollingCampanaId = null; }
}

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
    poblarFiltrosColumnasPreocup();
    poblarFiltrosColumnasDocum();
    poblarFiltrosColumnasAltas();
  },
  verificarAccionesVencidas() {},
  async cargarDatos() {
    await supaInit(DB, toast);
    // Refresca DB.motivosReasignacion/DB.aprobadoresReas (arrays planos que
    // legacy.js sigue leyendo) desde la config real recién cargada, para
    // que no queden con el seed default hasta visitar Reasignaciones.
    sincronizarConfigReasignaciones();
    // Perfil exclusivo del desarrollador: convierte sugerencias nuevas en
    // tickets (nunca duplica — matchea por sugerenciaId).
    if (currentUser?.perfil === 'DEVELOPER') await sincronizarSugerenciasComoTickets();
  },
  iniciarPolling() {
    // DEVELOPER no tiene pantalla de candidatos — en vez de chequear
    // postulaciones nuevas, chequea sugerencias nuevas como tickets.
    if (currentUser?.perfil === 'DEVELOPER') iniciarPollingTickets();
    else iniciarPolling();
    iniciarPollingCampana();
  },
  detenerPolling() {
    detenerPolling();
    detenerPollingTickets();
    detenerPollingCampana();
  },
});

// ========== CALLBACKS DE NAV ==========

registerNavCallbacks({
  poblarFiltrosColumnas() {
    poblarFiltrosColumnasCandidatos();
    poblarFiltrosColumnasPsico();
    poblarFiltrosColumnasPreocup();
    poblarFiltrosColumnasDocum();
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
  if (!pantallaResuelta) {
    $('login-screen').style.display = 'flex';
    $('boot-loading').classList.add('hidden');
  }
}, 6000);

loadLegacy().then(async () => {
  const sesionRestaurada = await restaurarSesion().catch(() => false);
  pantallaResuelta = true;
  if (!sesionRestaurada) $('login-screen').style.display = 'flex';
  $('boot-loading').classList.add('hidden');
});

console.log('Ohlimpia v2 — Vite cargado correctamente');
