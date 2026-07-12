// Categorías v1 — Tab 2: matriz de valores hora por categoría ×
// servicio, con vigencia temporal (patrón "Corregir vs. Nueva
// vigencia" calcado de competencia/reglas.js) y carga masiva para
// paritarias.

import { DB, currentUser } from '@shared/state.js';
import { $, fillDL } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getCategoriaById, obtenerValorHoraVigente, idLocalTrunc } from './consultas.js';

function hoyISO() { return new Date().toISOString().slice(0, 10); }

function categoriasActivas() {
  return (DB.categoriasBase || []).filter(c => !c.anulado && c.activa)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

function serviciosDisponibles() {
  return window.obtenerServiciosActivos ? window.obtenerServiciosActivos() : (DB.servicios || []);
}

// ========== TAB 2 — MATRIZ ==========

export function poblarFiltrosMatrizValores() {
  const selCat = $('val-filtro-categoria');
  const selServ = $('val-filtro-servicio');
  if (selCat) selCat.innerHTML = categoriasActivas().map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  if (selServ) selServ.innerHTML = serviciosDisponibles().map(s => `<option value="${s}">${s}</option>`).join('');
  fillDL('dl-cat-servicio', serviciosDisponibles());
}

function seleccionMultiple(id) {
  const sel = $(id);
  if (!sel) return [];
  return Array.from(sel.selectedOptions || []).map(o => o.value);
}

export function renderMatrizValores() {
  const wrap = $('cat-valores-matriz-wrap');
  if (!wrap) return;

  const catsFiltro = seleccionMultiple('val-filtro-categoria');
  const servFiltro = seleccionMultiple('val-filtro-servicio');
  const categorias = categoriasActivas().filter(c => catsFiltro.length === 0 || catsFiltro.includes(String(c.id)));
  const servicios = serviciosDisponibles().filter(s => servFiltro.length === 0 || servFiltro.includes(s));

  if (categorias.length === 0 || servicios.length === 0) {
    wrap.innerHTML = '<p style="opacity:.5;padding:24px;text-align:center;">Sin categorías o servicios para mostrar con este filtro</p>';
    return;
  }

  const hoy = hoyISO();
  let html = '<table><thead><tr><th style="position:sticky;left:0;background:#374151;color:white;z-index:1;">Categoría</th>';
  html += servicios.map(s => `<th style="font-size:11px;white-space:nowrap;">${s}</th>`).join('');
  html += '</tr></thead><tbody>';
  html += categorias.map(c => {
    let fila = `<tr><td style="position:sticky;left:0;background:white;font-weight:600;white-space:nowrap;">${c.nombre}</td>`;
    fila += servicios.map(s => {
      const v = obtenerValorHoraVigente(c.id, s, hoy);
      if (v) {
        return `<td style="text-align:center;">
          <button class="btn btn-xs" style="background:var(--verde-claro,#dcfce7);color:#065f46;" onclick="abrirCorregirValor('${c.id}','${encodeURIComponent(s)}')" title="Corregir">$${Number(v.valorHora).toLocaleString('es-AR')}</button>
          <button class="btn btn-xs btn-secondary" onclick="abrirNuevaVigenciaValor('${c.id}','${encodeURIComponent(s)}')" title="Nueva vigencia">📅</button>
          <button class="btn btn-xs btn-secondary" onclick="abrirHistorialValor('${c.id}','${encodeURIComponent(s)}')" title="Historial">🕐</button>
        </td>`;
      }
      return `<td style="text-align:center;"><button class="btn btn-xs btn-secondary" onclick="abrirCargarValor('${c.id}','${encodeURIComponent(s)}')">sin cargar</button></td>`;
    }).join('');
    fila += '</tr>';
    return fila;
  }).join('');
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

export function filtrarMatrizValores() { renderMatrizValores(); }

// ========== MODAL — CARGAR / CORREGIR / NUEVA VIGENCIA ==========

let _valorModo = 'cargar'; // 'cargar' | 'corregir' | 'vigencia'
let _valorCategoriaId = null;
let _valorServicio = null;
let _valorEditandoId = null;

function ensureModalValor() {
  if ($('modal-cat-valor')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cat-valor';
  m.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3 id="cv-titulo">Cargar valor</h3><button class="btn-close" onclick="cerrarModal('modal-cat-valor')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Categoría</label><input type="text" id="cv-categoria" readonly></div>
        <div class="form-group"><label>Servicio *</label><input type="text" id="cv-servicio" list="dl-cat-servicio"></div>
        <div class="form-group"><label>Valor hora *</label><input type="number" id="cv-valor" min="0" step="0.01"></div>
        <div class="form-group" id="cv-grupo-vigencia" style="display:none;"><label>Vigente desde *</label><input type="date" id="cv-vigencia-desde"></div>
        <div class="form-group"><label>Motivo *</label><textarea id="cv-motivo" rows="2"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cat-valor')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarValorDesdeModal()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirCargarValor(categoriaIdLocal, servicioEnc) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  const servicio = decodeURIComponent(servicioEnc);
  _valorModo = 'cargar'; _valorCategoriaId = categoriaIdLocal; _valorServicio = servicio; _valorEditandoId = null;
  ensureModalValor();
  $('cv-titulo').textContent = `Cargar valor — ${c.nombre} / ${servicio}`;
  $('cv-categoria').value = c.nombre;
  $('cv-servicio').value = servicio;
  $('cv-valor').value = '';
  $('cv-grupo-vigencia').style.display = 'block';
  $('cv-vigencia-desde').value = hoyISO();
  $('cv-motivo').value = '';
  abrirModal('modal-cat-valor');
}

export function abrirCorregirValor(categoriaIdLocal, servicioEnc) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  const servicio = decodeURIComponent(servicioEnc);
  const version = obtenerValorHoraVigente(categoriaIdLocal, servicio, hoyISO());
  if (!version) { toast('⚠️ No hay una versión vigente para corregir'); return; }
  _valorModo = 'corregir'; _valorCategoriaId = categoriaIdLocal; _valorServicio = servicio; _valorEditandoId = version.id;
  ensureModalValor();
  $('cv-titulo').textContent = `Corregir — ${c.nombre} / ${servicio}`;
  $('cv-categoria').value = c.nombre;
  $('cv-servicio').value = servicio;
  $('cv-valor').value = version.valorHora;
  $('cv-grupo-vigencia').style.display = 'none';
  $('cv-motivo').value = '';
  abrirModal('modal-cat-valor');
}

export function abrirNuevaVigenciaValor(categoriaIdLocal, servicioEnc) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  const servicio = decodeURIComponent(servicioEnc);
  const version = obtenerValorHoraVigente(categoriaIdLocal, servicio, hoyISO());
  _valorModo = 'vigencia'; _valorCategoriaId = categoriaIdLocal; _valorServicio = servicio; _valorEditandoId = null;
  ensureModalValor();
  $('cv-titulo').textContent = `Nueva vigencia — ${c.nombre} / ${servicio}`;
  $('cv-categoria').value = c.nombre;
  $('cv-servicio').value = servicio;
  $('cv-valor').value = version ? version.valorHora : '';
  $('cv-grupo-vigencia').style.display = 'block';
  $('cv-vigencia-desde').value = hoyISO();
  $('cv-motivo').value = '';
  abrirModal('modal-cat-valor');
}

export async function guardarValorDesdeModal() {
  const servicio = ($('cv-servicio').value || '').trim();
  const valorHora = parseFloat($('cv-valor').value);
  const motivo = ($('cv-motivo').value || '').trim();
  if (!servicio) { toast('⚠️ Ingresá el servicio'); return; }
  if (isNaN(valorHora) || valorHora < 0) { toast('⚠️ Ingresá un valor hora válido'); return; }
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }

  if (_valorModo === 'corregir') {
    const version = (DB.valoresHoraCategoria || []).find(v => String(v.id) === String(_valorEditandoId));
    if (!version) { toast('⚠️ No se encontró la versión'); return; }
    version.valorHora = valorHora;
    version.motivoCarga = motivo;
    version.cargadaPor = currentUser?.nombre || '';
    await supaSync('valoresHoraCategoria', version);
    toast('✅ Valor corregido — los cálculos históricos no cambian');
  } else {
    const vigenciaDesde = $('cv-vigencia-desde').value;
    if (!vigenciaDesde) { toast('⚠️ Ingresá la fecha de vigencia'); return; }
    if (new Date(vigenciaDesde + 'T00:00:00') < new Date(hoyISO() + 'T00:00:00')) {
      if (!confirm(`⚠️ Este valor aplica retroactivamente desde ${vigenciaDesde}. Los cálculos anteriores NO se recalculan. ¿Continuar?`)) return;
    }
    const anterior = obtenerValorHoraVigente(_valorCategoriaId, _valorServicio, vigenciaDesde);
    if (anterior) {
      const cierre = new Date(vigenciaDesde + 'T00:00:00');
      cierre.setDate(cierre.getDate() - 1);
      anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
      await supaSync('valoresHoraCategoria', anterior);
    }
    const nueva = {
      id: Date.now(),
      categoriaIdLocal: idLocalTrunc(_valorCategoriaId),
      servicioNombre: _valorServicio,
      valorHora, vigenciaDesde, vigenciaHasta: null,
      cargadaPor: currentUser?.nombre || '', motivoCarga: motivo,
    };
    if (!DB.valoresHoraCategoria) DB.valoresHoraCategoria = [];
    DB.valoresHoraCategoria.push(nueva);
    await supaSync('valoresHoraCategoria', nueva);
    toast('✅ Valor guardado');
  }
  cerrarModal('modal-cat-valor');
  renderMatrizValores();
}

// ========== MODAL — HISTORIAL DE UNA COMBINACIÓN ==========

function ensureModalHistorialValor() {
  if ($('modal-cat-valor-historial')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cat-valor-historial';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3 id="cvh-titulo">Historial</h3><button class="btn-close" onclick="cerrarModal('modal-cat-valor-historial')">×</button></div>
      <div class="modal-body" id="cvh-cuerpo"></div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-cat-valor-historial')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirHistorialValor(categoriaIdLocal, servicioEnc) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  const servicio = decodeURIComponent(servicioEnc);
  ensureModalHistorialValor();
  $('cvh-titulo').textContent = `Historial — ${c.nombre} / ${servicio}`;
  const versiones = (DB.valoresHoraCategoria || [])
    .filter(v => !v.anulado && String(v.categoriaIdLocal) === idLocalTrunc(categoriaIdLocal) && v.servicioNombre === servicio)
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
  $('cvh-cuerpo').innerHTML = versiones.map(v => `<div class="info-item">
      <div class="key">${v.vigenciaDesde} ${v.vigenciaHasta ? 'al ' + v.vigenciaHasta : '(vigente)'}</div>
      <div class="val">$${Number(v.valorHora).toLocaleString('es-AR')} — cargado por ${v.cargadaPor}${v.motivoCarga ? ' — ' + v.motivoCarga : ''}</div>
    </div>`).join('') || '<p style="opacity:.5;">Sin historial</p>';
  abrirModal('modal-cat-valor-historial');
}

// ========== MODAL — CARGA MASIVA ==========

function ensureModalCargaMasiva() {
  if ($('modal-cat-masiva')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cat-masiva';
  m.innerHTML = `
    <div class="modal" style="max-width:720px;">
      <div class="modal-header"><h3>+ Carga masiva de valores</h3><button class="btn-close" onclick="cerrarModal('modal-cat-masiva')">×</button></div>
      <div class="modal-body">
        <p style="font-size:12.5px;color:var(--texto-suave);margin-top:0;">Dejá en blanco las filas que no cambian. Se crea una nueva versión solo para las que tengan un valor nuevo cargado.</p>
        <div class="tabla-wrap" style="max-height:360px;overflow-y:auto;"><table>
          <thead><tr><th>Categoría</th><th>Servicio</th><th>Valor vigente</th><th>Valor nuevo</th></tr></thead>
          <tbody id="cm-tbody"></tbody>
        </table></div>
        <div class="form-group" style="margin-top:12px;"><label>Vigente desde (aplica a todas las filas cargadas) *</label><input type="date" id="cm-vigencia-desde"></div>
        <div class="form-group"><label>Motivo *</label><textarea id="cm-motivo" rows="2" placeholder="Ej: Paritaria julio 2026"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cat-masiva')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarCargaMasiva()">Guardar cambios</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirCargaMasiva() {
  ensureModalCargaMasiva();
  const hoy = hoyISO();
  const filas = (DB.valoresHoraCategoria || [])
    .filter(v => !v.anulado && v.vigenciaDesde <= hoy && (!v.vigenciaHasta || v.vigenciaHasta >= hoy))
    .map(v => ({ v, c: getCategoriaById(v.categoriaIdLocal) }))
    .filter(({ c }) => c && c.activa)
    .sort((a, b) => (a.c.orden || 0) - (b.c.orden || 0) || a.v.servicioNombre.localeCompare(b.v.servicioNombre));

  if (filas.length === 0) {
    toast('⚠️ No hay valores vigentes cargados todavía para actualizar en masa — cargalos primero desde la matriz');
    return;
  }

  $('cm-tbody').innerHTML = filas.map(({ v, c }, i) => `
    <tr data-cm-idx="${i}" data-cm-cat="${v.categoriaIdLocal}" data-cm-serv="${encodeURIComponent(v.servicioNombre)}">
      <td>${c.nombre}</td>
      <td style="font-size:12px;">${v.servicioNombre}</td>
      <td style="text-align:right;">$${Number(v.valorHora).toLocaleString('es-AR')}</td>
      <td><input type="number" min="0" step="0.01" class="cm-input-nuevo" style="width:110px;" placeholder="—"></td>
    </tr>`).join('');
  $('cm-vigencia-desde').value = hoy;
  $('cm-motivo').value = '';
  abrirModal('modal-cat-masiva');
}

export async function confirmarCargaMasiva() {
  const vigenciaDesde = $('cm-vigencia-desde').value;
  const motivo = ($('cm-motivo').value || '').trim();
  if (!vigenciaDesde) { toast('⚠️ Ingresá la fecha de vigencia'); return; }
  if (!motivo) { toast('⚠️ El motivo es obligatorio'); return; }

  const filas = Array.from(document.querySelectorAll('#cm-tbody tr'));
  const cambios = filas.map(tr => ({
    categoriaIdLocal: tr.getAttribute('data-cm-cat'),
    servicioNombre: decodeURIComponent(tr.getAttribute('data-cm-serv')),
    nuevoValor: parseFloat(tr.querySelector('.cm-input-nuevo').value),
  })).filter(f => !isNaN(f.nuevoValor) && f.nuevoValor >= 0);

  if (cambios.length === 0) { toast('⚠️ No cargaste ningún valor nuevo'); return; }
  if (!confirm(`Se van a crear ${cambios.length} nueva(s) versión(es) vigente desde ${vigenciaDesde}. Los cálculos anteriores no se recalculan. ¿Confirmás?`)) return;

  let i = 0;
  for (const cambio of cambios) {
    const anterior = obtenerValorHoraVigente(cambio.categoriaIdLocal, cambio.servicioNombre, vigenciaDesde);
    if (anterior) {
      const cierre = new Date(vigenciaDesde + 'T00:00:00');
      cierre.setDate(cierre.getDate() - 1);
      anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
      await supaSync('valoresHoraCategoria', anterior);
    }
    const nueva = {
      id: Date.now() + (i++),
      categoriaIdLocal: idLocalTrunc(cambio.categoriaIdLocal),
      servicioNombre: cambio.servicioNombre,
      valorHora: cambio.nuevoValor, vigenciaDesde, vigenciaHasta: null,
      cargadaPor: currentUser?.nombre || '', motivoCarga: motivo,
    };
    if (!DB.valoresHoraCategoria) DB.valoresHoraCategoria = [];
    DB.valoresHoraCategoria.push(nueva);
    await supaSync('valoresHoraCategoria', nueva);
  }

  cerrarModal('modal-cat-masiva');
  renderMatrizValores();
  toast(`✅ ${cambios.length} valor(es) actualizado(s)`);
}
