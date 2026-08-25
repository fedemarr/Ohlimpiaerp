// Importador masivo de CBU para asociados (ticket "CBU" 08/2026, extendido
// ticket "CBU de asociados" 08/2026 con soporte real para los archivos que
// entrega Logística: uno por banco, con N° de asociado en vez de DNI/CUIT).
//
// Objetivo: completar/actualizar de una vez el CBU y el banco de varios
// asociados a partir del archivo que entrega el banco (CSV). No crea
// legajos ni toca ningún otro dato — solo `legajo.cbu` y `legajo.banco`.
//
// Mismo criterio que importador.js (legajos):
//   - CSV texto plano, parser propio sin librerías externas (xlsx/SheetJS
//     se evita a propósito: vulns sin parche + no hace falta, cualquier
//     Excel se guarda como "CSV UTF-8").
//   - Encabezados se reconocen por nombre normalizado (sin acentos,
//     minúscula, separados por "_"), no por posición — el orden de las
//     columnas del banco no importa.
//   - Formato real confirmado (2 archivos de ejemplo, "CBU ASOCIADOS -
//     OPERATIVOS FRANCES.csv" / "... MACRO.csv"): CSV con columnas
//     NUM ASOCIADO, NOMBRE Y APELLIDO y el CBU bajo una columna encabezada
//     con el nombre del banco (MACRO / BBVA FRANCES) — sin DNI ni CUIT. Si
//     algún día llega un formato distinto (XLSX real, TXT con posiciones
//     fijas, columnas con otros nombres), se agrega el alias/parser acá.
//
// Matching contra asociados (DB.legajos): por N° de asociado en primera
// instancia (legajo.nro — es el identificador real de los archivos que
// entregan los bancos, ver más abajo), con respaldo por DNI y luego CUIT
// (solo dígitos) para archivos de otro origen que sí los traigan. Las
// filas sin coincidencia, con CBU inválido o repetidas se listan en el
// preview pero no se tocan.
//
// Banco (ticket "CBU de asociados", 08/2026): los archivos reales del
// banco vienen UNO POR BANCO (uno para Macro, otro para BBVA Francés),
// sin columna "banco" — la columna del CBU está directamente encabezada
// con el nombre del banco (ver ALIASES). Por eso se elige el banco una
// vez en el modal (aplica a todas las filas del archivo) en vez de
// leerlo por fila.

import { DB } from '@shared/state.js';
import { $, normalizarCbu, cbuValido } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, getLastSupaSyncError } from '@shared/supabase.js';
import { renderLegajos } from './legajos.js';

// ========== ESTADO INTERNO ==========

let _filasParseadas = [];

// ========== MODAL ==========

function ensureModal() {
  if ($('modal-importar-cbu')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-importar-cbu';
  m.innerHTML = crearHTMLModal();
  document.body.appendChild(m);
}

function crearHTMLModal() {
  return [
    '<div class="modal" style="max-width:820px;">',
      '<div class="modal-header" style="background:#1e3a8a;color:white;">',
        '<h3 style="color:white;">🏦 Importar CBU desde archivo</h3>',
        '<button class="btn-close" style="color:white;" onclick="cerrarModal(\'modal-importar-cbu\')">×</button>',
      '</div>',
      '<div class="modal-body">',
        '<div class="alerta alerta-info" style="margin-bottom:12px;">',
          'Subí el archivo CSV que entrega el banco (uno por banco — Macro y BBVA Francés vienen en archivos separados). Se reconocen columnas con el <strong>N° de asociado</strong> (o DNI/CUIT si el archivo los trae) más el <strong>CBU</strong> (el orden no importa). ',
          'Se actualiza el CBU y el banco de los asociados que coincidan. ',
          'Las filas sin coincidencia, con CBU inválido o repetidas se muestran pero <strong>no se tocan</strong>.',
        '</div>',
        '<div class="form-group">',
          '<label>Banco de este archivo</label>',
          '<select id="imp-cbu-banco" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;" onchange="cambiarBancoImportCbu()">',
            '<option value="">Seleccionar...</option>',
            BANCOS.map(b => '<option value="' + b + '">' + b + '</option>').join(''),
            '<option value="__otro__">Otro banco...</option>',
          '</select>',
          '<input type="text" id="imp-cbu-banco-otro" placeholder="Nombre del banco" style="display:none;width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;margin-top:6px;" oninput="cambiarBancoImportCbu()">',
        '</div>',
        '<div class="form-group">',
          '<label>Archivo CSV</label>',
          '<input type="file" id="imp-cbu-file" accept=".csv,.txt,text/csv" onchange="seleccionarArchivoCbu()" disabled>',
        '</div>',
        '<div id="imp-cbu-aviso-encoding" style="display:none;margin-top:8px;padding:8px 10px;border-radius:6px;font-size:12px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;">',
          '⚠️ El archivo parece tener caracteres mal codificados (probablemente se guardó como "CSV" en vez de "CSV UTF-8" desde Excel). Los datos pueden verse raros — si el banco lo exportó así, verificá los CBU antes de confirmar.',
        '</div>',
        '<div id="imp-cbu-resumen" style="margin:8px 0;font-size:13px;font-weight:600;color:var(--texto-suave);"></div>',
        '<div id="imp-cbu-preview" style="max-height:360px;overflow-y:auto;border:1px solid var(--borde);border-radius:8px;"></div>',
      '</div>',
      '<div class="modal-footer" style="justify-content:space-between;">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-importar-cbu\')">Cancelar</button>',
        '<button id="btn-confirmar-importacion-cbu" class="btn btn-primary" style="display:none;" onclick="confirmarImportarCbu()">✅ Confirmar actualización</button>',
      '</div>',
    '</div>',
  ].join('');
}

export function abrirImportarCbu() {
  ensureModal();
  _filasParseadas = [];
  const bancoEl = $('imp-cbu-banco'); if (bancoEl) bancoEl.value = '';
  const bancoOtroEl = $('imp-cbu-banco-otro'); if (bancoOtroEl) { bancoOtroEl.value = ''; bancoOtroEl.style.display = 'none'; }
  const fileEl = $('imp-cbu-file'); if (fileEl) { fileEl.value = ''; fileEl.disabled = true; }
  const prevEl = $('imp-cbu-preview'); if (prevEl) prevEl.innerHTML = '';
  const resEl = $('imp-cbu-resumen'); if (resEl) resEl.textContent = '';
  const avisoEl = $('imp-cbu-aviso-encoding'); if (avisoEl) avisoEl.style.display = 'none';
  const btn = $('btn-confirmar-importacion-cbu');
  if (btn) { btn.style.display = 'none'; btn.disabled = false; btn.textContent = '✅ Confirmar actualización'; }
  abrirModal('modal-importar-cbu');
}

// Banco elegido para este archivo — se aplica a todas las filas que se
// actualicen (el archivo no trae columna "banco" propia, ver cabecera).
function _bancoSeleccionado() {
  const sel = $('imp-cbu-banco');
  if (!sel) return '';
  if (sel.value === '__otro__') return (($('imp-cbu-banco-otro') || {}).value || '').trim();
  return sel.value;
}

export function cambiarBancoImportCbu() {
  const sel = $('imp-cbu-banco');
  const otroEl = $('imp-cbu-banco-otro');
  const esOtro = sel && sel.value === '__otro__';
  if (otroEl) otroEl.style.display = esOtro ? 'block' : 'none';
  const fileEl = $('imp-cbu-file');
  if (fileEl) fileEl.disabled = !_bancoSeleccionado();
  if (_filasParseadas.length) renderCbuPreview();
}

// ========== NORMALIZACIÓN ==========
// Mismo criterio que legajos/importador.js y candidatos/importadorHistorico.js.

function normalizarHeader(h) {
  return (h || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const ALIASES = {
  num_asociado: 'nro',
  numero_asociado: 'nro',
  numero_de_asociado: 'nro',
  n_asociado: 'nro',
  nro_asociado: 'nro',
  nro_socio: 'nro',
  numero_de_socio: 'nro',
  dni: 'dni',
  documento: 'dni',
  documento_nro: 'dni',
  numero_de_documento: 'dni',
  nro_documento: 'dni',
  cuit: 'cuit',
  cuil: 'cuit',
  nro_de_cuit: 'cuit',
  cbu: 'cbu',
  cb_u: 'cbu',
  clave_bancaria: 'cbu',
  clave_bancaria_uniforme: 'cbu',
  // Los 2 archivos reales de bancos (Macro / BBVA Francés) traen el CBU
  // bajo una columna encabezada con el nombre del banco en vez de "CBU" —
  // se agregan como alias puntuales (no un genérico "bbva" — el archivo
  // de Macro trae además una columna "BBVA" vacía sin usar; si también
  // fuera alias de cbu, pisaría el valor real leído de "MACRO" al
  // armar la fila, por quedar las dos bajo la misma clave).
  macro: 'cbu',
  bbva_frances: 'cbu',
};

// Bancos reconocidos para el selector del modal — mismos 2 que entregan
// archivo separado hoy. "Otro" queda libre para no bloquear si mañana
// aparece un tercer banco, sin tener que tocar código.
const BANCOS = ['Macro', 'BBVA Francés'];

function soloDigitos(s) {
  return (s || '').replace(/\D/g, '');
}

// ========== PARSER CSV (texto plano, sin librerías externas) ==========
// Copia del parser de legajos/importador.js (ahí no está exportado) —
// manteniéndolo local se evita refactorizar un módulo ya estable.

function parseCSV(texto) {
  // Excel con configuración regional argentina exporta CSV separado por
  // ';' — se detecta el delimitador real contando ocurrencias en la
  // cabecera, igual que importador.js.
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
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroComillas = false;
      } else {
        campo += c;
      }
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

function limpiarValor(v) {
  const t = (v || '').trim();
  return (t === '#N/D' || t === '#N/A' || t === 'N/D') ? '' : t;
}

// ========== SELECCIONAR ARCHIVO ==========

export function seleccionarArchivoCbu() {
  if (!_bancoSeleccionado()) {
    toast('⚠️ Elegí primero el banco de este archivo');
    const input = $('imp-cbu-file'); if (input) input.value = '';
    return;
  }
  const input = $('imp-cbu-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const texto = String(e.target.result || '');
    const avisoEl = $('imp-cbu-aviso-encoding');
    if (avisoEl) avisoEl.style.display = /Ã[\x80-\xBF]/.test(texto) ? 'block' : 'none';

    const filas = parseCSV(texto);
    if (!filas.length) { toast('⚠️ El archivo está vacío'); return; }
    const headers = filas[0].map(h => ALIASES[normalizarHeader(h)] || normalizarHeader(h));
    const filasDatos = filas.slice(1).filter(f => f.some(v => (v || '').trim() !== ''));
    _filasParseadas = filasDatos.map(f => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = limpiarValor(f[i]); });
      return obj;
    });

    renderCbuPreview();
  };
  reader.readAsText(file, 'UTF-8');
}

// ========== PREVIEW + VALIDACIÓN ==========

function resolverEstado(f, banco) {
  // N° de asociado en primera instancia (es el identificador real de los
  // archivos de banco), con respaldo por DNI y luego CUIT (solo dígitos)
  // por si algún archivo de otro origen los trae en vez de nro. Un mismo
  // legajo puede aparecer 2 veces en el archivo; la primera se actualiza
  // y las siguientes se marcan como repetidas (ver renderCbuPreview).
  const nro = soloDigitos(f.nro);
  const dni = soloDigitos(f.dni);
  const cuit = soloDigitos(f.cuit);
  const cbu = normalizarCbu(f.cbu);

  if (!nro && !dni && !cuit) return { ok: false, estado: 'falta-id', msg: 'falta N° de asociado, DNI y CUIT' };

  let legajo = null;
  let idPor = '';
  if (nro) { legajo = (DB.legajos || []).find(l => String(l.nro) === nro); idPor = 'N° de asociado'; }
  if (!legajo && dni) { legajo = (DB.legajos || []).find(l => soloDigitos(l.dni) === dni); idPor = 'DNI'; }
  if (!legajo && cuit) { legajo = (DB.legajos || []).find(l => soloDigitos(l.cuit) === cuit); idPor = 'CUIT'; }
  if (!legajo) return { ok: false, estado: 'no-encontrado', msg: 'no hay asociado con ese ' + (idPor || 'N° de asociado/DNI/CUIT') };

  if (!cbu) return { ok: false, estado: 'falta-cbu', msg: 'CBU vacío' };
  if (!cbuValido(cbu)) return { ok: false, estado: 'cbu-invalido', msg: 'CBU inválido (debe tener 22 dígitos)' };
  const sinCambioCbu = normalizarCbu(legajo.cbu) === cbu;
  const sinCambioBanco = !banco || (legajo.banco || '') === banco;
  if (sinCambioCbu && sinCambioBanco) return { ok: false, estado: 'sin-cambio', msg: 'CBU y banco ya cargados (sin cambios)' };
  return { ok: true, estado: 'ok', msg: '', legajo, cbuAnterior: legajo.cbu, bancoAnterior: legajo.banco };
}

export function renderCbuPreview() {
  const cont = $('imp-cbu-preview');
  if (!cont) return;
  if (!_filasParseadas.length) { cont.innerHTML = '<p style="padding:10px;">Sin filas para importar</p>'; return; }

  // Detectar si el archivo trae solo CBU sin identificador (error común).
  if (!_filasParseadas.some(f => soloDigitos(f.nro) || soloDigitos(f.dni) || soloDigitos(f.cuit))) {
    cont.innerHTML = '<p style="padding:10px;color:#dc2626;">No se encontró ninguna columna de N° de asociado, DNI o CUIT en el archivo. Se necesita al menos una de esas para identificar al asociado.</p>';
    return;
  }

  const banco = _bancoSeleccionado();
  const nrosYaProcesados = new Set();
  let paraActualizar = 0, sinCambio = 0, noEncontrado = 0, invalidos = 0, repetidos = 0;

  const filasHtml = _filasParseadas.map(f => {
    const res = resolverEstado(f, banco);
    if (res.estado === 'ok' && nrosYaProcesados.has(String(res.legajo.nro))) {
      res.ok = false;
      res.estado = 'repetido';
      res.msg = 'mismo asociado ya aparece más arriba';
    }
    if (res.estado === 'ok') nrosYaProcesados.add(String(res.legajo.nro));

    if (res.estado === 'ok') paraActualizar++;
    else if (res.estado === 'sin-cambio') sinCambio++;
    else if (res.estado === 'no-encontrado') noEncontrado++;
    else if (res.estado === 'falta-id' || res.estado === 'falta-cbu' || res.estado === 'cbu-invalido') invalidos++;
    else if (res.estado === 'repetido') repetidos++;
    f._res = res;

    return '<tr style="' + (res.ok ? '' : 'background:#fef2f2;') + '">'
      + '<td style="padding:5px 8px;font-size:12px;font-family:\'DM Mono\',monospace;">' + (soloDigitos(f.nro) || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (res.legajo ? res.legajo.nombre : '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;font-family:\'DM Mono\',monospace;">' + (normalizarCbu(f.cbu) || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;font-family:\'DM Mono\',monospace;">' + (res.legajo ? (res.legajo.cbu || '—') : '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (banco || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:11px;">' + (res.ok ? '✓' : '<span style="color:#dc2626;">' + res.msg + '</span>') + '</td>'
      + '</tr>';
  }).join('');

  cont.innerHTML = '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="background:#1e3a8a;color:white;">'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">N° Asociado</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Asociado</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">CBU del archivo</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">CBU actual</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Banco nuevo</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Estado</th>'
    + '</tr></thead><tbody>' + filasHtml + '</tbody></table>';

  const resEl = $('imp-cbu-resumen');
  if (resEl) {
    resEl.innerHTML = '<span style="color:var(--verde);">' + paraActualizar + ' a actualizar</span>'
      + (sinCambio ? ' · ' + sinCambio + ' sin cambios' : '')
      + (noEncontrado ? ' · <span style="color:#dc2626;">' + noEncontrado + ' sin coincidencia</span>' : '')
      + (invalidos ? ' · <span style="color:#dc2626;">' + invalidos + ' inválidos</span>' : '')
      + (repetidos ? ' · ' + repetidos + ' repetidos' : '');
  }
  const btn = $('btn-confirmar-importacion-cbu');
  if (btn) btn.style.display = paraActualizar > 0 ? 'inline-flex' : 'none';
}

// ========== CONFIRMAR ACTUALIZACIÓN ==========
// Mismo guard de reentrancia que importador.js: con muchas filas esto
// tarda y el doble click lanzaría una segunda pasada en paralelo sobre
// los mismos legajos.

let _importando = false;

export async function confirmarImportarCbu() {
  if (_importando) return;
  const pendientes = _filasParseadas.filter(f => f._res && f._res.ok);
  if (!pendientes.length) { toast('⚠️ No hay filas para actualizar'); return; }

  _importando = true;
  const btn = $('btn-confirmar-importacion-cbu');
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando 0 / ' + pendientes.length + '…'; }
  const resEl = $('imp-cbu-resumen');

  const banco = _bancoSeleccionado();
  let actualizados = 0;
  const fallos = []; // [{ nombre, nro, cbu, error }]

  for (const [i, f] of pendientes.entries()) {
    if (btn) btn.textContent = 'Actualizando ' + (i + 1) + ' / ' + pendientes.length + '…';
    if (resEl) resEl.textContent = 'Actualizando ' + (i + 1) + ' / ' + pendientes.length + '…';
    const legajo = f._res.legajo;
    const cbu = normalizarCbu(f.cbu);
    legajo.cbu = cbu;
    if (banco) legajo.banco = banco;
    const ok = await supaSync('legajos', legajo);
    if (ok) {
      actualizados++;
    } else {
      const err = getLastSupaSyncError();
      console.error('Import CBU — falló N° ' + legajo.nro + ' (' + legajo.nombre + '):', err);
      fallos.push({ nombre: legajo.nombre, nro: legajo.nro, cbu, error: (err && err.message) || 'Error desconocido' });
      legajo.cbu = f._res.cbuAnterior;
      legajo.banco = f._res.bancoAnterior;
    }
  }

  renderLegajos();
  if (fallos.length > 0) {
    const detalle = fallos.map(x => 'N°' + x.nro + ' ' + x.nombre + ': ' + x.error).join(' | ');
    toast('⚠️ ' + actualizados + ' CBU actualizado(s), ' + fallos.length + ' no se pudieron guardar — ' + detalle);
    if (resEl) {
      resEl.innerHTML = actualizados + ' CBU actualizado(s) correctamente.<br>'
        + '<span style="color:#dc2626;">' + fallos.length + ' con error del servidor:</span><br>'
        + fallos.map(x => '• N° ' + x.nro + ' — ' + x.nombre + ': ' + x.error).join('<br>');
    }
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar actualización'; }
    _importando = false;
  } else {
    toast('✅ ' + actualizados + ' CBU actualizado(s) correctamente');
    _importando = false;
    abrirImportarCbu();
  }
}
