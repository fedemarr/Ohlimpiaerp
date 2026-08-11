// Importador masivo de CBU para asociados (ticket "CBU" 08/2026).
//
// Objetivo: completar/actualizar de una vez el CBU de varios asociados a
// partir del archivo que entrega el banco (CSV/TXT). No crea legajos ni
// toca ningún otro dato — solo `legajo.cbu`.
//
// Mismo criterio que importador.js (legajos):
//   - CSV texto plano, parser propio sin librerías externas (xlsx/SheetJS
//     se evita a propósito: vulns sin parche + no hace falta, cualquier
//     Excel se guarda como "CSV UTF-8").
//   - Encabezados se reconocen por nombre normalizado (sin acentos,
//     minúscula, separados por "_"), no por posición — el orden de las
//     columnas del banco no importa.
//   - Formato del archivo del banco NO está definido en el repo todavía;
//     se asume CSV con un identificador (DNI y/o CUIT) + el CBU. Si algún
//     día llega un formato distinto (XLSX real, TXT con posiciones fijas,
//     columnas con otros nombres), se agrega el alias/parser acá.
//
// Matching contra asociados (DB.legajos): por DNI en primera instancia
// (solo dígitos) y con respaldo por CUIT (solo dígitos). Las filas sin
// coincidencia, con CBU inválido o repetidas se listan en el preview pero
// no se tocan.

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
          'Subí el archivo CSV que entrega el banco. Se reconocen columnas con el <strong>DNI</strong> y/o <strong>CUIT</strong> más el <strong>CBU</strong> (el orden no importa). ',
          'Se actualiza el CBU de los asociados que coincidan por DNI (con respaldo por CUIT). ',
          'Las filas sin coincidencia, con CBU inválido o repetidas se muestran pero <strong>no se tocan</strong>.',
        '</div>',
        '<div class="form-group">',
          '<label>Archivo CSV</label>',
          '<input type="file" id="imp-cbu-file" accept=".csv,.txt,text/csv" onchange="seleccionarArchivoCbu()">',
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
  const fileEl = $('imp-cbu-file'); if (fileEl) fileEl.value = '';
  const prevEl = $('imp-cbu-preview'); if (prevEl) prevEl.innerHTML = '';
  const resEl = $('imp-cbu-resumen'); if (resEl) resEl.textContent = '';
  const avisoEl = $('imp-cbu-aviso-encoding'); if (avisoEl) avisoEl.style.display = 'none';
  const btn = $('btn-confirmar-importacion-cbu');
  if (btn) { btn.style.display = 'none'; btn.disabled = false; btn.textContent = '✅ Confirmar actualización'; }
  abrirModal('modal-importar-cbu');
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
};

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

    renderPreview();
  };
  reader.readAsText(file, 'UTF-8');
}

// ========== PREVIEW + VALIDACIÓN ==========

function resolverEstado(f) {
  // Índices por DNI y por CUIT (solo dígitos) — un mismo legajo puede
  // aparecer 2 veces en el archivo del banco; la primera se actualiza y
  // las siguientes se marcan como repetidas.
  const dni = soloDigitos(f.dni);
  const cuit = soloDigitos(f.cuit);
  const cbu = normalizarCbu(f.cbu);

  if (!dni && !cuit) return { ok: false, estado: 'falta-id', msg: 'falta DNI y CUIT' };
  const idxDni = (DB.legajos || []).findIndex(l => soloDigitos(l.dni) === dni && dni);
  const idxCuit = !dni ? (DB.legajos || []).findIndex(l => soloDigitos(l.cuit) === cuit && cuit) : -1;
  if (idxDni === -1 && idxCuit === -1) return { ok: false, estado: 'no-encontrado', msg: 'no hay asociado con ese DNI/CUIT' };
  const legajo = idxDni >= 0 ? DB.legajos[idxDni] : DB.legajos[idxCuit];
  if (!cbu) return { ok: false, estado: 'falta-cbu', msg: 'CBU vacío' };
  if (!cbuValido(cbu)) return { ok: false, estado: 'cbu-invalido', msg: 'CBU inválido (debe tener 22 dígitos)' };
  if (normalizarCbu(legajo.cbu) === cbu) return { ok: false, estado: 'sin-cambio', msg: 'CBU ya cargado (sin cambios)' };
  return { ok: true, estado: 'ok', msg: '', legajo, cbuAnterior: legajo.cbu };
}

function renderPreview() {
  const cont = $('imp-cbu-preview');
  if (!cont) return;
  if (!_filasParseadas.length) { cont.innerHTML = '<p style="padding:10px;">Sin filas para importar</p>'; return; }

  // Detectar si el archivo trae solo CBU sin identificador (error común).
  if (!_filasParseadas.some(f => soloDigitos(f.dni) || soloDigitos(f.cuit))) {
    cont.innerHTML = '<p style="padding:10px;color:#dc2626;">No se encontró ninguna columna de DNI o CUIT en el archivo. Se necesitan columnas identificadas como "DNI" y/o "CUIT" además del CBU.</p>';
    return;
  }

  const nrosYaProcesados = new Set();
  let paraActualizar = 0, sinCambio = 0, noEncontrado = 0, invalidos = 0, repetidos = 0;

  const filasHtml = _filasParseadas.map(f => {
    const res = resolverEstado(f);
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
      + '<td style="padding:5px 8px;font-size:12px;font-family:\'DM Mono\',monospace;">' + (soloDigitos(f.dni) || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;font-family:\'DM Mono\',monospace;">' + (soloDigitos(f.cuit) || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (res.legajo ? res.legajo.nombre : '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;font-family:\'DM Mono\',monospace;">' + (normalizarCbu(f.cbu) || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;font-family:\'DM Mono\',monospace;">' + (res.legajo ? (res.legajo.cbu || '—') : '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:11px;">' + (res.ok ? '✓' : '<span style="color:#dc2626;">' + res.msg + '</span>') + '</td>'
      + '</tr>';
  }).join('');

  cont.innerHTML = '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="background:#1e3a8a;color:white;">'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">DNI</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">CUIT</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Asociado</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">CBU del archivo</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">CBU actual</th>'
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

  let actualizados = 0;
  const fallos = []; // [{ nombre, nro, cbu, error }]

  for (const [i, f] of pendientes.entries()) {
    if (btn) btn.textContent = 'Actualizando ' + (i + 1) + ' / ' + pendientes.length + '…';
    if (resEl) resEl.textContent = 'Actualizando ' + (i + 1) + ' / ' + pendientes.length + '…';
    const legajo = f._res.legajo;
    const cbu = normalizarCbu(f.cbu);
    legajo.cbu = cbu;
    const ok = await supaSync('legajos', legajo);
    if (ok) {
      actualizados++;
    } else {
      const err = getLastSupaSyncError();
      console.error('Import CBU — falló N° ' + legajo.nro + ' (' + legajo.nombre + '):', err);
      fallos.push({ nombre: legajo.nombre, nro: legajo.nro, cbu, error: (err && err.message) || 'Error desconocido' });
      legajo.cbu = f._res.cbuAnterior;
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
