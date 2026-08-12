# Delta de cambios — Módulos Liquidaciones final + Liquidación de Administrativos v1.1

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulos afectados:** Liquidaciones (final) + Liquidación de Administrativos
**Autor:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-10
**Versión:** 1.1 (delta sobre lo existente)

---

## ⚠️ Cómo usar este documento

Este documento es un **delta de cambios** sobre los DOS módulos hermanos que cierran el ciclo operativo:

- **Liquidaciones (final)** — consolida todas las fuentes y calcula el neto a pagar por operario.
- **Liquidación de Administrativos** — liquida al personal administrativo (sueldo fijo mensual). Alimenta a Liquidaciones final.

Es el **último módulo del sistema** — consume TODO lo que hemos diseñado en los deltas anteriores.

**Prerequisitos críticos (deben estar implementados antes):**
- Delta de **Liquidación de horas** (v1.1) — provee `horas_grilla` con horas aprobadas.
- Delta de **Categorías** — provee `valores_hora_categoria` para calcular montos.
- Delta de **Uniformes** — provee `descuentos_uniforme_pendientes`.
- Delta de **Sanciones** — provee `descuentos_sanciones_pendientes`.
- Delta de **Adelantos y Préstamos** — provee `descuentos_adelantos_pendientes`.
- Delta de **Enfermos y Accidentes** — provee `retiros_enfermos_pendientes`.
- Delta de **Objetivos** — provee `objetivos.supervisor_asignado`.

**Base del delta:**
- Módulos actuales en `src/legacy.js`, `renderLiquidaciones` (6392) y `renderLiqAdmin` (5896).
- Ver `docs/INVENTARIO_liquidaciones_final_legacy.md` para el detalle del estado actual.

**Sensibilidad del módulo:**

Este es el módulo con **mayor sensibilidad legal y económica** del sistema. Errores acá se pagan (literalmente) mal a operarios. Toda validación importa.

**Antes de aplicar los cambios:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, y el inventario técnico.

---

## 1. Contexto del delta

### 1.1 Qué son los dos módulos

**Liquidaciones (final):**
- Módulo de cierre del ciclo mensual.
- Toma horas trabajadas + descuentos + retenciones → calcula neto a pagar por operario.
- Genera archivo para pagar en el banco.
- Alcance: operativos + administrativos.

**Liquidación de Administrativos:**
- Módulo hermano que calcula los sueldos del personal administrativo (mensual fijo).
- Alimenta a Liquidaciones final (que consolida el pago).
- Independiente del ciclo de horas de operativos.

### 1.2 Actores del proceso

| Rol | Responsabilidad |
|---|---|
| Supervisor | Cierra grillas de horas (en Liquidación de horas). Puede cargar Revisiones post-pago. |
| Equipo de Operaciones | Revisa grillas, aprueba/rechaza. Puede cargar Revisiones. |
| RRHH (Gabriela) | Carga retenciones + descuentos por monotributo (inasistencias). |
| Finanzas (Natividad) | Ejecuta cálculo mensual, congela, revisa, aprueba, genera archivo bancario. |

### 1.3 Flujo mensual completo

```
Fin de mes (día 25-30):
1. Supervisores cierran grillas de horas.
2. Equipo de Operaciones revisa y aprueba las grillas.
3. RRHH carga en su módulo:
   - Retenciones nuevas (casos particulares).
   - Descuentos por monotributo (por inasistencias).

Cierre operativo (día 1-3 del mes siguiente):
4. Finanzas ejecuta "Calcular liquidación del mes X":
   - Sistema consolida: horas × valor hora + retiros Enfermos.
   - Aplica descuentos automáticos (Uniformes, Sanciones, Adelantos).
   - Aplica retenciones manuales.
   - Suma presentismo (3% del bruto).
   - Calcula neto por operario.
5. Finanzas revisa liquidación con alertas.
6. Finanzas presiona "CONGELAR":
   - Todas las grillas del mes pasan a estado "Congelada".
   - Supervisores NO pueden modificar más.
7. Finanzas aprueba liquidación final.
8. Sistema genera archivo para banco.
9. Finanzas ejecuta transferencia masiva (por fuera del sistema).
10. Sistema marca liquidación como "Pagada".

Post-pago (días siguientes):
11. Si supervisor o Ops detectan diferencia → carga "Revisión de horas".
12. Revisión pasa a bandeja Finanzas.
13. Finanzas aprueba y ejecuta pago complementario.
```

### 1.4 Estado en el sistema actual

Del inventario:

**Cosas que YA funcionan:**
- Fórmula del neto: `bruto + presentismo(3%) − totalDesc`.
- Distinción entre Operativos y Administrativos.
- Botón `toggleCongelarLiquidacion` (congela grillas).
- Estado "Autorizar pago" requiere congelado previo.
- Modal de descuentos.
- Categorías de descuento: uniforme, sanciones, retConflicto, retEnfermedad, monotributo, adelantos.

**Problemas identificados:**

1. **🔴 Descuentos 100% manuales.** No hay lectura automática de tablas `descuentos_*_pendientes`. El HTML dice "próximamente".

2. **🔴 Sin persistencia.** Descuentos, congelado, liquidaciones autorizadas, cuenta corriente viven solo en memoria. Se pierden al recargar.

3. **🔴 exportarLiquidacion no existe.** Es un toast "próximamente".

4. **⚠️ Bug de cálculo del neto en "autorizar pago".** `_getFilasConsolidadas` usa una fórmula distinta a la que se muestra en pantalla. El monto autorizado puede no coincidir.

5. **⚠️ Modal-descuento-liq duplicado.** Está definido en 2670 y 2973. Riesgo de comportamiento inconsistente.

6. **⚠️ Sin flujo formal de "Revisión de horas"** (ajustes post-pago). Hoy se completa un papel que va a Finanzas.

7. **⚠️ Sin integración con Liquidación de Administrativos.** El módulo final no lee de `liqAdminPersonal`.

### 1.5 Estrategia del delta

- **Cablear todas las integraciones automáticas** (corazón del delta).
- **Persistir todo.**
- **Corregir bug de cálculo** en `_getFilasConsolidadas`.
- **Formalizar flujo de Revisión de horas.**
- **Implementar exportación bancaria.**
- **Cablear Liq Admin** como fuente de Liquidaciones final.
- **Preservar lo que ya funciona** (fórmula del neto, botón congelar, distinción operativo/admin).

---

## 2. Cambios de v1.1

### 🔴 Cambios estructurales (críticos)

#### Cambio 1 — Cablear integraciones automáticas de descuentos

**Qué hay hoy:**
- Los 6 conceptos de descuento se cargan a mano en la grilla (`lqsDescuentos[periodo][nombre]`).
- Cada uno tiene un campo editable en el modal.
- Ninguno lee de las tablas `descuentos_*_pendientes` que fuimos creando.

**Qué cambia:**

Al calcular la liquidación mensual, el sistema consulta automáticamente:

```javascript
async function consolidarDescuentosOperario(legajoIdLocal, periodo) {
  const descuentos = {
    uniforme: 0,
    sanciones: 0,
    adelantos: 0,
    retConflicto: 0,     // manual (retenciones legales)
    retEnfermedad: 0,    // manual
    monotributo: 0,      // manual
    detalles: []
  };
  
  // 1. Uniformes (automático)
  const uniformes = DB.descuentosUniformePendientes.filter(d =>
    d.legajo_id_local === legajoIdLocal &&
    d.periodo_descuento === periodo &&
    d.estado === 'Pendiente' &&
    !d.anulado
  );
  descuentos.uniforme = uniformes.reduce((sum, d) => sum + d.monto, 0);
  descuentos.detalles.push({ tipo: 'Uniforme', items: uniformes });
  
  // 2. Sanciones (automático)
  const sanciones = DB.descuentosSancionesPendientes.filter(d =>
    d.legajo_id_local === legajoIdLocal &&
    d.estado === 'Pendiente' &&
    !d.anulado
  );
  descuentos.sanciones = sanciones.reduce((sum, d) => sum + d.monto_total, 0);
  descuentos.detalles.push({ tipo: 'Sanciones', items: sanciones });
  
  // 3. Adelantos y Préstamos (automático)
  const adelantos = DB.descuentosAdelantosPendientes.filter(d =>
    d.legajo_id_local === legajoIdLocal &&
    d.periodo_descuento === periodo &&
    d.estado === 'Pendiente' &&
    !d.anulado
  );
  descuentos.adelantos = adelantos.reduce((sum, d) => sum + d.monto, 0);
  descuentos.detalles.push({ tipo: 'Adelantos y Préstamos', items: adelantos });
  
  // 4. Retenciones manuales (RRHH)
  const retenciones = DB.retencionesRRHH.filter(r =>
    r.legajo_id_local === legajoIdLocal &&
    r.periodo === periodo &&
    !r.anulado
  );
  descuentos.retConflicto = retenciones
    .filter(r => r.tipo === 'Retención por conflicto')
    .reduce((sum, r) => sum + r.monto, 0);
  descuentos.detalles.push({ tipo: 'Retenciones', items: retenciones });
  
  // 5. Descuento por monotributo (RRHH — inasistencias)
  const monotributos = DB.descuentosMonotributoRRHH.filter(m =>
    m.legajo_id_local === legajoIdLocal &&
    m.periodo === periodo &&
    !m.anulado
  );
  descuentos.monotributo = monotributos.reduce((sum, m) => sum + m.monto, 0);
  descuentos.detalles.push({ tipo: 'Monotributo (inasistencias)', items: monotributos });
  
  return descuentos;
}
```

**Comportamiento:**
- Los descuentos aparecen automáticamente en la grilla.
- Los campos manuales de la grilla se convierten en `readonly` con detalle expandible al hacer click.
- Al confirmar la liquidación, los descuentos consumidos se marcan como `estado = 'Aplicado'` en las tablas origen.

**Trazabilidad total:**
Cada descuento tiene un link directo al registro origen (uniforme, sanción, adelanto, etc.).

#### Cambio 2 — Persistencia completa

**Qué hay hoy:**
- Solo `monotributos` está en `_SM`.
- `lqsDescuentos`, `liquidaciones`, `retenciones`, `liqAdminPersonal`, `liqAdminHoras/Valores/Tipo` no persisten.

**Qué cambia:**

Crear tablas y mapear en `_SM`:

```sql
-- v033_liquidaciones_final.sql
BEGIN;

-- Liquidación mensual consolidada
CREATE TABLE public.liquidaciones_mensuales (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  periodo                text UNIQUE NOT NULL,  -- YYYY-MM
  anio                   integer NOT NULL,
  mes                    integer NOT NULL,
  
  estado                 text NOT NULL DEFAULT 'En preparación',
    -- En preparación / Congelada / Aprobada / Pagada
  
  -- Métricas del período
  total_operarios        integer NOT NULL DEFAULT 0,
  total_administrativos  integer NOT NULL DEFAULT 0,
  total_bruto            numeric(14,2) NOT NULL DEFAULT 0,
  total_presentismo      numeric(12,2) NOT NULL DEFAULT 0,
  total_descuentos       numeric(12,2) NOT NULL DEFAULT 0,
  total_neto             numeric(14,2) NOT NULL DEFAULT 0,
  
  -- Congelamiento
  fecha_congelamiento    timestamptz,
  congelado_por          text,
  motivo_descongelamiento text,
  
  -- Aprobación
  fecha_aprobacion       timestamptz,
  aprobado_por           text,
  observaciones_aprobacion text,
  
  -- Pago
  fecha_pago             timestamptz,
  archivo_bancario_id_local text,     -- ref a archivo_bancario
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lm_estado ON public.liquidaciones_mensuales(estado) WHERE NOT anulado;

-- Línea por operario (una por asociado por mes)
CREATE TABLE public.liquidaciones_operario (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  liquidacion_mensual_id_local text NOT NULL,
  legajo_id_local        text NOT NULL,
  nombre_asociado        text NOT NULL,
  nro_socio              text,
  tipo_asociado          text NOT NULL,       -- Operativo / Administrativo
  
  -- Cálculo del bruto (operativo)
  horas_normales         numeric(6,2),
  horas_extras           numeric(6,2),
  horas_reten            numeric(6,2),
  horas_franquero        numeric(6,2),
  horas_especiales       numeric(6,2),
  monto_horas            numeric(12,2),       -- suma horas × valor hora
  
  -- Retiros enfermos (para operarios en tratamiento)
  monto_retiro_enfermos  numeric(12,2) NOT NULL DEFAULT 0,
  
  -- Sueldo administrativo (para administrativos)
  sueldo_admin           numeric(12,2),
  
  -- Bruto y presentismo
  bruto                  numeric(12,2) NOT NULL,
  presentismo_porcentaje numeric(5,2) NOT NULL DEFAULT 3,
  presentismo_monto      numeric(12,2) NOT NULL DEFAULT 0,
  
  -- Descuentos consolidados (readonly, vienen de las fuentes)
  desc_uniforme          numeric(12,2) NOT NULL DEFAULT 0,
  desc_sanciones         numeric(12,2) NOT NULL DEFAULT 0,
  desc_adelantos         numeric(12,2) NOT NULL DEFAULT 0,
  desc_retenciones       numeric(12,2) NOT NULL DEFAULT 0,
  desc_monotributo       numeric(12,2) NOT NULL DEFAULT 0,
  desc_otros             numeric(12,2) NOT NULL DEFAULT 0,
  total_descuentos       numeric(12,2) NOT NULL DEFAULT 0,
  
  -- Neto final
  neto                   numeric(12,2) NOT NULL,
  
  -- CBU/CVU/DNI para archivo bancario
  cbu                    text,
  dni                    text,
  
  -- Trazabilidad
  detalles_calculo       jsonb,               -- desglose completo
  
  -- Estado
  estado                 text NOT NULL DEFAULT 'Calculado',
    -- Calculado / Congelado / Autorizado / Pagado / Anulado
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lo_liq    ON public.liquidaciones_operario(liquidacion_mensual_id_local) WHERE NOT anulado;
CREATE INDEX idx_lo_legajo ON public.liquidaciones_operario(legajo_id_local) WHERE NOT anulado;

-- Retenciones cargadas por RRHH (casos particulares)
CREATE TABLE public.retenciones_rrhh (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  legajo_id_local        text NOT NULL,
  nombre_asociado        text NOT NULL,
  periodo                text NOT NULL,       -- YYYY-MM
  
  tipo                   text NOT NULL,       -- Retención por conflicto / Otra
  motivo                 text NOT NULL,
  monto                  numeric(12,2) NOT NULL,
  
  cargada_por            text NOT NULL,       -- RRHH
  fecha_carga            timestamptz NOT NULL DEFAULT now(),
  
  estado                 text NOT NULL DEFAULT 'Vigente',
    -- Vigente / Aplicada / Anulada
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rr_legajo  ON public.retenciones_rrhh(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_rr_periodo ON public.retenciones_rrhh(periodo) WHERE NOT anulado;

-- Descuentos por monotributo (por inasistencias)
CREATE TABLE public.descuentos_monotributo_rrhh (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  legajo_id_local        text NOT NULL,
  nombre_asociado        text NOT NULL,
  periodo                text NOT NULL,
  
  motivo                 text NOT NULL,       -- descripción de la inasistencia
  dias_inasistencia      integer,             -- opcional
  monto                  numeric(10,2) NOT NULL,
  
  cargada_por            text NOT NULL,       -- RRHH
  fecha_carga            timestamptz NOT NULL DEFAULT now(),
  
  estado                 text NOT NULL DEFAULT 'Vigente',
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Revisiones de horas (ajustes post-pago)
CREATE TABLE public.revisiones_horas (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  legajo_id_local        text NOT NULL,
  nombre_asociado        text NOT NULL,
  liquidacion_original_id_local text NOT NULL,  -- ref a liquidaciones_mensuales
  periodo_original       text NOT NULL,       -- YYYY-MM al que corresponde
  
  motivo                 text NOT NULL,
  detalle                text NOT NULL,       -- descripción del error detectado
  horas_faltantes        numeric(6,2),
  monto_diferencia       numeric(12,2) NOT NULL,   -- siempre positivo (a favor del operario)
  
  cargada_por            text NOT NULL,       -- Supervisor o Ops
  cargada_por_rol        text NOT NULL,
  fecha_carga            timestamptz NOT NULL DEFAULT now(),
  
  estado                 text NOT NULL DEFAULT 'Pendiente',
    -- Pendiente / Aprobada / Pagada / Rechazada
  
  aprobada_por           text,                -- Finanzas
  fecha_aprobacion       timestamptz,
  motivo_rechazo         text,
  
  fecha_pago             timestamptz,
  archivo_bancario_id_local text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rh_legajo  ON public.revisiones_horas(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_rh_estado  ON public.revisiones_horas(estado) WHERE NOT anulado;
CREATE INDEX idx_rh_periodo ON public.revisiones_horas(periodo_original) WHERE NOT anulado;

-- Archivo bancario generado
CREATE TABLE public.archivos_bancarios (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  tipo_origen            text NOT NULL,       -- Liquidación mensual / Revisión de horas
  origen_id_local        text NOT NULL,       -- ref a liquidaciones_mensuales o revisiones_horas
  periodo                text,                -- si es mensual
  
  fecha_generacion       timestamptz NOT NULL DEFAULT now(),
  generado_por           text NOT NULL,
  
  cantidad_registros     integer NOT NULL,
  monto_total            numeric(14,2) NOT NULL,
  
  formato                text NOT NULL DEFAULT 'Excel genérico',   -- Excel genérico / Formato específico
  url_archivo            text,                -- ubicación del archivo generado
  
  fecha_envio_banco      timestamptz,
  fecha_confirmacion_banco timestamptz,
  observaciones          text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ab_origen ON public.archivos_bancarios(origen_id_local);

COMMIT;
```

Mapeo en `src/shared/supabase.js`:

```javascript
liquidacionesMensuales:      'liquidaciones_mensuales',
liquidacionesOperario:       'liquidaciones_operario',
retencionesRRHH:             'retenciones_rrhh',
descuentosMonotributoRRHH:   'descuentos_monotributo_rrhh',
revisionesHoras:             'revisiones_horas',
archivosBancarios:           'archivos_bancarios',

// Existente (ya mapeado)
monotributos: 'monotributos',
```

Cablear `supaSync` en todas las funciones que modifican.

#### Cambio 3 — Corregir bug de cálculo en "autorizar pago"

**Qué hay hoy:**
- `_getFilasConsolidadas` usa fórmula distinta a la mostrada.
- El monto autorizado puede no coincidir con el neto mostrado.

**Qué cambia:**
- Unificar la fórmula del neto en UNA sola función.
- Todas las vistas (grilla, modal, autorización) usan esa función.

**Función única:**

```javascript
function calcularNetoOperario(datos) {
  // Bruto
  const bruto = datos.monto_horas + (datos.monto_retiro_enfermos || 0);
  
  // Presentismo (3% sobre bruto)
  const presentismo = bruto * (datos.presentismo_porcentaje / 100);
  
  // Descuentos totales
  const totalDesc = 
    datos.desc_uniforme +
    datos.desc_sanciones +
    datos.desc_adelantos +
    datos.desc_retenciones +
    datos.desc_monotributo +
    (datos.desc_otros || 0);
  
  // Neto
  return bruto + presentismo - totalDesc;
}
```

**Para administrativos:** el bruto es `sueldo_admin`.

#### Cambio 4 — Cablear con Liquidación de Administrativos

**Qué hay hoy:**
- Liq Admin (renderLiqAdmin) existe pero no se integra con Liquidaciones final.

**Qué cambia:**

Al calcular la liquidación mensual, el sistema **también consume** de Liq Admin:

```javascript
async function calcularLiquidacionMensual(periodo) {
  const liquidacion = {
    id_local: generarIdLocal(),
    periodo,
    estado: 'En preparación'
  };
  
  // 1. Operativos (leen de grillasLiq de Liquidación de horas)
  const operativos = await calcularOperativos(periodo);
  
  // 2. Administrativos (leen de liqAdminPersonal + liqAdminHoras)
  const administrativos = await calcularAdministrativos(periodo);
  
  // 3. Consolidar en liquidaciones_operario
  for (const op of [...operativos, ...administrativos]) {
    const descuentos = await consolidarDescuentosOperario(op.legajo_id_local, periodo);
    op.desc_uniforme = descuentos.uniforme;
    op.desc_sanciones = descuentos.sanciones;
    op.desc_adelantos = descuentos.adelantos;
    op.desc_retenciones = descuentos.retConflicto;
    op.desc_monotributo = descuentos.monotributo;
    op.total_descuentos = op.desc_uniforme + op.desc_sanciones + op.desc_adelantos + op.desc_retenciones + op.desc_monotributo;
    op.neto = calcularNetoOperario(op);
  }
  
  // 4. Persistir
  supaSync('liquidacionesMensuales', liquidacion);
  for (const op of [...operativos, ...administrativos]) {
    supaSync('liquidacionesOperario', op);
  }
}
```

#### Cambio 5 — Corregir modal-descuento-liq duplicado

**Qué hay hoy:**
- Modal definido en `index.html:2670` y `index.html:2973`.

**Qué cambia:**
- Eliminar la definición en 2973.
- Verificar que todo el JS use el modal de 2670.

---

### 🟡 Cambios de agregado (features nuevas)

#### Cambio 6 — Botón "Congelar" formalizado con cascada

**Qué hay hoy:**
- `toggleCongelarLiquidacion` existe pero solo cambia estado local.

**Qué cambia:**

Cuando Finanzas presiona "🔒 Congelar":

1. Sistema pide confirmación con impacto:
   - "Vas a congelar la liquidación del mes X. Esto va a bloquear todas las grillas del mes en Liquidación de horas. Supervisores no podrán modificar más. ¿Continuar?"

2. Al confirmar:
   - Estado liquidación → `Congelada`.
   - **Cascada a Liquidación de horas:** todas las grillas del período pasan a estado `Congelada`.
   - Supervisores ven badge rojo "🔒 Congelada — no editable".
   - Ops NO puede aprobar más pendientes.
   - Solo Finanzas puede descongelar (con motivo).

3. **Descongelar (con motivo):**
   - Botón visible solo para Finanzas.
   - Modal con motivo obligatorio.
   - Vuelve las grillas al estado anterior.
   - Queda en auditoría.

#### Cambio 7 — Sección "Retenciones RRHH" separada

**Qué hay hoy:**
- El campo `retConflicto` se carga junto con otros en el modal general.

**Qué cambia:**

Nueva sección en el módulo RRHH (dentro de Liquidaciones o como pestaña propia):

**Tab "Retenciones":**
Vista con retenciones activas + histórico.

Botón "+ Nueva retención":

| Campo | Tipo | Obligatorio |
|---|---|---|
| Asociado | Autocompletado | Sí |
| Período | YYYY-MM | Sí |
| Tipo | Radio (Retención por conflicto / Otra) | Sí |
| Motivo | Textarea | Sí |
| Monto | Number | Sí |

Al guardar → se persiste en `retenciones_rrhh` con estado "Vigente".

Cuando se calcula la liquidación mensual, se lee automáticamente.

#### Cambio 8 — Sección "Descuentos por monotributo" separada

Similar a retenciones.

**Tab "Descuentos monotributo":**

Botón "+ Nuevo descuento":

| Campo | Tipo | Obligatorio |
|---|---|---|
| Asociado | Autocompletado | Sí |
| Período | YYYY-MM | Sí |
| Motivo | Textarea | Sí (descripción de la inasistencia) |
| Días de inasistencia | Number | Opcional |
| Monto | Number | Sí |

**Alerta contextual:** al buscar un asociado, sistema muestra sus ausencias del mes según Enfermos y otras fuentes (informativo — RRHH decide el monto).

#### Cambio 9 — Feature "Revisión de horas" — ajustes post-pago

**Qué hay hoy:**
- Se completa un papel que va a Finanzas manualmente.

**Qué cambia:**

Nueva feature en el sistema.

**Quién puede cargar Revisiones:**
- Supervisores (sobre operarios de sus servicios).
- Equipo de Operaciones (sobre cualquier operario).

**Botón "📝 Nueva revisión de horas"** visible en el módulo.

Modal:

| Campo | Tipo | Obligatorio |
|---|---|---|
| Asociado | Autocompletado | Sí |
| Período al que corresponde | YYYY-MM (solo períodos ya pagados) | Sí |
| Motivo del error | Textarea | Sí |
| Horas faltantes | Number | Opcional |
| Monto de diferencia | Number | Sí (siempre a favor del operario) |
| Adjuntos | File input | Opcional |

Al guardar → estado "Pendiente" + notificación automática a Finanzas.

**Bandeja de Finanzas:**

Nuevo tab "Revisiones pendientes" con:
- Lista de revisiones cargadas.
- Botón "Aprobar" (con motivo opcional) → estado "Aprobada".
- Botón "Rechazar" (con motivo obligatorio) → estado "Rechazada" + notificación al cargador.

**Después de aprobar:**
- La revisión aparece en "Revisiones aprobadas — listas para pagar".
- Finanzas puede seleccionar N revisiones + presionar "Generar archivo bancario".
- El archivo generado es del tipo "Revisión de horas".
- Al ejecutarse el pago (por fuera), estado → "Pagada".

#### Cambio 10 — Exportación bancaria (archivo Excel)

**Qué hay hoy:**
- `exportarLiquidacion` es un toast "próximamente".

**Qué cambia:**

**Etapa 1 (este delta) — Excel genérico:**

Al aprobar liquidación mensual (o revisiones), botón "📥 Generar archivo bancario".

El archivo Excel contiene columnas estándar:
- CBU / CVU.
- DNI.
- Nombre y apellido.
- Monto neto.
- Concepto (ej: "Liquidación 2026-07" o "Revisión mes 2026-06").
- Referencia interna.

Se genera y descarga.

Se registra en `archivos_bancarios`.

**Etapa 2 (futura, cuando Lautaro pase el formato) — Formato específico del banco:**
- Sistema puede tener múltiples formatos (Nación / Provincia / etc.).
- Configurable en Configuración → Bancos.
- Genera archivo específico según el que se elija.

#### Cambio 11 — Alertas de anomalías

Al calcular la liquidación mensual, sistema alerta sobre:

**🟡 Alertas suaves (informativas):**
- Operarios con neto < 30% de su promedio histórico (posible error).
- Operarios con neto > 200% de su promedio (posible carga errónea).
- Descuentos muy altos (>50% del bruto).
- Operarios que aparecen por primera vez (nuevos ingresos).

**🔴 Alertas fuertes (bloqueantes):**
- Operario sin valor hora vigente en su categoría/servicio.
- Descuentos con monto negativo.
- Neto negativo.
- Bruto = 0 con operario activo.

Antes de "Congelar", todas las alertas fuertes deben resolverse.

#### Cambio 12 — Auditoría con snapshot al pagar

Al marcar la liquidación como "Pagada":

- Se congela un snapshot completo en `liquidaciones_operario` (los valores del momento).
- Se registra `fecha_pago` + `archivo_bancario_id_local`.
- Ya no se puede modificar la liquidación.
- Correcciones se hacen via "Revisión de horas".

---

### 🟢 Cambios de consolidación menor

#### Cambio 13 — Persistir catálogo de tipos de descuento

Hoy están hardcoded. Convertirlos en catálogo configurable en `configuracion_liquidaciones` para futuras extensiones.

#### Cambio 14 — Historial de eventos por liquidación mensual

Nueva tabla `liquidacion_eventos` para auditoría (quién congeló, cuándo, motivos de descongelamiento, etc.).

---

## 3. Modelo de flujo actualizado

### 3.1 Diagrama del ciclo mensual

```
[Fin de mes]
  ↓
[Supervisores cierran grillas de horas]
  ↓
[Ops aprueba grillas]
  ↓
[RRHH carga retenciones y descuentos monotributo]
  ↓
[Finanzas ejecuta "Calcular liquidación del mes"]
  ↓
Sistema consolida automáticamente:
  - Horas × valor hora (categorías)
  - Retiros Enfermos
  - Descuentos Uniformes/Sanciones/Adelantos (automáticos)
  - Retenciones + Monotributo (de RRHH)
  - Sueldos Administrativos
  ↓
[Liquidación en preparación — con alertas]
  ↓
[Finanzas revisa y resuelve alertas fuertes]
  ↓
[Finanzas presiona "🔒 Congelar"]
  ↓
[Todas las grillas se congelan en cascada]
  ↓
[Finanzas aprueba]
  ↓
[Sistema genera archivo bancario]
  ↓
[Finanzas ejecuta transferencia por fuera]
  ↓
[Finanzas marca "Pagada"]
  ↓
[Post-pago: Revisiones de horas si hay diferencias]
```

### 3.2 Estados de la liquidación mensual

| Estado | Descripción |
|---|---|
| En preparación | Cálculo en curso, se pueden ajustar descuentos manuales |
| Congelada | Grillas bloqueadas, alertas resueltas |
| Aprobada | Lista para generar archivo bancario |
| Pagada | Transferencias ejecutadas, cierre definitivo |

---

## 4. Integraciones

### 4.1 Con Liquidación de horas
- Lee `horas_grilla` con `estado_aprobacion = 'Impacta'` o `'Aprobada'`.
- Congela grillas del mes al congelar la liquidación.
- Recibe Revisiones de horas post-pago.

### 4.2 Con Liquidación de Administrativos
- Lee `liqAdminPersonal + liqAdminHoras + liqAdminValores` para calcular sueldos fijos.
- Consolida en `liquidaciones_operario`.

### 4.3 Con Categorías
- Consulta `obtenerValorHoraVigente(categoria, servicio, fecha)`.
- Si el operario tiene categoría alternativa (Retén), usa esa.

### 4.4 Con Enfermos y Accidentes
- Consume `retiros_enfermos_pendientes` con `estado = 'Pendiente'` para el período.
- Los aplica como monto adicional al bruto.
- Marca como `Aplicado` al confirmar.

### 4.5 Con Uniformes
- Consume `descuentos_uniforme_pendientes` para el período.
- Marca como `Aplicado`.

### 4.6 Con Sanciones
- Consume `descuentos_sanciones_pendientes`.
- Marca como `Aplicado`.

### 4.7 Con Adelantos y Préstamos
- Consume `descuentos_adelantos_pendientes` para el período.
- Marca como `Aplicado`.

### 4.8 Con Objetivos
- Lee `objetivos.supervisor_asignado` para filtrar grillas.

### 4.9 Con sistema de notificaciones
- Notificaciones a Finanzas cuando hay revisiones pendientes.
- Notificaciones a supervisores cuando su revisión es aprobada/rechazada.
- Notificaciones a Ops cuando grillas se congelan.

---

## 5. Etapas de implementación

### Etapa 1 — Persistencia base (crítica)
- Crear todas las tablas nuevas.
- Mapear en `_SM`.
- Cablear `supaSync` en funciones existentes.
- Corregir modal-descuento-liq duplicado.

### Etapa 2 — Cablear integraciones automáticas de descuentos (CORE)
- Cambio 1: consolidarDescuentosOperario.
- Cambio 3: unificar fórmula del neto.
- Cambio 4: cablear con Liq Admin.

**Al terminar:** el módulo ya calcula correctamente sin campos manuales.

### Etapa 3 — Retenciones y monotributo por RRHH
- Cambio 7: sección Retenciones.
- Cambio 8: sección Descuentos monotributo.

### Etapa 4 — Congelamiento y flujo formal
- Cambio 6: congelamiento con cascada.
- Cambio 11: alertas de anomalías.
- Cambio 12: snapshot al pagar.

### Etapa 5 — Exportación bancaria
- Cambio 10: Excel genérico (Etapa 1).
- (Etapa 2: formato específico cuando Lautaro pase el ejemplo).

### Etapa 6 — Revisiones de horas
- Cambio 9: feature completa.

### Etapa 7 — Consolidación menor
- Cambios 13, 14.

### Etapa 8 — Migración a `src/modules/`
- Extraer a `src/modules/liquidaciones/` y `src/modules/liq_admin/`.

---

## 6. Prerequisitos

**Prerequisitos duros (deben estar implementados antes):**

1. Delta de Liquidación de horas (para `horas_grilla`).
2. Delta de Categorías (para `valores_hora_categoria`).
3. Delta de Uniformes (para `descuentos_uniforme_pendientes`).
4. Delta de Sanciones (para `descuentos_sanciones_pendientes`).
5. Delta de Adelantos (para `descuentos_adelantos_pendientes`).
6. Delta de Enfermos (para `retiros_enfermos_pendientes`).
7. Delta de Objetivos (para `supervisor_asignado`).

**Prerequisitos operativos:**

8. **Sistema de permisos por rol** — filtrar bandejas y acciones.
9. **Coordinación con Lautaro** para el formato del archivo bancario (Etapa 2 futura).
10. **Verificar que todos los operarios activos tengan CBU cargado** en Legajos.

---

## 7. Casos borde

### 7.1 Operario sin CBU
Alerta fuerte. No se puede generar archivo bancario.

### 7.2 Operario sin valor hora vigente
Alerta fuerte. Se debe cargar valor en Categorías antes de continuar.

### 7.3 Descuento superior al bruto
Neto negativo. Alerta fuerte. RRHH decide (puede aprobar con "diferido para el próximo mes").

### 7.4 Operario dado de baja durante el mes
Se liquidan solo los días trabajados hasta la baja.

### 7.5 Operario nuevo (ingreso a mitad de mes)
Aparece con los días trabajados. Alerta suave: "Ingreso nuevo".

### 7.6 Cambio de categoría durante el mes
Se aplica valor hora de la categoría vigente cada día.

### 7.7 Revisión de horas de un mes anulado
Bloqueo. Error visible.

### 7.8 Revisión de horas con monto = 0
Bloqueo. Error visible.

### 7.9 Congelar liquidación con grillas aún en carga
Bloqueo. "Existen N grillas sin cerrar. Consultá con Ops."

### 7.10 Descongelar liquidación pagada
Bloqueo. Ya no se puede.

### 7.11 Ejecución "Calcular" con período ya calculado
Sistema pregunta: "¿Recalcular? Los datos actuales se sobrescriben."

### 7.12 Retención cargada con período pasado ya pagado
Alerta: "El período ya fue pagado. Esta retención aplicará al próximo mes."

---

## 8. Convenciones respetadas

- Nombres en español.
- camelCase en frontend, snake_case en Supabase.
- Soft delete (política A.7).
- Auditoría de transiciones.
- Un commit por cambio lógico (política A.3).
- Trazabilidad total del origen de cada descuento.

---

## 9. Bugs conocidos a corregir del legacy

1. **Descuentos 100% manuales** — se cablea (Cambio 1).
2. **Sin persistencia** — se persiste (Cambio 2).
3. **Bug de cálculo del neto** entre pantalla y autorización — se unifica (Cambio 3).
4. **Modal duplicado** — se elimina (Cambio 5).
5. **exportarLiquidacion es toast** — se implementa Excel (Cambio 10).
6. **Sin integración Liq Admin** — se cablea (Cambio 4).
7. **Sin flujo formal de revisiones** — se implementa (Cambio 9).

---

## 10. FAQ

**¿Puedo tocar los módulos que provean datos (Sanciones, Uniformes, etc.)?**
No. Solo consumís sus tablas `descuentos_*_pendientes`. NO modificás su lógica.

**¿Qué pasa si un descuento fue mal cargado en el módulo origen?**
Se corrige en el módulo origen. Al recalcular la liquidación, se actualiza. Si ya se pagó, se hace una Revisión de horas para compensar.

**¿Las retenciones y monotributo son solo mensuales?**
Sí, cada carga aplica a un período específico. No hay cuotas — casos particulares.

**¿El presentismo del 3% aplica a todos?**
Sí, por default. Si hay excepciones (sanciones que quitan presentismo, etc.), se documenta con Gabi como TODO.

**¿Se pueden pagar liquidaciones parciales (solo algunos operarios)?**
No en esta versión. Se paga todo el mes junto.

**¿Qué diferencia hay entre "Aprobada" y "Pagada"?**
Aprobada = lista para pagar, archivo generado. Pagada = transferencias ejecutadas y confirmadas.

**¿Puedo revertir una liquidación pagada?**
No directamente. Errores se corrigen con Revisiones de horas (a favor del operario).

**¿Cuándo se generan las Revisiones?**
En los días siguientes al pago, cuando supervisores o Ops detectan diferencias.

**¿Los administrativos tienen presentismo?**
Por definir con Gabi. Presumo que sí (mismo régimen paritario).

**¿Qué pasa con el excedente de EFT que Ops aprobó?**
Se paga como horas normales (queda dentro del bruto).

---

## 11. Cierre

Este delta es el **último del ciclo operativo del sistema**. Cierra la cadena completa: **Comercial capta cliente → Ops asigna supervisor → Supervisor carga horas → Todos los módulos generan descuentos/retiros → Finanzas paga**.

Los cambios clave:
1. **Cablear todas las integraciones automáticas** — 6 fuentes convergen sin cargar a mano.
2. **Persistir todo** — pasa de prototipo a sistema real.
3. **Corregir bug de cálculo** — el mismo neto en pantalla y en pago.
4. **Congelamiento en cascada** — Finanzas bloquea todo el ciclo.
5. **Feature Revisión de horas** — formaliza los ajustes post-pago (hoy es papel).
6. **Exportación bancaria** — Excel genérico + preparación para formato específico futuro.

**Estimación de trabajo para Fede:** 250-350 horas. Es el módulo más grande del paquete por:
- Integración con 6 fuentes distintas.
- Sensibilidad legal/económica (revisar cada cálculo).
- Feature nueva grande (Revisión de horas).
- Exportación bancaria (nueva).
- Corrección de bug de cálculo (delicado).

**Coordinación con Lautaro requerida:**
- Formato específico del archivo bancario (Etapa 2).
- Validación de la fórmula del neto ("presentismo del 3%").
- Excepciones al presentismo (con Gabi).
- Revisión de casos borde específicos.

**Objetivo estratégico:** que Finanzas (Natividad) tenga TODO el proceso de liquidación en el sistema. Que se elimine el Excel + papel actual. Que las Revisiones formales reemplacen los papeles físicos.

**Sensibilidad especial:** este módulo maneja **pagos reales a operarios**. Cada error se paga (literalmente) mal. Fede debe:
- Testear exhaustivamente cada cálculo.
- Validar contra datos reales de un mes conocido antes de producción.
- Coordinar con Lautaro/Natividad en cada etapa.

Ante duda: **preguntar antes de codear** (política A.4).

**¡Que las cuentas cierren!** 💰🏦
