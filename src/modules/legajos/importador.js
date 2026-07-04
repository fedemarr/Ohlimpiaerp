// Importador masivo de legajos desde CSV.
//
// Se eligió CSV en vez de .xlsx real: la librería estándar para leer Excel
// en el navegador (xlsx/SheetJS) tiene 2 vulnerabilidades altas sin parche
// disponible vía npm (prototype pollution + ReDoS). CSV es texto plano, se
// parsea sin ninguna librería externa (cero riesgo nuevo), y cualquier
// Excel se guarda como CSV con un clic ("Guardar como" → CSV UTF-8).
//
// Pensado para el día que haya que cargar de una vez legajos de gente que
// ya trabaja hoy (dato de traspaso), no para el alta individual normal
// (que sigue siendo el flujo Candidatos → Psico → ... → Alta).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { renderLegajos } from './legajos.js';

const COLUMNAS_PLANTILLA = ['nombre', 'dni', 'funcion', 'servicio', 'supervisor', 'ingreso', 'tel', 'mail', 'cuit', 'localidad', 'banco', 'cbu'];

let _filasParseadas = [];

// ========== MODAL ==========

function ensureModal() {
  if ($('modal-importar-legajos')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-importar-legajos';
  m.innerHTML = crearHTMLModalImportador();
  document.body.appendChild(m);
}

function crearHTMLModalImportador() {
  return [
    '<div class="modal" style="max-width:720px;">',
      '<div class="modal-header" style="background:#1e3a8a;color:white;">',
        '<h3 style="color:white;">📤 Importar legajos desde CSV</h3>',
        '<button class="btn-close" style="color:white;" onclick="cerrarModal(\'modal-importar-legajos\')">×</button>',
      '</div>',
      '<div class="modal-body">',
        '<div class="alerta alerta-info" style="margin-bottom:12px;">',
          'Pensado para cargar de una vez legajos de gente que ya trabaja hoy (traspaso de datos). ',
          'Las columnas obligatorias son <strong>nombre</strong> y <strong>dni</strong>; el resto queda vacío si no se completa.',
        '</div>',
        '<button type="button" class="btn btn-secondary" onclick="descargarPlantillaLegajos()">⬇️ Descargar plantilla CSV</button>',
        '<div class="form-group" style="margin-top:14px;">',
          '<label>Archivo CSV</label>',
          '<input type="file" id="imp-leg-file" accept=".csv,text/csv" onchange="seleccionarArchivoImportacion()">',
        '</div>',
        '<div id="imp-leg-resumen" style="margin:8px 0;font-size:13px;font-weight:600;color:var(--texto-suave);"></div>',
        '<div id="imp-leg-preview" style="max-height:320px;overflow-y:auto;border:1px solid var(--borde);border-radius:8px;"></div>',
      '</div>',
      '<div class="modal-footer" style="justify-content:space-between;">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-importar-legajos\')">Cancelar</button>',
        '<button id="btn-confirmar-importacion" class="btn btn-primary" style="display:none;" onclick="confirmarImportacionLegajos()">✅ Confirmar importación</button>',
      '</div>',
    '</div>',
  ].join('');
}

export function abrirImportadorLegajos() {
  ensureModal();
  _filasParseadas = [];
  const fileEl = $('imp-leg-file'); if (fileEl) fileEl.value = '';
  const prevEl = $('imp-leg-preview'); if (prevEl) prevEl.innerHTML = '';
  const resEl = $('imp-leg-resumen'); if (resEl) resEl.textContent = '';
  const btn = $('btn-confirmar-importacion'); if (btn) btn.style.display = 'none';
  abrirModal('modal-importar-legajos');
}

// ========== PLANTILLA ==========

export function descargarPlantillaLegajos() {
  const encabezado = COLUMNAS_PLANTILLA.join(',');
  const ejemplo = 'Juan Perez,30123456,Operario,Edificio Central,Maria Gomez,01/03/2026,1122334455,juan@mail.com,20-30123456-7,Belgrano,Banco Nacion,0000003100012345678901';
  const csv = encabezado + '\n' + ejemplo + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'plantilla_legajos.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ========== PARSER CSV (texto plano, sin librerías externas) ==========

function parseCSV(texto) {
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
    } else if (c === ',') {
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

// ========== SELECCIONAR ARCHIVO ==========

export function seleccionarArchivoImportacion() {
  const input = $('imp-leg-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const filas = parseCSV(String(e.target.result || ''));
    if (!filas.length) { toast('⚠️ El archivo está vacío'); return; }
    const headers = filas[0].map(h => h.trim().toLowerCase());
    const filasDatos = filas.slice(1).filter(f => f.some(v => (v || '').trim() !== ''));
    _filasParseadas = filasDatos.map(f => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (f[i] || '').trim(); });
      return obj;
    });
    renderPreviewImportacion();
  };
  reader.readAsText(file, 'UTF-8');
}

// ========== PREVIEW + VALIDACIÓN ==========

function renderPreviewImportacion() {
  const cont = $('imp-leg-preview');
  if (!cont) return;
  if (!_filasParseadas.length) { cont.innerHTML = '<p style="padding:10px;">Sin filas para importar</p>'; return; }

  const dnisExistentes = new Set((DB.legajos || []).map(l => l.dni));
  const dnisVistos = new Set();
  let validos = 0, invalidos = 0;

  const filasHtml = _filasParseadas.map(f => {
    const problemas = [];
    if (!f.nombre) problemas.push('falta nombre');
    if (!f.dni || !/^\d{6,8}$/.test(f.dni)) problemas.push('DNI inválido');
    else if (dnisExistentes.has(f.dni)) problemas.push('DNI ya existe en legajos');
    else if (dnisVistos.has(f.dni)) problemas.push('DNI repetido en el archivo');
    if (f.dni) dnisVistos.add(f.dni);

    const ok = problemas.length === 0;
    if (ok) validos++; else invalidos++;
    f._valido = ok;

    return '<tr style="' + (ok ? '' : 'background:#fef2f2;') + '">'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.nombre || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.dni || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.funcion || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.servicio || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:11px;color:#dc2626;">' + (problemas.join(', ') || '✓') + '</td>'
      + '</tr>';
  }).join('');

  cont.innerHTML = '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="background:#1e3a8a;color:white;">'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Nombre</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">DNI</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Función</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Servicio</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Estado</th>'
    + '</tr></thead><tbody>' + filasHtml + '</tbody></table>';

  const resEl = $('imp-leg-resumen');
  if (resEl) resEl.textContent = validos + ' lista(s) para importar, ' + invalidos + ' con problemas (no se van a importar)';
  const btn = $('btn-confirmar-importacion');
  if (btn) btn.style.display = validos > 0 ? 'inline-flex' : 'none';
}

// ========== CONFIRMAR IMPORTACIÓN ==========

export function confirmarImportacionLegajos() {
  const validas = _filasParseadas.filter(f => f._valido);
  if (!validas.length) { toast('⚠️ No hay filas válidas para importar'); return; }

  let maxNro = (DB.legajos || []).reduce((m, l) => Math.max(m, l.nro || 0), 0);
  let importados = 0;
  const hoy = new Date().toISOString().slice(0, 10);

  validas.forEach(f => {
    maxNro += 1;
    const legajo = {
      nro: maxNro,
      nombre: f.nombre,
      dni: f.dni,
      funcion: f.funcion || 'Operario',
      servicio: f.servicio || '— Sin asignar',
      supervisor: f.supervisor || '— Sin asignar',
      ingreso: f.ingreso || new Date().toLocaleDateString('es-AR'),
      estado: 'Activo',
      estadoLegal: '', estadoMedico: '', fechaBaja: '', fechaReincorp: '',
      seguro: 'Pendiente',
      localidad: f.localidad || '',
      tel: f.tel || '',
      mail: f.mail || '',
      cuit: f.cuit || '',
      estadoCivil: '', nac: 'Argentina', genero: '',
      banco: f.banco || '',
      cbu: f.cbu || '',
      calzado: 0, ambo: '',
      periodoPrueba: 6,
      fechaIngresoPrueba: hoy,
      adjuntosLegal: [], adjuntosMedico: [],
      direccion: '', fecNac: '', zona: '',
      art: '', obraSocial: '', formaPago: '',
      integracion: 0, categoria: '',
    };
    DB.legajos.push(legajo);
    supaSync('legajos', legajo);
    importados++;
  });

  cerrarModal('modal-importar-legajos');
  renderLegajos();
  toast('✅ ' + importados + ' legajo(s) importado(s) correctamente');
}
