// Categorías — Tab "👥 Asociados (padrón)" (v124, ticket "Mejoras en
// Categorías" + mockup_categorias_padron_1.html).
//
// El padrón es la FUENTE ÚNICA de la categoría de cada operario. No se
// carga aparte: se alimenta de eventos —
//   ALTA          → altas.js escribe el primer registro (categoría inicial)
//   DIRECTO       → el modal "Cambiar" de este tab
//   AUTORIZACION  → al aprobar una autorización de grilla (legacy.js)
//   MASIVO        → import CSV de recategorización (acá)
// Todo con vigencia a nivel MES (primer día), quién y origen. Legajos y
// las grillas de Liquidación de horas LEEN de acá (consultas.js →
// categoriaVigenteAsociado).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, SUPA } from '@shared/supabase.js';
import { getCategoriaById, registroPadronVigente, historialPadronAsociado } from './consultas.js';

const _idTrunc = (v) => String(v || '').slice(-9);
function _id(pref) { return pref + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function _primerDiaMes(m) { return String(m || '').slice(0, 7) + '-01'; }
function _ultimoDiaMesAnterior(primerDiaISO) {
  const d = new Date(primerDiaISO + 'T12:00:00');
  d.setDate(0);                       // último día del mes anterior
  return d.toISOString().slice(0, 10);
}
function _mesTxt(fechaISO) {
  const [y, m] = String(fechaISO || '').split('-');
  return m ? `${m}/${y}` : (fechaISO || '—');
}
const _ORIGEN_CHIP = {
  ALTA: 'badge-verde', DIRECTO: 'badge-acento', AUTORIZACION: 'badge-naranja', MASIVO: 'badge-azul',
};
function _legajoActivos() {
  return (DB.legajos || []).filter(l => l.estado === 'Activo');
}
function _catsActivas() {
  return (DB.categoriasBase || []).filter(c => !c.anulado && c.activa)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

// ========== ESCRIBIR UN REGISTRO EN EL PADRÓN (helper compartido) ==========
//
// Usado por este tab (DIRECTO), por altas.js (ALTA), por legacy.js al
// aprobar una autorización (AUTORIZACION) y por el import masivo (MASIVO).
// Cierra la vigencia del registro anterior (vigencia_hasta = último día
// del mes anterior al nuevo). Devuelve el registro creado, o null si falla.
export async function escribirRegistroPadron({ legajoNro, categoriaIdLocal, vigenciaDesde, origen, motivo, pidio, aprobo }) {
  if (!legajoNro || !categoriaIdLocal || !vigenciaDesde || !origen) return null;
  const vig = _primerDiaMes(vigenciaDesde);

  // cerrar el registro anterior vigente a ese mes (si hay y su vigencia es previa)
  const anterior = registroPadronVigente(legajoNro, vig);
  if (anterior && String(anterior.vigenciaDesde) < vig && !anterior.vigenciaHasta) {
    anterior.vigenciaHasta = _ultimoDiaMesAnterior(vig);
    await supaSync('padronCategoriasAsociado', anterior);
  }

  const reg = {
    id: _id('PADCAT'),
    legajoNro: String(legajoNro),
    categoriaIdLocal: _idTrunc(categoriaIdLocal),
    vigenciaDesde: vig, vigenciaHasta: null,
    origen, motivo: motivo || '', pidio: pidio || '', aprobo: aprobo || '',
    cargadoPor: currentUser?.nombre || '', cargadoEn: new Date().toISOString(),
    anulado: false,
  };
  if (!DB.padronCategoriasAsociado) DB.padronCategoriasAsociado = [];
  // reemplaza si ya había un registro exactamente en ese mes (unique legajo_nro+vigencia_desde)
  const idx = DB.padronCategoriasAsociado.findIndex(r =>
    !r.anulado && String(r.legajoNro) === String(legajoNro) && String(r.vigenciaDesde) === vig);
  if (idx >= 0) { reg.id = DB.padronCategoriasAsociado[idx].id; DB.padronCategoriasAsociado[idx] = reg; }
  else DB.padronCategoriasAsociado.push(reg);
  const ok = await supaSync('padronCategoriasAsociado', reg);
  return ok ? reg : null;
}

// ========== RENDER — TAB PADRÓN ==========

export function renderPadronCategorias() {
  const tbody = $('tbody-padron-cat');
  if (!tbody) return;
  poblarFiltrosPadron();
  const q = ($('padron-buscar') || { value: '' }).value.trim().toLowerCase();
  const fCat = ($('padron-fil-categoria') || { value: '' }).value;
  const fGrupo = ($('padron-fil-grupo') || { value: '' }).value;

  const hoy = new Date().toISOString().slice(0, 10);
  const filas = _legajoActivos().map(l => {
    const reg = registroPadronVigente(l.nro, hoy);
    const cat = reg ? getCategoriaById(reg.categoriaIdLocal) : null;
    return { l, reg, cat };
  }).filter(({ l, cat }) => {
    if (q && !String(l.nombre).toLowerCase().includes(q) && !String(l.nro).includes(q)) return false;
    if (fCat && (!cat || cat.codigo !== fCat)) return false;
    if (fGrupo && (!cat || cat.grupo !== fGrupo)) return false;
    return true;
  }).sort((a, b) => String(a.l.nombre).localeCompare(String(b.l.nombre), 'es'));

  const cont = $('padron-contador');
  if (cont) cont.textContent = `${filas.length} asociado(s) activo(s)`;

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5;">Sin asociados para el filtro.</td></tr>';
    return;
  }
  tbody.innerHTML = filas.map(({ l, reg, cat }) => {
    const catCell = cat
      ? `<span class="chip">${cat.codigo}</span> ${cat.nombre}`
      : '<span class="text-muted">⚠ sin categoría en el padrón</span>';
    const vig = reg ? _mesTxt(reg.vigenciaDesde) : '—';
    const ultimo = reg
      ? `<span class="badge ${_ORIGEN_CHIP[reg.origen] || 'badge-gris'}">${reg.origen}</span> <span class="text-muted" style="font-size:11px;">${reg.motivo ? reg.motivo + ' · ' : ''}${reg.cargadoPor || ''}${reg.cargadoEn ? ' · ' + new Date(reg.cargadoEn).toLocaleDateString('es-AR') : ''}</span>`
      : '<span class="text-muted">—</span>';
    return `<tr>
      <td style="font-family:'DM Mono',monospace;font-size:12px;">${l.nro}</td>
      <td>${l.nombre}</td>
      <td>${catCell}</td>
      <td style="font-size:12px;">${vig}</td>
      <td style="font-size:12px;">${ultimo}</td>
      <td style="white-space:nowrap;"><button class="btn btn-primary btn-xs" onclick="abrirCambiarCategoriaPadron('${l.nro}')">Cambiar</button></td>
    </tr>`;
  }).join('');
}

export function filtrarPadronCategorias() { renderPadronCategorias(); }

function poblarFiltrosPadron() {
  const selCat = $('padron-fil-categoria');
  if (selCat && selCat.options.length <= 1) {
    selCat.innerHTML = '<option value="">Categoría: todas</option>' + _catsActivas().map(c => `<option value="${c.codigo}">${c.codigo} — ${c.nombre}</option>`).join('');
  }
  const selGr = $('padron-fil-grupo');
  if (selGr && selGr.options.length <= 1) {
    const grupos = [...new Set(_catsActivas().map(c => c.grupo))];
    selGr.innerHTML = '<option value="">Grupo: todos</option>' + grupos.map(g => `<option>${g}</option>`).join('');
  }
}

// ========== MODAL CAMBIAR ==========

let _padronCambioNro = null;
export function abrirCambiarCategoriaPadron(legajoNro) {
  _padronCambioNro = String(legajoNro);
  ensureModalCambioPadron();
  const l = (DB.legajos || []).find(x => String(x.nro) === String(legajoNro));
  const reg = registroPadronVigente(legajoNro, new Date().toISOString().slice(0, 10));
  const catActual = reg ? getCategoriaById(reg.categoriaIdLocal) : null;
  $('padron-cambio-titulo').textContent = `Cambiar categoría — ${legajoNro} · ${l ? l.nombre : ''}`;
  $('padron-cambio-actual').innerHTML = catActual
    ? `<span class="chip">${catActual.codigo}</span> ${catActual.nombre} <span class="text-muted">· vigente desde ${reg ? _mesTxt(reg.vigenciaDesde) : ''}</span>`
    : '<span class="text-muted">sin categoría en el padrón todavía</span>';
  $('padron-cambio-nueva').innerHTML = _catsActivas().map(c => `<option value="${_idTrunc(c.id)}">${c.codigo} — ${c.nombre}</option>`).join('');
  const hoy = new Date();
  $('padron-cambio-vigencia').value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  $('padron-cambio-motivo').value = '';
  abrirModal('modal-padron-cambio');
}
function ensureModalCambioPadron() {
  if ($('modal-padron-cambio')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-padron-cambio';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header"><h3 id="padron-cambio-titulo">Cambiar categoría</h3><button class="btn-close" onclick="cerrarModal('modal-padron-cambio')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Categoría actual</label><div id="padron-cambio-actual" style="font-size:13px;padding-top:2px;"></div></div>
        <div class="form-group"><label>Categoría nueva *</label><select id="padron-cambio-nueva"></select></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Vigencia (desde el mes) *</label><input type="month" id="padron-cambio-vigencia"></div>
          <div class="form-group"><label>Motivo</label><input type="text" id="padron-cambio-motivo" placeholder="Ej: cubre encargatura"></div>
        </div>
        <div class="alerta alerta-warning" style="font-size:12px;">⚠ Impacta el legajo y las grillas de Liquidación de horas desde el mes de vigencia (valor hora según Valores hora) + registro en Historial. Los meses cerrados o congelados no se modifican.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-padron-cambio')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarCambioCategoriaPadron()">✔ Confirmar cambio</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
export async function guardarCambioCategoriaPadron() {
  const legajoNro = _padronCambioNro;
  const catIdTrunc = ($('padron-cambio-nueva') || {}).value;
  const vigMes = ($('padron-cambio-vigencia') || {}).value;
  const motivo = ($('padron-cambio-motivo') || {}).value.trim();
  if (!legajoNro || !catIdTrunc) { toast('⚠️ Elegí la categoría nueva'); return; }
  if (!vigMes) { toast('⚠️ Elegí el mes de vigencia'); return; }
  const reg = await escribirRegistroPadron({
    legajoNro, categoriaIdLocal: catIdTrunc, vigenciaDesde: _primerDiaMes(vigMes),
    origen: 'DIRECTO', motivo,
  });
  if (!reg) { toast('⚠️ No se pudo guardar — reintentá'); return; }
  cerrarModal('modal-padron-cambio');
  renderPadronCategorias();
  toast('✓ Cambio registrado — impacta legajo y grillas desde ' + _mesTxt(reg.vigenciaDesde));
}

// ========== IMPORT MASIVO (CSV recategorización) ==========

let _padronImportFilas = null;
export function abrirImportPadron() {
  ensureModalImportPadron();
  _padronImportFilas = null;
  $('padron-imp-file').value = '';
  $('padron-imp-vigencia').value = (() => { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`; })();
  $('padron-imp-motivo').value = 'Recategorización';
  $('padron-imp-preview').innerHTML = '';
  $('padron-imp-btn').style.display = 'none';
  abrirModal('modal-padron-import');
}
function ensureModalImportPadron() {
  if ($('modal-padron-import')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'modal-padron-import';
  m.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header"><h3>Import masivo — recategorización</h3><button class="btn-close" onclick="cerrarModal('modal-padron-import')">×</button></div>
      <div class="modal-body">
        <p style="font-size:12px;color:var(--texto-suave);">CSV con 2 columnas: <b>N° socio</b> y <b>categoría</b> (código CAT-XXX o el nombre exacto). Todas las filas entran con la misma vigencia y origen MASIVO.</p>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Vigencia (desde el mes) *</label><input type="month" id="padron-imp-vigencia"></div>
          <div class="form-group"><label>Motivo</label><input type="text" id="padron-imp-motivo"></div>
        </div>
        <div class="form-group"><label>Archivo CSV *</label><input type="file" id="padron-imp-file" accept=".csv,text/csv" onchange="seleccionarArchivoImportPadron()"></div>
        <div id="padron-imp-preview" style="max-height:280px;overflow:auto;margin-top:8px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-padron-import')">Cancelar</button>
        <button class="btn btn-primary" id="padron-imp-btn" style="display:none;" onclick="confirmarImportPadron()">Importar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}
function _parseCsvSimple(texto) {
  const lineas = texto.split(/\r\n|\r|\n/).filter(l => l.trim() !== '');
  const delim = (lineas[0].split(';').length > lineas[0].split(',').length) ? ';' : ',';
  return lineas.map(l => l.split(delim).map(c => c.trim().replace(/^"|"$/g, '')));
}
function _matchCategoria(txt) {
  const t = String(txt || '').trim().toUpperCase();
  return (DB.categoriasBase || []).find(c => !c.anulado && (
    c.codigo.toUpperCase() === t || c.nombre.trim().toUpperCase() === t
  )) || null;
}
export function seleccionarArchivoImportPadron() {
  const file = ($('padron-imp-file') || {}).files?.[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const filas = _parseCsvSimple(String(e.target.result || ''));
    if (filas.length < 2) { toast('⚠️ El CSV está vacío'); return; }
    // detectar si la primera fila es encabezado
    const primera = filas[0].join(' ').toLowerCase();
    const datos = /socio|categor|nombre|nro/.test(primera) ? filas.slice(1) : filas;
    const activos = new Map(_legajoActivos().map(l => [String(l.nro), l]));
    _padronImportFilas = datos.map(cols => {
      const nro = (cols[0] || '').replace(/\D/g, '');
      const catTxt = cols[1] || '';
      const legajo = activos.get(nro);
      const cat = _matchCategoria(catTxt);
      let estado = 'ok';
      if (!nro) estado = 'sin_nro';
      else if (!legajo) estado = 'no_activo';
      else if (!cat) estado = 'cat_desconocida';
      return { nro, catTxt, legajo, cat, estado };
    });
    _renderPreviewImportPadron();
  };
  r.readAsText(file, 'UTF-8');
}
function _renderPreviewImportPadron() {
  const cont = $('padron-imp-preview'); if (!cont) return;
  const ok = _padronImportFilas.filter(f => f.estado === 'ok').length;
  const bad = _padronImportFilas.length - ok;
  cont.innerHTML = `<div style="font-size:12px;margin-bottom:6px;">${ok} fila(s) OK · ${bad} con problema (no se importan)</div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
      <thead><tr style="background:#374151;color:white;"><th style="padding:4px 6px;text-align:left;">N° socio</th><th style="padding:4px 6px;text-align:left;">Asociado</th><th style="padding:4px 6px;text-align:left;">Categoría CSV</th><th style="padding:4px 6px;text-align:left;">Resultado</th></tr></thead>
      <tbody>${_padronImportFilas.map(f => {
        const res = {
          ok: `<span style="color:var(--verde);">→ ${f.cat.codigo} ${f.cat.nombre}</span>`,
          sin_nro: '<span style="color:var(--rojo);">falta N° socio</span>',
          no_activo: '<span style="color:var(--rojo);">no es asociado activo</span>',
          cat_desconocida: '<span style="color:var(--rojo);">categoría no está en el catálogo</span>',
        }[f.estado];
        return `<tr style="${f.estado !== 'ok' ? 'background:#fef2f2;' : ''}"><td style="padding:3px 6px;">${f.nro || '—'}</td><td style="padding:3px 6px;">${f.legajo ? f.legajo.nombre : '—'}</td><td style="padding:3px 6px;">${f.catTxt || '—'}</td><td style="padding:3px 6px;">${res}</td></tr>`;
      }).join('')}</tbody>
    </table>`;
  const btn = $('padron-imp-btn');
  if (btn) btn.style.display = ok > 0 ? 'inline-flex' : 'none';
}
export async function confirmarImportPadron() {
  const validas = (_padronImportFilas || []).filter(f => f.estado === 'ok');
  if (!validas.length) { toast('⚠️ No hay filas válidas'); return; }
  const vigMes = ($('padron-imp-vigencia') || {}).value;
  const motivo = (($('padron-imp-motivo') || {}).value || '').trim() || 'Recategorización';
  if (!vigMes) { toast('⚠️ Elegí el mes de vigencia'); return; }
  const btn = $('padron-imp-btn');
  if (btn) { btn.disabled = true; btn.textContent = `Importando 0 / ${validas.length}…`; }
  let n = 0;
  for (const f of validas) {
    await escribirRegistroPadron({
      legajoNro: f.nro, categoriaIdLocal: _idTrunc(f.cat.id), vigenciaDesde: _primerDiaMes(vigMes),
      origen: 'MASIVO', motivo: `${motivo} ${_mesTxt(_primerDiaMes(vigMes))}`,
    });
    n++;
    if (btn) btn.textContent = `Importando ${n} / ${validas.length}…`;
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Importar'; }
  cerrarModal('modal-padron-import');
  renderPadronCategorias();
  toast(`✅ ${n} recategorización(es) importada(s) con vigencia ${_mesTxt(_primerDiaMes(vigMes))}`);
}

// ========== EXPORTAR ==========
export function exportarPadronCategorias() {
  const hoy = new Date().toISOString().slice(0, 10);
  const filas = [['N° socio', 'Asociado', 'Categoría código', 'Categoría', 'Vigente desde', 'Origen', 'Motivo', 'Cargado por']];
  for (const l of _legajoActivos().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))) {
    const reg = registroPadronVigente(l.nro, hoy);
    const cat = reg ? getCategoriaById(reg.categoriaIdLocal) : null;
    filas.push([l.nro, l.nombre, cat ? cat.codigo : '', cat ? cat.nombre : '', reg ? _mesTxt(reg.vigenciaDesde) : '', reg ? reg.origen : '', reg ? reg.motivo : '', reg ? reg.cargadoPor : '']);
  }
  const csv = filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `padron_categorias_${hoy}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
