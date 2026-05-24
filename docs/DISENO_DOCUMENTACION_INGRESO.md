# Diseño del módulo "Documentación de ingreso" — Ohlimpia

**Fecha:** 2026-05-24
**Estado:** BORRADOR para revisar y aprobar (NO es código todavía)
**Autor:** Claude web, con dirección de Lautaro y feedback de Gabriela (RRHH)
**Política que lo motiva:** A.4 (diagnóstico antes de construir) + A.2 (entender antes de ejecutar)

## Para qué es este documento

Gabi definió tres requisitos documentales del ingreso (Antecedentes penales, Libreta sanitaria, Curso de manipulación de alimentos) y pidió que vivan en **un solo módulo**. Este documento dibuja cómo se comporta cada uno, cómo conviven en una sola pantalla, y en qué orden construirlo. Es para revisar y aprobar ANTES de tocar código. Nada de lo de acá está construido todavía.

> **Cambio importante respecto del diseño anterior (`DISENO_FLUJO_SELECCION.md`):** en aquel documento, Antecedentes figuraba como CONDICIONAL. Gabi lo redefinió: **Antecedentes es OBLIGATORIO para todos y ELIMINATORIO** (positivo → baja, salvo excepción que habilita Gabi). Este documento es la versión vigente.

---

# 1. El módulo y su lugar en el flujo

```
CANDIDATO
   |
   v
[1] PSICOTÉCNICO  ............... OBLIGATORIO · ELIMINATORIO   (YA HECHO)
   |  (si aprueba)
   v
[2] PRE-OCUPACIONAL ............. OBLIGATORIO · ELIMINATORIO   (YA HECHO - Fase 1)
   |  (si aprueba)
   v
[3] DOCUMENTACIÓN DE INGRESO .... contiene 3 requisitos        (ESTE MÓDULO)
   |   - Antecedentes penales (obligatorio, eliminatorio)
   |   - Libreta sanitaria (condicional)
   |   - Curso manipulación alimentos (condicional)
   v  (si Antecedentes OK o excepción habilitada)
ALTA DE ASOCIADOS
```

El módulo va **después del Pre-ocupacional y antes del Alta**. Confirmado por Lautaro.

Nombre del módulo: **"Documentación de ingreso"**. Confirmado por Lautaro.

---

# 2. Los tres requisitos — comportamiento distinto

Esta es la clave del módulo: los tres NO se comportan igual.

| Requisito | ¿Obligatorio? | ¿Eliminatorio? | ¿Vencimiento? | Datos que guarda |
|-----------|---------------|----------------|---------------|------------------|
| **Antecedentes penales** | Sí, para todos | **Sí** (positivo → baja, salvo override de Gabi) | Sí, **6 meses** | resultado (Sin/Con antecedentes), fecha, vencimiento, override, motivo excepción |
| **Libreta sanitaria** | Condicional | No | Sí (tiene fecha de vencimiento) | zona, fecha de vencimiento, (futuro: foto) |
| **Curso manipulación** | Condicional | No | A confirmar con Gabi | tiene/no tiene, (futuro: certificado) |

**Antecedentes** es como el Pre-ocupacional (eliminatorio, con baja automática). **Libreta y Curso** son datos que RRHH carga si el cliente lo requiere — no frenan el ingreso.

> **Pendiente a confirmar con Gabi:** ¿el Curso de manipulación tiene fecha de vencimiento, o es un simple "lo tiene / no lo tiene"? Por ahora se diseña como "tiene/no tiene"; si tiene vencimiento, se agrega una fecha (cambio chico).

---

# 3. Antecedentes penales — en detalle (la parte con peso)

## 3.1. El resultado

RRHH carga el resultado del certificado de antecedentes, parecido a como el Pre-ocupacional carga APTO/NO APTO. Valores propuestos:

- **Pendiente** — todavía no se cargó.
- **Sin antecedentes** — la persona puede avanzar al Alta.
- **Con antecedentes** — dispara la lógica eliminatoria (ver 3.2).

## 3.2. La lógica eliminatoria + el override de Gabi (Opción 1, confirmada)

Cuando el resultado es **"Con antecedentes"**, NO se da de baja automática inmediata. En su lugar:

```
Resultado = "Con antecedentes"
   |
   v
Estado intermedio: "Con antecedentes - pendiente de decisión"
   |
   +---> [⛔ Dar de baja]          -> candidato 'Rechazado' (motivo: "Antecedentes penales")
   |
   +---> [✅ Habilitar excepción]  -> la persona avanza al Alta igual
                                      (queda registrado que se habilitó la excepción)
```

**Por qué Opción 1 (estado intermedio) y no baja automática directa:** no damos de baja a alguien que Gabi va a salvar. Evita tener que "deshacer" una baja. La decisión humana ocurre antes de la baja, no después.

**Quién habilita la excepción (default confirmado):** por ahora, cualquier perfil de RRHH puede marcar la excepción, y el sistema **registra** que se habilitó (queda en el dato; la auditoría general captura quién y cuándo). Si Gabi más adelante quiere que solo su perfil pueda, se agrega el permiso (mejora futura, no ahora).

## 3.3. El vencimiento de 6 meses

Antecedentes se renueva cada 6 meses. El sistema debe **detectar/avisar** cuando está por vencer o venció.

> **Esto es funcionalidad nueva** (el sistema "avisa" de un vencimiento — no lo hicimos antes). Tiene su complejidad: hay que decidir CÓMO avisa (un indicador de color en la fila, un texto "Vence en X días" / "VENCIDO", un filtro de "próximos a vencer"). **Se construye como sub-etapa propia, después de tener lo básico funcionando**, para no mezclar. Por ahora la tabla guarda la fecha de vencimiento (fecha de emisión + 6 meses); el aviso visual viene después.

---

# 4. Libreta sanitaria y Curso — los datos condicionales

## 4.1. Libreta sanitaria
- **Condicional:** RRHH la carga solo si el cliente lo requiere.
- Datos: **zona** + **fecha de vencimiento**.
- La foto de la libreta es un adjunto → queda para el bloque de Supabase Storage (fuera de este módulo por ahora).
- No es eliminatoria: si no aplica, la persona pasa igual.

## 4.2. Curso de manipulación de alimentos
- **Condicional:** RRHH lo carga si aplica.
- Datos: **tiene / no tiene** (+ vencimiento, a confirmar con Gabi).
- El certificado es un adjunto → para el bloque de Storage.
- No es eliminatorio.

---

# 5. La tabla en Supabase (propuesta)

Una tabla nueva: **`documentacion_ingreso`** (una fila por persona, con campos para los tres requisitos). Sigue el molde de `preocupacionales`.

Columnas propuestas:

| Columna | Tipo | Para qué |
|---------|------|----------|
| `id` | bigint identity PK | id del registro |
| `id_local` | text unique | sincronización (patrón del sistema) |
| `candidato_id` | bigint | vínculo al candidato (para la baja) |
| `psico_id` | bigint | vínculo al psico (viaja al Alta, como en preocupacional) |
| `preocup_id` | bigint | vínculo al pre-ocupacional de origen |
| `nombre`, `dni`, `zona` | text | snapshot |
| `tel`, `rrhh` | text | snapshot (para que viajen al Alta) |
| **Antecedentes:** | | |
| `antec_resultado` | text | Pendiente / Sin antecedentes / Con antecedentes |
| `antec_fecha` | date | fecha de emisión del certificado |
| `antec_vencimiento` | date | emisión + 6 meses |
| `antec_excepcion` | boolean | si Gabi habilitó la excepción |
| `antec_motivo_excepcion` | text | por qué se habilitó (opcional) |
| **Libreta:** | | |
| `libreta_aplica` | boolean | si el cliente la requiere |
| `libreta_zona` | text | zona de la libreta |
| `libreta_vencimiento` | date | vencimiento de la libreta |
| **Curso:** | | |
| `curso_tiene` | boolean | tiene el curso o no |
| `curso_vencimiento` | date | (si aplica, a confirmar) |
| **Generales:** | | |
| `estado` | text | En proceso / Aprobado / Rechazado |
| `motivo` | text | motivo de baja |
| `obs` | text | observaciones |
| `anulado` | boolean | soft delete (A.7) |
| `created_at`, `updated_at` | timestamptz | auditoría |

> Los nombres con prefijo (`antec_`, `libreta_`, `curso_`) son de una palabra compuesta por guion bajo — habrá que verificar el mapeo camelCase↔snake_case en `supabase.js` (ej: `antecResultado` ↔ `antec_resultado`). Si no es de una sola palabra, se agrega al diccionario `_toSnake/_toCamel`. Lo confirmamos al cablear.

---

# 6. Plan de construcción (por sub-bloques)

Mismo enfoque que la Fase 1: construir por partes, cada una con su commit, validando en el medio. Empezamos por lo nuevo/aislado y dejamos lo que toca el flujo para el final.

| Sub-bloque | Qué | Riesgo | Toca el flujo que anda |
|------------|-----|--------|------------------------|
| **A — Tabla + cableado** | Script SQL `documentacion_ingreso` + supabase.js + state.js | Bajo | No |
| **B — Esqueleto** | Módulo (pantalla, menú, permisos) — molde del pre-ocupacional | Bajo | No |
| **C — Modal de gestión** | Cargar los 3 requisitos (Antecedentes, Libreta, Curso) | Medio | No |
| **D — Lógica de Antecedentes** | Resultado → baja / excepción / avanzar (botones) | Medio | No |
| **E — Handoff de salida** | Aprobar → Alta; baja → candidato Rechazado | Medio | No (crea en catAltPendientes) |
| **F — Handoff de entrada** | Redirigir `aprobarPreocup` para que mande acá en vez de al Alta | **Alto** | **Sí (toca preocupacional)** |
| **G — Vencimiento de Antecedentes** | Detección/aviso de los 6 meses | Medio | No |

**Orden de prioridad sugerido:** A → B → C → D → E → F, y G (vencimiento) como sub-etapa propia al final o en otra sesión. El handoff de entrada (F) es el más delicado — redirige `aprobarPreocup` (que hoy manda al Alta) para que mande a Documentación. Igual que en la Fase 1, se deja para el final, cuando el destino ya funciona.

> **Nota sobre el handoff:** así como `aprobarPsico` ahora manda al Pre-ocupacional, `aprobarPreocup` deberá mandar a Documentación de ingreso (en vez de directo al Alta). El registro llevará `psicoId` (que sigue viajando hasta el Alta) + `preocupId`. Es el mismo patrón de la Fase 1.

---

# 7. Lo que queda FUERA de este bloque (para después)

- **Adjuntos / Supabase Storage:** foto de la libreta, certificado del curso, certificado de antecedentes escaneado. Es una pieza técnica nueva (subir/guardar archivos) que se encara en su propio bloque, fuera de esta sesión.
- **Permiso fino para el override:** que solo el perfil de Gabi pueda habilitar la excepción (por ahora cualquier RRHH puede + queda registrado).
- **Requisitos por cliente automáticos:** cuando exista el módulo Clientes, el sistema sabrá solo si Libreta/Curso aplican. Por ahora es manual (RRHH decide).

---

# 8. Decisiones tomadas (resumen)

1. ✅ Módulo único llamado **"Documentación de ingreso"** con los 3 requisitos.
2. ✅ Va **después del Pre-ocupacional, antes del Alta**.
3. ✅ **Antecedentes:** obligatorio para todos, eliminatorio (positivo → baja).
4. ✅ **Override de Gabi:** Opción 1 (estado "pendiente de decisión", botones Baja / Habilitar excepción). Cualquier RRHH habilita, queda registrado.
5. ✅ **Antecedentes se decide** por un resultado que carga RRHH (Sin/Con antecedentes); "Con antecedentes" dispara la lógica eliminatoria.
6. ✅ **Libreta y Curso:** condicionales, datos que RRHH carga si aplica, no eliminatorios.
7. ✅ **Vencimiento de Antecedentes (6 meses):** sub-etapa propia al final; por ahora se guarda la fecha, el aviso visual viene después.

# 9. Pendientes a confirmar con Gabi

- ¿El Curso de manipulación tiene vencimiento, o es solo "tiene / no tiene"?
- (Eventual) ¿La Libreta tiene "tipo de zona" predefinido, o es texto libre?
