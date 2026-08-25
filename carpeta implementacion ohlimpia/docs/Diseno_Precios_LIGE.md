# Diseño: importación de precios/sucursales desde LIGE (para validar con Juan)

**Fecha:** 25-jun-2026 · **Estado:** PROPUESTA para revisar — **no tocar la base todavía**. Base: relevamiento de `Base Precios LIGE.xlsx` (477 objetivos, abril-2026) + cruce con nuestra base. Antecedentes: `Diagnostico_Clientes.md` §8, `Diseno_ABM_Clientes.md`.

**Objetivo:** que LIGE alimente cliente → sucursales/objetivos → valor hora, reemplazando la carga manual mes a mes de Comercial, **sin perder** el histórico de % pactados (que se usa en el Frente 3).

### Visión de fondo (el norte del proyecto)
- **HOY:** Comercial lleva precios + negociación en su **Excel manual** → ese Excel alimenta **LIGE** → LIGE **factura**. FinFlow es espectador.
- **VISIÓN:** **FinFlow REEMPLAZA el Excel de Comercial** como **fuente de verdad de los precios**. FinFlow lleva **historia + negociación + proyección** → alimenta a LIGE con los **precios pactados** → LIGE **ejecuta** (factura) y **retroalimenta** a FinFlow con los **datos operativos** (facturado, sucursales, horas, comprobantes) → FinFlow **concilia y reproyecta**.
- **Por eso el histórico es esencial:** sin la serie de precios/% pactados, FinFlow no puede ser la fuente de verdad ni proyectar. Esta importación LIGE es el primer paso del circuito (traer lo operativo); el histórico de Comercial ya migrado es la otra mitad.

---

## 1. Las dos fuentes y sus roles (conviven, no compiten)

| Fuente | Qué es | Qué aporta | Rol |
|---|---|---|---|
| **LIGE** (`Base Precios LIGE.xlsx`) | Export del **sistema operativo** Lince. 477 filas = 1 objetivo × abril-2026. | Precio **vigente real** (lo facturado), **objetivos/sucursales**, **horas**, **coordinador**. | **Precio vigente + granularidad.** Se re-importa cada mes. |
| **Comercial** (`BASE DE PRECIOS LINCE.xlsx`) | Planilla de precios de Comercial, todos los meses, sin horas. | **Histórico de % pactados** + `ultimo_mes_pactado`. | **Escala de aumentos** para proyectar (Frente 3). |

- Lo de Comercial **ya se migró**: `clientes_contratos.precio_pactado / pct_pactado / ultimo_mes_pactado` en 213 servicios vigilancia. **Se CONSERVA** (LIGE no lo trae — es un solo mes).
- **Quién gana:** para el **precio vigente** → LIGE (operativo, real). Para la **proyección futura** → el % pactado de Comercial. Complementarios.

---

## 2. UN modelo de precio + MODOS DE FACTURACIÓN (corrección de Juan, 25-jun)

**No son "4 modelos de pricing".** Es **un solo modelo de precio** (el precio vive en la sucursal) **+ un atributo de "modo de facturación" en el cliente**. La franquicia es el único caso realmente aparte.

### 2.a El PRECIO siempre vive en la SUCURSAL — para TODOS los clientes
Cada objetivo/sucursal tiene su valor:
- **valor hora:** `0 < Importe Hora A < 100.000` → precio hora de la sucursal.
- **monto fijo:** `Importe Hora A ≥ 100.000` → monto mensual de la sucursal.
- **importe = 0 / null (EDESUR, ENERGIA):** el 0 **NO es falta de precio** — es un **artefacto de cómo Lince globalizó la facturación**. El valor hora se carga igual en la sucursal, tomándolo de la **lista Lince** o de **facturas-calculado**. EDESUR tiene valor hora como cualquiera (~11.650); lo que cambia es **cómo factura**, no el precio.

### 2.b El MODO DE FACTURACIÓN es un atributo del CLIENTE (campo nuevo)
🟩 `clientes.modo_facturacion` (text / tilde + descripción). Valores conocidos:
- **`desglosado`** (la mayoría, ~94%): la factura es `horas × valor hora`.
- **`consolidado`** (EDESUR): la factura es **"1 unidad = monto neto total"**, con las horas descritas en el **cuerpo** de la factura (texto). **Por eso su Importe Hora A sale 0 en LIGE.**
- *(extensible: otros modos que aparezcan se agregan como valores de este campo.)*

**Clave:** el modo de facturación **NO afecta la proyección** — se proyecta **sumando sucursales** igual para todos. Solo importa para **conciliar contra las facturas reales** (cómo se ve la factura).

### 2.c Franquicia / royalty = lo único realmente aparte
Lopez, TREOLAND, COOPERATIVA LINCE: **no se cobra por hora** (es royalty/franquicia) → `clientes.tipo='85'`, **fuera del flujo de servicios por hora** (no entran como sucursales con valor hora).

### Resumen de detección
| Caso | Detección | Qué hace el import |
|---|---|---|
| valor hora | `0 < impA < 100k` | precio hora → sucursal |
| fijo | `impA ≥ 100k` | monto mensual → sucursal |
| importe 0/null, **cobra por hora** | `impA=0/null` y cliente NO franquicia, **tiene facturas** | valor hora desde lista Lince / calculado → sucursal; **cliente.modo_facturacion='consolidado'** |
| franquicia | nombre `FRANQUICIA…` / cliente royalty (Lopez, Treoland) | `cliente.tipo='85'`, **no se importa como servicio por hora** |

**Pesos (248 clientes LIGE):** ~245 con precio en sucursal (modo **desglosado** ~234, **consolidado** EDESUR/ENERGIA), **~2 franquicia** (tipo 85). Ya no hay "modelos mixtos a clasificar": cada sucursal tiene su precio y el cliente su modo.

**Sin clasificar:** CÍRCULO MILITAR (impA=0, **no está en `clientes`** → alta faltante; al darlo de alta, valor hora en su sucursal + modo a definir).

---

## 3. Mapeo columna LIGE → tabla/campo

Una fila LIGE (objetivo×mes) se reparte así:

| Columna LIGE | → Tabla.campo | Nota |
|---|---|---|
| CUIT Cliente | match `clientes.cuit` | si no existe → **alta** (ver §6). ⚠️ 1 fila sin CUIT |
| Razon social | `clientes.nombre` (alta) | |
| **Cod Obj** | 🟦 `sucursales.odoo_id` | **clave natural del objetivo/sucursal** |
| Nombre Obj | 🟦 `sucursales.nombre` | |
| Sucursal Objetivo | 🟦 `sucursales.direccion` | es zona/ciudad (MAR DEL PLATA, CASA CENTRAL), no calle |
| **Grupo Actividad** | 🟩 `personas` (coordinador) + link | el JJAA/coordinador del objetivo → crea persona rol coord + vínculo (sucursal o cliente) |
| Horas a facturar A | 🟩 horas pactadas de la sucursal (campo nuevo / `servicio_eft`) | la hora facturable |
| **Importe Hora A** | 🟩 precio de la **sucursal** (§2.a) | `>0 <100k` → valor hora; `≥100k` → monto fijo; `0/null` (cobra por hora) → valor hora de lista Lince/calculado **y** `clientes.modo_facturacion='consolidado'`; franquicia → no entra |
| Total a Facturar | (no se persiste; control/conciliación) | |
| Mes / Año | el mes del snapshot (abril-2026) | LIGE se re-importa por mes |
| resto (horas varias, Importe B, Asistencia, Comprobante…) | **se ignoran** | operativas/internas |

**Campos NUEVOS — `sucursales`** (hoy: id, cliente_id, nombre, direccion, activo, odoo_id):
- 🟩 `coordinador_persona_id` (FK personas), `precio_hora` (numeric), `tipo_precio` (text: `hora`/`fijo`), `horas_pactadas` (numeric), `mes_precio` (date del snapshot), **`fecha_alta` / `fecha_baja` (date)**. *(El precio Y las fechas del servicio viven acá.)*
- 🆕 **fecha_alta/fecha_baja del SERVICIO** vienen de LIGE (Juan, 25-jun) → **resuelve el pendiente del ABM** ("fechas del servicio para cuando definamos altas/bajas"). ⚠️ No están en el export de 21 columnas que tenemos; vienen de otra vista/export de LIGE — a confirmar la columna exacta al implementar.

**Campos NUEVOS — `clientes`:**
- 🟩 `modo_facturacion` (text: `desglosado`/`consolidado`/…). `tipo='85'` (ya existe) marca franquicia.
- `fecha_alta` (ya existe) / `fecha_baja` (ya agregada en ABM) → pueden refrescarse desde LIGE.

---

## 3.b INVENTARIO: todo lo que LIGE aporta al ABM

Cuánto del ABM se puebla desde LIGE (✅ en el export actual de 21 col · 🕗 LIGE lo provee, en otra vista/export · ⏳ fuente pendiente):

| Dato de LIGE | Columna/fuente | → Tabla.campo | Estado |
|---|---|---|---|
| **Cliente** (identidad) | CUIT Cliente, Razon social | `clientes` (match por CUIT / alta) | ✅ |
| **Fecha alta/baja CLIENTE** | (vista LIGE) | `clientes.fecha_alta` / `fecha_baja` | 🕗 |
| **Objetivo/sucursal** | **Cod Obj** (clave) | `sucursales.odoo_id` | ✅ |
| Nombre de la sucursal | Nombre Obj | `sucursales.nombre` | ✅ |
| Zona/ciudad | Sucursal Objetivo | `sucursales.direccion` | ✅ |
| **Fecha alta/baja SERVICIO** | (vista LIGE) | `sucursales.fecha_alta` / `fecha_baja` | 🕗 *(resuelve pendiente ABM)* |
| **Horas pactadas** | Horas a facturar A | `sucursales.horas_pactadas` | ✅ |
| **Valor hora / monto** | Importe Hora A | `sucursales.precio_hora` + `tipo_precio` | ✅ |
| **Modo de facturación** | derivado (impA=0 + factura) | `clientes.modo_facturacion` | ✅ (derivado) |
| **JJAA / coordinador operativo** | Grupo Actividad | `personas` + `sucursales.coordinador_persona_id` | ✅ |
| **Conciliación factura↔objetivo** | **Comprobante** | `facturas.sucursal_id` (vía `numero`, 96% match) | ✅ (§5) |
| **Coordinador de Cuenta + comisión** | (export aparte, distinto del JJAA) | `cliente_comisionistas` (modalidad, %) | ⏳ fuente pendiente (§5.b) |
| Franquicia/royalty | nombre `FRANQUICIA…` / cliente | `clientes.tipo='85'` | ✅ |

**Lectura:** LIGE puebla **casi todo el ABM** — clientes (altas + fechas), sucursales (objetivo + nombre + zona + fechas + horas + precio + coordinador), modo de facturación, y la conciliación con facturas reales. **Lo único que NO trae LIGE:** (a) el **% pactado / histórico** (de Comercial, ya migrado, para Frente 3) y (b) el **listado de comisionistas** (Coord de Cuenta + comisión, fuente pendiente). El resto deja de ser carga manual.

---

## 4. Decisión de modelo: los 247 contratos CONVIVEN

- **`clientes_contratos` (247 servicios) NO se tocan.** Ya tienen el `precio_pactado`/`pct_pactado`/`ultimo_mes_pactado` migrado de Comercial y el **split resuelto**. Son la base del Frente 3.
- **Las `sucursales` se agregan ENCIMA** (nivel más granular, desde LIGE). Jerarquía:
  ```
  cliente ──< clientes_contratos (servicio: tipo_servicio + precio_pactado/%  ← Comercial, para proyección)
          └──< sucursales (objetivo: Cod Obj + precio_hora_vigente + horas + coordinador  ← LIGE, vigente)
  ```
- No se reemplaza ni se re-mapea `clientes_precios.contrato_id` → **el split y la migración quedan intactos**. Las sucursales son una capa nueva, no una reestructuración.
- (Vínculo sucursal↔contrato opcional/futuro: una sucursal pertenece a un cliente; el "servicio" sigue a nivel tipo_servicio. Si más adelante se quiere precio por sucursal-servicio, se evalúa; por ahora sucursal cuelga del cliente.)

---

## 5. Conciliación factura↔objetivo: RESUELTA vía columna "Comprobante" (25-jun)

Juan verificó que la columna **"Comprobante"** de LIGE = el **número de factura de Odoo**. Esto **resuelve la conciliación** sin depender de `facturas.sucursal_id` (que se cargaba a mano y no es confiable): LIGE da el número de factura **por objetivo**.

**Verificación del cruce (solo lectura, 25-jun):**
- **97%** de los objetivos (463/477) tienen comprobante.
- **96%** (445/463) matchea una factura del **MISMO cliente** en nuestra tabla `facturas` → **el puente objetivo↔factura real es válido y confiable**.
- Match por **secuencial** (el comprobante `1454` = el secuencial de `FA-A 00002 00000001`) **+ validación por cliente** (el secuencial solo no es único entre puntos de venta → 17 colisiones que se descartan al exigir mismo cliente).
- **1 objetivo → varias facturas: 17 objetivos** (3,6%) con comprobante múltiple (`1729/1888`, `465/60`) → el import parsea el comprobante como **lista** de números.
- **4% no-match** = secuencial de otra serie (FA-B) / punto de venta, o factura aún no importada. No invalida el puente.
- Borde: 14 sin comprobante + 1 con texto `'NO'` (CONSORCIO HONDURAS, alta faltante).

**Evidencia (ejemplos del cruce, match exacto secuencial + neto coincidente):**
```
EMBALAJES FERNANDEZ   comp=1454  → FA-A 00005-00001454  abril-26  neto 2.137.127  (= Total LIGE)
GERARDO RAMON Y CIA   comp=1389  → FA-A 00005-00001389  abril-26  neto 12.638.109
FRESENIUS KABI        comp=1441  → FA-A 00005-00001441  abril-26  neto 13.425.474
TATA CONSULTANCY      comp=1729/1888  → 1729✓ (la 1888 es FA-B, no importada)   ← multi
CONSORCIO (varios)    comp=421/523, 1138/1275  → ambas ✓                          ← multi 2 facturas
```
El comprobante `1454` = el secuencial `00001454` de la factura, y el **neto coincide** con el "Total a Facturar" de LIGE → es el puente factura↔objetivo verificado.

**Diseño de la conciliación:** el import usa `Comprobante` → matchea `facturas.numero` (por secuencial **+ cliente**) → puebla **`facturas.sucursal_id`** (o un vínculo objetivo↔factura). Así cada factura real queda atada a su objetivo/sucursal y se cierra el círculo: **horas/precio LIGE ↔ facturado real por objetivo**. Reemplaza el `sucursal_id` cargado a mano.

---

## 5.b Comisionistas (Coordinadores de Cuenta) — fuente LIGE PENDIENTE

⚠️ **Ojo: el coordinador de "Grupo Actividad" (JJAA) NO es el comisionista.** Son datos distintos:
- **Grupo Actividad** (LIGE, ya disponible) = el **JJAA/coordinador operativo** del objetivo → `sucursales.coordinador_persona_id` (§3).
- **Coordinador de Cuenta + su comisión** = el **comisionista** (cobra % del neto) → tabla `cliente_comisionistas` (ya creada, con `modalidad`). Juan **todavía no consiguió ese export** de LIGE.

**Anotado:** `cliente_comisionistas` se **poblará desde LIGE cuando esté disponible el listado de Coordinadores de Cuenta + comisiones** (fuente pendiente — NO ahora). Por ahora la tabla queda vacía / carga manual.

### ✅ LA FUENTE APARECIÓ — está en el export mensual desde mayo-2026 (13-ago)

Al importar los siete archivos de LIGE (`Diseno_Proyeccion_LIGE.md`, Paso 1) resultó
que **el dato que faltaba ya estaba adentro**. Los exports de mayo en adelante traen
tres columnas nuevas, y una es **`Coordinador Cuenta`** — que **no es** el `Grupo
Actividad`/JJAA, es el comisionista.

**Y viene con la comisión incluida, en el mismo campo.** El formato exacto del dato es:

```
NASIM ROSI, MARCELO JORGE (10.00%)
```

O sea: `APELLIDO, NOMBRE (PP.PP%)`. Nombre y porcentaje en un solo texto, con el
porcentaje entre paréntesis al final.

**Consecuencias:**
- Ya no hace falta pedirle un export aparte a Sistemas. El dato entra con el archivo
  mensual que ya se importa, y queda en `raw_lige_objetivos.coordinador_cuenta`.
- Viene **por objetivo**, no por cliente — que es más granularidad de la que
  `cliente_comisionistas` contempla hoy. Un cliente podría tener coordinadores
  distintos en objetivos distintos, igual que pasa con el JJAA.
- Hay que **parsear el nombre y el porcentaje** al poblar la tabla, y decidir qué
  hacer si un cliente tiene más de un coordinador entre sus objetivos.
- **Solo existe desde mayo-2026.** Los archivos de enero a abril no traen la columna,
  así que no hay histórico de comisiones por esta vía.

⏳ **No es para ahora** — no bloquea la proyección desde LIGE. Queda anotado para
cuando se retome el frente de comisionistas, con el dato ya disponible.

---

## 6. Altas y correcciones que salieron del cruce (para Comercial / datos)

Detalle completo en `validacion_lince_abril.xlsx` (3 hojas). Resumen:

**Altas faltantes (~6 clientes en LIGE no en `clientes`):** ADMIN NIJOCALI, CÍRCULO MILITAR, CONSORCIO COLON 34, CONSORCIO HONDURAS, COOPERATIVA LINCE SEGUR (franquicia), MASTROMARINO DIEGO.

**CUIT a corregir (3, mismo cliente con otro CUIT):**
| Cliente | CUIT Lince | CUIT nuestro |
|---|---|---|
| TARIK S.C.A. | 30700911264 | 30520441081 |
| CONSORCIO QUARTIER | 30711590133 | 30714707775 |
| FIDEICOMISO UPSALA | 30711847193 | 30717148211 |

**Posibles bajas (~19, con precio pero sin servicio abril-2026 en LIGE):** los 15 "viejos" (último % en 2025) + algunos. → confirmar con Comercial si son bajas.

**Precios a revisar (~11 con dif >5%):** ANCHOITA (LIGE 12.525 ≈ correcto vs nuestro corrupto 1,1M), ENERGIA (79%), DORINKA (28%), etc.

---

## 7. Resumen para validar

- **LIGE importa:** clientes (altas) + **sucursales** (Cod Obj, nombre, zona, coordinador) + **precio en la sucursal** (valor hora o monto, para TODOS) + horas, **por mes**.
- **El precio siempre vive en la sucursal**; el **modo de facturación** (desglosado/consolidado) es un atributo del cliente que **no afecta la proyección**, solo la conciliación. Franquicia (`tipo='85'`) es lo único fuera del flujo por hora.
- **Se conserva:** `clientes_contratos` (247) con el `pct_pactado`/`ultimo_mes_pactado` de Comercial → **Frente 3 intacto**.
- **Sucursales = capa nueva encima**, no reestructura nada.
- **Conciliación factura↔objetivo RESUELTA** vía columna `Comprobante` (96% match al mismo cliente) → puebla `facturas.sucursal_id`. (§5)
- **Pendiente de fuente:** el listado de Coordinadores de Cuenta + comisiones de LIGE (para `cliente_comisionistas`) — Juan aún no lo tiene. (§5.b)

### Decisiones CERRADAS (Juan, 25-jun)
- ✅ **JJAA (Grupo Actividad) → a la SUCURSAL** (`sucursales.coordinador_persona_id`). Cada sucursal puede tener un **JJAA distinto** (sobre todo en zonas alejadas), por eso va al nivel objetivo, no cliente.
- ✅ **Re-import mensual → ACUMULA HISTÓRICO** (no pisa). Cada mes de LIGE se guarda (por `mes_precio`); la serie operativa se conserva — es la base del circuito de la visión (concilia + reproyecta).

### Decisiones aún abiertas
1. **Valor hora de las sucursales con `impA=0`** (EDESUR/ENERGIA): ¿se carga desde la **lista Lince** (excel) o desde **facturas-calculado**? (El precio va a la sucursal igual; es solo la fuente.)
2. **Detección del modo `consolidado`:** ¿se infiere del patrón `impA=0 + factura` o se marca a mano por cliente? (afecta a pocos: EDESUR, ENERGIA.)

### Estructura LISTA, fuente PENDIENTE (Juan pide el reporte de LIGE para mañana)
El modelo **ya tiene a dónde van estos datos**; solo falta el export de LIGE que los traiga:
- **Coordinador de Cuenta + comisión** → `cliente_comisionistas` (con `modalidad`, `pct`). Distinto del JJAA. (§5.b)
- **Fechas alta/baja del CLIENTE** → `clientes.fecha_alta` / `fecha_baja`.
- **Fechas alta/baja del SERVICIO** → `sucursales.fecha_alta` / `fecha_baja` (resuelve el pendiente del ABM).
