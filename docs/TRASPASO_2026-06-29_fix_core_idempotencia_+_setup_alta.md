# Traspaso de sesión — 29/06/2026: Fix sistémico del core + setup de Alta

**Fecha:** 2026-06-29
**Autor:** Claude web (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 (documento de traspaso al final de sesión larga)
**Documento previo:** `docs/TRASPASO_2026-06-25_3_modulos_adjuntos_+_plan_alta.md`

## Resumen en una frase

Sesión larga y de alto valor que arrancó pretendiendo implementar el módulo Alta, se desvió al detectar que el candidato de prueba "Carlos" aparecía simultáneamente "En proceso" en los 3 módulos del flujo, terminó identificando y fixeando un bug sistémico real (falta de guards de idempotencia en las aprobaciones que generaban duplicados silenciosos en cascada), y volvió a Alta solo en el setup mínimo (helper H1 listo). El módulo Alta queda con el helper preparado y un plan completo aprobado (M1–M8 + I1), listo para implementar en la próxima sesión con cabeza fresca.

---

# 1. Lo que quedó hecho

## 1.1. Commits aplicados y pusheados a origin/main

| Commit | Tipo | Mensaje | Cambios |
|---|---|---|---|
| `13136e6` | fix | `fix(core): guards de idempotencia en aprobaciones + v012 NOT NULL en id_local` | 5 archivos, +128 / −24 |
| `3edd5b0` | feat | `feat(adjuntos): helper renombrarAdjuntosPorAlta para el modulo Alta` | 1 archivo, +23 |
| `fe7c27a` | docs | `docs: traspaso sesion 25/06 - 3 modulos adjuntos + plan alta` | 1 archivo, +301 |

## 1.2. Detalle del commit `13136e6` (fix sistémico)

**SQL v012 — alineación de `documentacion_ingreso.id_local`:**
- Archivo nuevo: `sql/v012_documentacion_id_local_notnull.sql`.
- Aplica `NOT NULL` a la columna `id_local` de `documentacion_ingreso` (las otras 3 tablas del flujo ya tenían la restricción).
- Incluye backfill defensivo con `LPAD(id::text, 9, '0')` (molde de v003).
- Envuelto en `BEGIN/COMMIT` para atomicidad.
- **⚠️ Ya aplicado en producción en Supabase durante la sesión** (manualmente, vía dashboard, política A.5).

**Guard 1 — `aprobarPsico` (`src/modules/psicotecnico/psicotecnico.js:343-365`):**
- Antes de crear el `preocupacional` nuevo, chequea si ya existe uno "vivo" (`estado === 'En proceso'` o `'Aprobado'`, `!anulado`) para el mismo DNI.
- Si existe: toast informativo `ℹ️ Ya existe un pre-ocupacional vigente para este candidato. No se creó uno nuevo.` y NO crea duplicado.
- Si no existe: crea normalmente + toast de éxito.
- `p.estado = 'Aprobado'` + `supaSync('psicos', p)` quedan **antes** del guard → re-aprobar es idempotente, solo actualiza el psico, no duplica aguas abajo.
- Variable nombrada `preocupVivoExistente` para no colisionar con `preocupVivo` que ya existía en el render.
- **Probado end-to-end con Carlos** (re-aprobar no creó duplicado, mostró toast informativo).

**Guard 2 — `aprobarPreocup` (`src/modules/preocupacional/preocupacional.js:201-222`):**
- Patrón espejo del Guard 1.
- Variable: `documVivoExistente` (no colisiona con `tieneDocVivo` ni `docVivo` existentes).
- Toast informativo: `ℹ️ Ya existe una documentación de ingreso vigente para este candidato. No se creó una nueva.`
- Verificado con `node --check` + grep. NO se re-probó en navegador (patrón ya validado en Guard 1).

**Guard 3 — `_crearAltaDesdeDocum` (`src/modules/documentacion/documentacion.js:277-299`):**
- Estructura distinta a los Guards 1 y 2: el helper devuelve `boolean` (`true` si creó, `false` si ya existía) y los 2 llamadores (`aprobarDocum` y `excepcionDocum`) gatean su toast de éxito con `if (creada) toast(...)`.
- Razón: el helper no tiene toast propio; el toast de éxito vive en los llamadores. Sin gateo, se mostraría "Ya existe" Y "enviado a Alta" → contradicción.
- `cat_alt_pendientes` **NO tiene columna `anulado`**; sus estados son `'Pendiente de alta'` y `'Alta completada'`. El guard no usa `!x.anulado` en este caso.
- Toast informativo: `ℹ️ Ya existe un alta para este candidato. No se creó una nueva.`

**Actualización de `CLAUDE.md`:**
- **Resueltos durante la migración:** nuevo bullet "Aprobaciones sin guard de idempotencia (duplicados en cascada)" con el caso de Carlos como ejemplo.
- **Conocidos / pendientes:** dos bullets nuevos — "Schema drift en `psicos.id`" y "Conciliación por DNI puede bloquear reingresos".
- **Nueva sección "Convenciones operativas de desarrollo":** Heredoc + `grep -c` ante duplicación del preview, `node --check` como árbitro objetivo, "Gana la evidencia" (con caso opuesto: si la evidencia confirma, avanzar con confianza sin sobre-deliberar).

## 1.3. Detalle del commit `3edd5b0` (H1 helper)

**Función nueva `renombrarAdjuntosPorAlta(dni, nroSoc)` en `src/shared/adjuntos.js:188-209`:**
- Actualiza `nombre_archivo` a `"Soc {nroSoc} - {TipoLegible}.{ext}"` para todos los adjuntos vigentes del DNI con `etapa='alta'`.
- **No toca Storage** (decisión C1): el path interno (UUID) queda igual. Solo cambia el nombre visible que el usuario ve al descargar.
- **No toca adjuntos de otras etapas** (psico/preocup/docum) del mismo DNI.
- Lanza `Error` si alguna UPDATE falla → `confirmarAlta` puede mostrar toast diferenciado.
- Loop secuencial (no `Promise.all`): más simple y debuggeable. Aceptable para 4-5 archivos.
- Anti-`dni` o `nroSoc` falsy: retorna sin hacer nada.

## 1.4. Cleanup de datos de prueba (Carlos, DNI 35888777)

**Ejecutado durante la sesión, no commiteado:**
- `UPDATE psicos SET estado='Aprobado', fecha_aprobacion='25/6/2026' WHERE id_local='393221821' AND dni='35888777'`.
- `DELETE FROM preocupacionales WHERE id_local='399428535' AND dni='35888777'` (el duplicado huérfano en "En proceso").
- Carlos quedó con: psico Aprobado, preocup Aprobado (id_local 396241912), documentación En proceso (id_local 399494512). Listo para avanzar a Alta cuando se retome.

## 1.5. Diagnósticos hechos en la sesión (scripts temporales borrados)

Tres scripts custom de diagnóstico se crearon en `/tmp/` y luego en raíz, ejecutados, y eliminados al cierre:
- `diag-carlos.mjs` — listó registros de Carlos en las 4 tablas.
- `diag-idlocal.mjs` — analizó formatos de `id`/`id_local` en todas las filas de las 4 tablas.
- `cleanup-carlos.mjs` — ejecutó las dos mutaciones del cleanup con guards defensivos.

Los 3 fueron `rm` al final (nunca commiteados). Si en una futura sesión se necesita repetir el patrón, este traspaso documenta su existencia.

---

# 2. Bug encontrado y diagnóstico de raíz (lecciones)

## 2.1. El síntoma

Carlos aparecía "En proceso" en los 3 módulos (Psico, Preocup, Documentación) al mismo tiempo. Eso es bug — debería estar "Aprobado" en los anteriores y "En proceso" solo en el actual.

## 2.2. Hipótesis inicial (refutada con datos)

Pensamos que era un **bug sistémico de `id_local`** en `supabase.js` (`supaSync`/`_toCamel`): tras un reload, el ciclo `id ↔ id_local` se rompía, los upserts caían en INSERT en vez de UPDATE → duplicados.

**Diagnóstico profundo refutó la hipótesis:**
- `id_local` está limpio en el 100% de las filas de las 4 tablas: 9 dígitos, sin nulls, sin UUIDs, sin truncados.
- El round-trip `supaSync` ↔ `_toCamel` es consistente antes y después de reload.
- `_toCamel` descarta `id` de la base (línea 137) explícitamente, así que el `id` real de Supabase nunca llega al front — todo opera por `id_local`, que está bien.

**Conclusión:** el core de persistencia funciona bien. Tocarlo habría sido un refactor riesgoso sin beneficio. Política A.8: no agregar complejidad sin beneficio.

## 2.3. Causa raíz real

`aprobarPsico` y `aprobarPreocup` empujaban un registro nuevo en la etapa siguiente **sin chequear si ya existía uno vivo para el DNI**. `aprobarDocum`/`excepcionDocum` hacían lo mismo via `_crearAltaDesdeDocum`.

Durante las pruebas de adjuntos de las sesiones anteriores, Carlos fue aprobado múltiples veces (entre reloads, o por click accidental). Cada "Aprobar" empujaba un preocupacional/documentación nuevo. Resultado: duplicados silenciosos en cascada.

Además, un `revertirPsico` posterior (probablemente durante alguna prueba) dejó el psico en "En proceso" mientras los registros aguas abajo ya existían.

## 2.4. Hallazgo bonus: schema drift en `psicos.id`

El SQL versionado (`crear_tablas.sql`, `setup_supabase.sql`) declara `id bigint generated always as identity`, pero la columna real en la base es `uuid`. Inofensivo en runtime (porque `_toCamel` descarta `id`), pero confirma que los `.sql` no reflejan exactamente la base desplegada. Pendiente: regenerar SQL desde la base o actualizar v002. Anotado en CLAUDE.md.

## 2.5. Hallazgo bonus: `id_local` nullable en `documentacion_ingreso`

`documentacion_ingreso.id_local` se declaró `text UNIQUE` sin `NOT NULL`, mientras que las otras 3 tablas son `text UNIQUE NOT NULL`. Resuelto con v012.

---

# 3. Decisiones de diseño cerradas para Alta

Las 3 decisiones que dejamos pendientes en el traspaso del 25/06 quedan **confirmadas y aplicables**:

| Decisión | Resolución |
|---|---|
| **A — ¿Cuándo permitimos subir archivos?** | A1+A2 combinadas: si modal abre desde flujo (psico/docum aprobado), DNI pre-cargado y readonly. Si abre como "Nuevo" en blanco, caja 📎 deshabilitada hasta que carguen DNI. |
| **B — ¿Qué hacemos si cambian el DNI después de subir?** | B2: DNI readonly si `listarAdjuntos({dni, etapa: 'alta'})` devuelve algo. Si quiere cambiar, debe borrar los archivos primero. |
| **C — Renombrado "Soc N":** | C1: solo actualizar `nombre_archivo` en la tabla `adjuntos`. NO toca Storage. Helper `renombrarAdjuntosPorAlta` ya implementado en H1. |
| **Toast vs fire-and-forget en `confirmarAlta`:** | Await. `confirmarAlta` se vuelve `async` para esperar la validación de los 4 obligatorios + el renombrado. Coherencia visual al usuario: cuando dice "Alta confirmada Soc N", efectivamente todo está listo. |
| **Ubicación de la sección 📎:** | 7º tab "Documentos". Bump `ALTA_TABS = 7` + botón nuevo + `alta-section-6`. El sistema de tabs ya está parametrizado por la constante, generaliza solo. |
| **Convención de nombre del archivo renombrado:** | `Soc {nro} - {TipoLegible}.{ext}` (sin DNI). Una vez que es socio, el N° de socio es el identificador. |

---

# 4. Plan completo de Alta (aprobado, listo para implementar)

## 4.1. Helper — `src/shared/adjuntos.js`

| # | Edición | Estado |
|---|---|---|
| **H1** | Función `renombrarAdjuntosPorAlta(dni, nroSoc)` al final del archivo | ✅ **Ya aplicada y commiteada (`3edd5b0`)** |

## 4.2. Módulo Alta — `src/modules/altas/altas.js`

| # | Edición | Estado |
|---|---|---|
| **M1** | Import del helper (sumar `renombrarAdjuntosPorAlta` a los 4 ya importados) | ⏳ Pendiente |
| **M2** | Bump `ALTA_TABS = 7` + constante `ALTA_TIPOS` con los 5 tipos del módulo Alta (`dni-frente`, `dni-dorso`, `foto-rostro`, `monotributo` obligatorios + `inaes` opcional) | ⏳ Pendiente |
| **M3** | Botón del 7º tab "📎 Documentos" en `crearHTMLModalAlta` | ⏳ Pendiente |
| **M4** | Sección `alta-section-6` con 5 cajas 📎 (una por tipo). Cada caja: label + lista + input file oculto + botón. Botones empiezan `disabled` hasta que haya DNI | ⏳ Pendiente |
| **M5** | Hook `onblur="onChangeDniAlta()"` en `alt-dni` (Tab 0) | ⏳ Pendiente |
| **M6** | En `abrirModalAlta`: si abre desde flujo (`src` truthy) → DNI pre-cargado y `readOnly=true` + `cargarAdjuntoAlta(p.dni)`. Si abre como Nuevo → `readOnly=false` + `cargarAdjuntoAlta('')` (caja deshabilitada con aviso) | ⏳ Pendiente |
| **M7** | **El más delicado.** `confirmarAlta` → `async`. Refactor de 135 líneas para intercalar: validar tabs (igual) → leer DNI → **validar 4 adjuntos obligatorios** (await) → leer resto + nro + legajo → push + supaSync → **renombrarAdjuntosPorAlta(dni, nro)** (await con try/catch para toast diferenciado si falla) → marcar psico/catAltPendientes (igual) → cerrar + render + toast | ⏳ Pendiente |
| **M8** | 5 funciones UI nuevas: `onChangeDniAlta`, `cargarAdjuntoAlta`, `seleccionarArchivoAlta(tipo)`, `verAdjuntoAlta`, `eliminarAdjuntoAlta`. Notar que `seleccionar` recibe `tipo` como parámetro (distinto a los otros módulos). `eliminar` re-habilita el DNI editable si quedan 0 archivos y no viene del flujo | ⏳ Pendiente |

## 4.3. `src/modules/altas/index.js`

| # | Edición | Estado |
|---|---|---|
| **I1** | Agregar las 5 funciones nuevas al re-export + import + bindings al `window` | ⏳ Pendiente |

## 4.4. Estimación honesta

- M1+M2 juntos: ~10 min.
- M3+M4+M5: ~30 min.
- M6: ~15 min.
- M8 (las 5 funciones UI): ~45 min.
- I1: ~10 min.
- **M7 (refactor `confirmarAlta`): ~30-45 min.** El más delicado. Hay que reordenar 135 líneas y agregar la nueva lógica async.
- Prueba end-to-end con Carlos: ~30 min.
- 1 commit final.

**Total: ~3 horas en una sesión bien aprovechada.**

---

# 5. Lecciones de esta sesión

## 5.1. "Gana la evidencia" — caso ejemplar

La hipótesis inicial era un bug sistémico de `id_local`. Diagnóstico profundo con datos refutó la hipótesis. Se evitó un refactor innecesario del core de persistencia.

**Patrón aprendido:** ante una hipótesis fuerte, validar con datos antes de actuar. Si la evidencia refuta, NO ejecutar a priori. Si la evidencia confirma, avanzar con confianza.

## 5.2. El bug del preview del Write/Edit sigue apareciendo

Múltiples veces en esta sesión el preview mostró líneas duplicadas o cortadas que NO estaban en el contenido real. Convención confirmada: heredoc + grep + `node --check` como árbitro objetivo.

Esto está documentado ahora en CLAUDE.md → "Convenciones operativas de desarrollo".

## 5.3. Helper-booleano para gatear toasts en llamadores

Patrón de diseño aplicado en Guard 3: cuando un helper se llama desde múltiples lugares y cada llamador tiene su propio toast post-éxito, el helper devuelve `boolean` y los llamadores gatean su toast con `if (creada) toast(...)`. Mantiene helper limpio sin centralizar UI específica de cada llamador.

## 5.4. El patrón "scripts custom en /tmp" para diagnóstico de Supabase

Cuando no se puede pegar en la consola del browser (Chrome bloquea paste en DevTools por seguridad), funciona muy bien escribir scripts Node `.mjs` en `/tmp` que usen `@supabase/supabase-js` con la anon key (que es pública porque vive en el bundle). Hay que correrlos desde la raíz del proyecto donde Node resuelve `node_modules`. Borrar al final.

## 5.5. Cleanup de datos con guards defensivos

El script de cleanup de Carlos tenía pre-checks (verificar que exista exactamente 1 fila con el estado esperado antes de mutar). Patrón seguro: si los datos cambiaron entre el diagnóstico y la mutación, aborta sin tocar nada. Replicable para futuras operaciones manuales contra Supabase.

---

# 6. Pendientes priorizados (actualizado)

## Próxima sesión (la inmediata)

1. **Iniciar implementación de Alta** desde M1.
2. **Si no se aplicó v012 todavía:** verificarlo en el dashboard de Supabase (el SQL ya está en `sql/`, pendiente ejecutar). NOTA: en esta sesión ya se aplicó, pero conviene chequear que sigue aplicado.
3. **Probar end-to-end** con Carlos (psico Aprobado + preocup Aprobado + docum En proceso → avanzar a Alta).

## Después de Alta

4. **Iteración 2 de Documentación:** libreta + curso (con flags condicionales) + excepción.
5. **Módulo Legajos:** tabs + Tab 5 Documentos + carga retroactiva.
6. **Alertas y listado "Próximos a vencer".**

## Antes de mostrar a Gabi

7. **Limpieza de datos de prueba** (Carlos + sus registros).
8. **Netlify desconectado de GitHub** (~30 min).
9. **Mostrar el flujo a Gabi** y traer feedback.

## Pendientes nuevos de Gabi (sesiones futuras)

10. Alerta de cuenta bancaria Banco Francés.
11. Campo "Nivel de estudios" en legajo.
12. Campo "Experiencia en oficios" en legajo.

## Deudas técnicas anotadas en CLAUDE.md

- **Nueva (esta sesión):** Schema drift en `psicos.id` (UUID en base, `bigint serial` en SQL).
- **Nueva (esta sesión):** Conciliación por DNI puede bloquear reingresos.
- Pre-existentes: DDL faltante de tabla `legajos`; `nro = max+1` en cliente (`src/modules/altas/altas.js:392-394`); mock de legajos en `legacy.js:6207`; campo `prelaboral` muerto en psicos; validación DNI en `guardarEdicionLegajo`; 7 `parseInt` preexistentes en preocupacional + documentación; auth local con passwords plain text.

---

# 7. Cómo retomar la próxima sesión

1. Subir este traspaso al inicio del chat.
2. Confirmar estado del repo: `git log --oneline -6`. Esperamos ver al menos: `fe7c27a`, `3edd5b0`, `13136e6`, `fca67e6`, `364d5b8`, `343c285`.
3. Levantar entorno (Forma B: Vite + Claude Code).
4. Si Claude Code da 401, hacer `/login` → opción 1 (Claude account with subscription).
5. **Verificar que v012 sigue aplicado** en Supabase (consulta rápida desde el dashboard SQL Editor: `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='documentacion_ingreso' AND column_name='id_local';`. Debe decir `NO`).
6. Arrancar Alta por M1+M2 (import + constantes).

---

# 8. Acción inmediata al cerrar esta sesión

Subir al repo este traspaso:

```
# Después de bajar el archivo, moverlo a docs/:
cd C:\proyectos\ohlimpia
git add docs/TRASPASO_2026-06-29_fix_core_idempotencia_+_setup_alta.md
git commit -m "docs: traspaso sesion 29/06 - fix core idempotencia + setup alta"
git push
```

Cerrar Vite + Claude Code.
