# Ohlimpia — ERP Cooperativa de Limpieza

## Qué es

Sistema ERP web para **Cooperativa Ohlimpia**, una cooperativa de limpieza. Gestiona el ciclo completo de recursos humanos, operaciones, ventas, finanzas y administración. Los trabajadores son "asociados" (no empleados), lo cual refleja la estructura cooperativa.

## Stack tecnológico

- **Bundler:** Vite 8 (ES modules, dev server con HMR)
- **Backend/DB:** Supabase (PostgreSQL hosted) — cliente JS directo, sin API propia
- **Frontend:** Vanilla JS (sin framework), HTML con modales dinámicos, CSS custom
- **Dependencias:** solo `@supabase/supabase-js` y `vite`
- **Tipo de proyecto:** SPA monolítica, no hay router — navegación por mostrar/ocultar `<div class="screen">`

## Arquitectura

### Estructura de directorios

```
src/
  main.js              → Entry point, imports, window bindings, init
  legacy.js            → ~13.400 líneas de módulos NO migrados (se va vaciando)
  modules/
    candidatos/         → Módulo migrado
    psicotecnico/       → Módulo migrado
    altas/              → Módulo migrado
    legajos/            → Módulo migrado
  shared/
    state.js            → DB (estado global mutable), PERFILES, MENU, BADGE_MAP, AREAS
    supabase.js         → Cliente Supabase, supaSync/supaDel/supaInit, mapeo camel↔snake
    helpers.js          → $(), badges, fechas, validación, fillSelect
    ui.js               → toast, modales, ordenamiento de tablas
    auth.js             → Login/logout, perfiles demo, portal asociado
    nav.js              → SCREEN_CONFIG, navTo, menú dinámico, buscador global
  styles/
    main.css            → CSS completo extraído del HTML original
```

### Patrón de módulo migrado

Cada módulo tiene la misma estructura:

```
modulo/
  index.js      → Re-exports + screenConfig + window bindings (onclick)
  modulo.js     → Lógica: render, filtros, CRUD, interacción con DB global
```

**Convenciones del index.js:**
1. Exporta todo desde `modulo.js` (named exports)
2. Define `moduloScreenConfig` con `{ title, btn, fn, render }` para el sistema de navegación
3. Asigna funciones a `window.*` para que el HTML inline (`onclick="..."`) las encuentre

**Convención de screenConfig:**
```js
export const miModuloScreenConfig = {
  clave_menu: {
    title: 'Título en topbar',
    btn: '+ Texto botón acción' | '' | null,
    fn: () => funcionDelBoton(),      // null si no hay botón
    render: () => renderModulo(),
  },
};
```

### Flujo de datos

1. **Estado global:** Todo vive en `DB` (objeto mutable en `state.js`). Los módulos leen/escriben `DB.candidatos`, `DB.psicos`, `DB.legajos`, etc. directamente.
2. **Persistencia:** `supaSync(dbKey, obj)` hace upsert por `id_local`. `supaInit()` carga todo al inicio.
3. **Mapeo de nombres:** JS usa camelCase, Supabase usa snake_case. `_toSnake()` y `_toCamel()` en `supabase.js` manejan la conversión con mapeo explícito (no automático).
4. **Render:** Cada módulo tiene `renderX()` que genera HTML como string y lo inyecta en `tbody` o contenedor. No hay DOM virtual ni reactividad.

### Sistema de navegación

- `navTo(key)` muestra `#screen-{key}`, actualiza topbar, ejecuta `render()`
- `registerScreens()` agrega pantallas al `SCREEN_CONFIG`
- `registerSearchFilters()` conecta filtros del buscador global por módulo
- El menú se construye dinámicamente según el perfil del usuario (`PERFILES` en state.js)

### Sistema de permisos

6 perfiles con acceso a módulos específicos:
- **Administrador total:** acceso completo
- **RRHH:** selección, legajos, liquidación, etc.
- **Operaciones:** pedidos, clientes, liquidación de horas
- **Finanzas:** legajos, cobros, liquidaciones
- **Supervisor:** pedidos, legajos, competencia
- **Asociado:** portal de adelantos (login por nro socio + apellido)

### Patrón de callbacks para evitar dependencias circulares

`auth.js` y `nav.js` no importan módulos directamente. En su lugar:
- `registerAuthCallbacks({ construirMenu, poblarSelects, navTo, ... })`
- `registerNavCallbacks({ poblarFiltrosColumnas })`
- Se configuran una vez en `main.js` al inicializar

## Módulos migrados (flujo RRHH)

### 1. Candidatos (`modules/candidatos/`)
- **Flujo de estados:** Sin citar → Citado → Entrevistado → Aprobado → Psicotécnico
- **También:** Rechazado (desde Entrevistado, con motivo obligatorio)
- **Features:** tabs activos/histórico, filtros por columna, calendario de entrevistas (datos mock), registro de asistencia, estadísticas
- **Subarchivo:** `calendario.js` — calendario semanal de entrevistas con config de turnos

### 2. Psicotécnico (`modules/psicotecnico/`)
- **Flujo de estados:** En proceso → Aprobado | Rechazado
- **Etapas obligatorias:** Psicotécnico, Prelaboral médico
- **Etapas opcionales:** Antecedentes, Libreta sanitaria (checkbox para habilitar)
- **Modal dinámico:** Se crea con `document.createElement` la primera vez que se abre
- **Al aprobar:** Crea registro en `DB.catAltPendientes` y pasa a Altas
- **Al rechazar:** Actualiza estado del candidato original con motivo

### 3. Altas (`modules/altas/`)
- **Modal con 6 tabs:** Identificación, Domicilio, Operativo, Uniforme, Capital, Seguros
- **Pre-carga datos** del candidato que viene del flujo psicotécnico
- **Calcula integración** automática desde SMVM vigente (5% del valor)
- **Al confirmar:** Crea legajo en `DB.legajos`, marca alta como completada
- **Genera nro de socio** como max(nros existentes) + 1

### 4. Legajos (`modules/legajos/`)
- **Vista tabla** con período de prueba (barra de progreso visual)
- **Vista detalle** en modal con 4 tabs: Datos personales, Operativo, Movimientos, Historial
- **Edición inline** de datos del legajo
- **Impresión** de ficha en ventana nueva con print automático
- **Integra reasignaciones** del asociado en las tabs de movimientos/historial

## Módulos pendientes de migración (en legacy.js)

Ordenados por sección del menú:

### Selección
- **Pedidos de personal** — solicitudes de supervisores para cubrir puestos

### Ingreso
- **Reasignaciones** — cambios de servicio/supervisor con aprobación, sugeridor IA
- **Monotributos** — gestión de monotributo de asociados
- **Uniformes** — control de talles y entregas
- **Retenciones** — retenciones sobre haberes

### Operaciones
- **Liquidación de horas** — grillas por servicio/mes, carga de horas diarias, tipos de hora, EFT, Art.42
- **Liquidación Administración** — liquidación del personal administrativo
- **Retenes** — gestión de retenes (personal de reemplazo)
- **Mantenimiento** — liquidación de horas de mantenimiento
- **Sanciones** — registro y seguimiento de sanciones disciplinarias
- **Pedidos de adelantos** — solicitudes de adelantos y préstamos (flujo asociado → RRHH → Finanzas)
- **Feriados** — ABM de feriados nacionales

### Ventas
- **Clientes** — ABM de clientes con datos comerciales
- **Objetivos/Servicios** — objetivos de servicio por cliente
- **Gestión de precios** — propuestas de precio con 3 niveles (teórico, comercial, acordado)
- **CRM Comercial** — pipeline kanban de leads, acciones comerciales
- **Reclamos y NC** — reclamos y no conformidades con estadísticas
- **Gestión de cobros** — facturas pendientes, cobros registrados, importación desde Tango

### Seguimiento
- **Situaciones legales** — casos legales con abogados, adjuntos, análisis IA
- **Enfermos y accidentes** — seguimiento médico, certificados, análisis IA

### Administración
- **Paritarias** — registro de paritarias con homologación y aplicación
- **Configuración** — ABM de medios, geografía, puestos, usuarios, perfiles matriciales
- **SMVM histórico** — salario mínimo vital y móvil con períodos

### Personal
- **Capacitaciones** — registro, estadísticas, plan anual, repositorio, evaluaciones
- **Vacaciones y descanso** — administrativo + operativo + calendario visual
- **Competencia anual** — ranking individual, equipos, supervisores, reglas

### Finanzas
- **Liquidaciones** — proceso completo de liquidación con conceptos configurables
- **Gestión de adelantos** — aprobación formal/informal, préstamos, depósitos

### Portal Asociado
- **Mis adelantos** — vista del asociado para solicitar y ver estado de adelantos/préstamos

### Reportes
- **Reportes y sugerencias** — buzón de sugerencias/reportes de asociados, accesible a todos los perfiles. Persiste en tabla `sugerencias` de Supabase (módulo vive en `legacy.js`).

## Decisiones de diseño importantes

### Estado global mutable (DB)
El objeto `DB` en `state.js` es la fuente de verdad. Todos los módulos lo mutan directamente y llaman a `supaSync()` para persistir. No hay store reactivo ni inmutabilidad. Esto es intencional para mantener la simplicidad dado el stack vanilla.

### HTML en el monolítico original
El archivo `index.html` (~308KB) contiene todo el markup de todas las pantallas. Los módulos migrados generan HTML dinámicamente pero siguen dependiendo del HTML estático para la estructura de screens, tablas, filtros y modales base. **No se puede eliminar el HTML de una pantalla hasta que el módulo esté completamente migrado.**

### Modales dinámicos vs estáticos
- **Estáticos:** definidos en `index.html`, se muestran con `abrirModal(id)` / `cerrarModal(id)`
- **Dinámicos:** creados con `document.createElement` en JS la primera vez (patrón `ensureModal()`), usados en psicotécnico y altas

### Window bindings
Las funciones que el HTML llama con `onclick="fn()"` deben estar en `window`. Cada `index.js` de módulo las asigna. Esto es necesario mientras el HTML use atributos onclick inline. Al migrar a event listeners, se podrán eliminar.

### IDs basados en timestamp
Los registros nuevos usan `Date.now()` como ID. Para Supabase se trunca a 9 dígitos como `id_local`.

### Carga del legacy como import dinámico
`legacy.js` se carga con `import()` async para que un error ahí no bloquee el login ni los módulos migrados. Las funciones de legacy se resuelven cuando están disponibles.

### Conversión camelCase ↔ snake_case
El mapeo en `supabase.js` es **explícito** (diccionario hardcodeado), no automático. Cada campo nuevo que se agrega a Supabase necesita entrada en `_toSnake()` y `_toCamel()`.

### Formato de fechas
- **Display/DB local:** DD/MM/AAAA (formato argentino)
- **Inputs HTML:** YYYY-MM-DD (formato ISO, nativo de `<input type="date">`)
- **Supabase:** se almacena como string, no como date nativo

### Estilos inline en renders
Los `renderX()` generan HTML con estilos inline abundantes. Es el patrón heredado del monolítico. Los estilos principales están en `main.css` pero cada fila de tabla, botón de acción, etc. tiene estilos inline propios.

## Comandos de desarrollo

```bash
npm run dev       # Servidor de desarrollo (Vite HMR)
npm run build     # Build de producción en dist/
npm run preview   # Preview del build
```

## Aliases de Vite

```js
'@'        → 'src/'
'@modules' → 'src/modules/'
'@shared'  → 'src/shared/'
'@styles'  → 'src/styles/'
```

## Tablas en Supabase

Mapa de claves JS → tablas (definido en `supabase.js`):

| Clave JS            | Tabla Supabase       |
|---------------------|----------------------|
| legajos             | legajos              |
| candidatos          | candidatos           |
| psicos              | psicos               |
| catAltPendientes    | cat_alt_pendientes   |
| turnos              | turnos               |
| clientes            | clientes             |
| sanciones           | sanciones            |
| casosLegales        | casos_legales        |
| enfermos            | enfermos             |
| reasignaciones      | reasignaciones       |
| feriados            | feriados             |
| planillasAdelantos  | planillas_adelantos  |
| prestamos           | prestamos            |
| grillasLiq          | grillas_liq          |
| monotributos        | monotributos         |
| paritarias          | paritarias           |
| retenes             | retenes              |
| sugerencias         | sugerencias          |

## Cómo migrar un módulo

1. Crear `src/modules/{modulo}/modulo.js` con la lógica (copiar de legacy, refactorizar imports)
2. Crear `src/modules/{modulo}/index.js` con re-exports, screenConfig y window bindings
3. En `main.js`: importar el screenConfig y registrarlo con `registerScreens()`
4. En `main.js`: si tiene filtros, registrarlos con `registerSearchFilters()`
5. Si tiene selects, agregar `poblarSelectsModulo()` en el callback de auth
6. Si tiene filtros de columna, agregar `poblarFiltrosColumnasModulo()` en los callbacks
7. Eliminar el código correspondiente de `legacy.js`
8. Probar el flujo completo en el navegador

## Bugs conocidos y resueltos

### Resueltos durante la migración
- **IDs por índice vs por valor:** El sistema original usaba índices de array para referenciar registros (`onclick="fn(0)"`). Esto se rompía cuando se filtraban o reordenaban listas. Los módulos migrados usan IDs únicos (`c.id`, `p.id`) con helpers `getIdxById()`.
- **Dependencias circulares:** `auth.js` necesitaba `nav.js` y viceversa. Se resolvió con el patrón de callbacks (`registerAuthCallbacks`, `registerNavCallbacks`).
- **Legacy bloqueante:** Un error en `legacy.js` impedía el login. Se resolvió cargándolo como import dinámico con try/catch.
- **Filtros rotos al navegar:** Los filtros de columna se perdían al cambiar de pantalla. Se resolvió llamando `poblarFiltrosColumnas()` tanto en auth callbacks como en nav callbacks.

### Conocidos / pendientes
- **`prompt()` para inputs:** `rechazarCandidatoPorId()`, `rechazarPsico()` y `agendarTurno()` usan `prompt()` del navegador en vez de modales propios.
- **Estilos inline excesivos:** Los renders generan HTML con estilos inline que dificultan el mantenimiento y la consistencia visual.
- **Contraseñas en texto plano:** `DB.usuarios` tiene passwords en plain text. La autenticación es local contra ese array, no usa Supabase Auth.
- **Sin validación de unicidad de DNI:** Se puede crear candidatos/legajos con DNI duplicado.
- **Campos `identificacion`, `domicilio`, etc. en `catAltPendientes`:** Se guardan como `{}` vacío (jsonb). El modal de alta no los llena — los datos van directo al legajo.
