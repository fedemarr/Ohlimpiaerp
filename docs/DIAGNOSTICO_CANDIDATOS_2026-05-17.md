# AUDITORÍA TÉCNICA — Módulo Candidatos

**Fecha:** 2026-05-17
**Autor:** Claude Code (Opus 4.7)
**Solicitado por:** Lautaro
**Propósito:** Diagnóstico previo a implementar feedback de Gabriela y arreglar bugs. Aplicación de la política A.11 (rehacer vs modificar).

---

## 1. INVENTARIO

### Archivos del módulo

| Archivo | Líneas | Tamaño |
|---|---|---|
| `src/modules/candidatos/candidatos.js` | 506 | 20 KB |
| `src/modules/candidatos/calendario.js` | 246 | 9 KB |
| `src/modules/candidatos/index.js` | 105 | 3,5 KB |
| **Total** | **857** | **32,5 KB** |

### Funciones principales

**`candidatos.js`** (lógica del ABM de candidatos):

| Función | Propósito |
|---|---|
| `getCandById(id)` | Busca un candidato por su ID en `DB.candidatos`. |
| `getIdxById(id)` | Devuelve el índice del array (sin uso confirmado dentro del módulo). |
| `tabCandidatos(tab)` | Cambia entre tabs "activos" e "histórico" y re-renderiza. |
| `bindTbodyEvents(tbody)` | Pega los listeners de click/change a la tabla (delegación de eventos). |
| `renderCandidatos(lista?)` | Renderiza la tabla con filtros y stats. Acepta lista pre-filtrada opcional. |
| `renderFilaCand(c)` | Genera el HTML de una fila (con todos los estilos inline). |
| `filtrarCandidatos()` | Aplica filtros de columna y vuelve a renderizar. |
| `poblarFiltrosColumnasCandidatos()` | Llena los `<select>` de filtros con valores únicos. |
| `onChangeZonaCand()` | Habilita/deshabilita el select de localidad según provincia. |
| `onChangeEstadoCand()` | Muestra/oculta los campos de cita cuando el estado es "Citado". |
| `abrirNuevoCandidato()` | Limpia el modal y lo abre en modo "nuevo". |
| `guardarCandidato()` | Valida campos, guarda en `DB.candidatos`, crea turno si corresponde, persiste. |
| `editarCandidato(id)` / `editarCandidatoPorId(id)` | Pre-carga el modal con datos existentes. La segunda es un wrapper sin lógica. |
| `abrirCitarPorId(id)` / `guardarCita()` | Modal específico para agendar cita desde la tabla. |
| `abrirResultadoPorId(id)` / `guardarResultadoEntrevista()` | Modal para registrar si asistió y resultado de entrevista. |
| `aprobarCandidatoPorId(id)` | Cambia estado a "Aprobado". |
| `rechazarCandidatoPorId(id)` | Pide motivo con `prompt()` y rechaza. |
| `pasarAPsicoPorId(id)` | Crea registro en `DB.psicos` y cambia estado a "Psicotécnico". |
| `registrarAsistencia(id, valor)` | Cambia estado según asistió/no asistió desde el select inline. |

**`calendario.js`** (vista semanal de turnos):

| Función | Propósito |
|---|---|
| `getLunesDeSemana(offset)` | Calcula el lunes de la semana mostrada. |
| `getTurnos()` | Devuelve `DB.turnos`. |
| `cambiarSemana(dir)` / `irHoy()` | Navegación entre semanas. |
| `actualizarConfigAgente()` | Lee la config del agente IA (días, horarios, duración, capacidad) y re-renderiza. |
| `poblarSelectResponsable()` | Llena el select de responsable RRHH. |
| `renderCalendario()` | Construye la grilla semanal con franjas horarias, turnos y resumen. |
| `agendarTurno(fecha, hora)` | Crea un turno nuevo con `prompt()` para el nombre. |
| `verTurno(turnoId)` | Cambia estado o cancela un turno con `confirm()`. |

**`index.js`**: solo orquesta re-exports, `tabCandPrincipal()` (base/calendario/link), screenConfig y bindings a `window`.

### Tabla de Supabase

Usa **dos tablas**:

| Tabla | Cuándo se escribe | Campos que el módulo manda |
|---|---|---|
| `candidatos` | `guardarCandidato`, `guardarCita`, `guardarResultadoEntrevista`, `aprobar/rechazar/pasarAPsico/registrarAsistencia` | `id`, `nombre`, `dni`, `cuit`, `fecnac`, `estadoCivil`, `tel`, `email`, `calle`, `piso`, `zona`, `localidad`, `medio`, `rrhh`, `obs`, `estado`, `asistio`, `fecha`, `hora`, `motivoRechazo`, `obsEntrevista` |
| `turnos` | `guardarCandidato` (si hay cita), `guardarCita`, `agendarTurno`, `verTurno` | `id`, `candidatoId`, `nombre`, `fecha`, `hora`, `estado`, `responsable` |

Mapeo camel↔snake en `supabase.js`: `candidatoId↔candidato_id`, `motivoRechazo↔motivo_rechazo`, `obsEntrevista↔obs_entrevista`, `estadoCivil↔estado_civil`. **El campo `asistio` se transforma a booleano** al guardar (línea 54 de `supabase.js`) — esto es importante: el código guarda `'Sí'/'No'/'-'` pero Supabase recibe `true/false`. Cuando se relee, pierde el matiz "no registrado todavía".

### Dependencias

**Lo que importa el módulo** (entrante → módulo):
- `@shared/state.js` → `DB`, `LOCALIDADES_BA`
- `@shared/helpers.js` → `$`, `toTitleCase`, `cleanText`, `validarCampos`, `hoyStr`, `badge`
- `@shared/ui.js` → `toast`, `abrirModal`, `cerrarModal`
- `@shared/supabase.js` → `supaSync`, `supaDel`

**Quién importa al módulo** (módulo → salida):
- `src/main.js` línea 15 — `candidatosScreenConfig`, `filtrarCandidatos`, `poblarFiltrosColumnasCandidatos`, `renderCandidatos`.

**Acoplamientos por estado global** (no son imports, pero existen):
- `psicotecnico.js` lee `DB.candidatos` (línea 326) y escribe el flujo de aprobar/rechazar psico — depende de los IDs que generó candidatos.
- `altas.js` lee `DB.candidatos` (línea 242) usando `candidatoId` que viaja vía `catAltPendientes`.
- `legacy.js` toca `DB.candidatos` en al menos 5 lugares (`6208`, `6209`, `11863`, `11892`, `496` que crea uno desde "Formulario web", `492` que cita masivamente con "Agente IA").

**Dependencias con el HTML estático** (`index.html`):
- IDs de modales: `modal-candidato`, `modal-citar-cand`, `modal-resultado-cand`.
- IDs de campos del modal nuevo: `c-nombre`, `c-dni`, `c-cuit`, `c-fecnac`, `c-estado-civil`, `c-tel`, `c-email`, `c-calle`, `c-piso`, `c-zona`, `c-localidad`, `c-medio`, `c-rrhh`, `c-obs`, `c-estado-i`, `c-fecha`, `c-hora`, `cita-campos-row`, `modal-cand-titulo`.
- IDs de filtros: `cand-buscar`, `cand-filtro-zona`, `cand-filtro-estado`, `cf-cand-*` (7 filtros de columna).
- IDs de calendario: `dias-habilitados`, `hora-desde`, `hora-hasta`, `duracion-turno`, `max-por-turno`, `cal-responsable`, `semana-label`, `calendario-entrevistas`, `resumen-semanal`.
- IDs de stats: `st-c-sincitar`, `st-c-citados`, `st-c-entrevistados`, `st-c-aprobados`.

Total: el módulo depende de **~35 IDs definidos en el HTML monolítico**. No los puede eliminar mientras viva el HTML estático.

---

## 2. CALIDAD DEL CÓDIGO

### Legibilidad — **6 / 10**

- **A favor:** funciones cortas (mayoría < 30 líneas), nombres en español claros (`abrirCitarPorId`, `registrarAsistencia`), secciones bien separadas con comentarios `========`.
- **En contra:** `renderFilaCand` (líneas 109-147) es un string gigante con estilos inline y emojis incrustados, muy difícil de leer. Hay dos estilos de código mezclados: `function ()` clásico en `calendario.js` (línea 44, 58, etc.) y arrow functions en `candidatos.js` — herencia del partido en dos pasadas. Casi nada de comentarios que expliquen *por qué* (solo *qué*).

### Aislamiento — **5 / 10**

- **A favor:** los imports son limpios, solo desde `@shared/`. Las funciones se exportan explícitamente.
- **En contra:** depende de **35+ IDs de HTML estático** que no controla. Toca `DB.psicos` directamente (línea 476) en vez de delegar al módulo psicotécnico. Comparte `DB.turnos` con `legacy.js`. Cualquier cambio al schema rompe el módulo en silencio.

### Duplicación — **5 / 10**

- **Duplicación interna confirmada:**
  - La creación del turno está duplicada en `guardarCandidato` (líneas 302-315) y `guardarCita` (líneas 388-399).
  - La lista de "nicks RRHH" (`DB.usuarios.filter... + DB.rrhh.filter... + 'Agente IA Ohlimpia'`) aparece en `poblarFiltrosColumnasCandidatos` (línea 184) y casi idéntica en `poblarSelectResponsable` de calendario (línea 57). Diferencia única: el calendario no incluye al "Agente IA".
  - El cambio de estado a "Sin citar" cuando no asiste está duplicado en `guardarResultadoEntrevista` (línea 442) y `registrarAsistencia` (línea 497).
  - Conversión de fecha DD/MM/AAAA ↔ YYYY-MM-DD repetida en varios lugares (`editarCandidato` 340, `guardarCandidato` 284, etc.).
- **Duplicación con legacy:** `legacy.js` línea 49 vuelve a hacer `fillCol('cf-cand-estado', DB.candidatos.map(c=>c.estado))` que ya hace el módulo migrado.

### Manejo de errores — **4 / 10**

- **A favor:** valida campos requeridos en alta (`validarCampos`), avisa con toast cuando no encuentra candidato, valida fechas pasadas.
- **En contra:**
  - `supaSync` se llama sin `await` y sin captura de error en ningún lugar — si Supabase falla, el dato queda solo en memoria y el usuario no se entera. Esto **viola la política A.5** (toda persistencia en Supabase) en la práctica.
  - Usa `prompt()` y `confirm()` del navegador (líneas 195, 226, 238, 464). Esto está marcado como "bug conocido" en CLAUDE.md.
  - No hay validación de unicidad de DNI (también documentado).
  - El campo `asistio` se guarda como string `'Sí'/'No'/'-'` en JS pero se fuerza a booleano al persistir (`supabase.js:54`): al recargar la página, los `'-'` no registrados pasan a `false`, indistinguible de "no asistió".

### Consistencia con el proyecto — **7 / 10**

- Sigue las convenciones documentadas en CLAUDE.md: `id` con `Date.now()`, `screenConfig` con la forma estándar, callbacks de window bindings, persistencia via `supaSync`.
- Patrón `index.js + modulo.js` cumplido (incluso con un tercer archivo `calendario.js` que es razonable).
- Pero: `prompt()`/`confirm()` rompen la consistencia (el resto del proyecto usa modales custom).

---

## 3. SEÑALES DE DEUDA TÉCNICA HEREDADA

**Hallazgos concretos:**

1. **Mezcla de estilos de código.** `candidatos.js` usa arrow functions (`=>`); `calendario.js` usa `function ()` clásico con `forEach(function () { ... })`. Esto es señal típica de **dos pasadas de partido por proximidad**, no por intención.

2. **`getIdxById` exportado pero no usado dentro del módulo.** Está en `index.js` línea 11 como export público, pero ninguna función del módulo lo llama. Es residuo del patrón viejo de "buscar por índice" que CLAUDE.md menciona como bug ya resuelto.

3. **`renderCandidatos` con doble modo (línea 63).** El bloque "Modo legacy: recibe lista filtrada directamente" admite explícitamente que sigue compatibilidad con código viejo. Es un puente que no se debería necesitar si el módulo controlara su propio render.

4. **Stats hardcodeados a 4 IDs (`st-c-sincitar`, etc.) con el helper `ss` (línea 83).** Patrón ad-hoc, una sola vez en el archivo. Huele a refactor incompleto.

5. **`onChangeEstadoCand` (línea 213) cambia `display:flex`/`none` por ID.** Es manipulación de DOM acoplada a estilos puntuales del HTML.

6. **Doble lugar para citar:** el modal grande de "Nuevo candidato" permite poner cita, *y* además existe un modal aparte `modal-citar-cand` (`abrirCitarPorId`/`guardarCita`). Lógica duplicada con dos puntos de entrada al mismo flujo.

7. **`agendarTurno` del calendario** crea un turno con `candidatoId: ''` (línea 204) — un turno huérfano, sin candidato real en la base. Y el nombre del candidato sale de un `prompt()`. Eso es una funcionalidad a medio terminar.

8. **Sanitización implícita y silenciosa de `asistio`** en `supabase.js` (línea 54). El módulo guarda strings, Supabase recibe booleanos. Pérdida de información sin que nadie lo declare.

9. **Comentario revelador:** `calendario.js:97` dice *"Calcula en qué franja cae una hora arbitraria"* — la palabra "arbitraria" deja ver que el modelo de datos no garantiza que las horas de turnos coincidan con las franjas del calendario.

10. **Función larga** (única): `renderCalendario` tiene **116 líneas** (líneas 66-181). Hace cálculo de fechas + franjas + render del header + render de filas + cálculo de resumen, todo junto.

11. **Sin código muerto comentado y sin parches con TODO.** Esto es positivo — el partido fue prolijo en ese sentido.

---

## 4. RECOMENDACIÓN

> **Aclaración importante:** los tiempos son estimaciones gruesas asumiendo el flujo de trabajo de las políticas (Claude web → Claude Code → tu prueba). No tengo el feedback de Gabriela en contexto, así que no puedo calibrar la magnitud real del cambio que ella pide. Si me lo pasás lo recalibro.

| Opción | Tiempo estimado | Riesgo | Calidad final |
|---|---|---|---|
| **Modificar lo existente** para implementar el feedback | **3 a 6 horas** según alcance | **Medio** — la deuda heredada (asistio booleano, doble modal de citar, prompt/confirm, IDs acoplados al HTML monolítico) puede generar bugs de regresión inesperados | Sigue con deuda heredada; mejora puntual pero la próxima vez vas a estar igual |
| **Rehacer el módulo de cero** respetando el feedback | **8 a 14 horas** | **Bajo** — pero requiere también extraer el HTML del modal y filtros del monolito, o aceptar seguir dependiendo de él | Limpio, modales propios (sin `prompt`), un único flujo de citar, persistencia con manejo de errores real, `asistio` modelado bien |

**Criterios de A.11 aplicados al módulo:**

| Criterio | Estado |
|---|---|
| Más de 1.000 líneas y se entiende mal | ❌ No (857, se entiende razonable) |
| El feedback cambia el flujo central, no solo agrega campos | ❓ Depende del feedback de Gabriela |
| El módulo no está bien aislado | ✅ Sí — depende de 35+ IDs del HTML, escribe en `DB.psicos`, comparte `DB.turnos` con legacy |
| Hay bugs documentados sin resolver | ✅ Sí — `prompt()`, asistio booleano, sin validación DNI |
| El cambio tocaría más del 40% del código | ❓ Depende del feedback |
| Módulo chico (<300 líneas) y bien entendido | ❌ No (857 líneas) |
| Cambio es solo agregar/renombrar campos | ❓ Depende del feedback |

Marca **3 criterios firmes a favor de rehacer**, los otros dependen del alcance del feedback.

---

## 5. MI OPINIÓN TÉCNICA HONESTA

Si el feedback de Gabriela toca el flujo (cómo se cita, cómo se registra el resultado, cómo se mueven los estados), lo rehacía; si solo agrega o renombra campos, lo modificaba. Sin ver el feedback no puedo decidir con honestidad — pasámelo y te doy la respuesta firme.

---

## ⚠️ COSAS QUE ME SORPRENDIERON O ME PREOCUPAN (aparte)

1. **Conversión silenciosa de `asistio` a booleano.** Esto es un bug real, no un detalle estético: la diferencia entre "no asistió" y "todavía no registramos" desaparece al recargar la página. Independientemente de lo que decidas con el módulo, vale arreglarlo.

2. **`supaSync` se llama sin `await` y sin try/catch en todo el módulo.** Si Supabase falla, no te enterás. La política A.5 dice "toda persistencia vive en Supabase", pero en la práctica el código está cumpliendo "se intenta persistir, si falla no avisamos".

3. **Turnos huérfanos** (`candidatoId: ''` en `agendarTurno`). Crear un turno sin candidato real rompe la relación que sugiere el campo. O es funcionalidad incompleta o es un bug.

4. **Duplicación del flujo de citar** (modal grande + modal chico). Esto huele fuerte a "el monolito tenía dos pantallas y el partido las dejó las dos".

5. **`legacy.js:492`** hace `DB.candidatos.filter(c => c.estado === 'Sin citar').forEach(c => { c.estado = 'Citado'; c.rrhh = 'Agente IA Ohlimpia' })`. Esto modifica la base **sin llamar a `supaSync`** — los cambios viven solo en memoria. No es del módulo Candidatos, pero opera sobre sus datos. Lo flagueo porque al rehacer o tocar Candidatos puede aparecer este comportamiento.

6. **`getIdxById` exportado y nunca usado dentro del módulo.** Vale revisar si lo llama alguien desde fuera antes de borrarlo, pero parece código muerto.
