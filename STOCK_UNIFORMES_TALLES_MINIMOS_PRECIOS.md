# STOCK DE UNIFORMES — Talles, mínimos y precios

**Sesión:** Lautaro + Claude · 26/08/2026
**Para:** Fede

> **Acompaña:** `mockup_stock_uniformes_minimos.html`
>
> **El stock inicial ya está IMPORTADO:** 53 combinaciones prenda/talle, 1.080 unidades, relevamiento 14/08.
>
> Estos son los **tres agregados** sobre el módulo que ya está funcionando: la **columna TALLE**, el **tab MÍNIMOS** y el **tab PRECIOS**.

---

## 1. Grilla "Stock actual" — columna TALLE y columnas de valores

### COLUMNA TALLE
Cada fila del import es una combinación **prenda + talle**, pero la grilla no muestra el talle: quedan **8 filas "Ambo" indistinguibles**.

> Agregar la columna **TALLE** *(solo categoría UNIFORMES)* entre `PRODUCTO` y `EXISTENCIA`.

### ORDEN LÓGICO DE TALLES
```
S → M → L → XL → 2XL → 3XL → 4XL → 5XL
Numéricos: 35–46 (calzado) / 36–60 (pantalón)
```

> ⚠️ **NO alfabético** — alfabéticamente `2XL` queda antes que `L`.

### FILTROS
Filtro por **prenda** + filtro por **TALLE** + filtro por **estado**.

> *"¿Cuántas camperas 3XL hay?"* en un click.

### COLUMNAS DE VALORES
> Mismo esquema que productos.

| Par de columnas | Contenido |
|---|---|
| **Unitarias, juntas** | `PPP unit.` (de compras) y `Vigente unit.` (del tab Precios) |
| **Totales, juntos** | `Valor PPP` (existencia × PPP — **valuación contable**) y `Valor reposición` (existencia × vigente — **base del descuento al asociado**) |

Más **fila de TOTAL**.

> 🔑 La **brecha entre los dos totales** *("comprado antes del aumento")* es un **KPI de gestión de compras**.

Prenda sin precio vigente → sus valores quedan en `—`.

### ESTADO
El estado `OK`/`BAJO` por fila **ya funciona** — pasa a calcularse contra los mínimos del tab nuevo.

**Agregar el nivel `BAJO ⚠` (rojo)** cuando la existencia está por debajo del **60% del mínimo** *(umbral parametrizable)*.

---

## 2. TAB Mínimos *(nuevo)*

> ⚠️ **Cambio sobre la definición del 15/08:** los mínimos de stock se administran en un **tab propio del módulo**, NO en Configuración.
>
> **Por qué:** los ajusta quien mira el stock; para uniformes son **53+ valores** por prenda×talle — en Configuración quedarían escondidos.

Vale para **uniformes Y productos** *(productos: misma grilla sin columna talle)*.

### Grilla
`PRENDA · TALLE · EXISTENCIA · CONSUMO PROM./MES · MÍNIMO (editable en línea) · ESTADO en vivo`

- **CONSUMO PROM./MES:** calculado **solo desde las entregas registradas**
- **ESTADO:** se recalcula **mientras se edita**, antes de guardar

### "MÍNIMO GENERAL DE LA PRENDA"
Fila de cabecera por prenda con un **valor único** + botón **Aplicar**: carga ese mínimo en **todos los talles de la prenda de una vez**.

Después se retocan los talles puntuales *(ej.: 5XL más bajo por menor rotación)*.

### "PROPUESTA GENERAL"
```
mínimo sugerido = N meses de consumo promedio
```
*(N parametrizable, sugerido **2**)*

Botón que completa **toda la grilla** con la sugerencia.

> 🔑 **El sistema propone, el humano decide y guarda.**

### "REGISTRO DE AJUSTES"
Todo cambio de mínimo queda con **usuario, fecha y valor anterior**.

### Conexión
Los `BAJO` alimentan la **propuesta de compra** *(misma lógica que productos: neteo + refuerzo)*.

---

## 3. TAB Precios *(nuevo, solo uniformes)*

> Misma mecánica que **"Valores hora" de Categorías**.

### Dos precios, dos orígenes

| Precio | Origen | Para qué sirve |
|---|---|---|
| **PPP** | Se calcula **SOLO desde las compras** — nunca se carga a mano | Valor **contable** |
| **PRECIO DE REPOSICIÓN VIGENTE** | Se carga en este tab con **vigencia mensual** | **VALOR DE DESCUENTO AL ASOCIADO** |

**El precio de reposición:**
- La ventana de pedido **lo muestra**
- La constancia de entrega **lo congela el día de la firma**
- El plan de cuotas **sale de él**

> 🔑 **Lo pasado nunca cambia** — la cuota firmada en julio no se toca porque la prenda aumentó en agosto.

### Grilla *(idéntica a Valores hora)*
- **Filas** = prendas
- **Columnas** = meses del año *(selector de año)*
- Valor **cargado** ese mes en **azul**
- Meses siguientes lo **HEREDAN** *(gris itálica)* hasta que se cargue uno nuevo → no hace falta cargar los 12 meses
- Columna **PPP ACTUAL** al final, en solo lectura *(referencia)*

> ⚠️ **SIN excepciones por talle:** un solo precio por prenda.

### Botón "Cargar" en la fila de la prenda
Abre la ventana: **nuevo precio + VIGENTE DESDE (mes)**.

Crea la vigencia nueva; la anterior queda **cerrada con su historial** *(botón 🕘 por prenda)*.

### Botón "+ Carga masiva"
> Misma ventana que la **paritaria de Categorías**.

1. **% de aumento general** + "Impactar en todas" → completa el precio nuevo de todas las prendas sobre su vigente
2. Cada campo queda **EDITABLE** para corregir a mano, o se deja **en blanco** para que esa prenda no cambie
3. **VIGENTE DESDE** único + **MOTIVO obligatorio**
4. Vigencias nuevas **solo para las cargadas**, todo al Registro de ajustes

### Alarma
Prenda **sin precio vigente** *(hoy: Remera)* → **alarma antes de armar un pedido** de uniformes con descuento.

> ⚠️ No puede salir una constancia con valor vacío.

---

## 4. Conexiones *(ya definidas, para que cierre el circuito)*

1. Toda **ENTREGA** de uniformes descuenta stock en la **prenda+talle entregados** *(automático desde el módulo Uniformes)*.

2. Toda **COMPRA** ("Nueva compra") suma unidades y **alimenta el PPP** con lo realmente pagado.

3. El **descuento al asociado** usa el precio de **REPOSICIÓN VIGENTE del día de la firma** de la constancia *(queda congelado en la constancia y el plan de cuotas)*.

4. Los **BAJO** del tab Mínimos alimentan la **propuesta de compra**.

5. La **VALORIZACIÓN** de la grilla sale de:
   ```
   existencia × PPP       → contable
   existencia × vigente   → reposición
   ```

---

## 5. Notas del import ya cargado

### Estado
El stock inicial entró con el CSV: **53 combinaciones, 1.080 unidades**, relevamiento del **14/08**.

- **BUZO** se dio de alta como prenda nueva
- **REMERA** y **POLAR** quedaron en **0** *(sin stock informado)*
- **Botas de lluvia** excluidas *(definición del 12/08)*

### Primer paso al implementar
> 🔑 Cargar los **precios de reposición vigentes** de las 6 prendas con stock *(y Remera cuando corresponda)* **apenas exista el tab**.

Hasta entonces la valorización queda en `—`.
