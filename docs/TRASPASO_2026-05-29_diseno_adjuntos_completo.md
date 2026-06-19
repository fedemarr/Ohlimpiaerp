# Traspaso de sesión — 29/05/2026: Diseño completo Adjuntos + Reconstrucción de Legajos

**Fecha:** 2026-05-29
**Duración:** sesión larga (todo el día)
**Autor:** Claude web (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 (documento de traspaso al final de sesión larga)
**Documento previo:** `docs/TRASPASO_2026-05-28_noche_unificacion_DNI_y_validacion.md`

## Resumen en una frase

Sesión completa de DISEÑO (no programación) del mini-proyecto Adjuntos + Reconstrucción de Legajos. Partió del cuestionario respondido por Gabi y cerró con todas las decisiones de diseño tomadas en 6 bloques: Storage, schema de tabla `adjuntos`, UX en los 4 módulos del flujo, naming de archivos, integración con Legajos (5 sub-bloques), y reglas operativas (alertas + retroactiva). Se descubrieron 3 deudas técnicas críticas (DDL faltante de legajos, `nro = max+1` con colisión, mock de legacy.js con dependencias cruzadas) que se anotaron para una sesión específica de limpieza, sin tocar.

---

# 1. Insumo principal de la sesión: respuestas de Gabi

Gabi devolvió el cuestionario (`docs/CONSULTA_GABI_adjuntos.md`) con respuestas claras y agregó por su cuenta 3 ideas que **NO** son parte de este mini-proyecto:

1. **Alerta cuenta bancaria** — avisar cada 15 días si no se cargó el CBU al Banco Francés.
2. **Campo Nivel de estudios** del socio.
3. **Campo Experiencia en oficios** (carpintería, albañilería, costura, etc.).

Estas 3 quedaron anotadas como pendientes nuevos para sesiones futuras.

# 2. Alcance final del mini-proyecto

## 2.1. Archivos adjuntos por etapa

| Módulo | Archivo | Obligatorio | Notas |
|---|---|---|---|
| Psicotécnico | Informe psico (aprobar o rechazo) | Opcional | — |
| Pre-ocupacional | Apto médico | **Obligatorio** si APTO | Bloquea aprobación |
| Pre-ocupacional | No apto | Opcional | — |
| Documentación | Antecedentes | **Obligatorio** | **Guarda historial** |
| Documentación | Libreta sanitaria | Opcional | Solo si cliente lo pide |
| Documentación | Certificado curso | Opcional | Solo si cliente lo pide |
| Alta | DNI frente | **Obligatorio** | Trámite ARCA |
| Alta | DNI dorso | **Obligatorio** | Trámite ARCA |
| Alta | Foto del rostro | **Obligatorio** | Trámite ARCA |
| Alta | Alta monotributo | **Obligatorio** | — |
| Alta | Alta INAES | Opcional | Valor legal |

## 2.2. Reglas transversales

- **Formatos:** PDF + JPG + PNG.
- **Tamaño máximo:** 10 MB por archivo.
- **Permisos:** Solo RRHH sube, ve y borra. "Todo confidencial" (palabras de Gabi).
- **Borrado:** soft delete con auditoría (queda registro de quién y cuándo).
- **Renovación:** botón "Renovar" reemplaza el archivo (excepto antecedentes que mantienen historial).
- **Reemplazo:** botón "Reemplazar" para archivos sin vencimiento.
- **Alerta:** 15 días antes del vencimiento.
- **Carga retroactiva:** permitida con reglas relajadas.

---

# 3. Diseño técnico — 6 bloques

## Bloque 1 — Storage en Supabase

- **Un solo bucket:** `ohlimpia-adjuntos`.
- **Estructura interna:** carpeta por DNI (`bucket/45678901/uuid.pdf`).
- **Acceso:** RRHH nunca entra directo a Storage. Solo via módulo Legajos.

**Decisión clave:** la organización física por DNI es interna (para mantenimiento). La vista de RRHH es totalmente independiente: busca por nombre/apellido/DNI/N° socio en el módulo Legajos y ve los archivos con nombres "humanos".

## Bloque 2 — Schema de tabla `adjuntos`

Tabla nueva, genérica (Opción B vs A "campos en cada tabla"). Razones:
1. **Historial de antecedentes** se resuelve naturalmente.
2. **Auditoría completa** de subida y borrado.
3. **Flexibilidad a futuro**: nuevos tipos = solo cambio en código, no en schema.

**SQL ya escrito en borrador:** `docs/v011_tabla_adjuntos_BORRADOR.sql`. NO aplicar todavía.

**Campos clave:**
- `dni` (clave de conciliación)
- `etapa` (check: psicotecnico/preocupacional/documentacion/alta)
- `tipo` (check con los 11 tipos definidos)
- `url`, `nombre_archivo`
- `fecha_vencimiento`, `vigente` (para historial y vencimientos)
- `subido_por_id`, `subido_por_nombre`, `subido_en`
- `borrado`, `borrado_por_id`, `borrado_por_nombre`, `borrado_en`

**Auditoría:** se usa `currentUser.id` + `currentUser.nombre` (de `DB.usuarios`, NO de `personal_rrhh` que no está vinculado). Sigue patrón establecido del sistema (`registradoPor`).

## Bloque 3 — UX en cada módulo del flujo

**Decisión transversal A2:** El modal de Gestión solo aparece en "En proceso". En Histórico solo se ve "Cerrado" o "↩️ Revertir" (no se accede al archivo desde ahí). Consulta y renovación post-alta = módulo Legajos.

**Subida inmediata** (al seleccionar el archivo, no diferida al guardar).

**Cada modal cumple su rol:**

- **Psicotécnico:** archivo opcional al aprobar/rechazar.
- **Pre-ocupacional:** label dinámico según resultado seleccionado (APTO→obligatorio, NO APTO→opcional, Pendiente→genérico). Si Gabi cambia el resultado después de subir, aviso amarillo "Revisá si el archivo corresponde" (no destructivo).
- **Documentación:** 3 secciones (antecedentes obligatorio, libreta/curso opcionales si el cliente los pide). **Antecedentes con sección "Historial"** debajo del actual.
- **Alta:** 5 archivos (4 obligatorios + INAES opcional). "Guardar borrador" no valida. "✅ Confirmar alta" exige los 4 + crea legajo + renombra archivos a "Soc N".

**Botones diferenciados:**
- Archivos que vencen → **"Renovar"** (sugiere ciclo natural).
- Archivos que no vencen → **"Reemplazar"** (sugiere corrección).

## Bloque 4 — Nombre del archivo

**Convención dinámica según etapa de la persona:**

- **Antes del alta:** `[Tipo] - DNI 12345678.pdf` (con fecha extra para antecedentes).
- **Al confirmar el alta:** UPDATE en `adjuntos` reemplaza "DNI 12345678" por "Soc 130" en `nombre_archivo` de TODOS los registros del DNI.
- **El archivo físico en Storage NO se renombra** (queda con su UUID original). Solo cambia el "nombre humano".

## Bloque 5 — Reconstrucción del módulo Legajos

### 5.1 — Diagnóstico del módulo actual

El módulo NO necesita reconstrucción completa. Ya está migrado en `src/modules/legajos/` (no en legacy.js como se sospechaba). Tiene:
- 13 filtros por columna.
- Modal de detalle con 4 tabs (Datos personales / Operativo / Movimientos / Historial).
- Funciones: render, filtros, modal, edición, impresión.
- Identifica por `nro` (no por id/DNI).
- `id_local` se deriva de `nro` (no de Date.now()).
- Creación de legajos: SOLO en `altas.js:438` al confirmar alta.
- Edición: SOLO desde el módulo (`guardarEdicionLegajo`).
- Persistencia: `supaSync('legajos', l)` ya funciona. Carga inicial vía `supaInit`. Fallback al mock si la tabla está vacía.

### 5.2 — Conciliación con `adjuntos`: B2 (conservadora)

**El módulo Legajos sigue usando `nro` internamente.** La conexión con `adjuntos` se hace por **DNI** (que ya está en cada legajo). Razón: migrar todo a DNI implicaba tocar el upsert, los onclick, el `id_local` — invasivo sin beneficio claro.

### 5.3 — Listado principal de Legajos

**Tabs nuevos arriba (Opción C):**
```
[Activos] [Próximos a vencer (N)] [Incompletos (N)] [Bajas] [Todos]
```
- **Activos** = default al entrar (legajos con estado='Activo').
- **Próximos a vencer** = al menos un archivo dentro de los próximos 15 días.
- **Incompletos** = retroactivos con obligatorios faltantes.
- **Bajas** = con fechaBaja cargada.
- **Todos** = sin filtro.

**Filtros existentes (13 columnas) operan DENTRO de la pestaña activa** (Opción A).

**Indicador en nombre/columna: descartado.** Lautaro lo siente como "que ensucia". Las tabs alcanzan.

### 5.4 — Modal de detalle: Tab 5 nuevo

**Tab "📎 Documentos" agrupado por etapa (Opción C):**

```
──── 🧠 PSICOTÉCNICO ──────
  Archivos del psicotécnico + acciones [Ver][Reemplazar]
──── 🏥 PRE-OCUPACIONAL ──────
  Archivos del preocup + badge vencimiento + acciones
──── 📋 DOCUMENTACIÓN ──────
  Antecedente actual + 📋 Historial debajo
  Libreta + Curso
──── ✅ ALTA ──────
  DNI frente/dorso + foto rostro + monotributo + INAES
```

**Subida retroactiva:** botón "+ Subir [tipo]" individual para cada archivo faltante (Opción A). Visualmente claro qué falta conseguir.

**Legajos de baja:** archivos siguen 100% operables (ver, subir, renovar, reemplazar). Gabi decide según el caso (Opción B).

### 5.5 — Creación del legajo al confirmar el alta

**Flujo al apretar "✅ Confirmar alta":**
1. Validar los 4 obligatorios del módulo Alta (Opción A: NO se revalidan los previos).
2. Calcular `nro = max+1` (sigue como está; deuda anotada).
3. Crear `legajo` en `DB.legajos`.
4. **UPDATE en `adjuntos`:** reemplazar "DNI {dni}" por "Soc {nro}" en `nombre_archivo` para todos los registros del DNI.
5. `supaSync('legajos', legajo)` para persistir.
6. Mover alta a "Alta completada".

**No se copia ni se mueve nada de archivos.** La vinculación es lógica por DNI — apenas el legajo existe con `dni='45678901'`, todos los `adjuntos where dni='45678901'` se ven en su Tab Documentos.

### 5.6 — Deudas técnicas descubiertas (NO se tocan ahora)

Anotadas como pendientes con detalle para sesión futura específica de "limpieza de deuda técnica":

1. **DDL faltante de tabla `legajos`** (viola política A.5). La tabla base se creó manualmente en Supabase, el repo solo tiene alters incrementales (v005, v006).
2. **`nro = max+1` calculado en cliente** (frágil ante concurrencia). Dos altas simultáneas asignarían el mismo nro.
3. **Mock de legajos en `legacy.js:6207`** con 56 entries hardcoded, más seed paralelo en `state.js:37-45`. Los mismos nombres aparecen como strings sueltos en `legacy.js:6229-6231`, `:6269-6278`, `:6311-6338` (mocks de liquidación y adelantos). El mock se autodestruye apenas la tabla tenga datos reales (fallback de supaInit), pero la inconsistencia con liquidación/adelantos persiste.

**Por qué no se tocan ahora:** son rectificación de deuda, no feature. Tocar legacy.js requiere cuidado especial. Mezclar feature + limpieza dificulta diagnóstico si algo falla. Política A.8 aplicada.

## Bloque 6 — Alertas y retroactiva

### 6.A — Alerta de vencimiento

- **4 archivos vencen:** antecedente, libreta, curso, apto-medico. Los demás no.
- **Combinación elegida: B + A** = listado central en Legajos + badge 🟢🟡🔴 en el legajo individual.
- **Cálculo en tiempo real** (no job programado). Reusa `calcularEstadoVencimiento` que ya construimos.
- **Notificación al login (Opción C): descartada** por ahora. Si Gabi la pide, se suma después.

### 6.B — Carga retroactiva

- **Solo desde el legajo individual** (Opción A). No vista especial de "qué falta".
- **Reglas relajadas (Opción B):** NO se exigen obligatorios para archivos retroactivos.
- **El legajo se marca como "incompleto"** sin frenar nada.
- **Asociados nuevos** siguen con obligatorios vigentes del flujo.

---

# 4. Otra deuda descubierta en el camino

**Campo `prelaboral` muerto en la tabla `psicos`** (Sección 5.1 de Bloque 3):
- Definido en `crear_tablas.sql:13` y `agregar_columnas.sql:26` con default 'Pendiente'.
- NO aparece en el mapeo `_toSnake/_toCamel` de supabase.js.
- NO se lee ni se escribe en ningún módulo migrado.
- Único uso: comentario engañoso en `psicotecnico.js:36` y `candidatos.js:509` que inicializa el valor sin que nadie lo consuma.
- Vestigio del modelo viejo, antes de que se rediseñara la etapa médica como módulo `preocupacionales` aparte.
- **Acción futura:** DROP COLUMN + limpiar las 2 referencias en JS.

---

# 5. Pendientes priorizados (actualizado)

## Próxima sesión (la inmediata)

1. **Arrancar a programar el mini-proyecto de adjuntos.** Diseño completo, podemos ir bloque por bloque. Sugerencia de orden:
   - **Primero:** crear bucket en Supabase + aplicar SQL v011 (tabla `adjuntos`).
   - **Segundo:** implementar adjuntos en módulo Psicotécnico (caso más simple: todo opcional).
   - **Tercero:** Pre-ocupacional (validación del apto médico obligatorio).
   - **Cuarto:** Documentación (3 archivos + historial de antecedentes).
   - **Quinto:** Alta (4 obligatorios + INAES + renombrado a Soc N al confirmar).
   - **Sexto:** Módulo Legajos (tabs + Tab 5 + retroactiva).
   - **Séptimo:** Alertas y listado "Próximos a vencer".
   
2. **Antes de tocar adjuntos: hacer Netlify** si todavía no lo retomamos. Sigue pendiente del 28/05.

## Para destrabar mostrar el sistema a Gabi

3. **Netlify desconectado de GitHub.** Sigue pendiente. ~30 min.
4. **Mostrarle el flujo a Gabi.** Después de Netlify.

## Pendientes nuevos generados en esta sesión (sesiones futuras)

5. **Alerta de cuenta bancaria (Banco Francés)** — pedido directo de Gabi.
6. **Campo Nivel de estudios** en legajo.
7. **Campo Experiencia en oficios** en legajo.

## Deudas técnicas (mini-proyecto específico cuando llegue su turno)

8. **DDL faltante de tabla `legajos`** (reconstruir desde Supabase y versionar).
9. **`nro = max+1`** → migrar a secuencia Postgres o RPC.
10. **Mock de legajos en legacy.js** + dependencias en liquidación/adelantos.
11. **Campo `prelaboral` muerto en psicos** (DROP COLUMN + 2 referencias JS).
12. **Validación DNI en `guardarEdicionLegajo`** (igual que ya hicimos en Candidatos).

## Otras deudas técnicas menores (de sesiones anteriores)

- `revertirPsico` usa find directo en vez de `getPsicoById`.
- Hidden `psico-gest-idx` ahora guarda id, nombre desactualizado.
- `prompt()` nativo en rechazar/agendar.
- toast sin colores por tipo.
- Estilos inline excesivos.
- Contraseñas plain text.
- `DISENO_FLUJO_SELECCION.md` desactualizado.

---

# 6. Lecciones de esta sesión

- **Diseño exhaustivo antes de programar paga.** Esta sesión completa de diseño nos permitió descubrir 4 deudas técnicas críticas ANTES de empezar a tocar código, no después. Política A.4 aplicada al nivel del proyecto.
- **Las preguntas a Gabi cambiaron el alcance.** Sin el cuestionario, hubiéramos diseñado "adjuntos sueltos". Con sus respuestas, descubrimos que el verdadero diseño es "adjuntos que terminan en el legajo".
- **El módulo Legajos NO necesita reconstrucción completa.** El diagnóstico mostró que ya está migrado y funciona bien. Solo necesita extensión (Tab 5, tabs en listado, conexión con adjuntos).
- **El mock de legajos no es un problema operativo.** Se autodestruye con el primer alta real. Lo que sí es problema es la inconsistencia con liquidación/adelantos.
- **B2 > B1.** Migrar a DNI internamente en Legajos sonaba bien al principio, pero el detalle del `id_local = nro` lo hizo demasiado invasivo. La versión conservadora (B2) cumple el objetivo (consistencia con el resto del sistema) sin tocar lo que funciona.
- **Hacer mockups visuales destraba.** Cuando Lautaro no entendió las 3 opciones de "dónde mostrar archivos en el modal", el mockup ASCII lo aclaró inmediatamente. Política A.1 aplicada (peras y manzanas).

---

# 7. Cómo retomar la próxima sesión

1. Subir este traspaso al inicio del chat. Está en `docs/` si se commitea.
2. **Importante:** subir también `docs/v011_tabla_adjuntos_BORRADOR.sql` (el SQL de la tabla adjuntos, listo para aplicar cuando se decida).
3. **Importante:** subir las respuestas de Gabi (`docs/Rta_Lauti.docx` si se commitea, o tener a mano).
4. Confirmar estado: `git status` (limpio), `git log -7 --oneline` (último `5ec6368` salvo que se hayan agregado commits de docs).
5. Levantar entorno (Forma B: dos terminales — Vite + Claude Code).
6. **Decisión inicial:** ¿programamos directo o primero hacemos Netlify? Mi voto: Netlify primero porque destraba ver el sistema en producción para Gabi. ~30 min. Después, adjuntos.

---

# 8. Acción inmediata al cerrar esta sesión

Subir al repo los archivos generados hoy:

```
git add docs/TRASPASO_2026-05-29_diseno_adjuntos_completo.md docs/v011_tabla_adjuntos_BORRADOR.sql docs/Rta_Lauti.docx
git commit -m "docs: traspaso diseño completo adjuntos + SQL borrador v011 + respuestas Gabi"
git push
```

Y dejar el sistema descansando: cerrar Vite y Claude Code cuando termines.

---

**Logro de esta sesión:** diseño completo cerrado, sin código tocado, con todas las decisiones documentadas. Próxima sesión arranca con un norte clarísimo.
