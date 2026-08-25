# MÓDULO MÁQUINAS — Especificación completa

**Sesión:** Lautaro + Claude · 13/08/2026
**Para:** Fede

> **Módulo nuevo** — hoy figura como "Próximamente" en el menú.
>
> **Referencia de datos reales:** Anexo 053 Historial de Mantenimiento — 3.015 líneas (2020-2026), $128M, 43 máquinas.

---

## 1. Alcance

Gestión integral del parque de máquinas:
- **PROPIAS** — compradas
- **ALQUILADAS** — pago mensual con factura del proveedor

> No todos los servicios llevan máquina; en un servicio puede haber propias o alquiladas.

**El módulo cubre:** padrón · ubicación con historial · tickets de reparación (interna/proveedor) · consumibles · baterías con previsión de recambio · mantenimiento preventivo · conexión de costos al Económico.

**Opera:** LOGÍSTICA.

---

## 2. Padrón — ficha de máquina

### Identificación
`N° de máquina` (interno, ya existe la numeración) · tipo/modelo · marca · foto

### Propiedad
| Tipo | Datos |
|---|---|
| **PROPIA** | Fecha y valor de compra |
| **ALQUILADA** | Proveedor, costo mensual, N° de contrato |

### Energía
`BATERÍA` o `CABLE`

> Las de batería llevan el esquema del **punto 6**.

### Estados
| Estado | Descripción |
|---|---|
| **ACTIVA** | En servicio |
| **DEPÓSITO** | En Logística |
| **EN REPARACIÓN** | Interna o proveedor — vinculada al ticket |
| **BAJA** | Con motivo tipificado: rota sin arreglo · vendida · devuelta al proveedor (si era alquilada) |

> ⚠️ La baja **conserva todo el historial**.

### Ubicación
Servicio actual (código del maestro) o depósito. **Historial completo de movimientos.**

---

## 3. Movimientos de ubicación

> Registra **SOLO LOGÍSTICA** — son quienes trasladan las máquinas.

**Cada movimiento:** `fecha · origen → destino (servicio/depósito/taller proveedor) · motivo · usuario`

El **supervisor del servicio receptor** recibe notificación.

> 🔑 El historial de ubicaciones permite saber **dónde estuvo cada máquina en cada mes** — necesario para imputar costos al centro de costos correcto.

---

## 4. Tickets de reparación — el circuito completo

### ETAPA 1 — REPORTE
El **operario** detecta el problema y lo reporta **DIRECTO desde su celular**:
- Máquina *(el sistema ofrece la de su servicio)*
- Tipo de problema *(catálogo parametrizable)*
- Descripción
- Foto opcional

> El **SUPERVISOR** del servicio queda notificado **SIEMPRE**. Hoy el reporte pasa por él; el objetivo es reporte directo para ganar tiempo, **sin que pierda visibilidad** de sus máquinas.

Notificación a Logística. Máquina → `con incidencia`.

### ETAPA 2 — ANÁLISIS REMOTO
Logística analiza y contacta al operario para intentar revertirlo en el momento.

**Resultado registrado:**
- `RESUELTO REMOTO` → cierra tipificado
- `REQUIERE VISITA INTERNA`

### ETAPA 3 — VISITA INTERNA
Se agenda día y horario (lo antes posible; **SLA parametrizable**, el sistema mide tiempos por etapa). Notifica a supervisor y operario.

**Miguel** (asociado de Logística) repara y registra qué hizo: trabajo tipificado + repuestos usados.

> 💰 **Costo registrado: SOLO repuestos** — sus horas van por su retiro.

**Resultado:** `RESUELTO INTERNO` · o `LO SUPERA → DERIVAR A PROVEEDOR` con diagnóstico.

### ETAPA 4 — PROVEEDOR
Se convoca al proveedor al servicio *(lo habitual es reparar en el lugar)*.

**ACTA DE VISITA obligatoria:** alguien presencia la reparación — Miguel o el supervisor, según disponibilidad — y registra qué hizo el proveedor y qué repuestos cambió.

> ⚠️ **Sin acta no se puede aprobar la factura.**

### ETAPA 5 — CONTROL DE FACTURA
Cuando llega la factura del proveedor, **LOGÍSTICA la controla línea por línea contra el acta** — lo facturado debe estar respaldado por lo presenciado.

Con el OK de Logística, **FINANZAS** la imputa por cuenta corriente del proveedor (asignada a la máquina y su servicio) y la paga.

**Factura observada** → se reclama la diferencia y queda registrado.

---

### Presupuesto y aprobación *(proceso objetivo)*
Hoy se trabaja directo con OS; la meta es que el proveedor **presupueste antes** y haya **aprobación registrada previa** a la reparación.

> Dejar el paso `PRESUPUESTO → APROBACIÓN` **preparado en el flujo** (activable por parámetro), con **aprobador configurable**.

### Taller y reemplazo
Si excepcionalmente el proveedor se lleva la máquina, se registra el movimiento a `taller proveedor` y Logística puede asignar una máquina propia de depósito como **reemplazo temporal**, vinculada al ticket.

> *A confirmar operativamente por Lautaro — dejarlo soportado.*

### Transversal
Cada cambio de etapa **notifica a quien corresponde** y guarda fecha/hora y responsable.

**Tipificaciones parametrizables:** tipos de problema · trabajos · motivos de derivación · motivos de observación de factura.

**Para poder sacar estadísticas:**
- % resuelto remoto / interno / proveedor
- Tiempo promedio por etapa
- Fallas recurrentes por modelo
- Costo por máquina y por servicio

---

## 5. Consumibles

> Se administran **DENTRO del módulo Máquinas**, separado del stock general de Logística.

- Catálogo de consumibles **por máquina o modelo**
- **Frecuencia de reposición en meses** (parametrizable)
- El sistema **avisa** cuándo toca recomprar/reponer
- Se registran **compras** (costo) y **entregas** (a qué máquina/servicio) → imputación al centro de costos del servicio

---

## 6. Baterías

### Parámetro
Catálogo de tipos de batería con **VIDA ÚTIL EN MESES** parametrizable.

### Colocación y proyección
En cada máquina a batería se registra la colocación: `fecha · tipo · costo`.

El sistema **proyecta la fecha de recambio** y avisa con anticipación configurable — *"que no nos agarre en bolas"*.

### Previsión económica
El costo estimado del recambio se **previsiona mes a mes** en el Económico (fila "previsión baterías" que ya existe), y al hacer el cambio real **se registra contra la previsión**.

---

## 7. Conexión con el Económico

### Alquileres
- En el **Económico** va el ALQUILER GENERAL
- En el **CENTRO DE COSTOS** se imputa al servicio donde está cada máquina *(usa el historial de ubicación del mes)*

### Amortización de reparaciones
Igual que hoy: se trabaja con **PREVISIÓN FIJA VS REAL**.

- Una **cuota mensual estable** — el sistema la propone según promedio histórico; Finanzas la ajusta — para mantener rentabilidad estable
- El **gasto real** registrado aparte
- El Económico muestra **previsión, real y diferencia**

> Aplica a **reparaciones**. Las baterías tienen su propia previsión *(punto 6)*.

### Costos
Todo imputado a **máquina + servicio + mes**:
- Repuestos internos *(solo costo repuestos)*
- Facturas de proveedor *(por cta cte)*
- Consumibles
- Baterías

---

## 8. Mantenimiento preventivo

> Hoy **no se hace**; el módulo lo incorpora.

- **Frecuencia parametrizable** por máquina o modelo *("cada X meses")*
- **Agenda automática** con avisos a Logística
- **Registro de cada preventivo realizado** (tipificado, con repuestos si hubo)

> Las estadísticas separan **preventivo** de **correctivo**.

---

## 9. Roles y permisos

| Rol | Responsabilidades |
|---|---|
| **OPERARIO** | Reporta incidencias de su máquina *(celular)* |
| **SUPERVISOR** | Notificado **SIEMPRE** de todo lo que pasa con las máquinas de sus servicios; puede presenciar y registrar actas de proveedor |
| **LOGÍSTICA** | **Dueño del módulo:** padrón, movimientos, tickets, agenda de Miguel, control de facturas contra acta, consumibles, baterías, preventivos |
| **FINANZAS** | Imputa y paga facturas de proveedor *(con OK previo de Logística)*; ajusta las cuotas de previsión |

---

## 10. Import inicial

> ⚠️ **PENDIENTE** por decisión de Lautaro *("todavía no")*.

Cuando se active, el **Anexo 053 hoja BASE NORMALIZADA** ya está analizado y listo para convertirse en el pack de import:
- Padrón de **43 máquinas**
- Historial de reparaciones **2020-2026** con conceptos tipificados
- Última ubicación
- Historial de baterías

> 🔑 **Diseñar las tablas para recibirlo.**
