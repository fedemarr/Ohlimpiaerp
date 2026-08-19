# 02 — Gestión del personal (módulos de Personal)

Todos estos módulos viven en `src/modules/` y persisten en Supabase.
Estados, entidades y reglas clave de cada uno:

---

## 2.1 Capacitaciones

- **Propósito:** agenda y registro de capacitaciones de asociados, resultados, adjuntos y evaluación. Hookea a Competencia Anual (una aprobada suma puntos).
- **Entidades:**
  - `DB.capacitaciones` — `id, legajoIdLocal, nroSocio, nombreAsociado, tipo, fecha, lugar ('Servicio'|'Oficina Central'|'Virtual'|'Externo'), servicio, instructor, metodoEvaluacion, observaciones, estado ('Programada'|'Dictada'|'Cancelada'), resultado ('Aprobado'|'Desaprobado'|'Pendiente evaluación'|'Sin evaluación'), puntaje (0-100), materialesIds, adjuntoIdLocal, editadoPor, editadoEn, anulado`. Tabla: `capacitaciones`.
  - `DB.tiposCapacitacion`, `DB.instructores`, `DB.metodosEval`, `DB.materialesCapacitacion` (materiales con `tipoCapacitacion` para filtrar). Tablas: `tipos_capacitacion`, `instructores`, `metodos_evaluacion`, `materiales_capacitacion`.
- **Estados:** `Programada` → `Dictada` (con resultado) | `Cancelada` (solo desde Programada). Resultado `Pendiente evaluación` deja el registro en el tab.
- **Pantalla:** tab Registro (tabla con nombre, N°, fecha, tipo, lugar, servicio, instructor, método, resultado, materiales, acciones) + Estadísticas + Calendario/plan mensual + Repositorio + Evaluaciones.
- **Funciones:** `renderCapacitaciones` (solo Programada + Dictada-sin-resultado; stats: total, capacitados del año, pendientes de ingreso, sin ninguna), `filtrarCapacitaciones`, `poblarSelectsCapacitaciones`, `autocompletarCap`, `abrirNuevaCapacitacion`/`abrirEditarCapacitacionPorId`/`guardarCapacitacion`, `anularCapacitacionPorId`, `abrirDictarCapacitacionPorId`/`guardarDictadoCap` (modal dinámico con resultado, puntaje, materiales, adjunto de certificado), `subirAdjuntoDictarCap`/`verAdjuntoDictarCap`, `analizarCapacitacionesIA` (placeholder).
- **Reglas:** no se agenda para asociado no activo; fecha no anterior a hoy; si `lugar==='Servicio'` exige servicio; aviso (no bloqueo) si ya tiene aprobada el mismo tipo. Al aprobar: si el legajo es operativo (no administrativo) registra evento en Competencia (`capacitacion_presencial` | `capacitacion_servicio` | `capacitacion_virtual`).
- **Permisos:** RRHH / Administrador total.

---

## 2.2 Vacaciones (sector administrativo)

- **Propósito:** solicitud y aprobación de vacaciones del personal administrativo. Autoservicio: el usuario pide, el Gerente del sector aprueba, el Consejo (Presidente/Tesorero/Secretario) vota.
- **Entidad:** `DB.vacaciones` — `id, legajoIdLocal, nroSocio, nombreAsociado, sector, fechaSolicitud, fechaDesde, fechaHasta, diasSolicitados, fechaRetorno, reemplazanteLegajoIdLocal, reemplazanteNombre, descripcionReemplazo, observaciones, estado, aprobadoPorGerente, motivoRechazoGerente, votoPresidente/votoTesorero/votoSecretario (+Motivo), requiereAutorizacionPreavisoCorto, autorizadaExcepcionPor, motivoExcepcionPreaviso, motivoAnulacion, anuladoPorNombre, anulado`. Tabla: `vacaciones`.
- **Estados:** `Borrador → Pendiente aprobación Gerente → Pendiente aprobación Consejo → Aprobada`. Rechazo por Gerente/Consejo; anulación por solicitante/Gerente/Consejo (con solicitud de anulación y votación). `ESTADOS_FINALES`: Aprobada, Rechazada por Gerente/Consejo, Anulada por solicitante/Gerente/Consejo, Anulación rechazada por Consejo.
- **Saldo (submódulo `saldo.js`):** `diasDisponibles(legajo, anio)`, `calcularAntiguedad`, `calcularDiasAsignadosPorAntiguedad` (si `legajo.diasVacacionesAnuales > 0` se usan los manuales; si no, por antigüedad), `tieneSuperposicion`, `buscarSuperposicionesSector`.
- **Aprobación (`aprobacion.js`):** `aprobarComoGerente`, `rechazarComoGerente`, `votarConsejo`, `getVacacionById`. Consejo: el miembro no vota su propia solicitud (necesita los otros 2).
- **Anulación (`anulacion.js`):** `puedeAnularSolicitante`, `puedeAnularGerente`, `puedeSolicitarAnulacion`, `anularPorSolicitante/Gerente`, `votarAnulacionConsejo`.
- **Reglas de negocio (política v1.1):**
  - Las vacaciones **siempre de lunes a domingo** (semana completa).
  - **Mínimo 15 días de anticipación** para elevar; con menos queda como Borrador con `requiereAutorizacionPreavisoCorto` y RRHH/Admin autoriza la excepción (`autorizarPreavisoCorto`, motivo obligatorio) → salta directo a Consejo.
  - No pueden cruzar fin de año (se dividen en dos).
  - Reemplazante obligatorio (mismo sector, no puede ser el propio solicitante); superposición de reemplazante o jefe directo avisa.
  - Superposición en el sector se confirma al aprobar (aviso, no bloquea).
  - Se vincula al usuario logueado con su legajo por **nombre** (`legajoDelUsuarioActual`); RRHH/Admin pueden solicitar en nombre de otro asociado (selector en el modal).
- **Integraciones:** notificaciones a Gerente y Consejo (`crearNotificacion`, tipos `vacacion_solicitada`, `vacacion_preaviso_corto_autorizado`).
- **Permisos:** todos los perfiles con legajo en sector administrativo; Gerente de sector; Consejo; RRHH/Admin (bandeja completa + excepciones + solicitar por otro).
- **Archivos:** `vacaciones.js`, `permisos.js` (gerenteDeSector, rolEnConsejo, nombresConsejo), `saldo.js`, `aprobacion.js`, `anulacion.js`. Especificación: `DISENO_vacaciones.md`.

---

## 2.3 Descansos (sector operativo)

- **Propósito:** pedido de descanso (semana completa) de operarios. Aprobación en 2 niveles: Operaciones → RRHH.
- **Entidad:** `DB.descansos` — `id, legajoIdLocal, nroSocio, nombreOperario, servicio, supervisor, supervisorSolicitante, fechaSolicitud, fechaDesde, fechaHasta, duracionDias, fechaRetorno, motivo, reemplazanteLegajoIdLocal, reemplazanteNombre, observaciones, estado, aprobadoPorOperaciones, motivoRechazoOperaciones, aprobadoPorRrhh, motivoRechazoRrhh, motivoAnulacion, anuladoPor, anulado`. Tabla: `descansos`.
- **Estados:** `Borrador → Pendiente aprobación Operaciones → Pendiente aprobación RRHH → Aprobado`. Rechazos por cada nivel; anulación por supervisor o post-aprobación.
- **Reglas:** duración **7 o 14 días exactos**; si el operario ya tiene un descanso aprobado superpuesto se bloquea (avisar y anular el anterior); reemplazante (mismo servicio) opcional; menos de 48hs de anticipación avisa; superposición por servicio se confirma al aprobar (aviso). `esOperario(l)` = tiene servicio y no es 'ADMINISTRATIVO'.
- **Integraciones:** notificación a Gerente de Operaciones (`descanso_solicitado`).
- **Permisos:** Supervisor (solicitud), Gerente de Operaciones (etapa 1), Gerente de RRHH (etapa 2), RRHH/Admin (todo).
- **Archivos:** `descansos.js`, `permisos.js`, `aprobacion.js`, `anulacion.js`. Especificación: `DISENO_descansos.md`.

---

## 2.4 Competencia Anual

- **Propósito:** ranking anual por puntos (evaluaciones, presencialidad, felicitaciones) para asociados, servicios (equipos) y supervisores. Cálculo desde un **ledger de movimientos** (`DB.movimientosPuntos`), no recorriendo datos en cada render.
- **Entidades:** `DB.movimientosPuntos` (ledger), `DB.eventosPuntos` (catálogo de eventos con códigos), `DB.reglasCompetencia` + `DB.reglasCompetenciaVersiones` (reglas por versión vigente), `DB.premiosCompetenciaAnual`, `DB.aniosCompetencia`. Tablas homónimas.
- **Tabs:** Individual (top con medallas, barra de puntos, actividad reciente 30 días), Servicios (equipos, % participación), Supervisores, No participan, Historial de movimientos, Reglas, Premios, Ranking público.
- **Funciones:** `renderCompetencia` (calcula los 3 rankings), `calcularRankingIndividual/Servicios/Supervisores` (`rankings.js`), `renderTablaIndividual/Equipos/Supervisores`, `renderReglas` (`reglas.js`), `renderTablaNoParticipan` (`no_participan.js`), `renderHistorialMovimientos` (`historial.js`), `renderPremiosCierre` (`premios.js`), `verRankingPublico`, `abrirDetalleNoParticipanSupervisor`, `abrirNotificarAsociado/GrupoSupervisor`.
- **Reglas:** puntaje oficial por servicio = promedio ponderado según reglas; % participación; no participantes por supervisor. El motor de eventos (`movimientos.js`) expone `registrarEvento({ reglaCodigo, fecha, protagonista, referenciaExterna, origenModulo, observaciones, generadoPor })` y `esAdministrativo(legajo)` — Capacitaciones y otros módulos lo llaman.
- **Permisos:** RRHH / Administrador total (gestión); ranking público visible.

---

## 2.5 Sanciones disciplinarias

- **Propósito:** proceso disciplinario tipado por **nivel** (0 llamada verbal, 1 observación, 2 apercibimiento) con catálogo de infracciones, escalada por antecedentes y descargos.
- **Entidades:**
  - `DB.sancionesDisciplinarias` — `id, legajoIdLocal, nroSocio, nombreSancionado, tipoSancionado ('Operativo'|'Administrativo'), servicio, areaAdministrativa, supervisor, nivel (0|1|2), nombreNivel, infraccionIdLocal, nombreInfraccion, categoriaInfraccion, gravedad, fechaHecho, fechaDeteccion, descripcionHecho, estado, fechaIniciacion, propuestaPorLegajo, aprobadaPorLegajo, fechaAprobacion, aprobacionSecundariaLegajo, fechaAprobacionSecundaria, motivoRechazo, descargoIdLocal, anulado`. Tabla: `sanciones_disciplinarias`.
  - `DB.catalogoInfracciones` + `DB.catalogoInfraccionesVersiones` (catálogo con versionado: `getVersionInfraccionVigente(infraccionId, fecha)` → gravedad + sanción sugerida 1ra vez / reiteración). Tablas homónimas.
  - `DB.sancionEventos` (timeline: estadoDesde→estadoHasta, ejecutadoPor, ejecutadoEn), `DB.sancionDescargos` (descripcion, medio). Tablas `sancion_eventos`, `sancion_descargos`.
- **Categorías de infracciones:** 'Ausencias e Impuntualidad', 'Incumplimiento de Tareas y Normas', 'Conductas y Comportamiento'.
- **Flujo por nivel:**
  - **Nivel 0 (llamado verbal):** se crea y queda ejecutado directo (no requiere aprobación).
  - **Nivel 1 (observación):** se crea y ejecuta directo (`crearYEjecutarNivel1`); el Gerente responsable puede **revertir**.
  - **Nivel 2 (apercibimiento):** `Borrador → Pendiente aprobación 1 (Gerente) → Pendiente aprobación 2 (Gerente RRHH) → Pendiente descargo → Descargo recibido → Ejecutada`. Rechazo en cualquier punto → `Rechazada`.
- **Escalada (`escalada.js`):** `calcularAntecedentesDisciplinarios(nro)` → total, observaciones, apercibimientos, `riesgoEscalada` (si ≥3 apercibimientos sugiere sumario).
- **Reglas:** sanción retroactiva (>30 días) confirma; duplicado misma infracción+fecha confirma; evidencia adjunta (`evidencia-sancion`); solo se sanciona a legajo Activo; exportar Excel (xlsx); imprimir acta con firmas.
- **Permisos:** Supervisor (propone), Gerente responsable (aprueba 1 y revierte nivel 1), Gerente RRHH (aprueba 2), RRHH/Admin (descargo y ejecución).

---

## 2.6 Enfermos y accidentes

- **Propósito:** seguimiento médico de asociados: casos abiertos, certificados, retiros mensuales por ART, cierre por alta médica o decisión de RRHH.
- **Entidades:**
  - `DB.casosEnfermosAccidentes` — `id, legajoIdLocal, nroSocio, nombreAsociado, tipoAsociado, servicio, area, supervisor, categoriaIdLocal, tipoCaso ('Enfermedad'|'Accidente'), subtipo, fechaInicio, fechaAltaPrevista, observaciones, valorHoraCongelado, datosEnfermedad {diagnostico, especialidad, medicoTratante, kinesiologo, contacto}, datosAccidente {fechaHora, lugar, testigos, descripcionHecho}, estado ('Abierto'|'Cerrado por alta médica'|'Cerrado por decisión RRHH'|'Anulado'), fechaCierre, cerradoPor, observacionesCierre, pendienteAdministrativo, anulado`. Tabla: `casos_enfermos_accidentes`.
  - `DB.certificadosMedicos` — `id, casoIdLocal, tipoCertificado, fechaEmision, estadoValidacion ('Pendiente'|'Aprobado'|'Observado'|'Rechazado'), archivo, observaciones`. Tabla: `certificados_medicos`.
  - `DB.retirosEnfermosPendientes` — retiros mensuales (periodo, horasAjustadas, montoRetiro). Tabla homónima.
  - `DB.casoEventosEnfermos` — timeline de eventos. Tabla homónima.
- **Subtipos:** Enfermedad: 'Enfermedad común' / 'Enfermedad profesional'. Accidente: 'Accidente laboral' / 'Accidente in itinere' / 'Accidente no laboral'.
- **Funciones:** `renderEnfermedades`/`renderAccidentes` (tabs, con filtros), `abrirNuevoCasoEnfermos` (prefill: `{legajoNro, fechaInicio, art42IdParaConvertir}`), `confirmarNuevoCasoEnfermos`, `abrirDetalleCasoEnfermos` (con certificados, retiros, cierre), `abrirCerrarCasoEnfermos`/`confirmarCerrarCasoEnfermos`, certificados (`certificados.js`: `abrirCargarCertificado`, `certificadosDeCaso`), retiros (`retiros.js`: `abrirGestionarRetiro`, `retirosDeCaso`), `marcarArt42Convertido` (puente con Liquidación Art.42).
- **Reglas:**
  - **Valor hora congelado** al abrir el caso (`congelarValorHora(legajo, categoriaIdLocal, fechaInicio)` desde `categoria_helper.js`) — se usa para los retiros mensuales.
  - Un legajo no puede tener 2 casos abiertos a la vez.
  - Fecha de inicio >30 días atrás confirma.
  - Cerrar por "Alta médica" exige certificado de tipo Alta cargado; cerrar por "Decisión RRHH" exige observaciones.
  - Diagnóstico visible solo si `puedeVerDiagnostico()`.
  - Puente Art.42: una fila Art.42 de Liquidación puede convertirse en caso de enfermedad.
- **Permisos:** RRHH, Operaciones (diagnóstico), Administrador total.

---

## 2.7 Situaciones legales

- **Propósito:** casos legales (reclamos de asociados) con abogados, estudios, novedades con timeline, adjuntos y cierre con resultado.
- **Entidades:**
  - `DB.casosLegales` — `id, asociado, nroSocio, estado, abogado, estudio, abogadoCooperativa, estudioCooperativa, supervisorAlAlta, supervisorActual, servicio, fechaInicio, tipoReclamo, tipoCliente, montoReclamado, descripcion, relacionOtrosCasos, fechaProximaInstancia, ultimaNovedad, fechaCierre, resultado, montoFinal, cerradoPor, observacionesCierre, anulado`. Tabla: `casos_legales`.
  - `DB.novedadesCasoLegal` — `id, casoIdLocal, tipoEvento, fechaEvento, descripcion, cargadaPor, adjuntosSubidos`. Tabla homónima.
  - `DB.casosLegalesAdjuntos` — adjuntos por caso (url, nombreArchivo). Tabla homónima.
  - `DB.estadosLegales` — catálogo de estados.
- **Estados:** `Pre-legal → Carta documento recibida → Carta documento contestada → Conciliación SECLO → Conciliación interna → Estado judicial → Cerrado`.
- **Tipos de reclamo:** Despido, Indemnización, Salarios adeudados, Accidente/enfermedad, Otro.
- **Tipos de novedad:** Audiencia, Presentación escrito, Notificación, Sentencia, Reunión, Otro.
- **Resultados de cierre:** Ganado, Perdido, Conciliado, Archivado sin resolución.
- **Funciones:** `renderCasosActivos` (stats: activos, conciliación, juicios, abogados), `filtrarCasosActivos`, `abrirNuevoCasoLegal`/`confirmarNuevoCasoLegal`, `abrirDetalleCasoLegal` (timeline + adjuntos), `abrirAgregarNovedad`/`confirmarAgregarNovedad`, `abrirCerrarCasoLegal`/`confirmarCerrarCasoLegal`, adjuntos (`adjuntos_legal.js`), `supervisorActual(c)`.
- **Permisos:** RRHH / Administrador total.

---

## 2.8 Uniformes (v2)

- **Propósito:** pedidos de uniforme con flujo de **15 estados** y doble handshake entre RRHH, Logística y Supervisor. Rediseño v2 sobre 6 tablas (la tabla vieja `uniformes` queda como histórico).
- **Entidades:**
  - `DB.pedidosUniformes` — `id, legajoIdLocal, nroSocio, nombreOperario, servicio, supervisorAsignado, origen ('Supervisor'|'RRHH - Ingreso'|...), solicitadoPor, fechaSolicitud, motivo, conDescuento (bool), observaciones, estado, motivoRechazo, motivoCancelacion, constanciaPolicialAdjuntoId, fechaEntregaOperario, fechaDevolucionSupervisor, anulado`. Tabla: `pedidos_uniformes`.
  - `DB.pedidoUniformePrendas` — `id, pedidoIdLocal, prenda, talle, cantidad, anulado`. Tabla homónima.
  - `DB.pedidoUniformeEventos` — timeline (`pedidoIdLocal, estadoDesde, estadoHasta, ejecutadoPor, ejecutadoEn, observaciones`). Tabla homónima.
  - `DB.descuentosUniformePendientes` — descuentos por incumplimiento (monto, cuotas). Tabla homónima.
- **Catálogos (`catalogos.js`):** `PRENDAS`, `TALLES_POR_PRENDA`, `MOTIVOS`, `ORIGENES`, `ESTADOS_UNIFORMES`, `ESTADOS_FINALES`, `conDescuentoSegunMotivo(motivo)` (algunos motivos descuentan en 4 cuotas), `esTemporadaCamperaPolar()`, `talleSugerido(legajo, prenda)`.
- **Flujo de estados:**
  ```
  Borrador → Pendiente autorización RRHH → Autorizado, esperando envío a Logística
  → En preparación por Logística → Enviado, esperando confirmación RRHH
  → Recibido por RRHH, listo para retirar Supervisor → Retirado, esperando confirmación Supervisor
  → Confirmado, en tránsito a operario → Entregado con firma, esperando constancia + viejo
  → Constancia + viejo entregados, esperando confirmación RRHH → Cerrado
  Rechazado por RRHH · Cancelado por Solicitante · Vencido → Descuento aplicado por incumplimiento
  ```
- **Reglas:** motivo 'Robo con denuncia' pide constancia policial (adjunto `denuncia-policial-uniforme`); entrega con firma pide adjunto de constancia firmada (obligatorio); cierre con checklist de prendas que faltaron devolver → genera descuento de 1 cuota; plazo de devolución 15 días desde la entrega → estado 'Vencido' → RRHH aplica descuento (`abrirAplicarDescuentoIncumplimiento`) o devolución tardía (`reactivarDesdeVencido`); camperas/polar solo en temporada (marzo a septiembre).
- **Integración con Altas:** `crearEntregaUniformeDesdeAlta(legajo)` (window binding) crea automáticamente el borrador del kit inicial con las prendas de `legajo.tallesUniforme` + ambo + calzado.
- **Permisos:** Supervisor (solicita, confirma retiro, entrega con firma), RRHH/Admin (autoriza, confirma recepción, marca retiro, cierra, descuentos), Logística (recibe y envía).

---

## 2.9 Reasignaciones

*(Documentado en `01_Flujo_Ingreso.md`, sección 1.8.)*
