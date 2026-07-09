// Competencia Anual v2 — Tab "Premios y cierre anual". Congela el podio
// (top 3 individual + top 3 servicios, empates comparten puesto sin
// hueco) al cerrar el año — irreversible, mismo criterio de "congelar
// y no recalcular" que usa el resto del proyecto para vigencias/versiones.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, abrirModalInput } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { calcularRankingIndividual, calcularRankingServicios } from './rankings.js';

function anioRegistro(anio) {
  return (DB.aniosCompetencia || []).find(a => a.anio === Number(anio));
}

// Corta en el 3er VALOR de puesto distinto, no en el índice 3 —
// si hay empate en 1°, entran los 2 empatados + el 3° (que puede ser
// "puesto 1" repetido dos veces y luego "puesto 3").
function topPuestos(ranking, n) {
  const puestosDistintos = [...new Set(ranking.map(r => r.puesto))].slice(0, n);
  return ranking.filter(r => puestosDistintos.includes(r.puesto));
}

// ========== RENDER PRINCIPAL ==========

export function renderPremiosCierre() {
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const registro = anioRegistro(anio);
  const cerrado = !!registro?.cerrado;

  const bannerEl = $('comp-premios-banner');
  if (bannerEl) {
    bannerEl.innerHTML = cerrado
      ? `<div class="alerta alerta-info">🔒 El año ${anio} ya está cerrado (${(registro.fechaCierre || '').slice(0, 10)}, por ${registro.cerradoPor}).</div>`
      : `<div class="alerta alerta-acento" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <span>🏁 El año ${anio} está abierto. Verificá que los datos estén correctos antes de cerrarlo — es irreversible.</span>
          <button class="btn btn-primary btn-sm" onclick="abrirCerrarAnio()">🏁 Cerrar año ${anio}</button>
        </div>`;
  }

  const individual = calcularRankingIndividual(anio);
  const servicios = calcularRankingServicios(anio);
  const topInd = topPuestos(individual, 3);
  const topServ = topPuestos(servicios, 3);

  const podioEl = $('comp-premios-podio');
  if (podioEl) {
    podioEl.innerHTML = `
      <div class="card"><div class="card-header"><h3>🥇 Individual</h3></div><div class="card-body">
        ${topInd.map(d => `<div class="info-item"><div class="key">${d.puesto}°</div><div class="val">${d.nombre} — ${d.total} pts</div></div>`).join('') || '<p style="opacity:.5;">Sin datos todavía</p>'}
      </div></div>
      <div class="card"><div class="card-header"><h3>🏅 Servicios</h3></div><div class="card-body">
        ${topServ.map(d => `<div class="info-item"><div class="key">${d.puesto}°</div><div class="val">${d.servicio} — ${d.puntajeOficial} pts</div></div>`).join('') || '<p style="opacity:.5;">Sin datos todavía</p>'}
      </div></div>`;
  }

  renderTablaAniosCerrados();
}

function renderTablaAniosCerrados() {
  const tbody = $('tbody-comp-premios-anios');
  if (!tbody) return;
  const cerrados = (DB.aniosCompetencia || []).filter(a => a.cerrado).sort((a, b) => b.anio - a.anio);
  tbody.innerHTML = cerrados.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:24px;opacity:.5;">Sin años cerrados todavía</td></tr>'
    : cerrados.map(a => {
      const premios = (DB.premiosCompetenciaAnual || []).filter(p => !p.anulado && p.anio === a.anio);
      const ganadorInd = premios.find(p => p.categoria === 'Individual' && p.puesto === 1);
      const ganadorServ = premios.find(p => p.categoria === 'Servicio' && p.puesto === 1);
      const entregados = premios.filter(p => p.entregado).length;
      return `<tr>
        <td>${a.anio}</td>
        <td style="font-size:12px;">${(a.fechaCierre || '').slice(0, 10)}</td>
        <td style="font-size:12px;">${a.cerradoPor || '—'}</td>
        <td>${ganadorInd ? ganadorInd.nombreGanador + ' (' + ganadorInd.puntosFinales + ' pts)' : '—'}</td>
        <td>${ganadorServ ? ganadorServ.nombreGanador + ' (' + ganadorServ.puntosFinales + ' pts)' : '—'}</td>
        <td style="text-align:center;">${entregados}/${premios.length}</td>
        <td><button class="btn btn-xs btn-secondary" onclick="abrirDetallePremiosAnio(${a.anio})">👁</button></td>
      </tr>`;
    }).join('');
}

// ========== CIERRE DE AÑO ==========

function ensureModalCerrarAnio() {
  if ($('modal-comp-cerrar-anio')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-comp-cerrar-anio';
  m.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3 id="cca-titulo">Cerrar año</h3><button class="btn-close" onclick="cerrarModal('modal-comp-cerrar-anio')">×</button></div>
      <div class="modal-body">
        <div class="alerta alerta-danger" style="margin-bottom:12px;font-size:12.5px;">⚠️ Esta acción es irreversible. Después del cierre, movimientos que aparezcan con fecha de este año van a impactar en el año siguiente.</div>
        <div class="form-group"><label>Observaciones del cierre</label><textarea id="cca-obs" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-comp-cerrar-anio')">Cancelar</button>
        <button class="btn" style="background:#dc2626;color:white;" onclick="confirmarCerrarAnio()">🏁 Confirmar cierre</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirCerrarAnio() {
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  ensureModalCerrarAnio();
  $('cca-titulo').textContent = `Cerrar año ${anio}`;
  $('cca-obs').value = '';
  abrirModal('modal-comp-cerrar-anio');
}

export async function confirmarCerrarAnio() {
  const anio = ($('comp-anio') || { value: String(new Date().getFullYear()) }).value;
  const obs = $('cca-obs').value;
  await cerrarAnioCompetencia(anio, obs);
  cerrarModal('modal-comp-cerrar-anio');
  renderPremiosCierre();
}

export async function cerrarAnioCompetencia(anio, observaciones) {
  let registro = anioRegistro(anio);
  if (registro?.cerrado) { toast('⚠️ Este año ya está cerrado'); return; }

  const individual = calcularRankingIndividual(anio);
  const servicios = calcularRankingServicios(anio);
  const topInd = topPuestos(individual, 3);
  const topServ = topPuestos(servicios, 3);

  async function crearPremio(categoria, item, puntosFinales, ganadorIdLocal, nombreGanador, compartidoCon) {
    const p = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      anio: Number(anio), categoria, puesto: item.puesto,
      ganadorIdLocal: String(ganadorIdLocal), nombreGanador,
      puntosFinales, compartidoCon: compartidoCon || null,
    };
    if (!DB.premiosCompetenciaAnual) DB.premiosCompetenciaAnual = [];
    DB.premiosCompetenciaAnual.push(p);
    await supaSync('premiosCompetenciaAnual', p);
    return p;
  }

  for (const d of topInd) {
    const compartido = topInd.filter(x => x.puesto === d.puesto && x !== d).map(x => x.nombre).join(', ') || null;
    await crearPremio('Individual', d, d.total, d.nro, d.nombre, compartido);
  }
  for (const s of topServ) {
    const compartido = topServ.filter(x => x.puesto === s.puesto && x !== s).map(x => x.servicio).join(', ') || null;
    await crearPremio('Servicio', s, s.puntajeOficial, s.servicio, s.servicio, compartido);
  }

  if (!registro) {
    registro = { id: Date.now(), anio: Number(anio), cerrado: true, fechaCierre: new Date().toISOString(), cerradoPor: currentUser?.nombre || '', observacionesCierre: observaciones || '' };
    if (!DB.aniosCompetencia) DB.aniosCompetencia = [];
    DB.aniosCompetencia.push(registro);
  } else {
    registro.cerrado = true;
    registro.fechaCierre = new Date().toISOString();
    registro.cerradoPor = currentUser?.nombre || '';
    registro.observacionesCierre = observaciones || '';
  }
  await supaSync('aniosCompetencia', registro);

  for (const d of topInd) {
    await crearNotificacion({ tipo: 'competencia_ganador_anio', entidadTipo: 'competencia', entidadIdLocal: String(d.nro), destinatarioNombre: d.nombre, mensaje: `🏆 ¡Felicitaciones! Quedaste ${d.puesto}° en la Competencia Anual ${anio} con ${d.total} puntos.` });
  }

  toast(`✅ Año ${anio} cerrado — podio congelado`);
}

// ========== DETALLE DE UN AÑO CERRADO + GESTIÓN DE ENTREGA ==========

let _anioDetalleActual = null;

function ensureModalDetallePremiosAnio() {
  if ($('modal-comp-detalle-premios-anio')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-comp-detalle-premios-anio';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3 id="cdp-titulo">Premios</h3><button class="btn-close" onclick="cerrarModal('modal-comp-detalle-premios-anio')">×</button></div>
      <div class="modal-body" id="cdp-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-comp-detalle-premios-anio')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

function renderDetallePremiosAnioBody(anio) {
  const premios = (DB.premiosCompetenciaAnual || []).filter(p => !p.anulado && p.anio === Number(anio))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.puesto - b.puesto);
  $('cdp-titulo').textContent = `Premios ${anio}`;
  $('cdp-cuerpo').innerHTML = premios.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--borde);">
      <div>
        <strong>${p.categoria} — ${p.puesto}°</strong>: ${p.nombreGanador} (${p.puntosFinales} pts)${p.compartidoCon ? ' · compartido con ' + p.compartidoCon : ''}
        ${p.descripcionPremio ? `<div style="font-size:11px;color:var(--texto-suave);">${p.descripcionPremio}</div>` : ''}
      </div>
      <div>${p.entregado
        ? `<span class="badge badge-verde">✅ ${(p.fechaEntrega || '').slice(0, 10)}</span>`
        : `<button class="btn btn-xs btn-primary" onclick="abrirMarcarPremioEntregado('${p.id}')">Marcar entregado</button>`}</div>
    </div>`).join('') || '<p style="opacity:.5;">Sin premios registrados</p>';
}

export function abrirDetallePremiosAnio(anio) {
  _anioDetalleActual = anio;
  ensureModalDetallePremiosAnio();
  renderDetallePremiosAnioBody(anio);
  abrirModal('modal-comp-detalle-premios-anio');
}

export function abrirMarcarPremioEntregado(premioIdLocal) {
  abrirModalInput({ titulo: 'Descripción del premio entregado', etiqueta: 'Qué se entregó (ej: Kit de herramientas)', obligatorio: false }, async (descripcion) => {
    const p = (DB.premiosCompetenciaAnual || []).find(x => String(x.id) === String(premioIdLocal));
    if (!p) return;
    p.entregado = true;
    p.fechaEntrega = new Date().toISOString().slice(0, 10);
    p.entregadoPor = currentUser?.nombre || '';
    p.descripcionPremio = descripcion || '';
    await supaSync('premiosCompetenciaAnual', p);
    toast('✅ Premio marcado como entregado');
    if (_anioDetalleActual != null) renderDetallePremiosAnioBody(_anioDetalleActual);
    renderTablaAniosCerrados();
  });
}
