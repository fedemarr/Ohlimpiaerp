# PEDIDO DE PRODUCTOS — Ronda 5: circuito compra-stock-entrega + correcciones
**Fecha:** 10/09/2026 · **Probado por:** Lautaro (Finanzas) · **Acompañan:** `mockup_compras_stock_reposicion.html` (reposición y armado desde stock) · `mockup_entregas_v2.html` (Entregas + Hoja de recorrido + remito PDF)

Probamos el circuito completo con el período 2026-10: sugerencias aceptadas, OC de Diversey confirmada → enviada → backorder → recepción parcial → recibida completa con factura, y el tab Entregas nuevo con armado/remito/reparto. **Gran parte funciona perfecto** (detalle al final). Este documento trae: 1 bug urgente, el rediseño del circuito (validado con el proceso real que contó el auditor), Entregas v2, y ajustes menores.

---

## 1. 🐛 URGENTE — al aceptar una sugerencia, la cantidad NO se convierte

La línea se muda al proveedor nuevo con producto y precio nuevos, pero **mantiene la cantidad original**. Caso real de la prueba: 3 packs "Bolsa 60x90 x50un" aceptados → quedó **"3 × $63,83 = $191,49"** en vez de **150 × $63,83 = $9.574,50**. Si se confirma la OC así, se compran 3 bolsas en lugar de 150.

**Fórmula:** `cantidad nueva = cantidad pedida × factor del producto original ÷ factor del sugerido` — es el mismo cálculo que Sugerencias ya usa para mostrar "3 = 150 BOLSA" y para el ahorro: reusar ese cálculo al aplicar la aceptación.

Detergente y lavandina salieron bien de casualidad (factores iguales, 5=5). Verificación: aceptadas las 3 sugerencias, el bloque THAMES debe dar **10 líneas · $208.704,96** (hoy da $199.321,95 — la diferencia son los $9.383,01 de las bolsas). ⚠ **No confirmamos la OC de Thames hasta este fix.**

## 2. 🔄 REDISEÑO DEL CIRCUITO — comprar para stock, entregar desde stock

Proceso real de Logística (lo contó el auditor): **la compra es para stockearse** (se usa el mes siguiente); **la entrega del mes sale del stock existente**. La recepción de OC ya suma stock ✔ (verificado: las 25 líneas de OC-2026-003 entraron como existencias). Lo que falta conectar:

```
PEDIDOS → CONSOLIDADO ─┬→ ARMADO Y ENTREGA desde STOCK (cada armado = SALIDA de stock)
                        └→ OC DE REPOSICIÓN para el período siguiente (recepción = ENTRADA ✔ ya anda)
```

1. **"Listos para armar" se calcula contra el STOCK disponible**, no contra lo recibido de la OC del período (hoy el tab Entregas dice "arranca con lo recibido en Compras" — ese es el cambio). La entrega no espera a ninguna compra.
2. **El armado descuenta stock** (salida con servicio de destino en Stock → Movimientos). Si el stock no cubre, **armado parcial** y el faltante queda registrado con prioridad en la reposición. Bonus: con las salidas, el "Consumo prom./mes" del tab Mínimos se llena solo también para productos.
3. **La OC deja de "comprar el pedido": repone el depósito.** Propuesta por producto: `compra sugerida = consumo del período + mínimo − stock actual` (si da ≤ 0 → NO COMPRAR). Consumo = consolidado con sustituciones aplicadas y cantidades convertidas; stock y mínimos se leen del módulo Stock. Columna editable — el sistema propone, Logística decide.
4. **Líneas MANUALES en la OC**: botón "+ Agregar producto" para stockeo sin consumo previo — producto, cantidad y **motivo tipificado** (Apertura de servicio · Stockeo estratégico · Oportunidad de precio · Otro) + referencia. Chip MANUAL para distinguirlas de las CALCULADAS. Para demanda permanente nueva, el camino es subir el mínimo del producto (la propuesta lo trae sola).
5. La ventana de tiempos del período (carga −48 hs / auditoría hasta −24 hs) queda **para más adelante** — no va en esta entrega.

*Todo maquetado en `mockup_compras_stock_reposicion.html` (3 tabs: armado, reposición con el cálculo visible, movimientos).*

## 3. 🚚 ENTREGAS v2 (mockup `mockup_entregas_v2.html`)

Lo construido está muy bien (checklist, remito, reparto, alertas de vencido) — los cambios son de estructura:

1. **Una sola tabla** de servicios del período: SERVICIO · ZONA · ÍTEMS · STOCK (alcanza/falta) · REMITO · LÍMITE · **ESTADO** · **ACCIÓN**. El botón de acción cambia con el estado y la fila avanza en la misma tabla: PENDIENTE DE ARMADO → ARMADO → EN REPARTO → ENTREGADO (fecha + quién recibió). Sin secciones separadas — filtros por estado/zona + KPIs arriba. Escala a los ~160 servicios.
2. **Hoja de recorrido = TAB PROPIO** (mezclada queda ilegible al crecer). Dos partes: **planificación** — cada zona/recorrido con su "Fecha de reparto" y botón "Aplicar a la zona": la fecha baja como límite a todas las salidas de esa zona (editable por servicio puntual); la ventana de armado pierde el campo de fecha (muestra la heredada). Y la **vista del repartidor**: cada zona con sus salidas, estado y vencimiento, los vencidos arriba. La zona sale de la ficha del servicio — si falta ese dato en el alta, hay que agregarlo.
3. **El remito se genera en PDF** (hoy no se genera): membrete, N° correlativo R-000000, servicio/zona/supervisor, productos y cantidades **sin precios** (acompaña la mercadería; la valorización queda en el sistema). Dos firmas (entregó/recibió). "Registrar entrega" guarda fecha + receptor, con foto del remito firmado opcional — mismo patrón que la constancia de Uniformes.

## 4. Grupos de equivalencia / Comparador

1. **Editar y borrar grupos** — hoy solo se pueden crear. Editar: nombre, unidad, agregar/quitar miembros, corregir factor. Borrar con confirmación (si el grupo tiene sugerencias aceptadas en el período, avisar).
2. **Chip de proveedor en cada producto del comparador** — en Sugerencias ya está; en el comparador no se sabe de quién es cada miembro.
3. **Regla: un producto no puede estar en dos grupos a la vez** (pasó en la prueba con duplicados y genera sugerencias dobles sobre la misma línea).

## 5. Reordenar los subtabs de Compras al proceso real

Con el circuito nuevo, los pasos reales de Logística cada período son:

1. **1 · Consolidado del período** — qué pidieron los servicios (el consumo del mes). Solo lectura; alimenta Entregas (que arma desde stock) y la reposición.
2. **2 · Sugerencias** — decidir con qué producto se cubre cada consumo (equivalentes más baratos, impacta el consolidado). **La "Simulación mensual" se fusiona acá adentro** como KPIs del paso (compra como está / optimizada / ahorro posible / tomado) — como tab aparte es la misma información dos veces. El TODO del reporte anual de ahorro sigue pendiente aparte.
3. **3 · Reposición → generar OC** — la propuesta de compra del punto 2 de este documento (neteo + manuales), con la confirmación por proveedor que genera las OC.
4. **4 · Órdenes y seguimiento** — como está (ya funciona perfecto).
5. **🔍 Comparador de precios** — se queda al final como está: es la herramienta de armado de grupos, no un paso del proceso.

## 6. Menores

- Proveedor **"DIVERSEY" → NUMASA**: Diversey y 3M son marcas que distribuye Numasa — van en la columna Marca (hoy toda en "—"); la OC es del proveedor.
- Título del módulo Stock: dice "Stock de uniformes" y ya es el stock general → **"Stock"**.
- Verificar: en la prueba el 3M paño x13" Blanco pasó de 2 a 3 unidades (+$18.909,50) en el consolidado sin que lo cargáramos — revisar de dónde salió.

## ✔ Validado en esta ronda (no tocar)

Rastro del consolidado al confirmar ("orden generada → OC-... " en verde, "nada desaparece") · pipeline de OC completo: Confirmada → Enviada → **backorder automático con fecha comprometida** → recepción parcial línea por línea → Recibida completa + factura del proveedor · export formato archivo de compra actual · recepción suma stock con PPP · decisiones de sugerencias con "✓ Aceptada" y deshacer · ahorro del período exacto ($32.064,64) · empate ±2% · Entregas con checklist, remito correlativo, estados y alerta de vencidos.
