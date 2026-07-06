// src/shared/adjuntos.js
// Helper genérico para manejar archivos adjuntos contra el bucket privado
// `ohlimpia-adjuntos` (Supabase Storage) y la tabla `adjuntos`.
// Usado por Psicotécnico (tipo='informe-psico') y reutilizable por otros módulos.

import { SUPA, _toCamel } from '@shared/supabase.js';
import { currentUser } from '@shared/state.js';

const BUCKET = 'ohlimpia-adjuntos';

// tipo (clave interna) → nombre legible para el archivo descargable
export const TIPO_LEGIBLE = {
  'informe-psico': 'Informe Psico',
  'apto-medico':   'Apto Medico',
  'no-apto':       'No Apto',
  'antecedente':   'Antecedente',
  'libreta':       'Libreta',
  'curso':         'Curso',
  'dni-frente':    'DNI Frente',
  'dni-dorso':     'DNI Dorso',
  'foto-rostro':   'Foto Rostro',
  'monotributo':   'Monotributo',
  'inaes':         'INAES',
  'certificado-capacitacion': 'Certificado Capacitacion',
};

// Límite de tamaño (10 MB, igual que el bucket) y MIME types permitidos.
export const MAX_SIZE = 10 * 1024 * 1024;
export const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];

// Extensión a partir del nombre del archivo (lowercase, fallback 'bin').
function _ext(filename) {
  const i = (filename || '').lastIndexOf('.');
  if (i < 0 || i === filename.length - 1) return 'bin';
  return filename.slice(i + 1).toLowerCase();
}

// Construye el nombre legible del archivo según la convención de los traspasos.
function _nombreArchivo(tipo, dni, ext) {
  if (tipo === 'antecedente') {
    const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `Antecedente ${fecha} - DNI ${dni}.${ext}`;
  }
  return `${TIPO_LEGIBLE[tipo]} - DNI ${dni}.${ext}`;
}

// ========== SUBIR ==========

/**
 * Sube un archivo a Storage y crea el registro en la tabla adjuntos.
 * Invalida (vigente=false) los adjuntos previos del mismo (dni, tipo),
 * EXCEPTO tipo='antecedente' que conserva historial.
 * Devuelve el registro creado (camelCase, con id). Lanza Error en cualquier fallo.
 *
 * LIMITACIÓN CONOCIDA (deuda anotada):
 * El flujo invalidación-previos → insert nuevo NO es transaccional.
 * Si el insert falla DESPUÉS de invalidar los previos, los previos quedan
 * vigente=false sin reemplazo. El usuario debe reintentar para tener un
 * vigente nuevo. Caso raro en la práctica; una RPC transaccional resolvería
 * pero es sobreingeniería para esta iteración.
 */
export async function subirAdjunto({ dni, etapa, tipo, file, fechaVencimiento = null }) {
  // 1. Validación de parámetros
  if (!dni) throw new Error('Falta el DNI');
  if (!etapa) throw new Error('Falta la etapa');
  if (!tipo) throw new Error('Falta el tipo de adjunto');
  if (!TIPO_LEGIBLE[tipo]) throw new Error(`Tipo de adjunto desconocido: ${tipo}`);
  if (!file) throw new Error('No se seleccionó ningún archivo');

  // 2. Validación de tamaño y MIME (doble línea de defensa, antes de subir)
  if (file.size > MAX_SIZE) {
    throw new Error(
      `El archivo (${(file.size / 1024 / 1024).toFixed(1)} MB) supera el límite de 10 MB`
    );
  }
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    throw new Error('Formato no permitido. Solo PDF, JPG o PNG');
  }

  // 3. Path en Storage: {dni}/{uuid}.{ext}
  const ext = _ext(file.name);
  const path = `${dni}/${crypto.randomUUID()}.${ext}`;

  // 4. Subida a Storage
  const { error: upErr } = await SUPA.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw new Error(`Error al subir el archivo: ${upErr.message}`);

  // 5. Nombre legible del archivo
  const nombreArchivo = _nombreArchivo(tipo, dni, ext);

  // 6. Invalidar vigentes previos del mismo (dni, tipo) — salvo antecedentes.
  //    Si la UPDATE falla, abortamos: no podemos quedar con 2 vigentes.
  if (tipo !== 'antecedente') {
    const { error: invErr } = await SUPA.from('adjuntos')
      .update({ vigente: false })
      .eq('dni', dni).eq('tipo', tipo)
      .eq('vigente', true).eq('borrado', false);
    if (invErr) {
      throw new Error(`No se pudieron invalidar adjuntos previos: ${invErr.message}`);
    }
  }

  // 7. Insert del registro nuevo (snake_case directo; id lo genera la DB)
  const registro = {
    dni,
    etapa,
    tipo,
    url: path,
    nombre_archivo: nombreArchivo,
    fecha_vencimiento: fechaVencimiento,
    vigente: true,
    subido_por_id: currentUser?.id ?? null,
    subido_por_nombre: currentUser?.nombre ?? '—',
    subido_en: new Date().toISOString(),
    borrado: false,
  };
  const { data, error: insErr } = await SUPA.from('adjuntos')
    .insert(registro).select().single();

  // 8. Rollback best-effort del archivo si falla el insert
  if (insErr) {
    await SUPA.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(`Error al registrar el adjunto: ${insErr.message}`);
  }

  // 9. Devolver en camelCase preservando id (bigserial)
  const r = _toCamel(data);
  r.id = data.id;
  return r;
}

// ========== LISTAR ==========

// Lista los adjuntos vigentes y no borrados de un DNI.
// Filtros opcionales: etapa y/o tipo. Devuelve [] ante error (no rompe la UI).
export async function listarAdjuntos({ dni, etapa, tipo }) {
  if (!dni) return [];
  let q = SUPA.from('adjuntos')
    .select('*')
    .eq('dni', dni)
    .eq('vigente', true)
    .eq('borrado', false);
  if (etapa) q = q.eq('etapa', etapa);
  if (tipo) q = q.eq('tipo', tipo);
  q = q.order('subido_en', { ascending: false });

  const { data, error } = await q;
  if (error) { console.warn('Error al listar adjuntos:', error.message); return []; }
  return (data || []).map(row => {
    const r = _toCamel(row);
    r.id = row.id;
    return r;
  });
}

// ========== URL FIRMADA ==========

// Genera una URL temporal firmada (bucket privado). `url` es el path guardado.
// Devuelve la URL o null ante error. Default 5 minutos.
export async function obtenerUrlFirmada(url, expiraSeg = 300) {
  if (!url) return null;
  const { data, error } = await SUPA.storage
    .from(BUCKET)
    .createSignedUrl(url, expiraSeg);
  if (error) { console.warn('Error al generar URL firmada:', error.message); return null; }
  return data?.signedUrl ?? null;
}

// ========== BORRAR (soft delete) ==========

// Marca un adjunto como borrado (auditoría) sin tocar el archivo físico.
// Devuelve true/false.
export async function borrarAdjunto(adjuntoId) {
  if (!adjuntoId) return false;
  const { error } = await SUPA.from('adjuntos')
    .update({
      borrado: true,
      borrado_por_id: currentUser?.id ?? null,
      borrado_por_nombre: currentUser?.nombre ?? '—',
      borrado_en: new Date().toISOString(),
    })
    .eq('id', adjuntoId);
  if (error) { console.warn('Error al borrar adjunto:', error.message); return false; }
  return true;
}

// ========== RENOMBRAR AL DAR DE ALTA ==========

/**
 * Renombra los adjuntos vigentes de un DNI al confirmar el alta.
 * Actualiza nombre_archivo a "Soc {nroSoc} - {TipoLegible}.{ext}".
 * Decisión C1: NO toca Storage ni el campo url (path interno UUID).
 * Una vez que es socio, el N° de socio es el identificador (sin DNI en el nombre).
 * Lanza Error si alguna UPDATE falla (para que confirmarAlta avise con toast diferenciado).
 */
export async function renombrarAdjuntosPorAlta(dni, nroSoc) {
  if (!dni || !nroSoc) return;
  const adj = await listarAdjuntos({ dni, etapa: 'alta' });
  for (const a of adj) {
    const ext = (a.nombreArchivo || '').split('.').pop() || 'bin';
    const tipoLeg = TIPO_LEGIBLE[a.tipo] || a.tipo;
    const nombreNuevo = `Soc ${nroSoc} - ${tipoLeg}.${ext}`;
    const { error } = await SUPA.from('adjuntos')
      .update({ nombre_archivo: nombreNuevo })
      .eq('id', a.id);
    if (error) throw new Error(`No se pudo renombrar "${tipoLeg}": ${error.message}`);
  }
}
