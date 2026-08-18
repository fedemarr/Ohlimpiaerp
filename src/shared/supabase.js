import { createClient } from '@supabase/supabase-js';

// Multi-empresa (18/08/2026): cada empresa cliente tiene su PROPIO
// proyecto Supabase (aislamiento total, sin empresa_id compartido — ver
// src/modules/superadmin/). El mismo código/deploy sirve para todas,
// apuntando a la base correcta según las variables de entorno del build.
// Fallback a los valores de Ohlimpia si no se configura nada — así el
// deploy de Ohlimpia sigue funcionando exactamente igual sin tocar nada
// en Vercel, y solo los deploys de empresas nuevas necesitan setearlas.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://caeqsieiuunqvicfpudu.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable__SBdO6cSQXYfgR16FrztwA_Cf9sNosd';

// Cliente Supabase — sesión persistida (comportamiento default): el login
// sobrevive a un reload, no hay que volver a loguearse hasta cerrar sesión.
export const SUPA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mapa de claves JS → nombres de tabla en Supabase
export const _SM = {
  legajos: 'legajos',
  pedidos: 'pedidos',
  perfilPersonalAtributos: 'perfil_personal_atributos',
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
  motivosRetencion: 'motivos_retencion',
  rolesContacto: 'roles_contacto_cliente',
  itemsLogisticaServicio: 'items_logistica_servicio',
  monoCambios: 'mono_cambios',
  monoPagosMes: 'mono_pagos_mes',
  supervisoresConfig: 'supervisores_config',
  supervisionVigencias: 'supervision_vigencias',
  reclamos: 'reclamos',
  noConformidades: 'no_conformidades',
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
  casosEnfermosAccidentes: 'casos_enfermos_accidentes',
  certificadosMedicos: 'certificados_medicos',
  retirosEnfermosPendientes: 'retiros_enfermos_pendientes',
  casoEventosEnfermos: 'caso_eventos',
  pedidosAdelantos: 'pedidos_adelantos',
  pedidosAdelantosEventos: 'pedidos_adelantos_eventos',
  descuentosAdelantosPendientes: 'descuentos_adelantos_pendientes',
  // v084 — Descuentos por asociado (conceptos parametrizables) — Liquidación
  descuentos: 'descuentos',
  conceptosDescuento: 'conceptos_descuento',
  configuracionAdelantosPrestamos: 'configuracion_adelantos_prestamos',
  topesAdelantosVersiones: 'topes_adelantos_versiones',
  paritarias: 'paritarias',
  // v046 — 'retenes' (nombre 'retenes' a secas) ya existe en producción
  // pero nunca la usó ningún código de esta app (creada a mano, sin
  // script en el repo). Se apunta a una tabla propia para no arriesgar
  // un schema desconocido, mismo criterio que cat_alt_pendientes_liq.
  retenes: 'retenes_liq',
  // OJO: DB.retenHoras/DB.mantHoras ya son objetos anidados en memoria
  // ({mes: {personaId: {fecha: {...}}}}) — usar esa misma clave acá haría
  // que supaInit() los pise con el array plano de filas y rompa todo el
  // render. Se usan claves _Rows separadas; reconciliarPeriodosOperaciones()
  // (legacy.js) reconstruye la forma anidada a partir de esos arrays.
  retenHorasRows: 'retenes_liq_horas',
  mantPersonal: 'mant_personal',
  mantHorasRows: 'mant_horas',
  liqAdminPersonal: 'liq_admin_personal',
  liqAdminPeriodos: 'liq_admin_periodos',
  liqSuplemento: 'liq_suplemento_personal',
  liqSuplementoPeriodos: 'liq_suplemento_periodos',
  sugerencias: 'sugerencias',
  sugerenciaAdjuntos: 'sugerencia_adjuntos',
  personalRrhh: 'personal_rrhh',
  serviciosSupervisor: 'servicios_supervisor',
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
  stockUniformes: 'stock_uniformes',
  stockUniformesMovimientos: 'stock_uniformes_movimientos',
  comprasUniformes: 'compras_uniformes',
  stockConteosUniformes: 'stock_conteos_uniformes',
  objetivos: 'objetivos',
  objetivoResponsables: 'objetivo_responsables',
  objetivoAdjuntos: 'objetivo_adjuntos',
  objetivoSupervisoresHistorial: 'objetivo_supervisores_historial',
  objetivoEventos: 'objetivo_eventos',
  pendientesAuthLiq: 'pendientes_auth_liq',
  historialAuthLiq: 'historial_auth_liq',
  catAltPendientesLiq: 'cat_alt_pendientes_liq',
  art42: 'registros_art42',
  // v048 — Cobros / Importación Tango
  facturas: 'facturas',
  cobros: 'cobros',
  historialImportaciones: 'historial_importaciones',
  // v050 — CRM / leads
  leads: 'leads',
  // v052 — Gestión de precios
  propuestasPrecios: 'propuestas_precios',
  // v054 — Comisiones
  comisionesExternos: 'comisiones_externos',
  comisionesDevengos: 'comisiones_devengos',
  comisionesPagos: 'comisiones_pagos',
  // v085 — Pedido de Productos (Logística). Prefijo pp_ para no chocar con
  // la tabla `pedidos` (Pedidos de personal, Selección) ya existente.
  ppPeriodos: 'pp_periodos',
  ppProductos: 'pp_productos',
  ppPrecios: 'pp_precios',
  ppPedidos: 'pp_pedidos',
  ppItems: 'pp_items',
  // v089 — Superadmin: registro de empresas clientes (solo en el Supabase
  // de Ohlimpia — no es dato operativo de ninguna empresa cliente).
  empresasCliente: 'empresas_cliente',
};

// camelCase → snake_case para guardar en Supabase
export function _toSnake(obj) {
  const m = {
    nroLegajo: 'nro_legajo', estadoLegal: 'estado_legal', estadoMedico: 'estado_medico',
    fechaBaja: 'fecha_baja', fechaReincorp: 'fecha_reincorp', estadoCivil: 'estado_civil',
    legajoAnteriorNro: 'legajo_anterior_nro', claveFiscal: 'clave_fiscal',
    periodoPrueba: 'periodo_prueba', fechaIngresoPrueba: 'fecha_ingreso_prueba',
    codigoPostal: 'codigo_postal', obraSocialInicioTramite: 'obra_social_inicio_tramite',
    altaObraSocial: 'alta_obra_social', altaObraSocialFecha: 'alta_obra_social_fecha',
    adjuntosLegal: 'adjuntos_legal', adjuntosMedico: 'adjuntos_medico',
    pctAumento: 'pct_aumento', fechaHomologacion: 'fecha_homologacion',
    estadoAplicacion: 'estado_aplicacion', razonSocial: 'razon_social',
    estadoPago: 'estado_pago', servicioOrigen: 'servicio_origen',
    servicioDestino: 'servicio_destino', obraSocial: 'obra_social', formaPago: 'forma_pago',
    tipoContrato: 'tipo_contrato',
    fechaInicio: 'fecha_inicio', ultimoContacto: 'ultimo_contacto',
    candidatoId: 'candidato_id', psicoId: 'psico_id', fechaTurno: 'fecha_turno',
    observacion: 'observacion',
    preocupId: 'preocup_id',
    antecResultado: 'antec_resultado',
    antecFecha: 'antec_fecha',
    antecVencimiento: 'antec_vencimiento',
    antecExcepcion: 'antec_excepcion',
    antecMotivoExcepcion: 'antec_motivo_excepcion',
    libretaAplica: 'libreta_aplica',
    libretaEmision: 'libreta_emision',
    libretaVencimiento: 'libreta_vencimiento',
    cursoTiene: 'curso_tiene',
    cursoVencimiento: 'curso_vencimiento',
    libretaSanitaria: 'libreta_sanitaria', requiereAntecedentes: 'requiere_antecedentes',
    requiereLibreta: 'requiere_libreta', fechaAprobacion: 'fecha_aprobacion',
    motivoRechazo: 'motivo_rechazo', fechaRechazo: 'fecha_rechazo',
    fechaRealizacion: 'fecha_realizacion',
    obsEntrevista: 'obs_entrevista',
    tipoMotivoBaja: 'tipo_motivo_baja',
    fecNac: 'fec_nac', fechaCita: 'fecha_cita', horaCita: 'hora_cita',
    nombreReferido: 'nombre_referido', rrhhId: 'rrhh_id',
    disponibilidadHoraria: 'disponibilidad_horaria',
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
    // v080 — Monotributo completo
    curManual: 'cur_manual', adherentesCantidad: 'adherentes_cantidad', adherentesMonto: 'adherentes_monto',
    catAnterior: 'cat_anterior', catNueva: 'cat_nueva', curAnterior: 'cur_anterior', curNuevo: 'cur_nuevo',
    proyeccionAnual: 'proyeccion_anual', decidoPor: 'decido_por',
    curCongelado: 'cur_congelado', adherentesMontoCongelado: 'adherentes_monto_congelado',
    metodoPago: 'metodo_pago', pagadoPor: 'pagado_por', pagadoEn: 'pagado_en',
    mipymeEstado: 'mipyme_estado', cuitEstado: 'cuit_estado',
    cuitFechaVerificacion: 'cuit_fecha_verificacion', claveFiscalFechaActualizacion: 'clave_fiscal_fecha_actualizacion',
    // v081 — Módulo Supervisores + multi-supervisor
    pctComision: 'pct_comision', supervisoresAsignados: 'supervisores_asignados',
    // v086 — Supervisión de servicios (% por servicio, vigencias, ajuste)
    pctSupervision: 'pct_supervision', alcanceNombre: 'alcance_nombre',
    vigenteDesde: 'vigente_desde', vigenteHasta: 'vigente_hasta',
    ajusteNivelacion: 'ajuste_nivelacion', ajusteMotivo: 'ajuste_motivo',
    ajusteUsuario: 'ajuste_usuario', ajusteFecha: 'ajuste_fecha',
    // v082 — Reclamos/NC: fix de persistencia (nunca estaban en _SM)
    desc: 'col_desc', generaNC: 'genera_nc', causaRaiz: 'causa_raiz',
    reclamoId: 'reclamo_id', asociadoNroSocio: 'asociado_nro_socio', firmadaEn: 'firmada_en',
    // Retenciones — tipificación (v076)
    motivoTipificado: 'motivo_tipificado', tipoValor: 'tipo_valor', origen: 'origen',
    creadoEn: 'creado_en', liberadoPor: 'liberado_por',
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
    // v084 — Descuentos por asociado
    conceptoIdLocal: 'concepto_id_local', periodoInicio: 'periodo_inicio',
    cuotasMaximas: 'cuotas_maximas', activo: 'activo',
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
    sugerenciaIdLocal: 'sugerencia_id_local',
    // Adelantos y Préstamos v1.1 (v038)
    supervisorNombre: 'supervisor_nombre', fechaPedido: 'fecha_pedido',
    motivoRechazoFinanzas: 'motivo_rechazo_finanzas', pagadoPor: 'pagado_por', fechaPago: 'fecha_pago',
    superaTope: 'supera_tope', topeVigenteAlPedido: 'tope_vigente_al_pedido',
    montoSolicitado: 'monto_solicitado', cuotasSolicitadas: 'cuotas_solicitadas', montoCuotaSolicitado: 'monto_cuota_solicitado',
    fechaOtorgamiento: 'fecha_otorgamiento', tipoPedido: 'tipo_pedido', montoTope: 'monto_tope',
    modificadoPor: 'modificado_por', modificadoEn: 'modificado_en', tipoOrigen: 'tipo_origen',
    origenIdLocal: 'origen_id_local', periodoDescuento: 'periodo_descuento', numeroCuota: 'numero_cuota',
    // Enfermos y Accidentes v1 (v037)
    tipoAsociado: 'tipo_asociado', fechaIngresoModulo: 'fecha_ingreso_modulo',
    fechaAltaPrevista: 'fecha_alta_prevista', fechaAltaEfectiva: 'fecha_alta_efectiva',
    categoriaNombre: 'categoria_nombre', servicioAlIngreso: 'servicio_al_ingreso',
    valorHoraCongelado: 'valor_hora_congelado', valorHoraIdLocal: 'valor_hora_id_local',
    pendienteAdministrativo: 'pendiente_administrativo', motivoCierre: 'motivo_cierre',
    datosEnfermedad: 'datos_enfermedad', datosAccidente: 'datos_accidente',
    medicoApellidoNombre: 'medico_apellido_nombre', medicoProfesion: 'medico_profesion',
    medicoMatricula: 'medico_matricula', medicoDomicilio: 'medico_domicilio',
    medicoTelefono: 'medico_telefono', medicoEmail: 'medico_email',
    pacienteNombre: 'paciente_nombre', pacienteDocumentoTipo: 'paciente_documento_tipo',
    pacienteDocumentoNro: 'paciente_documento_nro', diagnosticoCie10: 'diagnostico_cie10',
    fechaEmision: 'fecha_emision', duracionIncapacidadDias: 'duracion_incapacidad_dias',
    fechaIncapacidadDesde: 'fecha_incapacidad_desde', fechaIncapacidadHasta: 'fecha_incapacidad_hasta',
    observacionesMedicas: 'observaciones_medicas', adjuntoUrl: 'adjunto_url',
    tipoCertificado: 'tipo_certificado', estadoValidacion: 'estado_validacion',
    validadoPor: 'validado_por', fechaValidacion: 'fecha_validacion',
    observacionesValidacion: 'observaciones_validacion', presentadoEn: 'presentado_en',
    presentadoPor: 'presentado_por', medioPresentacion: 'medio_presentacion',
    diasDelCasoEnMes: 'dias_del_caso_en_mes', horasCalculadas: 'horas_calculadas',
    horasAjustadas: 'horas_ajustadas', fechaAplicacion: 'fecha_aplicacion', aplicadoPor: 'aplicado_por',
    enTratamiento: 'en_tratamiento',
    // Clientes y Objetivos v1.1 (v039) — mapeos nuevos + campos de
    // clientes que ya se guardaban sin mapeo explícito (bug latente:
    // guardarCliente() fallaba en silencio, ver hallazgo de la migración).
    condPago: 'cond_pago', codigoTango: 'codigo_tango', factPor: 'fact_por',
    productosEnFactura: 'productos_en_factura', notasFact: 'notas_fact', docReq: 'doc_req',
    ingresosBrutos: 'ingresos_brutos', jurisdiccionIibb: 'jurisdiccion_iibb',
    clienteIdLocal: 'cliente_id_local', objetivoIdLocal: 'objetivo_id_local',
    supervisorAsignado: 'supervisor_asignado', supervisorAsignadoPor: 'supervisor_asignado_por',
    fechaAsignacionSupervisor: 'fecha_asignacion_supervisor',
    clausulaActualizacion: 'clausula_actualizacion', modeloPrecio: 'modelo_precio', tipoSitio: 'tipo_sitio',
    valorEft: 'valor_eft', textoFactura: 'texto_factura', periodoFact: 'periodo_fact', reqOC: 'req_oc',
    dadoDeBajaPor: 'dado_de_baja_por', motivoBaja: 'motivo_baja', motivoCambio: 'motivo_cambio',
    motivoBajaRazon: 'motivo_baja_razon', motivoBajaDetalle: 'motivo_baja_detalle',
    fechaReactivacion: 'fecha_reactivacion', reactivadoPor: 'reactivado_por',
    personalHorario: 'personal_horario',
    aSatisfacer: 'a_satisfacer',
    // NO mapear 'tel' acá (bug real en producción, 04/08/2026): hubo un
    // "tel: 'telefono'" en este diccionario para arreglar
    // objetivo_responsables (la única tabla que de verdad llama
    // "telefono" a este campo), pero al ser un diccionario global rompía
    // TODAS las demás tablas que sí llaman "tel" a su columna
    // (candidatos, psicos, legajos...) — cada guardado de un candidato
    // fallaba con "Could not find the 'telefono' column of 'candidatos'".
    // La traducción puntual para objetivo_responsables ahora vive en
    // persistirRelacionadosObjetivo() (legacy.js), no acá.
    // 2.3.2 (Delta Comercial v1.3)
    recibeFactura: 'recibe_factura',
    // V.1/A.1 (Delta Comercial v1.3) — Clientes. 'codigo' NO necesita
    // mapeo acá (sin mayúsculas, pasa igual): ojo, no mapearlo a otro
    // nombre de columna porque colisionaría con objetivos.codigo (el
    // mapa es global, no por tabla).
    responsableTipo: 'responsable_tipo', responsableContacto: 'responsable_contacto',
    // A.3 (Delta Comercial v1.3)
    puestos: 'puestos_necesarios',
    // v088 — Pedidos de personal: horario semanal estructurado (mismo shape
    // que un puesto de objetivos.puestos_necesarios)
    horarioSemanal: 'horario_semanal',
    // 2.5/A.6 (Delta Comercial v1.3)
    logProductos: 'log_productos', logElementos: 'log_elementos', logMaquinas: 'log_maquinas',
    // v079 — multi-select parametrizable (NO reemplaza los 3 de arriba,
    // que siguen con su dato real de facturación en los 164 objetivos ya
    // cargados)
    productosLimpieza: 'productos_limpieza', elementosLimpieza: 'elementos_limpieza',
    maquinasNecesarias: 'maquinas_necesarias',
    // Liquidación de horas v1.1 (v040)
    objCodigo: 'objetivo_codigo', horasEFT: 'horas_eft', horasContratadas: 'horas_contratadas',
    alertaEFT: 'alerta_eft', totalHorasFacturables: 'total_horas_facturables',
    totalHorasNoFacturables: 'total_horas_no_facturables', totalAPagar: 'total_a_pagar',
    grillaId: 'grilla_id_local', asocIdx: 'asoc_idx', resueltoPor: 'resuelto_por',
    fechaResolucion: 'fecha_resolucion', nroSocio: 'nro_socio', horasPorDia: 'horas_por_dia',
    catActual: 'cat_actual', catPropuesta: 'cat_propuesta', propuestoPor: 'propuesto_por',
    moduloLabel: 'modulo_label',
    // v046 — Liq. Admin/Suplemento/Retenes/Mantenimiento
    categoriBase: 'categori_base', funcionExtra: 'funcion_extra',
    horasFijas: 'horas_fijas', personaIdLocal: 'persona_id_local',
    // v048 — Cobros / Importación Tango
    clienteId: 'cliente_id', objetivoCod: 'objetivo_cod', nroFactura: 'nro_factura',
    periodoDesde: 'periodo_desde', periodoHasta: 'periodo_hasta',
    fechaFactura: 'fecha_factura', contactoCobro: 'contacto_cobro',
    telefonoCobro: 'telefono_cobro',
    horarioCobro: 'horario_cobro', proximaGestion: 'proxima_gestion',
    probCobro: 'prob_cobro', fechaPosibleCobro: 'fecha_posible_cobro',
    marcadaCobradaPor: 'marcada_cobrada_por', fechaMarcadaCobrada: 'fecha_marcada_cobrada',
    importeFacturado: 'importe_facturado', importeCobrado: 'importe_cobrado',
    nroRecibo: 'nro_recibo', fechaCobro: 'fecha_cobro', fechaAcreditacion: 'fecha_acreditacion',
    // v049 — Delta Cobros/Tango v2
    alertaTangoNoConfirmo: 'alerta_tango_no_confirmo',
    // v050 — CRM / leads
    clienteBorradorId: 'cliente_borrador_id', motivoPerdida: 'motivo_perdida',
    // v078 — CRM: lead de cliente existente vs potencial
    tipoCliente: 'tipo_cliente', clienteIdVinculado: 'cliente_id_vinculado',
    // v051 — Gestión de cobranzas (a nivel cliente)
    gestionesCobro: 'gestiones_cobro',
    // v052 — Gestión de precios (propuestas con tramos)
    objetivoId: 'objetivo_id', tipoModificacion: 'tipo_modificacion',
    tipoConvalidar: 'tipo_convalidar', autorizadaPor: 'autorizada_por',
    fechaAutorizacion: 'fecha_autorizacion', confirmadaPor: 'confirmada_por',
    fechaConfirmacion: 'fecha_confirmacion',
    motivoRechazoGerente: 'motivo_rechazo_gerente', motivoRechazoCliente: 'motivo_rechazo_cliente',
    loteId: 'lote_id', propuestaAnteriorId: 'propuesta_anterior_id', cargadoPor: 'cargado_por',
    // v054 — Comisiones
    comisionId: 'comision_id', objetivoNombre: 'objetivo_nombre',
    clienteNombre: 'cliente_nombre', personaTipo: 'persona_tipo', personaRef: 'persona_ref',
    personaNombre: 'persona_nombre', facturaId: 'factura_id',
    montoBase: 'monto_base', montoComision: 'monto_comision', fechaDevengo: 'fecha_devengo',
    fechaDisponible: 'fecha_disponible', montoPagado: 'monto_pagado',
    periodosTotal: 'periodos_total', periodosConsumidos: 'periodos_consumidos',
    tramosPct: 'tramos_pct', registradoEn: 'registrado_en',
    // v071 — Stock de uniformes
    refTipo: 'ref_tipo', refIdLocal: 'ref_id_local',
    // v085 — Pedido de Productos (Logística)
    abiertoPor: 'abierto_por', abiertoEn: 'abierto_en', cerradoEn: 'cerrado_en',
    codigoMonica: 'codigo_monica', tipoUso: 'tipo_uso',
    productoIdLocal: 'producto_id_local', costoUnit: 'costo_unit',
    periodoIdLocal: 'periodo_id_local', servicioCodigo: 'servicio_codigo',
    facturacionNeta: 'facturacion_neta', porcentajeTope: 'porcentaje_tope',
    auditadoPor: 'auditado_por', auditadoEn: 'auditado_en',
    autorizadoPor: 'autorizado_por', autorizadoEn: 'autorizado_en',
    enCompraEn: 'en_compra_en', entregadoEn: 'entregado_en',
    cantSolicitada: 'cant_solicitada', cantAutorizada: 'cant_autorizada',
    costoCongelado: 'costo_congelado', ajustadoPor: 'ajustado_por',
    ajustadoEn: 'ajustado_en', cantAntesAjuste: 'cant_antes_ajuste',
    // v089 — Superadmin / empresas cliente
    modulosContratados: 'modulos_contratados', supabaseUrl: 'supabase_url', vercelUrl: 'vercel_url',
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
    legajo_anterior_nro: 'legajoAnteriorNro', clave_fiscal: 'claveFiscal',
    periodo_prueba: 'periodoPrueba', fecha_ingreso_prueba: 'fechaIngresoPrueba',
    codigo_postal: 'codigoPostal', obra_social_inicio_tramite: 'obraSocialInicioTramite',
    alta_obra_social: 'altaObraSocial', alta_obra_social_fecha: 'altaObraSocialFecha',
    adjuntos_legal: 'adjuntosLegal', adjuntos_medico: 'adjuntosMedico',
    pct_aumento: 'pctAumento', fecha_homologacion: 'fechaHomologacion',
    estado_aplicacion: 'estadoAplicacion', razon_social: 'razonSocial',
    estado_pago: 'estadoPago', servicio_origen: 'servicioOrigen',
    servicio_destino: 'servicioDestino', obra_social: 'obraSocial', forma_pago: 'formaPago',
    tipo_contrato: 'tipoContrato',
    fecha_inicio: 'fechaInicio', ultimo_contacto: 'ultimoContacto',
    candidato_id: 'candidatoId', psico_id: 'psicoId', fecha_turno: 'fechaTurno',
    observacion: 'observacion',
    preocup_id: 'preocupId',
    antec_resultado: 'antecResultado',
    antec_fecha: 'antecFecha',
    antec_vencimiento: 'antecVencimiento',
    antec_excepcion: 'antecExcepcion',
    antec_motivo_excepcion: 'antecMotivoExcepcion',
    libreta_aplica: 'libretaAplica',
    libreta_emision: 'libretaEmision',
    libreta_vencimiento: 'libretaVencimiento',
    curso_tiene: 'cursoTiene',
    curso_vencimiento: 'cursoVencimiento',
    libreta_sanitaria: 'libretaSanitaria', requiere_antecedentes: 'requiereAntecedentes',
    requiere_libreta: 'requiereLibreta', fecha_aprobacion: 'fechaAprobacion',
    motivo_rechazo: 'motivoRechazo', fecha_rechazo: 'fechaRechazo',
    fecha_realizacion: 'fechaRealizacion',
    obs_entrevista: 'obsEntrevista',
    tipo_motivo_baja: 'tipoMotivoBaja',
    fec_nac: 'fecNac', fecha_cita: 'fechaCita', hora_cita: 'horaCita',
    nombre_referido: 'nombreReferido', rrhh_id: 'rrhhId',
    disponibilidad_horaria: 'disponibilidadHoraria',
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
    // v080 — Monotributo completo
    cur_manual: 'curManual', adherentes_cantidad: 'adherentesCantidad', adherentes_monto: 'adherentesMonto',
    cat_anterior: 'catAnterior', cat_nueva: 'catNueva', cur_anterior: 'curAnterior', cur_nuevo: 'curNuevo',
    proyeccion_anual: 'proyeccionAnual', decido_por: 'decidoPor',
    cur_congelado: 'curCongelado', adherentes_monto_congelado: 'adherentesMontoCongelado',
    metodo_pago: 'metodoPago', pagado_por: 'pagadoPor', pagado_en: 'pagadoEn',
    mipyme_estado: 'mipymeEstado', cuit_estado: 'cuitEstado',
    cuit_fecha_verificacion: 'cuitFechaVerificacion', clave_fiscal_fecha_actualizacion: 'claveFiscalFechaActualizacion',
    pct_comision: 'pctComision', supervisores_asignados: 'supervisoresAsignados',
    // v086 — Supervisión de servicios (% por servicio, vigencias, ajuste)
    pct_supervision: 'pctSupervision', alcance_nombre: 'alcanceNombre',
    vigente_desde: 'vigenteDesde', vigente_hasta: 'vigenteHasta',
    ajuste_nivelacion: 'ajusteNivelacion', ajuste_motivo: 'ajusteMotivo',
    ajuste_usuario: 'ajusteUsuario', ajuste_fecha: 'ajusteFecha',
    col_desc: 'desc', genera_nc: 'generaNC', causa_raiz: 'causaRaiz',
    reclamo_id: 'reclamoId', asociado_nro_socio: 'asociadoNroSocio', firmada_en: 'firmadaEn',
    // Retenciones — tipificación (v076)
    motivo_tipificado: 'motivoTipificado', tipo_valor: 'tipoValor',
    creado_en: 'creadoEn', liberado_por: 'liberadoPor',
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
    // v084 — Descuentos por asociado
    concepto_id_local: 'conceptoIdLocal', periodo_inicio: 'periodoInicio',
    cuotas_maximas: 'cuotasMaximas', activo: 'activo',
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
    sugerencia_id_local: 'sugerenciaIdLocal',
    // Adelantos y Préstamos v1.1 (v038)
    supervisor_nombre: 'supervisorNombre', fecha_pedido: 'fechaPedido',
    motivo_rechazo_finanzas: 'motivoRechazoFinanzas', pagado_por: 'pagadoPor', fecha_pago: 'fechaPago',
    supera_tope: 'superaTope', tope_vigente_al_pedido: 'topeVigenteAlPedido',
    monto_solicitado: 'montoSolicitado', cuotas_solicitadas: 'cuotasSolicitadas', monto_cuota_solicitado: 'montoCuotaSolicitado',
    fecha_otorgamiento: 'fechaOtorgamiento', tipo_pedido: 'tipoPedido', monto_tope: 'montoTope',
    modificado_por: 'modificadoPor', modificado_en: 'modificadoEn', tipo_origen: 'tipoOrigen',
    origen_id_local: 'origenIdLocal', periodo_descuento: 'periodoDescuento', numero_cuota: 'numeroCuota',
    // Enfermos y Accidentes v1 (v037)
    tipo_asociado: 'tipoAsociado', fecha_ingreso_modulo: 'fechaIngresoModulo',
    fecha_alta_prevista: 'fechaAltaPrevista', fecha_alta_efectiva: 'fechaAltaEfectiva',
    categoria_nombre: 'categoriaNombre', servicio_al_ingreso: 'servicioAlIngreso',
    valor_hora_congelado: 'valorHoraCongelado', valor_hora_id_local: 'valorHoraIdLocal',
    pendiente_administrativo: 'pendienteAdministrativo', motivo_cierre: 'motivoCierre',
    datos_enfermedad: 'datosEnfermedad', datos_accidente: 'datosAccidente',
    medico_apellido_nombre: 'medicoApellidoNombre', medico_profesion: 'medicoProfesion',
    medico_matricula: 'medicoMatricula', medico_domicilio: 'medicoDomicilio',
    medico_telefono: 'medicoTelefono', medico_email: 'medicoEmail',
    paciente_nombre: 'pacienteNombre', paciente_documento_tipo: 'pacienteDocumentoTipo',
    paciente_documento_nro: 'pacienteDocumentoNro', diagnostico_cie10: 'diagnosticoCie10',
    fecha_emision: 'fechaEmision', duracion_incapacidad_dias: 'duracionIncapacidadDias',
    fecha_incapacidad_desde: 'fechaIncapacidadDesde', fecha_incapacidad_hasta: 'fechaIncapacidadHasta',
    observaciones_medicas: 'observacionesMedicas', adjunto_url: 'adjuntoUrl',
    tipo_certificado: 'tipoCertificado', estado_validacion: 'estadoValidacion',
    validado_por: 'validadoPor', fecha_validacion: 'fechaValidacion',
    observaciones_validacion: 'observacionesValidacion', presentado_en: 'presentadoEn',
    presentado_por: 'presentadoPor', medio_presentacion: 'medioPresentacion',
    dias_del_caso_en_mes: 'diasDelCasoEnMes', horas_calculadas: 'horasCalculadas',
    horas_ajustadas: 'horasAjustadas', fecha_aplicacion: 'fechaAplicacion', aplicado_por: 'aplicadoPor',
    en_tratamiento: 'enTratamiento',
    // Clientes y Objetivos v1.1 (v039)
    cond_pago: 'condPago', codigo_tango: 'codigoTango', fact_por: 'factPor',
    productos_en_factura: 'productosEnFactura', notas_fact: 'notasFact', doc_req: 'docReq',
    ingresos_brutos: 'ingresosBrutos', jurisdiccion_iibb: 'jurisdiccionIibb',
    cliente_id_local: 'clienteIdLocal', objetivo_id_local: 'objetivoIdLocal',
    supervisor_asignado: 'supervisorAsignado', supervisor_asignado_por: 'supervisorAsignadoPor',
    fecha_asignacion_supervisor: 'fechaAsignacionSupervisor',
    clausula_actualizacion: 'clausulaActualizacion', modelo_precio: 'modeloPrecio', tipo_sitio: 'tipoSitio',
    valor_eft: 'valorEft', texto_factura: 'textoFactura', periodo_fact: 'periodoFact', req_oc: 'reqOC',
    dado_de_baja_por: 'dadoDeBajaPor', motivo_baja: 'motivoBaja', motivo_cambio: 'motivoCambio',
    motivo_baja_razon: 'motivoBajaRazon', motivo_baja_detalle: 'motivoBajaDetalle',
    fecha_reactivacion: 'fechaReactivacion', reactivado_por: 'reactivadoPor',
    personal_horario: 'personalHorario',
    a_satisfacer: 'aSatisfacer',
    telefono: 'tel',
    recibe_factura: 'recibeFactura',
    responsable_tipo: 'responsableTipo', responsable_contacto: 'responsableContacto',
    puestos_necesarios: 'puestos',
    // v088 — Pedidos de personal: horario semanal estructurado
    horario_semanal: 'horarioSemanal',
    log_productos: 'logProductos', log_elementos: 'logElementos', log_maquinas: 'logMaquinas',
    productos_limpieza: 'productosLimpieza', elementos_limpieza: 'elementosLimpieza',
    maquinas_necesarias: 'maquinasNecesarias',
    // Liquidación de horas v1.1 (v040)
    objetivo_codigo: 'objCodigo', horas_eft: 'horasEFT', horas_contratadas: 'horasContratadas',
    alerta_eft: 'alertaEFT', total_horas_facturables: 'totalHorasFacturables',
    total_horas_no_facturables: 'totalHorasNoFacturables', total_a_pagar: 'totalAPagar',
    grilla_id_local: 'grillaId', asoc_idx: 'asocIdx', resuelto_por: 'resueltoPor',
    fecha_resolucion: 'fechaResolucion', nro_socio: 'nroSocio', horas_por_dia: 'horasPorDia',
    cat_actual: 'catActual', cat_propuesta: 'catPropuesta', propuesto_por: 'propuestoPor',
    modulo_label: 'moduloLabel',
    categori_base: 'categoriBase', funcion_extra: 'funcionExtra',
    horas_fijas: 'horasFijas', persona_id_local: 'personaIdLocal',
    // v048 — Cobros / Importación Tango
    cliente_id: 'clienteId', objetivo_cod: 'objetivoCod', nro_factura: 'nroFactura',
    periodo_desde: 'periodoDesde', periodo_hasta: 'periodoHasta',
    fecha_factura: 'fechaFactura', contacto_cobro: 'contactoCobro',
    telefono_cobro: 'telefonoCobro',
    horario_cobro: 'horarioCobro', proxima_gestion: 'proximaGestion',
    prob_cobro: 'probCobro', fecha_posible_cobro: 'fechaPosibleCobro',
    marcada_cobrada_por: 'marcadaCobradaPor', fecha_marcada_cobrada: 'fechaMarcadaCobrada',
    importe_facturado: 'importeFacturado', importe_cobrado: 'importeCobrado',
    nro_recibo: 'nroRecibo', fecha_cobro: 'fechaCobro', fecha_acreditacion: 'fechaAcreditacion',
    // v049 — Delta Cobros/Tango v2
    alerta_tango_no_confirmo: 'alertaTangoNoConfirmo',
    // v050 — CRM / leads
    cliente_borrador_id: 'clienteBorradorId', motivo_perdida: 'motivoPerdida',
    tipo_cliente: 'tipoCliente', cliente_id_vinculado: 'clienteIdVinculado',
    // v051 — Gestión de cobranzas (a nivel cliente)
    gestiones_cobro: 'gestionesCobro',
    // v052 — Gestión de precios (propuestas con tramos)
    objetivo_id: 'objetivoId', tipo_modificacion: 'tipoModificacion',
    tipo_convalidar: 'tipoConvalidar', autorizada_por: 'autorizadaPor',
    fecha_autorizacion: 'fechaAutorizacion', confirmada_por: 'confirmadaPor',
    fecha_confirmacion: 'fechaConfirmacion',
    motivo_rechazo_gerente: 'motivoRechazoGerente', motivo_rechazo_cliente: 'motivoRechazoCliente',
    lote_id: 'loteId', propuesta_anterior_id: 'propuestaAnteriorId', cargado_por: 'cargadoPor',
    // v054 — Comisiones
    comision_id: 'comisionId', objetivo_nombre: 'objetivoNombre',
    cliente_nombre: 'clienteNombre', persona_tipo: 'personaTipo', persona_ref: 'personaRef',
    persona_nombre: 'personaNombre', factura_id: 'facturaId',
    monto_base: 'montoBase', monto_comision: 'montoComision', fecha_devengo: 'fechaDevengo',
    fecha_disponible: 'fechaDisponible', monto_pagado: 'montoPagado',
    periodos_total: 'periodosTotal', periodos_consumidos: 'periodosConsumidos',
    tramos_pct: 'tramosPct', registrado_en: 'registradoEn',
    // v071 — Stock de uniformes
    ref_tipo: 'refTipo', ref_id_local: 'refIdLocal',
    // v085 — Pedido de Productos (Logística)
    abierto_por: 'abiertoPor', abierto_en: 'abiertoEn', cerrado_en: 'cerradoEn',
    codigo_monica: 'codigoMonica', tipo_uso: 'tipoUso',
    producto_id_local: 'productoIdLocal', costo_unit: 'costoUnit',
    periodo_id_local: 'periodoIdLocal', servicio_codigo: 'servicioCodigo',
    facturacion_neta: 'facturacionNeta', porcentaje_tope: 'porcentajeTope',
    auditado_por: 'auditadoPor', auditado_en: 'auditadoEn',
    autorizado_por: 'autorizadoPor', autorizado_en: 'autorizadoEn',
    en_compra_en: 'enCompraEn', entregado_en: 'entregadoEn',
    cant_solicitada: 'cantSolicitada', cant_autorizada: 'cantAutorizada',
    costo_congelado: 'costoCongelado', ajustado_por: 'ajustadoPor',
    ajustado_en: 'ajustadoEn', cant_antes_ajuste: 'cantAntesAjuste',
    // v089 — Superadmin / empresas cliente
    modulos_contratados: 'modulosContratados', supabase_url: 'supabaseUrl', vercel_url: 'vercelUrl',
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

// Último error real de Supabase (código + mensaje), para que un llamador
// que necesite dar feedback específico (ej. "ya existe ese DNI" en vez
// de un genérico "no se pudo guardar") pueda leerlo después de un
// `if (!(await supaSync(...)))`. Se pisa en cada llamada — no acumula
// historial, es sólo "qué pasó la última vez".
let _lastSupaSyncError = null;
export function getLastSupaSyncError() { return _lastSupaSyncError; }

// Guardar un registro en Supabase (upsert por id_local). Devuelve
// true/false — la mayoría de los llamadores lo ignoran (fire-and-forget,
// patrón histórico del proyecto), pero los que necesitan saber si
// realmente persistió (ej. enviarSugerencia) pueden hacer
// `if (!(await supaSync(...))) { ... avisar del fallo ... }`, y de paso
// leer getLastSupaSyncError() para un mensaje más específico que el
// genérico "no se pudo guardar".
export async function supaSync(dbKey, obj) {
  const tabla = _SM[dbKey];
  _lastSupaSyncError = null;
  if (!tabla || !obj) return false;
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
      if (error) { console.warn('supaSync update error:', tabla, error.message); _lastSupaSyncError = error; return false; }
      console.log('✅ Actualizado en Supabase:', tabla, idLocal);
    } else {
      const { error } = await SUPA.from(tabla).insert(d);
      if (error) { console.warn('supaSync insert error:', tabla, error.message); _lastSupaSyncError = error; return false; }
      console.log('✅ Guardado en Supabase:', tabla, idLocal);
    }
    return true;
  } catch (e) {
    console.warn('supaSync error:', tabla, e.message);
    _lastSupaSyncError = e;
    return false;
  }
}

// Eliminar un registro por id_local. Devuelve true/false — igual que
// supaSync, la mayoría de los llamadores históricos lo ignoran
// (fire-and-forget), pero los que necesitan confirmar un borrado
// destructivo (ej. eliminarLegajoActual) pueden chequear el resultado y
// leer getLastSupaSyncError() para un mensaje específico.
export async function supaDel(dbKey, idLocal) {
  const tabla = _SM[dbKey];
  _lastSupaSyncError = null;
  if (!tabla) return false;
  try {
    const { error } = await SUPA.from(tabla).delete().eq('id_local', String(idLocal));
    if (error) { console.warn('supaDel error:', tabla, error.message); _lastSupaSyncError = error; return false; }
    return true;
  } catch (e) {
    console.warn('supaDel error:', tabla, e.message);
    _lastSupaSyncError = e;
    return false;
  }
}

// Cargar todos los datos al iniciar
// Recibe DB (estado global) y toast (notificación) para no depender de globales
//
// v1.1 — antes esto disparaba las ~79 tablas de _SM en un solo
// Promise.all (79 requests simultáneos). Con esa concurrencia, el pool
// de conexiones de Supabase rechazaba/reseteaba una parte de los
// pedidos, y el navegador reportaba eso como error de CORS (Chrome
// muestra "blocked by CORS policy" ante una conexión cortada/reseteada,
// aunque la causa real no tenga nada que ver con CORS — confirmado acá
// porque las mismas tablas respondían 200 OK vía curl directo). Ahora
// se piden en lotes acotados, y las que fallan en el primer intento
// tienen una segunda oportunidad (da margen si fue saturación
// transitoria, no un error real de esquema/permisos).
const SUPA_INIT_LOTE = 10;

async function _pedirTabla(k, t) {
  try {
    const r = await SUPA.from(t).select('*').order('created_at', { ascending: true });
    return { k, t, data: r.data, error: r.error };
  } catch (e) {
    return { k, t, data: null, error: e };
  }
}

export async function supaInit(DB, toast) {
  try {
    const entradas = Object.entries(_SM);
    const resultados = [];
    for (let i = 0; i < entradas.length; i += SUPA_INIT_LOTE) {
      const lote = entradas.slice(i, i + SUPA_INIT_LOTE);
      resultados.push(...await Promise.all(lote.map(([k, t]) => _pedirTabla(k, t))));
    }

    const fallidas = resultados.filter(r => r.error);
    if (fallidas.length > 0) {
      const reintentos = await Promise.all(fallidas.map(({ k, t }) => _pedirTabla(k, t)));
      for (const r of reintentos) {
        const idx = resultados.findIndex(x => x.k === r.k);
        if (idx !== -1) resultados[idx] = r;
      }
    }

    let cargados = 0;
    for (const { k, t, data, error } of resultados) {
      if (error) { console.warn('supaInit error tabla:', t, error.message); continue; }
      // Multi-empresa (18/08/2026): antes solo pisaba DB[k] si data.length>0,
      // así que una tabla real y genuinamente vacía (caso de una empresa
      // cliente nueva) nunca sobreescribía los arrays "semilla" de
      // legacy.js/state.js — quedaban mostrando datos de otra empresa
      // indefinidamente. Ahora siempre refleja lo que hay en Supabase,
      // vacío o no.
      if (data) {
        DB[k] = data.map(row => _toCamel(row));
        cargados += data.length;
        if (data.length > 0) console.log('☁️ Cargado:', k, data.length, 'registros');
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
