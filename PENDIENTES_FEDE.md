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
Escribí todo el código (`api/agente-disparar-real.js`,
`.github/workflows/agente-tickets.yml`, `api/agente-callback.js`) siguiendo
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
- ✅ Endpoint de callback (`api/agente-callback.js`), con token de un solo
  uso y vencimiento.
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
