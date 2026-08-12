// Módulo Retenciones — retenciones sobre haberes (rehecho de cero,
// política A.11). Antes vivía en legacy.js con los mismos 2 bugs que
// Uniformes: editar/liberar usaban el índice de la fila ya FILTRADA
// (rompía con el filtro por tipo activo) y guardarRetencion() siempre
// hacía supaSync del último elemento del array (correcto solo al crear).
// Acá todo es por id, y se agrega soft delete (no existía antes).
//
// Tema 4 del relevamiento (Lautaro, 10/08) — sql/v076:
// - Lista de CANDIDATOS AUTOMÁTICOS: toda persona en Art.42 (DB.art42
//   abierto), de baja o con situación legal activa (legajo.estado /
//   legajo.estadoLegal) aparece arriba de la tabla para que RRHH decida
//   si abre un caso — no se crea nada solo, es una sugerencia calculada
//   en cada render (dedupe por origen+nroSocio contra casos ya vivos).
// - REPORTE DEL SUPERVISOR: un supervisor solo ve y reporta sobre SUS
//   propios asociados activos (mismo criterio que ya usa Pedidos —
//   pedidosVisiblesParaUsuario). Reporta con motivo tipificado +
//   observación; el caso queda "Pendiente" hasta que RRHH decide monto
//   o porcentaje. El supervisor no ve monto ni puede liberar/eliminar.
// - Motivo TIPIFICADO (DB.motivosRetencion, catálogo parametrizable) y
//   tipo de valor Monto/Porcentaje.
// - Auditoría: creadoPor/creadoEn al alta, liberadoPor al liberar
//   (fechaLiberacion ya existía).

import { DB, currentUser } from '@shared/state.js';
import { $, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

const getRetencionById = (id) => (DB.retenciones || []).find(r => String(r.id) === String(id));
const esSupervisor = () => currentUser?.perfil === 'Supervisor';
const legajosPropios = () => (DB.legajos || []).filter(l => l.estado === 'Activo' && l.supervisor === currentUser?.nombre);

const ORIGEN_LABEL = {
  automatico_art42: '🏥 Art.42', automatico_baja: '🔴 Baja', automatico_legal: '⚖️ Legal',
  reporte_supervisor: '👤 Reporte supervisor', manual: '✍️ Manual',
};

// ========== CANDIDATOS AUTOMÁTICOS ==========
// No persiste nada — se recalcula en cada render contra los casos ya
// existentes (dedupe por origen+nroSocio, ignorando los ya liberados
// o anulados, que pueden volver a generar un candidato si reincide).
export function candidatosAutomaticosRetencion() {
  const vigentes = (DB.retenciones || []).filter(r => !r.anulado && r.estado !== 'Liberada');
  const yaAbierto = (origen, nroSocio) => vigentes.some(r => r.origen === origen && String(r.nroSocio) === String(nroSocio));
  const cands = [];
  (DB.art42 || []).filter(a => a.estado === 'Abierto').forEach(a => {
    if (yaAbierto('automatico_art42', a.nroSocio)) return;
    cands.push({ origen: 'automatico_art42', nombre: a.asociado, nroSocio: a.nroSocio, servicio: a.servicio || '—', motivoTipificado: 'Situación Art.42', detalle: `Desde ${a.fechaInicio || '—'} · ${a.dias} día(s) cargados` });
  });
  (DB.legajos || []).filter(l => l.estado === 'Baja').forEach(l => {
    if (yaAbierto('automatico_baja', l.nro)) return;
    cands.push({ origen: 'automatico_baja', nombre: l.nombre, nroSocio: l.nro, servicio: l.servicio || '—', motivoTipificado: 'Dado de baja', detalle: `Baja ${l.fechaBaja || '—'}` });
  });
  (DB.legajos || []).filter(l => l.estadoLegal).forEach(l => {
    if (yaAbierto('automatico_legal', l.nro)) return;
    cands.push({ origen: 'automatico_legal', nombre: l.nombre, nroSocio: l.nro, servicio: l.servicio || '—', motivoTipificado: 'Situación legal activa', detalle: l.estadoLegal });
  });
  return cands;
}

function renderCandidatosRetencion() {
  const cont = $('ret2-candidatos');
  if (!cont) return;
  if (esSupervisor()) { cont.innerHTML = ''; cont.style.display = 'none'; return; }
  const cands = candidatosAutomaticosRetencion();
  if (!cands.length) { cont.innerHTML = ''; cont.style.display = 'none'; return; }
  cont.style.display = 'block';
  cont.innerHTML = `<div class="form-section" style="margin-bottom:8px;">🔎 Candidatos automáticos (Art.42 / Baja / Legal) — ${cands.length}</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
      ${cands.map((c, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:var(--radio);padding:8px 12px;">
          <div>
            <span class="chip" style="font-size:10px;">${ORIGEN_LABEL[c.origen]}</span>
            <strong style="margin-left:6px;font-size:12.5px;">${c.nombre}</strong>
            <span style="font-size:11px;color:var(--texto-suave);margin-left:6px;">N° ${c.nroSocio} · ${c.servicio}</span>
            <div style="font-size:11px;color:var(--texto-muy-suave);margin-top:2px;">${c.detalle}</div>
          </div>
          <button class="btn btn-primary btn-sm" data-cand-idx="${i}">Abrir caso</button>
        </div>`).join('')}
    </div>`;
  cont.querySelectorAll('button[data-cand-idx]').forEach(btn => {
    btn.onclick = () => abrirCandidatoComoCaso(cands[parseInt(btn.dataset.candIdx)]);
  });
}

export function abrirCandidatoComoCaso(c) {
  poblarSelectsRetenciones();
  $('ret2-modal-title').textContent = 'Abrir caso — ' + c.nombre;
  $('ret2-nombre').value = c.nombre;
  $('ret2-nroSocio').value = c.nroSocio || '';
  $('ret2-tipo').value = 'otra';
  $('ret2-motivo-tip').value = '';
  $('ret2-periodo').value = new Date().toISOString().slice(0, 7);
  $('ret2-monto').value = '';
  $('ret2-tipo-valor').value = 'Monto';
  $('ret2-motivo').value = c.detalle || '';
  $('ret2-estado').value = 'Pendiente';
  const modal = $('modal-retencion');
  if (modal) { delete modal.dataset.editId; modal.dataset.origen = c.origen; }
  aplicarVisibilidadModalRetencion(false);
  abrirModal('modal-retencion');
}

// ========== RENDER ==========

export function renderRetenciones(lista) {
  const tbody = $('tbody-ret2'); if (!tbody) return;
  const soyPropia = (r) => (DB.legajos || []).some(l => l.estado === 'Activo' && l.supervisor === currentUser?.nombre && (String(l.nro) === String(r.nroSocio) || l.nombre === r.nombre));
  const base = (DB.retenciones || []).filter(r => !r.anulado && (!esSupervisor() || soyPropia(r) || r.origen === 'reporte_supervisor' && r.creadoPor === currentUser?.nombre));
  const filtro = ($('ret2-filtro') || { value: '' }).value;
  const rows = lista || base.filter(r => !filtro || r.tipo === filtro);

  const ss = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  ss('st-ret2-total', base.length);
  ss('st-ret2-conflicto', base.filter(r => r.tipo === 'conflicto' && r.estado === 'Activa').length);
  ss('st-ret2-enfermedad', base.filter(r => r.tipo === 'enfermedad' && r.estado === 'Activa').length);
  const totalMonto = base.filter(r => r.estado === 'Activa' && r.tipoValor !== 'Porcentaje').reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
  ss('st-ret2-monto', esSupervisor() ? '—' : '$' + totalMonto.toLocaleString('es-AR'));

  renderCandidatosRetencion();

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="padding:40px;text-align:center;color:var(--texto-muy-suave);">Sin retenciones registradas.</td></tr>';
    return;
  }
  const tipoLabel = { conflicto: '⚡ Conflicto', enfermedad: '🏥 Enfermedad', otra: '📋 Otra' };
  const estadoColor = { Activa: 'badge-rojo', Liberada: 'badge-verde', Pendiente: 'badge-naranja' };
  tbody.innerHTML = rows.map(r => `<tr>
    <td style="padding:6px 14px;border:1px solid var(--borde);font-weight:500;">${r.nombre}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.nroSocio || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);"><span class="chip" style="font-size:11px;">${tipoLabel[r.tipo] || r.tipo || '—'}</span></td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.motivoTipificado || r.motivo || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;">${r.periodo || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:right;font-weight:600;color:var(--rojo);">${esSupervisor() ? '—' : (r.tipoValor === 'Porcentaje' ? (r.monto || 0) + '%' : '$' + (parseFloat(r.monto) || 0).toLocaleString('es-AR'))}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);font-size:11px;max-width:180px;">${r.motivo || '—'}</td>
    <td style="padding:6px 8px;border:1px solid var(--borde);text-align:center;"><span class="badge ${estadoColor[r.estado] || 'badge-gris'}">${r.estado || '—'}</span></td>
    <td style="padding:6px 8px;border:1px solid var(--borde);">
      ${esSupervisor() ? '' : `
        <button data-action="editar" data-id="${r.id}" class="btn btn-xs btn-secondary">✏️</button>
        ${r.estado === 'Activa' ? `<button data-action="liberar" data-id="${r.id}" class="btn btn-xs" style="background:#dcfce7;color:#065f46;border:1px solid #9fdaba;">Liberar</button>` : ''}
        <button data-action="eliminar" data-id="${r.id}" class="btn btn-xs" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;">🗑️</button>
      `}
    </td>
  </tr>`).join('');
  tbody.onclick = (e) => {
    const btn = e.target.closest('button[data-action]'); if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'editar') abrirEditarRetencionPorId(id);
    else if (action === 'liberar') liberarRetencionPorId(id);
    else eliminarRetencionPorId(id);
  };
}

export function filtrarRetenciones() { renderRetenciones(); }

export function poblarSelectsRetenciones() {
  const dl = $('dl-ret2-nombre');
  if (dl) {
    const fuente = esSupervisor() ? legajosPropios() : (DB.legajos || []).filter(l => l.estado === 'Activo');
    dl.innerHTML = fuente.map(l => `<option value="${l.nombre}">${l.nombre} — ${l.nro}</option>`).join('');
  }
  const sel = $('ret2-motivo-tip');
  if (sel) {
    const ph = '<option value="">— Elegir motivo —</option>';
    sel.innerHTML = ph + (DB.motivosRetencion || []).filter(m => m.activo !== false)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
      .map(m => `<option value="${m.nombre}">${m.nombre}</option>`).join('');
  }
}

// Autocompleta N° de socio apenas se elige un asociado del datalist.
export function autocompletarRetencion() {
  const val = ($('ret2-nombre') || { value: '' }).value;
  const leg = (esSupervisor() ? legajosPropios() : (DB.legajos || [])).find(l => l.nombre === val);
  if (!leg) return;
  if ($('ret2-nroSocio')) $('ret2-nroSocio').value = leg.nro;
}

// ========== VISIBILIDAD DEL MODAL (RRHH completo vs. reporte de supervisor) ==========
// El supervisor solo carga motivo tipificado + observación; RRHH decide
// tipo/monto/porcentaje/estado. Se ocultan esos campos con una clase en
// vez de duplicar el modal entero.
function aplicarVisibilidadModalRetencion(soloReporte) {
  document.querySelectorAll('#modal-retencion .ret2-solo-rrhh').forEach(el => {
    el.style.display = soloReporte ? 'none' : '';
  });
}

// ========== AGREGAR / EDITAR (RRHH) ==========

export function abrirNuevaRetencion() {
  if (esSupervisor()) { abrirReportarInconveniente(); return; }
  poblarSelectsRetenciones();
  $('ret2-modal-title').textContent = 'Nueva retención';
  ['ret2-nombre', 'ret2-nroSocio', 'ret2-monto', 'ret2-motivo'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('ret2-tipo').value = 'conflicto';
  $('ret2-motivo-tip').value = '';
  $('ret2-tipo-valor').value = 'Monto';
  $('ret2-periodo').value = new Date().toISOString().slice(0, 7);
  $('ret2-estado').value = 'Activa';
  const modal = $('modal-retencion'); if (modal) { delete modal.dataset.editId; delete modal.dataset.origen; }
  aplicarVisibilidadModalRetencion(false);
  abrirModal('modal-retencion');
}

// Tema 4: el supervisor solo reporta un inconveniente de SUS asociados
// activos — no ve monto, no decide estado, no libera ni elimina. Queda
// "Pendiente" para que RRHH decida.
export function abrirReportarInconveniente() {
  poblarSelectsRetenciones();
  $('ret2-modal-title').textContent = '📋 Reportar inconveniente';
  ['ret2-nombre', 'ret2-nroSocio', 'ret2-monto', 'ret2-motivo'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('ret2-tipo').value = 'otra';
  $('ret2-motivo-tip').value = '';
  $('ret2-tipo-valor').value = 'Monto';
  $('ret2-periodo').value = new Date().toISOString().slice(0, 7);
  $('ret2-estado').value = 'Pendiente';
  const modal = $('modal-retencion'); if (modal) { delete modal.dataset.editId; modal.dataset.origen = 'reporte_supervisor'; }
  aplicarVisibilidadModalRetencion(true);
  abrirModal('modal-retencion');
}

export function abrirEditarRetencionPorId(id) {
  const r = getRetencionById(id); if (!r) return;
  poblarSelectsRetenciones();
  $('ret2-modal-title').textContent = 'Editar retención';
  $('ret2-nombre').value = r.nombre || '';
  $('ret2-nroSocio').value = r.nroSocio || '';
  $('ret2-tipo').value = r.tipo || 'conflicto';
  $('ret2-motivo-tip').value = r.motivoTipificado || '';
  $('ret2-periodo').value = r.periodo || '';
  $('ret2-monto').value = r.monto || '';
  $('ret2-tipo-valor').value = r.tipoValor || 'Monto';
  $('ret2-motivo').value = r.motivo || '';
  $('ret2-estado').value = r.estado || 'Activa';
  $('modal-retencion').dataset.editId = r.id;
  aplicarVisibilidadModalRetencion(false);
  abrirModal('modal-retencion');
}

export function guardarRetencion() {
  const nombre = cleanText(($('ret2-nombre') || { value: '' }).value);
  const nroSocio = cleanText(($('ret2-nroSocio') || { value: '' }).value);
  if (!nombre) { toast('⚠️ Ingresá el nombre'); return; }
  const motivoTip = ($('ret2-motivo-tip') || { value: '' }).value;
  if (!motivoTip) { toast('⚠️ Elegí el motivo'); return; }

  const modal = $('modal-retencion');
  const editId = modal?.dataset?.editId;
  const soloReporte = !editId && modal?.dataset?.origen === 'reporte_supervisor' && esSupervisor();
  const r = editId ? getRetencionById(editId) : { id: Date.now(), origen: modal?.dataset?.origen || 'manual' };
  if (!r) { toast('⚠️ No se encontró la retención'); return; }

  const legFuente = esSupervisor() ? legajosPropios() : (DB.legajos || []);
  const leg = legFuente.find(l => l.nombre === nombre || (nroSocio && String(l.nro) === nroSocio));
  if (esSupervisor() && !leg) { toast('⚠️ Solo podés reportar asociados de tus propios servicios'); return; }

  r.nombre = nombre;
  r.nroSocio = nroSocio || (leg ? String(leg.nro) : null);
  r.legajoIdLocal = leg ? String(leg.nro) : (r.legajoIdLocal || r.nroSocio || null);
  r.motivoTipificado = motivoTip;
  r.motivo = cleanText(($('ret2-motivo') || { value: '' }).value);

  if (soloReporte) {
    // El supervisor no decide tipo/monto/estado — queda pendiente para RRHH.
    r.tipo = r.tipo || 'otra';
    r.estado = 'Pendiente';
  } else {
    r.tipo = ($('ret2-tipo') || { value: 'conflicto' }).value;
    r.periodo = ($('ret2-periodo') || { value: '' }).value;
    r.monto = parseFloat(($('ret2-monto') || { value: '' }).value) || 0;
    r.tipoValor = ($('ret2-tipo-valor') || { value: 'Monto' }).value;
    r.estado = ($('ret2-estado') || { value: 'Activa' }).value;
  }

  if (editId) { r.editadoPor = currentUser?.nombre || ''; r.editadoEn = new Date().toISOString(); }
  else { r.creadoPor = currentUser?.nombre || ''; r.creadoEn = new Date().toISOString(); }

  if (!editId) { if (!DB.retenciones) DB.retenciones = []; DB.retenciones.push(r); }
  if (modal) { delete modal.dataset.editId; delete modal.dataset.origen; }

  supaSync('retenciones', r);
  cerrarModal('modal-retencion');
  renderRetenciones();
  toast(editId ? '✅ Retención actualizada' : soloReporte ? '✅ Inconveniente reportado — queda pendiente de RRHH' : '✅ Retención guardada');
}

// ========== LIBERAR / ELIMINAR (RRHH — el supervisor no llega acá, sin botones) ==========

export function liberarRetencionPorId(id) {
  const r = getRetencionById(id); if (!r) return;
  if (!confirm(`¿Liberar la retención de ${r.nombre}?`)) return;
  r.estado = 'Liberada';
  r.fechaLiberacion = new Date().toISOString().slice(0, 10);
  r.liberadoPor = currentUser?.nombre || '';
  supaSync('retenciones', r);
  renderRetenciones();
  toast('✅ Retención liberada');
}

export function eliminarRetencionPorId(id) {
  const r = getRetencionById(id); if (!r) return;
  if (!confirm(`¿Eliminar la retención de ${r.nombre}?`)) return;
  r.anulado = true;
  supaSync('retenciones', r);
  renderRetenciones();
  toast('✅ Retención eliminada');
}
