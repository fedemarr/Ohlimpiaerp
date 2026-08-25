# Migración a Ohlimpia — CRM de negociación + Precios por mes

Extracción hecha el 18-ago-2026 desde **FinFlow** (sistema de Lince Seguridad,
carpeta `sistema juan`). Los archivos de código están copiados **tal cual**,
sin modificar una línea. Lo que sigue es lo que hace falta ADAPTAR antes de
que esto funcione dentro de Ohlimpia — nada de esto se tocó todavía.

## Qué hay en esta carpeta

```
pages/crm.html          → pantalla CRM de negociación
pages/precios.html      → pantalla Precios por mes
pages/login.html        → login (el guard de sesión redirige acá)
js/pages/crm.js         → lógica de crm.html
js/pages/precios.js     → lógica de precios.html
js/pages/login.js       → lógica de login.html
js/shared/*.js          → los 8 módulos que crm.js/precios.js importan
                           (alto-tabla, columnas-resize, confirmar,
                           etiquetas-color, facturacion-calc, filtro-popup,
                           nombres, ver-doc)
js/supabase-client.js   → crea el cliente Supabase + dispara el guard
js/auth-guard.js        → guard de sesión centralizado (protege ambas páginas)
js/config.js            → ⚠️ credenciales Supabase — VER ABAJO
css/styles.css          → hoja de estilos completa (ambas pantallas usan
                           clases genéricas de acá: .controls, .row, .funnel,
                           .filtro-popup, .cfm-*, chips, etc. — no se pudo
                           recortar sin romper el layout)
sql/base/schema.sql     → tablas base de las que dependen (clientes, sucursales)
sql/crm/*.sql           → 13 scripts: tabla de casos + funciones del CRM
sql/precios/*.sql       → 15 scripts: objetivo_precios, paritarias, escalas,
                           grupos, notas, snapshots, auditoría
docs/Diseno_CRM_Negociacion.md
docs/Diseno_Precios_LIGE.md
                         → los documentos de diseño originales, para entender
                           el porqué de cada decisión antes de tocar nada
```

No se copió nada del resto de FinFlow (económico, financiero, cobranzas,
dotación, etc.) — solo lo que estas dos pantallas tocan.

## Lo que hay que cambiar SÍ o SÍ antes de conectar esto a Ohlimpia

### 1. `js/config.js` tiene las credenciales REALES de producción de Lince

```js
export const SUPABASE_URL = "https://fazedtpjnarhadpqjbag.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_...";
```

Es el proyecto Supabase donde Comercial de Lince carga datos todos los días.
**No hay que apuntar Ohlimpia ahí.** Antes de abrir estas pantallas una sola
vez, reemplazar por la URL/key del proyecto Supabase propio de Ohlimpia (o
por las variables de entorno que use ese sistema).

### 2. La base de datos no viaja con el código — hay que recrearla

`crm.js` y `precios.js` no tienen lógica de negocio "enterrada" en el
JavaScript: leen y escriben directo contra tablas y funciones de Postgres
(`casos_negociacion`, `objetivo_precios`, `paritarias`, `escalas_aumento_*`,
`grupos_clientes`, funciones `SECURITY DEFINER` para cambiar estado, generar
casos, etc.). Sin esas tablas en el proyecto de Ohlimpia, las pantallas
cargan pero no muestran ni guardan nada.

Dejé en `sql/` los scripts de migración que armaron ese esquema en FinFlow,
ordenados en `base/`, `crm/` y `precios/` (van numerados — correrlos en ese
orden). **Ojo con esto**, es una regla que el propio proyecto FinFlow se
puso por experiencia (`CLAUDE.md`):

> Los scripts `.sql` del repo son la foto del día que se corrieron. Si algo
> se corrigió después a mano en el editor de Supabase, el archivo puede no
> reflejar el estado real de la base.

O sea: antes de recrear el esquema en Ohlimpia a partir de estos scripts,
lo más seguro es pedir un export del esquema real (`pg_dump --schema-only`
o el propio dashboard de Supabase → Database → schema) del proyecto de Lince,
y usar estos `.sql` como referencia del *porqué* de cada tabla, no como
fuente única de verdad del *qué* hay hoy.

Además hay funciones `SECURITY DEFINER` (saltean RLS) en varios de estos
scripts. Al recrearlas en Ohlimpia, revisar permisos igual que hace FinFlow:
revocar `EXECUTE` a `public`/`anon` y otorgar solo al rol que corresponda.

### 3. Storage: el bucket `finflow-docs` es privado y específico de Lince

`js/shared/ver-doc.js` abre archivos (notas de aumento, PDFs) desde un bucket
llamado `finflow-docs` con URL firmada de 60 segundos. Ohlimpia va a
necesitar su propio bucket privado — crearlo y cambiar el nombre en la línea
23 de `ver-doc.js`.

### 4. Enlaces que quedaron rotos a propósito

`precios.html` linkea a `inicio.html`, `relaciones.html`, `horas.html`,
`caja.html`, `economico.html` (nav superior) y `crm.html` linkea a
`inicio.html`, `clientes-abm.html`, `configuracion.html`. Ninguna de esas
pantallas se copió — no son parte de lo pedido. El nav queda con links que
apuntan a páginas que no existen en esta carpeta; hay que editarlo para que
apunte a las páginas reales de Ohlimpia (o quitar los links que no
correspondan).

`js/auth-guard.js` redirige a `login.html` si no hay sesión, y `login.js`
redirige a `inicio.html` tras loguearse. Si Ohlimpia ya tiene su propio login,
lo natural es usar ESE en vez del que se copió acá (se incluyó por si sirve
de referencia rápida de cómo FinFlow arma el guard con Supabase Auth).

### 5. Texto y contexto de negocio hardcodeado

Estas pantallas se escribieron para una empresa de seguridad privada:
"paritaria" (aumento salarial de convenio), "objetivo" (= sucursal del
cliente donde se prestan los guardias), etc. Si Ohlimpia es otro rubro, esos
términos y el flujo de "Cierre de aumentos por paritaria" en Precios pueden
no aplicar tal cual — conviene leer `docs/Diseno_CRM_Negociacion.md` y
`docs/Diseno_Precios_LIGE.md` primero para decidir qué se adapta y qué no,
en vez de traducir palabra por palabra.

## Cómo probarlo una vez adaptado config.js y el esquema

Es HTML + JS vanilla sin build: sirve la carpeta con cualquier servidor
estático (`npx serve`, Live Server de VSCode, etc.) y abre `pages/login.html`.
No hace falta `npm install` ni compilar nada.
