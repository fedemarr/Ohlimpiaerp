# Delta de cambios — Satélites del área Comercial v1.1

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulos afectados:** Gestión de precios + CRM + Feedback de clientes + Gestión de cobros
**Autor:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-09
**Versión:** 1.1 (delta sobre lo existente)

---

## ⚠️ Cómo usar este documento

Este documento es un **delta de cambios integrado** sobre 4 módulos satélite del área Comercial que **ya existen en el sistema** pero **no se usan** en la práctica.

Los 4 módulos:
1. **Gestión de precios** — Propuestas individuales por objetivo + Paritarias masivas.
2. **CRM Comercial** — Leads de nuevas ventas + Seguimiento de renovaciones.
3. **Feedback de clientes** — Reclamos + No Conformidades + Felicitaciones + Sugerencias.
4. **Gestión de cobros** — Con importación de Excel Tango.

Los 4 dependen del delta ya cerrado de **Clientes y Objetivos** (`docs/DELTA_comercial_clientes_objetivos_v1.1.md`) — que debe implementarse **primero**.

**Base del delta:**
- Módulos actuales en `src/legacy.js`.
- Ver `docs/INVENTARIO_area_comercial_satelites_legacy.md` para el detalle del estado actual.

**Contexto crítico:**
- **Persistencia casi nula:** solo Paritarias persiste. Todos los otros son 100% en memoria — se pierden al recargar.
- El proceso real hoy se maneja por **Excel + carpetas + WhatsApp + email**.
- La facturación sigue en **Tango** (área Finanzas). Ohlimpia solo importa datos vía Excel para seguimiento.
- El diseño **financiero** (proyección de ingresos, flujo de caja) se está haciendo **por fuera del sistema** — se integrará más adelante.

**Antes de aplicar los cambios:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, y los dos inventarios (Clientes y Satélites).

---

## 1. Estructura organizacional relevante

**Área Comercial:**
- **Gerente Comercial:** Jorgelina Bianchi (también Secretaria del Consejo).
- **Rol dedicado a cobros:** una persona del equipo de Comercial.
- **Aprobación de precios y paritarias:** Gerente Comercial.

**Área Operaciones (participa en Feedback):**
- Supervisores pueden cargar Reclamos, NC, Felicitaciones directamente desde el terreno.

**Área Finanzas (participa en Cobros):**
- Finanzas factura en Tango.
- Finanzas exporta Excel de Tango para pasar a Comercial.
- Comercial actualiza estado en Ohlimpia.

---

## 2. Estado actual del área comercial (diagnóstico)

### 2.1 Cosas que funcionan
- Paritarias persiste (parcialmente).
- Menús y permisos configurados.
- Modelos de datos ricos (aunque no persisten).
- Referencias cruzadas conceptuales entre módulos.

### 2.2 Problemas críticos identificados

**🔴 Persistencia casi nula.**
- `paritarias` y `sugerencias` sí en `_SM`.
- `propuestasPrecios`, `leads`, `reclamos`, `noConformidades`, `facturas`, `cobros`, `historialImportaciones` **NO están en `_SM`**.
- `supaSync` para esas claves es no-op → **los datos se pierden al recargar**.

**🔴 "Felicitaciones" no existe como estructura.**
- El término solo aparece en Competencia como `felicit*25` (demo).
- No hay tabla ni flujo — hay que crearlo desde cero.

**🔴 Sin hooks reales entre módulos.**
- No hay integración Reclamos ↔ Competencia (para el impacto en puntos).
- No hay integración Precios ↔ Categorías.
- No hay integración CRM ↔ Clientes/Objetivos.

**⚠️ Patrón sistémico de `.map()` truncados.**
Varias tablas y cards de detalle emiten `<div>` vacíos:
- Pipeline CRM.
- Historial de acciones de leads.
- Historial de importaciones.
- Detalles de Reclamos y NC.

**⚠️ CRM cruza clientes por texto libre.**
`lead.empresa` es texto, no FK. Cuando el lead pasa a "Contrato firmado", no hay conversión automática a cliente/objetivo.

**⚠️ "Análisis IA" son toasts vacíos.**
`analizarReclamosIA` y `analizarCobrosIA` solo muestran mensajes. No hay IA real.

### 2.3 Estrategia del delta

- **Persistir todo lo que no persiste** (crítico para que el sistema sirva de algo).
- **Crear estructura de Felicitaciones y Sugerencias del cliente** desde cero.
- **Cablear hooks** entre los 4 satélites y con Clientes/Objetivos/Competencia.
- **Consolidar los 5 tipos de feedback** en un solo módulo con 5 tabs.
- **Preparar tabla `compromisos_pago`** como puente para el futuro módulo financiero.
- **Corregir bugs de UI** (mapas truncados).

---

# PARTE A — MÓDULO GESTIÓN DE PRECIOS

## 3. Contexto — Precios

### 3.1 Dos flujos que coexisten

**Flujo A — Propuestas de precios individuales:**
- Renegociación puntual con un cliente por un objetivo específico.
- Ejemplo: cliente pide bajar el precio de un servicio; Comercial propone nuevo valor; Gerente aprueba.
- Impacto: cambio de precio de UN objetivo.

**Flujo B — Paritarias masivas:**
- Aumento salarial que se traslada a los precios facturados a los clientes.
- Ejemplo: paritaria del 15% aplicada a todos los objetivos con cláusula "Paritarias".
- Impacto: cambio de precio de N objetivos simultáneamente.

Ambos flujos siguen. Son procesos operativos distintos.

### 3.2 Actores

- **Comercial (Jorgelina + equipo):** carga las propuestas.
- **Cliente:** aprueba (por fuera del sistema — email, reunión, WhatsApp).
- **Gerente Comercial (Jorgelina):** aprueba en el sistema una vez que el cliente aceptó.
- **El nuevo precio impacta en la facturación desde la fecha de vigencia.**

### 3.3 Flujo del sistema

```
[Comercial ve propuesta pendiente para un objetivo]
  ↓ (cliente aprueba por fuera)
[Comercial carga la propuesta en el sistema con nuevo valor + fecha vigencia]
  ↓
[Estado: Pendiente aprobación Gerente]
  ↓ (Gerente Comercial aprueba)
[Estado: Aprobada]
  ↓
[A partir de fecha vigencia, el precio del objetivo se actualiza]
  ↓
[historial_precios_objetivo registra la nueva vigencia]
```

## 4. Cambios en Precios

### 🔴 Cambio A1 — Persistir propuestas de precios

**Qué hay hoy:**
- `DB.propuestasPrecios` no está en `_SM`.
- Los datos viven solo en memoria.

**Qué cambia:**
- Mapear `propuestasPrecios: 'propuestas_precios'` en `_SM`.
- Crear tabla nueva.

**SQL nuevo:**

```sql
-- v028_propuestas_precios.sql
BEGIN;

CREATE TABLE public.propuestas_precios (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Referencias
  objetivo_id_local      text NOT NULL,       -- ref a objetivos
  objetivo_codigo        text NOT NULL,       -- desnormalizado
  cliente_id_local       text NOT NULL,       -- desnormalizado
  cliente_nombre         text NOT NULL,       -- desnormalizado
  
  -- Valores
  valor_anterior         numeric(12,2) NOT NULL,
  valor_hora_anterior    numeric(10,2),
  valor_propuesto        numeric(12,2) NOT NULL,
  valor_hora_propuesto   numeric(10,2),
  variacion_pct          numeric(6,2),        -- calculado
  
  -- Justificación
  motivo                 text NOT NULL,       -- Ajuste de mercado / Nuevo contrato / etc.
  observaciones          text,
  
  -- Vigencia
  fecha_vigencia         date NOT NULL,       -- desde cuándo aplica el nuevo valor
  
  -- Estado y aprobación
  estado                 text NOT NULL DEFAULT 'Borrador',
    -- Borrador / Pendiente aprobación Gerente / Aprobada / Rechazada / Anulada
  
  cargado_por            text NOT NULL,
  fecha_carga            timestamptz NOT NULL DEFAULT now(),
  
  aprobado_por           text,                -- Gerente Comercial
  fecha_aprobacion       timestamptz,
  observaciones_aprobacion text,
  
  motivo_rechazo         text,
  fecha_rechazo          timestamptz,
  rechazado_por          text,
  
  -- Adjuntos (mail del cliente, acta, etc.)
  adjuntos               jsonb,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pp_objetivo ON public.propuestas_precios(objetivo_id_local) WHERE NOT anulado;
CREATE INDEX idx_pp_estado   ON public.propuestas_precios(estado) WHERE NOT anulado;
CREATE INDEX idx_pp_vigencia ON public.propuestas_precios(fecha_vigencia) WHERE NOT anulado;

COMMIT;
```

### 🔴 Cambio A2 — Flujo formal de aprobación

**Qué hay hoy:**
- Función `aprobarPrecioPorGerente` existe pero no cambia estado formal.

**Qué cambia:**
Flujo completo:

**Estados:**
| Estado | Descripción |
|---|---|
| Borrador | Comercial cargando |
| Pendiente aprobación Gerente | Cliente aprobó (por fuera), esperando Gerente Comercial |
| Aprobada | Gerente aprobó. El precio impacta desde `fecha_vigencia`. |
| Rechazada | Gerente rechazó con motivo |
| Anulada | Anulada administrativamente |

**Transiciones:**

```
[Borrador]
  ↓ (Comercial eleva)
[Pendiente aprobación Gerente]
  ↓ (Gerente aprueba)
[Aprobada]
  → dispara actualización del precio del objetivo con vigencia
  → registra nueva entrada en historial_precios_objetivo

[Pendiente aprobación Gerente]
  ↓ (Gerente rechaza con motivo)
[Rechazada]
```

### 🔴 Cambio A3 — Vista comparativa lado a lado

**Qué hay hoy:**
- La vista actual muestra tablas simples.

**Qué cambia:**
Vista de detalle de una propuesta con comparación:

**Layout:**

| **Actual** | **Propuesto** |
|---|---|
| Valor mensual: $X | Valor mensual: $Y |
| Valor hora: $A | Valor hora: $B |
| Vigente desde: fecha | Vigente desde: fecha propuesta |
| Modelo: X | Modelo: Y |

**Variación calculada:**
- Diferencia absoluta.
- Porcentaje de variación.
- Impacto anualizado.

**Adjuntos:** correo del cliente, acta, etc.

### 🔴 Cambio A4 — Hook con historial de precios del objetivo

Al aprobar la propuesta:
- Se dispara actualización en `historial_precios_objetivo` (tabla del delta de Clientes/Objetivos):
  - Se cierra la vigencia anterior con `vigencia_hasta = fecha_vigencia - 1 día`.
  - Se crea nueva vigencia con `vigencia_desde = fecha_vigencia`.
- El `objetivos.valor` y `objetivos.valor_hora` se actualizan al valor vigente (al momento de aprobar, si `fecha_vigencia <= hoy`, o en batch cuando llegue).

### 🟡 Cambio A5 — Paritarias con generación masiva

**Qué hay hoy:**
- Paritarias persiste pero sin flujo de aprobación estructurado.

**Qué cambia:**

**Flujo de paritaria:**

1. **Comercial crea paritaria** con:
   - Nombre (ej: "Paritaria Junio 2026").
   - Porcentaje o monto de aumento.
   - Fecha de vigencia.
   - Cláusula de actualización que aplica (Paritarias / IPC / etc.).

2. **Sistema calcula automáticamente** propuestas para todos los objetivos con esa cláusula:
   - Genera N registros en `propuestas_precios` con estado "Pendiente aprobación Gerente".
   - Cada propuesta lleva referencia al `paritaria_id`.

3. **Gerente Comercial aprueba en bulk:**
   - Ve la lista de N propuestas.
   - Puede aprobar todas / rechazar todas / aprobar selectivamente.

4. **Al aprobar todas, todas las propuestas aprobadas** disparan el hook al historial de precios del objetivo.

**Tabla `paritarias` extendida:**

```sql
ALTER TABLE public.paritarias
  ADD COLUMN IF NOT EXISTS clausula_aplicable    text,
  ADD COLUMN IF NOT EXISTS porcentaje_aumento    numeric(6,2),
  ADD COLUMN IF NOT EXISTS monto_fijo_aumento    numeric(12,2),
  ADD COLUMN IF NOT EXISTS fecha_vigencia_masiva date,
  ADD COLUMN IF NOT EXISTS estado                text DEFAULT 'Borrador',
  ADD COLUMN IF NOT EXISTS aprobada_por          text,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion      timestamptz,
  ADD COLUMN IF NOT EXISTS observaciones         text,
  ADD COLUMN IF NOT EXISTS anulado               boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at            timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();

-- Y en propuestas_precios agregar:
ALTER TABLE public.propuestas_precios
  ADD COLUMN IF NOT EXISTS paritaria_id_local text;
```

### 🟡 Cambio A6 — Tabs del módulo Precios

Nuevos tabs:

| Tab | Contenido | Quién lo ve |
|---|---|---|
| Propuestas activas | En Borrador / Pendiente aprobación | Comercial + Gerente |
| Paritarias | Paritarias activas y aplicadas | Comercial + Gerente |
| Histórico | Aprobadas / Rechazadas / Anuladas | Todos con acceso |
| Impacto vigente | Vista actual: todos los objetivos con último valor + próximos cambios en cola | Todos con acceso |

### 🟢 Cambio A7 — Corregir cards vacías del pipeline

Corregir bug de `.map()` truncados en la vista de propuestas (patrón repetido).

---

# PARTE B — MÓDULO CRM COMERCIAL

## 5. Contexto — CRM

### 5.1 Alcance

- **Nuevas ventas:** leads (prospectos) desde el primer contacto hasta el cierre.
- **Renovaciones:** seguimiento de contratos por vencer.

### 5.2 Actores

- **Comercial (Jorgelina + equipo):** gestiona leads y renovaciones.
- **Cierre exitoso:** dispara creación automática de cliente + objetivo (que va a handoff con Operaciones).

## 6. Cambios en CRM

### 🔴 Cambio B1 — Persistir leads

**Qué hay hoy:**
- `DB.leads` no está en `_SM`.

**Qué cambia:**
- Mapear en `_SM`.
- Crear tabla nueva.

**SQL nuevo:**

```sql
-- v029_leads.sql
BEGIN;

CREATE TABLE public.leads (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Datos del prospecto
  empresa                text NOT NULL,
  cuit                   text,
  contacto_nombre        text NOT NULL,
  contacto_cargo         text,
  contacto_email         text,
  contacto_telefono      text,
  
  -- Cliente ya existente (para renovaciones o nuevo servicio en cliente existente)
  cliente_id_local       text,                -- NULL si es lead nuevo
  
  -- Origen y contexto
  origen                 text,                -- Recomendación / Web / Contacto directo / Renovación / etc.
  tipo                   text,                -- Limpieza / Mantenimiento / etc.
  zona                   text,
  presupuesto_estimado   numeric(12,2),
  
  -- Estado del pipeline
  etapa                  text NOT NULL DEFAULT 'Prospecto',
    -- Prospecto / Primer contacto / Propuesta enviada / Negociación / Contrato firmado / Cerrado perdido
  probabilidad           integer,             -- 0-100
  fecha_estimada_cierre  date,
  
  -- Resultado
  motivo_perdida         text,                -- si Cerrado perdido
  objetivo_generado_id_local text,            -- si Contrato firmado, ref al objetivo creado
  cliente_generado_id_local  text,            -- si es cliente nuevo
  fecha_cierre           timestamptz,
  cerrado_por            text,
  
  -- Es renovación?
  es_renovacion          boolean NOT NULL DEFAULT false,
  objetivo_a_renovar_id_local text,           -- objetivo existente a renovar
  
  responsable            text NOT NULL,       -- persona de Comercial asignada
  
  notas                  text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_le_etapa    ON public.leads(etapa) WHERE NOT anulado;
CREATE INDEX idx_le_cliente  ON public.leads(cliente_id_local) WHERE NOT anulado;
CREATE INDEX idx_le_renov    ON public.leads(es_renovacion) WHERE NOT anulado;

-- Historial de acciones del lead
CREATE TABLE public.lead_acciones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  lead_id_local          text NOT NULL,
  
  fecha                  timestamptz NOT NULL DEFAULT now(),
  tipo_accion            text NOT NULL,       -- Llamada / Reunión / Email / Visita / Propuesta / etc.
  descripcion            text NOT NULL,
  responsable            text NOT NULL,
  proximo_paso           text,
  fecha_proximo_paso     date,
  
  adjuntos               jsonb,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_la_lead ON public.lead_acciones(lead_id_local) WHERE NOT anulado;

COMMIT;
```

### 🔴 Cambio B2 — Hook al ganar un lead

**Qué hay hoy:**
- Cambio de estado a "Contrato firmado" no hace nada automático.

**Qué cambia:**

**Al pasar a estado "Contrato firmado":**

**Si NO es renovación:**
- Sistema pregunta: "¿Crear cliente y objetivo automáticamente?"
- Si sí, abre un asistente con datos precargados desde el lead:
  - Datos del cliente (empresa, CUIT, contacto).
  - Datos del objetivo (tipo, zona, valor estimado).
- Comercial completa los datos faltantes (razón social, condición IVA, código Tango, etc.).
- Al guardar, se crea:
  - Cliente nuevo (con `_SM.clientes`).
  - Objetivo nuevo con estado `Pendiente asignación operativa` (según delta de Clientes/Objetivos).
- El lead queda con `objetivo_generado_id_local` y `cliente_generado_id_local` para trazabilidad.

**Si ES renovación:**
- Sistema actualiza el objetivo existente:
  - Extiende `fecha_fin` según nueva vigencia.
  - Registra la renovación en `historial_precios_objetivo`.
- Notificación a Operaciones (supervisor asignado sigue igual, salvo cambio explícito).

### 🔴 Cambio B3 — Vista de renovaciones

**Qué hay hoy:**
- No hay vista de renovaciones.

**Qué cambia:**

Nueva vista automática:

**Tab "Renovaciones":**
- Muestra objetivos con `fechaFin` en los próximos **60 días**.
- Columnas: Cliente / Objetivo / Fecha fin / Días restantes / Supervisor / Estado renovación.
- Estados posibles: "Sin gestionar" / "Contactado" / "Propuesta enviada" / "Renovado" / "No renueva".

**Botón "Iniciar gestión de renovación":**
- Crea un lead con `es_renovacion = true` y `objetivo_a_renovar_id_local` cargado.
- El lead sigue el flujo normal de CRM.

**Alertas visuales:**
- 🟡 30-60 días → informativo.
- 🟠 15-30 días → atender.
- 🔴 <15 días → urgente.

### 🟡 Cambio B4 — Pipeline visual corregido

**Qué hay hoy:**
- Cards del pipeline emiten `<div>` vacíos (bug de `.map()` truncado).

**Qué cambia:**
- Corregir el renderizado de las cards.
- Cada card muestra: empresa, contacto, valor, probabilidad, fecha estimada, responsable.

### 🟡 Cambio B5 — Historial de acciones estructurado

Nueva tabla `lead_acciones` para trazar cada interacción con el prospecto.

Timeline en el detalle del lead con todas las acciones ordenadas por fecha.

Botón "+ Nueva acción" con:
- Fecha (default: hoy).
- Tipo (Llamada / Reunión / Email / etc.).
- Descripción.
- Próximo paso + Fecha próximo paso.

### 🟡 Cambio B6 — Integración externa (preparada, no activa)

Cuando esté disponible email/WhatsApp/etc:
- Enviar acción "Email enviado" automáticamente al mandar correo desde el sistema.
- Registrar respuestas en la timeline.

Por ahora **no se implementa** — se documenta como TODO.

---

# PARTE C — MÓDULO FEEDBACK DE CLIENTES

## 7. Contexto — Feedback de clientes

### 7.1 Consolidación de 4 tipos de feedback

Antes existían de manera dispersa:
- Reclamos (parcial).
- No Conformidades (parcial).
- Felicitaciones (NO existía).
- Sugerencias (existían pero eran del sistema, no del cliente).

**Este delta consolida los 4 tipos en un solo módulo con 5 tabs.**

### 7.2 Tipos y sus flujos

| Tipo | Descripción | Impacto en Competencia |
|---|---|---|
| Reclamo | Queja puntual del cliente sobre el servicio | Ninguno (informativo) |
| No Conformidad (NC) | Queja formal de calidad (ISO, auditorías) | Sí (individual / grupal / supervisor) |
| Felicitación | Elogio del cliente al equipo o a un operario | Sí (positivo) |
| Sugerencia del cliente | Propuesta de mejora del cliente | Ninguno (informativo) |

**Aclaración importante:** las "sugerencias sobre el sistema de gestión Ohlimpia" son distintas y quedan **fuera del alcance** de este módulo. Van a otro lado (posible módulo interno "Feedback del sistema" a diseñar aparte).

### 7.3 Puertas de entrada

- **Comercial:** carga cualquier tipo desde el módulo directamente.
- **Supervisor de Operaciones:** carga desde el módulo (con permiso). Ve solo los feedbacks de sus objetivos asignados.

### 7.4 Impacto en Competencia — modelo detallado

**Categorías de impacto** (al cargar, la persona elige):

| Impacto | Cuándo aplica | Puntos van a |
|---|---|---|
| Individual | La nota nombra a UN operario específico | Solo ese operario |
| Grupal (servicio) | La nota es sobre el servicio en general | Todos los operarios activos del servicio al momento |
| Supervisor | La nota apunta a la gestión del supervisor | Solo el supervisor asignado al momento |
| Sin impacto | Nota informativa sin impacto en Competencia | Ninguno |

**Regla clave:** al cargar la nota con impacto Grupal o Supervisor, el sistema **congela la lista de afectados AL MOMENTO** de la carga. Si después un operario deja el servicio, el histórico ya lo tiene registrado como afectado.

**Puntos:**
- **Definidos por RRHH** en el módulo Competencia (consistente con el resto de reglas).
- **Puntos completos a cada operario del grupo** (NO se divide entre ellos).

**Nuevas reglas propuestas en Competencia:**

| Regla | Sugerencia de puntaje (RRHH ajusta) |
|---|---|
| NC - individual | -20 puntos |
| NC - grupal | -10 puntos a cada uno |
| NC - supervisor | -30 puntos |
| Felicitación - individual | +25 puntos |
| Felicitación - grupal | +15 puntos a cada uno |
| Felicitación - supervisor | +30 puntos |

Los reclamos y sugerencias NO generan puntos.

## 8. Cambios en Feedback de clientes

### 🔴 Cambio C1 — Persistir todo

**Qué hay hoy:**
- `reclamos`, `noConformidades`, `felicitaciones`, `sugerenciasCliente` no están en `_SM`.
- Felicitaciones no existe como tabla.

**Qué cambia:**
- Crear tablas nuevas.
- Mapear en `_SM`.

**SQL nuevo:**

```sql
-- v030_feedback_clientes.sql
BEGIN;

-- Tabla unificada de feedback (los 4 tipos)
CREATE TABLE public.feedback_clientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Tipo
  tipo                   text NOT NULL,       -- Reclamo / No Conformidad / Felicitación / Sugerencia
  numero                 text UNIQUE,         -- REC-2026-001 / NC-2026-001 / etc.
  
  -- Referencias
  cliente_id_local       text NOT NULL,
  cliente_nombre         text NOT NULL,       -- desnormalizado
  objetivo_id_local      text,                -- opcional (puede no referir a servicio específico)
  objetivo_codigo        text,                -- desnormalizado
  
  -- Contenido
  titulo                 text NOT NULL,
  descripcion            text NOT NULL,
  categoria              text,                -- Calidad / Personal / Comunicación / Facturación / Insumos / etc.
  fecha_ocurrencia       date NOT NULL,
  fecha_reporte          date NOT NULL DEFAULT CURRENT_DATE,
  
  -- Puerta de entrada
  origen                 text NOT NULL,       -- Comercial / Supervisor / Otro
  registrado_por         text NOT NULL,
  registrado_por_rol     text,                -- Comercial / Supervisor / etc.
  
  -- Impacto en Competencia (solo NC y Felicitación)
  impacto_competencia    text,                -- Individual / Grupal / Supervisor / Sin impacto / NULL
  legajo_afectado_id_local text,              -- si Individual
  legajos_afectados_snapshot jsonb,           -- si Grupal — [{legajo_id_local, nombre}] congelado
  supervisor_afectado_id_local text,          -- si Supervisor
  supervisor_afectado_nombre text,            -- desnormalizado
  
  -- Estado del proceso
  estado                 text NOT NULL DEFAULT 'Abierto',
    -- Abierto / En tratamiento / Cerrado / Anulado
  gravedad               text,                -- Baja / Media / Alta / Crítica (solo NC)
  
  -- Cierre
  fecha_cierre           date,
  cerrado_por            text,
  resolucion             text,
  observaciones_cierre   text,
  
  -- Impacto ejecutado
  evento_competencia_id_local text,           -- referencia al evento generado en Competencia
  
  -- Adjuntos
  adjuntos               jsonb,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fc_tipo     ON public.feedback_clientes(tipo) WHERE NOT anulado;
CREATE INDEX idx_fc_cliente  ON public.feedback_clientes(cliente_id_local) WHERE NOT anulado;
CREATE INDEX idx_fc_objetivo ON public.feedback_clientes(objetivo_id_local) WHERE NOT anulado;
CREATE INDEX idx_fc_estado   ON public.feedback_clientes(estado) WHERE NOT anulado;
CREATE INDEX idx_fc_impacto  ON public.feedback_clientes(impacto_competencia) WHERE NOT anulado;

-- Historial de eventos del feedback (auditoría)
CREATE TABLE public.feedback_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  feedback_id_local      text NOT NULL,
  
  estado_desde           text,
  estado_hasta           text NOT NULL,
  ejecutado_por          text NOT NULL,
  ejecutado_en           timestamptz NOT NULL DEFAULT now(),
  observaciones          text,
  
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fe_feedback ON public.feedback_eventos(feedback_id_local);

COMMIT;
```

### 🔴 Cambio C2 — Hook con Competencia Anual

**Al crear un feedback con impacto:**

```javascript
async function crearFeedbackConImpacto(feedback) {
  // 1. Persistir el feedback
  supaSync('feedback_clientes', feedback);
  
  // 2. Si tiene impacto en Competencia
  if (feedback.impacto_competencia && feedback.impacto_competencia !== 'Sin impacto') {
    if (feedback.impacto_competencia === 'Individual') {
      // Un solo evento para un operario
      const eventoId = await window.competenciaAPI.generarEventoPuntos(
        obtenerReglaCompetencia(feedback.tipo, 'individual'),
        feedback.legajo_afectado_id_local,
        feedback.fecha_ocurrencia,
        feedback.id_local,
        `${feedback.tipo}: ${feedback.titulo}`
      );
      feedback.evento_competencia_id_local = eventoId;
    }
    else if (feedback.impacto_competencia === 'Grupal') {
      // N eventos, uno por operario del snapshot
      const eventos = [];
      for (const operario of feedback.legajos_afectados_snapshot) {
        const eventoId = await window.competenciaAPI.generarEventoPuntos(
          obtenerReglaCompetencia(feedback.tipo, 'grupal'),
          operario.legajo_id_local,
          feedback.fecha_ocurrencia,
          feedback.id_local,
          `${feedback.tipo} (grupal): ${feedback.titulo}`
        );
        eventos.push(eventoId);
      }
      feedback.evento_competencia_id_local = eventos.join(',');
    }
    else if (feedback.impacto_competencia === 'Supervisor') {
      const eventoId = await window.competenciaAPI.generarEventoPuntos(
        obtenerReglaCompetencia(feedback.tipo, 'supervisor'),
        feedback.supervisor_afectado_id_local,
        feedback.fecha_ocurrencia,
        feedback.id_local,
        `${feedback.tipo} (supervisor): ${feedback.titulo}`
      );
      feedback.evento_competencia_id_local = eventoId;
    }
    
    // Persistir referencia al evento
    supaSync('feedback_clientes', feedback);
  }
}
```

**Al anular o cerrar por error un feedback con impacto:**
Se revierten los eventos de Competencia usando la referencia `evento_competencia_id_local`.

### 🔴 Cambio C3 — 5 tabs del módulo

| Tab | Contenido |
|---|---|
| Reclamos | Reclamos activos (Abierto + En tratamiento) |
| No Conformidades | NC activas |
| Felicitaciones | Felicitaciones registradas |
| Sugerencias | Sugerencias del cliente |
| Histórico | Todos los feedbacks cerrados/anulados |

**Filtros comunes a todos los tabs:** cliente, objetivo, categoría, rango de fechas, impacto.

**Nombres de números autogenerados por tipo:**
- Reclamos: REC-YYYY-NNN.
- NC: NC-YYYY-NNN.
- Felicitaciones: FEL-YYYY-NNN.
- Sugerencias: SUG-YYYY-NNN.

### 🟡 Cambio C4 — Modal universal de feedback

Un solo modal que se adapta según el tipo elegido.

**Sección 1 — Tipo (obligatorio):**
- Radio: Reclamo / No Conformidad / Felicitación / Sugerencia.

**Sección 2 — Referencias:**
- Cliente (autocompletado). Obligatorio.
- Objetivo (autocompletado filtrado por cliente). Opcional.

**Sección 3 — Contenido:**
- Título. Obligatorio.
- Descripción. Obligatorio.
- Categoría. Obligatorio.
- Fecha ocurrencia. Obligatorio.
- Gravedad (solo NC). Obligatorio.

**Sección 4 — Impacto en Competencia** (solo NC y Felicitaciones):
- Radio: Individual / Grupal (servicio) / Supervisor / Sin impacto.
- Si Individual: autocompletado operario.
- Si Grupal: muestra "Se generarán N puntos para: [lista de operarios activos del servicio]".
- Si Supervisor: muestra "Supervisor actual: [nombre]".

**Sección 5 — Adjuntos:**
- Foto, PDF, email, etc.

### 🟡 Cambio C5 — Panel de contexto del feedback

Al abrir el detalle de un feedback, panel lateral con:
- Historial de feedbacks previos del mismo cliente.
- Historial de feedbacks previos del mismo objetivo.
- Historial de feedbacks previos del operario/supervisor afectado.
- Si es NC: severidad histórica del cliente/objetivo.

### 🟡 Cambio C6 — Cierre del feedback

Botón "🏁 Cerrar" con modal:
- Fecha de cierre.
- Resolución (texto).
- Observaciones.

Al cerrar:
- Estado pasa a "Cerrado".
- El feedback pasa al tab Histórico.
- Los impactos en Competencia (si los hubo) NO se revierten.

### 🟡 Cambio C7 — Anulación con reversión de impacto

Si el feedback fue cargado por error:
- Solo Comercial o Admin puede anular.
- Motivo obligatorio.
- Los eventos generados en Competencia SÍ se revierten.

---

# PARTE D — MÓDULO GESTIÓN DE COBROS

## 9. Contexto — Cobros

### 9.1 Alcance

- **Comercial gestiona cobros** con una persona dedicada del equipo.
- **Finanzas factura en Tango.**
- **Ohlimpia importa Excel de Tango** para tener visibilidad en el sistema.

### 9.2 Flujo

```
[Finanzas factura en Tango]
  ↓
[Se genera Excel con facturas pendientes, saldos, cobros recibidos]
  ↓
[Persona de Comercial descarga el Excel y lo importa en Ohlimpia]
  ↓
[Ohlimpia actualiza estado: sobrescribe estado + preserva datos manuales]
  ↓
[Persona de Comercial hace seguimiento: contacta clientes, registra compromisos]
  ↓
[Los compromisos alimentan (futuro) proyección financiera]
```

### 9.3 Integración con proyección financiera

**Estado actual:** el diseño del económico proyectado vs real se está haciendo **por fuera del sistema** (a integrar más adelante).

**En Cobros:** dejamos preparada la tabla `compromisos_pago` que el módulo financiero futuro consumirá.

## 10. Cambios en Cobros

### 🔴 Cambio D1 — Persistir facturas, cobros e importaciones

**Qué hay hoy:**
- `DB.facturas`, `DB.cobros`, `DB.historialImportaciones` no persisten.

**Qué cambia:**
- Crear tablas nuevas.
- Mapear en `_SM`.

**SQL nuevo:**

```sql
-- v031_cobros.sql
BEGIN;

CREATE TABLE public.facturas_clientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Identificación
  numero_tango           text NOT NULL,       -- número de factura en Tango
  cliente_id_local       text NOT NULL,
  cliente_nombre         text NOT NULL,       -- desnormalizado
  objetivo_id_local      text,                -- si se puede identificar
  objetivo_codigo        text,
  
  -- Datos
  fecha_emision          date NOT NULL,
  fecha_vencimiento      date NOT NULL,
  monto_bruto            numeric(12,2) NOT NULL,
  monto_iva              numeric(12,2),
  monto_total            numeric(12,2) NOT NULL,
  monto_cobrado          numeric(12,2) NOT NULL DEFAULT 0,
  saldo                  numeric(12,2) NOT NULL,
  
  -- Estado
  estado                 text NOT NULL,       -- Pendiente / Parcial / Cobrada / Vencida
  dias_atraso            integer,
  
  -- Origen de la data (auditoría)
  ultima_importacion_id_local text NOT NULL,  -- ref a historial_importaciones_tango
  fecha_ultima_actualizacion timestamptz NOT NULL DEFAULT now(),
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fac_cliente ON public.facturas_clientes(cliente_id_local) WHERE NOT anulado;
CREATE INDEX idx_fac_estado  ON public.facturas_clientes(estado) WHERE NOT anulado;
CREATE INDEX idx_fac_venc    ON public.facturas_clientes(fecha_vencimiento) WHERE NOT anulado;
CREATE INDEX idx_fac_tango   ON public.facturas_clientes(numero_tango) WHERE NOT anulado;

CREATE TABLE public.cobros_recibidos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  factura_id_local       text NOT NULL,
  cliente_id_local       text NOT NULL,
  
  fecha_cobro            date NOT NULL,
  monto                  numeric(12,2) NOT NULL,
  medio                  text,                -- Transferencia / Cheque / Efectivo / etc.
  referencia             text,                -- número de transferencia, etc.
  
  ultima_importacion_id_local text NOT NULL,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cob_factura ON public.cobros_recibidos(factura_id_local) WHERE NOT anulado;
CREATE INDEX idx_cob_cliente ON public.cobros_recibidos(cliente_id_local) WHERE NOT anulado;

CREATE TABLE public.historial_importaciones_tango (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  tipo                   text NOT NULL,       -- Facturas / Cobros / Combinado
  fecha_importacion      timestamptz NOT NULL DEFAULT now(),
  importado_por          text NOT NULL,
  archivo_nombre         text,
  
  registros_leidos       integer NOT NULL,
  registros_creados      integer NOT NULL,
  registros_actualizados integer NOT NULL,
  registros_error        integer NOT NULL,
  
  detalle_errores        jsonb,
  observaciones          text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Compromisos de pago (para futuro módulo financiero)
CREATE TABLE public.compromisos_pago (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  cliente_id_local       text NOT NULL,
  cliente_nombre         text NOT NULL,       -- desnormalizado
  factura_id_local       text,                -- si compromiso vinculado a factura específica
  
  fecha_compromiso       date NOT NULL,       -- cuándo el cliente prometió pagar
  monto_prometido        numeric(12,2) NOT NULL,
  origen_compromiso      text,                -- Llamada / Email / WhatsApp / Reunión / etc.
  
  registrado_por         text NOT NULL,
  fecha_registro         timestamptz NOT NULL DEFAULT now(),
  observaciones          text,
  
  estado                 text NOT NULL DEFAULT 'Vigente',
    -- Vigente / Cumplido / Incumplido / Renegociado
  
  fecha_cumplimiento     date,
  monto_efectivo         numeric(12,2),       -- lo que efectivamente se cobró
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cp_cliente ON public.compromisos_pago(cliente_id_local) WHERE NOT anulado;
CREATE INDEX idx_cp_fecha   ON public.compromisos_pago(fecha_compromiso) WHERE NOT anulado;
CREATE INDEX idx_cp_estado  ON public.compromisos_pago(estado) WHERE NOT anulado;

-- Seguimiento (llamadas, mails, recordatorios)
CREATE TABLE public.acciones_cobro (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  cliente_id_local       text NOT NULL,
  factura_id_local       text,                -- opcional
  
  fecha                  timestamptz NOT NULL DEFAULT now(),
  tipo                   text NOT NULL,       -- Llamada / Email / Visita / WhatsApp / Recordatorio / Reclamo formal
  descripcion            text NOT NULL,
  respuesta_cliente      text,                -- lo que dijo el cliente
  compromiso_id_local    text,                -- si esta acción generó compromiso
  
  responsable            text NOT NULL,
  proximo_paso           text,
  fecha_proximo_paso     date,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ac_cliente ON public.acciones_cobro(cliente_id_local) WHERE NOT anulado;
CREATE INDEX idx_ac_factura ON public.acciones_cobro(factura_id_local) WHERE NOT anulado;

COMMIT;
```

### 🔴 Cambio D2 — Importación de Excel Tango

**Flujo detallado:**

1. **Usuario sube Excel** en el módulo Cobros con botón "Importar Excel Tango".

2. **Sistema pide confirmación:**
   - "Vas a importar N registros desde el Excel. Se van a **sobrescribir estados actuales** de las facturas existentes. Los datos manuales (compromisos, notas, acciones) NO se sobrescriben. ¿Continuar?"

3. **Al confirmar, sistema:**
   - Detecta duplicados por `numero_tango` (identificador único).
   - Registros existentes → **actualizan** su estado (monto cobrado, saldo, estado, días atraso).
   - Registros nuevos → **se crean**.
   - Registros que existían pero no están en el Excel → NO se tocan (mantenimiento a mano).

4. **Genera entrada en `historial_importaciones_tango`** con estadísticas:
   - Registros leídos.
   - Creados.
   - Actualizados.
   - Errores.

5. **Muestra resumen** al usuario con la posibilidad de deshacer (si aún no cerró el modal).

**Estructura esperada del Excel:**
- Columna: número de factura Tango.
- Columna: cliente (por código Tango o razón social).
- Columna: fecha emisión.
- Columna: fecha vencimiento.
- Columna: monto total.
- Columna: monto cobrado (acumulado).
- Columna: saldo.

Fede debe validar el formato de columnas contra un archivo real. Si el formato de Tango cambia, adaptar el parser.

**⚠️ Importaciones incorrectas:** el usuario puede anular una importación completa (rollback) — solo si es la más reciente y en las últimas 24 hs.

### 🔴 Cambio D3 — Vista principal por cliente

**Tab "Estado por cliente":**
- Lista de clientes con:
  - Saldo total pendiente.
  - N° facturas pendientes.
  - Factura más antigua.
  - Días de mora máxima.
  - Última acción de cobro.
  - Próximo compromiso.
  - Alerta visual: 🟢 al día / 🟡 30 días de mora / 🟠 60 días / 🔴 90+.

**Click en cliente → detalle:**
- Lista de todas las facturas del cliente con estado.
- Historial de cobros recibidos.
- Timeline de acciones de cobro.
- Compromisos vigentes y cumplidos.

### 🔴 Cambio D4 — Módulo de acciones y compromisos

**En el detalle de un cliente/factura:**

**Botón "+ Nueva acción":**
- Fecha (default: hoy).
- Tipo (Llamada / Email / WhatsApp / etc.).
- Descripción.
- Respuesta del cliente.
- ¿Generó compromiso? (si sí, abre modal de compromiso).

**Modal de compromiso:**
- Cliente (auto).
- Factura (opcional).
- Fecha de compromiso.
- Monto prometido.
- Origen del compromiso (Llamada / etc.).
- Observaciones.

Al guardar:
- Se persiste en `compromisos_pago`.
- Genera notificación al usuario para el día del compromiso.

**Al cumplir compromiso:**
- Cuando se importa un nuevo Excel Tango y el compromiso está en fecha, sistema pregunta: "¿El compromiso de $X del cliente Y del día Z se cumplió?"
- Si sí → estado "Cumplido" + `monto_efectivo`.
- Si no → estado "Incumplido". Alerta a la persona de Cobros.

### 🟡 Cambio D5 — Tabs del módulo

| Tab | Contenido |
|---|---|
| Estado por cliente | Vista principal, resumen |
| Facturas pendientes | Todas las facturas con saldo > 0 |
| Compromisos vigentes | Compromisos por cumplir |
| Compromisos incumplidos | Alertas de compromisos vencidos |
| Histórico | Facturas cobradas + compromisos cerrados |
| Importaciones | Historial de importaciones desde Tango |

### 🟡 Cambio D6 — Vinculación con clientes/objetivos

Al importar el Excel, el sistema debe **vincular** cada factura al cliente y objetivo correcto en Ohlimpia:
- **Cliente:** por `codigo_tango`.
- **Objetivo:** por descripción de la factura (mejor esfuerzo) o manualmente si no matchea.

Facturas sin cliente vinculado quedan en "Sin vincular" para revisión manual.

---

# PARTE E — CONSOLIDACIÓN

## 11. Etapas de implementación (orden sugerido)

### Etapa 1 — Persistencia base (crítica)
- Crear todas las tablas nuevas.
- Mapear todas las estructuras en `_SM`.
- Corregir bugs de `.map()` truncados.

### Etapa 2 — Precios
- Flujo de propuestas con aprobación.
- Vista comparativa.
- Hook con historial de precios del objetivo.
- Paritarias con generación masiva.

### Etapa 3 — CRM
- Persistir leads.
- Vista de renovaciones.
- Hook al ganar lead (genera cliente + objetivo).
- Pipeline corregido.
- Historial de acciones.

### Etapa 4 — Feedback de clientes
- 5 tabs.
- Modal universal.
- Hook con Competencia (individual / grupal / supervisor).
- Congelamiento de snapshots.
- Panel de contexto.

### Etapa 5 — Cobros
- Importación de Excel Tango.
- Vista por cliente.
- Compromisos de pago.
- Acciones de cobro.

### Etapa 6 — Migración a `src/modules/`
- Extraer los 4 módulos a `src/modules/`:
  - `src/modules/precios/`
  - `src/modules/crm/`
  - `src/modules/feedback_clientes/`
  - `src/modules/cobros/`
- Con lógica compartida en `src/modules/comercial_shared/`.

## 12. Prerequisitos

Antes de que Fede arranque:

1. **Delta de Clientes/Objetivos implementado** — este delta depende de él.
2. **Módulo Competencia funcionando** — para los hooks del Feedback.
3. **Sistema de permisos por rol** — para filtrar vistas de supervisor.
4. **Verificar archivo Excel Tango real** — Lautaro debe pasar un ejemplo a Fede.
5. **Definir puntajes de las nuevas reglas de Competencia** con RRHH (Gabriela).

## 13. Integraciones

### Con Clientes/Objetivos (delta ya cerrado)
- Todos los módulos referencian.
- Al ganar lead en CRM → crea cliente + objetivo.
- Al aprobar propuesta en Precios → actualiza historial de precios del objetivo.
- Feedback siempre vincula a cliente (y opcionalmente a objetivo).
- Cobros vincula facturas a cliente y objetivo.

### Con Competencia Anual
- Feedback dispara eventos de puntos según impacto.
- Reglas nuevas a agregar en Competencia.

### Con Categorías
- Precios NO afecta valores hora de Categorías (son conceptos separados — precio al cliente vs valor pago al operario).

### Con Legajos
- Feedback lee legajos activos por servicio (para snapshot grupal).
- Feedback lee supervisor asignado al servicio (para impacto en supervisor).

### Con Tango (externa)
- Cobros importa Excel manual.
- No hay integración API en esta versión.

### Con futuro módulo Financiero (por fuera del sistema)
- Cobros expone `compromisos_pago` como fuente de proyección de ingresos.

## 14. Casos borde

### 14.1 Feedback con impacto grupal para un servicio sin operarios activos
Bloqueo. Error visible: "El servicio no tiene operarios activos. No se puede aplicar impacto grupal."

### 14.2 Cambio de reglas de Competencia después de cargar feedbacks
Los feedbacks ya cargados conservan los puntos que generaron. Nuevos feedbacks usan las nuevas reglas.

### 14.3 Anulación de feedback con impacto ya aplicado
Al anular, se revierten los eventos de Competencia. Queda registrado en la auditoría de ambos módulos.

### 14.4 Lead que apunta a cliente existente
Sistema detecta por CUIT o nombre. Al pasar a "Contrato firmado" ofrece agregar objetivo al cliente existente (no crear cliente nuevo).

### 14.5 Renovación de objetivo con supervisor cambiado
La renovación no cambia supervisor. Si Ops quiere cambiarlo, es un flujo separado.

### 14.6 Compromiso de pago superado por otro compromiso
El primero pasa a "Renegociado". El nuevo queda como "Vigente".

### 14.7 Importación Excel con formato inesperado
Sistema muestra los errores. Usuario puede corregir el Excel y reintentar.

### 14.8 Precio propuesto igual al vigente
Soft warning: "El valor propuesto es el mismo que el vigente. ¿Es correcto?"

### 14.9 Paritaria que aplica a 0 objetivos
Bloqueo. "No hay objetivos con la cláusula seleccionada."

### 14.10 Cliente con muchas facturas (>100)
Sin restricción. La UI puede paginar.

## 15. Convenciones respetadas

- Nombres en español.
- camelCase en frontend, snake_case en Supabase.
- Soft delete (política A.7).
- Vigencia temporal para precios (política A.6).
- Auditoría de transiciones.
- Un commit por cambio lógico (política A.3).

## 16. Bugs conocidos a corregir del legacy

Del inventario:
1. **Persistencia nula** de todos los módulos (excepto Paritarias) — se persisten (Cambios A1, B1, C1, D1).
2. **"Felicitaciones" no existe** como estructura — se crea (Cambio C1).
3. **Sin hooks reales** entre módulos — se cablean (Cambios A4, B2, C2).
4. **`.map()` truncados** en pipeline CRM, historial de acciones, historial de importaciones — se corrigen.
5. **CRM cruza clientes por texto libre** — se cambia a FK (Cambio B1).
6. **"Análisis IA" son toasts vacíos** — se dejan como TODO (fuera de alcance).

## 17. FAQ

**¿Los precios afectan Liquidaciones o el pago al operario?**
No. El precio del objetivo es lo que la cooperativa **cobra** al cliente. El valor hora del operario (lo que la cooperativa **paga**) viene de Categorías. Son conceptos separados.

**¿Los reclamos generan puntos negativos?**
No. Solo las NC. Los reclamos son informativos.

**¿Puede haber feedback sin cliente asociado?**
No. Todo feedback se asocia a un cliente (obligatorio).

**¿Se puede tener múltiples compromisos de pago de un mismo cliente?**
Sí. Cada compromiso es independiente.

**¿La importación de Excel Tango es reversible?**
Sí, solo si es la más reciente y en las últimas 24 hs.

**¿Los datos manuales (compromisos, notas) se sobrescriben al importar?**
No. Solo se actualizan los campos que vienen del Excel (montos, saldos, estados).

**¿Puedo tocar Tango?**
No. La cooperativa factura ahí. Ohlimpia solo importa.

**¿Cuándo se implementa el módulo financiero (proyección)?**
Se está diseñando por fuera del sistema. Cuando esté listo, consumirá `compromisos_pago`.

**¿Puedo tocar módulos ya diseñados (Clientes, Objetivos, Competencia, Legajos)?**
Solo agregar reglas nuevas en Competencia (con puntajes que Gabi ajustará). El resto no se toca.

## 18. Cierre

Este delta cierra el paquete de módulos del área Comercial. Con Clientes/Objetivos ya cerrado + estos 4 satélites, el área tiene toda su infraestructura documentada.

Los cambios clave:
1. **Persistir todo** — 4 módulos que hoy son 100% en memoria pasan a Supabase.
2. **Flujo formal de precios** con aprobación por Gerente Comercial.
3. **CRM funcional** con hook al ganar lead + renovaciones automáticas.
4. **Feedback de clientes consolidado** con 5 tabs y 3 tipos de impacto en Competencia.
5. **Cobros con importación Tango** y compromisos de pago (futuro financiero).

**Estimación de trabajo para Fede:** 200-280 horas. El más grande del paquete por la cantidad de módulos + tablas + hooks.

**Coordinación con Lautaro requerida en:**
- Ejemplo real del Excel Tango.
- Definición de puntajes de nuevas reglas en Competencia (con Gabi).
- Cuando el módulo financiero externo esté listo, coordinar la integración.

**Objetivo estratégico:** que el área Comercial (Jorgelina + equipo) tenga TODO su proceso en el sistema. Que Ohlimpia deje de depender de Excel + WhatsApp + email.

Ante duda: **preguntar antes de codear** (política A.4).

**¡Feedback y cobros, en un solo lugar!** 📊💳
