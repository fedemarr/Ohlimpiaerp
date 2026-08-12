# Delta de cambios — Módulo Comercial (Clientes y Objetivos/Servicios) v1.1

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Comercial (Clientes + Objetivos/Servicios)
**Autor:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-09
**Versión:** 1.1 (delta sobre lo existente)

---

## ⚠️ Cómo usar este documento

Este documento es un **delta de cambios** sobre dos módulos que **ya existen y están vinculados** en el sistema Ohlimpia:

- **Clientes** — en la categoría **Comercial** del menú. Empresas que contratan servicios a la cooperativa.
- **Objetivos / Servicios** — en la categoría **Comercial** del menú. Lugares específicos donde se presta servicio (contrato con vigencia, precios, condiciones).

Ambos módulos:
- Están relacionados 1:N (un cliente tiene N objetivos).
- Comparten catálogos comunes (tipos de servicio, condiciones IVA, formas de pago, modelos de precio, etc.).
- **Se renombra el módulo interno de "Ventas" a "Comercial"** para alinearlo con la estructura organizacional real.

NO es un rediseño desde cero — es una consolidación de bugs importantes + agregado de un **flujo de handoff Comercial → Operaciones** para asignación de supervisores.

**Base del delta:**
- Módulos actuales en `src/legacy.js` (bloque 2472-2782, sección `// ========== MÓDULO VENTAS ==========`).
- Ver `docs/INVENTARIO_clientes_legacy.md` para el detalle del estado actual.

**Contexto crítico:**
- El proceso real hoy se maneja por **Excel + carpetas físicas**.
- El sistema **NO se usa**.
- La facturación sigue haciéndose en **Tango** por el área Finanzas — Ohlimpia solo guarda el código Tango del cliente y el código del servicio como referencia.

**Antes de aplicar los cambios:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, y el inventario técnico.

---

## 1. Contexto del delta

### 1.1 Estructura organizacional relevante

**Área Comercial:**
- **Gerente Comercial:** Jorgelina Bianchi (también Secretaria del Consejo).
- **Equipo:** personal a cargo de Jorgelina.
- **Responsabilidades:** alta y gestión de clientes, negociación de contratos, seguimiento comercial, gestión de precios/paritarias, CRM.

**Área Operaciones:**
- **Gerente de Operaciones:** Ricardo Elicabe (también Síndico).
- **Responsabilidades relevantes para este módulo:** asignar supervisores a los objetivos operativos.

### 1.2 Proceso real actual

- Comercial capta cliente y negocia contrato (fuera del sistema).
- Datos del cliente y objetivo se anotan en Excel/carpetas.
- Cuando se firma contrato:
  - Comercial pasa los datos a Finanzas para facturación en Tango (código Tango + código de servicio).
  - Ricardo Elicabe (Ops) asigna supervisor al objetivo (por email, WhatsApp, o cara a cara).
  - El supervisor asignado empieza a gestionar el servicio (asociados, horas, etc.).

### 1.3 Estado en el sistema actual

Del inventario técnico. Resumen:

**Cosas que funcionan:**
- Persiste solo `clientes` en Supabase.
- Menú y permisos por rol.
- Modales con 4 tabs (Datos generales, Impositivo, Contactos, Facturación para Clientes; similar para Objetivos).
- Catálogos parametrizables desde Configuración → Ventas.

**Problemas identificados:**

1. **🔴 DB.clientes definido DOS veces con esquemas distintos.**
   - Set A (línea 2474): 2 clientes con esquema "rico" (el que la UI espera).
   - Set B (línea 6208): 50 clientes con esquema "simple" (datos demo).
   - El B se ejecuta después → sobrescribe al A en runtime.
   - Resultado: UI muestra los 50 clientes del set B con campos vacíos porque le faltan los del set A.
   - Bug de drift de schema (patrón repetido de Sanciones y Enfermos).

2. **🔴 Tres espacios de nombres de "servicio" desalineados.**
   - `DB.objetivos.codigo` (CHANGO.BROWN, HTAL.ALEMAN.LIMP).
   - `state.js:DB.servicios` (HOSPITAL.CAMPANA, GYM.RECOLETA, CENARD, etc — 15 códigos).
   - `legajo.servicio` (HOSPITAL.CAMPANA, CIBRA, LOS.PINOS, etc — 50+ códigos).
   - Los objetivos demo NO coinciden con los servicios de legajos.
   - Cuando el sistema hace `filter(l.servicio === obj.codigo)` → devuelve vacío.

3. **🔴 Objetivos NO persisten en Supabase.**
   - `objetivos` no está en `_SM`.
   - `supaSync('objetivos', ...)` es no-op.
   - Los objetivos viven solo en memoria — se pierden al recargar.

4. **📝 Modal con campos ignorados.**
   - `cli-ib` (Ingresos brutos) y `cli-jur` (Jurisdicción IIBB) están en el modal pero no se persisten.
   - `obj-notas-precio` está en el modal pero se guarda como `notas: ''` fijo.

5. **❌ Sin funciones de edición ni borrado.**
   - Solo alta y vista.
   - Para modificar un cliente/objetivo hay que crear uno nuevo.

6. **📁 Sin flujo de handoff Comercial → Operaciones.**
   - El campo Supervisor se asigna directamente al crear el objetivo.
   - No hay control sobre quién puede asignar.
   - No hay historial de cambios de supervisor.

7. **🐛 Detalles de UI rotos.**
   - Bloque "Contactos clave" en `verCliente` renderiza `<div>` vacíos (no imprime nombre/rol/tel/mail).
   - Bloque "Responsables" en `verObjetivo` igual.
   - Botón "+ Nuevo cliente" del topbar hace `abrirModal('modal-cliente')` directo, sin pasar por `abrirModalCliente()` que resetea contactos temporales.

8. **📊 Filtro de objetivos por cliente busca por nombre string**, no por ID (frágil ante cambios).

### 1.4 Cambios de proceso que Lautaro impulsa

**A) Renombrar "Ventas" a "Comercial"** internamente.

**B) Handoff Comercial → Operaciones para asignación de supervisor.**

**C) Unificar la fuente de códigos de servicio en `DB.objetivos.codigo`.**

**D) Preparar el sistema para futuro donde las categorías se unifican sin vínculo al cliente/servicio.**

### 1.5 Sobre la unificación futura de categorías (aclaración importante)

Lautaro aclaró que **se está buscando unificar los valores hora de las categorías** para que ya no dependan del cliente/servicio. Ejemplo:

- **Hoy:** Operario Newsan tiene un valor hora, Operario Migueletes otro, Operario Hospital Campana otro.
- **Objetivo a futuro:** un único valor hora para la categoría "Operario", sin importar el servicio.

Esta unificación aún está en proceso. En el diseño de Categorías se contempla la vinculación categoría + servicio como transición. Cuando la unificación esté hecha, el vínculo se disuelve.

**Implicancia para este módulo:** al dar de baja un objetivo (Cambio 14), la alerta a RRHH sobre valores hora afectados puede ser liviana, porque esa vinculación está en camino de desaparecer.

### 1.6 Estrategia del delta

- **Consolidar:** eliminar drift de mock, arreglar persistencia de objetivos, unificar códigos de servicio, arreglar bugs de UI.
- **Agregar:** flujo de handoff Comercial → Operaciones, historial de supervisores con vigencia, edición y baja de registros, alertas.
- **Preservar:** modelo de datos rico existente en Set A, catálogos parametrizables, estructura de 2 pantallas separadas.

---

## 2. Distribución en el menú y responsabilidades

### 2.1 Módulo "Clientes" (categoría Comercial)

**Quién lo usa:** Comercial (Jorgelina + equipo) + Administrador total.

**Contenido:** ABM de empresas cliente. Datos generales, impositivos, contactos, facturación (referencias para Tango).

**Acciones disponibles:**
- Crear cliente nuevo.
- **Editar cliente existente** (nueva capacidad — hoy no existe).
- **Dar de baja cliente** (soft delete).
- Ver detalle.
- Ver objetivos del cliente.

**Permisos:**
- Comercial: acceso completo.
- Operaciones: lectura (para consultar contexto de sus objetivos asignados).
- Administrador total: acceso completo.

### 2.2 Módulo "Objetivos / Servicios" (categoría Comercial)

**Quién lo usa:** Comercial + Operaciones (Gerente Elicabe para asignar supervisores) + Administrador total.

**Contenido:** ABM de servicios contratados por los clientes. Cada objetivo tiene su código único (que es el mismo que aparece en Legajos como servicio del asociado y en Categorías como referencia para valor hora).

**Acciones disponibles:**
- **Comercial:** crear objetivo, editar datos comerciales, dar de baja, ver detalle.
- **Operaciones (Gerente Ops):** asignar supervisor, cambiar supervisor, ver todos los objetivos.
- Todos los perfiles con acceso: ver detalle.

**Nueva vista por rol:**
- **Comercial ve:** todos los objetivos con estado, incluyendo "Pendiente asignación operativa".
- **Gerente de Operaciones ve:** tab dedicado "Pendientes de asignación" con los objetivos que Comercial cargó y esperan supervisor.
- **Supervisores:** NO acceden al módulo Objetivos directamente. Ven los objetivos donde son supervisor a través de Liquidación de horas (hook — cuando Ops asigna supervisor, el servicio aparece disponible en Liquidación de horas para ese supervisor).

### 2.3 Alineación con otros módulos

**Con Legajos:**
- `legajo.servicio` debe ser un `codigo` de objetivo activo.
- Cuando Comercial da de baja un objetivo, sistema alerta a Operaciones + RRHH sobre asociados en ese servicio.

**Con Categorías:**
- El código del objetivo se usa como "servicio" en la tabla `valores_hora_categoria`.
- Cuando se crea un objetivo nuevo, RRHH debe cargar los valores hora en Categorías antes de que asociados sean asignados.

**Con Liquidación de horas (existente, hecho por Lautaro):**
- Cuando Operaciones asigna supervisor, el servicio aparece disponible para ese supervisor en Liquidación de horas.
- Este hook queda como **TODO** documentado — se implementa cuando Liquidación de horas se migre.

**Con Reclamos, Cobros, Precios, CRM:**
- Todos referencian a `clienteId` y/o `codigoObjetivo`.
- Este delta NO los modifica — se ven en rondas siguientes de diseño.

---

## 3. Cambios de v1.1

Los cambios se agrupan por prioridad de implementación.

### 🔴 Cambios estructurales (críticos)

#### Cambio 1 — Renombrar "Ventas" a "Comercial"

**Qué hay hoy:**
- Sección del código: `// ========== MÓDULO VENTAS ==========` (línea 2472).
- Perfil de usuario: "Ventas" (`state.js:73`).
- Función: `poblarSelectsVentas()`.
- Configuración: "Configuración → Ventas".

**Qué cambia:**
- Renombrar sección a `// ========== MÓDULO COMERCIAL ==========`.
- Renombrar perfil `Ventas` → `Comercial` en `state.js`.
- Renombrar función `poblarSelectsVentas()` → `poblarSelectsComercial()`.
- Renombrar sección de configuración a "Configuración → Comercial".
- Mantener nombres de datos en `DB.*` (`DB.clientes`, `DB.objetivos`, etc.) sin cambios.
- Mantener nombres en el menú (Clientes, Objetivos/Servicios).

**Impacto:** cambios menores de refactor sin impacto funcional. Fede tiene que buscar y reemplazar consistentemente.

#### Cambio 2 — Consolidar mock data de DB.clientes

**Qué hay hoy:**
- Dos asignaciones a `DB.clientes` (línea 2474 y línea 6208) con esquemas incompatibles.
- El set B (50 clientes, esquema simple) sobrescribe al set A (2 clientes, esquema rico).
- La UI espera set A pero recibe set B.

**Qué cambia:**
- **Eliminar la asignación de línea 6208** (Set B, 50 clientes con esquema simple).
- **Preservar solo Set A** con el esquema rico.
- Agregar guard: `if (!DB.clientes || DB.clientes.length === 0) DB.clientes = [...]`.
- Si Fede quiere datos de demo con más clientes, generarlos con el esquema rico correcto.

**Riesgo:** verificar que ningún renderer/función lea campos exclusivos del set B (`contacto`, `tel`, `mail`, `zona`, `supervisor`, `servicio`, `desde`) — si lo hace, migrarlos al esquema rico.

#### Cambio 3 — Persistir DB.objetivos en Supabase

**Qué hay hoy:**
- `objetivos` no está en `_SM` de `supabase.js`.
- `supaSync('objetivos', ...)` es no-op.
- Los objetivos viven solo en memoria.

**Qué cambia:**
- Mapear `objetivos: 'objetivos'` en `_SM` de `src/shared/supabase.js`.
- Crear tabla en Supabase con esquema alineado al modelo actual.

**SQL nuevo:**

```sql
-- v027_persistir_objetivos.sql
BEGIN;

CREATE TABLE public.objetivos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Referencia al cliente
  cliente_id             bigint NOT NULL,
  cliente_id_local       text NOT NULL,
  
  -- Identificación
  codigo                 text UNIQUE NOT NULL,  -- código único de servicio (ej: HOSPITAL.CAMPANA)
  nombre                 text NOT NULL,
  
  -- Datos del servicio
  tipo                   text NOT NULL,         -- Limpieza / Mantenimiento / etc.
  dir                    text,
  ciudad                 text,
  
  -- Handoff a Operaciones (nuevo — ver Cambio 5)
  supervisor_asignado    text,                  -- NULL hasta que Operaciones asigne
  supervisor_asignado_por text,                 -- Gerente de Operaciones que asignó
  fecha_asignacion_supervisor timestamptz,
  
  -- Precio y contrato
  modelo_precio          text NOT NULL,         -- Abono mensual / Por EFTs / Por horas / Presupuesto cerrado
  valor                  numeric(12,2),         -- valor mensual/total
  valor_hora             numeric(10,2),         -- lo que la cooperativa COBRA al cliente
  efts                   numeric(6,2),
  valor_eft              numeric(12,2),
  fecha_inicio           date,
  fecha_fin              date,
  contrato               text,                  -- Contrato firmado / Carta de intención / etc.
  productos              text,                  -- Incluidos / Factura separada / etc.
  clausula_actualizacion text,                  -- Paritarias / IPC / etc.
  
  -- Facturación (referencias para Tango)
  periodo_fact           text,
  req_oc                 text,                  -- Heredar / No / Sí
  texto_factura          text,
  
  -- Estado
  estado                 text NOT NULL DEFAULT 'Pendiente asignación operativa',
    -- Presupuestado / Pendiente asignación operativa / Operativo / Baja
  
  -- Notas y adjuntos
  notas                  text,
  observaciones          text,
  
  -- Auditoría
  cargado_por            text NOT NULL,
  fecha_carga            timestamptz NOT NULL DEFAULT now(),
  modificado_por         text,
  modificado_en          timestamptz,
  
  -- Baja
  fecha_baja             date,
  dado_de_baja_por       text,
  motivo_baja            text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_obj_cliente ON public.objetivos(cliente_id_local) WHERE NOT anulado;
CREATE INDEX idx_obj_estado  ON public.objetivos(estado) WHERE NOT anulado;
CREATE INDEX idx_obj_codigo  ON public.objetivos(codigo) WHERE NOT anulado;

COMMIT;
```

**Tablas auxiliares (adjuntos, responsables, historial de precios):**

Los arrays `adjuntos[]`, `responsables[]` y `historialPrecios[]` del modelo actual se transforman en tablas relacionales:

```sql
CREATE TABLE public.objetivo_responsables (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,
  
  nombre                 text NOT NULL,
  rol                    text,
  telefono               text,
  email                  text,
  a_satisfacer           boolean NOT NULL DEFAULT false,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.objetivo_adjuntos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,
  
  nombre                 text NOT NULL,
  url                    text,
  tipo                   text,               -- Contrato / Presupuesto / Otro
  cargado_por            text NOT NULL,
  cargado_en             timestamptz NOT NULL DEFAULT now(),
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
```

#### Cambio 4 — Unificar códigos de servicio en `DB.objetivos.codigo` (Opción A)

**Qué hay hoy:**
- Tres fuentes de códigos de servicio desalineadas.

**Qué cambia:**
- `DB.objetivos.codigo` es la **única fuente de verdad** para códigos de servicio.
- **Eliminar `DB.servicios` de `state.js`** — reemplazar por función que retorna códigos de objetivos activos:
  ```javascript
  function obtenerServiciosActivos() {
    return DB.objetivos
      .filter(o => o.estado === 'Operativo' && !o.anulado)
      .map(o => o.codigo);
  }
  ```
- Todos los datalists de servicio (Pedidos, Capacitaciones, Vacaciones, Reasignaciones, Alta de Legajo, etc.) leen de `obtenerServiciosActivos()`.

**Migración de datos:**
- Legajos con `legajo.servicio` que NO coincida con ningún `objetivo.codigo` → crear tarea de limpieza (documentar como TODO).
- Sugerencia: RRHH revisa los legajos con servicios "huérfanos" y los normaliza contra el catálogo de objetivos.

**Impacto:**
- Los otros módulos que consumen `DB.servicios` deben ser actualizados. Documentar el cambio para que Fede sepa qué archivos tocar.

#### Cambio 5 — Flujo de handoff Comercial → Operaciones

**Qué hay hoy:**
- El campo `obj-supervisor` se asigna directamente al crear el objetivo.
- Cualquiera puede asignarlo.
- No hay control ni historial.

**Qué cambia:**

**Nuevo flujo:**

1. **Comercial crea objetivo** con estado inicial:
   - Si contrato está firmado: `Pendiente asignación operativa`.
   - Si es prospecto/presupuesto: `Presupuestado`.
   - Campo `supervisor_asignado` queda **NULL**.

2. **Notificación automática a Gerente de Operaciones (Ricardo Elicabe)** cuando un objetivo pasa a `Pendiente asignación operativa`.

3. **Gerente Operaciones asigna supervisor:**
   - Desde tab dedicado en el módulo Objetivos.
   - Solo el Gerente Operaciones (+ Admin) puede hacerlo.
   - Al asignar, el objetivo pasa a estado `Operativo`.

4. **Notificación automática al Supervisor asignado + a Comercial** cuando se completa la asignación.

5. **Hook a Liquidación de horas (TODO):**
   - El servicio aparece disponible para el supervisor asignado.
   - Documentar TODO — se implementa cuando Liquidación de horas se migre.

**Estados del objetivo:**

| Estado | Descripción |
|---|---|
| Presupuestado | Comercial cargó datos pero contrato no firmado aún |
| Pendiente asignación operativa | Contrato firmado, esperando supervisor de Ops |
| Operativo | Supervisor asignado. Servicio activo. |
| Baja | Contrato terminado. |

**Nueva tabla `objetivo_supervisores_historial`:**

```sql
CREATE TABLE public.objetivo_supervisores_historial (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,
  
  supervisor_nombre      text NOT NULL,
  supervisor_legajo_id_local text,
  
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,               -- NULL = vigente
  
  asignado_por           text NOT NULL,      -- Gerente de Operaciones
  motivo_cambio          text,               -- "Asignación inicial" / "Cambio por renuncia" / etc.
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_osh_objetivo ON public.objetivo_supervisores_historial(objetivo_id_local) WHERE NOT anulado;
CREATE INDEX idx_osh_vigencia ON public.objetivo_supervisores_historial(vigencia_desde, vigencia_hasta) WHERE NOT anulado;
```

Cuando el Gerente de Ops cambia el supervisor:
- Se cierra la vigencia anterior con `vigencia_hasta = hoy`.
- Se crea nueva vigencia con `vigencia_desde = hoy`.
- El campo `objetivos.supervisor_asignado` se actualiza al valor vigente.

#### Cambio 6 — Corregir campos ignorados del modal

**Qué hay hoy:**
- `cli-ib` y `cli-jur` no se persisten.
- `obj-notas-precio` se guarda como `notas: ''` fijo.

**Qué cambia:**
- Agregar `ingresos_brutos` y `jurisdiccion_iibb` a `clientes`.
- Persistir `notas` del objetivo correctamente.

**SQL:**

```sql
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS ingresos_brutos    text,
  ADD COLUMN IF NOT EXISTS jurisdiccion_iibb  text;
```

#### Cambio 7 — Agregar funciones de edición y baja

**Qué hay hoy:**
- Solo alta y vista.

**Qué cambia:**

**En Clientes:**
- Botón `✏️ Editar` por fila → abre `modal-cliente` en modo edición (rellena datos).
- Botón `🚫 Dar de baja` → soft delete con motivo.

**En Objetivos:**
- Botón `✏️ Editar` por fila → abre `modal-objetivo` en modo edición.
- Botón `🚫 Dar de baja` → soft delete con motivo + alertas (ver Cambio 14).

**Modo edición del modal:**
- Se agrega un campo `id_local` oculto que identifica si es alta o edición.
- `guardarCliente()` y `guardarObjetivo()` distinguen los dos casos.

**Restricciones de edición:**
- Comercial NO puede cambiar `supervisor_asignado` (es del Cambio 5, gestionado por Ops).
- Cambios sensibles (código de objetivo, cliente_id) requieren confirmación adicional.

#### Cambio 8 — Corregir renderizado de contactos y responsables

**Qué hay hoy:**
- `verCliente` itera `contactos` pero renderiza `<div>` vacío por cada uno.
- `verObjetivo` igual con `responsables`.

**Qué cambia:**
- Renderizar dentro del div los datos del contacto/responsable:
  - Nombre destacado.
  - Rol.
  - Teléfono con enlace `tel:`.
  - Email con enlace `mailto:`.
  - Badge ⭐ "A satisfacer" cuando aplique.

Es una corrección de UI simple pero necesaria (los detalles hoy están en blanco).

#### Cambio 9 — Corregir topbar de "+ Nuevo cliente"

**Qué hay hoy:**
- Botón hace `abrirModal('modal-cliente')` directo, sin resetear `contactosClienteTemp`.
- Si el usuario abrió otro modal antes con contactos, quedan colgados.

**Qué cambia:**
- Cambiar handler del topbar a `abrirModalCliente()`.
- `abrirModalCliente()` resetea todo el estado temporal antes de abrir.

Mismo patrón para "+ Nuevo objetivo" — usar `abrirModalObjetivo()` en vez de `abrirModal('modal-objetivo')`.

---

### 🟡 Cambios de agregado (features nuevas)

#### Cambio 10 — Tabs en el módulo Objetivos

**Qué hay hoy:**
- Una sola tabla con todos los objetivos.

**Qué cambia:**
Tabs por estado y contexto:

| Tab | Contenido | Quién lo ve |
|---|---|---|
| Presupuestados | Objetivos en negociación | Comercial + Admin |
| Pendiente asignación | Objetivos con contrato firmado esperando supervisor | Comercial + **Gerente Ops** + Admin |
| Operativos | Objetivos con supervisor asignado (servicios activos) | Todos con acceso |
| Baja | Objetivos dados de baja | Todos con acceso |

**Filtros dentro de cada tab:** cliente, tipo, supervisor, fecha.

#### Cambio 11 — Panel de asignación para Gerente Ops

**Qué hay hoy:**
- No existe panel específico para Operaciones.

**Qué cambia:**
Cuando el usuario es **Gerente Operaciones**, el tab "Pendiente asignación" muestra:

**Para cada objetivo pendiente:**
- Datos del cliente y objetivo.
- Fecha de carga (cuántos días lleva esperando).
- **Botón "Asignar supervisor"** → abre modal:
  - Select de supervisores disponibles.
  - Fecha de inicio de asignación (default: hoy).
  - Observaciones opcionales.
- Al confirmar:
  - Se crea entrada en `objetivo_supervisores_historial`.
  - Se actualiza `objetivos.supervisor_asignado`.
  - Se cambia estado a `Operativo`.
  - Notificaciones automáticas.

**Alerta visual:** objetivos que llevan más de N días esperando (default: 7 días) aparecen con badge naranja.

#### Cambio 12 — Cambio de supervisor con historial

**Qué hay hoy:**
- El supervisor se sobrescribe sin historial.

**Qué cambia:**
- Solo Gerente Operaciones (+ Admin) puede cambiar el supervisor.
- Botón "🔄 Cambiar supervisor" en el detalle del objetivo.
- Al confirmar:
  - Se cierra la vigencia anterior en `objetivo_supervisores_historial`.
  - Se crea nueva vigencia.
  - `objetivos.supervisor_asignado` se actualiza.
  - Notificaciones al supervisor saliente + al nuevo + a Comercial.

**Detalle del objetivo muestra el timeline completo de supervisores:**
- Supervisor actual (destacado).
- Historial de supervisores anteriores con fechas.

#### Cambio 13 — Notificaciones del handoff

**Nuevos tipos de notificación en `notificaciones_sistema`:**

| Trigger | A quién | Tipo |
|---|---|---|
| Objetivo pasa a "Pendiente asignación operativa" | Gerente Operaciones | `objetivo_pendiente_asignacion` |
| Objetivo lleva 7+ días esperando asignación | Gerente Operaciones + Gerente Comercial | `objetivo_asignacion_demorada` |
| Se asigna supervisor | Comercial (que lo cargó) + Supervisor asignado | `objetivo_supervisor_asignado` |
| Cambio de supervisor | Supervisor saliente + Nuevo supervisor + Comercial | `objetivo_supervisor_cambiado` |
| Baja de objetivo | Operaciones + RRHH | `objetivo_dado_de_baja` |

#### Cambio 14 — Baja de objetivo con alertas

**Qué hay hoy:**
- No hay baja de objetivos.

**Qué cambia:**
- Botón "🚫 Dar de baja" en detalle de objetivo.
- Solo Comercial (+ Admin) puede dar de baja.
- Modal con motivo obligatorio + fecha de baja.

**Al confirmar:**
- Estado cambia a `Baja`.
- Se registra `fecha_baja`, `dado_de_baja_por`, `motivo_baja`.
- **Se dispara alerta a Operaciones + RRHH** con:
  - Lista de asociados asignados a ese servicio (leyendo `legajo.servicio === objetivo.codigo`).
  - Sugerencia: reasignar a otros servicios.
- **Notas sobre Categorías:**
  - Los valores hora históricos con este servicio quedan como registro histórico (no se eliminan).
  - Nota liviana: como se está unificando categorías hacia futuro (sin dependencia de servicio), este impacto es menor.
- El servicio deja de aparecer como opción en datalists de servicios activos.

**Impacto en asociados asignados:**
- No se los desasigna automáticamente.
- Sistema alerta para que Operaciones + RRHH gestionen manualmente la reasignación.
- Módulo de Reasignaciones (existente) es el flujo para moverlos.

---

### 🟢 Cambios de consolidación menor

#### Cambio 15 — Filtro de objetivos por cliente por ID en vez de nombre

**Qué hay hoy:**
- `filtrarObjetivos()` compara `DB.clientes.nombre === filtroCliente` para obtener el ID.

**Qué cambia:**
- El select `cf-obj-cliente` guarda `value = clienteId`.
- Filtro directo por ID.

#### Cambio 16 — Códigos autogenerados de objetivo

**Qué hay hoy:**
- El código del objetivo se ingresa manualmente.

**Qué cambia:**
- Al crear objetivo, el sistema sugiere un código base: `[NOMBRECLIENTE].[TIPO]` (ejemplo: `NEWSAN.LIMPIEZA`).
- Comercial puede editarlo antes de guardar.
- Validación: único en el sistema.

#### Cambio 17 — Historial de precios inicial en altas

**Qué hay hoy:**
- `historialPrecios[]` existe en el mock pero `guardarObjetivo` no lo inicializa.

**Qué cambia:**
- Al crear objetivo, el primer valor se registra automáticamente en `historial_precios_objetivo` (tabla nueva o relacional):

```sql
CREATE TABLE public.historial_precios_objetivo (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,
  
  fecha                  date NOT NULL,
  valor                  numeric(12,2),
  valor_hora             numeric(10,2),
  valor_eft              numeric(12,2),
  motivo                 text,               -- Carga inicial / Paritaria / Ajuste / etc.
  aprobado_por           text,
  estado                 text NOT NULL DEFAULT 'Vigente',    -- Vigente / Histórico
  
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
```

Cuando se cambia el precio, se cierra la vigencia anterior y se crea nueva. Consistente con la política A.6.

**Nota:** este historial es diferente del módulo Precios/Paritarias — es histórico interno del objetivo. El módulo Precios lo usa para proyecciones.

---

## 4. Modelo de flujo actualizado

### 4.1 Diagrama del ciclo de un objetivo

```
[Comercial carga datos]
    ↓
[Presupuestado]                    ← si contrato no firmado aún
    ↓ (contrato firmado)
[Pendiente asignación operativa]   ← esperando Gerente Ops
    ↓ (Ops asigna supervisor)
[Operativo]                         ← activo, servicio funcionando
    ↓ (contrato terminado)
[Baja]                              → alerta a Ops + RRHH
```

### 4.2 Registro de eventos en historial

Cada transición genera entrada en `objetivo_eventos` (tabla de auditoría):

```sql
CREATE TABLE public.objetivo_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  objetivo_id_local      text NOT NULL,
  
  estado_desde           text,
  estado_hasta           text NOT NULL,
  ejecutado_por          text NOT NULL,
  ejecutado_rol          text,
  ejecutado_en           timestamptz NOT NULL DEFAULT now(),
  observaciones          text,
  
  created_at             timestamptz NOT NULL DEFAULT now()
);
```

---

## 5. Modelo de datos consolidado

### 5.1 Tablas nuevas / modificadas

| Tabla | Cambio |
|---|---|
| `clientes` | Agregar `ingresos_brutos`, `jurisdiccion_iibb` |
| `objetivos` | **Nueva** — persistir con estados nuevos y campos de asignación |
| `objetivo_responsables` | **Nueva** — desagrupar responsables |
| `objetivo_adjuntos` | **Nueva** — desagrupar adjuntos |
| `objetivo_supervisores_historial` | **Nueva** — historial con vigencia temporal |
| `historial_precios_objetivo` | **Nueva** — vigencia temporal de precios |
| `objetivo_eventos` | **Nueva** — auditoría de transiciones |

### 5.2 Mapeo en `src/shared/supabase.js`

```javascript
// Existentes
clientes:                       'clientes',

// Agregar
objetivos:                      'objetivos',
objetivoResponsables:           'objetivo_responsables',
objetivoAdjuntos:               'objetivo_adjuntos',
objetivoSupervisoresHistorial:  'objetivo_supervisores_historial',
historialPreciosObjetivo:       'historial_precios_objetivo',
objetivoEventos:                'objetivo_eventos',
```

---

## 6. Etapas de implementación

### Etapa 1 — Consolidación estructural (crítica)
- Cambio 1: renombrar "Ventas" a "Comercial".
- Cambio 2: eliminar drift de mock de clientes.
- Cambio 3: persistir objetivos.
- Cambio 4: unificar códigos de servicio (Opción A).
- Cambio 6: corregir campos ignorados.
- Cambio 8: corregir renderizado de contactos/responsables.
- Cambio 9: corregir topbar.

**Al terminar:** el módulo persiste correctamente, sin bugs de datos ni UI.

### Etapa 2 — Handoff Comercial → Operaciones
- Cambio 5: flujo de handoff.
- Cambio 10: tabs por estado.
- Cambio 11: panel de asignación para Ops.
- Cambio 12: cambio de supervisor con historial.
- Cambio 13: notificaciones.

**Al terminar:** el flujo completo Comercial → Operaciones funciona.

### Etapa 3 — Baja y edición
- Cambio 7: funciones de edición y baja.
- Cambio 14: baja con alertas.

**Al terminar:** ciclo completo del objetivo (crear → operar → baja).

### Etapa 4 — Consolidación menor
- Cambio 15: filtro por ID.
- Cambio 16: códigos autogenerados.
- Cambio 17: historial de precios inicial.

### Etapa 5 — Migración a `src/modules/`
- Extraer los módulos a:
  - `src/modules/clientes/`
  - `src/modules/objetivos/`
- Con lógica compartida en `src/modules/comercial_shared/` (catálogos, funciones comunes).

**Puede hacerse en paralelo con etapas anteriores o al final.**

### Etapa 6 — Integraciones futuras
- Hook con Liquidación de horas (cuando migre).
- Integración con Categorías si la unificación de valores hora se completa.

---

## 7. Integraciones

### 7.1 Módulo Legajos (impacto crítico)

**Cambios en Legajos:**
- El datalist de servicios (para asignar servicio al asociado) debe leer de `obtenerServiciosActivos()` (Cambio 4).
- Sin cambios en el modelo de legajos — solo cambia la fuente del datalist.

**Coordinar con Lautaro** el ajuste del renderer.

### 7.2 Módulo Categorías

- Los códigos de servicio en `valores_hora_categoria.servicio_nombre` deben ser códigos de objetivos vigentes.
- Al crear un objetivo nuevo, Categorías debe permitir cargar valores hora para ese servicio.
- Al dar de baja un objetivo, los valores hora históricos quedan (para casos legacy).

### 7.3 Módulo Liquidación de horas (existente, hecho por Lautaro)

**Hook TODO:**
- Cuando Ops asigna supervisor a un objetivo, ese servicio debe aparecer disponible para el supervisor en Liquidación de horas.
- Se documenta como TODO — se implementa cuando Liquidación de horas se migre.

**Por ahora:** el supervisor puede consultar en el módulo Objetivos qué servicios tiene asignados.

### 7.4 Módulos Reclamos, Cobros, Precios, CRM

- Todos referencian a `clienteId` y/o `codigoObjetivo`.
- Este delta NO los modifica.
- Se ven en rondas siguientes.

### 7.5 Sistema de notificaciones

Reutiliza `notificaciones_sistema`. Ver §3 Cambio 13 para tipos generados.

---

## 8. Prerequisitos

Antes de que Fede arranque:

1. **Verificar tabla `clientes`** existente en Supabase — el ALTER debe agregar solo los campos nuevos sin romper los existentes.

2. **Coordinar con Lautaro los cambios en Legajos y otros módulos** que consumen `DB.servicios`.

3. **Los datos existentes en `clientes`** NO deben perderse.

4. **Los códigos de servicio en legajos** deben normalizarse contra el catálogo de objetivos. Documentar como TODO — RRHH revisa y ajusta.

5. **Sistema de permisos:** el filtrado por rol es central. Fede debe implementar:
   - Comercial: acceso a Clientes y Objetivos (todos los tabs).
   - Gerente Operaciones: acceso al tab "Pendiente asignación" con acción "Asignar supervisor".
   - Supervisores: NO acceden al módulo (ven servicios por Liquidación de horas).

---

## 9. Casos borde

### 9.1 Objetivo pendiente hace más de N días
Alerta visual + notificación al Gerente Ops y Comercial. Configurable (default: 7 días).

### 9.2 Cliente dado de baja con objetivos activos
Advertencia al dar de baja: "Este cliente tiene N objetivos activos. Dar de baja al cliente también dará de baja los objetivos. ¿Continuar?".

### 9.3 Objetivo con supervisor asignado, cambio de supervisor
Historial de supervisores anteriores queda en `objetivo_supervisores_historial`. El detalle del objetivo muestra el timeline.

### 9.4 Objetivo "Presupuestado" que nunca se cierra
Sin restricción. Puede quedar en Presupuestado indefinidamente. Comercial puede darle baja con motivo "Prospecto no cerrado".

### 9.5 Supervisor asignado que renuncia a la cooperativa
Gerente Ops recibe alerta al detectar cambio en el legajo. Debe reasignar el objetivo a nuevo supervisor.

### 9.6 Objetivo con contrato en varios idiomas o especial
Sin restricción. Campo notas y adjuntos permiten flexibilidad.

### 9.7 Cliente con muchos objetivos activos (>20)
Sin restricción numérica. La UI puede paginar si el performance lo requiere.

### 9.8 Código de objetivo duplicado accidentalmente
Validación al guardar: código debe ser único en el sistema. Error visible si ya existe.

---

## 10. Convenciones respetadas

- Nombres en español.
- camelCase en frontend, snake_case en Supabase.
- Soft delete (política A.7).
- Vigencia temporal para precios y supervisores (política A.6).
- Historial de eventos auditable.
- Un commit por cambio lógico (política A.3).
- Dos módulos separados en el menú, datos relacionados.

---

## 11. Bugs conocidos a corregir del legacy

Del inventario:

1. **DB.clientes definido dos veces con esquemas incompatibles** — se elimina duplicación (Cambio 2).
2. **Objetivos no persisten en Supabase** — se persisten (Cambio 3).
3. **Tres espacios de nombres de servicio desalineados** — se unifica (Cambio 4).
4. **Campos del modal ignorados** — se persisten (Cambio 6).
5. **Sin edición ni borrado** — se agregan (Cambio 7).
6. **Contactos y responsables renderizados vacíos** — se corrigen (Cambio 8).
7. **Topbar sin reset de estado** — se corrige (Cambio 9).
8. **Filtro por nombre string** — se cambia a ID (Cambio 15).

---

## 12. FAQ

**¿El módulo Categorías gestiona servicios?**
No. Los servicios son los `objetivos.codigo` de este módulo. Categorías los referencia por nombre string.

**¿Se pueden crear objetivos sin contrato firmado?**
Sí, con estado "Presupuestado". No requieren supervisor hasta que pasen a "Pendiente asignación operativa" o directamente "Operativo".

**¿Un supervisor puede tener múltiples objetivos asignados?**
Sí. Un supervisor puede tener N objetivos activos simultáneamente.

**¿Un objetivo puede tener más de un supervisor?**
No en el modelo actual. Un supervisor por objetivo por vez. El historial permite ver los anteriores.

**¿Qué pasa si Gerente Ops está ausente y hay objetivos pendientes?**
Documentado como TODO. Por ahora Admin total puede asignar en caso de urgencia.

**¿Los precios de los objetivos afectan Liquidaciones?**
No directamente. El precio del objetivo es lo que la cooperativa COBRA al cliente. El valor hora del asociado (lo que la cooperativa PAGA) viene de Categorías. Son dos conceptos separados.

**¿Puedo tocar el código de Legajos?**
Solo lo mínimo: actualizar el datalist de servicios para leer de objetivos. Coordinar con Lautaro.

**¿Puedo tocar Liquidación de horas?**
NO. Es del área de Lautaro. Solo documentar TODO para el hook.

**¿Puedo tocar Reclamos, Cobros, Precios, CRM?**
No en este delta. Se verán en rondas siguientes.

---

## 13. Cierre

Este delta consolida los dos módulos fundacionales del área Comercial y formaliza el **handoff con Operaciones** para la asignación de supervisores.

Los cambios clave:
1. **Renombrar "Ventas" a "Comercial"** en el código.
2. **Corregir bugs graves** de mock data duplicada y objetivos sin persistir.
3. **Unificar códigos de servicio** en `DB.objetivos.codigo` como única fuente de verdad.
4. **Nuevo flujo Comercial → Operaciones** con estados intermedios y notificaciones.
5. **Historial de supervisores** con vigencia temporal.
6. **Edición y baja de registros** (hoy solo hay alta).
7. **Alertas al dar de baja** un objetivo con asociados asignados.
8. **Preparación para unificación futura** de categorías (independiente del servicio).

**Estimación de trabajo para Fede:** 90-130 horas. Mediano por la cantidad de tablas nuevas + refactor de nombres + flujo de handoff.

**Coordinación con Lautaro requerida en:**
- Ajuste del datalist de servicios en Legajos.
- Coordinación del hook a Liquidación de horas (por ahora TODO).
- Migración de códigos de servicio huérfanos (data cleaning).

**Objetivo estratégico:** que Comercial (Jorgelina + equipo) empiece a usar el sistema para el proceso real. Que Operaciones (Ricardo Elicabe) tenga visibilidad clara de sus asignaciones pendientes.

Ante duda: **preguntar antes de codear** (política A.4).

**¡Vendé bien, asigná bien, operá mejor!** 🏢📍
