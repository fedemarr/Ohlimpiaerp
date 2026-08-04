// Importador masivo de entrevistas históricas (candidatos ya
// entrevistados fuera del sistema, en una planilla de Excel) — ticket
// RRHH 04/08/2026.
//
// Mismo criterio que el importador de Legajos (src/modules/legajos/
// importador.js): CSV en vez de .xlsx real. La librería estándar para
// leer Excel en el navegador (xlsx/SheetJS) tiene 2 vulnerabilidades
// altas sin parche (prototype pollution + ReDoS) — CSV es texto plano,
// se parsea sin ninguna librería externa, y cualquier Excel se guarda
// como CSV con un clic ("Guardar como" → CSV UTF-8).
//
// La planilla real de RRHH tiene columnas de evaluación de la entrevista
// (Presencia, Exp. Verbal, Compr. consignas, Predisposición, Rel.
// Interpersonal), convocatoria, psicotécnico, etc. que no tienen un
// campo propio en el modelo de candidato (decisión explícita: no
// agregar una columna por cada ítem) — todo eso se preserva igual como
// texto legible en "obs", así no se pierde nada de la planilla original
// aunque no quede como dato estructurado.

import { DB, currentUser } from '@shared/state.js';
import { $, toTitleCase, cleanText } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { renderCandidatos } from './candidatos.js';

const COLUMNAS_PLANTILLA = [
  'fecha', 'entrevistadora', 'modalidad', 'apellidos', 'nombres', 'dni', 'genero',
  'telefono', 'edad', 'localidad', 'zona', 'disponibilidad', 'experiencia',
  'presencia', 'exp_verbal', 'compr_consignas', 'predisposicion', 'rel_interpersonal',
  'evaluacion_final', 'observaciones', 'medio', 'detalle_convocatoria',
  'correo_electronico', 'posible_servicio', 'fecha_psico', 'psicotecnico',
  'fecha_ingreso', 'obs_psicotecnico',
];

// Alias de encabezados reales de la planilla de RRHH (normalizados: sin
// acentos, minúscula, separados por "_") hacia las claves internas de
// arriba — para que Gabi pueda exportar la planilla tal cual la usa hoy
// sin tener que renombrar columnas a mano primero.
const ALIAS_HEADERS = {
  fecha: 'fecha',
  entrevistadora: 'entrevistadora',
  modalidad_de_entrevista: 'modalidad',
  modalidad: 'modalidad',
  apellidos: 'apellidos',
  apellido: 'apellidos',
  nombres: 'nombres',
  nombre: 'nombres',
  dni: 'dni',
  genero: 'genero',
  telefono_de_contacto: 'telefono',
  telefono: 'telefono',
  edad: 'edad',
  localidad: 'localidad',
  zona_de_residencia: 'zona',
  zona: 'zona',
  disponibilidad_horaria: 'disponibilidad',
  disponibilidad: 'disponibilidad',
  experiencia_laboral_en_maestranza: 'experiencia',
  experiencia: 'experiencia',
  presencia: 'presencia',
  exp_verbal: 'exp_verbal',
  compr_consignas: 'compr_consignas',
  predisposicion: 'predisposicion',
  rel_interpersonal: 'rel_interpersonal',
  evaluacion_final: 'evaluacion_final',
  evaluacion: 'evaluacion_final',
  observaciones: 'observaciones',
  medio_de_convocatoria: 'medio',
  medio: 'medio',
  detalle_convocatoria: 'detalle_convocatoria',
  correo_electronico: 'correo_electronico',
  email: 'correo_electronico',
  posible_servicio: 'posible_servicio',
  fecha_de_psico: 'fecha_psico',
  psicotecnico: 'psicotecnico',
  fecha_de_ingreso: 'fecha_ingreso',
  obs_del_psicotecnico: 'obs_psicotecnico',
};

// Zonas válidas hoy (DB.zonas es editable desde Configuración, pero acá
// sólo mapeamos automático si coincide exactamente — si Gabi cargó un
// valor que no reconocemos, se deja vacío en vez de adivinar mal).
const ZONAS_VALIDAS = ['CABA', 'Zona Norte', 'Zona Sur', 'Zona Oeste'];

let _filasParseadas = [];

// ========== NORMALIZACIÓN DE ENCABEZADOS ==========

function normalizarHeader(h) {
  return (h || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos (é→e, ó→o, etc.)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ========== PLANTILLA ==========

export function descargarPlantillaCandidatosHistorico() {
  const encabezado = COLUMNAS_PLANTILLA.join(',');
  const ejemplo = [
    '28/07/2026', 'Jimena', 'Virtual', 'Calermo', 'Paula Nicole', '46233485', 'F',
    '1168278327', '18 a 25 años', 'Retiro', 'CABA', 'Full time', 'Baja',
    'B', 'B', 'B', 'B', 'B',
    'Aprobado', 'Poca experiencia lab. buena presencia, para hit', 'Red Social Facebook', 'Facebook',
    '', '', '', '',
    '', '',
  ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',');
  const csv = encabezado + '\n' + ejemplo + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'plantilla_candidatos_historico.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ========== PARSER CSV (texto plano, sin librerías externas) ==========
// Mismo parser que src/modules/legajos/importador.js — duplicado a
// propósito en vez de compartido, para no crear una dependencia cruzada
// entre módulos por una función de 25 líneas sin estado.

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

// ========== ABRIR TAB / RESET ==========

export function abrirImportadorCandidatosHistorico() {
  _filasParseadas = [];
  const fileEl = $('imp-cand-file'); if (fileEl) fileEl.value = '';
  const prevEl = $('imp-cand-preview'); if (prevEl) prevEl.innerHTML = '';
  const resEl = $('imp-cand-resumen'); if (resEl) resEl.textContent = '';
  const btn = $('btn-confirmar-importacion-candidatos'); if (btn) btn.style.display = 'none';
}

// ========== SELECCIONAR ARCHIVO ==========

export function seleccionarArchivoImportacionCandidatos() {
  const input = $('imp-cand-file');
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const filas = parseCSV(String(e.target.result || ''));
    if (!filas.length) { toast('⚠️ El archivo está vacío'); return; }
    const headers = filas[0].map(h => ALIAS_HEADERS[normalizarHeader(h)] || normalizarHeader(h));
    const filasDatos = filas.slice(1).filter(f => f.some(v => (v || '').trim() !== ''));
    _filasParseadas = filasDatos.map(f => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (f[i] || '').trim(); });
      return obj;
    });
    renderPreviewImportacionCandidatos();
  };
  reader.readAsText(file, 'UTF-8');
}

// ========== MAPEO evaluación final → estado del candidato ==========

function mapearEstadoDesdeResultado(resultadoRaw) {
  const r = normalizarHeader(resultadoRaw);
  if (!r) return { estado: 'Entrevistado', motivoRechazo: '' };
  if (r.includes('desaprob')) return { estado: 'Rechazado', motivoRechazo: 'Desaprobado en entrevista (import histórico)' };
  if (r.includes('rechaz')) return { estado: 'Rechazado', motivoRechazo: 'Rechazado en entrevista (import histórico)' };
  if (r.includes('baja')) return { estado: 'Rechazado', motivoRechazo: 'Baja (import histórico)' };
  if (r.includes('aprob')) return { estado: 'Aprobado', motivoRechazo: '' };
  // Resultado presente pero no reconocido: mejor dejarlo "Entrevistado"
  // (pendiente de que Gabi lo revise) que adivinar mal Aprobado/Rechazado.
  return { estado: 'Entrevistado', motivoRechazo: '' };
}

function armarObservaciones(f) {
  const partes = ['[Importado de planilla histórica de entrevistas]'];
  if (f.modalidad) partes.push('Modalidad: ' + f.modalidad);
  if (f.edad) partes.push('Edad: ' + f.edad);
  if (f.entrevistadora) partes.push('Entrevistadora: ' + f.entrevistadora);
  if (f.experiencia) partes.push('Experiencia en Maestranza: ' + f.experiencia);
  const evalItems = [
    f.presencia && 'Presencia: ' + f.presencia,
    f.exp_verbal && 'Exp. Verbal: ' + f.exp_verbal,
    f.compr_consignas && 'Compr. consignas: ' + f.compr_consignas,
    f.predisposicion && 'Predisposición: ' + f.predisposicion,
    f.rel_interpersonal && 'Rel. Interpersonal: ' + f.rel_interpersonal,
  ].filter(Boolean);
  if (evalItems.length) partes.push('Evaluación — ' + evalItems.join(', '));
  if (f.evaluacion_final) partes.push('Evaluación final (planilla): ' + f.evaluacion_final);
  if (f.detalle_convocatoria) partes.push('Detalle convocatoria: ' + f.detalle_convocatoria);
  if (f.posible_servicio) partes.push('Posible servicio: ' + f.posible_servicio);
  if (f.fecha_psico || f.psicotecnico) partes.push('Psicotécnico: ' + (f.psicotecnico || '—') + (f.fecha_psico ? ' (' + f.fecha_psico + ')' : ''));
  if (f.fecha_ingreso) partes.push('Fecha de ingreso (planilla): ' + f.fecha_ingreso);
  if (f.obs_psicotecnico) partes.push('Obs. del psicotécnico: ' + f.obs_psicotecnico);
  if (f.observaciones) partes.push('Observaciones: ' + f.observaciones);
  return partes.join('\n');
}

// ========== PREVIEW + VALIDACIÓN ==========

function renderPreviewImportacionCandidatos() {
  const cont = $('imp-cand-preview');
  if (!cont) return;
  if (!_filasParseadas.length) { cont.innerHTML = '<p style="padding:10px;">Sin filas para importar</p>'; return; }

  const dnisExistentes = new Set((DB.candidatos || []).map(c => c.dni));
  const dnisVistos = new Set();
  let validos = 0, invalidos = 0;

  const filasHtml = _filasParseadas.map(f => {
    const problemas = [];
    if (!f.apellidos) problemas.push('falta apellido');
    if (!f.nombres) problemas.push('falta nombre');
    if (!f.dni || !/^\d{6,8}$/.test(f.dni)) problemas.push('DNI inválido');
    else if (dnisExistentes.has(f.dni)) problemas.push('DNI ya existe en candidatos');
    else if (dnisVistos.has(f.dni)) problemas.push('DNI repetido en el archivo');
    if (f.dni) dnisVistos.add(f.dni);

    if (f.zona && !ZONAS_VALIDAS.includes(f.zona)) {
      // No es un error que bloquee la fila — se importa igual con la
      // zona vacía, para que Gabi la complete a mano después.
      f._zonaNoReconocida = f.zona;
    }

    const { estado } = mapearEstadoDesdeResultado(f.evaluacion_final);
    f._estadoResultante = estado;

    const ok = problemas.length === 0;
    if (ok) validos++; else invalidos++;
    f._valido = ok;

    return '<tr style="' + (ok ? '' : 'background:#fef2f2;') + '">'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.apellidos || '—') + ', ' + (f.nombres || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.dni || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.zona || '—') + (f._zonaNoReconocida ? ' <span style="color:#d97706;">(sin mapear)</span>' : '') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.evaluacion_final || '—') + ' → ' + estado + '</td>'
      + '<td style="padding:5px 8px;font-size:11px;color:#dc2626;">' + (problemas.join(', ') || '✓') + '</td>'
      + '</tr>';
  }).join('');

  cont.innerHTML = '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="background:#1e3a8a;color:white;">'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Candidato</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">DNI</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Zona</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Resultado → Estado</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Estado</th>'
    + '</tr></thead><tbody>' + filasHtml + '</tbody></table>';

  const resEl = $('imp-cand-resumen');
  if (resEl) resEl.textContent = validos + ' lista(s) para importar, ' + invalidos + ' con problemas (no se van a importar)';
  const btn = $('btn-confirmar-importacion-candidatos');
  if (btn) btn.style.display = validos > 0 ? 'inline-flex' : 'none';
}

// ========== CONFIRMAR IMPORTACIÓN ==========

export async function confirmarImportacionCandidatosHistorico() {
  const validas = _filasParseadas.filter(f => f._valido);
  if (!validas.length) { toast('⚠️ No hay filas válidas para importar'); return; }

  const creadoPor = currentUser ? ((currentUser.nickname || currentUser.nombre) + ' (import histórico)') : 'Import histórico';
  let importados = 0, fallidos = 0;

  for (const f of validas) {
    const { estado, motivoRechazo } = mapearEstadoDesdeResultado(f.evaluacion_final);
    const zona = f.zona && ZONAS_VALIDAS.includes(f.zona) ? f.zona : '';
    const nuevo = {
      id: Date.now() + importados,
      apellido: toTitleCase(f.apellidos),
      nombre: toTitleCase(f.nombres),
      dni: f.dni,
      cuit: '',
      fecNac: null,
      estadoCivil: '',
      genero: /^f/i.test(f.genero) ? 'Femenino' : /^m/i.test(f.genero) ? 'Masculino' : (f.genero ? 'Otro' : null),
      nacionalidad: null,
      tel: cleanText(f.telefono || ''),
      email: cleanText(f.correo_electronico || ''),
      calle: '',
      piso: '',
      zona,
      localidad: cleanText(f.localidad || ''),
      disponibilidadHoraria: cleanText(f.disponibilidad || ''),
      medio: cleanText(f.medio || ''),
      nombreReferido: '',
      rrhhId: null,
      obs: armarObservaciones(f),
      estado,
      motivoRechazo,
      asistio: 'si', // vienen de una entrevista ya realizada
      fechaCita: f.fecha || null,
      horaCita: null,
      creadoPor,
    };
    const ok = await supaSync('candidatos', nuevo);
    if (ok) { DB.candidatos.push(nuevo); importados++; }
    else fallidos++;
  }

  renderCandidatos();
  if (fallidos > 0) {
    toast('⚠️ ' + importados + ' importado(s), ' + fallidos + ' no se pudieron guardar en el servidor — reintentá esas filas');
  } else {
    toast('✅ ' + importados + ' candidato(s) importado(s) correctamente');
  }
  abrirImportadorCandidatosHistorico();
}
