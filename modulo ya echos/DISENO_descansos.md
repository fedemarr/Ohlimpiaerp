# Diseño del módulo Descansos — Especificación para implementación

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Descansos (sector operativo)
**Autor del diseño:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-06
**Versión:** 1.0

---

## Cómo usar este documento

Este documento es la **fuente de verdad** para implementar el módulo Descansos. Está pensado para que se pueda programar **sin necesidad de volver a preguntar** por decisiones de diseño.

Se lee de arriba hacia abajo:
- Secciones **1-3** son contexto (leer una vez).
- Sección **4** es el modelo de datos (leer y aplicar antes de codear).
- Sección **5** es la estructura de archivos.
- Secciones **6-8** son la especificación de vistas.
- Sección **9** es el modal de solicitud.
- Sección **10** es el flujo completo de aprobación.
- Secciones **11-12** son configuración e integraciones.
- Sección **13** es el plan por etapas.
- Sección **14** son bugs conocidos a corregir.
- Sección **15** son casos borde.
- Sección **16** son convenciones a respetar.
- Sección **17** son decisiones técnicas que puede tomar Fede.

**Antes de escribir cualquier código:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, el inventario técnico del módulo actual (`docs/INVENTARIO_vacaciones_descanso_legacy.md`) y el diseño del módulo Vacaciones (`docs/DISENO_vacaciones.md`) para consistencia visual y funcional.

---

## 1. Contexto del módulo

### 1.1 Qué es Ohlimpia
Ohlimpia es un ERP cooperativo para gestionar una cooperativa de trabajo de servicios de limpieza con ~500 asociados. Cubre selección, ingreso, legajos, capacitaciones, liquidaciones, clientes, económico-financiero.

### 1.2 Qué es el módulo Descansos
Es el módulo donde los supervisores solicitan **días de descanso pagos** para los operarios de su equipo. Aplica al **sector operativo** de la cooperativa (~500 personas, operarios de servicios de limpieza).

**Importante:** este módulo NO cubre a los administrativos. Los administrativos tienen su propio módulo separado llamado **Vacaciones** (ver documento aparte `DISENO_vacaciones.md`).

### 1.3 Naturaleza del beneficio

El "descanso" es un **beneficio negociado, no una obligación legal**. Sus características:

- **Es un beneficio pago:** el operario cobra la jornada completa como si hubiera trabajado sus horas normales de ese día.
- **No es un derecho automático:** requiere aprobación caso por caso.
- **Se otorga por criterios subjetivos:** conducta, antigüedad, compromiso, situaciones personales.
- **Es acotado en formato:** siempre **una semana (7 días) o dos semanas (14 días)** — nunca días sueltos.

### 1.4 El problema que resuelve

**Situación actual (antes del sistema):**
- Los operarios le piden descanso a su supervisor de manera informal.
- El supervisor eleva el pedido a Operaciones + RRHH por WhatsApp o cara a cara.
- No hay trazabilidad — nadie tiene registro de a quién se le dio descanso, cuándo, ni por qué.
- No hay política formal — se evalúa caso por caso sin criterios documentados.
- El módulo de Liquidaciones no sabe que ese día se paga aunque el operario no vaya.

**Con el módulo:**
- El pedido queda registrado con trazabilidad completa.
- Los aprobadores (Operaciones y RRHH) tienen el pedido en su bandeja de entrada.
- El calendario muestra quién está de descanso, ayudando a evitar superposiciones en el mismo servicio.
- Se prepara la infraestructura para que Liquidaciones detecte los descansos aprobados y los pague.

### 1.5 Usuarios del módulo

| Rol | Qué puede hacer |
|---|---|
| **Supervisor de equipo** (cada uno con su usuario) | Cargar y elevar pedidos de descanso para operarios de su equipo, ver el estado de sus pedidos, anular pedidos propios antes de aprobación o post-aprobación |
| **Central de Operaciones** | Puede cargar pedidos también (a nombre de un supervisor si hace falta), consultar el módulo completo |
| **Gerente de Operaciones** | Aprobar/rechazar pedidos elevados (nivel 1 del flujo) |
| **Gerente de RRHH** (Gabi) | Aprobar/rechazar pedidos que ya pasaron por Operaciones (nivel 2 del flujo) |
| **Otros roles de RRHH** (Matilde, Jimena, Martina, Naara) | Consultar el módulo completo, ver historial y calendario |
| **Administrador total** | Acceso completo |

### 1.6 Estado actual (antes de esta implementación)

El módulo existe hoy en `src/legacy.js` (líneas ~873-1093) como parte de un módulo unificado "Vacaciones y descanso" que también incluye las vacaciones administrativas.

**Problemas graves del módulo actual:**

1. **Nada persiste en Supabase.** `vacOperativo` no está mapeado en `supabase.js`. Los `supaSync` fallan silenciosamente. Todo se pierde al recargar.
2. **`cambiarEstadoVacOp` (aprobar/rechazar) ni siquiera intenta persistir.** Solo muta memoria.
3. **Acceso por índice de array** en las acciones (patrón conocido).
4. **Buscadores de la barra superior no funcionan** — llaman a funciones que leen otros IDs.
5. **Filtros muertos:** `cf-vo-fecha-sol` no se lee, `cf-vo-estado` vs `cf-vo-est` desalineados.
6. **Asteriscos de obligatorio son decorativos** — solo se valida el campo Asociado.
7. **Solo aprobación simple:** el modelo actual tiene un solo estado "Aprobado" — no refleja el flujo real de doble aprobación (Operaciones + RRHH).
8. **Se aplica siempre el mismo modelo** para descansos de "una semana" o "dos semanas" — nunca se validó que fuera obligatoriamente ese formato.

**Ver:** `docs/INVENTARIO_vacaciones_descanso_legacy.md` para el detalle exacto del código actual.

### 1.7 Objetivo de esta implementación

Rehacer el módulo operativo de cero en `src/modules/descansos/` siguiendo el patrón de módulos migrados (política **A.11**). El módulo migrado debe:

1. **Persistir TODAS las operaciones** en Supabase.
2. **Implementar el flujo secuencial completo** (Supervisor eleva → Gerente de Operaciones → Gerente de RRHH).
3. **Validar el formato de duración** (siempre 7 o 14 días, nunca otros).
4. **Alertar superposición** en el mismo servicio al Gerente de Operaciones.
5. **Preparar la infraestructura** para las notificaciones automáticas por WhatsApp al operario, supervisor y aprobadores.
6. **Preparar la integración** con Liquidaciones para que los días aprobados se paguen automáticamente.

---

## 2. Alcance de la implementación

### 2.1 Qué incluye
- Tabla `descansos` en Supabase con el modelo completo de estados.
- Módulo migrado en `src/modules/descansos/`.
- 3 tabs: Pendientes, Historial completo, Calendario.
- Modal de solicitud de descanso con validaciones reales.
- Modal de aprobar/rechazar (Operaciones y RRHH, con acciones diferenciadas).
- Modal de anulación (por el supervisor o los gerentes).
- Alerta de superposición en el mismo servicio.
- Notificaciones a la campana del sistema en cada transición.
- Integración preparada con Liquidaciones (a través de un flag).

### 2.2 Qué NO incluye (etapas futuras)
- Notificaciones automáticas por WhatsApp (espera destrabar Meta Business API).
- Política formal de cupos por operario o por supervisor (decisión: sin política, se maneja caso por caso).
- Panorama de descansos por operario (no se implementa porque no hay cupo formal).
- Cálculo automático de "conducta" o "antigüedad" para sugerir aprobación — es criterio del aprobador humano.
- Autopostulación del operario desde el bot (a futuro).

---

## 3. Decisiones tomadas

Se listan las decisiones tomadas durante la sesión de diseño. **Cada una tiene su justificación.** Fede no debe cambiarlas sin consultar.

### 3.1 Módulo separado de Vacaciones
Descansos (operativo) y Vacaciones (administrativo) son **dos módulos distintos**. Comparten poco a nivel lógica. La única cosa que comparten es el concepto de "ausencia paga con aprobación" y (a futuro) un calendario global de ausencias.

### 3.2 Duración obligatoria: 7 o 14 días
El descanso debe ser **exactamente 7 días o 14 días** (una o dos semanas). Cualquier otra duración es rechazada por el sistema al elevar.

### 3.3 Se paga la jornada completa
Cada día del descanso se paga como si el operario hubiera trabajado sus horas normales de ese día. La integración con Liquidaciones debe reflejar esto.

### 3.4 Aprobación secuencial en dos niveles
- **Nivel 1:** Gerente de Operaciones. Aprobación unipersonal.
- **Nivel 2:** Gerente de RRHH (Gabi). Aprobación unipersonal.

Solo cuando ambos aprobaron, el descanso queda aprobado.

### 3.5 Sin política de cupos ni límites
Camino A del proyecto: sistema flexible sin política impuesta. El sistema no limita:
- Cuántos descansos puede pedir un operario al año.
- Cuántos descansos puede pedir un supervisor para su equipo.
- Con cuánta anticipación mínima.

Las restricciones se aplican por criterio humano de los aprobadores.

### 3.6 Registro solo desde el sistema
Aunque el operario le pida al supervisor por WhatsApp o cara a cara, **el sistema solo registra desde el momento en que el supervisor eleva el pedido**. La conversación informal previa no se guarda.

### 3.7 Fechas cargadas manualmente
El supervisor carga desde y hasta manualmente. El sistema calcula la duración y la valida (debe ser 7 o 14 días).

### 3.8 Retorno automático (hasta + 1)
El sistema asume que el retorno al trabajo es el día siguiente al hasta. No hay un campo separado para "fecha de retorno". Si el operario no vuelve, es un problema de asistencia que se detecta en otro módulo.

### 3.9 Reemplazante opcional
El supervisor puede indicar quién cubre al operario mientras está de descanso, pero no es obligatorio. Muchas veces se cubre entre compañeros sin nombre específico.

### 3.10 Motivo obligatorio con texto libre
Al elevar el pedido, el supervisor debe escribir el motivo con sus palabras (textarea). No hay catálogo de motivos — es texto libre para dar contexto a los aprobadores.

### 3.11 Rechazo con motivo obligatorio
Tanto Operaciones como RRHH deben dar un motivo obligatorio al rechazar (textarea). El motivo queda visible en el detalle del descanso, para que el supervisor lo lea y pueda gestionar con el operario.

### 3.12 Soft warning por anticipación menor a 48hs
Si desde es en menos de 48 horas, se muestra soft warning al elevar. No bloquea.

### 3.13 Soft warning por superposición en el mismo servicio
Al momento de la aprobación del Gerente de Operaciones, si hay otros descansos aprobados que se superponen con las fechas del pedido en el mismo servicio, se muestra soft warning con el detalle de esos descansos. No bloquea.

### 3.14 Anulación por el supervisor o los gerentes
El supervisor que elevó el pedido puede anular en cualquier momento antes del inicio del descanso (con o sin motivo). Los gerentes también pueden anular con motivo obligatorio.

### 3.15 Notificaciones a la campana del sistema
Todas las transiciones importantes generan notificaciones en `notificaciones_sistema` (tabla creada en Reasignaciones — reutilizamos). Ver §10.2 para el detalle.

### 3.16 Notificaciones a futuro por WhatsApp
Cuando Meta esté destrabada, el bot notifica:
- Al operario: cuando su descanso queda aprobado o rechazado.
- Al supervisor: cuando Operaciones o RRHH aprueba/rechaza.
- Al Gerente de Operaciones: cuando hay un pedido nuevo esperando su aprobación.
- Al Gerente de RRHH: cuando Operaciones aprobó y necesita su firma.

### 3.17 Calendario global con filtro por servicio
El tab Calendario muestra por defecto todos los operarios de descanso en el mes visible (global). Con filtro por servicio, se puede acotar a un cliente específico. Cada celda muestra operario + servicio.

### 3.18 Roles de aprobación en configuración global
Los roles de "Gerente de Operaciones" y "Gerente de RRHH" NO se guardan en el legajo ni en tablas del módulo. Viven en el **sistema global de permisos y facultades** del proyecto (mismo enfoque que Vacaciones).

Si el sistema de permisos no existe aún, Fede implementa un mock temporal (ver §11).

---

## 4. Modelo de datos

### 4.1 Convenciones generales
- Todas las tablas siguen el patrón del proyecto: `id bigserial PK`, `id_local text UNIQUE NOT NULL`, `created_at`, `updated_at`, `anulado boolean DEFAULT false`.
- Uso de snake_case en base de datos.
- Timestamps como `timestamptz`.
- Referencias entre tablas por `id_local` (patrón del proyecto).

### 4.2 SQL versionado

Crear el archivo `sql/v016_descansos.sql` (o el número que corresponda si ya se aplicó v015 de Vacaciones):

```sql
-- =============================================================================
-- Migración: v016 — Módulo Descansos (sector operativo)
-- Fecha:     2026-07-06
-- Autor:     Fede (con diseño de Lautaro + Claude web)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Crea la tabla persistente del módulo Descansos migrado desde legacy.js.
-- Antes vivía en memoria (los supaSync fallaban silenciosamente porque
-- la clave 'vacOperativo' no estaba mapeada en supabase.js).
--
-- Este módulo cubre SOLO al sector operativo (operarios de servicios de
-- limpieza, ~500 personas). Los administrativos tienen su módulo aparte:
-- Vacaciones (v015_vacaciones.sql).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Tabla descansos
-- ---------------------------------------------------------------------------
CREATE TABLE public.descansos (
  id                          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local                    text UNIQUE NOT NULL,
  
  -- Operario
  legajo_id_local             text NOT NULL,         -- ref al operario
  nro_socio                   text NOT NULL,         -- desnormalizado
  nombre_operario             text NOT NULL,         -- desnormalizado
  servicio                    text NOT NULL,         -- desnormalizado, del legajo (cliente donde trabaja)
  supervisor                  text NOT NULL,         -- desnormalizado, del legajo
  
  -- Solicitud
  supervisor_solicitante      text NOT NULL,         -- quién elevó (usuario logueado)
  fecha_solicitud             timestamptz NOT NULL DEFAULT now(),
  
  -- Fechas del descanso
  fecha_desde                 date NOT NULL,
  fecha_hasta                 date NOT NULL,
  duracion_dias               integer NOT NULL,      -- 7 o 14 obligatorio
  fecha_retorno               date NOT NULL,         -- calculado: hasta + 1
  
  -- Contexto
  motivo                      text NOT NULL,         -- obligatorio, texto libre
  reemplazante_legajo_id_local text,                 -- opcional
  reemplazante_nombre         text,                  -- desnormalizado, opcional
  observaciones               text,
  
  -- Estado
  estado                      text NOT NULL DEFAULT 'Borrador',
    -- Borrador
    -- Pendiente aprobación Operaciones
    -- Pendiente aprobación RRHH
    -- Aprobado
    -- Rechazado por Operaciones
    -- Rechazado por RRHH
    -- Anulado por supervisor
    -- Anulado post-aprobación
  
  -- Aprobación Operaciones
  aprobado_por_operaciones    text,                  -- nombre del gerente
  fecha_aprobacion_operaciones timestamptz,
  motivo_rechazo_operaciones  text,
  
  -- Aprobación RRHH
  aprobado_por_rrhh           text,                  -- nombre del gerente
  fecha_aprobacion_rrhh       timestamptz,
  motivo_rechazo_rrhh         text,
  
  -- Anulación
  anulado_por                 text,                  -- quién anuló
  fecha_anulacion             timestamptz,
  motivo_anulacion            text,                  -- obligatorio si anulan los gerentes
  
  -- Auditoría
  editado_por                 text,
  editado_en                  timestamptz,
  anulado                     boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_descanso_legajo    ON public.descansos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_descanso_estado    ON public.descansos(estado) WHERE NOT anulado;
CREATE INDEX idx_descanso_desde     ON public.descansos(fecha_desde) WHERE NOT anulado;
CREATE INDEX idx_descanso_servicio  ON public.descansos(servicio) WHERE NOT anulado;
CREATE INDEX idx_descanso_supervisor ON public.descansos(supervisor) WHERE NOT anulado;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
--
-- NOTA: Este script NO crea la tabla `notificaciones_sistema` porque ya
-- debería existir del módulo Reasignaciones (v014). Si no existe aún,
-- aplicar v014 primero.
-- =============================================================================
```

### 4.3 Mapeo en `src/shared/supabase.js`

Agregar al mapa de tablas:

```javascript
descansos: 'descansos',
```

### 4.4 Catálogos hardcoded

**Estados** (constante local, para validaciones):
```javascript
const ESTADOS_DESCANSO = [
  'Borrador',
  'Pendiente aprobación Operaciones',
  'Pendiente aprobación RRHH',
  'Aprobado',
  'Rechazado por Operaciones',
  'Rechazado por RRHH',
  'Anulado por supervisor',
  'Anulado post-aprobación'
];

const ESTADOS_FINALES = [
  'Aprobado',
  'Rechazado por Operaciones',
  'Rechazado por RRHH',
  'Anulado por supervisor',
  'Anulado post-aprobación'
];

const DURACIONES_VALIDAS = [7, 14]; // días
```

---

## 5. Estructura del módulo

Crear el directorio `src/modules/descansos/`:

```
src/modules/descansos/
├── index.js              — Re-exports y bindings al window
├── descansos.js          — Lógica principal (renders, ABM, filtros)
├── aprobacion.js         — Lógica de aprobar/rechazar (Operaciones y RRHH)
├── anulacion.js          — Lógica de anular en distintos estados
├── calendario.js         — Vista de calendario mensual
└── permisos.js           — Wrappers sobre el sistema global de permisos (o mock)
```

El HTML de la pantalla puede refactorizarse del actual en `index.html`. Como el módulo actual está unificado con Vacaciones (screen `screen-vacaciones`), Fede debe **crear un screen aparte** para Descansos (`screen-descansos`) y actualizar la navegación en `state.js` y `main.js`.

---

## 6. Tab 1 — Pendientes (Bandeja de entrada)

### 6.1 Qué muestra
Bandeja de entrada personalizada según el rol del usuario logueado. Muestra solo lo que requiere su acción.

### 6.2 Contenido según rol

**Si el usuario es un Supervisor:**
- Sus propios pedidos elevados en estados no finales (Borrador, Pendiente Operaciones, Pendiente RRHH).
- Descansos aprobados de su equipo que aún no empezaron (fecha_desde > hoy), para poder anular si es necesario.

**Si el usuario es Gerente de Operaciones:**
- Pedidos en estado "Pendiente aprobación Operaciones".
- Sus propios pedidos (si el Gerente también actúa como supervisor).

**Si el usuario es Gerente de RRHH (Gabi):**
- Pedidos en estado "Pendiente aprobación RRHH".

**Si el usuario es otro rol de RRHH:**
- Vista completa de todas las pendientes (solo lectura, no puede aprobar).

**Si el usuario es Admin total:**
- Vista completa.

### 6.3 Columnas del listado

| # | Columna | Notas |
|---|---|---|
| 1 | Operario | Nombre + N° socio |
| 2 | Servicio | Chip |
| 3 | Supervisor | |
| 4 | Desde | Fecha |
| 5 | Hasta | Fecha |
| 6 | Duración | 1 semana o 2 semanas (badge de color) |
| 7 | Reemplazante | Nombre o "—" |
| 8 | Motivo | Truncado a 40 caracteres, hover muestra completo |
| 9 | Fecha solicitud | |
| 10 | Días desde solicitud | Con alerta visual (verde 0-2, amarillo 3-6, rojo 7+) |
| 11 | Estado | Badge con color |
| 12 | Progreso aprobación | Iconos (Operaciones ✅ / RRHH ⏳) |
| 13 | Acciones | Según rol y estado |

### 6.4 Acciones sobre cada fila

**Si el usuario puede aprobar** (según rol y estado):
- ✅ **Aprobar** → si Gerente de Operaciones, pasa a "Pendiente RRHH". Si Gerente de RRHH, pasa a "Aprobado".
- ❌ **Rechazar** → pide motivo obligatorio en modal.

**Si el usuario es el supervisor que elevó**:
- ✏️ Editar (solo si estado = Borrador).
- 📤 Elevar (solo si estado = Borrador).
- 🗑 Anular (si estado = Borrador o Pendiente Operaciones o Pendiente RRHH o Aprobado con `fecha_desde > hoy`).

**Cualquiera con acceso al detalle:**
- 👁 Ver detalle → modal solo lectura con todo el ciclo del pedido.

### 6.5 Filtros
- Buscador general (nombre del operario).
- Por servicio.
- Por supervisor.
- Por estado.
- Por rango de fechas (desde/hasta o fecha de solicitud).

### 6.6 Botón "+ Nuevo pedido de descanso"
Abre el modal de nuevo pedido (ver §9).

Visible para supervisores, Central de Operaciones, RRHH y Admin.

---

## 7. Tab 2 — Historial completo

### 7.1 Qué muestra
Todos los descansos, cualquier estado. Sin filtro temporal por defecto.

Es solo lectura. Las acciones (aprobar/rechazar/anular) NO se ejecutan desde acá — solo desde Tab 1.

### 7.2 Columnas
Las mismas del Tab 1, más:
- **Aprobado / Rechazado / Anulado por** (quién resolvió cada nivel).
- **Fecha de resolución** (cuándo se resolvió cada nivel).
- **Motivo** (si aplica, en el detalle).

### 7.3 Filtros
- Buscador.
- Por año.
- Por servicio.
- Por supervisor.
- Por estado (multi-select).
- Por operario.
- Por rango de fechas.

### 7.4 Acciones
Solo:
- 👁 Ver detalle.
- 🗑 Anular (si el usuario es el supervisor que elevó y el descanso todavía no empezó — mismos criterios que Tab 1).

---

## 8. Tab 3 — Calendario

### 8.1 Qué muestra
Grilla mensual con los operarios de descanso cada día.

**Por defecto muestra vista global** (todos los servicios). Con filtro por servicio, se acota a un cliente específico.

**Solo muestra descansos con estado "Aprobado".** Los que están en proceso (Pendiente Operaciones o Pendiente RRHH) no aparecen aún — para no confundir a Operaciones con ausencias que capaz no se aprueban.

### 8.2 Estructura visual
- Filas = operarios con descanso en el mes visible.
- Columnas = días 1..N del mes, con día de semana.
- Cada celda ocupada muestra: 🏖 + primeras letras del servicio (o color).
- Al lado del nombre del operario, chip pequeño con el servicio.
- Resalta hoy con borde azul.
- Fines de semana en gris de fondo.

### 8.3 Navegación
- Botones "← Anterior" / "Siguiente →" para cambiar de mes.
- Selector de mes/año directo.

### 8.4 Interacciones
- **Click en una celda ocupada** → tooltip con datos: operario, servicio, supervisor, desde, hasta, motivo.
- **Click en el nombre del operario** → abre historial filtrado.

### 8.5 Filtros
- Por servicio (por defecto: todos).
- Por supervisor.

---

## 9. Modal de nuevo pedido de descanso

### 9.1 Estructura
Modal dividido en 4 secciones.

### 9.2 Sección 1 — Operario

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Operario | Autocompletado sobre operarios activos | Sí | Filtra por operarios del sector operativo. Si el usuario es supervisor, filtra por operarios de su equipo |
| N° socio | Readonly | — | Auto al elegir operario |
| Servicio | Readonly | — | Auto del legajo |
| Supervisor | Readonly | — | Auto del legajo (usuario logueado si el usuario es el supervisor) |
| Antigüedad | Readonly | — | Calculada |

### 9.3 Sección 2 — Fechas del descanso

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Fecha desde | Date | Sí | No puede ser anterior a hoy |
| Fecha hasta | Date | Sí | Debe ser >= desde |
| Duración | Readonly calculada | — | Calculada: hasta - desde + 1. Debe ser 7 o 14 |
| Fecha de retorno | Readonly calculada | — | hasta + 1 |

Al cambiar desde o hasta, recalcular duración y retorno.

Mostrar visualmente si la duración es válida:
- Duración = 7 → badge verde "1 semana".
- Duración = 14 → badge verde "2 semanas".
- Otro valor → badge rojo "Duración inválida: debe ser 1 o 2 semanas".

### 9.4 Sección 3 — Motivo y contexto

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| Motivo del pedido | Textarea | Sí | Texto libre, contexto para los aprobadores |
| Reemplazante | Autocompletado sobre operarios del mismo servicio | No | Opcional |
| Observaciones | Textarea | No | Notas del supervisor |

### 9.5 Sección 4 — Aprobadores (informativa)

Se auto-completa mostrando:
- **Gerente de Operaciones:** nombre del sistema de permisos.
- **Gerente de RRHH:** nombre del sistema de permisos.

### 9.6 Validaciones al elevar

**Obligatorios:**
- Operario, fecha desde, fecha hasta, motivo.

**Reglas de fechas:**
- Desde no puede ser anterior a hoy.
- Hasta debe ser >= desde.
- **Duración crítica:** hasta - desde + 1 debe ser exactamente 7 o 14. Si no cumple, error: "El descanso debe ser de una semana (7 días) o dos semanas (14 días). Ajustá las fechas."
- Si desde < now() + 48hs → soft warning "Este pedido tiene menos de 48hs de anticipación. ¿Confirmás igual?"

**Reglas del operario:**
- Operario debe estar en estado 'Activo'.
- Operario debe pertenecer al sector operativo (no aplicable a administrativos).

### 9.7 Botones del modal

- **Guardar borrador** → estado Borrador. Solo el supervisor que lo creó puede editarlo después.
- **📤 Elevar para aprobación** → estado "Pendiente aprobación Operaciones". Genera notificación al Gerente de Operaciones.
- **Cancelar** → cierra sin guardar.

---

## 10. Flujo completo de aprobación

### 10.1 Diagrama del ciclo

```
[Borrador]
    │
    │  (Elevar)
    ▼
[Pendiente aprobación Operaciones]
    │
    ├─(Gerente Operaciones aprueba)──► [Pendiente aprobación RRHH]
    │                                       │
    │                                       ├─(Gerente RRHH aprueba)──► [Aprobado]
    │                                       │                              │
    │                                       │                              │  (Puede anularse antes del inicio)
    │                                       │                              ▼
    │                                       │                         [Anulado post-aprobación]
    │                                       │
    │                                       └─(Gerente RRHH rechaza)──► [Rechazado por RRHH]
    │
    ├─(Gerente Operaciones rechaza)──► [Rechazado por Operaciones]
    │
    └─(Supervisor anula)────────────────► [Anulado por supervisor]
```

### 10.2 Notificaciones por transición

Todas van a la tabla `notificaciones_sistema` con `destinatario_rol` correspondiente.

| Transición | A quién notificar | Tipo |
|---|---|---|
| Elevado (Borrador → Pendiente Operaciones) | Al Gerente de Operaciones | `descanso_solicitado` |
| Operaciones aprueba (→ Pendiente RRHH) | Al Gerente de RRHH + al supervisor | `descanso_a_rrhh` |
| Operaciones rechaza (→ Rechazado por Operaciones) | Al supervisor | `descanso_rechazado_operaciones` |
| RRHH aprueba (→ Aprobado) | Al supervisor + al operario | `descanso_aprobado` |
| RRHH rechaza (→ Rechazado por RRHH) | Al supervisor | `descanso_rechazado_rrhh` |
| Supervisor anula (→ Anulado por supervisor) | Al Gerente de Operaciones y/o RRHH (según en qué etapa estaba) | `descanso_anulado_supervisor` |
| Gerente anula post-aprobación (→ Anulado post-aprobación) | Al supervisor + al operario | `descanso_anulado_post_aprobacion` |

### 10.3 Lógica de aprobación

**Aprobación por Gerente de Operaciones:**
```javascript
function aprobarOperaciones(descansoId) {
  const descanso = obtenerDescanso(descansoId);
  
  // Guard de idempotencia
  if (descanso.estado !== 'Pendiente aprobación Operaciones') {
    throw new Error('Este descanso ya no está pendiente de aprobación de Operaciones');
  }
  
  // Guard de permisos
  if (!esGerenteDeOperaciones(usuarioActual)) {
    throw new Error('No tenés permiso para aprobar');
  }
  
  // Verificar superposición en el mismo servicio (soft warning)
  const superposiciones = buscarDescansosAprobadosSuperpuestos(
    descanso.servicio, descanso.fecha_desde, descanso.fecha_hasta
  );
  if (superposiciones.length > 0) {
    // Mostrar modal de confirmación con la lista
    if (!confirmarSuperposicion(superposiciones)) return;
  }
  
  // Ejecutar aprobación
  descanso.estado = 'Pendiente aprobación RRHH';
  descanso.aprobado_por_operaciones = usuarioActual.nombre;
  descanso.fecha_aprobacion_operaciones = now();
  
  supaSync('descansos', descanso);
  generarNotificacion('descanso_a_rrhh', descanso);
  
  toast('✅ Descanso aprobado. Esperando aprobación de RRHH.');
}
```

**Aprobación por Gerente de RRHH:** análoga, cambia `estado` a `Aprobado`, setea campos de RRHH.

### 10.4 Lógica de superposición en el mismo servicio

Al momento de la aprobación del Gerente de Operaciones:

```javascript
function buscarDescansosAprobadosSuperpuestos(servicio, desde, hasta) {
  return DB.descansos.filter(d => 
    d.servicio === servicio &&
    d.estado === 'Aprobado' &&
    !d.anulado &&
    !(d.fecha_hasta < desde || d.fecha_desde > hasta)  // hay superposición
  );
}
```

Mostrar modal con la lista de superposiciones y opciones "Confirmar aprobación" / "Cancelar".

### 10.5 Anulación

**Por el supervisor:**
- Confirmación simple (no requiere motivo).
- Solo antes de `fecha_desde`.
- Cambia estado a `Anulado por supervisor`.

**Por un gerente post-aprobación:**
- Requiere motivo obligatorio.
- Solo antes de `fecha_desde`.
- Cambia estado a `Anulado post-aprobación`.

---

## 11. Configuración del módulo

### 11.1 Dónde vive la configuración
El módulo Descansos NO tiene una pantalla de configuración propia. Los elementos que serían configurables viven en otros lados:

- **Roles de aprobación (Gerente de Operaciones, Gerente de RRHH):** en el sistema global de permisos y facultades del proyecto. Si no existe aún, mock temporal en código.
- **Servicios y supervisores:** en los catálogos existentes (`DB.servicios`, `DB.supervisores`).
- **Motivos de rechazo o anulación:** libre (textarea), no catálogo.

### 11.2 Mock temporal de permisos

**Si el sistema de permisos no existe aún**, Fede debe implementar un mock temporal en `src/modules/descansos/permisos.js`:

```javascript
// MOCK TEMPORAL - reemplazar cuando el sistema de permisos esté implementado
const MOCK_GERENTE_OPERACIONES = '[nombre a definir por Lautaro]';
const MOCK_GERENTE_RRHH = 'Gabriela Lucero';

export function esGerenteDeOperaciones(usuario) {
  return usuario.nombre === MOCK_GERENTE_OPERACIONES;
}

export function esGerenteDeRRHH(usuario) {
  return usuario.nombre === MOCK_GERENTE_RRHH;
}

export function nombreGerenteOperaciones() {
  return MOCK_GERENTE_OPERACIONES;
}

export function nombreGerenteRRHH() {
  return MOCK_GERENTE_RRHH;
}

// TODO: reemplazar todos los usos por consultas al sistema global de permisos
```

---

## 12. Integraciones con otros módulos

### 12.1 Módulo Legajos
- El módulo Descansos consulta legajos con `estado === 'Activo'` para autocompletar operarios.
- Filtra por sector operativo (los legajos administrativos no aparecen).
- Para el autocompletado del supervisor, se usan operarios del mismo servicio.

### 12.2 Módulo Liquidaciones (a futuro)
- Al aprobar un descanso, el módulo de Liquidaciones debe saber que ese operario tiene esos días como "ausencia paga con jornada completa".
- **Alcance de esta implementación:** dejar la integración preparada pero no ejecutada. Fede debe documentar en el código dónde tocaría la actualización a Liquidaciones. La integración real se hace cuando Liquidaciones esté migrado.
- Se sugiere agregar un flag `paga_jornada_completa boolean DEFAULT true` en la tabla `descansos` para que Liquidaciones detecte fácilmente los días a pagar aunque no haya asistencia física.

### 12.3 Sistema de notificaciones
Ya existe `notificaciones_sistema` (creada en Reasignaciones). Usar la misma tabla con los tipos definidos en §10.2.

### 12.4 WhatsApp (a futuro)
Cuando Meta esté destrabada:
- Notificar por WhatsApp a los destinatarios en cada transición.
- Los mensajes se generan con templates que Lautaro define después.

### 12.5 Módulo Vacaciones (paralelo)
Vacaciones y Descansos son módulos separados, pero comparten:
- La misma tabla `notificaciones_sistema`.
- El mismo concepto de "ausencia paga con aprobación".
- (A futuro) Un calendario global de ausencias como vista transversal.

Ver `docs/DISENO_vacaciones.md` para el detalle del módulo de vacaciones administrativas. Mantener consistencia visual y de patrones entre ambos módulos.

---

## 13. Etapas de implementación

### Etapa 1 — Base persistente (crítica)
- Aplicar SQL `v016_descansos.sql` en Supabase.
- Actualizar mapeo en `src/shared/supabase.js`.
- Crear estructura del módulo `src/modules/descansos/`.
- Crear screen separado en `index.html` (`screen-descansos`).
- Actualizar navegación en `state.js` y `main.js`.
- Implementar Tab 1 (Pendientes) con bandeja según rol.
- Implementar Tab 2 (Historial).
- Implementar modal de solicitud con validaciones reales.
- Implementar flujo completo de aprobación (Operaciones + RRHH secuencial).
- Implementar anulación en distintos estados.
- Implementar mock del sistema de permisos.
- Implementar alerta de superposición en el mismo servicio.

**Al terminar Etapa 1:** cualquier supervisor puede solicitar descansos, elevarlos, y el flujo completo funciona con persistencia real.

### Etapa 2 — Vistas analíticas
- Implementar Tab 3 (Calendario) con vista mensual.
- Filtro por servicio y supervisor en el calendario.

**Al terminar Etapa 2:** el módulo está funcionalmente completo.

### Etapa 3 — Notificaciones internas
- Implementar generación de notificaciones en `notificaciones_sistema` en cada transición.
- Implementar la campana del sistema si no existe aún.

**Puede hacerse en paralelo con Etapas 1 o 2.**

### Etapa 4 — Integración con Liquidaciones
- Cuando Liquidaciones esté migrado, integrar el envío de "días a pagar aunque no haya asistencia".

### Etapa 5 — WhatsApp (espera Meta)
- Envío automático de notificaciones por WhatsApp según templates.

### Etapa 6 — Integración con permisos reales
- Reemplazar el mock de permisos por consulta al sistema global cuando esté implementado.

---

## 14. Bugs conocidos a corregir

Lista clara para Fede — todos estos bugs existen en el módulo actual (Tab 2 del legacy "Vacaciones y descanso") y deben quedar resueltos en la migración:

1. **Nada persiste en Supabase** — mapear tabla, hacer `supaSync` correctamente.
2. **`cambiarEstadoVacOp` no intenta persistir** — implementar aprobación real con persistencia.
3. **Solo un estado "Aprobado"** — implementar los 8 estados del nuevo modelo.
4. **Acceso por índice de array** — usar acceso por id.
5. **Buscadores de la barra superior no funcionan** — reimplementar.
6. **Filtros muertos** — todos los filtros deben funcionar correctamente.
7. **Asteriscos decorativos** — validar todos los obligatorios.
8. **Sin validación de duración** — validar que sea 7 o 14 días.
9. **No hay alerta de superposición** — implementar en la aprobación de Operaciones.

---

## 15. Casos borde y validaciones

### 15.1 Operario ya con descanso aprobado en fechas superpuestas
- Si el supervisor intenta elevar un descanso para un operario que ya tiene otro aprobado que se superpone → error al elevar: "Este operario ya tiene un descanso aprobado del DD/MM al DD/MM. Anulá el anterior antes de solicitar uno nuevo."
- Guard: verificar solo contra descansos en estado "Aprobado" del mismo operario.

### 15.2 Operario dado de baja después de aprobar
- Si el operario se dio de baja entre la aprobación y el inicio del descanso → el sistema no puede impedir esto automáticamente porque no monitorea cambios en tiempo real.
- **Alcance:** dejar como TODO. El supervisor o RRHH tiene que anular manualmente.

### 15.3 Reemplazante que no es del mismo servicio
- Si el supervisor elige un reemplazante que no es del mismo servicio → error: "El reemplazante debe ser del mismo servicio que el operario."

### 15.4 Descanso con fecha del año siguiente
- Un supervisor puede pedir descansos para enero del año siguiente estando en octubre.
- No hay problema porque no hay cupo anual.

### 15.5 Aprobación con votos empatados
- No aplica porque la aprobación es unipersonal en cada nivel (Operaciones y RRHH).

### 15.6 Anulación de descanso ya empezado
- Si el descanso ya empezó (fecha_desde <= hoy), no se puede anular.
- Guard: si `fecha_desde <= hoy`, ocultar botón "Anular".
- Alternativa: crear un flujo aparte de "corte anticipado" — fuera del alcance de esta versión.

### 15.7 Modificar solicitud aprobada
- No se puede editar una solicitud una vez elevada.
- Si el supervisor quiere cambiar fechas, tiene que anularla y hacer una nueva.

### 15.8 Legajo del operario sin servicio cargado
- Un legajo operativo sin servicio cargado no puede solicitar descanso.
- Guard: bloquear al abrir el modal, sugerir "Contactá a RRHH para completar el legajo del operario".

### 15.9 Descanso solicitado por Central de Operaciones a nombre de un supervisor
- Central de Operaciones puede cargar pedidos a nombre de un supervisor (por ejemplo, si el supervisor está sin conexión).
- En este caso, `supervisor_solicitante` = Central de Operaciones (usuario logueado). `supervisor` = supervisor real del operario (del legajo).
- El pedido aparece en la bandeja del supervisor real también (para que sepa).

### 15.10 Motivo demasiado corto
- No se valida longitud mínima del motivo. Se confía en el criterio del supervisor.
- Los aprobadores pueden rechazar si consideran que el motivo es insuficiente.

---

## 16. Convenciones del proyecto que debe respetar

### 16.1 Del código
- **Nombres en español:** funciones, variables, tablas.
- **camelCase en frontend, snake_case en Supabase.**
- **Un commit por cambio lógico**, mensaje en español descriptivo.

### 16.2 De la base de datos
- **Nunca modificar SQL versionado viejo.** Si hay que ajustar, crear un `vNNN` nuevo.
- **Soft delete siempre** con `anulado boolean DEFAULT false`.
- **Guard de idempotencia** en operaciones críticas (aprobar, anular).

### 16.3 De la UI
- Toasts para feedback.
- Loading indicators si tarda >1 segundo.
- Confirmaciones para acciones destructivas.
- Estados con colores consistentes con Vacaciones y otros módulos.

### 16.4 De testing
- Probar manualmente:
  - Crear pedido → guardar borrador → editar → elevar.
  - Operaciones aprueba → verificar que pasa a RRHH.
  - RRHH aprueba → verificar que pasa a Aprobado.
  - Operaciones rechaza → verificar que pasa a Rechazado por Operaciones.
  - RRHH rechaza → verificar que pasa a Rechazado por RRHH.
  - Solicitar descanso con duración distinta de 7 o 14 → error de validación.
  - Solicitar descanso con menos de 48hs → soft warning.
  - Superposición con otro descanso aprobado en el mismo servicio → soft warning al aprobar Operaciones.
  - Anulación por supervisor en distintos estados.
  - Anulación post-aprobación por gerente con motivo.

---

## 17. Decisiones técnicas delegadas a Fede

### 17.1 Cómo definir el sector operativo vs administrativo del operario

**Contexto:** el módulo debe filtrar operarios (excluir administrativos).

**Opciones:**
- **A)** Campo en el legajo `sector` con dos valores ("Operativo" / "Administrativo").
- **B)** Detección por el campo `funcion` (ej: si es "Auxiliar de limpieza" es operativo, si es "Coordinador RRHH" es administrativo).
- **C)** Campo booleano `es_operativo` en el legajo.

**Recomendación:** A. Es lo más claro y explícito. Fede debe coordinar con Lautaro si el campo `sector` ya existe en el legajo o hay que agregarlo.

### 17.2 Filtro de operarios del mismo servicio para reemplazante

**Contexto:** el reemplazante debe ser del mismo servicio.

**Opciones:**
- **A)** Filtrar en el autocompletado — solo mostrar operarios del mismo servicio.
- **B)** Mostrar todos, validar al guardar.

**Recomendación:** A. Mejor UX.

### 17.3 Manejo de la conversión del legacy "vacOperativo"

**Contexto:** hay mock data en `DB.vacOperativo` en legacy.js con 5 registros de ejemplo.

**Opciones:**
- **A)** Ignorar el mock data. Empezar con tabla vacía.
- **B)** Migrar los 5 registros a la nueva tabla como referencia inicial.

**Recomendación:** A. Los datos son de prueba y no reflejan la realidad. Empezar limpio.

### 17.4 Estructura del calendario

**Contexto:** el calendario muestra operarios × días.

**Opciones para performance:**
- **A)** Renderizar todos los operarios activos, marcando los días de descanso.
- **B)** Renderizar solo los operarios que tienen algún descanso en el mes visible.

**Recomendación:** B. Con ~500 operarios, mostrar todos sería lento e innecesario.

---

## 18. Preguntas frecuentes anticipadas

**¿Puede un supervisor pedir descanso para sí mismo?**
Depende de si el supervisor está en el legajo como operativo o no. Si es operativo, sí. Si es administrativo, debe usar el módulo Vacaciones.

**¿Y si el supervisor pide para un operario que no es de su equipo?**
El sistema no lo bloquea explícitamente. Es responsabilidad del supervisor no salirse de su equipo. Los aprobadores pueden rechazar si detectan esto.

**¿Cuántos descansos puede pedir un operario al año?**
Sin límite formal. Los aprobadores deciden caso por caso.

**¿Se pueden pedir descansos para operarios de baja?**
No. El sistema valida que el operario esté 'Activo' al elevar.

**¿Puedo tocar `src/legacy.js`?**
No. Dejar la versión vieja intacta como referencia. Cuando el módulo migrado esté funcionando, se remueve la referencia del menú.

**¿Puedo tocar el módulo Legajos?**
Solo lo mínimo necesario para verificar el sector del operario. Coordinar con Lautaro antes de cambios no triviales.

**¿Cómo se relaciona con Vacaciones administrativas?**
Son módulos separados con su propia lógica. Comparten solamente:
- La misma tabla `notificaciones_sistema`.
- El mismo concepto de "ausencia paga con aprobación".
- (A futuro) Un calendario global de ausencias como vista transversal.

Ver `docs/DISENO_vacaciones.md` para el detalle del módulo de vacaciones administrativas.

**¿Qué pasa si Operaciones aprueba pero RRHH nunca aprueba?**
Sin timeout automático. Queda pendiente indefinidamente hasta que RRHH resuelva. Cuando WhatsApp esté funcionando, se enviarán recordatorios automáticos.

---

## 19. Cierre

Este documento es la base para implementar el módulo Descansos. Fue construido a partir de:

1. Inventario técnico del módulo actual en `legacy.js` (ver `docs/INVENTARIO_vacaciones_descanso_legacy.md`).
2. Sesión de diseño con Lautaro sobre el proceso real de descansos operativos, el flujo de doble aprobación (Operaciones + RRHH) y las restricciones del beneficio.
3. Alineación con las políticas del proyecto (`POLITICAS_PROYECTO.md`) y las convenciones aprendidas (`CLAUDE.md`).
4. Coherencia con el módulo Vacaciones (`docs/DISENO_vacaciones.md`) para mantener patrones consistentes.

Con este documento, Fede tiene todo lo necesario para implementar sin bloqueos. Ante cualquier duda de diseño no cubierta: **preguntar antes de codear**, siguiendo la política A.4 (diagnóstico antes de cambios).

**¡Buenos descansos!** 🏖️
