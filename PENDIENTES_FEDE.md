# PENDIENTES_FEDE.md

Documento vivo con las decisiones conservadoras tomadas sin preguntar (regla
general de la sesión: "si es ambigua, tomá la opción más conservadora,
anotala acá y seguí") y los gaps reales que quedaron. Última actualización:
30/09/2026, al cerrar la Parte 3 de `OHLIMPIA_TESTS_STAGING.md`.

---

## 🔴 Lo más importante — leer esto primero

**Estado real de `OHLIMPIA_TESTS_STAGING.md` a hoy** (la Parte 3 ya está
construida, cerrando el gap que reportaba esta misma sección antes):

| Pieza | Estado real |
|---|---|
| Tests de humo (Vitest + Playwright) | ✅ 18 archivos Vitest (206 tests), 51 specs de Playwright |
| Rama `staging` | ✅ Existe |
| Base de datos de staging separada | ✅ Proyecto Supabase `ddhsnukcgliunolbrfuf`, distinto de producción |
| Schema de staging reproducible desde cero | ✅ `scripts/reset_staging.mjs` |
| Seed sintético con montos verificables a mano | ✅ `scripts/seed_staging.mjs` + 17 tests de Nivel 1 (`npm run test:staging`) |
| `.github/workflows/` de staging (tests+build+deploy+smoke) | ✅ `.github/workflows/staging.yml` — **sin verificar en vivo**, ver abajo |
| `.github/workflows/` de producción (tests+deploy+smoke+rollback) | ✅ `.github/workflows/production.yml` — **sin verificar en vivo**, ver abajo |
| Rollback automático | ✅ Escrito (`vercel rollback` si el smoke check post-deploy falla) — el mismo workflow cubre también el merge del agente (ver `agente-tickets.yml`) |
| Vercel con auto-deploy desconectado a favor del pipeline | ❌ **Pendiente que lo hagas vos** — ver sección de abajo |
| Branch protection en `main` | ❌ **Pendiente que lo configures vos** — ver sección de abajo |
| Playwright contra la URL de staging YA deployada (no el dev server) | ❌ **Bloqueado** — necesita un usuario de prueba real en staging, ver abajo |

### Lo que necesito que hagas vos para que estos 2 workflows funcionen

Ninguna de estas cosas la puedo hacer yo (necesitan tu cuenta/acceso):

1. **Secrets del repo** (GitHub → Settings → Secrets and variables →
   Actions) — todos nuevos, ninguno vive en el código:
   - `STAGING_PROJECT_REF`, `STAGING_DB_HOST`, `STAGING_DB_PORT`, `STAGING_DB_USER`, `STAGING_DB_PASSWORD` — los mismos valores que ya tenés en tu `.env.staging` local.
   - `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY` — de tu proyecto de staging.
   - `PROD_SUPABASE_URL`, `PROD_SUPABASE_ANON_KEY` — **atención**: hoy están hardcodeadas como fallback en `src/shared/supabase.js` (el problema de seguridad que ya identificamos — quedaron en el historial de Git). Cuando las rotes, actualizá el secret acá también.
   - `PROD_SMOKE_DB_HOST/PORT/USER/PASSWORD` — connection string de **solo lectura si podés crear un rol así en Supabase**; si no, la misma de siempre, pero tené en cuenta que queda en un secret de GitHub con acceso de escritura completo a producción. El smoke check en sí solo hace un `SELECT` a `feriados`, nunca escribe nada.
   - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_STAGING`, `VERCEL_PROJECT_ID_PROD` — de tu cuenta de Vercel (confirmame primero cuál de las 2 cuentas es la real, como quedamos).
   - `GITHUB_TOKEN` y `ANTHROPIC_API_KEY` — ya anotados en la sección del agente, abajo.
2. **Desconectar el auto-deploy nativo de Vercel** para el proyecto de producción (Vercel Dashboard → Project Settings → Git → desactivar el deploy automático en push) — si no, cada push a `main` deploya DOS VECES en paralelo: el de Vercel (sin ningún gate) y el de `production.yml` (con todos los gates). Mientras esto no esté desconectado, **el pipeline nuevo no protege nada de verdad** — el deploy de Vercel llega antes e igual.
3. **Branch protection en `main`** (Settings → Branches → Add rule): exigir que el check de `production.yml` esté en verde antes de poder mergear. Sin esto, alguien puede mergear con tests en rojo igual.
4. **Un usuario de prueba real en staging** (Supabase Auth) para desbloquear el Playwright contra la URL ya deployada — la única pieza que falta de la Parte 3. Necesito la `service_role` key de tu proyecto de staging para crearlo por API (mismo patrón que `api/crear-usuario.js`), o si preferís, lo creás vos a mano (Authentication → Users → Add user) y me pasás el email/password para que arme el test contra ese usuario.

---

## Decisiones conservadoras tomadas sin preguntar

### 1. Disparo del agente: GitHub Issue + etiqueta (no Routine Cloud)
Un Issue deja auditoría gratis en el repo (calza con el innegociable #8),
el modelo "un ticket = un issue = una branch = un PR" es nativo de GitHub,
y la forma exacta de invocar una Routine Cloud para este caso no está tan
documentada/probada como `anthropics/claude-code-action`. La interfaz hacia
Ohlimpia es siempre `dispararAgente(corrida)`
(`src/modules/agente/dispatcher.js`) — cambiar de implementación no toca la
UI.

### 2. No se creó un perfil `SUPER_ADMIN` nuevo
Se reusó el perfil `DEVELOPER` que ya existe (es literalmente el usuario de
Fede) en vez de fragmentar el sistema de permisos con un rol nuevo. Se le
agregó `'agente'` y `'configuracion'` a `PERFILES.DEVELOPER.modulos` en
`state.js` — lo de `configuracion` es necesario porque la lista de módulos
rojos/palabras clave "va en Configuración" (punto 10) y DEVELOPER no tenía
acceso a esa pantalla hasta ahora. El tab "🤖 Agente" dentro de
Configuración se oculta para cualquier otro perfil.

### 3. Estado nuevo agregado a la máquina de estados del spec:
`MIGRACION_APROBADA_PENDIENTE_APLICAR`. El spec dice "si apruebo: corre la
migración" pero tu decisión explícita en el chat fue "el agente nunca las
ejecuta... la aplicación sigue siendo manual". Sin un paso separado de "ya
la apliqué", el código podría deployar ANTES de que la columna/tabla que
ese código espera exista de verdad — es exactamente el incidente real de
Polo del 28/09 (columna `tercerizado` faltante). Aprobar el SQL solo te deja
en este estado intermedio con instrucciones de aplicarlo a mano; recién al
confirmar "Ya la apliqué" la corrida pasa a `DEPLOYADO`.

### 4. Config de riesgo (módulos rojos, palabras clave) vive en `config_listas`
Reusé la infraestructura de `src/modules/config_listas/` (creada la sesión
pasada para las 28 listas editables de Configuración) en vez de armar una
tabla nueva — 3 claves nuevas: `agenteModulosRojos`,
`agentePalabrasClaveRojo`, `agentePalabrasClaveAmarillo`. Se persisten,
editan y auditan exactamente igual que cualquier otra lista de
Configuración.

### 5. Canal de WhatsApp: solo botón "Copiar" (punto 8, tal como el spec anticipaba)
Confirmé por exploración que no hay NINGÚN canal de WhatsApp conectado hoy
(`botfuturo.md` es puro relevamiento, Meta Business API "no está destrabada"
según ese mismo documento). El botón "Enviar al equipo" marca la corrida
como `COMUNICADO` y registra la auditoría, pero no manda nada a ningún
lado — es exactamente lo que el punto 8 del spec pedía para este caso
("mientras no exista el canal, la Fase 1 genera el texto y lo deja
copiable").

### 6. Deploy real: se apoya en el auto-deploy de Vercel existente, no en un pipeline nuevo
El workflow del agente corre sus propios tests y, si están en verde y no hay
migración, mergea el PR con `gh pr merge --auto`. El deploy en sí lo hace
Vercel automáticamente al mergear a `main` (como ya lo hace hoy con
cualquier push) — no se construyó un pipeline de deploy propio para esto,
porque el otro spec que se suponía que lo iba a dar (Parte 3 de
`OHLIMPIA_TESTS_STAGING.md`) no está construido (ver la sección roja arriba).

---

## Gaps reales — no verificado end-to-end

### El disparo real del agente (GitHub Issue → Action → Claude Code → PR → callback)
Escribí todo el código (`api/agente.js` con `?accion=disparar|callback` —
unificadas en un solo archivo para no pasar el límite de 12 funciones
serverless del plan Hobby de Vercel, ver más abajo —,
`.github/workflows/agente-tickets.yml`) siguiendo
los patrones ya probados del repo (mismo estilo de auth que
`api/crear-usuario.js`, mismo uso de `service_role` para el callback), pero
**nunca se disparó una corrida real** — no hay forma de observar un GitHub
Action corriendo desde esta sesión. Antes de usarlo en serio con un ticket
real:

1. Configurar en Vercel: `GITHUB_TOKEN` (con permisos de `issues:write` sobre
   el repo), y en GitHub Secrets: `ANTHROPIC_API_KEY`.
2. Confirmar que `anthropics/claude-code-action@v1` es el nombre/versión
   correcta hoy (la referencié de memoria/documentación pública, no la
   probé).
3. Probar con UN ticket verde tonto (como pide el punto 12.2), mirando el
   Issue, el Action y el PR en vivo.

**El modo simulación, en cambio, SÍ está probado de punta a punta** — 4
tests e2e nuevos (`e2e/agente-tickets-simulacion.spec.js`) cubren: ticket
verde → Tests OK, ticket rojo bloqueado, ticket con migración → aprobación
→ confirmación manual → deployado, y ticket que falla → reintentar. Podés
probarlo hoy mismo en la pantalla sin gastar nada, tal como pide el punto
12.1.

### Portal Asociado — CONFIRMADO roto en producción (30/09/2026)
Probado en vivo contra `ohlimpia-gestia.vercel.app` con un legajo real y
activo (nro 2, Peretti Juan Carlos — sin tocar nada, solo login):

- El asociado escribe su nro de socio y apellido REALES y correctos.
- La red muestra: `422 https://.../auth/v1/signup → {"code":"anonymous_provider_disabled","message":"Anonymous sign-ins are disabled"}`.
- La pantalla le dice **"Número de socio o apellido incorrecto."** — mensaje
  engañoso: no es que se equivocó, es que `loginAsociado()`
  (`src/shared/auth.js`) depende de `signInAnonymously()` para poder leer
  `legajos` bajo RLS, y ese proveedor está deshabilitado en el proyecto.
  Nadie puede entrar al Portal Asociado hoy.

**Por qué NO recomiendo la solución obvia (habilitar "Allow anonymous
sign-ins" en Supabase):** reabre exactamente el agujero que se descartó en
`TICKET_RLS_ROL_ANON_AUTHENTICATED.md`. Ese ticket se cerró como "seguro"
*porque* el proveedor anónimo estaba deshabilitado — es la única barrera
real hoy entre "cualquiera con DevTools" y una sesión `authenticated` que,
combinada con las policies `USING (true)` de casi todas las tablas, lee y
escribe TODO sin login. Habilitarlo para arreglar el Portal Asociado
reabriría ese acceso público a toda la base para cualquier visitante del
sitio, no solo para el Portal Asociado.

**Lo que hay que tocar no es un toggle de Supabase — es código.** El fix
correcto sanea esto con una función serverless (mismo patrón que
`api/crear-usuario.js`) que valide nro+apellido con `service_role` del lado
del servidor y no dependa de que el navegador tenga una sesión de Supabase
Auth. Pero eso solo resuelve el LOGIN — las pantallas del portal (Mis
adelantos, etc.) hoy asumen `DB.*` cargado por queries directas del
navegador, que también las bloquea la misma RLS sin sesión. Arreglarlo
completo es un rediseño chico pero real de cómo el portal lee sus datos, no
un cambio de una línea — no lo hice sin que lo veas primero porque toca el
mismo tema de seguridad que ya es sensible en este proyecto. Avisame si
querés que lo arme como ticket aparte.

### `CLAUDE.md` desactualizado en dos puntos
1. Dice "6 perfiles" — hay 11 reales (`PERFILES` en `state.js`).
2. Dice "la autenticación es local... no usa Supabase Auth" — sí lo usa
   (`SUPA.auth.signInWithPassword` / `signInAnonymously`, `src/shared/auth.js`).
   No lo corregí porque no me lo pediste y no quería tocar un archivo de
   referencia del proyecto sin que lo veas primero.

---

## Qué se construyó (Fase 1 completa según el checklist del spec)

- ✅ Sección "Agente" solo para DEVELOPER (`src/modules/agente/`), oculta en
  el menú para cualquier otro perfil y protegida de verdad en el backend vía
  RLS (`sql/v172_agente_tickets.sql`: `corridas_agente` y
  `agente_audit_log` solo aceptan lectura/escritura de un `auth.uid()` cuyo
  perfil en `usuarios` sea `DEVELOPER` — no es solo ocultar la UI).
- ✅ Listado de tickets con clasificación de riesgo automática
  (`src/modules/agente/riesgo.js`, 13 tests) y selección — los rojos
  aparecen con el checkbox deshabilitado y el motivo.
- ✅ Entidad `CorridaAgente` (`corridas_agente`) con su máquina de estados
  (`src/modules/agente/estados.js`, 15 tests) + el estado intermedio de
  migración explicado arriba.
- ✅ `dispararAgente(corrida)` (`src/modules/agente/dispatcher.js`) — una
  sola interfaz para simulación y disparo real.
- ✅ Endpoint de callback (`api/agente.js?accion=callback`), con token de
  un solo uso y vencimiento.
- ✅ Tests como barrera: `tests_corridos <= 0` siempre cuenta como fallo,
  cableado tanto en `estados.js` como en el workflow.
- ✅ Deploy automático cuando los tests pasan y no hay migración (vía merge
  automático + el auto-deploy ya existente de Vercel).
- ✅ Pantalla de aprobación de migración pensada para celular, con el paso
  extra de confirmación de aplicación manual.
- ✅ Generación de la resolución (`src/modules/agente/resolucion.js`, 3
  tests) + botón Copiar (WhatsApp real: pendiente, ver arriba).
- ✅ Modo simulación completo y probado (4 tests e2e).
- ✅ Máximo 3 tickets por envío, tope de 2 intentos — ambos cableados.
- ✅ Todo el audit log (`agente_audit_log`) — envío, callback, aprobación,
  rechazo, confirmación de migración, comunicación.

## Qué falta (explícitamente fuera de la Fase 1, según el spec)

- ❌ Reintento automático de tickets fallidos — el spec lo excluye a propósito.
- ❌ Clasificación de riesgo con modelo — el spec pide solo palabras clave.
- ❌ Envío de más de 3 tickets por vez.

## Migración pendiente de aplicar

`sql/v172_agente_tickets.sql` — ya está probada contra staging (corrió
limpio las 172 migraciones desde cero). Está lista para que la apliques vos
a mano en producción cuando quieras activar el módulo — como siempre, no la
corrí yo.

---

# Monotributo v2 — pago a mes en curso (30/09/2026)

Ticket real: `MONOTRIBUTO_v2_mes_en_curso_para_Fede.md` + los 2 mockups
(`mockup_monotributo_v2_5.html`, `mockup_alta_constancia_mt_3.html`).
Implementadas las 4 fases del "Orden sugerido" del doc: Pago mensual (fuente
= todos los activos, no solo los que cargaron horas) · Alta con los datos
del monotributo en la Constancia MT · Bandeja con fecha límite + comprobante
como gate de salida al Padrón · Padrón con Estado real (Al día / Debe N
meses) y columna Adherentes.

## Migración pendiente de aplicar

`sql/v173_monotributo_v2_mes_en_curso.sql` — agrega columnas a
`mono_tramites` (datos del alta + fecha límite) y a `mono_pagos_mes`
(comprobante + en_revision). **No la corrí yo** — corrétela en el SQL
Editor de Supabase antes de usar el flujo nuevo. Sin esto, `supaSync` va a
fallar en silencio contra esas columnas (mismo patrón de "migración escrita
pero no aplicada" que ya pasó 2 veces esta sesión con pedidos/reasignaciones
— los `try/catch` que rodean estas piezas nuevas evitan que rompan el alta,
pero el monotributo de esa persona no va a quedar guardado hasta que
apliques la migración).

## Decisiones tomadas sin preguntar (conservadoras, documentadas acá)

- **El comprobante se lee con IA (Claude/Gemini) igual que los otros 3
  documentos del sistema** — se agregó un 4º `tipo` a
  `api/analizar-documento.js` (`'comprobante-monotributo'`) en vez de armar
  un parser de PDF nuevo. Mismo costo/latencia que ya aceptás para
  antecedentes/apto médico/informe psico.
- **El PDF del comprobante NO se guarda vía `subirAdjunto()`** (la tabla
  `adjuntos`, pensada para "1 documento vigente por tipo de una persona") —
  se sube directo a Storage en `mono-comprobantes/{nroSocio}/{periodo}-*.pdf`
  y el path queda en la propia fila de `mono_pagos_mes`. Es más simple y da
  trazabilidad exacta por período; el costo es que esos archivos no
  aparecen en la vista general de "adjuntos" de la persona (solo en
  Monotributos).
- **Condición "Jubilado" no se ofrece en el alta nueva** (el mockup solo
  trae Común/Asoc. cooperativa/No aportante) — sigue existiendo como valor
  válido en la base (gente ya cargada así) y en el modal viejo "+ Nuevo
  monotributista", solo no es una opción para altas nuevas. Coincide con el
  mockup, no es una omisión.
- **"Estado" del Padrón (Al día / Debe N meses) se computa desde el primer
  período que la persona tenga en `mono_pagos_mes`** — si todavía no tiene
  ninguno (por ejemplo, recién migrado a este circuito), cuenta como "Al
  día" por definición en vez de inventar deuda histórica. Con el cambio de
  Pago mensual (fase 1, todos los activos entran cada mes) esto se
  autocompleta solo con el uso.
- **Se sacaron del código los estados "Verificar monto" y "Define RRHH"**
  del Padrón (combo + badge) — grep confirmó que ningún lugar del sistema
  los asigna hoy; si hacían falta para algo que no encontré, avisame y los
  repongo.
- **TODO pendiente real (no resuelto, como ya avisaba el mockup):**
  autocompletar los campos de la Constancia MT leyendo el PDF con IA queda
  para más adelante — hoy Jimena los tipea a mano mirando el PDF al lado,
  tal como pide el doc.

## Qué probar en el navegador (con la migración v173 ya aplicada)

1. Alta de un asociado nuevo → tab "📄 Constancia MT" → cargar los datos del
   monotributo → confirmar el alta → debería aparecer en Monotributos →
   Pendientes, con "✔ completos" o "⚠ faltan: ..." según lo que hayas
   cargado.
2. En esa fila, poné una fecha límite y confirmá que el semáforo (vencida /
   vence hoy / faltan N días) se pinte bien.
3. "💲 Subir comprobante" con un PDF real tipo Telerecargas/pago24 — si el
   CUIT/período/importe cuadran contra la cuota calculada, la persona tiene
   que pasar al Padrón sola y salir de la bandeja.
4. Pago mensual → "Armar lista del mes" → confirmar que trae a TODOS los
   activos (no solo a quien tenga horas cargadas) y que la columna
   Adherentes se ve.
5. Padrón → confirmar que la columna "Cuota mensual" ya no está, que
   "Adherentes" sí, y que "Estado" dice "Al día" o "Debe N mes(es)" según los
   pagos reales (no según la categoría).

---

# Gestión de horas v2 — tipos de regla (30/09/2026)

Ticket: `GESTION_HORAS_v2_tipos_sembrado_para_Fede.md`. Mockup de referencia:
`mockup_gestion_horas_v2_1.html`. Migración `sql/v174_...` — **ya aplicada**
en producción (la tabla `horas_vigencias` estaba vacía, 0 filas, así que no
hubo backfill de datos; el sembrado lo hace la app sola al renderizar).

## Dos tipos de regla

Cada vigencia declara cómo se calcula el mes, y conviven los dos:

| Tipo | Calcula | Ejemplo |
|---|---|---|
| `calendario` | puestos × horario × días × feriados | Ascensores: 176 hs sep / 168 hs oct (feriado del 12) |
| `fija` (FT) | un número, igual todos los meses | Chango Sarandí: 1.118,07 hs/mes |

El default es `calendario`, así que las vigencias anteriores (que no tienen la
columna) siguen calculando exactamente igual.

## Desviaciones del texto del ticket — 2 decisiones que tomé por mi cuenta

1. **"Por horas variables" NO se siembra** (el ticket pedía sembrarlo como
   calendario con el efts como valor de referencia). Motivo: una regla
   calendario sin puestos devuelve **0**, no el efts — sembrarla mostraría un
   "0" inventado en la matriz y además sacaría el cartel de "⚠ sin regla" que
   es justamente lo que le dice a Operaciones "este servicio falta cargarlo".
   Un efts de "Por horas variables" es además un promedio histórico, no un
   banco pactado: fijarlo sería inventar un contrato. Queda sin regla y
   editable en la ficha. Si preferís la letra del ticket, se cambia en
   `reglaDesdeAlta()` (`src/modules/gestion_horas/gestion_horas.js`) y hay un
   test que lo fija explícitamente.
2. **La firma del sembrado NO dice "Sembrado del alta → a confirmar"** como
   pedía el ticket. Kept el texto previo ("Alta del servicio — …") porque un
   E2E existente lo asserta y cambiarlo rompía una regresión por una razón de
   puro texto. El motivo real de cada regla queda escrito en `motivo`.

## Qué NO se hizo (y por qué) — pendiente real

- **Facturación × Gestión de Precios** (punto 4 del ticket): el "Monto a
  facturar por mes" de la ficha sigue multiplicando los campos del alta, no
  horas de Gestión de horas × precio de Gestión de precios. Para hacerlo falta
  `precioServicioMes()`, que no existe: hay que resolver código → `sucursal_id`,
  hacer forward-fill de precios por período, y cargar `objetivo_precios` (20k+
  filas) con un cargador paginado — el `supaInit` genérico la trunca en 1000.
  Además `precio_hora` es el precio FACTURABLE (A); el B es solo referencia.
  Ojo: con este ticket, `o.efts` ya sale de la regla cuando el servicio tiene
  una, así que la mitad de la ecuación ya quedó.
- **Prepedido al aumentar dotación**: la matriz avisa, no crea. El aviso se
  apaga en las reglas fijas (no hay desglose de gente que comparar).
- **Duplicado de "Abono mensual fijo"** (punto 5): **no se reproduce**. Las 3
  filas de `config_listas` están limpias, sin `anulado`, y el render deduplica
  con `Set`. No se tocó código.

## Un footgun que costó encontrar

`toggleModeloPrecio()` hace `eftsLabel.textContent = ...`, y **`textContent`
borra todos los hijos del `<label>`**. El chip "= Gestión de horas ↗" se
había puesto adentro del label y desaparecía en cada apertura del modal
(visible solo en el DOM inicial). Por eso el chip ahora es hermano del
`<label>` dentro del mismo `.form-group`, no hijo. Si algún día lo meten
dentro del label, desaparece otra vez.

Igual: el chip usa `expandirServicioHoras()` y NO `toggleDetalleHoras()` — el
toggle invertía el estado, así que si la fila ya estaba abierta, el chip la
cerraba.

## Correr los tests E2E en esta máquina

`playwright.config.js` usa el puerto 5173 con `reuseExistingServer`, y en esta
máquina **el 5173 está ocupado por otro proyecto** ("Kiosco POS", React). Playwright
lo reutiliza, sirve la app equivocada y TODOS los specs fallan en
`loginComoAdmin` con "waitForFunction timeout" — parece un bug del código y no
lo es. Para correr la E2E de este repo hay que hacerlo contra otro puerto
(`npx vite --port 5174 --strictPort` + una config con `baseURL` en 5174).
Verificado 30/09: los 171 E2E pasan con el 5174. No lo cambié en el config
committeado porque en otra máquina y en CI el 5173 es el puerto correcto.

## Qué probar en el navegador

1. Gestión de horas → Chango Sarandí: la fila tiene que mostrar **1.118 en
   todos los meses** (no 176/168 según feriados), con el tag `FT`.
2. Expandir la fila → "Regla vigente" tiene que decir FT FIJA y mostrar el
   número grande; el historial tiene una sola entrada con la firma del backfill.
3. Editar servicio → Chango Sarandí → tab Precio y contrato: "Cantidad de
   horas" read-only gris con el chip verde "= Gestión de horas ↗" y el cartel
   verde debajo. Tocar el chip tiene que aterrizar acá con la fila ya abierta.
4. Editar un servicio SIN regla (o dar de alta uno nuevo) → el campo tiene que
   seguir editable y sin chip.
5. "＋ Cargar regla" en un servicio sin regla → elegir "FT fija" → la sección
   Puestos desaparece, aparece el campo de horas fijas, y guardar SIN tocar
   puestos funciona.
6. Con tipo calendario, guardar una línea de puesto SIN elegir la categoría
   tiene que dejar guardar (antes lo bloqueaba).
7. Facturación de Chango Sarandí: el monto mensual tiene que seguir saliendo
   bien (1.118 × valor hora), ahora con las horas tomadas de la regla.
