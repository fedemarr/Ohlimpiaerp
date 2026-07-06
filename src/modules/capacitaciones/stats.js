// Módulo Capacitaciones — Tab Estadísticas (Etapa 2, spec §7).
//
// Reemplaza el placeholder "🚧 en rediseño" de la Etapa 1. A diferencia
// de legacy.js (renderStatsCapacitaciones), acá el filtro por tipo SÍ
// afecta la tabla de pendientes (bug conocido y confirmado en el
// diagnóstico de la Etapa 2), y los umbrales de riesgo son los nuevos de
// la spec (Alto 4+, Medio 2-3, Bajo 0-1 pendientes de 8 tipos).
//
// Cobertura por servicio/supervisor (bloques 2 y 3): la spec dice
// "capacitación de Ingreso Aprobada" (singular) — se interpreta como "al
// menos 1 de los 3 tipos de Ingreso, Dictada+Aprobada" (indicador de
// onboarding completo), distinto del desglose fino por tipo del bloque 1.

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';

const TIPOS_INGRESO = (DB.tiposCapacitacion || []).slice(0, 3);

// ========== HELPERS ==========

function activosDe(servicio, supervisor) {
  return (DB.legajos || []).filter(l => l.estado === 'Activo'
    && (!servicio || l.servicio === servicio)
    && (!supervisor || l.supervisor === supervisor));
}

function tieneAprobado(nroSocio, tipo) {
  return (DB.capacitaciones || []).some(c => !c.anulado && String(c.nroSocio) === String(nroSocio)
    && c.tipo === tipo && c.estado === 'Dictada' && c.resultado === 'Aprobado');
}

function tieneIngresoAprobado(nroSocio) {
  return TIPOS_INGRESO.some(t => tieneAprobado(nroSocio, t));
}

function colorPct(pct) {
  return pct >= 80 ? 'var(--verde)' : pct >= 50 ? 'var(--naranja)' : 'var(--rojo)';
}

function antiguedad(l) {
  if (!l.ingreso) return '';
  const [dd, mm, yy] = l.ingreso.split('/');
  if (!yy) return '';
  const anios = Math.floor((new Date() - new Date(`${yy}-${mm}-${dd}`)) / (365.25 * 24 * 3600 * 1000));
  return `${anios} años`;
}

function barra(label, num, den, chico) {
  const pct = den ? Math.round(num / den * 100) : 0;
  const c = colorPct(pct);
  return `<div style="margin-bottom:${chico ? 10 : 12}px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:${chico ? 3 : 4}px;font-size:${chico ? 11 : 12}px;">
      <span style="font-weight:500;">${label}</span>
      <span style="font-weight:700;color:${c};">${num}/${den} (${pct}%)</span>
    </div>
    <div style="height:${chico ? 6 : 8}px;background:var(--borde);border-radius:4px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:${c};border-radius:4px;"></div>
    </div>
  </div>`;
}

// ========== FILTROS ==========

export function poblarFiltrosStats() {
  const fS = (id, items) => { const el = $(id); if (!el) return; const ph = el.options[0]?.outerHTML || ''; el.innerHTML = ph + [...new Set(items)].filter(Boolean).map(i => `<option>${i}</option>`).join(''); };
  fS('cf-stats-tipo', DB.tiposCapacitacion);
  fS('cf-stats-serv', DB.servicios);
  fS('cf-stats-sup', DB.supervisores);
}

export function filtrarStats() {
  renderStatsCapacitaciones();
}

// ========== RENDER ==========

export function renderStatsCapacitaciones() {
  const fTipo = ($('cf-stats-tipo') || { value: '' }).value;
  const fServ = ($('cf-stats-serv') || { value: '' }).value;
  const fSup = ($('cf-stats-sup') || { value: '' }).value;

  // Bloque 1 — cobertura por tipo (afectado por fTipo)
  const cobTipo = $('stats-cobertura-tipo');
  if (cobTipo) {
    const activos = activosDe();
    const tipos = fTipo ? [fTipo] : (DB.tiposCapacitacion || []);
    cobTipo.innerHTML = tipos.map(tipo => {
      const capacitados = activos.filter(l => tieneAprobado(l.nro, tipo)).length;
      return barra(tipo.replace('Capacitación de Ingreso: ', ''), capacitados, activos.length);
    }).join('');
  }

  // Bloque 2 — cobertura por servicio (top 8 por cantidad de activos)
  const cobServ = $('stats-cobertura-servicio');
  if (cobServ) {
    const servicios = (fServ ? [fServ] : [...new Set((DB.legajos || []).filter(l => l.estado === 'Activo').map(l => l.servicio))])
      .filter(Boolean)
      .map(s => ({ s, n: activosDe(s).length }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);
    cobServ.innerHTML = servicios.map(({ s }) => {
      const act = activosDe(s);
      const capacitados = act.filter(l => tieneIngresoAprobado(l.nro)).length;
      return barra(s, capacitados, act.length, true);
    }).join('') || '<p class="text-muted" style="font-size:12px;">Sin servicios con asociados activos.</p>';
  }

  // Bloque 3 — cobertura por supervisor
  const cobSup = $('stats-cobertura-supervisor');
  if (cobSup) {
    const supervisores = (fSup ? [fSup] : (DB.supervisores || [])).filter(s => activosDe(null, s).length > 0);
    cobSup.innerHTML = supervisores.map(s => {
      const act = activosDe(null, s);
      const capacitados = act.filter(l => tieneIngresoAprobado(l.nro)).length;
      return barra(s, capacitados, act.length, true);
    }).join('') || '<p class="text-muted" style="font-size:12px;">Sin supervisores con asociados activos.</p>';
  }

  // Bloque 4 — tabla de pendientes (afectada por fTipo/fServ/fSup — bug fix vs legacy)
  const tbody = $('tbody-stats-pendientes');
  if (tbody) {
    const activos = activosDe(fServ || null, fSup || null);
    const conPendientes = activos.map(l => {
      const realizadas = (DB.tiposCapacitacion || []).filter(t => tieneAprobado(l.nro, t));
      const pendientes = (DB.tiposCapacitacion || []).filter(t => !realizadas.includes(t));
      return { ...l, realizadas, pendientes };
    }).filter(l => l.pendientes.length > 0)
      .filter(l => !fTipo || l.pendientes.includes(fTipo));

    const riesgoBadge = n => n >= 4 ? 'badge-rojo' : n >= 2 ? 'badge-acento' : 'badge-verde';
    const riesgoTxt = n => n >= 4 ? 'Alto' : n >= 2 ? 'Medio' : 'Bajo';

    tbody.innerHTML = conPendientes.map(l => `<tr>
      <td style="font-weight:500;">${l.nombre}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${l.nro}</td>
      <td style="font-size:12px;">${l.servicio || '—'}</td>
      <td style="font-size:12px;">${l.supervisor || '—'}</td>
      <td><div style="display:flex;flex-wrap:wrap;gap:3px;">${l.realizadas.map(t => `<span class="chip" style="font-size:10px;">${t.replace('Capacitación de Ingreso: ', '')}</span>`).join('') || '<span class="text-muted">Ninguna</span>'}</div></td>
      <td style="text-align:center;"><span class="badge ${riesgoBadge(l.pendientes.length)}">${l.pendientes.length}</span></td>
      <td style="font-size:12px;">${antiguedad(l)}</td>
      <td><span class="badge ${riesgoBadge(l.pendientes.length)}">${riesgoTxt(l.pendientes.length)}</span></td>
    </tr>`).join('') || `<tr><td colspan="8"><div class="empty-state"><div class="icon">✅</div><p>Todos los asociados tienen sus capacitaciones al día</p></div></td></tr>`;
  }
}

// ========== EXPORTAR CSV ==========

function csvEsc(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function exportarStatsCsv() {
  const fTipo = ($('cf-stats-tipo') || { value: '' }).value;
  const fServ = ($('cf-stats-serv') || { value: '' }).value;
  const fSup = ($('cf-stats-sup') || { value: '' }).value;
  const filas = [];

  filas.push(['Cobertura por tipo']);
  filas.push(['Tipo', 'Capacitados', 'Activos', 'Porcentaje']);
  const activosTotal = activosDe();
  (fTipo ? [fTipo] : (DB.tiposCapacitacion || [])).forEach(tipo => {
    const capacitados = activosTotal.filter(l => tieneAprobado(l.nro, tipo)).length;
    const pct = activosTotal.length ? Math.round(capacitados / activosTotal.length * 100) : 0;
    filas.push([tipo, capacitados, activosTotal.length, pct + '%']);
  });
  filas.push([]);

  filas.push(['Cobertura por servicio']);
  filas.push(['Servicio', 'Capacitados', 'Activos', 'Porcentaje']);
  (fServ ? [fServ] : [...new Set((DB.legajos || []).filter(l => l.estado === 'Activo').map(l => l.servicio))]).filter(Boolean).forEach(s => {
    const act = activosDe(s);
    const capacitados = act.filter(l => tieneIngresoAprobado(l.nro)).length;
    const pct = act.length ? Math.round(capacitados / act.length * 100) : 0;
    filas.push([s, capacitados, act.length, pct + '%']);
  });
  filas.push([]);

  filas.push(['Cobertura por supervisor']);
  filas.push(['Supervisor', 'Capacitados', 'Activos', 'Porcentaje']);
  (fSup ? [fSup] : (DB.supervisores || [])).forEach(s => {
    const act = activosDe(null, s);
    if (!act.length) return;
    const capacitados = act.filter(l => tieneIngresoAprobado(l.nro)).length;
    const pct = Math.round(capacitados / act.length * 100);
    filas.push([s, capacitados, act.length, pct + '%']);
  });
  filas.push([]);

  filas.push(['Pendientes']);
  filas.push(['Asociado', 'N° Socio', 'Servicio', 'Supervisor', 'Realizadas', 'Pendientes', 'Antigüedad', 'Riesgo']);
  activosDe(fServ || null, fSup || null).forEach(l => {
    const realizadas = (DB.tiposCapacitacion || []).filter(t => tieneAprobado(l.nro, t));
    const pendientes = (DB.tiposCapacitacion || []).filter(t => !realizadas.includes(t));
    if (!pendientes.length) return;
    if (fTipo && !pendientes.includes(fTipo)) return;
    const riesgo = pendientes.length >= 4 ? 'Alto' : pendientes.length >= 2 ? 'Medio' : 'Bajo';
    filas.push([l.nombre, l.nro, l.servicio || '', l.supervisor || '', realizadas.length, pendientes.length, antiguedad(l), riesgo]);
  });

  const csv = filas.map(f => f.map(csvEsc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estadisticas_capacitaciones_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
