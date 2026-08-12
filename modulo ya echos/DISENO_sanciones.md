# Diseño del módulo Sanciones — Especificación para implementación

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Sanciones
**Autor del diseño:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-08
**Versión:** 1.0

---

## Cómo usar este documento

Este documento es la **fuente de verdad** para implementar el módulo Sanciones. Está pensado para que se pueda programar **sin necesidad de volver a preguntar** por decisiones de diseño.

**Antes de escribir cualquier código:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, el inventario técnico (`docs/INVENTARIO_sanciones_legacy.md`), y la **Política de Sanciones — Coop. Ohlimpia (Versión 1.0, Junio 2026)** (documento adjunto de RRHH, aprobado por Consejo).

---

## 1. Contexto del módulo

### 1.1 Qué es Sanciones

Es el **módulo disciplinario** de la cooperativa. Gestiona el ciclo completo del proceso: desde la detección de una infracción, pasando por el descargo del asociado, la aprobación por el nivel correspondiente, hasta la ejecución de la sanción y su registro en el legajo.

**Doble propósito:**
1. **Aplicar consecuencias** proporcionales, graduales y consistentes a las conductas que afectan el funcionamiento de la cooperativa.
2. **Garantizar el debido proceso** y los derechos del asociado (descargo obligatorio, apelaciones, notificaciones formales).

### 1.2 Lo que NO es

- No es un módulo de "reportes de mal desempeño" informales.
- No reemplaza la conversación cara a cara previa (el llamado verbal informal sigue existiendo).
- No es un módulo de RRHH puro — el Consejo interviene en niveles altos.

### 1.3 Marco legal

Basado en:
- Estatuto Social de la Cooperativa (Arts. 12° a 18°).
- Política de Sanciones interna (Versión 1.0, Junio 2026, aprobada por Consejo).

### 1.4 Dueños del proceso por nivel

Los dueños varían según la gravedad de la sanción:

| Nivel | Sanción | Quién propone | Quién aprueba |
|---|---|---|---|
| 0 | Llamado verbal (informal) | Supervisor | — (opcional registro informal) |
| 1 | Observación | Supervisor | **Aplicada inmediata + notificación al Gerente de Operaciones** (para operativos) o **Gerente del área** (administrativos) |
| 2 | Apercibimiento | Supervisor | Gerente de Operaciones (o del área) **+** Gerente de RRHH |
| 3 | Suspensión (hasta 30 días) | Gerencia Operaciones / RRHH | **Consejo de Administración (mayoría 2 de 3)** + sumario previo |
| 4 | Exclusión | Gerencia RRHH / Consejo | **Consejo de Administración (unanimidad)** + sumario previo |

**Aclaración importante sobre nivel 1:**
El supervisor aplica la observación de inmediato. El Gerente correspondiente recibe notificación automática. Puede revertirla con motivo si considera que fue desproporcionada. No hay aprobación previa que frene el proceso — se privilegia la agilidad para observaciones (nivel bajo).

### 1.5 Estructura organizacional relevante

**Áreas administrativas (5):**
Operaciones, RRHH, Logística, Comercial, Finanzas.

Cada asociado administrativo pertenece a **una** de estas áreas. **Cada área tiene un Gerente.**

**Cargos dirigenciales (rotativos, vigencia temporal):**

| Cargo | Función | Interviene en |
|---|---|---|
| Presidente | Encabeza Consejo | Consejo (vota) |
| Tesorero | Consejo | Consejo (vota) |
| Secretaria | Consejo | Consejo (vota) |
| Síndico (titular) | Fiscalización | Puede intervenir en sumarios (no vota) |
| Gerente General | Ejecutivo máximo | Puede intervenir en cualquier nivel |

**Nota:** el Síndico NO integra el Consejo (rol de control interno). Los cargos rotan cada 3 años. Se modelan con vigencia temporal.

### 1.6 Aplicación

- **Operativos** (asociados de servicios):
  - Iniciación de sumario: Gerente de Operaciones o RRHH.
- **Administrativos** (5 áreas):
  - Iniciación de sumario: Gerente del área respectiva, Gerente de RRHH, o cualquier miembro del Consejo.

### 1.7 Contexto de negocio

**Política oficial escrita disponible** (Versión 1.0, Junio 2026). Es la primera vez que este módulo se diseña con política escrita completa desde el inicio.

**Todo debe estar documentado:** cada acción del proceso disciplinario (desde detección hasta cierre) queda registrada con quién intervino, cuándo, con qué motivo. Es material sensible desde el punto de vista legal.

**Reversibilidad total** con soft delete. Nada se elimina físicamente. Un error queda anulado con motivo pero se puede consultar.

### 1.8 Estado actual (antes de esta implementación)

Ver `docs/INVENTARIO_sanciones_legacy.md`. Resumen ejecutivo:

**El módulo actual es un ABM plano incompatible con la política oficial:**

1. **No hay niveles tipados.** El "tipo" de sanción es texto libre.
2. **No hay flujo de aprobación.** Solo un botón "Resolver" que cambia estado a Resuelta.
3. **No hay descargo.**
4. **No hay sumario.**
5. **No hay apelaciones.**
6. **Modal ausente en el DOM** → el botón "+ Nueva sanción" es inerte.
7. **Drift de schema mock ↔ código:** los 3 registros ejemplo se ven con campos vacíos.
8. **Persiste en Supabase pero parcial.** `resolverSancion` no sincroniza.
9. **Cero integración con Legajos, Competencia, Liquidaciones.**

**La política oficial define 5 niveles con flujos totalmente distintos. Nada de eso está implementado. Aplica política A.11 (rehacer sobre parchar).**

### 1.9 Objetivo de esta implementación

**Rediseñar el módulo completo desde cero** en `src/modules/sanciones/`. Debe:

1. **Implementar los 5 niveles de sanción** con flujos de aprobación diferenciados.
2. **Persistir todo en Supabase** con modelo de datos rico y consistente.
3. **Debido proceso obligatorio:** descargo obligatorio a partir de nivel 2 (Apercibimiento).
4. **Sumario formal** para niveles 3 (Suspensión) y 4 (Exclusión).
5. **Apelaciones trackeadas** con estado y resolución.
6. **Escalada automática** basada en acumulación de sanciones.
7. **Catálogo de infracciones** administrable por RRHH.
8. **Integración con Legajos** — antecedentes disciplinarios visibles en el legajo.
9. **Integración con Competencia Anual** — resta puntos automáticamente al aprobar.
10. **Preparación para Liquidaciones** — sanciones con impacto económico registran compromiso.
11. **Infraestructura compartida** — tablas de composición de Consejo, Sindicatura y Gerentes de Área con vigencia temporal.


---

## 2. Alcance de la implementación

### 2.1 Qué incluye

**Tablas del módulo Sanciones:**
- `sanciones_disciplinarias` — registro central del proceso.
- `sancion_eventos` — auditoría de transiciones de estado.
- `sancion_descargos` — descargos del asociado.
- `sancion_aprobaciones` — votos individuales del Consejo (para suspensión/exclusión).
- `sancion_sumarios` — expediente formal del sumario.
- `sancion_apelaciones` — apelaciones a Asamblea.
- `catalogo_infracciones` — infracciones tipificadas.
- `catalogo_infracciones_versiones` — versiones con vigencia temporal.

**Tablas de infraestructura compartida (transversales, no solo del módulo):**
- `composicion_consejo` — Presidente / Tesorero / Secretaria con vigencia temporal.
- `composicion_sindicatura` — Síndico titular y suplente con vigencia temporal.
- `gerentes_area` — Gerente de cada área con vigencia temporal.
- `areas_administrativas` — catálogo de las 5 áreas.

**Módulo migrado en `src/modules/sanciones/`:**
- 7 tabs (Pendientes, Activas, Sumarios, Historial, Apelaciones, Catálogo, Estadísticas).
- Modales para cada tipo de acción (cargar sanción, cargar descargo, votar en Consejo, iniciar sumario, cargar apelación).
- Sistema de escalada automática con alertas.
- Integración desde el arranque con Legajos (mostrar antecedentes) y Competencia Anual (restar puntos).

### 2.2 Qué NO incluye (etapas futuras)

- Notificaciones automáticas por WhatsApp (espera Meta destrabada).
- Sistema completo de permisos y facultades global (por ahora mock con TODO).
- Módulo de Asamblea (para apelaciones que llegan a Asamblea). Por ahora RRHH registra el resultado manualmente.
- Impacto económico en Liquidaciones (solo se registra el compromiso; Liquidaciones lo consumirá cuando migre).
- Formulario de sumario con plantilla imprimible (por ahora se generan datos estructurados; el PDF firmado se adjunta como archivo).
- Integración con módulo Contable (si una sanción implica indemnización).

---

## 3. Decisiones tomadas

### 3.1 Rediseño completo
No se parcha el legacy. Se implementa desde cero. El legacy queda como referencia sin tocar hasta que el nuevo esté funcionando.

### 3.2 5 niveles de sanción tipados
Cada sanción tiene un nivel del 0 al 4, con flujo de aprobación específico. No hay "tipo libre".

### 3.3 Nivel 0 (Llamado verbal) opcional en el sistema
El supervisor puede registrarlo como "Registro informal — nivel 0". Aparece en el legajo con badge distintivo "No cuenta como sanción". Sirve para trazabilidad interna y para alimentar el análisis de patrones. **No pesa** en la escalada automática ni resta puntos en Competencia.

### 3.4 Observación (nivel 1) sin aprobación previa
El supervisor la aplica inmediata. Notificación automática al Gerente responsable (Operaciones para operativos, Gerente del área para administrativos). El Gerente puede revertir con motivo si considera desproporcionada.

### 3.5 Apercibimiento (nivel 2) con doble aprobación
Supervisor propone. Requiere aprobación de:
- Gerente de Operaciones (si es operativo) o Gerente del área (si es administrativo).
- Gerente de RRHH.

Ambas firmas obligatorias. Si una rechaza, la sanción no procede.

### 3.6 Suspensión (nivel 3) con sumario y Consejo
- **Sumario previo obligatorio** (§13).
- **Aprobación del Consejo por mayoría (2 de 3).**
- **Descargo obligatorio** con plazo mínimo de 48 horas.
- Fecha de inicio y fin de suspensión.

### 3.7 Exclusión (nivel 4) con sumario y Consejo unánime
- **Sumario previo obligatorio.**
- **Aprobación del Consejo por unanimidad (3 de 3).**
- **Descargo obligatorio.**
- Registro de baja del asociado como consecuencia.

### 3.8 Iniciación diferenciada operativos vs administrativos

**Operativos:**
- Iniciación de sanciones nivel 1-2: cualquier supervisor.
- Iniciación de sumario (nivel 3-4): Gerente de Operaciones o RRHH.

**Administrativos:**
- Iniciación de sanciones nivel 1-2: Gerente del área respectiva.
- Iniciación de sumario (nivel 3-4): Gerente del área, Gerente de RRHH, o cualquier miembro del Consejo.

### 3.9 Descargo obligatorio a partir de nivel 2
- **Nivel 1:** descargo opcional.
- **Nivel 2-4:** descargo obligatorio. La sanción queda "En espera de descargo" durante 48hs (mínimo). Si el asociado no presenta descargo en el plazo, se registra automáticamente "Sin descargo presentado" y continúa el proceso.

### 3.10 Sumario formal para niveles 3-4
Ver §13 para el detalle. Es un expediente formal con:
- Descripción del hecho.
- Evidencia (fotos, testimonios, planillas, adjuntos).
- Antecedentes disciplinarios del asociado.
- Descargo del asociado.
- Recomendación de sanción.
- Plazo total: 30 días desde apertura hasta resolución.

### 3.11 Durante el sumario el asociado sigue trabajando
Salvo **medida cautelar excepcional** solicitada por RRHH (casos flagrantes: robo, agresión física, daño grave). En caso de medida cautelar, se registra por separado.

### 3.12 Apelaciones con tracking básico
El asociado sancionado con Apercibimiento, Suspensión o Exclusión puede apelar ante la Asamblea. El sistema trackea:
- Fecha de presentación.
- Estado (Presentada / En revisión Asamblea / Resuelta).
- Fecha de resolución.
- Resultado (Sanción mantenida / Sanción modificada / Sanción revocada).
- Nueva sanción (si fue modificada).

**Efecto devolutivo:** la sanción sigue vigente mientras se resuelve la apelación (según política).

### 3.13 Escalada automática con alerta a Gerencia + RRHH

El sistema calcula el acumulado histórico de sanciones por asociado. Al alcanzar umbrales, dispara alertas:

| Umbral | Alerta | A quién |
|---|---|---|
| 1 observación por misma conducta | Sugerencia de seguimiento del supervisor | Al supervisor |
| 2 observaciones por conducta similar | Sugerencia de Apercibimiento | Al supervisor + Gerente |
| 3 apercibimientos acumulados | **Evaluación de suspensión** obligatoria | Gerencia + RRHH (reunión conjunta) |
| 5 o más apercibimientos | **Propuesta al Consejo** de suspensión/exclusión | Consejo + RRHH |
| Falta muy grave 1ra vez (robo, agresión, daño intencional) | Sumario para suspensión/exclusión directa | RRHH + Consejo |

**Importante:** el sistema **NO aplica escalada automática sin revisión humana**. Solo alerta y sugiere. La decisión es siempre humana.

### 3.14 Contador acumulativo histórico

Los apercibimientos suman siempre (no hay caducidad automática por año). Un asociado con 10 años en la cooperativa puede tener 4 apercibimientos históricos y estar cerca del umbral.

Esto es un standard estricto que se compensa con la revisión humana obligatoria antes de aplicar la escalada. Se puede revisar la política más adelante si Gabi decide agregar caducidad.

### 3.15 Catálogo de infracciones administrable por RRHH

Las 16 infracciones iniciales de la política están en el catálogo inicial (§4.5). RRHH puede:
- Agregar infracciones nuevas.
- Modificar las existentes (con vigencia temporal, política A.6).
- Desactivar (soft delete).

Cada infracción tiene:
- Categoría (Ausencias / Incumplimiento / Conductas).
- Gravedad sugerida (Leve / Moderada / Grave / Muy grave).
- Sanción sugerida 1ra vez.
- Sanción sugerida reiteración.

**No se permite "Otro libre"** — hay que agregar al catálogo antes de sancionar por algo nuevo.

### 3.16 Impacto en Competencia Anual (automático)

Al **aprobarse** una sanción, se dispara automáticamente el evento en Competencia Anual con la regla "Sanción disciplinaria". Puntajes propuestos:

| Nivel | Puntos individual | Puntos supervisor |
|---|---|---|
| 1 - Observación | -5 | 0 |
| 2 - Apercibimiento | -20 | -5 |
| 3 - Suspensión | -50 | -10 |
| 4 - Exclusión | -100 | -10 |

Estos puntajes están en la regla "Sanción disciplinaria" del catálogo de Competencia (parametrizables por RRHH).

Si la sanción se **revoca por apelación**, se reversan los movimientos de puntos (usando el `evento_id` de Competencia).

### 3.17 Impacto en Legajo del asociado

Al aprobarse una sanción (nivel 1 en adelante), se crea entrada visible en el legajo del asociado en la sección "Antecedentes disciplinarios". Muestra:
- Fecha, nivel, infracción, estado.
- Link al detalle completo de la sanción.

Al revocar por apelación, la entrada queda con badge "Revocada por apelación".

### 3.18 Impacto económico (para Liquidaciones futuro)

Si la sanción tiene descuento asociado (ejemplo: suspensión sin goce de haberes), se registra el compromiso en `descuentos_sanciones_pendientes` (tabla propia del módulo). Cuando Liquidaciones migre, consumirá esta tabla igual que en Uniformes.

### 3.19 Composición del Consejo con vigencia temporal (compartida)

Se crean **3 tablas transversales** para modelar cargos dirigenciales:
- `composicion_consejo` (Presidente / Tesorero / Secretaria).
- `composicion_sindicatura` (Síndico titular y suplente).
- `gerentes_area` (Gerente de cada área administrativa).

Todas con `vigencia_desde` y `vigencia_hasta`. Cuando roten los cargos, se cierran las vigencias viejas y se abren nuevas.

**Uso:** el módulo Sanciones (y otros a futuro como Vacaciones/Descansos) leen estas tablas para saber quiénes son los aprobadores al momento del proceso. Los movimientos históricos guardan referencia a la vigencia usada (para consultar quién aprobó qué en el pasado, aunque el Consejo haya cambiado).

### 3.20 Conflicto de intereses en el Consejo

Si un mismo asociado tiene doble rol (Gerente de área + miembro del Consejo, ejemplo: Natividad es Gerente de Finanzas Y Tesorera):
- No puede intervenir dos veces en el mismo proceso.
- Si intervino en el paso previo (como Gerente), se abstiene en el Consejo.
- Si su abstención rompe el quórum (2 de 3), se convoca reemplazo:
  - Para Suspensión: puede intervenir el Síndico como reemplazo formal (con voto excepcional).
  - Para Exclusión: dado que requiere unanimidad, si no hay reemplazo válido, el proceso se posterga hasta contar con quórum.

El sistema debe **detectar automáticamente el conflicto** al invitar a votar y bloquear el voto de la persona conflictuada.

### 3.21 Estados del proceso disciplinario

15 estados posibles, agrupados por etapa. Ver §11 para el detalle completo.


---

## 4. Modelo de datos

### 4.1 Convenciones
- `id bigserial PK`, `id_local text UNIQUE NOT NULL`, `created_at`, `updated_at`, `anulado boolean DEFAULT false`.
- Snake_case en DB, camelCase en frontend.
- Referencias por `id_local`.
- Timestamps como `timestamptz`.

### 4.2 SQL versionado

Crear `sql/v019_sanciones.sql` (o el número que corresponda). Se dividen en 2 partes: infraestructura compartida y módulo Sanciones.

**PARTE A — INFRAESTRUCTURA COMPARTIDA:**

```sql
-- v019 (Parte A) — Infraestructura compartida: cargos dirigenciales
-- Estas tablas son transversales al sistema, no solo del módulo Sanciones.
-- Modelo de vigencia temporal (política A.6).
BEGIN;

-- Áreas administrativas (catálogo fijo)
CREATE TABLE public.areas_administrativas (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  nombre                 text UNIQUE NOT NULL,  -- Operaciones / RRHH / Logística / Comercial / Finanzas
  descripcion            text,
  activa                 boolean NOT NULL DEFAULT true,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Composición del Consejo de Administración (Presidente, Tesorero, Secretaria)
CREATE TABLE public.composicion_consejo (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  rol                    text NOT NULL,   -- Presidente / Tesorero / Secretaria
  legajo_id_local        text NOT NULL,
  nombre_miembro         text NOT NULL,   -- desnormalizado para consulta rápida
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,            -- NULL = vigente
  motivo_cambio          text,            -- "Elección" / "Renuncia" / etc.
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cc_rol      ON public.composicion_consejo(rol) WHERE NOT anulado;
CREATE INDEX idx_cc_vigencia ON public.composicion_consejo(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- Composición Sindicatura (Síndico titular y suplente)
CREATE TABLE public.composicion_sindicatura (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  rol                    text NOT NULL,   -- Síndico titular / Síndico suplente
  legajo_id_local        text NOT NULL,
  nombre_miembro         text NOT NULL,
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,
  motivo_cambio          text,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cs_vigencia ON public.composicion_sindicatura(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- Gerentes de área con vigencia temporal
CREATE TABLE public.gerentes_area (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  area_id_local          text NOT NULL,   -- ref a areas_administrativas
  area_nombre            text NOT NULL,   -- desnormalizado
  legajo_id_local        text NOT NULL,
  nombre_gerente         text NOT NULL,
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,
  motivo_cambio          text,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ga_area     ON public.gerentes_area(area_nombre) WHERE NOT anulado;
CREATE INDEX idx_ga_vigencia ON public.gerentes_area(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- Extensión del legajo: campo "area" para administrativos
-- ⚠️ Este ALTER puede quedar pendiente si Fede ya tiene el campo en Legajos.
--    Si el campo no existe, es un prerequisito.
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS area text;  -- Solo para administrativos

COMMIT;

-- SEED de datos iniciales (transversal)
BEGIN;

-- 5 áreas administrativas
INSERT INTO public.areas_administrativas (id_local, nombre) VALUES
  ('area_operaciones', 'Operaciones'),
  ('area_rrhh', 'RRHH'),
  ('area_logistica', 'Logística'),
  ('area_comercial', 'Comercial'),
  ('area_finanzas', 'Finanzas');

-- Composición actual del Consejo (vigente desde fecha a definir con Lautaro)
-- ⚠️ IMPORTANTE: la fecha vigencia_desde es aproximada. Ajustarla si Lautaro tiene la fecha real de elección.
INSERT INTO public.composicion_consejo (id_local, rol, legajo_id_local, nombre_miembro, vigencia_desde) VALUES
  ('cc_presidente_actual',  'Presidente', 'TODO_legajo_id_juan_carlos_peretti',  'Juan Carlos Peretti', '2025-01-01'),
  ('cc_tesorero_actual',    'Tesorero',   'TODO_legajo_id_natividad_guillen',    'Natividad Guillen',   '2025-01-01'),
  ('cc_secretaria_actual',  'Secretaria', 'TODO_legajo_id_jorgelina_bianchi',    'Jorgelina Bianchi',   '2025-01-01');

-- Composición actual de Sindicatura
INSERT INTO public.composicion_sindicatura (id_local, rol, legajo_id_local, nombre_miembro, vigencia_desde) VALUES
  ('cs_sindico_actual', 'Síndico titular', 'TODO_legajo_id_ricardo_elicabe', 'Ricardo Elicabe', '2025-01-01');

-- Gerentes actuales por área
INSERT INTO public.gerentes_area (id_local, area_id_local, area_nombre, legajo_id_local, nombre_gerente, vigencia_desde) VALUES
  ('ga_operaciones_actual', 'area_operaciones', 'Operaciones', 'TODO_legajo_id_ricardo_elicabe',   'Ricardo Elicabe',    '2025-01-01'),
  ('ga_rrhh_actual',        'area_rrhh',        'RRHH',        'TODO_legajo_id_gabriela_lucero',   'Gabriela Lucero',    '2025-01-01'),
  ('ga_logistica_actual',   'area_logistica',   'Logística',   'TODO_legajo_id_ricardo_recalde',   'Ricardo Recalde',    '2025-01-01'),
  ('ga_comercial_actual',   'area_comercial',   'Comercial',   'TODO_legajo_id_jorgelina_bianchi', 'Jorgelina Bianchi',  '2025-01-01'),
  ('ga_finanzas_actual',    'area_finanzas',    'Finanzas',    'TODO_legajo_id_natividad_guillen', 'Natividad Guillen',  '2025-01-01');

COMMIT;
```

**PARTE B — MÓDULO SANCIONES:**

```sql
-- v019 (Parte B) — Módulo Sanciones
-- Modelo rico con 5 niveles, descargo, sumario, apelaciones.
BEGIN;

-- Tabla 1 — sanciones_disciplinarias (registro central)
CREATE TABLE public.sanciones_disciplinarias (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Sancionado
  legajo_id_local        text NOT NULL,
  nro_socio              text NOT NULL,
  nombre_sancionado      text NOT NULL,
  tipo_sancionado        text NOT NULL,       -- Operativo / Administrativo
  servicio               text,                -- si es operativo
  supervisor             text,                -- si es operativo
  area_administrativa    text,                -- si es administrativo (Operaciones/RRHH/...)
  
  -- Sanción
  nivel                  integer NOT NULL,    -- 0 (Verbal), 1 (Observación), 2 (Apercibimiento), 3 (Suspensión), 4 (Exclusión)
  nombre_nivel           text NOT NULL,
  infraccion_id_local    text NOT NULL,       -- ref a catalogo_infracciones
  nombre_infraccion      text NOT NULL,       -- desnormalizado
  categoria_infraccion   text NOT NULL,       -- Ausencias / Incumplimiento / Conductas
  gravedad               text NOT NULL,       -- Leve / Moderada / Grave / Muy grave
  
  -- Detalle del hecho
  fecha_hecho            date NOT NULL,       -- cuándo ocurrió
  fecha_deteccion        date NOT NULL,       -- cuándo se detectó/reportó
  descripcion_hecho      text NOT NULL,       -- descripción libre
  
  -- Iniciación
  propuesta_por_legajo   text NOT NULL,       -- quién la carga (supervisor / gerente / RRHH)
  propuesta_por_rol      text NOT NULL,       -- Supervisor / Gerente Operaciones / Gerente RRHH / Consejo / etc.
  fecha_iniciacion       timestamptz NOT NULL DEFAULT now(),
  
  -- Estado del proceso
  estado                 text NOT NULL DEFAULT 'Borrador',
    -- Ver §11 para lista completa
  
  -- Aprobación (para niveles 1-2)
  fecha_aprobacion       timestamptz,
  aprobada_por_legajo    text,
  aprobada_por_rol       text,                -- Gerente Operaciones / Gerente RRHH / etc.
  aprobacion_secundaria_legajo  text,         -- para nivel 2 que necesita 2 firmas
  aprobacion_secundaria_rol     text,
  fecha_aprobacion_secundaria   timestamptz,
  motivo_rechazo         text,
  
  -- Descargo
  descargo_requerido     boolean NOT NULL DEFAULT false,
  descargo_solicitado_en timestamptz,
  fecha_limite_descargo  timestamptz,         -- 48hs desde solicitud
  descargo_id_local      text,                -- ref al descargo si se presentó
  
  -- Sumario (para niveles 3-4)
  sumario_id_local       text,                -- ref al sumario si aplica
  
  -- Votación Consejo (para niveles 3-4)
  votos_favor            integer NOT NULL DEFAULT 0,
  votos_contra           integer NOT NULL DEFAULT 0,
  votos_abstencion       integer NOT NULL DEFAULT 0,
  fecha_resolucion_consejo timestamptz,
  
  -- Ejecución
  fecha_notificacion_asociado    timestamptz,
  notificacion_metodo            text,        -- Sistema / WhatsApp / Presencial
  
  -- Para suspensión
  suspension_fecha_desde         date,
  suspension_fecha_hasta         date,
  suspension_con_goce            boolean,     -- para futuro impacto en liquidaciones
  
  -- Medida cautelar (excepcional, solo para sumarios de niveles 3-4)
  medida_cautelar                boolean NOT NULL DEFAULT false,
  medida_cautelar_motivo         text,
  medida_cautelar_desde          date,
  
  -- Apelación
  apelacion_id_local     text,                -- ref si el asociado apeló
  sancion_revocada_por_apelacion  boolean NOT NULL DEFAULT false,
  fecha_revocacion       timestamptz,
  
  -- Impacto en Competencia
  evento_competencia_id_local    text,        -- ref al evento en eventos_puntos (Competencia)
  
  -- Anulación administrativa (no confundir con revocación por apelación)
  fecha_anulacion        timestamptz,
  anulada_por            text,
  motivo_anulacion       text,
  
  observaciones          text,
  editado_por            text,
  editado_en             timestamptz,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sanc_legajo  ON public.sanciones_disciplinarias(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_sanc_estado  ON public.sanciones_disciplinarias(estado) WHERE NOT anulado;
CREATE INDEX idx_sanc_nivel   ON public.sanciones_disciplinarias(nivel) WHERE NOT anulado;
CREATE INDEX idx_sanc_fecha   ON public.sanciones_disciplinarias(fecha_iniciacion) WHERE NOT anulado;

-- Tabla 2 — sancion_eventos (auditoría de transiciones)
CREATE TABLE public.sancion_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sancion_id_local       text NOT NULL,
  
  estado_desde           text,
  estado_hasta           text NOT NULL,
  ejecutado_por          text NOT NULL,
  ejecutado_rol          text,
  ejecutado_en           timestamptz NOT NULL DEFAULT now(),
  observaciones          text,
  
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_se_sancion ON public.sancion_eventos(sancion_id_local);

-- Tabla 3 — sancion_descargos
CREATE TABLE public.sancion_descargos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sancion_id_local       text NOT NULL,
  legajo_id_local        text NOT NULL,       -- del sancionado
  
  fecha_presentacion     timestamptz NOT NULL DEFAULT now(),
  medio                  text NOT NULL,       -- Sistema / WhatsApp / Presencial / Email
  descripcion            text NOT NULL,
  adjuntos               jsonb,               -- [{nombre, id_local, tipo}]
  
  registrado_por         text NOT NULL,       -- si el asociado no lo carga solo, quién lo registró
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sd_sancion ON public.sancion_descargos(sancion_id_local) WHERE NOT anulado;

-- Tabla 4 — sancion_aprobaciones (votos individuales del Consejo)
CREATE TABLE public.sancion_aprobaciones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sancion_id_local       text NOT NULL,
  
  votante_legajo_id_local text NOT NULL,
  votante_nombre         text NOT NULL,
  votante_rol            text NOT NULL,       -- Presidente / Tesorero / Secretaria / Síndico (excepcional)
  composicion_id_local   text NOT NULL,       -- ref a composicion_consejo o composicion_sindicatura al momento
  
  voto                   text NOT NULL,       -- A favor / En contra / Abstención
  motivo                 text,                -- especialmente si es Abstención por conflicto
  conflicto_intereses    boolean NOT NULL DEFAULT false,
  
  fecha_voto             timestamptz NOT NULL DEFAULT now(),
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sa_sancion ON public.sancion_aprobaciones(sancion_id_local) WHERE NOT anulado;

-- Tabla 5 — sancion_sumarios (expediente formal)
CREATE TABLE public.sancion_sumarios (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sancion_id_local       text NOT NULL,
  
  fecha_apertura         timestamptz NOT NULL DEFAULT now(),
  abierto_por            text NOT NULL,
  abierto_por_rol        text NOT NULL,
  
  fecha_limite           date NOT NULL,       -- apertura + 30 días
  
  descripcion_ampliada   text NOT NULL,       -- ampliación del hecho
  evidencia_adjuntos     jsonb,               -- [{nombre, id_local, tipo}]
  antecedentes_snapshot  jsonb,               -- copia congelada de antecedentes del asociado al momento
  testimonios            text,                -- descripción de testimonios (adjuntos por separado)
  recomendacion_sancion  text,                -- lo que propone el instructor
  
  fecha_cierre           timestamptz,
  cerrado_por            text,
  resolucion_final       text,                -- Suspensión aplicada / Exclusión aplicada / Archivado sin sanción
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sum_sancion ON public.sancion_sumarios(sancion_id_local) WHERE NOT anulado;

-- Tabla 6 — sancion_apelaciones
CREATE TABLE public.sancion_apelaciones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  sancion_id_local       text NOT NULL,
  
  fecha_presentacion     timestamptz NOT NULL DEFAULT now(),
  tipo_asamblea          text NOT NULL,       -- Ordinaria / Extraordinaria
  fundamentos            text NOT NULL,
  adjuntos               jsonb,
  
  presentada_por         text NOT NULL,       -- normalmente el sancionado o su representante
  
  estado                 text NOT NULL DEFAULT 'Presentada',
    -- Presentada / En revisión Asamblea / Resuelta
  
  -- Resolución
  fecha_resolucion       timestamptz,
  resultado              text,                -- Mantiene sanción / Modifica sanción / Revoca sanción
  nuevo_nivel            integer,             -- si modifica
  observaciones_resolucion text,
  registrado_por         text,                -- RRHH que registra el resultado (por ahora manual)
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sap_sancion ON public.sancion_apelaciones(sancion_id_local) WHERE NOT anulado;

-- Tabla 7 — catalogo_infracciones
CREATE TABLE public.catalogo_infracciones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  codigo                 text UNIQUE NOT NULL, -- INF-001, INF-002, etc.
  nombre                 text NOT NULL,
  descripcion            text,
  categoria              text NOT NULL,       -- Ausencias / Incumplimiento / Conductas
  
  activa                 boolean NOT NULL DEFAULT true,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ci_activa ON public.catalogo_infracciones(activa) WHERE NOT anulado;

-- Tabla 8 — catalogo_infracciones_versiones (con vigencia temporal, política A.6)
CREATE TABLE public.catalogo_infracciones_versiones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  infraccion_id_local    text NOT NULL,
  
  gravedad               text NOT NULL,       -- Leve / Moderada / Grave / Muy grave
  sancion_sugerida_primera_vez  integer NOT NULL,    -- nivel 1-4
  sancion_sugerida_reiteracion  integer NOT NULL,
  
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,
  cargada_por            text NOT NULL,
  motivo_carga           text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_civ_infrac    ON public.catalogo_infracciones_versiones(infraccion_id_local) WHERE NOT anulado;
CREATE INDEX idx_civ_vigencia  ON public.catalogo_infracciones_versiones(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- Tabla 9 — descuentos_sanciones_pendientes (compromisos para Liquidaciones futuro)
CREATE TABLE public.descuentos_sanciones_pendientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  sancion_id_local       text NOT NULL,
  legajo_id_local        text NOT NULL,
  
  monto_total            numeric(10,2) NOT NULL,
  descripcion            text,                -- "Suspensión sin goce de haberes 5 días" / etc.
  
  estado                 text NOT NULL DEFAULT 'Pendiente',   -- Pendiente / Aplicado / Cancelado
  fecha_generado         timestamptz NOT NULL DEFAULT now(),
  fecha_aplicacion       timestamptz,
  motivo_cancelacion     text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dsp_legajo ON public.descuentos_sanciones_pendientes(legajo_id_local) WHERE NOT anulado;

COMMIT;
```

### 4.3 Mapeo en `src/shared/supabase.js`

```javascript
// Sanciones
sancionesDisciplinarias:      'sanciones_disciplinarias',
sancionEventos:               'sancion_eventos',
sancionDescargos:             'sancion_descargos',
sancionAprobaciones:          'sancion_aprobaciones',
sancionSumarios:              'sancion_sumarios',
sancionApelaciones:           'sancion_apelaciones',
catalogoInfracciones:         'catalogo_infracciones',
catalogoInfraccionesVersiones:'catalogo_infracciones_versiones',
descuentosSancionesPendientes:'descuentos_sanciones_pendientes',

// Infraestructura compartida
areasAdministrativas:         'areas_administrativas',
composicionConsejo:           'composicion_consejo',
composicionSindicatura:       'composicion_sindicatura',
gerentesArea:                 'gerentes_area',
```

### 4.4 Catálogos hardcoded

```javascript
const NIVELES_SANCION = [
  { nivel: 0, nombre: 'Llamado verbal (informal)', requiere_descargo: false, requiere_sumario: false, registra_legajo: false },
  { nivel: 1, nombre: 'Observación', requiere_descargo: false, requiere_sumario: false, registra_legajo: true },
  { nivel: 2, nombre: 'Apercibimiento', requiere_descargo: true, requiere_sumario: false, registra_legajo: true },
  { nivel: 3, nombre: 'Suspensión', requiere_descargo: true, requiere_sumario: true, registra_legajo: true },
  { nivel: 4, nombre: 'Exclusión', requiere_descargo: true, requiere_sumario: true, registra_legajo: true }
];

const CATEGORIAS_INFRACCION = ['Ausencias e Impuntualidad', 'Incumplimiento de Tareas y Normas', 'Conductas y Comportamiento'];
const GRAVEDADES = ['Leve', 'Moderada', 'Grave', 'Muy grave'];
const TIPOS_SANCIONADO = ['Operativo', 'Administrativo'];
const AREAS_ADMINISTRATIVAS = ['Operaciones', 'RRHH', 'Logística', 'Comercial', 'Finanzas'];
const ROLES_CONSEJO = ['Presidente', 'Tesorero', 'Secretaria'];
const VOTOS = ['A favor', 'En contra', 'Abstención'];
```

### 4.5 Seed del catálogo de infracciones

Al aplicar el SQL, insertar las 16 infracciones de la política:

**Categoría: Ausencias e Impuntualidad**

| Código | Nombre | Gravedad | 1ra vez | Reiteración |
|---|---|---|---|---|
| INF-001 | Llegada tarde aislada (hasta 30 min) | Leve | 0 - Verbal | 1 - Observación |
| INF-002 | Llegadas tarde reiteradas (3+ en el mes) | Moderada | 1 - Observación | 2 - Apercibimiento |
| INF-003 | Ausencia sin aviso (1 episodio) | Moderada | 1 - Observación | 2 - Apercibimiento |
| INF-004 | Ausencias reiteradas sin justificación | Grave | 2 - Apercibimiento | 3 - Suspensión |
| INF-005 | Falsificación de planilla | Muy grave | 2 - Apercibimiento | 4 - Exclusión |

**Categoría: Incumplimiento de Tareas y Normas**

| Código | Nombre | Gravedad | 1ra vez | Reiteración |
|---|---|---|---|---|
| INF-006 | No completar tareas asignadas o planillas | Leve | 1 - Observación | 2 - Apercibimiento |
| INF-007 | Bajo rendimiento o desempeño incorrecto | Moderada | 1 - Observación | 2 - Apercibimiento |
| INF-008 | No usar uniforme o usar uniforme de otro servicio | Moderada | 1 - Observación | 2 - Apercibimiento |
| INF-009 | Incumplimiento de protocolos o normas del cliente | Grave | 2 - Apercibimiento | 3 - Suspensión |
| INF-010 | No informar necesidades del servicio | Leve | 1 - Observación | 2 - Apercibimiento |

**Categoría: Conductas y Comportamiento**

| Código | Nombre | Gravedad | 1ra vez | Reiteración |
|---|---|---|---|---|
| INF-011 | Comentarios inapropiados / rumores que generan conflicto | Moderada | 1 - Observación | 2 - Apercibimiento |
| INF-012 | Actitud inapropiada ante compañeros o superiores | Moderada | 1 - Observación | 2 - Apercibimiento |
| INF-013 | Falta de respeto al personal del cliente o de seguridad | Grave | 2 - Apercibimiento | 3 - Suspensión |
| INF-014 | Abandono de servicio sin autorización | Grave | 2 - Apercibimiento | 3 - Suspensión |
| INF-015 | Consumo de bienes del cliente sin autorización | Grave | 2 - Apercibimiento | 3 - Suspensión |
| INF-016 | Robo o apropiación de bienes | Muy grave | 3 - Suspensión | 4 - Exclusión |


---

## 5. Estructura del módulo

```
src/modules/sanciones/
├── index.js              — Re-exports y bindings al window
├── sanciones.js          — Lógica principal (renders, ABM, filtros)
├── flujo.js              — Transiciones de estado por nivel
├── descargo.js           — Gestión del descargo del asociado
├── sumario.js            — Gestión del sumario formal
├── consejo.js            — Votación del Consejo con conflicto de intereses
├── apelacion.js          — Gestión de apelaciones
├── escalada.js           — Cálculo de antecedentes y sugerencias de escalada
├── catalogo.js           — Gestión del catálogo de infracciones
├── notificaciones.js     — Notificaciones a Gerentes / asociados / Consejo
└── permisos.js           — Wrappers sobre permisos globales (o mock)
```

También conviene crear un módulo compartido para infraestructura transversal:

```
src/shared/organizacional.js
  — getGerenteAreaVigente(area, fecha)
  — getComposicionConsejoVigente(fecha)
  — getSindicoVigente(fecha)
  — detectarConflictoIntereses(sancionadoLegajoId, votanteLegajoId, procesoContextos)
```

---

## 6. Estados del proceso disciplinario

Ver §11 para el detalle completo de transiciones. Resumen:

**15 estados principales:**

| Estado | Descripción | Aplica a nivel |
|---|---|---|
| Borrador | Cargando propuesta, sin elevar | Todos |
| Pendiente aprobación 1 | Esperando primer aprobador (Gerente Op/Área) | 2, 3, 4 |
| Pendiente aprobación 2 | Esperando aprobador secundario (RRHH) | 2 |
| Pendiente descargo | 48hs de espera del descargo del asociado | 2, 3, 4 |
| Descargo recibido | Descargo presentado, esperando revisión final | 2, 3, 4 |
| Sumario abierto | Sumario en curso | 3, 4 |
| Sumario cerrado | Sumario finalizado, listo para Consejo | 3, 4 |
| Pendiente Consejo | Esperando votación del Consejo | 3, 4 |
| Aprobada | Sanción aprobada, lista para ejecutar | 1, 2, 3, 4 |
| Ejecutada | Sanción aplicada (registrada en legajo, notificada) | 1, 2, 3, 4 |
| En apelación | Asociado apeló, esperando resolución Asamblea | 2, 3, 4 |
| Revocada por apelación | Asamblea revocó la sanción | 2, 3, 4 |
| Modificada por apelación | Asamblea modificó el nivel | 2, 3, 4 |
| Rechazada | Rechazada por algún aprobador antes de ejecutar | 2, 3, 4 |
| Anulada | Anulada administrativamente por error | Todos |

Adicionalmente, para nivel 1 hay un estado especial:

| Estado | Descripción |
|---|---|
| Revertida por Gerente | El Gerente revirtió una Observación aplicada por Supervisor |

---

## 7. Tab 1 — Pendientes (bandeja por rol)

### 7.1 Qué muestra
Bandeja según rol. Cada usuario ve solo lo que le compete atender.

**Si es Supervisor:**
- Sus sanciones propuestas en Borrador.
- Sanciones que aplicó revertidas por Gerente (para revisión).

**Si es Gerente de Operaciones o Gerente de Área:**
- Observaciones aplicadas a personas bajo su responsabilidad (para revisión, con opción de revertir).
- Apercibimientos que requieren su aprobación (primer nivel).
- Sanciones donde se le solicitó opinión.

**Si es Gerente de RRHH:**
- Apercibimientos que requieren su aprobación (segundo nivel).
- Sumarios abiertos que requieren su intervención.
- Alertas de escalada (contadores de acumulación que llegaron a umbral).

**Si es Miembro del Consejo:**
- Sanciones en estado "Pendiente Consejo" que requieren su voto.
- Apelaciones que llegaron a Consejo.

**Si es Administrador total:**
- Vista completa.

### 7.2 Columnas

Sancionado · Tipo (Operativo/Administrativo) · Nivel (badge) · Infracción · Estado · Días en estado · Próxima acción · Acciones.

### 7.3 Acciones según rol y estado

- ✍️ Cargar (Supervisor sobre Borrador)
- 📤 Elevar
- ✅ Aprobar
- ❌ Rechazar con motivo
- ↩️ Revertir Observación (Gerente sobre nivel 1)
- 📝 Registrar descargo (RRHH ayuda al asociado)
- 📎 Abrir sumario (RRHH o Gerente)
- 🗳️ Votar (miembro del Consejo)
- ▶️ Ejecutar sanción aprobada
- 👁 Ver detalle

### 7.4 Filtros
Buscador, nivel (multi-select), estado, servicio, área, rango de fechas.

### 7.5 Botón "+ Nueva sanción"
Abre modal de nueva sanción (ver §10). Visible para Supervisor, Gerente Op/Área, RRHH, Consejo.

---

## 8. Tab 2 — Sanciones activas

Sanciones vigentes (Aprobadas, Ejecutadas, En apelación). No incluye histórico completo, solo lo activo.

Columnas: Sancionado · Nivel · Infracción · Fecha aplicación · Estado actual · Aprobadores · Descargo (link) · Acciones.

Filtros: buscador, nivel, servicio, área, estado, rango de fechas.

Acciones: 👁 Ver detalle · 📄 Ver descargo · 📊 Ver antecedentes del asociado.

---

## 9. Tab 3 — Sumarios en curso

Sumarios en estado "Sumario abierto". Vista específica para tracking de expedientes.

Columnas: Sancionado · Nivel propuesto · Fecha de apertura · Días transcurridos · Fecha límite (30 días desde apertura) · Estado del sumario · Instructor asignado · Acciones.

**Alerta visual** en las filas cuyo plazo esté por vencer (<7 días para límite).

Acciones: 👁 Ver expediente · 📎 Agregar evidencia · 📝 Ampliar sumario · 🏁 Cerrar sumario y elevar al Consejo.

---

## 10. Tab 4 — Historial

Todas las sanciones registradas, sin filtro temporal por default. Vista solo lectura para consulta y auditoría.

Columnas: Sancionado · Nivel · Infracción · Fecha hecho · Fecha aplicación · Estado final · Aprobadores · Apelación (si tuvo) · Acciones.

Filtros: buscador, nivel, servicio, área, año, estado, tuvo apelación.

Botón "📥 Exportar a Excel" con SheetJS.

---

## 11. Tab 5 — Apelaciones

Apelaciones activas y resueltas.

Columnas: Sancionado · Sanción original (nivel) · Fecha presentación · Tipo Asamblea · Estado · Fecha resolución · Resultado · Acciones.

Acciones: 👁 Ver apelación · 📝 Registrar resolución (RRHH cuando la Asamblea resuelve).

Filtros: estado (Presentada / En revisión / Resuelta), resultado (Mantenida / Modificada / Revocada), año.

---

## 12. Tab 6 — Catálogo de infracciones

Vista y gestión del catálogo (por RRHH).

Columnas: Código · Nombre · Categoría · Gravedad · Sanción 1ra vez · Sanción reiteración · Estado (Activa/Inactiva) · Última modificación · Acciones.

Acciones: ✏️ Editar (con vigencia temporal) · 🔄 Activar/Desactivar · 👁 Ver historial de versiones · 🗑 Anular (solo si nunca se usó).

Botón "+ Nueva infracción" para agregar tipos no contemplados.

---

## 13. Tab 7 — Estadísticas

Dashboards en tarjetas y gráficos:

**Métricas globales:**
- Total de sanciones año en curso vs año anterior.
- Sanciones por nivel (gráfico de barras).
- Sanciones por categoría (donut).
- Sanciones por área/servicio (ranking).

**Alertas activas:**
- Cantidad de asociados con 3+ apercibimientos acumulados (link al listado).
- Cantidad de asociados con 5+ apercibimientos (crítico).
- Sanciones en trámite hace más de 30 días.

**Escalada:**
- Top infracciones más frecuentes.
- Supervisores/Gerentes que más sanciones proponen.
- Tasa de apelaciones exitosas.

---

## 14. Modales del módulo

### 14.1 Modal "Nueva sanción"

Estructura en 4 secciones.

**Sección 1 — Sancionado:**

| Campo | Tipo | Obligatorio |
|---|---|---|
| Sancionado | Autocompletado sobre legajos activos | Sí |
| Nº socio | Readonly (auto) | — |
| Tipo (Operativo/Administrativo) | Readonly (auto) | — |
| Servicio (si operativo) o Área (si administrativo) | Readonly (auto) | — |
| Supervisor / Gerente responsable | Readonly (auto) | — |
| Antigüedad | Readonly | — |

**Sección 2 — Infracción:**

| Campo | Tipo | Obligatorio |
|---|---|---|
| Categoría | Select (Ausencias / Incumplimiento / Conductas) | Sí |
| Infracción específica | Select filtrado por categoría | Sí |
| Gravedad sugerida | Readonly (auto de la infracción) | — |
| Nivel sugerido 1ra vez | Readonly (auto) | — |
| Nivel sugerido reiteración | Readonly (auto) | — |

**Sección 3 — Detalle del hecho:**

| Campo | Tipo | Obligatorio |
|---|---|---|
| Fecha del hecho | Date | Sí |
| Fecha de detección | Date (default: hoy) | Sí |
| Descripción del hecho | Textarea | Sí |
| Adjuntos (evidencia inicial) | File input múltiple | No |

**Sección 4 — Sanción propuesta:**

| Campo | Tipo | Obligatorio |
|---|---|---|
| Nivel propuesto | Select (0-4) | Sí |
| Antecedentes del asociado | Auto-mostrado (readonly) | — Cuenta de sanciones históricas del asociado |
| Sugerencia del sistema | Auto (según reiteración y catálogo) | — |
| Justificación | Textarea | Sí (si nivel propuesto ≠ sugerido) |

**Alerta automática:**
Si el asociado ya tiene 3+ apercibimientos y se propone otro apercibimiento → sistema alerta "Este asociado tiene N apercibimientos previos. Considerá si corresponde iniciar sumario para suspensión."

**Botones:**
- Guardar borrador → estado 1 (Borrador).
- 📤 Elevar → según nivel, va al estado que corresponda.
- Cancelar.

### 14.2 Modal "Aprobar sanción"

Para Gerentes y RRHH al revisar sanciones pendientes de aprobación.

Muestra info completa de la sanción + antecedentes + descargo (si ya se presentó).

| Campo | Tipo |
|---|---|
| Decisión | Radio (Aprobar / Rechazar) |
| Motivo (obligatorio si rechaza) | Textarea |
| Modificar nivel propuesto | Select opcional |

### 14.3 Modal "Registrar descargo"

Presentado por el asociado (o RRHH en su nombre) durante el plazo de 48hs.

| Campo | Tipo | Obligatorio |
|---|---|---|
| Fecha de presentación | Auto (hoy) | — |
| Medio | Select (Sistema / WhatsApp / Presencial / Email) | Sí |
| Descripción del descargo | Textarea | Sí |
| Adjuntos | File input múltiple | No |
| Registrado por (si RRHH) | Auto | — |

### 14.4 Modal "Abrir sumario"

Para RRHH o Gerentes al iniciar sumario formal (niveles 3-4).

| Campo | Tipo | Obligatorio |
|---|---|---|
| Descripción ampliada del hecho | Textarea | Sí |
| Evidencia inicial | File input múltiple | Sí (al menos 1) |
| Testimonios (descripción textual) | Textarea | No |
| Instructor asignado | Autocompletado sobre legajos con rol de aprobador | Sí |
| Fecha límite del sumario | Auto (apertura + 30 días) | — |
| Antecedentes del asociado | Auto (snapshot congelado) | — |

Al guardar: crea el sumario + cambia estado de la sanción a "Sumario abierto".

### 14.5 Modal "Votación del Consejo"

Para miembros del Consejo. **Con detección de conflicto de intereses.**

Muestra info completa de la sanción + sumario + descargo.

| Campo | Tipo |
|---|---|
| Voto | Radio (A favor / En contra / Abstención) |
| Motivo (obligatorio si Abstención o En contra) | Textarea |

**Detección de conflicto:**
Si el votante intervino en el paso previo (aprobó nivel 2 como Gerente de área), el sistema **preselecciona "Abstención por conflicto de intereses"** y bloquea otras opciones. El votante debe ratificar y agregar motivo.

**Cálculo del resultado:**
- Suspensión (nivel 3): 2 votos A favor → aprobada. Contrario → rechazada.
- Exclusión (nivel 4): 3 votos A favor → aprobada. Cualquier otro → rechazada.
- Si hay abstención por conflicto y no se alcanza quórum, se convoca reemplazo (Síndico para suspensión).

### 14.6 Modal "Registrar apelación"

Cuando el asociado apela.

| Campo | Tipo | Obligatorio |
|---|---|---|
| Fecha de presentación | Auto (hoy) | — |
| Tipo Asamblea | Radio (Ordinaria / Extraordinaria) | Sí |
| Fundamentos de la apelación | Textarea | Sí |
| Adjuntos | File input múltiple | No |
| Presentada por | Auto (legajo del sancionado) | — |

Al guardar: sanción cambia a estado "En apelación".

### 14.7 Modal "Resolución de apelación"

Cuando la Asamblea resuelve (RRHH registra el resultado por ahora manual).

| Campo | Tipo | Obligatorio |
|---|---|---|
| Fecha de resolución | Date | Sí |
| Resultado | Radio (Mantiene / Modifica / Revoca) | Sí |
| Nuevo nivel (si modifica) | Select | Sí (si modifica) |
| Observaciones | Textarea | Sí |

Al guardar:
- Si Mantiene → sanción sigue en su estado actual.
- Si Modifica → estado a "Modificada por apelación" + se ajusta el nivel + se recalculan movimientos de Competencia.
- Si Revoca → estado a "Revocada por apelación" + se revierten movimientos de Competencia + se marca en el legajo como "Revocada".


---

## 15. Flujo completo por nivel

### 15.1 Flujo nivel 0 (Llamado verbal informal)

```
Supervisor detecta conducta
  ↓
Registra en el sistema (opcional) como "Llamado verbal informal"
  ↓
Directamente en estado "Ejecutada" (no requiere aprobación)
  ↓
Aparece en el legajo con badge "Registro informal — no cuenta como sanción"
```

- No genera evento en Competencia Anual.
- No suma al contador de escalada.
- Solo trazabilidad interna.

### 15.2 Flujo nivel 1 (Observación)

```
[Borrador]
  ↓ (Supervisor propone y elige "Aplicar directamente")
[Ejecutada]
  ↓ (notificación automática al Gerente responsable)
[Ejecutada + Notificación a Gerente]

En cualquier momento el Gerente puede:
  ↓ (Gerente revierte con motivo)
[Revertida por Gerente]
```

- Aplicada de inmediato.
- Notificación al Gerente responsable (automática).
- Gerente puede revertir con motivo desde su bandeja.
- Suma al contador de escalada.
- Genera evento en Competencia Anual (-5 individual).

### 15.3 Flujo nivel 2 (Apercibimiento)

```
[Borrador]
  ↓ (Supervisor/Gerente propone y eleva)
[Pendiente aprobación 1] (Gerente Op/Área revisa)
  ↓ (Aprobada) o (Rechazada)
[Pendiente descargo] → 48hs de espera
  ↓ (Descargo presentado o vencido plazo)
[Descargo recibido / Sin descargo]
  ↓ (RRHH aprueba)
[Aprobada]
  ↓ (Notificación formal al asociado)
[Ejecutada]

Alternativamente:
[Descargo recibido / Sin descargo]
  ↓ (RRHH decide mantener el apercibimiento)
[Aprobada]
  ↓ (RRHH decide rechazar por el descargo)
[Rechazada]

Después de Ejecutada, el asociado puede apelar:
[Ejecutada]
  ↓ (Asociado apela)
[En apelación] → Asamblea
  ↓ (Mantiene / Modifica / Revoca)
[Ejecutada / Modificada / Revocada]
```

### 15.4 Flujo nivel 3 (Suspensión)

```
[Borrador]
  ↓ (Gerente Op o RRHH propone y eleva)
[Sumario abierto] (RRHH abre sumario formal)
  ↓ (recopilación de evidencia, testimonios, antecedentes)
  ↓ (Solicitud de descargo)
[Pendiente descargo] → 48hs mínimo
  ↓ (Descargo recibido o vencido)
[Sumario cerrado] (RRHH cierra sumario y eleva al Consejo)
  ↓
[Pendiente Consejo]
  ↓ (Consejo vota: 2 de 3)
[Aprobada] o [Rechazada]
  ↓ (Notificación formal al asociado)
[Ejecutada]

Ejecución:
  - Fecha desde: definida al aprobar.
  - Fecha hasta: fecha desde + días de suspensión.
  - Registro en legajo.
  - Evento en Competencia (-50 individual).
  - Compromiso en descuentos_sanciones_pendientes si aplica.

Apelación posible:
[Ejecutada]
  ↓ (Asociado apela — efecto devolutivo, sanción sigue)
[En apelación]
  ↓ (Resolución de Asamblea)
[Mantenida / Modificada / Revocada]
```

**Medida cautelar excepcional (solo casos flagrantes):**
```
[Sumario abierto] + medida_cautelar = true
  ↓ (asociado apartado preventivamente)
  ↓ (proceso sigue normalmente hasta Ejecutada)
```

### 15.5 Flujo nivel 4 (Exclusión)

Similar a nivel 3 pero:
- Requiere **unanimidad del Consejo (3 de 3)**.
- Al ejecutarse, dispara baja del asociado en Legajos.
- Evento en Competencia (-100 individual).

```
[Borrador]
  ↓ (RRHH o Consejo propone y eleva)
[Sumario abierto]
  ↓ (recopilación exhaustiva)
[Pendiente descargo] → 48hs
  ↓
[Sumario cerrado]
  ↓
[Pendiente Consejo]
  ↓ (Consejo vota unánime: 3 de 3)
[Aprobada]
  ↓ (Notificación formal + inicio de baja en Legajos)
[Ejecutada]
```

### 15.6 Notificaciones por transición

Todas van a `notificaciones_sistema` (compartida con otros módulos):

| Transición | A quién | Tipo |
|---|---|---|
| 1 → Ejecutada (nivel 1) | Gerente responsable | `sancion_observacion_aplicada` |
| Gerente revierte nivel 1 | Supervisor + RRHH | `sancion_revertida_por_gerente` |
| Elevar → Pendiente aprobación 1 | Gerente responsable | `sancion_pendiente_aprobacion` |
| Pendiente descargo | Asociado sancionado | `sancion_solicitud_descargo` |
| **48hs sin descargo** | Asociado + RRHH | `sancion_alerta_descargo_vencido` |
| Descargo recibido | Aprobadores | `sancion_descargo_presentado` |
| Sumario abierto | Asociado + testigos | `sancion_sumario_iniciado` |
| Pendiente Consejo | Miembros del Consejo | `sancion_pendiente_votacion` |
| Aprobada | Asociado + Supervisor + RRHH | `sancion_aprobada` |
| Rechazada | Solicitante + Supervisor | `sancion_rechazada` |
| Ejecutada | Asociado + Supervisor + Gerente | `sancion_ejecutada` |
| Apelación presentada | RRHH + Consejo | `sancion_apelacion_presentada` |
| Resolución apelación | Asociado + Supervisor + Aprobadores | `sancion_apelacion_resuelta` |
| Alerta escalada 3+ apercibimientos | Gerencia + RRHH | `sancion_alerta_escalada_3` |
| Alerta escalada 5+ apercibimientos | Consejo + RRHH | `sancion_alerta_escalada_5` |

### 15.7 Lógica crítica: transición a "Ejecutada"

```javascript
async function ejecutarSancion(sancionId) {
  const sancion = obtenerSancion(sancionId);
  
  if (sancion.estado !== 'Aprobada') {
    throw new Error('Solo se puede ejecutar una sanción aprobada.');
  }
  
  // 1. Cambiar estado
  sancion.estado = 'Ejecutada';
  sancion.fecha_notificacion_asociado = now();
  
  // 2. Registrar en el legajo del asociado
  agregarAntecedenteDisciplinario({
    legajo_id_local: sancion.legajo_id_local,
    sancion_id_local: sancion.id_local,
    nivel: sancion.nivel,
    fecha: sancion.fecha_iniciacion,
    infraccion: sancion.nombre_infraccion,
    estado: 'Vigente'
  });
  
  // 3. Generar evento en Competencia Anual (si nivel > 0)
  if (sancion.nivel > 0 && window.generarEventoPuntosCompetencia) {
    const eventoId = await window.generarEventoPuntosCompetencia(
      'regla_sancion_disciplinaria_local_id',
      sancion.legajo_id_local,
      new Date(),
      sancion.id_local,
      `Sanción nivel ${sancion.nivel}: ${sancion.nombre_infraccion}`
    );
    sancion.evento_competencia_id_local = eventoId;
  }
  
  // 4. Registrar compromiso económico si aplica (para Liquidaciones)
  if (sancion.nivel === 3 && sancion.suspension_con_goce === false) {
    const diasSuspension = calcularDiasCorridos(sancion.suspension_fecha_desde, sancion.suspension_fecha_hasta);
    crearDescuentoSancionPendiente({
      sancion_id_local: sancion.id_local,
      legajo_id_local: sancion.legajo_id_local,
      monto_total: diasSuspension * valorDiaLegajo(sancion.legajo_id_local),
      descripcion: `Suspensión sin goce de haberes ${diasSuspension} días`
    });
  }
  
  // 5. Persistir + registrar evento + notificar
  supaSync('sancionesDisciplinarias', sancion);
  registrarEventoSancion(sancionId, 'Aprobada', 'Ejecutada', usuarioActual.nombre);
  generarNotificacion('sancion_ejecutada', sancion);
  
  toast('✅ Sanción ejecutada correctamente.');
}
```

### 15.8 Lógica crítica: cálculo de antecedentes disciplinarios

```javascript
function calcularAntecedentesDisciplinarios(legajoId) {
  const sanciones = DB.sancionesDisciplinarias.filter(s =>
    s.legajo_id_local === legajoId &&
    !s.anulado &&
    s.estado !== 'Rechazada' &&
    !s.sancion_revocada_por_apelacion
  );
  
  return {
    total: sanciones.length,
    verbal: sanciones.filter(s => s.nivel === 0).length,
    observaciones: sanciones.filter(s => s.nivel === 1).length,
    apercibimientos: sanciones.filter(s => s.nivel === 2).length,
    suspensiones: sanciones.filter(s => s.nivel === 3).length,
    exclusiones: sanciones.filter(s => s.nivel === 4).length,
    
    // Umbrales de escalada (según política, contador histórico)
    riesgo_escalada: (() => {
      const apercibimientos = sanciones.filter(s => s.nivel === 2).length;
      if (apercibimientos >= 5) return 'Crítico - propuesta al Consejo';
      if (apercibimientos >= 3) return 'Alto - evaluación obligatoria';
      if (apercibimientos >= 2) return 'Medio - próximo apercibimiento sugerido';
      return 'Normal';
    })()
  };
}
```

### 15.9 Detección de conflicto de intereses

```javascript
function detectarConflictoInteresesEnConsejo(sancionId, votanteLegajoId) {
  const sancion = obtenerSancion(sancionId);
  
  // Verificar si el votante fue aprobador en pasos previos
  const yaAprobo = 
    sancion.aprobada_por_legajo === votanteLegajoId ||
    sancion.aprobacion_secundaria_legajo === votanteLegajoId ||
    sancion.propuesta_por_legajo === votanteLegajoId;
  
  // Verificar si el votante es el sancionado (imposible pero por si acaso)
  const esElSancionado = sancion.legajo_id_local === votanteLegajoId;
  
  return {
    tiene_conflicto: yaAprobo || esElSancionado,
    motivo: yaAprobo ? 'Ya intervino en el paso previo del proceso' : (esElSancionado ? 'Es el asociado sancionado' : null)
  };
}
```

---

## 16. Integraciones con otros módulos

### 16.1 Módulo Legajos (integración desde el arranque)

**Cambios necesarios en Legajos:**
- Agregar campo `area` (para administrativos).
- Agregar sección "Antecedentes disciplinarios" que muestre las sanciones del asociado (lectura desde `sanciones_disciplinarias`).
- Al mostrar el legajo, invocar `calcularAntecedentesDisciplinarios(legajoId)` y mostrar resumen.

**Cambios necesarios al dar de baja un asociado:**
- Si la baja se dispara desde una sanción nivel 4 (Exclusión aprobada) → ejecución automática desde Sanciones.

### 16.2 Módulo Competencia Anual (integración desde el arranque)

**Regla nueva en el catálogo de Competencia:**
- Nombre: "Sanción disciplinaria".
- Origen: Ambas (Manual + Automática desde Sanciones).
- Puntajes propuestos: variable según nivel (-5, -20, -50, -100). Se debe extender la regla para soportar puntajes variables por parámetro (por ahora, se pueden crear 4 versiones o una regla por nivel).

**Alternativa simple:** crear **4 reglas separadas** en Competencia:
- "Observación disciplinaria" (nivel 1): -5 individual.
- "Apercibimiento disciplinario" (nivel 2): -20 individual, -5 supervisor.
- "Suspensión disciplinaria" (nivel 3): -50 individual, -10 supervisor.
- "Exclusión disciplinaria" (nivel 4): -100 individual, -10 supervisor.

**Hook al ejecutar sanción:**
```javascript
// En sanciones.js, al ejecutar:
if (window.generarEventoPuntosCompetencia) {
  await window.generarEventoPuntosCompetencia(reglaCorrespondiente, legajoId, fecha, sancionId, `Sanción nivel ${nivel}`);
}
```

**Al revocar por apelación:**
```javascript
// Revertir el evento en Competencia
if (window.revertirEventoPuntosCompetencia) {
  await window.revertirEventoPuntosCompetencia(evento_competencia_id_local, 'Revocada por apelación');
}
```

### 16.3 Módulo Liquidaciones (infraestructura preparada)

Al aplicar suspensión sin goce, se crea registro en `descuentos_sanciones_pendientes`. Liquidaciones lo consumirá cuando migre.

### 16.4 Módulo Vacaciones (impacto indirecto)

Al suspender un asociado, el período de suspensión NO cuenta como período trabajado para el cálculo de vacaciones. Documentar TODO para Vacaciones.

### 16.5 Sistema de notificaciones

Reutiliza `notificaciones_sistema`. Ver §15.6 para tipos generados.

### 16.6 WhatsApp (a futuro)

Cuando Meta esté destrabada:
- Notificar al asociado sobre sanciones aplicadas.
- Solicitar descargo por WhatsApp.
- Registrar el descargo desde la respuesta del asociado.

---

## 17. Etapas de implementación

### Etapa 0 — Infraestructura compartida
- Aplicar SQL Parte A (v019_sanciones_parte_a.sql o el número que corresponda).
- Cargar seed de áreas, Consejo, Sindicatura, Gerentes.
- Crear `src/shared/organizacional.js` con las funciones de consulta.
- Agregar campo `area` al legajo administrativo (si no existe).

### Etapa 1 — Base persistente (crítica)
- Aplicar SQL Parte B.
- Actualizar mapeo en `supabase.js`.
- Crear estructura del módulo `src/modules/sanciones/`.
- Cargar seed del catálogo de infracciones.
- Crear screen completo con 7 tabs (esqueleto).
- Implementar modal "Nueva sanción" con validaciones.
- Implementar flujo completo nivel 0-1 (Verbal y Observación).
- Implementar Tab 1 (Pendientes) por rol.

**Al terminar:** se pueden cargar observaciones. Gerentes las revisan.

### Etapa 2 — Apercibimientos y descargo
- Implementar flujo completo nivel 2 (Apercibimiento).
- Implementar modal "Registrar descargo".
- Implementar chequeo automático de 48hs.
- Implementar Tab 2 (Sanciones activas) y Tab 4 (Historial).

**Al terminar:** apercibimientos funcionales con descargo obligatorio.

### Etapa 3 — Suspensión y sumario
- Implementar flujo completo nivel 3 (Suspensión).
- Implementar modal "Abrir sumario" y Tab 3 (Sumarios en curso).
- Implementar modal "Votación del Consejo" con detección de conflicto.
- Alertas automáticas cuando el sumario está por vencer (30 días).

**Al terminar:** proceso completo hasta suspensiones.

### Etapa 4 — Exclusión y apelaciones
- Implementar flujo completo nivel 4 (Exclusión) con unanimidad.
- Implementar Tab 5 (Apelaciones).
- Implementar impacto de exclusión en Legajos (baja automática).

**Al terminar:** todos los niveles funcionan. Apelaciones trackeadas.

### Etapa 5 — Escalada automática y Competencia
- Implementar `calcularAntecedentesDisciplinarios` en todos los renders.
- Implementar alertas de escalada (3+, 5+ apercibimientos).
- Integrar con Competencia Anual (hooks para cada nivel).

**Al terminar:** escalada automática funciona. Competencia recibe puntos.

### Etapa 6 — Catálogo administrable y Tab 7
- Implementar Tab 6 (Catálogo) con edición y vigencia temporal.
- Implementar Tab 7 (Estadísticas) con dashboards.

### Etapa 7 — WhatsApp (espera Meta)
- Notificaciones por WhatsApp.
- Descargo por WhatsApp.

### Etapa 8 — Integración con Liquidaciones futura
- Cuando Liquidaciones migre: consumir `descuentos_sanciones_pendientes`.

---

## 18. Decisiones técnicas delegadas a Fede

### 18.1 Cálculo del "período razonable" en escalada

**Contexto:** la política dice "3 apercibimientos en un período razonable → evaluación de suspensión". "Razonable" es subjetivo.

**Opciones:**
- **A) Sin límite temporal** (acumulativo histórico, decisión de Lautaro).
- **B) Últimos 2 años.**
- **C) Último año calendario.**

**Recomendación:** A (acumulativo histórico), según decisión de Lautaro. Se puede revisar más adelante.

### 18.2 Chequeo de plazos (48hs descargo, 30 días sumario)

**Opciones:**
- **A) Check al cargar el módulo.**
- **B) Cron real (Edge Function).**

**Recomendación:** A al arrancar. Migrar a B cuando el volumen justifique.

### 18.3 Persistencia de antecedentes de asociados

**Contexto:** al abrir un sumario se guarda un snapshot de antecedentes. ¿Guardar como JSONB o recalcular al abrir?

**Recomendación:** JSONB. El snapshot es histórico y debe congelarse.

### 18.4 Detección de conflicto de intereses

**Contexto:** el sistema debe detectar automáticamente si un votante ya intervino.

**Recomendación:** implementar como función pura en `consejo.js` (ver §15.9). Se llama al abrir el modal de votación.

---

## 19. Bugs conocidos a corregir del legacy

Del inventario:

1. **Drift de schema mock ↔ código** — los 3 registros ejemplo se ven en blanco. En el rediseño se usa esquema consistente.
2. **Modal ausente** — se crea nuevo.
3. **`resolverSancion` no sincroniza** — el rediseño persiste todas las transiciones.
4. **Estados sin catálogo tipado** — se usa lista tipada (15 estados).
5. **Sin niveles** — se implementan los 5 niveles.
6. **Sin flujo de aprobación** — se implementa flujo diferenciado por nivel.
7. **Sin descargo** — se implementa.
8. **Sin sumario** — se implementa.
9. **Sin apelaciones** — se implementan.
10. **Cero integración con Competencia y Legajos** — se implementan.

---

## 20. Casos borde

### 20.1 Sanción propuesta a un asociado dado de baja
Bloqueo. Error visible al elevar: "El asociado ya no está activo. No se puede sancionar."

### 20.2 Asociado que se da de baja durante el proceso
La sanción sigue su curso. Si se aprueba, queda registrada en el legajo (aunque esté en baja). No genera evento en Competencia si el asociado no participa del torneo al momento.

### 20.3 Votación del Consejo con miembro renunciado
Si un miembro del Consejo renuncia durante la votación → se cierra su vigencia. El sistema lo detecta y solicita al reemplazo (nueva composición vigente).

### 20.4 Sanción con dos aprobadores requeridos donde uno tiene conflicto
Si el Gerente de área es el mismo asociado sancionado (imposible pero teóricamente) o tiene conflicto explícito → RRHH puede designar un reemplazo temporal.

### 20.5 Reiteración de sanciones idénticas el mismo día
Sistema permite pero muestra soft warning: "Ya existe una sanción activa por la misma infracción a este asociado hoy. ¿Confirmás?"

### 20.6 Descargo presentado después de vencido el plazo
Se acepta como "Descargo extemporáneo". Queda registrado pero no bloquea el proceso.

### 20.7 Apelación en Asamblea que no llega a tratarse
Estado "En apelación" queda abierto indefinidamente hasta que RRHH lo cierre. Alertas automáticas después de 90 días.

### 20.8 Sumario que excede los 30 días
Estado sigue "Sumario abierto" pero con alerta visual roja. RRHH puede extender el plazo con motivo (queda registrado).

### 20.9 Anulación administrativa vs revocación por apelación
Son estados distintos:
- **Anulación:** error administrativo (ejemplo: sanción cargada al asociado equivocado). Motivo obligatorio.
- **Revocación por apelación:** resolución de la Asamblea. Registro formal.

### 20.10 Aplicación de sanción cuando el catálogo cambió
Si RRHH modificó el catálogo de infracciones entre la propuesta y la ejecución, la sanción usa la versión vigente **al momento de la propuesta** (congelamiento por vigencia temporal).

---

## 21. Convenciones del proyecto

### 21.1 Del código
- Nombres en español.
- camelCase en frontend, snake_case en Supabase.
- Un commit por cambio lógico.

### 21.2 De la base de datos
- Nunca modificar SQL versionado viejo → crear `vNNN` nuevo.
- Soft delete con `anulado`.
- Guard de idempotencia en operaciones críticas.
- Historización con vigencia temporal (política A.6): catálogo de infracciones, composición Consejo, Sindicatura, Gerentes.

### 21.3 De la UI
- Toasts para feedback.
- Loading indicators si >1 segundo.
- Confirmaciones para acciones destructivas.
- Colores consistentes: rojo para sanciones activas, verde para resueltas, gris para revocadas.

### 21.4 De testing
Probar el ciclo completo:
- Cargar Observación como Supervisor → verificar notificación al Gerente + evento en Competencia.
- Gerente revierte Observación → verificar reversión en Competencia.
- Cargar Apercibimiento → validar flujo de descargo con plazo de 48hs.
- Descargo presentado o vencido → aprobación de RRHH → ejecutar.
- Cargar Suspensión → abrir sumario → cerrar sumario → Consejo vota 2 de 3 → ejecutar.
- Verificar conflicto de intereses en Consejo (Gerente que ya aprobó no puede votar).
- Cargar Exclusión → verificar unanimidad requerida.
- Apelación → resolución → verificar impacto en Competencia y Legajos.
- Escalada automática: cargar 3 apercibimientos → verificar alerta.

---

## 22. Prerequisitos importantes

Antes de que Fede arranque la implementación, tiene que estar resuelto:

**1. Legajo administrativo debe tener campo `area`.** Si no existe hoy en Legajos, es un ALTER TABLE previo. Sin este campo no funciona el flujo de administrativos.

**2. Legajos debe tener rellenados los IDs de las personas del seed** (Presidente, Tesorero, Secretaria, Síndico, Gerentes). Los TODOs en el seed SQL deben reemplazarse por IDs reales.

**3. Sistema global de permisos.** Si no existe, mock temporal en `permisos.js` con estas funciones:
- `esSupervisor(usuario)` → boolean.
- `esGerenteOperaciones(usuario)` → boolean.
- `esGerenteArea(usuario)` → área o null.
- `esGerenteRRHH(usuario)` → boolean.
- `esMiembroConsejo(usuario)` → boolean.
- `esAdminTotal(usuario)` → boolean.

**4. Módulo Competencia Anual con las reglas de sanción cargadas.** Si Competencia se implementa después, las sanciones no restan puntos hasta que se conecten los hooks.

---

## 23. FAQ

**¿El sistema aplica sanciones automáticamente?**
No. Todas las sanciones requieren propuesta y aprobación humana. La escalada automática solo emite alertas.

**¿Se puede sancionar a un Gerente o miembro del Consejo?**
Sí. La política aplica a todos los asociados. Requiere consideraciones especiales de aprobación (el Gerente de RRHH no puede aprobar sanciones a sí mismo). Documentar TODO para cuando se dé el caso.

**¿Qué pasa con las llegadas tarde reiteradas dentro de un mes?**
El sistema no cuenta automáticamente. El supervisor detecta y carga sanción por INF-002 (llegadas tarde reiteradas). No se agrega lógica de conteo automático de faltas de puntualidad — eso viene de otro módulo (Asistencia) que aún no existe.

**¿Se pueden cargar sanciones retroactivas?**
Sí. El sistema permite `fecha_hecho` en el pasado (con soft warning si es muy antigua, >30 días).

**¿Las suspensiones cortas (1-3 días) requieren sumario?**
Según la política, **todas** las suspensiones requieren sumario. No hay diferenciación por duración. Si Gabi decide flexibilizar en el futuro, se ajusta.

**¿Los llamados verbales aparecen en el ranking de Competencia?**
No. Nivel 0 no impacta en Competencia ni en la escalada.

**¿Se puede saltar niveles en casos graves?**
Sí, según la política. Un robo puede ir directamente a Suspensión o Exclusión sin pasar por Apercibimiento. El proponente elige el nivel con justificación obligatoria.

**¿Puedo tocar `src/legacy.js`?**
No. Dejar como referencia. Cuando el nuevo funcione, se remueve del menú.

**¿Puedo tocar Legajos?**
Solo lo mínimo: agregar campo `area` si no existe. Coordinar con Lautaro para cambios más profundos.

**¿Puedo tocar Competencia Anual?**
Solo agregar las reglas de sanción al seed y conectar los hooks. Coordinar con Lautaro.

---

## 24. Cierre

Este documento se construyó a partir de:
1. Inventario técnico del legacy (`docs/INVENTARIO_sanciones_legacy.md`).
2. **Política oficial de Sanciones — Coop. Ohlimpia** (Versión 1.0, Junio 2026, aprobada por Consejo).
3. Sesión de diseño con Lautaro sobre estructura organizacional, flujos por nivel, escalada, conflicto de intereses, infraestructura compartida (Consejo, Sindicatura, Gerentes).
4. Alineación con `POLITICAS_PROYECTO.md` (A.6 vigencia temporal, A.7 soft delete, A.11 rehacer sobre parchar).
5. Coherencia con módulos ya diseñados (especialmente Competencia Anual para hooks, Legajos para antecedentes).

**Este es el módulo más complejo diseñado hasta ahora.** Le gana a Competencia Anual porque:
- 5 niveles con flujos totalmente distintos.
- Descargo con plazo obligatorio.
- Sumario con expediente formal.
- Votación del Consejo con detección de conflicto de intereses.
- Apelaciones con impacto retroactivo.
- Escalada automática con umbrales.
- 9 tablas propias + 4 de infraestructura compartida.
- Múltiples integraciones (Legajos, Competencia, Liquidaciones futuro).

**Estimación de trabajo para Fede: 150-200 horas.** Se recomienda hacerlo por etapas y coordinar con Lautaro en decisiones críticas (implementación del Consejo, detección de conflicto).

**Prerequisito clave:** las tablas de infraestructura compartida (Consejo, Sindicatura, Gerentes) son transversales al sistema y benefician a Vacaciones, Descansos, Competencia y futuros módulos. Vale la pena implementarlas con cuidado.

Ante cualquier duda: preguntar antes de codear (política A.4).

**¡Disciplina, pero con debido proceso!** ⚖️
