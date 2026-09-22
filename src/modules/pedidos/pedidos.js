import { DB, currentUser } from '@shared/state.js';
import { $, badge, calcularDiasEntre } from '@shared/helpers.js';
import { esMismoSupervisor } from '@modules/supervision/supervision.js';
import { toast, cerrarModal, abrirModal } from '@shared/ui.js';
import { supaSync, SUPA } from '@shared/supabase.js';
import { checklistDiasHtml, formatearHorarioSemanal } from '@shared/horarioDias.js';
import { getSupervisorDeCodigo, serviciosDeSupervisor, direccionDeServicio } from '@modules/servicios_supervisor/index.js';
import { calcularKpisSeguimiento } from './seguimiento.js';
import {
  renderPrepedidos, contarVacantesPendientes, puedeVerPrepedidos, actualizarBadgePrepedidos,
  fechaOrigenPedido, chipOrigenPrepedido, filasHistorialPrepedidos,
} from '@modules/prepedidos/prepedidos.js';

// Estado del checklist de días/horario del modal (los onchange inline
// escriben en scope global, mismo patrón que puestosObjTemp en legacy.js).
let horarioPedidoTemp = { dias: {}, horarioDesde: '', horarioHasta: '', tipoHorario: 'fijo' };
window.horarioPedidoTemp = horarioPedidoTemp;

// id del pedido en edición (null = alta nueva).
let _pedidoEditId = null;

// v106 (ticket "AJUSTES", mockup v1.5): workflow completo. Estados vigentes:
// Pendiente → En búsqueda → Cubierto | Cancelado. "Pausado" quedó del
// modelo viejo y ya no se usa (no está en el mockup ni en las decisiones
// confirmadas — se deja de ofrecer, no se borra de BADGE_MAP por si hay
// algún dato residual).
export const ESTADOS_ACTIVOS = ['Pendiente', 'En búsqueda'];

// Pestaña activa de la pantalla ('activos' | 'historial').
let tabPedidosActiva = 'activos';

// Tema 11 del relevamiento (10/08): un supervisor solo ve pedidos de SUS
// servicios activos, no los de toda la cooperativa. Mismo criterio que ya
// usa Liquidación de horas para "esSupervisor" (renderGrillasLiq en
// legacy.js): matchea por nombre de supervisor o por función, y también
// por si tiene algún legajo activo en ese servicio (cubre pedidos cuyo
// campo "servicio" coincide con uno de los suyos aunque el nombre de
// supervisor cargado no coincida exacto).
export function pedidosVisiblesParaUsuario(lista) {
  if (currentUser?.perfil !== 'Supervisor') return lista;
  return lista.filter(p =>
    esMismoSupervisor(p.supervisor, currentUser.nombre) ||
    esMismoSupervisor(p.supervisor, currentUser.funcion) ||
    (DB.legajos || []).some(l => l.servicio === p.servicio && esMismoSupervisor(l.supervisor, currentUser.nombre))
  );
}

// ========== CONFIG (v106): umbral de "vencido" por urgencia ==========
// Parametrizable, confirmado por el solicitante (26/08). Sin ABM propia
// todavía — se edita directo en la tabla pedidos_config, mismo criterio
// que perfil_personal_atributos (v073): seed SQL, sin pantalla.
let pedidosUmbralVencido = { Alta: 5, Media: 15, Baja: 30 };
let _configPedidosCargada = false;

async function cargarConfigPedidos() {
  if (_configPedidosCargada) return;
  _configPedidosCargada = true;
  try {
    const { data } = await SUPA.from('pedidos_config').select('valor').eq('clave', 'umbral_vencido_dias').maybeSingle();
    if (data?.valor && typeof data.valor === 'object') pedidosUmbralVencido = { ...pedidosUmbralVencido, ...data.valor };
  } catch (e) { /* se queda con el default de arriba */ }
}

function umbralDe(urgencia) { return Number(pedidosUmbralVencido[urgencia]) || 15; }

// "Días" = antigüedad del pedido (fecha de carga → hoy). No se calcula
// contra el último evento del timeline: alcanza para el caso de uso y
// evita depender de que pedidosEventos esté siempre sincronizado.
function diasAntiguedad(p) {
  const d = calcularDiasEntre(p.fecha, hoyDDMMAAAA());
  return typeof d === 'number' ? d : 0;
}

export function pedidoVencido(p) {
  return ESTADOS_ACTIVOS.includes(p.estado) && diasAntiguedad(p) >= umbralDe(p.urgencia);
}

function hoyDDMMAAAA() { return new Date().toLocaleDateString('es-AR'); }
function hoyHHMM() { return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }

// N° de pedido correlativo (PP-1, PP-2, ...), mismo criterio que Altas
// usa para el N° de socio: max(existentes) + 1.
function siguienteNumeroPedido() {
  return Math.max(0, ...(DB.pedidos || []).map(p => Number(p.numero) || 0)) + 1;
}
export function numeroPedidoTxt(p) { return p?.numero ? `PP-${p.numero}` : '—'; }

// ========== TIMELINE (pedidos_eventos, v106) ==========

function eventosDePedido(pedidoId) {
  const idLocal = String(pedidoId).slice(-9);
  return (DB.pedidosEventos || [])
    .filter(e => String(e.pedidoIdLocal) === idLocal)
    .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));   // más nuevo primero
}

// Registra un evento y lo persiste. No bloquea el flujo si falla: el
// timeline es informativo, no puede impedir que el pedido cambie de estado.
function agregarEvento(pedido, tipo, detalle) {
  const ev = {
    id: Date.now(),
    pedidoIdLocal: String(pedido.id).slice(-9),
    tipo,
    detalle: detalle || '',
    usuario: currentUser?.nombre || 'Sistema',
    fecha: `${hoyDDMMAAAA()} · ${hoyHHMM()}`,
  };
  DB.pedidosEventos.push(ev);
  supaSync('pedidosEventos', ev);
  return ev;
}

const EVENTO_TXT = {
  creado: 'CREADO', en_busqueda: 'EN BÚSQUEDA', cubierto: 'CUBIERTO ✔',
  cancelado: 'CANCELADO', editado: 'EDITADO',
};

function timelineHtml(pedidoId) {
  const evs = eventosDePedido(pedidoId);
  if (!evs.length) return '<p class="text-muted" style="font-size:12.5px;">Sin eventos registrados.</p>';
  return `<div class="timeline-pedido">` + evs.map(e => `
    <div style="position:relative;padding-left:18px;margin-bottom:10px;border-left:2px solid var(--borde-fuerte);">
      <div style="position:absolute;left:-5px;top:2px;width:8px;height:8px;border-radius:50%;background:var(--azul);"></div>
      <div style="font-size:12.5px;"><b>${EVENTO_TXT[e.tipo] || e.tipo}</b>${e.detalle ? ' — ' + e.detalle : ''}</div>
      <div style="font-size:11px;color:var(--texto-suave);">${e.fecha || ''} · ${e.usuario || ''}</div>
    </div>`).join('') + `</div>`;
}

// ========== KPIs ==========

// Panel único de KPIs — vale para las 3 tabs (Activos/Seguimiento/
// Historial), mismo criterio en todas: elimina la contradicción de
// contadores que había entre esta pantalla y la vieja Seguimiento de
// selección (ver seguimiento.js). Los primeros 5 números salen de
// calcularKpisSeguimiento() (única fuente de verdad, con recuento real
// por vacante) — "Tiempo promedio" sigue siendo propio de esta tabla
// porque mide desde el nacimiento REAL de la necesidad: el alta del servicio
// si el pedido salió de un prepedido, la carga del pedido si no.
function renderKpisPedidos() {
  const cont = $('pedidos-kpis');
  if (!cont) return;
  const k = calcularKpisSeguimiento();

  const propios = pedidosVisiblesParaUsuario(DB.pedidos || []);
  const hoy = new Date();
  const cubiertosEsteMes = propios.filter(p => {
    if (p.estado !== 'Cubierto' || !p.fechaInicio) return false;
    const partes = String(p.fechaInicio).split('/');
    if (partes.length !== 3) return false;
    const [, m, a] = partes.map(Number);
    return (m - 1) === hoy.getMonth() && a === hoy.getFullYear();
  });
  const tiempos = cubiertosEsteMes
    .map(p => calcularDiasEntre(fechaOrigenPedido(p), p.fechaInicio))
    .filter(d => typeof d === 'number');
  const promedio = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null;

  const cardPre = puedeVerPrepedidos()
    ? `<div class="stat-card" style="border-left:4px solid #7c3aed;"><div class="stat-label">Prepedidos s/decisión</div><div class="stat-valor" id="kpi-prepedidos">${contarVacantesPendientes()}</div></div>`
    : '';
  cont.innerHTML = `
    ${cardPre}
    <div class="stat-card"><div class="stat-label">Pedidos activos</div><div class="stat-valor">${k.pedidosActivos}</div></div>
    <div class="stat-card azul"><div class="stat-label">Vacantes en búsqueda</div><div class="stat-valor">${k.vacantesBusqueda}</div></div>
    <div class="stat-card naranja"><div class="stat-label">Con candidato en proceso</div><div class="stat-valor">${k.conCandidatoProceso}</div></div>
    <div class="stat-card verde"><div class="stat-label">Cubiertas este mes</div><div class="stat-valor">${k.cubiertasEsteMes}</div></div>
    <div class="stat-card rojo"><div class="stat-label">Vencidos ⚠</div><div class="stat-valor">${k.vencidos}</div></div>
    <div class="stat-card"><div class="stat-label">Tiempo promedio (desde el alta)</div><div class="stat-valor" style="font-size:18px;">${promedio != null ? promedio + ' días' : '—'}</div></div>`;

  const tabCount = $('pedidos-tab-count');
  if (tabCount) tabCount.textContent = k.pedidosActivos;
  actualizarBadgePrepedidos();
}

// ========== TABS ==========

export function cambiarTabPedidos(tab, btn) {
  document.querySelectorAll('#screen-pedidos .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screen-pedidos .tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-pedidos .tab-btn[data-ped-tab="${tab}"]`)?.classList.add('active');
  $('pedidos-tab-' + tab)?.classList.add('active');
  tabPedidosActiva = tab;
  renderPedidosScreen();
}

// Renderiza lo que corresponda según la tab activa — usado tanto por
// cambiarTabPedidos() como por el screenConfig al entrar a la pantalla,
// así "Seguimiento" (antes su propia pantalla) queda al día también
// cuando se navega directo acá sin pasar por el click de la tab.
export function renderPedidosScreen() {
  renderKpisPedidos();
  if (tabPedidosActiva === 'prepedidos') renderPrepedidos();
  else if (tabPedidosActiva === 'historial') renderHistorialPedidos();
  else if (tabPedidosActiva === 'seguimiento') { if (window.renderSeguimientoSeleccion) window.renderSeguimientoSeleccion(); }
  else renderPedidos();
}

// ========== RENDER: ACTIVOS ==========

export async function renderPedidos(lista) {
  await cargarConfigPedidos();
  renderKpisPedidos();
  const base = pedidosVisiblesParaUsuario(lista || DB.pedidos).filter(p => ESTADOS_ACTIVOS.includes(p.estado));
  const tbody = $('tbody-pedidos');
  if (!tbody) return;
  if (!base.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-muted" style="text-align:center;padding:18px;">No hay pedidos activos.</td></tr>`;
    return;
  }
  tbody.innerHTML = base.map(p => {
    // BUG real (ticket "Del PP 29 al PP 31 no me permite tocar Ver", 22/09):
    // pedidos.id en Supabase es un uuid (con guiones) — la fila nace con un
    // id numérico (Date.now()) mientras dura la sesión que la creó, pero
    // apenas hay un reload/login nuevo, supaInit() la vuelve a traer con el
    // uuid real de Postgres (_toCamel no toca la columna "id"). El onclick
    // interpolaba ${p.id} SIN comillas: con un uuid ("cea8363a-...") eso es
    // JS inválido (los guiones se leen como resta de identificadores
    // inexistentes) y el navegador tira ese handler puntual en silencio —
    // el botón queda ahí pero no hace nada, sin ningún error visible para
    // quien lo usa. No es un problema de 3 pedidos puntuales: afecta a
    // CUALQUIER pedido ya recargado desde Supabase, cada vez que alguien
    // entra de nuevo — 29/30/31 son solo los que este usuario probó a
    // tocar. Con el id entre comillas simples el uuid viaja como texto,
    // igual que ya hace seguimiento.js con los candidatos.
    try {
      const dias = diasAntiguedad(p);
      const vencido = pedidoVencido(p);
      return `<tr onclick="verDetallePedido('${p.id}')"${vencido ? ' style="background:var(--rojo-suave);"' : ''}>
    <td style="font-size:12px;color:var(--texto-suave);">${numeroPedidoTxt(p)}</td>
    <td style="font-size:12px;color:var(--texto-suave);">${p.fecha}</td>
    <td style="font-size:12px;color:var(--texto-suave);">${p.cargadoPor || '—'}</td>
    <td style="font-weight:500;">${p.servicio}${chipOrigenPrepedido(p)}</td>
    <td style="font-weight:500;">${p.supervisor}</td>
    <td><span class="chip">${p.puesto}</span></td>
    <td style="text-align:right;">${p.cantidad || 1}</td>
    <td style="font-size:12px;color:var(--texto-suave);">${p.fechaLimite || '—'}</td>
    <td style="text-align:right;font-weight:${vencido ? '700' : '400'};color:${vencido ? 'var(--rojo)' : 'inherit'};">${dias}</td>
    <td>${badge(p.urgencia)}</td>
    <td>${vencido ? '<span class="badge badge-rojo">VENCIDO ⚠</span>' : badge(p.estado)}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();verDetallePedido('${p.id}')">Ver</button></td>
  </tr>`;
    } catch (e) {
      // Un dato inesperado en ESTE pedido no puede tirar abajo la lista
      // entera (Array.prototype.map corta todo ante la primera excepción):
      // se loguea y se muestra una fila de error puntual, el resto sigue
      // renderizando normal.
      console.error('renderPedidos: error mostrando el pedido', p?.id, p?.numero, e);
      return `<tr><td colspan="12" style="color:var(--rojo);font-size:12px;padding:8px;">⚠ Error al mostrar el pedido ${numeroPedidoTxt(p) || '(sin número)'} — avisá a Sistemas.</td></tr>`;
    }
  }).join('');
}

// ========== RENDER: HISTORIAL ==========

export function renderHistorialPedidos() {
  const tbody = $('tbody-pedidos-historial');
  if (!tbody) return;
  const buscar = ($('cf-ped-hist-buscar')?.value || '').toLowerCase();
  const resultado = $('cf-ped-hist-resultado')?.value || '';
  const base = pedidosVisiblesParaUsuario(DB.pedidos || [])
    .filter(p => ['Cubierto', 'Cancelado'].includes(p.estado))
    .filter(p => !resultado || p.estado === resultado)
    .filter(p => !buscar || p.servicio?.toLowerCase().includes(buscar) || p.supervisor?.toLowerCase().includes(buscar) || (p.nombreCandidato || '').toLowerCase().includes(buscar));
  const filasPre = filasHistorialPrepedidos({ buscar, resultado });
  if (!base.length && !filasPre) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center;padding:18px;">Sin pedidos en el historial.</td></tr>`;
    return;
  }
  tbody.innerHTML = filasPre + base.map(p => {
    try {
      const cerroEv = eventosDePedido(p.id).find(e => e.tipo === 'cubierto' || e.tipo === 'cancelado');
      const dias = p.estado === 'Cubierto' && p.fechaInicio ? calcularDiasEntre(p.fecha, p.fechaInicio) : '—';
      const resultadoHtml = p.estado === 'Cubierto'
        ? `<span class="badge badge-verde">CUBIERTO ✔</span>`
        : `<span class="badge badge-gris">CANCELADO</span>`;
      const personaHtml = p.estado === 'Cubierto'
        ? `<b>${p.nombreCandidato || '—'}</b> ${p.ingresoTipo === 'interno' ? '<span class="badge badge-acento" style="font-size:9.5px;">INTERNO</span>' : '<span class="badge badge-verde" style="font-size:9.5px;">INGRESO NUEVO</span>'}${p.nroSocioCandidato ? ` <span class="text-muted">socio ${p.nroSocioCandidato}</span>` : ''}`
        : `<span class="text-muted">motivo: ${p.motivoCancelacion || '—'}</span>`;
      // El id de Supabase es un uuid (con guiones) — sin comillas acá el
      // onclick queda sintácticamente inválido y "Ver" no responde (mismo
      // bug real de renderPedidos, ver el comentario de más arriba).
      return `<tr onclick="verDetallePedido('${p.id}')">
      <td style="font-size:12px;color:var(--texto-suave);">${numeroPedidoTxt(p)}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${p.fecha} · ${p.cargadoPor || '—'}</td>
      <td style="font-weight:500;">${p.servicio}${chipOrigenPrepedido(p)}</td>
      <td><span class="chip">${p.puesto}</span></td>
      <td>${resultadoHtml}</td>
      <td style="font-size:12.5px;">${personaHtml}</td>
      <td style="text-align:right;">${dias}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${cerroEv ? `${cerroEv.fecha} · ${cerroEv.usuario}` : '—'}</td>
    </tr>`;
    } catch (e) {
      console.error('renderHistorialPedidos: error mostrando el pedido', p?.id, p?.numero, e);
      return `<tr><td colspan="8" style="color:var(--rojo);font-size:12px;padding:8px;">⚠ Error al mostrar el pedido ${numeroPedidoTxt(p) || '(sin número)'} — avisá a Sistemas.</td></tr>`;
    }
  }).join('');
}

function perfilChips(p) {
  const perfil = p.perfil || [];
  if (!perfil.length) return '<span class="text-muted">—</span>';
  return perfil.map(x => {
    const valor = Array.isArray(x.valor) ? x.valor.join(' · ') : x.valor;
    return `<span class="chip">${nombrePerfil(x.codigo)}: ${valor}</span>`;
  }).join(' ');
}

function nombrePerfil(codigo) {
  const a = (DB.perfilPersonalAtributos || []).find(x => x.codigo === codigo);
  return a ? a.nombre : codigo;
}

// ========== DETALLE ==========

// Botones del footer según el estado del pedido: Pendiente ofrece "Tomar
// en búsqueda"; En búsqueda ofrece "Cubierto"/"Cancelar"; Cubierto y
// Cancelado quedan de solo lectura (ya está resuelto el flujo).
function footerDetallePedido(p) {
  // p.id entre comillas: es el uuid de Postgres, mismo motivo que en las
  // filas de la tabla (ver el comentario grande en renderPedidos).
  const cerrar = `<button class="btn btn-secondary" onclick="cerrarModal('modal-ver-pedido')">Cerrar</button>`;
  const editar = `<button class="btn btn-secondary" onclick="abrirEdicionPedido('${p.id}')">✏️ Editar</button>`;
  if (p.estado === 'Pendiente') {
    return `${cerrar}${editar}
      <button class="btn btn-danger" onclick="abrirModalCancelar('${p.id}')">✕ Cancelar pedido</button>
      <button class="btn btn-primary" onclick="tomarPedido('${p.id}')">🔍 En búsqueda</button>`;
  }
  if (p.estado === 'En búsqueda') {
    return `${cerrar}${editar}
      <button class="btn btn-danger" onclick="abrirModalCancelar('${p.id}')">✕ Cancelar pedido</button>
      <button class="btn btn-primary" style="background:var(--verde);" onclick="abrirModalCubierto('${p.id}')">✔ Pedido cubierto</button>`;
  }
  return cerrar;   // Cubierto / Cancelado: solo lectura
}

export function verDetallePedido(id) {
  const p = DB.pedidos.find(x => String(x.id) === String(id));
  if (!p) return;
  // Un dato inesperado en ESTE pedido (perfil mal formado, etc.) no puede
  // dejar el modal a medio pintar ni tirar una excepción sin aviso — se
  // muestra lo que se pudo y se avisa, en vez de que "Ver" parezca que no
  // hizo nada (mismo espíritu que el fix de los onclick sin comillas).
  try {
    const horarioTxt = formatearHorarioSemanal(p.horarioSemanal) || p.horario || '—';
    const vencido = pedidoVencido(p);
    const body = `<div class="info-grid" style="margin-bottom:16px;">
      <div class="info-item"><div class="key">N° de pedido</div><div class="val">${numeroPedidoTxt(p)}</div></div>
      <div class="info-item"><div class="key">Estado</div><div class="val">${vencido ? '<span class="badge badge-rojo">VENCIDO ⚠</span>' : badge(p.estado)}</div></div>
      <div class="info-item"><div class="key">Servicio / Cliente</div><div class="val">${p.servicio}</div></div>
      <div class="info-item"><div class="key">Dirección del servicio</div><div class="val">${direccionDeServicio(p.servicio) || '—'}</div></div>
      <div class="info-item"><div class="key">Supervisor</div><div class="val">${p.supervisor}</div></div>
      <div class="info-item"><div class="key">Zona</div><div class="val">${p.zona || '—'}</div></div>
      <div class="info-item"><div class="key">Puesto</div><div class="val">${p.puesto}</div></div>
      <div class="info-item"><div class="key">Cantidad</div><div class="val">${p.cantidad || 1}</div></div>
      <div class="info-item"><div class="key">Horario</div><div class="val">${horarioTxt}</div></div>
      <div class="info-item"><div class="key">Urgencia</div><div class="val">${badge(p.urgencia)}</div></div>
      <div class="info-item"><div class="key">Fecha del pedido</div><div class="val">${p.fecha}</div></div>
      <div class="info-item"><div class="key">Fecha límite</div><div class="val">${p.fechaLimite || '—'}</div></div>
      <div class="info-item"><div class="key">Cargado por</div><div class="val">${p.cargadoPor || '—'}</div></div>
    </div>
    ${perfilDetalle(p)}
    <div class="form-section" style="margin-bottom:8px;">Observaciones</div>
    <p style="font-size:13px;color:var(--texto-suave);margin-bottom:16px;">${p.obs || 'Sin observaciones'}</p>
    ${p.estado === 'Cubierto' ? `<div class="form-section" style="margin-bottom:8px;">Cobertura</div>
    <div class="info-grid" style="margin-bottom:16px;">
      <div class="info-item"><div class="key">Persona</div><div class="val">${p.nombreCandidato || '—'} (${p.ingresoTipo === 'interno' ? 'asociado interno' : 'ingreso nuevo'})</div></div>
      <div class="info-item"><div class="key">N° de socio</div><div class="val">${p.nroSocioCandidato || '—'}</div></div>
      <div class="info-item"><div class="key">Fecha de inicio</div><div class="val">${p.fechaInicio || '—'}</div></div>
    </div>` : ''}
    ${p.estado === 'Cancelado' ? `<div class="form-section" style="margin-bottom:8px;">Motivo de cancelación</div>
    <p style="font-size:13px;color:var(--texto-suave);margin-bottom:16px;">${p.motivoCancelacion || '—'}${p.motivoDetalle ? ' — ' + p.motivoDetalle : ''}</p>` : ''}
    <div class="form-section" style="margin-bottom:8px;">Historial del pedido</div>
    ${timelineHtml(p.id)}`;
    $('pedido-title').textContent = `📋 Pedido ${numeroPedidoTxt(p)} — ${p.servicio}`;
    $('pedido-body').innerHTML = body;
    const foot = $('pedido-footer-extra');
    if (foot) foot.innerHTML = footerDetallePedido(p);
    abrirModal('modal-ver-pedido');
  } catch (e) {
    console.error('verDetallePedido: error mostrando el pedido', p?.id, p?.numero, e);
    toast('⚠️ No se pudo mostrar el detalle de este pedido — avisá a Sistemas (' + (e?.message || 'error desconocido') + ')');
  }
}

// Abre el modal de alta precargado con los datos del pedido, en modo
// edición (update por id_local en vez de push).
export function abrirEdicionPedido(id) {
  const p = DB.pedidos.find(x => String(x.id) === String(id));
  if (!p) return;
  cerrarModal('modal-ver-pedido');
  _pedidoEditId = p.id;
  $('pedido-modal-title').textContent = '✏️ Editar pedido de personal';
  $('p-cargado-por').value = p.cargadoPor || '';
  $('p-numero').value = numeroPedidoTxt(p);
  $('p-supervisor').value = p.supervisor || '';
  $('p-zona').value = p.zona || '';
  $('p-puesto').value = p.puesto || '';
  $('p-cantidad').value = p.cantidad || 1;
  $('p-urgencia').value = p.urgencia || 'Media';
  $('p-fecha-limite').value = p.fechaLimite || '';
  $('p-obs').value = p.obs || '';
  renderPerfilInputs(p.perfil || []);
  renderHorarioPedido(p.horarioSemanal);
  // Puebla el <select> de servicio con los del supervisor YA cargado y
  // conserva el servicio guardado (orden importa: un <select> ignora un
  // .value que todavía no tiene su <option>).
  onChangeSupervisorPedido(p.servicio || '');
  abrirModal('modal-pedido');
}

function perfilDetalle(p) {
  const perfil = p.perfil || [];
  if (!perfil.length) return '';
  return `<div class="form-section" style="margin-bottom:8px;">Perfil solicitado</div>
  <div class="info-grid" style="margin-bottom:16px;">
    ${perfil.map(x => {
      const valor = Array.isArray(x.valor) ? x.valor.join(', ') : x.valor;
      return `<div class="info-item"><div class="key">${nombrePerfil(x.codigo)}</div><div class="val">${valor}</div></div>`;
    }).join('')}
  </div>`;
}

// ========== FILTROS ==========

export function filtrarPedidos() {
  const fecha = ($('cf-ped-fecha') || { value: '' }).value.toLowerCase();
  const sup = ($('cf-ped-sup') || { value: '' }).value.toLowerCase();
  const serv = ($('cf-ped-serv') || { value: '' }).value.toLowerCase();
  const puesto = ($('cf-ped-puesto') || { value: '' }).value;
  const urg = ($('cf-ped-urg') || { value: '' }).value;
  const estado = ($('cf-ped-est') || { value: '' }).value;
  const bg = ($('buscador-global') || { value: '' }).value.toLowerCase();
  renderPedidos(DB.pedidos.filter(p =>
    (!fecha || p.fecha.includes(fecha)) &&
    (!sup || p.supervisor.toLowerCase().includes(sup)) &&
    (!serv || p.servicio.toLowerCase().includes(serv)) &&
    (!puesto || p.puesto === puesto) &&
    (!urg || p.urgencia === urg) &&
    (!estado || p.estado === estado) &&
    (!bg || p.supervisor.toLowerCase().includes(bg) || p.servicio.toLowerCase().includes(bg))
  ));
}

// Alta de un pedido que nace de una vacante de prepedido ("Incorporar"):
// mismo pedido de siempre, con el vínculo prepedidoIdLocal/prepedidoVacante.
export function crearPedidoDesdePrepedido(datos, origenTxt) {
  const nuevo = {
    id: Date.now(),
    numero: siguienteNumeroPedido(),
    fecha: hoyDDMMAAAA(),
    cargadoPor: currentUser?.nombre || 'Sistema',
    ...datos,
    estado: 'Pendiente',
  };
  DB.pedidos.push(nuevo);
  supaSync('pedidos', nuevo);
  agregarEvento(nuevo, 'creado', `Desde ${origenTxt}`);
  return nuevo;
}

// ========== ALTA ==========

// Abre el modal de alta ya limpio y con "Cargado por" precargado — mismo
// punto de entrada que usa el botón "+ Nuevo pedido".
export function abrirNuevoPedido() {
  resetModalPedido();
  abrirModal('modal-pedido');
}

export function guardarPedido() {
  const s = $('p-servicio').value.trim();
  if (!s) { toast('Ingresá el servicio'); return; }
  const cantidad = Math.max(1, parseInt($('p-cantidad').value, 10) || 1);
  const datos = {
    supervisor: $('p-supervisor').value,
    servicio: s,
    zona: $('p-zona').value,
    puesto: $('p-puesto').value,
    cantidad,
    fechaLimite: $('p-fecha-limite').value.trim(),
    horarioSemanal: { ...horarioPedidoTemp },
    horario: formatearHorarioSemanal(horarioPedidoTemp),
    urgencia: $('p-urgencia').value,
    perfil: recolectarPerfil(),
    obs: $('p-obs').value,
  };
  if (_pedidoEditId) {
    const p = DB.pedidos.find(x => String(x.id) === String(_pedidoEditId));
    if (!p) { toast('No se encontró el pedido'); return; }
    Object.assign(p, datos);
    _pedidoEditId = null;
    cerrarModal('modal-pedido');
    agregarEvento(p, 'editado', '');
    renderPedidos();
    supaSync('pedidos', p);
    toast('✓ Pedido actualizado');
    return;
  }
  const nuevo = {
    id: Date.now(),
    numero: siguienteNumeroPedido(),
    fecha: hoyDDMMAAAA(),
    cargadoPor: currentUser?.nombre || 'Sistema',
    ...datos,
    estado: 'Pendiente',
  };
  DB.pedidos.push(nuevo);
  cerrarModal('modal-pedido');
  renderPedidos();
  supaSync('pedidos', nuevo);
  agregarEvento(nuevo, 'creado', `Cargado por ${nuevo.cargadoPor}`);
  toast(`✓ Pedido ${numeroPedidoTxt(nuevo)} guardado`);
}

// Renderiza el checklist de días + horario dentro de #p-horario. prefill:
// objeto horarioSemanal de un pedido existente (para edición) o null.
export function renderHorarioPedido(prefill) {
  const el = $('p-horario');
  if (!el) return;
  horarioPedidoTemp = {
    dias: { ...(prefill?.dias || {}) },
    horarioDesde: prefill?.horarioDesde || '',
    horarioHasta: prefill?.horarioHasta || '',
    tipoHorario: prefill?.tipoHorario || 'fijo',
  };
  window.horarioPedidoTemp = horarioPedidoTemp;
  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
      ${checklistDiasHtml(horarioPedidoTemp.dias, (d) => `horarioPedidoTemp.dias.${d}=this.checked`)}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
      <div class="form-group"><label>Desde</label><input type="time" value="${horarioPedidoTemp.horarioDesde}" style="padding:9px 12px;" onchange="horarioPedidoTemp.horarioDesde=this.value"></div>
      <div class="form-group"><label>Hasta</label><input type="time" value="${horarioPedidoTemp.horarioHasta}" style="padding:9px 12px;" onchange="horarioPedidoTemp.horarioHasta=this.value"></div>
      <div class="form-group"><label>Tipo de horario</label>
        <select style="padding:9px 12px;" onchange="horarioPedidoTemp.tipoHorario=this.value">
          <option value="fijo" ${(horarioPedidoTemp.tipoHorario || 'fijo') === 'fijo' ? 'selected' : ''}>Fijo</option>
          <option value="rotativo" ${horarioPedidoTemp.tipoHorario === 'rotativo' ? 'selected' : ''}>Rotativo</option>
        </select>
      </div>
    </div>`;
}

// Reinicia el estado del modal para un alta nueva (botón "+ Nuevo pedido").
export function resetModalPedido() {
  _pedidoEditId = null;
  $('pedido-modal-title').textContent = 'Nuevo pedido de personal';
  const cp = $('p-cargado-por'); if (cp) cp.value = currentUser?.nombre || '';
  const num = $('p-numero'); if (num) num.value = `PP-${siguienteNumeroPedido()} (auto)`;
  const cant = $('p-cantidad'); if (cant) cant.value = 1;
  const fl = $('p-fecha-limite'); if (fl) fl.value = '';
  const sup = $('p-supervisor'); if (sup) sup.value = '';
  const obs = $('p-obs'); if (obs) obs.value = '';
  const zona = $('p-zona'); if (zona) zona.value = '';
  onChangeSupervisorPedido();   // limpia el <select> de servicio (y la dirección) al estado "sin supervisor"
  renderPerfilInputs([]);
  renderHorarioPedido(null);
}

// ========== MATCHER SERVICIO ↔ SUPERVISOR (08/2026) ==========

// Al cambiar el supervisor, filtra el <select> de servicio para mostrar
// SOLO los de ese supervisor (objetivos Operativos + servicios_supervisor).
// Cascada real (no texto libre): mockup v1.5 / PEDIDOS_PERSONAL_V1.md §3 —
// "Selector, filtrado por el supervisor elegido". Sin supervisor elegido
// todavía, el select queda con el placeholder y ningún servicio cargado.
// servicioAConservar: al editar un pedido existente, conserva el servicio
// ya guardado si sigue estando entre los del supervisor (ver abrirEdicionPedido).
export function onChangeSupervisorPedido(servicioAConservar) {
  const sup = ($('p-supervisor') || {}).value || '';
  const servEl = $('p-servicio');
  if (!servEl) return;
  const valorPrevio = servicioAConservar || '';
  if (!sup) {
    servEl.innerHTML = '<option value="">— primero elegí el supervisor —</option>';
    actualizarDireccionServicioPedido('');
    return;
  }
  const servicios = serviciosDeSupervisor(sup);
  servEl.innerHTML = `<option value="">— elegir entre los ${servicios.length} servicios —</option>`
    + servicios.map(s => `<option>${s}</option>`).join('');
  if (valorPrevio && servicios.includes(valorPrevio)) servEl.value = valorPrevio;
  actualizarDireccionServicioPedido(servEl.value);
}

// Al escribir el servicio, autocompleta el supervisor a cargo (misma
// fuente que Altas/Reasignaciones: objetivo Operativo primero, luego
// servicios_supervisor).
export function onChangeServicioPedido() {
  const codigo = ($('p-servicio') || {}).value || '';
  const supEl = $('p-supervisor');
  if (supEl && codigo) {
    const sup = getSupervisorDeCodigo(codigo);
    if (sup) supEl.value = sup;
  }
  actualizarDireccionServicioPedido(codigo);
}

// Ticket "Automatizar" (09/09): al elegir el servicio (o al precargarlo en
// edición), muestra sola la dirección del objetivo comercial — sin que el
// supervisor tenga que cargarla a mano. Sin dirección cargada en el
// objetivo (o servicio que todavía solo vive en la lista puente
// servicios_supervisor, sin objetivo real), queda en "—", sin romper nada.
function actualizarDireccionServicioPedido(codigo) {
  const el = $('p-servicio-direccion');
  if (el) el.value = direccionDeServicio(codigo) || '—';
}

// ========== PERFIL DEL PERSONAL (catálogo parametrizable, v073) ==========

// Renderiza los controles del perfil solicitado dentro de #p-perfil,
// leyendo los atributos activos de DB.perfilPersonalAtributos (orden).
// prefill: array [{codigo, valor}] con los valores guardados (edición).
export function renderPerfilInputs(prefill) {
  const cont = $('p-perfil');
  if (!cont) return;
  const pref = (prefill || []);
  const valorDe = (codigo) => pref.find(x => x.codigo === codigo);
  const atrs = (DB.perfilPersonalAtributos || [])
    .filter(a => a.activo !== false)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
  cont.innerHTML = atrs.map(a => {
    const opciones = a.opciones || [];
    const pv = valorDe(a.codigo);
    if (a.tipo === 'multi') {
      const marcados = Array.isArray(pv?.valor) ? pv.valor : [];
      return `<div class="form-group">
        <label>${a.nombre}</label>
        <div style="display:flex;flex-direction:column;gap:4px;padding-top:2px;">
          ${opciones.map(o => `<label style="display:flex;align-items:center;gap:6px;font-size:12px;"><input type="checkbox" data-perfil="${a.codigo}" value="${o}" ${marcados.includes(o) ? 'checked' : ''}> ${o}</label>`).join('')}
        </div>
      </div>`;
    }
    if (a.tipo === 'text') {
      return `<div class="form-group"><label>${a.nombre}</label><input type="text" id="perfil-${a.codigo}" value="${pv?.valor || ''}" placeholder="${a.nombre}"></div>`;
    }
    return `<div class="form-group"><label>${a.nombre}</label>
      <select id="perfil-${a.codigo}"><option value="">—</option>
        ${opciones.map(o => `<option ${pv?.valor === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
}

// Recolecta los valores elegidos → array [{codigo, valor}] que se persiste
// en pedidos.perfil. 'multi' agrupa los checkbox marcados como array.
export function recolectarPerfil() {
  const perfil = [];
  const atrs = (DB.perfilPersonalAtributos || []).filter(a => a.activo !== false);
  for (const a of atrs) {
    if (a.tipo === 'multi') {
      const marcados = [...document.querySelectorAll(`#p-perfil input[data-perfil="${a.codigo}"]:checked`)].map(c => c.value);
      if (marcados.length) perfil.push({ codigo: a.codigo, valor: marcados });
    } else {
      const el = $(`perfil-${a.codigo}`);
      const v = el && el.value ? el.value.trim() : '';
      if (v) perfil.push({ codigo: a.codigo, valor: v });
    }
  }
  return perfil;
}

// ========== WORKFLOW (v106): tomar / cubrir / cancelar ==========

// Pendiente → En búsqueda. Queda con el usuario actual y notifica (según
// ticket, la notificación 🔔 queda pendiente para una etapa siguiente —
// acá solo se registra el evento en el timeline).
export function tomarPedido(id) {
  const p = DB.pedidos.find(x => String(x.id) === String(id));
  if (!p) return;
  p.estado = 'En búsqueda';
  supaSync('pedidos', p);
  agregarEvento(p, 'en_busqueda', `Tomado por ${currentUser?.nombre || 'Sistema'}`);
  renderPedidos();
  toast('✓ Pedido en búsqueda');
  verDetallePedido(id);   // refresca el modal con el estado y timeline nuevos
}

let _pedidoCubrirId = null;

export function abrirModalCubierto(id) {
  _pedidoCubrirId = id;
  $('cub-ingreso-tipo-nuevo').checked = true;
  $('cub-nombre').value = '';
  $('cub-nro-socio').value = '';
  $('cub-fecha-inicio').value = hoyDDMMAAAA();
  $('cub-obs').value = '';
  abrirModal('modal-pedido-cubierto');
}

// Marca CUBIERTO. Solo informativo (ver banner del modal): no toca
// legajos ni grillas — la conexión real nace en el alta de asociado.
export function confirmarCubierto() {
  const p = DB.pedidos.find(x => String(x.id) === String(_pedidoCubrirId));
  if (!p) return;
  const nombre = $('cub-nombre').value.trim();
  if (!nombre) { toast('Ingresá el nombre de la persona'); return; }
  const fechaInicio = $('cub-fecha-inicio').value.trim();
  if (!fechaInicio) { toast('Ingresá la fecha de inicio'); return; }
  const tipo = $('cub-ingreso-tipo-interno').checked ? 'interno' : 'nuevo';
  const obs = $('cub-obs').value.trim();
  p.estado = 'Cubierto';
  p.ingresoTipo = tipo;
  p.nombreCandidato = nombre;
  p.nroSocioCandidato = $('cub-nro-socio').value.trim();
  p.fechaInicio = fechaInicio;
  supaSync('pedidos', p);
  agregarEvento(p, 'cubierto', `${tipo === 'interno' ? 'Asociado interno' : 'Ingreso nuevo'}: ${nombre}${obs ? ' — ' + obs : ''}`);
  cerrarModal('modal-pedido-cubierto');
  cerrarModal('modal-ver-pedido');
  renderPedidos();
  toast('✓ Pedido cubierto');
}

let _pedidoCancelarId = null;

export function abrirModalCancelar(id) {
  _pedidoCancelarId = id;
  const sel = $('canc-motivo');
  if (sel) {
    const motivos = (DB.pedidosMotivosCancelacion || [])
      .filter(m => m.activo !== false)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));
    sel.innerHTML = '<option value="">— Seleccionar —</option>' + motivos.map(m => `<option>${m.nombre}</option>`).join('') + '<option>Otro</option>';
  }
  $('canc-detalle').value = '';
  abrirModal('modal-pedido-cancelar');
}

export function confirmarCancelar() {
  const p = DB.pedidos.find(x => String(x.id) === String(_pedidoCancelarId));
  if (!p) return;
  const motivo = $('canc-motivo').value;
  if (!motivo) { toast('Elegí un motivo'); return; }
  const detalle = $('canc-detalle').value.trim();
  p.estado = 'Cancelado';
  p.motivoCancelacion = motivo;
  p.motivoDetalle = detalle;
  supaSync('pedidos', p);
  agregarEvento(p, 'cancelado', motivo + (detalle ? ' — ' + detalle : ''));
  cerrarModal('modal-pedido-cancelar');
  cerrarModal('modal-ver-pedido');
  renderPedidos();
  toast('✓ Pedido cancelado');
}
