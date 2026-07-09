# Diseño del módulo Competencia Anual — Especificación para implementación

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Competencia Anual
**Autor del diseño:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-08
**Versión:** 1.0

---

## Cómo usar este documento

Este documento es la **fuente de verdad** para implementar el módulo Competencia Anual. Está pensado para que se pueda programar **sin necesidad de volver a preguntar** por decisiones de diseño.

**Antes de escribir cualquier código:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, y el inventario técnico (`docs/INVENTARIO_competencia_anual_legacy.md`).

---

## 1. Contexto del módulo

### 1.1 Qué es Competencia Anual

Es un **sistema de gamificación** con puntos que reconoce el compromiso y el desempeño de los asociados en su trabajo diario. Rankea individuos, equipos (por servicio) y supervisores durante un año calendario, con premios reales al cierre.

**Doble propósito:**
1. **Reconocer y premiar** a los asociados más comprometidos (motivador positivo).
2. **Detectar a los no comprometidos** para intervenir tempranamente antes de que se conviertan en problemas mayores. Este segundo propósito es tan importante como el primero.

### 1.2 Lo que NO es

- No es una evaluación de desempeño formal (para eso están los procesos de RRHH).
- No es un ranking técnico de habilidades.
- No reemplaza el proceso disciplinario.
- No sanciona automáticamente por bajos puntajes.

### 1.3 Dueño del proceso

**RRHH (Gabriela Lucero — Coordinadora RRHH)** es dueña del proceso:
- Define y modifica las reglas del juego.
- Modifica los puntajes.
- Cierra el año y declara ganadores.
- Toma decisiones sobre intervenciones con no-participantes.

**Operaciones y Supervisores** consultan el ranking y gestionan las notificaciones a sus equipos.

**Administrador total** tiene acceso completo.

### 1.4 Contexto de negocio

**Es un sistema nuevo** que se implementa junto con el módulo. NO hay política escrita previa — la política se está construyendo con este diseño. Aprovechamos esto para dejar todo bien reglado desde el inicio.

**Premios reales:** al cierre del año se otorgan premios materiales (definidos por RRHH por fuera del sistema). El sistema declara ganadores; la entrega se gestiona aparte.

**Duración:** año calendario (1 de enero a 31 de diciembre).

**Todo debe estar documentado:** cada movimiento de puntos tiene registro auditable de quién lo generó, cuándo, por qué, y puede ser revertido con motivo.

### 1.5 Estado actual (antes de esta implementación)

Ver `docs/INVENTARIO_competencia_anual_legacy.md` para el detalle técnico. Resumen ejecutivo del hallazgo:

**El módulo actual es una maqueta visual con problemas críticos:**

1. **Todo se recalcula, nada persiste.** No hay `DB.competencia` ni tablas en Supabase. El ranking se genera en cada render.
2. **Las reglas editables están desconectadas del cálculo.** El modal permite editar puntajes pero el cálculo usa constantes hardcodeadas (20/10/5/25/15). Cambiar reglas no mueve el ranking.
3. **Buena parte del puntaje es demo determinístico.** Evaluaciones, correctas y felicitaciones salen de una fórmula `seed = (nro*7+13) % 100`, no de datos reales.
4. **Cero conexión con módulos que deberían alimentarlo.** Sanciones y Comercial (felicitaciones) no están cableados.
5. **Bugs de UI:** botón "Reglas del torneo" del header apunta a modal inexistente. Panel de puntajes, ranking público y tabla supervisores tienen contenedores vacíos.

**Buena noticia:** no hay usuarios reales usándolo hoy (es algo nuevo que estamos implementando). Podemos aplicar política A.11 (rehacer sobre parchar) sin preocuparnos por compatibilidad.

### 1.6 Objetivo de esta implementación

**Rediseñar el módulo completo desde cero** en `src/modules/competencia/`. Debe:

1. **Persistir todo en Supabase** con modelo de datos rico.
2. **Motor de puntos basado en movimientos** — cada suma/resta es un registro auditable e reversible.
3. **Reglas parametrizables con vigencia temporal** — cambiar una regla no altera puntos históricos.
4. **Cascadas** — una regla puede afectar operario + servicio + supervisor simultáneamente.
5. **Integrarse con Capacitaciones** desde el arranque.
6. **Preparar infraestructura** para futuras integraciones con Sanciones, Comercial y Reasignaciones.
7. **Priorizar el tab "No participan"** como corazón funcional del módulo.
8. **Trackear reasignaciones** (los puntos quedan en el servicio donde se generaron).
9. **Cerrar el año manualmente** con archivo histórico.


---

## 2. Alcance de la implementación

### 2.1 Qué incluye

- Tablas `reglas_competencia`, `reglas_competencia_versiones`, `movimientos_puntos`, `eventos_puntos`, `premios_competencia_anual`, `notificaciones_no_participan` en Supabase.
- Módulo migrado en `src/modules/competencia/`.
- 7 tabs: Ranking individual, Ranking por servicio, Ranking por supervisor, No participan, Historial de movimientos, Reglas del torneo, Premios.
- Motor de puntos con movimientos vigentes y revertidos.
- Reglas parametrizables con versiones y vigencia temporal.
- 9 reglas iniciales con cascadas configuradas (ver §4.5).
- Integración con Capacitaciones desde el arranque.
- Tab "No participan" con niveles de riesgo y sistema de notificaciones.
- Cálculo por promedio con corrección por participación (para servicios y supervisores).
- Cierre manual de año con archivo histórico.
- Reversión de movimientos (individuales o en cadena por evento).
- Selector de año para consultar históricos.
- Premios: top 3 individual + top 3 por servicio.

### 2.2 Qué NO incluye (etapas futuras)

- Notificaciones automáticas por WhatsApp (espera Meta destrabada).
- Ranking público (URL abierta) — solo interno por ahora.
- Comando `!ranking` en bot WhatsApp para consulta de asociados.
- Integración con módulo Sanciones (existe la regla, la carga es manual hasta que Sanciones migre).
- Integración con módulo Comercial (existe la regla de "Felicitación de cliente" con carga manual por ahora).
- Integración con módulo Reasignaciones (la infraestructura del `servicio_al_momento` está lista; el hook desde Reasignaciones se agrega cuando Reasignaciones migre).
- Administrativos participando del torneo (por ahora quedan afuera).
- Ranking por categorías de tamaño (por ahora todos los servicios compiten en la misma tabla con la corrección por participación).

---

## 3. Decisiones tomadas

### 3.1 Rediseño completo
No se parcha el legacy. Se implementa desde cero en `src/modules/competencia/`. El legacy queda como referencia hasta que el nuevo esté funcionando.

### 3.2 Motor de puntos basado en movimientos
Cada operación de suma/resta genera un registro en `movimientos_puntos` con:
- Fecha del movimiento y fecha del evento original.
- Asociado destinatario.
- Servicio y supervisor al momento (`servicio_al_momento`, `supervisor_al_momento`).
- Regla aplicada + versión de la regla.
- Puntos congelados (según versión vigente al momento).
- Origen (módulo o "Manual").
- Referencia al evento original (opcional, ID del pedido/felicitación/sanción).
- `evento_id` para agrupar cascadas.
- Estado: Vigente / Revertido.
- Auditoría (quién lo generó, cuándo, quién lo revirtió, motivo).

El ranking se calcula sumando movimientos vigentes.

### 3.3 Cascadas con múltiples movimientos
Cuando una regla afecta a múltiples destinatarios (operario + servicio + supervisor), el sistema genera N movimientos separados con el mismo `evento_id`. Cada movimiento tiene su propia trazabilidad y puede revertirse individualmente o en cadena.

### 3.4 Reglas parametrizables con vigencia temporal
- Tabla `reglas_competencia` (catálogo maestro).
- Tabla `reglas_competencia_versiones` (versiones históricas de cada regla).
- Cuando RRHH modifica un puntaje, se crea nueva versión con `vigencia_desde` y la anterior queda con `vigencia_hasta`.
- Los movimientos guardan la referencia a la versión que se aplicó (`regla_version_id_local`).
- Cambiar una regla NO recalcula puntos históricos.

### 3.5 Origen por regla
Cada regla tiene un flag "origen":
- **Automático:** disparado por otro módulo (Capacitaciones dispara "Capacitación presencial").
- **Manual:** solo carga manual por RRHH (o Comercial en el futuro).
- **Ambas:** puede dispararse automáticamente y también cargarse manualmente.

### 3.6 Año calendario (1/ene - 31/dic)
El torneo dura exactamente un año calendario. Al terminar diciembre, RRHH cierra manualmente el año y arranca el siguiente.

### 3.7 Cierre manual con confirmación
Al arrancar enero, banner en el módulo: "El año YYYY-1 está listo para cerrarse. Verificá que los datos estén correctos antes de confirmar."
RRHH confirma el cierre → el sistema:
- Congela el top 3 individual y el top 3 por servicio.
- Guarda los ganadores en `premios_competencia_anual`.
- Marca el año como Cerrado.

### 3.8 Movimientos atrasados de año cerrado impactan en año nuevo
Si aparece una felicitación de diciembre en enero y el año anterior ya se cerró → el movimiento se aplica al año nuevo. No se recalcula el histórico.

**Consecuencia clara documentada:** RRHH tiene que ser cuidadoso al cerrar el año. Si tenía dudas de eventos pendientes, debe esperar antes de cerrar.

### 3.9 Empates comparten puesto
Si dos personas empatan en 1°, ambas se llevan 1° y no hay 2° (el siguiente es 3°). Regla de desempate configurable para diferencias mínimas antes del empate total.

### 3.10 Reversión de movimientos
Cualquier movimiento (manual o automático) puede revertirse. Al revertir uno de cascada, se pregunta:
- ¿Revertir solo este movimiento?
- ¿Revertir todo el evento (todos los movimientos con el mismo `evento_id`)?

Motivo obligatorio en cualquier caso.

### 3.11 Sanciones — infraestructura preparada
La regla "Sanción disciplinaria" existe desde el arranque. RRHH puede cargarla manualmente. Cuando el módulo Sanciones migre, se conecta el hook automático.

### 3.12 Administrativos — afuera del torneo
Los administrativos NO participan del ranking individual ni por servicio. En el sistema aparecen con badge "Fuera de competencia".

### 3.13 Visibilidad interna
Ranking accesible solo dentro del sistema (RRHH, Operaciones, Admin, Supervisores). Sin URL pública. A futuro se agregará comando `!ranking` en bot WhatsApp para asociados.

### 3.14 Puntos siguen al servicio donde se generaron
Cuando un operario se reasigna de servicio A al servicio B, sus puntos del período en A quedan sumando al servicio A. Los movimientos nuevos en B suman al servicio B. Se implementa con el campo `servicio_al_momento` en cada movimiento.

### 3.15 Ranking por servicio con corrección de participación
Para no favorecer a servicios chicos con alta participación ni a servicios grandes con baja participación:
- `Puntaje del servicio = (suma de puntos individuales del servicio / cantidad de miembros) * (% participación del servicio)`.
- Mismo cálculo para supervisores.

### 3.16 Tab "No participan" con 4 niveles de riesgo

Corazón funcional del módulo. Muestra asociados con baja participación segmentados por nivel de riesgo:

| Nivel | Criterio | Color | Aparece por default |
|---|---|---|---|
| Muy alto | 0% de participación | 🔴 | Sí |
| Alto | Menos de 30% de participación | 🟠 | Sí |
| Medio | Entre 30% y 60% de participación | 🟡 | Sí |
| Bajo | Más de 60% | 🟢 | No (solo con filtro) |

**Notificaciones:**
- **Automático:** el sistema detecta y clasifica en cada render + en un chequeo diario.
- **Notificación al asociado:** manual (botón "Notificar por WhatsApp" en la fila).
- **Notificación al supervisor:** automática cuando un miembro pasa a riesgo Alto o Muy alto. Aparece en su bandeja.
- **Notificación a compañeros del servicio:** manual (botón "Notificar al equipo"). Genera presión social positiva.

### 3.17 9 reglas iniciales con cascadas

Ver §4.5 para el detalle completo.


---

## 4. Modelo de datos

### 4.1 Convenciones
- `id bigserial PK`, `id_local text UNIQUE NOT NULL`, `created_at`, `updated_at`, `anulado boolean DEFAULT false`.
- Snake_case en DB, camelCase en frontend.
- Referencias por `id_local`.
- Timestamps como `timestamptz`.

### 4.2 SQL versionado

Crear `sql/v018_competencia_anual.sql` (o el número que corresponda según el estado del repo):

```sql
-- v018 — Módulo Competencia Anual
-- Crea 6 tablas: reglas, versiones de reglas, movimientos, eventos,
-- premios anuales, notificaciones de no participantes.
BEGIN;

-- Tabla 1 — reglas_competencia (catálogo maestro de reglas del juego)
CREATE TABLE public.reglas_competencia (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  nombre                 text NOT NULL,
  descripcion            text,
  origen                 text NOT NULL,        -- Automático / Manual / Ambas
  modulo_origen          text,                 -- Capacitaciones / Comercial / Sanciones / null si solo Manual
  activa                 boolean NOT NULL DEFAULT true,
  destaca                boolean NOT NULL DEFAULT false,  -- ⭐ visual
  orden                  integer NOT NULL DEFAULT 0,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reglas_activa ON public.reglas_competencia(activa) WHERE NOT anulado;

-- Tabla 2 — reglas_competencia_versiones (historial de puntajes por regla)
-- Cada vez que cambian los puntajes de una regla, se crea nueva versión.
-- Los movimientos históricos guardan referencia a la versión que se aplicó.
CREATE TABLE public.reglas_competencia_versiones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  regla_id_local         text NOT NULL,
  
  -- Puntajes por destinatario (cascada)
  puntos_individual      integer NOT NULL,     -- puntos al operario que dispara la regla
  puntos_por_companero   integer NOT NULL DEFAULT 0,  -- puntos a cada compañero del mismo servicio
  puntos_supervisor      integer NOT NULL DEFAULT 0,  -- puntos al supervisor del servicio
  
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,                 -- NULL = vigente
  
  cargada_por            text NOT NULL,
  motivo_carga           text,                 -- "Configuración inicial" / "Ajuste anual" / "Corrección" / etc.
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rcv_regla    ON public.reglas_competencia_versiones(regla_id_local) WHERE NOT anulado;
CREATE INDEX idx_rcv_vigencia ON public.reglas_competencia_versiones(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- Tabla 3 — eventos_puntos (agrupa cascadas por evento único)
-- Cada evento del mundo real (una capacitación aprobada, una felicitación, una sanción)
-- genera 1 evento_id que agrupa todos los movimientos derivados.
CREATE TABLE public.eventos_puntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  regla_id_local         text NOT NULL,        -- qué regla se aplicó
  regla_version_id_local text NOT NULL,        -- qué versión de la regla se usó
  
  operario_id_local      text NOT NULL,        -- el operario "protagonista" del evento
  nombre_operario        text NOT NULL,
  servicio_al_momento    text NOT NULL,
  supervisor_al_momento  text NOT NULL,
  
  fecha_evento           timestamptz NOT NULL, -- cuándo ocurrió en el mundo real
  origen                 text NOT NULL,        -- Automático / Manual
  modulo_origen          text,                 -- Capacitaciones / Comercial / etc.
  referencia_externa     text,                 -- id_local del pedido/felicitación/sanción originante
  observaciones          text,
  
  cargado_por            text NOT NULL,
  
  -- Reversión
  revertido              boolean NOT NULL DEFAULT false,
  fecha_reversion        timestamptz,
  revertido_por          text,
  motivo_reversion       text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ep_regla    ON public.eventos_puntos(regla_id_local) WHERE NOT anulado;
CREATE INDEX idx_ep_operario ON public.eventos_puntos(operario_id_local) WHERE NOT anulado;
CREATE INDEX idx_ep_fecha    ON public.eventos_puntos(fecha_evento) WHERE NOT anulado;

-- Tabla 4 — movimientos_puntos (cada suma/resta individual)
-- Un evento genera N movimientos (1 por cada destinatario de la cascada).
CREATE TABLE public.movimientos_puntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  evento_id_local        text NOT NULL,        -- ref a eventos_puntos
  regla_id_local         text NOT NULL,
  regla_version_id_local text NOT NULL,        -- versión que se aplicó
  
  -- Destinatario del movimiento
  destinatario_id_local  text NOT NULL,        -- ref al legajo destinatario
  nombre_destinatario    text NOT NULL,
  tipo_destinatario      text NOT NULL,        -- Operario / Compañero / Supervisor
  
  -- Servicio y supervisor al momento (para reasignaciones)
  servicio_al_momento    text NOT NULL,
  supervisor_al_momento  text NOT NULL,
  
  puntos_congelados      integer NOT NULL,     -- puntos aplicados en este movimiento (positivo o negativo)
  
  fecha_movimiento       timestamptz NOT NULL DEFAULT now(),
  fecha_evento           timestamptz NOT NULL, -- fecha del evento real, define el año que impacta
  anio_competencia       integer NOT NULL,     -- año al que aporta este movimiento (calculado de fecha_evento vs cierres)
  
  estado                 text NOT NULL DEFAULT 'Vigente',  -- Vigente / Revertido
  
  fecha_reversion        timestamptz,
  revertido_por          text,
  motivo_reversion       text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mp_evento      ON public.movimientos_puntos(evento_id_local) WHERE NOT anulado;
CREATE INDEX idx_mp_destinat    ON public.movimientos_puntos(destinatario_id_local) WHERE NOT anulado;
CREATE INDEX idx_mp_servicio    ON public.movimientos_puntos(servicio_al_momento) WHERE NOT anulado;
CREATE INDEX idx_mp_anio        ON public.movimientos_puntos(anio_competencia) WHERE NOT anulado;
CREATE INDEX idx_mp_estado_anio ON public.movimientos_puntos(estado, anio_competencia) WHERE NOT anulado;

-- Tabla 5 — premios_competencia_anual (histórico de ganadores)
CREATE TABLE public.premios_competencia_anual (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  anio                   integer NOT NULL,
  categoria              text NOT NULL,        -- Individual / Servicio
  puesto                 integer NOT NULL,     -- 1, 2, 3
  
  ganador_id_local       text NOT NULL,        -- ref al legajo o al servicio
  nombre_ganador         text NOT NULL,        -- desnormalizado
  puntos_finales         integer NOT NULL,
  
  compartido_con         text,                 -- lista de nombres si hay empate: "Fulano y Sultana"
  
  -- Gestión de entrega (por RRHH)
  entregado              boolean NOT NULL DEFAULT false,
  fecha_entrega          date,
  entregado_por          text,
  observaciones          text,
  descripcion_premio     text,                 -- lo que se entregó (definido por RRHH)
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pca_anio      ON public.premios_competencia_anual(anio) WHERE NOT anulado;
CREATE INDEX idx_pca_categoria ON public.premios_competencia_anual(anio, categoria, puesto) WHERE NOT anulado;

-- Tabla 6 — notificaciones_no_participan (registro de notificaciones enviadas)
-- Para tracking de qué notificaciones se enviaron a quién y cuándo.
CREATE TABLE public.notificaciones_no_participan (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  operario_id_local      text NOT NULL,        -- al que se refiere la notificación
  nivel_riesgo           text NOT NULL,        -- Muy alto / Alto / Medio
  
  destinatario_tipo      text NOT NULL,        -- Asociado / Supervisor / CompanerosServicio
  destinatario_id_local  text,                 -- ref al legajo del destinatario (null si es grupo)
  
  canal                  text NOT NULL,        -- Sistema / WhatsApp / Email
  origen                 text NOT NULL,        -- Automatico / Manual
  mensaje                text,                 -- contenido enviado
  
  fecha_enviado          timestamptz NOT NULL DEFAULT now(),
  enviado_por            text NOT NULL,        -- Sistema o usuario que gatilló
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nnp_operario ON public.notificaciones_no_participan(operario_id_local) WHERE NOT anulado;
CREATE INDEX idx_nnp_fecha    ON public.notificaciones_no_participan(fecha_enviado) WHERE NOT anulado;

-- Tabla 7 — anios_competencia (control de años abiertos/cerrados)
CREATE TABLE public.anios_competencia (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  anio                   integer UNIQUE NOT NULL,
  estado                 text NOT NULL DEFAULT 'Abierto',   -- Abierto / Cerrado
  
  fecha_cierre           timestamptz,
  cerrado_por            text,
  observaciones_cierre   text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMIT;
```

### 4.3 Mapeo en `src/shared/supabase.js`

```javascript
reglasCompetencia:              'reglas_competencia',
reglasCompetenciaVersiones:     'reglas_competencia_versiones',
eventosPuntos:                  'eventos_puntos',
movimientosPuntos:              'movimientos_puntos',
premiosCompetenciaAnual:        'premios_competencia_anual',
notificacionesNoParticipan:     'notificaciones_no_participan',
aniosCompetencia:               'anios_competencia',
```

### 4.4 Catálogos hardcoded

```javascript
const ORIGENES_REGLA = ['Automático', 'Manual', 'Ambas'];
const MODULOS_ORIGEN = ['Capacitaciones', 'Comercial', 'Sanciones', 'Reasignaciones'];
const TIPOS_DESTINATARIO = ['Operario', 'Compañero', 'Supervisor'];
const NIVELES_RIESGO = ['Muy alto', 'Alto', 'Medio', 'Bajo'];
const CATEGORIAS_PREMIO = ['Individual', 'Servicio'];
const ESTADOS_MOVIMIENTO = ['Vigente', 'Revertido'];
const ESTADOS_ANIO = ['Abierto', 'Cerrado'];
```

### 4.5 Reglas iniciales del catálogo (seed)

Al aplicar el SQL, insertar estas 9 reglas iniciales:

| Nombre | Origen | Módulo | Individual | Compañero | Supervisor | Destaca |
|---|---|---|---|---|---|---|
| Responder una evaluación | Automático | Capacitaciones | +10 | 0 | 0 | No |
| Respuesta correcta por pregunta | Automático | Capacitaciones | +5 | 0 | 0 | No |
| Capacitación presencial en oficina | Automático | Capacitaciones | +20 | 0 | 0 | ⭐ Sí |
| Capacitación en servicio | Automático | Capacitaciones | +10 | 0 | 0 | No |
| Capacitación vía video con evaluación | Automático | Capacitaciones | +8 | 0 | 0 | No |
| Participación en equipo | Automático | Capacitaciones | +15 | +15 | +10 | ⭐ Sí |
| Capacitación por Meet/Virtual | Automático | Capacitaciones | +12 | 0 | 0 | No |
| No participar en evaluación | Automático | Capacitaciones | -10 | -3 | -5 | No |
| Felicitación de cliente | Ambas | Comercial | +25 | +5 | +10 | ⭐ Sí |

Regla adicional a agregar en la etapa 2 (con módulo Sanciones):

| Sanción disciplinaria | Ambas | Sanciones | -20 | 0 | -5 | No |


---

## 5. Estructura del módulo

```
src/modules/competencia/
├── index.js              — Re-exports y bindings al window
├── competencia.js        — Lógica principal (renders, filtros)
├── ranking.js            — Cálculos de rankings (individual, servicio, supervisor)
├── movimientos.js        — Motor de movimientos (generar, revertir, cascadas)
├── reglas.js             — Gestión de reglas y versiones
├── no_participan.js      — Lógica del tab crítico
├── cierre_anual.js       — Cierre de año y gestión de premios
└── permisos.js           — Wrappers sobre permisos globales (o mock)
```

El HTML se crea desde cero (el legacy tiene bugs conocidos y varios contenedores vacíos).

---

## 6. Tab 1 — Ranking individual

### 6.1 Qué muestra
Ranking de asociados por puntos totales del año en curso (o del año seleccionado).

Los administrativos NO aparecen en este tab (están fuera del torneo).

### 6.2 Columnas

| # | Columna | Notas |
|---|---|---|
| 1 | Puesto | Medalla 🥇🥈🥉 o número. Si empate, mismo puesto compartido |
| 2 | Asociado | Nombre + Nº socio + avatar |
| 3 | Servicio actual | Chip (informativo — los puntos históricos pueden venir de otros) |
| 4 | Supervisor actual | Chip |
| 5 | Pts. capacitaciones | Subtotal por tipo de capacitación |
| 6 | Pts. evaluaciones | Suma de responder + correctas |
| 7 | Pts. felicitaciones | |
| 8 | Pts. cascadas recibidas | Suma que recibió como compañero o supervisor de otros |
| 9 | Pts. negativos | Suma de todos los negativos (rojo) |
| 10 | Total del año | Barra de progreso relativa al líder |
| 11 | Tendencia | ↑ / → / ↓ según movimientos últimos 30 días |
| 12 | Acciones | Ver detalle / Ver historial de movimientos |

### 6.3 Filtros
- Buscador por nombre.
- Selector de año (default: año actual).
- Filtro por servicio.
- Filtro por supervisor.
- Filtro "solo participantes" / "todos".

### 6.4 Acciones
- 👁 **Ver detalle** → modal con desglose completo de movimientos del asociado en el año.
- 📊 **Historial completo** → va al Tab 5 filtrado por ese asociado.

### 6.5 Top 3 destacados
Los primeros 3 puestos tienen fondo especial (oro/plata/bronce) y el podio arriba con las 3 caras.

---

## 7. Tab 2 — Ranking por servicio

### 7.1 Qué muestra
Ranking de servicios (equipos) por puntaje corregido.

**Fórmula:** `Puntaje del servicio = (suma de puntos de miembros / cantidad de miembros) * (% participación del servicio)`.

### 7.2 Columnas

| # | Columna | Notas |
|---|---|---|
| 1 | Puesto | Con medalla |
| 2 | Servicio | Nombre del cliente + primeros 3 miembros |
| 3 | Miembros totales | |
| 4 | Miembros participantes | Los que sumaron algo en el año |
| 5 | % Participación | Barra visual |
| 6 | Suma total puntos | |
| 7 | Promedio base | Suma / miembros |
| 8 | Corrección | % participación aplicado |
| 9 | Puntaje corregido | Fórmula final |
| 10 | Supervisor asignado | Chip |
| 11 | No participantes | Badge con número (click abre lista) |
| 12 | Acciones | Ver detalle |

### 7.3 Filtros
- Buscador por nombre de servicio.
- Selector de año.
- Solo servicios activos (default) / todos.

### 7.4 Nota importante sobre reasignaciones
El puntaje del servicio suma **los movimientos generados mientras cada operario estaba en ese servicio**. Si Juan pasó del servicio A al servicio B, los puntos que Juan generó en A siguen sumando al servicio A. Los que genera desde el momento en B suman a B.

Esto se logra por el campo `servicio_al_momento` en cada movimiento.

---

## 8. Tab 3 — Ranking por supervisor

### 8.1 Qué muestra
Ranking de supervisores por puntaje corregido.

**Fórmula:** igual que servicios, pero agregando por supervisor.

### 8.2 Columnas

| # | Columna |
|---|---|
| 1 | Puesto |
| 2 | Supervisor (nombre + avatar) |
| 3 | Personas a cargo |
| 4 | Servicios distintos que supervisa |
| 5 | % Participación del equipo total |
| 6 | Suma total puntos |
| 7 | Promedio base |
| 8 | Corrección |
| 9 | Puntaje corregido |
| 10 | No participantes en su equipo (lista scrolleable) |
| 11 | Acciones |

### 8.3 Filtros
- Buscador por nombre de supervisor.
- Selector de año.

### 8.4 Nota importante sobre reasignaciones
Cuando un operario cambia de servicio y también cambia de supervisor, los puntos históricos siguen en el supervisor que estaba al momento del movimiento (usando `supervisor_al_momento`).

---

## 9. Tab 4 — No participan (corazón del módulo)

### 9.1 Qué muestra
Lista de asociados con baja participación en el año en curso, segmentados por nivel de riesgo.

**Es el tab más importante del módulo desde la perspectiva de gestión.**

### 9.2 Niveles de riesgo

| Nivel | Criterio | Aparece por default |
|---|---|---|
| 🔴 Muy alto | 0% de participación (0 puntos positivos en el año) | Sí |
| 🟠 Alto | Menos de 30% de participación | Sí |
| 🟡 Medio | Entre 30% y 60% | Sí |
| 🟢 Bajo | Más de 60% | No (solo con filtro) |

**Cálculo del % de participación:**
```
% Participación = (evaluaciones respondidas + capacitaciones completadas) / (evaluaciones enviadas + capacitaciones asignadas) * 100
```

Si el asociado no tenía nada asignado en el año, se considera 0% (aparece en Muy alto).

### 9.3 Columnas

| # | Columna | Notas |
|---|---|---|
| 1 | Asociado | Nombre + Nº socio + antigüedad |
| 2 | Servicio | |
| 3 | Supervisor | |
| 4 | Evaluaciones asignadas / respondidas | X / Y |
| 5 | Capacitaciones asignadas / completadas | X / Y |
| 6 | Puntos positivos | (indicador de compromiso) |
| 7 | Puntos negativos | (movimientos de "no participar") |
| 8 | % Participación | Barra visual |
| 9 | Nivel de riesgo | Badge de color |
| 10 | Días sin actividad | Desde el último movimiento positivo |
| 11 | Última notificación | Fecha + canal |
| 12 | Acciones |

### 9.4 Acciones

Por cada fila:
- 📱 **Notificar al asociado** — modal para elegir mensaje. Al confirmar: se registra en `notificaciones_no_participan` y (si WhatsApp está activo) se envía por ahí. Por ahora queda en el sistema.
- 👥 **Notificar al equipo del servicio** — envía notificación al grupo del servicio para que apuren al compañero.
- 👔 **Notificar al supervisor** — botón manual (aunque el supervisor también recibe alertas automáticas cuando alguien de su equipo pasa a Alto/Muy alto).
- 👁 **Ver detalle** — modal con todo lo que se le asignó al asociado (capacitaciones, evaluaciones) y qué respondió.
- 📈 **Marcar como resuelto** — si el asociado empieza a participar, RRHH puede marcar la alerta como resuelta para que salga del foco.

### 9.5 Notificaciones automáticas

**Chequeo diario del sistema** (al abrir el módulo o via cron):
- Detecta asociados que **pasaron** a nivel Alto o Muy alto (nuevos casos).
- Notifica al supervisor de cada uno con mensaje: "Fulano de tu equipo pasó a riesgo Alto/Muy alto. Ver detalle en Competencia > No participan."
- Se genera 1 sola notificación por caso (no spamea).

Ver §17.1 para la decisión de cron real vs check al abrir.

### 9.6 Filtros
- Buscador por nombre.
- Por servicio.
- Por supervisor.
- Por nivel de riesgo (multi-select, default: Muy alto + Alto + Medio).
- Por días sin actividad (rangos).

### 9.7 Botón "📱 Notificar a todos los de riesgo alto"
Envía notificación masiva a los asociados con riesgo Muy alto y Alto.

### 9.8 Estadísticas del tab
Encabezado con:
- Total en riesgo Muy alto.
- Total en riesgo Alto.
- Total en riesgo Medio.
- Comparación con mes anterior (subió/bajó).

---

## 10. Tab 5 — Historial de movimientos

### 10.1 Qué muestra
Auditoría completa de todos los movimientos de puntos generados en el año seleccionado.

### 10.2 Columnas

| # | Columna |
|---|---|
| 1 | Fecha del evento |
| 2 | Fecha del movimiento (carga) |
| 3 | Regla aplicada |
| 4 | Operario protagonista |
| 5 | Destinatario del movimiento | (puede ser distinto del protagonista si es cascada) |
| 6 | Tipo de destinatario | Operario / Compañero / Supervisor |
| 7 | Servicio al momento |
| 8 | Supervisor al momento |
| 9 | Puntos | Positivo o negativo |
| 10 | Origen | Automático / Manual + módulo |
| 11 | Cargado por | |
| 12 | Estado | Vigente / Revertido |
| 13 | Acciones |

### 10.3 Filtros
- Buscador general.
- Por año.
- Por regla.
- Por operario protagonista.
- Por destinatario.
- Por rango de fechas del evento.
- Por origen (Automático / Manual).
- Por estado (Vigente / Revertido).

### 10.4 Acciones

Por cada fila:
- 👁 **Ver detalle del evento completo** — modal con el evento + todos los movimientos derivados de la cascada.
- ↩️ **Revertir movimiento** — modal con 2 opciones:
  - **Solo este movimiento** — marca este como Revertido.
  - **Todo el evento** — marca todos los movimientos del `evento_id` como Revertidos.
  - Motivo obligatorio.
- 📥 **Exportar a Excel** — para auditoría externa.

### 10.5 Botón "+ Carga manual"
Abre modal para cargar un movimiento manualmente. Ver §12 para el modal.

---

## 11. Tab 6 — Reglas del torneo

### 11.1 Qué muestra
Catálogo de reglas del juego (activas e inactivas), con la versión vigente de cada una.

### 11.2 Vista

Tabla con reglas activas primero, luego inactivas:

| # | Columna |
|---|---|
| 1 | Nombre de la regla | Con ⭐ si destaca |
| 2 | Origen | Automático / Manual / Ambas |
| 3 | Módulo origen | |
| 4 | Pts. individual (versión vigente) | |
| 5 | Pts. por compañero | (si aplica) |
| 6 | Pts. supervisor | (si aplica) |
| 7 | Vigente desde | |
| 8 | Estado | Activa / Inactiva |
| 9 | Acciones |

### 11.3 Acciones

- 👁 **Ver historial de versiones** — modal con todas las versiones históricas de la regla.
- ✏️ **Editar puntajes** — modal con 2 opciones (política A.6):
  - **Corregir error** — modifica la versión vigente. Queda en auditoría.
  - **Cambio con vigencia** — crea nueva versión con `vigencia_desde`. La anterior se cierra automáticamente. Los movimientos históricos NO se recalculan.
- 🔄 **Activar/Desactivar** — cambia el flag `activa`.
- 🗑 **Anular** — soft delete. Solo si no tiene movimientos vigentes.

### 11.4 Botón "+ Nueva regla"
Modal para crear regla nueva:

| Campo | Tipo | Notas |
|---|---|---|
| Nombre | Texto | Obligatorio |
| Descripción | Textarea | Opcional |
| Origen | Radio (Automático / Manual / Ambas) | Obligatorio |
| Módulo origen | Select | Solo si origen es Automático o Ambas |
| Puntos al operario | Number | Positivo o negativo |
| Puntos a cada compañero del servicio | Number | 0 si no cascadea |
| Puntos al supervisor | Number | 0 si no cascadea |
| Destaca (⭐) | Checkbox | |
| Vigente desde | Date | Default: hoy |

Al guardar: crea la regla + su primera versión.

### 11.5 Reglas iniciales (seed)
Las 9 reglas de §4.5 se cargan al aplicar el SQL. Están listas para funcionar desde el arranque.

---

## 12. Tab 7 — Premios y cierre de año

### 12.1 Qué muestra
Dos secciones:

**Sección A — Año en curso (arriba):**
- Estado: Abierto.
- Botón grande "🏁 Cerrar año YYYY" — visible solo desde el 1 de enero del año siguiente.
- Preview del podio actual: top 3 individual + top 3 por servicio.
- Nota: "El podio se congelará al cerrar el año. Antes de cerrar, verificá los datos y aplicá los movimientos pendientes."

**Sección B — Años anteriores (abajo):**
Tabla con años cerrados:

| # | Columna |
|---|---|
| 1 | Año |
| 2 | Fecha de cierre |
| 3 | Cerrado por |
| 4 | Ganador individual 1° | Con puntos finales |
| 5 | Ganador servicio 1° | Con puntos finales |
| 6 | Total premios entregados | X de 6 |
| 7 | Acciones | Ver detalle |

### 12.2 Modal "Cerrar año YYYY"
Al apretar "Cerrar año":

1. Preview del podio final que se va a congelar.
2. Advertencia: "Esta acción es irreversible. Después del cierre, los movimientos con fecha de este año que aparezcan más tarde impactarán en el año siguiente."
3. Campo "Observaciones del cierre" (opcional).
4. Botón "Cancelar" / "Confirmar cierre".

Al confirmar:
- Se calcula el ranking final (con todas las reglas de empate).
- Se crean 6 registros en `premios_competencia_anual` (top 3 individual + top 3 por servicio).
- Se actualiza `anios_competencia` con estado Cerrado.
- Notifica a los ganadores (bandeja del sistema + WhatsApp si está activo).

### 12.3 Vista del podio (por año)

Al ver detalle de un año cerrado:

```
🏆 Competencia Anual YYYY
════════════════════════════

INDIVIDUAL
🥇 1° — Fulano Pérez (450 pts)     [Entregado ✅ el DD/MM]
🥈 2° — Sultana García (420 pts)   [Pendiente entrega]
🥉 3° — Zutano López (390 pts)     [Entregado ✅ el DD/MM]

SERVICIOS
🥇 1° — Cliente A (280 pts corregidos)
🥈 2° — Cliente B (245 pts corregidos)
🥉 3° — Cliente C (210 pts corregidos)
```

### 12.4 Gestión de entrega

Por cada premio:
- Checkbox "Entregado".
- Al marcarlo: se pide fecha y nombre del que entrega.
- Textarea "Descripción del premio" (definida por RRHH: "Kit de herramientas", "Voucher $50.000", etc.).
- Observaciones (opcional).

### 12.5 Regla de empates
Ver §3.9. Empates comparten puesto. Ejemplo:
- Fulano y Sultana empatan en 1° con 450 pts cada uno.
- Ambos aparecen como 1° en el podio.
- No hay 2°. El siguiente es 3°.

Se registra en `premios_competencia_anual`:
- Registro 1: puesto=1, ganador=Fulano, compartido_con="Sultana García".
- Registro 2: puesto=1, ganador=Sultana, compartido_con="Fulano Pérez".
- No hay registro con puesto=2.
- Registro 3: puesto=3, ganador=Mengano.


---

## 13. Modales del módulo

### 13.1 Modal "Carga manual de movimiento"

Accesible desde: Tab 5 (Historial) botón "+ Carga manual".

Usado por RRHH para cargar felicitaciones de cliente, sanciones (mientras no exista módulo Sanciones), o cualquier movimiento manual.

| Campo | Tipo | Notas |
|---|---|---|
| Regla | Select | Solo reglas con origen "Manual" o "Ambas" |
| Operario protagonista | Autocompletado sobre activos | Obligatorio |
| Fecha del evento real | Date | Cuándo ocurrió en el mundo real, obligatorio |
| Servicio al momento | Readonly (auto del legajo actual) | Se puede editar si el evento fue en un servicio distinto |
| Supervisor al momento | Readonly | Idem |
| Referencia externa | Texto | ID del email/cliente/documento origen. Opcional |
| Observaciones | Textarea | Contexto del evento |
| Preview del impacto | Auto-calculado | "Se generarán N movimientos: +X a Fulano, +Y a compañeros del servicio, +Z al supervisor" |

Al guardar:
- Crea 1 registro en `eventos_puntos`.
- Genera N movimientos en `movimientos_puntos` según cascada de la regla vigente.
- Cada movimiento guarda `servicio_al_momento`, `supervisor_al_momento`, `regla_version_id_local` (versión aplicada), `puntos_congelados`.

### 13.2 Modal "Revertir movimiento"

Accesible desde: Tab 5 acción ↩️.

| Campo | Tipo | Notas |
|---|---|---|
| Preview del evento | Info readonly | Regla + protagonista + fecha |
| Movimientos del evento | Lista con checkboxes | Muestra los N movimientos derivados |
| Alcance de la reversión | Radio | "Solo este movimiento" / "Todo el evento" |
| Motivo de la reversión | Textarea | Obligatorio |

Al confirmar:
- Marca los movimientos elegidos con `estado = 'Revertido'` + fecha + usuario + motivo.
- Si es "Todo el evento", también marca `eventos_puntos.revertido = true`.
- Ranking se actualiza en el próximo render (los movimientos revertidos no suman).

### 13.3 Modal "Notificar al asociado"

Accesible desde: Tab 4 (No participan) botón 📱.

| Campo | Tipo | Notas |
|---|---|---|
| Destinatario | Readonly | Nombre + Nº socio |
| Tipo de mensaje | Select | "Recordatorio suave" / "Alerta directa" / "Personalizado" |
| Mensaje | Textarea | Auto-completado según tipo, editable |
| Canal | Radio (Sistema / WhatsApp) | WhatsApp deshabilitado si Meta no está activo |

Al enviar:
- Crea registro en `notificaciones_no_participan`.
- Envía por el canal elegido.

### 13.4 Modal "Editar puntajes de regla"

Accesible desde: Tab 6 acción ✏️.

**Panel izquierdo — Versión vigente actual (readonly).**

**Panel derecho — Nueva versión:**

| Campo | Tipo | Notas |
|---|---|---|
| Tipo de cambio | Radio | "Corregir error en versión vigente" / "Cambio a partir de fecha" |
| Puntos al operario | Number | |
| Puntos a cada compañero | Number | |
| Puntos al supervisor | Number | |
| Vigencia desde | Date | Solo si "Cambio a partir de fecha". Default: hoy |
| Motivo del cambio | Textarea | Obligatorio |

**Si es "Corregir error":**
- Modifica directamente la versión vigente.
- Los movimientos históricos que usaron esta versión NO se recalculan.
- Queda registrado en la auditoría (política A.6).

**Si es "Cambio a partir de fecha":**
- La versión vigente se cierra con `vigencia_hasta = vigencia_desde del nuevo - 1 día`.
- Se crea nueva versión.
- Los movimientos anteriores mantienen su puntaje congelado (política A.6).
- Los movimientos posteriores usan la nueva versión.

### 13.5 Modal "Nueva regla"

Ver §11.4.

### 13.6 Modal "Cerrar año"

Ver §12.2.

### 13.7 Modal "Ver detalle del evento"

Accesible desde: Tab 5 acción 👁.

Info del evento + tabla con todos los movimientos derivados de la cascada. Incluye botón para revertir todo el evento desde acá.

---

## 14. Lógica de negocio crítica

### 14.1 Generar puntos por acción (automático)

Cuando un módulo (Capacitaciones, en el arranque) dispara un evento que corresponde a una regla:

```javascript
function generarEventoPuntos(reglaId, operarioId, fechaEvento, referenciaExterna, observaciones) {
  const regla = obtenerRegla(reglaId);
  if (!regla.activa) return; // regla inactiva no genera puntos
  
  const version = obtenerVersionVigente(reglaId, fechaEvento);
  if (!version) {
    console.warn('No hay versión vigente de la regla al momento del evento');
    return;
  }
  
  const legajo = obtenerLegajo(operarioId);
  if (!legajo) return;
  
  // 1. Determinar año de competencia
  const anio = calcularAnioCompetencia(fechaEvento);
  
  // 2. Crear el evento
  const evento = {
    id_local: generarIdLocal(),
    regla_id_local: reglaId,
    regla_version_id_local: version.id_local,
    operario_id_local: operarioId,
    nombre_operario: legajo.nombre,
    servicio_al_momento: legajo.servicio,
    supervisor_al_momento: legajo.supervisor,
    fecha_evento: fechaEvento,
    origen: 'Automático',
    modulo_origen: regla.modulo_origen,
    referencia_externa: referenciaExterna,
    observaciones: observaciones,
    cargado_por: 'Sistema'
  };
  supaSync('eventosPuntos', evento);
  
  // 3. Generar el movimiento del operario (siempre)
  crearMovimiento({
    evento_id_local: evento.id_local,
    regla_id_local: reglaId,
    regla_version_id_local: version.id_local,
    destinatario_id_local: operarioId,
    nombre_destinatario: legajo.nombre,
    tipo_destinatario: 'Operario',
    servicio_al_momento: legajo.servicio,
    supervisor_al_momento: legajo.supervisor,
    puntos_congelados: version.puntos_individual,
    fecha_evento: fechaEvento,
    anio_competencia: anio
  });
  
  // 4. Si hay cascada a compañeros, generar movimientos por cada uno
  if (version.puntos_por_companero !== 0) {
    const companeros = obtenerCompanerosDeServicio(legajo.servicio, operarioId);
    companeros.forEach(comp => {
      crearMovimiento({
        evento_id_local: evento.id_local,
        regla_id_local: reglaId,
        regla_version_id_local: version.id_local,
        destinatario_id_local: comp.id_local,
        nombre_destinatario: comp.nombre,
        tipo_destinatario: 'Compañero',
        servicio_al_momento: legajo.servicio,
        supervisor_al_momento: legajo.supervisor,
        puntos_congelados: version.puntos_por_companero,
        fecha_evento: fechaEvento,
        anio_competencia: anio
      });
    });
  }
  
  // 5. Si hay cascada al supervisor, generar movimiento
  if (version.puntos_supervisor !== 0 && legajo.supervisor) {
    const supervisor = obtenerSupervisor(legajo.supervisor);
    if (supervisor) {
      crearMovimiento({
        evento_id_local: evento.id_local,
        regla_id_local: reglaId,
        regla_version_id_local: version.id_local,
        destinatario_id_local: supervisor.id_local,
        nombre_destinatario: supervisor.nombre,
        tipo_destinatario: 'Supervisor',
        servicio_al_momento: legajo.servicio,
        supervisor_al_momento: legajo.supervisor,
        puntos_congelados: version.puntos_supervisor,
        fecha_evento: fechaEvento,
        anio_competencia: anio
      });
    }
  }
}
```

### 14.2 Cálculo del año de competencia

```javascript
function calcularAnioCompetencia(fechaEvento) {
  const fecha = new Date(fechaEvento);
  const anioEvento = fecha.getFullYear();
  
  // Verificar si el año del evento está cerrado
  const anioRegistro = DB.aniosCompetencia.find(a => a.anio === anioEvento);
  
  if (anioRegistro && anioRegistro.estado === 'Cerrado') {
    // Año cerrado → el movimiento va al año actual (o al primer año abierto)
    return new Date().getFullYear();
  }
  
  return anioEvento;
}
```

### 14.3 Cálculo del ranking individual

```javascript
function calcularRankingIndividual(anio) {
  // 1. Obtener todos los movimientos vigentes del año
  const movimientos = DB.movimientosPuntos.filter(m =>
    m.anio_competencia === anio &&
    m.estado === 'Vigente' &&
    !m.anulado
  );
  
  // 2. Agrupar por destinatario y sumar
  const porOperario = {};
  movimientos.forEach(m => {
    if (!porOperario[m.destinatario_id_local]) {
      porOperario[m.destinatario_id_local] = {
        legajo_id_local: m.destinatario_id_local,
        nombre: m.nombre_destinatario,
        total: 0,
        pts_positivos: 0,
        pts_negativos: 0
      };
    }
    porOperario[m.destinatario_id_local].total += m.puntos_congelados;
    if (m.puntos_congelados > 0) {
      porOperario[m.destinatario_id_local].pts_positivos += m.puntos_congelados;
    } else {
      porOperario[m.destinatario_id_local].pts_negativos += m.puntos_congelados;
    }
  });
  
  // 3. Excluir administrativos y traer datos del legajo actual
  const ranking = Object.values(porOperario)
    .map(item => {
      const legajo = obtenerLegajo(item.legajo_id_local);
      if (!legajo || legajo.sector_tipo === 'Administrativo') return null;
      return {
        ...item,
        servicio_actual: legajo.servicio,
        supervisor_actual: legajo.supervisor
      };
    })
    .filter(Boolean);
  
  // 4. Ordenar por total desc, aplicar regla de desempate
  ranking.sort((a, b) => b.total - a.total);
  
  // 5. Asignar puestos con empates compartidos
  let puesto = 1;
  ranking.forEach((item, i) => {
    if (i > 0 && ranking[i-1].total !== item.total) {
      puesto = i + 1;
    }
    item.puesto = puesto;
  });
  
  return ranking;
}
```

### 14.4 Cálculo del ranking por servicio (con corrección)

```javascript
function calcularRankingServicios(anio) {
  // 1. Obtener movimientos vigentes del año agrupados por servicio_al_momento
  const movimientos = DB.movimientosPuntos.filter(m =>
    m.anio_competencia === anio &&
    m.estado === 'Vigente' &&
    !m.anulado &&
    m.servicio_al_momento &&
    m.servicio_al_momento !== 'ADMINISTRATIVO'
  );
  
  const porServicio = {};
  movimientos.forEach(m => {
    if (!porServicio[m.servicio_al_momento]) {
      porServicio[m.servicio_al_momento] = {
        servicio: m.servicio_al_momento,
        suma_total: 0,
        destinatarios_unicos: new Set()
      };
    }
    porServicio[m.servicio_al_momento].suma_total += m.puntos_congelados;
    porServicio[m.servicio_al_momento].destinatarios_unicos.add(m.destinatario_id_local);
  });
  
  // 2. Para cada servicio, calcular el ranking corregido
  const ranking = Object.values(porServicio).map(item => {
    // Miembros totales del servicio (según legajos actuales — puede ser distinto)
    const miembrosActuales = DB.legajos.filter(l =>
      l.servicio === item.servicio &&
      l.estado === 'Activo' &&
      l.sector_tipo !== 'Administrativo' &&
      !l.anulado
    );
    const miembrosTotales = miembrosActuales.length || 1;
    const miembrosParticipantes = item.destinatarios_unicos.size;
    const porcentajeParticipacion = miembrosParticipantes / miembrosTotales;
    
    const promedioBase = item.suma_total / miembrosTotales;
    const puntajeCorregido = Math.round(promedioBase * porcentajeParticipacion);
    
    return {
      servicio: item.servicio,
      miembros_totales: miembrosTotales,
      miembros_participantes: miembrosParticipantes,
      porcentaje_participacion: Math.round(porcentajeParticipacion * 100),
      suma_total: item.suma_total,
      promedio_base: Math.round(promedioBase),
      puntaje_corregido: puntajeCorregido
    };
  });
  
  ranking.sort((a, b) => b.puntaje_corregido - a.puntaje_corregido);
  
  // Asignar puestos con empates
  let puesto = 1;
  ranking.forEach((item, i) => {
    if (i > 0 && ranking[i-1].puntaje_corregido !== item.puntaje_corregido) {
      puesto = i + 1;
    }
    item.puesto = puesto;
  });
  
  return ranking;
}
```

### 14.5 Cálculo del tab "No participan"

```javascript
function calcularNoParticipantes(anio) {
  const asociadosActivos = DB.legajos.filter(l =>
    l.estado === 'Activo' &&
    l.sector_tipo !== 'Administrativo' &&
    !l.anulado
  );
  
  return asociadosActivos.map(legajo => {
    // Obtener evaluaciones y capacitaciones asignadas al asociado en el año
    const evalAsignadas = obtenerEvaluacionesAsignadas(legajo.id_local, anio);
    const evalRespondidas = obtenerEvaluacionesRespondidas(legajo.id_local, anio);
    const capasAsignadas = obtenerCapacitacionesAsignadas(legajo.id_local, anio);
    const capasCompletadas = obtenerCapacitacionesCompletadas(legajo.id_local, anio);
    
    const totalAsignado = evalAsignadas + capasAsignadas;
    const totalCompletado = evalRespondidas + capasCompletadas;
    
    const porcentaje = totalAsignado > 0
      ? (totalCompletado / totalAsignado) * 100
      : 0;
    
    // Clasificar nivel de riesgo
    let nivelRiesgo;
    if (porcentaje === 0) nivelRiesgo = 'Muy alto';
    else if (porcentaje < 30) nivelRiesgo = 'Alto';
    else if (porcentaje < 60) nivelRiesgo = 'Medio';
    else nivelRiesgo = 'Bajo';
    
    // Puntos positivos y negativos del año
    const movimientos = DB.movimientosPuntos.filter(m =>
      m.destinatario_id_local === legajo.id_local &&
      m.anio_competencia === anio &&
      m.estado === 'Vigente' &&
      !m.anulado
    );
    const ptsPositivos = movimientos.filter(m => m.puntos_congelados > 0).reduce((s,m)=>s+m.puntos_congelados,0);
    const ptsNegativos = movimientos.filter(m => m.puntos_congelados < 0).reduce((s,m)=>s+m.puntos_congelados,0);
    
    // Días sin actividad
    const ultimoMovimientoPositivo = movimientos
      .filter(m => m.puntos_congelados > 0)
      .sort((a,b) => new Date(b.fecha_evento) - new Date(a.fecha_evento))[0];
    const diasSinActividad = ultimoMovimientoPositivo
      ? Math.floor((new Date() - new Date(ultimoMovimientoPositivo.fecha_evento)) / (1000*60*60*24))
      : null;
    
    // Última notificación
    const ultimaNotif = DB.notificacionesNoParticipan
      .filter(n => n.operario_id_local === legajo.id_local && !n.anulado)
      .sort((a,b) => new Date(b.fecha_enviado) - new Date(a.fecha_enviado))[0];
    
    return {
      legajo_id_local: legajo.id_local,
      nombre: legajo.nombre,
      servicio: legajo.servicio,
      supervisor: legajo.supervisor,
      eval_asignadas: evalAsignadas,
      eval_respondidas: evalRespondidas,
      capas_asignadas: capasAsignadas,
      capas_completadas: capasCompletadas,
      pts_positivos: ptsPositivos,
      pts_negativos: ptsNegativos,
      porcentaje_participacion: Math.round(porcentaje),
      nivel_riesgo: nivelRiesgo,
      dias_sin_actividad: diasSinActividad,
      ultima_notif: ultimaNotif
    };
  }).filter(x => x.nivel_riesgo !== 'Bajo');  // Solo mostrar riesgo Muy alto/Alto/Medio por default
}
```

### 14.6 Chequeo automático diario (notificar supervisores)

```javascript
function chequeoDiarioNoParticipantes() {
  const anio = new Date().getFullYear();
  const noParticipantes = calcularNoParticipantes(anio);
  
  noParticipantes.forEach(asoc => {
    if (asoc.nivel_riesgo === 'Alto' || asoc.nivel_riesgo === 'Muy alto') {
      // Verificar si ya se notificó al supervisor en los últimos 7 días
      const yaNotif = DB.notificacionesNoParticipan.find(n =>
        n.operario_id_local === asoc.legajo_id_local &&
        n.destinatario_tipo === 'Supervisor' &&
        n.origen === 'Automatico' &&
        !n.anulado &&
        (new Date() - new Date(n.fecha_enviado)) < 7*24*60*60*1000
      );
      
      if (!yaNotif) {
        const supervisor = obtenerSupervisor(asoc.supervisor);
        if (supervisor) {
          crearNotificacionNoParticipan({
            operario_id_local: asoc.legajo_id_local,
            nivel_riesgo: asoc.nivel_riesgo,
            destinatario_tipo: 'Supervisor',
            destinatario_id_local: supervisor.id_local,
            canal: 'Sistema',
            origen: 'Automatico',
            mensaje: `${asoc.nombre} de tu equipo está en riesgo ${asoc.nivel_riesgo}. Ver detalle en Competencia > No participan.`,
            enviado_por: 'Sistema'
          });
          
          generarNotificacion('competencia_alerta_supervisor', {
            supervisor_id_local: supervisor.id_local,
            operario_nombre: asoc.nombre,
            nivel_riesgo: asoc.nivel_riesgo
          });
        }
      }
    }
  });
}
```

Ver §17.1 para cron real vs check al abrir.


---

## 15. Integraciones con otros módulos

### 15.1 Módulo Capacitaciones (integración desde el arranque)

**Cambios necesarios en Capacitaciones:**

Al detectar cualquiera de estos eventos, llamar al hook del módulo Competencia:

| Evento | Regla a disparar |
|---|---|
| Asociado responde una evaluación | "Responder una evaluación" |
| Por cada respuesta correcta | "Respuesta correcta por pregunta" |
| Completa capacitación presencial en oficina | "Capacitación presencial en oficina" |
| Completa capacitación en servicio | "Capacitación en servicio" |
| Completa capacitación por video con evaluación | "Capacitación vía video con evaluación" |
| Participa en capacitación grupal de servicio | "Participación en equipo" |
| Completa capacitación por Meet/Virtual | "Capacitación por Meet/Virtual" |
| No responde evaluación en X días | "No participar en evaluación" |

```javascript
// En el módulo Capacitaciones, al detectar el evento:
if (window.generarEventoPuntosCompetencia) {
  window.generarEventoPuntosCompetencia('regla_id_local_correspondiente', operarioId, fechaEvento, capacitacionId, 'Capacitación X aprobada');
}
```

En el módulo Competencia:
```javascript
export function generarEventoPuntosCompetencia(reglaIdLocal, operarioId, fechaEvento, referenciaExterna, observaciones) {
  // Ver §14.1
}
```

Coordinar con Lautaro antes de cambios en Capacitaciones.

### 15.2 Módulo Comercial (regla existente, integración a futuro)

**Estado actual:** el módulo Comercial no existe. La regla "Felicitación de cliente" existe con origen "Ambas".

**Alcance de esta implementación:** RRHH puede cargar manualmente las felicitaciones desde el Tab 5 (Historial) con "+ Carga manual".

**Cuando Comercial migre:**
- Se agregará un hook `generarEventoPuntosCompetencia` cuando Comercial reciba una felicitación de cliente.
- No requiere cambios en Competencia.

### 15.3 Módulo Sanciones (regla y hook a futuro)

**Estado actual:** el módulo Sanciones no existe. La regla "Sanción disciplinaria" (-20 al operario, -5 al supervisor) se puede cargar como parte de las reglas iniciales (aunque no está en el seed base — se puede agregar desde el Tab 6 en cualquier momento).

**Alcance de esta implementación:** RRHH puede cargar manualmente sanciones desde Tab 5.

**Cuando Sanciones migre:**
- Se agrega un hook para que al aplicar una sanción, se genere el movimiento de puntos automáticamente.

### 15.4 Módulo Reasignaciones (infraestructura lista)

**Estado actual:** las reasignaciones se registran, pero el módulo actual no dispara nada a Competencia.

**Cómo funciona:** cuando un legajo cambia de servicio, los movimientos que ya se generaron (que tienen `servicio_al_momento` fijo) NO se tocan. Los futuros van al servicio nuevo.

**No requiere cambios en Reasignaciones.** El módulo Competencia lee `legajo.servicio` en el momento del evento (cuando otro módulo dispara la regla).

### 15.5 Módulo Legajos (lectura)

Consulta desde Competencia:
- `DB.legajos` para armar rankings (nombre, sector_tipo, servicio, supervisor).
- Filtrado por `sector_tipo !== 'Administrativo'` para excluir administrativos.

### 15.6 Sistema de notificaciones

Reutilizar la tabla `notificaciones_sistema` creada en Reasignaciones. Tipos generados por Competencia:

| Tipo | Cuándo |
|---|---|
| `competencia_alerta_supervisor` | Cuando alguien de su equipo pasa a Alto/Muy alto |
| `competencia_ganador_year` | Al cerrar año, a cada ganador del podio |
| `competencia_regla_modificada` | Cuando RRHH modifica una regla (a Operaciones y Admin) |
| `competencia_ano_cerrado` | Al cerrar año, a todos los admin/operaciones |

### 15.7 WhatsApp (a futuro)

Cuando Meta esté destrabada:
- Notificaciones a asociados por bot.
- Comando `!ranking` para que un asociado consulte su puesto.
- Comando `!premios` para que consulte los premios del año actual.

---

## 16. Etapas de implementación

### Etapa 1 — Base persistente (crítica)
- Aplicar SQL `v018_competencia_anual.sql`.
- Actualizar mapeo en `supabase.js`.
- Crear estructura del módulo `src/modules/competencia/`.
- Cargar seed de las 9 reglas iniciales.
- Crear screen completo con 7 tabs.
- Implementar motor de movimientos (crear, revertir, cascadas).
- Implementar Tab 6 (Reglas) con edición y vigencia temporal.
- Implementar Tab 5 (Historial de movimientos) con carga manual.
- Implementar mock de permisos.

**Al terminar:** el motor de puntos funciona con persistencia real. Se pueden cargar felicitaciones manualmente.

### Etapa 2 — Rankings
- Implementar Tab 1 (Individual).
- Implementar Tab 2 (Servicios) con corrección por participación.
- Implementar Tab 3 (Supervisores).
- Selector de año para consultar históricos.

**Al terminar:** los rankings se ven correctamente.

### Etapa 3 — No participan (crítica)
- Implementar Tab 4 con niveles de riesgo.
- Implementar chequeo automático diario para notificar a supervisores.
- Implementar botones de notificación (asociado, equipo, supervisor manual).

**Al terminar:** el corazón funcional del módulo está operativo.

### Etapa 4 — Integración con Capacitaciones
- Coordinar con Lautaro los cambios en Capacitaciones.
- Agregar los hooks para cada evento (responder eval, completar capacitación, etc.).
- Testear que los puntos se generen correctamente.

**Al terminar:** el módulo ya no depende de carga manual para lo básico.

### Etapa 5 — Premios y cierre anual
- Implementar Tab 7 (Premios).
- Implementar cierre de año con congelamiento del podio.
- Implementar histórico de años cerrados.

**Al terminar:** el ciclo anual completo funciona.

### Etapa 6 — WhatsApp (espera Meta)
- Notificaciones automáticas por WhatsApp.
- Comando `!ranking` para asociados.

### Etapa 7 — Integraciones futuras
- Cuando Comercial migre: hook para felicitaciones automáticas.
- Cuando Sanciones migre: hook para sanciones automáticas.

---

## 17. Decisiones técnicas delegadas a Fede

### 17.1 Chequeo diario: cron real vs check al abrir

**Contexto:** el chequeo diario de No participantes necesita ejecutarse periódicamente.

**Opciones:**
- **A) Check al cargar el módulo** — cada vez que un usuario abre Competencia, se corre el chequeo.
- **B) Cron real** (Supabase pg_cron o Edge Function agendada) — corre 1 vez al día sin depender de tráfico.

**Recomendación:** empezar con A. Es más simple y garantiza que los chequeos se corren cuando hay actividad. Cuando el volumen justifique, migrar a B.

### 17.2 Optimización del cálculo de rankings

**Contexto:** con muchos movimientos (miles), calcular el ranking en cada render puede ser lento.

**Opciones:**
- **A) Cache en memoria** con TTL (se recalcula si pasaron X minutos).
- **B) Vista materializada** en Supabase que se refresca al agregar movimientos.
- **C) Sin optimización** por ahora (recalcular siempre).

**Recomendación:** C al arrancar. Migrar a A cuando se sienta lento (aún así, con 500 asociados y ~10 movimientos por asociado por año = 5000 movimientos, sigue siendo rápido en cliente).

### 17.3 Regla de desempate por default

**Contexto:** cuando hay empates que no son totales (diferencia mínima), se puede aplicar una regla de desempate.

**Opciones:**
- **A)** "Mayor cantidad de evaluaciones respondidas" (default del legacy).
- **B)** "Mayor tasa de aprobación".
- **C)** "Más antigüedad en la cooperativa".

**Recomendación:** A. Es lo que ya usaba el legacy y refleja compromiso.

### 17.4 Sistema de permisos

**Contexto:** los roles RRHH, Operaciones, Supervisor, Admin viven en el sistema global de permisos.

**Recomendación:** si el sistema global no existe aún, mock temporal en `permisos.js` con TODO para reemplazar.

---

## 18. Bugs conocidos a corregir del legacy

Del inventario:

1. **Botón "Reglas del torneo" del header apunta a modal inexistente** — el nuevo diseño accede a las reglas desde el Tab 6.
2. **Panel de puntajes (Tab 5) genera divs vacíos** — el nuevo render llena el contenido.
3. **Ranking público con contenedores vacíos** — no se implementa ranking público en esta versión.
4. **Selector de año no filtra datos** — el nuevo diseño usa el selector para filtrar movimientos por `anio_competencia`.
5. **`evalEnviadas` fijo en 3** — se lee de datos reales de Capacitaciones.
6. **`<thead>` reescritos por JS** divergen de HTML — el nuevo diseño genera todo desde JS consistentemente.
7. **Nada persiste en Supabase** — mapear todas las tablas.
8. **Reglas editables desconectadas del cálculo** — el nuevo motor usa las reglas y sus versiones para todo.
9. **Puntajes calculados con seed determinístico** — se eliminan, se usan datos reales.

---

## 19. Casos borde y validaciones

### 19.1 Operario dado de baja durante el año
Sus movimientos históricos siguen contando en el ranking del año. El operario aparece con badge "Baja" pero mantiene su puesto.

Si estaba en el podio al momento del cierre → se le declara ganador igual (el sistema no lo excluye). RRHH decide si entrega el premio o no.

### 19.2 Regla desactivada durante el año
Si RRHH desactiva una regla:
- Los movimientos históricos NO se tocan.
- No se generan movimientos nuevos hasta reactivar.

### 19.3 Regla eliminada (anulada)
Solo se puede anular si no tiene movimientos vigentes. Si los tiene, primero hay que revertirlos o desactivar la regla.

### 19.4 Cambio de servicio de un operario en medio de un evento cascada
Ejemplo: Juan responde correctamente una evaluación grupal del servicio A el 15/jun. El 30/jun se reasigna al servicio B. Los movimientos ya generados el 15/jun quedan con `servicio_al_momento = A` (correcto).

### 19.5 Empate múltiple
Si 5 personas empatan en 1° → todas se llevan 1°. No hay 2° ni 3°. El siguiente es 4°.

### 19.6 Ranking sin datos
Si nadie sumó nada en el año (raro, pero posible al arrancar el año), todas las tablas muestran empty state "Aún no hay movimientos registrados".

### 19.7 Movimiento con fecha futura
Al cargar manualmente, si RRHH pone fecha futura → error "La fecha del evento no puede ser futura".

### 19.8 Movimiento con fecha muy antigua (más de 2 años)
Al cargar manualmente con fecha de hace más de 2 años → soft warning "Este evento tiene más de 2 años. ¿Confirmás?". Se permite igual.

### 19.9 Cierre de año con conflictos
Si RRHH intenta cerrar un año con movimientos pendientes de reversión (por ejemplo, alguien está en el proceso de revertir un movimiento importante) → soft warning "Hay N movimientos con solicitudes de reversión pendientes. ¿Confirmás el cierre igual?".

### 19.10 Modificación de regla en medio de cálculo
Si RRHH modifica un puntaje mientras el sistema está calculando un ranking → el sistema termina con la versión vigente al inicio del cálculo. El próximo render usará la nueva versión.

### 19.11 Legajo sin supervisor asignado
Si un legajo no tiene supervisor y se dispara una regla con cascada al supervisor → el movimiento del supervisor NO se genera (silenciosamente). El operario recibe su parte normalmente.

### 19.12 Reversión de movimiento en año cerrado
Se puede revertir un movimiento aunque el año esté cerrado. **Importante:** revertir NO recalcula el podio del año cerrado (los ganadores siguen siendo los que se congelaron). Solo queda registrado en la auditoría.

---

## 20. Convenciones del proyecto

### 20.1 Del código
- Nombres en español.
- camelCase en frontend, snake_case en Supabase.
- Un commit por cambio lógico.

### 20.2 De la base de datos
- Nunca modificar SQL versionado viejo → crear `vNNN` nuevo.
- Soft delete con `anulado`.
- Guard de idempotencia en operaciones críticas.
- Historización de reglas con vigencia temporal (política A.6).

### 20.3 De la UI
- Toasts para feedback.
- Loading indicators si >1 segundo.
- Confirmaciones para acciones destructivas (revertir, cerrar año).
- Colores consistentes con otros módulos.

### 20.4 De testing
Probar el ciclo completo:
- Cargar manualmente una felicitación → verificar que se generan 3 movimientos (operario + compañeros + supervisor).
- Revertir el movimiento del operario → verificar que solo ese cambia a Revertido.
- Revertir el evento completo → verificar que los 3 cambian a Revertido.
- Modificar una regla con vigencia futura → verificar que movimientos previos mantienen puntaje congelado.
- Modificar una regla "corregir error" → verificar que movimientos previos mantienen puntaje congelado.
- Cambio de servicio de un operario → verificar que puntos históricos siguen en el servicio anterior.
- Cerrar año → verificar podio congelado y notificaciones a ganadores.
- Cargar movimiento con fecha de año cerrado → verificar que impacta en año actual.

---

## 21. FAQ

**¿Los administrativos participan?**
No en esta versión. Se pueden agregar en una versión futura si Gabi lo decide.

**¿El ranking público está disponible?**
No en esta versión. Solo interno.

**¿Se puede editar un movimiento?**
No directamente. Se revierte y se carga uno nuevo.

**¿Se puede reactivar un año cerrado?**
No. Es irreversible. Si hay error en el cierre, se documenta y se ajusta en el año siguiente.

**¿Los operarios ven su propio ranking?**
No en esta versión. A futuro, con WhatsApp bot y comando `!ranking`.

**¿Qué pasa si un supervisor se da de baja?**
Sus puntos históricos siguen contando. En el ranking de supervisores aparece con badge "Baja".

**¿Se pueden importar movimientos de años anteriores?**
No hay una feature de importación. Se cargan manualmente desde el Tab 5.

**¿Puedo tocar `src/legacy.js`?**
No. Dejar como referencia. Cuando el nuevo funcione, se remueve del menú.

**¿Puedo tocar Capacitaciones?**
Solo lo mínimo para agregar los hooks descritos en §15.1. Coordinar con Lautaro.

---

## 22. Cierre

Este documento se construyó a partir de:
1. Inventario técnico del legacy (`docs/INVENTARIO_competencia_anual_legacy.md`).
2. Sesión de diseño con Lautaro sobre reglas del juego, cascadas, arquitectura de movimientos, gestión de no-participantes, reasignaciones, cierre anual.
3. Alineación con `POLITICAS_PROYECTO.md` y `CLAUDE.md`.
4. Coherencia con módulos ya diseñados (Vacaciones, Descansos, Uniformes, Reasignaciones, Capacitaciones).

Este módulo es **más complejo que la mayoría** por la combinación de:
- Motor de puntos con reglas parametrizables y vigencia temporal.
- Cascadas (una regla puede afectar a múltiples destinatarios).
- Reasignaciones que respetan el servicio al momento.
- Cierre anual con congelamiento del histórico.
- Corazón funcional en el tab "No participan" con lógica de riesgo.

Con este documento, Fede tiene todo lo necesario para implementar sin bloqueos. Ante duda de diseño no cubierta: **preguntar antes de codear** (política A.4).

**¡Que gane el mejor!** 🏆
