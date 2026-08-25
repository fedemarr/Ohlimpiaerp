# MÓDULO PROVEEDORES — Especificación completa

**Sesión:** Lautaro + Claude · 14/08/2026
**Para:** Fede

> **Módulo NUEVO** — crear de cero, dentro del área **LOGÍSTICA**.
>
> **Acompaña:** `mockup_proveedores.html` — diseño navegable
>
> **Datos reales analizados:** lista y compra Thames agosto 2026 · lista Nimi Profesional junio 2026 y compras junio/agosto

---

## 1. Qué es y dónde va

**Maestro general de proveedores**, como módulo propio en `Logística → Proveedores`.

> ⚠️ **NO va dentro de Pedido de productos** porque acá conviven proveedores de distinto tipo: productos de limpieza, reparación de máquinas, alquiler de máquinas, uniformes, etc.

Los demás módulos **apuntan a este padrón**:
- El catálogo de **Pedido de productos** referencia al proveedor por su código
- El módulo **Máquinas** usa los proveedores de reparación/alquiler

**Alta y edición:** LOGÍSTICA.

---

## 2. Padrón (vista principal)

### Código
**CÓDIGO correlativo automático:** `PROV-001`, `PROV-002`...

> 🔑 El código es el identificador que usan los demás módulos y, a futuro, el **plan de cuentas**.

### Columnas
`código · razón social · CUIT · rubros (chips) · última lista de precios con semáforo (vigente / desactualizada) · compras del año · estado ACTIVO/INACTIVO`

Click en la fila → abre la **FICHA**.

### Indicadores arriba
- Proveedores activos
- Cuántos tienen lista de productos
- Cuántos con lista desactualizada
- Compras del mes (todos)

---

## 3. Ficha del proveedor — DATOS

### Identificación
`razón social · CUIT · condición ante ARCA`

| Condición | Comprobante que emite |
|---|---|
| Responsable Inscripto | Factura A |
| Monotributo | Factura C |
| Exento | — |

### Contacto institucional
> ⚠️ **MAIL institucional y TELÉFONO en campos SEPARADOS** — no un campo "contacto" mezclado.

Más dirección.

### Pago
- **Condiciones de pago:** contado / cta cte 30 días / contra factura con OK de Logística...
- **CBU o alias y banco** — para pagos por transferencia de Finanzas; conecta con el módulo contable

### Operativa de compra
- **Frecuencia de pedido:** mensual / quincenal / a demanda
  > Permite que el sistema avise *"esta semana cierra el pedido a X"*
- **Plazo de entrega** en días
- **Mínimo de compra**, si hubiera

### Observaciones
Campo libre. Ahí viven cosas como:
> *"que no sea fragancia papaya, canela ni coco"*
> *"pedir lista actualizada todos los meses antes de comprar"*

### Adjuntos
Archivos por proveedor: constancia de inscripción ARCA · acuerdos de precios · contratos.

> Los contratos de alquiler de máquinas los referencia después el módulo **Máquinas**.

### Trazabilidad
Fecha de alta y usuario. **Toda edición queda en Auditoría.**

---

## 4. Ficha del proveedor — CONTACTOS

Tabla de personas de contacto, **igual al patrón del módulo Clientes**:

`NOMBRE · ROL · CELULAR · MAIL`

Con botón **"+ Agregar contacto"** y edición por fila. Un proveedor puede tener **varios contactos**.

### Roles parametrizables
**Arranque sugerido:** `VENDEDOR` · `ADMINISTRACIÓN` · `ENTREGAS` · `TÉCNICO` · `DUEÑO`

Logística puede agregar/editar roles desde una pantalla de gestión (**"Gestionar roles"**).

---

## 5. Rubros

**Multi-selección y parametrizables:**

`PRODUCTOS` · `REPARACIÓN MÁQUINAS` · `ALQUILER MÁQUINAS` · `UNIFORMES` · `OTRO`

Un proveedor puede tener varios.

> 🔑 **El rubro define qué secciones muestra la ficha:**
> - Rubro **PRODUCTOS** → catálogo / imports
> - Rubro **REPARACIÓN** → su actividad del módulo Máquinas (tickets, facturas contra acta)
> - etc.

---

## 6. Conexión con Pedido de productos

### Catálogo
El campo **Proveedor** del catálogo deja de ser texto y **apunta al CÓDIGO** del maestro. Cada producto pertenece a un proveedor.

### Imports
El import de la lista de precios **SE DISPARA** desde `Pedido de productos → Catálogo` *(donde vive el dato que modifica)*, pero queda **REGISTRADO en la ficha del proveedor**:

- Historial de imports: `fecha · archivo · cuántos costos actualizó · cuántas altas · usuario`
- "Última lista vigente"

### ⚠️ ALERTA lista desactualizada
Si la última lista importada tiene **más de N meses** *(parametrizable)*, el padrón y la ficha muestran alerta.

> **Caso real que motiva esto:** las órdenes de compra a Nimi de junio y agosto se valuaron con precios de **MAYO**, y la lista de junio vino **+10,9%** en todos los productos — la factura llega más cara que la orden y **nadie lo ve hasta que llega**.

### Compras por período
La ficha muestra las compras por período: `líneas · total a costo · estado de la orden · factura`.

> Sale del tab **Compras** de Pedido de productos.

---

## 7. Conexión con Máquinas y con el módulo contable

### Máquinas
Los proveedores de **reparación y alquiler** del módulo Máquinas salen de este padrón.

Su ficha muestra la actividad: `tickets del año · facturas observadas (control contra acta) · total facturado`.

### Contable *(futuro)*
Cuando se active el módulo contable, cada proveedor lleva su **SUBCUENTA** en el plan de cuentas:

```
Pasivo → Proveedores → PROV-xxx
```

- El **alta de proveedor genera también la subcuenta**
- Las facturas de compra **nacen imputadas** a la cta cte del proveedor correcto
- Los pagos la cancelan

**Mientras tanto**, en la ficha: campo `Cuenta contable` con chip `SE ASIGNA CON EL MÓDULO CONTABLE`.

---

## 8. Roles y permisos

| Rol | Responsabilidades |
|---|---|
| **LOGÍSTICA** | Da de alta, edita, gestiona rubros y roles de contacto, adjunta documentación |
| **FINANZAS** | Consulta; usa condiciones de pago y CBU para pagar; a futuro administra la cta cte contable |
| **RESTO** | Consulta *(por ejemplo, Máquinas para asignar proveedor a un ticket)* |

---

## 9. Datos de arranque (import inicial)

### PROV-001 — THAMES
- **Dirección:** Aguirre 736 (1414) CABA
- **Rubro:** PRODUCTOS
- **443 productos**
- **Lista vigente:** AGOSTO 2026
- **Compra mensual:** ~$9,7M en agosto

### PROV-002 — NIMI PROFESIONAL
- **Rubro:** PRODUCTOS
- **Distribuidor multimarca:** Diversey (DV), Johnson (SCJ), 3M, ITA, POL, Elegante...
- **560 productos**
- **Última lista:** JUNIO 2026 → ⚠️ **cargar con alerta**
- **Compras:** ~$2,5M/mes

### Pendiente
> Los **CUIT, contactos, CBU y condiciones de pago** reales los completa Logística al arrancar.

---

## 10. Hallazgo real — el valor del módulo

En los archivos actuales de compra a Nimi, el precio se calcula con **VLOOKUP** contra una hoja `"LISTA GENERAL - MAYO 2026"` que **nunca se actualizó**:

| Compra | Monto | Problema |
|---|---|---|
| **Junio** | $2.687.383 | Valuada a precios de mayo |
| **Agosto** | $2.522.735 | Valuada a precios de mayo |

Cuando la lista de junio ya había subido **+10,9%** en todos los productos.

Además hay **10 códigos comprados que ya no figuran** en la lista de junio *(posibles discontinuados)*.

> 🔑 Con el **maestro + import con vigencias + alerta de lista vieja**, este tipo de error desaparece.
