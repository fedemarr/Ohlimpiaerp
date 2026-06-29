# Traspaso de sesión — 25/06/2026: 3 módulos de adjuntos cerrados + plan para Alta

**Fecha:** 2026-06-25
**Autor:** Claude web (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 (documento de traspaso al final de sesión larga)
**Documento previo:** `docs/TRASPASO_2026-06-18_arranque_implementacion_adjuntos.md`

## Resumen en una frase

Sesión muy productiva que cerró **3 módulos del flujo de ingreso con adjuntos integrados**: Psicotécnico, Pre-ocupacional y Documentación. Se aplicó el patrón validado (helper genérico + 5-7 ediciones por módulo) en tres pasos consecutivos, con prueba end-to-end en producción en cada uno. El módulo Alta (el 4º y último del flujo) NO se tocó — el diagnóstico reveló que rompe el patrón en varios puntos importantes y requiere decisiones de diseño que merecen abordarse en frío. Quedó documentado el diagnóstico completo + las 3 decisiones pendientes para arrancar Alta en la próxima sesión.

---

# 1. Lo que quedó hecho

## 1.1. Commits aplicados y pusheados a origin/main

| Commit | Mensaje | Líneas |
|---|---|---|
| `343c285` | `feat(psicotecnico): integrar adjuntos en modal de Gestion (informe psicotecnico opcional)` | +67 |
| `364d5b8` | `feat(preocupacional): integrar adjuntos en modal de Gestion con apto medico obligatorio` | +114 / -3 |
| `fca67e6` | `feat(documentacion): integrar adjuntos de antecedentes con historial y validacion obligatoria` | +89 / -1 |

## 1.2. Detalle de los 3 módulos cerrados

### Módulo Psicotécnico (commit `343c285`)

- Tipo único: `informe-psico`, etapa `psicotecnico`.
- Archivo **opcional**, sin validación al aprobar/rechazar.
- Color UI: morado (`#7c3aed`).
- 5 ediciones: import + sección HTML + llamada en `abrirGestionPsico` + 4 funciones UI + 3 cambios en `index.js`.
- Probado end-to-end con candidato "Prueba Adjuntos Carlos" DNI 35888777.

### Módulo Pre-ocupacional (commit `364d5b8`)

- Dos tipos según resultado del estudio:
  - `apto-medico` (default permisivo, también si APTO PENDIENTE o Pendiente)
  - `no-apto` (cuando resultado = NO APTO)
- **Validación obligatoria al aprobar:** debe existir al menos un `apto-medico` vigente. Aplica a los 3 valores positivos: APTO, APTO B, APTO C.
- **Label dinámico** según resultado seleccionado:
  - APTO/APTO B/APTO C → "🏥 Apto médico (obligatorio para aprobar)"
  - NO APTO → "📄 Constancia NO APTO (opcional)"
  - Otro → "🏥 Apto médico (opcional)"
- **Aviso visual no destructivo** cuando el tipo del archivo cargado no coincide con el resultado actual (Opción C decidida en mayo).
- Color UI: turquesa/cyan (`#67e8f9`).
- 7 ediciones: import + sección HTML + llamada al abrir + extensión de `actualizarMotivoPreocup` + helpers/4 funciones UI + validación en `aprobarPreocup` (con conversión a async) + 3 cambios en `index.js`.
- Probado end-to-end (label dinámico, aviso de mismatch, validación obligatoria, subir/ver/eliminar).

### Módulo Documentación de ingreso — iteración 1 (commit `fca67e6`)

- **Alcance acotado:** solo tipo `antecedente`. Libreta y curso quedaron para iteración aparte por su complejidad condicional.
- Antecedente **conserva historial** (el helper ya respeta esto con `if (tipo !== 'antecedente')` en `subirAdjunto`).
- **Validación obligatoria al aprobar:** debe existir al menos un antecedente vigente.
- `fecha_vencimiento` del adjunto: si hay fecha en `dc-antec-fecha`, vence en +6 meses (coherente con el badge del módulo). Si no, queda `null`.
- Sección 📎 colocada **dentro** de la sección de Antecedentes (no como caja aparte) — coherencia visual.
- Color UI: azul (`#93c5fd`).
- 6 ediciones: import + sección HTML + llamada al abrir + 4 funciones UI + validación en `aprobarDocum` (async) + 3 cambios en `index.js`.
- `excepcionDocum` NO se tocó (fuera de scope, iteración aparte).
- Probado end-to-end incluyendo historial (subir 2 antecedentes → ambos visibles).

---

# 2. Estado actualizado del mini-proyecto de adjuntos

| Módulo | Estado | Commit |
|---|---|---|
| Psicotécnico | ✅ Completo | `343c285` |
| Pre-ocupacional | ✅ Completo | `364d5b8` |
| Documentación (iter. 1: antecedente) | ✅ Completo | `fca67e6` |
| **Alta** | ⏳ **Pendiente — diagnóstico hecho, decisiones pendientes** | — |
| Documentación iter. 2 (libreta + curso + excepción con adjunto) | ⏳ Pendiente | — |
| Módulo Legajos (tabs + Tab 5 Documentos + carga retroactiva) | ⏳ Pendiente | — |
| Alertas y listado "Próximos a vencer" | ⏳ Pendiente | — |

**75% del mini-proyecto del flujo de ingreso completo** (3 de 4 módulos del flujo).

---

# 3. Diagnóstico del módulo Alta (hecho, NO implementado)

Se hizo el diagnóstico completo del módulo Alta en esta sesión, pero NO se tocó código. Es **el módulo más complejo del mini-proyecto** y rompe el patrón de los 3 anteriores en varios puntos.

## 3.1. Por qué Alta NO es copy-paste del patrón

El helper de adjuntos keya todo por `dni`. En los otros módulos, el `dni` venía de un registro persistido y estable (`p.dni`, `d.dni`). En Alta hay 3 problemas nuevos:

### Problema A — DNI editable, sin registro persistido

El `dni` está en el campo `alt-dni`, **editable**. El modal puede abrir como "Nuevo" con el campo vacío. Para subir un adjunto necesita un DNI cargado. Si el operador cambia el DNI después de subir, los adjuntos quedan huérfanos (apuntan al DNI viejo).

### Problema B — "Renombrar a Soc {nro}" no existe en el helper

El helper actual tiene `subirAdjunto`, `listarAdjuntos`, `obtenerUrlFirmada`, `borrarAdjunto`. **No hay función de renombrado.** Esto implica modificar el helper `src/shared/adjuntos.js` por primera vez desde que se creó.

### Problema C — `confirmarAlta` síncrona → debe volverse async

La función `confirmarAlta` tiene **135 líneas síncronas**. Hay que reordenarla para intercalar: validación de los 4 obligatorios (async) → asignación de `nro` → renombrado (async) → resto del proceso. Refactor no trivial.

### Bonus — confirma deuda técnica del `nro = max+1`

```js
const maxNro = (DB.legajos || []).reduce((m, l) => Math.max(m, l.nro || 0), 0);
const nro = maxNro + 1;
```

Riesgo de concurrencia: dos altas simultáneas → mismo nro. Esta deuda ya estaba anotada. Ahora se vuelve más visible porque el `nro` se usaría también para renombrar archivos.

## 3.2. Estructura del módulo Alta (resumen del diagnóstico)

- **Ubicación:** `src/modules/altas/` (migrado, no en legacy).
- **Modal:** `crearHTMLModalAlta` — 700px, **6 tabs** (Identificación, Domicilio, Operativo, Uniforme, Capital, Seguros). Es un **formulario de creación**, no una gestión de registro existente.
- **Footer:** navegación entre tabs + botón "✅ Confirmar Alta" (`confirmarAlta()`).
- **No hay tab de documentos.** Habría que decidir dónde insertar la sección 📎 (¿tab nuevo? ¿al final del modal?).
- **Apertura:** `abrirModalAlta(psicoIdx, altaId)` — abre como "Nuevo" (sin fuente) o pre-cargado desde un psico aprobado o desde `catAltPendientes`.
- **`confirmarAlta` (líneas 328-463):** valida obligatorios por tab → lee campos → asigna `nro` (líneas 392-394) → crea legajo → `DB.legajos.push` + `supaSync` → marca psico/catAltPendientes.
- **No existe `getAltaById`** ni hidden `alta-gest-id`. El "registro" se identifica por `alta-idx` (psicoIdx, índice de array) + `dataset.altaId` (id de `catAltPendientes`). **Distinto a todos los otros módulos.**
- **Patrón de búsqueda:** mezcla `===` estricto, `==` suelto, e índices de array. **No usa `String===String` consistente.**

---

# 4. Las 3 decisiones de diseño pendientes para Alta

Cuando se retome Alta, hay que resolver estas 3 decisiones ANTES de tocar código.

## Decisión A — ¿Cuándo permitimos subir archivos?

**Problema:** modal abre vacío, helper exige DNI.

**Opciones:**
- **A1:** Bloquear sección 📎 hasta que `alt-dni` tenga valor.
- **A2:** Pre-cargar DNI del candidato origen y bloquear edición si viene del flujo.
- **A3:** Subir como "borrador" sin DNI y asignar al confirmar (no recomendado).

**Recomendación tentativa de Claude web:** **A1 + A2 combinadas**. Si viene de un flujo (psico/docum), DNI pre-cargado + readonly. Si abre "Nuevo" en blanco, caja 📎 deshabilitada hasta que carguen el DNI.

## Decisión B — ¿Qué hacemos si cambian el DNI después de subir?

**Opciones:**
- **B1:** Permitir cambio, archivos quedan huérfanos (confuso).
- **B2:** Bloquear cambio de DNI si ya hay archivos (campo readonly).
- **B3:** Mover archivos al nuevo DNI (caro y arriesgado).

**Recomendación tentativa:** **B2**. Patrón seguro. Si el operador necesita cambiar el DNI, debe borrar los archivos primero.

## Decisión C — ¿Qué significa "renombrar a Soc {nro}"?

**Opciones:**
- **C1:** Solo actualizar `nombre_archivo` en la tabla `adjuntos`. UPDATE barato, sin tocar Storage.
- **C2:** Mover también en Storage (copy + delete por archivo). Caro, riesgo de fallo parcial.
- **C3:** No renombrar; agregar columna `socio_nro` a la tabla. Requiere SQL nuevo.

**Recomendación tentativa:** **C1**. El path en Storage es interno (UUID). El `nombre_archivo` es lo que ve el usuario al descargar. Operación atómica (UPDATE en tabla). Si en el futuro queremos algo más limpio, agregamos `socio_nro` en otra iteración.

---

# 5. Plan tentativo para Alta (cuando se retome)

Basado en las 3 decisiones recomendadas (A1+A2, B2, C1), el plan tentativo:

## 5.1. Modificación al helper `src/shared/adjuntos.js`

Agregar función nueva:

```js
/**
 * Renombra los adjuntos de un DNI al confirmar el alta.
 * Actualiza nombre_archivo a "Soc {nro} - {TipoLegible}.{ext}".
 * NO toca Storage. NO toca el campo url (que es el path interno).
 */
export async function renombrarAdjuntosPorAlta(dni, nroSoc) {
  const adj = await listarAdjuntos({ dni });
  for (const a of adj) {
    const ext = (a.nombreArchivo || '').split('.').pop() || 'bin';
    const tipoLeg = TIPO_LEGIBLE[a.tipo] || a.tipo;
    const nombreNuevo = `Soc ${nroSoc} - ${tipoLeg}.${ext}`;
    await SUPA.from('adjuntos')
      .update({ nombre_archivo: nombreNuevo })
      .eq('id', a.id);
  }
}
```

## 5.2. Modificaciones al módulo `src/modules/altas/altas.js`

### Tipos esperados (etapa = 'alta')

- `dni-frente` — OBLIGATORIO
- `dni-dorso` — OBLIGATORIO
- `foto-rostro` — OBLIGATORIO
- `monotributo` — OBLIGATORIO
- `inaes` — opcional

### Ediciones tentativas

1. **Import del helper** (incluyendo `renombrarAdjuntosPorAlta`).
2. **Sección 📎 en el modal.** Decidir si nuevo tab "Documentos" o caja al final. Probablemente nuevo tab, dado que ya hay 6.
3. **Llamada `cargarAdjuntoAlta(dni)` cuando hay DNI cargado.** Hook al evento `change` de `alt-dni` + al abrir el modal si ya viene con DNI.
4. **DNI readonly si ya hay archivos** (Decisión B2). Verificar con `listarAdjuntos({dni})` antes de permitir cambio.
5. **5 funciones UI:** `cargarAdjuntoAlta`, `seleccionarArchivoAlta(tipo)` (el tipo lo pasa el botón porque hay 5 tipos), `verAdjuntoAlta`, `eliminarAdjuntoAlta`. Notar que `seleccionar` necesita parámetro `tipo` — distinto a los otros módulos.
6. **Modificación de `confirmarAlta` a async:** validar los 4 obligatorios → calcular nro → crear legajo → renombrar adjuntos → resto.
7. **Bindings al window en `index.js`.**

### Estimación honesta

~3-4 horas de implementación + 1 hora de prueba end-to-end. Es la sesión más grande del mini-proyecto. Conviene abordarla con cabeza fresca y todo el día para vos solo.

---

# 6. Lecciones de esta sesión

## 6.1. El bug del preview del Write de Claude Code volvió

Como en la sesión del 18/06, el preview del Write/Edit mostró duplicación visual en bloques HTML con llaves + comillas + comentarios. Esta vez:
- Se manifestó como wrapping visual de líneas largas con `+` cortando palabras (ej. `Pre+ocup()`, `S+bir`).
- Verificamos cada vez con `grep -c` sobre el archivo real → contenido siempre correcto.
- **Convención confirmada:** ante duplicación o cortes sospechosos en preview, verificar por canal alternativo en lugar de regenerar.

## 6.2. Falsos bloqueos por parte mía

Hubo un momento en Documentación donde sospeché que faltaba una edición (la llamada `cargarAdjuntoDocum(d.dni)` en `abrirGestionDocum`). Pedí frenar a Claude Code, pero **la edición sí estaba aplicada** (Claude Code la había metido junto con las 4 funciones nuevas, no como edición separada). Lección: cuando duda mía contra evidencia objetiva (grep), gana la evidencia. Disculpas anotadas, costó solo 2-3 minutos.

## 6.3. Deuda técnica nueva detectada

**En Pre-ocupacional:** las 3 funciones existentes `guardarPreocup`, `aprobarPreocup`, `bajaPreocup` usan `parseInt` para leer el hidden ID. No fallan hoy porque los IDs son `Date.now()` (13 dígitos) y `getPreocupById` usa `String===String`. Deuda latente, no activa.

**En Documentación:** las 4 funciones existentes `guardarDocum`, `aprobarDocum`, `excepcionDocum`, `bajaDocum` usan el mismo antipatrón `parseInt`. Misma situación: latente, no activa.

**Total:** 7 `parseInt` preexistentes para limpiar cuando se haga la limpieza global de antipatrones.

## 6.4. Reincidencia del 401 de Claude Code

Después de varios días de inactividad, Claude Code expiró el token de autenticación. Solución: `/login` → opción 1 (Claude account with subscription). Sesión reanudada sin perder nada.

---

# 7. Pendientes priorizados (actualizado)

## Próxima sesión

1. **Iniciar implementación de Alta** con las 3 decisiones cerradas en frío.
2. Probar end-to-end con candidato (Prueba Adjuntos Carlos DNI 35888777 ya pasó por psico/preocup/docum y está cerca de Alta).

## Después de Alta

3. **Iteración 2 de Documentación:** libreta + curso (con flags condicionales) + excepción.
4. **Módulo Legajos:** tabs (Activos / Próximos a vencer / Incompletos / Bajas / Todos) + Tab 5 Documentos + carga retroactiva.
5. **Alertas y listado "Próximos a vencer"** (con `fecha_vencimiento`).

## Antes de mostrar a Gabi

6. **Limpieza de datos de prueba** (candidato "Prueba Adjuntos Carlos" + sus registros relacionados + archivos en Storage).
7. **Netlify desconectado de GitHub** (~30 min).
8. **Mostrar el flujo a Gabi** y traer feedback.

## Pendientes nuevos de Gabi (sesiones futuras separadas)

9. Alerta de cuenta bancaria Banco Francés.
10. Campo "Nivel de estudios" en legajo.
11. Campo "Experiencia en oficios" en legajo.

## Deudas técnicas

- DDL faltante de tabla `legajos`.
- `nro = max+1` en cliente (`src/modules/altas/altas.js:392-394`) — concurrencia.
- Mock de legajos en `legacy.js:6207`.
- Campo `prelaboral` muerto en tabla psicos.
- Validación DNI en `guardarEdicionLegajo`.
- **Nueva:** 3 `parseInt` en preocupacional + 4 en documentacion = 7 preexistentes para limpiar.
- Auth local con passwords plain text → migrar a Supabase Auth real.

---

# 8. Cómo retomar la próxima sesión

1. Subir este traspaso al inicio del chat.
2. Confirmar estado del repo:
   ```
   cd C:\proyectos\ohlimpia
   git log --oneline -8
   ```
   Esperamos ver al menos: `fca67e6`, `364d5b8`, `343c285`, `1574774`, `81adefe`, `d344a82`, `ef50680`, `7f394e7`.
3. Levantar entorno (Forma B: Vite + Claude Code).
4. Si Claude Code da 401, hacer `/login` → opción 1.
5. **Confirmar las 3 decisiones de Alta** (A, B, C) — yo te voy a hacer las preguntas estructuradas para que decidas en frío.
6. Una vez cerradas las 3 decisiones, arrancar implementación del helper modificado + módulo Alta.

---

# 9. Acción inmediata al cerrar esta sesión

Subir al repo este traspaso:

```
# Después de bajar el archivo, moverlo a docs/:
cd C:\proyectos\ohlimpia
git add docs/TRASPASO_2026-06-25_3_modulos_adjuntos_+_plan_alta.md
git commit -m "docs: traspaso sesion 25/06 - 3 modulos adjuntos + plan alta"
git push
```

Cerrar Vite + Claude Code.
