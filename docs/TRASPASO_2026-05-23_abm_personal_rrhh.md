# Traspaso de sesión — 23/05/2026: ABM de Personal RRHH (completo) + fix MODULOS_SISTEMA

**Fecha:** 2026-05-23
**Versión del documento:** 1.0
**Autor:** Claude web (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 del proyecto (documento de traspaso al final de sesión larga)
**Documento previo:** `docs/TRASPASO_2026-05-17_sesion_tarde.md`

## Resumen en una frase

Se construyó de cero el ABM completo de Personal RRHH (Selectoras) dentro de la pantalla Configuración —alta, baja lógica, modificación y reactivación, todo persistente en Supabase—, se arregló un bug heredado que rompía toda la pantalla de Configuración (`MODULOS_SISTEMA` perdida en la migración a Vite), y se separó apellido/nombre en el catálogo de selectoras (script SQL v004).

---

# 1. Estado actual del proyecto

## 1.1. Lo que está funcionando (probado visualmente end-to-end)

**Módulo Personal RRHH (NUEVO, creado en esta sesión):**
- Vive en `src/modules/personal_rrhh/` (módulo separado, no en legacy.js).
- Se muestra como una tab "👥 Personal RRHH" dentro de la pantalla Configuración (visible solo a Administrador total).
- **Listado:** muestra las selectoras no anuladas en formato "Apellido, Nombre" + Puesto + Acciones.
- **Alta:** botón "+ Nueva persona" abre un modal (Apellido, Nombre, Puesto). Normaliza apellido/nombre a Title Case. Persiste en Supabase. Validado: se creó "Perez, Juan" y sobrevivió al refresh.
- **Edición:** botón ✏️ en cada fila abre el mismo modal precargado. Usa `dataset.editId` para recordar a quién edita. Actualiza in-place sin duplicar. El botón del modal cambia de texto ("Crear persona" / "Guardar cambios") y el título también. Validado.
- **Anular (soft delete):** botón 🗑️ pide confirmación (`confirm()` nativo), marca `anulado=true`, persiste. La persona desaparece de la vista normal. Cumple política A.7.
- **Reactivar:** checkbox "Ver anuladas" muestra SOLO las anuladas (vista papelera, excluyente de las activas, igual que el patrón Activos/Histórico de Candidatos). Cada anulada se ve en gris con cartel "(anulada)" y botón ♻️ que la devuelve a activas.
- **Guard:** no se puede editar una persona anulada (toast "Reactivá la persona antes de editarla").

**Catálogo personal_rrhh:**
- Tabla con columna `apellido` agregada (script v004). Las 5 selectoras quedaron con apellido y nombre separados.
- Efecto secundario positivo: el select de "Selectora" del módulo Candidatos ahora muestra "Apellido, Nombre" con coma (resolvió un pendiente del traspaso anterior).

**Pantalla Configuración (reparada en esta sesión):**
- El bug `MODULOS_SISTEMA is not defined` está arreglado. Antes cortaba `renderConfiguracion()` a la mitad, dejando rotas la tab "Accesos y perfiles" y todo lo que venía después. Ahora Configuración carga completa.

## 1.2. Estado de los datos

- El catálogo `personal_rrhh` quedó con las 5 selectoras reales (id_local 000000001 a 000000005), sin datos de prueba. Los dos registros de testeo (Perez Juan, Gomez Ana) se borraron de Supabase al cierre.

## 1.3. Lo que NO se hizo (pendiente para futuras sesiones)

Ver sección 5 (roadmap). Lo principal: el bug del Alta de asociado sigue sin tocar.

---

# 2. Lo que se hizo en esta sesión (cronológico)

6 commits, todos pusheados a origin/main:

| # | Hash | Mensaje |
|---|------|---------|
| 1 | `ec795fa` | chore: script v004 - separar apellido y nombre en personal_rrhh |
| 2 | `4cc62a2` | fix(config): restaurar MODULOS_SISTEMA perdida en migracion a Vite |
| 3 | `683a4c9` | feat(personal-rrhh): esqueleto del modulo ABM con listado (Etapa 2a) |
| 4 | `2f1ed51` | feat(personal-rrhh): alta de nueva persona con modal (Etapa 3) |
| 5 | `95c7e5c` | feat(personal-rrhh): edicion de persona reutilizando el modal (Etapa 4) |
| 6 | `61a9c24` | feat(personal-rrhh): anular y reactivar con soft delete (Etapa 5) |

## 2.1. Script SQL v004 (commit ec795fa)

`sql/v004_personal_rrhh_apellido.sql`. Agrega columna `apellido` (nullable), repobla las 5 filas separando apellido del nombre, luego marca `apellido` como NOT NULL. Aplicado en Supabase y verificado. No modifica v002 ni v003 (política A.5).

## 2.2. Fix MODULOS_SISTEMA (commit 4cc62a2)

**El bug:** `MODULOS_SISTEMA` se definía solo en el HTML monolítico viejo de respaldo (`ohlimpia_v164_supa_v2.html`). Al partir el monolito en `legacy.js`, las funciones que la usan (líneas 621, 647, 687, 728) se trasladaron pero la definición de la constante quedó afuera. Resultado: `ReferenceError` que cortaba `renderConfiguracion()` en la línea 327.

**El arreglo (Camino A):** se reintrodujo `export const MODULOS_SISTEMA = [...]` (16 módulos con key/label/icon) en `src/shared/state.js`, después de MENU. Se agregó `MODULOS_SISTEMA` al import de `legacy.js:5`. Cambio mínimo y seguro.

**Decisión registrada:** se descartó unificar con MENU (Camino B) porque MENU tiene estructura distinta (perfiles, agrupación por área) y filtrarlo mal afectaría permisos de acceso. Si en el futuro se quiere unificar, es una refactorización propia. **Deuda anotada:** "unificar MODULOS_SISTEMA con MENU" queda como posible mejora futura, no urgente.

## 2.3. ABM Personal RRHH — Etapas 2a a 5 (commits 683a4c9, 2f1ed51, 95c7e5c, 61a9c24)

Construido en etapas, cada una validada visualmente antes de commitear:
- **2a (listado):** módulo nuevo + tab + tabla. Enchufado vía import en main.js + window bindings + una línea en renderConfiguracion de legacy.js.
- **3 (alta):** modal + función guardar con Title Case y persistencia.
- **4 (edición):** reuso del modal con dataset.editId, botón con texto dinámico, guard.
- **5 (anular/reactivar):** soft delete con confirmación, checkbox "Ver anuladas" tipo papelera.

---

# 3. Arquitectura del módulo nuevo (para quien lo retome)

El módulo Personal RRHH es el **primer ABM con soft delete del sistema**. Sirve de molde para futuros ABMs.

**Archivos:**
- `src/modules/personal_rrhh/personal_rrhh.js` — lógica: getPersonaById (helper interno), renderPersonalRrhh, abrirNuevoPersonalRrhh, editarPersonalRrhh, guardarPersonalRrhh, anularPersonalRrhh, reactivarPersonalRrhh.
- `src/modules/personal_rrhh/index.js` — re-exports + window bindings (6 funciones).

**Conexión con el sistema:**
- `src/main.js`: `import './modules/personal_rrhh/index.js';` (no usa registerScreens porque no es pantalla del menú principal).
- `index.html`: botón de tab `cfgTab('personal-rrhh',this)` + contenedor `<div id="cfg-tab-personal-rrhh">` con tabla + checkbox "Ver anuladas" + modal `<div id="modal-personal-rrhh">`.
- `src/legacy.js`: una línea en `renderConfiguracion()` que llama a `window.renderPersonalRrhh()`.

**Patrones reutilizables (para copiar en futuros ABMs):**
- Soft delete: campo `anulado`, filtro condicional según checkbox, vista papelera excluyente.
- Edición sin variable global: `modal.dataset.editId` recuerda a quién se edita; se borra al guardar y al abrir alta nueva.
- Persistencia: `supaSync('personalRrhh', objeto)` hace upsert por id_local derivado del id. Mutar el objeto con `Object.assign` y volver a llamar supaSync hace UPDATE (no duplica).

---

# 4. LECCIÓN IMPORTANTE de esta sesión: duplicación al crear/sobrescribir archivos

**Problema recurrente:** al crear archivos nuevos o sobrescribirlos completos pegando contenido largo de una vez (tanto con el editor de Claude Code como con heredoc de bash), el contenido se DUPLICABA parcialmente (bloques de líneas repetidos). Pasó con el SQL v004 (3 veces) y con personal_rrhh.js.

**Solución que SÍ funciona:**
- Para archivos nuevos: construirlos con `echo "linea" >> archivo` línea por línea, o crear vacío y llenar con ediciones puntuales.
- Para modificar archivos existentes: usar `str_replace` (ediciones puntuales) en vez de reescribir el archivo entero.
- SIEMPRE verificar con `grep -c` que no haya duplicados (contar apariciones de líneas clave y confirmar el número esperado).

**Para la próxima sesión:** arrancar directamente con str_replace puntuales y verificación por grep. No intentar sobrescribir archivos completos con contenido largo pegado.

---

# 5. Roadmap pendiente (del feedback de Gabriela + lo acumulado)

Gabriela (RRHH) NO usa el sistema todavía; solo lo probó para pasar modificaciones. El feedback documentado dejó estos pendientes, en orden de prioridad sugerida:

**Prioridad alta — bug funcional:**
1. **Bug del Alta de asociado.** Al pasar un candidato a Alta, no se transfieren bien los datos básicos (DNI distinto, CUIT y dirección vacíos). Vive en `src/modules/altas/altas.js`. Es el único bug funcional puro del feedback. Probablemente sesión de 1-2 hs: diagnóstico + fix + validación.

**Mejoras de módulos existentes / nuevos (del feedback de Gabi):**
2. **Psicotécnico ampliado:** 5 resultados en lugar de 2 (Apto / Apto+ / No Apto con motivo / Apto– / Apto condicional).
3. **Módulo Pre-ocupacional (nuevo):** turno, prestador (MEDE/CMC/IDT), 5 resultados (APTO / APTO B / APTO C / NO APTO / APTO PENDIENTE).
4. **Antecedentes penales:** con vencimiento (6 meses).
5. **Libreta sanitaria:** zona, vencimiento, foto.
6. **Curso de manipulación de alimentos:** certificado.
7. **Aclarar con Gabi** el formulario de aprobación de entrevista que vive en Google Drive.

**Deuda técnica anotada (no urgente):**
- Unificar `MODULOS_SISTEMA` con `MENU` (hoy son dos listas de módulos separadas). Solo si se decide; requiere su propio diagnóstico por el tema de permisos.

---

# 6. Cómo retomar en la próxima sesión

## 6.1. Mensaje sugerido para abrir Claude Code

```
Retomo el proyecto Ohlimpia. La última sesión (23/05/2026) construyó el
ABM completo de Personal RRHH y arregló el bug de MODULOS_SISTEMA.

1. Leé en este orden:
   - POLITICAS_PROYECTO.md
   - CLAUDE.md
   - docs/TRASPASO_2026-05-17_sesion_tarde.md
   - docs/TRASPASO_2026-05-23_abm_personal_rrhh.md (este)

2. git status, git log -8 --oneline, git fetch, git status (de nuevo).

3. Confirmame: rama main limpia y sincronizada, último commit 61a9c24.

NO modifiques nada. Esperá que te diga por dónde seguir.
```

## 6.2. Próximo paso recomendado

El **bug del Alta de asociado** (punto 1 del roadmap). Es el único bug funcional puro pendiente y afecta el flujo central Candidatos → Altas. Conviene atacarlo antes de los módulos nuevos.

## 6.3. Recordatorios operativos

- Patrón de trabajo: Lautaro decide y ejecuta + Claude web piensa y redacta + Claude Code modifica. Una cosa a la vez. Diagnóstico antes de cada cambio. Validación visual antes de cada push.
- Al crear/editar archivos: str_replace puntuales + verificación grep (ver sección 4).
- El warning "LF will be replaced by CRLF" es inofensivo (Windows normaliza saltos de línea).
- El favicon.ico 404 en consola es inofensivo, ignorar siempre.
- El entorno Supabase dice "PRODUCTION" pero el sistema todavía NO está en uso real (Gabi solo lo probó). Por eso siguen siendo válidos los borrados físicos de datos de prueba y los DROP/amend. Cuando haya datos reales, A.5 y A.7 pasan de buena práctica a obligatorias.

---

# 7. Nota final

Sesión larga y muy productiva, retomada tras 5 días inactivo. Se cerró el ABM de Personal RRHH completo en una sola sesión (las 5 etapas), se eliminó un bug heredado que afectaba toda la Configuración, y se inauguró el patrón de soft delete del sistema. 6 commits, todos chicos, todos validados visualmente antes del push, todos con mensaje claro en español. El flujo de tres se mantuvo sin desviaciones.

El módulo Personal RRHH responde a la consulta original de Lautaro: que el equipo de RRHH pueda gestionar la lista de selectoras desde el sistema, sin depender de tocar Supabase a mano.

— Claude web, al cierre de la sesión del 2026-05-23.
