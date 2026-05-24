# Traspaso de sesión — 24/05/2026: bug del Alta de asociado + género/nacionalidad + Psicotécnico ampliado

**Fecha:** 2026-05-24
**Versión del documento:** 1.0
**Autor:** Claude web (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 del proyecto (documento de traspaso al final de sesión larga)
**Documento previo:** `docs/TRASPASO_2026-05-23_abm_personal_rrhh.md`

## Resumen en una frase

Se resolvió el bug del Alta de asociado (los datos del candidato no llegaban al alta ni se guardaban en el legajo), se agregó el campo Nacionalidad al candidato y se hizo que género y nacionalidad viajen candidato → alta → legajo, y se amplió el módulo Psicotécnico de 2 a 5 resultados con motivo obligatorio para el No Apto.

---

# 1. Estado actual del proyecto

## 1.1. Lo que está funcionando (probado end-to-end, validado contra Supabase)

**Bug del Alta de asociado — RESUELTO:**
- El flujo real es Candidato → (🧠 Psico) → Psicotécnico → (Aprobar) → catAltPendientes → (Registrar alta) → Legajo. Cada salto copiaba una "foto" (snapshot) parcial de los datos, y muchos campos se perdían en el camino.
- Ahora el modal de Alta precarga los datos del candidato original (vía `candidatoId`): DNI (con prioridad sobre la snapshot, lo que arregla el "DNI distinto"), CUIT, dirección (calle+piso combinados), fecha nac, email, estado civil, género, nacionalidad.
- Y al guardar, se persisten en el legajo TODOS los campos que antes se perdían: direccion, fecNac, zona, cbu, art, obraSocial, formaPago, integracion, categoria (+ los que ya andaban).
- Validado: legajo 151 (Prueba Completa) y 152 (Oka Testfase2ter) guardaron todo correctamente, verificado con SELECT en Supabase.

**Nacionalidad en el candidato — NUEVO:**
- El modal de candidato ahora tiene un select "Nacionalidad" con catálogo: Argentina (default), Boliviana, Paraguaya, Peruana, Uruguaya, Chilena, Brasileña, Venezolana, Otra.
- Se guarda en `candidatos.nacionalidad`, se precarga al editar, y se precarga en el alta.

**Género y nacionalidad viajan candidato → alta → legajo:**
- El género ya existía en el candidato pero se perdía en el salto al alta. Ahora hay un select de género en el modal de alta, se precarga del candidato, y se guarda en `legajos.genero`.
- La nacionalidad: en el alta `alt-nac` pasó de input de texto a select (mismas opciones que el candidato), se precarga del candidato, y se guarda en `legajos.nac` (que ya existía).
- Validado: legajo 152 guardó nac=Peruana, genero=Femenino.

**Psicotécnico ampliado a 5 resultados — NUEVO:**
- El test psicotécnico (la sub-etapa `psicotecnico`) pasó de 2 resultados (Aprobado/Rechazado) a 5: Apto, Apto+, Apto-, Apto condicional, No Apto (+ Pendiente).
- Lógica de avance al alta (confirmada con Gabi): Apto/Apto+/Apto- avanzan; Apto condicional queda en revisión (neutro, no avanza hasta reevaluarse a un Apto definitivo); No Apto frena.
- No Apto muestra un textarea inline (rojo) para el motivo, obligatorio, que se guarda en `motivoRechazo` y se precarga al reabrir.
- Iconos distintos en la tabla: ⭐ Apto+, ✅ Apto, ✔️ Apto-, ⚠️ Apto condicional, ❌ No Apto, ⏳ Pendiente (con tooltips).
- IMPORTANTE: el psicotécnico tiene en realidad 4 sub-etapas (psicotécnico, prelaboral, antecedentes, libreta). Solo se amplió la primera. Las otras 3 siguen binarias (Aprobado/Rechazado). Antecedentes y Libreta ya están parcialmente cableadas (son puntos del roadmap de Gabi).

## 1.2. Estado de los datos

- Legajos de prueba 151 (Prueba Completa) y 152 (Oka Testfase2ter) creados durante la validación. Quedaron en la base. Si molestan, se pueden borrar por SQL (sistema todavía no en uso real).
- Candidatos de prueba: Testfase2ter (apellido Oka, DNI 99999997) quedó con nacionalidad=Peruana, genero=Femenino — sirve para probar el flujo.

---

# 2. Lo que se hizo en esta sesión (cronológico)

6 commits, todos pusheados a origin/main (rango 929a815..ccd6aaa):

| # | Hash | Mensaje |
|---|------|---------|
| 1 | `fde739a` | chore: script v005 - agregar columnas faltantes a legajos |
| 2 | `011ab41` | fix(altas): precargar datos del candidato y persistir todos los campos del legajo |
| 3 | `a1a03df` | chore: script v006 - genero en legajos y nacionalidad en candidatos |
| 4 | `ef8691f` | feat(candidatos): capturar nacionalidad con catalogo de paises |
| 5 | `36ddc66` | feat(altas): genero y nacionalidad viajan del candidato al legajo |
| 6 | `ccd6aaa` | feat(psicotecnico): ampliar a 5 resultados con motivo de No Apto |

## 2.1. Scripts SQL (commits fde739a, a1a03df)

- **v005** (`sql/v005_legajos_campos_faltantes.sql`): agrega 9 columnas a `legajos`: direccion, fec_nac, zona, cbu, art, obra_social, forma_pago, integracion (integer), categoria. Todas nullable. Aplicado y verificado en Supabase.
- **v006** (`sql/v006_genero_y_nacionalidad.sql`): agrega `legajos.genero` (text) y `candidatos.nacionalidad` (text). Aplicado y verificado.
- Ambos no modifican scripts anteriores (política A.5).
- Nota: la columna `legajos.nac` ya existía desde antes del versionado SQL (no la creamos). La columna `psicos.psicotecnico` es text libre (sin ENUM), por eso el Psicotécnico ampliado no necesitó SQL.

## 2.2. Detalle técnico de los cambios de código

- **supabase.js:** se agregó el mapeo `formaPago ↔ forma_pago` (era el único de los 9 campos que lo necesitaba; los demás son single-word y pasan por el fallback, o ya estaban mapeados como fecNac/obraSocial).
- **altas.js:** precarga ampliada en `abrirModalAlta` (prioridad cand→snapshot para DNI/tel, + cuit/fecnac/mail/estadoCivil/direccion/genero/nacionalidad); persistencia ampliada en `guardarNuevoAlta` (objeto legajo con los 9 campos + genero); `alt-nac` convertido a select; `alt-genero` agregado.
- **candidatos.js + index.html:** select de nacionalidad en el modal; lectura/guardado/precarga de `nacionalidad`.
- **psicotecnico.js:** select de 6 opciones; lógica `psicoApto`/`psicoNoApto`; textarea de motivo inline con validación y precarga; función `icon()` ampliada.

---

# 3. LECptura recurrente (mantener en futuras sesiones)

- **Duplicación al crear/sobrescribir archivos:** construir archivos nuevos con `echo` línea por línea; modificar existentes con `str_replace` puntuales (nunca reescribir entero). SIEMPRE verificar con `grep -c`.
- **Modales dinámicos cacheados:** los modales de Alta y Psicotécnico se crean con `document.createElement` la primera vez y quedan cacheados en el DOM. Tras cambiar su HTML, hace falta **F5 full reload** (no solo HMR) para que se recreen con el HTML nuevo. Si no, los elementos nuevos no aparecen.
- **Verificar contra Supabase, no contra la pantalla:** las pantallas (legajo, etc.) no muestran todos los campos. Para confirmar que un dato se guardó, mirar la fila real en Supabase con un SELECT, no confiar en lo que dibuja la UI.
- **Anclas de str_replace en arrays de options:** los selects de etapas (Pendiente/Aprobado/Rechazado) son idénticos en varios lugares; al editar uno, incluir contexto único (el id del select o el label) en el ancla.

---

# 4. Roadmap pendiente (del feedback de Gabriela)

Gabriela (RRHH) probó el sistema y dejó este feedback. Estado tras esta sesión:

**Resueltos esta sesión:**
- ✅ Bug del Alta de asociado.
- ✅ Psicotécnico ampliado a 5 resultados.

**Pendientes (en orden de prioridad sugerida):**

1. **Módulo Pre-ocupacional (NUEVO — el más grande).** Es el examen médico, distinto del psicotécnico. Diseño que dio Gabi:
   - Asignar **fecha de turno**.
   - **Prestador** donde está el turno asignado: MEDE / Grupo CMC / IDT.
   - **5 resultados** (distintos de los del psicotécnico):
     - APTO: no presenta patologías ni observaciones médicas.
     - APTO B: antecedentes o preexistencias leves.
     - APTO C: patologías crónicas o persistentes.
     - NO APTO: patología que impide la tarea laboral evaluada.
     - APTO PENDIENTE: sin clasificación final; la clínica espera un certificado médico o estudio adicional.
   - **Próximo paso recomendado para mañana.** Arrancar con diagnóstico de si ya existe algo del Pre-ocupacional o se hace de cero.

2. **Adjuntar foto/DNI al candidato (NUEVO, pedido al cierre de esta sesión).** Poder subir al registro del candidato una foto de la cara de la persona y/o del DNI. NOTA TÉCNICA: subir imágenes es distinto a los campos de texto — requiere almacenamiento de archivos (probablemente Supabase Storage, no la base de datos de texto). Es su propia mini-tarea con diagnóstico propio.

3. **Antecedentes penales** — con vencimiento (6 meses). Ya parcialmente cableado: la sub-etapa `antecedentes` existe en el módulo Psicotécnico (Pendiente/Aprobado/Rechazado/No requerido) y hay mapeos `requiereAntecedentes` en supabase.js. Falta la lógica de vencimiento.

4. **Libreta sanitaria** — zona, vencimiento, foto. Ya parcialmente cableada: sub-etapa `libretaSanitaria` en el Psicotécnico + mapeo `libretaSanitaria` en supabase.js. Falta zona/vencimiento/foto.

5. **Curso de manipulación de alimentos** — certificado.

6. **Aclarar con Gabi** el formulario de aprobación de entrevista que vive en Google Drive (charla, no código).

---

# 5. Deuda técnica y cosas anotadas (no urgentes)

- **Estandarización del modelo Persona (deuda de diseño, política A.11):** los módulos Candidato y Alta tienen campos que no coinciden del todo: nombre distinto para lo mismo (candidato usa `email`, alta/legajo usa `mail`); estructura distinta (candidato separa apellido/nombre y calle/piso; alta los combina en `nombre` y `direccion`). Hoy se maneja con la precarga y funciona, pero se podría unificar en una sesión dedicada. NO urgente — anotado para cuando se quiera ordenar el modelo.
- **Bug de Selectora: NO REPRODUCIBLE.** En algún momento de la sesión, al crear un candidato nuevo el select "Selectora" no desplegaba la lista. Al volver a probar (candidato nuevo varias veces + edición), funcionó sin problemas. Probablemente fue un estado transitorio del navegador. Si reaparece, anotar las condiciones exactas en que falla.
- **Filtro roto `cf-ps-resultado`** en psicotecnico.js (filtrarPsico): filtra por `p.resultado` que no existe en el psico nuevo (quedó del monolito viejo). No bloquea nada (queda como "siempre true"). Preexistente, no se tocó esta sesión. Se podría arreglar si se quiere filtrar por resultado del psicotécnico.
- **Mejora cosmética del legajo:** la pantalla de detalle del legajo (Datos personales) no muestra los campos `direccion` ni `genero` (los datos SÍ están en la base, solo no se dibujan en esa vista). Mejora menor opcional.
- **"Apto condicional" en revisión:** Gabi dijo que el condicional "queda en revisión (evaluación extra) antes de aprobarse". Se implementó como estado NEUTRO (no avanza al alta hasta que la operadora lo reevalúe y cambie el resultado a un Apto definitivo). Funciona y cumple lo pedido. Si en el futuro Gabi quiere un estado formal "en revisión" separado de "pendiente" (con su propio listado/seguimiento), es una mejora futura.
- **Deuda anotada en sesión previa:** unificar MODULOS_SISTEMA con MENU (no urgente).

---

# 6. Cómo retomar mañana

## 6.1. Mensaje sugerido para abrir Claude Code

```
Retomo el proyecto Ohlimpia. La última sesión (24/05/2026) resolvió el
bug del Alta de asociado, agregó nacionalidad/género al flujo, y amplió
el Psicotécnico a 5 resultados.

1. Leé en este orden:
   - POLITICAS_PROYECTO.md
   - CLAUDE.md
   - docs/TRASPASO_2026-05-23_abm_personal_rrhh.md
   - docs/TRASPASO_2026-05-24_bug_alta_y_psicotecnico.md (este)

2. git status, git log -8 --oneline, git fetch, git status (de nuevo).

3. Confirmame: rama main limpia y sincronizada, último commit ccd6aaa.

NO modifiques nada. Esperá que te diga por dónde seguir.
```

## 6.2. Próximo paso recomendado

El **módulo Pre-ocupacional** (punto 1 del roadmap). Es el más grande de los pendientes, así que conviene arrancarlo con la cabeza fresca al inicio de la sesión. El diseño completo de Gabi ya está en la sección 4.1 de este traspaso. Empezar con un diagnóstico: ¿existe algo del Pre-ocupacional ya, o se hace de cero?

Alternativa si se prefiere algo más corto: el bloque Antecedentes/Libreta (puntos 3-4), que ya están parcialmente cableados en el Psicotécnico.

## 6.3. Recordatorios operativos

- Flujo de tres: Lautaro decide y ejecuta + Claude web piensa y redacta + Claude Code modifica. Una cosa a la vez. Diagnóstico antes de cada cambio (A.4). Validación visual antes de cada push.
- str_replace puntuales + verificación grep (ver sección 3).
- F5 full reload tras cambiar HTML de modales dinámicos.
- Verificar contra Supabase, no contra la pantalla.
- Warning "LF will be replaced by CRLF": inofensivo. favicon.ico 404: inofensivo.
- Supabase dice "PRODUCTION" pero el sistema NO está en uso real todavía. Borrados de datos de prueba siguen siendo válidos.

---

# 7. Nota final

Sesión muy larga y muy productiva (cerrada ~21:45). Se tacharon dos ítems completos del roadmap de Gabi (bug del Alta + Psicotécnico ampliado) y se sumó una mejora no pedida pero valiosa (nacionalidad y género viajando hasta el legajo, con catálogo de países). 6 commits, todos chicos, todos validados —varios contra Supabase directamente—, todos con mensaje claro en español.

Lo más valioso de la sesión: la disciplina se mantuvo intacta a lo largo de muchas piezas. Diagnóstico antes de cada cambio, validación de supuestos con Gabi (lo del "Apto condicional"), verificación en la base de datos y no solo en la pantalla (lo que destapó que la dirección sí se guardaba aunque la pantalla no la mostrara), y la decisión sensata de no atacar el Pre-ocupacional al final de una jornada larga.

— Claude web, al cierre de la sesión del 2026-05-24.
