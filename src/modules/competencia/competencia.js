// Módulo Competencia Anual — rehecho de cero (política A.11). Antes vivía
// entero en src/legacy.js con varios bugs reales confirmados en el
// diagnóstico:
//   - El panel "Tabla de puntajes" no mostraba nada (el template del
//     render nunca insertaba el texto de la acción ni el puntaje).
//   - El modal "Ver ranking público" mostraba medallas sueltas sin
//     nombre ni puntaje (mismo tipo de bug de template).
//   - Un botón del header apuntaba a un modal (`modal-reglas`) que no
//     existe — la UI real de reglas ya vive en la pestaña "Reglas y
//     puntos" (se saca ese botón).
//   - `comp-anio` era decorativo: cambiar el año no filtraba nada.
// El cálculo de puntaje ya se había corregido antes (evaluaciones y
// respuestas reales en vez de una fórmula de semilla simulada) — esta
// reescritura mantiene ese cálculo y le suma persistencia real de reglas
// (ver reglas.js) y filtro por año real.
//
// "Felicitaciones de clientes" queda en 0 (no hay tabla real de
// felicitaciones en el sistema) — decisión confirmada con el usuario.
// El "bonus equipo" SÍ se mantiene: depende de evalRespondidas (real) y
// de compañeros reales en el mismo servicio, no es simulado.

import { DB } from '@shared/state.js';
import { $, avatarEl } from '@shared/helpers.js';
import { toast, abrirModal } from '@shared/ui.js';
import { renderReglas } from './reglas.js';

const MEDALLAS = ['🥇', '🥈', '🥉'];
const posColor = pos => pos === 1 ? '#ffd700' : pos === 2 ? '#c0c0c0' : pos === 3 ? '#cd7f32' : 'var(--texto-muy-suave)';

// ========== HELPERS DE DATOS ==========

function respuestasDelAsociado(evalsAsoc) {
  const ids = new Set();
  evalsAsoc.forEach(e => { ids.add(String(e.id)); ids.add(String(e.id).slice(-9)); });
  return (DB.respuestasEvaluacion || []).filter(r => !r.anulado && ids.has(String(r.evaluacionIdLocal)));
}

export function generarDatosCompetencia(anio) {
  const anioStr = anio || String(new Date().getFullYear());
  const activos = (DB.legajos || []).filter(l => l.estado === 'Activo');

  return activos.map(l => {
    const caps = (DB.capacitaciones || []).filter(c => !c.anulado && String(c.nroSocio) === String(l.nro) && (c.fecha || '').startsWith(anioStr));
    const presenciales = caps.filter(c => c.lugar === 'Oficina Central').length;
    const otrasModalidades = caps.filter(c => c.lugar !== 'Oficina Central').length;
    const capsAprobadas = caps.filter(c => c.resultado === 'Aprobado').length;

    const evalsAsoc = (DB.evaluacionesEnviadas || []).filter(e => !e.anulado && String(e.nroSocio) === String(l.nro) && (e.fechaEnvio || '').startsWith(anioStr));
    const evalRespondidas = evalsAsoc.filter(e => e.estado === 'Respondida').length;
    const respuestasCorrectas = respuestasDelAsociado(evalsAsoc).filter(r => r.correcta).length;
    const respondidasConNota = evalsAsoc.filter(e => e.estado === 'Respondida' && e.puntaje != null);
    const notaPromedio = respondidasConNota.length
      ? Math.round(respondidasConNota.reduce((s, e) => s + e.puntaje, 0) / respondidasConNota.length)
      : 0;
    const ptsNota = Math.round(notaPromedio / 10);

    let pts = 0;
    pts += presenciales * 20;
    pts += otrasModalidades * 10;
    pts += capsAprobadas * 5;
    pts += evalRespondidas * 10;
    pts += respuestasCorrectas * 5;
    pts += ptsNota;

    const felicit = 0; // sin tabla real de felicitaciones todavía

    const mismoServ = activos.filter(x => x.servicio === l.servicio && x.nro !== l.nro).length;
    const bonusEquipo = mismoServ > 0 && evalRespondidas > 0 ? 15 : 0;
    pts += bonusEquipo;

    return {
      nro: l.nro, nombre: l.nombre, servicio: l.servicio, supervisor: l.supervisor,
      ptsEvaluaciones: evalRespondidas * 10 + respuestasCorrectas * 5 + ptsNota,
      ptsPresenciales: presenciales * 20,
      ptsFelicitaciones: felicit * 25,
      ptsBonusEquipo: bonusEquipo,
      total: pts,
      evalEnviadas: evalsAsoc.length, evalRespondidas,
      aprobadas: respuestasCorrectas, felicit,
      participa: evalRespondidas > 0 || caps.length > 0,
    };
  }).sort((a, b) => b.total - a.total);
}

export function calcularEquipos(datos) {
  const DESCUENTO_NO_PARTICIPA = 10;
  const equipos = {};
  datos.forEach(d => {
    if (!d.servicio || d.servicio === '—' || d.servicio === 'ADMINISTRATIVO') return;
    if (!equipos[d.servicio]) equipos[d.servicio] = { servicio: d.servicio, supervisor: d.supervisor, miembros: [], totalPts: 0, felicitaciones: 0 };
    equipos[d.servicio].miembros.push(d);
    equipos[d.servicio].totalPts += d.total;
    equipos[d.servicio].felicitaciones += d.felicit || 0;
  });
  return Object.values(equipos).filter(e => e.miembros.length >= 1).map(e => {
    const n = e.miembros.length;
    const noParticipan = e.miembros.filter(m => !m.participa);
    const descuento = noParticipan.length * DESCUENTO_NO_PARTICIPA;
    const promedioBase = n ? Math.round(e.totalPts / n) : 0;
    const promedioPonderado = Math.max(0, promedioBase - descuento);
    return { ...e, noParticipan, descuento, promedioBase, promedioPonderado, puntajeOficial: promedioPonderado };
  }).sort((a, b) => b.puntajeOficial - a.puntajeOficial);
}

export function calcularSupervisores(datos) {
  const DESCUENTO_NO_PARTICIPA = 10;
  const sups = {};
  datos.forEach(d => {
    if (!d.supervisor || d.supervisor === 'ADMINISTRATIVO') return;
    if (!sups[d.supervisor]) sups[d.supervisor] = { supervisor: d.supervisor, gente: [], totalPts: 0 };
    sups[d.supervisor].gente.push(d);
    sups[d.supervisor].totalPts += d.total;
  });
  return Object.values(sups).map(s => {
    const n = s.gente.length;
    const noParticipan = s.gente.filter(g => !g.participa);
    const descuento = noParticipan.length * DESCUENTO_NO_PARTICIPA;
    const promedioBase = n ? Math.round(s.totalPts / n) : 0;
    const promedioPonderado = Math.max(0, promedioBase - descuento);
    return {
      ...s, promedio: promedioPonderado, promedioBase, descuento, noParticipan,
      servicios: [...new Set(s.gente.map(g => g.servicio).filter(Boolean))].length,
      participacion: n ? Math.round(s.gente.filter(g => g.participa).length / n * 100) : 0,
    };
  }).sort((a, b) => b.promedio - a.promedio);
}

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
  const datos = generarDatosCompetencia(anio);
  const equipos = calcularEquipos(datos);
  const supervisores = calcularSupervisores(datos);

  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-comp-part', datos.length);
  ss('st-comp-equipos', equipos.filter(e => e.miembros.length >= 2).length);
  const lider = datos[0];
  if (lider) {
    const partes = lider.nombre.split(' ');
    ss('st-comp-lider', (partes[0] || '') + ' ' + (partes[1] || ''));
    ss('st-comp-lider-pts', lider.total + ' pts');
  }
  const equipoLider = equipos[0];
  if (equipoLider) {
    ss('st-comp-equipo-lider', equipoLider.servicio);
    ss('st-comp-equipo-pts', equipoLider.totalPts + ' pts');
  }
  ss('st-comp-nop', datos.filter(d => !d.participa).length);

  renderTablaIndividual(datos);
  renderTablaEquipos(equipos);
  renderTablaSupervisores(supervisores);
  renderTablaNoParticipan(datos);
  renderReglas();
  poblarFiltrosCompetencia(datos, supervisores);
}

export function renderTablaIndividual(datos) {
  const tbody = $('tbody-comp-ind'); if (!tbody) return;
  tbody.innerHTML = datos.map((d, i) => {
    const pos = i + 1;
    const medalla = pos <= 3 ? MEDALLAS[pos - 1] : `${pos}°`;
    const barra = Math.round(d.total / (datos[0]?.total || 1) * 100);
    const tend = d.evalRespondidas > 0 ? '↑' : '↓';
    const tendColor = d.evalRespondidas > 0 ? 'var(--verde)' : 'var(--rojo)';
    return `<tr style="${pos <= 3 ? 'background:' + (['#fffbea', '#f8f8f8', '#fff8f4'][pos - 1]) : ''}">
      <td style="text-align:center;font-size:${pos <= 3 ? '20' : '13'}px;font-weight:700;color:${posColor(pos)};">${medalla}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${avatarEl(d.nombre)}
          <div>
            <div style="font-weight:600;font-size:13px;">${d.nombre}</div>
            <div style="width:100px;height:4px;background:var(--borde);border-radius:2px;margin-top:4px;overflow:hidden;">
              <div style="height:100%;width:${barra}%;background:var(--azul);border-radius:2px;"></div>
            </div>
          </div>
        </div>
      </td>
      <td style="font-size:12px;">${d.servicio || '—'}</td>
      <td style="font-size:12px;">${d.supervisor || '—'}</td>
      <td style="text-align:center;font-size:13px;font-weight:500;">${d.evalRespondidas}/${d.evalEnviadas}</td>
      <td style="text-align:center;font-size:13px;">${d.aprobadas}</td>
      <td style="text-align:center;font-size:13px;color:var(--azul);">${d.ptsEvaluaciones}</td>
      <td style="text-align:center;font-size:13px;color:var(--verde);">${d.ptsPresenciales}${d.ptsPresenciales > 0 ? '<span style="font-size:10px;"> ★</span>' : ''}</td>
      <td style="text-align:center;font-size:13px;color:var(--acento);">${d.ptsFelicitaciones}</td>
      <td style="text-align:center;font-size:16px;font-weight:800;color:${posColor(pos)};">${d.total}</td>
      <td style="text-align:center;font-size:16px;color:${tendColor};">${tend}</td>
    </tr>`;
  }).join('');
}

export function renderTablaEquipos(equipos) {
  const tbody = $('tbody-comp-eq'); if (!tbody) return;
  tbody.innerHTML = equipos.map((e, i) => {
    const pos = i + 1;
    const medalla = pos <= 3 ? MEDALLAS[pos - 1] : `${pos}°`;
    const participacion = e.miembros.length ? Math.round(e.miembros.filter(m => m.participa).length / e.miembros.length * 100) : 0;
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
            <div style="height:100%;width:${participacion}%;background:${participacion >= 70 ? 'var(--verde)' : participacion >= 40 ? 'var(--naranja)' : 'var(--rojo)'};border-radius:3px;"></div>
          </div>
          <span style="font-size:12px;font-weight:600;color:${participacion >= 70 ? 'var(--verde)' : participacion >= 40 ? 'var(--naranja)' : 'var(--rojo)'};">${participacion}%</span>
        </div>
      </td>
      <td style="text-align:center;font-size:13px;color:#7a6000;">${e.felicitaciones > 0 ? '⭐ ' + e.felicitaciones * 25 + ' pts' : '—'}</td>
      <td style="text-align:center;font-size:18px;font-weight:800;color:${posColor(pos)};">${e.puntajeOficial}</td>
    </tr>`;
  }).join('');
}

export function renderTablaSupervisores(supervisores) {
  const tbody = $('tbody-comp-sup'); if (!tbody) return;
  tbody.innerHTML = supervisores.map((s, i) => {
    const pos = i + 1;
    const medalla = pos <= 3 ? MEDALLAS[pos - 1] : `${pos}°`;
    const nopList = s.noParticipan.map(p => `
      <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--borde);">
        <span style="font-size:11px;flex:1;">${p.nombre}</span>
        <span style="font-size:10px;color:var(--texto-muy-suave);">${p.servicio}</span>
        <button class="btn btn-xs" style="background:var(--azul-claro);color:var(--azul);border:1px solid var(--azul);font-size:9px;padding:2px 6px;" onclick="notificarAsociado('${p.nombre}')">📱</button>
      </div>`).join('');
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
      <td style="min-width:220px;">
        ${s.noParticipan.length === 0
          ? `<span style="color:var(--verde);font-size:12px;">✅ Toda su gente participa</span>`
          : `<div style="max-height:100px;overflow-y:auto;">${nopList}</div>
             <button class="btn btn-xs" style="margin-top:4px;background:var(--azul-claro);color:var(--azul);border:1px solid var(--azul);font-size:10px;" onclick="notificarGrupoSupervisor('${s.supervisor}', ${s.noParticipan.length})">📱 Avisar a ${s.supervisor} (${s.noParticipan.length})</button>`}
      </td>
    </tr>`;
  }).join('');
}

export function renderTablaNoParticipan(datos) {
  const tbody = $('tbody-comp-nop'); if (!tbody) return;
  const noP = datos.filter(d => !d.participa);
  tbody.innerHTML = noP.map(d => `<tr>
    <td style="font-weight:500;">${d.nombre}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${d.nro}</td>
    <td style="font-size:12px;">${d.servicio || '—'}</td>
    <td style="font-size:12px;">${d.supervisor || '—'}</td>
    <td style="text-align:center;">${d.evalEnviadas}</td>
    <td style="text-align:center;font-weight:700;color:var(--rojo);">0</td>
    <td style="text-align:center;"><span class="badge badge-rojo">0%</span></td>
    <td style="text-align:center;font-size:12px;color:var(--texto-suave);">—</td>
    <td style="text-align:center;"><span class="badge badge-rojo">🔴 Alto</span></td>
    <td><button class="btn btn-xs" style="background:var(--azul-claro);color:var(--azul);border:1px solid var(--azul);" onclick="notificarAsociado('${d.nombre}')">📱 Notificar</button></td>
  </tr>`).join('') || `<tr><td colspan="10"><div class="empty-state"><div class="icon">🎉</div><p>¡Todos participan! No hay asociados ausentes.</p></div></td></tr>`;
}

// ========== FILTROS ==========

export function poblarFiltrosCompetencia(datos, supervisores) {
  const fillSel = (id, items) => { const el = $(id); if (!el) return; const ph = el.options[0]?.outerHTML || ''; el.innerHTML = ph + [...new Set(items)].filter(Boolean).map(i => `<option>${i}</option>`).join(''); };
  fillSel('f-comp-serv', [...new Set(datos.map(d => d.servicio).filter(Boolean))].sort());
  fillSel('f-comp-sup', supervisores.map(s => s.supervisor));
}

export function poblarAniosCompetencia() {
  const sel = $('comp-anio'); if (!sel || sel.dataset.poblado) return;
  const anioActual = new Date().getFullYear();
  const aniosCaps = (DB.capacitaciones || []).map(c => parseInt((c.fecha || '').slice(0, 4), 10)).filter(Boolean);
  const anios = [...new Set([anioActual, ...aniosCaps])].sort((a, b) => b - a);
  sel.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join('');
  sel.dataset.poblado = '1';
}

export function filtrarCompInd() {
  const busq = ($('buscar-comp-ind') || { value: '' }).value.toLowerCase();
  const serv = ($('f-comp-serv') || { value: '' }).value;
  const sup = ($('f-comp-sup') || { value: '' }).value;
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const datos = generarDatosCompetencia(anio);
  renderTablaIndividual(datos.filter(d =>
    (!busq || d.nombre.toLowerCase().includes(busq)) && (!serv || d.servicio === serv) && (!sup || d.supervisor === sup)
  ));
}

export function filtrarCompEq() {
  const busq = ($('buscar-comp-eq') || { value: '' }).value.toLowerCase();
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const equipos = calcularEquipos(generarDatosCompetencia(anio));
  renderTablaEquipos(equipos.filter(e => !busq || e.servicio.toLowerCase().includes(busq)));
}

// ========== RANKING PÚBLICO (arreglado — antes no mostraba nombres ni puntajes) ==========

export function verRankingPublico(e) {
  if (e && e.preventDefault) e.preventDefault();
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const datos = generarDatosCompetencia(anio);
  const equipos = calcularEquipos(datos);
  const top10 = datos.slice(0, 10);
  const top5eq = equipos.slice(0, 5);

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
        <div style="font-weight:700;font-size:14px;margin-bottom:10px;color:var(--azul-oscuro);">🏅 Top 5 Equipos</div>
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

// ========== PLACEHOLDERS WHATSAPP / IA (Etapa 4 — bot único al final) ==========

export function notificarAsociado(nombre) {
  toast(`📱 Enviando mensaje a ${nombre}: "¡Todavía podés sumar puntos! Respondé las evaluaciones pendientes."`, 5000);
}

export function notificarNoParticipantes() {
  const datos = generarDatosCompetencia(($('comp-anio') || { value: String(new Date().getFullYear()) }).value);
  const noP = datos.filter(d => !d.participa);
  if (!noP.length) { toast('¡No hay asociados ausentes!'); return; }
  toast(`🤖 Notificando a ${noP.length} asociados por WhatsApp: "Sumá puntos al torneo respondiendo las evaluaciones pendientes..."`, 6000);
}

export function analizarNoParticipantesIA() {
  const datos = generarDatosCompetencia(($('comp-anio') || { value: String(new Date().getFullYear()) }).value);
  const noP = datos.filter(d => !d.participa);
  const servicios = [...new Set(noP.map(d => d.servicio))];
  const sups = [...new Set(noP.map(d => d.supervisor))];
  toast(`🤖 Análisis IA: ${noP.length} no participantes en ${servicios.length} servicios. Supervisores con más ausentes: ${sups.slice(0, 2).join(', ')}.`, 8000);
}

export function notificarGrupoSupervisor(supervisor, cantidad) {
  toast(`📱 Notificando a ${supervisor}: "Tenés ${cantidad} asociado${cantidad !== 1 ? 's' : ''} que no respondió${cantidad !== 1 ? 'n' : ''} evaluaciones."`, 7000);
}
