# Traspaso de sesión — 28/05/2026: aviso de vencimiento de antecedentes + botón Revertir en los 3 módulos (+ cadena de bugs resuelta)

**Fecha:** 2026-05-28
**Versión del documento:** 1.0
**Autor:** Claude web (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 (documento de traspaso al final de sesión larga)
**Documento previo:** `docs/TRASPASO_2026-05-24_noche_documentacion_completo_y_revision.md`

## Resumen en una frase

Se agregó el aviso visual de vencimiento de antecedentes (verde/amarillo/rojo) en Documentación, y se construyó el botón "Revertir" desde Histórico en los tres módulos del flujo (Psicotécnico, Pre-ocupacional, Documentación); en el camino se descubrieron y resolvieron cuatro bugs encadenados (columnas faltantes, fechas vacías a columnas date, desajuste de ids entre módulos, y el leading-zero en los onclick), lo que llevó a migrar la conciliación entre módulos de id interno a **DNI**.

---

# 1. Estado actual del proyecto

## 1.1. El flujo de selección — sigue funcionando end-to-end

```
Candidato → Psicotécnico → Pre-ocupacional → Documentación de ingreso → Alta
```

Y ahora además, en cada módulo, desde el Histórico se puede **Revertir** (devolver a "En proceso") un registro aprobado o rechazado, con confirmación y reglas de cascada.

## 1.2. Lo nuevo de esta sesión

### Aviso de vencimiento de antecedentes (Documentación)
- Helper puro `calcularEstadoVencimiento(fechaVencYMD)` en documentacion.js: dado un vencimiento (YYYY-MM-DD), devuelve `{color, bg, texto}` o null. Verde >30 días ("Vence en X meses"), amarillo 0-30 ("Vence en X días"), rojo si venció ("VENCIDO hace X días"). Cálculo con signo (no Math.abs), hoy a las 00:00.
- Se muestra en dos lugares: la columna Antecedentes de la tabla (badge debajo del resultado) y el modal de Gestionar (al lado del campo "Vence", reactivo: se repinta al abrir el modal y al cambiar la fecha del certificado). Función `pintarBadgeVencModal()`.
- Si no hay fecha, no se muestra nada (registros Pendientes quedan limpios).
- Commit: `65727cc`.

### Botón Revertir desde Histórico (los 3 módulos)
- Cada módulo tiene `revertirX(id)`: pide confirmación (`confirm()` nativo, texto según aprobación/rechazo), bloquea si la persona avanzó al módulo siguiente, restaura el candidato a 'Psicotecnico' si era un rechazo, limpia los campos de resolución, y vuelve el registro a "En proceso".
- En el render, donde antes decía "Cerrado", ahora muestra botón "↩️ Revertir" (naranja `#f59e0b`) si se puede revertir, o "Cerrado" si avanzó.
- **Reglas de bloqueo por módulo:**
  - Psicotécnico: bloquea si existe pre-ocupacional vivo (En proceso o Aprobado) de la persona.
  - Pre-ocupacional: bloquea si existe documentación viva de la persona.
  - Documentación: bloquea si el alta ya está "Alta completada" (ya es legajo). Si el alta está "Pendiente de alta", la anula en cascada (soft delete: `estado='Anulada'`).
- Commits: `b57afbd` (documentación), `e9c57f6` (pre-ocupacional), `21870a5` (psicotécnico), `5e3eeed` (blindaje preocup/docum).

### Conciliación entre módulos: migrada de id interno a DNI
- **Por qué:** el id interno (`psicoId`/`candidatoId`) NO era confiable. Diagnóstico: `_toCamel` en supabase.js descarta el `id` real de Supabase y usa `id_local` (truncado a 9 chars de Date.now()). El `psicoId` guardado en los hijos era a veces el número largo completo (1779...) y a veces el truncado (9 dígitos), según cuándo se creó — por eso `x.psicoId === p.id` casi nunca matcheaba, y el bloqueo no funcionaba (todos mostraban Revertir).
- **Solución (idea de Lautaro):** conciliar por **DNI**, que es estable y viaja por copia en cada handoff. Patrón: `p.dni && x.dni === p.dni` (con salvaguarda de DNI no vacío, para que dos registros sin DNI no se concilien entre sí).
- Aplicado en psicotécnico explícitamente. NOTA PENDIENTE: ver §3 punto 2 — verificar si preocup/docum quedaron en DNI o todavía en candidatoId.

### Bugs encadenados resueltos
1. **`fecha_aprobacion`/`fecha_rechazo` no existían en Supabase** → las funciones aprobar/rechazar de los 3 módulos las escribían, el UPDATE fallaba con 400 silencioso (la aprobación parecía persistir pero no). Fix: script SQL **v010** agregó las columnas (text) a las 3 tablas. NOTA: `psicos` YA tenía esas 2 columnas (creadas a mano en sesión previa sin versionar) — el script falló en la línea 1 con "already exists" y hubo que aplicar solo las 4 ALTER de preocupacionales + documentacion_ingreso. El v010 quedó con las 6 ALTER (documenta la intención completa). Commit: `64b45b0`.
2. **`invalid input syntax for type date: ""`** → al guardar/aprobar, campos `date` (antec_fecha, antec_vencimiento, libreta_vencimiento, curso_vencimiento en documentación; fecha_turno en preocupacional) recibían `""` cuando estaban vacíos, y Postgres rechaza `""` para tipo date. Fix: cambiar el fallback `|| ''` por `|| null` en esos campos. Commits: `a7d0972` (documentación), `e9c57f6` (preocupacional). Psicos NO tenía este bug (sus columnas fecha son text).
3. **Leading-zero en los onclick** → `onclick="revertirX(023351076)"` sin comillas: JS interpreta el 0 inicial como octal y el click no hacía nada (botón muerto para cualquier id que empiece con 0, ej. Gabriela Lucero). Fix: comillas en el onclick → `revertirX('023351076')`. Y blindaje del find interno: `Number(x.id) === Number(id)` → `String(x.id) === String(id)` (Number pierde el cero y puede colisionar). Commit: `5e3eeed` + parte de `21870a5`.

## 1.3. Commits de la sesión (todos en origin/main, último `5e3eeed`)
- `03974ce` docs: traspaso sesión 24/05 noche
- `65727cc` feat(documentacion-ingreso): aviso visual del vencimiento de antecedentes
- `64b45b0` fix(supabase): columnas fecha_aprobacion y fecha_rechazo (v010)
- `a7d0972` fix(documentacion-ingreso): null en vez de '' en columnas date
- `b57afbd` feat(documentacion-ingreso): botón Revertir + anula alta en cascada
- `e9c57f6` feat(preocupacional): botón Revertir + fix null en fecha_turno
- `21870a5` feat(psicotecnico): botón Revertir + conciliación por DNI + fix leading-zero
- `5e3eeed` fix(preocupacional,documentacion): conciliación DNI + comillas onclick + String find

---

# 2. Lo que sigue (próximos pendientes, por prioridad)

## Frescos de esta sesión

1. **Validación de DNI en Candidatos** (propuesta de Lautaro, importante). Dos validaciones: (a) DNI único — no permitir cargar dos candidatos con el mismo DNI; (b) formato válido — 7 u 8 dígitos, sin letras ni puntos. Es la base para que la conciliación por DNI (recién implementada) sea 100% confiable. Va en el módulo Candidatos (punto de entrada de la persona). Datos sucios actuales lo confirman: hay DNIs como `123456` (6 dígitos) y `2043576489` (10 dígitos).

2. **Fix leading-zero en los botones "Gestionar"** (deuda detectada al final). `abrirGestionDocum`, `abrirGestionPreocup`, `abrirGestionPsico` tienen el onclick SIN comillas — mismo bug latente que arreglamos en Revertir. Para una persona con id que empiece en 0, el botón Gestionar no funcionaría. Fix idéntico (comillas en el onclick). Chico pero afecta función central.

3. **Verificar conciliación por DNI en revertirPreocup y revertirDocum.** Claude Code anotó que "hoy usan candidatoId". Hay que confirmar: ¿quedaron migrados a DNI como psicotécnico, o todavía comparan por candidatoId? Si quedaron en candidatoId, podrían tener el mismo problema de fragilidad que tenía psicotécnico. Revisar `revertirPreocup` (bloqueo por documentación viva) y `revertirDocum` (bloqueo por alta + anulación de alta) — ver si comparan por `dni` o por `candidatoId`. Si es candidatoId, migrar a DNI para consistencia.

4. **Limpieza de datos de prueba.** Duplicados (Elicabe Nazareno/Manuela repetidos, Oka Testfase2ter dos veces), altas colgadas en "Pendiente de alta", documentaciones huérfanas, DNIs inválidos de prueba. IMPORTANTE hacerlo antes de mostrar a Gabi. Pendiente de decidir enfoque: (A) borrar todo lo de prueba y dejar base casi vacía, o (B) limpieza selectiva. Pregunta abierta para Lautaro: ¿hay datos reales que conservar, o es todo de prueba? Tarea delicada (borra en producción, módulos vinculados) — hacerla con calma y diagnóstico previo, no cansado.

## Venían de antes

5. **Llevar los resultados al Legajo** (mini-proyecto grande). Que el legajo muestre el historial de selección + el estado vivo del antecedente (al día/por vencer/vencido). Toca módulo Legajos (no tocado a fondo), requiere SQL + UI.

6. **Adjuntos vía Supabase Storage** (pedido de Gabi). Subir archivos: libreta, certificado de curso, antecedente, apto médico. Bloque técnico nuevo.

7. **Mostrarle el flujo a Gabi** y traer feedback. Conviene después de la limpieza (#4) y de resolver Netlify (#8).

## Infraestructura

8. **Netlify NO conectado a GitHub.** El sitio público (`ohlimpia-sistema.netlify.app`) muestra la versión vieja de abril (publicada con "Netlify Drop" manual). "Current repository: Not linked". Los push de mayo nunca llegaron. Para que Gabi vea el sistema actualizado online hay que: vincular el repo `SistemaOhl/ohlimpia` en Netlify (botón "Link repository"), configurar build command `npm run build` + publish directory `dist`, y cargar las variables de entorno de Supabase (sin esas, el sitio carga vacío). Necesita ver package.json y el .env antes — hacerlo con Claude Code al lado. Lautaro decidió priorizar desarrollo sobre esto, pero queda pendiente para que Gabi valide.

---

# 3. Deuda técnica menor anotada (no urgente)

- **El `toast` no diferencia colores por tipo.** Firma: `toast(msg, dur=3500)` — el segundo argumento es DURACIÓN, no tipo. Cuidado: pasar `toast(msg, 'error')` coacciona 'error'→0 y el toast desaparece al instante (bug que tuvimos y corregimos). No hay estilo por tipo; se usan emojis al inicio del mensaje (⛔/↩️/✅) para dar pista visual. Mejora futura: toast con tipos y colores (verde/rojo/azul).
- **`motivo_anulacion` para auditoría.** Se quitó la línea `altaPend.motivoAnulacion = ...` de revertirDocum porque la columna no existe en cat_alt_pendientes Y el campo no estaba mapeado en supabase.js (rompía el UPDATE con 400). Hoy el alta se anula solo con `estado='Anulada'`. Si Gabi quiere trazabilidad de por qué se anuló, hacer un script único que agregue `motivo_anulacion` a las tablas relevantes + mapeo en supabase.js (_toSnake y _toCamel).
- **Psicotécnico identifica por índice (`i`) en abrirGestionPsico**, no por id (el resto usa id). Revertir SÍ usa id (lo hicimos bien). Deuda preexistente.
- **`prompt()` nativo en rechazarPsico** (psicotecnico.js).
- **Formato de inputs date/time depende del locale del navegador** (no de nuestro código). No tocar hasta que Gabi lo pida.
- **Sin validación de unicidad de DNI** (ver pendiente #1 — ahora más importante porque conciliamos por DNI).
- **Duplicados de candidatos** (Oka Testfase2ter aparece 2 veces con mismo DNI 99999997) — consecuencia de la falta de validación + pruebas.

---

# 4. Lecciones / convenciones reforzadas en esta sesión

- **Conciliar personas entre módulos por DNI, no por id interno.** El id_local es volátil (se regenera/trunca), el DNI es estable y viaja por copia en los handoffs. Salvaguarda: comparar solo si el DNI no está vacío (`p.dni && x.dni === p.dni`).
- **Onclick con ids: SIEMPRE entre comillas.** `onclick="fn('" + id + "')"` no `onclick="fn(" + id + ")"`. Sin comillas, un id con cero adelante se interpreta como octal y el click muere silenciosamente. Aplica a TODOS los onclick con id (los botones Gestionar todavía tienen el bug — pendiente #2).
- **Buscar registros por id: usar `String(x.id) === String(id)`, no `Number()`.** Number pierde el leading-zero y puede colisionar ('023' y '23' → 23).
- **Columnas `date` en Postgres NO aceptan `""`** — hay que mandar `null`. Fallback `|| null` en vez de `|| ''` para campos que mapean a columnas date. (Los campos text sí aceptan '', no hace falta tocarlos.)
- **El "Success" de un UPDATE en consola puede ser falso** — supaSync captura el error 400 y solo loguea un warning; el cambio se ve en memoria pero NO se persiste. SIEMPRE verificar con un SELECT en Supabase después de un cambio importante, no confiar en la UI.
- **Antes de reemplazar HTML embebido en strings, ver las líneas reales** (el estilo/color puede diferir de lo asumido). Si el preview de un Update se ve idéntico a uno anterior, NO cantar duplicación: pedir grep primero (los bloques export/import son espejos casi idénticos).
- **Debug con console.log temporal** es la forma más directa de ver valores reales en memoria cuando la teoría no coincide con lo que se ve en pantalla. Acordarse de sacarlo después.
- **El SELECT en el SQL Editor de Supabase es lectura** — "Success. No rows returned" en un SELECT significa que no encontró filas, no que algo falló. En ALTER/UPDATE/INSERT el "Success" sí indica cambio aplicado (verificar igual con SELECT).
- Forma de entrar a Claude Code (Forma B confirmada): `cd C:\proyectos\ohlimpia` + `claude`, y "Yes" solo si el workspace dice `C:\proyectos\ohlimpia`.

---

# 5. Cómo retomar la próxima sesión

1. Subir este traspaso al inicio del chat.
2. Confirmar estado: `git status` (limpio, sincronizado en `5e3eeed`), `git log -6 --oneline`.
3. Levantar el entorno: dos terminales. Una: `cd C:\proyectos\ohlimpia` + `npm run dev` (Vite, queda corriendo). Otra: `cd C:\proyectos\ohlimpia` + `claude` (Forma B).
4. Elegir el próximo trabajo (ver §2). Recomendación de prioridad:
   - **Rápido y blindante:** verificar conciliación DNI en preocup/docum (#3) + fix leading-zero en botones Gestionar (#2) + validación de DNI en Candidatos (#1). Son chicos y consolidan lo de esta sesión.
   - **Para destrabar a Gabi:** limpieza de datos (#4) + Netlify (#8) + mostrarle el flujo (#7).
   - **Grande:** legajo (#5) o adjuntos (#6), mejor con feedback de Gabi.
5. Patrón de trabajo de siempre: diagnóstico A.4 (solo lectura) → cambios por piezas → grep de verificación → validar en navegador (F5) + verificar en Supabase con SELECT → commit por cambio lógico → push cuando esté validado. Lautaro aprieta opción 1 ("Yes"), nunca la 2.
