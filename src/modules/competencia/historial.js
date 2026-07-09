// Competencia Anual v2 — Tab "Historial de movimientos": auditoría del
// ledger, carga manual (felicitaciones de cliente, participación en
// equipo, sanciones cuando exista el módulo) y reversión.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal, abrirModalInput } from '@shared/ui.js';
import {
  getReglaByCodigo, getVersionVigente, revertirMovimiento, revertirEventoCompleto,
  cargaManual, idLocalTrunc, esAdministrativo,
} from './movimientos.js';

function nombreRegla(reglaIdLocal) {
  const r = (DB.reglasCompetencia || []).find(x => String(x.id) === String(reglaIdLocal));
  return r ? r.nombre : '—';
}

// ========== TABLA ==========

export function renderHistorialMovimientos() {
  const tbody = $('tbody-comp-historial');
  if (!tbody) return;
  let filas = (DB.movimientosPuntos || []).filter(m => !m.anulado);
  const q = ($('ch-buscar') || { value: '' }).value.toLowerCase();
  const fRegla = ($('ch-regla') || { value: '' }).value;
  const fAnio = ($('ch-anio') || { value: '' }).value;
  const fEstado = ($('ch-estado') || { value: '' }).value;
  const fOrigen = ($('ch-origen') || { value: '' }).value;

  if (q) filas = filas.filter(m => m.nombreDestinatario.toLowerCase().includes(q));
  if (fRegla) filas = filas.filter(m => String(m.reglaIdLocal) === fRegla);
  if (fAnio) filas = filas.filter(m => String(m.anioCompetencia) === fAnio);
  if (fEstado === 'vigente') filas = filas.filter(m => !m.revertido);
  if (fEstado === 'revertido') filas = filas.filter(m => m.revertido);
  if (fOrigen) filas = filas.filter(m => m.origen === fOrigen);
  filas.sort((a, b) => new Date(b.fechaMovimiento) - new Date(a.fechaMovimiento));

  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="9" style="text-align:center;padding:24px;opacity:.5;">Sin movimientos</td></tr>'
    : filas.map(m => `<tr style="${m.revertido ? 'opacity:.5;' : ''}">
      <td style="font-size:12px;">${(m.fechaEvento || '').slice(0, 10)}</td>
      <td style="font-size:12px;">${nombreRegla(m.reglaIdLocal)}</td>
      <td>${m.nombreDestinatario}</td>
      <td><span class="badge badge-azul">${m.tipoDestinatario}</span></td>
      <td style="font-size:12px;">${m.servicioAlMomento || '—'}</td>
      <td style="text-align:center;font-weight:700;color:${m.puntosCongelados < 0 ? 'var(--rojo)' : 'var(--verde)'};">${m.puntosCongelados > 0 ? '+' : ''}${m.puntosCongelados}</td>
      <td><span class="badge ${m.origen === 'Manual' ? 'badge-acento' : 'badge-azul'}">${m.origen}${m.moduloOrigen ? ' · ' + m.moduloOrigen : ''}</span></td>
      <td style="font-size:11.5px;">${m.revertido ? ('Revertido por ' + m.revertidoPor) : 'Vigente'}</td>
      <td style="white-space:nowrap;">
        ${!m.revertido ? `<button class="btn btn-xs" style="background:#fee2e2;color:#991b1b;" onclick="abrirRevertirMovimiento('${m.id}')">↩️</button>` : ''}
        <button class="btn btn-xs btn-secondary" onclick="abrirDetalleEvento('${m.eventoIdLocal}')">👁</button>
      </td>
    </tr>`).join('');
}

export function filtrarHistorialMovimientos() { renderHistorialMovimientos(); }

export function poblarFiltroReglasHistorial() {
  const sel = $('ch-regla');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todas las reglas</option>' + (DB.reglasCompetencia || []).filter(r => !r.anulado).map(r => `<option value="${r.id}">${r.nombre}</option>`).join('');
}

export function abrirRevertirMovimiento(idLocal) {
  abrirModalInput({ titulo: 'Revertir movimiento', etiqueta: 'Motivo de la reversión (obligatorio)' }, motivo => {
    revertirMovimiento(idLocal, motivo).then(renderHistorialMovimientos);
  });
}

// ========== MODAL — DETALLE DE EVENTO (con revertir en cadena) ==========

let _eventoDetalleId = null;

function ensureModalDetalleEvento() {
  if ($('modal-comp-detalle-evento')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-comp-detalle-evento';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3>Detalle del evento</h3><button class="btn-close" onclick="cerrarModal('modal-comp-detalle-evento')">×</button></div>
      <div class="modal-body" id="ce-cuerpo"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-comp-detalle-evento')">Cerrar</button>
        <button class="btn" style="background:#fee2e2;color:#991b1b;" onclick="abrirRevertirEventoDesdeDetalle()">↩️ Revertir evento completo</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirDetalleEvento(eventoIdLocal) {
  const evento = (DB.eventosPuntos || []).find(e => idLocalTrunc(e.id) === eventoIdLocal);
  if (!evento) { toast('⚠️ No se encontró el evento'); return; }
  _eventoDetalleId = eventoIdLocal;
  ensureModalDetalleEvento();
  const movimientos = (DB.movimientosPuntos || []).filter(m => m.eventoIdLocal === eventoIdLocal);
  $('ce-cuerpo').innerHTML = `
    <div class="info-item"><div class="key">Regla</div><div class="val">${nombreRegla(evento.reglaIdLocal)}</div></div>
    <div class="info-item"><div class="key">Protagonista</div><div class="val">${evento.nombreOperario} — ${evento.servicioAlMomento}</div></div>
    <div class="info-item"><div class="key">Fecha del evento</div><div class="val">${(evento.fechaEvento || '').slice(0, 10)}</div></div>
    <div class="info-item"><div class="key">Origen</div><div class="val">${evento.origen}${evento.moduloOrigen ? ' · ' + evento.moduloOrigen : ''} — cargado por ${evento.cargadoPor}</div></div>
    ${evento.observaciones ? `<div class="info-item"><div class="key">Observaciones</div><div class="val">${evento.observaciones}</div></div>` : ''}
    <div class="form-section">Movimientos generados</div>
    ${movimientos.map(m => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--borde);font-size:12.5px;">
        <span>${m.nombreDestinatario} (${m.tipoDestinatario})</span>
        <span style="font-weight:700;color:${m.puntosCongelados < 0 ? 'var(--rojo)' : 'var(--verde)'};">${m.puntosCongelados > 0 ? '+' : ''}${m.puntosCongelados}${m.revertido ? ' (revertido)' : ''}</span>
      </div>`).join('')}
    ${evento.revertido ? `<p style="color:var(--rojo);margin-top:10px;font-size:12.5px;">Evento revertido por ${evento.revertidoPor}: ${evento.motivoReversion}</p>` : ''}
  `;
  abrirModal('modal-comp-detalle-evento');
}

export function abrirRevertirEventoDesdeDetalle() {
  if (!_eventoDetalleId) return;
  abrirModalInput({ titulo: 'Revertir evento completo', etiqueta: 'Motivo de la reversión (obligatorio)' }, motivo => {
    revertirEventoCompleto(_eventoDetalleId, motivo).then(() => { cerrarModal('modal-comp-detalle-evento'); renderHistorialMovimientos(); });
  });
}

// ========== MODAL — CARGA MANUAL ==========

function ensureModalCargaManual() {
  if ($('modal-comp-carga-manual')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-comp-carga-manual';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>+ Carga manual de movimiento</h3><button class="btn-close" onclick="cerrarModal('modal-comp-carga-manual')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Regla *</label><select id="cm-regla" onchange="recalcularPreviewCargaManual()"></select></div>
        <div class="form-group"><label>Operario protagonista *</label>
          <input type="text" id="cm-operario" list="dl-cm-operario">
          <datalist id="dl-cm-operario"></datalist>
        </div>
        <div class="form-group"><label>Fecha del evento *</label><input type="date" id="cm-fecha" onchange="recalcularPreviewCargaManual()"></div>
        <div class="form-group"><label>Observaciones</label><textarea id="cm-obs" rows="2"></textarea></div>
        <div id="cm-preview" style="font-size:12.5px;padding:10px 12px;background:var(--fondo);border-radius:var(--radio);color:var(--texto-suave);"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-comp-carga-manual')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarCargaManual()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirCargaManual() {
  ensureModalCargaManual();
  const reglas = (DB.reglasCompetencia || []).filter(r => !r.anulado && r.activa && ['Manual', 'Ambas'].includes(r.origen));
  $('cm-regla').innerHTML = reglas.map(r => `<option value="${r.codigo}">${r.nombre}</option>`).join('') || '<option value="">Sin reglas de carga manual</option>';
  $('cm-operario').value = '';
  $('dl-cm-operario').innerHTML = (DB.legajos || []).filter(l => l.estado === 'Activo' && !esAdministrativo(l)).map(l => `<option value="${l.nombre} (N°${l.nro})">`).join('');
  $('cm-fecha').value = new Date().toISOString().slice(0, 10);
  $('cm-obs').value = '';
  recalcularPreviewCargaManual();
  abrirModal('modal-comp-carga-manual');
}

export function recalcularPreviewCargaManual() {
  const codigo = $('cm-regla').value;
  const regla = getReglaByCodigo(codigo);
  const fecha = $('cm-fecha').value || new Date().toISOString().slice(0, 10);
  const version = regla ? getVersionVigente(regla.id, fecha) : null;
  $('cm-preview').textContent = version
    ? `Se va a generar: ${version.puntosIndividual > 0 ? '+' : ''}${version.puntosIndividual} al operario` +
      (version.puntosPorCompanero ? `, ${version.puntosPorCompanero > 0 ? '+' : ''}${version.puntosPorCompanero} a cada compañero del servicio` : '') +
      (version.puntosSupervisor ? `, ${version.puntosSupervisor > 0 ? '+' : ''}${version.puntosSupervisor} al supervisor` : '') + '.'
    : 'Esta regla no tiene una versión vigente a esa fecha.';
}

export async function confirmarCargaManual() {
  const codigo = $('cm-regla').value;
  const texto = $('cm-operario').value;
  const match = texto.match(/\(N°(\d+)\)\s*$/);
  if (!match) { toast('⚠️ Elegí un operario de la lista'); return; }
  const fecha = $('cm-fecha').value;
  const obs = $('cm-obs').value;
  const resultado = await cargaManual({ reglaCodigo: codigo, protagonistaNro: match[1], fecha, observaciones: obs });
  if (resultado) { cerrarModal('modal-comp-carga-manual'); renderHistorialMovimientos(); }
}
