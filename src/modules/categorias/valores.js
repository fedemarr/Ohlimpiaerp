// Categorías v1.1 — Tab 2: matriz de valores hora por categoría × mes.
// Rediseño (feedback de Gabi, 2026-07): la paritaria dejó de negociar
// valores por servicio — ahora es un único valor por categoría. Se
// mantiene la MISMA tabla `valoresHoraCategoria` (con `servicioNombre`
// ahora nullable) para no romper al único consumidor real que existía
// del modelo viejo: `enfermos_accidentes/categoria_helper.js` (congela
// el valor hora vigente al abrir un caso, buscando por categoría+
// servicio). Los registros nuevos se cargan con `servicioNombre: null`
// ("aplica a toda la categoría, sin importar servicio") — ver el
// matching actualizado en `consultas.js` (obtenerValorHoraVigente):
// un valor específico de servicio (dato histórico) sigue ganándole a
// uno general si ambos están vigentes, así que los casos médicos ya
// congelados y cualquier vigencia vieja por servicio no se alteran.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getCategoriaById, obtenerValorHoraVigente, idLocalTrunc } from './consultas.js';

function hoyISO() { return new Date().toISOString().slice(0, 10); }

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function categoriasActivas() {
  return (DB.categoriasBase || []).filter(c => !c.anulado && c.activa)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

// ========== TAB 2 — MATRIZ CATEGORÍA × MES ==========

export function poblarFiltrosMatrizValores() {
  const selCat = $('val-filtro-categoria');
  if (selCat) selCat.innerHTML = categoriasActivas().map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  const selAnio = $('val-filtro-anio');
  if (selAnio) {
    const anioActual = new Date().getFullYear();
    const anios = [anioActual - 1, anioActual, anioActual + 1];
    selAnio.innerHTML = anios.map(a => `<option value="${a}" ${a === anioActual ? 'selected' : ''}>${a}</option>`).join('');
  }
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
  const categorias = categoriasActivas().filter(c => catsFiltro.length === 0 || catsFiltro.includes(String(c.id)));
  const anio = parseInt(($('val-filtro-anio') || {}).value) || new Date().getFullYear();

  if (categorias.length === 0) {
    wrap.innerHTML = '<p style="opacity:.5;padding:24px;text-align:center;">Sin categorías para mostrar con este filtro</p>';
    return;
  }

  const hoy = hoyISO();
  let html = '<table><thead><tr><th style="position:sticky;left:0;background:#374151;color:white;z-index:1;">Categoría</th>';
  html += MESES.map(m => `<th style="font-size:11px;">${m}</th>`).join('');
  html += '<th style="white-space:nowrap;">Acciones</th></tr></thead><tbody>';
  html += categorias.map(c => {
    let fila = `<tr><td style="position:sticky;left:0;background:white;font-weight:600;white-space:nowrap;">${c.nombre}</td>`;
    fila += MESES.map((_, i) => {
      const fechaMes = `${anio}-${String(i + 1).padStart(2, '0')}-01`;
      const v = obtenerValorHoraVigente(c.id, null, fechaMes);
      return `<td style="text-align:center;font-size:12.5px;">${v ? '$' + Number(v.valorHora).toLocaleString('es-AR') : '—'}</td>`;
    }).join('');
    const vigente = obtenerValorHoraVigente(c.id, null, hoy);
    fila += `<td style="white-space:nowrap;">
      ${vigente
        ? `<button class="btn btn-xs" style="background:var(--verde-claro,#dcfce7);color:#065f46;" onclick="abrirCorregirValor('${c.id}')" title="Corregir valor vigente">✏️</button>
           <button class="btn btn-xs btn-secondary" onclick="abrirNuevaVigenciaValor('${c.id}')" title="Nueva vigencia">📅</button>`
        : `<button class="btn btn-xs btn-secondary" onclick="abrirCargarValor('${c.id}')">Cargar</button>`}
      <button class="btn btn-xs btn-secondary" onclick="abrirHistorialValor('${c.id}')" title="Historial">🕐</button>
    </td>`;
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

export function abrirCargarValor(categoriaIdLocal) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  _valorModo = 'cargar'; _valorCategoriaId = categoriaIdLocal; _valorEditandoId = null;
  ensureModalValor();
  $('cv-titulo').textContent = `Cargar valor — ${c.nombre}`;
  $('cv-categoria').value = c.nombre;
  $('cv-valor').value = '';
  $('cv-grupo-vigencia').style.display = 'block';
  $('cv-vigencia-desde').value = hoyISO();
  $('cv-motivo').value = '';
  abrirModal('modal-cat-valor');
}

export function abrirCorregirValor(categoriaIdLocal) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  const version = obtenerValorHoraVigente(categoriaIdLocal, null, hoyISO());
  if (!version) { toast('⚠️ No hay una versión vigente para corregir'); return; }
  _valorModo = 'corregir'; _valorCategoriaId = categoriaIdLocal; _valorEditandoId = version.id;
  ensureModalValor();
  $('cv-titulo').textContent = `Corregir — ${c.nombre}`;
  $('cv-categoria').value = c.nombre;
  $('cv-valor').value = version.valorHora;
  $('cv-grupo-vigencia').style.display = 'none';
  $('cv-motivo').value = '';
  abrirModal('modal-cat-valor');
}

export function abrirNuevaVigenciaValor(categoriaIdLocal) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  const version = obtenerValorHoraVigente(categoriaIdLocal, null, hoyISO());
  _valorModo = 'vigencia'; _valorCategoriaId = categoriaIdLocal; _valorEditandoId = null;
  ensureModalValor();
  $('cv-titulo').textContent = `Nueva vigencia — ${c.nombre}`;
  $('cv-categoria').value = c.nombre;
  $('cv-valor').value = version ? version.valorHora : '';
  $('cv-grupo-vigencia').style.display = 'block';
  $('cv-vigencia-desde').value = hoyISO();
  $('cv-motivo').value = '';
  abrirModal('modal-cat-valor');
}

export async function guardarValorDesdeModal() {
  const valorHora = parseFloat($('cv-valor').value);
  const motivo = ($('cv-motivo').value || '').trim();
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
    // Solo cierra una vigencia general anterior (servicioNombre null) —
    // obtenerValorHoraVigente con servicio=null solo matchea ese subconjunto.
    const anterior = obtenerValorHoraVigente(_valorCategoriaId, null, vigenciaDesde);
    if (anterior) {
      const cierre = new Date(vigenciaDesde + 'T00:00:00');
      cierre.setDate(cierre.getDate() - 1);
      anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
      await supaSync('valoresHoraCategoria', anterior);
    }
    const nueva = {
      id: Date.now(),
      categoriaIdLocal: idLocalTrunc(_valorCategoriaId),
      servicioNombre: null,
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

// ========== MODAL — HISTORIAL DE UNA CATEGORÍA ==========

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

export function abrirHistorialValor(categoriaIdLocal) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  ensureModalHistorialValor();
  $('cvh-titulo').textContent = `Historial — ${c.nombre}`;
  const versiones = (DB.valoresHoraCategoria || [])
    .filter(v => !v.anulado && v.servicioNombre == null && String(v.categoriaIdLocal) === idLocalTrunc(categoriaIdLocal))
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
    <div class="modal" style="max-width:600px;">
      <div class="modal-header"><h3>+ Carga masiva de valores</h3><button class="btn-close" onclick="cerrarModal('modal-cat-masiva')">×</button></div>
      <div class="modal-body">
        <p style="font-size:12.5px;color:var(--texto-suave);margin-top:0;">Dejá en blanco las categorías que no cambian. Se crea una nueva versión solo para las que tengan un valor nuevo cargado.</p>
        <div class="tabla-wrap" style="max-height:360px;overflow-y:auto;"><table>
          <thead><tr><th>Categoría</th><th>Valor vigente</th><th>Valor nuevo</th></tr></thead>
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
  const cats = categoriasActivas();
  if (cats.length === 0) { toast('⚠️ No hay categorías activas'); return; }

  $('cm-tbody').innerHTML = cats.map(c => {
    const v = obtenerValorHoraVigente(c.id, null, hoy);
    return `<tr data-cm-cat="${c.id}">
      <td>${c.nombre}</td>
      <td style="text-align:right;">${v ? '$' + Number(v.valorHora).toLocaleString('es-AR') : 'sin cargar'}</td>
      <td><input type="number" min="0" step="0.01" class="cm-input-nuevo" style="width:110px;" placeholder="—"></td>
    </tr>`;
  }).join('');
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
    nuevoValor: parseFloat(tr.querySelector('.cm-input-nuevo').value),
  })).filter(f => !isNaN(f.nuevoValor) && f.nuevoValor >= 0);

  if (cambios.length === 0) { toast('⚠️ No cargaste ningún valor nuevo'); return; }
  if (!confirm(`Se van a crear ${cambios.length} nueva(s) versión(es) vigente desde ${vigenciaDesde}. Los cálculos anteriores no se recalculan. ¿Confirmás?`)) return;

  let i = 0;
  for (const cambio of cambios) {
    const anterior = obtenerValorHoraVigente(cambio.categoriaIdLocal, null, vigenciaDesde);
    if (anterior) {
      const cierre = new Date(vigenciaDesde + 'T00:00:00');
      cierre.setDate(cierre.getDate() - 1);
      anterior.vigenciaHasta = cierre.toISOString().slice(0, 10);
      await supaSync('valoresHoraCategoria', anterior);
    }
    const nueva = {
      id: Date.now() + (i++),
      categoriaIdLocal: idLocalTrunc(cambio.categoriaIdLocal),
      servicioNombre: null,
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
