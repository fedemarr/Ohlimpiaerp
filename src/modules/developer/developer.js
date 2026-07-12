// Módulo Developer — perfil exclusivo del desarrollador (Fede).
//
// 4 pantallas propias que ningún otro perfil ve (dev_inicio, dev_tickets,
// dev_proyeccion, dev_seguridad): tickets (conversión automática de
// `sugerencias`), un roadmap fijo y un checklist de seguridad. Roadmap y
// checklist se persisten en localStorage — no son datos operativos del
// negocio, no necesitan vivir en Supabase ni sincronizarse entre sesiones.

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, SUPA } from '@shared/supabase.js';
import { currentScreen } from '@shared/nav.js';
import { suscribirseAInserts, desuscribirse } from '@shared/realtime.js';

// ========== HELPERS ==========

function getTicketById(id) {
  return (DB.tickets || []).find(t => String(t.id) === String(id));
}

const ESTADO_LABEL = { abierto: 'Abierto', en_progreso: 'En progreso', resuelto: 'Resuelto', cerrado: 'Cerrado' };
const ESTADO_BADGE = { abierto: 'badge-rojo', en_progreso: 'badge-acento', resuelto: 'badge-verde', cerrado: 'badge-gris' };
const PRIORIDAD_ICONO = { alta: '🔴', media: '🟡', baja: '🔵' };
const TIPO_LABEL = { bug: '🐛 Bug', sugerencia: '💡 Sugerencia', consulta: '❓ Consulta', otro: '📝 Otro' };
// Mapeo de estado del ticket -> estado de la sugerencia origen (loop de
// vuelta v041, para que quien reportó vea el progreso sin preguntar).
const ESTADO_SUGERENCIA = { abierto: 'Pendiente', en_progreso: 'En revisión', resuelto: 'Resuelto', cerrado: 'Cerrado' };

// ========== SINCRONIZACIÓN SUGERENCIAS → TICKETS ==========

// Las sugerencias ya las carga cualquier perfil desde el módulo existente
// (tabla `sugerencias`, campos {id, fecha, usuario, tipo, descripcion,
// estado}). Acá se convierten en tickets del perfil DEVELOPER la primera
// vez que aparecen — nunca se duplican (se matchea por sugerenciaId).
export async function sincronizarSugerenciasComoTickets() {
  const sugerencias = DB.sugerencias || [];
  if (!DB.tickets) DB.tickets = [];
  const existentes = new Set(DB.tickets.map(t => String(t.sugerenciaId)));
  const tipoMap = { problema: 'bug', sugerencia: 'sugerencia', mejora: 'sugerencia', otro: 'otro' };
  let creados = 0;
  for (const sug of sugerencias) {
    if (!sug.id || existentes.has(String(sug.id))) continue;
    const ticket = {
      id: sug.id,
      sugerenciaId: sug.id,
      titulo: (sug.descripcion || '').trim().slice(0, 60) || 'Sin título',
      descripcion: sug.descripcion || '',
      tipo: tipoMap[sug.tipo] || 'otro',
      estado: 'abierto',
      prioridad: 'media',
      modulo: '',
      autor: sug.usuario || 'Desconocido',
      fecha: sug.fecha || new Date().toLocaleDateString('es-AR'),
      respuestaDev: '',
      resueltoAt: null,
    };
    DB.tickets.push(ticket);
    await supaSync('tickets', ticket);
    creados++;
  }
  if (creados > 0) console.log('🎫', creados, 'ticket(s) creados desde sugerencias');
}

// ========== TIEMPO REAL (v041) ==========
// Se suscribe a los INSERT de `sugerencias` — el ticket aparece al
// instante en vez de esperar el próximo ciclo de chequearTicketsNuevosDev
// (25s, que se mantiene como red de seguridad ante cortes de websocket).
let _channelRealtimeDev = null;

async function manejarSugerenciaEnVivo(sugerenciaNueva) {
  if (!DB.sugerencias) DB.sugerencias = [];
  const yaExiste = DB.sugerencias.some(s => String(s.id) === String(sugerenciaNueva.id));
  if (!yaExiste) DB.sugerencias.push(sugerenciaNueva);
  const antes = (DB.tickets || []).length;
  await sincronizarSugerenciasComoTickets();
  const nuevos = (DB.tickets || []).length - antes;
  if (nuevos === 0) return;
  toast('🎫 Nuevo reporte en vivo: ' + (sugerenciaNueva.descripcion || '').slice(0, 60));
  if (currentScreen === 'dev_inicio') renderDevInicio();
  if (currentScreen === 'dev_tickets') renderDevTickets();
}

export function iniciarRealtimeDev() {
  if (_channelRealtimeDev) return;
  _channelRealtimeDev = suscribirseAInserts('sugerencias', manejarSugerenciaEnVivo);
}

export function detenerRealtimeDev() {
  desuscribirse(_channelRealtimeDev);
  _channelRealtimeDev = null;
}

// ========== INICIO DEV ==========

export function renderDevInicio() {
  const tickets = DB.tickets || [];
  const abiertos = tickets.filter(t => t.estado === 'abierto').length;
  const sinRespuesta = tickets.filter(t => t.estado !== 'resuelto' && t.estado !== 'cerrado' && !t.respuestaDev).length;
  const enProgreso = tickets.filter(t => t.estado === 'en_progreso').length;
  const resueltos = tickets.filter(t => t.estado === 'resuelto' || t.estado === 'cerrado').length;

  const stAbiertos = $('dev-st-abiertos'); if (stAbiertos) stAbiertos.textContent = abiertos;
  const stSinResp = $('dev-st-sinresp'); if (stSinResp) stSinResp.textContent = sinRespuesta;
  const stProgreso = $('dev-st-progreso'); if (stProgreso) stProgreso.textContent = enProgreso;
  const stResueltos = $('dev-st-resueltos'); if (stResueltos) stResueltos.textContent = resueltos;

  const pendientes = tickets
    .filter(t => t.estado === 'abierto' && !t.respuestaDev)
    .sort((a, b) => (a.id > b.id ? 1 : -1));

  const cont = $('dev-inicio-pendientes');
  if (cont) {
    cont.innerHTML = pendientes.length === 0
      ? '<div style="text-align:center;padding:32px;opacity:.5;">🎉 No hay tickets pendientes sin respuesta</div>'
      : pendientes.map(t => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid var(--borde);border-radius:var(--radio);margin-bottom:8px;cursor:pointer;" onclick="abrirTicketPorId('${t.id}')">
          <div>
            <span>${PRIORIDAD_ICONO[t.prioridad] || '🔵'}</span>
            <strong style="margin-left:6px;">${t.titulo}</strong>
            <div style="font-size:12px;color:var(--texto-suave);margin-top:2px;">${TIPO_LABEL[t.tipo] || t.tipo} · ${t.autor} · ${t.fecha}</div>
          </div>
          <span class="badge ${ESTADO_BADGE[t.estado] || 'badge-gris'}">${ESTADO_LABEL[t.estado] || t.estado}</span>
        </div>`).join('');
  }
}

// ========== TICKETS ==========

export function filtrarDevTickets() {
  renderDevTickets();
}

export function renderDevTickets() {
  const fEstado = ($('dev-filtro-estado') || {}).value || '';
  const fTipo = ($('dev-filtro-tipo') || {}).value || '';
  const fPrioridad = ($('dev-filtro-prioridad') || {}).value || '';

  let lista = (DB.tickets || []).slice().sort((a, b) => (a.id < b.id ? 1 : -1));
  if (fEstado) lista = lista.filter(t => t.estado === fEstado);
  if (fTipo) lista = lista.filter(t => t.tipo === fTipo);
  if (fPrioridad) lista = lista.filter(t => t.prioridad === fPrioridad);

  const tbody = $('tbody-dev-tickets');
  if (tbody) {
    tbody.innerHTML = lista.length === 0
      ? '<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.5;">No hay tickets con estos filtros</td></tr>'
      : lista.map((t, i) => `
        <tr style="cursor:pointer;" onclick="abrirTicketPorId('${t.id}')">
          <td>#${lista.length - i}</td>
          <td>${TIPO_LABEL[t.tipo] || t.tipo}</td>
          <td>${t.titulo}</td>
          <td>${t.modulo || '—'}</td>
          <td>${t.autor || '—'}</td>
          <td>${t.fecha || '—'}</td>
          <td>${PRIORIDAD_ICONO[t.prioridad] || ''} ${t.prioridad}</td>
          <td><span class="badge ${ESTADO_BADGE[t.estado] || 'badge-gris'}">${ESTADO_LABEL[t.estado] || t.estado}</span></td>
        </tr>`).join('');
  }
}

// ========== MODAL DE TICKET ==========

function ensureModalTicket() {
  if ($('modal-dev-ticket')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-dev-ticket';
  m.innerHTML = [
    '<div class="modal" style="max-width:640px;">',
      '<div class="modal-header">',
        '<h3>🎫 Ticket — <span id="dt-titulo"></span></h3>',
        '<button class="btn-close" onclick="cerrarModal(\'modal-dev-ticket\')">×</button>',
      '</div>',
      '<div class="modal-body">',
        '<input type="hidden" id="dt-id">',
        '<div class="info-item"><div class="key">Descripción</div><div class="val" id="dt-descripcion" style="white-space:pre-wrap;"></div></div>',
        '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:12.5px;color:var(--texto-suave);">',
          '<span id="dt-tipo"></span><span id="dt-autor"></span><span id="dt-fecha"></span><span id="dt-modulo"></span>',
        '</div>',
        '<div class="form-grid form-grid-2" style="margin-top:14px;">',
          '<div class="form-group"><label>Estado</label>',
            '<select id="dt-estado" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">',
              '<option value="abierto">Abierto</option><option value="en_progreso">En progreso</option>',
              '<option value="resuelto">Resuelto</option><option value="cerrado">Cerrado</option>',
            '</select></div>',
          '<div class="form-group"><label>Prioridad</label>',
            '<select id="dt-prioridad" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">',
              '<option value="alta">🔴 Alta</option><option value="media">🟡 Media</option><option value="baja">🔵 Baja</option>',
            '</select></div>',
        '</div>',
        '<div class="form-group" style="margin-top:12px;"><label>Respuesta / notas del desarrollador</label>',
          '<textarea id="dt-respuesta" rows="4" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;resize:vertical;"></textarea></div>',
        '<div style="margin-top:12px;">',
          '<button type="button" class="btn" style="background:#7c3aed;color:white;" onclick="generarPromptIA()">🤖 Generar prompt con IA</button>',
          '<div id="dt-ia-resultado" style="display:none;margin-top:10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:10px;font-size:12.5px;"></div>',
        '</div>',
      '</div>',
      '<div class="modal-footer">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-dev-ticket\')">Cerrar</button>',
        '<button class="btn btn-primary" onclick="guardarRespuestaTicket()">💾 Guardar</button>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(m);
}

export function abrirTicketPorId(id) {
  const t = getTicketById(id);
  if (!t) return;
  ensureModalTicket();
  $('dt-id').value = t.id;
  $('dt-titulo').textContent = t.titulo;
  $('dt-descripcion').textContent = t.descripcion || '—';
  $('dt-tipo').textContent = TIPO_LABEL[t.tipo] || t.tipo;
  $('dt-autor').textContent = '👤 ' + (t.autor || '—');
  $('dt-fecha').textContent = '📅 ' + (t.fecha || '—');
  $('dt-modulo').textContent = t.modulo ? '📦 ' + t.modulo : '';
  $('dt-estado').value = t.estado || 'abierto';
  $('dt-prioridad').value = t.prioridad || 'media';
  $('dt-respuesta').value = t.respuestaDev || '';
  const panel = $('dt-ia-resultado');
  if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
  abrirModal('modal-dev-ticket');
}

export async function guardarRespuestaTicket() {
  const id = $('dt-id').value;
  const t = getTicketById(id);
  if (!t) return;
  const nuevoEstado = $('dt-estado').value;
  t.estado = nuevoEstado;
  t.prioridad = $('dt-prioridad').value;
  t.respuestaDev = $('dt-respuesta').value.trim();
  t.resueltoAt = (nuevoEstado === 'resuelto' || nuevoEstado === 'cerrado')
    ? (t.resueltoAt || new Date().toISOString())
    : null;
  await supaSync('tickets', t);
  // Reflejar el cambio en la sugerencia origen — loop de vuelta v041.
  const sug = (DB.sugerencias || []).find(s => String(s.id) === String(t.sugerenciaId));
  if (sug) {
    sug.estado = ESTADO_SUGERENCIA[nuevoEstado] || sug.estado;
    sug.respuestaDev = t.respuestaDev;
    await supaSync('sugerencias', sug);
  }
  cerrarModal('modal-dev-ticket');
  renderDevTickets();
  renderDevInicio();
  toast('✅ Ticket actualizado');
}

// ========== IA — GENERAR PROMPT ==========

export async function generarPromptIA() {
  const id = $('dt-id').value;
  const t = getTicketById(id);
  if (!t) return;
  const panel = $('dt-ia-resultado');
  if (panel) { panel.style.display = 'block'; panel.innerHTML = '🤖 Generando…'; }
  try {
    const { data } = await SUPA.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sesión no válida — volvé a iniciar sesión');
    const resp = await fetch('/api/generar-prompt-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ titulo: t.titulo, descripcion: t.descripcion, tipo: t.tipo, modulo: t.modulo }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(body.error || 'Error al generar el prompt');
    if (panel) {
      panel.innerHTML =
        '<div style="font-weight:600;color:#5b21b6;margin-bottom:6px;">📋 Prompt sugerido</div>'
        + '<pre id="dt-ia-prompt" style="white-space:pre-wrap;font-family:inherit;background:white;border-radius:6px;padding:8px;border:1px solid #ddd6fe;">' + body.prompt + '</pre>'
        + '<button type="button" class="btn btn-sm" style="margin-top:6px;" onclick="copiarPromptIA()">📋 Copiar prompt</button>'
        + (body.recomendaciones && body.recomendaciones.length
          ? '<div style="font-weight:600;color:#5b21b6;margin-top:10px;">💡 Recomendaciones</div>'
            + '<ul style="margin:6px 0 0 18px;">' + body.recomendaciones.map(r =>
              `<li><strong>[${(r.prioridad || '').toUpperCase()}] ${r.titulo}</strong> — ${r.detalle}</li>`).join('') + '</ul>'
          : '');
    }
  } catch (e) {
    if (panel) panel.innerHTML = '⚠️ ' + (e.message || 'No se pudo generar el prompt');
  }
}

export function copiarPromptIA() {
  const pre = $('dt-ia-prompt');
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => toast('📋 Prompt copiado'));
}

// ========== PROYECCIÓN (roadmap fijo, persistido en localStorage) ==========

const ROADMAP_KEY = 'ohlimpia_roadmap';

// Estado real de migración (ver src/modules/*) — se usa como default la
// primera vez; a partir de ahí manda lo que haya en localStorage.
const ROADMAP = [
  { fase: 'Fase 1 — Selección', items: [
    { id: 'candidatos', label: 'Candidatos', estado: 'completado' },
    { id: 'pedidos', label: 'Pedidos de personal', estado: 'completado' },
    { id: 'psicotecnico', label: 'Psicotécnico', estado: 'completado' },
    { id: 'preocupacional', label: 'Pre-ocupacional', estado: 'completado' },
    { id: 'documentacion', label: 'Documentación de ingreso', estado: 'completado' },
  ]},
  { fase: 'Fase 2 — Ingreso', items: [
    { id: 'altas', label: 'Altas de asociados', estado: 'completado' },
    { id: 'legajos', label: 'Legajos', estado: 'completado' },
    { id: 'reasignaciones', label: 'Reasignaciones', estado: 'completado' },
    { id: 'uniformes', label: 'Uniformes', estado: 'completado' },
    { id: 'retenciones', label: 'Retenciones', estado: 'completado' },
    { id: 'monotributos', label: 'Monotributos', estado: 'pendiente' },
  ]},
  { fase: 'Fase 3 — Operaciones', items: [
    { id: 'liquidacion', label: 'Liquidación de horas', estado: 'pendiente' },
    { id: 'liq_admin', label: 'Liquidación Administración', estado: 'pendiente' },
    { id: 'retenes', label: 'Retenes', estado: 'pendiente' },
    { id: 'mantenimiento', label: 'Mantenimiento', estado: 'pendiente' },
    { id: 'sanciones', label: 'Sanciones', estado: 'pendiente' },
    { id: 'pedidos_adelantos', label: 'Pedidos de adelantos', estado: 'pendiente' },
    { id: 'feriados', label: 'Feriados', estado: 'pendiente' },
  ]},
  { fase: 'Fase 4 — Ventas', items: [
    { id: 'clientes', label: 'Clientes', estado: 'pendiente' },
    { id: 'objetivos', label: 'Objetivos / Servicios', estado: 'pendiente' },
    { id: 'precios', label: 'Gestión de precios', estado: 'pendiente' },
    { id: 'crm', label: 'CRM Comercial', estado: 'pendiente' },
    { id: 'reclamos', label: 'Reclamos y NC', estado: 'pendiente' },
    { id: 'cobros', label: 'Gestión de cobros', estado: 'pendiente' },
  ]},
  { fase: 'Fase 5 — Seguimiento, Personal y Finanzas', items: [
    { id: 'legal', label: 'Situaciones legales', estado: 'pendiente' },
    { id: 'enfermos', label: 'Enfermos y accidentes', estado: 'pendiente' },
    { id: 'paritarias', label: 'Paritarias', estado: 'pendiente' },
    { id: 'configuracion', label: 'Configuración', estado: 'pendiente' },
    { id: 'smvm', label: 'SMVM histórico', estado: 'pendiente' },
    { id: 'capacitaciones', label: 'Capacitaciones', estado: 'completado' },
    { id: 'vacaciones', label: 'Vacaciones y descanso', estado: 'pendiente' },
    { id: 'competencia', label: 'Competencia anual', estado: 'completado' },
    { id: 'liquidaciones', label: 'Liquidaciones', estado: 'pendiente' },
    { id: 'gestion_adelantos', label: 'Gestión de adelantos', estado: 'pendiente' },
  ]},
];

function cargarEstadoRoadmap() {
  try { return JSON.parse(localStorage.getItem(ROADMAP_KEY) || '{}'); } catch { return {}; }
}

function guardarEstadoRoadmap(estados) {
  localStorage.setItem(ROADMAP_KEY, JSON.stringify(estados));
}

const ROADMAP_ORDEN = ['pendiente', 'en_progreso', 'completado'];
const ROADMAP_LABEL = { pendiente: '⬜ Pendiente', en_progreso: '🟡 En progreso', completado: '✅ Completado' };

export function toggleRoadmapItem(id) {
  const estados = cargarEstadoRoadmap();
  const item = ROADMAP.flatMap(f => f.items).find(it => it.id === id);
  if (!item) return;
  const actual = estados[id] || item.estado;
  const idx = ROADMAP_ORDEN.indexOf(actual);
  estados[id] = ROADMAP_ORDEN[(idx + 1) % ROADMAP_ORDEN.length];
  guardarEstadoRoadmap(estados);
  renderDevProyeccion();
}

export function renderDevProyeccion() {
  const estados = cargarEstadoRoadmap();
  const cont = $('dev-roadmap');
  if (!cont) return;
  cont.innerHTML = ROADMAP.map(fase => {
    const items = fase.items.map(it => ({ ...it, estado: estados[it.id] || it.estado }));
    const completados = items.filter(it => it.estado === 'completado').length;
    const pct = Math.round((completados / items.length) * 100);
    return `
      <div class="card" style="margin-bottom:14px;">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="margin:0;">${fase.fase}</h4>
          <span style="font-size:12.5px;color:var(--texto-suave);">${completados}/${items.length} completado</span>
        </div>
        <div style="height:6px;background:var(--fondo);border-radius:4px;margin:8px 0 12px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:var(--verde,#16a34a);"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${items.map(it => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border:1px solid var(--borde);border-radius:6px;cursor:pointer;" onclick="toggleRoadmapItem('${it.id}')">
              <span style="font-size:13px;">${it.label}</span>
              <span style="font-size:12px;">${ROADMAP_LABEL[it.estado]}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

// ========== SEGURIDAD (checklist fijo, persistido en localStorage) ==========

const SEGURIDAD_KEY = 'ohlimpia_seguridad';

const SEGURIDAD = [
  { grupo: 'Autenticación', items: [
    { id: 'auth-supabase', label: 'Login real vía Supabase Auth (signInWithPassword), sin passwords en el bundle', estado: 'ok' },
    { id: 'auth-anon-asociado', label: 'Portal asociado usa sesión anónima de Supabase — revisar alcance real de las policies RLS para el rol anon', estado: 'warn' },
  ]},
  { grupo: 'Datos', items: [
    { id: 'datos-prompt-nativo', label: 'rechazarCandidatoPorId/rechazarPsico/agendarTurno todavía usan prompt() nativo en vez de un modal propio', estado: 'warn' },
    { id: 'datos-dni-legajos', label: 'Sin validación de unicidad de DNI al crear/editar legajos', estado: 'bad' },
    { id: 'datos-service-role', label: 'La service_role key nunca se persiste en el repo ni en el bundle del cliente', estado: 'ok' },
  ]},
  { grupo: 'Supabase / RLS', items: [
    { id: 'rls-todas-tablas', label: 'Todas las tablas migradas tienen policy "Solo usuarios autenticados"', estado: 'ok' },
    { id: 'rls-sql-drift', label: 'Los .sql versionados no reflejan 100% el schema real en producción (ver psicos.id) — pendiente regenerar', estado: 'warn' },
  ]},
  { grupo: 'Código', items: [
    { id: 'codigo-ids-indice', label: 'IDs por índice de array reemplazados por id/DNI en todos los módulos migrados', estado: 'ok' },
    { id: 'codigo-anthropic-key', label: 'La API key de Anthropic vive solo en variables de entorno de Vercel, nunca en el cliente', estado: 'ok' },
  ]},
];

const SEGURIDAD_ORDEN = ['bad', 'warn', 'ok'];
const SEGURIDAD_ICONO = { ok: '✅', warn: '⚠️', bad: '❌' };

function cargarEstadoSeguridad() {
  try { return JSON.parse(localStorage.getItem(SEGURIDAD_KEY) || '{}'); } catch { return {}; }
}

function guardarEstadoSeguridad(estados) {
  localStorage.setItem(SEGURIDAD_KEY, JSON.stringify(estados));
}

export function toggleChecklistItem(id) {
  const estados = cargarEstadoSeguridad();
  const item = SEGURIDAD.flatMap(g => g.items).find(it => it.id === id);
  if (!item) return;
  const actual = estados[id] || item.estado;
  const idx = SEGURIDAD_ORDEN.indexOf(actual);
  estados[id] = SEGURIDAD_ORDEN[(idx + 1) % SEGURIDAD_ORDEN.length];
  guardarEstadoSeguridad(estados);
  renderDevSeguridad();
}

export function renderDevSeguridad() {
  const estados = cargarEstadoSeguridad();
  const cont = $('dev-seguridad-checklist');
  if (cont) {
    cont.innerHTML = SEGURIDAD.map(grupo => `
      <div class="card" style="margin-bottom:14px;">
        <div class="card-header"><h4 style="margin:0;">${grupo.grupo}</h4></div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${grupo.items.map(it => {
            const estado = estados[it.id] || it.estado;
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 10px;border:1px solid var(--borde);border-radius:6px;cursor:pointer;" onclick="toggleChecklistItem('${it.id}')">
                <span style="font-size:13px;">${it.label}</span>
                <span style="font-size:16px;flex-shrink:0;">${SEGURIDAD_ICONO[estado]}</span>
              </div>`;
          }).join('')}
        </div>
      </div>`).join('');
  }

  const cont2 = $('dev-seguridad-actividad');
  if (cont2) {
    const recientes = (DB.tickets || []).slice().sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, 10);
    cont2.innerHTML = recientes.length === 0
      ? '<div style="opacity:.5;padding:16px;text-align:center;">Sin actividad reciente</div>'
      : recientes.map(t => `
        <div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--borde);font-size:12.5px;">
          <span>${TIPO_LABEL[t.tipo] || t.tipo} — ${t.titulo}</span>
          <span class="badge ${ESTADO_BADGE[t.estado] || 'badge-gris'}">${ESTADO_LABEL[t.estado] || t.estado}</span>
        </div>`).join('');
  }
}
