# Delta de cambios — Módulos Pedidos de Adelantos y Gestión de Adelantos v1.1

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulos afectados:** Pedidos de Adelantos (Operaciones) + Gestión de Adelantos (Finanzas)
**Autor:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-09
**Versión:** 1.1 (delta sobre lo existente)

---

## ⚠️ Cómo usar este documento

Este documento es un **delta de cambios** sobre dos módulos que **ya existen y están vinculados** en el sistema Ohlimpia:

- **Pedidos de Adelantos** — vive en la categoría **Operaciones** del menú. Es la superficie del **Supervisor** para cargar pedidos.
- **Gestión de Adelantos** — vive en la categoría **Finanzas** del menú. Es la superficie para **RRHH** (aprobar) y **Finanzas** (pagar).

Ambos módulos:
- Comparten las **mismas tablas** en la base de datos.
- Comparten el **mismo modelo de estados**.
- Comparten las **mismas notificaciones**.
- Se diferencian en **qué tabs muestran, para qué rol y con qué acciones**.

NO es un rediseño desde cero — es una consolidación y agregado de features distribuidas entre ambas superficies.

**Base del delta:**
- Módulos actuales en `src/legacy.js` con estructura funcional pero desconectada de la práctica real.
- Ver `docs/INVENTARIO_adelantos_prestamos_legacy.md` para el detalle del estado actual.

**Contexto crítico:**
- El proceso real hoy se maneja por **Excel + WhatsApp** (los supervisores piden a Natividad por WhatsApp).
- El sistema **NO se usa** (Lautaro lo armó pero nadie lo utiliza).
- **Objetivo:** activar el uso del sistema formalizando el flujo con RRHH como aprobador obligatorio antes de Finanzas.

**Antes de aplicar los cambios:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, y el inventario técnico.

---

## 1. Contexto del delta

### 1.1 Estado actual real (proceso operativo)
- Supervisores cargan pedidos en Excel a mitad de mes.
- Supervisores pasan pedidos informales a **Natividad Guillen (Gerente de Finanzas)** por WhatsApp.
- Natividad aprueba/rechaza y carga en el banco para pagar.
- El descuento se aplica en la liquidación.

### 1.2 Estado en el sistema
Del inventario técnico:

**Los módulos están repartidos en 3 superficies conectadas por los mismos datos:**
- **Pedidos de Adelantos** (Operaciones) — para el Supervisor.
- **Gestión de Adelantos** (Finanzas) — para RRHH + Finanzas.
- **Portal del asociado** — para uso futuro con WhatsApp bot (por ahora se deja como está, no se toca).

**Estados y transiciones que ya existen:**
- `Borrador → Enviada → Aprobada RRHH → Aprobada`
- Función `aprobarPlanillaRRHH` cablea el paso intermedio de RRHH.
- Pestaña "👥 Revisión RRHH" en Gestión ya existe.

**Problemas identificados:**
1. Coexiste ruta directa `Enviada → Aprobada` que saltea RRHH (`aprobarPlanillaCompleta`).
2. Persistencia parcial: solo `planillasAdelantos` y `prestamos` están en Supabase. El resto (informales, config, solicitudes de préstamo, cuenta corriente) viven solo en memoria.
3. Duplicidad: existen `DB.adelantosInformales` y `DB.planillasInformales` con esquemas distintos.
4. Descuento en Liquidaciones desacoplado (patrón repetido de Uniformes y Sanciones) — es un campo manual `lqsDescuentos.adelantos`, no viene del módulo.
5. Cruce entre módulos por `nombre` (string), no por ID.

### 1.3 Cambio de proceso que Lautaro impulsa
**Nuevo flujo:**
1. **Supervisor pide** (adelanto o préstamo) desde su módulo **Pedidos de Adelantos**.
2. **RRHH decide** desde **Gestión de Adelantos**: aprueba/rechaza. Si es préstamo, define cuotas.
3. **Finanzas ejecuta el pago** desde **Gestión de Adelantos**, tab Depósito: ve todos los aprobados por RRHH. Selecciona uno por uno o global. Puede **rechazar** si ve algo raro (monto, cuotas). El rechazo vuelve a RRHH con nota.

**Cambio de roles:**
- Antes: Natividad decidía todo (aprobar + pagar).
- Después: RRHH decide (Gabriela) + Finanzas ejecuta (Natividad).

### 1.4 Estrategia del delta

**Los dos módulos siguen siendo entradas separadas del menú.** No se unifican.

Consolidar lo que ya existe, agregar lo que falta:
- **Consolidar (afecta ambos módulos):** eliminar ruta directa, unificar duplicidades, cablear hook con Liquidaciones.
- **Agregar al módulo Gestión de Adelantos:** Tab Configuración, Tab Historial, Tab Depósito para Finanzas, panel de contexto para RRHH, alertas visuales.
- **Agregar al módulo Pedidos de Adelantos:** Vista Supervisor filtrada por equipo.
- **Preservar:** el modelo de datos existente, los estados que funcionan, el Portal del asociado (queda como está para uso futuro con bot).

---

## 2. Distribución en el menú y responsabilidades

### 2.1 Módulo "Pedidos de Adelantos" (categoría Operaciones)

**Quién lo usa:** Supervisores + Central de Operaciones.

**Tabs:**

| Tab | Descripción |
|---|---|
| Mis pedidos | Pedidos en curso del supervisor (Borradores, Enviados, En revisión RRHH, En depósito). Filtrado a su equipo. |
| Historial de mi equipo | Todos los pedidos históricos de operarios de su equipo (aprobados, rechazados, cancelados). |

**Acciones disponibles:**
- Botón "+ Nuevo pedido" (Adelanto o Préstamo).
- Editar borrador.
- Elevar pedido.
- Cancelar pedido antes de elevar.
- Ver detalle (solo lectura para pedidos ya elevados).

**Permisos:**
- Supervisor: ve solo pedidos de operarios de su equipo.
- Central de Operaciones: ve pedidos de todos los operarios (filtrable).
- Administrador total: acceso completo.

### 2.2 Módulo "Gestión de Adelantos" (categoría Finanzas)

**Quién lo usa:** RRHH + Finanzas + Administrador total.

**Tabs:**

| Tab | Descripción | Rol principal |
|---|---|---|
| 👥 Revisión RRHH | Pedidos enviados esperando aprobación de RRHH. Con panel de contexto del asociado. | RRHH |
| 🏦 Depósito | Pedidos aprobados por RRHH esperando pago. Con opción individual o bulk. | Finanzas |
| 📋 Historial | Todos los pedidos con filtros amplios. | RRHH + Finanzas + Admin |
| ⚙️ Configuración | Tope, cuotas máximas, umbrales de alerta con vigencia temporal. | RRHH |

**Acciones disponibles:**
- **RRHH en Revisión:** aprobar, rechazar con motivo, definir cuotas (si préstamo).
- **Finanzas en Depósito:** pagar individual, pagar bulk (selección múltiple), rechazar con motivo (vuelve a RRHH).
- **RRHH en Configuración:** modificar tope con vigencia temporal, ajustar cuotas máximas, umbrales.

**Permisos:**
- RRHH: acceso a Revisión, Historial, Configuración. NO ve Depósito (o lo ve solo lectura).
- Finanzas: acceso a Depósito, Historial. NO ve Configuración ni Revisión (o solo lectura).
- Administrador total: acceso completo a los 4 tabs.

### 2.3 Portal del asociado (existente, no se toca en v1.1)

**Estado:** existe hoy como tercera superficie del código pero no se usa activamente.

**Decisión:** dejarlo como está. Se activa cuando el WhatsApp bot esté funcionando para que el asociado pueda pedir adelantos directamente por WhatsApp. En esa iteración futura, se coordinará el pedido llegando al módulo Gestión de Adelantos con `origen: 'WhatsApp - asociado directo'`.

---

## 3. Cambios de v1.1

Los cambios se agrupan por prioridad de implementación.

### 🔴 Cambios estructurales (críticos)

Estos afectan tanto Pedidos de Adelantos como Gestión de Adelantos porque comparten datos.

#### Cambio 1 — Eliminar ruta directa `Enviada → Aprobada`

**Qué hay hoy:**
- Función `aprobarPlanillaCompleta` que cambia estado directamente a "Aprobada" sin pasar por "Aprobada RRHH".
- Es una ruta que saltea a RRHH.

**Qué cambia:**
- Deprecar `aprobarPlanillaCompleta` — dejarla en el código pero no invocable desde la UI.
- Forzar que todos los pedidos nuevos usen `aprobarPlanillaRRHH` (que va a `Aprobada RRHH`) seguido de `depositarPlanilla` (que va a `Aprobada`).

**Impacto en pedidos existentes:**
- Pedidos ya en estado `Aprobada` NO se tocan (respetamos histórico).
- Pedidos futuros SIEMPRE pasan por RRHH.

**Código a modificar:**
- Remover botones/handlers que llaman a `aprobarPlanillaCompleta` en la UI (afecta principalmente Gestión de Adelantos, tab histórico de Revisión RRHH).
- Marcar la función como `@deprecated` en el código con TODO para removerla en versión futura.

#### Cambio 2 — Consolidar `adelantosInformales` y `planillasInformales`

**Qué hay hoy:**
- Dos estructuras paralelas con esquemas distintos.
- La gestión opera sobre `planillasInformales`.
- `adelantosInformales` queda huérfano.

**Qué cambia:**
- Eliminar `DB.adelantosInformales` del código.
- Migrar cualquier referencia a `DB.planillasInformales`.
- Documentar en el código como fuente única.

**Riesgo:** verificar que ningún renderer/función lea de `adelantosInformales`. Si lo hace, cablearlo a `planillasInformales`.

#### Cambio 3 — Cablear descuento automático a Liquidaciones

**Qué hay hoy:**
- El descuento por adelantos en Liquidaciones es un campo manual (`lqsDescuentos.adelantos`).
- No hay conexión con estos módulos.

**Qué cambia:**
- Crear tabla `descuentos_adelantos_pendientes` (similar a `descuentos_uniforme_pendientes` de Uniformes).
- Cuando un adelanto pasa a estado `Aprobada` (después del depósito en Gestión de Adelantos → Depósito), se genera registro en esta tabla.
- Cuando un préstamo pasa a `Aprobada`, se generan N registros (uno por cuota).
- Cuando Liquidaciones se migre, consumirá esta tabla.

**SQL nuevo:**

```sql
-- v022_descuentos_adelantos.sql
BEGIN;

CREATE TABLE public.descuentos_adelantos_pendientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Origen
  tipo_origen            text NOT NULL,       -- Adelanto / Préstamo
  origen_id_local        text NOT NULL,       -- ref al pedido de adelanto o préstamo
  
  -- Asociado
  legajo_id_local        text NOT NULL,
  nro_socio              text NOT NULL,
  nombre_asociado        text NOT NULL,
  
  -- Descuento
  monto                  numeric(10,2) NOT NULL,
  periodo_descuento      text NOT NULL,       -- YYYY-MM que corresponde
  
  -- Para préstamos: número de cuota
  numero_cuota           integer,             -- NULL si es adelanto (1 sola cuota)
  cuotas_totales         integer,             -- para préstamos
  
  estado                 text NOT NULL DEFAULT 'Pendiente',
    -- Pendiente / Aplicado / Cancelado
  
  fecha_generado         timestamptz NOT NULL DEFAULT now(),
  fecha_aplicacion       timestamptz,
  aplicado_por           text,
  motivo_cancelacion     text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dap_legajo  ON public.descuentos_adelantos_pendientes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_dap_periodo ON public.descuentos_adelantos_pendientes(periodo_descuento) WHERE NOT anulado;
CREATE INDEX idx_dap_origen  ON public.descuentos_adelantos_pendientes(origen_id_local) WHERE NOT anulado;
CREATE INDEX idx_dap_estado  ON public.descuentos_adelantos_pendientes(estado) WHERE NOT anulado;

COMMIT;
```

#### Cambio 4 — Mapear tablas faltantes en Supabase

**Qué hay hoy:**
- Solo `planillasAdelantos` y `prestamos` van a Supabase.
- Persistencia parcial: config, solicitudes de préstamo, informales, cuenta corriente viven solo en memoria.

**Qué cambia:**
Mapear en `src/shared/supabase.js`:

```javascript
// Existentes
planillasAdelantos:            'planillas_adelantos',
prestamos:                     'prestamos',

// Agregar
planillasInformales:           'planillas_informales',
solicitudesPrestamo:           'solicitudes_prestamo',
cuentaCorrienteAsociados:      'cuenta_corriente_asociados',
configuracionAdelantosPrestamos:'configuracion_adelantos_prestamos',
topesAdelantosVersiones:       'topes_adelantos_versiones',
descuentosAdelantosPendientes: 'descuentos_adelantos_pendientes',
```

**Crear tablas nuevas en Supabase** (SQL adicional):

```sql
-- v023_persistir_adelantos.sql
BEGIN;

CREATE TABLE public.planillas_informales (
  -- Estructura similar a planillas_adelantos pero para pedidos informales
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  -- ... resto de campos igual a planillas_adelantos
);

CREATE TABLE public.solicitudes_prestamo (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  -- ... campos según lo que use el código actual
);

CREATE TABLE public.cuenta_corriente_asociados (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  legajo_id_local        text NOT NULL,
  -- ... campos según lo que use el código actual
);

CREATE TABLE public.configuracion_adelantos_prestamos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  clave                  text UNIQUE NOT NULL,   -- tope_adelanto / max_cuotas / umbral_alerta_pedidos_mes
  valor                  text NOT NULL,
  descripcion            text,
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,
  modificado_por         text,
  modificado_en          timestamptz NOT NULL DEFAULT now(),
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.topes_adelantos_versiones (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  monto_tope             numeric(10,2) NOT NULL,
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,
  cargado_por            text NOT NULL,
  motivo                 text,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMIT;

-- SEED de configuración inicial
BEGIN;
INSERT INTO public.topes_adelantos_versiones (id_local, monto_tope, vigencia_desde, cargado_por, motivo) VALUES
  ('tope_inicial_2026', 50000, '2026-01-01', 'Sistema', 'Carga inicial');

INSERT INTO public.configuracion_adelantos_prestamos (id_local, clave, valor, descripcion, vigencia_desde) VALUES
  ('cfg_max_cuotas',            'max_cuotas',              '12',  'Máximo de cuotas para préstamos (soft warning)', '2026-01-01'),
  ('cfg_umbral_alerta_pedidos', 'umbral_alerta_pedidos',   '3',   'Cantidad de pedidos por mes que gatilla alerta a RRHH', '2026-01-01');
COMMIT;
```

**Nota importante:** Fede debe revisar el código actual y ajustar la estructura exacta de las tablas según los campos que ya usan las funciones existentes. El SQL de arriba es guía — la estructura real debe salir del código.

---

### 🟡 Cambios de agregado en Gestión de Adelantos (Finanzas)

#### Cambio 5 — Tab de Configuración (en Gestión de Adelantos)

**Qué hay hoy:**
- No existe una vista de configuración administrable.
- El tope de $50.000 está hardcoded o en `DB` sin UI para modificarlo.

**Qué cambia:**
Nuevo tab en Gestión de Adelantos (solo visible para RRHH y Administrador total): **⚙️ Configuración**.

**Contenido:**

**Sección A — Tope de adelanto:**
- Monto actual vigente: $XX.XXX
- Botón "Ver historial" — muestra todas las versiones con fecha y motivo.
- Botón "✏️ Modificar tope" — abre modal con:
  - **Tipo de cambio:** Radio (Corregir error / Cambio con vigencia).
  - Nuevo monto.
  - Vigencia desde (solo si cambio con vigencia).
  - Motivo (obligatorio).

**Sección B — Máximo de cuotas de préstamos:**
- Valor actual.
- Botón editar (mismo patrón).

**Sección C — Umbral de alerta de pedidos por mes:**
- Valor actual (default 3).
- Botón editar.

**Notas visibles:**
- "El tope actúa como referencia. Los supervisores pueden cargar montos mayores pero se marcan para revisión especial de RRHH."
- "El máximo de cuotas es soft warning. RRHH puede aprobar préstamos con más cuotas justificando el motivo."

#### Cambio 6 — Tab de Historial (en Gestión de Adelantos)

**Qué hay hoy:**
- Los pedidos aprobados/rechazados quedan en la lista general pero sin filtros claros.

**Qué cambia:**
Nuevo tab **📋 Historial** en Gestión de Adelantos (visible para RRHH, Finanzas y Administrador total).

**Contenido:**
Tabla con TODOS los pedidos (aprobados, rechazados, cancelados) sin filtro de tiempo por default.

**Columnas:**
- Fecha del pedido.
- Tipo (Adelanto formal / Adelanto informal / Préstamo).
- Asociado.
- Supervisor que hizo el pedido.
- Monto.
- Cuotas (si aplica).
- Estado final.
- Aprobado/rechazado por (RRHH y Finanzas).
- Motivo de rechazo (si aplica).
- Fecha de pago (si se pagó).
- Acciones.

**Filtros:**
- Buscador por nombre de asociado.
- Por tipo.
- Por estado final.
- Por supervisor.
- Por rango de fechas.
- Por servicio.

**Acciones por fila:**
- 👁 Ver detalle completo.
- 📥 Exportar seleccionados a Excel.

**Botón "📥 Exportar todo a Excel".**

#### Cambio 7 — Panel de contexto del asociado en Revisión RRHH

**Qué hay hoy:**
- Modal de aprobación en tab Revisión RRHH muestra datos básicos del pedido.

**Qué cambia:**
Modal de aprobación amplía con **panel lateral de contexto del asociado**.

**Contenido del panel:**

**Sección A — Datos del asociado:**
- Nombre + Nº socio + antigüedad.
- Categoría y servicio.
- Supervisor asignado.

**Sección B — Historial de adelantos y préstamos (últimos 6 meses):**
- Cantidad de adelantos aprobados.
- Cantidad rechazados.
- Monto total tomado.
- Préstamos activos con cuotas pendientes.
- Total mensual comprometido en cuotas.

**Sección C — Sanciones activas** (leer del módulo Sanciones):
- Cantidad de sanciones vigentes.
- Nivel más alto.
- Si tiene apercibimientos acumulados (para alertar).

**Sección D — Estado médico** (leer del módulo Enfermos):
- Si tiene caso activo.
- Tipo y fecha de inicio.

**Sección E — Alertas visuales:**
- 🟢 "Sin observaciones."
- 🟡 "3 pedidos este mes" (si superó umbral configurado).
- 🟡 "SUPERA TOPE VIGENTE de $X" (si el monto pedido supera el tope).
- 🔴 "Suspensión activa por sanción" (si tiene).
- 🔴 "En tratamiento médico activo" (si tiene caso abierto en Enfermos).

**Comportamiento:**
- Todas las alertas son informativas.
- RRHH decide en base a la información.
- No bloquean la aprobación.

#### Cambio 8 — Tab de Depósito para Finanzas (en Gestión de Adelantos)

**Qué hay hoy:**
- Función `depositarPlanilla` existe pero sin tab dedicado.

**Qué cambia:**
Nuevo tab **🏦 Depósito** en Gestión de Adelantos (visible solo para Finanzas y Administrador total).

**Contenido:**

**Tabla con pedidos en estado "Aprobada RRHH":**
- Fecha de aprobación RRHH.
- Asociado.
- Tipo.
- Monto.
- Cuotas (si préstamo).
- Aprobado por (RRHH).
- Checkbox para selección.

**Acciones:**
- 💰 **Pagar seleccionados** (bulk) → cambia todos los seleccionados a estado `Aprobada` + genera compromisos en `descuentos_adelantos_pendientes`.
- 💰 **Pagar individual** por fila.
- ❌ **Rechazar** por fila — abre modal con motivo obligatorio → el pedido vuelve a estado "Rechazada por Finanzas — revisión RRHH pendiente".

**Sobre el rechazo de Finanzas:**

Como decidimos: el pedido rechazado por Finanzas vuelve a RRHH con nota "Finanzas rechazó por [motivo]". RRHH puede:
- Ajustar y volver a aprobar (nuevo ciclo).
- Rechazar definitivamente.

**Modal de rechazo por Finanzas:**

| Campo | Tipo |
|---|---|
| Motivo del rechazo | Textarea (obligatorio) |
| Sugerencia de cambio | Textarea (opcional) |

Al confirmar:
- Pedido pasa a estado "Rechazada por Finanzas — revisión RRHH pendiente".
- Notificación automática a RRHH.
- El motivo queda visible en el historial del pedido.
- El pedido reaparece en el tab Revisión RRHH con badge "Devuelto por Finanzas".

---

### 🟡 Cambios de agregado en Pedidos de Adelantos (Operaciones)

#### Cambio 9 — Vista Supervisor filtrada por equipo

**Qué hay hoy:**
- Tab "Pedidos" muestra pedidos según lógica actual.

**Qué cambia:**
Cuando el usuario logueado es supervisor:
- El tab "Mis pedidos" filtra automáticamente por operarios de su equipo.
- El tab "Historial de mi equipo" muestra todos los pedidos históricos de su equipo.
- Ve todos los pedidos de su equipo, incluso si él no los cargó (futuro: cuando el asociado los cargue por WhatsApp bot).

**Nota importante:**
- El supervisor NO ve tabs de RRHH ni Finanzas (viven en el otro módulo).
- Solo tiene acceso a su propio módulo de Pedidos de Adelantos.

#### Cambio 10 — Mostrar supervisor en pedidos que ve RRHH

**Qué hay hoy:**
- No queda claro en la vista de RRHH qué supervisor originó el pedido.

**Qué cambia:**
En todas las vistas de RRHH (Gestión de Adelantos → Revisión RRHH y Historial), agregar columna visible **"Supervisor que pidió"**.

**Al cargar el pedido (en Pedidos de Adelantos):**
- El campo `supervisor_solicitante` se guarda automáticamente con el nombre del supervisor logueado.
- Si el pedido lo carga RRHH directamente (excepcional), queda "Carga directa RRHH".
- Si a futuro lo carga el asociado por WhatsApp, queda "Carga directa asociado (WhatsApp)".

#### Cambio 11 — Alertas visuales por tope y frecuencia

**Qué hay hoy:**
- El sistema no marca visualmente cuando un pedido supera el tope o cuando el asociado tiene muchos pedidos.

**Qué cambia:**
En la vista de RRHH (Gestión de Adelantos → Revisión RRHH):

**Badge por fila cuando aplica:**
- 🟡 "SUPERA TOPE" (rojo si supera >2x el tope).
- 🟡 "3+ pedidos este mes".

Al hacer click en el badge, ve el detalle: cuánto supera, historial reciente.

En la vista de Supervisor (Pedidos de Adelantos → Mis pedidos):
- Al cargar un pedido que supera el tope, se muestra alerta en el modal: "Este monto supera el tope vigente de $X. RRHH lo tratará como autorización especial."

---

### 🟢 Cambios de consolidación menor

#### Cambio 12 — Persistencia de rechazo con motivo

**Qué hay hoy:**
- La función `rechazarPlanillaRRHH` cambia estado a "Rechazada" pero no siempre persiste el motivo estructurado.

**Qué cambia:**
- Al rechazar, motivo obligatorio.
- Guardar en `pedido.motivo_rechazo_rrhh` (campo dedicado).
- Persistir en Supabase (`supaSync`).

Lo mismo para rechazo de Finanzas: `pedido.motivo_rechazo_finanzas`.

#### Cambio 13 — Historial de estados por pedido

**Qué hay hoy:**
- Los estados cambian pero no hay auditoría de quién y cuándo.

**Qué cambia:**
Nueva tabla `pedidos_adelantos_eventos`:

```sql
CREATE TABLE public.pedidos_adelantos_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  pedido_id_local        text NOT NULL,
  tipo_pedido            text NOT NULL,       -- Adelanto / Préstamo
  
  estado_desde           text,
  estado_hasta           text NOT NULL,
  ejecutado_por          text NOT NULL,
  ejecutado_rol          text,
  ejecutado_en           timestamptz NOT NULL DEFAULT now(),
  observaciones          text,
  
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pae_pedido ON public.pedidos_adelantos_eventos(pedido_id_local);
```

Cada transición de estado se registra. Auditoría completa. Los eventos son visibles tanto en Pedidos de Adelantos (para el supervisor ver cómo va) como en Gestión de Adelantos (para RRHH y Finanzas).

---

## 4. Modelo de flujo actualizado

### 4.1 Diagrama del ciclo

```
[Borrador]                             ← creado en Pedidos de Adelantos
    ↓ (Supervisor eleva)
[Enviada]
    ↓ (RRHH aprueba en Gestión → Revisión RRHH)
[Aprobada RRHH]
    ↓ (Finanzas paga en Gestión → Depósito)
[Aprobada]
    → Genera compromiso en descuentos_adelantos_pendientes

Rutas alternativas:
[Enviada]
    ├─(RRHH rechaza)──────────────────────────→ [Rechazada RRHH]
[Aprobada RRHH]
    ├─(Finanzas rechaza)──────────────────────→ [Rechazada Finanzas]
                                                  ↓ (RRHH ajusta)
                                                [Enviada] (nuevo ciclo)
    └─(Cancelar por Supervisor)──────────────→ [Cancelada]
```

### 4.2 Estados definitivos

| Estado | Descripción | Dónde vive |
|---|---|---|
| Borrador | Supervisor cargando | Pedidos de Adelantos |
| Enviada | Elevada, esperando RRHH | Ambos módulos |
| Aprobada RRHH | RRHH aprobó, esperando Finanzas | Ambos módulos |
| Aprobada | Finanzas pagó | Ambos módulos |
| Rechazada RRHH | RRHH rechazó | Ambos módulos |
| Rechazada Finanzas | Finanzas rechazó, vuelve a RRHH | Gestión de Adelantos |
| Cancelada | Cancelada por Supervisor antes de elevar | Pedidos de Adelantos |

---

## 5. Integraciones

### 5.1 Liquidaciones (a futuro)

Al aprobar (estado `Aprobada` post-Finanzas, en Gestión de Adelantos → Depósito):

**Para Adelantos:**
- Se crea 1 registro en `descuentos_adelantos_pendientes` con:
  - `tipo_origen = 'Adelanto'`.
  - `numero_cuota = NULL`.
  - `periodo_descuento = mes de la próxima liquidación`.

**Para Préstamos:**
- Se crean N registros (uno por cuota):
  - `tipo_origen = 'Préstamo'`.
  - `numero_cuota = 1, 2, 3...`.
  - `periodo_descuento` distribuido en meses consecutivos empezando por el próximo.

Cuando Liquidaciones migre, consultará estos registros para aplicar los descuentos.

### 5.2 Módulo Sanciones (lectura desde Gestión de Adelantos)

Para el panel de contexto del asociado en Revisión RRHH, leer:
```javascript
if (window.sancionesAPI) {
  const antecedentes = window.sancionesAPI.calcularAntecedentesDisciplinarios(legajoId);
  // Mostrar: total, apercibimientos, suspensiones, nivel más alto, si tiene suspensión activa
}
```

### 5.3 Módulo Enfermos y Accidentes (lectura desde Gestión de Adelantos)

Para el panel de contexto en Revisión RRHH, leer:
```javascript
if (window.enfermosAccidentesAPI) {
  const casoActivo = window.enfermosAccidentesAPI.obtenerCasoActivo(legajoId);
  // Si hay caso activo, mostrar tipo, fecha inicio, estado del certificado
}
```

### 5.4 Módulo Categorías (lectura desde ambos módulos)

Para futuras versiones donde el tope pueda depender de la categoría:
```javascript
// Preparado pero no usado en v1.1
window.categoriasAPI.obtenerCategoriaLegajo(legajoId);
```

### 5.5 Portal del asociado (existente, futuro con WhatsApp bot)

**Estado actual:** existe como tercera superficie del código. NO se modifica en v1.1.

**Futuro con Meta destrabada:**
- El asociado podrá pedir adelanto por WhatsApp.
- El bot cargará el pedido con `origen: 'WhatsApp - asociado directo'`.
- El pedido igual pasa por RRHH → Finanzas.
- El Portal del asociado se activa como interfaz complementaria.

---

## 6. Etapas de implementación

### Etapa 1 — Consolidación estructural (crítica)
Afecta ambos módulos (comparten datos).

- Cambio 1: eliminar ruta directa.
- Cambio 2: consolidar informales.
- Cambio 4: mapear tablas faltantes en Supabase.
- Cambio 12: persistencia de motivo de rechazo.
- Cambio 13: tabla de eventos para auditoría.

**Al terminar:** ambos módulos funcionan correctamente con el flujo obligatorio Supervisor → RRHH → Finanzas.

### Etapa 2 — Configuración y Depósito (Gestión de Adelantos)
- Cambio 5: Tab Configuración.
- Cambio 8: Tab Depósito para Finanzas.
- Cambio 10: Supervisor visible en pedidos.
- Cambio 11: Alertas visuales por tope y frecuencia.

**Al terminar:** RRHH configura el sistema, Finanzas ejecuta pagos ordenadamente.

### Etapa 3 — Contexto e Historial
- Cambio 6: Tab Historial con filtros (Gestión de Adelantos).
- Cambio 7: Panel de contexto en modal de aprobación (Gestión de Adelantos).
- Cambio 9: Vista supervisor filtrada (Pedidos de Adelantos).

**Al terminar:** el ciclo completo con toda la información necesaria para decidir.

### Etapa 4 — Cableado con Liquidaciones
- Cambio 3: hook automático a Liquidaciones (tabla `descuentos_adelantos_pendientes`).

**Al terminar:** los descuentos fluyen automáticamente a la liquidación cuando migre.

### Etapa 5 — Migración a `src/modules/`
- Extraer los módulos de `legacy.js` a:
  - `src/modules/pedidos_adelantos/` (para el módulo de Operaciones).
  - `src/modules/gestion_adelantos/` (para el módulo de Finanzas).
- Ambos comparten `src/modules/adelantos_prestamos_shared/` con lógica común (modelos, funciones de estado, notificaciones).
- Consistencia con otros módulos migrados.

**Puede hacerse en paralelo con Etapas 3-4 o al final.**

### Etapa 6 — Integraciones futuras
- WhatsApp bot para asociados (activa Portal del asociado).
- Integración con módulo Categorías si el tope se vuelve por categoría.

---

## 7. Prerequisitos

Antes de que Fede arranque:

1. **Verificar tablas existentes** en Supabase que ya están mapeadas (`planillasAdelantos`, `prestamos`) para no romperlas al agregar campos.

2. **Coordinar con Lautaro** si algún campo de las nuevas tablas debe estar en el legado (por ejemplo, `supervisor_solicitante` — verificar si ya existe o hay que agregar).

3. **Los datos existentes en Supabase** (si los hay) NO deben perderse. Solo agregamos, no reemplazamos.

4. **Sistema de permisos:** Fede debe implementar filtrado de tabs por rol:
   - En Pedidos de Adelantos: solo supervisores y Central de Operaciones.
   - En Gestión de Adelantos: RRHH ve Revisión + Historial + Configuración; Finanzas ve Depósito + Historial.

5. **NO tocar el Portal del asociado.** Queda como está para uso futuro con el bot.

---

## 8. Casos borde

### 8.1 Pedido rechazado por Finanzas — ¿vuelve al mismo pedido o crea uno nuevo?
Vuelve al MISMO pedido. Estado cambia a "Rechazada Finanzas". RRHH puede editarlo y volver a aprobar (mismo id_local). Queda registrado el ciclo de rechazo en `pedidos_adelantos_eventos`.

### 8.2 Múltiples rechazos-aprobaciones
Sistema permite N ciclos. Cada uno queda en la auditoría.

### 8.3 Pedido cancelado por supervisor después de estar en RRHH
No permitido. Una vez elevado, el supervisor no puede cancelar. Debe pedirle a RRHH que rechace.

### 8.4 Cambio de tope durante ciclo del pedido
Si RRHH cambia el tope mientras un pedido está en curso, el pedido usa el tope vigente al momento de su carga (para mostrar si superaba o no). El cambio solo aplica a pedidos futuros.

### 8.5 Supervisor sin equipo asignado
No puede cargar pedidos. Mensaje visible: "No tenés operarios asignados. Contactá RRHH."

### 8.6 Préstamo con más de 12 cuotas (soft warning)
RRHH puede aprobar igual con justificación. Se registra en observaciones.

### 8.7 Pedido con monto negativo o cero
Bloqueo al elevar. Error visible.

### 8.8 Pedido de asociado dado de baja
Bloqueo al cargar. Error visible: "El asociado no está activo."

### 8.9 Depósito de un pedido cuyo asociado se fue de baja entre aprobación RRHH y depósito
Finanzas ve advertencia. Puede rechazar o continuar según indicación de RRHH.

### 8.10 Portal del asociado carga un pedido durante v1.1
El Portal existente no se activa aún. Si algún desarrollador accede accidentalmente, cualquier pedido que cargue por ahí aparece en Gestión de Adelantos como pedido válido (a través de las tablas compartidas). NO se filtra porque compartimos datos.

---

## 9. Convenciones respetadas

- Nombres en español.
- camelCase en frontend, snake_case en Supabase.
- Soft delete (política A.7).
- Vigencia temporal para tope y config (política A.6).
- Historial de eventos auditable.
- Un commit por cambio lógico (política A.3).
- Dos módulos separados en el menú, datos compartidos.

---

## 10. Bugs conocidos a corregir del legacy

Del inventario:

1. **Coexistencia de rutas de aprobación** — se elimina la directa (Cambio 1).
2. **Duplicidad de `adelantosInformales` y `planillasInformales`** — se consolida (Cambio 2).
3. **Persistencia parcial** — se mapean todas las tablas (Cambio 4).
4. **Descuento manual en Liquidaciones** — se cablea automático (Cambio 3).
5. **Cruce por nombre** — usar `legajo_id_local`.
6. **Sin auditoría de transiciones** — se agrega tabla de eventos (Cambio 13).

---

## 11. FAQ

**¿Los pedidos existentes en Supabase se pierden?**
No. Solo se agregan campos nuevos y tablas nuevas. Los pedidos históricos siguen siendo consultables.

**¿Se puede volver a la ruta directa (sin RRHH) en emergencias?**
No. Todos los pedidos DEBEN pasar por RRHH. Si es urgente, RRHH aprueba rápido desde Gestión de Adelantos → Revisión RRHH.

**¿El tope se aplica a préstamos también?**
No en esta versión. El tope es solo para adelantos. Los préstamos no tienen tope (RRHH evalúa caso por caso).

**¿Qué pasa si RRHH está ausente y hay urgencia?**
Documentado como TODO. Por ahora RRHH debe estar disponible o delegar (a través de sistema de permisos futuro).

**¿Los préstamos y adelantos aparecen en la misma tabla o separados?**
Separados. Adelantos van a `planillas_adelantos`, Préstamos a `prestamos`. Ambos aparecen en los tabs de Gestión de Adelantos.

**¿Se puede editar un pedido después de elevarlo?**
No. Debe cancelarse y cargarse nuevamente. Excepción: si Finanzas rechazó, RRHH puede editar el monto/cuotas y volver a aprobar.

**¿Un supervisor puede ver el módulo Gestión de Adelantos?**
No. El supervisor solo ve el módulo Pedidos de Adelantos (en Operaciones).

**¿RRHH puede cargar un pedido nuevo?**
Sí, desde Pedidos de Adelantos (categoría Operaciones) porque también tiene acceso ahí. Casos excepcionales.

**¿Puedo tocar el código de Liquidaciones?**
No en esta versión. Solo generamos los compromisos en la tabla nueva. Cuando Liquidaciones migre, se cablea la lectura.

**¿Puedo tocar Sanciones y Enfermos?**
Solo para consumir las funciones expuestas (`window.sancionesAPI.calcularAntecedentesDisciplinarios`, `window.enfermosAccidentesAPI.obtenerCasoActivo`). NO modificar esos módulos.

**¿Puedo tocar el Portal del asociado?**
No en v1.1. Queda como está para la iteración futura con WhatsApp bot.

---

## 12. Cierre

Este delta consolida y ordena **dos módulos vinculados** que ya existen y **no se usan**, con el objetivo de que **empiecen a usarse en la práctica real**.

Los módulos siguen siendo entradas separadas del menú, pero comparten datos:
- **Pedidos de Adelantos** (Operaciones) — para el Supervisor.
- **Gestión de Adelantos** (Finanzas) — para RRHH + Finanzas.

Los cambios clave:
1. **Formalizar el flujo** Supervisor → RRHH → Finanzas (eliminando la ruta directa).
2. **Empoderar a RRHH** con contexto completo del asociado al aprobar.
3. **Ordenar el rol de Finanzas** con tab dedicado de Depósito.
4. **Configuración administrable** para topes y cuotas.
5. **Auditoría completa** con historial y trazabilidad.
6. **Cableado con Liquidaciones** para eliminar el descuento manual.
7. **Preservar** el Portal del asociado para uso futuro con WhatsApp bot.

**Estimación de trabajo para Fede:** 60-90 horas. Es más chico que otros módulos porque consolida lo existente.

**Objetivo estratégico:** que el sistema reemplace el proceso actual de Excel + WhatsApp. Los supervisores tienen que empezar a usar Pedidos de Adelantos en lugar de escribir por WhatsApp a Natividad. RRHH y Finanzas tienen que empezar a usar Gestión de Adelantos.

Ante duda: **preguntar antes de codear** (política A.4).

**¡Adelante!** 💰
