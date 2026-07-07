// Módulo Reasignaciones — reescrito de cero (Etapa 1, política A.11).
//
// El módulo viejo tenía bugs de persistencia graves: aprobar/rechazar
// cambiaban el estado solo en memoria (nunca llamaban supaSync) y el
// acceso a las reasignaciones era por índice de un array filtrado (frágil:
// filtrar la lista podía terminar aprobando la fila equivocada). Acá todo
// es por id y todo persiste.
//
// Modelo de 6 estados: Borrador, Pendiente, Aprobada esperando fecha
// efectiva, Aprobada ejecutada, Rechazada, Anulada.
//
// OJO — compatibilidad con legacy.js: DB.motivosReasignacion y
// DB.aprobadoresReas se mantienen como arrays planos de strings (así los
// consume legacy.js en Configuración de usuarios y en Gestión de precios).
// La config real y persistida vive en DB.motivosReasignacionCfg /
// DB.aprobadoresReasCfg (arrays de objetos {id, nombre|cargo, anulado}) y
// se sincroniza hacia las vistas planas con sincronizarConfigReasignaciones().

import { DB, currentUser } from '@shared/state.js';
import { $, avatarEl, badge, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, abrirModalInput } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { construirMenu } from '@shared/nav.js';

// ========== HELPERS DE FECHA ==========

const hoyISO = () => new Date().toISOString().slice(0, 10);
function mananaISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function ddmm(fechaISO) {
  if (!fechaISO) return '';
  const p = fechaISO.split('-');
  if (p.length !== 3) return fechaISO;
  return p[2] + '/' + p[1] + '/' + p[0];
}
const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };

// ========== HELPER — BUSCAR POR ID (nunca por índice) ==========

const getReasById = (id) => (DB.reasignaciones || []).find(r => String(r.id) === String(id));

// ========== SINCRONIZAR CONFIG (compat legacy.js) ==========

export function sincronizarConfigReasignaciones() {
  const motivosActivos = (DB.motivosReasignacionCfg || []).filter(m => !m.anulado).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  if (motivosActivos.length) DB.motivosReasignacion = motivosActivos.map(m => m.nombre);
  const aprobActivos = (DB.aprobadoresReasCfg || []).filter(a => !a.anulado);
  if (aprobActivos.length) DB.aprobadoresReas = aprobActivos.map(a => a.cargo);
}

// ========== TABS ==========

export function tabReas(tab, btn) {
  document.querySelectorAll('#screen-reasignaciones .tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#screen-reasignaciones .tab-btn').forEach(b => b.classList.remove('active'));
  const content = $('reas-tab-' + tab);
  if (content) content.classList.add('active');
  if (btn) btn.classList.add('active');
  else document.querySelector(`#screen-reasignaciones .tab-btn[data-reas-tab="${tab}"]`)?.classList.add('active');
  renderReasignaciones();
}

// Punto de entrada de la pantalla (screenConfig.render) — siempre entra
// por la pestaña Pendientes, sin importar en qué pestaña se había
// quedado la última visita (ver fix en src/shared/nav.js).
export function renderReasignacionesInicial() {
  tabReas('pendientes');
}

// ========== EJECUCIÓN AUTOMÁTICA POR FECHA ==========
// Al entrar al módulo, las "Aprobada esperando fecha efectiva" cuya fecha
// ya llegó pasan solas a "Aprobada ejecutada" (sin cron real todavía).

function chequearEjecucionesPendientes() {
  const hoy = hoyISO();
  const aEjecutar = (DB.reasignaciones || []).filter(r =>
    !r.anulado && r.estado === 'Aprobada esperando fecha efectiva' && r.fechaEfectiva && r.fechaEfectiva <= hoy
  );
  aEjecutar.forEach(r => {
    r.estado = 'Aprobada ejecutada';
    r.fechaEjecucion = hoy;
    ejecutarReasignacion(r);
    supaSync('reasignaciones', r);
  });
}

// Aplica el cambio real al legajo (servicio/supervisor/función/zona +
// historial) y marca el pedido vinculado como Cubierto, si corresponde.
function ejecutarReasignacion(r) {
  const leg = (DB.legajos || []).find(l => String(l.nro) === String(r.nroSocio));
  if (leg) {
    if (!leg.historialMovimientos) leg.historialMovimientos = [];
    leg.historialMovimientos.push({
      fecha: r.fechaEfectiva, servicioOrigen: r.servicioOrigen, supervisorOrigen: r.supervisorOrigen,
      servicioDestino: r.servicioDestino, supervisorDestino: r.supervisorDestino,
      motivo: r.motivo, descripcion: r.descripcion,
    });
    leg.servicio = r.servicioDestino;
    leg.supervisor = r.supervisorDestino;
    if (r.funcionDestino) leg.funcion = r.funcionDestino;
    if (r.zonaDestino) leg.zona = r.zonaDestino;
    supaSync('legajos', leg);
    if (window.renderLegajos) window.renderLegajos();
  }
  if (r.pedidoVinculadoIdLocal) {
    const ped = (DB.pedidos || []).find(p => String(p.id) === String(r.pedidoVinculadoIdLocal));
    if (ped && ped.estado !== 'Cubierto') {
      ped.estado = 'Cubierto';
      supaSync('pedidos', ped);
      if (window.renderPedidos) window.renderPedidos();
    }
  }
}

// ========== RENDER PRINCIPAL ==========

export function renderReasignaciones() {
  chequearEjecucionesPendientes();
  sincronizarConfigReasignaciones();

  const activas = (DB.reasignaciones || []).filter(r => !r.anulado);
  const pend = activas.filter(r => r.estado === 'Pendiente' || r.estado === 'Aprobada esperando fecha efectiva');
  const hoy = new Date();
  // Bug corregido: antes filtraba por año, no por mes ("Aprobadas este mes").
  const esteMes = activas.filter(r => {
    if (r.estado !== 'Aprobada ejecutada' || !r.fechaEjecucion) return false;
    const d = new Date(r.fechaEjecucion + 'T00:00:00');
    return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
  });

  ss('st-reas-pend', pend.length);
  ss('st-reas-aprobadas', esteMes.length);
  ss('st-reas-total', activas.length);

  const movsPorAsoc = {};
  activas.filter(r => r.estado === 'Aprobada ejecutada').forEach(r => {
    movsPorAsoc[r.nroSocio] = (movsPorAsoc[r.nroSocio] || 0) + 1;
  });
  ss('st-reas-rotativos', Object.values(movsPorAsoc).filter(v => v >= 3).length);

  renderReasPend(pend);
  renderReasHist(activas);
  renderRotacion();
  poblarSelectsReas();
}

// ========== TAB PENDIENTES ==========

export function renderReasPend(lista) {
  const tbody = $('tbody-reas-pend'); if (!tbody) return;
  const rows = lista || (DB.reasignaciones || []).filter(r => !r.anulado && (r.estado === 'Pendiente' || r.estado === 'Aprobada esperando fecha efectiva'));
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="15"><div class="empty-state"><div class="icon">✅</div><p>Sin reasignaciones pendientes</p></div></td></tr>';
    return;
  }
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const puedeGestionar = puedeAprobarReasignacion();
  tbody.innerHTML = rows.map(r => {
    const impactoSeguro = r.requiereAltura || r.requierePolizaEsp;
    const dias = Math.max(0, Math.floor((hoy - new Date(r.fechaSolicitud + 'T00:00:00')) / 86400000));
    const colorDias = dias >= 7 ? 'var(--rojo)' : dias >= 3 ? 'var(--naranja)' : 'var(--verde)';
    return `<tr>
      <td style="font-weight:500;">${r.nombreAsociado}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${r.nroSocio}</td>
      <td style="font-size:12px;">${r.servicioOrigen}</td>
      <td style="font-size:12px;">${r.supervisorOrigen}</td>
      <td style="font-size:12px;font-weight:500;color:var(--azul);">${r.servicioDestino}</td>
      <td style="font-size:12px;">${r.supervisorDestino}</td>
      <td><span class="chip" style="font-size:10px;">${r.motivo || '—'}</span></td>
      <td style="font-size:12px;color:var(--texto-suave);">${ddmm(r.fechaSolicitud)}</td>
      <td style="font-size:12px;">${ddmm(r.fechaEfectiva)}</td>
      <td style="font-size:12px;">${r.elevadoPor}</td>
      <td style="font-size:12px;">${r.originadaPor}</td>
      <td style="text-align:center;font-size:12px;font-weight:600;color:${colorDias};">${dias}</td>
      <td style="text-align:center;">${impactoSeguro ? '<span class="badge badge-naranja" style="font-size:10px;">⚠️ Revisar</span>' : '<span class="badge badge-verde" style="font-size:10px;">Sin cambios</span>'}</td>
      <td>${badge(r.estado)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${puedeGestionar && r.estado === 'Pendiente' ? `
            <button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" data-action="aprobar" data-id="${r.id}">✓ Aprobar</button>
            <button class="btn btn-xs" style="background:var(--rojo-suave);color:var(--rojo);border:1px solid #f5c6c0;" data-action="rechazar" data-id="${r.id}">✕</button>` : ''}
          <button class="btn btn-xs btn-secondary" data-action="ver" data-id="${r.id}">Ver</button>
          ${r.estado === 'Pendiente' ? `<button class="btn btn-xs btn-secondary" data-action="anular" data-id="${r.id}">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  bindTbodyReas(tbody);
}

// ========== TAB HISTORIAL ==========

export function renderReasHist(lista) {
  const tbody = $('tbody-reas-hist'); if (!tbody) return;
  const rows = lista || (DB.reasignaciones || []).filter(r => !r.anulado);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="icon">🔄</div><p>Sin reasignaciones registradas</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const resolvioPor = r.estado === 'Anulada' ? (r.anuladoPor || '—') : (r.aprobadoPor || '—');
    return `<tr>
      <td style="font-weight:500;">${r.nombreAsociado}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${r.nroSocio}</td>
      <td style="font-size:12px;">${r.servicioOrigen}</td>
      <td style="font-size:12px;font-weight:500;color:var(--azul);">${r.servicioDestino}</td>
      <td><span class="chip" style="font-size:10px;">${r.motivo || '—'}</span></td>
      <td style="font-size:12px;color:var(--texto-suave);">${ddmm(r.fechaEfectiva)}</td>
      <td style="font-size:12px;">${r.elevadoPor}</td>
      <td style="font-size:12px;">${resolvioPor}</td>
      <td>${badge(r.estado)}</td>
      <td>${r.estado === 'Borrador'
        ? `<button class="btn btn-secondary btn-xs" data-action="retomar" data-id="${r.id}">Retomar</button>`
        : `<button class="btn btn-secondary btn-xs" data-action="ver" data-id="${r.id}">Ver</button>`}</td>
    </tr>`;
  }).join('');
  bindTbodyReas(tbody);
}

function bindTbodyReas(tbody) {
  tbody.onclick = (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'aprobar') aprobarReasignacionPorId(id);
    else if (action === 'rechazar') rechazarReasignacionPorId(id);
    else if (action === 'anular') anularReasignacionPorId(id);
    else if (action === 'ver') abrirDetalleReasignacionPorId(id);
    else if (action === 'retomar') abrirBorradorReasignacionPorId(id);
  };
}

// ========== TAB ROTACIÓN ==========

function calcularMovimientosPorAsociado() {
  const ejecutadas = (DB.reasignaciones || []).filter(r => !r.anulado && r.estado === 'Aprobada ejecutada');
  const movsPorAsoc = {};
  ejecutadas.forEach(r => {
    const key = String(r.nroSocio);
    if (!movsPorAsoc[key]) movsPorAsoc[key] = { nro: r.nroSocio, nombre: r.nombreAsociado, movs: [] };
    movsPorAsoc[key].movs.push(r);
  });
  (DB.legajos || []).forEach(l => {
    const key = String(l.nro);
    if (!movsPorAsoc[key]) movsPorAsoc[key] = { nro: l.nro, nombre: l.nombre, movs: [] };
  });
  return Object.values(movsPorAsoc).sort((a, b) => b.movs.length - a.movs.length);
}

export function renderRotacion(lista) {
  const el = $('grilla-rotacion'); if (!el) return;
  const datos = lista || calcularMovimientosPorAsociado();
  if (!datos.length) { el.innerHTML = '<div class="empty-state"><div class="icon">🔄</div><p>Sin movimientos registrados</p></div>'; return; }
  el.innerHTML = datos.map(a => {
    const l = (DB.legajos || []).find(x => String(x.nro) === String(a.nro)) || {};
    const cantMovs = a.movs.length;
    const riesgo = cantMovs >= 3 ? 'badge-rojo' : cantMovs >= 2 ? 'badge-acento' : cantMovs >= 1 ? 'badge-azul' : 'badge-gris';
    const servicioActual = l.servicio || (a.movs[a.movs.length - 1] || {}).servicioDestino || '—';
    return `<div data-action="ver-rotacion" data-nro="${a.nro}"
      style="background:white;border:1px solid var(--borde);border-radius:var(--radio-lg);overflow:hidden;cursor:pointer;transition:box-shadow .15s;"
      onmouseover="this.style.boxShadow='0 2px 12px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
      <div style="padding:14px 18px;display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${avatarEl(a.nombre, 36)}
          <div>
            <div style="font-weight:600;font-size:14px;">${a.nombre}</div>
            <div style="font-size:12px;color:var(--texto-suave);">N°${a.nro} · ${l.funcion || '—'} · ${servicioActual}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge ${riesgo}">${cantMovs} movimiento${cantMovs !== 1 ? 's' : ''}</span>
          <span style="font-size:18px;color:var(--borde-fuerte);">›</span>
        </div>
      </div>
    </div>`;
  }).join('');
  el.onclick = (e) => {
    const card = e.target.closest('[data-action="ver-rotacion"]');
    if (card) abrirDetalleRotacionPorNro(card.dataset.nro);
  };
}

export function filtrarRotacion() {
  const busq = ($('buscar-rot') || { value: '' }).value.toLowerCase();
  const cant = ($('cf-rot-cant') || { value: '' }).value;
  let datos = calcularMovimientosPorAsociado();
  if (busq) datos = datos.filter(a => a.nombre.toLowerCase().includes(busq) || String(a.nro).includes(busq));
  if (cant) datos = datos.filter(a => a.movs.length >= parseInt(cant, 10));
  renderRotacion(datos);
}

function ensureModalDetalleRotacion() {
  if ($('modal-reas-rotacion')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-reas-rotacion';
  m.innerHTML = [
    '<div class="modal" style="max-width:720px;">',
      '<div class="modal-header"><div><h3 id="reas-rot-titulo" style="margin:0;"></h3><div id="reas-rot-sub" style="font-size:12px;color:var(--texto-suave);"></div></div><button class="btn-close" onclick="cerrarModal(\'modal-reas-rotacion\')">×</button></div>',
      '<div class="modal-body"><div id="reas-rot-body"></div></div>',
      '<div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal(\'modal-reas-rotacion\')">Cerrar</button></div>',
    '</div>',
  ].join('');
  document.body.appendChild(m);
}

// Reemplaza el modal roto original (HTML sin cerrar, apuntaba a un
// modal-reas-detalle que ni siquiera existía en index.html).
export function abrirDetalleRotacionPorNro(nro) {
  const datos = calcularMovimientosPorAsociado();
  const a = datos.find(x => String(x.nro) === String(nro));
  if (!a) return;
  const l = (DB.legajos || []).find(x => String(x.nro) === String(nro)) || {};
  const movs = [...a.movs].sort((x, y) => (x.fechaEfectiva || '').localeCompare(y.fechaEfectiva || ''));

  ensureModalDetalleRotacion();
  $('reas-rot-titulo').textContent = a.nombre;
  $('reas-rot-sub').textContent = `N°${nro} · ${l.funcion || '—'} · Servicio actual: ${l.servicio || '—'}`;

  const pasos = ['Alta', ...movs.map(m => m.servicioDestino)];
  const timelineHtml = pasos.map((s, i) => `
    <div style="display:flex;align-items:center;">
      <div style="background:${i === pasos.length - 1 ? 'var(--azul)' : 'var(--fondo)'};color:${i === pasos.length - 1 ? 'white' : 'var(--texto-suave)'};border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;white-space:nowrap;">${s}</div>
      ${i < pasos.length - 1 ? '<span style="margin:0 6px;color:var(--texto-suave);">→</span>' : ''}
    </div>`).join('');

  const filasTabla = movs.map(m => `<tr>
    <td style="padding:6px 8px;border:1px solid var(--borde);">${m.servicioDestino}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);">${m.supervisorDestino}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);">${m.motivo || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);">${ddmm(m.fechaEfectiva)}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;">${badge(m.estado)}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);">${m.descripcion || '—'}</td>
  </tr>`).join('');

  $('reas-rot-body').innerHTML = `
    <div style="overflow-x:auto;padding:16px 0 20px;display:flex;">${timelineHtml}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#374151;color:white;">
        <th style="padding:7px 12px;border:1px solid #6b7280;text-align:left;">Servicio destino</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;">Supervisor</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;">Motivo</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;">Fecha</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;text-align:center;">Estado</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;">Descripción</th>
      </tr></thead>
      <tbody>${filasTabla || '<tr><td colspan="6" style="padding:10px;text-align:center;color:var(--texto-muy-suave);">Sin reasignaciones ejecutadas</td></tr>'}</tbody>
    </table>`;
  abrirModal('modal-reas-rotacion');
}

// ========== FILTROS (unificados — antes había duplicados que leían distinto) ==========

export function filtrarReas() {
  const nom = ($('cf-rn-nombre') || { value: '' }).value.toLowerCase();
  const orig = ($('cf-rn-orig') || { value: '' }).value.toLowerCase();
  const dest = ($('cf-rn-dest') || { value: '' }).value.toLowerCase();
  const mot = ($('cf-rn-motivo') || { value: '' }).value;
  const sup = ($('cf-reas-sup') || { value: '' }).value;
  const bg = ($('buscar-reas') || { value: '' }).value.toLowerCase();
  const base = (DB.reasignaciones || []).filter(r => !r.anulado && (r.estado === 'Pendiente' || r.estado === 'Aprobada esperando fecha efectiva'));
  renderReasPend(base.filter(r =>
    (!nom || r.nombreAsociado.toLowerCase().includes(nom)) &&
    (!orig || r.servicioOrigen.toLowerCase().includes(orig)) &&
    (!dest || r.servicioDestino.toLowerCase().includes(dest)) &&
    (!mot || r.motivo === mot) &&
    (!sup || r.supervisorOrigen === sup || r.supervisorDestino === sup) &&
    (!bg || r.nombreAsociado.toLowerCase().includes(bg))
  ));
}

export function filtrarReasH() {
  const nom = ($('cf-rh-nombre') || { value: '' }).value.toLowerCase();
  const mot = ($('cf-rh-mot2') || { value: '' }).value;
  const est = ($('cf-rh-est') || { value: '' }).value;
  const bg = ($('buscar-reas-h') || { value: '' }).value.toLowerCase();
  renderReasHist((DB.reasignaciones || []).filter(r => !r.anulado).filter(r =>
    (!nom || r.nombreAsociado.toLowerCase().includes(nom)) &&
    (!mot || r.motivo === mot) &&
    (!est || r.estado === est) &&
    (!bg || r.nombreAsociado.toLowerCase().includes(bg) || r.servicioOrigen.toLowerCase().includes(bg) || r.servicioDestino.toLowerCase().includes(bg))
  ));
}

// ========== SELECTS ==========

export function poblarSelectsReas() {
  const fS = (id, items) => { const el = $(id); if (!el) return; const ph = el.options[0]?.outerHTML || ''; el.innerHTML = ph + [...new Set(items)].filter(Boolean).map(i => `<option>${i}</option>`).join(''); };
  const fDL = (id, items) => { const el = $(id); if (el) el.innerHTML = items.map(i => `<option value="${i}">`).join(''); };

  fS('reas-motivo', DB.motivosReasignacion);
  fS('cf-rn-motivo', DB.motivosReasignacion);
  fS('cf-rh-mot2', DB.motivosReasignacion);
  fS('cf-reas-sup', DB.supervisores);
  fS('reas-sup-dest', DB.supervisores);

  const pedidosPend = (DB.pedidos || []).filter(p => p.estado === 'Pendiente');
  const selPed = $('reas-pedido-vinculado');
  if (selPed) {
    const actual = selPed.value;
    selPed.innerHTML = '<option value="">Sin vinculación</option>'
      + pedidosPend.map(p => `<option value="${p.id}">${p.servicio} — ${p.puesto || ''} (${p.supervisor})</option>`).join('');
    if (actual) selPed.value = actual;
  }

  fDL('dl-asoc-reas', (DB.legajos || []).filter(l => l.estado === 'Activo').map(l => `${l.nombre} (N°${l.nro})`));
  fDL('dl-serv-reas', DB.servicios);

  renderConfigMotivosReas();
  renderConfigAprobadoresReas();
}

export function autocompletarReas() {
  const val = ($('reas-asociado') || { value: '' }).value;
  const m = val.match(/N°(\d+)/);
  if (!m) return;
  const leg = (DB.legajos || []).find(l => String(l.nro) === m[1]);
  if (!leg) return;
  if ($('reas-nro')) $('reas-nro').value = leg.nro;
  if ($('reas-serv-orig')) $('reas-serv-orig').value = leg.servicio;
  if ($('reas-sup-orig')) $('reas-sup-orig').value = leg.supervisor;
  if ($('reas-categoria')) $('reas-categoria').value = leg.funcion;
}

// ========== ABRIR MODAL — NUEVA / RETOMAR BORRADOR ==========

export function abrirNuevaReasignacion() {
  ['reas-asociado', 'reas-nro', 'reas-serv-orig', 'reas-sup-orig', 'reas-categoria', 'reas-serv-dest', 'reas-desc'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  const fechaEl = $('reas-fecha'); if (fechaEl) { fechaEl.value = ''; fechaEl.min = mananaISO(); }
  ['reas-motivo', 'reas-originada-por', 'reas-altura', 'reas-poliza'].forEach(id => {
    const el = $(id); if (el) el.selectedIndex = 0;
  });
  const pedEl = $('reas-pedido-vinculado'); if (pedEl) pedEl.value = '';
  const elevEl = $('reas-elevado-por'); if (elevEl) elevEl.value = currentUser?.nombre || '';
  delete ($('modal-reasignacion') || {}).dataset?.editId;
  poblarSelectsReas();
  abrirModal('modal-reasignacion');
}

// Reasignar directo desde el legajo de un asociado (precarga el asociado).
export function abrirModalReasDesde(nro) {
  abrirNuevaReasignacion();
  const leg = (DB.legajos || []).find(l => l.nro === nro);
  if (!leg) return;
  if ($('reas-asociado')) $('reas-asociado').value = `${leg.nombre} (N°${leg.nro})`;
  if ($('reas-nro')) $('reas-nro').value = leg.nro;
  if ($('reas-serv-orig')) $('reas-serv-orig').value = leg.servicio;
  if ($('reas-sup-orig')) $('reas-sup-orig').value = leg.supervisor;
  if ($('reas-categoria')) $('reas-categoria').value = leg.funcion;
}

export function abrirBorradorReasignacionPorId(id) {
  const r = getReasById(id);
  if (!r || r.estado !== 'Borrador') return;
  poblarSelectsReas();
  const leg = (DB.legajos || []).find(l => String(l.nro) === String(r.nroSocio));
  if ($('reas-asociado')) $('reas-asociado').value = leg ? `${leg.nombre} (N°${leg.nro})` : r.nombreAsociado;
  if ($('reas-nro')) $('reas-nro').value = r.nroSocio;
  if ($('reas-serv-orig')) $('reas-serv-orig').value = r.servicioOrigen;
  if ($('reas-sup-orig')) $('reas-sup-orig').value = r.supervisorOrigen;
  if ($('reas-categoria')) $('reas-categoria').value = r.funcionOrigen || (leg ? leg.funcion : '');
  if ($('reas-serv-dest')) $('reas-serv-dest').value = r.servicioDestino || '';
  if ($('reas-sup-dest')) $('reas-sup-dest').value = r.supervisorDestino || '';
  if ($('reas-motivo')) $('reas-motivo').value = r.motivo || '';
  const fechaEl = $('reas-fecha'); if (fechaEl) { fechaEl.min = mananaISO(); fechaEl.value = r.fechaEfectiva || ''; }
  if ($('reas-originada-por')) $('reas-originada-por').value = r.originadaPor || '';
  if ($('reas-pedido-vinculado')) $('reas-pedido-vinculado').value = r.pedidoVinculadoIdLocal || '';
  if ($('reas-desc')) $('reas-desc').value = r.descripcion || '';
  if ($('reas-altura')) $('reas-altura').value = r.requiereAltura ? 'Sí — agregar cobertura adicional' : 'No';
  if ($('reas-poliza')) $('reas-poliza').value = r.requierePolizaEsp ? 'Sí — actualizar póliza' : 'No';
  if ($('reas-elevado-por')) $('reas-elevado-por').value = r.elevadoPor || '';
  $('modal-reasignacion').dataset.editId = r.id;
  abrirModal('modal-reasignacion');
}

// ========== GUARDAR (Borrador o Elevar) ==========

export function guardarReasignacion(estadoDestino) {
  const nroVal = ($('reas-nro') || { value: '' }).value;
  const leg = (DB.legajos || []).find(l => String(l.nro) === String(nroVal));
  const dest = cleanText(($('reas-serv-dest') || { value: '' }).value);
  const motivo = ($('reas-motivo') || { value: '' }).value;
  const fechaEfectiva = ($('reas-fecha') || { value: '' }).value;
  const originadaPor = ($('reas-originada-por') || { value: '' }).value;
  const descripcion = cleanText(($('reas-desc') || { value: '' }).value);

  if (!leg) { toast('⚠️ Seleccioná un asociado'); return; }

  if (estadoDestino !== 'Borrador') {
    // Validaciones completas — solo se exigen al elevar, no al guardar borrador.
    if (leg.estado !== 'Activo') { toast('⚠️ El asociado no está activo, no se puede reasignar'); return; }
    if (!dest) { toast('⚠️ Ingresá el servicio destino'); $('reas-serv-dest').focus(); return; }
    if (dest === leg.servicio) { toast('⚠️ El servicio destino debe ser distinto al actual'); return; }
    if (!motivo) { toast('⚠️ Seleccioná un motivo'); $('reas-motivo').focus(); return; }
    if (!fechaEfectiva) { toast('⚠️ Ingresá la fecha efectiva'); $('reas-fecha').focus(); return; }
    const hoy = hoyISO();
    if (fechaEfectiva <= hoy) { toast('⚠️ La fecha efectiva debe ser posterior a hoy (mínimo 24hs)'); $('reas-fecha').focus(); return; }
    const maxFecha = new Date(); maxFecha.setMonth(maxFecha.getMonth() + 3);
    if (fechaEfectiva > maxFecha.toISOString().slice(0, 10)) { toast('⚠️ La fecha efectiva no puede superar los 3 meses'); $('reas-fecha').focus(); return; }
    if (!originadaPor) { toast('⚠️ Indicá quién originó la solicitud'); $('reas-originada-por').focus(); return; }
    if (!descripcion) { toast('⚠️ La descripción es obligatoria'); $('reas-desc').focus(); return; }
  }

  const modal = $('modal-reasignacion');
  const editId = modal?.dataset?.editId;
  const r = editId ? getReasById(editId) : {
    id: Date.now(),
    nroSocio: String(leg.nro),
    fechaSolicitud: hoyISO(),
    elevadoPor: currentUser?.nombre || 'Sistema',
  };
  if (!r) { toast('⚠️ No se encontró el borrador'); return; }

  r.legajoIdLocal = String(leg.nro);
  r.nombreAsociado = leg.nombre;
  r.servicioOrigen = leg.servicio;
  r.supervisorOrigen = leg.supervisor;
  r.funcionOrigen = leg.funcion || '';
  r.zonaOrigen = leg.zona || '';
  r.servicioDestino = dest;
  r.supervisorDestino = ($('reas-sup-dest') || { value: '' }).value;
  r.motivo = motivo;
  r.fechaEfectiva = fechaEfectiva || null;
  r.descripcion = descripcion;
  r.originadaPor = originadaPor;
  r.pedidoVinculadoIdLocal = ($('reas-pedido-vinculado') || { value: '' }).value || null;
  r.requiereAltura = (($('reas-altura') || { value: 'No' }).value || 'No') !== 'No';
  r.requierePolizaEsp = (($('reas-poliza') || { value: 'No' }).value || 'No') !== 'No';
  r.estado = estadoDestino;
  if (editId) { r.editadoPor = currentUser?.nombre || ''; r.editadoEn = new Date().toISOString(); }

  if (!editId) DB.reasignaciones.push(r);
  if (modal) delete modal.dataset.editId;

  supaSync('reasignaciones', r);
  cerrarModal('modal-reasignacion');
  construirMenu(); renderReasignaciones();
  toast(estadoDestino === 'Borrador' ? '✓ Borrador guardado' : '✓ Reasignación elevada para aprobación');
}

// ========== APROBAR / RECHAZAR / ANULAR (por id, con guard de idempotencia) ==========

export function puedeAprobarReasignacion() {
  if (!currentUser) return false;
  if (currentUser.perfil === 'Administrador total') return true;
  const perfilOk = (DB.aprobadoresReas || []).some(a => {
    const al = a.toLowerCase();
    const pl = (currentUser.perfil || '').toLowerCase();
    return (al.includes('operaciones') && pl.includes('operacion')) ||
           (al.includes('rrhh') && pl.includes('rrhh')) ||
           (al.includes('administrador') && pl.includes('administrador'));
  });
  if (perfilOk) return true;
  return (DB.aprobadoresReas || []).some(a => a === currentUser.funcion);
}

export function aprobarReasignacionPorId(id) {
  if (!puedeAprobarReasignacion()) {
    toast(`⛔ Solo pueden aprobar: ${(DB.aprobadoresReas || []).join(' y ')}`);
    return;
  }
  const r = getReasById(id);
  if (!r) { toast('⚠️ Reasignación no encontrada'); return; }
  if (r.estado !== 'Pendiente') { toast(`⚠️ Esta reasignación ya fue resuelta (estado actual: ${r.estado})`); return; }

  const hoy = hoyISO();
  const ejecutaYa = r.fechaEfectiva <= hoy;
  r.estado = ejecutaYa ? 'Aprobada ejecutada' : 'Aprobada esperando fecha efectiva';
  r.aprobadoPor = currentUser?.nombre || 'Administrador';
  r.fechaAprobacion = new Date().toISOString();
  if (ejecutaYa) {
    r.fechaEjecucion = hoy;
    ejecutarReasignacion(r);
  }
  supaSync('reasignaciones', r);
  construirMenu(); renderReasignaciones();
  toast(ejecutaYa
    ? `✅ Aprobada y ejecutada — ${r.nombreAsociado} → ${r.servicioDestino}`
    : `✅ Aprobada — se ejecutará el ${ddmm(r.fechaEfectiva)}`, 5000);
}

export function rechazarReasignacionPorId(id) {
  if (!puedeAprobarReasignacion()) {
    toast(`⛔ Solo pueden rechazar: ${(DB.aprobadoresReas || []).join(' y ')}`);
    return;
  }
  const r = getReasById(id);
  if (!r) { toast('⚠️ Reasignación no encontrada'); return; }
  if (r.estado !== 'Pendiente') { toast(`⚠️ Ya fue resuelta (estado actual: ${r.estado})`); return; }

  abrirModalInput({ titulo: 'Rechazar reasignación', etiqueta: 'Motivo del rechazo' }, (motivo) => {
    r.estado = 'Rechazada';
    r.motivoRechazo = motivo;
    r.aprobadoPor = currentUser?.nombre || 'Administrador';
    r.fechaRechazo = new Date().toISOString();
    supaSync('reasignaciones', r);
    construirMenu(); renderReasignaciones();
    toast(`❌ Reasignación de ${r.nombreAsociado} rechazada`);
  });
}

export function anularReasignacionPorId(id) {
  const r = getReasById(id);
  if (!r) return;
  if (!['Borrador', 'Pendiente'].includes(r.estado)) {
    toast('⚠️ Solo se pueden anular reasignaciones en Borrador o Pendiente');
    return;
  }
  if (!confirm(`¿Anular la reasignación de ${r.nombreAsociado}?`)) return;
  r.estado = 'Anulada';
  r.anuladoPor = currentUser?.nombre || 'Administrador';
  r.fechaAnulacion = new Date().toISOString();
  supaSync('reasignaciones', r);
  construirMenu(); renderReasignaciones();
  toast('✓ Reasignación anulada');
}

// ========== VER DETALLE (solo lectura) ==========
// Reemplaza el reuso confuso de modal-ver-pedido (de Pedidos) por un modal
// propio del módulo.

function ensureModalVerReas() {
  if ($('modal-reas-ver')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-reas-ver';
  m.innerHTML = [
    '<div class="modal" style="max-width:600px;">',
      '<div class="modal-header"><h3 id="reas-ver-titulo">Reasignación</h3><button class="btn-close" onclick="cerrarModal(\'modal-reas-ver\')">×</button></div>',
      '<div class="modal-body"><div id="reas-ver-body"></div></div>',
      '<div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal(\'modal-reas-ver\')">Cerrar</button></div>',
    '</div>',
  ].join('');
  document.body.appendChild(m);
}

export function abrirDetalleReasignacionPorId(id) {
  const r = getReasById(id);
  if (!r) { toast('⚠️ Reasignación no encontrada'); return; }
  ensureModalVerReas();
  $('reas-ver-titulo').textContent = `🔄 ${r.nombreAsociado} (N°${r.nroSocio})`;
  const item = (k, v) => `<div class="info-item"><div class="key">${k}</div><div class="val">${v || '—'}</div></div>`;
  let html = '<div class="info-grid" style="margin-bottom:14px;">'
    + item('Estado', badge(r.estado))
    + item('Origen', `${r.servicioOrigen} · ${r.supervisorOrigen}`)
    + item('Destino', `${r.servicioDestino} · ${r.supervisorDestino}`)
    + item('Motivo', r.motivo)
    + item('Fecha solicitud', ddmm(r.fechaSolicitud))
    + item('Fecha efectiva', ddmm(r.fechaEfectiva))
    + item('Fecha ejecución', r.fechaEjecucion ? ddmm(r.fechaEjecucion) : '—')
    + item('Elevado por', r.elevadoPor)
    + item('Originada por', r.originadaPor)
    + '</div>'
    + '<div class="form-section" style="margin-bottom:8px;">Descripción</div>'
    + `<p style="font-size:13px;color:var(--texto-suave);">${r.descripcion || 'Sin descripción'}</p>`;
  if (r.estado === 'Rechazada' && r.motivoRechazo) {
    html += `<div class="alerta alerta-danger" style="margin-top:12px;font-size:12px;"><strong>Motivo del rechazo:</strong> ${r.motivoRechazo} (por ${r.aprobadoPor || '—'})</div>`;
  }
  if (r.estado === 'Anulada') {
    html += `<div class="alerta alerta-warn" style="margin-top:12px;font-size:12px;"><strong>Anulada por:</strong> ${r.anuladoPor || '—'}</div>`;
  }
  if (r.requiereAltura || r.requierePolizaEsp) {
    html += `<div class="alerta alerta-warn" style="margin-top:12px;font-size:12px;"><strong>⚠️ Impacto en seguros:</strong> ${[r.requiereAltura ? 'Trabajo en altura' : '', r.requierePolizaEsp ? 'Póliza especial' : ''].filter(Boolean).join(' · ')}</div>`;
  }
  $('reas-ver-body').innerHTML = html;
  abrirModal('modal-reas-ver');
}

// ========== CONFIGURACIÓN — MOTIVOS (persistido, con soft delete) ==========

export function renderConfigMotivosReas() {
  const el = $('lista-motivos-reas'); if (!el) return;
  const activos = (DB.motivosReasignacionCfg || []).filter(m => !m.anulado).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  el.innerHTML = activos.map(m => `
    <div class="config-item">
      <span style="font-size:13px;">${m.nombre}</span>
      <button class="btn btn-danger btn-xs" data-action="del-motivo" data-id="${m.id}">Eliminar</button>
    </div>`).join('') || '<p class="text-muted" style="font-size:12px;">Sin motivos configurados.</p>';
  el.onclick = (e) => {
    const btn = e.target.closest('button[data-action="del-motivo"]');
    if (btn) eliminarMotivoReasPorId(btn.dataset.id);
  };
}

export function agregarMotivoReas() {
  const val = cleanText(($('nuevo-motivo-reas') || { value: '' }).value);
  if (!val) { toast('Ingresá el motivo'); return; }
  const activos = (DB.motivosReasignacionCfg || []).filter(m => !m.anulado);
  if (activos.some(m => m.nombre.toLowerCase() === val.toLowerCase())) { toast('Ya existe'); return; }
  const maxOrden = activos.reduce((m, x) => Math.max(m, x.orden || 0), 0);
  const nuevo = { id: Date.now(), nombre: val, orden: maxOrden + 1, anulado: false };
  if (!DB.motivosReasignacionCfg) DB.motivosReasignacionCfg = [];
  DB.motivosReasignacionCfg.push(nuevo);
  supaSync('motivosReasignacionCfg', nuevo);
  $('nuevo-motivo-reas').value = '';
  sincronizarConfigReasignaciones();
  renderConfigMotivosReas();
  poblarSelectsReas();
  toast(`✓ Motivo "${val}" agregado`);
}

export function eliminarMotivoReasPorId(id) {
  const m = (DB.motivosReasignacionCfg || []).find(x => String(x.id) === String(id));
  if (!m) return;
  m.anulado = true;
  supaSync('motivosReasignacionCfg', m);
  sincronizarConfigReasignaciones();
  renderConfigMotivosReas();
  poblarSelectsReas();
  toast('✓ Motivo eliminado');
}

// ========== CONFIGURACIÓN — APROBADORES (persistido, con soft delete) ==========

export function renderConfigAprobadoresReas() {
  const el = $('lista-aprobadores-reas'); if (!el) return;
  const vivos = (DB.aprobadoresReasCfg || []).filter(a => !a.anulado);
  el.innerHTML = vivos.map(a => `
    <div class="config-item">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">🔐</span>
        <span style="font-size:13px;font-weight:500;">${a.cargo}</span>
      </div>
      <button class="btn btn-danger btn-xs" data-action="del-aprobador" data-id="${a.id}">Eliminar</button>
    </div>`).join('') || '<p class="text-muted" style="font-size:12px;">Sin aprobadores configurados — nadie puede aprobar reasignaciones.</p>';
  el.onclick = (e) => {
    const btn = e.target.closest('button[data-action="del-aprobador"]');
    if (btn) eliminarAprobadorReasPorId(btn.dataset.id);
  };
}

export function agregarAprobadorReas() {
  const val = ($('nuevo-aprobador-reas') || { value: '' }).value;
  if (!val) { toast('Seleccioná un perfil'); return; }
  const vivos = (DB.aprobadoresReasCfg || []).filter(a => !a.anulado);
  if (vivos.some(a => a.cargo === val)) { toast('Ya está en la lista'); return; }
  const nuevo = { id: Date.now(), cargo: val, anulado: false };
  if (!DB.aprobadoresReasCfg) DB.aprobadoresReasCfg = [];
  DB.aprobadoresReasCfg.push(nuevo);
  supaSync('aprobadoresReasCfg', nuevo);
  $('nuevo-aprobador-reas').value = '';
  sincronizarConfigReasignaciones();
  renderConfigAprobadoresReas();
  toast(`✓ "${val}" agregado como aprobador`);
}

export function eliminarAprobadorReasPorId(id) {
  const a = (DB.aprobadoresReasCfg || []).find(x => String(x.id) === String(id));
  if (!a) return;
  a.anulado = true;
  supaSync('aprobadoresReasCfg', a);
  sincronizarConfigReasignaciones();
  renderConfigAprobadoresReas();
  toast('✓ Aprobador eliminado');
}
