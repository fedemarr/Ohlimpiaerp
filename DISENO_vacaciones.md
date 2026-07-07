# Diseño del módulo Vacaciones — Especificación para implementación

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Vacaciones (sector administrativo)
**Autor del diseño:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-06
**Versión:** 1.0

---

## Cómo usar este documento

Este documento es la **fuente de verdad** para implementar el módulo Vacaciones. Está pensado para que se pueda programar **sin necesidad de volver a preguntar** por decisiones de diseño.

Se lee de arriba hacia abajo:
- Secciones **1-3** son contexto (leer una vez).
- Sección **4** es el modelo de datos (leer y aplicar antes de codear).
- Sección **5** es la estructura de archivos.
- Secciones **6-9** son la especificación de vistas.
- Sección **10** es el modal de solicitud.
- Sección **11** es el flujo completo de aprobación.
- Secciones **12-13** son configuración e integraciones.
- Sección **14** es el plan por etapas.
- Sección **15** son bugs conocidos a corregir.
- Sección **16** son casos borde.
- Sección **17** son convenciones a respetar.
- Sección **18** son decisiones técnicas que puede tomar Fede.

**Antes de escribir cualquier código:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md` y el inventario técnico del módulo actual (`docs/INVENTARIO_vacaciones_descanso_legacy.md`).

---

## 1. Contexto del módulo

### 1.1 Qué es Ohlimpia
Ohlimpia es un ERP cooperativo para gestionar una cooperativa de trabajo de servicios de limpieza con ~500 asociados. Cubre selección, ingreso, legajos, capacitaciones, liquidaciones, clientes, económico-financiero.

### 1.2 Qué es el módulo Vacaciones
Es el módulo donde el **sector administrativo** de la cooperativa (~30 personas: RRHH, Operaciones, Contabilidad, Consejo de Administración, etc.) gestiona sus **vacaciones anuales**.

**Importante:** este módulo NO cubre a los operarios de servicios de limpieza. Los operarios tienen su propio módulo separado llamado **Descansos** (ver documento aparte `DISENO_descansos.md`).

### 1.3 El problema que resuelve

**Situación actual (antes del sistema):**
- Los administrativos solicitan vacaciones con un **formulario en papel**.
- El papel se firma físicamente por: el solicitante, el gerente de área y el Consejo.
- No hay control centralizado del proceso — cada área maneja lo suyo informalmente.
- No hay trazabilidad: si el papel se pierde, se pierde el registro.
- No hay control del **saldo de días disponibles** por persona.
- No hay visibilidad cruzada — un gerente aprueba sin saber si dos personas de su equipo se cruzarán.

**Con el módulo:**
- El proceso completo pasa al sistema. El papel deja de existir.
- Trazabilidad completa: quién solicitó, quién aprobó, cuándo, con qué observaciones.
- Saldo automático de días disponibles por persona.
- Aprobaciones digitales con firma implícita (usuario logueado).
- Alertas de superposición jerárquica.
- Calendario visible del sector para prevenir cruces.

### 1.4 Usuarios del módulo

| Rol | Qué puede hacer |
|---|---|
| **Cualquier administrativo activo** | Solicitar sus vacaciones, ver su saldo, anular sus propias solicitudes (con reglas según estado) |
| **Gerente de área** | Aprobar/rechazar solicitudes de su equipo, anular a pedido del asociado, ver panorama de su sector |
| **Miembros del Consejo** (Presidente, Tesorero, Secretario) | Aprobar/rechazar solicitudes que ya pasaron por el Gerente, decidir sobre solicitudes de anulación post-aprobación |
| **RRHH (Gabi y equipo)** | Ver el módulo completo, cargar días asignados a cada asociado en su legajo, hacer seguimiento |
| **Administrador total** | Acceso completo, incluye configuración |

### 1.5 Estado actual (antes de esta implementación)

El módulo existe hoy en `src/legacy.js` (líneas ~873-1093) como parte de un módulo unificado "Vacaciones y descanso" que también incluye los descansos operativos.

**Problemas graves del módulo actual:**

1. **Nada persiste en Supabase.** Ni `vacAdmin` ni `vacOperativo` están mapeados en `supabase.js`. Los `supaSync` fallan silenciosamente. **Todo lo que se carga se pierde al recargar.**
2. **Función `poblarSelectsVacaciones` nunca se invoca.** Los selects de sector/supervisor probablemente quedan vacíos.
3. **`cambiarEstadoVacOp` (aprobar/rechazar) ni siquiera intenta persistir.** Solo muta memoria.
4. **Botón "Editar" administrativo es stub** — muestra un toast "próxima versión".
5. **Acceso por índice de array** en las acciones (patrón conocido, mismo bug que ya corregimos en otros módulos).
6. **Buscadores de la barra superior no funcionan** — llaman a funciones que leen otros IDs.
7. **Campo huérfano:** `va-nro-socio` referenciado en JS pero NO existe en el HTML. El N° socio administrativo se guarda literalmente como `'—'`.
8. **Asteriscos de obligatorio son decorativos** — solo se valida el campo Asociado.
9. **Escala de días por antigüedad hardcodeada** que Lautaro decidió no mantener (se pasa a manual, por decisión de negocio).

**Ver:** `docs/INVENTARIO_vacaciones_descanso_legacy.md` para el detalle exacto del código actual.

### 1.6 Objetivo de esta implementación

Rehacer el módulo administrativo de cero en `src/modules/vacaciones/` siguiendo el patrón de módulos migrados (política **A.11**). El módulo migrado debe:

1. **Persistir TODAS las operaciones** en Supabase.
2. **Implementar el flujo secuencial completo** (Solicitante → Gerente → Consejo con mayoría 2 de 3).
3. **Reemplazar el papel físico** con firmas digitales (usuario logueado).
4. **Trackear saldo automático** de días disponibles por asociado.
5. **Alertar superposición jerárquica** con el jefe directo.
6. **Preparar la infraestructura** para las notificaciones automáticas por WhatsApp.
7. **Integrar con el sistema de configuración** de permisos y facultades (donde vivirán los roles de Gerente y Consejo).

---

## 2. Alcance de la implementación

### 2.1 Qué incluye
- Tabla `vacaciones` en Supabase con el modelo completo de estados.
- Módulo migrado en `src/modules/vacaciones/`.
- 4 tabs: Pendientes, Historial, Panorama de saldos, Calendario.
- Modal de solicitud de vacaciones con validaciones reales.
- Modal de aprobar/rechazar (Gerente y Consejo, con acciones diferenciadas).
- Modal de solicitud de anulación (para vacaciones ya aprobadas).
- Cálculo automático de saldo por asociado.
- Alerta de superposición jerárquica.
- Notificaciones a la campana del sistema en cada transición.
- Botón exportar a Excel en Panorama de saldos.
- Integración con Legajos (nuevos campos: `dias_vacaciones_anuales`, `jefe_directo`).
- Integración con sistema de permisos (para identificar Gerente/Consejo).

### 2.2 Qué NO incluye (etapas futuras)
- Notificaciones automáticas por WhatsApp (espera destrabar Meta Business API).
- Cálculo automático de días hábiles (por ahora se cuentan días corridos — decisión tomada).
- Calendario de feriados nacionales/provinciales (a considerar en el futuro).
- Sistema completo de permisos y facultades — si el sistema no existe aún, Fede debe dejar preparada la interfaz con un mock configurable.
- Anulación con transferencia (que un asociado ceda sus días a otro) — no está en el alcance.
- Reasignación de reemplazante después de aprobado — si el reemplazante no puede, se pide anular la vacación.

---

## 3. Decisiones tomadas

Se listan las decisiones tomadas durante la sesión de diseño. **Cada una tiene su justificación.** Fede no debe cambiarlas sin consultar.

### 3.1 Módulo separado de Descansos
Vacaciones (administrativo) y Descansos (operativo) son **dos módulos distintos**. Comparten poco a nivel lógica. La única cosa que comparten es el **calendario global de ausencias**, que puede ser una vista transversal a definir después.

### 3.2 11 estados del ciclo de vida
Ver §4 para el detalle. En resumen:
- Borrador → Pendiente Gerente → Pendiente Consejo → Aprobada.
- Rechazada por Gerente / Rechazada por Consejo (finales).
- Anulada por solicitante / Anulada por Gerente (según en qué momento se anula).
- Solicitud de anulación pendiente → Anulada por Consejo / Anulación rechazada por Consejo (para vacaciones ya aprobadas).

### 3.3 Aprobación secuencial en dos niveles
- **Nivel 1:** Gerente del área del solicitante. Uno solo. Aprobación unipersonal.
- **Nivel 2:** Consejo de Administración. 3 miembros: Presidente, Tesorero, Secretario. **Mayoría 2 de 3.**

### 3.4 Miembros del Consejo no pueden aprobar sus propias solicitudes
Si el Presidente pide vacaciones, no puede aprobarse a sí mismo. La solicitud necesita los votos de los otros 2 miembros disponibles (o sea, unanimidad de los otros 2).

### 3.5 Sin política de anticipación mínima
Vacaciones puede solicitarse con la anticipación que sea. Si es menor a 48hs, el sistema muestra un **soft warning** al elevar. No bloquea.

### 3.6 Días asignados manuales por asociado
Se remueve la escala automática por antigüedad que existía en el legacy. En su lugar, cada legajo administrativo tiene un campo `dias_vacaciones_anuales` que RRHH carga y actualiza.

### 3.7 Saldo automático con validación blanda
El sistema calcula saldo = días asignados - días tomados en el año. Muestra el saldo en el modal. Si el pedido excede el saldo, se muestra soft warning ("Este pedido excede tu saldo disponible en X días. Podés elevarlo si el gerente aprueba en excepción."). No bloquea.

### 3.8 Reemplazante obligatorio del mismo sector
Al solicitar, es obligatorio indicar quién reemplaza al solicitante. El reemplazante debe ser un administrativo activo del **mismo sector** que el solicitante. El sistema restringe el autocompletado a personas del mismo sector.

### 3.9 Días corridos, no hábiles
La duración de la vacación se calcula en **días corridos** (todos los días entre desde y hasta, incluyendo fines de semana). No hay cálculo de días hábiles ni de feriados en esta versión.

### 3.10 Superposición con jefe directo (soft warning)
Al elevar la solicitud, si el jefe directo del solicitante tiene una vacación aprobada o pendiente que se superpone con las fechas pedidas, el sistema muestra soft warning al Gerente. No bloquea. El Gerente decide.

### 3.11 Reglas de anulación por estado

| Estado | Puede anular el solicitante | Puede anular el Gerente | Requiere Consejo |
|---|---|---|---|
| Borrador | Sí (libre) | No aplica | No |
| Pendiente Gerente | Sí (libre) | Sí (funcional a rechazar) | No |
| Pendiente Consejo | **No** — debe pedirle al Gerente | Sí | No |
| Aprobada | **No** — debe solicitar anulación al Consejo | No | **Sí (2 de 3)** |

Si el asociado tiene una vacación **aprobada** y quiere anularla, el sistema le da un botón "Solicitar anulación" que crea una petición para que el Consejo la evalúe. Con 2 votos de "invalidar", se anula. Si el Consejo rechaza, la vacación queda vigente (el asociado tiene que ir de vacaciones aunque cambió de opinión).

### 3.12 Reemplazo obligatorio del mismo sector
Ver 3.8. Cualquier admin activo del mismo sector puede ser reemplazante. NO puede ser el propio solicitante.

### 3.13 Roles de aprobación en configuración global
Los roles de "Gerente de área" y "Miembro del Consejo" NO se guardan en el legajo del asociado ni en tablas del módulo. Viven en el **sistema global de permisos y facultades** del proyecto.

**Implicancia para Fede:** el módulo Vacaciones consulta ese sistema para saber quién es quién. Si el sistema de permisos no existe aún:
- Dejar la interfaz preparada con funciones como `esGerenteDeArea(usuario, sector)` y `esMiembroConsejo(usuario)`.
- Implementar mock configurable temporal (por ejemplo, un objeto JS con nombres hardcodeados) hasta que el sistema real esté listo.
- Documentar en el código dónde reemplazar el mock por la llamada real.

### 3.14 Notificaciones a la campana del sistema
Todas las transiciones importantes generan notificaciones en `notificaciones_sistema` (tabla creada en Reasignaciones — reutilizamos). Ver §11 para el detalle de cada notificación.

### 3.15 Sin cálculo de días hábiles
Ya definido en 3.9. Todos los días se cuentan como corridos. El campo del modal se llama simplemente "Días" (no "Días hábiles").

### 3.16 Aprobación puede darse en cualquier orden entre miembros del Consejo
No hay coordinación entre los 3 miembros del Consejo. Cada uno aprueba/rechaza cuando puede/quiere. El sistema decide en cada aprobación si ya se alcanzó la mayoría (2 votos "aprobar" o "rechazar") y actualiza el estado.

### 3.17 Nuevos campos en el legajo administrativo
- `dias_vacaciones_anuales`: integer, cantidad de días asignados por año.
- `jefe_directo`: string (o ref al legajo del jefe), para detectar superposiciones.

Estos campos deben agregarse al módulo Legajos como parte de la implementación. Fede debe consultar cómo está estructurado ese módulo antes de modificarlo, y coordinar con Lautaro cualquier cambio no trivial.

---

## 4. Modelo de datos

### 4.1 Convenciones generales
- Todas las tablas siguen el patrón del proyecto: `id bigserial PK`, `id_local text UNIQUE NOT NULL`, `created_at`, `updated_at`, `anulado boolean DEFAULT false`.
- Uso de snake_case en base de datos.
- Timestamps como `timestamptz`.
- Referencias entre tablas por `id_local` (patrón del proyecto).

### 4.2 SQL versionado

Crear el archivo `sql/v015_vacaciones.sql`:

```sql
-- =============================================================================
-- Migración: v015 — Módulo Vacaciones (sector administrativo)
-- Fecha:     2026-07-06
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Crea la tabla persistente del módulo Vacaciones migrado desde legacy.js.
-- Antes vivía en memoria (los supaSync fallaban silenciosamente porque
-- la clave 'vacAdmin' no estaba mapeada en supabase.js).
--
-- Este módulo cubre SOLO al sector administrativo (~30 personas).
-- Los operarios de servicios de limpieza tienen su módulo aparte: Descansos.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Tabla vacaciones
-- ---------------------------------------------------------------------------
CREATE TABLE public.vacaciones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Solicitante
  legajo_id_local        text NOT NULL,          -- ref al asociado que solicita
  nro_socio              text NOT NULL,          -- desnormalizado
  nombre_asociado        text NOT NULL,          -- desnormalizado
  sector                 text NOT NULL,          -- desnormalizado, del legajo
  
  -- Fechas
  fecha_solicitud        timestamptz NOT NULL DEFAULT now(),
  fecha_desde            date NOT NULL,
  fecha_hasta            date NOT NULL,
  dias_solicitados       integer NOT NULL,       -- calculado: hasta - desde + 1
  fecha_retorno          date NOT NULL,          -- calculado: hasta + 1
  
  -- Contexto
  reemplazante_legajo_id_local text NOT NULL,    -- ref al legajo del reemplazante
  reemplazante_nombre    text NOT NULL,          -- desnormalizado
  descripcion_reemplazo  text,                   -- detalle opcional
  observaciones          text,                   -- notas del solicitante
  
  -- Estado
  estado                 text NOT NULL DEFAULT 'Borrador',
    -- Borrador
    -- Pendiente aprobación Gerente
    -- Pendiente aprobación Consejo
    -- Aprobada
    -- Rechazada por Gerente
    -- Rechazada por Consejo
    -- Anulada por solicitante
    -- Anulada por Gerente
    -- Solicitud de anulación pendiente
    -- Anulada por Consejo
    -- Anulación rechazada por Consejo
  
  -- Aprobación Gerente
  aprobado_por_gerente   text,                   -- nombre del gerente
  fecha_aprobacion_gerente timestamptz,
  motivo_rechazo_gerente text,
  
  -- Aprobación Consejo (tres votos independientes)
  voto_presidente        text,                   -- 'Aprobar' | 'Rechazar' | null
  voto_presidente_fecha  timestamptz,
  voto_presidente_motivo text,                   -- motivo si rechazó
  
  voto_tesorero          text,                   -- 'Aprobar' | 'Rechazar' | null
  voto_tesorero_fecha    timestamptz,
  voto_tesorero_motivo   text,
  
  voto_secretario        text,                   -- 'Aprobar' | 'Rechazar' | null
  voto_secretario_fecha  timestamptz,
  voto_secretario_motivo text,
  
  -- Aprobación consejo — resumen (calculado)
  fecha_aprobacion_consejo timestamptz,          -- cuando se alcanzó mayoría "aprobar"
  fecha_rechazo_consejo    timestamptz,          -- cuando se alcanzó mayoría "rechazar"
  
  -- Anulación
  anulado_por_nombre     text,                   -- quién anuló (para todos los tipos)
  fecha_anulacion        timestamptz,
  motivo_anulacion       text,
  
  -- Anulación post-aprobación (flujo especial)
  solicitud_anulacion_motivo text,               -- por qué el asociado quiere anular
  voto_anul_presidente   text,                   -- 'Invalidar' | 'Mantener' | null
  voto_anul_tesorero     text,                   -- idem
  voto_anul_secretario   text,                   -- idem
  
  -- Auditoría
  editado_por            text,
  editado_en             timestamptz,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vacac_legajo ON public.vacaciones(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_vacac_estado ON public.vacaciones(estado) WHERE NOT anulado;
CREATE INDEX idx_vacac_desde  ON public.vacaciones(fecha_desde) WHERE NOT anulado;
CREATE INDEX idx_vacac_sector ON public.vacaciones(sector) WHERE NOT anulado;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
--
-- NOTA: Este script NO crea la tabla `notificaciones_sistema` ni la tabla
-- `motivos_reasignacion` porque ya deberían existir del módulo Reasignaciones
-- (v014). Si no existen aún, aplicar v014 primero.
-- =============================================================================
```

### 4.3 Mapeo en `src/shared/supabase.js`

Agregar al mapa de tablas (buscar donde están las otras claves):

```javascript
vacaciones: 'vacaciones',
```

### 4.4 Cambios en el módulo Legajos

Agregar 2 campos nuevos al modelo de legajos (solo se llenan para administrativos, opcionales para operarios):

```sql
-- v016_legajos_campos_vacaciones.sql (o el número que corresponda)
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS dias_vacaciones_anuales integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jefe_directo_legajo_id_local text;
```

Actualizar los formularios del módulo Legajos para permitir editar estos campos. Coordinar con Lautaro antes de modificar el módulo Legajos existente.

### 4.5 Catálogos hardcoded

**Estados** (constante local, para validaciones):
```javascript
const ESTADOS_VACACIONES = [
  'Borrador',
  'Pendiente aprobación Gerente',
  'Pendiente aprobación Consejo',
  'Aprobada',
  'Rechazada por Gerente',
  'Rechazada por Consejo',
  'Anulada por solicitante',
  'Anulada por Gerente',
  'Solicitud de anulación pendiente',
  'Anulada por Consejo',
  'Anulación rechazada por Consejo'
];

const ESTADOS_FINALES = [
  'Aprobada',
  'Rechazada por Gerente',
  'Rechazada por Consejo',
  'Anulada por solicitante',
  'Anulada por Gerente',
  'Anulada por Consejo',
  'Anulación rechazada por Consejo'
];
```

**Sectores administrativos** — deben venir del catálogo global del sistema. Si no existe, hardcoded temporalmente con los 8 que ya vivían en el legacy:
- Consejo de Administración
- Coord. General
- Coord. RRHH
- Coord. Operaciones y Planeamiento
- Coord. Calidad
- Coord. Logística y Distribución
- Coord. Marketing y Ventas
- Coord. Administración y Finanzas

---

## 5. Estructura del módulo

Crear el directorio `src/modules/vacaciones/`:

```
src/modules/vacaciones/
├── index.js              — Re-exports y bindings al window
├── vacaciones.js         — Lógica principal (renders, ABM, filtros)
├── aprobacion.js         — Lógica de aprobar/rechazar (Gerente y Consejo)
├── anulacion.js          — Lógica de anular en distintos estados
├── saldo.js              — Cálculo de saldos por asociado
├── calendario.js         — Vista de calendario mensual
└── permisos.js           — Wrappers sobre el sistema global de permisos (o mock)
```

El HTML de la pantalla puede refactorizarse del actual en `index.html` con id `screen-vacaciones`.

---

## 6. Tab 1 — Pendientes (Bandeja de entrada)

### 6.1 Qué muestra
Es una **bandeja de entrada personalizada según el rol del usuario logueado.** Muestra solo lo que requiere su acción.

### 6.2 Contenido según rol

**Si el usuario es un administrativo común** (sin rol de aprobación):
- Sus propias solicitudes en estados no finales: Borrador, Pendiente Gerente, Pendiente Consejo, Solicitud de anulación pendiente.

**Si el usuario es Gerente de área:**
- Solicitudes de su equipo en estado "Pendiente aprobación Gerente".
- Sus propias solicitudes (mismos criterios que administrativo común).
- Sección separada: solicitudes de anulación de su equipo con estado "Pendiente aprobación Gerente" para anular.

**Si el usuario es miembro del Consejo:**
- Solicitudes en estado "Pendiente aprobación Consejo" **donde su voto todavía es null** (no votó aún).
- Solicitudes de anulación en estado "Solicitud de anulación pendiente" donde su voto de anulación todavía es null.
- Sus propias solicitudes (mismos criterios).
- **Excluir** solicitudes donde él mismo es el solicitante (no puede aprobarse a sí mismo).

**Si el usuario es RRHH o Admin total:**
- Vista completa de todas las pendientes (todos los estados no finales).
- Puede ver pero no puede aprobar (a menos que sea también Gerente o Consejo).

### 6.3 Columnas del listado

| # | Columna | Notas |
|---|---|---|
| 1 | Solicitante | Nombre + N° socio |
| 2 | Sector | Chip de color |
| 3 | Desde | Fecha |
| 4 | Hasta | Fecha |
| 5 | Días | Total corridos |
| 6 | Reemplazante | Nombre |
| 7 | Fecha solicitud | |
| 8 | Días desde solicitud | Con alerta visual (verde 0-2, amarillo 3-6, rojo 7+) |
| 9 | Estado | Badge con color según estado |
| 10 | Progreso aprobación | Iconos (ej: Gerente ✅ / Consejo 1/2) |
| 11 | Alertas | Chips de saldo excedido, superposición jerárquica, poca anticipación |
| 12 | Acciones | Según rol y estado del pedido |

### 6.4 Acciones sobre cada fila

**Si el usuario puede aprobar** (según rol y estado):
- ✅ **Aprobar** → si es Gerente, cambia estado. Si es Consejo, registra su voto y evalúa mayoría.
- ❌ **Rechazar** → pide motivo obligatorio.

**Si el usuario es el solicitante** (según estado):
- ✏️ Editar (solo si estado = Borrador).
- 📤 Elevar (solo si estado = Borrador).
- 🗑 Anular (solo si estado = Borrador o Pendiente Gerente).
- 🚫 Solicitar anulación (solo si estado = Aprobada — no aparece acá porque Aprobada está en Historial, pero se muestra desde el detalle).

**Cualquiera con acceso al detalle:**
- 👁 Ver detalle → modal solo lectura con todo el ciclo de la solicitud.

### 6.5 Filtros
- Buscador general (nombre del solicitante).
- Por sector.
- Por estado.
- Por rango de fechas (desde/hasta o fecha de solicitud).

### 6.6 Botón "+ Nueva solicitud"
Abre el modal de nueva solicitud (ver §10).

Este botón está siempre visible para cualquier administrativo.

---

## 7. Tab 2 — Historial completo

### 7.1 Qué muestra
Todas las vacaciones del sector administrativo, cualquier estado. Sin filtro temporal por defecto.

**Es solo lectura.** Las acciones (aprobar/rechazar/anular) NO se ejecutan desde acá — solo desde Tab 1.

### 7.2 Columnas
Las mismas del Tab 1, más:
- **Aprobado / Rechazado / Anulado por** (quién resolvió).
- **Fecha de resolución** (cuándo se resolvió).
- **Motivo** (si aplica, en detalle).

### 7.3 Filtros
- Buscador.
- Por año.
- Por sector.
- Por estado (multi-select).
- Por asociado.
- Por rango de fechas.

### 7.4 Acciones
Solo:
- 👁 Ver detalle.
- 🚫 Solicitar anulación (si el usuario es el solicitante Y estado = Aprobada Y fecha desde > hoy).

---

## 8. Tab 3 — Panorama de saldos

### 8.1 Qué muestra
Vista por asociado del sector administrativo, con su saldo de vacaciones del año.

### 8.2 Columnas

| # | Columna | Cálculo |
|---|---|---|
| 1 | Asociado | Nombre + N° socio |
| 2 | Sector | Del legajo |
| 3 | Antigüedad | Calculada desde fecha de ingreso |
| 4 | Días asignados año | `legajo.dias_vacaciones_anuales` |
| 5 | Días ya tomados | Suma de días de vacaciones con estado "Aprobada" en el año actual |
| 6 | Días en proceso | Suma de días de vacaciones en estados intermedios (Pendiente Gerente, Pendiente Consejo) |
| 7 | Días disponibles | asignados - tomados |
| 8 | Alerta | Chips visuales según reglas |

### 8.3 Alertas visuales

- **⚠️ Saldo alto sin tomar:** si estamos en el último trimestre del año (oct/nov/dic) y tiene más de 10 días sin usar.
- **⚠️ Sin días asignados:** si `dias_vacaciones_anuales = 0` o null.
- **✅ Ya tomó todos:** si disponibles = 0.

### 8.4 Filtros
- Por sector.
- Solo con alertas (checkbox).

### 8.5 Botón "📥 Exportar a Excel"
Exporta el listado visible (respetando filtros). Usar SheetJS (`xlsx` en npm).

---

## 9. Tab 4 — Calendario

### 9.1 Qué muestra
Grilla mensual con los días que cada administrativo está de vacaciones.

**Solo muestra vacaciones con estado "Aprobada"** (o las que están en proceso pero con soft warning en su color).

### 9.2 Estructura visual
- Filas = personas del sector administrativo con vacaciones en el mes visible.
- Columnas = días 1..N del mes, con día de semana.
- Celda coloreada = persona de vacaciones ese día.
- Colores:
  - Verde suave: aprobada.
  - Amarillo suave: en proceso (pendiente).
  - Gris: fines de semana (todos los días son ausencia igual, pero visualmente diferenciados).
- Resaltar hoy (borde azul).

### 9.3 Navegación
- Botones "← Anterior" / "Siguiente →" para cambiar de mes.
- Selector de mes/año directo.

### 9.4 Interacción
- Click en una celda ocupada → tooltip con datos: quién, desde, hasta, sector.
- Click en el nombre de una persona → abre su historial de vacaciones filtrado.

### 9.5 Filtros
- Por sector.

---

## 10. Modal de nueva solicitud

### 10.1 Estructura
Modal grande dividido en 4 secciones visuales.

### 10.2 Sección 1 — Solicitante (auto-completada, readonly)

| Campo | Valor |
|---|---|
| Nombre | Auto del usuario logueado |
| N° socio | Auto |
| Sector | Auto del legajo |
| Antigüedad | Calculada al vuelo |
| Días asignados año actual | Auto `legajo.dias_vacaciones_anuales` |
| Días ya tomados | Auto (suma de aprobadas en el año) |
| Días en proceso | Auto (suma en estados intermedios) |
| **Días disponibles** | Auto (asignados - tomados - en proceso) |

**Toda esta sección es informativa.** El asociado no la modifica.

### 10.3 Sección 2 — Fechas del pedido

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Fecha desde | Date | Sí | Validaciones en §10.6 |
| Fecha hasta | Date | Sí | Debe ser >= desde |
| Días solicitados | Number readonly | Auto | Cálculo: hasta - desde + 1 (días corridos) |
| Fecha de retorno | Date readonly | Auto | hasta + 1 día |

Al cambiar desde o hasta, recalcular días y retorno.

### 10.4 Sección 3 — Cobertura

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Reemplazante | Autocompletado sobre admins activos del mismo sector | Sí | No puede ser el propio solicitante |
| Descripción del reemplazo | Textarea | No | Detalle de qué tareas cubre |
| Observaciones | Textarea | No | Notas generales |

### 10.5 Sección 4 — Aprobadores (informativa)

Se auto-completa mostrando quiénes van a intervenir:
- **Gerente asignado:** nombre del gerente del sector del solicitante (consulta al sistema de permisos).
- **Consejo:** Presidente, Tesorero, Secretario (nombres del sistema de permisos).

Si el solicitante es miembro del Consejo, mostrar aviso: "Como miembro del Consejo, no votarás sobre tu propia solicitud. Necesita la aprobación de los otros 2 miembros."

### 10.6 Validaciones al elevar

**Obligatorios:**
- Fecha desde, fecha hasta, reemplazante.

**Reglas de fechas:**
- Desde no puede ser anterior a hoy.
- Hasta debe ser >= desde.
- Si desde < now() + 48hs → soft warning "Este pedido tiene menos de 48hs de anticipación. ¿Confirmás igual?".

**Reglas de saldo:**
- Si `días solicitados > días disponibles` → soft warning "Este pedido excede tu saldo disponible en X días. Podés elevarlo si el gerente aprueba en excepción."

**Reglas de superposición:**
- Si el solicitante tiene un `jefe_directo` cargado en su legajo, verificar si el jefe tiene vacaciones aprobadas o pendientes que se superponen. Si sí → soft warning al Gerente al aprobar (no al solicitante al elevar, para no bloquear el flujo).

**Reglas de reemplazante:**
- Debe existir como legajo activo.
- Debe ser del mismo sector que el solicitante.
- No puede ser el propio solicitante.

### 10.7 Botones del modal

- **Guardar borrador** → estado Borrador. Solo el propio solicitante puede editarlo después.
- **📤 Elevar para aprobación** → estado "Pendiente aprobación Gerente". Genera notificación al Gerente del sector.
- **Cancelar** → cierra sin guardar.

---

## 11. Flujo completo de aprobación

### 11.1 Diagrama del ciclo

```
[Borrador]
    │
    │  (Elevar)
    ▼
[Pendiente Gerente]
    │
    ├─(Gerente aprueba)─────► [Pendiente Consejo]
    │                             │
    │                             │  (Se acumulan votos independientes de los 3)
    │                             │
    │                             ├─(2 votos "Aprobar")──► [Aprobada]
    │                             │                          │
    │                             │                          │  (Solicitud de anulación)
    │                             │                          ▼
    │                             │                     [Solicitud de anulación pendiente]
    │                             │                          │
    │                             │                          ├─(2 "Invalidar")──► [Anulada por Consejo]
    │                             │                          │
    │                             │                          └─(2 "Mantener")───► [Anulación rechazada por Consejo]
    │                             │                                                  └── Vuelve a: [Aprobada]
    │                             │
    │                             ├─(2 votos "Rechazar")─► [Rechazada por Consejo]
    │                             │
    │                             └─(Solicitante pide al Gerente anular)──► [Anulada por Gerente]
    │
    ├─(Gerente rechaza)─────────────────────────────────► [Rechazada por Gerente]
    │
    └─(Solicitante anula)────────────────────────────────► [Anulada por solicitante]
```

### 11.2 Notificaciones por transición

Todas van a la tabla `notificaciones_sistema` con `destinatario_rol` correspondiente.

| Transición | A quién notificar | Tipo |
|---|---|---|
| Elevada (Borrador → Pendiente Gerente) | Al Gerente del sector | `vacacion_solicitada` |
| Gerente aprueba (→ Pendiente Consejo) | A los 3 miembros del Consejo + al solicitante | `vacacion_a_consejo` |
| Gerente rechaza (→ Rechazada por Gerente) | Al solicitante | `vacacion_rechazada_gerente` |
| Consejo alcanza mayoría "aprobar" (→ Aprobada) | Al solicitante + reemplazante + Gerente + RRHH | `vacacion_aprobada` |
| Consejo alcanza mayoría "rechazar" (→ Rechazada por Consejo) | Al solicitante + Gerente | `vacacion_rechazada_consejo` |
| Solicitante pide anulación (→ Solicitud de anulación pendiente) | A los 3 miembros del Consejo | `vacacion_anulacion_solicitada` |
| Consejo alcanza mayoría "invalidar" (→ Anulada por Consejo) | Al solicitante + reemplazante + Gerente + RRHH | `vacacion_anulada` |
| Consejo rechaza anulación (→ Anulación rechazada por Consejo) | Al solicitante | `vacacion_anulacion_rechazada` |
| Solicitante anula desde Borrador o Pendiente Gerente | Al Gerente (si aplica) | `vacacion_anulada_solicitante` |
| Gerente anula (por pedido del solicitante) | Al solicitante | `vacacion_anulada_gerente` |

### 11.3 Lógica de mayoría del Consejo

Al registrar un voto, el sistema evalúa inmediatamente si se alcanzó mayoría:

**Función `evaluarConsejo(vacacion)`:**

```javascript
function evaluarConsejo(vacacion) {
  const votos = [vacacion.voto_presidente, vacacion.voto_tesorero, vacacion.voto_secretario];
  
  // Excluir null (los que aún no votaron) y los del solicitante (si es del consejo)
  const votosValidos = votos.filter(v => v !== null && v !== undefined);
  const aprobar = votosValidos.filter(v => v === 'Aprobar').length;
  const rechazar = votosValidos.filter(v => v === 'Rechazar').length;
  
  // Si el solicitante es del Consejo, se necesitan 2 votos de los otros 2
  const esConsejero = esMiembroDelConsejo(vacacion.legajo_id_local);
  const mayoriaNecesaria = esConsejero ? 2 : 2; // igual, 2 en ambos casos
  
  if (aprobar >= mayoriaNecesaria) {
    return 'Aprobada';
  }
  if (rechazar >= mayoriaNecesaria) {
    return 'Rechazada por Consejo';
  }
  return 'Pendiente aprobación Consejo'; // sigue esperando
}
```

Aplicar la misma lógica para la evaluación de solicitudes de anulación (con votos "Invalidar" / "Mantener").

### 11.4 Actualización de saldo automático

Cuando una vacación pasa a estado "Aprobada":
- **No hace falta guardar el saldo** en ningún lado. El saldo se calcula al vuelo cuando se necesita (en el modal, en el tab de saldos, en las validaciones).
- Cálculo: `dias_disponibles = legajo.dias_vacaciones_anuales - sum(dias_solicitados) donde estado='Aprobada' AND año=current_year`.

Cuando pasa a estado "Anulada por Consejo" o cualquier otro estado anulado tras haber estado aprobada:
- El saldo se recalcula automáticamente al vuelo (los días vuelven a estar disponibles).

---

## 12. Configuración del módulo

### 12.1 Dónde vive la configuración
El módulo Vacaciones NO tiene una pantalla de configuración propia. Los elementos que serían configurables viven en otros lados:

- **Días asignados por asociado:** en el campo `dias_vacaciones_anuales` del legajo. Se edita desde el módulo Legajos.
- **Sectores:** en el catálogo global de sectores (si existe; si no, hardcodeados con los 8 del legacy hasta que Lautaro defina).
- **Roles de aprobación (Gerente, Consejo):** en el sistema global de permisos y facultades del proyecto. Si no existe aún, mock temporal configurable en código.
- **Motivos de rechazo o anulación:** libre (textarea), no catálogo.

### 12.2 Pre-requisito importante
Antes de que este módulo funcione en producción, el sistema global de permisos debe:
- Permitir marcar a un usuario como "Gerente" y asociarlo a un sector.
- Permitir marcar a un usuario como "Miembro del Consejo" con rol (Presidente / Tesorero / Secretario).

**Si el sistema de permisos no existe aún**, Fede debe implementar un mock temporal en `src/modules/vacaciones/permisos.js`:

```javascript
// MOCK TEMPORAL - reemplazar cuando el sistema de permisos esté implementado
const MOCK_GERENTES = {
  'Coord. RRHH': 'Gabriela Lucero',
  'Coord. Operaciones y Planeamiento': '[nombre a definir]',
  // ... etc
};

const MOCK_CONSEJO = {
  presidente: '[nombre a definir]',
  tesorero: '[nombre a definir]',
  secretario: '[nombre a definir]'
};

export function esGerenteDeArea(usuario, sector) {
  return MOCK_GERENTES[sector] === usuario.nombre;
}

export function esMiembroConsejo(usuario) {
  if (MOCK_CONSEJO.presidente === usuario.nombre) return 'Presidente';
  if (MOCK_CONSEJO.tesorero === usuario.nombre) return 'Tesorero';
  if (MOCK_CONSEJO.secretario === usuario.nombre) return 'Secretario';
  return null;
}
```

Marcar claramente con `// TODO: reemplazar por sistema global de permisos` los lugares donde se usa el mock.

---

## 13. Integraciones con otros módulos

### 13.1 Módulo Legajos
**Cambios necesarios en Legajos:**
- Agregar campo `dias_vacaciones_anuales integer DEFAULT 0` (para administrativos).
- Agregar campo `jefe_directo_legajo_id_local text` (opcional, para administrativos).
- Actualizar formulario de edición de legajo para permitir editar estos campos.

**Consulta desde Vacaciones:**
- El módulo Vacaciones consulta legajos con `estado === 'Activo'` para autocompletar solicitantes y reemplazantes.
- Filtrar por sector para el reemplazante.

### 13.2 Módulo Liquidaciones
- Al aprobar una vacación (o al ejecutarse en su fecha), el módulo de Liquidaciones debe saber que ese asociado tiene esos días como "ausencia paga".
- **Alcance de esta implementación:** dejar la integración preparada pero no ejecutada. Fede debe documentar en el código dónde tocaría la actualización a Liquidaciones. La integración real se hace cuando Liquidaciones esté migrado.

### 13.3 Sistema de notificaciones
Ya existe `notificaciones_sistema` (creada en Reasignaciones). Usar la misma tabla con los tipos definidos en §11.2.

### 13.4 WhatsApp (a futuro)
Cuando Meta esté destrabada:
- Notificar por WhatsApp a los destinatarios cada transición.
- Los mensajes se generan con templates que Lautaro define después.

### 13.5 Módulo Descansos (paralelo)
Vacaciones y Descansos son módulos separados, pero comparten:
- El calendario global de ausencias (a futuro puede ser una vista transversal).
- El modelo mental de "ausencia paga con aprobación".

Fede debe implementar los dos módulos con la **misma calidad y coherencia visual**, pero no forzar que compartan código a menos que sea claramente reusable.

---

## 14. Etapas de implementación

### Etapa 1 — Base persistente (crítica)
- Aplicar SQL `v015_vacaciones.sql` en Supabase.
- Actualizar mapeo en `src/shared/supabase.js`.
- Crear estructura del módulo `src/modules/vacaciones/`.
- Implementar campos nuevos en Legajos (con SQL versionado aparte).
- Implementar Tab 1 (Pendientes) con bandeja según rol.
- Implementar Tab 2 (Historial).
- Implementar modal de solicitud con validaciones reales.
- Implementar flujo completo de aprobación (Gerente + Consejo con mayoría).
- Implementar anulación en distintos estados.
- Implementar mock del sistema de permisos.

**Al terminar Etapa 1:** cualquier administrativo puede solicitar, elevar, y su solicitud pasa por el flujo completo con persistencia real.

### Etapa 2 — Vistas analíticas
- Implementar Tab 3 (Panorama de saldos) con cálculos automáticos.
- Implementar Tab 4 (Calendario) con vista mensual.
- Botón exportar a Excel con SheetJS.

**Al terminar Etapa 2:** el módulo está funcionalmente completo para RRHH y gerentes.

### Etapa 3 — Notificaciones internas
- Implementar generación de notificaciones en `notificaciones_sistema` en cada transición.
- Implementar la campana del sistema si no existe aún.

**Puede hacerse en paralelo con Etapas 1 o 2.**

### Etapa 4 — WhatsApp (espera Meta)
- Envío automático de notificaciones por WhatsApp según templates.

### Etapa 5 — Integración con permisos reales
- Reemplazar el mock de permisos por consulta al sistema global cuando esté implementado.

---

## 15. Bugs conocidos a corregir

Lista clara para Fede — todos estos bugs existen en el módulo actual y deben quedar resueltos:

1. **Nada persiste en Supabase** — mapear tabla, hacer `supaSync` correctamente.
2. **`poblarSelectsVacaciones` nunca se invoca** — en el módulo migrado no debería haber esta función; los selects se pueblan al abrir cada modal.
3. **`cambiarEstadoVacOp` no intenta persistir** — ya no aplica (ese estado es del módulo Descansos), pero cuidar de no repetir el bug.
4. **Botón "Editar" es stub** — implementar edición real (solo en Borrador).
5. **Acceso por índice de array en acciones** — usar acceso por id.
6. **Buscadores de la barra superior no funcionan** — reimplementar.
7. **Campo huérfano `va-nro-socio` en JS** — usar el correcto.
8. **Asteriscos decorativos** — validar todos los obligatorios.
9. **Escala de días por antigüedad hardcodeada** — remover, usar `legajo.dias_vacaciones_anuales`.
10. **Modal admin no tiene input para N° socio** — se auto-completa al elegir asociado (readonly).

---

## 16. Casos borde y validaciones

Lista de casos borde para tener en cuenta durante la implementación:

### 16.1 Solicitante sin días asignados
- Si `legajo.dias_vacaciones_anuales = 0` o null → al abrir el modal, mostrar mensaje "Todavía no tenés días asignados para este año. Contactá a RRHH."
- Permite guardar borrador pero **no elevar** hasta que RRHH cargue los días.

### 16.2 Miembro del Consejo pide sus vacaciones
- El sistema detecta que el solicitante es miembro del Consejo.
- Muestra aviso en el modal: "Como miembro del Consejo, no votarás sobre tu propia solicitud."
- Cuando la solicitud llega a "Pendiente Consejo", el sistema oculta el botón "Aprobar/Rechazar" para el propio solicitante en su fila.
- Los otros 2 miembros pueden aprobar (unanimidad de los 2).
- Guard: si por algún bug el solicitante intenta votar → error.

### 16.3 Gerente pide vacaciones
- Si el Gerente de un área pide sus vacaciones, ¿quién las aprueba en el nivel 1?
- **Opción para Fede:** consultar el sistema de permisos para ver si hay un "Sub-Gerente" o "Gerente General" que lo apruebe.
- Si no hay, la solicitud pasa directo al Consejo (salta el nivel 1).
- Documentar en el mock cómo resolverlo mientras el sistema real no esté.

### 16.4 Reemplazante que también pide vacaciones esos días
- Si el reemplazante ya tiene vacaciones aprobadas o pendientes que se superponen con las del solicitante → soft warning al elevar: "El reemplazante propuesto tiene vacaciones esos días. ¿Elegir otro?"
- No bloquea. El asociado decide.

### 16.5 Solicitud con fechas del año siguiente
- Un asociado puede pedir vacaciones para enero 2027 estando en octubre 2026.
- El saldo aplicado es el del año en el que empiezan las vacaciones (año de `fecha_desde`).
- Si la persona todavía no tiene días asignados para el año siguiente (`dias_vacaciones_anuales = 0` para 2027) → error al elevar.

**Decisión de Fede:** cómo modelar los días asignados por año. Ver §18.1.

### 16.6 Aprobación con votos empatados en Consejo
- Si el Consejo tiene 1 voto "Aprobar" y 1 voto "Rechazar", el tercer voto define.
- Si el tercer voto se demora mucho, la solicitud queda pendiente. Sin timeout automático.
- Mostrar en el detalle "Esperando voto de [nombre del que falta]".

### 16.7 Anulación de vacación ya aprobada con fecha vencida
- Si el asociado quiere anular una vacación aprobada pero la fecha desde **ya pasó**, no tiene sentido (ya empezaron).
- Guard: si `fecha_desde <= hoy`, ocultar botón "Solicitar anulación".

### 16.8 Modificar solicitud aprobada
- No se puede editar una solicitud una vez elevada.
- Si el asociado quiere cambiar fechas de una vacación aprobada, tiene que anularla (con el flujo del Consejo) y hacer una nueva.

### 16.9 Reemplazante que se dio de baja
- Si el reemplazante fue dado de baja después de la aprobación pero antes de las vacaciones → el sistema debería alertar.
- **Alcance:** dejar el warning como TODO. Fede puede implementarlo en Etapa 2 si el tiempo permite.

### 16.10 Legajo sin sector cargado
- Un legajo administrativo sin `sector` cargado no puede solicitar vacaciones (no se sabe quién es su Gerente).
- Guard: bloquear al abrir el modal, sugerir "Contactá a RRHH para completar tu legajo".

### 16.11 Vacación que cruza fin de año
- Ejemplo: desde 27/12/2026 hasta 05/01/2027.
- Los días de 2026 se descuentan de `dias_vacaciones_anuales` del 2026.
- Los días de 2027 se descuentan del 2027.
- Requiere separar el cálculo por año en la lógica de saldo.

**Decisión de Fede:** cómo modelar esto. Alternativa simple: rechazar solicitudes que crucen fin de año y forzar 2 solicitudes separadas. Alternativa compleja: dividir automáticamente en el cálculo del saldo.

### 16.12 Notificación al reemplazante que rechaza
- Cuando la vacación se aprueba, se notifica al reemplazante.
- Si el reemplazante quiere "rechazar" ser reemplazo → no hay flujo actualmente para eso.
- **Alcance:** el reemplazante puede contactar al solicitante y este anula la vacación (flujo estándar de anulación). No hay botón dedicado en esta versión.

---

## 17. Convenciones del proyecto que debe respetar

### 17.1 Del código
- **Nombres en español:** funciones, variables, tablas.
- **camelCase en frontend, snake_case en Supabase.**
- **Un commit por cambio lógico**, mensaje en español descriptivo.

### 17.2 De la base de datos
- **Nunca modificar SQL versionado viejo.** Si hay que ajustar, crear un `vNNN` nuevo.
- **Soft delete siempre** con `anulado boolean DEFAULT false`.
- **Guard de idempotencia** en operaciones críticas (aprobar, votar Consejo).

### 17.3 De la UI
- Toasts para feedback.
- Loading indicators si tarda >1 segundo.
- Confirmaciones para acciones destructivas.
- Estados con colores consistentes con el resto del sistema.

### 17.4 De testing
- Probar manualmente:
  - Crear solicitud → guardar borrador → editar → elevar.
  - Gerente aprueba → verificar que llega al Consejo.
  - Consejo aprueba (2 de 3) → verificar que pasa a Aprobada.
  - Consejo rechaza → verificar que pasa a Rechazada por Consejo.
  - Solicitar anulación de vacación aprobada → Consejo decide → verificar ambos caminos.
  - Miembro del Consejo pide vacaciones → verificar que no puede votar sobre sí mismo.
  - Solicitud que excede saldo → soft warning, permite elevar.
  - Solicitud con menos de 48hs → soft warning, permite elevar.
  - Superposición con jefe directo → soft warning al Gerente al aprobar.
  - Anulación en distintos estados → verificar reglas.

---

## 18. Decisiones técnicas delegadas a Fede

Estos puntos quedaron abiertos deliberadamente para que Fede los decida con criterio técnico.

### 18.1 Cómo modelar días asignados por año

**Contexto:** el campo `dias_vacaciones_anuales` del legajo es actualmente un solo integer. Pero los días pueden variar año a año (aumento por antigüedad, ajustes por Gabi).

**Opciones:**
- **A)** Un solo campo en el legajo. Vale para "el año en curso". Se ajusta cada 1° de enero por RRHH.
- **B)** Tabla aparte `dias_vacaciones_asignados` con `legajo_id_local`, `anio`, `dias`. Se puede consultar histórico y planificar años futuros.

**Trade-off:**
- A es simple pero pierde histórico y no permite planificar 2027 en 2026.
- B es más complejo pero robusto.

**Recomendación:** empezar con A. Migrar a B si Gabi lo pide.

### 18.2 Cómo modelar vacaciones que cruzan fin de año

**Contexto:** una solicitud de 27/12/2026 a 05/01/2027 afecta el saldo de dos años.

**Opciones:**
- **A)** Rechazar en la validación y forzar 2 solicitudes separadas.
- **B)** Permitir y dividir automáticamente el cálculo del saldo por año.

**Recomendación:** A por simplicidad. Al elevar, si `year(desde) != year(hasta)` → error "Las vacaciones no pueden cruzar el fin de año. Dividí en dos solicitudes."

### 18.3 Auto-completar sector al elegir reemplazante

**Contexto:** el reemplazante debe ser del mismo sector que el solicitante.

**Opciones:**
- **A)** Filtrar en el autocompletado — solo mostrar personas del mismo sector.
- **B)** Mostrar todos, validar al elevar.

**Recomendación:** A. Mejor UX, evita errores.

### 18.4 Timeout para votos del Consejo

**Contexto:** si un miembro del Consejo no vota, la solicitud queda pendiente indefinidamente.

**Opciones:**
- **A)** Sin timeout. Queda pendiente hasta que alguien vote.
- **B)** Timeout de X días. Después el sistema envía recordatorios.
- **C)** Timeout con auto-decisión (por ejemplo, si pasan 15 días sin voto, se asume voto pasivo del que falta).

**Recomendación:** A por ahora. B cuando WhatsApp esté funcionando (recordatorios automáticos).

---

## 19. Preguntas frecuentes anticipadas

**¿El sistema chequea que el reemplazante haya aceptado ser reemplazo?**
No en esta versión. El solicitante pone el nombre, y se asume que hablaron entre ellos antes. Si el reemplazante no está de acuerdo, contactan al solicitante y este anula.

**¿Puede haber más de un reemplazante?**
No en esta versión. Solo uno. Si en la práctica se necesitan varios, se anota en "Descripción del reemplazo" quiénes cubren qué.

**¿Qué pasa si el Gerente y el Presidente del Consejo son la misma persona?**
Ver §16.3 y §18.4. En el mock temporal, definir manualmente. Cuando el sistema de permisos real esté, permitir que un usuario tenga múltiples roles y el flujo se adapte.

**¿Se pueden pedir vacaciones para años futuros?**
Sí, mientras haya `dias_vacaciones_anuales` asignados para ese año (ver §18.1).

**¿Puedo tocar `src/legacy.js`?**
No. Dejar la versión vieja intacta como referencia. Cuando el módulo migrado esté funcionando, se remueve la referencia del menú.

**¿Puedo tocar el módulo Legajos?**
Solo lo mínimo necesario para agregar los 2 campos nuevos y su formulario. Coordinar con Lautaro antes de hacer cualquier cambio no trivial.

**¿Cómo se relaciona con Descansos operativos?**
Son módulos separados con su propia lógica. Comparten solamente:
- La misma tabla `notificaciones_sistema`.
- El mismo concepto de "ausencia paga con aprobación".
- (A futuro) Un calendario global de ausencias como vista transversal.

Ver `docs/DISENO_descansos.md` para el detalle del módulo de descansos operativos.

---

## 20. Cierre

Este documento es la base para implementar el módulo Vacaciones. Fue construido a partir de:

1. Inventario técnico del módulo actual en `legacy.js` (ver `docs/INVENTARIO_vacaciones_descanso_legacy.md`).
2. Sesión de diseño con Lautaro sobre el proceso real de vacaciones administrativas, las decisiones organizacionales, y el rol del Consejo de Administración.
3. Alineación con las políticas del proyecto (`POLITICAS_PROYECTO.md`) y las convenciones aprendidas (`CLAUDE.md`).

Con este documento, Fede tiene todo lo necesario para implementar sin bloqueos. Ante cualquier duda de diseño no cubierta: **preguntar antes de codear**, siguiendo la política A.4 (diagnóstico antes de cambios).

**¡Buenas vacaciones!** 🏖️
