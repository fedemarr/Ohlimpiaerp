# Traspaso de sesión — 28/05/2026 (noche): Unificación a DNI + cierre de bugs históricos + validación de DNI en Candidatos

**Fecha:** 2026-05-28 (segunda sesión del día)
**Versión del documento:** 1.0
**Autor:** Claude web (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 (documento de traspaso al final de sesión larga)
**Documento previo:** `docs/TRASPASO_2026-05-28_aviso_vencimiento_y_boton_revertir.md`

## Resumen en una frase

Se unificó la conciliación entre los 3 módulos del flujo (psico → preocup → docum) al criterio único de DNI (idea de Lautaro de la sesión anterior, llevada a todo el sistema), se erradicaron los dos bugs históricos que sostenían el problema (leading-zero en onclick y acceso por índice de array en psicotécnico), y se construyó la validación de DNI en Candidatos (formato 6-8 dígitos + unicidad) que blinda el origen de la clave que ahora sostiene toda la conciliación.

---

# 1. Estado actual del proyecto

## 1.1. El flujo sigue funcionando end-to-end

```
Candidato → Psicotécnico → Pre-ocupacional → Documentación de ingreso → Alta
```

Con todas las funciones de Revertir, Rechazar y Aprobar funcionando, y la conciliación entre etapas blindada por DNI en lugar del id volátil.

## 1.2. Lo nuevo de esta sesión

### Unificación de la conciliación a DNI (los 3 módulos, 2 frentes)

**Frente 1 — Detección de "registro siguiente"** (para bloqueo del Revertir y cascada). En la sesión anterior se había migrado solo psicotécnico. Esta sesión verificamos que pre-ocupacional y documentación seguían en `candidatoId`, y los migramos también:
- Pre-ocupacional: detección de documentación viva → `p.dni && d.dni === p.dni` (2 puntos: render + función).
- Documentación: detección de alta completada Y búsqueda del alta pendiente a anular → `d.dni && a.dni === d.dni` (3 puntos: render + bloqueo + cascada de anulación).

**Frente 2 — Baja/restauración del candidato** en `rechazarX` y `revertirX`. Detectado en esta sesión: las 6 ocurrencias (2 por módulo) hacían `find(c => c.id === p.candidatoId)` con el bug del id truncado a 9 vs el `candidatoId` guardado con 13. La query en Supabase confirmó: el candidato Elicabe Nazareno tiene `id_local=662602071` (9), pero el `candidato_id` guardado en su psico era `1779662602071` (13), y su `id` en Supabase era `8` — **tres valores distintos para la misma persona**. Migradas las 6 a `find(c => p.dni && c.dni === p.dni)` (con `d.dni` en documentación).

Commit: `3232caa`. Validado con un candidato limpio (Prueba Reversion DNI 30111222): el ciclo rechazo → reversión marca y restaura correctamente al candidato en candidatos.

### Fix del leading-zero en los botones Gestionar (preocup + docum)

`abrirGestionPreocup` y `abrirGestionDocum` tenían el onclick sin comillas — mismo bug latente que arreglamos en Revertir. Fix idéntico: comillas en el onclick + `getPreocupById` migrado a `String === String` (igual que ya estaba `getDocumById` desde la sesión pasada). Commit: `a3658a8`.

### Refactor psicotécnico Gestionar: índice → id

Caso más grande de los tres. `abrirGestionPsico` recibía un índice de array (`DB.psicos[i]`) que se rompe ante reorder/splice/delete. El índice se guardaba en un campo oculto (`psico-gest-idx`) que después leían `guardarEtapasPsico`, `aprobarPsico` y `rechazarPsico` con `parseInt`. Migración completa por 4 piezas:
1. Crear helper `getPsicoById(id)` con `String === String`.
2. Render: eliminar `const i = todos.indexOf(p)`, onclick a `abrirGestionPsico(\'' + p.id + '\')`.
3. abrirGestionPsico: firma `(i)` → `(id)`, `DB.psicos[i]` → `getPsicoById(id)`, guardar `p.id` en el hidden.
4. guardar/aprobar/rechazar: leer `$('psico-gest-idx').value` como **string directo** (NO parseInt, porque ids con leading-zero perderían el cero), buscar con `getPsicoById(id)`.

Decisión menor: **no renombramos el hidden** (sigue siendo `psico-gest-idx`) aunque ahora guarda id — para no aumentar superficie de cambio. Deuda cosmética anotada.

Commit `ff49c48` + style `ae12224` (comentario desactualizado en revertirPsico).

### Validación de DNI en Candidatos (formato + unicidad)

Reglas definidas con Lautaro:
- **Formato:** 6 a 8 dígitos solo números. Regex `/^\d{6,8}$/`. (Acepta DNIs viejos de 6 caracteres si los hay, hasta los nuevos de 8.)
- **Unicidad:** bloquear y no dejar guardar si el DNI ya existe. Aviso con toast.
- **Alcance:** solo de acá en adelante (los viejos inválidos quedan para la limpieza de datos).
- **Edición:** excluye al propio candidato (`String(c.id) !== String(editId)`).

Implementación: 2 validaciones insertadas en `guardarCandidato` después de la declaración de `editId` y antes del `if (editId)`, así ambos caminos (creación y edición) las atraviesan. Patrón coherente con el resto del módulo (toast + focus + return). Commit: `34c0d65`. Validado con 7 casos de prueba (corto, largo, con letras, duplicado, válido nuevo, válido en el límite inferior, edición sin chocar consigo mismo).

### CLAUDE.md actualizado

Tres entradas nuevas en "Resueltos durante la migración": conciliación por candidatoId truncado, leading-zero en onclick/getXById, acceso por índice en Gestionar (psicotécnico). El bug de unicidad de DNI en "Conocidos/pendientes" se acotó: ahora dice "en legajos" (en candidatos ya está resuelto). Commit: `5ec6368`.

## 1.3. Commits de la sesión (todos en origin/main, último `5ec6368`)
- `3232caa` refactor(flujo): unificar conciliación entre módulos por DNI (detección + baja/restauración del candidato)
- `a3658a8` fix(preocupacional,documentacion): comillas en onclick de Gestionar + String en getPreocupById
- `ff49c48` refactor(psicotecnico): migrar Gestionar de índice de array a id (getPsicoById, blindado leading-zero y reorder)
- `ae12224` style(psicotecnico): actualizar comentario desactualizado en revertirPsico
- `34c0d65` feat(candidatos): validación de DNI (formato 6-8 dígitos + unicidad) al crear/editar
- `5ec6368` docs: actualizar bugs resueltos en CLAUDE.md + acotar unicidad DNI a legajos

---

# 2. Lo que sigue (próximos pendientes, por prioridad)

## Inmediatos (destraban mostrar a Gabi)

1. **Limpieza de datos de prueba.** Ahora más relevante porque:
   - Hay DNIs viejos inválidos (`123456` de Broca, `2043576489` de Cecilia Recalde) que la nueva validación NO toca (alcance "de acá en adelante").
   - Hay duplicados de DNI (Oka Testfase2ter aparece 2 veces con DNI `99999997`).
   - Hay altas colgadas en "Pendiente de alta" de pruebas, documentaciones huérfanas, registros sueltos sin candidato detrás (ej. "Prueba Preocupacional", "Prueba Reversion").
   - Hay candidato "Broca Roman" con DNI 123456 que generó confusión en pruebas (se rechazó pero el candidato no se marcó — el problema era el DNI sucio, no el código).
   
   Pregunta abierta para Lautaro: ¿hay datos reales que conservar o todo es de prueba? Enfoque A (borrar todo lo de prueba) vs B (selectivo). Tarea delicada, hacer con calma + diagnóstico.

2. **Netlify** sigue desconectado de GitHub. Hay que vincular el repo, configurar build (`npm run build` + `dist`), cargar variables de Supabase. Sin esto, el sitio público (`ohlimpia-sistema.netlify.app`) sigue mostrando la versión vieja de abril y Gabi no puede ver el sistema actualizado.

3. **Mostrarle el flujo a Gabi** y traer feedback. Hacer después de limpieza + Netlify.

## Validaciones que faltan completar

4. **Unicidad de DNI en Legajos.** La validación de DNI hoy está en Candidatos. Cuando se construya el alta del legajo (o si ya existe sin validar), hay que aplicar la misma regla — sino la cadena se rompe ahí. Anotado en CLAUDE.md.

## Lo grande (con feedback de Gabi)

5. **Llevar resultados al Legajo.** Historial de selección + estado vivo del antecedente. Mini-proyecto, SQL + UI.
6. **Adjuntos vía Supabase Storage.** Libreta, certificado curso, antecedente, apto médico. Bloque técnico nuevo.

---

# 3. Deuda técnica menor anotada

- **revertirPsico usa find directo** en vez de `getPsicoById`. Mismo resultado, pero sería más consistente usar el helper. Cosmético.
- **El hidden `psico-gest-idx` ahora guarda un id**, no un índice. Nombre semánticamente desactualizado. Renombrar a `psico-gest-id` requiere tocar ~6 lugares (declaración del input + 4 lecturas + 1 escritura). Se postergó por no aumentar el alcance del refactor.
- **`prompt()` nativo** en `rechazarCandidatoPorId`, `rechazarPsico`, `agendarTurno` (deuda preexistente, anotada en CLAUDE.md).
- **toast sin colores por tipo.** Solo distinguimos por emoji al inicio (⛔/⚠️/↩️/✅). Mejora futura: tipos con colores.
- **Estilos inline excesivos** en los renders (deuda preexistente).
- **Contraseñas en plain text** (deuda preexistente, no es prioridad mientras sea uso interno).
- **Campos `identificacion`, `domicilio`, etc. en `catAltPendientes` se guardan como `{}`** vacío (los datos van directo al legajo).
- **DISENO_FLUJO_SELECCION.md desactualizado** (vigente: `docs/DISENO_DOCUMENTACION_INGRESO.md`).

---

# 4. Lecciones / convenciones reforzadas en esta sesión

- **El DNI es la clave de conciliación del sistema, en los 3 módulos, en los 2 frentes (detección + restauración).** Patrón único: `p.dni && x.dni === p.dni` (o `d.dni` en documentación). Salvaguarda DNI no vacío.
- **Para que el DNI sea clave confiable, debe estar validado en su origen.** La validación de Candidatos cierra el círculo: ya no se pueden cargar DNIs inválidos ni duplicados de acá en adelante. Quedan los viejos como deuda de limpieza.
- **`parseInt` rompe con leading-zero.** `parseInt('023351076')` → `23351076` (pierde el cero). Si un id puede tener cero adelante, leer el value del input **como string directo** y comparar con `String() === String()`.
- **Los ids internos del sistema son frágiles** por el truncado a 9 chars y los inconsistencias históricas (mismo registro tiene `id`, `id_local`, `candidatoId` con valores distintos en Supabase). El DNI es la única clave estable que viaja por copia consistente.
- **Cuando un onclick tiene un id sin comillas y el id empieza en 0, el click muere silenciosamente** (JS interpreta como octal inválido). Patrón seguro: `onclick="fn(\'' + id + '\')"` con comillas escapadas.
- **Antes de migrar algo, verificar si está roto con datos reales** (no por analogía). En esta sesión: una query en Supabase mostró que el `candidato_id` SÍ era consistente entre tablas (a diferencia del `psicoId` que estaba roto) — pero la decisión de unificar a DNI igualmente fue correcta por consistencia y porque la restauración del candidato (otro frente) sí estaba rota.
- **Datos de prueba inconsistentes pueden enmascarar el funcionamiento real.** "Broca Roman" con DNI `123456` no se marcaba al rechazar — no por bug del código, sino porque su DNI estaba mal cargado. Con candidato limpio (Prueba Reversion DNI 30111222), todo funciona.

---

# 5. Cómo retomar la próxima sesión

1. Subir este traspaso al inicio del chat (también está en el repo si se commiteó, ver §6).
2. Confirmar estado: `git status` (limpio), `git log -6 --oneline` (último `5ec6368`).
3. Levantar entorno: dos terminales. Una: `cd C:\proyectos\ohlimpia` + `npm run dev`. Otra: `cd C:\proyectos\ohlimpia` + `claude` (Forma B).
4. Elegir el próximo trabajo (ver §2). Recomendación:
   - **Si destrabar a Gabi es prioridad:** limpieza de datos de prueba primero (decisión A o B con Lautaro), después Netlify, después mostrarle.
   - **Si seguir construyendo es prioridad:** validación de DNI en Legajos (el hueco que queda) o el legajo histórico de selección.
5. Patrón de trabajo: diagnóstico A.4 (solo lectura) → cambios por piezas → grep de verificación → validar en navegador + verificar en Supabase con SELECT → commit por cambio lógico → push validado. Lautaro aprieta opción 1 ("Yes"), nunca la 2.

---

# 6. Acción inmediata sugerida al cerrar esta sesión

Commitear este traspaso al repo (para que no quede suelto):

```
git add docs/TRASPASO_2026-05-28_noche_unificacion_DNI_y_validacion.md
git commit -m "docs: traspaso sesion 28/05 noche (unificacion DNI + validacion candidatos)"
git push
```

(O subirlo al chat la próxima vez, como prefieras.)
