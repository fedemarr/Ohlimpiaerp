# Módulo: Pedido de Productos (Logística)

**Versión:** 1.0
**Fecha:** 11 de julio de 2026
**Autor del diseño:** Lautaro + Claude web
**Estado:** Diseño aprobado, pendiente de implementación
**Área:** Logística
**Ubicación esperada:** `docs/MODULO_PEDIDO_PRODUCTOS.md`

---

## 0. Cómo leer este documento

Este es el documento de diseño del módulo de pedido mensual de productos e insumos que cada supervisor completa para sus servicios. Sirve como fuente única para que Fede lo implemente y para que cualquiera entienda en 6 meses por qué está hecho así.

Está escrito con el criterio de la política A.1: se explica todo con peras y manzanas. Cuando una decisión responde a una política del proyecto, se cita entre paréntesis (ej: A.6).

Lo que **sí** cubre la versión 1: el circuito mensual completo, desde que Logística abre el período hasta que se entregan los productos.

Lo que **queda previsto pero no se construye** en la v1: pedidos extraordinarios (fuera del mes) y notificaciones al supervisor. El modelo de datos los deja preparados para no tener que rehacer nada cuando llegue su turno.

---

## 1. El problema que resuelve

Hoy el pedido de productos se hace en una planilla Excel con una hoja por servicio. Cada supervisor recibe su planilla, elige productos y cantidades para el mes, y la política de la empresa dice que el gasto en productos no debería superar el **6% de la facturación neta del servicio**.

La planilla Excel funciona pero arrastra los problemas típicos de una planilla:

1. **El listado de productos está repetido** en cada hoja de cada servicio. Si cambia un precio, hay que cambiarlo en decenas de lugares.
2. **Los costos unitarios están clavados** en la planilla, sin memoria de cuándo cambió cada precio.
3. **La facturación se copia a mano** arriba de cada hoja, tomada de otro lado.
4. **Códigos de producto inconsistentes** (aparecen con distinta cantidad de dígitos: `100006`, `1000006`, `10000088`), filas sueltas sin código, y notas metidas dentro de las celdas ("Talle M", "LIMON").
5. **No hay control de estados:** cualquiera que abra la planilla puede tocar cualquier cosa. No queda registro de quién pidió qué ni de qué recortó el auditor.

El módulo reemplaza la planilla por un sistema con base de datos real (Supabase), catálogo único, precios con historia y un circuito con estados y responsables claros.

---

## 2. El proceso real (tal como funciona hoy)

1. **Habilitación.** Antes de arrancar el mes, el Gerente de Logística habilita las planillas. Cada supervisor ve únicamente sus propios servicios.
2. **Carga del supervisor.** El supervisor recorre la lista de productos y carga las cantidades que necesita para el mes.
3. **Cierre.** El supervisor da por terminado su pedido. A partir de ahí no lo edita más.
4. **Auditoría interna.** Un auditor interno revisa cada pedido: controla el gasto contra el 6% y tiene la facultad de **reducir** cantidades si ve que se pidió de más. El auditor es quien **autoriza la compra**.
5. **Compra.** Con el pedido autorizado, Logística hace los pedidos a su proveedor.
6. **Entrega.** Se distribuyen los productos por cada servicio.

### 2.1. Sobre el 6%

El 6% **no es un límite duro**: es una referencia. El auditor lo mira a criterio y puede autorizar por encima cuando corresponde. Los casos típicos de exceso legítimo son:

- **Apertura de servicio:** cuando arranca un servicio nuevo se compran productos de más y elementos que duran varios meses en el lugar. Tiende a pasarse del 6% por naturaleza.
- **Tratamiento de piso:** algunos servicios requieren productos químicos caros para tratamiento de pisos. No son muchos, pero exceden el 6%.

Por eso el sistema **no bloquea** al supervisor ni al auditor cuando el pedido supera el tope. Lo que hace es **mostrar el semáforo con desglose por categoría**, para que el auditor vea de un vistazo cuánto del exceso corresponde a Apertura o Tratamiento de Piso (excesos esperables) y cuánto a consumo Normal o Con Autorización (que sí debería caber en el 6%). El sistema informa, la persona decide (A.1).

### 2.2. Las cuatro categorías (tipo de uso)

Los productos se clasifican en cuatro tipos de uso: **Apertura de Servicio**, **Tratamiento de Piso**, **Con Autorización** y **Normal**.

**Decisión de diseño importante:** el tipo de uso es un **atributo del producto**, no un circuito distinto. El supervisor pide igual para las cuatro categorías; no hay un flujo de aprobación especial para "Con Autorización". La categoría sirve únicamente para **agrupar y mostrar** el gasto (los subtotales por categoría del semáforo). Esto simplifica mucho el módulo: un solo flujo de pedido, cuatro etiquetas.

> Nota para revisar más adelante: si "Con Autorización" no cambia nada operativo, el nombre puede confundir a un supervisor nuevo que crea que necesita un permiso especial. Evaluar renombrarlo cuando se revise el catálogo. No es un tema de la v1.

---

## 3. El flujo de estados

El pedido de un servicio viaja por estos estados. Cada estado define **quién puede hacer qué**, y esto es lo que hace que el sistema sea serio y no una planilla compartida donde cualquiera pisa lo del otro.

```
Período abierto  →  Borrador  →  Cerrado por supervisor  →  En auditoría  →  Autorizado  →  En compra  →  Entregado
   (Logística)     (Supervisor)      (Supervisor)             (Auditor)       (Auditor)     (Logística)   (Logística)
```

| Estado | Quién manda | Qué se puede hacer |
|--------|-------------|--------------------|
| Período abierto | Gerente de Logística | Se habilita el mes. Nacen los pedidos en Borrador para cada servicio. |
| Borrador | Supervisor | Carga y edita cantidades. Solo el supervisor de ese servicio. |
| Cerrado por supervisor | Supervisor | El supervisor lo dio por terminado. Ya no puede editar. Pasa a la cola de auditoría. |
| En auditoría | Auditor | El auditor revisa y ajusta cantidades (reduce). El supervisor no puede tocar. |
| Autorizado | Auditor | El auditor habilita la compra. El pedido queda clavado. |
| En compra | Logística | Logística pide al proveedor. |
| Entregado | Logística | Productos distribuidos por servicio. Cierra el ciclo. |

### 3.1. El auditor ajusta, no devuelve (pero el supervisor se entera)

El auditor **no devuelve** el pedido al supervisor: ajusta las cantidades él mismo. Pero cuando recorta una cantidad, ese recorte queda registrado (quién, cuándo, de cuánto a cuánto — A.7) y debe poder **notificarse al supervisor**, para que aprenda a pedir mejor el mes siguiente y para que quede transparente que fue una decisión del auditor, no un error del sistema.

La **notificación en sí** (cómo se le avisa: dentro del sistema, por mail, por el bot de WhatsApp) es una funcionalidad transversal que toca varios módulos y **no se construye en la v1**. Lo que sí hace la v1 es **guardar el dato del recorte** de forma completa, de modo que el día que se prendan las notificaciones la información ya esté disponible. Cero retrabajo.

---

## 4. Modelo de datos

Cinco tablas en Supabase (A.5). Todas con soft delete y auditoría donde corresponda (A.7).

### 4.1. `periodo`

El "mes habilitado". Es el interruptor general: si el período está cerrado, ningún supervisor puede cargar.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid PK | Identidad interna. |
| `mes` | text/date | El mes del pedido (ej: 2026-06). |
| `estado` | text | `abierto` / `cerrado`. |
| `abierto_por` | uuid FK | Quién lo abrió (Gerente de Logística). |
| `abierto_en` | timestamp | Cuándo se abrió. |
| `cerrado_en` | timestamp | Cuándo se cerró (nullable). |

Un período contiene muchos pedidos (uno por servicio).

> Previsión a futuro (no v1): hoy la apertura es manual (aprieta el botón el Gerente de Logística). El campo `abierto_por` deja registrado quién fue. El día que se quiera automatizar la apertura por fecha (ej: "el día X de cada mes se abre solo"), se agrega esa lógica sin tocar la estructura.

### 4.2. `pedido`

La planilla de un servicio en un mes.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid PK | Identidad interna. |
| `periodo_id` | uuid FK | A qué período pertenece. |
| `servicio_id` | uuid FK | Qué servicio. (El código canónico del servicio es `DB.objetivos.codigo`.) |
| `facturacion_neta` | numeric | Facturación neta del servicio, **congelada** al crear el pedido. |
| `porcentaje_tope` | numeric | El % de tope, congelado (hoy 0.06). |
| `estado` | text | Estado del flujo (ver sección 3). |
| `tipo_pedido` | text | `mensual` / `extraordinario`. En la v1 siempre `mensual`. |
| Campos de auditoría | — | quién cerró, quién auditó, quién autorizó, con timestamps. |

**Por qué se congela la facturación y el porcentaje:** la facturación de un servicio la puede cambiar el módulo Comercial más adelante. Pero el pedido de junio tiene que recordar *con qué facturación se calculó su tope en junio*. Si no lo congeláramos, una corrección futura en Comercial recalcularía todos los topes viejos y se desarmaría la historia. El tope es una foto del momento (A.6, distinción entre corrección y vigencia aplicada al cruce entre módulos).

**De dónde sale la facturación:** del módulo Comercial/Ventas. Al abrir un pedido para un servicio, el sistema toma la facturación neta vigente de ese servicio y la clava aquí (dependencia entre módulos, A.9).

> Previsión: si al momento de implementar, Comercial todavía no tiene cargada la facturación por servicio, en la v1 el campo se carga a mano al abrir el pedido (editable). El día que Comercial la tenga, se engancha automático. El modelo funciona igual en ambos casos porque el dato vive en el pedido.

### 4.3. `producto`

El catálogo maestro. **Una sola vez** en todo el sistema (resuelve el problema #1 del Excel).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid PK | **Identidad interna de Ohlimpia.** No cambia nunca. |
| `codigo_monica` | text | Código del sistema externo Mónica. Referencia externa, no identidad. |
| `descripcion` | text | Nombre del producto. |
| `tipo_uso` | text | `apertura` / `tratamiento_piso` / `con_autorizacion` / `normal`. |
| `anulado` | boolean | Soft delete (A.7). Un producto que deja de comprarse se marca, no se borra. |

**Por qué `codigo_monica` no es la identidad:** el código viene de un sistema externo (Mónica). Los códigos externos son frágiles — pueden repetirse, cambiar de formato, o quedar obsoletos si algún día se migra de Mónica. En la propia planilla ya se ven inconsistencias (`100006`, `1000006`, `10000088`). Si atáramos la lógica del sistema al código de Mónica, heredaríamos su desorden. Por eso el producto se identifica internamente por su `id` (uuid, nuestro y estable), y el código de Mónica es solo la llave para cruzar con el sistema externo. Es el principio "ID-based, not index-based" aplicado a códigos externos.

> Previsión (no v1): si Mónica es el maestro de productos, en algún momento habrá que decidir si Ohlimpia importa el catálogo desde Mónica o lo mantiene a mano. Eso es una integración (misma naturaleza que la de Tango, B.4) y se evalúa cuando llegue. Hoy el catálogo se carga y punto.

### 4.4. `precio_producto`

El costo unitario de cada producto, **con vigencia temporal** (A.6). Esta es la tabla que el Excel no puede tener y la que convierte la planilla en un sistema económico serio.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid PK | Identidad interna. |
| `producto_id` | uuid FK | A qué producto pertenece. |
| `costo_unit` | numeric | El costo unitario. |
| `vigencia_desde` | date | Desde cuándo rige este precio. |
| `vigencia_hasta` | date | Hasta cuándo (nullable = vigente). |

**Cómo funciona:** el costo **no vive en el producto**, vive aquí con fecha. Cuando el proveedor aumenta un producto en agosto, no se pisa el precio viejo: se crea un registro nuevo con `vigencia_desde` = 1 de agosto y se cierra el anterior con `vigencia_hasta`. El pedido de julio sigue mostrando el precio de julio; el de agosto, el nuevo (A.6).

**Distinción corrección vs. vigencia (A.6):**
- **Cambio con vigencia** (aumento de precio): se crea un registro nuevo. No toca el pasado.
- **Corrección de error** (el precio estaba mal cargado): se modifica el registro existente y queda en la auditoría.

### 4.5. `pedido_item`

Cada renglón del pedido.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid PK | Identidad interna. |
| `pedido_id` | uuid FK | A qué pedido pertenece. |
| `producto_id` | uuid FK | Qué producto. |
| `cant_solicitada` | numeric | Cuánto pidió el supervisor. |
| `cant_autorizada` | numeric | Cuánto autorizó el auditor. |
| `costo_congelado` | numeric | El precio vigente copiado al cerrar el pedido. |
| Campos de auditoría | — | Quién ajustó la cantidad, cuándo, valor anterior. |

**Por qué `cant_solicitada` y `cant_autorizada` son dos campos separados:** cuando el auditor recorta, **no se pisa** lo que pidió el supervisor (A.7). Los dos números conviven. Esto es lo que después permite mostrarle al supervisor qué le recortaron, y lo que deja trazabilidad de las decisiones del auditor.

**Por qué `costo_congelado`:** cuando el pedido se cierra, se copia aquí el precio vigente en ese momento. Así el total del pedido queda clavado y no se mueve aunque el precio cambie después.

### 4.6. Regla de oro: el total no se guarda, se calcula

En el Excel hay columnas de TOTAL y subtotales por categoría. En el sistema, esos números **no se almacenan**: se calculan al vuelo sumando los ítems (`cantidad × costo_congelado`).

**Por qué:** un total guardado se puede desincronizar de sus partes — cambiás una cantidad y el total queda viejo. La única fuente de verdad son los ítems; el total es una consecuencia. Esto vale para el total del pedido y para los subtotales por categoría del semáforo.

---

## 5. Alcance de la versión 1

**Incluye:**
- Apertura y cierre de período por el Gerente de Logística.
- Carga del supervisor sobre sus propios servicios (uno o varios).
- Cierre del pedido por el supervisor.
- Auditoría: revisión, ajuste de cantidades, autorización.
- Semáforo del 6% con desglose por categoría (informativo, no bloqueante).
- Etapas de compra y entrega (marcar el pedido como en compra / entregado).
- Catálogo maestro de productos con código de Mónica.
- Precios con vigencia temporal.
- Auditoría y soft delete en todo (A.7).

**Queda previsto en el modelo pero NO se construye en la v1:**
- Pedidos extraordinarios (fuera del circuito mensual). Hoy se manejan informalmente por WhatsApp/mail. El campo `tipo_pedido` deja la puerta abierta.
- Notificación al supervisor de los recortes del auditor. El dato se guarda; el aviso se prende después.
- Apertura automática del período por fecha.
- Integración/importación del catálogo desde Mónica.
- Enganche automático de la facturación desde Comercial (si Comercial aún no la tiene, se carga a mano).

---

## 6. Preguntas abiertas para resolver antes o durante la implementación

1. **¿Comercial ya tiene la facturación neta por servicio?** Define si en la v1 la facturación se engancha automática o se carga a mano al abrir el pedido.
2. **Recorte del auditor: ¿pedimos motivo?** Está pendiente definir si, además de registrar el recorte, se le pide al auditor un comentario del porqué. (Barato de agregar, se puede decidir en la etapa de auditoría.)
3. **Carga inicial del catálogo:** ¿cómo se cargan por primera vez los ~120 productos y sus precios? (Se puede armar un script de importación desde la planilla actual, con limpieza previa de los códigos inconsistentes.)
4. **¿Renombrar "Con Autorización"?** Evaluar cuando se revise el catálogo, para no confundir a supervisores nuevos.

---

## 7. Plan de implementación sugerido (para coordinar con Fede)

Respetando el flujo del equipo (C.1) y "una cosa a la vez", el orden propuesto es:

1. **SQL de las 5 tablas** (script versionado, A.5). Empezar por `producto` y `precio_producto` (el catálogo), que son la base.
2. **Script de importación del catálogo** desde la planilla actual, con limpieza de códigos.
3. **Pantalla de catálogo** (ABM de productos y precios) para RRHH/Logística.
4. **Apertura de período** (Gerente de Logística).
5. **Pantalla del supervisor** (carga + semáforo del 6%).
6. **Pantalla del auditor** (revisión, ajuste, autorización).
7. **Etapas de compra y entrega.**

Cada paso se cierra con su propio commit (A.3) y su diagnóstico previo (A.4).

---

## Historial de versiones

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2026-07-11 | Diseño inicial del módulo. Flujo de estados, modelo de 5 tablas, alcance v1. |
