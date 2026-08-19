# 03 — Liquidación y sueldos

Área que convierte las horas trabajadas (o el valor mensual fijo) en haberes.
Incluye categorías salariales, SMVM, grillas de horas, personal administrativo,
mantenimiento, retenes, monotributos, retenciones, descuentos, paritarias y feriados.

> Estado de migración: **Categorías** migrado (`src/modules/categorias/`),
> **Retenciones** migrado (`src/modules/retenciones/`), **Descuentos** migrado
> (`src/modules/descuentos/`). El resto vive en `src/legacy.js`.

---

## 3.1 Categorías salariales (migrado)

- **Propósito:** ABM de categorías base con sus **valores de hora por servicio** y **plus adicionales**, con versionado de vigencia. Es el origen del `valor hora` que usa Liquidación de horas, Retenes, Mantenimiento y Enfermos (congelado).
- **Entidades:**
  - `DB.categoriasBase` — `id, nombre, activa, anulado`. Tabla: `categorias_base`.
  - `DB.valoresHoraCategoria` — valores de hora por categoría/servicio con vigencia (fechaDesde/fechaHasta). Tabla homónima.
  - `DB.plusAdicionales` + `DB.valoresPlus` — conceptos plus y sus valores. Tablas homónimas.
- **Funciones:** `renderCategorias`, `abrirNuevaCategoria`, `guardarCategoria`, gestión de valores (`valores.js`: alta/edición de valores hora con vigencia, `getCategoriaVH`), `plus.js`, `consultas.js` (helpers de consulta, con tests en `consultas.test.js`).
- **Reglas:** un valor hora vigente = categoría+servicio dentro de su rango de fechas; los módulos de liquidación buscan con `getCategoriaVH(categoriaIdLocal, servicio, fecha)`. Enfermos lo usa congelado a la fecha de inicio del caso.
- **Permisos:** RRHH / Administrador total / Finanzas.

---

## 3.2 SMVM histórico (legacy)

- **Propósito:** registro de períodos del Salario Mínimo Vital y Móvil. Lo usa Altas (integración = 5% del SMVM) y las categorías.
- **Entidad:** `DB.smvm[]` → tabla `smvm`.
- **Funciones:** `renderSMVM`, `agregarSMVM`, `eliminarSMVM`.
- **Permisos:** Administrador total, Finanzas.

---

## 3.3 Liquidación de horas (legacy)

- **Propósito:** carga de horas diarias de los asociados por servicio/mes, con **tipos de hora**, **Art.42**, **EFT** (Espacio de Facturación Total), autorizaciones y motivos de no facturación.
- **Entidades:**
  - `DB.grillasLiq` — `objCodigo, periodo, supervisor, horasEFT, asociados[]`. Cada `asociado` trae: `categoria, nro, horas{iso}, facturable{iso}, motivoNoFact{iso}, infoEFT{iso: {fueraEFT, autorizado, motivo}}, tipoHora (facturable|no_facturable|art42), esExtra, esEnfermedad, esReten, esEspecial, catAlt*`. Tabla: `grillas_liq`.
  - `DB.pendientesAuth` / `DB.historialAuth` — autorizaciones pendientes/históricas por tipo: `no_facturable | fuera_eft | cat_alt`. Tablas homónimas.
  - `DB.alertasEFT` — alertas de EFT. Tabla homónima.
  - `DB.motivosNoFact` — motivos de no facturación: Art.42, Retén en base, Retén cubriendo, Capacitación interna/recibida, Franquero, Licencia gremial, etc.
  - `DB.motivosFueraEFT` — motivos de estar fuera del EFT: `REEMPL, EVENTO, EXTRAORD, INCIDENT, MANT`.
  - `DB.parametrosServicio` — días/horas por servicio para precargar horas.
  - `DB.categoriasSalariales` — categorías sindicales.
- **Tabs:** Grillas, Art.42, Alertas EFT, Resumen del mes, Autorizaciones pendientes, Historial, Mis autorizaciones, Motivos no facturación, Motivos fuera EFT, Categorías pendientes.
- **Funciones:** `renderLiquidacion`, `poblarSelectsLiquidacion`, `getCategoriaVH`, `renderGrillasLiq`, `setHoraGrilla`, `generarHorasPrecargas` (usa `parametrosServicio`: diasSemana, horasPorDia, trabajaFeriados/Finde), `agregarAsocDesdeSearch`/`confirmarAgregarAsoc`, `validarFechasArt42`, `solicitarCatAlt`.
- **Reglas:** horas facturables vs no facturables con motivo obligatorio; Art.42 es un régimen especial (validación de fechas); EFT con control de autorización (`fueraEFT` requiere `autorizado`+`motivo`); categoría alternativa para ausencias (catAlt) requiere solicitud/autorización.
- **Permisos:** RRHH, Operaciones, Finanzas, Administrador total (filtrado por grillas propias para supervisores vía `esSupervisor`).

---

## 3.4 Liquidación Administración (liq_admin, legacy)

- **Propósito:** liquidación del personal **administrativo** (valor mensual fijo por persona, no por horas), con tipos de carga, ajustes de nivelación y un **suplemento** paralelo.
- **Entidades (anidadas por mes):**
  - `DB.liqAdminHoras[mes][id]`, `DB.liqAdminTipo[mes][id]` (tipo: `NORMAL|ART42|AJ|AI`), `DB.liqAdminValores`, `DB.liqAdminAjustes[mes][id]` (ajusteNivelacion, ajusteMotivo, ajusteUsuario, ajusteFecha), `DB.liqAdminSuplemento[mes][id]`, `DB.liqAdminPeriodos[]`.
  - Tablas: `liq_admin_horas`, `liq_admin_suplemento`, `liq_admin_periodos`, `liq_admin_tipo`, `liq_admin_ajustes`.
- **Tabs:** `planilla` (`renderLiqAdmin`) y `suplemento` (`renderLiqSuplemento`). Selector de mes con rango -2..+3. Stats: total/hs/art42/ausencias (AJ/AI cuentan ausencias).
- **Funciones:** `tabLiqAdmin`, `accionLiqAdmin`, `syncPeriodoAdmin` (upsert por `idPersonaPeriodo`), `abrirModalAjusteNivelacion` (solo Finanzas, motivo obligatorio + auditoría usuario/fecha), `abrirDetalleAdicionalSupervision`, `abrirModalNuevoAdminLiq`/`confirmarNuevoAdminLiq` (rechaza duplicados persona+periodo; toma área/categoría del legajo), `eliminarLiqAdmin`, suplemento (`syncPeriodoSuplemento`, `setHoraSuplemento`, `actualizarHorasSuplemento`, `actualizarValorHoraSuplemento`, `abrirModalNuevoSuplemento`, `confirmarNuevoSuplemento`).
- **Integraciones:** usa `esEditorSupervision()` y `adicionalSupervisionDe(nombre, mes)` del módulo de Supervisión de Servicios (adicional por supervisión + ajuste de nivelación). `reconciliarPeriodosOperaciones()` (main.js) reconstruye las estructuras anidadas desde arrays planos una vez por sesión.
- **Permisos:** Administrador total, RRHH, Finanzas.

---

## 3.5 Mantenimiento (legacy)

- **Propósito:** liquidación de horas del personal de mantenimiento.
- **Entidades:** `DB.mantHoras[mes][id]` → tabla `mant_horas_rows` (vía `syncPeriodoMant` con `idPersonaPeriodo`); `DB.mantenimiento[]`.
- **Tabs:** `mant-tab-planilla` / `mant-tab-resumen`.
- **Reglas clave:** **HS_MINIMO = 200** horas mínimas garantizadas: `hsCobrar = max(hsReales, 200 - rechazos*8)`. Carga rápida (`abrirCargaRapidaMant`: desde/hasta, horas 8, checkboxes lunes-viernes por defecto, categoría alternativa desde `DB.categoriasSind`). `verGrillaMantDetalle` muestra hs reales vs hs a cobrar con el mínimo.
- **Permisos:** Administrador total, RRHH, Operaciones, Finanzas.

---

## 3.6 Retenes (legacy)

- **Propósito:** gestión de **retenes** (personal de reemplazo que cubre servicios).
- **Entidades:** `DB.retenes[]` → tabla `retenes` (activo); `DB.retenHoras[mes][id]` → tabla `retenHorasRows` (vía `syncPeriodoReten`). `getHorasRetenDeServicios(mes)` genera retenes `soloServicio` desde las horas de las grillas de servicios (id `svc_<nombre>`).
- **Tabs:** `ret-tab-planilla` / `ret-tab-resumen`.
- **Celda dividida por día:** arriba horas del servicio (solo lectura, verde; `AI`=rechazo en rojo) + abajo input manual editable con especiales `F`/`AJ`/`AI` (violeta/naranja/rojo) y categoría alternativa.
- **Reglas:** `HS_MINIMO = 200`; `hsCobrar = max(hsServicio + hsManual, HS_MINIMO - diasRechazados*8)`; `vh = getCategoriaVH(categoriBase)`; total = hsCobrar × vh. Carga rápida `⚡ Rápido` oculta si `soloServicio`. Categoría base editable por fila.
- **Permisos:** Administrador total, RRHH, Operaciones, Finanzas.

---

## 3.7 Liquidaciones (legacy)

- **Propósito:** proceso completo de liquidación con conceptos configurables (produce el recibo).
- **Entidad:** `DB.liquidaciones` → tabla `liquidaciones`.
- **Reglas:** permiso `esAdmin` / `esSupervisor` (este último filtra por sus grillas); registra `registradoPor: currentUser?.nombre` y `autorizadoPor` (aprobación). Integración: `getValoresPeriodo` y categorías desde el módulo `categorias`.
- **Permisos:** Administrador total, RRHH, Finanzas (y Supervisor para sus grillas).

---

## 3.8 Monotributos (legacy)

- **Propósito:** gestión de los monotributistas de la cooperativa: categorías, cambios, pagos mensuales, importación CSV e historial.
- **Entidades:** `DB.monotributistas[]` → tabla `monotributos`; `DB.monoCambios[]` → `mono_cambios`; `DB.monoPagosMes[]` → `mono_pagos_mes`; `DB.historialMono[]`.
- **Funciones:** `renderMonotributos`, `_chequearAlertaMipymeAnual` (alerta marzo-abril; certificado MiPyME vence 30/04 — cuenta legajos Activo con `mipymeEstado!=='TRAMITADO'`), `abrirModalNuevoMonotributo`, `tabMonotributos`, importador (`abrirImportadorMonotributo`/`confirmarImportMonotributo`), pagos (`abrirMesMonoPagos`/`renderMonoPagos`/`tildarPagoMono`/`exportarMonoPagosCSV`), historial (`abrirHistorialMono`/`renderHistorialMono`).
- **Reglas:** cambios de categoría con motivo (`decidoPor`); certificado MiPyME vence cada 30/04.
- **Permisos:** Administrador total, RRHH, Finanzas.

---

## 3.9 Retenciones (migrado)

- **Propósito:** retenciones sobre haberes de los asociados (tipos, montos, liberación).
- **Entidad:** `DB.retenciones` — con `tipoLabel` (⚡Conflicto / 🏥Enfermedad / 📋Otra), `estado` ('Activa'|'Liberada'|'Pendiente'), `periodo`, `monto`, `motivo`. Tabla: `retenciones`. También `DB.motivosRetencion`.
- **Funciones (migradas):** `renderRetenciones`, `filtrarRetenciones`, `poblarSelectsRetenciones`, `abrirModalNuevaRetencion`, `guardarRetencion`, `editarRetencion`, `liberarRetencion` (estado → 'Liberada').
- **Nota:** el render de Retenciones en legacy.js (11638-11702) es código muerto — el dueño real es el módulo migrado.
- **Permisos:** Administrador total, RRHH, Finanzas, Supervisor.

---

## 3.10 Descuentos por asociado (migrado)

- **Propósito:** descuentos automáticos sobre haberes de los asociados (incluye los generados por uniformes y por incumplimientos).
- **Entidades:** `DB.descuentos*` (planillas de adelantos, adelantos informales, préstamos con `descuentosAutomaticosLegajo` en legacy.js:8364); módulo migrado en `src/modules/descuentos/` con `descuentosScreenConfig`.
- **Funciones:** `poblarSelectsDescuentoModal`, alta de descuentos por período (`des-periodo-inicio`).
- **Permisos:** Administrador total, RRHH, Finanzas.

---

## 3.11 Paritarias (legacy)

- **Propósito:** registro de paritarias (convenios) con homologación y aplicación de aumentos a asociados (por categorías) y proyección a clientes.
- **Entidades:** `DB.paritarias[]` → tabla `paritarias`; `DB.paritariasCategorias[]`.
- **Flujo:** `Borrador → Homologada` (`homologarParitaria`) → `estadoAplicacion` (Sin aplicar → Aplicada). Seed: UTEDYC 01/04/2026.
- **Tabs:** Paritarias / Aplicar a asociados / Aplicar a clientes (+ proyección).
- **Funciones:** `renderParitarias`, `renderParAsociados` (`aplicarAumentoAsociados`/`proyectarAumentoAsociados`), `renderParClientes`, `verParitaria`, `aplicarAumentoCategorias`, `proyectarAumentoClientes`.
- **Reglas:** guard `esEditorParitarias()` = Administrador total o función `Gerente`/`Coordinador/a`; si `homologada=false` solo proyección (no modifica valores).
- **Permisos:** Administrador total, RRHH, Operaciones, Finanzas.

---

## 3.12 Feriados (legacy)

- **Propósito:** ABM de feriados nacionales.
- **Entidad:** `DB.feriados[]` → tabla `feriados`.
- **Funciones:** `renderFeriados`, `abrirModalFeriado`, `guardarFeriado`, `eliminarFeriado`.
- **Regla:** afectan el color de celda en grillas (`dia.esFeriado`) de Retenes/Mantenimiento/Liquidación.
