// AGENTE_TICKETS_OHLIMPIA.md — Fase 1. Pantalla pensada para celular
// (punto 4): listado de tickets con riesgo + selección, detalle de
// corrida, aprobación de migración, resolución.
//
// Innegociable #1: esta pantalla es exclusiva de DEVELOPER. La UI la
// oculta (MENU/PERFILES, ver state.js), pero eso NO alcanza como "backend"
// (un perfil manipulando window.* desde la consola la vería igual) — la
// verificación real está en la RLS de corridas_agente/agente_audit_log
// (sql/v172: solo lee/escribe quien tiene perfil DEVELOPER en `usuarios`,
// resuelto por auth.uid(), no por lo que declare el cliente).
import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { clasificarRiesgoTicket, puedeEnviarseAlAgente, motivoBloqueoRiesgo } from './riesgo.js';
import { crearCorridaAgente, dispararAgente } from './dispatcher.js';
import { registrarAuditoriaAgente, auditoriaDeCorrida } from './auditoria.js';
import { generarResolucion } from './resolucion.js';
import { puedeReintentar } from './estados.js';

// Punto 10: "Máximo de tickets por envío (sugerido: 3 en la Fase 1)".
export const MAX_TICKETS_POR_ENVIO = 3;
// Innegociable #6: "Tope de intentos: si falla 2 veces, se rinde".
export const MAX_INTENTOS = 2;

const RIESGO_LABEL = { verde: '🟢 Verde', amarillo: '🟡 Amarillo', rojo: '🔴 Rojo' };
const ESTADO_LABEL_CORRIDA = {
  ENVIADO: 'Enviado', EN_PROCESO: 'En proceso', TESTS_OK: 'Tests OK',
  ESPERANDO_APROBACION_SQL: 'Esperando aprobar SQL',
  MIGRACION_APROBADA_PENDIENTE_APLICAR: 'Aplicá la migración a mano',
  DEPLOYADO: 'Deployado', COMUNICADO: 'Comunicado',
  TESTS_FALLARON: 'Tests en rojo', FALLIDO: 'Fallido', RECHAZADO: 'Rechazado',
};
const ESTADO_COLOR_CORRIDA = {
  ENVIADO: '#6b7280', EN_PROCESO: '#2563eb', TESTS_OK: '#16a34a',
  ESPERANDO_APROBACION_SQL: '#c96a10', MIGRACION_APROBADA_PENDIENTE_APLICAR: '#c96a10',
  DEPLOYADO: '#16a34a', COMUNICADO: '#16a34a',
  TESTS_FALLARON: '#dc2626', FALLIDO: '#dc2626', RECHAZADO: '#6b7280',
};

let _seleccionados = new Set();

function esDeveloper() {
  return currentUser?.perfil === 'DEVELOPER';
}

function configRiesgoAgente() {
  return {
    modulosRojos: DB.agenteModulosRojos || [],
    palabrasRojo: DB.agentePalabrasClaveRojo || [],
    palabrasAmarillo: DB.agentePalabrasClaveAmarillo || [],
  };
}

function ticketsAbiertos() {
  return (DB.tickets || []).filter((t) => !t.anulado && t.estado === 'abierto');
}

function corridaDeTicket(ticketIdLocal) {
  return (DB.corridasAgente || [])
    .filter((c) => String(c.ticketIdLocal) === String(ticketIdLocal))
    .sort((a, b) => (b.id || 0) - (a.id || 0))[0] || null;
}

function getCorridaById(id) {
  return (DB.corridasAgente || []).find((c) => String(c.id) === String(id));
}

// ========== LISTADO ==========

export function renderAgente() {
  if (!esDeveloper()) return; // guarda extra en runtime, además de la del menú
  renderListaTicketsAgente();
  renderListaCorridasAgente();
}

export function renderListaTicketsAgente() {
  const cont = $('agente-lista-tickets');
  if (!cont) return;
  const q = ($('agente-buscar')?.value || '').trim().toLowerCase();
  const filtroEstado = $('agente-filtro-estado')?.value || '';
  const config = configRiesgoAgente();

  let tickets = ticketsAbiertos().map((t) => ({
    ...t,
    _riesgo: clasificarRiesgoTicket(t, config),
    _corrida: corridaDeTicket(t.id),
  }));

  if (q) tickets = tickets.filter((t) => `${t.titulo} ${t.modulo || ''}`.toLowerCase().includes(q));
  if (filtroEstado === 'sin_corrida') tickets = tickets.filter((t) => !t._corrida);
  if (filtroEstado === 'con_corrida') tickets = tickets.filter((t) => t._corrida);

  // Limpia selección de tickets que ya no están visibles/bloqueados.
  for (const id of [..._seleccionados]) {
    const t = tickets.find((x) => String(x.id) === String(id));
    if (!t || !puedeEnviarseAlAgente(t._riesgo)) _seleccionados.delete(id);
  }

  cont.innerHTML = tickets.length ? tickets.map((t) => {
    const bloqueado = !puedeEnviarseAlAgente(t._riesgo);
    const checked = _seleccionados.has(String(t.id));
    const corridaChip = t._corrida
      ? `<span class="badge" style="background:${ESTADO_COLOR_CORRIDA[t._corrida.estado] || '#6b7280'};color:white;font-size:10.5px;cursor:pointer;" onclick="event.stopPropagation();abrirDetalleCorridaAgente('${t._corrida.id}')">${ESTADO_LABEL_CORRIDA[t._corrida.estado] || t._corrida.estado}</span>`
      : '';
    return `<div class="card" style="padding:10px 12px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start;${bloqueado ? 'opacity:.65;' : ''}">
      <input type="checkbox" ${checked ? 'checked' : ''} ${bloqueado ? 'disabled title="' + motivoBloqueoRiesgo(t, config).replace(/"/g, '&quot;') + '"' : ''}
        onchange="toggleSeleccionTicketAgente('${t.id}',this.checked)" style="margin-top:4px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <b style="font-size:13px;">${t.titulo || '(sin título)'}</b>
          <span style="font-size:11px;">${RIESGO_LABEL[t._riesgo] || t._riesgo}</span>
        </div>
        <div style="font-size:11px;color:var(--texto-suave);margin-top:2px;">${t.modulo || '—'} · ${t.autor || '—'}</div>
        ${bloqueado ? `<div style="font-size:10.5px;color:#a11c1c;margin-top:4px;">🔒 ${motivoBloqueoRiesgo(t, config)}</div>` : ''}
        ${corridaChip ? `<div style="margin-top:6px;">${corridaChip}</div>` : ''}
      </div>
    </div>`;
  }).join('') : '<p class="text-muted" style="padding:20px;text-align:center;">No hay tickets abiertos.</p>';

  const barra = $('agente-barra-envio');
  const btn = $('agente-btn-enviar');
  if (barra) barra.style.display = _seleccionados.size ? 'block' : 'none';
  if (btn) {
    btn.textContent = `Enviar al agente (${_seleccionados.size})`;
    btn.disabled = _seleccionados.size === 0 || _seleccionados.size > MAX_TICKETS_POR_ENVIO;
  }
}

export function toggleSeleccionTicketAgente(ticketId, on) {
  if (on) {
    if (_seleccionados.size >= MAX_TICKETS_POR_ENVIO) {
      toast(`⚠️ Máximo ${MAX_TICKETS_POR_ENVIO} tickets por envío (Fase 1)`);
      renderListaTicketsAgente();
      return;
    }
    _seleccionados.add(String(ticketId));
  } else {
    _seleccionados.delete(String(ticketId));
  }
  renderListaTicketsAgente();
}

export function toggleModoSimulacionAgente() {
  // Sin persistencia propia a propósito — es un interruptor de la SESIÓN
  // de trabajo actual, no una config de negocio (punto 12: se prueba en
  // simulación primero, después se apaga para probar de verdad).
}

function modoSimulacionActivo() {
  return $('agente-modo-simulacion')?.checked !== false;
}

export async function enviarSeleccionAlAgente() {
  if (!_seleccionados.size) return;
  if (_seleccionados.size > MAX_TICKETS_POR_ENVIO) { toast(`⚠️ Máximo ${MAX_TICKETS_POR_ENVIO} tickets por envío`); return; }
  const config = configRiesgoAgente();
  const modoSimulacion = modoSimulacionActivo();
  const tickets = ticketsAbiertos().filter((t) => _seleccionados.has(String(t.id)));

  for (const t of tickets) {
    const nivelRiesgo = clasificarRiesgoTicket(t, config);
    if (!puedeEnviarseAlAgente(nivelRiesgo)) { toast(`⚠️ "${t.titulo}" está bloqueado (rojo) — no se envió.`); continue; }
    // Punto 6: "una branch y un PR por ticket" — se crea UNA corrida por
    // ticket, nunca se agrupan varios en un mismo disparo.
    const corrida = await crearCorridaAgente(t, { modoSimulacion, nivelRiesgo });
    if (!corrida) { toast(`⚠️ No se pudo crear la corrida para "${t.titulo}"`); continue; }
    await dispararAgente(corrida);
  }
  _seleccionados.clear();
  toast(modoSimulacion ? '🧪 Enviado en modo simulación — el resultado llega solo, esperá.' : '🚀 Enviado al agente.');
  renderAgente();
}

// ========== LISTADO DE CORRIDAS ==========

export function renderListaCorridasAgente() {
  const cont = $('agente-lista-corridas');
  if (!cont) return;
  const corridas = (DB.corridasAgente || []).slice().sort((a, b) => (b.id || 0) - (a.id || 0));
  cont.innerHTML = corridas.length ? corridas.map((c) => `
    <div class="card clk" style="padding:10px 12px;margin-bottom:8px;cursor:pointer;" onclick="abrirDetalleCorridaAgente('${c.id}')">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <b style="font-size:13px;">${c.ticketTitulo}${c.modoSimulacion ? ' <span style="font-size:10px;color:#6b7280;">(simulación)</span>' : ''}</b>
        <span class="badge" style="background:${ESTADO_COLOR_CORRIDA[c.estado] || '#6b7280'};color:white;">${ESTADO_LABEL_CORRIDA[c.estado] || c.estado}</span>
      </div>
      <div style="font-size:11px;color:var(--texto-suave);margin-top:2px;">${c.ticketModulo || '—'} · iniciada por ${c.iniciadaPor || '—'}</div>
    </div>`).join('') : '<p class="text-muted" style="padding:16px;text-align:center;">Todavía no se envió ningún ticket.</p>';
}

// ========== DETALLE DE CORRIDA (modal dinámico) ==========

let _corridaModalId = null;

function ensureModalDetalleCorridaAgente() {
  if ($('modal-agente-detalle')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-agente-detalle';
  m.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header"><h3 id="agente-det-titulo">Corrida</h3><button class="btn-close" onclick="cerrarModal('modal-agente-detalle')">×</button></div>
      <div class="modal-body">
        <div id="agente-det-resumen" style="margin-bottom:12px;"></div>
        <div id="agente-det-migracion" style="display:none;margin-bottom:12px;"></div>
        <div id="agente-det-timeline"></div>
      </div>
      <div class="modal-footer" id="agente-det-footer"></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetalleCorridaAgente(corridaId) {
  _corridaModalId = corridaId;
  ensureModalDetalleCorridaAgente();
  renderDetalleCorridaAgente();
  abrirModal('modal-agente-detalle');
}

export function renderDetalleCorridaAgente() {
  const c = getCorridaById(_corridaModalId);
  if (!c) return;
  $('agente-det-titulo').textContent = c.ticketTitulo;

  const filas = [
    ['Estado', `<span style="color:${ESTADO_COLOR_CORRIDA[c.estado] || '#333'};font-weight:600;">${ESTADO_LABEL_CORRIDA[c.estado] || c.estado}</span>`],
    ['Módulo', c.ticketModulo || '—'],
    ['Riesgo', RIESGO_LABEL[c.nivelRiesgo] || c.nivelRiesgo],
    ['Modo', c.modoSimulacion ? '🧪 Simulación' : 'Real'],
    ['Intentos', `${c.intentos || 0} / ${MAX_INTENTOS}`],
    ['Tests', c.testsCorridos != null ? `${c.testsCorridos} corridos — ${c.testsOk ? 'OK' : 'con errores'}` : '—'],
    ['PR', c.prUrl ? `<a href="${c.prUrl}" target="_blank" rel="noopener">${c.prUrl}</a>` : '—'],
  ];
  $('agente-det-resumen').innerHTML = `
    <div style="font-size:12.5px;line-height:1.9;">
      ${filas.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #f0f0f0;padding:3px 0;"><span style="color:var(--texto-suave);">${k}</span><span style="text-align:right;">${v}</span></div>`).join('')}
    </div>
    ${c.resumen ? `<div style="margin-top:10px;"><b style="font-size:12px;">Resumen del agente</b><p style="font-size:12.5px;margin:4px 0;">${c.resumen}</p></div>` : ''}
    ${c.error ? `<div style="margin-top:10px;padding:8px 10px;background:#fddede;border-radius:6px;font-size:12px;color:#a11c1c;">⚠️ ${c.error}</div>` : ''}
    ${(c.archivosTocados || []).length ? `<div style="margin-top:10px;"><b style="font-size:12px;">Archivos tocados</b><ul style="font-size:11.5px;margin:4px 0 0 18px;">${c.archivosTocados.map((a) => `<li>${a}</li>`).join('')}</ul></div>` : ''}
  `;

  const migDiv = $('agente-det-migracion');
  if (c.estado === 'ESPERANDO_APROBACION_SQL' && c.sqlMigracion) {
    migDiv.style.display = 'block';
    migDiv.innerHTML = `
      <div style="padding:12px;border-radius:8px;background:#fff3e0;border:1px solid #ffcc80;">
        <b style="font-size:12.5px;">📋 SQL a aprobar</b>
        <pre style="white-space:pre-wrap;font-size:11.5px;background:#fff;border:1px solid #eee;border-radius:6px;padding:8px;margin:8px 0;max-height:200px;overflow:auto;">${(c.sqlMigracion || '').replace(/</g, '&lt;')}</pre>
        <div style="font-size:11.5px;">Reversible: <b>${c.migracionReversible ? 'Sí' : 'No — irreversible'}</b></div>
        <div style="font-size:11.5px;">Filas estimadas: <b>${c.migracionFilasAfectadasEstimado || '—'}</b></div>
        <div style="margin-top:10px;display:flex;gap:8px;">
          <button class="btn" style="background:#16a34a;color:white;" onclick="aprobarMigracionAgente('${c.id}')">✔ Aprobar</button>
          <button class="btn btn-secondary" onclick="rechazarMigracionAgente('${c.id}')">✕ Rechazar</button>
        </div>
      </div>`;
  } else if (c.estado === 'MIGRACION_APROBADA_PENDIENTE_APLICAR') {
    migDiv.style.display = 'block';
    migDiv.innerHTML = `
      <div style="padding:12px;border-radius:8px;background:#fff3e0;border:1px solid #ffcc80;">
        <b style="font-size:12.5px;">✔ Aprobaste este SQL</b>
        <p style="font-size:12px;margin:6px 0;">Ahora corré este SQL en el editor de Supabase a mano — el agente nunca la ejecuta solo. Cuando ya esté aplicada, confirmalo acá para que el deploy siga.</p>
        <pre style="white-space:pre-wrap;font-size:11.5px;background:#fff;border:1px solid #eee;border-radius:6px;padding:8px;margin:8px 0;max-height:200px;overflow:auto;">${(c.sqlMigracion || '').replace(/</g, '&lt;')}</pre>
        <button class="btn btn-primary" onclick="confirmarMigracionAplicadaAgente('${c.id}')">Ya la apliqué — seguir</button>
      </div>`;
  } else {
    migDiv.style.display = 'none';
  }

  const timeline = auditoriaDeCorrida(c.id);
  $('agente-det-timeline').innerHTML = timeline.length ? `
    <b style="font-size:12px;">Historial</b>
    <div style="margin-top:6px;">${timeline.map((e) => `
      <div style="font-size:11.5px;padding:4px 0;border-bottom:1px solid #f5f5f5;"><b>${e.tipo}</b> — ${e.detalle || ''}</div>
    `).join('')}</div>` : '';

  const footer = $('agente-det-footer');
  const botones = [];
  if (c.estado === 'TESTS_FALLARON' || c.estado === 'FALLIDO') {
    if (puedeReintentar(c, MAX_INTENTOS)) botones.push(`<button class="btn btn-primary" onclick="reintentarCorridaAgente('${c.id}')">🔁 Reintentar</button>`);
    else botones.push(`<span style="font-size:11.5px;color:#a11c1c;">Se agotaron los ${MAX_INTENTOS} intentos.</span>`);
    botones.push(`<button class="btn btn-secondary" onclick="descartarCorridaAgente('${c.id}')">Descartar</button>`);
  }
  if (c.estado === 'DEPLOYADO') {
    botones.push(`<button class="btn btn-primary" onclick="abrirResolucionAgente('${c.id}')">Ver resolución</button>`);
  }
  if (c.estado === 'COMUNICADO') {
    botones.push(`<button class="btn btn-secondary" onclick="abrirResolucionAgente('${c.id}')">Ver resolución enviada</button>`);
  }
  footer.innerHTML = botones.join(' ') + ' <button class="btn btn-secondary" onclick="cerrarModal(\'modal-agente-detalle\')">Cerrar</button>';
}

// ========== APROBACIÓN DE MIGRACIÓN ==========

export async function aprobarMigracionAgente(corridaId) {
  const c = getCorridaById(corridaId);
  if (!c) return;
  c.estado = 'MIGRACION_APROBADA_PENDIENTE_APLICAR';
  c.migracionAprobadaPor = currentUser?.nombre || '';
  c.migracionAprobadaEn = new Date().toISOString();
  await supaSync('corridasAgente', c);
  await registrarAuditoriaAgente(c.id, 'aprobacion_sql', `SQL aprobado por ${c.migracionAprobadaPor}.`);
  toast('✔ Migración aprobada — aplicala en Supabase y confirmá acá.');
  renderDetalleCorridaAgente();
  renderAgente();
}

export async function rechazarMigracionAgente(corridaId) {
  const c = getCorridaById(corridaId);
  if (!c) return;
  c.estado = 'RECHAZADO';
  c.finalizadaEn = new Date().toISOString();
  await supaSync('corridasAgente', c);
  await registrarAuditoriaAgente(c.id, 'rechazo_sql', `SQL rechazado por ${currentUser?.nombre || ''}.`);
  toast('✕ Migración rechazada — la corrida queda frenada.');
  renderDetalleCorridaAgente();
  renderAgente();
}

export async function confirmarMigracionAplicadaAgente(corridaId) {
  const c = getCorridaById(corridaId);
  if (!c) return;
  c.migracionAplicadaConfirmadaPor = currentUser?.nombre || '';
  c.migracionAplicadaConfirmadaEn = new Date().toISOString();
  // Fase 1, sin CI que dispare el deploy real desde acá (ver PENDIENTES_FEDE.md):
  // confirmar la migración deja la corrida lista para deployar — el deploy en
  // sí sigue siendo el mismo flujo manual/automático de Vercel de siempre.
  c.estado = 'DEPLOYADO';
  c.deployadoEn = new Date().toISOString();
  await supaSync('corridasAgente', c);
  await registrarAuditoriaAgente(c.id, 'migracion_confirmada', `Migración aplicada, confirmado por ${c.migracionAplicadaConfirmadaPor}.`);
  toast('✔ Listo, corrida marcada como deployada.');
  renderDetalleCorridaAgente();
  renderAgente();
}

// ========== REINTENTAR / DESCARTAR ==========

export async function reintentarCorridaAgente(corridaId) {
  const c = getCorridaById(corridaId);
  if (!c) return;
  if (!puedeReintentar(c, MAX_INTENTOS)) { toast(`⚠️ Ya se agotaron los ${MAX_INTENTOS} intentos.`); return; }
  c.estado = 'ENVIADO';
  c.error = null;
  await supaSync('corridasAgente', c);
  await registrarAuditoriaAgente(c.id, 'envio', `Reintento #${(c.intentos || 0) + 1}.`);
  await dispararAgente(c);
  renderDetalleCorridaAgente();
  renderAgente();
}

export async function descartarCorridaAgente(corridaId) {
  const c = getCorridaById(corridaId);
  if (!c) return;
  c.estado = 'RECHAZADO';
  await supaSync('corridasAgente', c);
  cerrarModal('modal-agente-detalle');
  toast('Corrida descartada.');
  renderAgente();
}

// ========== RESOLUCIÓN ==========

function ensureModalResolucionAgente() {
  if ($('modal-agente-resolucion')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-agente-resolucion';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3>Resolución</h3><button class="btn-close" onclick="cerrarModal('modal-agente-resolucion')">×</button></div>
      <div class="modal-body">
        <textarea id="agente-res-texto" rows="12" style="width:100%;font-size:12.5px;padding:10px;border:1px solid var(--borde-fuerte);border-radius:var(--radio);"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="copiarResolucionAgente()">📋 Copiar</button>
        <button class="btn btn-primary" id="agente-res-btn-enviar" onclick="enviarResolucionAgente()">Enviar al equipo</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirResolucionAgente(corridaId) {
  const c = getCorridaById(corridaId);
  if (!c) return;
  ensureModalResolucionAgente();
  if (!c.resolucion) {
    const ticket = (DB.tickets || []).find((t) => String(t.id) === String(c.ticketIdLocal)) || { titulo: c.ticketTitulo, modulo: c.ticketModulo };
    c.resolucion = generarResolucion(ticket, c);
  }
  $('agente-res-texto').value = c.resolucion;
  $('agente-res-texto').dataset.corridaId = corridaId;
  const btnEnviar = $('agente-res-btn-enviar');
  if (btnEnviar) btnEnviar.style.display = c.estado === 'COMUNICADO' ? 'none' : '';
  abrirModal('modal-agente-resolucion');
}

export async function copiarResolucionAgente() {
  const texto = $('agente-res-texto')?.value || '';
  try {
    await navigator.clipboard.writeText(texto);
    toast('📋 Copiado — todavía no hay canal de WhatsApp conectado (ver PENDIENTES_FEDE.md), pegalo a mano por ahora.');
  } catch {
    toast('⚠️ No se pudo copiar automáticamente — seleccioná el texto a mano.');
  }
}

export async function enviarResolucionAgente() {
  const corridaId = $('agente-res-texto')?.dataset.corridaId;
  const c = getCorridaById(corridaId);
  if (!c) return;
  c.resolucion = $('agente-res-texto').value;
  c.resolucionEnviadaEn = new Date().toISOString();
  c.estado = 'COMUNICADO';
  await supaSync('corridasAgente', c);
  await registrarAuditoriaAgente(c.id, 'comunicacion', 'Resolución marcada como enviada (sin canal de WhatsApp conectado — punto 8 del spec).');
  toast('✔ Resolución marcada como enviada.');
  cerrarModal('modal-agente-resolucion');
  renderAgente();
}
