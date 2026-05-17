# Traspaso de sesión — Refactor del módulo Candidatos

**Fecha:** 2026-05-17
**Versión del documento:** 1.0
**Autor:** Claude Code (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 del proyecto (documento de traspaso al final de sesión larga)

## Resumen en una frase

En esta sesión se diseñó y aplicó el refactor de fondo de la tabla `candidatos` (nuevo esquema SQL v002 + fix v003, mapeo en `supabase.js`, y parte del código JavaScript del módulo); el módulo quedó parcialmente migrado y necesita continuar con tres frentes pendientes: transiciones de estado, filtros y el HTML del formulario.

> **Nota sobre el conteo de commits:** se hicieron **8 commits** en la sesión (el pedido original mencionaba 9; verifiqué con git que son 8).

---

# 1. Estado actual del proyecto

## 1.1. Lo que está funcionando

- **Base de datos en Supabase:** las tablas `candidatos` (esquema v002) y `personal_rrhh` (con `id_local` agregado por v003) están aplicadas. Las 5 personas del equipo de RRHH están cargadas como filas iniciales en `personal_rrhh`.
- **Mapeo en `src/shared/supabase.js`:** está alineado con el esquema nuevo. La tabla `personalRrhh` (camelCase) se carga al iniciar la app, y los campos nuevos de candidatos tienen su traducción camel ↔ snake.
- **Render del módulo Candidatos:** la tabla muestra `Apellido, Nombre`, fecha de cita en formato `DD/MM/AAAA`, valores `'si'`/`'no'` en asistencia y la palabra "Psicotécnico" se ve con tilde en pantalla (aunque en la base se guarda sin tilde como `'Psicotecnico'`).
- **Búsqueda por texto:** ahora contempla tanto apellido como nombre.
- **Filtro histórico/activos:** funciona con el nuevo valor del ENUM (`'Psicotecnico'` sin tilde).
- **Persistencia de candidato nuevo y edición:** las funciones `guardarCandidato` y `editarCandidato` mandan los campos con los nombres correctos (`apellido`, `fecNac`, `rrhhId`, `fechaCita`, `horaCita`, `nombreReferido`, `genero`, `creadoPor`, `asistio: null`).
- **Creación de turno:** cuando se crea un candidato con cita, el turno se persiste con el `responsable` resuelto desde `personal_rrhh` por el id (FK).
- **Auditoría mínima:** `creadoPor` se llena automáticamente con el `nickname` o `nombre` del usuario logueado (`currentUser` importado de `state.js`).

## 1.2. Lo que NO está funcionando todavía (lista específica)

Estos puntos **están rotos hoy** porque el refactor quedó a medias. En cada uno aclaro la consecuencia concreta para que se entienda el impacto.

### 1.2.1. Bloqueos críticos por el ENUM `estado_candidato`

- **Función `pasarAPsicoPorId` (línea ~485 de `candidatos.js`):** sigue ejecutando `c.estado = 'Psicotécnico'` (con tilde). El ENUM solo acepta `'Psicotecnico'` (sin tilde). **Consecuencia:** apretar el botón "🧠 Psico" en un candidato Aprobado va a hacer que la actualización contra Supabase falle silenciosamente (el error aparece en consola pero no se muestra al usuario; el candidato queda con estado viejo en la base pero con estado nuevo en memoria, creando una inconsistencia).
- **Cualquier código en `src/legacy.js`** que escriba `'Psicotécnico'` con tilde va a tener el mismo problema. **No verifiqué exhaustivamente cuántos lugares hay** — se recomienda hacer un `grep` en la próxima sesión.

### 1.2.2. Campos de fecha y hora con tipo nuevo

- **Función `guardarCita` (línea ~375 de `candidatos.js`):** sigue escribiendo en `c.fecha` y `c.hora` (campos viejos que ya no existen en el esquema) y convirtiendo a `DD/MM/AAAA` con `toLocaleDateString`. **Consecuencia:** registrar una cita desde el botón "📅 Citar" va a fallar el insert/update contra Supabase. Las columnas nuevas son `fecha_cita` (tipo `date`) y `hora_cita` (tipo `time`).
- **Función `guardarResultadoEntrevista` (línea ~425 de `candidatos.js`):** cuando el candidato no asistió, hace `c.fecha = ''` y `c.hora = ''`. Como ahora `fecha_cita` es tipo `date`, mandar string vacío al hacer update va a romper con error de cast. Debería ser `null`.
- **Función `registrarAsistencia` (línea ~492 de `candidatos.js`):** mismo problema que el punto anterior.

### 1.2.3. Valores de `asistio` que el CHECK rechaza

- **Funciones `guardarResultadoEntrevista` y `registrarAsistencia`:** siguen seteando `c.asistio = 'Sí'` o `'No'` (con tilde y mayúscula). La restricción CHECK del esquema nuevo solo acepta `'si'`, `'no'`, o `NULL`. **Consecuencia:** cualquier intento de registrar asistencia desde el select inline de la tabla o desde el modal de resultado va a fallar el update.

### 1.2.4. Filtros desalineados

- **Función `filtrarCandidatos` (línea ~151 de `candidatos.js`):** los filtros de columna `cf-cand-rrhh`, `cf-cand-asistio`, `cf-cand-fecha` siguen comparando contra los nombres de campo viejos (`c.rrhh`, `c.fecha`) y valores viejos (`'Sí'`/`'No'`). **Consecuencia:** los filtros de columna devuelven resultados incorrectos o vacíos.
- **Función `poblarFiltrosColumnasCandidatos` (línea ~177 de `candidatos.js`):** la lista del filtro RRHH se construye con `DB.usuarios + DB.rrhh + 'Agente IA Ohlimpia'` cuando debería venir de `DB.personalRrhh`. **Consecuencia:** el menú desplegable del filtro RRHH muestra opciones que no se corresponden con los datos.

### 1.2.5. Formulario HTML del modal

El archivo `index.html` (no tocado en esta sesión) no tiene los campos nuevos:

- **No existe `<input id="c-apellido">`:** el modal "Nuevo candidato" pide solo nombre; al guardar, `apellido` queda string vacío. La validación de "Apellido" se saltea automáticamente porque `validarCampos` ignora elementos que no están en el DOM.
- **No existe `<input id="c-nombre-referido">`:** se guarda string vacío. No es bloqueante.
- **No existe `<select id="c-genero">`:** se guarda `null`. No es bloqueante.
- **`<input id="c-rrhh">` sigue siendo `<input>` de texto, no `<select>`:** el código nuevo asume que el `value` es el id numérico de `personal_rrhh`. Si alguien escribe texto en el input, `parseInt` devuelve `NaN` y el guardado defensivo lo convierte a `null` (no rompe, pero queda sin asignar el RRHH responsable).
- **Inputs de fecha (`c-fecnac`, `c-fecha`):** no verifiqué si ya son `type="date"`. **Si son `type="text"`**, el formato no es ISO y el `date` de PostgreSQL va a rechazar el cast. **A verificar en la próxima sesión.**

### 1.2.6. Cosméticos pendientes

- **`abrirNuevoCandidato`:** no limpia los IDs nuevos (`c-apellido`, `c-nombre-referido`).
- **`abrirCitarPorId`, `abrirResultadoPorId`:** muestran `c.nombre` solo, no `Apellido, Nombre`. No es bloqueante.
- **`aprobarCandidatoPorId`:** el toast dice "✅ {nombre} aprobado", debería incluir apellido.

## 1.3. Lo que está en proceso (no a medias, sino arrancado y suspendido por decisión)

- **El refactor del módulo Candidatos completo.** Las "Fases 1-5" planificadas: la Fase 1 (4 funciones críticas) se completó en esta sesión. Las Fases 2-5 quedan pendientes. Ver detalle en sección 4.2.

---

# 2. Lo que se hizo en esta sesión (cronológico)

8 commits, en orden:

---

### Commit 1 — `65afff0`

**Mensaje:** `docs: agregar POLITICAS_PROYECTO.md con reglas del proyecto`

**Qué cambió:** Se agregó al repositorio el documento `POLITICAS_PROYECTO.md` (296 líneas) en la raíz del proyecto. El documento contiene 10 políticas firmes que se aplican a cada cambio (A.1 a A.11, salvo A.10 que ya estaba listada), 5 direcciones estratégicas (B.1 a B.5), 3 convenciones operativas (C.1 a C.3) y un anexo histórico que documenta cómo se llegó al estado actual del proyecto.

**Por qué se hizo:** Lautaro lo dictó como marco de trabajo para sí mismo y para futuras conversaciones con Claude (web y Code). A partir de este commit, debe leerse junto con `CLAUDE.md` al inicio de cada sesión.

---

### Commit 2 — `dd6b262`

**Mensaje:** `docs: agregar diagnostico tecnico de modulo Candidatos`

**Qué cambió:** Se creó la carpeta `docs/` y dentro el archivo `DIAGNOSTICO_CANDIDATOS_2026-05-17.md` (209 líneas) con la auditoría técnica completa del módulo: inventario de archivos, calidad del código con puntajes, señales de deuda técnica heredada, cuadro comparativo "modificar vs rehacer" según política A.11, opinión técnica honesta y un anexo de "cosas que sorprendieron".

**Por qué se hizo:** Antes de implementar el feedback de Gabriela (responsable de RRHH) sobre el módulo Candidatos, se quiso tener un diagnóstico escrito que sirva como base para decidir si conviene modificar el código existente o rehacerlo desde cero (política A.11). El diagnóstico identificó: módulo de 857 líneas, 35+ acoplamientos al HTML monolítico, 5 inconsistencias importantes (la más grave: el campo `asistio` se guardaba como booleano en Supabase aunque el código lo manejaba como string), y otras señales de partido apresurado del monolítico.

---

### Commit 3 — `87d6c53`

**Mensaje:** `feat: agregar script SQL v002 para refactor de candidatos y nueva tabla personal_rrhh`

**Qué cambió:** Se creó la carpeta `sql/` y dentro el archivo `v002_candidatos_y_personal_rrhh.sql` (279 líneas). El script: (a) borra la tabla `candidatos` actual y la recrea con estructura limpia (apellido y nombre separados, DNI con UNIQUE constraint, tipos `date`/`time` reales para fechas, ENUM `estado_candidato` con 6 valores cerrados, ENUM `genero_persona`, soft delete con `anulado`/`anulado_por`/`anulado_fecha`, auditoría con `creado_por`); (b) crea la tabla `personal_rrhh` con las 5 personas del equipo de RRHH cargadas como filas iniciales; (c) habilita Row Level Security y triggers de `updated_at`.

**Por qué se hizo:** El script es la materialización del feedback de Gabriela más los bugs documentados en el diagnóstico (políticas A.5, A.6, A.7, A.8). El usuario lo creó manualmente desde afuera; Claude Code validó la sintaxis y lo guardó en Git. El script **no se ejecutó automáticamente** — se aplicó manualmente desde el SQL Editor de Supabase por Lautaro.

---

### Commit 4 — `463fb35`

**Mensaje:** `chore: backup CSV de tabla candidatos antes de aplicar script v002`

**Qué cambió:** Se creó la carpeta `docs/backups/` y dentro el archivo `candidatos_2026-05-17.csv` (36 líneas: encabezado + 35 registros).

**Por qué se hizo:** Respaldo precautorio antes de ejecutar el script v002 que borra y recrea la tabla. Aunque los datos eran de prueba, se respetó la convención de tener backup antes de operaciones destructivas (espíritu de política C.2).

---

### Commit 5 — `92ac702`

**Mensaje:** `fix: agregar id_local a personal_rrhh para alinear con patron del proyecto`

**Qué cambió:** Se creó el archivo `sql/v003_personal_rrhh_id_local.sql` (73 líneas). El script: (a) agrega la columna `id_local` a `personal_rrhh` como nullable; (b) rellena las 5 filas existentes con su `id` numérico formateado a 9 dígitos con ceros a la izquierda (`'000000001'` a `'000000005'`); (c) marca `id_local` como `NOT NULL UNIQUE`.

**Por qué se hizo:** Durante la planificación del refactor de `supabase.js`, Claude detectó que la tabla `personal_rrhh` (creada en v002) usaba solo `id bigint` como identificador, pero el resto del proyecto usa `id_local` (string, timestamp truncado a 9 dígitos) como identificador real desde JavaScript. Las funciones `supaSync`, `supaDel` y `_toCamel` están construidas asumiendo que toda tabla tiene `id_local`. Este v003 corrige ese desalineamiento sin necesidad de borrar y recrear la tabla.

---

### Commit 6 — `313bf93`

**Mensaje:** `refactor: actualizar mapeo de supabase.js para esquema v002 + v003`

**Qué cambió:** Se modificó `src/shared/supabase.js` (+8 / -2 líneas):
- Se agregó `personalRrhh: 'personal_rrhh'` al mapa `_SM` de tablas.
- Se agregaron 8 mapeos camelCase → snake_case en `_toSnake` (`fecNac` → `fec_nac`, `fechaCita` → `fecha_cita`, `horaCita` → `hora_cita`, `nombreReferido` → `nombre_referido`, `rrhhId` → `rrhh_id`, `anuladoPor` → `anulado_por`, `anuladoFecha` → `anulado_fecha`, `creadoPor` → `creado_por`).
- Se agregaron los mismos 8 mapeos en sentido inverso en `_toCamel`.
- Se eliminó la sanitización vieja del campo `asistio` que convertía `'Sí'/'No'` a booleano (línea que existía en `_toSnake`).
- Se limpió un duplicado de `estadoCivil: 'estado_civil'` que aparecía dos veces en `_toSnake`.

**Por qué se hizo:** Para que el código JS hable el mismo idioma que el esquema nuevo de la base. Sin este commit, los inserts/updates contra Supabase mandarían campos con nombres incorrectos.

---

### Commit 7 — `150cfa1`

**Mensaje:** `refactor(candidatos): adaptar render a esquema v002+v003`

**Qué cambió:** Se modificó `src/modules/candidatos/candidatos.js` (+28 / -11 líneas). Tres bloques tocados:
- **Helpers nuevos al inicio del archivo:** una constante `ESTADO_DISPLAY` que mapea `'Psicotecnico'` (sin tilde, como guarda el ENUM) a `'Psicotécnico'` (con tilde, como se muestra al usuario); y una función `formatearFechaISO(iso)` que convierte fechas ISO (`'2026-05-17'`) al formato argentino (`'17/05/2026'`).
- **`renderCandidatos`:** se cambió `'Psicotécnico'` por `'Psicotecnico'` en el filtro histórico; se extendió la búsqueda por texto para que mire también `apellido`.
- **`renderFilaCand`:** se reemplazó la columna de nombre por `apellido, nombre`, se usaron `c.fechaCita` y `c.horaCita` en lugar de `c.fecha`/`c.hora`, se cambiaron los valores `'Sí'`/`'No'` por `'si'`/`'no'` en el select inline de asistencia y en el display fuera del select, y se aplicó `ESTADO_DISPLAY` para mostrar la tilde correcta sin afectar el valor guardado.

**Por qué se hizo:** Es la primera mitad de la Fase 1 del refactor del módulo (la otra mitad es escritura y edición, en el commit siguiente). Se separó en dos commits para que cada uno se revise y apruebe por separado.

---

### Commit 8 — `5a3fe03`

**Mensaje:** `refactor(candidatos): adaptar guardar/editar a esquema v002+v003`

**Qué cambió:** Se modificó `src/modules/candidatos/candidatos.js` (+45 / -33 líneas). Seis bloques tocados:
- **Import:** se agregó `currentUser` al import desde `@shared/state.js` (sirve para llenar el campo `creadoPor`).
- **`validarCampos`:** se agregó `c-apellido` como campo obligatorio.
- **Lectura del modal:** se reemplazaron las variables viejas por las nuevas (`apellido`, `fecNac`, `genero`, `nombreReferido`, `rrhhId` con `parseInt` defensivo que cae a `null` si el value no es numérico, `fechaCita`, `horaCita`).
- **Validación cuando estado es "Citado":** se cambiaron los nombres de variable.
- **Rama edición (`Object.assign`):** se mandaron los campos nuevos al objeto en memoria y se eliminó la conversión `toLocaleDateString` (ahora las fechas van directo en ISO).
- **Rama nuevo + creación de turno:** se setea `asistio: null` en lugar de `'—'`, se agrega `creadoPor` desde el usuario activo, se resuelve `responsable` del turno buscando en `DB.personalRrhh` por id, el nombre del turno usa `apellido + ' ' + nombre`.
- **`editarCandidato`:** se eliminó el parseo manual de fechas `DD/MM/AAAA → YYYY-MM-DD`, se cargan los campos nuevos en el formulario, se setea `c-rrhh` con el id numérico convertido a string, el título del modal usa "Apellido, Nombre".

**Por qué se hizo:** Cierra la Fase 1 del refactor del módulo. Con este commit, las dos operaciones más usadas (crear nuevo candidato y editar uno existente) hablan el idioma del esquema nuevo.

---

# 3. Decisiones de diseño tomadas

## 3.1. Por qué tabla `personal_rrhh` en lugar de mantener texto libre

**Decisión:** Reemplazar el campo `rrhh` (texto libre) en `candidatos` por una FK (`rrhh_id`) que apunta a una nueva tabla `personal_rrhh` con las 5 personas del equipo.

**Por qué:**
1. Resuelve el problema de typos y variantes ("Gabriela", "Gabi", "GABRIELA Lucero", "gaby").
2. Permite reutilizar la tabla desde otros módulos del sistema (sanciones, adelantos, etc.) sin duplicar la lista.
3. Sienta base para futuras funcionalidades: filtrar por persona del equipo, contar candidatos por entrevistador, desactivar/anular una persona sin perder histórico.

**Costo asumido:** agrega complejidad al formulario (input texto → select con opciones) y al guardado (string → integer). Se considera aceptable.

## 3.2. Por qué `id_local` en `personal_rrhh` (problema del v002, fix con v003)

**Decisión:** El script v002 creó `personal_rrhh` solo con `id bigint`. El script v003 le agrega `id_local text NOT NULL UNIQUE` para alinear con el patrón del resto del proyecto.

**Por qué:**
- El proyecto entero usa un patrón: cada tabla tiene `id_local` (string, timestamp truncado a 9 dígitos) como identificador real desde JavaScript. Las funciones genéricas `supaSync`, `supaDel` y `_toCamel` están construidas asumiendo ese patrón.
- Sin `id_local`, hubo que decidir entre tres opciones (A: agregarlo, B: tratar la tabla como caso especial en JS, C: refactorizar las funciones genéricas). Se eligió **A** porque mantiene la consistencia del proyecto con el mínimo cambio.
- El fix en script SQL aparte (v003) en vez de modificar v002 respeta la política A.5: cada cambio de estructura genera un script SQL nuevo, no se modifica uno viejo.

## 3.3. Por qué ENUM `'Psicotecnico'` sin tilde + mapeo de display con tilde

**Decisión:** En la base, el ENUM `estado_candidato` tiene el valor `'Psicotecnico'` (sin tilde). En el código JS hay una constante `ESTADO_DISPLAY` que mapea ese valor a `'Psicotécnico'` (con tilde) para mostrarlo al usuario.

**Por qué:**
- Los ENUMs en PostgreSQL son sensibles a tildes y acentos. Cambiar el ENUM para incluir la tilde sería posible pero requeriría un script SQL adicional (más fricción, más versiones).
- Separar el valor guardado del valor mostrado es el patrón habitual cuando hay restricciones de codificación en el storage pero se quiere mantener la prolijidad visual al usuario.
- Costo asumido: si alguien en el código futuro escribe `'Psicotécnico'` con tilde, la base lo va a rechazar. Hay que mantener la disciplina de usar `'Psicotecnico'` en código y `ESTADO_DISPLAY[c.estado]` para mostrar.

## 3.4. Por qué `asistio` como text con valores `'si'`/`'no'`/`null` (fix del bug que le pasó a Gabriela)

**Decisión:** El campo `asistio` ahora es `text` con un CHECK constraint que solo acepta tres valores: `'si'`, `'no'`, o `NULL`.

**Por qué:**
- En el esquema viejo, el campo era declarado como `text` pero `supabase.js` lo convertía a booleano (`true`/`false`) antes de guardarlo. Resultado: al recargar la página, los valores "no registrado" (originalmente `'-'`) se transformaban en `false`, indistinguibles de "no asistió". Esto era el bug que sufrió Gabriela cuando entrevistaba candidatos.
- Con tres estados explícitos (`NULL = no registrado`, `'si' = asistió`, `'no' = no asistió`), el dato se preserva fielmente.
- Se eligió `text` con CHECK en lugar de un tercer ENUM porque eran solo 3 valores y porque facilita extender a futuro si aparece un cuarto caso (por ejemplo, "reprogramado").

## 3.5. Por qué dividir el refactor en 5 fases

**Decisión:** El refactor del módulo Candidatos se planificó en 5 fases secuenciales: (1) save/load del candidato, (2) transiciones de estado, (3) filtros y búsqueda, (4) cosméticos, (5) limpieza.

**Por qué:**
- Cada fase puede aplicarse y commitearse de forma independiente sin dejar el módulo en un estado peor.
- Fase 1 (la prioritaria) cubre el flujo más usado: crear/editar candidatos. Esto se hizo en esta sesión.
- Fases 2 y 3 corrigen bugs de regresión que aparecen al usar funciones específicas (mover candidato a Psicotécnico, registrar asistencia, filtros de columna).
- Fases 4 y 5 son mejoras de UX y limpieza.
- La división reduce el tamaño de cada commit y facilita la revisión por parte de Lautaro (política C.1: "una cosa a la vez").

## 3.6. Por qué hacer `candidatos.js` antes que el HTML

**Decisión:** Refactorizar primero el código JS y dejar el HTML del formulario para una fase posterior.

**Por qué:**
- El JS define el contrato esperado (qué IDs lee, qué campos manda); el HTML lo cumple. Si se hace al revés, hay que reescribir el JS cuando se vea cómo quedó el HTML.
- Costo asumido: durante el período entre commit JS y commit HTML, el modal va a leer "vacío" en los campos nuevos (`c-apellido`, `c-genero`, `c-nombre-referido`) porque no existen en el DOM. El código usa el patrón defensivo `$(...) || {}`, así que no tira error.

## 3.7. Por qué `parseInt` con guard de `Number.isNaN` para `rrhhId`

**Decisión:** En `guardarCandidato`, el código lee el value de `c-rrhh`, le aplica `parseInt`, y si el resultado es `NaN`, cae a `null`.

**Por qué:**
- Durante el período entre commit JS y commit HTML, el input `c-rrhh` sigue siendo un `<input type="text">` (no select). Si alguien escribe texto, `parseInt('Gabriela', 10)` devuelve `NaN`.
- Mandar `NaN` a Supabase rompería el cast a bigint. El guard convierte ese caso en `null` (campo vacío), que es aceptable.
- Cuando el HTML se actualice y `c-rrhh` sea un `<select>` con `value=id_numerico`, el guard sigue siendo correcto (no cambia el comportamiento).

## 3.8. Por qué resolver `responsable` del turno desde `personal_rrhh` en lugar de migrar la tabla `turnos`

**Decisión:** Cuando se crea un turno asociado a un candidato, el campo `responsable` del turno se llena con el `nombre` resuelto desde `DB.personalRrhh` (lookup por `id` igual a `rrhhId`), no con el `rrhh_id` directo.

**Por qué:**
- La tabla `turnos` no fue migrada en v002, sigue con su esquema viejo (`responsable text`).
- Migrar `turnos` quedaba fuera del alcance acordado para esta sesión.
- La resolución a string mantiene el contrato actual de la tabla y permite migrar `turnos` después sin tocar este código.

## 3.9. Por qué `creadoPor` lee del usuario activo en lugar de pedirlo al formulario

**Decisión:** El campo `creadoPor` se llena automáticamente con `currentUser.nickname || currentUser.nombre` (variable importada de `state.js`).

**Por qué:**
- Es información de auditoría, no de negocio. No tiene sentido pedirle al usuario que escriba su propio nombre.
- `currentUser` ya estaba disponible en el sistema (lo usa `nav.js` para mostrar el avatar y el nombre en la barra lateral).
- Si por alguna razón `currentUser` es `null` (caso raro, solo si el código se ejecuta antes del login), el campo queda `null` en la base sin romper.

---

# 4. Estado del módulo Candidatos (detalle técnico)

## 4.1. Lo que YA está refactorizado

### `src/shared/supabase.js`
- Mapa `_SM`: incluye `personalRrhh: 'personal_rrhh'`.
- Función `_toSnake`: incluye los 8 mapeos camel→snake nuevos (`fecNac`, `fechaCita`, `horaCita`, `nombreReferido`, `rrhhId`, `anuladoPor`, `anuladoFecha`, `creadoPor`).
- Función `_toCamel`: incluye los 8 mapeos snake→camel inversos.
- Sanitización vieja de `asistio` (string → boolean) eliminada.
- Duplicado de `estadoCivil` en `_toSnake` limpiado.

### `src/modules/candidatos/candidatos.js`

Funciones refactorizadas:

- **Helpers nuevos:** `ESTADO_DISPLAY` (mapa `'Psicotecnico' → 'Psicotécnico'`) y `formatearFechaISO(iso)` (convierte `YYYY-MM-DD` → `DD/MM/AAAA`).
- **`renderCandidatos`:** filtro histórico usa `'Psicotecnico'`; búsqueda contempla `apellido`.
- **`renderFilaCand`:** display de `apellido, nombre`, `fechaCita` formateada, `horaCita`, valores `'si'`/`'no'` en asistio, `ESTADO_DISPLAY` para color y texto del estado.
- **`guardarCandidato`:** validación incluye apellido, lectura de los campos nuevos, `rrhhId` con guard contra `NaN`, persistencia de `nombreReferido`, `genero`, `creadoPor`, `asistio: null` por default, turno con `responsable` resuelto desde `personal_rrhh`.
- **`editarCandidato`:** carga los campos nuevos al formulario, elimina parseo manual de fechas, título "Apellido, Nombre".

## 4.2. Lo que QUEDA PENDIENTE de refactorizar

Cada item con prioridad indicada.

### Fase 2 — Transiciones de estado (prioridad CRÍTICA)

Sin estas correcciones, los flujos que mueven al candidato entre estados van a fallar contra la base nueva.

- **`pasarAPsicoPorId`** (línea ~474 de `candidatos.js`):
  - Cambiar `c.estado = 'Psicotécnico'` por `c.estado = 'Psicotecnico'`.
  - El código también crea un registro en `DB.psicos` (tabla `psicos` NO migrada). Hay que decidir: (a) seguir guardando ahí `c.nombre` y `c.rrhh` (texto), lo que requiere construir esos campos a partir del esquema nuevo (`c.apellido + ' ' + c.nombre` y resolver desde `personalRrhh`), o (b) migrar también `psicos`. **La decisión 3 del plan original fue (a)**.
  - Resolver: `nombre: c.apellido + ' ' + c.nombre`, `rrhh: (DB.personalRrhh.find(p => p.id === c.rrhhId) || {}).nombre || ''`.

- **`guardarResultadoEntrevista`** (línea ~425 de `candidatos.js`):
  - Cambiar `c.asistio = asistio.value` (donde `asistio.value` es `'Sí'` o `'No'`) por valores `'si'`/`'no'`. Esto requiere también cambiar los `value` de los radio buttons en el HTML (`input[name="asistio-radio"]`). **Atención cruzada con la Fase HTML**.
  - Cuando "no asistió", cambiar `c.fecha = ''` y `c.hora = ''` por `c.fechaCita = null` y `c.horaCita = null`.

- **`registrarAsistencia`** (línea ~492 de `candidatos.js`):
  - El parámetro `valor` viene del select inline que ya fue actualizado en la Fase 1 a `'si'`/`'no'`/`''`. Reemplazar las comparaciones `valor === 'Sí'` y `valor === 'No'` por `valor === 'si'` y `valor === 'no'`.
  - Cambiar `c.fecha = ''` y `c.hora = ''` por `c.fechaCita = null` y `c.horaCita = null`.

- **`guardarCita`** (línea ~375 de `candidatos.js`):
  - Reemplazar `c.fecha = new Date(fecha).toLocaleDateString('es-AR')` por `c.fechaCita = fecha` (ya viene en ISO del input type=date).
  - Reemplazar `c.hora = hora` por `c.horaCita = hora`.
  - El turno creado debe usar los campos nuevos del candidato (`apellido + ' ' + nombre`, `responsable` resuelto desde `personalRrhh` por `c.rrhhId`).

### Fase 3 — Filtros y búsqueda (prioridad MEDIA)

- **`filtrarCandidatos`** (línea ~151 de `candidatos.js`):
  - Cambiar comparaciones de `c.rrhh` por `c.rrhhId` (y notar que el value del select del filtro va a ser el nombre del responsable, no el id — esto requiere coordinación con `poblarFiltrosColumnasCandidatos`).
  - Cambiar `c.asistio === 'Sí'` por `c.asistio === 'si'` (o similar) en los filtros.
  - Cambiar `c.fecha` por `c.fechaCita`.
  - Contemplar `apellido + nombre` en búsqueda.

- **`poblarFiltrosColumnasCandidatos`** (línea ~177 de `candidatos.js`):
  - Reemplazar `DB.usuarios.filter(... perfil RRHH) + DB.rrhh + 'Agente IA Ohlimpia'` por `DB.personalRrhh.filter(p => !p.anulado).map(p => p.nombre)`.
  - El value del `<option>` puede ser el id o el nombre — definir antes y mantener consistencia con `filtrarCandidatos`.

### Fase 4 — Modal HTML (prioridad MEDIA)

Tocar `index.html` (archivo en la raíz, ~308 KB monolítico). Cambios necesarios:

- Agregar `<input type="text" id="c-apellido">` antes del input de nombre.
- Agregar `<input type="text" id="c-nombre-referido">` (probablemente cerca del campo "Medio").
- Convertir `<input id="c-rrhh">` (texto) en `<select id="c-rrhh">` con opciones que se generen dinámicamente desde `DB.personalRrhh` al abrir el modal. **Esto requiere actualizar `abrirNuevoCandidato` para que pueble el select cada vez que se abre el modal** (los 5 nombres pueden cambiar si se agrega/anula gente).
- Convertir `<input id="c-genero">` en `<select id="c-genero">` con opciones `Masculino`/`Femenino`/`Otro` (alineadas con el ENUM `genero_persona`).
- Verificar que `<input id="c-fecnac">`, `<input id="c-fecha">` sean `type="date"`. Si no, cambiar.
- Verificar que `<input id="c-hora">` sea `type="time"`. Si no, cambiar.
- Cambiar los `value` de los radio buttons del modal de resultado de entrevista de `"Sí"`/`"No"` a `"si"`/`"no"`. IDs probables: `input[name="asistio-radio"]`.

### Fase 4 — Cosméticos en candidatos.js (prioridad BAJA)

- **`abrirNuevoCandidato`** (línea ~223 de `candidatos.js`):
  - Agregar `'c-apellido'` y `'c-nombre-referido'` a la lista de IDs que se limpian al abrir el modal "nuevo".
  - Agregar `'c-genero'` a la lista de selects.

- **`abrirCitarPorId`** (línea ~364 de `candidatos.js`):
  - Cambiar `$('citar-nombre').textContent = c.nombre` por `c.apellido + ', ' + c.nombre`.

- **`abrirResultadoPorId`** (línea ~408 de `candidatos.js`):
  - Cambiar la línea de display del nombre por `apellido + ', ' + nombre`.
  - Cambiar `c.fecha` y `c.hora` por `c.fechaCita` y `c.horaCita`.

- **`aprobarCandidatoPorId`** (línea ~455 de `candidatos.js`):
  - Cambiar el toast `'✅ ' + c.nombre + ' aprobado'` por `'✅ ' + c.apellido + ', ' + c.nombre + ' aprobado'`.

### Fase 5 — Limpieza (prioridad BAJA)

- **`getIdxById`** (línea ~16 de `candidatos.js`): código muerto, no se usa internamente. Verificar con grep si lo llama algún archivo externo antes de borrar. Si no, eliminarlo del archivo y del `index.js` que lo re-exporta.
- **`onChangeEstadoCand`** (línea ~213 de `candidatos.js`): si cambian los IDs del HTML, ajustar referencias. Si no, queda igual.

---

# 5. Cómo retomar el trabajo (paso a paso)

## 5.1. Mensaje sugerido para abrir Claude Code en la próxima sesión

```
Retomo el refactor del módulo Candidatos de Ohlimpia desde donde quedó la
sesión del 17 de mayo de 2026. Antes de hacer nada:

1. Leé docs/TRASPASO_2026-05-17_sesion_refactor_candidatos.md (este documento).
2. Leé también POLITICAS_PROYECTO.md y CLAUDE.md (políticas y arquitectura).
3. Hacé git status, git log -10 --oneline y git pull.
4. Confirmame: ¿la rama main está limpia y sincronizada?

Después de confirmar el estado, NO modifiques código todavía. Esperá que te
diga por dónde seguir (probablemente Fase 2: transiciones de estado).
```

## 5.2. Documentos a leer en orden

1. **`POLITICAS_PROYECTO.md`** — define cómo trabajamos. Especialmente la A.4 (diagnóstico antes de cada cambio) y la A.11 (preferencia por rehacer ante deuda heredada).
2. **`CLAUDE.md`** — arquitectura del sistema, módulos, convenciones, tablas de Supabase.
3. **Este traspaso** — estado actual, decisiones tomadas, pendientes.
4. **`docs/DIAGNOSTICO_CANDIDATOS_2026-05-17.md`** — análisis técnico del módulo.
5. **`sql/v002_candidatos_y_personal_rrhh.sql`** y **`sql/v003_personal_rrhh_id_local.sql`** — esquema actual de candidatos y personal_rrhh en Supabase.

## 5.3. Orden recomendado de continuación

**Antes de tocar código:** abrir el sistema en el navegador (`npm run dev`), iniciar sesión y verificar visualmente:
- ¿La tabla de candidatos carga sin error en consola?
- ¿Los 5 nombres de RRHH están en `DB.personalRrhh`? (verificable en la consola del navegador: `console.log(DB.personalRrhh)`)
- ¿Al hacer click en "📅 Citar" qué pasa? (debería romperse, es un test del estado actual).

**Después del diagnóstico:**

1. **Fase 2 (críticas):** Refactorizar `pasarAPsicoPorId`, `guardarCita`, `guardarResultadoEntrevista`, `registrarAsistencia`. Estas son las funciones que hoy están más rotas. Sugerencia: un commit por función o uno por las 4 si los cambios son chicos.

2. **Fase 3 (medias):** `filtrarCandidatos` y `poblarFiltrosColumnasCandidatos`. Ambas tocan los filtros de la tabla.

3. **Fase 4 (HTML + cosméticos):** primero los cambios al HTML, después los toques cosméticos del JS que dependen de ellos.

4. **Fase 5 (limpieza):** opcional, puede esperar.

## 5.4. Verificaciones antes de tocar código (cada vez)

- `git status` — ¿árbol limpio?
- `git log -10 --oneline` — ¿estoy parado en el último commit conocido?
- `git pull` — ¿hay cambios remotos?
- ¿El esquema de Supabase coincide con lo que dicen los SQL en el repo? (Si hay duda, abrir el dashboard de Supabase y verificar columnas.)

---

# 6. Riesgos abiertos y cosas que vigilar

## 6.1. El sistema está en estado intermedio

**No es recomendable usar el módulo Candidatos en producción hasta cerrar al menos las Fases 2 y 3.** Las operaciones que están rotas hoy:

- Mover un candidato Aprobado a Psicotécnico (botón "🧠 Psico").
- Agendar una cita desde el botón "📅 Citar".
- Registrar resultado de entrevista (botón "📋 Resultado").
- Cambiar el estado de asistencia desde el select inline.
- Usar los filtros de columna por RRHH, asistió o fecha.

Crear un candidato nuevo y editarlo **sí funciona**, pero el modal HTML está incompleto (falta `c-apellido`, `c-genero`, etc.) hasta que se cierre la Fase HTML.

## 6.2. ENUM `'Psicotecnico'` rechaza valores con tilde

El ENUM `estado_candidato` solo acepta `'Psicotecnico'` (sin tilde). Cualquier código que escriba `'Psicotécnico'` (con tilde) va a hacer que el update falle.

**Lugares a verificar en la próxima sesión:**

- `src/modules/candidatos/candidatos.js`: la función `pasarAPsicoPorId` sigue con tilde (confirmado en esta sesión).
- `src/legacy.js`: archivo de ~13.400 líneas con módulos no migrados. **No verifiqué exhaustivamente** cuántos lugares escriben `'Psicotécnico'`. Hacer `grep -n 'Psicotécnico' src/legacy.js src/modules/` antes de seguir.
- HTML: los `<option>` del filtro `cf-cand-estado` pueden tener `'Psicotécnico'` como value. Verificar.

## 6.3. Timing de carga de `DB.personalRrhh`

El módulo Candidatos asume que `DB.personalRrhh` está poblado cuando se abre el formulario (para resolver el `responsable` del turno) o cuando se popula el filtro RRHH. **No verifiqué** si hay alguna condición de carrera entre `supaInit` y la apertura del modal.

**Verificación sugerida:** al iniciar la app, en la consola del navegador: `await new Promise(r => setTimeout(r, 2000)); console.log(DB.personalRrhh);` debería mostrar los 5 nombres.

Si hay un timing issue, puede que `(DB.personalRrhh || []).find(...)` devuelva `undefined` en el primer guardado y el turno quede sin responsable. No es bloqueante (no rompe), pero deja el dato vacío.

## 6.4. `creadoPor` depende de `currentUser`

Si por alguna razón `currentUser` es `null` al momento de crear un candidato (caso raro, solo si se ejecuta antes del login), el campo `creadoPor` queda `null` en la base. **No es bloqueante** (la columna es nullable) pero pierde el dato de auditoría.

## 6.5. `personal_rrhh` aún no tiene ABM en el frontend

Las 5 personas están cargadas vía SQL (hardcoded en el script v002). **No hay forma desde la interfaz de agregar, modificar o anular una persona del equipo.** Si Gabriela necesita agregar un sexto integrante, hoy se hace con SQL manual.

**Pendiente futuro:** módulo ABM para `personal_rrhh` (no scope de esta sesión).

## 6.6. La columna `asistio` puede tener datos sucios de la migración

El script v002 borró la tabla `candidatos` y la recreó desde cero. Si quedó algún registro de prueba antes de v002 con `asistio = true` o `false` (string `'true'`/`'false'`), no se preservó. Esto es esperado pero conviene tenerlo presente.

## 6.7. `legacy.js` puede estar pisando datos

En la línea ~492 de `src/legacy.js`, hay un código que hace:
```js
DB.candidatos.filter(c => c.estado === 'Sin citar').forEach(c => {
  c.estado = 'Citado';
  c.rrhh = 'Agente IA Ohlimpia';
});
```

Este código:
- Asigna `c.rrhh` como **string**, no como `rrhhId`. Esto no se persiste correctamente con el mapeo nuevo (se mandaría como `rrhh` a Supabase, columna que ya no existe).
- No llama a `supaSync`, solo modifica memoria.
- Setea masivamente "Citado" sin crear turnos asociados.

**No fue tocado en esta sesión.** Probablemente parte de una funcionalidad de demo. Vale revisarlo en la Fase de limpieza.

## 6.8. El estado en memoria puede divergir del estado en Supabase

`supaSync` está implementado con try/catch silencioso: si Supabase falla, se warea en consola pero el usuario no se entera. El objeto en memoria queda actualizado pero la base no. **Política A.5 y A.8 sugieren** que esto debería mostrarse al usuario, pero el cambio está fuera de scope actual.

**Vigilar:** si en la próxima sesión hay reportes de "guardé y desapareció al recargar", probablemente es esto. Mirar la consola del navegador.

---

# 7. Inventario de archivos modificados en la sesión

| Path | Inserciones | Eliminaciones | Commit(s) |
|---|---|---|---|
| `POLITICAS_PROYECTO.md` | +296 | 0 (nuevo) | `65afff0` |
| `docs/DIAGNOSTICO_CANDIDATOS_2026-05-17.md` | +209 | 0 (nuevo) | `dd6b262` |
| `sql/v002_candidatos_y_personal_rrhh.sql` | +279 | 0 (nuevo) | `87d6c53` |
| `docs/backups/candidatos_2026-05-17.csv` | +36 | 0 (nuevo) | `463fb35` |
| `sql/v003_personal_rrhh_id_local.sql` | +73 | 0 (nuevo) | `92ac702` |
| `src/shared/supabase.js` | +8 | -2 | `313bf93` |
| `src/modules/candidatos/candidatos.js` | +28 | -11 | `150cfa1` |
| `src/modules/candidatos/candidatos.js` | +45 | -33 | `5a3fe03` |

**Totales de la sesión:** +974 líneas insertadas, -46 eliminadas. 8 commits. 7 archivos creados, 2 modificados (en realidad 1 archivo modificado en 2 commits separados: `candidatos.js`).

**Carpetas nuevas creadas:** `docs/`, `docs/backups/`, `sql/`.

**Ningún archivo fue borrado.**

---

# 8. Apéndice: Mensajes de commit completos

A continuación los 8 mensajes textuales, multilínea, como se commitearon.

---

### `65afff0`

```
docs: agregar POLITICAS_PROYECTO.md con reglas del proyecto

Documento dictado por Lautaro que establece:
- Politicas firmes (10) que se aplican a cada cambio
- Direccion estrategica (5) para evaluar en su momento
- Convenciones operativas (3) de trabajo en equipo
- Anexo historico que documenta la deuda tecnica heredada

A partir de este commit, este archivo debe ser leido junto con
CLAUDE.md al inicio de cada sesion.
```

---

### `dd6b262`

```
docs: agregar diagnostico tecnico de modulo Candidatos

Auditoria completa del modulo realizada antes de implementar
feedback de Gabriela y arreglar bugs. Sirve como base para
decisiones futuras sobre rehacer o modificar el modulo.
```

---

### `87d6c53`

```
feat: agregar script SQL v002 para refactor de candidatos y nueva tabla personal_rrhh

Este script implementa los siguientes cambios:
- Crea tabla personal_rrhh (equipo de 5 personas de Ohlimpia)
- Crea tipos ENUM estado_candidato y genero_persona
- Reemplaza tabla candidatos con estructura corregida
- Resuelve 4 inconsistencias detectadas en la auditoria
- Implementa soft delete y auditoria basica (politicas A.7 y A.8)
- Implementa feedback de Gabriela (apellido/nombre separados, nombre_referido, FK a personal_rrhh)

ATENCION: el script NO se ejecuta automaticamente. Se aplica manualmente
en Supabase desde el SQL Editor. Antes de aplicarlo, exportar la tabla
candidatos actual como CSV de respaldo.
```

---

### `463fb35`

```
chore: backup CSV de tabla candidatos antes de aplicar script v002

Respaldo precautorio de los 35 registros de prueba existentes en la
tabla candidatos antes de ejecutar la migracion v002 que la rebuild
desde cero. Los datos son de prueba, no productivos.
```

---

### `92ac702`

```
fix: agregar id_local a personal_rrhh para alinear con patron del proyecto

El script v002 creo personal_rrhh con solo 'id' bigint como identificador,
pero el resto del proyecto usa el patron 'id_local' (timestamp truncado a
9 digitos) como identificador para todas las tablas.

Este script:
- Agrega columna id_local a personal_rrhh.
- Rellena las 5 filas existentes con el id numerico formateado a 9 digitos.
- Marca id_local como NOT NULL UNIQUE.

Despues de aplicar este script, las funciones supaSync, supaDel y _toCamel
de src/shared/supabase.js van a funcionar con personal_rrhh sin cambios,
lo cual era el problema detectado en la planificacion de C.1.
```

---

### `313bf93`

```
refactor: actualizar mapeo de supabase.js para esquema v002 + v003

Cambios:
- Agregar tabla personalRrhh al mapa _SM
- Agregar 8 mapeos camelCase<->snake_case para los campos nuevos
  del esquema v002 (fec_nac, fecha_cita, hora_cita, nombre_referido,
  rrhh_id, anulado_por, anulado_fecha, creado_por)
- Eliminar sanitizacion vieja del campo asistio que convertia
  'Si'/'No' a booleano (resuelve el bug que le paso a Gabriela:
  ahora asistio es text con valores 'si'/'no'/null)
- Limpiar duplicado de estadoCivil en _toSnake

Este commit acompana las migraciones SQL v002 y v003. El codigo del
modulo Candidatos (candidatos.js + HTML) todavia esta desactualizado
y se actualiza en los proximos commits (sub-tareas C.2 y C.3).
```

---

### `150cfa1`

```
refactor(candidatos): adaptar render a esquema v002+v003

- Agregar helpers ESTADO_DISPLAY (mapea 'Psicotecnico' sin tilde
  del ENUM a 'Psicotécnico' con tilde para display)
- Agregar helper formatearFechaISO (YYYY-MM-DD a DD/MM/AAAA)
- renderCandidatos: cambiar 'Psicotécnico' por 'Psicotecnico' en
  filtros, contemplar apellido en busqueda por texto
- renderFilaCand: usar apellido + nombre, fechaCita, horaCita,
  valores 'si'/'no' en asistio, estadoDisplay con tilde correcta

El modulo aun no es 100% funcional: guardarCandidato y
editarCandidato se actualizan en el siguiente commit.
```

---

### `5a3fe03`

```
refactor(candidatos): adaptar guardar/editar a esquema v002+v003

- guardarCandidato: validar apellido, leer rrhhId como FK numerica,
  fechaCita/horaCita en formato ISO directo, agregar nombreReferido
  y genero, asistio inicial = null en vez de '—', creadoPor desde
  usuario activo, resolver responsable del turno desde personalRrhh
- editarCandidato: cargar c-apellido por separado, c-rrhhId como
  string del id numerico, c-genero, c-nombre-referido, eliminar
  parseo DD/MM/AAAA (las fechas ya vienen ISO del esquema nuevo)
- Titulo de modal en edicion: "Apellido, Nombre"

Despues del commit 2 el modulo JS esta listo. El HTML del formulario
queda pendiente (Fase C.3): hay que agregar inputs c-apellido,
c-nombre-referido, c-genero, y convertir c-rrhh de input a select.
```

---

**Fin del traspaso técnico.**

---

# 9. Mensaje para el próximo Claude web (escrito por Claude web, no por Claude Code)

Esta sección la agrega Claude web al cierre de la sesión. El documento técnico de arriba lo escribió Claude Code, que tiene visibilidad completa del código pero no de la dinámica conversacional. Esta sección complementa eso: explica **cómo se trabaja con Lautaro**, no solo qué se hizo.

Si sos un Claude web (o cualquier asistente) que está retomando este proyecto, leé esto antes de empezar a planificar.

## 9.1. Lo más importante en una frase

**Lautaro no es programador.** Tiene experiencia de Clipper de los 90, lo cual le da lógica de negocio y entendimiento de bases de datos a nivel conceptual, pero no escribe código moderno. Eso significa que vos sos los ojos técnicos del proyecto, pero las decisiones de negocio son de él. Nunca asumas que entiende jerga técnica sin explicación.

## 9.2. La dinámica de trabajo de tres puntas

El proyecto funciona con un equipo de tres:

- **Lautaro:** decide, ejecuta acciones físicas (clics, pegar mensajes, sacar capturas), prueba el sistema en su navegador.
- **Claude web (vos, si sos un Claude web):** piensa, planifica, revisa diffs, redacta los mensajes precisos que se le pasan a Claude Code. Es el "ingeniero senior" del equipo.
- **Claude Code (terminal en la compu de Lautaro):** modifica archivos, ejecuta comandos de Git, consulta el código.

**Vos (Claude web) nunca tocás archivos directamente.** Tu trabajo es pensar bien y redactar mensajes claros para que Lautaro se los pase a Claude Code.

**Flujo de cada cambio:**

1. Claude web propone el cambio con diagnóstico previo.
2. Lautaro decide si avanza o pide modificaciones.
3. Claude web redacta el mensaje exacto para Claude Code.
4. Lautaro lo pega en Claude Code.
5. Claude Code responde con un plan o un diff.
6. Lautaro copia la respuesta y la pega en Claude web.
7. Claude web revisa antes de aprobar.
8. Solo entonces Claude Code ejecuta y commitea.

**Regla de oro:** una cosa a la vez. Nunca se le manda un segundo mensaje a Claude Code sin pasar por Claude web.

## 9.3. Cómo Lautaro toma decisiones

**Las decisiones de negocio las toma él, siempre.** Ejemplos: qué campos necesita una tabla, qué validar, qué módulo atacar primero, si un cambio amerita rehacer o modificar.

**Las decisiones puramente técnicas las puede delegar en vos.** Ejemplos: qué patrón de código usar, en qué orden aplicar cambios sin riesgo, qué helper crear. Cuando lo delegue ("decidí vos"), igualmente explicá el razonamiento abierto para que él pueda objetar si no le cierra. No decidas en silencio.

**Cuando responda "no preference" o "decidí vos" muchas veces seguidas**, probablemente está cansado o abrumado. Es señal de hacer una pausa, no de seguir.

## 9.4. Patrón de comunicación que funciona

**Lo que funciona:**

- Explicar cada cosa con peras y manzanas. Después de cada término técnico, una traducción en castellano.
- Usar tablas y listas cuando hay comparaciones (no párrafos largos).
- Antes de cada cambio importante, presentar dos o tres opciones con consecuencias y dejarlo elegir.
- Marcar explícitamente cuando un cambio es destructivo (borra datos, modifica tablas) y obligar a hacer backup antes.
- Pedir capturas de pantalla para verificar visualmente cada paso. No avanzar a ciegas.
- Cerrar cada cambio con su commit, con mensaje claro en español. Política A.3 estricta.

**Lo que NO funciona:**

- Inventar detalles que no se verificaron. Si no estás seguro, decilo.
- Avanzar varios pasos sin verificación intermedia.
- Usar jerga sin explicarla (`useState`, `async/await`, etc.).
- Decir "ya está hecho" sin captura de confirmación.
- Plantear decisiones técnicas como obvias cuando para él no lo son.

## 9.5. Las políticas son sagradas

El archivo `POLITICAS_PROYECTO.md` no es decoración. Lautaro las dictó él mismo, las firmó, y son las reglas del proyecto. Las más importantes:

- **A.2:** toda decisión debe ser entendible antes de ejecutarse.
- **A.3:** commit por cada cambio lógico, en español, mensajes claros.
- **A.4:** diagnóstico antes de cada cambio (estado actual, qué cambiar, cómo, cómo probar, cómo revertir).
- **A.5:** persistencia en Supabase; cada cambio de tabla = un script SQL nuevo, no se modifica uno viejo.
- **A.6:** valores económicos con vigencia temporal (cuando lleguen al proyecto).
- **A.7:** ningún registro se borra físicamente; soft delete + auditoría siempre.
- **A.11:** preferencia por rehacer cuando hay deuda técnica heredada; presentar siempre el cuadro "modificar vs rehacer" antes de tocar un módulo.

Si te encontrás violando una política, parate y avisá. No avances "porque es más simple".

## 9.6. El contexto histórico que importa

El proyecto arrastra deuda técnica de su origen. Está documentada en el Anexo Histórico de `POLITICAS_PROYECTO.md`. Resumen: el sistema empezó como una conversación con Claude sin contexto, creció a 35.000 líneas en HTML único sin base de datos real, se migró a un entorno profesional con Claude Code, y se está modularizando de a poco.

Eso significa que vas a encontrar:

- Código en `legacy.js` (~13.400 líneas) que aún espera ser migrado.
- Módulos migrados con calidad variable (Candidatos, Psicotécnico, Altas, Legajos).
- Decisiones del pasado que pueden estar mal y conviene revisar antes de construir encima.

La política A.11 está pensada para esto: ante un módulo con deuda heredada, **proponer rehacer como opción primaria**, no modificar.

## 9.7. Sobre Gabriela y los usuarios reales

Gabriela Lucero es la Responsable de RRHH de Ohlimpia, usuaria principal del módulo Candidatos. Le pasó al menos un bug confirmado (el del campo `asistio`). Cuando Lautaro mencione feedback de Gabriela, **tomalo como prioritario** — son requerimientos validados por uso real, no especulaciones.

El equipo de RRHH son 5 personas: Gabriela Lucero, Matilde Noceti, Jimena Martinez, Martina Ramirez, Naara Rodriguez. Están cargadas como filas iniciales en `personal_rrhh`.

**El sistema todavía no está en producción.** Los datos que había en `candidatos` antes del refactor eran de prueba. Cuando llegue el momento de tener datos reales, las políticas A.5 y A.7 cambian de "buena práctica" a "obligatorio" (no más DROP TABLE, solo ALTER TABLE; backup obligatorio antes de cada cambio).

## 9.8. Lo que sí o sí tenés que hacer en la primera respuesta de la próxima sesión

1. Confirmar que leíste `POLITICAS_PROYECTO.md` y este documento de traspaso.
2. Preguntar cómo está Lautaro (estuvo una sesión muy larga la última vez).
3. Confirmar si retomamos por donde dejamos (Fase 2: transiciones de estado) o si hay un cambio de prioridad.
4. **No arrancar a tirar código.** Primero diagnosticar el estado real del proyecto (puede haber pasado tiempo y haber cambios en GitHub que no sabés).

## 9.9. Lo que hay que evitar a toda costa

- Modificar archivos sin haberlo conversado con Lautaro. No tenés mandato.
- Asumir que algo funciona porque "tendría que funcionar". Pedir verificación visual.
- Inventarte el estado del proyecto. Si dudás, pedí captura o pedí que Claude Code corra `git status` / `git log`.
- Hacer commits gigantes con muchos cambios mezclados. La política A.3 manda commits chicos.
- Olvidarte de los backups antes de cambios destructivos.
- Saltearte el diagnóstico previo. La política A.4 es no negociable.

## 9.10. Un mensaje final

Lautaro está construyendo un sistema de gestión cooperativa para 500 personas, sin ser programador, con asistencia de IA. Ese es un proyecto ambicioso pero alcanzable, **si trabajamos con disciplina**. Tu rol es ayudarlo a mantener esa disciplina, especialmente cuando él esté cansado o tentado a saltar pasos. No por terquedad, sino porque sabe que cada paso saltado se paga después.

Sé claro, sé honesto, no infles tus respuestas, y cuando él tome una decisión que no compartas, marcá tu disenso pero respetá su autoridad. Es su proyecto, su empresa, su responsabilidad.

Buena suerte.

— Claude web, al cierre de la sesión del 2026-05-17.
