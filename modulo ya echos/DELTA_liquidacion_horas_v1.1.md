# Delta de cambios — Módulo Liquidación de horas v1.1

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Liquidación de horas
**Autor:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-10
**Versión:** 1.1 (delta sobre lo existente)

---

## ⚠️ Cómo usar este documento

Este documento es un **delta de cambios** sobre el módulo Liquidación de horas que **ya existe**. Es el **único módulo del sistema que Lautaro implementó directamente**, sin intermediación de Fede.

**IMPORTANTE — Distinción con otros módulos:**
- **Liquidación de horas** (este) — carga de horas trabajadas por operario/servicio. Es solo la carga, no calcula pagos.
- **Liq Admin** (`liq_admin`) — módulo separado, no cubierto por este delta.
- **Liquidaciones** (final, `liquidaciones`) — módulo separado que consume estas horas + descuentos y calcula el neto a pagar. NO cubierto por este delta.

Este delta se enfoca solo en **la carga de horas y sus aprobaciones**.

**Base del delta:**
- Módulo actual en `src/legacy.js`, bloque de `renderLiquidacion` (4606) y funciones asociadas.
- Ver `docs/INVENTARIO_liquidacion_horas_legacy.md` para el detalle del estado actual.

**Contexto crítico:**
- **NO persiste en Supabase** aunque `grillasLiq` está mapeado en `_SM`. Nunca se llama `supaSync`.
- El resto de la lógica está bastante armada — el delta es más "consolidación y cableado" que "features nuevas".
- Los hooks con Enfermos, Objetivos y Categorías son solo **texto en la UI**, no código real.

**Antes de aplicar los cambios:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, y el inventario técnico.

---

## 1. Contexto del delta

### 1.1 Qué es Liquidación de horas

Módulo donde los supervisores cargan las horas trabajadas por sus operarios en el mes. Es la **fuente primaria** de datos de horas que después consumen:
- **Liquidaciones (final)** — para calcular pago al operario.
- **Enfermos y Accidentes** — para detectar 3 días consecutivos de art 42.
- **Objetivos/Servicios** — para reportar consumo vs presupuestado.

### 1.2 Actores

- **Supervisor:** carga horas de operarios de sus servicios asignados.
- **Gerente Operaciones (Ricardo Elicabe):** aprueba horas que requieren autorización especial (superación de EFT, Retén, Franquero, Trabajos especiales).
- **RRHH, Finanzas, Admin:** acceso de lectura para consulta.

### 1.3 Estado actual del sistema

Del inventario técnico:

**Cosas que YA funcionan bien:**
- Filtrado automático por supervisor (`renderGrillasLiq`).
- Cálculo de EFT contratado vs consumido.
- Alertas por superación de EFT.
- Sistema `registrarPendienteAuth` para aprobación por Ops.
- `solicitarCatAlt` / `resolverCatAlt` para categoría temporal en Retén.
- `validarFechasArt42` con límite de 3 días.
- Modal Art 42 separado para casos ≥4 días.
- Catálogos `motivosNoFact`, `motivosFueraEFT`, `CATS_POR_TIPO`.
- Filtrado por supervisor de sus servicios asignados.

**Problemas identificados:**

1. **🔴 NO PERSISTE.** `grillasLiq` está en `_SM` pero **nunca se llama `supaSync`**. Todo se pierde al recargar.

2. **🔴 Drift de schema en `DB.grillasLiq`.**
   - Seed viejo (línea 6221): `items[] / servicio / horasNorm / horasExtra / horasNocturnas`.
   - Runtime nuevo: `asociados[] / objCodigo / horas{fechaISO} / tipoHora`.
   - Los datos del seed no se muestran correctamente en el render.

3. **🔴 Escalada Art 42 → Enfermos es solo copy.**
   - El límite de 3 días existe en el código.
   - El texto "van a Enfermos y Accidentados" aparece.
   - **PERO no hay código que dispare nada** en el módulo Enfermos.

4. **🟡 Hooks con Objetivos son parciales.**
   - El filtrado por supervisor lee `objetivo.supervisor` como string.
   - Con el delta de Objetivos cerrado, hay campo `supervisor_asignado` en la tabla nueva — hay que cablearlo.

5. **🟡 Hook con Categorías inexistente.**
   - El sistema no lee valores hora de Categorías todavía.
   - Solo calcula horas, no montos.

6. **⚠️ `catAltPendientes` está mapeado en `_SM` pero tampoco se persiste.**

### 1.4 Cambio de proceso que Lautaro quiere formalizar

**Modelo de impacto de las horas (según decisiones tomadas):**

| Escenario | Impacto | Aprobación |
|---|---|---|
| Hora normal dentro del EFT | Inmediato | Ninguna |
| Hora normal/extra que supera el EFT | Pendiente | Gerente Operaciones |
| Hora Retén | Pendiente | Gerente Operaciones |
| Hora Franquero | Pendiente | Gerente Operaciones |
| Hora Trabajos especiales | Pendiente | Gerente Operaciones |
| Art 42 día 1-3 | Inmediato | Ninguna |
| Art 42 día 4+ | Bloqueo — escalada a Enfermos | Automática |

**"Pendiente" significa:** la hora se registra pero **no impacta** en el consumo del EFT ni en la liquidación final hasta que el Gerente de Ops apruebe.

### 1.5 Estrategia del delta

- **Consolidar:** persistir todo, eliminar drift de schema, unificar código.
- **Cablear hooks:** cablear escalada real a Enfermos, integrar con delta de Objetivos, integrar con Categorías.
- **Formalizar aprobaciones:** flujo estructurado de pendientes con Gerente Operaciones como único aprobador de retenes/franqueros/trabajos especiales/exceso EFT.
- **Preservar:** toda la lógica funcional que ya tenés (filtrados, cálculos EFT, categoría temporal, sistema pendientesAuth).

---

## 2. Cambios de v1.1

### 🔴 Cambios estructurales (críticos)

#### Cambio 1 — Persistir grillasLiq, art42, alertasLiquidacion, catAltPendientes, pendientesAuth

**Qué hay hoy:**
- `grillasLiq` y `catAltPendientes` mapeados en `_SM` pero sin `supaSync`.
- `DB.art42`, `DB.alertasLiquidacion`, `DB.pendientesAuth` sin mapeo ni persistencia.

**Qué cambia:**

Mapear en `src/shared/supabase.js`:

```javascript
// Existente (ya mapeado, pero sin uso)
grillasLiq:                'grillas_liq',
catAltPendientes:          'cat_alt_pendientes',

// Nuevo
art42:                     'registros_art42',
alertasLiquidacion:        'alertas_liquidacion',
pendientesAuth:            'pendientes_auth_operaciones',
```

**Crear tablas nuevas:**

```sql
-- v032_liquidacion_horas.sql
BEGIN;

-- Grillas de liquidación (una por objetivo/mes)
CREATE TABLE public.grillas_liq (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Referencias
  objetivo_id_local      text NOT NULL,       -- ref a objetivos
  objetivo_codigo        text NOT NULL,       -- desnormalizado
  cliente_id_local       text,                -- desnormalizado
  cliente_nombre         text,                -- desnormalizado
  
  -- Período
  mes                    text NOT NULL,       -- YYYY-MM
  anio                   integer NOT NULL,
  
  -- Metadatos
  supervisor_asignado    text,                -- lee de objetivos.supervisor_asignado
  
  -- EFT del contrato
  efts_contratados       numeric(6,2),
  horas_eft_totales      numeric(10,2),       -- efts * 200
  
  -- Estado
  estado                 text NOT NULL DEFAULT 'En carga',
    -- En carga / Cerrada / Enviada a liquidación
  
  fecha_cierre           timestamptz,
  cerrada_por            text,
  
  cargada_por            text NOT NULL,
  fecha_carga            timestamptz NOT NULL DEFAULT now(),
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gl_objetivo ON public.grillas_liq(objetivo_id_local) WHERE NOT anulado;
CREATE INDEX idx_gl_mes      ON public.grillas_liq(mes) WHERE NOT anulado;
CREATE INDEX idx_gl_estado   ON public.grillas_liq(estado) WHERE NOT anulado;
CREATE UNIQUE INDEX idx_gl_obj_mes ON public.grillas_liq(objetivo_id_local, mes) WHERE NOT anulado;

-- Asociados en cada grilla
CREATE TABLE public.grilla_asociados (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  grilla_id_local        text NOT NULL,
  
  legajo_id_local        text NOT NULL,
  nombre_asociado        text NOT NULL,
  nro_socio              text,
  categoria_id_local     text,                -- categoría base al momento
  categoria_nombre       text,                -- desnormalizado
  
  fecha_agregado         timestamptz NOT NULL DEFAULT now(),
  agregado_por           text NOT NULL,
  motivo                 text,                -- por qué se agregó (si es incorporación durante el mes)
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ga_grilla ON public.grilla_asociados(grilla_id_local) WHERE NOT anulado;
CREATE INDEX idx_ga_legajo ON public.grilla_asociados(legajo_id_local) WHERE NOT anulado;

-- Horas cargadas por asociado/día
CREATE TABLE public.horas_grilla (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  grilla_id_local        text NOT NULL,
  grilla_asociado_id_local text NOT NULL,
  
  fecha                  date NOT NULL,       -- día específico
  tipo_hora              text NOT NULL,       -- Normal / Extra / Retén / Franquero / Trabajos especiales / Art 42
  cantidad_horas         numeric(4,2) NOT NULL,
  
  -- Categoría efectiva (para casos como Retén donde puede diferir de la base)
  categoria_efectiva_id_local text,           -- si es Retén, la sub-categoría (Retén Larga Distancia, etc.)
  
  -- Estado de aprobación
  estado_aprobacion      text NOT NULL DEFAULT 'Impacta',
    -- Impacta / Pendiente aprobación Ops / Aprobada / Rechazada
  
  aprobada_por           text,                -- Gerente Ops si aplica
  fecha_aprobacion       timestamptz,
  motivo_rechazo         text,
  
  -- Origen (carga automática vs manual)
  origen_carga           text NOT NULL DEFAULT 'manual',  -- manual / automatica
  
  cargada_por            text NOT NULL,
  fecha_carga            timestamptz NOT NULL DEFAULT now(),
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hg_grilla   ON public.horas_grilla(grilla_id_local) WHERE NOT anulado;
CREATE INDEX idx_hg_asociado ON public.horas_grilla(grilla_asociado_id_local) WHERE NOT anulado;
CREATE INDEX idx_hg_fecha    ON public.horas_grilla(fecha) WHERE NOT anulado;
CREATE INDEX idx_hg_tipo     ON public.horas_grilla(tipo_hora) WHERE NOT anulado;
CREATE INDEX idx_hg_aprob    ON public.horas_grilla(estado_aprobacion) WHERE NOT anulado;

-- Pendientes de aprobación por Operaciones (bandeja del Gerente Ops)
CREATE TABLE public.pendientes_auth_operaciones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  hora_grilla_id_local   text NOT NULL,       -- ref a horas_grilla
  grilla_id_local        text NOT NULL,       -- desnormalizado
  legajo_id_local        text NOT NULL,       -- desnormalizado
  nombre_asociado        text NOT NULL,       -- desnormalizado
  objetivo_codigo        text NOT NULL,       -- desnormalizado
  
  tipo_pendiente         text NOT NULL,       -- Superación EFT / Retén / Franquero / Trabajos especiales
  motivo_solicitud       text,                -- lo que puso el supervisor
  cantidad_horas         numeric(4,2) NOT NULL,
  fecha_hora             date NOT NULL,       -- día al que aplica
  
  solicitado_por         text NOT NULL,       -- Supervisor
  fecha_solicitud        timestamptz NOT NULL DEFAULT now(),
  
  estado                 text NOT NULL DEFAULT 'Pendiente',
    -- Pendiente / Aprobada / Rechazada / Anulada
  
  resuelto_por           text,                -- Gerente Ops
  fecha_resolucion       timestamptz,
  motivo_resolucion      text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pao_estado    ON public.pendientes_auth_operaciones(estado) WHERE NOT anulado;
CREATE INDEX idx_pao_tipo      ON public.pendientes_auth_operaciones(tipo_pendiente) WHERE NOT anulado;
CREATE INDEX idx_pao_solicitud ON public.pendientes_auth_operaciones(fecha_solicitud) WHERE NOT anulado;

-- Solicitudes de categoría alternativa (para Retén — ya existe la función, ahora se persiste)
CREATE TABLE public.cat_alt_pendientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  legajo_id_local        text NOT NULL,
  nombre_asociado        text NOT NULL,       -- desnormalizado
  categoria_base_id_local text,               -- categoría base del operario
  categoria_alternativa_id_local text,        -- Retén Hora Base / Retén Larga Distancia / etc.
  categoria_alternativa_nombre text,          -- desnormalizado
  
  objetivo_codigo        text NOT NULL,
  fecha                  date NOT NULL,
  cantidad_horas         numeric(4,2),
  
  solicitado_por         text NOT NULL,       -- Supervisor
  fecha_solicitud        timestamptz NOT NULL DEFAULT now(),
  motivo                 text,
  
  estado                 text NOT NULL DEFAULT 'Pendiente',
  
  resuelto_por           text,                -- Gerente Ops
  fecha_resolucion       timestamptz,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Registros Art 42 (para tracking del ciclo y la escalada)
CREATE TABLE public.registros_art42 (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  legajo_id_local        text NOT NULL,
  nombre_asociado        text NOT NULL,
  objetivo_codigo        text NOT NULL,
  
  fecha_inicio           date NOT NULL,
  dias_consecutivos      integer NOT NULL DEFAULT 1,
  ultima_fecha_cargada   date NOT NULL,
  
  -- Escalada a Enfermos
  escalado_a_enfermos    boolean NOT NULL DEFAULT false,
  caso_enfermos_id_local text,                -- si se abrió caso en el módulo Enfermos
  fecha_escalada         timestamptz,
  
  cargado_por            text NOT NULL,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ra_legajo   ON public.registros_art42(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_ra_escalado ON public.registros_art42(escalado_a_enfermos) WHERE NOT anulado;

-- Alertas de liquidación
CREATE TABLE public.alertas_liquidacion (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  grilla_id_local        text NOT NULL,
  tipo_alerta            text NOT NULL,       -- Superación EFT / Art 42 3 días / Categoría alt pendiente / etc.
  descripcion            text NOT NULL,
  severidad              text NOT NULL DEFAULT 'Media',   -- Baja / Media / Alta
  
  resuelto               boolean NOT NULL DEFAULT false,
  fecha_resolucion       timestamptz,
  
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_al_grilla   ON public.alertas_liquidacion(grilla_id_local);
CREATE INDEX idx_al_resuelto ON public.alertas_liquidacion(resuelto);

COMMIT;
```

**Cablear `supaSync`:**

Todas las funciones que modifican grilla, horas, pendientes deben llamar a `supaSync`:
- `setHoraGrilla()` → `supaSync('horasGrilla', ...)`.
- `setTipoHoraAsoc()` → idem.
- `registrarPendienteAuth()` → `supaSync('pendientesAuth', ...)`.
- `solicitarCatAlt()` → `supaSync('catAltPendientes', ...)`.
- `crearGrillaDesdeObj()` → `supaSync('grillasLiq', ...)`.

#### Cambio 2 — Eliminar drift de schema en `DB.grillasLiq`

**Qué hay hoy:**
- Seed en línea 6221 con esquema viejo (`items[] / horasNorm / horasExtra / horasNocturnas`).
- Runtime usa nuevo esquema (`asociados[] / horas{fechaISO} / tipoHora`).

**Qué cambia:**
- **Eliminar el seed viejo** de línea 6221.
- Los datos históricos NO se pierden (respetamos histórico); solo se elimina el seed hardcoded.
- Si hay datos reales previamente cargados con el esquema viejo, Fede documenta como TODO la migración (probablemente eran datos de prueba).

#### Cambio 3 — Escalada automática de Art 42 a Enfermos

**Qué hay hoy:**
- `validarFechasArt42` bloquea al día 4 con toast: "Debe reportarse al módulo de Enfermos y Accidentados".
- **NO hay código que dispare nada en Enfermos.**

**Qué cambia:**

Al detectar el 3er día consecutivo de art 42 al cargar:

```javascript
async function detectarEscaladaArt42(legajoId, fechaCarga) {
  // Buscar registro existente de art42 activo
  const registro = DB.art42.find(r => 
    r.legajo_id_local === legajoId && 
    !r.escalado_a_enfermos && 
    !r.anulado
  );
  
  if (registro && registro.dias_consecutivos >= 3) {
    // Notificar automáticamente al módulo Enfermos
    if (window.enfermosAccidentesAPI && window.enfermosAccidentesAPI.notificarEscaladaArt42) {
      await window.enfermosAccidentesAPI.notificarEscaladaArt42(
        legajoId,
        registro.fecha_inicio
      );
      
      registro.escalado_a_enfermos = true;
      registro.fecha_escalada = new Date();
      supaSync('art42', registro);
      
      toast('⚠️ Escalada a Enfermos: 3 días consecutivos de Art 42.');
    }
  }
}
```

**Estado de bloqueo al día 4:**
- Sigue el toast existente ("Debe reportarse al módulo").
- **Además:** ofrece botón "Ir al módulo Enfermos" que abre el módulo con el asociado precargado.

#### Cambio 4 — Cablear con delta de Objetivos (supervisor asignado)

**Qué hay hoy:**
- El filtrado por supervisor lee `objetivo.supervisor` (string en el modelo viejo).

**Qué cambia:**
- Con el delta de Objetivos cerrado, la fuente es `objetivos.supervisor_asignado` (nuevo campo).
- El sistema lee este campo en vez del anterior.
- Los objetivos con estado `Operativo` aparecen en la vista del supervisor.
- Los objetivos con estado `Pendiente asignación operativa` NO aparecen (todavía sin supervisor asignado).

**Función de consulta actualizada:**

```javascript
function obtenerObjetivosDelSupervisor(supervisorNombre) {
  return DB.objetivos.filter(o => 
    o.supervisor_asignado === supervisorNombre &&
    o.estado === 'Operativo' &&
    !o.anulado
  );
}
```

Cuando Gerente Ops cambia el supervisor de un objetivo (delta de Objetivos), el cambio se refleja automáticamente en Liquidación de horas.

#### Cambio 5 — Hook con Categorías

**Qué hay hoy:**
- El sistema NO lee valores hora de Categorías.
- Solo carga horas (cantidad + tipo), no montos.

**Qué cambia:**
- **En la carga:** al asignar horas, el sistema NO calcula monto (eso es tarea del módulo Liquidaciones final).
- **PERO:** el sistema debe **validar que existe valor hora vigente** para la categoría + servicio del operario. Si no existe, alerta al supervisor: "El sistema no tiene valor hora cargado para [categoría X] en [servicio Y]. Consultá con RRHH antes de cerrar el mes."

**Función:**

```javascript
function validarValorHoraOperario(legajoIdLocal, objetivoCodigo) {
  const legajo = DB.legajos.find(l => l.id_local === legajoIdLocal);
  if (!legajo || !legajo.categoria_id_local) {
    return { valido: false, motivo: 'Operario sin categoría asignada.' };
  }
  
  if (window.categoriasAPI && window.categoriasAPI.obtenerValorHoraVigente) {
    const valor = window.categoriasAPI.obtenerValorHoraVigente(
      legajo.categoria_id_local,
      objetivoCodigo,
      new Date()
    );
    
    if (!valor) {
      return { 
        valido: false, 
        motivo: `Sin valor hora vigente para ${legajo.categoria_nombre} en ${objetivoCodigo}. Cargalo en Categorías.` 
      };
    }
  }
  
  return { valido: true };
}
```

Se llama al agregar un operario a la grilla y al cerrar el mes.

### 🟡 Cambios de agregado

#### Cambio 6 — Bandeja del Gerente Operaciones

**Qué hay hoy:**
- `pendientesAuth` existe pero sin UI dedicada.

**Qué cambia:**

Nueva pantalla o tab: **"Pendientes de aprobación de Operaciones"**.

**Visible para:** Gerente Operaciones + Admin.

**Contenido:**

Tabla con pendientes en estado `Pendiente`:

| Columna | Descripción |
|---|---|
| Fecha solicitud | Cuándo lo cargó el supervisor |
| Asociado | Nombre del operario |
| Objetivo | Código del servicio |
| Tipo pendiente | Superación EFT / Retén / Franquero / Trabajos especiales |
| Fecha de la hora | Día al que aplica |
| Cantidad de horas | Horas solicitadas |
| Motivo | Lo que puso el supervisor |
| Solicitante | Supervisor |
| Días esperando | Alerta si son muchos |

**Acciones por fila:**
- ✅ **Aprobar** — abre modal con motivo opcional. Cambia `horas_grilla.estado_aprobacion` a `Impacta` (o el equivalente).
- ❌ **Rechazar** — abre modal con motivo obligatorio. Cambia estado a `Rechazada`. La hora no impacta.
- 👁 **Ver contexto del asociado** — historial de cargas, últimas horas Retén/Extra, etc.

**Filtros:** por tipo, por objetivo, por supervisor, por rango de fechas.

**Alertas visuales:**
- 🟡 Pendientes de más de 3 días → aviso amarillo.
- 🟠 Pendientes de más de 7 días → aviso naranja.
- 🔴 Pendientes de más de 15 días → aviso rojo + notificación diaria.

#### Cambio 7 — Notificaciones automáticas

**Nuevos tipos de notificación en `notificaciones_sistema`:**

| Trigger | A quién | Tipo |
|---|---|---|
| Se crea pendiente de aprobación | Gerente Operaciones | `liq_pendiente_ops` |
| Pendiente lleva más de 7 días | Gerente Operaciones + Supervisor solicitante | `liq_pendiente_demorado` |
| Aprobación por Ops | Supervisor solicitante | `liq_pendiente_aprobado` |
| Rechazo por Ops | Supervisor solicitante | `liq_pendiente_rechazado` |
| Art 42 día 3 (escalada) | Supervisor + RRHH | `liq_art42_escalada` |
| Categoría alternativa pendiente | Gerente Operaciones | `liq_cat_alt_pendiente` |

#### Cambio 8 — Categoría temporal para Retén — formalizar

**Qué hay hoy:**
- Funciones `solicitarCatAlt` y `resolverCatAlt` ya existen.
- No persisten.

**Qué cambia:**
- Persistir con la nueva tabla `cat_alt_pendientes`.
- **El supervisor elige la sub-categoría de Retén** al cargar (Retén Hora Base / Retén Larga Distancia / Retén Nocturno / etc.).
- El Gerente Ops valida/aprueba junto con la aprobación general de la hora Retén.
- La categoría alternativa se registra en `horas_grilla.categoria_efectiva_id_local`.

**Flujo:**

1. Supervisor carga hora Retén para operario.
2. Modal pide: sub-categoría de Retén + motivo.
3. Sistema crea:
   - Registro en `horas_grilla` con `estado_aprobacion = 'Pendiente aprobación Ops'` y `categoria_efectiva_id_local`.
   - Registro en `pendientes_auth_operaciones` con `tipo_pendiente = 'Retén'`.
   - Registro en `cat_alt_pendientes`.

4. Gerente Ops aprueba desde la bandeja. Todos los registros pasan a `Aprobada`.

#### Cambio 9 — Carga automática mensual con edición manual

**Qué hay hoy:**
- Ya existe el menú de carga automática (según Lautaro).

**Qué cambia:**

Formaliza y documenta el flujo:

**"Carga automática mensual":**
- Botón por operario en la grilla.
- Modal con:
  - Días laborables del mes (auto).
  - Horas por día (default: 8 según categoría).
  - Tipo de hora default (Normal).
  - Excluir domingos (checkbox — default sí).
  - Excluir feriados (checkbox — default sí, si hay catálogo).
- Al aplicar, sistema llena la fila del operario con horas Normal en cada día.
- **Después el supervisor puede corregir día por día** en la grilla.

**Al cerrar el mes (Cambio 11), sistema valida:**
- Que no haya huecos inesperados.
- Que las horas totales tengan sentido (no >12hs por día por operario).

#### Cambio 10 — Cierre formal del mes

**Qué hay hoy:**
- No hay cierre estructurado.

**Qué cambia:**

Botón "🏁 Cerrar mes" (visible cuando estado grilla = `En carga`).

**Al confirmar:**

1. **Validaciones automáticas:**
   - Que todos los pendientes de Ops estén resueltos (aprobados o rechazados).
   - Que no haya categorías alternativas sin resolver.
   - Que no haya art 42 escalados sin caso abierto en Enfermos.

2. **Si todo OK:**
   - Estado grilla → `Cerrada`.
   - `fecha_cierre` y `cerrada_por` registrados.
   - Notificación a Liquidaciones (final) de que la grilla está lista.
   - Bloquea nuevas cargas de horas en la grilla.

3. **Si hay validaciones fallidas:**
   - Modal con lista de problemas.
   - Botón "Ir a resolver" en cada uno.

**Estado siguiente:** `Enviada a liquidación` (se marca cuando el módulo Liquidaciones final lo consume).

#### Cambio 11 — Vista panorámica de la grilla (para supervisor)

**Qué hay hoy:**
- Vista tipo Excel con horas por operario/día.

**Qué cambia:**
Agregar indicadores visuales en la grilla:

**Por celda (día × operario):**
- 🟢 Verde: hora normal aprobada/impacta.
- 🟡 Amarillo: pendiente aprobación Ops.
- 🔵 Azul: hora especial (Retén/Franquero).
- 🟠 Naranja: art 42.
- 🔴 Rojo: rechazada por Ops o inválida.

**Panel resumen:**
- Total horas del mes.
- Horas EFT contratadas.
- Horas EFT consumidas.
- Horas EFT restantes / superación.
- Pendientes de aprobación (con link a la bandeja de Ops).
- Alertas activas.

**Filtros por operario:** ver historial de horas de un operario específico.

### 🟢 Cambios de consolidación menor

#### Cambio 12 — Autocompletar operarios disponibles

Al querer agregar un operario a la grilla, el sistema muestra:
- Operarios asignados al servicio (`legajo.servicio === objetivo.codigo`).
- Ordenados alfabéticamente.
- Con indicador visual si ya está en la grilla del mes actual.

#### Cambio 13 — Historial de eventos de la grilla

Nueva tabla `grilla_eventos` para auditoría:

```sql
CREATE TABLE public.grilla_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  grilla_id_local        text NOT NULL,
  
  tipo_evento            text NOT NULL,       -- Creación / Cierre / Agregado asociado / Cambio horas / etc.
  descripcion            text NOT NULL,
  ejecutado_por          text NOT NULL,
  ejecutado_en           timestamptz NOT NULL DEFAULT now(),
  
  created_at             timestamptz NOT NULL DEFAULT now()
);
```

---

## 3. Modelo de flujo actualizado

### 3.1 Flujo de carga de una hora

```
[Supervisor carga hora en grilla]
  ↓
Sistema valida:
  - ¿Tipo Normal dentro de EFT? → estado = Impacta (verde)
  - ¿Supera EFT? → estado = Pendiente Ops (amarillo)
  - ¿Retén? → pide sub-categoría → estado = Pendiente Ops (azul)
  - ¿Franquero o Trabajos especiales? → estado = Pendiente Ops (azul)
  - ¿Art 42 día 1-3? → estado = Impacta (naranja)
  - ¿Art 42 día 4+? → BLOQUEO + escalada a Enfermos
  ↓
Persistir en horas_grilla + (si aplica) en pendientes_auth_operaciones
  ↓
Notificación al Gerente Ops (si pendiente)
```

### 3.2 Flujo de aprobación por Ops

```
[Gerente Ops abre bandeja de pendientes]
  ↓
Ve N pendientes con contexto
  ↓
Aprueba o rechaza cada uno con motivo
  ↓
horas_grilla.estado_aprobacion = Aprobada o Rechazada
  ↓
Notificación al supervisor solicitante
```

### 3.3 Flujo de cierre de mes

```
[Supervisor termina cargas → Cerrar mes]
  ↓
Validaciones automáticas
  ↓
Si OK: estado grilla = Cerrada → notifica a Liquidaciones (final)
Si problemas: lista de resolución
```

---

## 4. Integraciones

### 4.1 Módulo Objetivos (delta cerrado)

- Lee `objetivos.supervisor_asignado` para filtrar por supervisor.
- Lee `objetivos.efts_contratados` (o similar) para calcular EFT.
- Solo objetivos con estado `Operativo` aparecen.

### 4.2 Módulo Enfermos y Accidentes

- Hook automático al 3er día consecutivo de art 42.
- Llama a `window.enfermosAccidentesAPI.notificarEscaladaArt42(legajoId, fechaInicio)`.
- El módulo Enfermos crea el caso con estado inicial "Pendiente" (RRHH lo revisa y abre formalmente).

### 4.3 Módulo Categorías

- Lee `categoriasAPI.obtenerValorHoraVigente(categoriaId, servicio, fecha)` para validar.
- No calcula pagos (eso es del módulo Liquidaciones final).
- Solo valida que el valor hora esté cargado.

### 4.4 Módulo Legajos

- Lee `legajo.servicio` para saber qué operarios están asignados a cada objetivo.
- Lee `legajo.categoria_id_local` para determinar categoría base.

### 4.5 Módulo Liquidaciones (final, no cubierto en este delta)

- Cuando la grilla se cierra, notifica a Liquidaciones.
- Liquidaciones consume `horas_grilla` (solo horas con `estado_aprobacion = Impacta` o `Aprobada`).
- Liquidaciones calcula pago × valor hora vigente y aplica descuentos.

### 4.6 Sistema de notificaciones

Reutiliza `notificaciones_sistema`.

---

## 5. Etapas de implementación

### Etapa 1 — Persistencia base (crítica)
- Crear todas las tablas nuevas.
- Cablear `supaSync` en todas las funciones existentes.
- Corregir seed viejo de grillasLiq.

**Al terminar:** todo persiste. Ya el módulo pasa de "prototipo" a "usable".

### Etapa 2 — Escalada Art 42 real
- Cambio 3: hook automático a Enfermos.

### Etapa 3 — Cableado con Objetivos y Categorías
- Cambio 4: lectura de `supervisor_asignado`.
- Cambio 5: validación de valor hora.

### Etapa 4 — Bandeja Gerente Ops y flujo formal
- Cambio 6: bandeja de pendientes.
- Cambio 7: notificaciones.
- Cambio 8: categoría alternativa formalizada.

### Etapa 5 — Cierre formal y validaciones
- Cambio 9: carga automática con edición manual (formalizar existente).
- Cambio 10: cierre formal del mes.
- Cambio 11: vista panorámica.

### Etapa 6 — Consolidación menor
- Cambio 12: autocompletar operarios.
- Cambio 13: historial de eventos.

### Etapa 7 — Migración a `src/modules/`
- Extraer a `src/modules/liquidacion_horas/`.

---

## 6. Prerequisitos

Antes de que Fede arranque:

1. **Delta de Objetivos implementado** — necesita el campo `supervisor_asignado`.
2. **Módulo Categorías implementado** — para las validaciones de valor hora.
3. **Módulo Enfermos y Accidentes implementado** — para la escalada automática.
4. **Sistema de permisos por rol** — filtrar bandeja Ops.
5. **Confirmar con Lautaro** si hay datos históricos en `DB.grillasLiq` con esquema viejo que haya que migrar.
6. **Coordinación con Lautaro** en cada etapa — este es el único módulo que él escribió directo.

---

## 7. Casos borde

### 7.1 Operario dado de baja durante el mes
La grilla mantiene los días ya trabajados. No permite agregar horas después de la fecha de baja.

### 7.2 Cambio de servicio del operario a mitad de mes
Aparece en 2 grillas (una por servicio) con los días correspondientes.

### 7.3 Objetivo dado de baja durante el mes en curso
La grilla del mes actual sigue abierta. La del mes siguiente no se crea.

### 7.4 Supervisor cambia (via Ops asigna nuevo supervisor a objetivo)
El nuevo supervisor ve la grilla desde su asignación. Las horas cargadas por el anterior quedan intactas.

### 7.5 Horas cargadas superan 24hs en un día
Bloqueo. Error visible.

### 7.6 Pendiente de Ops nunca resuelto y el mes se cierra
Bloqueo en cierre. Ops debe resolver antes.

### 7.7 Art 42 con día 4 pero sin caso en Enfermos
Bloqueo. Escalada debe activarse antes.

### 7.8 Categoría alternativa pendiente al cerrar mes
Bloqueo. Debe resolverse primero.

### 7.9 Feriado no reconocido en la carga automática
El supervisor lo edita manualmente después.

### 7.10 Operario Retén cubriendo servicio ajeno
El servicio ajeno tiene su grilla. El operario aparece ahí con categoría alternativa (Retén).

---

## 8. Convenciones respetadas

- Nombres en español.
- camelCase en frontend, snake_case en Supabase.
- Soft delete (política A.7).
- Vigencia temporal para valores hora (via Categorías, política A.6).
- Auditoría de transiciones.
- Un commit por cambio lógico (política A.3).

---

## 9. Bugs conocidos a corregir del legacy

Del inventario:

1. **No persiste** — se persiste todo (Cambio 1).
2. **Drift de schema en grillasLiq** — se elimina seed viejo (Cambio 2).
3. **Escalada Art 42 → Enfermos es solo copy** — se cablea real (Cambio 3).
4. **Filtrado por supervisor por string** — se cablea con `supervisor_asignado` de Objetivos (Cambio 4).
5. **Sin validación de valor hora en Categorías** — se cablea (Cambio 5).
6. **Sin bandeja de aprobación Ops** — se agrega (Cambio 6).

---

## 10. FAQ

**¿Este módulo calcula el pago al operario?**
No. Solo carga horas. El módulo Liquidaciones (final) calcula pagos.

**¿Los descuentos (Uniformes, Sanciones, Adelantos) aparecen acá?**
No. Solo aparecen en el módulo Liquidaciones (final).

**¿Puedo cargar horas retroactivas en un mes ya cerrado?**
No por default. Solo Ops + Admin puede reabrir el mes con motivo.

**¿Qué pasa si un operario está en tratamiento (Enfermos) y trato de cargar horas?**
Sistema alerta. Puede cargarse con confirmación (el operario podría haber retomado).

**¿La aprobación de Retén y Franquero es siempre por Ops?**
Sí, Gerente Ops (Ricardo Elicabe) es el único aprobador.

**¿Puedo tocar el módulo Liquidaciones (final)?**
No en este delta. Solo notificamos que la grilla está cerrada.

**¿Puedo tocar Objetivos, Categorías, Enfermos, Legajos?**
Solo para consumir las APIs expuestas (`categoriasAPI.obtenerValorHoraVigente`, `enfermosAccidentesAPI.notificarEscaladaArt42`, lectura de `objetivos.supervisor_asignado`). NO modificar.

---

## 11. Cierre

Este delta consolida el módulo más importante del sistema para la operación diaria. Es el **único módulo que Lautaro escribió directamente**, y por eso el enfoque es **preservar la lógica funcional** que ya tiene y consolidar los aspectos que faltan (persistencia + hooks reales).

Los cambios clave:
1. **Persistir todo** — hoy nada se guarda (bug crítico).
2. **Escalada Art 42 real** — pasa de texto a código.
3. **Cablear con Objetivos** — usar el nuevo `supervisor_asignado`.
4. **Cablear con Categorías** — validar valores hora.
5. **Bandeja formal de Ops** — Gerente aprueba Retén / Franquero / Trabajos especiales / Superación EFT.
6. **Cierre estructurado del mes** con validaciones.
7. **Preservar lo que ya funciona** — filtrados, cálculos EFT, categoría temporal, sistema pendientesAuth.

**Estimación de trabajo para Fede:** 100-150 horas. Mediano porque hay bastante lógica preservable, pero el cableado con Enfermos + Objetivos + Categorías + persistir todo es sustantivo.

**Coordinación con Lautaro requerida:**
- Este es tu módulo. Fede debe consultarte antes de modificar cada función existente.
- Definir exactamente qué del código actual se preserva y qué se refactoriza.
- Coordinar la persistencia — que no rompa el flujo actual.

**Objetivo estratégico:** que el módulo pase de "prototipo en memoria" a "sistema real que persiste y se integra". La carga de horas es la actividad diaria de los supervisores — que funcione bien es crítico.

Ante duda: **preguntar antes de codear** (política A.4).

**¡Que las horas fluyan!** 📋⏰
