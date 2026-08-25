# MÓDULO PEDIDO DE PRODUCTOS — Especificación completa v3

**Sesión:** Lautaro + Claude · 15/08/2026
**Para:** Fede

> ⚠️ **REEMPLAZA a v1 y v2.**
>
> **Acompañan:**
> - `mockup_pedido_productos.html` — mockup ÚNICO del módulo, todos los tabs navegables
> - `CATALOGO_PRODUCTOS_para_Fede.xlsx`
>
> **Módulos conectados con documento propio:** PROVEEDORES y STOCK.
>
> **Datos reales analizados:** listas y compras THAMES (ago-2026) y NIMI PROFESIONAL (jun/ago-2026); remitos "Consignaciones" de Mónica (4654/4719).

---

## 0. Estructura del módulo (FINAL)

**Siete tabs**, todos con **SELECTOR DE MES** (períodos cerrados = solo lectura):

| # | Tab | Subtabs |
|---|---|---|
| 1 | **CATÁLOGO** | — |
| 2 | **PEDIDOS POR SERVICIO** | — |
| 3 | **BANDEJA DEL AUDITOR** | *(con contador en la pestaña)* |
| 4 | **COMPRAS** | Comparador de precios · Sugerencias en la compra · Simulación mensual · Órdenes y presupuestos |
| 5 | **HOJA DE RECORRIDO** | — |
| 6 | **ENTREGAS** | — |
| 7 | **AUDITORÍA** | — |

### Conexiones
- Módulo **PROVEEDORES** (maestro `PROV-xxx`)
- Módulo **STOCK** (toda entrada/salida de mercadería)
- **MAESTRO DE SERVICIOS** de Comercial (dirección, localidad y zona de reparto)

---

## 1. Regla de precios y tope

### Costo y recargo
- **COSTO** = precio de lista del PROVEEDOR (sin recargo). Es lo que se paga.
- **RECARGO GENERAL** = parametrizable (arranca **30%** — es lo que hoy aplica Richard a mano en su Excel).
- **PRECIO VENTA** = `costo × (1 + recargo aplicable)`

### Cascada de recargos
```
GENERAL → override por PRODUCTO → override por CLIENTE → override por SERVICIO
```

**Precedencia:** `SERVICIO > CLIENTE > PRODUCTO > GENERAL`
*(lo específico del acuerdo comercial manda)*

Con **vigencias** ("rige desde", meses pasados congelados) y auditoría. Edita **FINANZAS**.

> Mismo patrón que la cascada del módulo Supervisión.

### Visibilidad
- **Pantallas internas** (entrega, facturación): se muestra el origen del recargo aplicado con un chip `GENERAL` / `PRODUCTO` / `CLIENTE` / `SERVICIO`
- **REMITO que viaja al cliente:** ⚠️ **NUNCA** muestra recargos ni porcentajes — solo código, descripción, cantidad, precio venta e importe

### Tope
`TOPE del pedido = % de la última facturación del servicio`

Controlado **SIEMPRE contra COSTO proveedor**. El % (hoy **6%**) es parametrizable en CONFIGURACIÓN con vigencias: lo pasado queda congelado con el % que regía; el cambio aplica hacia futuro. General + override por servicio.

### Alcance
El recargo solo juega en servicios **PAGAN** (facturación). En **NO PAGAN** no hay venta de productos.

---

## 2. Tab CATÁLOGO

### Triple código
| Código | Descripción |
|---|---|
| **CÓDIGO INTERNO** | Correlativo, identificador real del sistema |
| **CÓD. PROVEEDOR** | El del archivo de cada proveedor (Thames: `QUITAC303025L00`, Nimi: `02-037/DV-R02153`) |
| **CÓD. MÓNICA** | Referencia de transición del sistema externo de Logística |

### Proveedor y marca
Cada producto pertenece a **UN** proveedor (campo `PROV-xxx` del maestro de Proveedores) y lleva la **MARCA** (el archivo Nimi la trae: DV=Diversey, SCJ, 3M, ITA, POL...).

### Import — flujo
1. **Elegir proveedor** (del padrón, rubro PRODUCTOS)
2. **Subir el archivo**
3. **Vista previa**
4. **Confirmar**

### Import — aislamiento
> 🔑 La clave de matching es **PROVEEDOR + CÓD. PROVEEDOR**.

Un import de Thames solo mira productos Thames; **jamás pisa los de Nimi** aunque un código coincida.

Productos sin código (Thames trae **45**) → matching asistido por descripción con revisión manual.

### Import — plantilla por proveedor
Cada proveedor manda su Excel con SU formato:

| Proveedor | Fila de inicio | Columnas |
|---|---|---|
| **Thames** | 5 | CÓDIGO / DESCRIPCIÓN / ADICIONAL / PRECIO |
| **Nimi** | 4 | Código / Descripción / Marca / Precio |

La primera vez se mapean columnas y fila de inicio → queda guardado como **PLANTILLA DE IMPORT** del proveedor y los meses siguientes entra solo. Si cambia el formato, se remapea.

### Import — vista previa
- **Costos actualizados** (antes → después, Δ%, nueva vigencia)
- **Productos nuevos** (alta con código interno)
- **No vinieron** → `POSIBLE DISCONTINUADO` — **nunca borrar**
- **Sin código** → revisión

Todo import queda en **Auditoría** con archivo origen; los costos anteriores quedan como vigencias.

### Editar
`nombre · tipo de uso · proveedor · costo (nueva vigencia) · recargo override`

**Tipos de uso** (parametrizables): `NORMAL` / `CON AUTORIZACIÓN` / `TRATAMIENTO PISO` / `APERTURA SERVICIO`

---

## 3. Comparador de presupuestos *(subtabs de COMPRAS)*

### Grupos de equivalencia
Logística vincula productos "iguales" de distintos proveedores (grupo `EQ-xxx`). Armado **manual** con candidatos sugeridos por similitud de nombre.

Cada miembro lleva **FACTOR DE CONVERSIÓN** a la UNIDAD COMÚN del grupo (1 pack = 50 bolsas; 1 bidón = 5 L).

> La comparación es **SIEMPRE en $ por unidad común**.

**Casos reales:**
| Producto | Thames | Nimi | Resultado |
|---|---|---|---|
| Bolsa 60×90 negra | $63,83/un | $9.244,37 el pack de 50 = $184,89/un | Thames **65% más barato** |
| Detergente | Bio-Det $1.468/L | Drax $3.136/L | — |

### Vista comparador
Tabla por grupo con un proveedor por fila: precio lista, factor, $ por unidad común, chip `MÁS BARATO` y **evolución** (de las vigencias de los imports: quién viene aumentando más).

### Sugerencias en la compra
Si una línea del consolidado tiene opción más barata en otro proveedor, el sistema **SUGIERE** el cambio — ⚠️ **NUNCA automático**.

Logística decide y queda registrado; **"mantener" pide motivo** (calidad/mínimo/plazo — parametrizable).

Tocando la fila se abre el **DETALLE POR SERVICIO**: qué servicios lo pidieron, con su supervisor, y se decide cambiar/mantener **servicio por servicio** o cambio completo → puede quedar **SUSTITUCIÓN PARCIAL** (parte de la cantidad a cada proveedor).

### Sustitución por equivalente
- La línea del pedido queda vinculada al **producto realmente comprado**; entrega y remito salen con el producto real
- **"REPETIR MES ANTERIOR"** le carga al supervisor el producto que **realmente recibió** (cada servicio repite su realidad)
- El detector FUERA DE ESTÁNDAR trata a los equivalentes como **el mismo producto** (no dispara "primer pedido")

### Simulación mensual
Valúa la compra completa del mes **como está** vs **optimizada por grupo**; reporte anual de ahorro `TOMADO` vs `NO TOMADO` (con motivos) — *el número para el consejo*.

---

## 4. Tab PEDIDOS POR SERVICIO

El supervisor ve **SUS SERVICIOS EN FILAS**:
`servicio · tope del mes ($, a costo) · pedido a costo · barra de consumo · estado`

**Arriba, 4 indicadores con color:**
`ELEVADOS` (verde) · `BORRADORES` (azul) · `SIN INICIAR` (gris) · `OBSERVADOS` (naranja)

### Carga
Click en la fila → ventana de catálogo del servicio: productos con proveedor y tipo de uso, cantidades, y la **BARRA DEL TOPE LLENÁNDOSE EN VIVO** con semáforo:

| Color | Significado |
|---|---|
| 🟢 Verde | Normal |
| 🟡 Amarillo | Cerca del tope, o con producto CON AUTORIZACIÓN |
| 🔴 Rojo | Excede |

Botón **"REPETIR MES ANTERIOR"**.

### Estados
```
SIN INICIAR → BORRADOR (re-editable) → ELEVADO → OBSERVADO POR AUDITOR
```

**ELEVADO** es reversible mientras la ventana esté abierta y el auditor no lo haya tomado.

### Ventana y cierre
Ventana mensual parametrizable, recordatorio **24 hs antes**.

> Al cierre, los borradores NO elevados **SE ELEVAN AUTOMÁTICAMENTE** tal como estén, con notificación al supervisor.

### Detección FUERA DE ESTÁNDAR
El sistema compara el pedido contra el **ESTÁNDAR del servicio** (historial de pedidos + perfil definido al alta del servicio/tipo de servicio).

**Tres reglas**, umbrales parametrizables en Configuración:

| # | Regla | Detecta |
|---|---|---|
| a | **PRODUCTO FUERA DE PERFIL** | Nunca lo pidió / no corresponde al tipo |
| b | **CANTIDAD ANÓMALA** | Muy sobre su promedio |
| c | **SALTO DE CONSUMO** | Total muy sobre su promedio, **aunque no supere el tope** |

Al elevar con desvíos, el supervisor ve el aviso con el detalle y **debe JUSTIFICAR**: motivo de lista parametrizable + texto libre. La justificación viaja con el pedido a la bandeja (motivo `FUERA DE ESTÁNDAR`).

> Logística ve este tab como **panel de seguimiento** (quién cargó / quién falta, por supervisor).

---

## 5. Tab BANDEJA DEL AUDITOR

Función dentro de Logística. **Caen SOLO:**

`EXCEDE TOPE` · `CON AUTORIZACIÓN` · `FUERA DE VENTANA` · `FUERA DE ESTÁNDAR`
*(con su detalle y justificación del supervisor)*

El resto pasa **directo a Compras**. Contador de pendientes en la pestaña.

### Revisión
Tocando la fila, el auditor abre **LA MISMA VENTANA del supervisor en modo auditor**:
- Columna **"pedido del supervisor"** — fija
- Columna **"propuesta del auditor"** — editable
- **DIFF marcado por línea** (12 → 6) y el tope recalculando en vivo
- Motivo (parametrizable) + texto libre

### Acuerdo — camino normal
**"DEVOLVER CON PROPUESTA"** → al supervisor le llega `OBSERVADO` con el diff línea por línea. Puede:
- **ACEPTAR PROPUESTA** → un click → aprobado directo, no vuelve a la bandeja
- **Modificar y re-elevar** → vuelve a la bandeja para acordar

### Atajo
**"APROBAR CON AJUSTE DIRECTO"** → sigue con el recorte y el supervisor queda notificado.

Disponibilidad parametrizable en Configuración: `siempre` / `solo cerca del cierre` / `nunca`.

> La fecha de consolidación es el límite: ahí la última palabra es del auditor.

---

## 6. Tab COMPRAS

### Propuesta de orden
La **ORDEN PROPUESTA** la arma el sistema:

```
consolidado de pedidos aprobados
  NETEADO contra stock (pedido − existencias)
+ líneas de REFUERZO DE STOCK sugeridas
  (productos bajo mínimo, hasta nivel objetivo)
```

Los mínimos y niveles objetivo se definen en Configuración *(ver documento STOCK)*.

Logística decide **línea por línea**: acepta / edita / quita.

### Solicitud de presupuesto
Etapa **opcional** antes de la orden firme.

- La solicitud va **SIN PRECIOS** (que el proveedor tire su mejor número)
- **NUNCA** incluye información de otros proveedores
- **ALCANCE** seleccionable con checkbox por línea: orden completa (default) / solo líneas sustituidas por el comparador / selección manual

> Si se cotizan las sustituidas y el ahorro se achica, el comparador recalcula y pregunta si se mantiene el cambio.

### Proveedor nuevo
Botón **"+ PRESUPUESTAR A UN PROVEEDOR NUEVO (fuera de cartera)"**: alta rápida (razón social + contacto) que lo crea en el padrón de Proveedores en estado `EN EVALUACIÓN`.

Si cotiza bien y se le compra, se completa la ficha y pasa a `ACTIVO`.

> El padrón funciona también como **cartera de potenciales**.

### Fichas de solicitud
Cada solicitud es una **FICHA estilo CRM comercial**:

```
ARMADA → ENVIADA → COTIZACIÓN RECIBIDA → ANALIZADA → ORDEN FIRME
```

Con seguimiento cronológico con usuario, contacto del proveedor (del padrón), notas y recordatorios automáticos de respuesta.

**Historial lista-vs-cotizado por proveedor** — *quién afloja cuando compite*.

### Cotización
Se carga a mano o importando con la plantilla del proveedor. El sistema compara línea por línea contra la lista vigente (Δ%).

**Decisión:**
- **CONVERTIR EN ORDEN FIRME** a precios cotizados → quedan como vigencia `COTIZACIÓN PUNTUAL`, **no pisan la lista**
- **Desestimar** → comprar a lista

### Orden de compra firme
**DOS CAMINOS:**
1. **Directa** — "Enviar orden firme" = comprar el pedido del mes a precios de LISTA vigente, sin presupuestar
2. **Vía cotización** — a precios COTIZADOS

Por proveedor, a costo, con **OBSERVACIONES POR LÍNEA**.
*(Caso real: "varias fragancias, que no sea papaya ni canela ni coco")*

Exportable en el formato del archivo de compra actual de Richard. La orden queda `PENDIENTE` esperando mercadería y factura.

---

## 7. Recepción y match de factura (3 patas)

### Recepción
Cuando llega la mercadería, Logística registra **QUÉ ENTRÓ** contra la orden (puede ser parcial — la orden muestra avance y backorder).

> Todo lo recibido **ENTRA AL STOCK valorizado a lo pagado**.

### Factura
La factura del proveedor **SE SUBE EN ESTE MÓDULO**, sobre la orden pendiente.

> La controla quien conoce la orden y recibió la mercadería — mismo principio que Máquinas: **Logística controla, Finanzas paga**.

El sistema matchea solo: `ORDEN vs RECIBIDO vs FACTURADO`, línea por línea.

### Resultados
| Resultado | Qué significa |
|---|---|
| **MATCH OK** | Pasa automático |
| **OBSERVADA** | Facturó de más, precio distinto al cotizado, o algo que no llegó → se reclama la diferencia, registrado |
| **PARCIAL** | La orden sigue abierta |

> **Caso real que esto atrapa:** las compras a Nimi valuadas con lista de mayo — la factura llega **+10,9% arriba** y hoy nadie lo ve. Acá salta `OBSERVADA` al instante con la diferencia por línea.

### A pago
Con el **MATCH OK**, la factura viaja al circuito de Finanzas: imputación a la cta cte del proveedor (subcuenta `PROV-xxx` del plan de cuentas cuando esté el módulo contable) y pago.

> ⚠️ **Finanzas nunca paga una factura sin match de Logística.**

Una sola carga: el asiento contable se generará automático al confirmar el match.

---

## 8. Tab HOJA DE RECORRIDO

Logística proyecta el **recorrido del mes**: SALIDAS de reparto por zona, con **FECHA LÍMITE** de entrega por servicio. El tab Entregas hereda estos parámetros.

### Nueva salida
`fecha de salida · zona/recorrido (parametrizable) · responsable del reparto · límite de entrega default · recordatorio (N días antes, parametrizable)`

El sistema **SUGIERE** los servicios de esa zona con pedido aprobado del período, mostrando el estado de armado de cada uno. Logística:
- Tilda cuáles entran
- Define el **ORDEN DE VISITA** (1, 2, 3...)
- Puede pisar el límite por servicio
- Carga observaciones *("entregar antes de las 10 hs")*
- Puede sumar un servicio de otra zona si queda de paso

### Plantilla y repetición
El recorrido del mes se guarda como **PLANTILLA**.

Botón **"REPETIR RECORRIDO DEL MES ANTERIOR"**: copia todas las salidas con las fechas corridas al mes actual — Logística ajusta y confirma.

### Riesgo
Un pedido con backorder o armado incompleto con el límite encima queda **EN RIESGO ⚠**.

Logística decide: entrega parcial · reprogramar a otra salida · esperar la mercadería. Recordatorios automáticos antes de cada salida.

### Origen de las zonas
> ⚠️ Las direcciones **NO se cargan acá**: viven en el **MAESTRO DE SERVICIOS** del módulo COMERCIAL — cada alta de servicio ya carga DIRECCIÓN y LOCALIDAD (CABA / Prov. de Bs. As.).

**Agregar ahí el campo ZONA DE REPARTO** (parametrizable): la hoja de recorrido lo **LEE** de Comercial, no duplica datos.

---

## 9. Tab ENTREGAS

### Inicio
Arranca con la **RECEPCIÓN** (no con la orden firme). El sistema cruza lo recibido contra los pedidos aprobados y marca qué servicios se pueden **ARMAR COMPLETOS** y cuáles quedan cortos por backorder.

> Se arman igual los completos.

### Estados y checklist
```
PENDIENTE → EN ARMADO → ARMADO → EN REPARTO → ENTREGADO
```

- **EN ARMADO:** checklist producto por producto — se tilda lo que entra en la caja; **cada tilde es una SALIDA de stock**
- **ARMADO:** checklist completo → se **GENERA EL REMITO automáticamente**, reflejando exactamente lo que va en la caja. El backorder sale después con remito propio

### Remito
Formato **"Consignaciones" de Mónica** (numeración correlativa continuada, parametrizable):

`membrete · N° · fecha · presentado a/enviar a · cód. cliente · CUIT · términos · comprobante · líneas con código interno (+ ex-Mónica en transición) · descripción · cantidad · PRECIO VENTA · importe · total · firma`

> ⚠️ **SIN recargos visibles.** Se imprime **POR DUPLICADO** y viaja con el pedido.

### Confirmación de entrega
Al volver el reparto (o desde el celular en el momento):
- **QUIÉN RECIBIÓ** (nombre y aclaración)
- **FOTO DEL REMITO FIRMADO** adjunta

En servicios **PAGAN**, esa foto viaja a **FINANZAS**, que la **adjunta al mail** junto con la factura para el cliente.

**FIRMA REQUERIDA** parametrizable por servicio:
| Tipo | Quién firma | Para qué |
|---|---|---|
| **CLIENTE** | Default en PAGAN | El remito firmado respalda la factura |
| **PERSONAL PROPIO** | NO PAGAN | Constancia interna |

> Recién con **ENTREGADO** impacta el costo al centro de costos del servicio (a PPP del stock).

### Límites a la vista
Columna **"ENTREGA LÍMITE"** heredada de la Hoja de recorrido:

`ENTREGADO ✔` / `HOY` / `FALTAN N DÍAS` / `EN RIESGO ⚠` *(backorder o armado incompleto con el límite encima)*

Con la zona y fecha de cada servicio.

### Destino
```
PAGAN    → remito firmado a FINANZAS → factura a PRECIO VENTA
           + envío del remito al cliente → cta cte del cliente
NO PAGAN → constancia interna → costo al económico del servicio
```

---

## 10. Roles

| Rol | Responsabilidades |
|---|---|
| **SUPERVISOR** | Carga pedidos, justifica desvíos, acepta propuestas del auditor |
| **AUDITOR** *(Logística)* | Bandeja propia: revisa en la ventana con diff, devuelve con propuesta o aprueba con ajuste (según Config) |
| **LOGÍSTICA** | Catálogo e imports, comparador y equivalencias, propuesta de orden, presupuestos, recepción, factura y match, armado y entregas |
| **FINANZAS** | Cascada de recargos y overrides, tope (% en Config), factura PAGAN a precio venta, paga facturas con match OK |

---

## 11. CONFIGURACIÓN — todo lo parametrizable, en un solo lugar

- % del **tope** (con vigencias — pasado congelado)
- **Recargo** general y overrides
- **Fechas de ventana** y recordatorios
- **Umbrales de FUERA DE ESTÁNDAR**
- **Motivos** de justificación del supervisor
- **Motivos del auditor** y de "mantener" del comparador
- **"Aprobar con ajuste directo"**: siempre / cerca del cierre / nunca
- **Tipos de uso**
- **Firma requerida** por servicio
- **Numeración de remitos**
- **Alerta de lista de proveedor desactualizada** (N meses)
- **Zonas de reparto** y recordatorios de salida
- **Stock mínimo y nivel objetivo** por producto *(ver doc STOCK)*

---

## 12. Estadísticas y auditoría

> Todo con **timestamp y responsable**.

**Reportes:**
- Gasto por servicio vs tope (histórico, con el % vigente de cada período)
- Ganancia por productos (venta − costo)
- Ahorro del comparador (tomado / no tomado)
- Lista-vs-cotizado por proveedor
- Recortes del auditor
- Desvíos de estándar por servicio
- Facturas observadas y diferencias reclamadas
- Excepciones fuera de ventana
- Productos más pedidos

---

## 13. Datos de arranque

### Catálogo
- `CATALOGO_PRODUCTOS_para_Fede.xlsx` — 113 productos con cód. Mónica
- Lista **THAMES** agosto — 443 productos, cód. proveedor + costo real
- Lista **NIMI** junio — 560 productos, multimarca *(importar con alerta de desactualizada)*
- **Recargo general inicial: 30%**

### Proveedores
`PROV-001` THAMES y `PROV-002` NIMI, del maestro de Proveedores *(doc propio)*.

### Remitos
Numeración continuando el correlativo de Mónica *(rango 4600-4700 en los analizados)*.

### Pendiente
> ⚠️ La hoja **"PEDIDO PAPEL"** de la planilla de área está **rota (#REF!)** — el circuito del papel se revisa aparte con Logística.
