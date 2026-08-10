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

import { DB, currentUser, LOCALIDAD_A_PARTIDO } from '@shared/state.js';
import { $, toTitleCase, cleanText } from '@shared/helpers.js';
import { toast } from '@shared/ui.js';
import { supaSync, getLastSupaSyncError } from '@shared/supabase.js';
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

// ========== LOCALIDAD → PARTIDO (autocompletar, ticket "Importe
// histórico" 08/2026) ==========
// La planilla trae Localidad pero nunca Partido — antes quedaba en blanco
// siempre, aunque la localidad fuera reconocible (ej. "Jose.C.Paz",
// "JOSE C PAZ", "José C. Paz" son la misma localidad con formato distinto
// según quién cargó la fila a mano). Se arma un índice normalizado (sin
// acentos, sin puntos/guiones, minúscula) de las localidades reales
// (LOCALIDAD_A_PARTIDO, mismo dataset que usa el selector en cascada de
// Candidatos) una sola vez al cargar el módulo, y se usa para reconocer
// la localidad pase lo que pase con el formato de la celda. Si NO
// reconoce la localidad, no inventa nada: la deja tal cual vino y el
// Partido queda vacío, igual que antes.
function normalizarClaveLocalidad(s) {
  return (s || '')
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const LOCALIDADES_NORMALIZADAS = Object.fromEntries(
  Object.keys(LOCALIDAD_A_PARTIDO).map(loc => [normalizarClaveLocalidad(loc), loc])
);

// Devuelve { localidad, partido } — localidad canónica (formato prolijo,
// ej. "José C. Paz") + su partido si la reconoce; si no, { localidad:
// cleanText(raw), partido: '' } tal cual se comportaba antes.
function resolverLocalidadYPartido(rawLocalidad) {
  const raw = cleanText(rawLocalidad || '');
  if (!raw) return { localidad: '', partido: '' };
  const canonica = LOCALIDADES_NORMALIZADAS[normalizarClaveLocalidad(raw)];
  if (canonica) return { localidad: canonica, partido: LOCALIDAD_A_PARTIDO[canonica] || '' };
  return { localidad: raw, partido: '' };
}

// ========== EMAIL (validar antes de guardar como email) ==========
// Encontrado en datos reales: la celda de "Correo Electrónico" a veces
// tiene un link de Google Drive pegado por error (foto del DNI, etc.) en
// vez de un mail — guardarlo tal cual en el campo Email es peor que
// dejarlo vacío (se ve como un mail roto). Si no tiene forma de email, se
// preserva igual en observaciones (no se pierde el dato) pero no se
// fuerza en el campo Email.
function pareceEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
}

// ========== REFERIDO POR (desde "Detalle Convocatoria") ==========
// "Detalle Convocatoria" es un campo genérico que según el Medio significa
// cosas distintas — cuando el medio es una red social suele decir el
// nombre de la red ("Facebook"), cuando es referido de alguien suele
// tener el nombre de esa persona ("Nahuel, amigo trabaja en Ohlimpia").
// Sólo se copia a "Referido por" cuando el Medio indica explícitamente
// que fue por referencia/recomendación — para los demás casos (redes,
// búsqueda activa, etc.) sería un dato inventado/incorrecto, así que ahí
// se deja como estaba: solo texto libre en Observaciones.
function pareceReferido(medioRaw) {
  const m = normalizarHeader(medioRaw);
  return m.includes('referid') || m.includes('recomend');
}

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
// Se genera un .xlsx real (no CSV) — a diferencia de LEER un .xlsx
// subido por el usuario (ver más abajo, ahí sí hay una vulnerabilidad
// conocida sin parche en la librería), ESCRIBIR/generar un .xlsx para
// descargar no toca ese código vulnerable y es un patrón ya usado en el
// proyecto (ver exportarHistorialCategoriasExcel en el módulo
// Categorías). Los encabezados son los mismos que ya usa la planilla
// real de RRHH, así Gabi puede completar la plantilla y listo.
const HEADERS_DISPLAY = {
  fecha: 'Fecha', entrevistadora: 'Entrevistadora', modalidad: 'Modalidad de Entrevista',
  apellidos: 'Apellidos', nombres: 'Nombres', dni: 'DNI', genero: 'Género',
  telefono: 'Teléfono de Contacto', edad: 'Edad', localidad: 'Localidad',
  zona: 'Zona de Residencia', disponibilidad: 'Disponibilidad Horaria',
  experiencia: 'Experiencia Laboral en Maestranza',
  presencia: 'Presencia', exp_verbal: 'Exp. Verbal', compr_consignas: 'Compr. consignas',
  predisposicion: 'Predisposición', rel_interpersonal: 'Rel. Interpersonal',
  evaluacion_final: 'EVALUACIÓN FINAL', observaciones: 'OBSERVACIONES',
  medio: 'Medio de Convocatoria', detalle_convocatoria: 'Detalle Convocatoria',
  correo_electronico: 'Correo Electrónico', posible_servicio: 'Posible Servicio',
  fecha_psico: 'Fecha de Psico', psicotecnico: 'Psicotécnico',
  fecha_ingreso: 'Fecha de Ingreso', obs_psicotecnico: 'OBS. DEL PSICOTECNICO',
};
const FILA_EJEMPLO = {
  fecha: '28/07/2026', entrevistadora: 'Jimena', modalidad: 'Virtual',
  apellidos: 'Calermo', nombres: 'Paula Nicole', dni: '46233485', genero: 'F',
  telefono: '1168278327', edad: '18 a 25 años', localidad: 'Retiro',
  zona: 'CABA', disponibilidad: 'Full time', experiencia: 'Baja',
  presencia: 'B', exp_verbal: 'B', compr_consignas: 'B', predisposicion: 'B', rel_interpersonal: 'B',
  evaluacion_final: 'Aprobado', observaciones: 'Poca experiencia lab. buena presencia, para hit',
  medio: 'Red Social Facebook', detalle_convocatoria: 'Facebook',
  correo_electronico: '', posible_servicio: '', fecha_psico: '', psicotecnico: '',
  fecha_ingreso: '', obs_psicotecnico: '',
};

export async function descargarPlantillaCandidatosHistorico() {
  const XLSX = await import('xlsx');
  const fila = {};
  COLUMNAS_PLANTILLA.forEach(k => { fila[HEADERS_DISPLAY[k]] = FILA_EJEMPLO[k]; });
  const hoja = XLSX.utils.json_to_sheet([fila], { header: COLUMNAS_PLANTILLA.map(k => HEADERS_DISPLAY[k]) });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Entrevistas');
  XLSX.writeFile(libro, 'plantilla_candidatos_historico.xlsx');
}

// ========== PARSER CSV (texto plano, sin librerías externas) ==========
// Mismo parser que src/modules/legajos/importador.js — duplicado a
// propósito en vez de compartido, para no crear una dependencia cruzada
// entre módulos por una función de 25 líneas sin estado.

function parseCSV(texto) {
  // Excel con configuración regional argentina exporta CSV separado por
  // ';' (la coma queda reservada como separador decimal). Se detecta el
  // delimitador real contando ocurrencias en la primera línea (cabecera),
  // igual que _parsearLineaCSV en legacy.js — si no, con ';' cada fila
  // completa cae en un solo campo y ninguna se reconoce como válida.
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

// ========== FECHA ==========

// candidatos.fecha_cita es una columna `date` nativa en Supabase (no text
// como buena parte de legajos/documentacion) — necesita YYYY-MM-DD. La
// planilla de RRHH trae la fecha en formato argentino DD/MM/AAAA (ver
// FILA_EJEMPLO más arriba). Sin esta conversión, Supabase rechazaba el
// insert completo con "invalid input syntax for type date" apenas la fila
// traía fecha — la causa real detrás del "no se puede guardar en el
// servidor" que reportó RRHH al importar el histórico (bug real, no
// hipotético: se reprodujo el error contra el esquema).
// Formato no reconocido → null (mejor que romper el insert entero).
function fechaCsvAISO(f) {
  if (!f) return null;
  const m = f.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, y] = m;
  return y + '-' + mes.padStart(2, '0') + '-' + d.padStart(2, '0');
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

// referidoExtraido: true cuando "Detalle convocatoria" ya se copió a
// nombreReferido (ver resolverReferido más abajo) — evita duplicar la
// misma línea en Observaciones cuando ya quedó como dato estructurado.
function armarObservaciones(f, referidoExtraido) {
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
  if (f.detalle_convocatoria && !referidoExtraido) partes.push('Detalle convocatoria: ' + f.detalle_convocatoria);
  if (f.posible_servicio) partes.push('Posible servicio: ' + f.posible_servicio);
  if (f.fecha_psico || f.psicotecnico) partes.push('Psicotécnico: ' + (f.psicotecnico || '—') + (f.fecha_psico ? ' (' + f.fecha_psico + ')' : ''));
  if (f.fecha_ingreso) partes.push('Fecha de ingreso (planilla): ' + f.fecha_ingreso);
  if (f.obs_psicotecnico) partes.push('Obs. del psicotécnico: ' + f.obs_psicotecnico);
  if (f.observaciones) partes.push('Observaciones: ' + f.observaciones);
  // Email con formato inválido (ej. un link de Google Drive pegado por
  // error en la celda) no se pierde: no entra al campo Email pero queda
  // legible acá, en vez de desaparecer silenciosamente.
  if (f.correo_electronico && !pareceEmail(f.correo_electronico)) {
    partes.push('Correo electrónico (formato no reconocido, revisar a mano): ' + f.correo_electronico);
  }
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
    if (f.fecha && !fechaCsvAISO(f.fecha)) {
      // Igual que la zona: no bloquea la fila (se importa sin fecha de
      // cita) — solo avisa, así se ve en el preview en vez de recién
      // enterarse después de un guardado fallido.
      f._fechaNoReconocida = f.fecha;
    }

    const { estado } = mapearEstadoDesdeResultado(f.evaluacion_final);
    f._estadoResultante = estado;

    const { localidad, partido } = resolverLocalidadYPartido(f.localidad);
    const localidadHtml = f.localidad
      ? (partido ? localidad + ' <span style="color:#16a34a;">(' + partido + ')</span>' : localidad + ' <span style="color:#d97706;">(partido no reconocido)</span>')
      : '—';

    const ok = problemas.length === 0;
    if (ok) validos++; else invalidos++;
    f._valido = ok;

    return '<tr style="' + (ok ? '' : 'background:#fef2f2;') + '">'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.apellidos || '—') + ', ' + (f.nombres || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.dni || '—') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.zona || '—') + (f._zonaNoReconocida ? ' <span style="color:#d97706;">(sin mapear)</span>' : '') + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + localidadHtml + '</td>'
      + '<td style="padding:5px 8px;font-size:12px;">' + (f.evaluacion_final || '—') + ' → ' + estado + '</td>'
      + '<td style="padding:5px 8px;font-size:11px;">'
        + '<span style="color:#dc2626;">' + problemas.join(', ') + '</span>'
        + (f._fechaNoReconocida ? '<span style="color:#d97706;">' + (problemas.length ? ' — ' : '') + 'fecha "' + f._fechaNoReconocida + '" no reconocida, se importa sin fecha de cita</span>' : '')
        + (!problemas.length && !f._fechaNoReconocida ? '✓' : '')
      + '</td>'
      + '</tr>';
  }).join('');

  cont.innerHTML = '<table style="width:100%;border-collapse:collapse;">'
    + '<thead><tr style="background:#1e3a8a;color:white;">'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Candidato</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">DNI</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Zona</th>'
    + '<th style="padding:6px 8px;text-align:left;font-size:12px;">Localidad (Partido)</th>'
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
  // f._yaImportado excluye filas que ya se guardaron bien en un intento
  // anterior (ver más abajo) — si algunas filas fallaron y se reintenta
  // sin volver a subir el archivo, no hay que reprocesar las que ya
  // entraron (generaría un DNI duplicado contra el candidato recién creado).
  const validas = _filasParseadas.filter(f => f._valido && !f._yaImportado);
  if (!validas.length) { toast('⚠️ No hay filas válidas para importar'); return; }

  const creadoPor = currentUser ? ((currentUser.nickname || currentUser.nombre) + ' (import histórico)') : 'Import histórico';
  let importados = 0;
  const fallos = []; // [{ dni, nombre, error }] — detalle real de cada fila que no se pudo guardar

  for (const f of validas) {
    const { estado, motivoRechazo } = mapearEstadoDesdeResultado(f.evaluacion_final);
    const zona = f.zona && ZONAS_VALIDAS.includes(f.zona) ? f.zona : '';
    const { localidad, partido } = resolverLocalidadYPartido(f.localidad);
    const email = pareceEmail(f.correo_electronico) ? cleanText(f.correo_electronico).toLowerCase() : '';
    const referido = pareceReferido(f.medio) ? cleanText(f.detalle_convocatoria || '') : '';
    const nuevo = {
      id: Date.now() + importados,
      apellido: toTitleCase(f.apellidos),
      nombre: toTitleCase(f.nombres),
      dni: f.dni,
      // CUIT, Fecha de nacimiento, Estado civil, Nacionalidad y Domicilio
      // (calle/piso) NO tienen columna en la planilla histórica de
      // entrevistas (ver ALIAS_HEADERS/HEADERS_DISPLAY arriba) — quedan
      // en blanco a propósito, no es un dato que se esté perdiendo por un
      // mapeo incompleto. Gabi los completa a mano si hace falta.
      cuit: '',
      fecNac: null,
      estadoCivil: '',
      genero: /^f/i.test(f.genero) ? 'Femenino' : /^m/i.test(f.genero) ? 'Masculino' : (f.genero ? 'Otro' : null),
      nacionalidad: null,
      tel: cleanText(f.telefono || ''),
      email,
      calle: '',
      piso: '',
      zona,
      partido,
      localidad,
      disponibilidadHoraria: cleanText(f.disponibilidad || ''),
      medio: cleanText(f.medio || ''),
      nombreReferido: referido,
      rrhhId: null,
      obs: armarObservaciones(f, !!referido),
      estado,
      motivoRechazo,
      asistio: 'si', // vienen de una entrevista ya realizada
      // fecha_cita es date nativo en Supabase — la planilla trae DD/MM/AAAA,
      // hay que convertirla a ISO o Supabase rechaza el insert entero
      // (ver comentario de fechaCsvAISO más arriba — esta era la causa
      // real del "no se puede guardar en el servidor").
      fechaCita: fechaCsvAISO(f.fecha),
      horaCita: null,
      creadoPor,
    };
    const ok = await supaSync('candidatos', nuevo);
    if (ok) {
      DB.candidatos.push(nuevo);
      f._yaImportado = true;
      importados++;
    } else {
      // getLastSupaSyncError() = el { code, message, details } real que
      // devolvió Supabase (supaSync lo guarda en cada llamada) — antes acá
      // solo se contaba "fallidos" sin decir cuál fila ni por qué.
      const err = getLastSupaSyncError();
      console.error('Import histórico — falló ' + f.dni + ' (' + f.apellidos + ', ' + f.nombres + '):', err);
      fallos.push({ dni: f.dni, nombre: f.apellidos + ', ' + f.nombres, error: (err && err.message) || 'Error desconocido' });
    }
  }

  renderCandidatos();
  if (fallos.length > 0) {
    const detalle = fallos.map(x => x.dni + ' (' + x.nombre + '): ' + x.error).join(' | ');
    toast('⚠️ ' + importados + ' importado(s), ' + fallos.length + ' no se pudieron guardar — ' + detalle);
    const resEl = $('imp-cand-resumen');
    if (resEl) {
      resEl.innerHTML = importados + ' importado(s) correctamente.<br>'
        + '<span style="color:#dc2626;">' + fallos.length + ' con error del servidor:</span><br>'
        + fallos.map(x => '• DNI ' + x.dni + ' (' + x.nombre + '): ' + x.error).join('<br>');
    }
  } else {
    toast('✅ ' + importados + ' candidato(s) importado(s) correctamente');
    abrirImportadorCandidatosHistorico();
  }
}
