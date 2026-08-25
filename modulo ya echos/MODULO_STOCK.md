# MÓDULO STOCK — Especificación completa

**Sesión:** Lautaro + Claude · 15/08/2026
**Para:** Fede

> **Módulo NUEVO** — crear de cero, dentro del área **LOGÍSTICA**.
>
> **Acompaña:** `mockup_stock.html` — diseño navegable
>
> **Conecta con:** Pedido de productos · Uniformes · Proveedores · módulo contable *(a futuro)*

---

## 1. Qué es

**Fuente de verdad de las existencias del depósito de Logística.**

> Toda entrada y salida de mercadería pasa por acá — **nada se mueve sin movimiento registrado**.

Es módulo propio (`Logística → Stock`) porque lo alimentan varios módulos:

| Categoría | Origen |
|---|---|
| **PRODUCTOS** de limpieza | Módulo Pedido de productos |
| **UNIFORMES** | Módulo Uniformes — reglas ya definidas: todo pedido descuenta, toda compra suma |

Ambas conviven como **categorías del mismo depósito**.

> ⚠️ **EXCLUIDO:** los consumibles de máquinas viven dentro del módulo **Máquinas** *(decisión ya tomada)*.

**Opera:** LOGÍSTICA.

---

## 2. Tab EXISTENCIAS

### Columnas (en este orden)
```
producto · categoría (PRODUCTOS/UNIFORMES, filtros) · existencia
· PPP unitario · precio vigente unitario        ← las dos unitarias JUNTAS
· valor PPP · valor de reposición               ← los dos totales JUNTOS
· mínimo · estado
```

### Estados
`OK` · `CERCA DEL MÍNIMO` · `REPONER`

> Los **MÍNIMOS** y el **NIVEL OBJETIVO** de cada producto se definen en **CONFIGURACIÓN**, no en la pantalla.

La alerta `REPONER` genera la sugerencia de refuerzo que Logística acepta o no en Compras *(punto 5)*.

### Indicadores
- **Valor total del stock** (PPP)
- **Valor de reposición** (vigente)
- **La diferencia entre ambos** — *"comprado antes del aumento"*: justifica el colchón con un número
- **Productos bajo mínimo**

---

## 3. Valuación: PPP oficial + reposición como referencia

### Valuación OFICIAL = PPP
**Costo Promedio Ponderado de lo realmente pagado.**

**Ejemplo:**
```
100 lavandinas a $4.180 (lista julio)
+ 60 lavandinas a $4.559 (lista agosto)
= 160 en stock a PPP $4.322,13
```

Si la compra entró con **COTIZACIÓN PUNTUAL** (Thames 2,8% bajo lista), la entrada se valoriza **al precio cotizado** — lo pagado de verdad.

> 🔑 **La plata siempre cierra:** lo que entró = depósito + imputado a servicios.

### Salida a servicio
Cuando un producto sale hacia un servicio, el costo que impacta al centro de costos es el **PPP del momento de la salida**.

### Valor de reposición
`lista vigente × existencia`

> ⚠️ **NO es la valuación oficial.** Inflaría el stock y los costos con cada import, generando **ganancia fantasma**.

Es **referencia de gestión**: cuánto costaría recomprar el depósito hoy.

---

## 4. Tab MOVIMIENTOS

| Tipo | Origen | Valorización | Referencia |
|---|---|---|---|
| **ENTRADA** | Recepción de orden de compra *(Pedido de productos → Recepción)* | A lo pagado *(cotización incluida)* | N° de orden |
| **SALIDA** | Checklist de armado del tab Entregas — cada armado completo descuenta | A **PPP** → costo al centro de costos al confirmarse `ENTREGADO` | Remito |
| **REFUERZO** | Línea de colchón aceptada en la compra *(punto 5)* | Entra a depósito **sin imputar** a ningún servicio | — |
| **AJUSTE ±** | Diferencia de inventario, merma, rotura, vencimiento | — | **SIEMPRE** con motivo (parametrizable) y responsable |

### Datos de todo movimiento
`fecha/hora · tipo · producto · cantidad · valorización · referencia · usuario`

> Los **uniformes mueven idéntico**: entrega de uniforme = salida; compra = entrada.

---

## 5. Propuesta de compra: neteo + colchón

### 1. NETEO
Al consolidar el período, el sistema propone la compra **NETA**:

```
compra neta = pedido de los servicios − existencias
```

Si hay stock suficiente, la línea sale en **0** y el pedido se sirve del depósito.

### 2. REFUERZO SUGERIDO
Para productos **bajo mínimo**, el sistema propone reponer hasta el **NIVEL OBJETIVO** *(Configuración)*.

La línea va marcada `REFUERZO DE STOCK`: **visible, valorizada, sin imputar a servicios**.

> Se termina el *"pedir de más invisible"*.

### 3. DECISIÓN
La propuesta (neteo + refuerzos) aparece en el **TAB COMPRAS** de Pedido de productos como base de la orden.

Logística decide **línea por línea**: `ACEPTA` / `EDITA` / `QUITA` cada refuerzo. Recién después sale la solicitud de presupuesto o la orden firme.

> **El sistema propone, Logística decide.**

---

## 6. Tab INVENTARIO

### Conteo físico
Frecuencia **parametrizable** (sugerido mensual, con la ventana de pedidos cerrada).

Durante el conteo, los movimientos del depósito **se congelan** *(parametrizable)*.

### Conteo ciego
Se carga lo contado **SIN VER el teórico** — para que no se "copie". Parametrizable. Se puede **pausar y retomar**.

### Ajustes
Al cerrar, el sistema muestra **teórico vs contado**, y cada diferencia genera un **AJUSTE** con motivo y responsable.

### Exactitud
`% de exactitud` por inventario (teórico vs físico), con historial.

> Diferencias recurrentes en un producto = **señal para el auditor** (salidas sin registrar, mermas).

---

## 7. Conexiones

### Pedido de productos
- La **Recepción** genera **ENTRADAS**
- El **checklist de armado** de Entregas genera **SALIDAS**
- La **propuesta de compra** (neteo + refuerzo) alimenta el tab Compras

### Uniformes
Mismo depósito, categoría propia. Las reglas ya definidas (pedido descuenta / compra suma) se implementan con los movimientos de este módulo.

**Import inicial ya entregado:** `STOCK_INICIAL_UNIFORMES_2026-08.xlsx` — 1.080 unidades, 53 combos.

### Contable *(futuro)*
El stock es un **ACTIVO** (Bienes de cambio):
- Las **entradas** lo aumentan
- Las **salidas** lo bajan contra costo del servicio

Subcuenta preparada para el plan de cuentas cuando se active el módulo contable.

---

## 8. Roles

| Rol | Responsabilidades |
|---|---|
| **LOGÍSTICA** | Registra recepciones, armados/salidas, ajustes e inventarios; decide refuerzos en Compras |
| **FINANZAS** | Consulta valuaciones; define en el económico cómo juega el activo de stock |
| **AUDITOR** | Lee diferencias de inventario recurrentes y ajustes |

---

## 9. Configuración

- **Stock mínimo** y **nivel objetivo** POR PRODUCTO
- **Motivos de ajuste**
- **Frecuencia de inventario**
- **Conteo ciego** sí/no
- **Congelar movimientos** durante conteo
- **Alerta de reposición**

---

## 10. Arranque

**1. UNIFORMES**
Importar `STOCK_INICIAL_UNIFORMES_2026-08.xlsx` *(ya entregado)*.

**2. PRODUCTOS**
Hacer el **CONTEO INICIAL** del depósito con el tab Inventario — el primer inventario es la carga inicial — valorizado con la **última compra conocida** de cada producto.

**3. Mínimos y objetivos**
Definir en Configuración con Richard.

> **Arranque sugerido:** mínimo = 1 mes de consumo promedio · objetivo = 2 meses
