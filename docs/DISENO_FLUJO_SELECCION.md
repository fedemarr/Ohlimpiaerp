# Diseño del flujo de selección — Ohlimpia

**Fecha:** 2026-05-24
**Estado:** BORRADOR para revisar y aprobar (NO es código todavía)
**Autor:** Claude web, con dirección de Lautaro y feedback de Gabriela (RRHH)
**Política que lo motiva:** A.4 (diagnóstico antes de construir) + A.11 (cambio que toca el flujo central merece diseño cuidadoso)

## Para qué es este documento

Gabi describió cómo debería funcionar el proceso de selección de principio a fin. Lo que pidió no es "un módulo más": es un rediseño de cómo encadenan las etapas. Este documento dibuja el flujo completo, marca las decisiones de arquitectura, y propone en qué orden (fases) construirlo. Es para revisar y aprobar ANTES de tocar código. Nada de lo de acá está construido todavía.

---

# 1. El flujo completo (lo que pidió Gabi)

```
CANDIDATO
   |
   v
[1] PSICOTÉCNICO  ............ OBLIGATORIO · ELIMINATORIO
   |                           Si reprueba -> BAJA automática (sale del proceso)
   v  (si aprueba)
[2] PRE-OCUPACIONAL .......... OBLIGATORIO · ELIMINATORIO
   |  (apto médico)           Si reprueba -> BAJA automática
   v  (si aprueba)
[3] LIBRETA SANITARIA ........ CONDICIONAL (solo si el cliente lo requiere)
   |  (+ curso manipulación)   La carga RRHH manualmente. Si no aplica, se saltea.
   v
[4] ANTECEDENTES PENALES ..... CONDICIONAL (solo si el cliente lo requiere)
   |                           La carga RRHH manualmente. Si no aplica, se saltea.
   v
ALTA DE ASOCIADOS
```

## 1.1. Dos tipos de etapa, con reglas distintas

**Etapas obligatorias y eliminatorias (1 y 2 — Psicotécnico y Pre-ocupacional):**
- Hay que pasarlas sí o sí.
- Si la persona reprueba cualquiera de las dos, se da de BAJA automática (sale del circuito de selección).
- Son barreras del proceso.

**Etapas condicionales (3 y 4 — Libreta sanitaria y Antecedentes penales):**
- Las carga RRHH manualmente, SOLO si el cliente al que va asignada la persona las requiere.
- Si el cliente no las pide, no se completan, y la persona pasa igual al alta.
- No frenan el proceso si no aplican.

## 1.2. Detalle de cada etapa

| # | Etapa | Tipo | Resultados | Datos que guarda |
|---|-------|------|-----------|------------------|
| 1 | Psicotécnico | Obligatorio, eliminatorio | Apto / Apto+ / Apto- / Apto condicional / No Apto | (YA HECHO) resultado + motivo No Apto |
| 2 | Pre-ocupacional | Obligatorio, eliminatorio | APTO / APTO B / APTO C / NO APTO / APTO PENDIENTE | resultado + prestador + fecha turno + motivo NO APTO + (futuro) adjunto apto médico |
| 3 | Libreta sanitaria | Condicional | (a definir, ver §4) | zona + fecha de vencimiento + (futuro) foto |
| 3b | Curso manipulación alimentos | Condicional (va con libreta) | (a definir) | (futuro) certificado adjunto |
| 4 | Antecedentes penales | Condicional | (a definir) | fecha + vencimiento (6 meses) + (futuro) adjunto |

---

# 2. Las decisiones de arquitectura (lo que hay que pensar bien)

Acá están las preguntas de fondo que definen cómo se construye. Cada una tiene una recomendación, pero son para discutir.

## 2.1. ¿Módulos separados de verdad, o una pantalla con la secuencia?

Gabi dijo "módulos separados". Hay dos formas de interpretarlo:

- **Interpretación literal:** cada etapa es una pantalla propia en el menú (Psicotécnico, Pre-ocupacional, Libreta, Antecedentes), cada una con su tabla. La persona "viaja" de pantalla en pantalla.
- **Interpretación de proceso:** un flujo de selección donde se ve en qué etapa está cada persona, con pantallas o vistas por etapa, pero entendido como un circuito.

**Estado actual del sistema (importante):** hoy las etapas NO están separadas. Viven todas juntas como columnas de un mismo registro (`psicos`), gestionadas en un solo modal. O sea, el sistema actual está en las antípodas de lo que pide Gabi.

**Recomendación:** módulos/pantallas separadas, una por etapa, siguiendo el molde del Psicotécnico. Cada uno con su tabla en Supabase. Es lo que Gabi pidió y lo que el patrón del proyecto soporta mejor (módulos en `src/modules/`). PERO: esto implica también decidir qué pasa con el Psicotécnico actual, que hoy tiene las 4 sub-etapas adentro (ver 2.4).

## 2.2. ¿Cómo se maneja la "baja automática"?

Cuando alguien reprueba el Psicotécnico o el Pre-ocupacional, se da de baja. Preguntas:
- ¿La baja es automática (el sistema la ejecuta solo al marcar No Apto) o sugerida (avisa y RRHH confirma)?
- ¿"Baja" significa que el candidato pasa a un estado "rechazado/dado de baja" (soft delete, política A.7) y queda registrado con el motivo?

**Recomendación:** al marcar No Apto en una etapa eliminatoria, el sistema cambia el estado del candidato a "dado de baja" (con motivo, reusando el patrón de motivo que ya hicimos), pero de forma reversible (A.7). No borrado físico. Idealmente con confirmación de RRHH antes de ejecutar, para evitar bajas por error.

## 2.3. ¿Cómo sabe el sistema que una etapa condicional aplica?

Libreta y Antecedentes dependen del cliente. Decisión de Gabi: **por ahora, manual** (RRHH sabe y carga lo que corresponde). A futuro, el área comercial cargará en la ficha del cliente qué requiere, y el sistema lo sabrá solo.

**Recomendación para ahora:** las etapas condicionales son simplemente opcionales. RRHH decide si las completa. No hay lógica de "requisitos por cliente" todavía (eso es mejora futura, depende del módulo de Clientes). Anotado como visión a futuro.

## 2.4. ¿Qué pasa con el Psicotécnico actual y sus sub-etapas?

Este es el punto más delicado. Hoy el módulo Psicotécnico contiene 4 sub-etapas: psicotécnico, prelaboral médico, antecedentes, libreta. Si separamos todo en módulos, el Psicotécnico actual queda "vaciado" (solo le queda la parte psicológica). Hay que decidir:
- ¿Migramos las sub-etapas a módulos nuevos y dejamos el Psicotécnico solo con lo psicológico?
- ¿Qué hacemos con los datos que ya viven en la tabla `psicos` (columnas prelaboral, antecedentes, libretaSanitaria)?

**Recomendación:** migración gradual. Cada vez que construimos un módulo nuevo (ej: Pre-ocupacional), migramos su dato de la tabla `psicos` al módulo nuevo, y lo sacamos del modal del psicotécnico. Al final, el Psicotécnico queda limpio (solo psicológico). Esto sigue la política A.11 (rehacer cuando hay deuda heredada) pero de forma incremental, sin romper lo que anda.

## 2.5. Los vencimientos (libreta y antecedentes)

Dos etapas tienen fecha de vencimiento: antecedentes (6 meses) y libreta sanitaria (fecha propia). El sistema debe detectar cuándo vencen y avisar.

**Recomendación:** resolver las dos con el mismo patrón (una función que compara fecha de vencimiento contra hoy y marca "vencido / por vencer / vigente"). Construirlo una vez, usarlo en ambas. Lo dejamos para la fase donde toque la primera de las dos.

## 2.6. Los adjuntos (transversal)

Tres lugares necesitan adjuntar archivos: Candidatos (entrevista digital), Pre-ocupacional (apto médico), Antecedentes (el antecedente). Más el ya anotado de foto/DNI del candidato. Todos usan la misma solución: Supabase Storage (terreno nuevo para el proyecto).

**Recomendación:** los adjuntos son una FASE TRANSVERSAL aparte. Primero construimos las etapas "de datos" (texto), y después, en una fase dedicada, resolvemos los adjuntos para todos los lugares de una vez (aprendemos Supabase Storage una sola vez). NO mezclar adjuntos con la construcción de cada módulo.

---

# 3. Propuesta de fases (en qué orden construir)

La idea: cada fase da valor por sí sola, es validable, y no depende de las siguientes. Orden pensado para reusar lo aprendido.

## FASE 1 — Pre-ocupacional (apto médico)
**Por qué primero:** es el siguiente eslabón después del Psicotécnico (que ya está), reusa el molde que ya conocemos, es autocontenido.
- Módulo nuevo (o sub-etapa rica, según 2.1/2.4): 5 resultados médicos (APTO/APTO B/APTO C/NO APTO/APTO PENDIENTE) + prestador (MEDE/Grupo CMC/IDT) + fecha de turno + motivo del NO APTO.
- Lógica de avance: APTO/APTO B/APTO C avanzan; NO APTO frena (y dispara baja); APTO PENDIENTE neutro.
- SQL: columnas/tabla nuevas.
- SIN adjuntos todavía (fase transversal).

## FASE 2 — Baja automática del flujo eliminatorio
**Por qué:** una vez que existen psicotécnico y pre-ocupacional como barreras, implementar que reprobar = baja.
- Estado "dado de baja" en el candidato (soft delete, reversible).
- Disparo desde No Apto del psicotécnico y del pre-ocupacional.
- Con confirmación de RRHH.
- (Podría fusionarse con Fase 1 si se prefiere.)

## FASE 3 — Libreta sanitaria + Curso de manipulación
**Por qué van juntas:** ambas del rubro alimentos, condicionales.
- Libreta: zona + fecha de vencimiento.
- Curso: certificado (el adjunto queda para la fase transversal; acá solo el registro de que tiene/no tiene curso).
- Introduce la lógica de VENCIMIENTO (reusable para antecedentes).
- Condicional: opcional, la carga RRHH si aplica.

## FASE 4 — Antecedentes penales
**Por qué después:** reusa la lógica de vencimiento de la Fase 3.
- Fecha + vencimiento a 6 meses + detección de vencido.
- Condicional: opcional según cliente (manual por ahora).

## FASE 5 (TRANSVERSAL) — Adjuntos (Supabase Storage)
**Por qué al final:** terreno nuevo, se resuelve una vez para todos.
- Entrevista digital (Candidatos), apto médico (Pre-ocupacional), antecedente (Antecedentes), foto/DNI (Candidatos).
- Diagnóstico propio: configurar Storage, subir, guardar links, ver/descargar.

## FASE 6 (FUTURO, no ahora) — Requisitos por cliente
- Cuando exista el módulo de Clientes maduro: el comercial carga qué requiere cada cliente, y el sistema decide solo si libreta/antecedentes aplican.
- Hoy es manual (RRHH). Esto es visión, no tarea inmediata.

---

# 4. Preguntas abiertas (para confirmar con Gabi cuando se llegue a cada fase)

No bloquean empezar la Fase 1, pero hay que resolverlas antes de cada fase:

1. **Pre-ocupacional (Fase 1):** ¿APTO B y APTO C avanzan al alta igual que APTO, o tienen tratamiento distinto? (supuesto actual: los tres avanzan).
2. **Libreta/Antecedentes (Fases 3-4):** ¿qué resultados/estados manejan? ¿Solo "tiene/vencido/no tiene", o algo más?
3. **Baja automática (Fase 2):** ¿el sistema la ejecuta solo o con confirmación de RRHH? (recomendación: con confirmación).
4. **Curso de manipulación:** ¿es parte de la libreta sanitaria o algo separado? ¿Tiene vencimiento propio?

---

# 5. Lo que NO cambia (para tranquilidad)

- El Psicotécnico ampliado de ayer queda como está (es la Fase 0, ya hecha).
- El bug del Alta resuelto queda como está.
- La migración de sub-etapas se hace gradual, sin romper lo que anda (A.11 incremental).
- Cada fase se construye con el flujo de tres, diagnóstico previo, commits chicos, validación. Nada cambia en la forma de trabajar.

---

# 6. Resumen ejecutivo

Gabi pidió, en el fondo, **convertir el proceso de selección en una cadena de 4 etapas secuenciales** (2 eliminatorias + 2 condicionales) que termina en el alta. Hoy el sistema tiene las etapas mezcladas en una sola pantalla, así que esto es un rediseño del flujo central, no un retoque.

La forma sensata de hacerlo: **por fases**, empezando por el Pre-ocupacional (Fase 1), que es autocontenido y reusa lo que ya sabemos. Los adjuntos y la "conciencia por cliente" quedan para fases posteriores. Cada fase da valor y se valida sola.

**Próximo paso si se aprueba este diseño:** diagnóstico técnico detallado de la Fase 1 (Pre-ocupacional) para definir el plan de piezas.

— Borrador para revisar. Nada construido aún.
