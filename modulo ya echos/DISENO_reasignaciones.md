# Diseño del módulo Reasignaciones — Especificación para implementación

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Reasignaciones
**Autor del diseño:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-05
**Versión:** 1.0

---

## Cómo usar este documento

Este documento es la **fuente de verdad** para implementar el módulo Reasignaciones. Está pensado para que se pueda programar **sin necesidad de volver a preguntar** por decisiones de diseño.

Se lee de arriba hacia abajo:
- Secciones **1-3** son contexto (leer una vez).
- Sección **4** es el modelo de datos (leer y aplicar antes de codear).
- Sección **5** es la estructura de archivos.
- Secciones **6-9** son la especificación de vistas.
- Sección **10** es el sugeridor IA (lo más complejo del módulo).
- Sección **11** es la arquitectura de la Edge Function.
- Secciones **12-13** son configuración e integraciones.
- Sección **14** es el plan por etapas.
- Sección **15** son bugs conocidos a corregir.
- Sección **16** son casos borde.
- Sección **17** son convenciones a respetar.
- Sección **18** son decisiones técnicas que puede tomar Fede.

**Antes de escribir cualquier código:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md` y el inventario técnico del módulo actual (`docs/INVENTARIO_reasignaciones_legacy.md`).

---

## 1. Contexto del módulo

### 1.1 Qué es Ohlimpia
Ohlimpia es un ERP cooperativo para gestionar una cooperativa de trabajo de servicios de limpieza con ~500 asociados. Cubre selección, ingreso, legajos, capacitaciones, liquidaciones, clientes, económico-financiero.

### 1.2 Qué es el módulo Reasignaciones
Es el módulo donde se gestiona el **movimiento de asociados entre servicios (clientes)**. Un asociado puede tener que cambiar de servicio por múltiples razones: baja del cliente actual, conflictos, pedidos de él mismo, necesidad de cubrir otro cliente, mejora de condiciones, etc.

El módulo **pertenece principalmente a Central de Operaciones**, con conexión fuerte con RRHH (Gabi y su equipo) que necesita estar informado de todos los movimientos.

### 1.3 El problema que resuelve

**Antes del sistema (situación actual):**
- La persona a cargo de Central de Operaciones decide "a ojo" a quién reasignar.
- Habla informalmente con supervisores que necesitan personal.
- Su decisión no siempre es la mejor opción posible (le faltan datos que no puede procesar mentalmente en tiempo real).
- No hay trazabilidad formal de por qué se movió a quién.

**Con el módulo migrado y con IA:**
- La IA analiza pedidos de personal pendientes y sugiere los mejores candidatos.
- Central toma la decisión final con información objetiva.
- Toda decisión queda registrada con su justificación.
- El legajo del asociado se actualiza automáticamente al aprobar.

### 1.4 Usuarios del módulo

| Rol | Qué puede hacer |
|---|---|
| **Supervisores** (cada uno con su usuario) | Iniciar solicitudes de reasignación de asociados de su equipo |
| **Central de Operaciones** | Iniciar solicitudes, usar sugeridor IA, gestionar el módulo día a día |
| **RRHH** (Gabi y equipo) | Consultar el módulo, recibir notificaciones de impacto (pólizas), iniciar solicitudes si el asociado se les acerca |
| **Gerente / Subgerente de Operaciones** | Aprobar o rechazar solicitudes elevadas |
| **Gerente de RRHH** | Aprobar o rechazar solicitudes elevadas (aprobador dual) |

### 1.5 Estado actual (antes de esta implementación)

El módulo existe hoy en `src/legacy.js` (líneas ~1889–2470). Es **parcialmente funcional**:

- **La tabla `reasignaciones` YA está mapeada** en `supabase.js` (línea 22).
- **La creación sí persiste** (`guardarReasignacion` llama a `supaSync`).
- **La integración con Legajos ya existe:** el módulo Legajos (ya migrado) consume reasignaciones aprobadas y las muestra en el timeline del legajo.

Pero tiene **bugs graves de persistencia y consistencia**:

- **Aprobar/rechazar NO persiste.** Al aprobar, el estado cambia en memoria + se actualiza el legajo en memoria, pero **nada de eso se sincroniza a Supabase.** Consecuencia real: se aprueba, se ve OK, se recarga la página, y el asociado sigue en el servicio viejo.
- **ABM de motivos y aprobadores no persiste** tampoco.
- **Filtros duplicados** (uno en la barra, otro en la tabla del listado) que leen distinto → varios controles inertes.
- **Acceso por índice de array** en las acciones de aprobar/rechazar → si el usuario filtra la lista, puede terminar aprobando la reasignación equivocada. Este es el patrón conocido "IDs por índice vs por valor" ya documentado en `CLAUDE.md`.
- **HTML malformado** en el modal de detalle de rotación.
- **Filtro de rotación no funciona** (solo re-renderiza).
- **Stat "Aprobadas este mes"** filtra por año, no por mes.

**Ver:** `docs/INVENTARIO_reasignaciones_legacy.md` para el detalle exacto del código actual.

### 1.6 Objetivo de esta implementación

Rehacer el módulo de cero en `src/modules/reasignaciones/` siguiendo el patrón de módulos migrados (política **A.11**). El módulo migrado debe:

1. **Persistir TODAS las operaciones** en Supabase (creación, aprobación, rechazo, edición, config).
2. **Reemplazar el acceso por índice** por acceso por ID (patrón ya conocido).
3. **Implementar el sugeridor IA real** (con Anthropic API vía Edge Function).
4. **Preparar la infraestructura** para las notificaciones automáticas por WhatsApp (que se activarán cuando Meta esté destrabada).
5. **Alertar a RRHH** cuando hay impacto en pólizas de seguro.
6. **Mantener la integración con Legajos** (que ya funciona) y agregar la integración con Pedidos de personal.

---

## 2. Alcance de la implementación

### 2.1 Qué incluye
- Tabla `reasignaciones` en Supabase con el nuevo modelo de estados.
- Tabla `motivos_reasignacion` en Supabase (para persistir la config).
- Tabla `aprobadores_reasignacion` en Supabase (para persistir la config).
- Tabla `notificaciones_sistema` en Supabase (para alertas de póliza a RRHH).
- Módulo migrado en `src/modules/reasignaciones/`.
- Los 3 tabs actuales rediseñados (Pendientes, Historial, Rotación).
- Modal de Nueva reasignación con validaciones reales.
- Sugeridor IA (Buscador de candidatos) en dos direcciones:
  - A → D: sugiere destinos para un asociado dado.
  - D → A: sugiere candidatos para un pedido de personal (integración con módulo Pedidos).
- Edge Function `sugerir-candidatos-reasignacion` que llama a Anthropic API.
- Alerta a RRHH en la campana del sistema cuando hay impacto en póliza.
- Botón de exportar a Excel en el Tab 3 (Rotación).

### 2.2 Qué NO incluye (etapas futuras)
- Notificaciones automáticas por WhatsApp al asociado, supervisores, aprobadores (espera destrabar Meta).
- Flujo de auto-postulación del asociado a un pedido (idea para futuro).
- Cálculo de distancia por transporte público (por ahora solo lineal).
- Ampliación de "Impacto en seguros" con más categorías (a validar con Gabi después).
- Modal para cargar el motivo de auto-baja del asociado (si se le pregunta directamente por qué quiere cambiarse).

---

## 3. Decisiones tomadas

Se listan las decisiones tomadas durante la sesión de diseño. **Cada una tiene su justificación.** Fede no debe cambiarlas sin consultar.

### 3.1 Nuevo modelo de estados (6 estados)

Reemplaza los 4 actuales (Borrador / Pendiente / Aprobado / Rechazado) con 6 más precisos:

| Estado | Qué significa |
|---|---|
| **Borrador** | Solicitud iniciada pero no elevada |
| **Pendiente** | Elevada, esperando aprobación de Operaciones |
| **Aprobada, esperando fecha efectiva** | Aprobada pero la fecha del cambio es futura. El legajo no se actualiza aún |
| **Aprobada, ejecutada** | Aprobada y con el cambio aplicado al legajo |
| **Rechazada** | Rechazada con motivo obligatorio visible al solicitante |
| **Anulada** | Se dio de baja antes de aprobarse (arrepentimiento) |

### 3.2 Aprobación obligatoria por Operaciones
Toda reasignación debe pasar por Operaciones (Gerente o Subgerente), aunque haya acuerdo entre supervisores. Es una regla organizacional: Operaciones debe tener visibilidad completa.

### 3.3 Elevado por = usuario logueado
El campo "Elevado por" se auto-completa con el usuario logueado en el momento de crear la solicitud. **No es editable.** Elimina las 4 opciones hardcoded actuales.

### 3.4 Solicitud originada por (campo nuevo)
Nuevo campo obligatorio con 4 opciones fijas:
- Asociado.
- Supervisor.
- Central de Operaciones.
- RRHH.

Refleja de dónde vino la iniciativa (a menudo distinta de quién carga la solicitud en el sistema).

### 3.5 Reglas de validación de fecha efectiva
- No puede ser en el pasado.
- Mínimo 24 horas desde hoy.
- Máximo 3 meses en el futuro.

### 3.6 Al aprobar
- Si `fecha_efectiva > hoy` → estado pasa a **"Aprobada, esperando fecha efectiva"**. El legajo NO se actualiza aún.
- Si `fecha_efectiva <= hoy` → estado pasa a **"Aprobada, ejecutada"**. El legajo se actualiza inmediatamente.
- Un cron/job debe correr diariamente para pasar automáticamente las "esperando fecha efectiva" a "ejecutada" cuando llega la fecha.

### 3.7 Al rechazar
Motivo del rechazo es **obligatorio** (textarea en un modal simple). El motivo queda visible en el detalle de la reasignación, para que el solicitante lo vea al entrar al Tab Historial.

### 3.8 Al aprobar con impacto en póliza
Si `altura = Sí` o `poliza = Sí`, el sistema genera una **notificación en la campana del sistema** para el equipo de RRHH. La notificación al hacer click abre el detalle de la reasignación.

**No bloquea el circuito.** RRHH ejecuta el cambio de póliza fuera del sistema (con la aseguradora). Si Gabi pide más tarde cerrar el circuito con confirmación, se agrega en una iteración futura.

### 3.9 Actualización del legajo al ejecutar
Al pasar a "Aprobada, ejecutada", el sistema actualiza en el legajo del asociado:
- Servicio.
- Supervisor.
- Categoría/función (si cambió).
- Zona geográfica (si cambió).
- Agrega entrada al `historialMovimientos` con la info del cambio.

### 3.10 Sugeridor IA — dos direcciones

**A → D** (Asociado → Destino): dentro del modal de Nueva reasignación. Se sabe quién se mueve, se busca a dónde.

**D → A** (Destino → Asociados): botón en el módulo Pedidos de personal ("Buscar candidatos"). Se sabe el pedido, se buscan candidatos.

Ambos flujos usan la misma Edge Function con parámetros distintos.

### 3.11 Sugeridor IA — 4 sugerencias
Por defecto, devuelve **4 opciones ranqueadas**. Cada opción tiene: nombre, N° socio, score 0-100, justificación (2-3 líneas), alertas si aplican.

### 3.12 Sugeridor IA — distancia lineal
Por ahora usa distancia lineal (haversine entre coordenadas). A futuro se puede mejorar con transporte público.

### 3.13 Datos que la IA considera

**Del asociado:**
- Datos básicos (nombre, N° socio, DNI, género, edad, categoría/función).
- Domicilio (dirección, localidad, código postal).
- Antigüedad.
- Servicio y supervisor actual.
- Capacitaciones aprobadas.
- Póliza de altura vigente.

**Del historial:**
- Reasignaciones de los últimos 6 meses.
- Conflictos (extraídos de motivos de reasignaciones pasadas).

**Del pedido/servicio destino:**
- Cliente (dirección, localidad).
- Categoría requerida.
- Turno/horario.
- Requisitos especiales.
- Vacantes.

**Calculado:**
- Distancia asociado ↔ servicio (haversine).

### 3.14 Tab 1 muestra Pendientes + Aprobada esperando fecha
Los "Aprobada, esperando fecha efectiva" siguen apareciendo en Tab Pendientes (porque aún no se ejecutaron). Los "Borradores" solo aparecen en una vista personal del creador ("Mis borradores"), no en Pendientes globales.

### 3.15 Alerta visual por antigüedad de solicitud
En Tab Pendientes, la columna "Días desde la solicitud" tiene alerta visual por color:
- Verde: 0-2 días.
- Amarillo: 3-6 días.
- Rojo: 7+ días.

Ayuda a Central a priorizar aprobaciones colgadas.

### 3.16 Tab 2 muestra todo sin límite temporal
El Tab Historial muestra todas las reasignaciones sin filtro de fecha por defecto. Los filtros permiten acotar si es necesario.

### 3.17 Tab 3 con más info + exportar
La grilla de Rotación agrega:
- Tiempo en el servicio actual.
- Último motivo de reasignación.
- Alerta visual si tuvo 3+ movimientos en los últimos 6 meses.

Botón "📥 Exportar a Excel" con SheetJS.

### 3.18 Se sacan notificaciones (checkboxes) del modal
Los 4 checkboxes de "Notificaciones automáticas" se remueven de esta primera versión. Se vuelven a incorporar cuando WhatsApp esté funcionando, con lógica real de envío.

### 3.19 Motivos y aprobadores se mantienen como están
- Los 12 motivos actuales se conservan (Gabi puede editarlos desde config).
- Los 2 aprobadores actuales (Gerente de Operaciones + Gerente de RRHH) se mantienen.

### 3.20 Sacar el sugeridor IA fake que existe hoy
El botón actual "🤖 Sugerir servicios destino" está fake (simula con `setTimeout`). Se elimina el código de simulación. El nuevo sugeridor va conectado a Anthropic API a través de Edge Function.

---

## 4. Modelo de datos

### 4.1 Convenciones generales
- Todas las tablas siguen el patrón del proyecto: `id bigserial PK`, `id_local text UNIQUE NOT NULL`, `created_at`, `updated_at`, `anulado boolean DEFAULT false`.
- Uso de snake_case en base de datos.
- Timestamps como `timestamptz`.
- Referencias entre tablas por `id_local` (patrón del proyecto).

### 4.2 SQL versionado

Crear el archivo `sql/v014_reasignaciones.sql`:

```sql
-- =============================================================================
-- Migración: v014 — Módulo Reasignaciones (migración desde legacy)
-- Fecha:     2026-07-05
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Rediseña el módulo Reasignaciones para que persista TODAS sus operaciones
-- en Supabase. La tabla `reasignaciones` ya existía (mapeada en supabase.js)
-- pero solo persistía la creación — aprobación/rechazo/config quedaban en
-- memoria y se perdían al recargar.
--
-- Tablas creadas / actualizadas:
--   1. reasignaciones (recreada con nuevo modelo de estados)
--   2. motivos_reasignacion (nueva, persiste config)
--   3. aprobadores_reasignacion (nueva, persiste config)
--   4. notificaciones_sistema (nueva, para alertas)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Tabla 1 — reasignaciones (recreada)
-- ---------------------------------------------------------------------------
-- Si ya existe, hacer backup antes:
-- CREATE TABLE public.reasignaciones_backup_v013 AS SELECT * FROM public.reasignaciones;
-- DROP TABLE public.reasignaciones;

CREATE TABLE public.reasignaciones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  legajo_id_local        text NOT NULL,          -- ref al asociado
  nro_socio              text NOT NULL,          -- desnormalizado
  nombre_asociado        text NOT NULL,          -- desnormalizado
  
  -- Origen
  servicio_origen        text NOT NULL,
  supervisor_origen      text NOT NULL,
  funcion_origen         text,                   -- función/categoría al momento
  zona_origen            text,
  
  -- Destino
  servicio_destino       text NOT NULL,
  supervisor_destino     text NOT NULL,
  funcion_destino        text,                   -- si cambia
  zona_destino           text,                   -- si cambia
  
  -- Detalles
  motivo                 text NOT NULL,          -- de motivos_reasignacion
  fecha_solicitud        date NOT NULL DEFAULT CURRENT_DATE,
  fecha_efectiva         date NOT NULL,          -- fecha del cambio real
  fecha_ejecucion        date,                   -- cuándo se ejecutó
  descripcion            text,                   -- contexto de la solicitud
  
  -- Origen de la solicitud
  elevado_por            text NOT NULL,          -- usuario logueado que carga
  originada_por          text NOT NULL,          -- Asociado / Supervisor / Central / RRHH
  pedido_vinculado_id_local text,                -- ref opcional a Pedidos
  
  -- Impacto seguros
  requiere_altura        boolean NOT NULL DEFAULT false,
  requiere_poliza_esp    boolean NOT NULL DEFAULT false,
  
  -- Estado
  estado                 text NOT NULL DEFAULT 'Borrador',
    -- Borrador / Pendiente / Aprobada esperando fecha efectiva /
    -- Aprobada ejecutada / Rechazada / Anulada
  
  -- Aprobación
  aprobado_por           text,
  fecha_aprobacion       timestamptz,
  motivo_rechazo         text,                   -- obligatorio si estado = Rechazada
  fecha_rechazo          timestamptz,
  anulado_por            text,                   -- quién anuló (si aplica)
  fecha_anulacion        timestamptz,
  
  -- Auditoría
  editado_por            text,
  editado_en             timestamptz,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reasign_legajo   ON public.reasignaciones(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_reasign_estado   ON public.reasignaciones(estado) WHERE NOT anulado;
CREATE INDEX idx_reasign_fecha_ef ON public.reasignaciones(fecha_efectiva) WHERE NOT anulado;
CREATE INDEX idx_reasign_pedido   ON public.reasignaciones(pedido_vinculado_id_local) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Tabla 2 — motivos_reasignacion (persiste la config)
-- ---------------------------------------------------------------------------
CREATE TABLE public.motivos_reasignacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text UNIQUE NOT NULL,
  nombre      text UNIQUE NOT NULL,
  orden       integer NOT NULL DEFAULT 0,
  anulado     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Semilla: los 12 motivos actuales
INSERT INTO public.motivos_reasignacion (id_local, nombre, orden) VALUES
  ('000000001', 'Baja del servicio (cliente)', 1),
  ('000000002', 'Conflicto con cliente', 2),
  ('000000003', 'Conflicto con compañeros', 3),
  ('000000004', 'Pedido del supervisor', 4),
  ('000000005', 'Pedido del asociado', 5),
  ('000000006', 'Reducción de personal en servicio', 6),
  ('000000007', 'Cobertura de otro servicio', 7),
  ('000000008', 'Sanción disciplinaria', 8),
  ('000000009', 'Mejora de condiciones', 9),
  ('000000010', 'Cambio de categoría/función', 10),
  ('000000011', 'Reingreso', 11),
  ('000000012', 'Otro', 12);

-- ---------------------------------------------------------------------------
-- Tabla 3 — aprobadores_reasignacion (persiste la config)
-- ---------------------------------------------------------------------------
CREATE TABLE public.aprobadores_reasignacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text UNIQUE NOT NULL,
  cargo       text UNIQUE NOT NULL,       -- ej: "Gerente de Operaciones"
  anulado     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Semilla: los 2 aprobadores actuales
INSERT INTO public.aprobadores_reasignacion (id_local, cargo) VALUES
  ('000000001', 'Gerente de Operaciones'),
  ('000000002', 'Gerente de RRHH');

-- ---------------------------------------------------------------------------
-- Tabla 4 — notificaciones_sistema (para alertas en la campana)
-- ---------------------------------------------------------------------------
-- Esta tabla es reutilizable por otros módulos. Si ya existe, saltear.
CREATE TABLE IF NOT EXISTS public.notificaciones_sistema (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,
  destinatario_rol  text NOT NULL,           -- ej: 'RRHH', 'Operaciones'
  destinatario_id   text,                    -- opcional, para notif a usuario específico
  tipo              text NOT NULL,           -- ej: 'poliza_pendiente', 'reasignacion_aprobada'
  titulo            text NOT NULL,
  mensaje           text NOT NULL,
  enlace_ruta       text,                    -- deep link a la parte relevante del sistema
  enlace_id_local   text,                    -- id del registro asociado (ej: reasignación)
  leida             boolean NOT NULL DEFAULT false,
  fecha_leida       timestamptz,
  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_rol   ON public.notificaciones_sistema(destinatario_rol) WHERE NOT anulado AND NOT leida;
CREATE INDEX IF NOT EXISTS idx_notif_tipo  ON public.notificaciones_sistema(tipo) WHERE NOT anulado;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
```

**Nota importante para Fede:** la tabla `reasignaciones` ya existe con schema viejo. Si tiene datos reales que queremos preservar, hacer backup ANTES de dropear:

```sql
CREATE TABLE public.reasignaciones_backup_v013 AS SELECT * FROM public.reasignaciones;
```

Después migrar los datos que aplique al nuevo schema (mapping manual, no automático — los campos cambian).

### 4.3 Mapeo en `src/shared/supabase.js`

La clave `reasignaciones` ya está mapeada. Agregar las nuevas:

```javascript
motivosReasignacion:      'motivos_reasignacion',
aprobadoresReasignacion:  'aprobadores_reasignacion',
notificacionesSistema:    'notificaciones_sistema',
```

### 4.4 Catálogos hardcoded

Se mantienen en código:

**Estados** (constante local, para validaciones):
```javascript
const ESTADOS_REASIGNACION = [
  'Borrador',
  'Pendiente',
  'Aprobada esperando fecha efectiva',
  'Aprobada ejecutada',
  'Rechazada',
  'Anulada'
];
```

**Solicitud originada por** (constante local):
```javascript
const ORIGENES_SOLICITUD = ['Asociado', 'Supervisor', 'Central de Operaciones', 'RRHH'];
```

---

## 5. Estructura del módulo

Crear el directorio `src/modules/reasignaciones/`:

```
src/modules/reasignaciones/
├── index.js              — Re-exports y bindings al window
├── reasignaciones.js     — Lógica principal (renders, ABM, filtros)
├── aprobacion.js         — Lógica de aprobar/rechazar/anular
├── sugeridor.js          — Cliente del sugeridor IA (llama Edge Function)
├── config.js             — ABM de motivos y aprobadores
└── notificaciones.js     — Helper para generar notificaciones a RRHH
```

El HTML se puede reutilizar (o refactorizar) del actual en `index.html` con id `screen-reasignaciones`.

---

## 6. Tab 1 — Pendientes

### 6.1 Qué muestra
Reasignaciones en estados:
- **Pendiente** (esperando aprobación).
- **Aprobada esperando fecha efectiva** (aprobada pero aún no ejecutada).

**No muestra:** Borradores, Aprobada ejecutada, Rechazada, Anulada (van a Historial).

### 6.2 Columnas del listado

| # | Columna | Notas |
|---|---|---|
| 1 | Asociado | Link al legajo |
| 2 | N° Socio | |
| 3 | Servicio origen | Con supervisor debajo |
| 4 | Servicio destino | Con supervisor debajo |
| 5 | Motivo | Chip de color |
| 6 | Fecha solicitud | |
| 7 | **Fecha efectiva** | Nueva |
| 8 | Solicitado por | Usuario logueado que la creó |
| 9 | **Originada por** | Nueva (Asociado / Supervisor / Central / RRHH) |
| 10 | **Días desde solicitud** | Nueva, con alerta visual (verde 0-2, amarillo 3-6, rojo 7+) |
| 11 | Impacto seguro | Badge "⚠️ Revisar" si altura o póliza = Sí |
| 12 | Estado | Badge (Pendiente / Aprobada esperando fecha) |
| 13 | Acciones | ✅ Aprobar / ❌ Rechazar / 👁 Ver / 🗑 Anular |

### 6.3 Acciones sobre cada fila

**✅ Aprobar** — solo visible si el usuario es Gerente/Subgerente de Operaciones o Gerente de RRHH (según `aprobadores_reasignacion`).

Al aprobar:
1. Si `fecha_efectiva > hoy` → estado = "Aprobada esperando fecha efectiva". Legajo NO se actualiza aún.
2. Si `fecha_efectiva <= hoy` → estado = "Aprobada ejecutada". Legajo se actualiza inmediatamente:
   - `leg.servicio = servicio_destino`
   - `leg.supervisor = supervisor_destino`
   - Si `funcion_destino` está seteado → `leg.funcion = funcion_destino`
   - Si `zona_destino` está seteado → `leg.zona = zona_destino`
   - Agregar entrada a `leg.historial_movimientos`.
3. `aprobado_por = currentUser.nombre`, `fecha_aprobacion = now()`.
4. Si `requiere_altura` o `requiere_poliza_esp` → crear notificación a RRHH.
5. Si `pedido_vinculado_id_local` → marcar el pedido como Cubierto.
6. `supaSync` de todo lo modificado.
7. Toast: "✅ Reasignación aprobada. [Legajo actualizado / Se ejecutará el DD/MM/YYYY]"

**❌ Rechazar** — mismo permiso que aprobar.

Al rechazar:
1. Abre modal simple con textarea "Motivo del rechazo *".
2. Validar que no esté vacío.
3. `estado = "Rechazada"`, `motivo_rechazo = ...`, `aprobado_por = currentUser.nombre` (mismo campo para saber quién resolvió), `fecha_rechazo = now()`.
4. `supaSync`.
5. Toast: "✅ Reasignación rechazada."

**👁 Ver detalle** — modal de solo lectura.

**🗑 Anular** — puede el solicitante original o cualquier aprobador.
1. Confirmación.
2. `estado = "Anulada"`, `anulado_por = currentUser.nombre`, `fecha_anulacion = now()`.
3. `supaSync`.
4. Toast: "✅ Reasignación anulada."

### 6.4 Filtros
- Buscador general (nombre o N° socio).
- Por motivo.
- Por supervisor origen o destino.
- Por servicio origen o destino.
- Por rango de días desde la solicitud (útil para ver "más de 5 días").

**Bug a corregir:** los filtros duplicados actuales (barra + tabla) se unifican. Un solo filtro por criterio, en la barra.

### 6.5 Botón "+ Nueva reasignación"
Abre el modal de Nueva reasignación (ver §9).

---

## 7. Tab 2 — Historial completo

### 7.1 Qué muestra
Todas las reasignaciones sin importar el estado. Sin filtro temporal por defecto.

### 7.2 Columnas del listado

Las mismas del Tab 1, más:
- **Aprobado/Rechazado por** (quién resolvió).
- **Fecha de aprobación/rechazo**.

**Motivo de rechazo** — solo se muestra en el detalle al hacer click en "Ver".

### 7.3 Acciones
Solo **👁 Ver detalle** (modal solo lectura). Sin aprobar/rechazar/anular (esas acciones solo aplican a Pendientes).

### 7.4 Filtros
- Buscador general.
- Por estado (con checkboxes múltiples: puede querer ver "todas las rechazadas" o "aprobadas + ejecutadas").
- Por motivo.
- Por rango de fechas (por defecto sin límite).
- Por asociado (N° socio).

### 7.5 Modal "Ver detalle"

Muestra todos los datos de la reasignación:
- Asociado + N° socio.
- Origen (servicio + supervisor + función + zona).
- Destino (servicio + supervisor + función + zona).
- Motivo, descripción.
- Fecha solicitud, fecha efectiva, fecha ejecución.
- Solicitado por, originada por, pedido vinculado (si tiene).
- Impacto en seguros (altura, póliza).
- Estado actual.
- Historial de aprobación (aprobado por, fecha, motivo de rechazo si aplica).

Es solo lectura. **Sin timeline complejo** (Lautaro decidió que no hace falta).

---

## 8. Tab 3 — Rotación por asociado

### 8.1 Qué muestra
Grilla de tarjetas, una por asociado activo. Muestra la cantidad de movimientos y datos clave para detectar sobre-rotación.

**Cómo se cuentan los movimientos:**
- Movimiento inicial: Alta del asociado (Servicio + Supervisor + Fecha de ingreso desde el legajo).
- Cada reasignación con estado "Aprobada ejecutada" del asociado suma uno.

### 8.2 Contenido de cada tarjeta

- Avatar / foto del asociado.
- Nombre y N° socio.
- Función actual.
- Servicio actual.
- **Tiempo en el servicio actual** (nuevo).
  - Cálculo: días/meses desde la fecha efectiva de la última reasignación aprobada. Si no tuvo reasignaciones, desde la fecha de ingreso del legajo. **Ver §18.1 para la decisión de detalle.**
- **Último motivo de reasignación** (nuevo) — si tuvo alguna.
- Cantidad total de movimientos (badge de color por nivel: 0-1 gris, 2 azul, 3+ rojo).
- **Alerta visual "⚠️ Sobre-rotación"** si tuvo 3+ movimientos en los últimos 6 meses.

### 8.3 Al hacer click en la tarjeta
Abre `modal-reas-detalle` con:
- Datos del asociado (avatar, nombre, N° socio, función).
- Timeline vertical de movimientos:
  - Alta (siempre primero).
  - Reasignaciones ejecutadas en orden cronológico.
- Tabla de detalle: servicio destino, supervisor, motivo, fecha, estado, descripción.

**Bug a corregir:** el HTML de este modal está malformado hoy (faltan etiquetas de apertura). Rehacerlo limpio.

### 8.4 Filtros
- Buscador (nombre o N° socio).
- Por cantidad de movimientos (todos / 2+ / 3+).
- Por servicio actual.
- Por sobre-rotación (solo los que tienen 3+ movimientos en 6 meses).

**Bug a corregir:** `filtrarRotacion()` hoy no filtra (solo re-renderiza). Implementar correctamente.

### 8.5 Botón "📥 Exportar a Excel"

Exporta el listado visible (respetando filtros) con:
- N° socio, nombre, función, servicio actual, tiempo en el servicio, cantidad de movimientos, último motivo, alerta si aplica.

Usar SheetJS (librería `xlsx` en npm).

---

## 9. Modal de Nueva reasignación

### 9.1 Estructura del modal

Modal grande dividido en secciones (accordions o secciones visuales claras):

1. **Asociado**
2. **Buscador de candidatos IA** (solo si D → A, ver §10)
3. **Servicio destino**
4. **Motivo y detalles**
5. **Impacto en seguros**

**Se remueven** las secciones "Aprobación requerida" (era informativa) y "Notificaciones automáticas" (los 4 checkboxes) de la versión inicial. Se agregan cuando WhatsApp esté funcionando.

### 9.2 Sección 1 — Asociado

| Campo (id) | Etiqueta | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| `reas-asociado` | Asociado * | Autocompletado sobre legajos activos | Sí | Al elegir, se autocompletan los siguientes |
| `reas-nro` | N° Socio | Readonly | — | |
| `reas-serv-orig` | Servicio actual (origen) | Readonly | — | |
| `reas-sup-orig` | Supervisor actual | Readonly | — | |
| `reas-funcion-orig` | Categoría/Función actual | Readonly | — | |
| `reas-zona-orig` | Zona actual | Readonly | — | |

### 9.3 Sección 2 — Buscador de candidatos IA

**Solo aparece si el modal se abrió desde el módulo Pedidos (D → A).**

Si el modal se abrió desde botón "+ Nueva reasignación" (A → D):
- Muestra botón "🤖 Sugerir destinos" que dispara el sugeridor A → D.
- Al recibir sugerencias, muestra hasta 4 opciones con score y justificación.
- Al hacer click en una sugerencia, autocompleta la Sección 3 (Servicio destino) con los datos de esa opción.

Si el modal se abrió desde botón "🤖 Buscar candidatos" en Pedidos (D → A):
- Se autocompletó el asociado desde la selección previa.
- No hay botón de sugeridor acá (ya se hizo el filtrado).

### 9.4 Sección 3 — Servicio destino

| Campo (id) | Etiqueta | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| `reas-serv-dest` | Servicio destino * | Autocompletado sobre `DB.servicios` | Sí | |
| `reas-sup-dest` | Supervisor destino * | Select de `aprobadores_reasignacion` | Sí | Poblar de la config |
| `reas-funcion-dest` | Categoría/Función (si cambia) | Select o texto | No | Vacío = no cambia |
| `reas-zona-dest` | Zona (si cambia) | Texto | No | Vacío = no cambia |

### 9.5 Sección 4 — Motivo y detalles

| Campo (id) | Etiqueta | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| `reas-motivo` | Motivo * | Select de `motivos_reasignacion` | Sí | Poblar de la config |
| `reas-fecha-efectiva` | Fecha efectiva * | Date | Sí | Con reglas de validación (§9.7) |
| `reas-originada-por` | Solicitud originada por * | Select (4 opciones fijas) | Sí | Asociado / Supervisor / Central / RRHH |
| `reas-pedido-vinculado` | Pedido de personal vinculado | Select de pedidos activos | No | Default: "Sin vinculación" |
| `reas-desc` | Descripción / Contexto * | Textarea | Sí | Ahora sí obligatorio |
| `reas-elevado-por` | Elevado por | Readonly (usuario logueado) | — | Auto-completado |

### 9.6 Sección 5 — Impacto en seguros

| Campo (id) | Etiqueta | Tipo | Default |
|---|---|---|---|
| `reas-altura` | ¿Nuevo servicio requiere trabajo en altura? | Select (No / Sí - requiere cobertura) | No |
| `reas-poliza` | ¿Cliente requiere póliza especial? | Select (No / Sí - actualizar póliza) | No |

Si cualquiera de los dos es Sí, se activa el aviso de que se generará notificación a RRHH al aprobar.

### 9.7 Validaciones al guardar

**Al elevar (botón "📤 Elevar para aprobación"):**
- Todos los campos con `*` deben estar completos.
- `reas-fecha-efectiva` no puede ser anterior a hoy.
- `reas-fecha-efectiva` mínimo `now() + 24 horas`.
- `reas-fecha-efectiva` máximo `now() + 3 meses`.
- `reas-serv-dest` debe ser distinto de `reas-serv-orig` (no tiene sentido reasignar al mismo servicio).
- El asociado debe estar en estado 'Activo' en el legajo.

Si falla alguna → mostrar mensaje claro sobre qué falta o qué está mal, y no permitir guardar.

**Al guardar borrador (botón "Guardar borrador"):**
- Solo valida que haya al menos el asociado seleccionado.

### 9.8 Botones del modal

- **Guardar borrador** → estado = "Borrador". Se guarda para que el mismo usuario pueda retomarla después.
- **📤 Elevar para aprobación** → estado = "Pendiente". Aparece en Tab 1 de todos los aprobadores.
- **Cancelar** → cierra sin guardar.

---

## 10. Sugeridor IA (Buscador de candidatos)

### 10.1 Concepto

Es la funcionalidad **más importante** del módulo. Reemplaza la decisión "a ojo" de Central de Operaciones por una recomendación basada en datos.

Dos direcciones de uso:

**Flujo A → D (dentro del modal de Nueva reasignación):**
Central sabe que a Juan hay que moverlo. No sabe adónde. Aprieta "Sugerir destinos". IA analiza pedidos pendientes y devuelve las 4 mejores opciones de destino para Juan.

**Flujo D → A (desde módulo Pedidos):**
Central ve la lista de pedidos pendientes. Elige uno. Aprieta "Buscar candidatos". IA analiza los asociados activos y devuelve los 4 mejores candidatos para cubrir ese pedido.

En ambos casos, la persona toma la decisión final. El sugeridor es asistente, no ejecutor.

### 10.2 Datos que el sugeridor considera

**Del asociado:**
- Nombre, N° socio, DNI, género, edad, categoría/función actual.
- Domicilio (calle, localidad, código postal).
- Antigüedad (fecha de ingreso).
- Servicio y supervisor actual.
- Capacitaciones aprobadas (lista de tipos con fecha).
- Póliza de altura vigente (booleano).
- Historial de reasignaciones de los últimos 6 meses (cantidad y motivos).

**Del pedido/servicio destino:**
- Cliente (nombre, dirección, localidad).
- Categoría requerida.
- Turno / horario.
- Requisitos especiales (si requiere altura, póliza, etc.).
- Cantidad de vacantes.

**Calculado:**
- Distancia lineal asociado ↔ servicio (haversine entre coordenadas). Ver §18.2 para la decisión de detalle de geocodificación.

### 10.3 Output esperado

Cada sugerencia devuelve:

```json
{
  "candidato_id_local": "123456789",
  "nombre": "Juan Pérez",
  "nro_socio": "142",
  "score": 87,
  "justificacion": "Vive a 3.2 km del servicio, tiene todas las capacitaciones requeridas y no ha rotado en 8 meses. Excelente candidato.",
  "alertas": [
    "Trabajó anteriormente en este cliente y fue reasignado por conflicto interpersonal (marzo 2025)."
  ]
}
```

Hasta 4 sugerencias. Ordenadas por score descendente.

### 10.4 Prompt a Claude API

**Base del prompt** (para el flujo D → A):

```
Sos un asistente experto en asignación de personal para una cooperativa de servicios de limpieza.

Tu tarea: recomendar los 4 mejores candidatos para cubrir un pedido de personal específico, según los datos que te doy.

DATOS DEL PEDIDO:
{JSON con datos del pedido y servicio destino}

DATOS DE LOS ASOCIADOS ACTIVOS:
{JSON con array de asociados con todos sus datos}

CRITERIOS A EVALUAR (ordenados por prioridad):
1. Cumple con la categoría requerida.
2. Vive cerca del servicio (menor distancia = mejor).
3. Tiene las capacitaciones requeridas (especialmente si requiere altura).
4. No ha rotado en exceso (menos de 3 reasignaciones en 6 meses).
5. No tuvo conflicto previo en este cliente (revisar historial).
6. Antigüedad en la cooperativa (mayor experiencia = plus).

Devolvé un JSON con los 4 mejores candidatos, cada uno con:
- candidato_id_local (el id_local del asociado)
- nombre
- nro_socio
- score (0-100)
- justificacion (2-3 líneas explicando por qué es buen candidato)
- alertas (array de strings con alertas relevantes, o array vacío)

Ordená por score descendente. Solo devolvé el JSON, sin texto adicional.
```

**Para el flujo A → D** el prompt es simétrico: se le pasa el asociado y los pedidos activos, se le pide destinos ranqueados con el mismo formato de output.

### 10.5 Manejo del output

- Fede debe parsear el JSON con try/catch. Si Claude devuelve algo mal formado (raro pero posible), mostrar toast: "El asistente devolvió una respuesta inesperada. Intentá de nuevo."
- Guardar la respuesta en memoria (no persistir en DB — es información efímera).
- Renderizar las 4 opciones en la UI de la sección "Sugerido".
- Al hacer click en una opción → autocompleta los campos correspondientes.

---

## 11. Edge Function del sugeridor

### 11.1 Nombre y ruta
`supabase/functions/sugerir-candidatos-reasignacion/index.ts`

### 11.2 Contrato de la función

**Input:**
```json
{
  "modo": "por_pedido" | "por_asociado",
  "pedido_id_local": "...",     // si modo = por_pedido
  "asociado_id_local": "..."    // si modo = por_asociado
}
```

**Output:**
```json
{
  "sugerencias": [
    {
      "id_local": "...",
      "nombre": "...",
      "nro_socio": "...",
      "score": 87,
      "justificacion": "...",
      "alertas": [...]
    }
  ]
}
```

### 11.3 Lógica interna

1. Recibe el request.
2. Valida el input.
3. Consulta a Supabase con la anon key (server-side es seguro):
   - Datos del pedido o asociado según modo.
   - Todos los asociados o pedidos activos según modo.
   - Capacitaciones aprobadas.
   - Reasignaciones de los últimos 6 meses.
4. Calcula distancias lineales (haversine) desde el asociado a los servicios.
5. Arma el prompt.
6. Llama a Anthropic API (usar `Deno.env.get('ANTHROPIC_API_KEY')`).
7. Parsea la respuesta.
8. Devuelve el JSON.

### 11.4 Manejo de errores
- Si Anthropic API falla → devolver 500 con mensaje claro.
- Si el JSON parseado no tiene la estructura esperada → devolver 500 con mensaje.
- Timeout de 30 segundos.

### 11.5 Reutiliza patrón del bot de WhatsApp
La Edge Function del bot de WhatsApp ya usa Anthropic API. Fede puede copiar el patrón de esa función (cómo maneja el secret, cómo hace el request, cómo parsea).

---

## 12. Configuración del módulo

### 12.1 Ubicación
Pantalla de Configuración → Reasignaciones (ya existe hoy en el legacy).

### 12.2 ABM de Motivos

**Vista:** lista con los motivos actuales (persistidos ahora en `motivos_reasignacion`).

**Acciones:**
- Agregar motivo (nombre + orden).
- Editar motivo (solo el nombre).
- Anular motivo (soft delete). Los motivos anulados no aparecen en el select del modal pero se conservan para reasignaciones históricas.

### 12.3 ABM de Aprobadores

**Vista:** lista con los aprobadores actuales.

**Acciones:**
- Agregar aprobador (cargo).
- Anular aprobador.

**Nota:** el sistema chequea el "cargo" del usuario logueado contra esta lista para decidir si puede aprobar. Fede debe verificar cómo está implementado el sistema de permisos actual y adaptarlo.

### 12.4 Persistencia
**A diferencia del legacy actual, TODOS los cambios de config deben persistir en Supabase.** Cada operación llama a `supaSync`.

---

## 13. Integraciones con otros módulos

### 13.1 Módulo Legajos (ya migrado)
- El módulo Legajos ya consume `DB.reasignaciones` filtrando por `estado === 'Aprobado'`. Ajustar al nuevo modelo: filtrar por `estado === 'Aprobada ejecutada'`.
- Legajos muestra las reasignaciones en el timeline del legajo.
- Al ejecutar una reasignación (§6.3), actualizar el legajo:
  - `leg.servicio`, `leg.supervisor`, `leg.funcion` (si aplica), `leg.zona` (si aplica).
  - Agregar entrada a `leg.historial_movimientos`.

### 13.2 Módulo Pedidos de personal (parcialmente existente)
- Nuevo botón "🤖 Buscar candidatos" en la lista de pedidos pendientes (Fede debe integrarlo con el módulo Pedidos existente).
- Al confirmar una reasignación con `pedido_vinculado_id_local`, el pedido cambia a estado "Cubierto" al ejecutar (no al aprobar).

### 13.3 Módulo Capacitaciones (por implementar por Fede en paralelo)
- El sugeridor IA consume la lista de capacitaciones aprobadas del asociado.
- Fede debe consultar la tabla `capacitaciones` filtrando por `legajo_id_local` + `estado === 'Dictada'` + `resultado === 'Aprobada'`.

### 13.4 Sistema de notificaciones (nuevo, ver §4.2 tabla 4)
Al aprobar con impacto en póliza → generar notificación en `notificaciones_sistema` con:
- `destinatario_rol = 'RRHH'`
- `tipo = 'poliza_pendiente'`
- Título y mensaje descriptivos.
- Enlace al detalle de la reasignación.

### 13.5 WhatsApp (a futuro)
Cuando Meta esté destrabada:
- Al elevar solicitud → notificar por WhatsApp a los aprobadores.
- Al aprobar → notificar por WhatsApp al asociado y ambos supervisores.
- Al rechazar → notificar por WhatsApp al solicitante.

---

## 14. Etapas de implementación

Este módulo tiene mucho por hacer. Priorizar así:

### Etapa 1 — Base persistente (crítica)
- Aplicar SQL `v014_reasignaciones.sql` en Supabase.
- Backup de datos existentes si es necesario.
- Actualizar mapeo en `src/shared/supabase.js`.
- Crear estructura del módulo `src/modules/reasignaciones/`.
- Implementar Tab 1 (Pendientes) con el nuevo modelo de estados y persistencia real.
- Implementar Tab 2 (Historial) con filtros.
- Implementar modal de Nueva reasignación con validaciones reales.
- Implementar aprobar, rechazar, anular con persistencia.
- Implementar auto-ejecución al llegar la fecha efectiva (cron o check al abrir el módulo).
- Corregir todos los bugs conocidos (§15).

**Al terminar Etapa 1:** Central puede crear, elevar, aprobar, rechazar reasignaciones que persisten correctamente. Legajos se actualiza al ejecutar.

### Etapa 2 — Rotación y exportar
- Implementar Tab 3 (Rotación) con las nuevas columnas.
- Botón Exportar a Excel con SheetJS.
- Modal de detalle de rotación con timeline (arreglar HTML).

**Al terminar Etapa 2:** el módulo está funcionalmente completo sin el sugeridor IA.

### Etapa 3 — Sugeridor IA
- Implementar Edge Function `sugerir-candidatos-reasignacion`.
- Configurar `ANTHROPIC_API_KEY` como secret de Supabase.
- Integrar botón "Sugerir destinos" en el modal de Nueva reasignación.
- Integrar botón "Buscar candidatos" en módulo Pedidos.
- Renderizar sugerencias con score, justificación y alertas.

**Al terminar Etapa 3:** el módulo está completo con IA operativa.

### Etapa 4 — WhatsApp (espera destrabar Meta)
- Notificaciones automáticas por WhatsApp a los involucrados.

### Etapa 5 — Notificaciones internas del sistema
- Sistema de campana con `notificaciones_sistema`.
- Alerta a RRHH por pólizas pendientes.

**Puede hacerse en paralelo con Etapas 2 o 3.**

---

## 15. Bugs conocidos a corregir

Lista clara para Fede — todos estos bugs existen en el módulo actual y deben quedar resueltos en la migración:

1. **Aprobar/rechazar no persiste** — corregir con supaSync después de cada operación.
2. **ABM de motivos y aprobadores no persiste** — mover a tablas Supabase.
3. **Acceso por índice de array en acciones** — cambiar a acceso por ID (patrón conocido).
4. **Filtros duplicados que leen distinto** — unificar en un solo filtro por criterio.
5. **`filtrarRotacion()` no filtra** — implementar correctamente.
6. **HTML malformado en modal de rotación** — rehacer limpio.
7. **Stat "Aprobadas este mes" filtra por año** — corregir para filtrar por mes.
8. **Sugeridor IA fake** — reemplazar por Edge Function real.
9. **Notificaciones (checkboxes) sin efecto** — remover por ahora, reincorporar con WhatsApp.
10. **Actualización del legajo al aprobar no persiste** — hacer `supaSync` en el legajo al ejecutar.

---

## 16. Casos borde y validaciones

Lista de casos borde para tener en cuenta durante la implementación:

### 16.1 Elevación de una reasignación
- El asociado debe estar `Activo`. Si está en Baja → error "El asociado no está activo, no se puede reasignar."
- El servicio destino debe existir en `DB.servicios`. Si no existe → validación falla.
- El pedido vinculado (si aplica) debe estar en estado activo. Si está Cubierto o Cancelado → validación falla con mensaje claro.

### 16.2 Aprobación

- Solo un aprobador puede ejecutar la acción. Verificar en runtime que `currentUser` tenga cargo en `aprobadores_reasignacion`.
- Si por alguna razón dos aprobadores intentan aprobar la misma reasignación simultáneamente (raro pero posible) → el segundo debe recibir mensaje "Esta reasignación ya fue resuelta por [aprobador]." No debe duplicarse la actualización del legajo.
- **Guard de idempotencia:** al aprobar, verificar que el estado actual sea 'Pendiente'. Si ya está en otro estado → error.

### 16.3 Ejecución con fecha adelantada
- Si la fecha efectiva pasa por reloj (ejemplo: aprobamos hoy con fecha efectiva mañana; mañana el módulo se abre por primera vez) → un check al cargar el módulo debe pasar automáticamente todas las "Aprobada esperando fecha efectiva" con `fecha_efectiva <= hoy` a "Aprobada ejecutada" y actualizar los legajos.

### 16.4 Rechazo de una reasignación con pedido vinculado
- El pedido vinculado NO se marca como Cubierto (solo se marca al ejecutar, no al aprobar).
- Al rechazar, el pedido queda disponible para otra reasignación.

### 16.5 Anulación
- Solo el solicitante o un aprobador pueden anular.
- Solo se pueden anular reasignaciones en estado 'Borrador' o 'Pendiente'. Las 'Aprobada esperando fecha efectiva' pueden anularse con un flujo especial (revertir la aprobación explícitamente).
- Si se anula una reasignación con pedido vinculado → el pedido no se toca (queda como estaba).

### 16.6 Reasignación al mismo servicio
- Validación temprana en el modal: si `servicio_destino === servicio_origen` → error.

### 16.7 Sugeridor IA sin resultados
- Si el sugeridor no encuentra candidatos apropiados (por ejemplo, pedido en zona geográfica sin asociados cercanos) → mostrar mensaje: "No se encontraron candidatos adecuados. Podés cargar la reasignación manualmente."

### 16.8 Sugeridor IA con timeout
- Si Anthropic API tarda más de 30 segundos → mostrar mensaje "El asistente está tardando más de lo esperado. Intentá de nuevo en unos minutos."

### 16.9 Legajo con datos incompletos
- Si el asociado no tiene dirección cargada → el sugeridor no puede calcular distancia. Debería devolver alerta en la sugerencia ("Sin dirección cargada, distancia no calculada.").

### 16.10 Notificación de póliza ya generada
- Si se aprueba y ya existía una notificación de póliza pendiente para la misma reasignación (edge case improbable) → no duplicar.

---

## 17. Convenciones del proyecto que debe respetar

### 17.1 Del código
- **Nombres en español:** funciones, variables, tablas.
- **camelCase en frontend, snake_case en Supabase.**
- **Un commit por cambio lógico**, mensaje en español descriptivo.

### 17.2 De la base de datos
- **Nunca modificar SQL versionado viejo.** Si hay que ajustar, crear un `vNNN` nuevo.
- **Soft delete siempre** con `anulado boolean DEFAULT false`.
- **Guard de idempotencia** en operaciones críticas (aprobar, ejecutar).

### 17.3 De la UI
- Toasts para feedback.
- Loading indicators si tarda >1 segundo.
- Confirmaciones para acciones destructivas.

### 17.4 De testing
- Probar manualmente:
  - Crear reasignación → guardar borrador → retomar → elevar → aprobar → verificar legajo actualizado.
  - Rechazar → verificar motivo en Historial.
  - Aprobar con fecha futura → verificar que legajo NO se actualiza aún. Simular paso del tiempo (cambiar fecha del sistema) → verificar que se ejecuta automáticamente.
  - Anular en diferentes estados.
  - Aprobar con impacto en póliza → verificar notificación a RRHH.
  - Usar el sugeridor IA con un pedido real.
  - Editar motivos y aprobadores → recargar → verificar que persisten.

---

## 18. Decisiones técnicas delegadas a Fede

Estos puntos quedaron abiertos deliberadamente para que Fede los decida con criterio técnico. Contexto para cada uno:

### 18.1 Cálculo de "tiempo en el servicio actual"

**Contexto:** en el Tab 3 (Rotación), cada tarjeta muestra "tiempo en el servicio actual" del asociado.

**Opciones:**
- **A) Desde la última reasignación aprobada** (fecha efectiva). Si no tuvo reasignaciones, desde la fecha de ingreso del legajo.
- **B) Desde la fecha de ingreso del legajo siempre** (ignora reasignaciones).

**Trade-off:**
- Opción A refleja mejor "cuánto lleva en ESTE servicio actual" (más útil para detectar rotación reciente).
- Opción B es más simple (un solo campo del legajo).

**Recomendación:** Opción A. Es más útil y no es tan complejo.

### 18.2 Geocodificación de direcciones para el sugeridor IA

**Contexto:** el sugeridor IA calcula distancia lineal entre el domicilio del asociado y el servicio destino. Para eso necesita coordenadas (lat/long). Los legajos actuales NO tienen coordenadas cargadas (solo dirección en texto).

**Opciones:**
- **A) Geocodificar al vuelo en la Edge Function** con Google Maps Geocoding API (cuesta plata, requiere API key).
- **B) Geocodificar al vuelo con Nominatim (OpenStreetMap)** (gratis, más lento, con rate limit).
- **C) Agregar campo `lat`, `long` al legajo y geocodificar una vez** al cargar/editar el legajo. El sugeridor usa lo pre-calculado.
- **D) Saltear cálculo de distancia por ahora** — el sugeridor devuelve resultados sin ranking por distancia, y agregarlo después.

**Trade-off:**
- A es la mejor calidad pero cuesta.
- B es gratis pero más frágil (Nominatim tiene límites de rate).
- C es la mejor arquitectura a largo plazo pero requiere más trabajo (modificar módulo Legajos).
- D es lo más rápido para arrancar.

**Recomendación:** empezar con D para la Etapa 3, y agregar C en Etapa 4 o 5 cuando sea claro el volumen de uso.

### 18.3 Cron de auto-ejecución de reasignaciones aprobadas

**Contexto:** las reasignaciones con estado "Aprobada esperando fecha efectiva" deben pasar automáticamente a "Aprobada ejecutada" cuando llega la fecha.

**Opciones:**
- **A) Check al cargar el módulo** — cada vez que un usuario abre Reasignaciones, se corren los checks.
- **B) Cron real** (Supabase pg_cron o Edge Function agendada) — corre 1 vez por día, sin depender de que alguien entre al módulo.

**Trade-off:**
- A es más simple pero depende de tráfico.
- B es más robusto pero requiere configurar cron.

**Recomendación:** empezar con A. Migrar a B cuando el volumen lo justifique.

---

## 19. Preguntas frecuentes anticipadas

**¿El sugeridor IA reemplaza la decisión humana?**
No. Devuelve opciones ranqueadas con justificación. La decisión final es siempre humana (Central de Operaciones).

**¿Qué pasa si Anthropic API está caído?**
El sugeridor no funciona en ese momento. El usuario puede cargar la reasignación manualmente como siempre. La UI debe mostrar mensaje claro: "Asistente no disponible. Cargá manualmente."

**¿Puedo tocar `src/legacy.js`?**
No. Dejar la versión vieja intacta como referencia. Cuando el módulo migrado esté funcionando, se remueve la referencia del menú.

**¿Puedo tocar el módulo Legajos?**
Solo lo mínimo necesario para la integración. La actualización del legajo al ejecutar la reasignación es integración necesaria — ver §6.3 y §13.1 para el detalle exacto.

**¿Y el módulo Pedidos?**
Similar: agregar solo el botón "Buscar candidatos" que dispara el sugeridor. Fede debe verificar cómo está estructurado el módulo Pedidos hoy antes de integrarlo.

**¿Cómo pruebo el sugeridor IA sin gastar créditos?**
Podés cargar la API key en un entorno de desarrollo con un límite pequeño de créditos. Cada llamada consume ~0.02 USD (estimado). Con 10-20 pruebas alcanza para validar el flujo.

**¿Dónde está la documentación de Anthropic API?**
`https://docs.anthropic.com/en/api/messages`

---

## 20. Cierre

Este documento es la base para implementar el módulo Reasignaciones. Fue construido a partir de:

1. Inventario técnico del módulo actual en `legacy.js` (ver `docs/INVENTARIO_reasignaciones_legacy.md`).
2. Sesión de diseño con Lautaro sobre el proceso real, las decisiones organizacionales y el rol de la IA.
3. Alineación con las políticas del proyecto (`POLITICAS_PROYECTO.md`) y las convenciones aprendidas (`CLAUDE.md`).

Con este documento, Fede tiene todo lo necesario para implementar sin bloqueos. Ante cualquier duda de diseño no cubierta: **preguntar antes de codear**, siguiendo la política A.4 (diagnóstico antes de cambios).

**¡Buenas reasignaciones!** 🔄
