# 01 — Flujo de ingreso de asociados (Selección e Ingreso)

Cadena de etapas encadenadas. La señal real de "ya ingresó" es
`DB.catAltPendientes` con `estado === 'Alta completada'`.

```
Pedido de personal → Candidatos → Psicotécnico → Preocupacional → Documentación → Alta → Legajo
```

Cada etapa siguiente se crea a partir de la anterior (por DNI o `candidatoId`).
Guards de idempotencia por DNI evitan duplicados en cascada al re-aprobar.

---

## 1.1 Pedidos de personal

- **Propósito:** los supervisores solicitan cubrir puestos en sus servicios.
- **Entidad:** `DB.pedidos` — `id, fecha, supervisor, servicio, zona, puesto, perfil, horario, estado, detalle`. Tabla: `pedidos`.
- **Pantalla:** tabla con columnas fecha/supervisor/servicio/zona/puesto (chip)/perfil/horario.
- **Funciones:** `renderPedidos`, `filtrarPedidos`, `guardarPedido`, `verDetallePedido(id)`, `renderPerfilInputs` (campos de perfil según puesto).
- **Reglas:** `pedidosVisiblesParaUsuario` — el Supervisor ve solo sus servicios (match por nombre o legajo activo en ese servicio); RRHH/Admin ven todos.
- **Permisos:** Supervisor, Operaciones, RRHH, Administrador total.
- **Integración:** `perfilPersonalAtributos` → tabla `perfil_personal_atributos` (define los campos de perfil por puesto).

---

## 1.2 Candidatos

- **Propósito:** ABM de postulantes con flujo de estados hasta pasar a psicotécnico.
- **Entidad:** `DB.candidatos` — `id, apellido, nombre, dni, cuit, fecNac, estadoCivil, genero, nacionalidad, tel, email, calle, piso, zona, partido, localidad, disponibilidadHoraria, medio, nombreReferido, rrhhId, obs, estado, motivoRechazo, asistio, fechaCita, horaCita, creadoPor`. Tabla: `candidatos`.
- **Flujo de estados:**
  `Sin citar → Citado → Entrevistado → Aprobado → (pasa a Psico)`
  - `Rechazado` desde Entrevistado (motivo obligatorio).
  - `Baja` desde otros estados (motivo; radio en modal `onChangeEstadoBajaCand`).
  - Histórico: `Rechazado`, `Baja`, `Caducado`, `MT Social`, `MT con deuda`.
- **Pantalla:** tab principal `tabCandPrincipal` con 4 secciones: `base` (activos/histórico), `calendario`, `link` (postulación), `importar` (CSV histórico).
- **Funciones:** `renderCandidatos`, `filtrarCandidatos`, `poblarFiltrosColumnasCandidatos` (zona/estado), `guardarCandidato`, `editarCandidatoPorId`, `abrirCitarPorId`/`guardarCita`, `abrirResultadoPorId`/`guardarResultadoEntrevista`, `aprobarCandidatoPorId`, `rechazarCandidatoPorId`, `pasarAPsicoPorId`, `registrarAsistencia`, `abrirDetalleCandidatoPorId`, `abrirBajaCandidatoPorId`/`confirmarBajaCandidato`, adjuntos de entrevista/proceso.
- **Reglas:** DNI 6-8 dígitos + unicidad al crear/editar. Autosave en localStorage (`candidatos:nuevo`, `candidatos:edit:<id_local>`). `aprobarCandidatoPorId` exige entrevista registrada.
- **Integraciones:** `pasarAPsicoPorId` crea el registro en `DB.psicos`; calendario comparte `getCandById`/`getIdxById` vía `idLocalCand`.
- **Permisos:** RRHH / Administrador total.
- **ScreenConfig:** `{ candidatos: { title:'Candidatos', btn:'+ Nuevo candidato', fn:abrirNuevoCandidato, render:tabCandPrincipal('base') } }`.

### Calendario de entrevistas (`candidatos/calendario.js`)
- **Entidad:** `DB.turnos` — `id, candidatoId, nombre, fecha, hora, estado ('Pendiente'/'Confirmado'/'Cancelado'), responsable, observacion`. Tabla: `turnos`.
- **Config:** `configAgente = { diasHabilitados:[1..5], horaDesde:'09:00', horaHasta:'17:00', duracion:20, maxPorTurno:2 }`; `getFranjas()` genera franjas.
- **Grilla:** 7 días × franjas; Confirmado=rojo, Pendiente=azul, libre=verde. `cambiarSemana`/`irHoy`, `agendarTurno(fecha,hora)` (valida capacidad), `verTurno`, `confirmarCalTurno` (rollback si `supaSync` falla), `eliminarCalTurno` (soft → 'Cancelado'), `vincularCandidatoTurno`.
- **Reglas:** `horaAFranja(h)` normaliza a la franja; slot lleno si `turnos.length >= maxPorTurno`.

### Link público
- Muestra `${location.origin}/postularme` (formulario externo `postularme.html`, en vite.config.js) + botón copiar. `renderLinkPublico`, `copiarLinkPostulacion`.

### Importador histórico (`candidatos/importadorHistorico.js`)
- Importa la planilla real de entrevistas de RRHH (CSV). Plantilla de 28 columnas (`fecha, entrevistadora, modalidad, apellidos, nombres, dni, genero, telefono, edad, localidad, zona, disponibilidad, experiencia, presencia, exp_verbal, compr_consignas, predisposicion, rel_interpersonal, evaluacion_final, observaciones, medio, detalle_convocatoria, correo_electronico, posible_servicio, fecha_psico, psicotecnico, fecha_ingreso, obs_psicotecnico`).
- `fechaCsvAISO` convierte DD/MM/AAAA→YYYY-MM-DD (campo `fecha_cita` es columna date nativa). `mapearEstadoDesdeResultado` (desaprob→Rechazado, aprob→Aprobado, no reconocido→Entrevistado). Preview con validación de DNI duplicado; importa solo `_valido && !_yaImportado`.

---

## 1.3 Psicotécnico

- **Propósito:** registro y gestión de evaluaciones psicotécnicas de candidatos aprobados.
- **Entidad:** `DB.psicos` — `id, dni, candidatoId, nombre, fechaRealizacion (ISO), resultado ('Pendiente'/'Apto+'/'Apto'/'Apto-'/'Apto condicional'/'No Apto'), etapas, estado ('En proceso'/'Aprobado'/'Rechazado'/'Ingreso'), observaciones, adjuntos`. Tabla: `psicos`.
- **Etapas:** `psicotecnico` y `prelaboral` obligatorias; `antecedentes` y `libreta` opcionales (checkbox para habilitar).
- **Flujo:** `En proceso → Aprobado | Rechazado`. Al aprobar crea registro en `DB.catAltPendientes` (`estado:'Pendiente de alta'`) y pasa a Altas. `Rechazado` actualiza el candidato original con motivo. `Revertir` vuelve a 'En proceso'. El estado `Ingreso` lo setea Altas al confirmar.
- **Funciones:** `renderPsico` (filtra `yaIngresadoPsico`, ordena por `fechaRealizacion` asc, tabs activos/histórico, stats), `guardarPsico`, `abrirGestionPsico` (modal dinámico `ensureModal`), `guardarEtapasPsico`, `aprobarPsico` (guard idempotencia por DNI), `rechazarPsico`, `revertirPsico`, adjuntos, `analizarInformePsicoIA`/`usarDatosIAInformePsico`.
- **Reglas:** `yaIngresadoPsico(dni)` = existe `catAltPendientes` con `estado==='Alta completada'`. Registros sin fecha van al final.
- **Permisos:** RRHH / Administrador total.

---

## 1.4 Preocupacional

- **Propósito:** examen pre-ocupacional médico de candidatos aprobados en psico.
- **Entidad:** `DB.preocupacionales` — `id, dni, candidatoId, nombre, fechaTurno, prestador, fechaResultado, resultado ('Apto'/'Apto con observaciones'/'No Apto'), motivo, estado, observaciones, adjuntos`. Tabla: `preocupacionales`.
- **Prestadores:** MEDE, Grupo CMC, IDT.
- **Flujo:** `En proceso → Aprobado | Rechazado` (motivo obligatorio). Al aprobar crea registro en `DB.documentacionIngreso` (estado 'En proceso'). `Revertir` solo si no hay documento vivo para ese DNI. `bajaPreocup` desvincula.
- **Funciones:** `renderPreocup`, `tabPreocup`, `filtrarPreocup` (buscar/zona/estado), `poblarFiltrosColumnasPreocup`, `abrirGestionPreocup` (modal `modal-preocup-gestion` con prestador y fecha turno), `guardarPreocup`, `aprobarPreocup` (guard idempotencia), `rechazarPreocup`, `revertirPreocup`, adjuntos, `analizarAptoMedicoIA`/`usarDatosIAApto`.
- **Regla de acción en fila:** botón Revertir si no hay `documentacionIngreso` vivo ('En proceso'/'Aprobado' y `!anulado`) para ese DNI, si no "Cerrado".
- **Permisos:** RRHH / Administrador total.

---

## 1.5 Documentación de ingreso

- **Propósito:** carga y aprobación de la documentación obligatoria del candidato.
- **Entidad:** `DB.documentacionIngreso` — `id, dni, candidatoId, nombre, antecVencimiento, libretaAplica (bool), libretaVencimiento, cursoTiene (bool), cursoVencimiento, estado ('En proceso'/'Aprobado'/'Rechazado'/'Anulado'), anulado (bool), motivo, observaciones, adjuntos`. Tabla: `documentacion_ingreso`.
- **Flujo:** `En proceso → Aprobado | Rechazado` (motivo obligatorio). `excepcionDocum` aprueba con excepción (requiere justificación). `bajaDocum` → anulado. Al aprobar `_crearAltaDesdeDocum` crea `catAltPendientes` ('Pendiente de alta') — guard idempotencia por DNI (devuelve bool; los llamadores gatean el toast de éxito).
- **Funciones:** `renderDocum` (stats; acciones: `abrirGestionDocum` si 'En proceso', `revertirDocum` si no — salvo que ya haya 'Alta completada' → "Cerrado"), `tabDocum`, `filtrarDocum`, `poblarFiltrosColumnasDocum`, `guardarDocum`, `recalcularVencAntec`/`recalcularVencLibreta` (setMonth), `toggleSeccionLibreta`/`toggleSeccionCurso`, `aprobarDocum`, `excepcionDocum`, `bajaDocum`, `rechazarDocum`, `revertirDocum`, adjuntos (antecedentes/libreta/curso), `analizarAntecedentesIA`.
- **Regla compartida:** `calcularEstadoVencimiento(vencimiento)` (exportada y reutilizada por legajos.js) — vencimiento próximo/caducado.
- **Permisos:** RRHH / Administrador total.

---

## 1.6 Altas de asociados

- **Propósito:** alta formal del asociado con modal de **8 tabs**, precargado desde el flujo psico→docum. Al confirmar crea el **legajo** y el **nro de socio**.
- **Entidad:** `DB.catAltPendientes` — `id, dni, nombre, candidatoId, psicoId, estado ('Pendiente de alta'/'Alta completada'), creadoDesde`. Tras confirmar guarda copia histórica por tab: `identificacion {nombre, dni, cuit, tel, mail, estadoCivil, nac, genero, fecNac, fechaIngreso}`, `domicilio {direccion, zona, localidad, partido, codigoPostal}`, `operativo {funcion, servicio, supervisor, periodoPrueba, categoria}`, `uniforme {ambo, calzado, ...tallesUniforme}`, `capital {integracion, formaPago}`, `seguros {seguro, polizas, obraSocial, obraSocialInicioTramite}`, `cuentaBancaria {banco, cbu}`. Tabla: `cat_alt_pendientes`.
- **Tabs:** 0 Identificación, 1 Domicilio, 2 Operativo, 3 Uniforme, 4 Capital, 5 Seguros, 6 Cuentas bancarias, 7 resumen/confirmación. `ALTA_TABS = 8`; `tabAlta(idx)`, `tabAltaSiguiente`/`tabAltaAnterior`.
- **Funciones:** `renderAltas` (filtro `estado==='Pendiente de alta'`, badges Confirmado+Apto, lookup de psico), `filtrarAltas`, `poblarFiltrosColumnasAltas`, `poblarSelectsAltas`, `abrirModalAlta`, `confirmarAlta`, `onChangeZonaAlta`/`onChangePartidoAlta`/`onChangeLocalidadAlta`/`onChangeServicioAlta`, `toggleReingresante`/`buscarLegajoReingresante`, pólizas (`agregarFilaPoliza`/`eliminarFilaPoliza`/`leerPolizas`), `recalcularInicioObraSocial`, adjuntos póliza y constancia MT.
- **Reglas de negocio (`confirmarAlta`):**
  - Validación por tab (campos obligatorios por sección).
  - Pólizas duplicadas (mismo N° no vacío) bloquean → tab 5.
  - **CBU:** 22 dígitos numéricos exactos si está cargado; faltante NO bloquea, solo avisa.
  - **Guard de DNI duplicado:** legajo Activo con mismo DNI siempre bloquea; legajo de baja bloquea salvo reingreso vinculado (`_legajoAnteriorEncontrado`).
  - **Nro de socio:** `nro = max(nros existentes en DB.legajos) + 1`.
  - Legajo creado: `estado:'Activo'`, `ingreso` DD/MM/AAAA, `fechaReincorp`/`legajoAnteriorNro` si reingresante, `periodoPrueba` default 6 (meses), `tallesUniforme` jsonb (chomba/grafa/buzo/campera/gorra).
  - Columna vieja `art` ya no se completa — reemplazada por `polizas` (jsonb múltiple).
  - Al confirmar: `window.crearEntregaUniformeDesdeAlta(legajo)` (genera el borrador de uniforme del kit inicial), psico pasa a `estado='Ingreso'`, `catAltPendientes.estado='Alta completada'` + copia histórica por tab.
- **Integraciones:** obra social `calcularFechaAltaObraSocialISO` (`@shared/obraSocial.js`, +3 meses, editable), adjuntos PDF `'poliza-seguro'` y `'monotributo'` (se suben al elegir archivo, invalida el anterior), uniformes.
- **Permisos:** RRHH / Administrador total.

---

## 1.7 Legajos

- **Propósito:** vista y gestión del legajo del asociado (tabla + detalle modal + impresión + importadores CSV).
- **Entidad:** `DB.legajos` — `nro (socio), nombre, dni, funcion, servicio, supervisor, sector, ingreso, estado ('Activo'/'Baja'), estadoLegal, estadoMedico, fechaBaja, fechaReincorp, legajoAnteriorNro, seguro, localidad, partido, codigoPostal, tel, mail, cuit, claveFiscal, inaes, estadoCivil, nac, genero, banco, calzado, ambo, tallesUniforme, periodoPrueba, fechaIngresoPrueba, adjuntosLegal, adjuntosMedico, direccion, fecNac, zona, cbu, polizas, obraSocial, obraSocialInicioTramite, formaPago, integracion, categoria`. Tabla: `legajos`.
- **Período de prueba:** `calcularPrueba(l)`: `diasTotales = periodoPrueba * 30`, `diasPasados = floor((hoy - ingreso)/86400000)`, `pct = min(100, round(diasPasados/diasTotales*100))`, `enPrueba = diasPasados < diasTotales`. Barra de progreso con color (>80 rojo, >50 naranja, si no azul), "Día X/Y"; badge "Completado" si terminó.
- **Funciones:** `renderLegajos` (columnas: checkbox, N°, nombre+avatar, DNI, función, servicio, supervisor, ingreso, período de prueba, estado+CBU faltante, estadoLegal+adjuntos, antecedentes con vencimiento, fechaBaja, fechaReincorp, estadoMedico+seguro, obra social), `filtrarLegajos`, `verLegajo(nro)` (modal con 4 tabs: Datos personales, Operativo, Movimientos, Historial; `pr.enPrueba` en cabecera), `tabLeg`, `editarLegajoActual`, `guardarEdicionLegajo`, `eliminarLegajoActual`, `imprimirLegajo` (ficha en ventana nueva + print automático), `verAdjuntoLegajo`, `toggleAltaObraSocial`, `SECTORES_ADMIN`, `toggleSeccionVacacionesLegajo`, selección múltiple, MiPyME.
- **Tab Documentación del detalle:** vencimientos de antecedentes/libreta/curso + cuotas de uniforme desde `DB.descuentosUniformePendientes` (filtro `legajoIdLocal === String(l.nro)`; `motivoGeneracion`, `fechaGenerado`, `montoTotal`, `cuotasTotales`, `cuotasCobradas`, estado 'Terminado'/'Cancelado').
- **Visibilidad por rol:** `puedeVerMedico` (Admin/RRHH/Operaciones), `puedeVerCC` (Admin/RRHH/Finanzas), `puedeVerClaveFiscal` (Admin/RRHH).
- **Integraciones:** `_notificarRRHH(legajo, mensaje)` (tipo `legajo_monotributo_pendiente`, destinatarios = nombres de `DB.rrhh`); `calcularEstadoVencimiento` importado de documentacion; adelantos/préstamos del asociado en Movimientos.
- **Importadores:** `importador.js` (`abrirImportadorLegajos`, `descargarPlantillaLegajos`, `confirmarImportacionLegajos`) y `importarCbu.js` (`abrirImportarCbu`, `confirmarImportarCbu`) — CSV.
- **Permisos:** RRHH (filtros columnas), Finanzas (vista parcial), Administrador total.

---

## 1.8 Reasignaciones (cambio de servicio/supervisor)

- **Propósito:** cambio de servicio/supervisor de un asociado con aprobación, sugeridor IA de servicio destino.
- **Entidad:** `DB.reasignaciones` — `id, nro, nombre, servicioOrigen, servicioDestino, supervisorOrigen, supervisorDestino, categoria, motivo, motivoDetalle, fechaSolicitud, fechaEfectiva, estado, observaciones, creadoPor, aprobadoPorRrhh, fechaAprobacionRrhh, motivoRechazoRrhh`. Tabla: `reasignaciones`.
- **Flujo (6 estados):** `Borrador → Pendiente → Aprobada esperando fecha efectiva → Aprobada ejecutada`; `Rechazada`; `Anulada`.
- **Config:** `DB.motivosReasignacionCfg`/`DB.aprobadoresReasCfg` (`{id, nombre|cargo, anulado}`) → tablas `motivos_reasignacion`/`aprobadores_reasignacion`. Catálogo: aprobadores `['Gerente de Operaciones','Gerente de RRHH']`; 12 motivos (Baja del servicio, Conflicto con cliente, …Otro).
- **Funciones:** `renderReasignacionesInicial` (tabs Pendientes/Historial/Rotación), `abrirNuevaReasignacion`, `abrirModalReasDesde(nro)` (precarga desde legajo), `abrirBorradorReasignacionPorId`, guardar borrador/edición, `sugerirServicioDestino` + `pintarSugerenciasDestino`/`elegirSugerenciaDestino(idx)`, aprobar/rechazar/anular/ejecutar (persisten con supaSync).
- **Sugeridor IA (`sugeridor.js`):** POST `/api/sugerir-reasignacion` (serverless Vercel) con Bearer token de `SUPA.auth.getSession()`; API key Anthropic solo server-side.
- **Permisos:** RRHH (aprobación), Operaciones/Supervisor (solicitud), Administrador total.
