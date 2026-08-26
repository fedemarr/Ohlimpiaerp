# PEDIDOS DE PERSONAL — Versión 1 para salir

**Sesión:** Lautaro + Claude · 26/08/2026
**Para:** Fede

> **Acompaña:** `mockup_pedidos_personal_v1.html`
>
> **Contexto:** Gabi quiere el módulo funcionando YA. Operaciones (Santiago Ayala) carga los pedidos y RRHH los trabaja desde el sistema.
>
> Esta **v1 son ajustes sobre lo que ya está construido** — el módulo actual queda, se le afinan campos y se le agrega el circuito de estados.

---

## 1. El principio de la v1: módulo INFORMATIVO

> 🔑 Este módulo **registra y sigue el pedido, no ejecuta nada**.

La conexión real del asociado con el servicio y el supervisor **nace en el ALTA DE ASOCIADO** y vive en el legajo — como siempre: **la acción vive donde vive el dato**.

Al completar un pedido **solo se registra información** (cómo se cubrió, quién, cuándo arranca).

> ⚠️ El módulo **NUNCA escribe** en legajos, grillas ni reasignaciones.

**Por qué:** hace la v1 rápida de salir y sin riesgo de pisar datos de otros módulos. Más adelante, cuando estén las integraciones, se le pueden enchufar los automatismos ya diseñados **sin tirar nada**.

---

## 2. El circuito completo (quién hace qué)

```
OPERACIONES carga  →  PENDIENTE
                         ↓  (RRHH toma)
                      EN BÚSQUEDA · usuario
                         ↓  (RRHH cubre)
                      CUBIERTO → Historial

     ↓ en cualquier momento
  CANCELADO (motivo obligatorio) → Historial
```

### 1. Carga — OPERACIONES (Santiago)
Lo carga desde **"+ Nuevo pedido"**. Queda en estado `PENDIENTE` y 🔔 **le salta la notificación a RRHH**.

### 2. Toma — RRHH
Entra al pedido y toca **"EN BÚSQUEDA"**: el estado pasa a `EN BÚSQUEDA` con **su usuario visible en la tabla**, y 🔔 **le avisa a quien lo cargó** que ya se está trabajando.

### 3. Cobertura — RRHH
Cuando aparece la persona, toca **"✔ PEDIDO CUBIERTO"** y carga:
- **Cómo se cubrió:** ingreso nuevo / asociado interno
- **Nombre y apellido**
- **N° de socio** si ya tiene legajo *(queda como referencia clickeable, informativa)*
- **Fecha de inicio**
- **Observación**

El pedido pasa a `CUBIERTO`, **sale de los activos**, va al Historial y 🔔 notifica a quien lo cargó y al supervisor.

### 4. Cancelación
En **cualquier momento** el pedido se puede CANCELAR con **motivo obligatorio** *(lista parametrizable en Configuración)*:

`el cliente redujo horas` · `se cubrió por otro lado` · `servicio dado de baja` · `duplicado` · `otro`

También va al Historial con su motivo.

> 🔑 **Ningún pedido muere en silencio.**

---

## 3. Formulario "+ Nuevo pedido" — ajustes sobre el actual

> La estructura actual del formulario **queda** (horario y días, perfil del personal, certificaciones, urgencia, observaciones). Estos son los cambios:

### CARGADO POR *(campo NUEVO)*
Automático con el **usuario logueado** *(ej. `s.ayala` — Centro de operaciones)*. **No se elige.**

> Es distinto del supervisor.

### SUPERVISOR — con CASCADA
Se mantiene el selector, pero al elegir el supervisor, el selector de **SERVICIO se filtra** y muestra solo **LOS SERVICIOS DE ESE SUPERVISOR**.

> Si el que entra es un supervisor con su propio usuario, este campo **viene fijo con él mismo**.

### SERVICIO / CLIENTE
**Selector** (no texto libre), filtrado por el supervisor elegido.

Al elegirlo, la **ZONA se completa sola** desde el alta del servicio *(dato de Comercial)* — deja de elegirse a mano.

### PUESTO
El desplegable trae las **categorías ACTIVAS del módulo Categorías**.

> ⚠️ Hoy tiene una lista propia vieja (Operario A/B, etc.). Misma corrección que el alta de asociado: **una sola fuente, nunca dos listas.**

Mostrar el **valor hora** al lado del nombre suma.

### CANTIDAD *(campo nuevo)*
Un pedido de 2 personas es **UN pedido con cantidad 2**.

> Hoy se cargan duplicados.

### FECHA LÍMITE *(campo nuevo)*
Es lo que hace **envejecer la urgencia**: pedido con urgencia `Alta` y **+N días sin movimiento** *(N parametrizable en Configuración)* pasa a `VENCIDO` en rojo.

### PERFIL DEL PERSONAL
> Queda **EXACTAMENTE como está**:

| Campo | Opciones |
|---|---|
| **Género** | — / F/M / Femenino / Masculino |
| **Experiencia** | — / Sin experiencia específica / Con experiencia requerida |
| **Tipo de tarea** | — / Limpieza general / Limpieza profunda / Mantenimiento / Cuidado de espacios |
| **Turno** | — / Mañana / Tarde / Noche / Rotativo |
| **Disponibilidad horaria** | — / Full time / Media jornada / Fines de semana / Solo nocturno |
| **Certificaciones** | Libreta sanitaria / Curso manipulación de alimentos / Trabajo en altura / Habilitación espacios de salud *(lista parametrizable ⚙ a futuro)* |

### N° DE PEDIDO
El pedido recibe un **número automático** (`PP-XXX`) para poder nombrarlo.

---

## 4. La tabla de Activos

### Columnas
`N° · Fecha · Cargado por · Servicio · Supervisor · Puesto (chip) · CANT. · Fecha límite · DÍAS (antigüedad) · Urgencia · Estado · Ver`

### Estados visibles
| Estado | Color |
|---|---|
| **PENDIENTE** | 🟠 Naranja |
| **EN BÚSQUEDA · usuario** | 🔵 Azul |
| **VENCIDO** | 🔴 Rojo, fila pintada — cuando urgencia Alta + N días sin movimiento |

> Al completarse o cancelarse, **sale de activos**.

### KPIs arriba
- Pendientes
- En búsqueda
- Vencidos
- Cubiertos del mes
- **Tiempo promedio de cobertura** *(días entre fecha del pedido y fecha de inicio)*

### Alcance por rol
- Cada **supervisor** ve solo SUS pedidos
- **Operaciones y RRHH** ven todo

> Misma regla que el resto del sistema.

---

## 5. Ventana del pedido *(al clickear "Ver")*

### Lectura
Todos los datos + perfil solicitado.

### Historial del pedido
Quién lo creó y cuándo · quién lo tomó · notificaciones enviadas · cierre.

> Todo con **usuario y fecha**.

### Botones por estado
| Estado | Botones |
|---|---|
| **PENDIENTE** | "En búsqueda" |
| **EN BÚSQUEDA** | "Pedido cubierto" |
| **Siempre** | "Cancelar" y "Editar" |

---

## 6. Tab Historial

### Contenido
**Completados:** con quién se cubrió · tipo (ingreso nuevo / interno) · N° de socio clickeable si tiene · días de cobertura · quién lo cerró

**Cancelados:** con motivo

**Filtros:** por año, resultado y supervisor + **export**

> El dato "Persona asignada" es **informativo**; el link al legajo es **solo referencia**.

De acá sale el **KPI de tiempo de cobertura**.

---

## 7. Notificaciones — las 3 de la v1

| # | Disparador | Destinatario |
|---|---|---|
| 1 | Pedido **CREADO** | 🔔 RRHH |
| 2 | Pedido **TOMADO** en búsqueda | 🔔 Quien lo cargó |
| 3 | Pedido **COMPLETADO** (o cancelado) | 🔔 Quien lo cargó **y** el supervisor del servicio |

---

## 8. Qué NO entra en la v1 *(ya diseñado, para después)*

### Versión completa
- Alta de asociado **precargada desde el pedido**
- **Buscador de candidatos internos** rankeado
- **Impactos automáticos:** fila en grilla, temporal con autorización, movimiento en legajo, avisos a Seguros
- Conexión con **Reasignaciones**

> 🔑 La v1 **no lo bloquea**: cuando estén las integraciones se enchufan sobre este mismo circuito.

### Mejora opcional barata
El alta de asociado podría **SUGERIR vincular un pedido abierto** para autocompletar el campo "cubierto con".

> Sigue siendo **informativo, nunca automático**.
