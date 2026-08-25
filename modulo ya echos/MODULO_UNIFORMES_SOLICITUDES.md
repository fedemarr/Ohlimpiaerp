# MÓDULO UNIFORMES — Solicitudes v2: circuito completo

**Sesión:** Lautaro + Claude · 18/08/2026
**Para:** Fede

> El módulo Uniformes **ya está construido**. Este documento define el **REDISEÑO del circuito de solicitudes** sobre lo existente. **Reemplaza al Google Form.**
>
> **Acompañan:**
> - `mockup_solicitud_uniformes.html` — módulo completo navegable
> - `constancia_entrega_uniformes.html` — constancia imprimible
>
> **Base:** "Política de Entrega de Uniformes" de RRHH (PDF)

---

## 1. Dos avisos sobre la política escrita *(para RRHH)*

> ⚠️ **Discrepancia de meses:** el formulario dice ropa de abrigo *"marzo a **AGOSTO**"*; la política escrita dice *"marzo y **SEPTIEMBRE**"*. **Unificar antes** de parametrizar la ventana en el sistema.

> ⚠️ **Responsables desactualizados:** la política nombra responsables que ya no trabajan en la cooperativa (Recepción y Logística) — actualizarla. Argumento más para el futuro módulo de **POLÍTICAS con versionado**.

---

## 2. Ventana ÚNICA de pedido

El botón **"+ Nuevo pedido"** del módulo y el **LINK externo** (el que hoy es Google Form) abren **LA MISMA VENTANA**, con las mismas validaciones. Por el link, el usuario primero se identifica.

### Paso 1 — Origen y retiro
- **SOLICITANTE:** detectado por el usuario de la sesión *(sin campo de nombre)*
- **FECHA:** automática
- **PUNTO DE RETIRO:** `RECEPCIÓN` (oficina central) o `DEPÓSITO MAURE` — viaja con el pedido para que Logística sepa desde dónde entrega cada uno
- **ORIGEN** (supervisor / auditoría / asociado directo / RRHH ingreso): sale del **rol del usuario**

### Paso 2 — Asociado
| Rol que carga | Qué ve |
|---|---|
| **SUPERVISOR** | SOLO SUS ASOCIADOS A CARGO — los operarios fijos de sus servicios; el sistema arma la lista de la asignación fija |
| **RRHH / Recepción** | Buscador completo |

Al elegirlo se muestran: servicio · fecha de ingreso · y el panel **"QUÉ LE CORRESPONDE HOY"** según la política *(punto 3)*.

### Paso 3 — Motivo
Tipificado, **define el cargo**:

`INGRESO` · `SEGUNDA MUDA` · `RENOVACIÓN` · `REUBICACIÓN` · `ROBO` *(exige denuncia adjunta)* · `DAÑO/EXTRAVÍO` · `PEDIDO EXTRA`

> El sistema **SUGIERE** el motivo según el historial.

### Paso 4 — Prendas
Cada prenda con:
- **TALLE PRECARGADO DEL LEGAJO** del asociado *(editable por el supervisor)*
- **STOCK disponible a la vista** *(módulo Stock; sin stock = bloqueada)*
- Chip `SIN CARGO` / `CON DESCUENTO` calculado por la política
- **Resumen en vivo:** total a descontar y plan de cuotas

### Paso 5 — Adjuntos y envío
Foto del daño · denuncia policial · observaciones.

**Salidas:**
- `GUARDAR BORRADOR` — opcional: queda editable, no viaja
- `ENVIAR` — directo a Logística

> El borrador **NO es una etapa obligatoria**.

---

## 3. La política valida SOLA *(reemplaza la autorización de RRHH)*

El sistema conoce fecha de ingreso, historial de entregas y servicio — aplica la Política de Entrega **automáticamente**.

### SIN CARGO
| Caso | Condición |
|---|---|
| **INGRESO** | Equipo básico: 1 muda + 1 calzado |
| **SEGUNDA MUDA** | Al cumplir **3 meses** |
| **RENOVACIÓN** | Cada **6 meses**, CONTRA ENTREGA DEL USADO |
| **REUBICACIÓN** | Con uniforme distinto, contra entrega del anterior |
| **ROBO** | Con denuncia policial adjunta — ⚠️ **sin denuncia el pedido NO se puede enviar** |
| **CAMPERA, POLAR y CALZADO** | Única entrega sin cargo desde el alta |
| **Ropa de abrigo** | Solo en ventana *(parametrizable)* |

### CON DESCUENTO
- Pedido extra fuera de plazos
- Daño o extravío
- Segunda campera / calzado / polar

> En **cuotas fijas** sobre el retiro.

---

## 4. Máquina de estados *(sin autorización previa)*

```
BORRADOR (opcional)
   ↓
ENVIADO A LOGÍSTICA
   ↓
EN PREPARACIÓN
   ↓
LISTO PARA RETIRO
   ↓
RETIRADO POR SUPERVISOR  ← arranca el reloj de 15 días
   ↓
ENTREGADO — CONSTANCIA PENDIENTE
   ↓
CERRADO
```

### BORRADOR
Opcional — solo si el que carga eligió guardarlo. **Acciones:** editar / enviar / cancelar.

### ENVIADO A LOGÍSTICA
Al enviar cae **DIRECTO** en la bandeja de Logística.

> 🔑 **Nadie autoriza: la política ya validó.**

Cancelable.

### EN PREPARACIÓN
Logística arma. Al completar: **DESCUENTA STOCK** y el sistema **GENERA LA CONSTANCIA**.

### LISTO PARA RETIRO
| Punto de retiro | Flujo |
|---|---|
| **MAURE** | Queda listo en depósito |
| **RECEPCIÓN** | Estado intermedio `EN TRÁNSITO A RECEPCIÓN` → Recepción marca "recibido" → `LISTO EN RECEPCIÓN` |

> **Recepción CAMBIA DE ROL:** ya no autoriza, es el **custodio del punto de retiro oficina**.

Notificación al supervisor: *"tu pedido está listo en X"*.

### RETIRADO POR SUPERVISOR
Quien lo tiene (Logística en Maure / Recepción en oficina) marca el retiro y entrega la **constancia impresa**.

> ⏱️ **Acá arranca el RELOJ DE 15 DÍAS.**

### ENTREGADO — CONSTANCIA PENDIENTE
El supervisor:
1. Hace **firmar la constancia**
2. Registra la **DEVOLUCIÓN DEL USADO** si el motivo la exigía
3. Adjunta la **FOTO** de la constancia firmada

> A los **15 días sin constancia**: alerta al supervisor + aviso a RRHH.

### CERRADO
Constancia devuelta *(y usado devuelto si correspondía)*.

### Casos especiales
| Caso | Comportamiento |
|---|---|
| **PEDIDO DIRECTO DEL ASOCIADO** | Retira él mismo en Recepción y firma en el momento — **salta** el retiro del supervisor y el reloj |
| **INGRESO** | Lo retira RRHH el día del ingreso, firma en la capacitación |
| **AUDITORÍA** | Genera el pedido por deterioro y sigue el circuito normal del supervisor del servicio |

---

## 5. Constancia de Entrega de RT y EPP *(imprimible)*

> Ver `constancia_entrega_uniformes.html`

### Encabezado y datos
- Membrete + **N° correlativo** (`C-AAAA-xxxx`) + fecha
- Pedido de origen + punto de retiro
- **Asociado:** nombre, socio, DNI, servicio, fecha de ingreso
- Quién entrega
- Motivo

### Detalle
`cantidad · prenda · talle · CARGO POR LÍNEA (sin cargo / con descuento con valor)`

Si hay descuento: **recuadro con el PLAN**
> *"N cuotas fijas de $X desde la liquidación de MES"*

El operario firma **sabiendo exactamente qué le descuentan**.

### Devolución del usado
Casillero `SÍ`/`NO` cuando el motivo la exige. Si `NO`, queda **pendiente en el sistema**.

### Cierre
- Leyenda de conformidad con resumen de la política
- **Tres firmas:** asociado (con aclaración y DNI) · quien entrega · fecha

> Formato compatible con **planilla de entrega de EPP (Res. SRT 299/11)** — sirve de respaldo ante auditorías y para el futuro módulo **Seguros**.

### Circulación
Se imprime una copia que **viaja con el pedido**; vuelve **FIRMADA COMO FOTO** adjunta dentro de los 15 días.

---

## 6. Descuentos — cuándo y cómo

### Disparador
> 🔑 **EL DESCUENTO SE ACTIVA CON LA FIRMA de la constancia.**

Antes no existe deuda: **ni al enviar, ni al preparar, ni al retirar**.

El **pedido directo del asociado** firma al retirar → se activa ahí.

### Plan
**N CUOTAS FIJAS** — cantidad **parametrizable** en Configuración *(hoy 4)* — desde la liquidación del período en curso *(si cerró, desde la siguiente)*.

> Viaja solo a la liquidación de retiros.

### Valor
**ÚLTIMO PRECIO DE REPOSICIÓN VIGENTE** de la prenda.

> ⚠️ **NO el PPP.** El descuento debe alcanzar para **recomprarla**; el PPP queda para la valuación contable del stock.

Criterio parametrizable.

### Tab "Descuentos aplicados"
Muestra cada plan con constancia adjunta, cuotas descontadas y saldo.

> **BAJA con cuotas pendientes** → el saldo restante se descuenta **COMPLETO** en la última liquidación.

---

## 7. Devoluciones por baja

La **BAJA del asociado dispara sola** la ORDEN DE DEVOLUCIÓN con los uniformes entregados a cargo de la cooperativa.

| Situación | Resultado |
|---|---|
| **No devuelto** | Se descuenta su valor en **una única cuota** del último retiro |
| **Prendas que el asociado ABONÓ y devuelve** | **REINTEGRO** |

Tab propio con el detalle **prenda por prenda** (devuelto ✔/✘).

> Se mantiene la opción **"+ Orden de devolución manual"**.

---

## 8. Tabs y visibilidad

### Tabs
| Tab | Contenido |
|---|---|
| **PENDIENTES** | Bandeja operativa: columna RETIRO 📍 filtrable, días transcurridos con alerta, ACCIÓN según estado y rol |
| **TODOS LOS PEDIDOS** | Historial permanente: cerrados con constancia adjunta, cancelados y en curso. Filtros por motivo/estado/año · export · base de estadísticas |
| **DESCUENTOS APLICADOS** | *(punto 6)* |
| **DEVOLUCIONES POR BAJA** | *(punto 7)* |

El botón **"+ Nuevo pedido"** abre la ventana única.

### Visibilidad por rol
> Cada usuario ve **LO SUYO**.

- **Supervisor:** solo los pedidos de sus operarios *(propios o generados por Auditoría sobre sus servicios)*
- **Logística y RRHH:** ven todo
- **Admin:** todo

---

## 9. Conexiones

### STOCK
- Cada **preparación completada** = SALIDA de stock *(categoría uniformes)*
- Las **compras de reposición** = entradas
- Stock inicial ya entregado: `STOCK_INICIAL_UNIFORMES_2026-08.xlsx`

### LEGAJOS
Los **TALLES por prenda** viven en el legajo del asociado y **precargan** el pedido.

> Si el supervisor los corrige, **proponer actualizar el legajo**.

### LIQUIDACIÓN DE RETIROS
Recibe los planes de cuotas **activados por firma** y los descuentos/reintegros por baja.

### Futuro
- La **Política de Entrega versionada** será la primera del futuro módulo **POLÍTICAS**
- La **constancia EPP** alimenta el futuro módulo **SEGUROS**

---

## 10. Configuración *(parametrizable)*

- **Cantidad de cuotas** del descuento *(hoy 4)*
- **Ventana de ropa de abrigo** (meses)
- **Plazos de política:** segunda muda 3 meses · renovación 6 meses
- **Plazo de devolución de constancia** (15 días) y alertas
- **Criterio de valuación del descuento:** reposición vigente / PPP
- **Puntos de retiro**
- **Motivos y prendas** del catálogo
