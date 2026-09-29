# Ticket — RLS: confirmar con qué rol llegan los requests reales

**Prioridad:** alta
**Origen:** surgió investigando el bug de Polo (28/09, columna `tercerizado` faltante) y se
formalizó como parte del spec de staging (`OHLIMPIA_TESTS_STAGING.md`).
**Estado:** hipótesis de exposición pública DESCARTADA (29/09) — ver "Conclusión" al final.
Queda pendiente solo el punto 2 (mapear el mecanismo real de auth en `CLAUDE.md`), sin
apuro y sin bloquear nada más.

## El problema

Todas las tablas del proyecto tienen RLS habilitado con el mismo patrón, repetido en
prácticamente las 173 migraciones de `sql/`:

```sql
CREATE POLICY "Solo usuarios autenticados" ON public.<tabla>
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

Es decir: la policy exige que el request llegue con el rol de Postgres `authenticated`.
Pero la app **no usa Supabase Auth** — el login es local, contra un array en memoria
(`DB.usuarios`, passwords en texto plano — ver "Conocidos / pendientes" en `CLAUDE.md`).
El cliente de Supabase (`src/shared/supabase.js`) nunca llama a `SUPA.auth.signIn*`,
así que no hay sesión, no hay JWT propio — todo pega con la misma API key fija.

## Lo que confirmé (28/09, vía conexión directa al pooler, solo lectura)

- **`anon` NO es miembro de `authenticated`** a nivel de rol de Postgres — no hay
  ningún `GRANT authenticated TO anon` ni membership implícita
  (`pg_has_role('anon','authenticated','member')` → `false`).
  Esto significa que, si un request efectivamente llega como rol `anon`, cualquier
  policy `TO authenticated` **debería** rechazarlo (SELECT devuelve 0 filas, INSERT/UPDATE
  se rechaza).
- Repetí un `SELECT` real contra `/rest/v1/objetivos` (tabla con datos reales, 170 filas)
  usando la key pública hardcodeada como fallback en `supabase.js`
  (`sb_publishable__SBdO6cSQXYfgR16FrztwA_Cf9sNosd`) — devolvió `HTTP 200` con
  **0 filas**. Coherente con "esa key resuelve a un rol que la policy no deja pasar".
- Pero **la app en producción sí escribe y lee `objetivos` todos los días** (hay
  filas reales cargadas hace 5 días, y hoy mismo Polo pudo guardar servicios apenas
  se agregó la columna que faltaba). Esto es contradictorio con el punto anterior
  **si** producción usa la misma key que el fallback hardcodeado.

## Lo que NO pude confirmar todavía

No tengo acceso al Vercel del proyecto en esta sesión (CLI sin autenticar), así que no
pude leer qué `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_URL` tiene configurados
realmente el deploy de producción. Hay dos hipótesis, y hoy no puedo distinguir cuál es
la real:

1. **Vercel tiene configurada una key distinta y válida**, que sí resuelve a un rol que
   las policies aceptan (posible con el sistema nuevo de API keys de Supabase, donde una
   "publishable key" puede estar configurada para resolver como `authenticated` en vez de
   `anon` — es un comportamiento de plataforma, no algo que yo pueda leer desde SQL).
   En ese caso, **la key hardcodeada en el código fuente estaría vieja/huérfana** — ya
   no es la que usa producción, pero sigue siendo un secreto real filtrado en el
   historial de Git igual.
2. **Vercel usa la misma key** y el rol resuelto SÍ es `authenticated` para tráfico real
   (por alguna configuración de proyecto que no puedo ver sin dashboard), y mi test con
   `curl`/Playwright desde este entorno agarra otro camino (por ejemplo, si el entorno de
   pruebas no tiene salida de red idéntica a producción). Menos probable pero no
   descartado.

## Próximo paso (cuando se retome)

1. Con acceso a Vercel (pendiente que Fede confirme el proyecto correcto): comparar
   byte a byte la key real configurada ahí contra la hardcodeada en `supabase.js`.
2. Si son distintas: rotar/eliminar la vieja igual (ya decidido — ticket de credenciales
   filtradas, independiente de este), y repetir el mismo test de `SELECT` con la key
   real para confirmar el rol de una vez.
3. Recién ahí decidir si hay que migrar las 173 policies a `TO anon, authenticated` (o al
   rol que corresponda) — **no se toca nada de RLS hasta tener esta confirmación**, el
   riesgo de romper el acceso real a producción a ciegas es alto.

## Verificación desde afuera (para correr sin acceso a Vercel/Supabase dashboard)

**Hipótesis a confirmar o descartar:** la key real que usa producción (la que Vercel
inyecta en `VITE_SUPABASE_ANON_KEY` al buildear) resuelve a rol `authenticated`. Como
tiene prefijo `VITE_`, Vite la deja en texto plano dentro del bundle JS que baja
cualquier visitante — no hace falta loguearse ni tener credenciales para tenerla. Si
además las policies son `USING (true)` (lo son, confirmado arriba), esa combinación
significa que cualquiera que abra DevTools puede leer TODA la base sin login.

### Paso 1 — sacar la key real del bundle de producción

**Opción A (Network, más directa):** abrir la app de producción → F12 → pestaña
**Network** → filtrar por `supabase.co` → recargar y loguearse con cualquier perfil →
click en cualquier request a `.../rest/v1/...` → copiar el valor del header `apikey`
(es el mismo que aparece en `authorization: Bearer ...`).

**Opción B (buscar en el bundle):** F12 → pestaña **Sources** → buscar en todos los
archivos (Ctrl+Shift+F en Chrome) el texto `supabase.co` — va a aparecer en un
`assets/*.js` junto con la key, porque Vite las deja inlineadas en build time.

### Paso 2 — la prueba real (curl, SIN login, SIN cookies, SIN nada de la app)

Esta es la prueba que importa: si esto devuelve datos reales, es prueba de que
**cualquiera en internet**, sin ninguna cuenta ni sesión, puede leerlos.

```bash
curl -s -w "\nHTTP:%{http_code}\n" \
  "https://caeqsieiuunqvicfpudu.supabase.co/rest/v1/objetivos?select=id_local,codigo&limit=5" \
  -H "apikey: PEGAR_ACA_LA_KEY_REAL_DEL_BUNDLE" \
  -H "Authorization: Bearer PEGAR_ACA_LA_KEY_REAL_DEL_BUNDLE"
```

(Elegí `objetivos` porque tiene datos reales y no es tan sensible como `legajos` o
`usuarios` — alcanza para confirmar o descartar sin exponer datos personales en la
terminal. Si esto da positivo, no hace falta repetirlo contra una tabla más sensible
para saber que hay un problema.)

Alternativa desde la consola del navegador (mismo resultado, si preferís no usar
terminal) — pegar en la pestaña **Console** de DevTools, en cualquier pestaña (no hace
falta estar en la página de Ohlimpia):

```js
fetch('https://caeqsieiuunqvicfpudu.supabase.co/rest/v1/objetivos?select=id_local,codigo&limit=5', {
  headers: { apikey: 'PEGAR_ACA_LA_KEY', Authorization: 'Bearer PEGAR_ACA_LA_KEY' }
}).then(r => r.json()).then(console.log);
```

### Cómo leer el resultado

| Resultado | Significa |
|---|---|
| Array con filas reales (ej. `{"id_local":"...","codigo":"HIT.VILO"}`) | **CONFIRMADO** — la key resuelve a un rol que la policy `USING(true)` deja pasar. Cualquiera con DevTools lee toda la base. Grave, prioridad máxima. |
| `[]` vacío, `HTTP 200` | La key NO alcanza `authenticated` para esta tabla — la hipótesis se descarta (al menos para lectura pública sin contexto de la app). |
| `HTTP 401` / `403` | También descarta la hipótesis — hay un bloqueo explícito. |

No hace falta probar un INSERT/UPDATE para confirmar la lectura: si el resultado da
positivo, la escritura corre el mismo riesgo (misma policy, `FOR ALL`) y no vale la pena
probarla contra producción — ya alcanza con la lectura para actuar.

## Conclusión (29/09) — hipótesis descartada

Corrí la prueba de arriba y una más: en vez de solo probar lectura directa con la key
pública, probé el camino que de verdad podría haber sido un problema — pedir una sesión
`authenticated` sin ninguna credencial.

1. **Bajé el bundle real de producción** (`https://ohlimpia-gestia.vercel.app/assets/supabase-*.js`)
   y confirmé que Vercel usa la MISMA key que estaba hardcodeada como fallback
   (`sb_publishable__SBdO6cSQXYfgR16FrztwA_Cf9sNosd`) — no hay una key de Vercel distinta.
   Esto ya resuelve la duda de la sección anterior: el fallback **es** la key real de
   producción (confirma que hay que rotarla igual, por estar en el historial de Git,
   aunque el riesgo de exposición resultó ser otro).
2. **Lectura directa con esa key, sin sesión** (`objetivos`, `legajos`): `HTTP 200`, `[]`
   vacío en ambas. RLS bloquea correctamente el acceso sin sesión.
3. **El mecanismo real de por qué la app funciona**: no es la key sola — hay Supabase
   Auth real (`src/shared/auth.js`), con `signInWithPassword()` para el login de
   personal y `signInAnonymously()` como fallback del Portal Asociado (para poder leer
   `legajos` bajo RLS sin pedirle password al asociado). Esto no estaba en `CLAUDE.md`
   ("la autenticación es local... no usa Supabase Auth" quedó desactualizado).
4. **La prueba que de verdad importaba**: pedí una sesión anónima directo por API
   (`POST /auth/v1/signup` con body vacío, solo la key pública, sin login) — si esto
   hubiera funcionado, cualquiera con DevTools consigue un token `authenticated` sin
   credenciales y lee/escribe todo (mismo problema que se temía, por otra puerta).
   Resultado: `HTTP 422 — anonymous_provider_disabled`. **Está deshabilitado a nivel del
   proyecto.** No hay forma de conseguir `authenticated` sin un login real
   (`signInWithPassword` con usuario/contraseña válidos de `auth.users`).

**Conclusión:** no hay exposición pública de la base. El modelo de seguridad es el
normal (hace falta credencial real para escribir/leer). No hace falta tocar ninguna
policy de urgencia.

**Efecto secundario encontrado (ticket aparte, no bloqueante):** el Portal Asociado
(login por nro de socio + apellido) depende de `signInAnonymously()` para poder leer
`legajos` bajo RLS — como el proveedor anónimo está deshabilitado, es probable que ese
login esté roto en producción ahora mismo. No lo confirmé todavía (haría falta probar el
flujo completo), lo dejo anotado para revisar aparte.

**Pendiente sin apuro:** actualizar la sección de `CLAUDE.md` que dice "no usa Supabase
Auth" — quedó desactualizada, y confunde a cualquiera que investigue esto después.

## Por qué importa

Si el mecanismo real por el que hoy "funciona" depende de un detalle no documentado del
sistema de API keys de Supabase (en vez de una policy explícita y entendida), es changas:
cualquier cambio de configuración de key en el dashboard de Supabase (rotación,
"legacy keys" deshabilitadas, etc.) puede tirar abajo el acceso a TODA la base sin que el
código haya cambiado una línea. Vale la pena entenderlo antes de que pase, no después.
