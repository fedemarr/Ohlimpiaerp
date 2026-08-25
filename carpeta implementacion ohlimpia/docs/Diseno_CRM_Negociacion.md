# Diseño — CRM de Negociación de Precios

**Proyecto:** CRM propio dentro de FinFlow. Arranca por la negociación de precios de
paritaria, con un núcleo pensado para servir después a cobranzas y a quejas/reclamos.
**Fecha:** Julio 2026 · **última actualización: 26 de julio de 2026**
**Estado:** **Parcialmente construido y publicado.** El modelo está aplicado en la base,
la generación de casos funciona y la pantalla de lista está andando. Faltan las acciones
sobre los casos y el caso individual.

Este documento dejó de ser solo la charla de diseño: además de las decisiones y su
porqué, registra qué está hecho. Las secciones que describen circuitos todavía no
construidos siguen siendo diseño, no descripción de lo que hay.

### Lo que está construido

**En la base**

| Script | Qué dejó |
|---|---|
| `abm_34_crm_casos` | El modelo: `crm_casos`, `crm_gestiones`, `crm_gestion_adjuntos` |
| `abm_37_crm_generar_casos_clientes` | RPC `crm_generar_casos` (paritaria + clientes). Reemplaza a `abm_36`, que **no se re-corre** |
| `abm_38_crm_acciones_bloque` | RPC `crm_sellar_precierre`, `crm_cambiar_estado`, `crm_asignar_responsable` |
| `abm_39_crm_proxima_accion` | Tabla `crm_acciones` (7 acciones provisorias, solo lectura desde la app) + `crm_casos.proxima_accion_id` y `.proxima_accion_detalle` |

**En la aplicación**

- **Generación de casos**, enganchada desde Precios al marcar las notas como enviadas,
  con botón de reparación para las que quedaron sin caso.
- **Pantalla de lista** (`pages/crm.html`): orden por próxima acción con los nulos al
  final, filtros por paritaria, buscador de cliente, chips de estado y responsable con
  contadores por faceta, embudos por columna, colores de responsable, columnas
  redimensionables que recuerdan su ancho, y limpiar filtros.

### Lo que falta

- **Acciones en bloque.** Los RPC ya están (`abm_38`), pero la pantalla todavía no los
  usa: el casillero de selección se dibuja **deshabilitado**. Es lo próximo.
- **El caso individual:** la ficha con la bitácora de gestiones. No existe.
- **Registrar gestiones** desde la pantalla. La tabla existe; la pantalla no.
- **La próxima acción en la pantalla.** El modelo está aplicado (`abm_39`), pero nada
  la pide ni la muestra todavía: por eso hoy **todas** las fechas de próxima acción
  siguen nulas. La lista de acciones es provisoria hasta el 27 de julio de 2026.
- **Vencidos** (sección 10): ni la fecha en rojo ni el chip. El casillero de la barra
  sigue deshabilitado. **No depende de `plazo_aceptacion_tacita`** — depende de la
  fecha tope que carga Comercial, que ya tiene dónde vivir.
- **Aceptación tácita:** sigue trabada, ésta sí, por `paritarias.plazo_aceptacion_tacita`,
  que no existe.
- **Aprobaciones, adjuntos** (la tabla existe desde `abm_34`, la pantalla no) **y la
  escritura sobre `objetivo_precios`** (sección 7): sin empezar.

---

## 1. Por qué un CRM propio

Odoo no cubre nada de esto. Hoy la negociación de precios existe solamente en la
cabeza de Comercial y en el correo: se manda la nota de aumento, y lo que el cliente
contesta no queda registrado en ningún lado. No hay forma de responder preguntas
básicas —qué clientes contestaron, cuáles están negociando, en qué quedó cada uno,
quién habló con quién y cuándo— sin preguntarle a una persona.

El CRM arranca por negociación porque es donde más duele, pero se diseña sabiendo
que después va a tener que sostener **cobranzas** y **quejas/reclamos**. Eso condiciona
el modelo desde el primer día.

---

## 2. La decisión de forma: nada de Kanban acá

El reflejo natural al decir "CRM" es dibujar un tablero Kanban con columnas por estado
y tarjetas que se arrastran. **Para negociación y cobranzas es la forma equivocada.**

- Negociación y cobranzas son procesos **masivos y recurrentes**. No son casos que
  llegan de a uno y se atienden de a uno: son cientos de clientes que entran todos
  juntos, al mismo tiempo, por el mismo disparador (se emitió la paritaria).
  Un tablero con 300 tarjetas no es una herramienta, es un problema.
- Quejas y reclamos **sí** encajan con Kanban: bajo volumen, llegada individual,
  atención caso por caso, y el valor está en no perder de vista ninguno.

**Lo que se reutiliza entre los tres procesos NO es la pantalla. Es el modelo de
abajo:** caso + estado + bitácora + próxima acción + responsable. Cada proceso pone
encima la pantalla que le sirve: lista masiva con acciones en bloque para negociación
y cobranzas, tablero para quejas.

Esta distinción es la decisión de diseño central del documento. Si se confunde el
modelo con la pantalla, se termina construyendo tres CRMs o uno inservible.

---

## 3. El volumen real, que es lo que define la ergonomía

Los números de una paritaria típica:

| | Clientes | Qué necesitan |
|---|---|---|
| Se les manda nota | ~300 | — |
| Contestan | ~100 | Registrar la respuesta |
| Negocian de verdad | ~20 | Gestión real, con historial |

Los que negocian son **mayormente consorcios**.

La lectura importante: **280 de los 300 casos no necesitan gestión, necesitan salir
rápido de la vista.** No son trabajo, son ruido que tapa el trabajo. Si la pantalla
obliga a abrir 300 fichas para despacharlas, el CRM se abandona en la segunda
paritaria.

**Consecuencia directa sobre la ergonomía:**

- La pantalla se optimiza para el **marcado en bloque desde la lista**: seleccionar
  muchos clientes y cambiarles el estado de una vez, sin abrir nada.
- Solo los ~20 que negocian se abren como **caso individual con historial**.
- La vista por defecto de Comercial es "lo que me falta trabajar", no "todo".

---

## 4. El modelo

### 4.1 CASO

Un caso por **cliente y por paritaria**.

**No por objetivo.** Se negocia con el cliente, no con cada sucursal: un consorcio con
tres objetivos discute una vez y el resultado aplica a los tres. Esta granularidad
coincide con la que ya tiene `notas_emitidas` (una fila por escala y cliente), que es
justamente el punto de partida.

**La paritaria es única por cliente:** un cliente no puede tener objetivos en dos
paritarias distintas al mismo tiempo. Por eso "cliente + paritaria" no parte a nadie
en dos, y la negociación puede venir en masa, por paritaria, sin casos ambiguos.

Un caso tiene:
- **Estado actual** (sección 5).
- **Responsable** — el `RESP. NEG.` que ya está construido y vive en el cliente. No se
  inventa un campo nuevo: se usa el que ya se cargó.
- **Fecha de próxima acción** — cuándo hay que volver sobre este caso. Es lo que
  permite que la pantalla ordene el trabajo por urgencia en vez de por orden
  alfabético.

### 4.2 GESTIÓN

Una gestión por **cada contacto** con el cliente. Es la bitácora del caso.

- Fecha.
- **Canal:** mail / celular / WhatsApp / personal / intermediario.
- Descripción de lo que pasó.
- **Adjuntos:** la propuesta formal, la nota enviada, una factura.

**La bitácora no se borra.** Una gestión registrada es un hecho que ocurrió; si se
cargó mal, se corrige agregando, no borrando. El valor del historial depende de que
sea confiable.

### 4.3 Las dos personas de cada gestión

En cada gestión hay que distinguir **dos personas distintas**:

1. **Quién negoció** — en clientes grandes, normalmente el **coordinador de cuenta**.
   Sale de `objetivo_comisionistas`.
2. **Quién cargó el registro** — Comercial. Rodrigo.

No son la misma persona y confundirlas rompe el historial: la conversación la tuvo el
coordinador, el registro lo hizo Comercial. Si solo se guarda uno de los dos, dentro
de seis meses no se sabe a quién preguntarle qué se habló.

---

## 5. Estados

```
pendiente de envío → enviada → sin respuesta → PRECERRADA → CERRADA
```

Más dos estados laterales:
- **en renegociación**
- **reclamo posterior** — revierte un precerrado.

### PRECERRADA

El cliente aceptó, **o venció el plazo de aceptación tácita**.

Es el estado que le importa a Comercial: al precerrar, el caso **sale de su lista de
trabajo**. Su tarea terminó. Lo que falta no depende de ellos.

### CERRADA

**Se confirma sola cuando el cliente PAGA una factura emitida con el precio nuevo.
Sin intervención de nadie.**

FinFlow ya tiene facturación y cobros, así que el dato existe adentro del sistema: no
hay que pedirle a nadie que lo marque. Un acuerdo no está realmente cerrado porque
alguien haya dicho que sí — está cerrado cuando el dinero nuevo entró.

### Aceptación tácita

- El **plazo es configurable por paritaria**.
- **El vencimiento del plazo NO cambia el estado solo.** La pantalla muestra los
  vencidos y Comercial los confirma **en bloque**.

Es deliberado, y es una decisión de responsabilidad, no de comodidad: **un cambio de
estado sin responsable es un problema si después se discute con el cliente.** Si el
sistema precierra solo y el cliente reclama, no hay a quién preguntarle qué se
evaluó. Con confirmación en bloque queda registrado **quién y cuándo**, y sigue
costando dos clics para 80 casos.

---

## 6. Aprobaciones

| Situación | Quién decide |
|---|---|
| Dentro del margen | Comercial define y cierra |
| Fuera del margen | Aprobación del **Consejo** — es excepción y se registra como tal |

**El coordinador de cuenta se INFORMA de toda negociación de sus clientes. Es aviso,
no aprobación.** Nunca van a decir que no; modelarlo como aprobación sería un trámite
vacío que traba el circuito y que la gente aprende a saltear. Se avisa y el circuito
sigue.

**El margen queda por definir.** Probablemente configurable por paritaria: lo
razonable en una paritaria del 8% no es lo mismo que en una del 25%.

---

## 7. El punto de conexión delicado

**La renegociación MODIFICA `objetivo_precios`.**

El CRM no es un módulo aislado que solo guarda conversaciones: cuando una negociación
termina en un precio distinto al de la nota, ese precio tiene que llegar al módulo de
precios, que es el que alimenta facturación y proyección. **Es la parte más sensible
del diseño** y el lugar donde un error no se queda adentro del CRM: se factura mal.

Todavía no se define cómo se hace esa escritura. Lo que sí queda dicho es que el
diseño tiene que tratarla como el punto crítico, con trazabilidad de qué negociación
originó qué cambio de precio.

---

## 8. Dos reportes que aparecen solos

### 8.1 El precerrado que nunca cierra

Del modelo se cae un reporte que hoy nadie puede pedir: **el precerrado que nunca
cierra.**

El cliente aceptó —o se dio por aceptado por plazo vencido— pero **sigue pagando el
precio viejo**.

- No es tarea de Comercial: su parte terminó al precerrar.
- No es una negociación abierta: no hay nada que negociar, ya está acordado.
- Es una **discrepancia entre lo acordado y lo cobrado**, y hoy es completamente
  invisible. Es plata que se pierde sin que nadie se entere.

Va en un reporte aparte, probablemente del circuito de cobranzas. Aparece gratis por
haber separado PRECERRADA de CERRADA y por atar el cierre al pago real.

### 8.2 El caso viejo que quedó abierto

Cuando arranca una paritaria nueva, puede haber casos de la anterior todavía abiertos.
La reacción natural sería arrastrarlos o cerrarlos forzados. **Las dos están mal**,
porque parten de una premisa falsa: que son trabajo pendiente.

En la práctica no queda trabajo pendiente. **Si el cliente sigue siendo cliente cuando
llega la paritaria siguiente, es porque el tema anterior se resolvió de algún modo:**
aceptó el precio, o se le hizo una rebaja. No hay forma de seguir facturándole seis
meses con una negociación realmente abierta.

Entonces un caso viejo todavía abierto **no es un caso pendiente: es un error de
registro.** Alguien no cargó el desenlace.

**La decisión:** no se arrastran ni se cierran forzados. Al arrancar una paritaria
nueva, la pantalla los **muestra como algo a revisar** —"estos 12 clientes quedaron sin
cerrar del semestre pasado"— y Comercial los despacha **en bloque**, indicando qué
pasó en cada uno.

Es la misma lógica que 8.1: **no obliga a un trámite, saca a la luz lo mal cargado.**
El sistema no inventa un desenlace ni le pide a nadie que complete un formulario por
obligación; muestra el hueco y deja que la persona que sabe lo tape en dos clics.

---

## 9. Punto de partida ya existente

`notas_emitidas` ya registra **qué nota se generó, a qué cliente y cuándo se envió**,
con una fila por (escala, cliente) — la misma granularidad que va a tener el caso.

**Falta el otro lado: qué contestó el cliente.** El CRM es, en lo esencial, la vuelta
de esa conversación.

---

## 10. La próxima acción: qué se espera y de quién depende

**La próxima acción no es "qué hacer". Es "qué se está esperando, y de quién depende".**

`Llamar` no dice nada: no explica a quién, ni para qué, ni qué destraba. Dentro de dos
semanas, quien lea ese caso —incluido el que lo escribió— no va a saber qué faltaba.

`Esperando respuesta del cliente` o `A resolver con el Consejo` dicen las dos cosas:
**qué falta** y **de quién depende que avance**.

La diferencia no es de redacción, es de qué se puede preguntar después. Con la segunda
forma, la pregunta *"¿cuántos casos están frenados esperando al Consejo?"* tiene
respuesta. Con la primera no existe: `Llamar` no se puede agrupar con nada.

### Tres campos, no uno

| Campo | Qué es | Para qué |
|---|---|---|
| **Qué acción** | De una lista predefinida | **El que da las estadísticas.** Es el único agrupable |
| **Fecha tope** | Cuándo vence | Ordena la agenda y alimenta los vencidos |
| **Detalle** | Texto libre, **opcional** | El caso puntual: a quién se llamó, qué dijo |

Separarlos es lo que hace que el primero sirva para contar. Si la acción fuera un solo
campo de texto libre, volveríamos a `Llamar`: cada caso escrito distinto y nada que
agrupar. El detalle sigue existiendo, pero al lado, sin contaminar lo que se cuenta.

El caso ya tiene `fecha_proxima_accion`. Los otros dos campos son nuevos.

### Lista inicial

**PROVISORIA.** La define Juan con Comercial el **lunes 27 de julio de 2026**:

- Esperando respuesta del cliente
- Enviar nueva propuesta al cliente
- A resolver con el Consejo
- A resolver con el Coordinador de Cuenta
- Reenviar la nota
- Esperando documentación del cliente
- Otro *(con descripción obligatoria)*

### Quién puede agregar acciones

**Tabla configurable, editable SOLO por Juan.**

**Cómo se sostiene hoy** (`abm_39`): la tabla `crm_acciones` le da a `authenticated`
**solo lectura**. Nadie puede agregar ni editar desde la aplicación, aunque mande el
pedido a mano: la base lo rechaza. El único que escribe es quien entra al editor de
Supabase. Ver *Decisiones pendientes*, punto 13.

El motivo es la estadística, no el control. Si cada uno agrega la suya sobre la marcha,
en un año hay tres variantes de "esperando al cliente" escritas distinto, y la pregunta
*"¿cuántos casos están frenados esperando al cliente?"* deja de tener una respuesta:
tiene tres, y ninguna completa. Una lista chica y cerrada vale más que una lista
completa y sucia.

**Es distinto de los ESTADOS, y conviene no confundirlos.** Los estados van fijos porque
**tienen lógica colgada**: precerrada saca el caso de la lista de Comercial, cerrada la
confirma el pago, la aceptación tácita depende del plazo. Agregar un estado es cambiar
el comportamiento del sistema. Las acciones **son etiquetas**: no disparan nada, solo
describen y agrupan. Por eso una lista se toca por configuración y la otra por código.

### Cuándo es obligatoria

Al **cambiar de estado**:

| Estado nuevo | ¿Se pide acción + fecha? |
|---|---|
| `en_renegociacion` | **Obligatoria** |
| `sin_respuesta` | **Obligatoria** |
| `reclamo_posterior` | **Obligatoria** |
| `precerrada` | No se pide |
| `cerrada` | No se pide |

El corte es si **el caso sigue vivo**. En los tres primeros sí: sin acción ni fecha, el
caso no le aparece a nadie en la agenda — queda vivo pero invisible, que es exactamente
como se pierde una negociación. En los dos últimos el caso terminó y no hay nada que
agendar.

### Vencidos: las dos señales

Un caso vencido es uno cuya **fecha tope ya pasó**. Se avisa en dos lugares, y hacen
falta los dos porque contestan preguntas distintas:

| Señal | Dónde | Qué contesta |
|---|---|---|
| **Fecha en rojo** | Columna *Próxima acción*, en la fila | *"¿Este caso está vencido?"* — mientras recorrés la lista |
| **Chip «Vencidos N»** | Barra de filtros | *"¿Cuántos hay?"* — y con un clic, *"mostrámelos"* |

La fecha en rojo sola no sirve para arrancar el día: habría que barrer la lista entera
para saber cuántos hay. El chip solo tampoco: una vez que estás mirando las filas,
necesitás distinguir de un vistazo cuál te apura sin volver al filtro.

**El chip reemplaza al casillero «Vencidos»** que hoy está deshabilitado en la barra.
Estaba esperando `paritarias.plazo_aceptacion_tacita`, que sigue sin existir — pero el
vencimiento de la **próxima acción** no depende de eso: depende de la fecha tope que
carga Comercial. Son dos vencimientos distintos y solo uno estaba bloqueado.

---

## 11. La descripción al cambiar de estado en bloque

**Es UNA SOLA para todo el grupo.**

Si se precerran 60 casos porque venció el plazo de aceptación tácita, el motivo es el
mismo para los 60. Pedir 60 descripciones no produce 60 explicaciones: produce **"ok"
escrito 60 veces**. Un campo obligatorio que nadie puede completar con sentido no
documenta nada — entrena a saltearlo.

Si después hace falta agregarle algo a un caso puntual, se hace **desde el caso
individual**, y esa observación **se suma**: no pisa la grupal. Quedan las dos, que es
lo correcto — el motivo del grupo explica por qué entró en la tanda, y la nota puntual
explica qué tuvo de particular ese caso.

**Esto ya está construido.** `crm_cambiar_estado` (`abm_38`) recibe una observación para
toda la selección y la **apila con fecha** sobre `crm_casos.observaciones` en vez de
reemplazar lo anterior. No hay que agregar nada en la base: falta solamente la pantalla
que la use.

---

## 12. Decisiones pendientes

Lo que quedó explícitamente sin definir en esta charla:

1. **El margen de aprobación de Comercial.** Cuánto es, y confirmar que va configurable
   por paritaria.
2. **Cómo escribe el CRM sobre `objetivo_precios`.** El punto más sensible: en qué
   momento, con qué trazabilidad, y qué pasa si la negociación cambia después de que
   ya se facturó.
3. **Cómo se modela la negociación FUERA DE TANDA.** A un cliente puntual se le puede
   negociar en cualquier momento, sin que haya paritaria de por medio. Si el caso es
   "por cliente y paritaria", esa negociación no tiene dónde vivir: ¿es un caso sin
   paritaria asociada, o un tipo de caso distinto? Afecta la forma del caso, así que
   conviene definirlo temprano.
4. **El plazo de aceptación tácita:** valor por defecto, y desde qué fecha se cuenta
   (fecha de la nota, fecha de envío, o fecha de recepción confirmada).
5. **Cómo se detecta el pago "con el precio nuevo"** para el cierre automático. Pago
   total, parcial, con qué tolerancia, y qué pasa si el cliente paga a cuenta.
6. **Reclamo posterior:** a qué estado vuelve el caso y si abre un caso nuevo o
   reabre el mismo.
7. **En renegociación:** si es un estado o un atributo del caso, y cómo convive con
   el resto de la secuencia.
8. **Notificación al coordinador de cuenta:** por qué medio y en qué momento del
   circuito.
9. **Permisos:** quién puede precerrar, quién puede editar la bitácora, quién ve los
   casos de otros responsables.
10. **Adjuntos:** dónde se guardan y con qué límite. FinFlow ya usa Storage, pero hay
    que definir el criterio.
11. **Qué se lleva el núcleo a cobranzas y quejas.** Está dicho que el modelo se
    comparte; falta definir si es la misma tabla con un discriminador o tablas
    hermanas con la misma forma.
12. **La lista definitiva de próximas acciones** (sección 10). La de arriba es
    provisoria; Juan la cierra con Comercial el lunes 27 de julio de 2026.
13. **Editar las acciones desde la aplicación.** Hoy `crm_acciones` es de solo lectura
    para todos y se carga desde el editor de Supabase (`abm_39`). Eso **cumple** la
    regla de "solo Juan", pero por falta de alternativa: en la base no hay forma de
    distinguir a Juan de Comercial — no existe tabla de perfiles y las políticas
    apuntan todas a `authenticated`. Cuando existan los perfiles diferenciados
    (punto 9), se agrega la política de escritura y la pantalla de configuración. La
    tabla no cambia.
