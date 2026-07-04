import { createClient } from '@supabase/supabase-js';

// Cliente Supabase — sesión persistida (comportamiento default): el login
// sobrevive a un reload, no hay que volver a loguearse hasta cerrar sesión.
export const SUPA = createClient(
  'https://caeqsieiuunqvicfpudu.supabase.co',
  'sb_publishable__SBdO6cSQXYfgR16FrztwA_Cf9sNosd'
);

// Mapa de claves JS → nombres de tabla en Supabase
export const _SM = {
  legajos: 'legajos',
  pedidos: 'pedidos',
  candidatos: 'candidatos',
  psicos: 'psicos',
  preocupacionales: 'preocupacionales',
  documentacionIngreso: 'documentacion_ingreso',
  catAltPendientes: 'cat_alt_pendientes',
  turnos: 'turnos',
  clientes: 'clientes',
  sanciones: 'sanciones',
  casosLegales: 'casos_legales',
  enfermos: 'enfermos',
  reasignaciones: 'reasignaciones',
  feriados: 'feriados',
  planillasAdelantos: 'planillas_adelantos',
  prestamos: 'prestamos',
  grillasLiq: 'grillas_liq',
  monotributos: 'monotributos',
  uniformes: 'uniformes',
  retenciones: 'retenciones',
  paritarias: 'paritarias',
  retenes: 'retenes',
  sugerencias: 'sugerencias',
  personalRrhh: 'personal_rrhh',
  adjuntos: 'adjuntos',
};

// camelCase → snake_case para guardar en Supabase
export function _toSnake(obj) {
  const m = {
    nroLegajo: 'nro_legajo', estadoLegal: 'estado_legal', estadoMedico: 'estado_medico',
    fechaBaja: 'fecha_baja', fechaReincorp: 'fecha_reincorp', estadoCivil: 'estado_civil',
    legajoAnteriorNro: 'legajo_anterior_nro',
    periodoPrueba: 'periodo_prueba', fechaIngresoPrueba: 'fecha_ingreso_prueba',
    adjuntosLegal: 'adjuntos_legal', adjuntosMedico: 'adjuntos_medico',
    pctAumento: 'pct_aumento', fechaHomologacion: 'fecha_homologacion',
    estadoAplicacion: 'estado_aplicacion', razonSocial: 'razon_social',
    estadoPago: 'estado_pago', servicioOrigen: 'servicio_origen',
    servicioDestino: 'servicio_destino', obraSocial: 'obra_social', formaPago: 'forma_pago',
    fechaInicio: 'fecha_inicio', ultimoContacto: 'ultimo_contacto',
    candidatoId: 'candidato_id', psicoId: 'psico_id', fechaTurno: 'fecha_turno',
    preocupId: 'preocup_id',
    antecResultado: 'antec_resultado',
    antecFecha: 'antec_fecha',
    antecVencimiento: 'antec_vencimiento',
    antecExcepcion: 'antec_excepcion',
    antecMotivoExcepcion: 'antec_motivo_excepcion',
    libretaAplica: 'libreta_aplica',
    libretaZona: 'libreta_zona',
    libretaVencimiento: 'libreta_vencimiento',
    cursoTiene: 'curso_tiene',
    cursoVencimiento: 'curso_vencimiento',
    libretaSanitaria: 'libreta_sanitaria', requiereAntecedentes: 'requiere_antecedentes',
    requiereLibreta: 'requiere_libreta', fechaAprobacion: 'fecha_aprobacion',
    motivoRechazo: 'motivo_rechazo', fechaRechazo: 'fecha_rechazo',
    obsEntrevista: 'obs_entrevista',
    fecNac: 'fec_nac', fechaCita: 'fecha_cita', horaCita: 'hora_cita',
    nombreReferido: 'nombre_referido', rrhhId: 'rrhh_id',
    anuladoPor: 'anulado_por', anuladoFecha: 'anulado_fecha', creadoPor: 'creado_por',
    cuentaBancaria: 'cuenta_bancaria',
    // Monotributos / Uniformes / Retenciones
    nroSocio: 'nro_socio', fechaAlta: 'fecha_alta', historialCategorias: 'historial_categorias',
    // Tabla adjuntos
    nombreArchivo: 'nombre_archivo',
    fechaVencimiento: 'fecha_vencimiento',
    subidoPorId: 'subido_por_id',
    subidoPorNombre: 'subido_por_nombre',
    subidoEn: 'subido_en',
    borradoPorId: 'borrado_por_id',
    borradoPorNombre: 'borrado_por_nombre',
    borradoEn: 'borrado_en',
  };
  const r = {};
  for (const [k, v] of Object.entries(obj)) {
    r[m[k] || k] = (v && typeof v === 'object' && !Array.isArray(v)) ? _toSnake(v) : v;
  }
  // Sanitizar campos con tipos conflictivos
  if ('homologada' in r) r.homologada = r.homologada === true || r.homologada === 'true';
  if ('jubilado' in r) r.jubilado = r.jubilado === true || r.jubilado === 'true';
  if ('activo' in r) r.activo = r.activo === true || r.activo === 'true';
  if ('requiere_antecedentes' in r) r.requiere_antecedentes = r.requiere_antecedentes === true || r.requiere_antecedentes === 'true';
  if ('requiere_libreta' in r) r.requiere_libreta = r.requiere_libreta === true || r.requiere_libreta === 'true';
  if ('antec_excepcion' in r) r.antec_excepcion = r.antec_excepcion === true || r.antec_excepcion === 'true';
  if ('libreta_aplica' in r) r.libreta_aplica = r.libreta_aplica === true || r.libreta_aplica === 'true';
  if ('curso_tiene' in r) r.curso_tiene = r.curso_tiene === true || r.curso_tiene === 'true';
  return r;
}

// snake_case → camelCase para leer de Supabase
export function _toCamel(obj) {
  const m = {
    nro_legajo: 'nroLegajo', estado_legal: 'estadoLegal', estado_medico: 'estadoMedico',
    fecha_baja: 'fechaBaja', fecha_reincorp: 'fechaReincorp', estado_civil: 'estadoCivil',
    legajo_anterior_nro: 'legajoAnteriorNro',
    periodo_prueba: 'periodoPrueba', fecha_ingreso_prueba: 'fechaIngresoPrueba',
    adjuntos_legal: 'adjuntosLegal', adjuntos_medico: 'adjuntosMedico',
    pct_aumento: 'pctAumento', fecha_homologacion: 'fechaHomologacion',
    estado_aplicacion: 'estadoAplicacion', razon_social: 'razonSocial',
    estado_pago: 'estadoPago', servicio_origen: 'servicioOrigen',
    servicio_destino: 'servicioDestino', obra_social: 'obraSocial', forma_pago: 'formaPago',
    fecha_inicio: 'fechaInicio', ultimo_contacto: 'ultimoContacto',
    candidato_id: 'candidatoId', psico_id: 'psicoId', fecha_turno: 'fechaTurno',
    preocup_id: 'preocupId',
    antec_resultado: 'antecResultado',
    antec_fecha: 'antecFecha',
    antec_vencimiento: 'antecVencimiento',
    antec_excepcion: 'antecExcepcion',
    antec_motivo_excepcion: 'antecMotivoExcepcion',
    libreta_aplica: 'libretaAplica',
    libreta_zona: 'libretaZona',
    libreta_vencimiento: 'libretaVencimiento',
    curso_tiene: 'cursoTiene',
    curso_vencimiento: 'cursoVencimiento',
    libreta_sanitaria: 'libretaSanitaria', requiere_antecedentes: 'requiereAntecedentes',
    requiere_libreta: 'requiereLibreta', fecha_aprobacion: 'fechaAprobacion',
    motivo_rechazo: 'motivoRechazo', fecha_rechazo: 'fechaRechazo',
    obs_entrevista: 'obsEntrevista',
    fec_nac: 'fecNac', fecha_cita: 'fechaCita', hora_cita: 'horaCita',
    nombre_referido: 'nombreReferido', rrhh_id: 'rrhhId',
    anulado_por: 'anuladoPor', anulado_fecha: 'anuladoFecha', creado_por: 'creadoPor',
    cuenta_bancaria: 'cuentaBancaria',
    id_local: 'id_local', created_at: 'created_at', updated_at: 'updated_at',
    // Monotributos / Uniformes / Retenciones
    nro_socio: 'nroSocio', fecha_alta: 'fechaAlta', historial_categorias: 'historialCategorias',
    // Tabla adjuntos
    nombre_archivo: 'nombreArchivo',
    fecha_vencimiento: 'fechaVencimiento',
    subido_por_id: 'subidoPorId',
    subido_por_nombre: 'subidoPorNombre',
    subido_en: 'subidoEn',
    borrado_por_id: 'borradoPorId',
    borrado_por_nombre: 'borradoPorNombre',
    borrado_en: 'borradoEn',
  };
  const r = {};
  for (const [k, v] of Object.entries(obj)) {
    // Ignorar campos internos de Supabase que el sistema no usa
    if (['id', 'created_at', 'updated_at'].includes(k)) continue;
    const camelKey = m[k] || k;
    r[camelKey] = (v && typeof v === 'object' && !Array.isArray(v)) ? _toCamel(v) : v;
  }
  // Restaurar id desde id_local para que los objetos cargados de Supabase
  // tengan la misma propiedad que los creados localmente con Date.now()
  if (r.id_local && !r.id) r.id = r.id_local;
  return r;
}

// Guardar un registro en Supabase (upsert por id_local)
export async function supaSync(dbKey, obj) {
  const tabla = _SM[dbKey];
  if (!tabla || !obj) return;
  try {
    const rawId = obj.nro || obj.id || Date.now();
    const idLocal = String(rawId).slice(-9);
    const raw = { ...obj };
    delete raw.id;
    delete raw.pass;
    const d = _toSnake(raw);
    d.id_local = idLocal;
    const { data: existe } = await SUPA.from(tabla).select('id').eq('id_local', idLocal).maybeSingle();
    if (existe) {
      const { error } = await SUPA.from(tabla).update(d).eq('id_local', idLocal);
      if (error) console.warn('supaSync update error:', tabla, error.message);
      else console.log('✅ Actualizado en Supabase:', tabla, idLocal);
    } else {
      const { error } = await SUPA.from(tabla).insert(d);
      if (error) console.warn('supaSync insert error:', tabla, error.message);
      else console.log('✅ Guardado en Supabase:', tabla, idLocal);
    }
  } catch (e) {
    console.warn('supaSync error:', tabla, e.message);
  }
}

// Eliminar un registro por id_local
export async function supaDel(dbKey, idLocal) {
  const tabla = _SM[dbKey];
  if (!tabla) return;
  try {
    await SUPA.from(tabla).delete().eq('id_local', String(idLocal));
  } catch (e) {
    console.warn('supaDel error:', e.message);
  }
}

// Cargar todos los datos al iniciar
// Recibe DB (estado global) y toast (notificación) para no depender de globales
export async function supaInit(DB, toast) {
  try {
    let cargados = 0;
    const pedidos = Object.entries(_SM).map(([k, t]) =>
      SUPA.from(t).select('*').order('created_at', { ascending: true })
        .then(r => ({ k, t, data: r.data, error: r.error }))
        .catch(e => ({ k, t, data: null, error: e }))
    );
    const resultados = await Promise.all(pedidos);
    for (const { k, t, data, error } of resultados) {
      if (error) { console.warn('supaInit error tabla:', t, error.message); continue; }
      if (data && data.length > 0) {
        DB[k] = data.map(row => _toCamel(row));
        cargados += data.length;
        console.log('☁️ Cargado:', k, data.length, 'registros');
      }
    }
    if (cargados > 0) toast('☁️ ' + cargados + ' registros cargados desde la nube');
    else toast('☁️ Conectado a Supabase — sin datos aún');
  } catch (e) {
    console.warn('supaInit error:', e.message);
    toast('⚠️ Modo offline — usando datos locales');
  }
}

// Chequeo liviano de solo candidatos + turnos — usado para detectar
// postulaciones nuevas del formulario público sin recargar toda la app.
export async function fetchCandidatosYTurnos() {
  const [rCand, rTurnos] = await Promise.all([
    SUPA.from('candidatos').select('*').order('created_at', { ascending: true }),
    SUPA.from('turnos').select('*').order('created_at', { ascending: true }),
  ]);
  if (rCand.error || rTurnos.error) return null;
  return {
    candidatos: (rCand.data || []).map(row => _toCamel(row)),
    turnos: (rTurnos.data || []).map(row => _toCamel(row)),
  };
}
