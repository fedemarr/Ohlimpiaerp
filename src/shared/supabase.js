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
  // Config persistida de motivos/aprobadores (objetos {id, nombre|cargo, anulado}).
  // OJO: legacy.js todavía usa DB.motivosReasignacion/DB.aprobadoresReas como
  // arrays planos de strings (config-usuarios y gestión de precios los leen
  // así) — esas claves NO se tocan acá; el módulo Reasignaciones sincroniza
  // ambas vistas (ver sincronizarConfigReasignaciones en reasignaciones.js).
  motivosReasignacionCfg: 'motivos_reasignacion',
  aprobadoresReasCfg: 'aprobadores_reasignacion',
  capacitaciones: 'capacitaciones',
  materialesCapacitacion: 'materiales_capacitacion',
  preguntasEvaluacion: 'preguntas_evaluacion',
  plantillasEvaluacion: 'plantillas_evaluacion',
  evaluacionesEnviadas: 'evaluaciones_enviadas',
  respuestasEvaluacion: 'respuestas_evaluacion',
  feriados: 'feriados',
  planillasAdelantos: 'planillas_adelantos',
  prestamos: 'prestamos',
  grillasLiq: 'grillas_liq',
  monotributos: 'monotributos',
  uniformes: 'uniformes',
  retenciones: 'retenciones',
  reglasCompetencia: 'reglas_competencia',
  reglasCompetenciaVersiones: 'reglas_competencia_versiones',
  eventosPuntos: 'eventos_puntos',
  movimientosPuntos: 'movimientos_puntos',
  premiosCompetenciaAnual: 'premios_competencia_anual',
  notificacionesNoParticipan: 'notificaciones_no_participan',
  aniosCompetencia: 'anios_competencia',
  sancionesDisciplinarias: 'sanciones_disciplinarias',
  sancionEventos: 'sancion_eventos',
  sancionDescargos: 'sancion_descargos',
  catalogoInfracciones: 'catalogo_infracciones',
  catalogoInfraccionesVersiones: 'catalogo_infracciones_versiones',
  categoriasBase: 'categorias_base',
  valoresHoraCategoria: 'valores_hora_categoria',
  plusAdicionales: 'plus_adicionales',
  valoresPlus: 'valores_plus',
  novedadesCasoLegal: 'novedades_caso_legal',
  casosLegalesAdjuntos: 'casos_legales_adjuntos',
  paritarias: 'paritarias',
  retenes: 'retenes',
  sugerencias: 'sugerencias',
  personalRrhh: 'personal_rrhh',
  adjuntos: 'adjuntos',
  tickets: 'tickets',
  vacaciones: 'vacaciones',
  notificacionesSistema: 'notificaciones_sistema',
  descansos: 'descansos',
  pedidosUniformes: 'pedidos_uniformes',
  pedidoUniformePrendas: 'pedido_uniforme_prendas',
  pedidoUniformeEventos: 'pedido_uniforme_eventos',
  preciosUniformes: 'precios_uniformes',
  descuentosUniformePendientes: 'descuentos_uniforme_pendientes',
  devolucionesPorBaja: 'devoluciones_por_baja',
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
    // Reasignaciones (v021)
    legajoIdLocal: 'legajo_id_local', nombreAsociado: 'nombre_asociado',
    funcionOrigen: 'funcion_origen', zonaOrigen: 'zona_origen',
    funcionDestino: 'funcion_destino', zonaDestino: 'zona_destino',
    fechaSolicitud: 'fecha_solicitud', fechaEfectiva: 'fecha_efectiva',
    fechaEjecucion: 'fecha_ejecucion', elevadoPor: 'elevado_por',
    originadaPor: 'originada_por', pedidoVinculadoIdLocal: 'pedido_vinculado_id_local',
    requiereAltura: 'requiere_altura', requierePolizaEsp: 'requiere_poliza_esp',
    aprobadoPor: 'aprobado_por', editadoPor: 'editado_por', editadoEn: 'editado_en',
    fechaAnulacion: 'fecha_anulacion', historialMovimientos: 'historial_movimientos',
    // Capacitaciones (v022)
    metodoEvaluacion: 'metodo_evaluacion', adjuntoIdLocal: 'adjunto_id_local',
    materialesIds: 'materiales_ids', coordinadoAsociado: 'coordinado_asociado',
    coordinadoSupervisor: 'coordinado_supervisor', tipoCapacitacion: 'tipo_capacitacion',
    archivoPath: 'archivo_path', requiereEval: 'requiere_eval',
    // Evaluaciones (v023)
    opcionA: 'opcion_a', opcionB: 'opcion_b', opcionC: 'opcion_c', opcionD: 'opcion_d',
    preguntasIds: 'preguntas_ids', notaMinima: 'nota_minima', plazoHoras: 'plazo_horas',
    capacitacionIdLocal: 'capacitacion_id_local', plantillaIdLocal: 'plantilla_id_local',
    fechaEnvio: 'fecha_envio', fechaLimite: 'fecha_limite', fechaRespuesta: 'fecha_respuesta',
    evaluacionIdLocal: 'evaluacion_id_local', preguntaIdLocal: 'pregunta_id_local',
    // Monotributos / Uniformes / Retenciones
    nroSocio: 'nro_socio', fechaAlta: 'fecha_alta', historialCategorias: 'historial_categorias',
    fechaLiberacion: 'fecha_liberacion',
    // Competencia Anual (v025)
    descuentoAusente: 'descuento_ausente',
    // Tabla adjuntos
    nombreArchivo: 'nombre_archivo',
    fechaVencimiento: 'fecha_vencimiento',
    subidoPorId: 'subido_por_id',
    subidoPorNombre: 'subido_por_nombre',
    subidoEn: 'subido_en',
    borradoPorId: 'borrado_por_id',
    borradoPorNombre: 'borrado_por_nombre',
    borradoEn: 'borrado_en',
    // Tickets (v026 — perfil DEVELOPER)
    sugerenciaId: 'sugerencia_id', respuestaDev: 'respuesta_dev', resueltoAt: 'resuelto_at',
    // Vacaciones (v027) + campos nuevos de Legajos (v028)
    fechaDesde: 'fecha_desde', fechaHasta: 'fecha_hasta', diasSolicitados: 'dias_solicitados',
    fechaRetorno: 'fecha_retorno',
    reemplazanteLegajoIdLocal: 'reemplazante_legajo_id_local', reemplazanteNombre: 'reemplazante_nombre',
    descripcionReemplazo: 'descripcion_reemplazo',
    aprobadoPorGerente: 'aprobado_por_gerente', fechaAprobacionGerente: 'fecha_aprobacion_gerente',
    motivoRechazoGerente: 'motivo_rechazo_gerente',
    votoPresidente: 'voto_presidente', votoPresidenteFecha: 'voto_presidente_fecha', votoPresidenteMotivo: 'voto_presidente_motivo',
    votoTesorero: 'voto_tesorero', votoTesoreroFecha: 'voto_tesorero_fecha', votoTesoreroMotivo: 'voto_tesorero_motivo',
    votoSecretario: 'voto_secretario', votoSecretarioFecha: 'voto_secretario_fecha', votoSecretarioMotivo: 'voto_secretario_motivo',
    fechaAprobacionConsejo: 'fecha_aprobacion_consejo', fechaRechazoConsejo: 'fecha_rechazo_consejo',
    anuladoPorNombre: 'anulado_por_nombre', motivoAnulacion: 'motivo_anulacion',
    solicitudAnulacionMotivo: 'solicitud_anulacion_motivo',
    votoAnulPresidente: 'voto_anul_presidente', votoAnulTesorero: 'voto_anul_tesorero', votoAnulSecretario: 'voto_anul_secretario',
    diasVacacionesAnuales: 'dias_vacaciones_anuales', jefeDirectoLegajoIdLocal: 'jefe_directo_legajo_id_local',
    // Notificaciones del sistema (v029)
    entidadTipo: 'entidad_tipo', entidadIdLocal: 'entidad_id_local',
    destinatarioNombre: 'destinatario_nombre', leidaEn: 'leida_en',
    // Descansos (v030)
    nombreOperario: 'nombre_operario', supervisorSolicitante: 'supervisor_solicitante',
    duracionDias: 'duracion_dias',
    aprobadoPorOperaciones: 'aprobado_por_operaciones', fechaAprobacionOperaciones: 'fecha_aprobacion_operaciones',
    motivoRechazoOperaciones: 'motivo_rechazo_operaciones',
    aprobadoPorRrhh: 'aprobado_por_rrhh', fechaAprobacionRrhh: 'fecha_aprobacion_rrhh',
    motivoRechazoRrhh: 'motivo_rechazo_rrhh',
    anuladoPor: 'anulado_por', pagaJornadaCompleta: 'paga_jornada_completa',
    // Vacaciones v1.1 (v031) — excepción de preaviso corto
    requiereAutorizacionPreavisoCorto: 'requiere_autorizacion_preaviso_corto',
    motivoExcepcionPreaviso: 'motivo_excepcion_preaviso',
    autorizadaExcepcionPor: 'autorizada_excepcion_por',
    fechaAutorizacionExcepcion: 'fecha_autorizacion_excepcion',
    // Uniformes v2 (v032)
    supervisorAsignado: 'supervisor_asignado', solicitadoPor: 'solicitado_por',
    conDescuento: 'con_descuento', autorizadoPorRrhh: 'autorizado_por_rrhh',
    fechaAutorizacion: 'fecha_autorizacion',
    fechaRecibidoLogistica: 'fecha_recibido_logistica', logisticaRecibePor: 'logistica_recibe_por',
    fechaEnviadoPorLogistica: 'fecha_enviado_por_logistica', logisticaEnviaPor: 'logistica_envia_por',
    fechaRecibidoPorRrhh: 'fecha_recibido_por_rrhh', rrhhRecibePor: 'rrhh_recibe_por',
    fechaRetiradoSupervisor: 'fecha_retirado_supervisor', rrhhEntregaASupervisorPor: 'rrhh_entrega_a_supervisor_por',
    fechaConfirmadoPorSupervisor: 'fecha_confirmado_por_supervisor', supervisorConfirmaPor: 'supervisor_confirma_por',
    fechaEntregaOperario: 'fecha_entrega_operario', supervisorEntregaPor: 'supervisor_entrega_por',
    constanciaFirmadaAdjuntoId: 'constancia_firmada_adjunto_id',
    fechaDevolucionSupervisor: 'fecha_devolucion_supervisor', supervisorDevuelvePor: 'supervisor_devuelve_por',
    fechaCierre: 'fecha_cierre', rrhhCierraPor: 'rrhh_cierra_por',
    fechaCancelacion: 'fecha_cancelacion', canceladoPor: 'cancelado_por', motivoCancelacion: 'motivo_cancelacion',
    fechaVencido: 'fecha_vencido', vencidoConstancia: 'vencido_constancia', vencidoUniformeViejo: 'vencido_uniforme_viejo',
    fechaDescuentoIncumplimiento: 'fecha_descuento_incumplimiento', descuentoAplicadoPor: 'descuento_aplicado_por',
    descuentoIncumplimientoMotivo: 'descuento_incumplimiento_motivo', descuentoIncumplimientoMonto: 'descuento_incumplimiento_monto',
    constanciaPolicialAdjuntoId: 'constancia_policial_adjunto_id',
    faltoPrendaKitDevuelto: 'falto_prenda_kit_devuelto', prendasFaltantesDevolucion: 'prendas_faltantes_devolucion',
    alertaHandshakeEnviada: 'alerta_handshake_enviada',
    pedidoIdLocal: 'pedido_id_local', precioUnitarioCongelado: 'precio_unitario_congelado',
    precioIdLocalReferencia: 'precio_id_local_referencia',
    estadoDesde: 'estado_desde', estadoHasta: 'estado_hasta', ejecutadoPor: 'ejecutado_por', ejecutadoEn: 'ejecutado_en',
    vigenciaDesde: 'vigencia_desde', vigenciaHasta: 'vigencia_hasta', cargadoPor: 'cargado_por', motivoCarga: 'motivo_carga',
    montoTotal: 'monto_total', cuotasTotales: 'cuotas_totales', cuotasCobradas: 'cuotas_cobradas', montoCuota: 'monto_cuota',
    fechaGenerado: 'fecha_generado', fechaPrimeraCuota: 'fecha_primera_cuota', fechaUltimaCuota: 'fecha_ultima_cuota',
    motivoGeneracion: 'motivo_generacion',
    fechaGenerada: 'fecha_generada', prendasADevolver: 'prendas_a_devolver',
    fechaConfirmada: 'fecha_confirmada', confirmadaPor: 'confirmada_por',
    prendasDevueltas: 'prendas_devueltas', montoDescuento: 'monto_descuento',
    tallesUniforme: 'talles_uniforme',
    // Competencia Anual v2 (v033)
    moduloOrigen: 'modulo_origen', reglaIdLocal: 'regla_id_local',
    puntosIndividual: 'puntos_individual', puntosPorCompanero: 'puntos_por_companero', puntosSupervisor: 'puntos_supervisor',
    reglaVersionIdLocal: 'regla_version_id_local', operarioIdLocal: 'operario_id_local',
    servicioAlMomento: 'servicio_al_momento', supervisorAlMomento: 'supervisor_al_momento',
    fechaEvento: 'fecha_evento', referenciaExterna: 'referencia_externa',
    fechaReversion: 'fecha_reversion', revertidoPor: 'revertido_por', motivoReversion: 'motivo_reversion',
    eventoIdLocal: 'evento_id_local', destinatarioIdLocal: 'destinatario_id_local',
    nombreDestinatario: 'nombre_destinatario', tipoDestinatario: 'tipo_destinatario',
    puntosCongelados: 'puntos_congelados', fechaMovimiento: 'fecha_movimiento', anioCompetencia: 'anio_competencia',
    ganadorIdLocal: 'ganador_id_local', nombreGanador: 'nombre_ganador', puntosFinales: 'puntos_finales',
    compartidoCon: 'compartido_con', fechaEntrega: 'fecha_entrega', entregadoPor: 'entregado_por',
    descripcionPremio: 'descripcion_premio', nivelRiesgo: 'nivel_riesgo', destinatarioTipo: 'destinatario_tipo',
    fechaEnviado: 'fecha_enviado', enviadoPor: 'enviado_por',
    fechaCierre: 'fecha_cierre', cerradoPor: 'cerrado_por', observacionesCierre: 'observaciones_cierre',
    // Sanciones v1 (v034)
    nombreSancionado: 'nombre_sancionado', tipoSancionado: 'tipo_sancionado', areaAdministrativa: 'area_administrativa',
    nombreNivel: 'nombre_nivel', infraccionIdLocal: 'infraccion_id_local', nombreInfraccion: 'nombre_infraccion',
    categoriaInfraccion: 'categoria_infraccion', fechaHecho: 'fecha_hecho', fechaDeteccion: 'fecha_deteccion',
    descripcionHecho: 'descripcion_hecho', propuestaPorLegajo: 'propuesta_por_legajo', propuestaPorRol: 'propuesta_por_rol',
    fechaIniciacion: 'fecha_iniciacion', fechaAprobacion: 'fecha_aprobacion',
    aprobadaPorLegajo: 'aprobada_por_legajo', aprobadaPorRol: 'aprobada_por_rol',
    aprobacionSecundariaLegajo: 'aprobacion_secundaria_legajo', aprobacionSecundariaRol: 'aprobacion_secundaria_rol',
    fechaAprobacionSecundaria: 'fecha_aprobacion_secundaria',
    descargoRequerido: 'descargo_requerido', descargoSolicitadoEn: 'descargo_solicitado_en',
    fechaLimiteDescargo: 'fecha_limite_descargo', descargoIdLocal: 'descargo_id_local',
    sumarioIdLocal: 'sumario_id_local', votosFavor: 'votos_favor', votosContra: 'votos_contra', votosAbstencion: 'votos_abstencion',
    fechaResolucionConsejo: 'fecha_resolucion_consejo', fechaNotificacionAsociado: 'fecha_notificacion_asociado',
    notificacionMetodo: 'notificacion_metodo', suspensionFechaDesde: 'suspension_fecha_desde', suspensionFechaHasta: 'suspension_fecha_hasta',
    suspensionConGoce: 'suspension_con_goce', medidaCautelar: 'medida_cautelar', medidaCautelarMotivo: 'medida_cautelar_motivo',
    medidaCautelarDesde: 'medida_cautelar_desde', apelacionIdLocal: 'apelacion_id_local',
    sancionRevocadaPorApelacion: 'sancion_revocada_por_apelacion', fechaRevocacion: 'fecha_revocacion',
    eventoCompetenciaIdLocal: 'evento_competencia_id_local', fechaAnulacion: 'fecha_anulacion',
    anuladaPor: 'anulada_por', motivoAnulacion: 'motivo_anulacion',
    sancionIdLocal: 'sancion_id_local', estadoDesde: 'estado_desde', estadoHasta: 'estado_hasta',
    ejecutadoPor: 'ejecutado_por', ejecutadoRol: 'ejecutado_rol', ejecutadoEn: 'ejecutado_en',
    fechaPresentacion: 'fecha_presentacion', registradoPor: 'registrado_por',
    sancionSugeridaPrimeraVez: 'sancion_sugerida_primera_vez', sancionSugeridaReiteracion: 'sancion_sugerida_reiteracion',
    // Categorías v1 (v035)
    esReten: 'es_reten', categoriaIdLocal: 'categoria_id_local', servicioNombre: 'servicio_nombre',
    valorHora: 'valor_hora', plusIdLocal: 'plus_id_local', valorAdicional: 'valor_adicional',
    // Situaciones Legales v1.1 (v036)
    abogadoCooperativa: 'abogado_cooperativa', estudioCooperativa: 'estudio_cooperativa',
    supervisorActual: 'supervisor_actual', supervisorAlAlta: 'supervisor_al_alta',
    tipoReclamo: 'tipo_reclamo', tipoCliente: 'tipo_cliente', montoReclamado: 'monto_reclamado',
    relacionOtrosCasos: 'relacion_otros_casos', fechaProximaInstancia: 'fecha_proxima_instancia',
    montoFinal: 'monto_final',
    casoIdLocal: 'caso_id_local', novedadIdLocal: 'novedad_id_local',
    tipoEvento: 'tipo_evento', cargadaPor: 'cargada_por', cargadaEn: 'cargada_en',
    tipoMime: 'tipo_mime', subidoPor: 'subido_por',
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
    // Reasignaciones (v021)
    legajo_id_local: 'legajoIdLocal', nombre_asociado: 'nombreAsociado',
    funcion_origen: 'funcionOrigen', zona_origen: 'zonaOrigen',
    funcion_destino: 'funcionDestino', zona_destino: 'zonaDestino',
    fecha_solicitud: 'fechaSolicitud', fecha_efectiva: 'fechaEfectiva',
    fecha_ejecucion: 'fechaEjecucion', elevado_por: 'elevadoPor',
    originada_por: 'originadaPor', pedido_vinculado_id_local: 'pedidoVinculadoIdLocal',
    requiere_altura: 'requiereAltura', requiere_poliza_esp: 'requierePolizaEsp',
    aprobado_por: 'aprobadoPor', editado_por: 'editadoPor', editado_en: 'editadoEn',
    fecha_anulacion: 'fechaAnulacion', historial_movimientos: 'historialMovimientos',
    // Capacitaciones (v022)
    metodo_evaluacion: 'metodoEvaluacion', adjunto_id_local: 'adjuntoIdLocal',
    materiales_ids: 'materialesIds', coordinado_asociado: 'coordinadoAsociado',
    coordinado_supervisor: 'coordinadoSupervisor', tipo_capacitacion: 'tipoCapacitacion',
    archivo_path: 'archivoPath', requiere_eval: 'requiereEval',
    id_local: 'id_local', created_at: 'created_at', updated_at: 'updated_at',
    // Evaluaciones (v023)
    opcion_a: 'opcionA', opcion_b: 'opcionB', opcion_c: 'opcionC', opcion_d: 'opcionD',
    preguntas_ids: 'preguntasIds', nota_minima: 'notaMinima', plazo_horas: 'plazoHoras',
    capacitacion_id_local: 'capacitacionIdLocal', plantilla_id_local: 'plantillaIdLocal',
    fecha_envio: 'fechaEnvio', fecha_limite: 'fechaLimite', fecha_respuesta: 'fechaRespuesta',
    evaluacion_id_local: 'evaluacionIdLocal', pregunta_id_local: 'preguntaIdLocal',
    // Monotributos / Uniformes / Retenciones
    nro_socio: 'nroSocio', fecha_alta: 'fechaAlta', historial_categorias: 'historialCategorias',
    fecha_liberacion: 'fechaLiberacion',
    // Competencia Anual (v025)
    descuento_ausente: 'descuentoAusente',
    // Tabla adjuntos
    nombre_archivo: 'nombreArchivo',
    fecha_vencimiento: 'fechaVencimiento',
    subido_por_id: 'subidoPorId',
    subido_por_nombre: 'subidoPorNombre',
    subido_en: 'subidoEn',
    borrado_por_id: 'borradoPorId',
    borrado_por_nombre: 'borradoPorNombre',
    borrado_en: 'borradoEn',
    // Tickets (v026 — perfil DEVELOPER)
    sugerencia_id: 'sugerenciaId', respuesta_dev: 'respuestaDev', resuelto_at: 'resueltoAt',
    // Vacaciones (v027) + campos nuevos de Legajos (v028)
    fecha_desde: 'fechaDesde', fecha_hasta: 'fechaHasta', dias_solicitados: 'diasSolicitados',
    fecha_retorno: 'fechaRetorno',
    reemplazante_legajo_id_local: 'reemplazanteLegajoIdLocal', reemplazante_nombre: 'reemplazanteNombre',
    descripcion_reemplazo: 'descripcionReemplazo',
    aprobado_por_gerente: 'aprobadoPorGerente', fecha_aprobacion_gerente: 'fechaAprobacionGerente',
    motivo_rechazo_gerente: 'motivoRechazoGerente',
    voto_presidente: 'votoPresidente', voto_presidente_fecha: 'votoPresidenteFecha', voto_presidente_motivo: 'votoPresidenteMotivo',
    voto_tesorero: 'votoTesorero', voto_tesorero_fecha: 'votoTesoreroFecha', voto_tesorero_motivo: 'votoTesoreroMotivo',
    voto_secretario: 'votoSecretario', voto_secretario_fecha: 'votoSecretarioFecha', voto_secretario_motivo: 'votoSecretarioMotivo',
    fecha_aprobacion_consejo: 'fechaAprobacionConsejo', fecha_rechazo_consejo: 'fechaRechazoConsejo',
    anulado_por_nombre: 'anuladoPorNombre', motivo_anulacion: 'motivoAnulacion',
    solicitud_anulacion_motivo: 'solicitudAnulacionMotivo',
    voto_anul_presidente: 'votoAnulPresidente', voto_anul_tesorero: 'votoAnulTesorero', voto_anul_secretario: 'votoAnulSecretario',
    dias_vacaciones_anuales: 'diasVacacionesAnuales', jefe_directo_legajo_id_local: 'jefeDirectoLegajoIdLocal',
    // Notificaciones del sistema (v029)
    entidad_tipo: 'entidadTipo', entidad_id_local: 'entidadIdLocal',
    destinatario_nombre: 'destinatarioNombre', leida_en: 'leidaEn',
    // Descansos (v030)
    nombre_operario: 'nombreOperario', supervisor_solicitante: 'supervisorSolicitante',
    duracion_dias: 'duracionDias',
    aprobado_por_operaciones: 'aprobadoPorOperaciones', fecha_aprobacion_operaciones: 'fechaAprobacionOperaciones',
    motivo_rechazo_operaciones: 'motivoRechazoOperaciones',
    aprobado_por_rrhh: 'aprobadoPorRrhh', fecha_aprobacion_rrhh: 'fechaAprobacionRrhh',
    motivo_rechazo_rrhh: 'motivoRechazoRrhh',
    anulado_por: 'anuladoPor', paga_jornada_completa: 'pagaJornadaCompleta',
    // Vacaciones v1.1 (v031) — excepción de preaviso corto
    requiere_autorizacion_preaviso_corto: 'requiereAutorizacionPreavisoCorto',
    motivo_excepcion_preaviso: 'motivoExcepcionPreaviso',
    autorizada_excepcion_por: 'autorizadaExcepcionPor',
    fecha_autorizacion_excepcion: 'fechaAutorizacionExcepcion',
    // Uniformes v2 (v032)
    supervisor_asignado: 'supervisorAsignado', solicitado_por: 'solicitadoPor',
    con_descuento: 'conDescuento', autorizado_por_rrhh: 'autorizadoPorRrhh',
    fecha_autorizacion: 'fechaAutorizacion',
    fecha_recibido_logistica: 'fechaRecibidoLogistica', logistica_recibe_por: 'logisticaRecibePor',
    fecha_enviado_por_logistica: 'fechaEnviadoPorLogistica', logistica_envia_por: 'logisticaEnviaPor',
    fecha_recibido_por_rrhh: 'fechaRecibidoPorRrhh', rrhh_recibe_por: 'rrhhRecibePor',
    fecha_retirado_supervisor: 'fechaRetiradoSupervisor', rrhh_entrega_a_supervisor_por: 'rrhhEntregaASupervisorPor',
    fecha_confirmado_por_supervisor: 'fechaConfirmadoPorSupervisor', supervisor_confirma_por: 'supervisorConfirmaPor',
    fecha_entrega_operario: 'fechaEntregaOperario', supervisor_entrega_por: 'supervisorEntregaPor',
    constancia_firmada_adjunto_id: 'constanciaFirmadaAdjuntoId',
    fecha_devolucion_supervisor: 'fechaDevolucionSupervisor', supervisor_devuelve_por: 'supervisorDevuelvePor',
    fecha_cierre: 'fechaCierre', rrhh_cierra_por: 'rrhhCierraPor',
    fecha_cancelacion: 'fechaCancelacion', cancelado_por: 'canceladoPor', motivo_cancelacion: 'motivoCancelacion',
    fecha_vencido: 'fechaVencido', vencido_constancia: 'vencidoConstancia', vencido_uniforme_viejo: 'vencidoUniformeViejo',
    fecha_descuento_incumplimiento: 'fechaDescuentoIncumplimiento', descuento_aplicado_por: 'descuentoAplicadoPor',
    descuento_incumplimiento_motivo: 'descuentoIncumplimientoMotivo', descuento_incumplimiento_monto: 'descuentoIncumplimientoMonto',
    constancia_policial_adjunto_id: 'constanciaPolicialAdjuntoId',
    falto_prenda_kit_devuelto: 'faltoPrendaKitDevuelto', prendas_faltantes_devolucion: 'prendasFaltantesDevolucion',
    alerta_handshake_enviada: 'alertaHandshakeEnviada',
    pedido_id_local: 'pedidoIdLocal', precio_unitario_congelado: 'precioUnitarioCongelado',
    precio_id_local_referencia: 'precioIdLocalReferencia',
    estado_desde: 'estadoDesde', estado_hasta: 'estadoHasta', ejecutado_por: 'ejecutadoPor', ejecutado_en: 'ejecutadoEn',
    vigencia_desde: 'vigenciaDesde', vigencia_hasta: 'vigenciaHasta', cargado_por: 'cargadoPor', motivo_carga: 'motivoCarga',
    monto_total: 'montoTotal', cuotas_totales: 'cuotasTotales', cuotas_cobradas: 'cuotasCobradas', monto_cuota: 'montoCuota',
    fecha_generado: 'fechaGenerado', fecha_primera_cuota: 'fechaPrimeraCuota', fecha_ultima_cuota: 'fechaUltimaCuota',
    motivo_generacion: 'motivoGeneracion',
    fecha_generada: 'fechaGenerada', prendas_a_devolver: 'prendasADevolver',
    fecha_confirmada: 'fechaConfirmada', confirmada_por: 'confirmadaPor',
    prendas_devueltas: 'prendasDevueltas', monto_descuento: 'montoDescuento',
    talles_uniforme: 'tallesUniforme',
    // Competencia Anual v2 (v033)
    modulo_origen: 'moduloOrigen', regla_id_local: 'reglaIdLocal',
    puntos_individual: 'puntosIndividual', puntos_por_companero: 'puntosPorCompanero', puntos_supervisor: 'puntosSupervisor',
    regla_version_id_local: 'reglaVersionIdLocal', operario_id_local: 'operarioIdLocal',
    servicio_al_momento: 'servicioAlMomento', supervisor_al_momento: 'supervisorAlMomento',
    fecha_evento: 'fechaEvento', referencia_externa: 'referenciaExterna',
    fecha_reversion: 'fechaReversion', revertido_por: 'revertidoPor', motivo_reversion: 'motivoReversion',
    evento_id_local: 'eventoIdLocal', destinatario_id_local: 'destinatarioIdLocal',
    nombre_destinatario: 'nombreDestinatario', tipo_destinatario: 'tipoDestinatario',
    puntos_congelados: 'puntosCongelados', fecha_movimiento: 'fechaMovimiento', anio_competencia: 'anioCompetencia',
    ganador_id_local: 'ganadorIdLocal', nombre_ganador: 'nombreGanador', puntos_finales: 'puntosFinales',
    compartido_con: 'compartidoCon', fecha_entrega: 'fechaEntrega', entregado_por: 'entregadoPor',
    descripcion_premio: 'descripcionPremio', nivel_riesgo: 'nivelRiesgo', destinatario_tipo: 'destinatarioTipo',
    fecha_enviado: 'fechaEnviado', enviado_por: 'enviadoPor',
    fecha_cierre: 'fechaCierre', cerrado_por: 'cerradoPor', observaciones_cierre: 'observacionesCierre',
    // Sanciones v1 (v034)
    nombre_sancionado: 'nombreSancionado', tipo_sancionado: 'tipoSancionado', area_administrativa: 'areaAdministrativa',
    nombre_nivel: 'nombreNivel', infraccion_id_local: 'infraccionIdLocal', nombre_infraccion: 'nombreInfraccion',
    categoria_infraccion: 'categoriaInfraccion', fecha_hecho: 'fechaHecho', fecha_deteccion: 'fechaDeteccion',
    descripcion_hecho: 'descripcionHecho', propuesta_por_legajo: 'propuestaPorLegajo', propuesta_por_rol: 'propuestaPorRol',
    fecha_iniciacion: 'fechaIniciacion', fecha_aprobacion: 'fechaAprobacion',
    aprobada_por_legajo: 'aprobadaPorLegajo', aprobada_por_rol: 'aprobadaPorRol',
    aprobacion_secundaria_legajo: 'aprobacionSecundariaLegajo', aprobacion_secundaria_rol: 'aprobacionSecundariaRol',
    fecha_aprobacion_secundaria: 'fechaAprobacionSecundaria',
    descargo_requerido: 'descargoRequerido', descargo_solicitado_en: 'descargoSolicitadoEn',
    fecha_limite_descargo: 'fechaLimiteDescargo', descargo_id_local: 'descargoIdLocal',
    sumario_id_local: 'sumarioIdLocal', votos_favor: 'votosFavor', votos_contra: 'votosContra', votos_abstencion: 'votosAbstencion',
    fecha_resolucion_consejo: 'fechaResolucionConsejo', fecha_notificacion_asociado: 'fechaNotificacionAsociado',
    notificacion_metodo: 'notificacionMetodo', suspension_fecha_desde: 'suspensionFechaDesde', suspension_fecha_hasta: 'suspensionFechaHasta',
    suspension_con_goce: 'suspensionConGoce', medida_cautelar: 'medidaCautelar', medida_cautelar_motivo: 'medidaCautelarMotivo',
    medida_cautelar_desde: 'medidaCautelarDesde', apelacion_id_local: 'apelacionIdLocal',
    sancion_revocada_por_apelacion: 'sancionRevocadaPorApelacion', fecha_revocacion: 'fechaRevocacion',
    evento_competencia_id_local: 'eventoCompetenciaIdLocal', fecha_anulacion: 'fechaAnulacion',
    anulada_por: 'anuladaPor', motivo_anulacion: 'motivoAnulacion',
    sancion_id_local: 'sancionIdLocal', estado_desde: 'estadoDesde', estado_hasta: 'estadoHasta',
    ejecutado_por: 'ejecutadoPor', ejecutado_rol: 'ejecutadoRol', ejecutado_en: 'ejecutadoEn',
    fecha_presentacion: 'fechaPresentacion', registrado_por: 'registradoPor',
    sancion_sugerida_primera_vez: 'sancionSugeridaPrimeraVez', sancion_sugerida_reiteracion: 'sancionSugeridaReiteracion',
    // Categorías v1 (v035)
    es_reten: 'esReten', categoria_id_local: 'categoriaIdLocal', servicio_nombre: 'servicioNombre',
    valor_hora: 'valorHora', plus_id_local: 'plusIdLocal', valor_adicional: 'valorAdicional',
    // Situaciones Legales v1.1 (v036)
    abogado_cooperativa: 'abogadoCooperativa', estudio_cooperativa: 'estudioCooperativa',
    supervisor_actual: 'supervisorActual', supervisor_al_alta: 'supervisorAlAlta',
    tipo_reclamo: 'tipoReclamo', tipo_cliente: 'tipoCliente', monto_reclamado: 'montoReclamado',
    relacion_otros_casos: 'relacionOtrosCasos', fecha_proxima_instancia: 'fechaProximaInstancia',
    monto_final: 'montoFinal',
    caso_id_local: 'casoIdLocal', novedad_id_local: 'novedadIdLocal',
    tipo_evento: 'tipoEvento', cargada_por: 'cargadaPor', cargada_en: 'cargadaEn',
    tipo_mime: 'tipoMime', subido_por: 'subidoPor',
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

// Chequeo liviano de solo sugerencias — usado por el polling del perfil
// DEVELOPER para detectar tickets nuevos sin recargar toda la app.
export async function fetchSugerencias() {
  const { data, error } = await SUPA.from('sugerencias').select('*').order('created_at', { ascending: true });
  if (error) return null;
  return (data || []).map(row => _toCamel(row));
}
