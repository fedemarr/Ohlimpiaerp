# Diseño del módulo Capacitación — Especificación para implementación

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Capacitaciones
**Autor del diseño:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-05
**Versión:** 1.0

---

## Cómo usar este documento

Este documento es la **fuente de verdad** para implementar el módulo Capacitaciones. Está pensado para que se pueda programar **sin necesidad de volver a preguntar** por decisiones de diseño.

Se lee de arriba hacia abajo:
- Secciones **1-3** son contexto (leer una vez).
- Sección **4** es el modelo de datos (leer y aplicar antes de codear).
- Sección **5** es la estructura de archivos (leer antes de crear carpetas).
- Secciones **6-10** son la especificación por tab (referencia durante la implementación).
- Sección **11** son las integraciones con otros módulos.
- Sección **12** es el plan por etapas (sirve para priorizar).
- Sección **13** son casos borde y validaciones.
- Sección **14** son las convenciones que hay que respetar.

**Antes de escribir cualquier código:** leer `POLITICAS_PROYECTO.md` y `CLAUDE.md`.

---

## 1. Contexto del módulo

### 1.1 Qué es Ohlimpia
Ohlimpia es un ERP cooperativo para gestionar una cooperativa de trabajo de servicios de limpieza con ~500 asociados. Cubre selección, ingreso, legajos, capacitaciones, liquidaciones, clientes, económico-financiero.

### 1.2 Qué es el módulo Capacitaciones
Es el módulo donde el equipo de RRHH (principalmente Gabi, la manager) gestiona **todo el ciclo de capacitación de los asociados de la cooperativa**:
- Agenda de capacitaciones a dictar.
- Registro de capacitaciones dictadas.
- Estadísticas de cobertura (quién está capacitado en qué).
- Repositorio de materiales (PDFs, videos, links).
- Evaluaciones con corrección automática.

### 1.3 Usuarias
- **Gabi** (Gabriela Lucero) — Manager de RRHH. Usuaria principal.
- **Equipo de RRHH** (Matilde Noceti, Jimena Martínez, Martina Ramírez, Naara Rodríguez).
- **Otros roles con acceso:** Administrador total, RRHH, Operaciones (según `src/shared/state.js`).

### 1.4 Estado actual (antes de esta implementación)
El módulo existe hoy en `src/legacy.js` (~93 referencias, líneas ~761–1430). **Nada persiste en Supabase** (los `supaSync('capacitaciones', ...)` llaman a claves que no están en el mapa de tablas). Todos los datos se pierden al recargar. Es una maqueta funcional, no un sistema.

**Ver:** `docs/INVENTARIO_capacitaciones_legacy.md` para el detalle exacto del código actual.

### 1.5 Objetivo de esta implementación
Rehacer el módulo de cero en `src/modules/capacitaciones/` siguiendo el patrón de módulos migrados (política **A.11** de rehacer sobre parchar cuando hay deuda técnica heredada). El módulo migrado debe:
1. Persistir en Supabase.
2. Tener la estructura de tabs revisada y aprobada con Gabi (este documento).
3. Corregir los bugs conocidos del actual (botón editar sin handler, doble supaSync, modal de evaluaciones que descarta la mayoría de los datos).
4. Preparar la integración futura con WhatsApp para coordinaciones y evaluaciones.

---

## 2. Alcance de la implementación

### 2.1 Qué incluye (alcance de esta primera iteración)
- Tabla `capacitaciones` en Supabase con todos los estados.
- Tabla `materiales_capacitacion` en Supabase.
- Tabla `preguntas_evaluacion` en Supabase.
- Tabla `plantillas_evaluacion` en Supabase.
- Tabla `evaluaciones_enviadas` en Supabase.
- Tabla `respuestas_evaluacion` en Supabase.
- Módulo migrado en `src/modules/capacitaciones/`.
- 4 tabs: Registro, Estadísticas, Calendario, Repositorio.
- Tab 5 (Evaluaciones) con 4 sub-tabs (Banco, Plantillas, Enviadas, No respondieron).
- Botón "Enviar evaluación" (por ahora manual, sin envío real por WhatsApp).
- Página web pública para que el asociado responda evaluación (con token único, sin login).
- Vinculación con módulo Legajo (dentro del legajo del asociado se ve su historial de capacitaciones).

### 2.2 Qué NO incluye (etapas futuras)
- Envío real por WhatsApp de evaluaciones y coordinaciones (espera destrabar Meta Business API).
- IA real para análisis y generación automática de plan (por ahora placeholder).
- Recordatorios automáticos por WhatsApp para evaluaciones vencidas.
- Historial de rotación entre servicios (se saca del módulo).

---

## 3. Decisiones tomadas

Se listan las decisiones tomadas durante la sesión de diseño. **Cada una tiene su justificación.** Fede no debe cambiarlas sin consultar.

### 3.1 Registro y Calendario son la misma tabla
Los tabs **Registro** (Tab 1) y **Calendario** (Tab 3) son dos vistas distintas de la **misma tabla `capacitaciones`**. Cualquier acción sobre una fila se refleja en las dos vistas. No hay dos tablas separadas.

### 3.2 Estados simplificados
Sólo hay 3 estados posibles para una capacitación:
- **Programada** — agendada, aún no dictada.
- **Dictada** — ya se dio (con resultado real cargado).
- **Cancelada** — se desagendó antes de dictarse.

Las capacitaciones **Dictadas sin resultado aún cargado** siguen apareciendo en el tab Registro (no en Histórico) hasta que se carga el resultado.

### 3.3 Autoedición y campos protegidos
Cuando Gabi edita una capacitación ya cargada, **todos los campos son editables excepto Asociado**. La edición queda registrada con quién editó y cuándo (auditoría).

### 3.4 Adjuntos
Cada capacitación puede tener un adjunto **opcional** (asistencia firmada, certificado, etc.). Reusa el patrón de `src/shared/adjuntos.js`.

### 3.5 Generación automática mensual (no anual)
El botón "Generar plan anual" se elimina. Se reemplaza por "**Generar plan mensual**" que genera un borrador de las capacitaciones a dictar en un mes. Gabi revisa y confirma. Es más realista y manejable.

### 3.6 "Análisis IA" queda como placeholder
El botón "🤖 Análisis IA" se conserva en la UI con etiqueta "Próximamente" hasta que se implemente con la Anthropic API. Sirve para reservar el lugar visual.

### 3.7 Se saca el bloque de rotación
El bloque de "Historial de rotación" (asociados que trabajaron en múltiples servicios) no está en el alcance de este módulo. Se descarta.

### 3.8 Cobertura por supervisor (nueva)
Se agrega un tercer bloque de cobertura por supervisor (junto a por tipo y por servicio). Es útil para identificar qué supervisor tiene equipo mejor/peor capacitado.

### 3.9 Exportar a Excel
Nuevo botón en el tab Estadísticas: exportar los datos mostrados (respetando filtros aplicados) en formato `.xlsx`. Usar librería SheetJS (`xlsx` en npm).

### 3.10 Materiales del Repositorio
- Pueden ser **URL externa** o **archivo subido** al sistema (Supabase Storage). El usuario elige.
- Sin lógica de vencimiento ni versionado.
- La asociación a un tipo de capacitación es **opcional** (un material o uno solo o ninguno). Si no está asociado, aparece como "material general".
- Se puede editar y eliminar (con soft delete).

### 3.11 Materiales usados al dictar
Al dictar una capacitación, se puede registrar **más de un material** que se usó. Es opcional pero recomendado.

### 3.12 Evaluaciones = examen automático con opción múltiple
El modelo es exámenes con preguntas de opción múltiple, corregidos automáticamente por el sistema. Reemplaza el uso actual de Google Forms.

### 3.13 Banco de preguntas por tipo de capacitación
Cada uno de los 8 tipos tiene su banco propio de preguntas. Gabi las carga una sola vez, se usan siempre.

### 3.14 Preguntas fijas por plantilla
La plantilla de evaluación por tipo de capacitación define **qué preguntas específicas** se envían. Siempre son las mismas para todos los asociados que reciben esa evaluación. No hay selección aleatoria (más simple).

### 3.15 Envío manual
Gabi decide y aprieta "Enviar evaluación" en cada caso. El sistema no envía automáticamente al dictar. Esto le da control total.

### 3.16 Plazo obligatorio de 48hs (default, configurable por plantilla)
Cada evaluación tiene plazo obligatorio de respuesta. Default 48hs, configurable en la plantilla del tipo de capacitación.

### 3.17 Un solo intento sin reintento
Si el asociado desaprueba, queda Desaprobado. Para volver a estar Aprobado tiene que rehacer toda la capacitación (nueva Programada → Dictada → Evaluación).

### 3.18 Estado "Vencida" propio
Si el asociado no responde en el plazo, la evaluación queda con estado "Vencida" (no cae automáticamente a Desaprobada ni Sin evaluación). Gabi decide caso por caso: puede reenviarla, marcarla como Desaprobada, o dejarla en histórico.

### 3.19 Respuesta del asociado — web con token único (por ahora)
Mientras WhatsApp no esté destrabado, el asociado responde en una página web pública con un token único en la URL (sin login). Cuando WhatsApp esté listo, se puede reevaluar el canal.

### 3.20 Coordinación por WhatsApp — futuro
El botón "Coordinar por WhatsApp" en el Calendario dispara mensajes al asociado y al supervisor. Está fuera del alcance de esta iteración (espera Meta destrabada).

---

## 4. Modelo de datos

### 4.1 Convenciones generales
- Todas las tablas siguen el patrón del proyecto: `id bigserial PK`, `id_local text UNIQUE NOT NULL`, `created_at`, `updated_at`, `anulado boolean DEFAULT false`.
- Uso de snake_case en base de datos.
- Timestamps como `timestamptz`.
- Referencias entre tablas por `id_local` (patrón del proyecto).

### 4.2 SQL versionado

Crear el archivo `sql/v013_capacitaciones.sql` con:

```sql
-- =============================================================================
-- Migración: v013 — Módulo Capacitaciones
-- Fecha:     2026-07-05
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Crea las tablas del módulo Capacitaciones migrado desde legacy.js.
-- Es la primera versión persistente del módulo (antes vivía en memoria).
--
-- Tablas creadas:
--   1. capacitaciones           — registro central del ciclo
--   2. materiales_capacitacion  — biblioteca de recursos
--   3. capacitacion_materiales  — pivot (muchos-a-muchos)
--   4. preguntas_evaluacion     — banco de preguntas por tipo
--   5. plantillas_evaluacion    — configuración por tipo
--   6. plantilla_preguntas      — pivot (qué preguntas van en cada plantilla)
--   7. evaluaciones_enviadas    — instancias enviadas a asociados
--   8. respuestas_evaluacion    — respuestas del asociado
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Tabla 1 — capacitaciones
-- ---------------------------------------------------------------------------
CREATE TABLE public.capacitaciones (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local           text UNIQUE NOT NULL,
  legajo_id_local    text NOT NULL,           -- ref al asociado
  nro_socio          text NOT NULL,           -- desnormalizado para performance
  nombre_asociado    text NOT NULL,           -- desnormalizado
  tipo               text NOT NULL,           -- uno de los 8 tipos hardcoded
  fecha              date NOT NULL,
  lugar              text NOT NULL,           -- Servicio / Oficina Central / Virtual / Externo
  servicio           text,                    -- nombre del cliente (si lugar = Servicio)
  instructor         text NOT NULL,
  metodo_evaluacion  text,                    -- uno de los 9 métodos (opcional)
  estado             text NOT NULL DEFAULT 'Programada',  -- Programada / Dictada / Cancelada
  resultado          text,                    -- Aprobado / Desaprobado / Pendiente evaluación / Sin evaluación
  puntaje            integer,                 -- si viene de evaluación automática
  observaciones      text,
  adjunto_id_local   text,                    -- ref a adjuntos si tiene
  materiales_ids     text[],                  -- array de id_local de materiales_capacitacion usados
  coordinado_asociado    text,                -- null / pendiente / confirmado / rechazado / pidió_reprogramar
  coordinado_supervisor  text,                -- null / avisado / respondido
  editado_por        text,                    -- para auditoría
  editado_en         timestamptz,             -- para auditoría
  anulado            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_capacit_legajo ON public.capacitaciones(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_capacit_fecha  ON public.capacitaciones(fecha) WHERE NOT anulado;
CREATE INDEX idx_capacit_estado ON public.capacitaciones(estado) WHERE NOT anulado;
CREATE INDEX idx_capacit_tipo   ON public.capacitaciones(tipo) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Tabla 2 — materiales_capacitacion
-- ---------------------------------------------------------------------------
CREATE TABLE public.materiales_capacitacion (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,
  nombre            text NOT NULL,
  tipo              text NOT NULL,           -- Video / PDF / PowerPoint / Word / Link externo / Archivo subido
  origen            text NOT NULL,           -- URL / Archivo
  url               text,                    -- si origen = URL
  archivo_path      text,                    -- si origen = Archivo (path en Supabase Storage)
  tipo_capacitacion text,                    -- opcional; null = "sin asociación"
  duracion          text,
  descripcion       text,
  requiere_eval     boolean DEFAULT true,
  fecha_alta        date NOT NULL DEFAULT CURRENT_DATE,
  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_material_tipo_cap ON public.materiales_capacitacion(tipo_capacitacion) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Tabla 3 — preguntas_evaluacion (banco por tipo)
-- ---------------------------------------------------------------------------
CREATE TABLE public.preguntas_evaluacion (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,
  tipo_capacitacion text NOT NULL,           -- uno de los 8 tipos
  enunciado         text NOT NULL,
  opcion_a          text NOT NULL,
  opcion_b          text NOT NULL,
  opcion_c          text NOT NULL,
  opcion_d          text NOT NULL,
  correcta          text NOT NULL,           -- 'A' | 'B' | 'C' | 'D'
  editado_por       text,
  editado_en        timestamptz,
  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pregunta_tipo ON public.preguntas_evaluacion(tipo_capacitacion) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Tabla 4 — plantillas_evaluacion (config por tipo)
-- ---------------------------------------------------------------------------
CREATE TABLE public.plantillas_evaluacion (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local          text UNIQUE NOT NULL,
  tipo_capacitacion text UNIQUE NOT NULL,    -- 1 plantilla por tipo
  preguntas_ids     text[],                  -- array de id_local de preguntas incluidas
  nota_minima       integer NOT NULL DEFAULT 70,   -- porcentaje para aprobar
  plazo_horas       integer NOT NULL DEFAULT 48,   -- plazo en horas
  anulado           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Tabla 5 — evaluaciones_enviadas
-- ---------------------------------------------------------------------------
CREATE TABLE public.evaluaciones_enviadas (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  capacitacion_id_local text NOT NULL,        -- ref a capacitaciones
  legajo_id_local       text NOT NULL,        -- ref al asociado
  plantilla_id_local    text NOT NULL,        -- ref a plantillas_evaluacion
  token                 text UNIQUE NOT NULL, -- token público para responder
  fecha_envio           timestamptz NOT NULL DEFAULT now(),
  fecha_limite          timestamptz NOT NULL,
  estado                text NOT NULL DEFAULT 'Enviada',  -- Enviada / Respondida / Vencida / Anulada
  puntaje               integer,              -- porcentaje (0-100)
  resultado             text,                 -- Aprobada / Desaprobada (viene del puntaje y nota_minima de la plantilla)
  fecha_respuesta       timestamptz,
  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evalenv_capacit ON public.evaluaciones_enviadas(capacitacion_id_local) WHERE NOT anulado;
CREATE INDEX idx_evalenv_legajo  ON public.evaluaciones_enviadas(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_evalenv_token   ON public.evaluaciones_enviadas(token);

-- ---------------------------------------------------------------------------
-- Tabla 6 — respuestas_evaluacion (respuesta del asociado por pregunta)
-- ---------------------------------------------------------------------------
CREATE TABLE public.respuestas_evaluacion (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE NOT NULL,
  evaluacion_id_local   text NOT NULL,        -- ref a evaluaciones_enviadas
  pregunta_id_local     text NOT NULL,        -- ref a preguntas_evaluacion
  respuesta             text NOT NULL,        -- 'A' | 'B' | 'C' | 'D'
  correcta              boolean NOT NULL,     -- se calcula al guardar comparando con la pregunta
  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_resp_evalenv ON public.respuestas_evaluacion(evaluacion_id_local) WHERE NOT anulado;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
```

### 4.3 Mapeo en `src/shared/supabase.js`

Agregar al mapa de tablas (buscar dónde están las otras claves como `psicos`, `preocupacionales`, etc.):

```javascript
capacitaciones:         'capacitaciones',
materialesCapacitacion: 'materiales_capacitacion',
preguntasEvaluacion:    'preguntas_evaluacion',
plantillasEvaluacion:   'plantillas_evaluacion',
evaluacionesEnviadas:   'evaluaciones_enviadas',
respuestasEvaluacion:   'respuestas_evaluacion',
```

### 4.4 Catálogos (hardcoded en el código, no en DB)

Como en el módulo actual, se mantienen los catálogos harcoded (por ahora — a futuro se podrían mover a tablas de catálogo, pero no es alcance).

**Tipos de capacitación** (`DB.tiposCapacitacion`):
1. Capacitación de Ingreso: Cooperativismo
2. Capacitación de Ingreso: Productos y maquinarias
3. Capacitación de Ingreso: Normativas de trabajo
4. Maquinarias: uso, manejo y mantenimiento
5. Interpretación del Plan de trabajo en Servicio
6. Productos, herramientas y modalidades de limpieza
7. Liderazgo
8. Atención al Cliente

**Instructores** (`DB.instructores`):
1. Miguel Pereyra
2. Patricia Scaglia
3. Marina Iglesias
4. Gina Martinez
5. Santiago Ayala
6. Encargado
7. Referente
8. Supervisor

**Métodos de evaluación** (`DB.metodosEval`):
1. Evaluación oral
2. Evaluación escrita
3. Auditoría proceso
4. Auditoría SOL
5. Auditoría sistema
6. Evolución de indicador
7. Informe del supervisor
8. Encuesta al asociado

**Lugares de dictado** (constante local):
1. Servicio
2. Oficina Central
3. Virtual
4. Externo

---

## 5. Estructura del módulo

Crear el directorio `src/modules/capacitaciones/` con esta estructura (sigue el patrón de los otros módulos migrados):

```
src/modules/capacitaciones/
├── index.js              — Re-exports y bindings al window
├── capacitaciones.js     — Lógica principal (renders, ABM, filtros)
├── evaluaciones.js       — Sub-módulo de evaluaciones (más complejo)
├── materiales.js         — Sub-módulo de repositorio
├── planificador.js       — Generador mensual + coordinación (etapa 2/3)
└── stats.js              — Cálculo de estadísticas
```

El HTML de la pantalla queda en `index.html` (mantener la ubicación actual `<div id="screen-capacitaciones">`). Puede necesitar refactor para incluir los nuevos sub-tabs de Evaluaciones.

### 5.1 Página pública para responder evaluaciones

Crear también una página aparte para que el asociado responda:

```
public/evaluacion.html         — HTML de la página de respuesta
src/eval-publica.js            — Lógica de la página (sin login, usa token)
```

Esta página debe estar accesible en `https://ohlimpia-sistema.netlify.app/evaluacion.html?token=XXXX`.

**Detalle importante:** la página pública no usa Supabase directamente con la anon key desde el browser (posible pero riesgoso). Mejor: crear una Edge Function `responder-evaluacion` que:
1. Recibe el token + respuestas.
2. Valida que el token exista y no esté vencido.
3. Corrige las respuestas.
4. Guarda en la DB.
5. Devuelve resultado (aprobado/desaprobado + puntaje).

Esto protege la DB de un asociado curioso que quiera abusar del token.

---

## 6. Tab 1 — Registro

### 6.1 Qué muestra
Vista lista de capacitaciones en estados:
- **Programada** (todas las que aún no se dictaron).
- **Dictada sin resultado** (dictadas pero con resultado "Pendiente evaluación").

**No muestra:** Dictadas con resultado real (van a Histórico) ni Canceladas.

### 6.2 Columnas del listado
1. Asociado (con link al legajo)
2. N° Socio
3. Fecha
4. Tipo (chip de color según tipo)
5. Lugar
6. Servicio
7. Instructor
8. Estado (badge: Programada / Pendiente evaluación)
9. Coordinación (chip: sin coordinar / esperando asociado / confirmado / rechazado)
10. Acciones (✏️ Editar / 🎓 Dictar / ❌ Anular)

### 6.3 Filtros
- Buscador general por asociado (nombre o N° socio).
- Filtro por tipo.
- Filtro por estado (Programada / Pendiente evaluación).
- Filtro por mes/año.
- Filtro por instructor.

### 6.4 Botón "+ Registrar capacitación"
Abre el modal "Agendar capacitación".

### 6.5 Modal "Agendar capacitación"

**Título del modal:** "🎓 Agendar capacitación"

**Campos:**

| Campo (id) | Etiqueta | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| `cap-asociado` | Asociado * | Autocompletado (busca en legajos activos) | Sí | Ver §6.5.1 |
| `cap-nro-socio` | N° Socio | Texto readonly | — | Se autocompleta al elegir asociado |
| `cap-tipo` | Tipo de capacitación * | Select (8 tipos) | Sí | |
| `cap-fecha` | Fecha * | Date | Sí | |
| `cap-lugar` | Lugar * | Select (Servicio / Oficina Central / Virtual / Externo) | Sí | |
| `cap-servicio` | Servicio | Autocomplete de servicios del asociado | No | Se sugiere el servicio del legajo |
| `cap-instructor` | Instructor/a * | Select (8 instructores) | Sí | |
| `cap-metodo` | Método de evaluación | Select (9 métodos + "Sin evaluación") | No | Default: Sin evaluación |
| `cap-obs` | Observaciones | Textarea | No | |
| `cap-adjunto` | Adjunto | File input (opcional) | No | Ver §11.2 |

**Validaciones:**
- Los 5 marcados con `*` son validados. Sin ellos, no se guarda.
- El asociado debe existir en `DB.legajos` con `estado === 'Activo'`.
- La fecha no puede ser en el pasado (validar `>= today`).
- Si `lugar === 'Servicio'`, `servicio` es requerido.

**Guardar (`agendarCapacitacion()`):**
1. Validar los obligatorios.
2. Crear registro con `estado = 'Programada'`, timestamps.
3. Push a `DB.capacitaciones` + `supaSync('capacitaciones', ...)`.
4. Si tiene adjunto, subirlo con el helper de adjuntos.
5. Toast: "✅ Capacitación agendada para {nombre} el {fecha}".

### 6.6 Modal "Editar capacitación"

**Título:** "✏️ Editar capacitación"

Mismos campos que Agendar **excepto**:
- `cap-asociado` es readonly (no se puede cambiar de asociado).
- Se agrega abajo un pequeño texto: "Última edición: {editado_por} el {editado_en}".

**Guardar (`editarCapacitacion()`):**
1. Actualizar `editado_por` y `editado_en`.
2. `supaSync`.
3. Toast: "✅ Capacitación actualizada".

### 6.7 Modal "Dictar / Cargar resultado"

**Título:** "🎓 Dictar capacitación" (si estaba Programada) o "📝 Cargar resultado" (si estaba en Pendiente).

**Campos:**

| Campo | Tipo | Obligatorio |
|---|---|---|
| Resultado * | Select (Aprobado / Desaprobado / Pendiente evaluación / Sin evaluación) | Sí |
| Puntaje | Number 0-100 | Si resultado = Aprobado/Desaprobado, opcional |
| Materiales usados | Multi-select (materiales cuyo `tipo_capacitacion` coincide o son "sin asociación") | No |
| Observaciones | Textarea | No |
| Adjunto (asistencia firmada, certificado) | File input | No |

**Guardar (`dictarCapacitacion()`):**
1. Setear `estado = 'Dictada'`.
2. Setear `resultado`, `puntaje`, `materiales_ids`.
3. Actualizar `editado_por` y `editado_en`.
4. Si adjunto → subir con helper.
5. `supaSync`.
6. Si resultado en `['Aprobado', 'Desaprobado', 'Sin evaluación']` → toast: "✅ Capacitación cerrada. Movida al Histórico."
7. Si resultado = 'Pendiente evaluación' → toast: "✅ Capacitación dictada. Queda en Registro esperando resultado."
8. Refresh de la vista.

### 6.8 Botón "❌ Anular"

**Confirmación:** modal simple "¿Estás seguro que querés anular esta capacitación?".

Si confirma:
1. Setear `estado = 'Cancelada'`.
2. `supaSync`.
3. Toast: "✅ Capacitación cancelada."
4. Refresh.

**Guard:** solo se pueden anular capacitaciones en estado "Programada". Las Dictadas no se anulan (se corrige el resultado).

---

## 7. Tab 2 — Estadísticas

### 7.1 Panorama
4 bloques de solo lectura, todos calculados en tiempo real. Sirve para que Gabi entienda el estado global de capacitaciones.

### 7.2 Bloque 1 — Cobertura por tipo
Barra de progreso por cada uno de los 8 tipos:
```
Ingreso: Cooperativismo   ████████░░  120/150  (80%)
```
**Cálculo:** para cada tipo, contar asociados activos que tienen al menos una capacitación **Dictada + Aprobada** de ese tipo / total de activos.

### 7.3 Bloque 2 — Cobertura por servicio
Igual al anterior pero por servicio. Muestra los 8 servicios con más legajos activos.

**Cálculo:** para cada servicio, contar activos del servicio que tienen al menos una capacitación de Ingreso Aprobada / total de activos del servicio.

### 7.4 Bloque 3 — Cobertura por supervisor (nuevo)
Igual al bloque 2 pero agrupado por supervisor.

### 7.5 Bloque 4 — Asociados con capacitaciones pendientes
Tabla:
| Asociado | N° Socio | Servicio | Supervisor | Realizadas | Pendientes | Antigüedad | Riesgo |
|---|---|---|---|---|---|---|---|

**Nivel de riesgo:**
- Alto: 4+ tipos pendientes.
- Medio: 2-3 pendientes.
- Bajo: 0-1 pendientes.

**Pendientes:** de los 8 tipos, cuántos NO tienen ninguna Dictada+Aprobada.

### 7.6 Filtros
- Filtro por tipo (afecta bloques 1, 4).
- Filtro por servicio (afecta bloques 2, 4).
- Filtro por supervisor (afecta bloque 3, 4).

**Bug a corregir del actual:** el filtro por tipo hoy no filtra la tabla de pendientes. Corregirlo.

### 7.7 Botones

**"📥 Exportar a Excel"** — genera un `.xlsx` con todos los bloques visibles y los filtros aplicados. Usar SheetJS.

**"🤖 Análisis IA"** — placeholder con texto "Próximamente". No hace nada aún. En una etapa futura, este botón le pide a Claude (via Anthropic API) que analice los datos y devuelva insights.

---

## 8. Tab 3 — Calendario

### 8.1 Qué muestra
Vista de calendario mensual de las capacitaciones Programadas y Pendientes evaluación (mismos filtros que Tab 1).

**Es la misma tabla `capacitaciones`, solo cambia el formato de presentación.**

### 8.2 Estructura visual
- Grilla mensual (semanas × días).
- Cada día muestra las capacitaciones de ese día, con chip de color por modalidad (lugar).
- Botones "← Anterior" / "Siguiente →" para navegar meses.
- Leyenda de colores (Servicio = azul, Oficina = verde, Virtual = amarillo, Externo = rojo, por ejemplo).

### 8.3 Interacciones
- **Click en día vacío:** abre modal "Agendar capacitación" con la fecha pre-cargada.
- **Click en capacitación existente:** abre modal de detalle con opciones (Editar / Dictar / Anular).

### 8.4 Panel de configuración (arriba del calendario)

Un accordion/collapsible para no ocupar espacio si no se usa. Al expandirlo:

**Configuración del generador mensual:**
- Mes objetivo (Select con próximos 6 meses).
- Modalidades habilitadas (checkboxes: Oficina Central / En Servicio / Meet-Virtual / Video). Default todas.
- Prioridad (Select con 3 opciones):
  - Cubrir primero ingresos nuevos.
  - Cubrir primero los que no tienen ninguna.
  - Cubrir todos por igual.
- Máximo por semana (Select: 1 / 2 default / 3 / 5).

**Botón "🤖 Generar plan mensual"** — genera un borrador y lo muestra en un modal donde Gabi puede revisar y ajustar antes de confirmar.

**Flujo del generador mensual:**
1. Toma el mes objetivo.
2. Para cada asociado activo, ve qué capacitaciones le faltan (tipos sin Dictada+Aprobada).
3. Prioriza según la config elegida.
4. Distribuye las capacitaciones a lo largo del mes respetando el máximo semanal.
5. Muestra el borrador en un modal con lista editable.
6. Gabi puede quitar filas, cambiar fechas, cambiar instructores.
7. Gabi confirma → todas las capacitaciones del borrador se crean con `estado = 'Programada'`.

**Botón "📱 Coordinar por WhatsApp"** — visible cuando hay capacitaciones Programadas sin coordinar. Al apretar, dispara mensajes al asociado y supervisor. **Etapa 3 (WhatsApp destrabada).** Por ahora dejar el botón visible con toast "Función disponible cuando WhatsApp esté conectado".

---

## 9. Tab 4 — Repositorio

### 9.1 Qué muestra
Grilla de tarjetas de materiales de capacitación.

### 9.2 Cada tarjeta muestra
- Ícono según tipo (🎥 Video, 📄 PDF, 📊 PowerPoint, 📝 Word, 🔗 Link).
- Nombre del material.
- Badge del tipo.
- Capacitación asociada (si tiene) o "Sin asociación".
- Duración.
- Descripción corta.
- Botones: ▶ Abrir / ✏️ Editar / 🗑️ Eliminar.

### 9.3 Filtros
- Buscador por nombre.
- Filtro por tipo.
- Filtro por capacitación asociada (agregar opción "Sin asociación").

### 9.4 Botón "+ Agregar material"

Abre el modal "Agregar material".

### 9.5 Modal "Agregar / Editar material"

**Campos:**

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Nombre del material * | Texto | Sí | |
| Tipo * | Select (Video / PDF / PowerPoint / Word / Link externo / Archivo subido) | Sí | |
| **Origen** * | Radio button (URL / Archivo) | Sí | Determina si se pide URL o archivo |
| URL / Link | Texto | Sí (si origen = URL) | Validar formato de URL |
| Archivo | File input | Sí (si origen = Archivo) | Sube a Supabase Storage |
| Capacitación asociada | Select (8 tipos + "Sin asociación") | No | Default: Sin asociación |
| Duración estimada | Texto | No | |
| Descripción | Textarea | No | |
| ¿Requiere evaluación posterior? | Select (Sí / No) | No | Default: Sí |

**Guardar:**
1. Validar obligatorios y URL si aplica.
2. Si origen = Archivo, subir a Supabase Storage bucket `materiales_capacitacion`.
3. Guardar registro en tabla `materiales_capacitacion`.
4. Toast: "✅ Material agregado."

### 9.6 Botón "🗑️ Eliminar"
Confirmación → soft delete (`anulado = true`). Toast: "✅ Material eliminado."

**Nota:** eliminar no borra el archivo de Storage físicamente. Queda en Storage por si hace falta recuperarlo. Solo se oculta de la UI.

---

## 10. Tab 5 — Evaluaciones (4 sub-tabs)

### 10.1 Sub-tab 5.1 — Banco de preguntas

**Vista:**
- Vista por tipo de capacitación.
- Al entrar al tab, mostrar un select con los 8 tipos.
- Al elegir uno, listar todas sus preguntas (con enunciado + cuál es la correcta).

**Botones:**
- "+ Agregar pregunta" → modal.
- ✏️ Editar por pregunta.
- 🗑️ Eliminar por pregunta (soft delete).

**Modal "Agregar / Editar pregunta":**

| Campo | Tipo | Obligatorio |
|---|---|---|
| Tipo de capacitación * | Select (8 tipos, prefiltrado por el que estás viendo) | Sí |
| Enunciado * | Textarea | Sí |
| Opción A * | Texto | Sí |
| Opción B * | Texto | Sí |
| Opción C * | Texto | Sí |
| Opción D * | Texto | Sí |
| Respuesta correcta * | Select A/B/C/D | Sí |

Guarda en `preguntas_evaluacion`.

### 10.2 Sub-tab 5.2 — Plantillas de evaluación

**Vista:**
- Grilla con las 8 plantillas (una por tipo).
- Cada plantilla muestra: tipo, cantidad de preguntas incluidas, nota mínima, plazo.
- Botón ✏️ Editar por plantilla.

**Modal "Editar plantilla":**

| Campo | Tipo | Notas |
|---|---|---|
| Tipo de capacitación | Texto readonly | El tipo asociado |
| Preguntas incluidas | Checkboxes desde el banco del tipo | Marcá las que van en esta evaluación |
| Nota mínima para aprobar (%) | Number (0-100) | Default 70 |
| Plazo para responder (horas) | Number | Default 48 |

Guarda en `plantillas_evaluacion`.

**Semilla inicial:** al crear el módulo, generar automáticamente las 8 plantillas (una por tipo) con `preguntas_ids = []`, `nota_minima = 70`, `plazo_horas = 48`. Gabi las va poblando cuando quiera empezar a usar el módulo.

### 10.3 Sub-tab 5.3 — Evaluaciones enviadas

**Tabla:**

| Capacitación | Asociado | Fecha envío | Plazo | Estado | Puntaje | Resultado | Acciones |
|---|---|---|---|---|---|---|---|

**Estados:**
- Enviada (esperando respuesta, no vencida).
- Respondida (con puntaje y resultado calculado).
- Vencida (pasó el plazo sin respuesta).
- Anulada.

**Filtros:**
- Por estado.
- Por tipo de capacitación.
- Por mes de envío.

**Acciones por fila:**
- 👁 Ver detalle (nuevo modal, no más stub).
- 🔄 Reenviar (solo si estado = Vencida).
- ❌ Anular.

**Modal "Ver detalle":**

Muestra:
- Datos de la capacitación (asociado, tipo, fecha).
- Datos de la evaluación (fecha envío, plazo, estado, puntaje).
- Cada pregunta enviada con:
  - Enunciado.
  - Las 4 opciones.
  - Cuál marcó el asociado (destacada).
  - Cuál era la correcta (destacada en verde).
  - Si acertó o no.

### 10.4 Sub-tab 5.4 — No respondieron

**Tabla:**

| Asociado | Servicio | Supervisor | Enviadas | Respondidas | Tasa | Nivel de riesgo |
|---|---|---|---|---|---|---|

**Cálculo:**
- Enviadas = evaluaciones con estado != 'Anulada' del asociado.
- Respondidas = evaluaciones con estado = 'Respondida' del asociado.
- Tasa = Respondidas / Enviadas.

**Nivel de riesgo:**
- Alto: tasa < 50%.
- Medio: tasa 50-79%.
- Bajo: tasa >= 80%.

Muestra top 10 con más "No respondidas".

### 10.5 Flujo completo de una evaluación

**Paso 1 — Envío (desde Registro / Histórico):**
1. En la fila de una capacitación Dictada, aparece botón "📧 Enviar evaluación".
2. Gabi lo aprieta.
3. El sistema:
   - Busca la plantilla del tipo de capacitación.
   - Si la plantilla no tiene preguntas → error: "La plantilla no tiene preguntas configuradas. Cargá preguntas en el sub-tab Banco antes de enviar."
   - Genera un token único (UUID).
   - Crea el registro en `evaluaciones_enviadas` con estado 'Enviada', `fecha_envio = now()`, `fecha_limite = now() + plazo_horas`.
4. Muestra un toast: "✅ Evaluación creada. Copiá el link para enviárselo al asociado:"
5. **Modal con el link:** muestra el link `https://ohlimpia-sistema.netlify.app/evaluacion.html?token=XXXX`. Botón "Copiar link". Gabi lo pega manualmente en WhatsApp del asociado.

**Paso 2 — Respuesta del asociado:**
1. Asociado abre el link en su celular.
2. Ve la página pública `evaluacion.html`.
3. La página llama al Edge Function `responder-evaluacion` con el token para pedir las preguntas.
4. Función valida token, verifica no vencido, devuelve preguntas + opciones (sin la respuesta correcta).
5. Página muestra las preguntas.
6. Asociado responde y aprieta "Enviar respuestas".
7. Página llama al Edge Function `responder-evaluacion` con las respuestas.
8. Función:
   - Valida token de nuevo.
   - Corrige cada respuesta.
   - Calcula puntaje.
   - Compara con `nota_minima` → determina si Aprobó o Desaprobó.
   - Guarda en `respuestas_evaluacion`.
   - Actualiza `evaluaciones_enviadas` con estado = 'Respondida', puntaje, resultado, fecha_respuesta.
   - Actualiza la capacitación asociada con resultado y puntaje.
9. Página muestra al asociado su resultado: "✅ Aprobaste con 8/10 (80%)" o "❌ Desaprobaste con 5/10 (50%)".

**Paso 3 — Sistema chequea vencidas:**
- Cada vez que se abre el módulo, un cron/check simple: buscar evaluaciones con estado 'Enviada' y `fecha_limite < now()` → cambiar estado a 'Vencida'.
- No modificar automáticamente el resultado de la capacitación asociada.

**Paso 4 — Reenvío:**
- Botón "🔄 Reenviar" en fila con estado 'Vencida'.
- Al apretar, genera nueva evaluación (mismo mecanismo del Paso 1), con nueva `fecha_limite`.
- La evaluación vieja queda anulada (`anulado = true`).

---

## 11. Integraciones con otros módulos

### 11.1 Módulo Legajos
Dentro del legajo de un asociado, debe haber un **tab "Capacitaciones"** que muestre:
- Todas sus capacitaciones (todos los estados).
- Con columnas: Fecha, Tipo, Instructor, Estado, Resultado, Puntaje.
- Ordenadas por fecha descendente.

**Cómo lo implementa Fede:** desde el módulo Legajos, hacer un query a `capacitaciones` filtrado por `legajo_id_local`.

### 11.2 Adjuntos
Reusar el helper `src/shared/adjuntos.js` para los adjuntos de capacitaciones. Usar `etapa = 'capacitacion'` (nueva etapa; ver `TIPO_LEGIBLE` en el helper para agregar los tipos correspondientes si hace falta).

### 11.3 Servicios
Consumir `DB.servicios` para autocompletar el campo de servicio del legajo del asociado.

### 11.4 WhatsApp (a futuro)
Cuando Meta esté destrabado, dos integraciones:
- **Coordinación:** botón "📱 Coordinar por WhatsApp" en Calendario dispara mensaje al asociado y supervisor.
- **Envío de evaluaciones:** en vez de que Gabi copie manualmente el link, el sistema lo manda directo por WhatsApp al asociado.

Esto lo definís cuando WhatsApp esté disponible.

---

## 12. Etapas de implementación

Fede tiene mucho trabajo. Priorizar así:

### Etapa 1 — Base persistente (imprescindible)
- Aplicar SQL `v013_capacitaciones.sql` en Supabase.
- Actualizar mapeo en `src/shared/supabase.js`.
- Crear estructura de directorio `src/modules/capacitaciones/`.
- Implementar Tab 1 (Registro) completo con persistencia real.
- Implementar Tab 4 (Repositorio) completo con persistencia real.
- Implementar modal de Editar y Dictar.
- Integrar con Legajos (tab de historial dentro del legajo).

**Al terminar Etapa 1:** Gabi puede agendar, dictar, editar, anular capacitaciones. Cargar materiales. Ver el historial en el legajo.

### Etapa 2 — Analítica y calendario
- Implementar Tab 2 (Estadísticas) completo.
- Implementar Tab 3 (Calendario) con vista y click para agendar.
- Implementar botón "Generar plan mensual" con revisión.
- Implementar botón "Exportar a Excel" con SheetJS.

**Al terminar Etapa 2:** Gabi tiene análisis completo y planificación mensual.

### Etapa 3 — Evaluaciones
- Implementar Tab 5 con los 4 sub-tabs.
- Implementar página pública `evaluacion.html`.
- Implementar Edge Function `responder-evaluacion`.
- Botón "Enviar evaluación" con generación de token.

**Al terminar Etapa 3:** sistema de evaluaciones automáticas funcional (con link manual, sin WhatsApp aún).

### Etapa 4 — WhatsApp (espera destrabar Meta)
- Integrar botón "Coordinar por WhatsApp" con envío real.
- Integrar envío automático del link de evaluación por WhatsApp.

---

## 13. Casos borde y validaciones

Lista de casos borde para tener en cuenta durante la implementación:

### 13.1 Agenda
- Fecha en el pasado → validar y rechazar con mensaje claro.
- Asociado no encontrado en `DB.legajos` → validar y rechazar.
- Asociado con estado != 'Activo' → validar y rechazar con mensaje "El asociado no está activo, no se le puede agendar capacitación."

### 13.2 Duplicados
- **Alerta soft** (no bloqueante) si se agenda una capacitación del mismo tipo para el mismo asociado que ya tiene Aprobada. Mostrar toast: "ℹ️ Ya tiene aprobada Cooperativismo. ¿Confirmás igual?".
- Modal de confirmación. Si Gabi confirma → se agenda igual (puede ser una revalidación o formación adicional).

### 13.3 Anulación de una capacitación con evaluación enviada
- Si se anula una capacitación que tenía evaluación pendiente → también anular la evaluación (setear `anulado = true` en `evaluaciones_enviadas`).
- Toast: "✅ Capacitación cancelada. La evaluación asociada también fue anulada."

### 13.4 Edición de tipo en capacitación con evaluación enviada
- Si se cambia el tipo de una capacitación que ya tenía evaluación enviada → advertir: "⚠️ Esta capacitación ya tenía evaluación enviada. Si cambiás el tipo, la evaluación quedará huérfana. ¿Continuar?"
- Si Gabi confirma → anular la evaluación vieja.

### 13.5 Plantilla sin preguntas
- Al enviar evaluación, si la plantilla del tipo no tiene preguntas configuradas → error: "La plantilla no tiene preguntas configuradas. Cargalas primero en el sub-tab Banco."

### 13.6 Token repetido o inválido
- La página `evaluacion.html` debe manejar 3 casos:
  - Token válido y evaluación no vencida → muestra preguntas.
  - Token válido pero evaluación vencida → muestra "❌ Esta evaluación venció el DD/MM/YYYY. Contactá a RRHH."
  - Token inválido / no existe → muestra "❌ Link inválido. Verificá con RRHH."
  - Token válido pero evaluación ya respondida → muestra "❌ Esta evaluación ya fue respondida. Resultado: {Aprobado/Desaprobado}."

### 13.7 Material vinculado eliminado
- Si un material se elimina (soft delete) pero fue usado en capacitaciones dictadas → no se rompe nada. En el detalle de la capacitación se puede mostrar "(material eliminado)" en lugar del nombre.

### 13.8 Legajo eliminado
- Si el asociado se da de baja (legajo con estado 'Baja') → sus capacitaciones no se borran ni ocultan. Se mantienen en el historial del legajo.
- El listado del Tab 1 solo muestra capacitaciones de asociados con estado 'Activo'.

---

## 14. Convenciones del proyecto que debe respetar

### 14.1 Del código
- **Nombres en español:** funciones, variables, tablas. Ejemplo: `agendarCapacitacion`, no `scheduleTraining`.
- **camelCase en el frontend, snake_case en Supabase.** Ya lo maneja `_toCamel` / `_toSnake` en `src/shared/supabase.js`.
- **Un commit por cambio lógico**, mensaje en español descriptivo. Ejemplos:
  - `feat(capacitaciones): crear estructura del modulo migrado`
  - `feat(capacitaciones): implementar Tab Registro con persistencia`
  - `fix(capacitaciones): corregir filtro por tipo que no filtraba pendientes`

### 14.2 De la base de datos
- **Nunca modificar SQL versionado viejo.** Si hay que ajustar el schema, crear un `vNNN` nuevo.
- **Soft delete siempre** con `anulado boolean DEFAULT false`. Filtrar por `NOT anulado` en las queries de listado.

### 14.3 De la UI
- **Toasts para feedback** de acciones importantes. Formato: emoji + texto corto.
- **Loading indicators** si una operación tarda más de 1 segundo.
- **Confirmaciones** para acciones destructivas (anular, eliminar).

### 14.4 Del diseño
- **Cambios que estén acá pueden implementarse sin consultar.**
- **Cambios que no estén acá deben consultarse con Lautaro antes de implementar.** Si Fede detecta un caso borde no cubierto, pregunta antes.
- **Si algo está ambiguo:** interpretación conservadora que respete la política del proyecto (soft delete, coherencia con módulos existentes, simplicidad sobre sofisticación).

### 14.5 De testing
- No hay tests automatizados en el proyecto. Fede debe probar manualmente:
  - Cargar 3 capacitaciones distintas (una programada, una dictada, una anulada).
  - Editar una y verificar que se guarda.
  - Ver que el tab Estadísticas calcule bien.
  - Ver que el tab Calendario muestre lo mismo que Registro.
  - Cargar un material URL y un material archivo.
  - Cargar 5 preguntas en el banco de un tipo.
  - Configurar una plantilla con 3 de esas preguntas.
  - Enviar evaluación → copiar link → abrir en incógnito → responder → verificar que se corrige y se registra.

---

## 15. Preguntas frecuentes anticipadas

**¿Puedo usar TypeScript?**
No para este módulo. El proyecto usa JavaScript vanilla. Mantener consistencia.

**¿Puedo agregar un framework como React o Vue?**
No para este módulo. El proyecto usa vanilla JS con módulos ES + `window` bindings. Mantener consistencia con el resto.

**¿Puedo usar librerías npm?**
Sí, pero conservador. La única librería nueva justificada es **SheetJS (xlsx)** para exportar Excel. Cualquier otra, consultar con Lautaro.

**¿Puedo tocar `src/legacy.js`?**
No. Dejar la versión vieja intacta como referencia. Cuando el módulo migrado esté funcionando, se remueve la referencia del menú.

**¿Puedo modificar `src/shared/supabase.js` o `src/shared/adjuntos.js`?**
Solo agregar los mapeos nuevos. NO tocar la lógica existente.

**¿Cómo pruebo si Supabase está funcionando?**
Cargar la app en localhost:5173. Si aparece un toast "⚠️ Modo offline", Supabase está pausado. Ir al dashboard de Supabase → "Resume project".

**¿Dónde encuentro las credenciales de Supabase?**
Hardcoded en `src/shared/supabase.js`. No hay `.env` por ahora (es una deuda técnica del proyecto).

**¿Qué hago con dudas de negocio no cubiertas acá?**
Consultar con Lautaro. Este documento es la base, pero puede haber casos que no anticipamos.

---

## 16. Cierre

Este documento es la base para implementar el módulo Capacitaciones. Fue construido a partir de:

1. Inventario técnico del módulo actual en `legacy.js` (ver `docs/INVENTARIO_capacitaciones_legacy.md`).
2. Sesión de diseño con Lautaro sobre cada tab y decisión funcional.
3. Alineación con las políticas del proyecto (`POLITICAS_PROYECTO.md`) y las convenciones aprendidas (`CLAUDE.md`).

Con este documento, Fede tiene todo lo necesario para arrancar sin bloqueos. Ante cualquier duda de diseño no cubierta: **preguntar antes de codear**, siguiendo la política A.4 (diagnóstico antes de cambios).

**¡Buenas capacitaciones!** 🎓
