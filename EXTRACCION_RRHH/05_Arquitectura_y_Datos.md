# 05 — Arquitectura y datos

Guía para reconstruir el sector RRHH en un sistema aparte (o convertirlo en
multitenant). Resumen técnico del stack, estado global, persistencia, permisos,
convenciones de código y mapa de tablas.

---

## 5.1 Stack y entorno de desarrollo

- **Frontend:** Vite (ES modules, dev server con HMR), **JavaScript vanilla sin framework**, HTML con modales dinámicos, CSS custom.
- **Backend/DB:** Supabase (PostgreSQL) — **cliente JS directo, sin API propia**. En Reasignaciones hay 1 función serverless (Vercel) para el sugeridor IA.
- **Dependencias:** solo `@supabase/supabase-js` y `vite`.
- **Navegación:** SPA monolítica sin router — `div.screen` que se muestran/ocultan con `navTo(key)`.
- **Comandos:** `npm run dev` · `npm run build` · `npm run preview`.
- **Aliases Vite:** `@` → `src/`, `@modules` → `src/modules/`, `@shared` → `src/shared/`, `@styles` → `src/styles/`.
- **Rol de `index.html` (~308KB):** contiene todo el markup de pantallas, tablas, filtros y modales base. Un módulo no puede borrar su HTML hasta estar 100% migrado (los migrados generan HTML dinámico pero aún dependen de la estructura).

## 5.2 Estado global mutable (`DB`)

- Todo vive en el objeto `DB` (fuente de verdad). Los módulos lo mutan y llaman `supaSync()` para persistir. No hay store reactivo ni inmutabilidad (intencional).
- `DB` se carga al inicio con `supaInit()` (~79 tablas).
- **IDs:** registros nuevos usan `Date.now()`. Para Supabase se guarda como `id_local` (string). Los IDs en `onclick` van **entre comillas** (`onclick="fn('" + id + "')"`) para evitar parseo octal con leading-zero. Los getters usan `String(x.id) === String(id)`.
- **Formato fechas:** display/DB local DD/MM/AAAA (argentino), inputs HTML ISO (YYYY-MM-DD), Supabase como string. Helper `fechaISOToDisplay`/`displayToISO` en `@shared/helpers.js`.

## 5.3 Persistencia (`src/shared/supabase.js`)

- `supaInit()`: carga todas las tablas del mapa al objeto `DB` (mapeo snake→camel).
- `supaSync(dbKey, obj)`: **upsert por `id_local`** (insert si no existe, update si existe). Retorna promise; los módulos con pasos dependientes encadenan `.then()`.
- `supaDel(dbKey, idLocal)`: delete.
- **Mapeo camel↔snake explícito (diccionario hardcodeado, NO automático):** `_toSnake()` y `_toCamel()`. Cada campo nuevo necesita entrada en ambos.
- `_SM` es el mapa clave-JS → tabla-Supabase (ver 5.6).
- **Cliente auth:** Supabase Auth para la sesión anónima del portal Asociado; la autenticación normal es **local contra `DB.usuarios`** (con `perfil`), en texto plano (ver 5.5).

## 5.4 Convenciones de módulo y navegación

- **Estructura por módulo:**
  ```
  modulo/
    index.js   → re-exports de modulo.js + moduloScreenConfig + window bindings (onclick)
    modulo.js  → lógica: render, filtros, CRUD, interacción con DB
  ```
- **screenConfig:**
  ```js
  export const miModuloScreenConfig = {
    clave_menu: {
      title: 'Título topbar',
      btn: '+ Botón acción' | '' | null,
      fn: () => fnDelBoton(),          // null si no hay botón
      render: () => renderModulo(),
    },
  };
  ```
- **Registro en `main.js`:** `registerScreens()` (screenConfig), `registerSearchFilters()` (si filtra desde el buscador global), callbacks de auth (`poblarSelectsModulo`) y nav (`poblarFiltrosColumnasModulo`).
- **Patrón de callbacks para evitar ciclos:** `auth.js`/`nav.js` no importan módulos; `main.js` configura `registerAuthCallbacks({construirMenu, poblarSelects, navTo, ...})` y `registerNavCallbacks({poblarFiltrosColumnas})`.
- **Carga del legacy:** `legacy.js` (~13.400 líneas) se carga con `import()` async + try/catch para que un error ahí no bloquee login ni módulos migrados.
- **Modales:** estáticos (`abrirModal/cerrarModal` del HTML) vs dinámicos (patrón `ensureModal()` con `document.createElement`, usado en psico/altas).
- **Autosave:** los formularios de creación/edición (ej. candidatos) persisten en `localStorage` ante recargas accidentales.

## 5.5 Permisos y roles

- **Perfiles** en `state.js PERFILES` (el menú se construye por `perfil.modulos`):
  - **Administrador total** — acceso completo (`*`).
  - **RRHH** — todo el sector RRHH (selección, ingreso, personal, liquidación...).
  - **Operaciones** — pedidos, clientes, liquidación de horas, retenes, mantenimiento.
  - **Finanzas** — legajos (vista parcial), cobros, liquidaciones, retenciones, descuentos, paritarias, monotributos.
  - **Supervisor** — pedidos, legajos, competencia, retenes (sus grillas), adelantos (su servicio).
  - **Asociado** — portal de adelantos (login por nro socio + apellido), sugerencias.
- **Helpers por módulo:** `permisos.js` (Reasignaciones: `esSupervisor`, `esRrhh`...; Vacaciones: `gerenteDeSector`, `rolEnConsejo`; Enfermos: `puedeVerDiagnostico`; Paritarias: `esEditorParitarias`).
- **Autenticación local:** login contra `DB.usuarios` (password en texto plano), sesión en `currentUser`. **Conocido:** no usa Supabase Auth (excepto sesión anónima del Asociado). Para venderlo a un cliente conviene migrar a Supabase Auth.

## 5.6 Mapa de tablas (clave JS → tabla Supabase)

```
legajos            → legajos                     candidatos          → candidatos
psicos             → psicos                      catAltPendientes    → cat_alt_pendientes
turnos             → turnos                      clientes            → clientes
sanciones          → sanciones                   casosLegales        → casos_legales
enfermos           → enfermos                    reasignaciones      → reasignaciones
feriados           → feriados                    planillasAdelantos  → planillas_adelantos
prestamos          → prestamos                   grillasLiq          → grillas_liq
monotributos       → monotributos                paritarias          → paritarias
retenes            → retenes                     sugerencias         → sugerencias
```

Tablas del flujo de ingreso y personal (fuera del mapa legacy, agregadas en la migración):

```
preocupacionales   → preocupacionales            documentacionIngreso → documentacion_ingreso
capacitaciones     → capacitaciones              tipos_capacitacion, instructores,
                    metodos_evaluacion, materiales_capacitacion
vacaciones         → vacaciones                  descansos           → descansos
sancionesDisciplinarias → sanciones_disciplinarias   sancion_eventos, sancion_descargos
catalogoInfracciones → catalogo_infracciones     catalogoInfraccionesVersiones → catalogo_infracciones_versiones
movimientosPuntos  → movimientos_puntos          eventosPuntos       → eventos_puntos
reglasCompetencia  → reglas_competencia          reglasCompetenciaVersiones → reglas_competencia_versiones
premiosCompetenciaAnual → premios_competencia_anual  aniosCompetencia → anios_competencia
casosEnfermosAccidentes → casos_enfermos_accidentes  certificadosMedicos → certificados_medicos
retirosEnfermosPendientes → retiros_enfermos_pendientes  casoEventosEnfermos → caso_eventos_enfermos
novedadesCasoLegal → novedades_caso_legal        casosLegalesAdjuntos → casos_legales_adjuntos
estadosLegales    → estados_legales              pedidosUniformes    → pedidos_uniformes
pedidoUniformePrendas → pedido_uniforme_prendas  pedidoUniformeEventos → pedido_uniforme_eventos
descuentosUniformePendientes → descuentos_uniforme_pendientes
pedidosAdelantos  → pedidos_adelantos            pedidosAdelantosEventos → pedidos_adelantos_eventos
descuentosAdelantosPendientes → descuentos_adelantos_pendientes
categoriasBase    → categorias_base              valoresHoraCategoria → valores_hora_categoria
plusAdicionales   → plus_adicionales             valoresPlus         → valores_plus
retenciones       → retenciones                  motivosRetencion    → motivos_retencion
smvm              → smvm                         perfilPersonalAtributos → perfil_personal_atributos
motivosReasignacionCfg → motivos_reasignacion     aprobadoresReasCfg → aprobadores_reasignacion
liqAdminHoras     → liq_admin_horas              liqAdminSuplemento  → liq_admin_suplemento
liqAdminPeriodos  → liq_admin_periodos           liqAdminTipo        → liq_admin_tipo
liqAdminAjustes   → liq_admin_ajustes            mantHoras           → mant_horas_rows
retenHoras        → retenHorasRows               parametrosServicio  → parametros_servicio
motivosNoFact     → motivos_no_facturables       motivosFueraEFT     → motivos_fuera_eft
categoriasSalariales → categorias_salariales     pendientesAuth      → pendientes_auth
historialAuth     → historial_auth               alertasEFT          → alertas_eft
liquidaciones     → liquidaciones                planillasInformales → planillas_informales
adelantosInformales → adelantos_informales       solicitudesPrestamos → solicitudes_prestamos
```

> **Nota:** el mapa `_SM` del `supabase.js` original lista 17 tablas (tabla de 5.6 arriba). Las demás se agregaron en la migración. Antes de regenerar el SQL de la base conviene verificar contra el `supabase.js` real (la vista del `index.js` no lista el contenido completo).

## 5.7 Transversales e integraciones

- **Adjuntos (`@shared/adjuntos.js`):** bucket privado + tabla `adjuntos`; solo PDF; `MAX_SIZE` 10MB; etapas: `candidatos` (tipos `proceso`/`entrevista`), `psico`, `preocup`, `docum` (`antecedentes`/`libreta`/`curso`), `alta` (`poliza-seguro`, `monotributo`), sanciones (`evidencia-sancion`), uniformes (`denuncia-policial-uniforme`, constancia firmada), legales (`adjuntos_legal.js`). Subir un nuevo adjunto invalida (`vigente=false`) el anterior del mismo tipo.
- **IA (`@shared/iaDocumentos.js`):** `analizarDocumentoPDF`/`chequearIdentidadIA` (informe psico, apto médico, antecedentes). Sugeridor real en Reasignaciones (`sugeridor.js` → API serverless). `contactarAsociadosIA` de capacitaciones es **mock** (legacy.js:1131-1137, marca `Confirmado` tras 3s).
- **Notificaciones:** `crearNotificacion(tipo, mensaje, destinatarios, refId)` — usada por vacaciones, descansos, legajos (`_notificarRRHH`).
- **Obra social:** `calcularFechaAltaObraSocialISO` (`@shared/obraSocial.js`, +3 meses, editable) — usada en Altas y Legajos.
- **Calendario de entrevistas:** `candidatos/calendario.js` — `configAgente` con franjas de 20 min, grilla 7 días, turnos `DB.turnos`.

## 5.8 Multitenant vs sistema aparte (recomendación)

- **Hoy no hay tenant:** una sola base, `DB` global, login local, RLS casi nula (solo sesión anónima en portal Asociado). Todo el código asume un solo cliente/empresa.
- **Para vender el módulo a un cliente (sistema aparte):** es la opción más rápida — copiar el stack con las tablas de RRHH (5.6), los módulos migrados (`src/modules/`) y las secciones de legacy correspondientes; ajustar marca y seed de usuarios. No requiere refactor de datos.
- **Para multitenant:** refactor estructural necesario:
  1. Agregar `empresa_id`/`tenant_id` a todas las tablas y al objeto `DB`.
  2. Habilitar RLS por empresa en Supabase.
  3. Login por organización (email/dominio → tenant).
  4. Feature flags por módulo según el contrato del cliente.
  5. Mover `DB.usuarios` a Supabase Auth (por seguridad).
- **Riesgos a considerar:** contraseñas en texto plano, estilos inline en renders, `prompt()` en algunos flujos, `index.html` monolítico, acceso de RRHH solo en menú (no por ruta).
