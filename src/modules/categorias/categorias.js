// Categorías v1 — Tab 1 (catálogo de categorías base) y Tab 4
// (historial/auditoría combinado de valores hora + plus).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getCategoriaById, getPlusById, idLocalTrunc } from './consultas.js';

export const GRUPOS_CATEGORIA = ['Operativo', 'Encargado', 'Retén', 'Especial'];

function siguienteCodigoCategoria() {
  const nums = (DB.categoriasBase || [])
    .map(c => parseInt((c.codigo || '').replace('CAT-', ''), 10))
    .filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return 'CAT-' + String(max + 1).padStart(3, '0');
}

// ========== TAB 1 — CATÁLOGO ==========

export function renderCatalogoCategorias() {
  const tbody = $('tbody-cat-catalogo');
  if (!tbody) return;
  const categorias = (DB.categoriasBase || []).filter(c => !c.anulado)
    .sort((a, b) => (b.activa - a.activa) || (a.orden || 0) - (b.orden || 0));
  tbody.innerHTML = categorias.length === 0
    ? '<tr><td colspan="6" style="text-align:center;padding:24px;opacity:.5;">Sin categorías cargadas</td></tr>'
    : categorias.map(c => {
      const cantServicios = new Set((DB.valoresHoraCategoria || [])
        .filter(v => !v.anulado && String(v.categoriaIdLocal) === idLocalTrunc(c.id))
        .map(v => v.servicioNombre)).size;
      return `<tr style="${!c.activa ? 'opacity:.5;' : ''}">
        <td style="font-family:'DM Mono',monospace;font-size:12px;">${c.codigo}</td>
        <td>${c.nombre}${c.esReten ? ' <span class="badge badge-azul" style="font-size:10px;">Retén</span>' : ''}</td>
        <td style="font-size:12px;">${c.grupo}</td>
        <td style="text-align:center;">${cantServicios}</td>
        <td style="text-align:center;"><span class="badge ${c.activa ? 'badge-verde' : 'badge-gris'}">${c.activa ? 'Activa' : 'Inactiva'}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-xs btn-secondary" onclick="abrirEditarCategoria('${c.id}')">✏️</button>
          <button class="btn btn-xs" onclick="verValoresDeCategoria('${c.id}')">👁 Valores</button>
          <button class="btn btn-xs" onclick="activarDesactivarCategoriaPorId('${c.id}')">${c.activa ? '🚫' : '✅'}</button>
        </td>
      </tr>`;
    }).join('');
}

export async function activarDesactivarCategoriaPorId(categoriaIdLocal) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  if (c.activa && !confirm(`¿Desactivar la categoría "${c.nombre}"? No se podrá elegir en cargas nuevas.`)) return;
  c.activa = !c.activa;
  await supaSync('categoriasBase', c);
  renderCatalogoCategorias();
  toast(c.activa ? '✅ Categoría activada' : '🚫 Categoría desactivada — no se podrá elegir en cargas nuevas, los valores ya cargados no se tocan');
}

// Atajo desde el catálogo hacia la matriz de valores, filtrada por
// esta categoría (Tab 2 vive en valores.js — ver window bindings en index.js).
export function verValoresDeCategoria(categoriaIdLocal) {
  window.tabCat && window.tabCat('valores');
  setTimeout(() => {
    const sel = $('val-filtro-categoria');
    if (sel) {
      Array.from(sel.options).forEach(o => { o.selected = o.value === String(categoriaIdLocal); });
      window.filtrarMatrizValores && window.filtrarMatrizValores();
    }
  }, 0);
}

// ========== MODAL — NUEVA / EDITAR CATEGORÍA ==========

let _categoriaEditandoId = null;

function ensureModalCategoria() {
  if ($('modal-cat-nueva')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cat-nueva';
  m.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3 id="cn-titulo">+ Nueva categoría</h3><button class="btn-close" onclick="cerrarModal('modal-cat-nueva')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Código</label><input type="text" id="cn-codigo" readonly></div>
        <div class="form-group"><label>Nombre *</label><input type="text" id="cn-nombre"></div>
        <div class="form-group"><label>Descripción</label><textarea id="cn-desc" rows="2"></textarea></div>
        <div class="form-group"><label>Grupo *</label><select id="cn-grupo">${GRUPOS_CATEGORIA.map(g => `<option>${g}</option>`).join('')}</select></div>
        <div class="form-group"><label><input type="checkbox" id="cn-es-reten"> Es Retén / Franquero (usa lógica de Retén)</label></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-cat-nueva')">Cancelar</button>
        <button class="btn btn-primary" onclick="guardarCategoriaDesdeModal()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirNuevaCategoria() {
  _categoriaEditandoId = null;
  ensureModalCategoria();
  $('cn-titulo').textContent = '+ Nueva categoría';
  $('cn-codigo').value = siguienteCodigoCategoria();
  $('cn-nombre').value = '';
  $('cn-desc').value = '';
  $('cn-grupo').value = GRUPOS_CATEGORIA[0];
  $('cn-es-reten').checked = false;
  abrirModal('modal-cat-nueva');
}

export function abrirEditarCategoria(categoriaIdLocal) {
  const c = getCategoriaById(categoriaIdLocal);
  if (!c) return;
  _categoriaEditandoId = categoriaIdLocal;
  ensureModalCategoria();
  $('cn-titulo').textContent = `Editar — ${c.nombre}`;
  $('cn-codigo').value = c.codigo;
  $('cn-nombre').value = c.nombre;
  $('cn-desc').value = c.descripcion || '';
  $('cn-grupo').value = c.grupo;
  $('cn-es-reten').checked = !!c.esReten;
  abrirModal('modal-cat-nueva');
}

export async function guardarCategoriaDesdeModal() {
  const nombre = ($('cn-nombre').value || '').trim();
  if (!nombre) { toast('⚠️ Ingresá el nombre de la categoría'); return; }
  const grupo = $('cn-grupo').value;
  const descripcion = ($('cn-desc').value || '').trim();
  const esReten = $('cn-es-reten').checked;

  if (_categoriaEditandoId) {
    const c = getCategoriaById(_categoriaEditandoId);
    if (!c) { toast('⚠️ No se encontró la categoría'); return; }
    c.nombre = nombre; c.descripcion = descripcion; c.grupo = grupo; c.esReten = esReten;
    await supaSync('categoriasBase', c);
    toast('✅ Categoría actualizada');
  } else {
    const nueva = {
      id: Date.now(),
      codigo: $('cn-codigo').value,
      nombre, descripcion, grupo, esReten,
      activa: true, orden: (DB.categoriasBase || []).length * 10 + 10,
    };
    if (!DB.categoriasBase) DB.categoriasBase = [];
    DB.categoriasBase.push(nueva);
    await supaSync('categoriasBase', nueva);
    toast('✅ Categoría creada');
  }
  cerrarModal('modal-cat-nueva');
  renderCatalogoCategorias();
}

// ========== TAB 4 — HISTORIAL ==========

function filaHistorial(tipo, objeto, v, anterior) {
  return `<tr>
    <td style="font-size:12px;">${(v.vigenciaDesde || '')}</td>
    <td><span class="badge ${tipo === 'Categoría' ? 'badge-azul' : 'badge-acento'}">${tipo}</span></td>
    <td style="font-size:12px;">${objeto}</td>
    <td style="text-align:right;font-size:12px;">${anterior != null ? '$' + Number(anterior).toLocaleString('es-AR') : '—'}</td>
    <td style="text-align:right;font-weight:600;">$${Number(tipo === 'Categoría' ? v.valorHora : v.valorAdicional).toLocaleString('es-AR')}</td>
    <td style="font-size:12px;">${v.cargadaPor}</td>
    <td style="font-size:12px;max-width:220px;">${v.motivoCarga || '—'}</td>
  </tr>`;
}

function construirFilasHistorial() {
  const filas = [];

  const gruposValoresHora = new Map();
  for (const v of (DB.valoresHoraCategoria || []).filter(v => !v.anulado)) {
    const clave = v.categoriaIdLocal + '|' + v.servicioNombre;
    if (!gruposValoresHora.has(clave)) gruposValoresHora.set(clave, []);
    gruposValoresHora.get(clave).push(v);
  }
  for (const [, versiones] of gruposValoresHora) {
    versiones.sort((a, b) => (a.vigenciaDesde || '').localeCompare(b.vigenciaDesde || ''));
    versiones.forEach((v, i) => {
      const c = getCategoriaById(v.categoriaIdLocal);
      filas.push({
        tipo: 'Categoría', objeto: `${c?.nombre || '—'} — ${v.servicioNombre}`,
        v, anterior: i > 0 ? versiones[i - 1].valorHora : null,
        fecha: v.vigenciaDesde, categoriaIdLocal: v.categoriaIdLocal, servicio: v.servicioNombre,
      });
    });
  }

  const gruposPlus = new Map();
  for (const v of (DB.valoresPlus || []).filter(v => !v.anulado)) {
    if (!gruposPlus.has(v.plusIdLocal)) gruposPlus.set(v.plusIdLocal, []);
    gruposPlus.get(v.plusIdLocal).push(v);
  }
  for (const [, versiones] of gruposPlus) {
    versiones.sort((a, b) => (a.vigenciaDesde || '').localeCompare(b.vigenciaDesde || ''));
    versiones.forEach((v, i) => {
      const p = getPlusById(v.plusIdLocal);
      filas.push({
        tipo: 'Plus', objeto: p?.nombre || '—',
        v, anterior: i > 0 ? versiones[i - 1].valorAdicional : null,
        fecha: v.vigenciaDesde, categoriaIdLocal: null, servicio: null,
      });
    });
  }

  return filas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

export function renderHistorialCategorias() {
  const tbody = $('tbody-cat-historial');
  if (!tbody) return;
  let filas = construirFilasHistorial();

  const q = ($('cat-hist-buscar') || {}).value?.toLowerCase() || '';
  const tipo = ($('cat-hist-tipo') || {}).value || '';
  const desde = ($('cat-hist-desde') || {}).value || '';
  const hasta = ($('cat-hist-hasta') || {}).value || '';
  if (q) filas = filas.filter(f => f.objeto.toLowerCase().includes(q) || f.v.cargadaPor.toLowerCase().includes(q));
  if (tipo) filas = filas.filter(f => f.tipo === tipo);
  if (desde) filas = filas.filter(f => (f.fecha || '') >= desde);
  if (hasta) filas = filas.filter(f => (f.fecha || '') <= hasta);

  tbody.innerHTML = filas.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:24px;opacity:.5;">Sin cambios registrados</td></tr>'
    : filas.map(f => filaHistorial(f.tipo, f.objeto, f.v, f.anterior)).join('');
}

export function filtrarHistorialCategorias() { renderHistorialCategorias(); }

export async function exportarHistorialCategoriasExcel() {
  const filas = construirFilasHistorial();
  if (!filas.length) { toast('⚠️ No hay datos para exportar'); return; }
  const XLSX = await import('xlsx');
  const datos = filas.map(f => ({
    Fecha: f.fecha, Tipo: f.tipo, Objeto: f.objeto,
    'Valor anterior': f.anterior ?? '', 'Valor nuevo': f.tipo === 'Categoría' ? f.v.valorHora : f.v.valorAdicional,
    'Cargado por': f.v.cargadaPor, Motivo: f.v.motivoCarga || '',
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Historial');
  XLSX.writeFile(libro, `categorias_historial_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
