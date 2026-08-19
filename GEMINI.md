# Gemini — guía de trabajo en Ohlimpia ERP

Este archivo es el equivalente para Gemini de `CLAUDE.md`. **Leé primero
`CLAUDE.md` completo** — ahí está la arquitectura real del proyecto
(stack, estructura de módulos, convenciones de migración, tablas de
Supabase, bugs conocidos). Este archivo no la repite; se enfoca en lo
que `CLAUDE.md` todavía no documenta: patrones operativos aprendidos
resolviendo tickets reales, bugs de esquema ya encontrados, y cómo se
espera que trabajes en este proyecto (con supervisión, no en piloto
automático).

Si en algún momento este archivo y `CLAUDE.md` se contradicen, gana
`CLAUDE.md` — y avisá la contradicción en vez de elegir en silencio.

## Rol: backup bajo supervisión, no reemplazo autónomo

Fede te suma como asistente de respaldo, en paralelo a Claude (que ya
viene trabajando en este proyecto). Esto significa:

- **Cualquier cambio que toque producción (deploy, migración SQL,
  escritura directa a Supabase) se hace visible para que Fede y/o
  Claude lo puedan revisar antes o inmediatamente después** — no lo
  dejes como un commit silencioso sin contexto. Un mensaje claro de
  commit + un resumen en español de qué se hizo y qué probar alcanza;
  no hace falta pedir permiso para cada línea, pero sí que quede
  trazable.
- Ante una decisión de negocio ambigua (¿qué hacemos si falta este
  dato?, ¿qué estado inicial le ponemos?, ¿esto se puede inferir o hay
  que preguntar?) — **preguntá, no inventes**. Ver "No inventar" más
  abajo, es la convención más importante de todo el proyecto.
- Si vas a tocar un módulo que Claude tocó recientemente (mirá el
  historial de git — `git log --oneline -20`), leé los commits
  recientes de ese módulo antes de asumir cómo funciona. El código real
  manda sobre cualquier resumen o memoria — incluida esta.
- Armá tickets/reportes de lo que encontrás y lo que arreglaste, en
  español, con pasos concretos de qué probar en el navegador — es el
  formato que ya espera Fede.

## "No inventar" — la convención más importante

Repetida decenas de veces en este proyecto: **si un dato no está en la
fuente (planilla, DB, ticket), se deja vacío y se avisa — nunca se
adivina un valor plausible.** Aplica a:
- Campos de un import que la planilla de origen no trae (mejor "—" que
  un valor inventado que después alguien toma como verdadero).
- Cruces de datos ambiguos (¿este nombre de coordinador es la misma
  persona que este legajo? Si no hay forma confiable de confirmarlo,
  no se cruza automático).
- Reglas de negocio no explícitas — si el código no dice qué pasa en un
  caso borde, no se asume, se pregunta.

Contraparte: cuando la evidencia SÍ confirma algo con certeza (un log,
una query real, un test que pasa), no hay que sub-verificar de más ni
pedir permiso para actuar — "gana la evidencia" (ver `CLAUDE.md`,
sección de convenciones operativas).

## Bugs de esquema ya encontrados (para no repetir la investigación)

Estos costaron tiempo real de debugging — documentados para que no haya
que redescubrirlos:

1. **`supaSync()` no valida contra el esquema real de la tabla.** Manda
   el objeto JS completo (convertido a snake_case) tal cual a Supabase.
   Si el objeto tiene una key que no es una columna real, Postgres
   devuelve `Could not find the 'x' column of 'y' in the schema cache`
   y el guardado falla en silencio (según quién llame, puede no
   mostrarse ningún error visible). **Antes de armar el payload para
   `supaSync`, confirmá contra el esquema real de la tabla** (no contra
   lo que "parece lógico" que debería tener) — o reusá una función
   `xParaGuardar()` ya existente si el módulo la tiene (ver
   `objetivoParaGuardar()` en `legacy.js`).
2. **Objetos "reconciliados" en memoria pueden tener campos fantasma.**
   `reconciliarClienteIdObjetivos()` (y funciones similares) reconstruyen
   campos como `o.clienteId` SOBRE el objeto en memoria de `DB.objetivos`
   para que otras pantallas los puedan leer — pero esos campos NO son
   columnas reales (`objetivos` solo tiene `cliente_id_local`, no
   `cliente_id`). Si reusás ese objeto tal cual para un `supaSync`
   posterior (ej. en un importador que hace upsert), arrastrás el campo
   fantasma y rompés el guardado. Regla general: **nunca asumas que un
   objeto de `DB.*` en memoria es un payload seguro para persistir** —
   limpialo explícitamente primero.
3. **Mojibake irrecuperable en mayúsculas acentuadas.** Cuando un CSV
   pasa por varias capas de copiar/pegar, el patrón típico
   UTF-8-leído-como-Latin1 (`"Ã³"` → `"ó"`) se revierte con
   `Buffer.from(s,'latin1').toString('utf8')` — pero si el texto ya
   pasó por una segunda corrupción (común en MAYÚSCULAS con tilde/ñ:
   Ñ, Ó, Á...), el segundo caracter se pierde del todo (queda un
   replacement character irrecuperable). No hay forma de reconstruirlo
   por código — hay que reconocerlo por contexto (nombres de barrios,
   apellidos reales) y corregirlo a mano en el archivo de origen antes
   de parsear. Señal de alerta: buscar el patrón `Ã[A-Z]` en el CSV
   crudo. Ojo también: aplicar el fix de mojibake dos veces sobre un
   texto ya corregido lo vuelve a romper — hacé el fix "seguro"
   (si el resultado da un replacement character, devolvé el original
   sin tocar).
4. **IDs por índice de array, no por id.** Ya resuelto en todo el código
   migrado, pero si tocás algo en `legacy.js` que todavía usa índices
   de array para referenciar registros, es una fuente de bugs conocida
   (se rompe con filtros/reordenamientos). Preferí `id`/`id_local`.

## Patrón de importadores (CSV → Supabase)

Todos los importadores de este proyecto (Candidatos histórico, Legajos,
Servicios→Supervisor, Comercial) siguen el mismo esqueleto — si tenés
que construir uno nuevo, cloná este patrón en vez de inventar uno:

1. Parser CSV propio sin librerías externas (`xlsx`/SheetJS tiene 2
   vulnerabilidades altas sin parche — nunca usarlo para LEER un
   archivo subido por el usuario; sí se puede usar para GENERAR una
   plantilla de descarga, ese código no toca el parser vulnerable).
2. Detectar delimitador (`,` vs `;`) contando ocurrencias en la
   cabecera — Excel con configuración regional argentina exporta con
   `;`.
3. Preview con validación ANTES de confirmar — mostrar qué se va a
   crear, qué se va a actualizar, y qué queda afuera (y por qué),
   nunca confirmar a ciegas.
4. Reentrancia: guard contra doble click en el botón de confirmar
   durante un import largo (bug real encontrado: sin esto, un import
   lento con doble click generaba escrituras duplicadas en paralelo).
5. Progreso visible en el botón ("Importando 42/166…") durante imports
   largos.
6. Dedup de código repetido DENTRO del mismo archivo: gana la ÚLTIMA
   fila (mismo criterio que "última fila por persona" del importador de
   Legajos) — mostrado en amarillo como aviso, no como error bloqueante.
7. En reimportaciones (mismo archivo/actualización mensual): actualizar
   SOLO los campos que vienen de la fuente externa, nunca pisar campos
   que un humano pudo haber cargado a mano en la app desde la última
   importación (estado, notas, comisiones, etc.) — ver
   `src/modules/comercial_importador/comercial_importador.js` como
   referencia completa de este criterio.

## Convenciones de verificación antes de cerrar un cambio

- `node --check archivo.js` después de cualquier edit — árbitro
  objetivo de sintaxis, no resuelve imports pero valida sintaxis.
- `npx --no-install vite build` antes de dar un cambio multi-archivo
  por terminado — corre más rápido que levantar el dev server y
  detecta errores de resolución de imports en todo el árbol.
- Si el cambio toca Supabase: verificar el estado real de la base con
  una query directa (pooler, ver más abajo) antes Y después de un
  cambio consecuente — no asumir que "debería haber funcionado".

## Conexión a Supabase (para verificación/scripts puntuales)

- Usar el **pooler** (IPv4): `aws-1-us-east-2.pooler.supabase.com:6543`
  — la conexión directa (`:5432`) es IPv6-only y puede no resolver
  según el entorno de red.
- La contraseña de la base **no se persiste en ningún archivo del
  repo** — Fede la pasa cuando hace falta. Nunca la commitees, nunca la
  dejes en un script que quede en el repo (usar un archivo temporal
  fuera del control de versiones y borrarlo apenas termina el uso).
- Patrón probado: script Node puntual con el paquete `pg` (ya está en
  `node_modules` porque `@supabase/supabase-js` lo trae transitivo),
  ejecutado desde la raíz del repo para que resuelva el import,
  borrado apenas termina.
- Las migraciones son archivos `sql/vNNN_*.sql` secuenciales,
  `BEGIN;`/`COMMIT;`, siempre aditivas (nunca editar un archivo `vNNN`
  ya aplicado — si hace falta corregir algo, es un `vNNN+1` nuevo).

## Convenciones de frontend

- **Usar `addEventListener` para elementos dinámicos:** Para botones u otros elementos interactivos creados dinámicamente en JavaScript, siempre use `addEventListener` para adjuntar controladores de eventos en lugar de establecer el atributo `onclick`. Esto evita posibles problemas de alcance con los módulos de ES y es una práctica más sólida y moderna para el manejo de eventos.
  - **Mal:** `btn.setAttribute('onclick', 'miFuncion()');`
  - **Bien:** `btn.addEventListener('click', miFuncion);`

## Deploy

- `npx --no-install vercel deploy --prod --token "$VERCEL_TOKEN" --yes`
  — el token lo provee Fede en la sesión, no persiste entre sesiones.
- El auto-deploy de Vercel por push a `main` **no es confiable en este
  proyecto** — siempre forzar el deploy manual después de pushear.

## Comunicación con Fede

- Español, directo, sin rodeos.
- Después de cada arreglo: qué se rompió, por qué, qué se cambió, y
  **pasos concretos de qué probar en el navegador** (pantalla exacta,
  botón exacto, resultado esperado).
- Fede reporta bugs de forma muy terse e informal (typos, mensajes
  cortados) — si un mensaje es ambiguo, pedí que lo complete en vez de
  adivinar la intención completa.
- Si algo que "debería funcionar" no funciona, no repitas la misma
  explicación — es señal de que el diagnóstico anterior estaba
  incompleto. Volvé a mirar el código real, no confíes en la hipótesis
  previa (ver el caso del importador Comercial: dos rondas de "mismo
  error" antes de encontrar la causa real de `clienteId`).
