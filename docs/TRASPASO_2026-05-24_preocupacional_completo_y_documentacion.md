# Traspaso de sesión — 24/05/2026: módulo Pre-ocupacional completo (Fase 1) + arranque de Documentación de ingreso

**Fecha:** 2026-05-24 (sesión larga, retomada tras descanso del 24 temprano)
**Versión del documento:** 1.0
**Autor:** Claude web (Opus 4.7), con dirección de Lautaro
**Política que lo motiva:** A.10 (documento de traspaso al final de sesión larga)
**Documento previo:** `docs/TRASPASO_2026-05-24_bug_alta_y_psicotecnico.md`
**Documentos de diseño de esta sesión:** `docs/DISENO_FLUJO_SELECCION.md` y `docs/DISENO_DOCUMENTACION_INGRESO.md`

## Resumen en una frase

Se construyó completo el módulo Pre-ocupacional (examen médico, Fase 1 entera: tabla + esqueleto + modal + handoff bidireccional con baja automática), validado end-to-end, y se arrancó el módulo Documentación de ingreso (tabla + cableado + esqueleto) hasta dejarlo navegable y vacío, cortando antes del modal.

---

# 1. Estado actual del proyecto

## 1.1. Lo que está funcionando (probado end-to-end, validado contra Supabase)

**Módulo Pre-ocupacional — COMPLETO (Fase 1):**

El flujo completo de selección quedó así, funcionando:
```
Candidato → (🧠 Psico) → Psicotécnico → (Aprobar) → Pre-ocupacional → (Aprobar APTO/B/C) → Alta
                                                                      → (NO APTO) → candidato Rechazado (baja automática)
```

- **Es un módulo nuevo separado** (pantalla propia `src/modules/preocupacional/`), no una sub-etapa del psicotécnico. Aparece en el menú (sección Selección, ícono 🏥), para perfiles Administrador total y RRHH.
- **El examen médico** se carga en un modal (header cyan): prestador (MEDE / Grupo CMC / IDT), fecha de turno, resultado (Pendiente / APTO / APTO B / APTO C / APTO PENDIENTE / NO APTO), motivo (obligatorio si NO APTO), observaciones.
- **Lógica de los resultados:** APTO/APTO B/APTO C muestran botón "✅ Aprobar → Alta"; NO APTO muestra "⛔ Dar de baja" + textarea de motivo; Pendiente/APTO PENDIENTE no muestran ninguno (neutro, espera).
- **Handoff de entrada:** `aprobarPsico()` (en psicotecnico.js) ya NO manda directo al Alta — crea un registro en `DB.preocupacionales` con snapshot (psicoId, candidatoId, nombre, dni, zona, tel, rrhh, resultado 'Pendiente', estado 'En proceso').
- **Handoff de salida:** `aprobarPreocup()` crea el registro en `catAltPendientes` (mismo molde que aprobaba el psico antes, con `psicoId: p.psicoId` para que el Alta resuelva el psico) → la persona aparece en Alta. `bajaPreocup()` marca el pre-ocupacional 'Rechazado' + el candidato 'Rechazado' con motivo "Rechazado en Pre-ocupacional: ...".
- **Bandeja solo activos:** `renderPreocup` muestra solo `estado === 'En proceso'`. Al aprobar o dar de baja, el registro sale de la vista (queda en la base como histórico, política A.7). Mismo patrón Activos/Histórico que el psicotécnico, pero en versión simple (sin tabs).
- **Validado end-to-end** por Lautaro: el flujo completo Candidato → Psico → Pre-ocupacional → Alta funciona, con persistencia confirmada en Supabase (tel/rrhh viajan correctamente).

**Módulo Documentación de ingreso — ARRANCADO (sub-bloques A, B, C de 7):**

- Tabla `documentacion_ingreso` creada en Supabase (26 columnas, script v009), cableada en supabase.js (_SM + mapeos + sanitización de booleanos) y state.js (DB).
- Esqueleto navegable: aparece en el menú (sección Selección, ícono 📄, después de Pre-ocupacional), abre una pantalla con tabla de 8 columnas (Nombre, DNI, Zona, Antecedentes, Libreta, Curso, Estado, Acciones) que muestra "Sin registros en documentación de ingreso todavía".
- **Está vacío y sin modal todavía** — no se puede cargar ni gestionar nada. Eso es el Sub-bloque D (lo próximo a hacer).

## 1.2. Estado de los datos en Supabase

- Tabla `preocupacionales`: tiene 18 columnas (16 del v007 + tel/rrhh del v008). Hay registros de prueba de las validaciones (id_local '999000111' "Prueba Preocupacional", + los que pasaron por el flujo real). Borrables si molestan (sistema no en uso real).
- Tabla `documentacion_ingreso`: 26 columnas (v009), VACÍA (0 registros).
- Candidato de prueba útil para el flujo: Testfase2ter (apellido Oka, DNI 99999997).

---

# 2. Lo que se hizo en esta sesión (cronológico)

**Diseño (consultado con Gabi):**
- `DISENO_FLUJO_SELECCION.md` (commit `93d1f42`): el flujo de 4 etapas. Psico y Pre-ocupacional eliminatorios; Libreta y Antecedentes condicionales. (OJO: este doc quedó parcialmente desactualizado — ver §3, Antecedentes cambió a obligatorio/eliminatorio).
- `DISENO_DOCUMENTACION_INGRESO.md` (commit `ba96336`): el diseño del segundo módulo. Es la versión VIGENTE para Antecedentes.

**Módulo Pre-ocupacional (Fase 1) — commits pusheados:**
- `790e92e` — Etapa 1: tabla preocupacionales (v007) + cableado.
- `5f84260` — Etapa 2: esqueleto (pantalla, menú, permisos).
- `227a6ad` — Etapa 3: modal de gestión (5 resultados, prestador, fecha turno, motivo).
- `f859bb2` — refactor: identificar por id en vez de id_local (ver lección §4).
- `20b6abd` — Etapa 4 handoff de entrada: aprobarPsico envía al pre-ocupacional (incluye v008 tel/rrhh).
- `229cf8a` — Etapa 4 handoff de salida: aprobar al alta o dar de baja, bandeja solo activos.

**Módulo Documentación de ingreso — commits pusheados:**
- `26c74d9` — Sub-bloque A+B: tabla v009 + cableado supabase/state.
- `ba96336` — doc de diseño.
- `893bec8` — Sub-bloque C: esqueleto (pantalla, menú, permisos).

Último commit en origin/main: **`893bec8`**. Todo pusheado, árbol limpio.

---

# 3. Lo que sigue (próxima sesión)

**Módulo Documentación de ingreso — continúa en el Sub-bloque D.** El plan está en `docs/DISENO_DOCUMENTACION_INGRESO.md` §6. Faltan:

- **Sub-bloque D — El modal de gestión (LO PRÓXIMO).** Es la parte más rica. El modal carga los 3 requisitos:
  - **Antecedentes** (obligatorio, eliminatorio): resultado (Pendiente / Sin antecedentes / Con antecedentes), fecha, vencimiento.
  - **Libreta** (condicional): aplica (sí/no), zona, vencimiento.
  - **Curso** (condicional): tiene (sí/no), vencimiento (a confirmar con Gabi si tiene).
- **Sub-bloque E — Lógica de Antecedentes (el override de Gabi).** Cuando el resultado es "Con antecedentes", NO baja automático: pasa a estado "Con antecedentes - pendiente de decisión", con dos botones: "⛔ Dar de baja" (candidato Rechazado) o "✅ Habilitar excepción" (avanza al Alta igual, queda registrado en `antec_excepcion` + `antec_motivo_excepcion`). Cualquier RRHH puede habilitar por ahora.
- **Sub-bloque F — Handoff de salida:** al aprobar Documentación, crear registro en catAltPendientes (con psicoId, que sigue viajando) → Alta. Baja → candidato Rechazado.
- **Sub-bloque G — Handoff de entrada (EL SENSIBLE):** redirigir `aprobarPreocup` (en preocupacional.js) para que cree el registro en `DB.documentacionIngreso` en vez de mandar directo al Alta. Igual que se hizo con aprobarPsico en la Fase 1. Dejar para el final, cuando el destino funcione.
- **Vencimiento de Antecedentes (6 meses):** sub-etapa propia. El sistema debe avisar cuando está por vencer/venció (indicador de color, texto "Vence en X días" / "VENCIDO"). Es funcionalidad nueva (no hecha antes). Por ahora la tabla guarda la fecha de vencimiento; el aviso visual viene después.

**IMPORTANTE — campos camelCase del módulo Documentación** (ya mapeados en supabase.js, usar estos nombres en JS): `antecResultado`, `antecFecha`, `antecVencimiento`, `antecExcepcion`, `antecMotivoExcepcion`, `libretaAplica`, `libretaZona`, `libretaVencimiento`, `cursoTiene`, `cursoVencimiento`, `preocupId`. Los simples (nombre, dni, zona, tel, rrhh, estado, motivo, obs) y candidatoId/psicoId ya andaban.

**Después de Documentación (futuro, fuera de lo planeado para estas sesiones):** los ADJUNTOS vía Supabase Storage (foto de libreta, certificado del curso, antecedente escaneado, entrevista del candidato, apto médico). Es una pieza técnica nueva (subir/guardar archivos). Lautaro quería cortar antes de esto.

**Pendientes a confirmar con Gabi:** ¿el Curso de manipulación tiene vencimiento o es solo "tiene/no tiene"? ¿La zona de la libreta es predefinida o texto libre?

---

# 4. LECCIONES TÉCNICAS DE ESTA SESIÓN (críticas — leer antes de seguir)

**🔴 LA MÁS IMPORTANTE — Identificar SIEMPRE por `id`, NUNCA por `id_local`:**
- El sistema GARANTIZA que `id` siempre existe: al crear en JS usa `Date.now()`, y al recargar de Supabase, `_toCamel` lo restaura desde id_local (`if (r.id_local && !r.id) r.id = r.id_local`).
- En cambio `id_local` NO existe en un registro recién creado en la sesión (supaSync lo pone solo en la copia que va a Supabase, no en el objeto en memoria). Un registro creado en vivo por un handoff tiene `id` pero no `id_local`.
- Esta sesión perdimos un buen rato: primero el modal del pre-ocupacional no abría (registro de prueba sin `id` al cargar), lo "arreglamos" pasando a id_local, y después descubrimos que id_local rompe el handoff (registros en vivo no lo tienen). Volvimos a `id` (commit f859bb2). Candidatos y altas usan `id` justamente por esto.
- Comparar robusto al tipo: `Number(p.id) === Number(id)` o `c.id == id` (igualdad débil). Los ids pueden venir como número o string.

**Verificar que las tablas nuevas tengan las columnas del snapshot ANTES del handoff:**
- La tabla preocupacionales no tenía tel/rrhh, pero el snapshot del psico los copia. Si supaSync manda columnas inexistentes, PostgREST rechaza el INSERT entero (falla silenciosa, warning en consola, el dato no persiste). Se resolvió con v008 (ALTER ADD COLUMN). Antes de cualquier handoff que copie un snapshot, confirmar que la tabla destino tenga TODAS las columnas.

**Campos compuestos necesitan mapeo explícito en supabase.js:**
- El fallback del mapeo (`m[k] || k`) solo sirve para palabras simples (zona → zona). Para compuestos (antecResultado → antec_resultado) hay que agregar el par explícito en _toSnake Y en _toCamel (espejados: camelCase:'snake_case' en uno, snake_case:'camelCase' en el otro). Si falta, el dato no se guarda/lee.
- Los booleanos compuestos además conviene agregarlos a la sanitización de _toSnake (fuerza boolean real, evita conflicto string "true" vs boolean).

**El trigger de updated_at se llama `public.tg_set_updated_at()`** (NO `set_updated_at()`). Verificado contra v007. Cualquier tabla nueva usa ese nombre exacto en el CREATE TRIGGER.

**Verificar contra Supabase, no contra el "Success":** "Success. No rows returned" es ambiguo — aparece tanto al crear una tabla como en un SELECT vacío. Esta sesión el CREATE de v009 pareció correr ("Success") pero la tabla NO se había creado (el editor corrió otra consulta). Se detectó con `select * from tabla` (que dio "does not exist"). Para confirmar que una tabla existe: `select count(*) from information_schema.columns where table_name='...'` debe dar el número de columnas. Y al correr un CREATE: editor limpio (Ctrl+A, borrar), pegar todo, NADA resaltado en azul (si hay selección, Supabase corre solo eso), Run.

**Patrón de módulo nuevo "pantalla propia" (checklist, ya aplicado 2 veces):**
(1) script SQL tabla; (2) `src/modules/X/X.js` (render que llena el tbody); (3) `src/modules/X/index.js` (xScreenConfig + window bindings); (4) main.js (import + registerScreens); (5) state.js MENU (línea en sección Selección); (6) state.js PERFILES (key en Admin total y RRHH — OJO: la subcadena aparece en 2 líneas, usar replace_all); (7) state.js DB (`X: []`); (8) supabase.js _SM (+ mapeos camel↔snake si hay compuestos); (9) index.html (`<div class="screen" id="screen-X">` con `<tbody id="tbody-X">`, en columna 0); (10) el handoff (quién empuja la entidad). Las screens son ESTÁTICAS en index.html; el render solo llena el tbody. Los modales son dinámicos (createElement, cacheados → F5 tras cambios).

**Recordatorios operativos confirmados:**
- F5 full reload tras cambiar HTML de modales (son dinámicos y quedan cacheados).
- El display de Write/Update en Claude Code a veces se entrevera en pantalla (parece duplicar líneas) — verificar SIEMPRE con grep contra el archivo real, no contra el preview.
- grep con paréntesis en ripgrep: escapar los `()` o se interpretan como regex (falsos negativos). Ej: `String\(p.id_local\)`.
- Patrón de aprobación: Lautaro aprieta opción 1 ("Yes"), nunca la 2 ("always allow"). Validación visual en navegador antes de cada push.

---

# 5. Deuda técnica anotada (no urgente)

- **SOSPECHA sobre candidatos:** identifica por `id`. ¿Tiene bug latente (funcionar solo en la sesión donde se crean los registros, fallar tras recargar)? No investigado. Si funciona tras recargar, `_toCamel` rehidrata el id (de hecho lo hace). Revisar en el futuro.
- **DISENO_FLUJO_SELECCION.md desactualizado:** dice que Antecedentes es condicional; Gabi lo redefinió como obligatorio/eliminatorio. La versión vigente es DISENO_DOCUMENTACION_INGRESO.md. Si se relee el primero, tenerlo en cuenta.
- **prompt() nativo en rechazarPsico** (psicotecnico.js) — deuda; el pre-ocupacional y documentación ya usan textarea inline.
- **Filtro roto `cf-ps-resultado`** en psicotecnico.js (filtra por p.resultado inexistente). Preexistente.
- **Mejora cosmética legajo:** la pantalla de detalle no muestra direccion ni genero (los datos están en la base).
- **Permiso fino del override de Gabi:** por ahora cualquier RRHH habilita la excepción de antecedentes; si Gabi quiere que sea solo su perfil, agregar el permiso.
- Dos sistemas de permisos paralelos (PERFILES filtra acceso real; MODULOS_SISTEMA es grilla cosmética de Configuración) — unificar algún día.

---

# 6. Cómo retomar la próxima sesión

1. Subir este traspaso + DISENO_DOCUMENTACION_INGRESO.md al inicio del chat.
2. Confirmar estado: `git status` (debería estar limpio, sincronizado en `893bec8`), `git log -5 --oneline`.
3. Levantar el sistema: terminal → `cd C:\proyectos\ohlimpia` → `npm run dev` → `http://localhost:5173/`. Abrir Claude Code en otra terminal (`claude`).
4. Arrancar el **Sub-bloque D** (el modal de Documentación de ingreso): pedir diagnóstico A.4 del molde (el modal del pre-ocupacional, `crearHTMLModalPreocup` / `abrirGestionPreocup` / `guardarPreocup`) y adaptarlo a los 3 requisitos. Identificar por `id` (lección §4). Recordar los campos camelCase del §3.
5. Seguir el orden del plan: D (modal) → E (lógica antecedentes/override) → F (handoff salida) → G (handoff entrada, el sensible) → vencimiento. Cada sub-bloque = un commit. Validar en navegador antes de cada push.
