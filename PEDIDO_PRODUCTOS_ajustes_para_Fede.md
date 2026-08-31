# PEDIDO DE PRODUCTOS — Ajustes sobre lo construido + lo que falta

**Sesión Lautaro + Claude — 31/08/2026 · Para: Fede**
Acompaña a `mockup_pedido_productos_14.html` — todo lo que sigue está funcionando ahí para verlo en vivo (tabs, ventanas, semáforos, estados). El módulo que armaste está bien encaminado: esto son correcciones sobre lo que ya existe + las piezas que faltan.

---

## 0. La regla de fondo: COSTO ≠ RECARGO (cambio conceptual, atraviesa todo)

- **COSTO** = precio de lista del proveedor. Cambia SOLO por dos vías: ajuste manual por producto, o import de una lista nueva. **No existe "aumento general" de proveedor.**
- **RECARGO** = margen de LOGÍSTICA, y se define **POR SERVICIO** (no por producto): hay un recargo GENERAL (hoy 30%) y servicios con margen propio. Ver tab Recargos (punto 7).
- **PRECIO VENTA = costo × (1 + recargo del servicio)** — siempre calculado, nunca cargado a mano. El % jamás aparece en remito ni factura.
- El presupuesto del 6% se controla contra COSTO. La facturación al cliente va a PRECIO VENTA.
- Ventana de ajuste de costo: campos espejados **monto ↔ %** (cargás uno, el otro se calcula) + vigencia desde hoy. Está en el mockup ("Editar producto").

---

## 1. Ventana del pedido del servicio (la que abre el supervisor)

1. **Buscador en la cabecera de la tabla**: filtra en vivo por nombre o código. Al lado: filtro por tipo de uso y tilde **"solo lo cargado"** con contador ("8 de 1.061 productos"). La fila de encabezados + buscador queda **fija al scrollear** (el catálogo tiene 1.000+ productos).
2. **"Tope 6%" pasa a llamarse "Presupuesto del mes"**: `Presupuesto del mes: $ 2.042.880 (6% s/ últ. facturación)`. Renombrar en toda la pieza (ventana, tablas, bandeja).
3. **Columna "Mes anterior"** al lado de Cantidad: la cantidad pedida el mes pasado, en gris. Es la referencia para decidir.
4. **Botones del pie — hoy solo hay "Cerrar", tienen que ser tres:**
   - `↺ Repetir pedido del mes anterior` — carga las cantidades del mes pasado, el supervisor ajusta.
   - `💾 Guardar` — queda en BORRADOR, sigue después.
   - `✔ Confirmar pedido` — lo eleva, ya no se edita.
   - "Cerrar" deja de ser una acción: cerrar es solo la ✕ de la ventana.
5. **Semáforo en la cabecera** (cambia de color según lo cargado):
   - Verde: dentro del presupuesto.
   - Ámbar: cerca del presupuesto (>85%) o lleva productos CON AUTORIZACIÓN.
   - Rojo: **EXCEDE EL PRESUPUESTO — al confirmar pasa por el AUDITOR** (hoy la cabecera queda verde aunque estés al 33%).
   - El semáforo también anticipa el destino: "pasa directo a Compras" / "pasa por el AUDITOR" (ver regla del punto 5).

## 2. BUG: la acción no refresca la pantalla

Al confirmar (desde la tabla o desde adentro de la ventana), **el estado tiene que cambiar en el momento** — chip, botones, total — sin recargar la página. Hoy hay que hacer F5 para ver el cambio: confunde y el usuario aprieta dos veces.

## 3. Estados del pedido

- `Cerrado (en cola)` no le dice nada al supervisor. Los estados quedan:
  - **BORRADOR** (naranja)
  - **CONFIRMADO** (verde) — pasó directo a compras
  - **CONFIRMADO · EN REVISIÓN** (violeta) — lo va a mirar el auditor (excede / con autorización / servicio NO PAGAN)
  - **OBSERVADO POR AUDITOR** (naranja) — volvió con propuesta de corrección
- En la tabla "Mis pedidos": la fila que excede el presupuesto se pinta **roja** con chip EXCEDE (hoy Electromecánica al 33,4% no tiene ninguna marca).
- Columna nueva en la tabla de pedidos: **Cobro** (PAGAN / NO PAGAN) — viene del alta del servicio (Comercial), nunca se carga acá.

## 4. Tab Períodos

1. **Un solo período EN CARGA a la vez.** El siguiente se puede habilitar a futuro pero queda como `HABILITADO · abre el 01/10` y abre solo cuando cierra el actual. El supervisor nunca elige el mes (hoy hay dos abiertos: va a cargar en el mes equivocado).
2. **Cierre con fecha y hora, no manual a ojo**: cada período tiene su fecha/hora de cierre (ej. 20/09 18:00), recordatorio automático 24 hs antes a los que están en borrador o sin iniciar, y al cierre los **borradores se confirman automáticamente** tal como estén, con notificación.
3. El botón "Cerrar período" (cierre anticipado) pide confirmación mostrando: cuántos borradores va a confirmar y cuántos servicios quedaron sin iniciar. Agosto cerró 0/164 y nadie se enteró.
4. Columna "Cerrados por el supervisor" → **"Confirmados"**, y agregar el desglose por estado en la fila: `sin iniciar / borrador / confirmados` con filtro rápido — es lo que Logística mira todos los días de la ventana.
5. En el texto del tab: "tope del 6%" → "presupuesto del mes".

## 5. Bandeja del auditor (hoy tab "Auditoría")

1. **Renombrar el tab**: "Auditoría" en todo el sistema es el registro de acciones (fecha, usuario, qué hizo). Este tab es la **Bandeja del auditor** (o "Revisión de pedidos"). El tab Auditoría-registro va aparte (punto 8).
2. **Regla de qué cae a la bandeja** (definida con Lautaro):
   - **TODOS los pedidos de servicios que NO FACTURAN productos** (NO PAGAN) — son costo de la cooperativa, se revisan siempre, aun dentro del presupuesto.
   - De los servicios **PAGAN**, solo las excepciones: excede presupuesto · productos CON AUTORIZACIÓN · fuera de ventana · fuera de estándar.
   - **PAGAN dentro del presupuesto sin excepciones → pasa DIRECTO a Compras**, sin acción del auditor. Quedan visibles en una card "Pasaron directo a Compras" para control. (Hoy aparece todo con botón "Auditar": con 164 servicios son 164 clicks por mes.)
3. **Columna Motivo** con chip: `NO FACTURA PRODUCTOS` / `EXCEDE PRESUPUESTO` / `CON AUTORIZACIÓN` / `FUERA DE VENTANA` / `FUERA DE ESTÁNDAR`. El % que excede va en rojo.
4. **La ventana del auditor necesita el segundo camino.** Hoy solo tiene "Autorizar compra". Tienen que ser dos:
   - `↩ Devolver con propuesta al supervisor` — el auditor modifica cantidades (queda el diff pedido → propuesta), motivo + comentario obligatorio, el pedido vuelve como OBSERVADO y el supervisor acepta la propuesta o corrige y re-confirma.
   - `✔ Aprobar pedido` (con o sin ajuste directo — el ajuste directo notifica al supervisor). Renombrar "Autorizar compra" → "Aprobar pedido": "autorizar" se confunde con los productos CON AUTORIZACIÓN.
5. La estructura de la ventana está bien (Pedido / Autorizado / Costo congelado / Subtotal + desglose por tipo de uso). Detalle: `$ 173.150,477` está mal formateado — es `$ 173.150,48`.

## 6. Tab "Compra y entrega" — separar en dos (cambio de fondo)

Hoy está armado por servicio ("Marcar en compra" a Electromecánica), pero **Logística no compra por servicio: compra el consolidado por proveedor**. Son dos circuitos con dos unidades distintas:

### 6a. COMPRAS (unidad: el proveedor) — subtabs en orden del proceso
1. **Consolidado del período**: cerrada la ventana y pasado el auditor, el sistema consolida todos los pedidos aprobados por producto y arma la propuesta de orden por proveedor, a costo de lista, con observaciones por línea. Exportable con el formato del archivo de compra actual.
2. **Sugerencias en la compra**: si una línea tiene equivalente más barato en otro proveedor (grupos de equivalencia con factor de conversión), el sistema SUGIERE el cambio — nunca lo hace solo. Se decide por línea o servicio por servicio, "mantener" pide motivo. La línea cambiada queda `SUSTITUIDO POR EQUIVALENTE` y "repetir mes anterior" le carga al supervisor lo que realmente recibió.
3. **Simulación mensual**: compra como está vs optimizada — cuánto se ahorra si se toman las sugerencias. Reporte anual de ahorro tomado / no tomado.
4. **Órdenes y seguimiento**: `CONFIRMADA → ENVIADA → RECIBIDA PARCIAL → RECIBIDA COMPLETA → ARMADO`. La recepción se carga acá (completa o parcial, con backorder por línea y fecha comprometida + aviso si se pasa). La factura del proveedor se registra contra la orden: alimenta el **PPP** con lo realmente pagado y genera el movimiento en la **cta cte del proveedor**.
5. **Comparador de precios** al final, como consulta permanente (administración de los grupos de equivalencia).

**NO va**: solicitud de presupuesto / cotización previa. Se eliminó del diseño — Logística ya tiene el pedido completo del mes, compra a lista.

### 6b. ENTREGAS (unidad: el servicio)
- Arranca con la **recepción** de la mercadería: el sistema cruza lo recibido contra los pedidos aprobados y marca qué servicios se pueden armar completos.
- **Armado con checklist por producto** → al completarlo se genera el **REMITO** (correlativo, duplicado) → EN REPARTO → **ENTREGADO** con quién recibió + foto del remito firmado.
- Servicio **PAGAN**: firma del cliente, el remito firmado viaja a Finanzas y respalda la factura a PRECIO VENTA. Servicio **NO PAGAN**: constancia interna, el costo va al económico del servicio.
- Recién al ENTREGADO impacta el costo al servicio.
- **Hoja de recorrido**: salidas por zona con fecha límite de entrega por servicio, alerta si el límite está cerca y la mercadería no llegó. Plantilla mensual repetible.

## 7. TAB NUEVO: Recargos (por servicio)

- Card **Recargo GENERAL**: 30% con vigencias (vigente desde / anterior / historial). El cambio se carga con "vigente desde" (mes) — lo ya facturado no se toca.
- Card **Servicios que facturan productos (PAGAN)**: la lista nace SOLA del padrón de servicios (el dato "factura productos" viene del alta — nunca lista duplicada). Cada fila muestra su margen vigente: **propio** (cargado, azul) o **heredado del general** (gris itálica, mismo código visual que Valores hora). Botón "Cargar propio" por fila: % + vigencia + motivo.
- Resolución al facturar: ¿el servicio tiene margen propio? → ese. ¿No? → el general. NO PAGAN no lleva recargo (no factura).
- Todo cambio de margen queda en Auditoría con usuario, fecha y vigencia.

## 8. TAB NUEVO: Margen de productos (conexión con el Económico)

Dos lecturas por período:
- **Servicios PAGAN → MARGEN**: facturado (a precio venta, con el recargo de cada servicio) − entregado a costo (PPP) = margen de productos de Logística. Detalle por servicio con % de margen; si un servicio queda bajo, salta a la vista.
- **Servicios NO PAGAN → AHORRO**: presupuesto del mes (6% a costo) vs entregado a costo, con barra de consumo y columna AHORRO (presupuesto no consumido). Un servicio pegado al 100% mes a mes es señal para revisar consumo o presupuesto.

Más el tab **Auditoría (registro)**: import de listas, recortes del auditor, confirmaciones, cambios de recargo — todo con fecha, usuario y detalle.

---

## Resumen — qué falta construir (checklist)

| # | Pieza | Tipo |
|---|-------|------|
| 1 | Buscador + filtros + cabecera fija en la ventana del pedido | Ajuste |
| 2 | Columna "Mes anterior" | Ajuste |
| 3 | Botones Repetir / Guardar / Confirmar (chau "Cerrar") | Ajuste |
| 4 | "Presupuesto del mes" en lugar de "Tope 6%" (todo el módulo) | Renombre |
| 5 | Semáforo con destino (directo a Compras / al auditor) | Ajuste |
| 6 | Refresh de estado sin recargar la página | **Bug** |
| 7 | Estados: Confirmado / Confirmado·en revisión / Observado + fila roja EXCEDE + columna Cobro | Ajuste |
| 8 | Períodos: uno en carga, cierre programado + auto-confirmación + recordatorio, desglose por estado | Ajuste |
| 9 | Bandeja del auditor: regla NO PAGAN + excepciones, motivo, devolver con propuesta, "Aprobar pedido" | Ajuste + regla |
| 10 | Compras por proveedor: consolidado → sugerencias → simulación → orden → seguimiento/recepción → factura (PPP + cta cte) | **Nuevo** |
| 11 | Entregas por servicio: armado checklist → remito → reparto → entregado + hoja de recorrido | **Nuevo** |
| 12 | Tab Recargos por servicio | **Nuevo** |
| 13 | Tab Margen de productos (margen PAGAN + ahorro NO PAGAN) | **Nuevo** |
| 14 | Ventana de costo con monto ↔ % espejados | Ajuste |
| 15 | Formato de números ($ 173.150,48) | Detalle |

Prioridad sugerida: 1–9 primero (es lo que los supervisores y el auditor van a usar ya), después 10–11 (compras/entregas), y 12–13 cierran el círculo económico.
