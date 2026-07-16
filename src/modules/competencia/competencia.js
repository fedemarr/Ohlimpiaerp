// Módulo Competencia Anual v2 — Tabs Individual / Servicios / Supervisores
// + ranking público. Los cálculos ahora vienen del ledger de movimientos
// (rankings.js) en vez de recorrer legajos/capacitaciones/evaluaciones en
// cada render. "No participan" vive en no_participan.js; "Historial",
// "Reglas" y "Premios" en sus propios archivos.

import { DB } from '@shared/state.js';
import { $, avatarEl } from '@shared/helpers.js';
import { abrirModal, cerrarModal } from '@shared/ui.js';
import { calcularRankingIndividual, calcularRankingServicios, calcularRankingSupervisores } from './rankings.js';
import { renderReglas } from './reglas.js';
import { renderTablaNoParticipan } from './no_participan.js';
import { renderHistorialMovimientos, poblarFiltroReglasHistorial } from './historial.js';
import { renderPremiosCierre } from './premios.js';

const MEDALLAS = ['🥇', '🥈', '🥉'];
const posColor = pos => pos === 1 ? '#ffd700' : pos === 2 ? '#c0c0c0' : pos === 3 ? '#cd7f32' : 'var(--texto-muy-suave)';

// ========== TABS ==========

export function tabComp(tab, btn) {
  document.querySelectorAll('#screen-competencia .tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#screen-competencia .tab-btn').forEach(b => b.classList.remove('active'));
  const content = $('comp-tab-' + tab); if (content) content.classList.add('active');
  if (btn) btn.classList.add('active');
  renderCompetencia();
}

// ========== RENDER PRINCIPAL ==========

export function renderCompetencia() {
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const individual = calcularRankingIndividual(anio);
  const servicios = calcularRankingServicios(anio);
  const supervisores = calcularRankingSupervisores(anio);

  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-comp-part', individual.length);
  ss('st-comp-equipos', servicios.filter(e => e.miembros.length >= 2).length);
  const lider = individual[0];
  if (lider) {
    const partes = lider.nombre.split(' ');
    ss('st-comp-lider', (partes[0] || '') + ' ' + (partes[1] || ''));
    ss('st-comp-lider-pts', lider.total + ' pts');
  }
  const servicioLider = servicios[0];
  if (servicioLider) {
    ss('st-comp-equipo-lider', servicioLider.servicio);
    ss('st-comp-equipo-pts', servicioLider.puntajeOficial + ' pts');
  }

  renderTablaIndividual(individual);
  renderTablaEquipos(servicios);
  renderTablaSupervisores(supervisores);
  renderTablaNoParticipan(anio);
  renderReglas();
  poblarFiltroReglasHistorial();
  renderHistorialMovimientos();
  renderPremiosCierre();
  poblarFiltrosCompetencia(individual, supervisores);
}

export function renderTablaIndividual(datos) {
  const tbody = $('tbody-comp-ind'); if (!tbody) return;
  tbody.innerHTML = datos.map(d => {
    const pos = d.puesto;
    const medalla = pos <= 3 ? MEDALLAS[pos - 1] : `${pos}°`;
    const barra = Math.round(d.total / (datos[0]?.total || 1) * 100);
    return `<tr style="${pos <= 3 ? 'background:' + (['#fffbea', '#f8f8f8', '#fff8f4'][pos - 1]) : ''}">
      <td style="text-align:center;font-size:${pos <= 3 ? '20' : '13'}px;font-weight:700;color:${posColor(pos)};">${medalla}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${avatarEl(d.nombre)}
          <div>
            <div style="font-weight:600;font-size:13px;">${d.nombre}${d.deBaja ? ' <span class="badge badge-gris" style="font-size:9px;">Baja</span>' : ''}</div>
            <div style="width:100px;height:4px;background:var(--borde);border-radius:2px;margin-top:4px;overflow:hidden;">
              <div style="height:100%;width:${Math.max(0, barra)}%;background:var(--azul);border-radius:2px;"></div>
            </div>
          </div>
        </div>
      </td>
      <td style="font-size:12px;">${d.servicio || '—'}</td>
      <td style="font-size:12px;">${d.supervisor || '—'}</td>
      <td style="text-align:center;font-size:13px;color:var(--azul);">${d.ptsEvaluaciones}</td>
      <td style="text-align:center;font-size:13px;color:var(--verde);">${d.ptsPresenciales}${d.ptsPresenciales > 0 ? '<span style="font-size:10px;"> ★</span>' : ''}</td>
      <td style="text-align:center;font-size:13px;color:var(--acento);">${d.ptsFelicitaciones}</td>
      <td style="text-align:center;font-size:16px;font-weight:800;color:${posColor(pos)};">${d.total}</td>
      <td style="text-align:center;font-size:16px;color:${d.actividadReciente ? 'var(--verde)' : 'var(--texto-muy-suave)'};" title="${d.actividadReciente ? 'Tuvo movimientos positivos en los últimos 30 días' : 'Sin actividad en los últimos 30 días'}">${d.actividadReciente ? '●' : '○'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:32px;opacity:.5;">Sin movimientos registrados este año</td></tr>';
}

export function renderTablaEquipos(servicios) {
  const tbody = $('tbody-comp-eq'); if (!tbody) return;
  tbody.innerHTML = servicios.map(e => {
    const pos = e.puesto;
    const medalla = pos <= 3 ? MEDALLAS[pos - 1] : `${pos}°`;
    return `<tr style="${pos <= 3 ? 'background:' + (['#fffbea', '#f8f8f8', '#fff8f4'][pos - 1]) : ''}">
      <td style="text-align:center;font-size:${pos <= 3 ? '20' : '13'}px;font-weight:700;color:${posColor(pos)};">${medalla}</td>
      <td>
        <div style="font-weight:600;font-size:13px;">${e.servicio}</div>
        <div style="font-size:11px;color:var(--texto-suave);margin-top:2px;">${e.miembros.slice(0, 3).map(m => m.nombre.split(' ')[0]).join(', ')}${e.miembros.length > 3 ? ` +${e.miembros.length - 3} más` : ''}</div>
      </td>
      <td style="text-align:center;font-weight:600;">${e.miembros.length}</td>
      <td style="font-size:12px;text-align:center;">${e.supervisor || '—'}</td>
      <td style="text-align:center;font-size:13px;color:var(--texto-suave);">${e.totalPts}</td>
      <td style="text-align:center;font-size:14px;font-weight:600;">${e.promedioBase}</td>
      <td style="text-align:center;">
        <div style="display:flex;align-items:center;gap:6px;justify-content:center;">
          <div style="width:50px;height:6px;background:var(--borde);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${e.porcentajeParticipacion}%;background:${e.porcentajeParticipacion >= 70 ? 'var(--verde)' : e.porcentajeParticipacion >= 40 ? 'var(--naranja)' : 'var(--rojo)'};border-radius:3px;"></div>
          </div>
          <span style="font-size:12px;font-weight:600;color:${e.porcentajeParticipacion >= 70 ? 'var(--verde)' : e.porcentajeParticipacion >= 40 ? 'var(--naranja)' : 'var(--rojo)'};">${e.porcentajeParticipacion}%</span>
        </div>
      </td>
      <td style="text-align:center;font-size:13px;color:#7a6000;">${e.ptsFelicitaciones > 0 ? '⭐ ' + e.ptsFelicitaciones + ' pts' : '—'}</td>
      <td style="text-align:center;font-size:18px;font-weight:800;color:${posColor(pos)};">${e.puntajeOficial}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:32px;opacity:.5;">Sin movimientos registrados este año</td></tr>';
}

let _supervisoresCache = [];

export function renderTablaSupervisores(supervisores) {
  _supervisoresCache = supervisores;
  const tbody = $('tbody-comp-sup'); if (!tbody) return;
  tbody.innerHTML = supervisores.map(s => {
    const pos = s.puesto;
    const medalla = pos <= 3 ? MEDALLAS[pos - 1] : `${pos}°`;
    return `<tr style="${pos <= 3 ? 'background:' + (['#fffbea', '#f8f8f8', '#fff8f4'][pos - 1]) : ''}">
      <td style="text-align:center;font-size:${pos <= 3 ? '20' : '13'}px;font-weight:700;color:${posColor(pos)};">${medalla}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${avatarEl(s.supervisor)}
          <div style="font-weight:600;font-size:13px;">${s.supervisor}</div>
        </div>
      </td>
      <td style="text-align:center;font-weight:600;">${s.gente.length}</td>
      <td style="text-align:center;">${s.servicios}</td>
      <td style="text-align:center;font-size:14px;font-weight:600;color:var(--texto-suave);">${s.totalPts}</td>
      <td style="text-align:center;font-size:18px;font-weight:800;color:${posColor(pos)};">${s.promedio}</td>
      <td style="text-align:center;">
        <span style="font-weight:600;color:${s.participacion >= 70 ? 'var(--verde)' : s.participacion >= 40 ? 'var(--naranja)' : 'var(--rojo)'};">${s.participacion}%</span>
      </td>
      <td style="text-align:center;">
        ${s.noParticipan.length === 0
          ? `<span style="color:var(--verde);font-size:12px;">✅ Toda su gente participa</span>`
          : `<button class="btn btn-xs" style="background:#fee2e2;color:#991b1b;font-size:11px;" onclick="abrirDetalleNoParticipanSupervisor('${s.supervisor}')">⚠️ ${s.noParticipan.length} no participan</button>`}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;opacity:.5;">Sin movimientos registrados este año</td></tr>';
}

// ========== MODAL — DETALLE "NO PARTICIPAN" POR SUPERVISOR ==========

function ensureModalNoParticipanSupervisor() {
  if ($('modal-comp-nop-sup')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-comp-nop-sup';
  m.innerHTML = `
    <div class="modal" style="max-width:460px;">
      <div class="modal-header"><h3 id="cns-titulo">No participan</h3><button class="btn-close" onclick="cerrarModal('modal-comp-nop-sup')">×</button></div>
      <div class="modal-body" id="cns-cuerpo"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-comp-nop-sup')">Cerrar</button>
        <button class="btn" id="cns-btn-avisar" style="background:var(--azul-claro);color:var(--azul);border:1px solid var(--azul);">📱 Avisar a todos</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetalleNoParticipanSupervisor(nombreSupervisor) {
  const s = _supervisoresCache.find(x => x.supervisor === nombreSupervisor);
  if (!s) return;
  ensureModalNoParticipanSupervisor();
  $('cns-titulo').textContent = `No participan — ${nombreSupervisor}`;
  $('cns-cuerpo').innerHTML = s.noParticipan.map(p => `
    <div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--borde);">
      <span style="font-size:13px;flex:1;">${p.nombre}</span>
      <span style="font-size:11px;color:var(--texto-muy-suave);">${p.servicio}</span>
      <button class="btn btn-xs" style="background:var(--azul-claro);color:var(--azul);border:1px solid var(--azul);font-size:10px;" onclick="abrirNotificarAsociado('${p.nro}')">📱</button>
    </div>`).join('') || '<p style="opacity:.6;">Sin datos</p>';
  const btnAvisar = $('cns-btn-avisar');
  if (btnAvisar) btnAvisar.setAttribute('onclick', `abrirNotificarGrupoSupervisor('${nombreSupervisor}')`);
  abrirModal('modal-comp-nop-sup');
}

// ========== FILTROS ==========

export function poblarFiltrosCompetencia(individual, supervisores) {
  const fillSel = (id, items) => { const el = $(id); if (!el) return; const ph = el.options[0]?.outerHTML || ''; el.innerHTML = ph + [...new Set(items)].filter(Boolean).map(i => `<option>${i}</option>`).join(''); };
  fillSel('f-comp-serv', [...new Set(individual.map(d => d.servicio).filter(Boolean))].sort());
  fillSel('f-comp-sup', supervisores.map(s => s.supervisor));
}

export function poblarAniosCompetencia() {
  const sel = $('comp-anio'); if (!sel || sel.dataset.poblado) return;
  const anioActual = new Date().getFullYear();
  const aniosMovs = (DB.movimientosPuntos || []).map(m => m.anioCompetencia).filter(Boolean);
  const anios = [...new Set([anioActual, ...aniosMovs])].sort((a, b) => b - a);
  sel.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join('');
  sel.dataset.poblado = '1';
}

export function filtrarCompInd() {
  const busq = ($('buscar-comp-ind') || { value: '' }).value.toLowerCase();
  const serv = ($('f-comp-serv') || { value: '' }).value;
  const sup = ($('f-comp-sup') || { value: '' }).value;
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const datos = calcularRankingIndividual(anio);
  renderTablaIndividual(datos.filter(d =>
    (!busq || d.nombre.toLowerCase().includes(busq)) && (!serv || d.servicio === serv) && (!sup || d.supervisor === sup)
  ));
}

export function filtrarCompEq() {
  const busq = ($('buscar-comp-eq') || { value: '' }).value.toLowerCase();
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const servicios = calcularRankingServicios(anio);
  renderTablaEquipos(servicios.filter(e => !busq || e.servicio.toLowerCase().includes(busq)));
}

// ========== RANKING PÚBLICO ==========

export function verRankingPublico(e) {
  if (e && e.preventDefault) e.preventDefault();
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const individual = calcularRankingIndividual(anio);
  const servicios = calcularRankingServicios(anio);
  const top10 = individual.slice(0, 10);
  const top5eq = servicios.slice(0, 5);

  $('ranking-publico-content').innerHTML = `
    <div style="text-align:center;background:linear-gradient(135deg,var(--azul-oscuro),var(--azul));border-radius:var(--radio-lg);padding:24px;margin-bottom:18px;color:white;">
      <div style="font-size:28px;font-weight:800;">🏆 Cooperativa Ohlimpia</div>
      <div style="font-size:16px;margin-top:6px;opacity:.85;">Ranking Competencia Anual ${anio}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <div style="font-weight:700;font-size:14px;margin-bottom:10px;color:var(--azul-oscuro);">⭐ Top 10 Individual</div>
        ${top10.map((d, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--borde);">
            <span style="font-size:${i < 3 ? '20' : '13'}px;font-weight:700;color:${posColor(i + 1)};width:30px;text-align:center;">${i < 3 ? MEDALLAS[i] : `${i + 1}°`}</span>
            <span style="flex:1;font-size:12.5px;font-weight:500;">${d.nombre}</span>
            <span style="font-size:13px;font-weight:700;color:var(--azul);">${d.total} pts</span>
          </div>`).join('') || '<p class="text-muted" style="font-size:12px;">Sin datos todavía.</p>'}
      </div>
      <div>
        <div style="font-weight:700;font-size:14px;margin-bottom:10px;color:var(--azul-oscuro);">🏅 Top 5 Servicios</div>
        ${top5eq.map((eq, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--borde);">
            <span style="font-size:${i < 3 ? '20' : '13'}px;font-weight:700;color:${posColor(i + 1)};width:30px;text-align:center;">${i < 3 ? MEDALLAS[i] : `${i + 1}°`}</span>
            <span style="flex:1;font-size:12.5px;font-weight:500;">${eq.servicio}</span>
            <span style="font-size:13px;font-weight:700;color:var(--azul);">${eq.puntajeOficial} pts</span>
          </div>`).join('') || '<p class="text-muted" style="font-size:12px;">Sin datos todavía.</p>'}
      </div>
    </div>
    <div style="text-align:center;margin-top:14px;font-size:11px;color:var(--texto-muy-suave);">Actualizado: ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  `;
  abrirModal('modal-ranking-publico');
}
