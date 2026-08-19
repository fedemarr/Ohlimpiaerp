# MÓDULO MONOTRIBUTOS — Cambios y nuevas funciones

**Sesión:** Lautaro + Claude · 15/08/2026
**Para:** Fede

> El módulo Monotributos **ya existe**. Este documento lista los cambios acordados a partir de la **tabla ARCA vigente 01/08/2026** y la recategorización de RRHH.
>
> **Acompañan:**
> - `mockup_monotributos_ago2026.html` — diseño navegable de TODO lo descripto
> - `MONOTRIBUTO_ESCALAS_AGO2026.xlsx` — import: hoja TABLA + hoja PADRON (411) + hoja NOTAS

---

## 1. Estructura final de tabs

| Tab | Contenido |
|---|---|
| **Padrón** | Los 411 asociados registrados |
| **Fuera de categoría** | Quienes superan el límite por proyección |
| **Tablas de categorías** | Escalas ARCA con vigencias |
| **Pago mensual** | Armado y tildado del pago del mes |
| **Casos del import** | Los 10 casos a resolver por RRHH |

**Indicadores arriba:** registrados (411) · fuera de categoría · total CUR del mes · casos a definir por RRHH.

---

## 2. Tablas de categorías — con VIGENCIAS

### Vigencias
La tabla ARCA se carga **POR VIGENCIA**:
- **Nueva:** `2026-08` — "valores de aplicación desde el 1/08/2026"
- **Anterior:** `2024-01` queda en el historial, seleccionable

> ⚠️ Los meses ya armados **NO cambian** cuando entra una tabla nueva.

### Columnas por categoría (A a K)
- Límite anual de ingresos brutos *(columna "ingresos brutos" de ARCA)*
- Impuesto integrado
- Aportes SIPA
- Obra social
- **CUR**

**El CUR del asociado** = `TOTAL LOCACIONES Y PRESTACIONES DE SERVICIOS`. El desglose queda como referencia.

### Nota sobre zona
La tabla ARCA vigente **no distingue zona Provincia/Capital** — no hace falta el campo zona en esta vigencia.

### Carga
Botones: **"+ Nueva vigencia"** e **"Importar tabla"** (archivo ARCA).

---

## 3. Padrón — completo y recategorizado

### 411 registrados
- **34 ADM/SUP** con las categorías nuevas definidas por RRHH
- **377 OPERARIOS ACTIVOS**, todos en **categoría A** *(decisión Lautaro)*

**Filtros:** por puesto (Todos / Operarios / ADM / SUP) y por año.

### Columnas
`asociado · N° socio · puesto · categoría (con marcas tipo "bajó de D") · límite anual de la categoría · CUR mensual vigente · neto del último mes · PROYECCIÓN ANUAL · estado`

**Estados posibles:** al día · recategorizar · verificar monto · define RRHH

### Autónomos
Los autónomos (**2 casos**) se muestran **sin categoría ni CUR**, con estado `Define RRHH (régimen)`. Quedan **fuera del pago mensual** hasta que RRHH resuelva.

---

## 4. PROYECCIÓN ANUAL — regla definida por Lautaro

```
Proyección = suma de retiros REALES de los meses transcurridos
           + (promedio de esos meses × meses que faltan)
```

Se **recalcula con cada liquidación mensual** de retiros y se compara contra el límite anual de la categoría del asociado.

### Visual
Barra de progreso con el % del límite consumido:

| Color | Significado |
|---|---|
| 🟢 Verde | Normal |
| 🟡 Ámbar | Cerca del límite |
| 🔴 Rojo | La proyección **supera** el límite *(ej.: Peretti 102%)* |

### Efecto
Si la proyección supera el límite → el asociado pasa **automáticamente** al tab "Fuera de categoría".

---

## 5. Tab FUERA DE CATEGORÍA

### Contenido
Se alimenta de la proyección anual del padrón. Muestra:
- Categoría actual
- Límite
- Proyección con barra
- **EXCEDENTE en $**
- **CATEGORÍA SUGERIDA** — la que cubre la proyección, con su límite y CUR nuevos

### Acción
Botón **"Recategorizar"**: nueva categoría con **VIGENCIA** desde el mes que se indique, CUR nuevo desde ese mes, y el movimiento queda en el historial de cambios.

> Meses ya armados **no se tocan**.

### Estado vacío
Cuando no hay nadie fuera: tilde verde con *"Todos los asociados están dentro de su categoría para 2026"* (como la pantalla actual).

---

## 6. Tab PAGO MENSUAL

### Armado
Botón **"Armar lista del mes"**: entran los activos que trabajaron el período (**hoy 409**; los 2 autónomos afuera hasta que RRHH defina).

> El CUR de cada uno queda **CONGELADO** con la vigencia del mes. Cambios posteriores de tabla o de categoría **no tocan meses ya armados**.

### Columnas
`asociado · N° socio · CUR congelado · ADHERENTES congelado · total · método de pago · tildar PAGADO`

- **Adherentes:** obra social por adherente *(ej. $25.694,55)*
- **Método de pago:** transferencia / cheque / VEP
- **Total del mes:** $21.213.082,84 + adherentes
- **Export CSV**

### Conexión
La **liquidación de retiros DESCUENTA automáticamente** estos importes al asociado.

---

## 7. Tab CASOS DEL IMPORT

> Los resuelve **RRHH** *(decisión Lautaro)*. Son 10 casos detectados al cruzar la planilla de RRHH contra la tabla ARCA. Quedan visibles en su tab hasta resolverse.

### DEFINIR — Autónomos (2)
| N° socio | Asociado | Situación |
|---|---|---|
| 2271 | Bianchi Jorgelina | AUTÓNOMO — RRHH define régimen/pase |
| 2565 | Gonzalez Moure Marcelo | AUTÓNOMO — RRHH define régimen/pase |

### DEFINIR — Montos distintos a la tabla (4)
| N° socio | Asociado | Monto planilla | Monto tabla |
|---|---|---|---|
| 521 | Uballes Alvaro | $82.073,63 | B: $56.379,08 |
| 690 | Lage Dario | $193.608,47 | F: $150.784,21 |
| 788 | Martinez Jose Luis | $95.280,12 | C: $66.020,12 |
| 856 | Ramirez Benitez Martina | $75.099,08 | B: $56.379,08 |

> En todos, **RRHH define qué incluye el monto**.

### VERIFICAR (4)
| N° socio | Asociado | Problema |
|---|---|---|
| 22 | Recalde S. Cecilia | Bajó a C pero el monto quedó en D ($84.612,93 → corresponde $66.020,12) |
| 2212 | Lascano Fernando | Cat. B con monto $28.859,84 |
| 3153 | Cacciato Alejandro | Monto no coincide con C |
| 3292 | Rodriguez Naara | Monto no coincide con A |

> Resueltos los 10, el padrón queda **100% al día** y el Pago mensual congela los montos correctos.

---

## 8. Datos de arranque

### Import: `MONOTRIBUTO_ESCALAS_AGO2026.xlsx`
| Hoja | Contenido |
|---|---|
| **TABLA** | Vigencia 2026-08, categorías A a K con CUR |
| **PADRON** | 411 asociados con N° socio, puesto, categoría y estado |
| **NOTAS** | Los 10 casos del punto 7 |

### Fuente de retiros
La proyección anual necesita los **retiros mensuales por asociado** — salen de la **liquidación de retiros** ya cargada en el sistema.
