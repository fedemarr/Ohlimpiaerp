// Importador masivo de legajos desde CSV.
//
// Se eligió CSV en vez de .xlsx real: la librería estándar para leer Excel
// en el navegador (xlsx/SheetJS) tiene 2 vulnerabilidades altas sin parche
// disponible vía npm (prototype pollution + ReDoS). CSV es texto plano, se
// parsea sin ninguna librería externa (cero riesgo nuevo), y cualquier
// Excel se guarda como CSV con un clic ("Guardar como" → CSV UTF-8).
//
// Pensado para el día que haya que cargar de una vez legajos de gente que
// ya trabaja hoy (traspaso de datos), no para el alta individual normal
// (que sigue siendo el flujo Candidatos → Psico → ... → Alta).
//
// v2 (ago/2026): reemplaza la plantilla propia de 12 columnas por el mapeo
// real de la planilla de RRHH ("ALTAS.csv") — no había ningún alta real
// cargada todavía con la plantilla vieja (11 legajos en producción, todos
// del flujo normal), así que no hace falta mantener las 2 en paralelo.
// Cambios de fondo respecto a v1:
//   - Preserva el N° de socio real del archivo (v1 lo descartaba y
//     asignaba uno nuevo correlativo — hubiera perdido el número real que
//     usa RRHH en nómina/legajo físico).
//   - La planilla de RRHH es un historial de reasignaciones, no "una fila
//     = una persona": bastante gente aparece 2-3 veces con el mismo N° de
//     socio y distinta fecha/servicio. Se importa sólo la última fila de
//     cada N° de socio (la más reciente en el archivo) — decisión
//     confirmada con Fede, no una suposición.

import { DB } from '@shared/state.js';
import { $, toTitleCase, cleanText } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync, getLastSupaSyncError } from '@shared/supabase.js';
import { renderLegajos } from './legajos.js';

// Encabezados internos (normalizados) que reconoce el importador. Sirven
// tanto para la plantilla descargable como para armar el legajo.
const COLUMNAS_PLANTILLA = [
  'nro_socio', 'apellido', 'nombre', 'dni', 'fecha_nac', 'cuit', 'estado_civil',
  'fecha_ingreso', 'servicio_actual', 'funcion', 'supervisor_actual', 'nacionalidad',
  'calle', 'numero', 'piso', 'dpto', 'localidad', 'cp', 'cel_personal',
  'calzado', 'ambo', 'chomba', 'grafa', 'genero', 'mails', 'clave_fiscal', 'banco',
];

// Alias de encabezados reales de la planilla de RRHH (normalizados: sin
// acentos, minúscula, separados por "_") hacia las claves internas de
// arriba — mismo criterio que candidatos/importadorHistorico.js, para que
// RRHH pueda exportar la planilla tal cual la usa hoy sin renombrar nada.
// "servicio_actual" tiene prioridad sobre "servicio" (ver
// mapearServicio() más abajo) — se resuelve ahí, no acá.
const ALIAS_HEADERS = {
  nro_de_socio: 'nro_socio',
  n_de_socio: 'nro_socio',
  nro_socio: 'nro_socio',
  apellido: 'apellido',
  nombre: 'nombre',
  dni: 'dni',
  fecha_de_nac: 'fecha_nac',
  fecha_de_nacimiento: 'fecha_nac',
  cuit: 'cuit',
  estado_civil: 'estado_civil',
  fecha_de_ingreso: 'fecha_ingreso',
  servicio: 'servicio',
  funcion: 'funcion',
  reubicacion: 'reubicacion',
  supervisor_actual: 'supervisor_actual',
  estado: 'estado_csv',
  servicio_actual: 'servicio_actual',
  nacionalidad: 'nacionalidad',
  calle: 'calle',
  numero: 'numero',
  piso: 'piso',
  dpto: 'dpto',
  localidad: 'localidad',
  c_p: 'cp',
  cp: 'cp',
  telefono_linea_fijo: 'tel_fijo',
  cel_personal: 'cel_personal',
  cel_alternativo: 'cel_alternativo',
  calzado: 'calzado',
  ambo: 'ambo',
  chomba: 'chomba',
  grafa: 'grafa',
  fecha_actual: 'fecha_actual',
  edad: 'edad',
  genero: 'genero',
  mails: 'mails',
  mail: 'mails',
  clave_fiscal_al_ingreso: 'clave_fiscal',
  banco_que_posee: 'banco',
};

const HEADERS_DISPLAY = {
  nro_socio: 'Nro de socio', apellido: 'Apellido', nombre: 'Nombre', dni: 'DNI',
  fecha_nac: 'Fecha de Nac.', cuit: 'CUIT', estado_civil: 'Estado Civil',
  fecha_ingreso: 'Fecha de Ingreso', servicio_actual: 'SERVICIO ACTUAL', funcion: 'Función',
  supervisor_actual: 'Supervisor Actual', nacionalidad: 'Nacionalidad',
  calle: 'Calle', numero: 'Numero', piso: 'Piso', dpto: 'Dpto', localidad: 'Localidad',
  cp: 'C P', cel_personal: 'Cel Personal', calzado: 'CALZADO', ambo: 'AMBO',
  chomba: 'CHOMBA', grafa: 'GRAFA', genero: 'GENERO', mails: 'Mails',
  clave_fiscal: 'Clave fiscal al ingreso', banco: 'Banco que posee',
};
const FILA_EJEMPLO = {
  nro_socio: '9001', apellido: 'Perez', nombre: 'Juan', dni: '30123456',
  fecha_nac: '15/03/1985', cuit: '20301234567', estado_civil: 'Soltero',
  fecha_ingreso: '01/03/2026', servicio_actual: 'Edificio Central', funcion: 'Operario',
  supervisor_actual: 'Maria Gomez', nacionalidad: 'Argentina',
  calle: 'Av. Belgrano', numero: '1234', piso: '', dpto: '', localidad: 'Belgrano',
  cp: '1428', cel_personal: '1122334455', calzado: '42', ambo: 'M',
  chomba: 'M', grafa: '42', genero: 'M', mails: 'juan@mail.com',
  clave_fiscal: '', banco: 'Banco Nacion',
};

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
    '<div class="modal" style="max-width:820px;">',
      '<div class="modal-header" style="background:#1e3a8a;color:white;">',
        '<h3 style="color:white;">📤 Importar legajos desde CSV</h3>',
        '<button class="btn-close" style="color:white;" onclick="cerrarModal(\'modal-importar-legajos\')">×</button>',
      '</div>',
      '<div class="modal-body">',
        '<div class="alerta alerta-info" style="margin-bottom:12px;">',
          'Pensado para cargar de una vez legajos de gente que ya trabaja hoy (traspaso de datos), a partir del export real de RRHH. ',
          'Obligatorio: <strong>Nro de socio</strong>, <strong>Apellido/Nombre</strong> y <strong>DNI</strong>. ',
          'Si alguien aparece varias veces (historial de reasignaciones), se importa sólo la última fila de esa persona en el archivo.',
        '</div>',
        '<button type="button" class="btn btn-secondary" onclick="descargarPlantillaLegajos()">⬇️ Descargar plantilla CSV</button>',
        '<div class="form-group" style="margin-top:14px;">',
          '<label>Archivo CSV</label>',
          '<input type="file" id="imp-leg-file" accept=".csv,text/csv" onchange="seleccionarArchivoImportacion()">',
        '</div>',
        '<div id="imp-leg-aviso-encoding" style="display:none;margin-top:8px;padding:8px 10px;border-radius:6px;font-size:12px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;">',
          '⚠️ El archivo parece tener acentos/ñ mal codificados (probablemente se guardó como "CSV" en vez de "CSV UTF-8" desde Excel). Los nombres pueden verse con caracteres raros — volvé a guardarlo con "Guardar como → CSV UTF-8" y subilo de nuevo.',
        '</div>',
        '<div id="imp-leg-resumen" style="margin:8px 0;font-size:13px;font-weight:600;color:var(--texto-suave);"></div>',
        '<div id="imp-leg-preview" style="max-height:360px;overflow-y:auto;border:1px solid var(--borde);border-radius:8px;"></div>',
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
  const avisoEl = $('imp-leg-aviso-encoding'); if (avisoEl) avisoEl.style.display = 'none';
  const btn = $('btn-confirmar-importacion');
  if (btn) { btn.style.display = 'none'; btn.disabled = false; btn.textContent = '✅ Confirmar importación'; }
  abrirModal('modal-importar-legajos');
}

// ========== PLANTILLA ==========

export function descargarPlantillaLegajos() {
  const encabezado = COLUMNAS_PLANTILLA.map(k => HEADERS_DISPLAY[k]).join(',');
  const ejemplo = COLUMNAS_PLANTILLA.map(k => FILA_EJEMPLO[k]).join(',');
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

// ========== NORMALIZACIÓN DE ENCABEZADOS ==========
// Mismo criterio que candidatos/importadorHistorico.js.

function normalizarHeader(h) {
  return (h || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos (é→e, ó→o, etc.)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ========== PARSER CSV (texto plano, sin librerías externas) ==========

function parseCSV(texto) {
  // Excel con configuración regional argentina exporta CSV separado por
  // ';' (la coma queda reservada como separador decimal) — se detecta el
  // delimitador real contando ocurrencias en la cabecera, igual que
  // candidatos/importadorHistorico.js.
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

// Valor Excel de "N/A" → vacío; nunca se guarda el string literal "#N/D".
function limpiarValor(v) {
  const t = (v || '').trim();
  return (t === '#N/D' || t === '#N/A' || t === 'N/D') ? '' : t;
}

// ========== SELECCIONAR ARCHIVO ==========

export function seleccionarArchivoImportacion() {
  const input = $('imp-leg-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const texto = String(e.target.result || '');
    // Excel guardado como "CSV" (no "CSV UTF-8") desde Windows produce
    // texto Latin-1 que, leído como UTF-8, se ve como "Ã±", "Ã©", etc. —
    // aviso no bloqueante, se importa igual (mejor con nombres raros que
    // no importar nada), pero RRHH tiene que saber por qué se ven así.
    const avisoEl = $('imp-leg-aviso-encoding');
    if (avisoEl) avisoEl.style.display = /Ã[\x80-\xBF]/.test(texto) ? 'block' : 'none';

    const filas = parseCSV(texto);
    if (!filas.length) { toast('⚠️ El archivo está vacío'); return; }
    const headers = filas[0].map(h => ALIAS_HEADERS[normalizarHeader(h)] || normalizarHeader(h));
    const filasDatos = filas.slice(1).filter(f => f.some(v => (v || '').trim() !== ''));
    const parseadas = filasDatos.map(f => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = limpiarValor(f[i]); });
      return obj;
    });

    // La planilla es un historial de reasignaciones, no una fila por
    // persona: se queda sólo con la última fila de cada N° de socio (la
    // más reciente en el archivo) — confirmado con Fede, no supuesto.
    // Si no hay N° de socio válido, se agrupa por DNI como respaldo.
    const porClave = new Map();
    parseadas.forEach(f => {
      const clave = (f.nro_socio && /^\d+$/.test(f.nro_socio.trim())) ? 'nro:' + f.nro_socio.trim() : 'dni:' + f.dni;
      porClave.set(clave, f);
    });
    _filasParseadas = [...porClave.values()];

    renderPreviewImportacion();
  };
  reader.readAsText(file, 'UTF-8');
}

// ========== FECHA ==========
// legajo.fecNac se guarda como texto en formato ISO (YYYY-MM-DD) — el
// resto del sistema la trata como string, no como columna date nativa (a
// diferencia de candidatos.fecha_cita). legajo.ingreso queda en formato
// argentino DD/MM/AAAA (mismo criterio que confirmarAlta() en altas.js).
// Formato no reconocido → null/vacío, nunca se propaga basura.
function parsearFechaCSV(f) {
  if (!f) return null;
  const m = f.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, y] = m;
  return { dia: d.padStart(2, '0'), mes: mes.padStart(2, '0'), anio: y };
}
function fechaCsvAISO(f) {
  const p = parsearFechaCSV(f);
  return p ? `${p.anio}-${p.mes}-${p.dia}` : null;
}
function fechaCsvADisplay(f) {
  const p = parsearFechaCSV(f);
  return p ? `${p.dia}/${p.mes}/${p.anio}` : '';
}

// Fecha de nacimiento con más de 100 años (o "1/1/1900", placeholder típico
// de Excel para "sin dato") no es un dato real — se descarta en vez de
// guardarla tal cual, para no dejar a alguien con 126 años en el legajo.
function fecNacRazonable(f) {
  const iso = fechaCsvAISO(f);
  if (!iso) return null;
  const anio = parseInt(iso.slice(0, 4), 10);
  const edad = new Date().getFullYear() - anio;
  if (edad > 100 || edad < 0) return null;
  return iso;
}

// ========== SERVICIO ==========
// SERVICIO ACTUAL ya viene resuelto por RRHH en la planilla (contempla
// reubicaciones) — se prioriza sobre "Servicio", que es más el dato
// original/histórico. "Reubicación" es el mismo valor que SERVICIO ACTUAL
// cuando hubo cambio, así que no hace falta mirarla aparte.
function mapearServicio(f) {
  return cleanText(f.servicio_actual || f.servicio || '') || '— Sin asignar';
}

// ========== PREVIEW + VALIDACIÓN ==========

function renderPreviewImportacion() {
  const cont = $('imp-leg-preview');
  if (!cont) return;
  if (!_filasParseadas.length) { cont.innerHTML = '<p style="padding:10px;">Sin filas para importar</p>'; return; }

  const dnisExistentes = new Set((DB.legajos || []).map(l => l.dni));
  const nrosExistentes = new Set((DB.legajos || []).map(l => String(l.nro)));
  const dnisVistos = new Set();
  const nrosVistos = new Set();
  let validos = 0, invalidos = 0;

  const filasHtml = _filasParseadas.map(f => {
    const problemas = [];
    const avisos = [];

    const nro = (f.nro_socio || '').trim();
    if (!nro || !/^\d+$/.test(nro)) problemas.push('N° de socio inválido');
    else if (nrosExistentes.has(nro)) problemas.push('N° de socio ya existe en legajos');
    else if (nrosVistos.has(nro)) problemas.push('N° de socio repetido en el archivo');
    if (nro) nrosVistos.add(nro);

    const nombreCompleto = toTitleCase(((f.apellido || '') + ' ' + (f.nombre || '')).trim());
    if (!f.apellido && !f.nombre) problemas.push('falta nombre');

    if (!f.dni || !/^\d{6,8}$/.test(f.dni)) problemas.push('DNI inválido');
    else if (dnisExistentes.has(f.dni)) problemas.push('DNI ya existe en legajos');
    else if (dnisVistos.has(f.dni)) problemas.push('DNI repetido en el archivo');
    if (f.dni) dnisVistos.add(f.dni);

    if (f.fecha_nac && !fecNacRazonable(f.fecha_nac)) avisos.push('fecha de nacimiento no reconocida o inválida, se importa sin ella');
    if (f.fecha_ingreso && !fechaCsvADisplay(f.fecha_ingreso)) avisos.push('fecha de ingreso "' + f.fecha_ingreso + '" no reconocida');

    const ok = problemas.length === 0;
    if (ok) validos++; else invalidos++;
    f._valido = ok;
    f._nombreCompleto = nombreCompleto;

    return '<tr style="' + (ok ? '' : 'background:#fef2f2;') + '">'
      + '<td style="padding:5px 8px;font-size:12px;">' + (nro || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (nombreCompleto || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.dni || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + mapearServicio(f) + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.funcion || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:11px;">'
        + (problemas.length ? '<span style="color:#dc2626;">' + problemas.join(', ') + '</span>' : '')
        + (avisos.length ? '<span style="color:#d97706;">' + (problemas.length ? ' — ' : '') + avisos.join('; ') + '</span>' : '')
        + (!problemas.length && !avisos.length ? '✓' : '')
      + '</td>'
      + '</tr>';
  }).join('');

  cont.innerHTML = '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="background:#1e3a8a;color:white;">'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">N° socio</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Nombre</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">DNI</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Servicio</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Función</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Estado</th>'
    + '</tr></thead><tbody>' + filasHtml + '</tbody></table>';

  const resEl = $('imp-leg-resumen');
  if (resEl) resEl.textContent = validos + ' lista(s) para importar, ' + invalidos + ' con problemas (no se van a importar)';
  const btn = $('btn-confirmar-importacion');
  if (btn) btn.style.display = validos > 0 ? 'inline-flex' : 'none';
}

// ========== CONFIRMAR IMPORTACIÓN ==========

// Reentrancia: con ~500 filas (2 idas y vueltas a Supabase c/u) esto tarda
// bastante y antes no daba ninguna señal de que seguía corriendo — RRHH
// volvía a apretar "Confirmar" pensando que no había pasado nada, lo que
// lanzaba una segunda pasada en paralelo sobre las mismas filas: cuando
// las dos llegaban a la misma fila casi al mismo tiempo, una insertaba
// bien y la otra chocaba contra el unique constraint de id_local (409,
// bug real reportado — la base se protegió sola, no llegó a duplicar
// nada, pero el error de la segunda pasada confundía porque esa fila en
// realidad sí se había guardado). Se ataja con guard + botón deshabilitado
// + progreso visible, así no hay margen para el doble click.
let _importando = false;

export async function confirmarImportacionLegajos() {
  if (_importando) return;
  // f._yaImportado excluye filas que ya se guardaron bien en un intento
  // anterior — si algunas fallan y se reintenta sin volver a subir el
  // archivo, no hay que reprocesar las que ya entraron.
  const validas = _filasParseadas.filter(f => f._valido && !f._yaImportado);
  if (!validas.length) { toast('⚠️ No hay filas válidas para importar'); return; }

  _importando = true;
  const btn = $('btn-confirmar-importacion');
  if (btn) { btn.disabled = true; btn.textContent = 'Importando 0 / ' + validas.length + '…'; }
  const resEl = $('imp-leg-resumen');

  const hoy = new Date().toISOString().slice(0, 10);
  let importados = 0;
  const fallos = []; // [{ nro, dni, nombre, error }]

  for (const [i, f] of validas.entries()) {
    if (btn) btn.textContent = 'Importando ' + (i + 1) + ' / ' + validas.length + '…';
    if (resEl) resEl.textContent = 'Importando ' + (i + 1) + ' / ' + validas.length + '…';
    const direccion = cleanText([f.calle, f.numero].filter(Boolean).join(' ') + (f.piso ? ' ' + f.piso : '') + (f.dpto ? ' ' + f.dpto : ''));
    const genero = /^f/i.test(f.genero) ? 'Femenino' : /^m/i.test(f.genero) ? 'Masculino' : (f.genero ? 'Otro' : '');
    const tallesUniforme = {};
    if (f.chomba) tallesUniforme.chomba = f.chomba;
    if (f.grafa) tallesUniforme.grafa = f.grafa;

    const legajo = {
      nro: parseInt(f.nro_socio, 10),
      nombre: f._nombreCompleto,
      dni: f.dni,
      funcion: cleanText(f.funcion || '') || 'Operario',
      servicio: mapearServicio(f),
      supervisor: cleanText(f.supervisor_actual || '') || '— Sin asignar',
      sector: '',
      ingreso: fechaCsvADisplay(f.fecha_ingreso) || new Date().toLocaleDateString('es-AR'),
      // La columna "Estado" de la planilla da "SI" en todas las filas (es
      // el export de la nómina activa) — no hay caso de baja que mapear
      // acá, por eso queda fijo en 'Activo'. Si algún día RRHH exporta
      // también bajas, hay que leer f.estado_csv acá en vez de fijarlo.
      estado: 'Activo',
      estadoLegal: '', estadoMedico: '', fechaBaja: '', fechaReincorp: '', legajoAnteriorNro: null,
      seguro: 'Pendiente',
      localidad: cleanText(f.localidad || ''),
      partido: '',
      codigoPostal: cleanText(f.cp || ''),
      tel: cleanText(f.cel_personal || ''),
      mail: cleanText(f.mails || ''),
      cuit: cleanText(f.cuit || ''),
      claveFiscal: cleanText(f.clave_fiscal || ''),
      inaes: '',
      estadoCivil: cleanText(f.estado_civil || ''),
      nac: cleanText(f.nacionalidad || '') || 'Argentina',
      genero,
      banco: cleanText(f.banco || ''),
      calzado: parseInt(f.calzado, 10) || 0,
      ambo: cleanText(f.ambo || ''),
      periodoPrueba: 6,
      fechaIngresoPrueba: fechaCsvAISO(f.fecha_ingreso) || hoy,
      adjuntosLegal: [], adjuntosMedico: [],
      direccion, fecNac: fecNacRazonable(f.fecha_nac), zona: '',
      cbu: '',
      polizas: [],
      obraSocial: '', obraSocialInicioTramite: '', formaPago: '',
      integracion: 0, categoria: '',
      ...(Object.keys(tallesUniforme).length ? { tallesUniforme } : {}),
    };
    const ok = await supaSync('legajos', legajo);
    if (ok) {
      DB.legajos.push(legajo);
      f._yaImportado = true;
      importados++;
    } else {
      const err = getLastSupaSyncError();
      console.error('Import legajos — falló N° ' + f.nro_socio + ' / DNI ' + f.dni + ' (' + f._nombreCompleto + '):', err);
      fallos.push({ nro: f.nro_socio, dni: f.dni, nombre: f._nombreCompleto, error: (err && err.message) || 'Error desconocido' });
    }
  }

  renderLegajos();
  if (fallos.length > 0) {
    const detalle = fallos.map(x => 'N°' + x.nro + ' ' + x.nombre + ': ' + x.error).join(' | ');
    toast('⚠️ ' + importados + ' importado(s), ' + fallos.length + ' no se pudieron guardar — ' + detalle);
    if (resEl) {
      resEl.innerHTML = importados + ' importado(s) correctamente.<br>'
        + '<span style="color:#dc2626;">' + fallos.length + ' con error del servidor:</span><br>'
        + fallos.map(x => '• N° ' + x.nro + ' — ' + x.nombre + ' (DNI ' + x.dni + '): ' + x.error).join('<br>');
    }
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar importación'; }
    _importando = false;
  } else {
    toast('✅ ' + importados + ' legajo(s) importado(s) correctamente');
    _importando = false;
    abrirImportadorLegajos();
  }
}
