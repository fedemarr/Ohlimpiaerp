// Importador de listado de precios de proveedor (ticket "Importar listado
// de precios", 08/2026) — módulo Pedido de Productos, tab Catálogo.
//
// Objetivo: el proveedor manda periódicamente un CSV con su lista de
// precios; se sube acá, se arma un diff contra el catálogo actual
// (nuevos / precio modificado / dados de baja / sin cambios) y sólo se
// escribe algo en Supabase cuando el usuario confirma — igual que
// legajos/importarCbu.js (mismo patrón de preview + confirmar).
//
// Formato confirmado con archivo real ("Lista General de Precios - Nimi
// Profesional", 08/2026): CSV con columnas Código, Descripción, Cod,
// Precio — "Cod" es un código de rubro/marca (PU, POL, 3M, DV, ITA...),
// NO el identificador del producto, así que no se mapea (evita matchear
// mal contra codigo_monica). Precio en formato argentino
// ("11.584,41" = 11584.41).
//
// Match: por codigo_monica (columna "Código" del archivo) — es el único
// identificador estable que tiene pp_productos. Productos del catálogo
// sin codigo_monica cargado no se pueden diffear de forma confiable
// (no hay con qué compararlos) y quedan afuera del diff — no se marcan
// como "de baja" por descarte. Filas del archivo sin código tampoco se
// importan (se listan como inválidas) por el mismo motivo: crear un
// producto sin código rompería el matching en la próxima importación.
//
// Mismo criterio que los otros importadores del proyecto (legajos/
// importarCbu.js, candidatos/importadorHistorico.js): CSV texto plano,
// parser propio sin librerías externas (no se usa xlsx/papaparse — el
// repo no las usa en ningún importador existente, se sigue esa
// convención en vez de agregar una dependencia nueva).

import { DB } from '@shared/state.js';
import { $, hoyStr } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { renderCatalogoPP } from './pedido_productos.js';

function _id(prefijo) { return prefijo + '-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }
function _money(n) { return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 }); }

// ========== ESTADO INTERNO ==========

let _filasParseadas = [];
let _diff = null; // { nuevos, modificados, bajas, sinCambios, invalidas } — arrays de filas resueltas

// ========== MODAL ==========

function ensureModal() {
  if ($('modal-importar-listado-pp')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-importar-listado-pp';
  m.innerHTML = crearHTMLModal();
  document.body.appendChild(m);
}

function crearHTMLModal() {
  return [
    '<div class="modal" style="max-width:920px;">',
      '<div class="modal-header" style="background:#1e3a8a;color:white;">',
        '<h3 style="color:white;">📥 Importar listado de precios</h3>',
        '<button class="btn-close" style="color:white;" onclick="cerrarModal(\'modal-importar-listado-pp\')">×</button>',
      '</div>',
      '<div class="modal-body">',
        '<div class="alerta alerta-info" style="margin-bottom:12px;">',
          'Subí el CSV que manda el proveedor (columnas <strong>Código</strong>, <strong>Descripción</strong> y <strong>Precio</strong> — el orden no importa). ',
          'Se arma una comparación contra el catálogo actual: <strong>nada se guarda todavía</strong>, revisá abajo y confirmá.',
        '</div>',
        '<div class="form-group">',
          '<label>Proveedor de este listado</label>',
          '<select id="imp-pp-proveedor" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" onchange="cambiarProveedorImportPP()"></select>',
        '</div>',
        '<div class="form-group">',
          '<label>Archivo CSV</label>',
          '<input type="file" id="imp-pp-file" accept=".csv,.txt,text/csv" onchange="seleccionarArchivoListadoPP()" disabled>',
        '</div>',
        '<div id="imp-pp-aviso-encoding" style="display:none;margin-top:8px;padding:8px 10px;border-radius:6px;font-size:12px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;">',
          '⚠️ El archivo parece tener caracteres mal codificados (probablemente se guardó como "CSV" en vez de "CSV UTF-8" desde Excel). Revisá los nombres antes de confirmar.',
        '</div>',
        '<div id="imp-pp-resumen" style="margin:10px 0;font-size:13px;font-weight:600;color:var(--texto-suave);"></div>',
        '<div id="imp-pp-diff" style="max-height:440px;overflow-y:auto;"></div>',
      '</div>',
      '<div class="modal-footer" style="justify-content:space-between;">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-importar-listado-pp\')">Cancelar</button>',
        '<button id="btn-confirmar-import-listado-pp" class="btn btn-primary" style="display:none;" onclick="confirmarImportarListadoPP()">✅ Aplicar cambios seleccionados</button>',
      '</div>',
    '</div>',
  ].join('');
}

export function abrirImportarListadoPP() {
  ensureModal();
  _filasParseadas = [];
  _diff = null;
  const provs = (DB.proveedores || []).filter(p => !p.anulado).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const provSel = $('imp-pp-proveedor');
  if (provSel) {
    provSel.innerHTML = '<option value="">Seleccionar...</option>' + provs.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  }
  const fileEl = $('imp-pp-file'); if (fileEl) { fileEl.value = ''; fileEl.disabled = true; }
  const diffEl = $('imp-pp-diff'); if (diffEl) diffEl.innerHTML = '';
  const resEl = $('imp-pp-resumen'); if (resEl) resEl.textContent = '';
  const avisoEl = $('imp-pp-aviso-encoding'); if (avisoEl) avisoEl.style.display = 'none';
  const btn = $('btn-confirmar-import-listado-pp');
  if (btn) { btn.style.display = 'none'; btn.disabled = false; btn.textContent = '✅ Aplicar cambios seleccionados'; }
  abrirModal('modal-importar-listado-pp');
}

export function cambiarProveedorImportPP() {
  const fileEl = $('imp-pp-file');
  if (fileEl) fileEl.disabled = !($('imp-pp-proveedor') || {}).value;
}

// ========== NORMALIZACIÓN / PARSER ==========
// Mismo criterio que legajos/importarCbu.js.

function normalizarHeader(h) {
  return (h || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// A propósito NO se mapea "cod" (columna de rubro/marca en el archivo real
// de Nimi) — sólo variantes completas de "código" y sinónimos habituales.
const ALIASES = {
  codigo: 'codigo', código: 'codigo', codigo_producto: 'codigo', sku: 'codigo', code: 'codigo',
  descripcion: 'descripcion', descripción: 'descripcion', producto: 'descripcion', detalle: 'descripcion',
  precio: 'precio', precio_unitario: 'precio', costo: 'precio', costo_unitario: 'precio',
};

function soloTexto(s) { return (s || '').trim(); }

function parseCSV(texto) {
  const finPrimeraLinea = texto.search(/\r\n|\r|\n/);
  const cabecera = finPrimeraLinea === -1 ? texto : texto.slice(0, finPrimeraLinea);
  const delim = cabecera.split(';').length > cabecera.split(',').length ? ';' : ',';
  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroComillas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else dentroComillas = false; }
      else campo += c;
    } else if (c === '"') {
      dentroComillas = true;
    } else if (c === delim) {
      fila.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// "11.584,41" (formato argentino: punto de miles, coma decimal) → 11584.41.
// También tolera que ya venga en formato "11584.41" (punto decimal, sin
// miles) o con símbolo de moneda/espacios sueltos.
function parsearPrecioAR(v) {
  let s = (v || '').trim().replace(/[^\d.,\-]/g, '');
  if (!s) return null;
  const tieneComa = s.includes(',');
  const tienePunto = s.includes('.');
  if (tieneComa && tienePunto) {
    // El último separador es el decimal; el otro, miles.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (tieneComa) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ========== SELECCIONAR ARCHIVO ==========

export function seleccionarArchivoListadoPP() {
  if (!($('imp-pp-proveedor') || {}).value) {
    toast('⚠️ Elegí primero el proveedor de este listado');
    const input = $('imp-pp-file'); if (input) input.value = '';
    return;
  }
  const input = $('imp-pp-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const texto = String(e.target.result || '');
    const avisoEl = $('imp-pp-aviso-encoding');
    if (avisoEl) avisoEl.style.display = /Ã[\x80-\xBF]/.test(texto) ? 'block' : 'none';

    const filas = parseCSV(texto);
    if (!filas.length) { toast('⚠️ El archivo está vacío'); return; }
    const headerRowIdx = filas.findIndex(f => f.some(h => ALIASES[normalizarHeader(h)] === 'codigo') && f.some(h => ALIASES[normalizarHeader(h)] === 'precio'));
    if (headerRowIdx === -1) {
      $('imp-pp-diff').innerHTML = '<p style="padding:10px;color:#dc2626;">No se encontraron columnas de Código y Precio en el archivo.</p>';
      $('imp-pp-resumen').textContent = '';
      $('btn-confirmar-import-listado-pp').style.display = 'none';
      return;
    }
    const headers = filas[headerRowIdx].map(h => ALIASES[normalizarHeader(h)] || normalizarHeader(h));
    const filasDatos = filas.slice(headerRowIdx + 1).filter(f => f.some(v => (v || '').trim() !== ''));
    _filasParseadas = filasDatos.map(f => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = soloTexto(f[i]); });
      return obj;
    });

    calcularDiffYRenderizar();
  };
  reader.readAsText(file, 'UTF-8');
}

// ========== DIFF ==========

function calcularDiffYRenderizar() {
  if (!_filasParseadas.some(f => f.codigo)) {
    $('imp-pp-diff').innerHTML = '<p style="padding:10px;color:#dc2626;">Ninguna fila del archivo trae código de producto — no se puede armar la comparación.</p>';
    $('imp-pp-resumen').textContent = '';
    $('btn-confirmar-import-listado-pp').style.display = 'none';
    return;
  }

  const catalogoActivo = (DB.ppProductos || []).filter(p => !p.anulado);
  const catalogoPorCodigo = new Map(catalogoActivo.filter(p => p.codigoMonica).map(p => [p.codigoMonica.trim().toLowerCase(), p]));

  const nuevos = [], modificados = [], sinCambios = [], invalidas = [];
  const codigosVistos = new Set();
  const codigosEnArchivo = new Set();

  _filasParseadas.forEach(f => {
    const codigo = soloTexto(f.codigo);
    const descripcion = soloTexto(f.descripcion);
    const precio = parsearPrecioAR(f.precio);

    if (!codigo) { invalidas.push({ f, motivo: 'sin código' }); return; }
    codigosEnArchivo.add(codigo.toLowerCase());
    if (codigosVistos.has(codigo.toLowerCase())) { invalidas.push({ f, motivo: 'código repetido en el archivo (fila anterior ya lo usó)' }); return; }
    codigosVistos.add(codigo.toLowerCase());

    if (precio == null) { invalidas.push({ f, motivo: 'precio no reconocido: "' + f.precio + '"' }); return; }
    if (!descripcion) { invalidas.push({ f, motivo: 'sin descripción' }); return; }

    const existente = catalogoPorCodigo.get(codigo.toLowerCase());
    if (!existente) {
      nuevos.push({ codigo, descripcion, precio });
    } else {
      const precioActual = precioVigenteLocal(existente.id);
      if (precioActual != null && Math.abs(precioActual - precio) < 0.005) {
        sinCambios.push({ codigo, descripcion, precio, producto: existente });
      } else {
        modificados.push({ codigo, descripcion, precio, precioAnterior: precioActual, producto: existente });
      }
    }
  });

  // Dados de baja: productos activos CON código cargado que no aparecen en
  // el archivo. Los sin código quedan afuera — no hay con qué compararlos.
  const bajas = catalogoActivo
    .filter(p => p.codigoMonica && !codigosEnArchivo.has(p.codigoMonica.trim().toLowerCase()))
    .map(p => ({ producto: p }));

  _diff = { nuevos, modificados, bajas, sinCambios, invalidas };
  renderDiffPP();
}

function precioVigenteLocal(productoId, fechaISO = hoyStr()) {
  const precios = (DB.ppPrecios || []).filter(pr => String(pr.productoIdLocal) === String(productoId) && !pr.anulado);
  const vigente = precios.find(pr => pr.vigenciaDesde <= fechaISO && (!pr.vigenciaHasta || pr.vigenciaHasta >= fechaISO));
  return vigente ? Number(vigente.costoUnit) : null;
}

// ========== RENDER DEL DIFF ==========

function filaCheckbox(grupo, idx, checked = true) {
  return `<input type="checkbox" class="imp-pp-check" data-grupo="${grupo}" data-idx="${idx}" ${checked ? 'checked' : ''}>`;
}

function renderDiffPP() {
  const cont = $('imp-pp-diff');
  const { nuevos, modificados, bajas, sinCambios, invalidas } = _diff;

  const seccion = (titulo, color, filasHtml, vacio) => filasHtml
    ? `<div style="margin-bottom:16px;">
        <div style="font-weight:700;font-size:13px;color:${color};margin-bottom:6px;">${titulo}</div>
        <table style="width:100%;border-collapse:collapse;">${filasHtml}</table>
      </div>`
    : '';

  const filasNuevos = nuevos.length ? '<thead><tr style="background:#16a34a;color:white;"><th style="padding:5px 8px;width:24px;"></th><th style="padding:5px 8px;text-align:left;">Código</th><th style="padding:5px 8px;text-align:left;">Descripción</th><th style="padding:5px 8px;text-align:right;">Precio</th></tr></thead><tbody>'
    + nuevos.map((n, i) => `<tr><td style="padding:4px 8px;">${filaCheckbox('nuevos', i)}</td><td style="padding:4px 8px;font-family:'DM Mono',monospace;font-size:12px;">${n.codigo}</td><td style="padding:4px 8px;font-size:12px;">${n.descripcion}</td><td style="padding:4px 8px;text-align:right;font-size:12px;">${_money(n.precio)}</td></tr>`).join('')
    + '</tbody>' : '';

  const filasMod = modificados.length ? '<thead><tr style="background:#d97706;color:white;"><th style="padding:5px 8px;width:24px;"></th><th style="padding:5px 8px;text-align:left;">Código</th><th style="padding:5px 8px;text-align:left;">Descripción</th><th style="padding:5px 8px;text-align:right;">Precio anterior</th><th style="padding:5px 8px;text-align:right;">Precio nuevo</th></tr></thead><tbody>'
    + modificados.map((m, i) => `<tr><td style="padding:4px 8px;">${filaCheckbox('modificados', i)}</td><td style="padding:4px 8px;font-family:'DM Mono',monospace;font-size:12px;">${m.codigo}</td><td style="padding:4px 8px;font-size:12px;">${m.descripcion}</td><td style="padding:4px 8px;text-align:right;font-size:12px;color:var(--texto-suave);">${m.precioAnterior != null ? _money(m.precioAnterior) : 'sin precio cargado'}</td><td style="padding:4px 8px;text-align:right;font-size:12px;font-weight:700;">${_money(m.precio)}</td></tr>`).join('')
    + '</tbody>' : '';

  const filasBaja = bajas.length ? '<thead><tr style="background:#dc2626;color:white;"><th style="padding:5px 8px;width:24px;"></th><th style="padding:5px 8px;text-align:left;">Código</th><th style="padding:5px 8px;text-align:left;">Descripción</th></tr></thead><tbody>'
    + bajas.map((b, i) => `<tr><td style="padding:4px 8px;">${filaCheckbox('bajas', i)}</td><td style="padding:4px 8px;font-family:'DM Mono',monospace;font-size:12px;">${b.producto.codigoMonica}</td><td style="padding:4px 8px;font-size:12px;">${b.producto.descripcion}</td></tr>`).join('')
    + '</tbody>' : '';

  const filasInvalidas = invalidas.length ? invalidas.map(x => `<div style="font-size:11.5px;color:#dc2626;padding:2px 0;">• ${x.f.codigo || '(sin código)'} — ${x.f.descripcion || '(sin descripción)'}: ${x.motivo}</div>`).join('') : '';

  cont.innerHTML =
    seccion(`🆕 Nuevos (${nuevos.length})`, '#16a34a', filasNuevos)
    + seccion(`💲 Precio modificado (${modificados.length})`, '#d97706', filasMod)
    + seccion(`🗑️ Ya no están en el archivo — se anulan (${bajas.length})`, '#dc2626', filasBaja)
    + (invalidas.length ? `<div style="margin-bottom:16px;"><div style="font-weight:700;font-size:13px;color:#dc2626;margin-bottom:4px;">⚠️ Filas no importadas (${invalidas.length})</div>${filasInvalidas}</div>` : '')
    + (!nuevos.length && !modificados.length && !bajas.length ? '<p style="padding:10px;color:var(--texto-suave);">Sin cambios para aplicar.</p>' : '');

  $('imp-pp-resumen').innerHTML = `<span style="color:var(--verde);">${nuevos.length} nuevos</span>`
    + ` · <span style="color:#d97706;">${modificados.length} con precio modificado</span>`
    + ` · <span style="color:#dc2626;">${bajas.length} para anular</span>`
    + ` · ${sinCambios.length} sin cambios`
    + (invalidas.length ? ` · <span style="color:#dc2626;">${invalidas.length} inválidas</span>` : '');

  const btn = $('btn-confirmar-import-listado-pp');
  const hayCambios = nuevos.length > 0 || modificados.length > 0 || bajas.length > 0;
  if (btn) btn.style.display = hayCambios ? 'inline-flex' : 'none';
}

// ========== CONFIRMAR ==========

let _importando = false;

export async function confirmarImportarListadoPP() {
  if (_importando || !_diff) return;
  const proveedorId = ($('imp-pp-proveedor') || {}).value || null;

  const seleccionados = grupo => Array.from(document.querySelectorAll(`.imp-pp-check[data-grupo="${grupo}"]:checked`)).map(el => parseInt(el.dataset.idx, 10));
  const idxNuevos = seleccionados('nuevos');
  const idxMod = seleccionados('modificados');
  const idxBajas = seleccionados('bajas');
  const total = idxNuevos.length + idxMod.length + idxBajas.length;
  if (!total) { toast('⚠️ No hay nada seleccionado para aplicar'); return; }

  _importando = true;
  const btn = $('btn-confirmar-import-listado-pp');
  if (btn) { btn.disabled = true; btn.textContent = 'Aplicando 0 / ' + total + '…'; }
  let hechos = 0;
  const fallos = [];
  const hoy = hoyStr();

  const avanzar = () => { hechos++; if (btn) btn.textContent = 'Aplicando ' + hechos + ' / ' + total + '…'; };

  for (const i of idxNuevos) {
    const n = _diff.nuevos[i];
    try {
      const prod = { id: _id('PPP'), descripcion: n.descripcion, codigoMonica: n.codigo, tipoUso: 'normal', proveedorIdLocal: proveedorId, anulado: false };
      if (!DB.ppProductos) DB.ppProductos = [];
      DB.ppProductos.push(prod);
      const ok1 = await supaSync('ppProductos', prod);
      const precio = { id: _id('PPR'), productoIdLocal: prod.id, costoUnit: n.precio, vigenciaDesde: hoy, vigenciaHasta: null, anulado: false };
      if (!DB.ppPrecios) DB.ppPrecios = [];
      DB.ppPrecios.push(precio);
      const ok2 = await supaSync('ppPrecios', precio);
      if (!ok1 || !ok2) throw new Error('no se pudo guardar en el servidor');
    } catch (e) {
      fallos.push({ codigo: n.codigo, descripcion: n.descripcion, error: e.message || 'Error desconocido' });
    }
    avanzar();
  }

  for (const i of idxMod) {
    const m = _diff.modificados[i];
    try {
      // Mismo mecanismo que guardarNuevoPrecioPP(): cierra el precio
      // vigente (si había uno) el día antes y abre uno nuevo desde hoy —
      // no pisa costo_unit, conserva el historial.
      const vigenteActual = (DB.ppPrecios || []).find(p => String(p.productoIdLocal) === String(m.producto.id) && !p.anulado && !p.vigenciaHasta);
      if (vigenteActual) {
        const diaAntes = new Date(hoy + 'T12:00:00'); diaAntes.setDate(diaAntes.getDate() - 1);
        vigenteActual.vigenciaHasta = diaAntes.toISOString().slice(0, 10);
        const okCierre = await supaSync('ppPrecios', vigenteActual);
        if (!okCierre) throw new Error('no se pudo cerrar el precio anterior');
      }
      const nuevo = { id: _id('PPR'), productoIdLocal: m.producto.id, costoUnit: m.precio, vigenciaDesde: hoy, vigenciaHasta: null, anulado: false };
      if (!DB.ppPrecios) DB.ppPrecios = [];
      DB.ppPrecios.push(nuevo);
      const okNuevo = await supaSync('ppPrecios', nuevo);
      if (!okNuevo) throw new Error('no se pudo guardar el precio nuevo');
      if (proveedorId && m.producto.proveedorIdLocal !== proveedorId) {
        m.producto.proveedorIdLocal = proveedorId;
        await supaSync('ppProductos', m.producto);
      }
    } catch (e) {
      fallos.push({ codigo: m.codigo, descripcion: m.descripcion, error: e.message || 'Error desconocido' });
    }
    avanzar();
  }

  for (const i of idxBajas) {
    const b = _diff.bajas[i];
    try {
      b.producto.anulado = true;
      const ok = await supaSync('ppProductos', b.producto);
      if (!ok) throw new Error('no se pudo anular en el servidor');
    } catch (e) {
      b.producto.anulado = false;
      fallos.push({ codigo: b.producto.codigoMonica, descripcion: b.producto.descripcion, error: e.message || 'Error desconocido' });
    }
    avanzar();
  }

  renderCatalogoPP();
  const exitosos = total - fallos.length;
  if (fallos.length) {
    const detalle = fallos.map(x => x.codigo + ' (' + x.descripcion + '): ' + x.error).join(' | ');
    toast('⚠️ ' + exitosos + ' cambio(s) aplicados, ' + fallos.length + ' fallaron — ' + detalle);
    if (btn) { btn.disabled = false; btn.textContent = '✅ Aplicar cambios seleccionados'; }
    _importando = false;
  } else {
    toast('✅ ' + exitosos + ' cambio(s) aplicados al catálogo');
    _importando = false;
    cerrarModal('modal-importar-listado-pp');
  }
}
