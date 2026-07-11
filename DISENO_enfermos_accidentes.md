# Diseño del módulo Enfermos y Accidentes — Especificación para implementación

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Enfermos y Accidentes
**Autor del diseño:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-09
**Versión:** 1.0

---

## Cómo usar este documento

Este documento es la **fuente de verdad** para implementar el módulo Enfermos y Accidentes.

**Antes de escribir código:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, el inventario técnico (`docs/INVENTARIO_enfermos_accidentes_legacy.md`), la **Política de Certificados Médicos — Coop. Ohlimpia** (documento adjunto), y el **diseño del módulo Categorías** (`docs/DISENO_categorias.md`, del cual este módulo depende).

**Prerequisito:** el módulo **Categorías** debe estar implementado antes que este.

---

## 1. Contexto

### 1.1 Qué es Enfermos y Accidentes

Módulo que gestiona el seguimiento formal de asociados que están de licencia por **enfermedad** o **accidente**. Cubre desde el día 4 en adelante (los primeros 3 días se gestionan por la planilla de liquidación de horas como "artículo de trabajo").

**Doble propósito:**
1. **Trazabilidad del caso médico** (parte médico, tratamiento, alta).
2. **Cálculo del retiro que se le paga al asociado** mientras dura el caso, con valor hora congelado al momento de ingreso.

### 1.2 Terminología usada en la cooperativa

- **"Artículo de trabajo"** (o **"art 42"** como código interno) — código que usa el supervisor en la planilla de horas cuando el operario falta por enfermedad/accidente.
- Los primeros 3 días consecutivos de "art 42" los gestiona el supervisor en la planilla de horas.
- A partir del día 4, el asociado entra a este módulo con seguimiento formal por RRHH.

**Nota:** en Argentina "ART" comúnmente se refiere a Aseguradoras de Riesgos del Trabajo. **En Ohlimpia NO hay aseguradora — la cooperativa paga directamente**. El código "art 42" es solo un identificador interno.

### 1.3 Alcance

**Incluye:**
- Casos de **enfermedad** (común o profesional).
- Casos de **accidente** (laboral, in itinere, no laboral).
- Tanto para **operativos** como **administrativos**.
- Seguimiento del parte médico (con validación de certificados según ley 17132).
- Cálculo del retiro a pagar al asociado.
- Congelamiento del valor hora al momento del ingreso al caso.
- Impacto en Liquidaciones (cuando este módulo migre).
- Alta del caso (por médico o decisión del Gerente de RRHH).

**No incluye:**
- Gestión del "art 42" en los primeros 3 días (eso vive en Liquidación de horas).
- Automatización de la escalada al día 4 (por ahora RRHH detecta manualmente; hook automático queda como TODO cuando Liquidación de horas se migre).

### 1.4 Dueño del proceso

**RRHH** es dueña del seguimiento formal del caso una vez que se abre. **Supervisores** solo intervienen al inicio (informar el episodio y cargar art 42 en planilla).

### 1.5 Flujo general del caso

```
Día 1-3
  Operario falta por enfermedad/accidente
  Supervisor carga "art 42" en planilla de horas del servicio
  ↓
Día 4 (o cuando corresponda)
  RRHH detecta escalada (por ahora manualmente; a futuro con hook automático)
  RRHH abre el caso en este módulo
  ↓
Caso Abierto
  RRHH carga: tipo (Enfermedad / Accidente), datos del caso, parte médico
  Se congela el valor hora del asociado (según categoría + servicio + fecha)
  Se registra la fecha de inicio (día 1 del cuadro)
  ↓
Seguimiento mensual
  Cada mes, RRHH carga las horas y calcula el retiro a pagar
  Genera compromiso económico en tabla propia (para Liquidaciones futura)
  ↓
Alta del caso
  Por alta médica (con certificado) O
  Por decisión del Gerente de RRHH
  ↓
Caso Cerrado → pasa al tab Histórico
```

### 1.6 Estado actual (antes de esta implementación)

Ver `docs/INVENTARIO_enfermos_accidentes_legacy.md`. Resumen:

**El módulo actual está prácticamente vacío de funcionalidad real:**

1. **Flujo partido en dos artefactos desconectados.** Días 1-3 en Liquidación de horas (tipo `art42`). Días 4+ en módulo Enfermos. Sin puente automático — solo un toast.
2. **Modal engañoso.** 13 campos visibles, `guardarEnfermo` solo guarda 4.
3. **Bug de persistencia grave.** Por llaves faltantes, cuando matchea legajo, ni el caso ni el legajo se persisten. Probablemente muchos casos históricos perdidos.
4. **Cero integración real con Legajos.** Solo setea `estadoMedico` como escalar.
5. **Sin distinción Enfermedad vs Accidente** — no hay tabs.
6. **Sin motor económico.** No calcula retiro. Solo un descuento manual "retEnfermedad" en la grilla.
7. **Sin certificados médicos validados.** Solo un checkbox "habilitado" sin campos legales.
8. **Sin tab Histórico.**

**Conclusión:** política A.11 sin duda. Rediseño total.

### 1.7 Objetivo de esta implementación

1. **Rediseñar completamente** en `src/modules/enfermos_accidentes/`.
2. **3 tabs claros:** Enfermedades / Accidentes / Histórico.
3. **Modelo de datos rico** con separación de datos comunes y datos específicos por tipo.
4. **Certificados médicos** con validación por RRHH según ley 17132.
5. **Congelamiento del valor hora** al momento del ingreso (usando módulo Categorías).
6. **Cálculo mensual del retiro** con horas automáticas y edición manual.
7. **Integración con Liquidación de horas** (por ahora manual; hook a futuro).
8. **Integración con Legajos** (historial médico visible).
9. **Integración con Sanciones** (alerta a supervisor cuando ausencia queda injustificada por falta de certificado).
10. **Confidencialidad** de datos médicos (solo RRHH ve diagnóstico CIE-10).

---

## 2. Alcance

### 2.1 Incluye
- Tablas para casos (con datos comunes + específicos por tipo).
- Tablas para certificados médicos.
- Tablas para partes médicos mensuales.
- Módulo con 3 tabs.
- Modales de alta de caso, carga de certificado, cierre de caso.
- Consulta al módulo Categorías para congelar valor hora.
- Compromisos económicos en tabla propia (`retiros_enfermos_pendientes`).
- Alertas por vencimiento de certificados no presentados.
- Botón manual "Buscar casos art 42 con 3+ días" (puente manual con planilla).

### 2.2 No incluye
- Hook automático desde Liquidación de horas (documentado como TODO).
- Cálculo automático de horas específicas por día (por ahora horas totales mensuales, editables).
- Módulo de administrativos con sueldo mensual proporcional (pendiente confirmación con Gabi).
- Emisión de certificados médicos por el sistema (solo se cargan los que trae el asociado).

---

## 3. Decisiones tomadas

### 3.1 Rediseño completo
No se parcha el legacy.

### 3.2 3 tabs por tipo + Histórico
- **Tab 1:** Enfermedades activas.
- **Tab 2:** Accidentes activos.
- **Tab 3:** Histórico (casos cerrados de ambos tipos).
- **Tab 4:** Certificados (gestión y validación).

### 3.3 Fecha de inicio = día 1 del cuadro (no el día 4)
El caso se registra desde el día 1 de la ausencia (no desde el día 4 cuando entra al módulo). Los días 1-3 quedan asociados al caso pero se pagaron por planilla.

### 3.4 Valor hora congelado al momento del ingreso
Al abrir el caso, el sistema:
1. Lee la categoría del asociado del legajo.
2. Consulta al módulo Categorías el valor hora vigente para esa combinación categoría + servicio.
3. Congela el valor en el caso.
4. Todo el retiro que se pague durante el caso usa ese valor congelado.
5. Si hay paritaria durante el caso, NO se recalcula. El asociado cobra con el valor congelado.

### 3.5 Administrativos con TODO
Los administrativos cobran mensual fijo. Su cálculo es distinto (sueldo proporcional a días del caso en el mes). Como no hay política clara, se documenta como TODO y se implementa después con clarificación de Gabi.

En esta versión, si un administrativo entra a un caso:
- Se registra el caso normalmente.
- La sección económica muestra "Cálculo pendiente — clarificar con Gabi".
- RRHH lo gestiona manualmente por fuera.

### 3.6 Horas mensuales automáticas con edición manual
Cada mes, el sistema propone las horas del asociado según:
- Días del caso en ese mes.
- Carga horaria estándar del asociado (jornada completa = 8hs, media jornada = 4hs, según categoría).

RRHH puede editar los valores propuestos si hay excepciones.

### 3.7 Certificados médicos con validación

Ley 17132 exige que el certificado tenga:
- Nombre y apellido del médico.
- Profesión.
- Número de matrícula.
- Domicilio del médico.
- Identidad del asistido (nombre + DNI).
- Diagnóstico según CIE-10.
- Duración de la incapacidad.

RRHH valida y aprueba o rechaza el certificado. Si falta información obligatoria, queda "Observado" y RRHH puede darle 24hs más al asociado antes de considerar la ausencia injustificada.

### 3.8 Plazo de 24 hs para presentar certificado

Según política, el asociado tiene 24hs desde el inicio de la ausencia para presentar el certificado. Si pasa el plazo sin certificado:
- Alerta al supervisor y RRHH.
- La ausencia puede quedar como injustificada.
- Se dispara hook opcional a Sanciones (RRHH decide si sancionar).

### 3.9 Confidencialidad del diagnóstico

El diagnóstico CIE-10 se guarda pero **NO se muestra en vistas generales**. Solo RRHH (o Administrador total) puede verlo. Los supervisores ven solo "El operario está en tratamiento por N días" sin diagnóstico.

En Legajos, el detalle del caso muestra "Ver diagnóstico" solo para roles autorizados.

### 3.10 Alta del caso
Dos formas:
- **Alta médica** con certificado de alta.
- **Decisión del Gerente de RRHH** (con motivo obligatorio).

Ambas cierran el caso. Pasa al tab Histórico.

### 3.11 Puente manual con Liquidación de horas
En el módulo, hay un botón "Buscar casos art 42 ≥ 3 días" que consulta `DB.art42` y muestra candidatos. RRHH decide cuáles abrir como casos formales.

Hook automático queda como TODO documentado. Cuando Liquidación de horas migre a `src/modules/`, se implementa el hook.

### 3.12 Impacto en Liquidaciones
Se genera compromiso en tabla `retiros_enfermos_pendientes`. Cuando Liquidaciones migre, consumirá esta tabla.

### 3.13 Hook con Sanciones
Cuando una ausencia queda injustificada (por certificado no presentado o rechazado), se dispara notificación al supervisor sugiriendo posible sanción (INF-003 o INF-004). No genera sanción automática — solo alerta.

---

## 4. Modelo de datos

### 4.1 SQL versionado

Crear `sql/v021_enfermos_accidentes.sql`:

```sql
-- v021 — Módulo Enfermos y Accidentes
BEGIN;

-- Tabla 1 — casos_enfermos_accidentes (registro central)
CREATE TABLE public.casos_enfermos_accidentes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  -- Datos comunes del asociado
  legajo_id_local        text NOT NULL,
  nro_socio              text NOT NULL,
  nombre_asociado        text NOT NULL,
  tipo_asociado          text NOT NULL,       -- Operativo / Administrativo
  servicio               text,                -- si operativo
  supervisor             text,                -- si operativo
  area                   text,                -- si administrativo
  
  -- Tipo de caso
  tipo_caso              text NOT NULL,       -- Enfermedad / Accidente
  subtipo                text,                -- Enfermedad común / Enfermedad profesional / Accidente laboral / Accidente in itinere / Accidente no laboral
  
  -- Fechas
  fecha_inicio           date NOT NULL,       -- día 1 de la ausencia
  fecha_ingreso_modulo   timestamptz NOT NULL DEFAULT now(),  -- cuando RRHH abrió el caso
  fecha_alta_prevista    date,                -- según parte médico
  fecha_alta_efectiva    date,                -- cuando se cierra el caso
  
  -- Categoría y valor hora (congelado al ingreso)
  categoria_id_local     text,                -- ref a categorias_base (política snapshot)
  categoria_nombre       text,                -- desnormalizado
  servicio_al_ingreso    text,                -- snapshot del servicio al momento
  valor_hora_congelado   numeric(10,2),       -- valor congelado en el caso
  valor_hora_id_local    text,                -- ref a valores_hora_categoria
  
  -- Estado del caso
  estado                 text NOT NULL DEFAULT 'Abierto',
    -- Abierto / Cerrado por alta médica / Cerrado por decisión RRHH / Anulado
  
  -- Cierre
  fecha_cierre           timestamptz,
  cerrado_por            text,
  motivo_cierre          text,                -- Alta médica / Decisión RRHH
  observaciones_cierre   text,
  
  -- Datos específicos de Enfermedad (JSONB para no crear muchos campos vacíos si es Accidente)
  datos_enfermedad       jsonb,               -- { diagnostico_cie10, especialidad, medico_tratante, kinesiologo, contactos, ... }
  
  -- Datos específicos de Accidente
  datos_accidente        jsonb,               -- { fecha_hora, lugar, testigos, tipo (laboral/in_itinere/no_laboral), descripcion_hecho, ... }
  
  observaciones          text,
  cargado_por            text NOT NULL,
  
  anulado                boolean NOT NULL DEFAULT false,
  fecha_anulacion        timestamptz,
  anulado_por            text,
  motivo_anulacion       text,
  
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cea_legajo    ON public.casos_enfermos_accidentes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_cea_estado    ON public.casos_enfermos_accidentes(estado) WHERE NOT anulado;
CREATE INDEX idx_cea_tipo      ON public.casos_enfermos_accidentes(tipo_caso) WHERE NOT anulado;
CREATE INDEX idx_cea_inicio    ON public.casos_enfermos_accidentes(fecha_inicio) WHERE NOT anulado;

-- Tabla 2 — certificados_medicos
CREATE TABLE public.certificados_medicos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  caso_id_local          text NOT NULL,       -- ref al caso
  legajo_id_local        text NOT NULL,       -- desnormalizado
  
  -- Datos del médico (obligatorios por ley 17132)
  medico_apellido_nombre text NOT NULL,
  medico_profesion       text NOT NULL,
  medico_matricula       text NOT NULL,
  medico_domicilio       text NOT NULL,
  medico_telefono        text,
  medico_email           text,
  
  -- Datos del asistido
  paciente_nombre        text NOT NULL,       -- se rellena con nombre del asociado
  paciente_documento_tipo text NOT NULL,      -- DNI / Pasaporte / etc.
  paciente_documento_nro  text NOT NULL,
  
  -- Contenido médico
  diagnostico_cie10      text NOT NULL,       -- confidencial, solo RRHH
  fecha_emision          date NOT NULL,
  duracion_incapacidad_dias  integer NOT NULL,
  fecha_incapacidad_desde date NOT NULL,
  fecha_incapacidad_hasta date NOT NULL,
  observaciones_medicas  text,
  
  -- Adjunto (foto del certificado)
  adjunto_id_local       text NOT NULL,
  
  -- Validación por RRHH
  estado_validacion      text NOT NULL DEFAULT 'Pendiente',
    -- Pendiente / Aprobado / Observado / Rechazado (nulo)
  validado_por           text,
  fecha_validacion       timestamptz,
  observaciones_validacion text,
  
  -- Metadata
  presentado_en          timestamptz NOT NULL DEFAULT now(),
  presentado_por         text NOT NULL,       -- puede ser el supervisor o RRHH cargando
  medio_presentacion     text,                -- Presencial / WhatsApp / Email
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cm_caso   ON public.certificados_medicos(caso_id_local) WHERE NOT anulado;
CREATE INDEX idx_cm_legajo ON public.certificados_medicos(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_cm_estado ON public.certificados_medicos(estado_validacion) WHERE NOT anulado;

-- Tabla 3 — retiros_enfermos_pendientes (compromisos mensuales para Liquidaciones)
CREATE TABLE public.retiros_enfermos_pendientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  caso_id_local          text NOT NULL,
  legajo_id_local        text NOT NULL,       -- desnormalizado
  
  periodo                text NOT NULL,       -- YYYY-MM
  
  -- Cálculo del retiro mensual
  dias_del_caso_en_mes   integer NOT NULL,    -- días efectivos del caso en el mes
  horas_calculadas       numeric(10,2) NOT NULL,  -- automáticas según carga horaria
  horas_ajustadas        numeric(10,2) NOT NULL,  -- editadas por RRHH si aplica
  valor_hora_congelado   numeric(10,2) NOT NULL,  -- del caso
  monto_retiro           numeric(10,2) NOT NULL,  -- horas_ajustadas * valor_hora_congelado
  
  estado                 text NOT NULL DEFAULT 'Pendiente',
    -- Pendiente / Aplicado / Cancelado
  
  fecha_generado         timestamptz NOT NULL DEFAULT now(),
  fecha_aplicacion       timestamptz,
  aplicado_por           text,
  
  cargado_por            text NOT NULL,
  observaciones          text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rep_caso    ON public.retiros_enfermos_pendientes(caso_id_local) WHERE NOT anulado;
CREATE INDEX idx_rep_legajo  ON public.retiros_enfermos_pendientes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_rep_periodo ON public.retiros_enfermos_pendientes(periodo) WHERE NOT anulado;

-- Tabla 4 — caso_eventos (auditoría de estado)
CREATE TABLE public.caso_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  caso_id_local          text NOT NULL,
  
  estado_desde           text,
  estado_hasta           text NOT NULL,
  ejecutado_por          text NOT NULL,
  ejecutado_en           timestamptz NOT NULL DEFAULT now(),
  observaciones          text,
  
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ce_caso ON public.caso_eventos(caso_id_local);

COMMIT;
```

### 4.2 Mapeo en `src/shared/supabase.js`

```javascript
casosEnfermosAccidentes:    'casos_enfermos_accidentes',
certificadosMedicos:        'certificados_medicos',
retirosEnfermosPendientes:  'retiros_enfermos_pendientes',
casoEventos:                'caso_eventos',
```

### 4.3 Catálogos hardcoded

```javascript
const TIPOS_CASO = ['Enfermedad', 'Accidente'];

const SUBTIPOS_ENFERMEDAD = ['Enfermedad común', 'Enfermedad profesional'];

const SUBTIPOS_ACCIDENTE = [
  'Accidente laboral',
  'Accidente in itinere',
  'Accidente no laboral'
];

const ESTADOS_CASO = [
  'Abierto',
  'Cerrado por alta médica',
  'Cerrado por decisión RRHH',
  'Anulado'
];

const ESTADOS_CERTIFICADO = [
  'Pendiente',
  'Aprobado',
  'Observado',
  'Rechazado'
];

const TIPOS_DOCUMENTO = ['DNI', 'Pasaporte', 'CI', 'LC', 'LE'];
```

---

## 5. Estructura del módulo

```
src/modules/enfermos_accidentes/
├── index.js              — Re-exports y bindings al window
├── enfermos.js           — Lógica principal (renders + tabs)
├── certificados.js       — Gestión de certificados médicos
├── retiros.js            — Cálculo mensual del retiro
├── categoria_helper.js   — Consultas al módulo Categorías (valor hora congelado)
├── puente_horas.js       — Consulta a Liquidación de horas para casos art 42
└── permisos.js           — Confidencialidad del diagnóstico
```

---

## 6. Tabs del módulo

### 6.1 Tab 1 — Enfermedades activas

Casos activos de tipo Enfermedad.

Columnas: Asociado · Nº socio · Servicio/Área · Supervisor · Subtipo · Fecha inicio · Días transcurridos · Certificado (badge estado) · Alta prevista · Última carga mensual · Acciones.

**Confidencialidad:** el diagnóstico CIE-10 NO se muestra en esta tabla. Solo se ve al abrir el detalle si el usuario tiene rol autorizado.

Filtros: buscador, servicio/área, supervisor, subtipo, con/sin certificado válido, rango de fechas.

Acciones: 👁 Ver detalle · 📄 Ver certificados · 💰 Gestionar retiro mensual · 🏁 Cerrar caso.

### 6.2 Tab 2 — Accidentes activos

Igual estructura pero para casos de tipo Accidente. Además muestra:
- Subtipo (laboral / in itinere / no laboral).
- Lugar del accidente.

### 6.3 Tab 3 — Histórico

Casos cerrados (ambos tipos). Solo lectura para consulta y auditoría.

Columnas: Asociado · Tipo · Subtipo · Fecha inicio · Fecha cierre · Duración · Motivo cierre · Total pagado · Acciones.

Filtros: buscador, tipo, año, servicio, motivo cierre.

Botón "📥 Exportar a Excel".

### 6.4 Tab 4 — Certificados

Gestión de certificados médicos. Vista con todos los certificados (recientes primero).

Columnas: Asociado · Caso · Médico · Matrícula · Fecha emisión · Duración · Estado validación · Validado por · Fecha validación · Acciones.

Filtros: por estado de validación, por asociado, por rango de fechas.

Acciones: 👁 Ver certificado (foto + datos) · ✅ Validar · ❌ Rechazar · ⚠️ Observar.

Botón "+ Cargar certificado" — para RRHH cuando el asociado no lo carga directamente.

---

## 7. Modales del módulo

### 7.1 Modal "Abrir nuevo caso"

Modal grande dividido en secciones.

**Sección 1 — Asociado:**

| Campo | Tipo | Notas |
|---|---|---|
| Asociado | Autocompletado sobre legajos activos | Obligatorio |
| Nº socio | Auto | — |
| Tipo (Operativo/Administrativo) | Auto | — |
| Servicio o Área | Auto | — |
| Supervisor (si operativo) | Auto | — |
| Categoría base (si operativo) | Auto | Del legajo |
| Antigüedad | Auto | — |

**Sección 2 — Datos del caso:**

| Campo | Tipo | Notas |
|---|---|---|
| Tipo de caso | Radio (Enfermedad / Accidente) | Obligatorio |
| Subtipo | Select (según tipo) | Obligatorio |
| Fecha de inicio | Date | Obligatorio (día 1 de la ausencia) |
| Fecha alta prevista | Date | Opcional |
| Descripción | Textarea | Opcional |

**Sección 3 — Solo para Enfermedad:**

| Campo | Tipo | Notas |
|---|---|---|
| Diagnóstico CIE-10 | Text | Confidencial |
| Especialidad | Text | |
| Médico tratante | Text | |
| Kinesiólogo | Text | Opcional |
| Contacto del asociado | Text | Teléfono |

**Sección 4 — Solo para Accidente:**

| Campo | Tipo | Notas |
|---|---|---|
| Fecha y hora del accidente | DateTime | Obligatorio |
| Lugar | Text | Obligatorio |
| Testigos | Textarea | Opcional |
| Descripción del hecho | Textarea | Obligatorio |

**Sección 5 — Valor hora congelado (auto):**

Sistema muestra:
- Categoría: [auto del legajo]
- Servicio: [auto del legajo]
- Valor hora vigente: [$X.XXX] (consultado al módulo Categorías)
- **Al confirmar, este valor se congela en el caso.**

Si no hay valor vigente cargado en Categorías → error visible. RRHH tiene que cargar el valor antes de continuar.

**Botones:**
- Guardar → crea caso en estado Abierto.
- Cancelar.

Al guardar:
- Se congela valor hora leyendo módulo Categorías.
- Se registra evento en `caso_eventos`.
- Se actualiza campo del legajo indicando "En tratamiento".
- Se notifica al supervisor (si operativo) que el caso está registrado.

### 7.2 Modal "Cargar certificado médico"

Modal con validaciones estrictas de ley 17132.

**Sección 1 — Datos del médico** (todos obligatorios):

| Campo | Tipo |
|---|---|
| Apellido y nombre del médico | Text |
| Profesión | Text |
| Matrícula (número) | Text |
| Domicilio | Text |
| Teléfono | Text opcional |
| Email | Text opcional |

**Sección 2 — Datos del asistido:**

| Campo | Tipo | Notas |
|---|---|---|
| Nombre del asistido | Text | Auto (del asociado del caso) |
| Tipo de documento | Select | Obligatorio |
| Número de documento | Text | Obligatorio |

**Sección 3 — Contenido médico:**

| Campo | Tipo |
|---|---|
| Diagnóstico CIE-10 | Text |
| Fecha de emisión | Date |
| Duración de la incapacidad (días) | Number |
| Fecha desde | Date |
| Fecha hasta | Date |
| Observaciones médicas | Textarea |

**Sección 4 — Adjunto:**

| Campo | Tipo |
|---|---|
| Foto del certificado | File input | Obligatorio |

**Botones:**
- Guardar → estado "Pendiente" (esperando validación).

Al guardar: el certificado queda en la bandeja de RRHH para validación.

### 7.3 Modal "Validar certificado"

Modal donde RRHH revisa el certificado y decide.

Muestra todos los datos + foto del adjunto.

**Sección — Decisión:**

| Campo | Tipo | Notas |
|---|---|---|
| Estado | Radio (Aprobar / Observar / Rechazar) | Obligatorio |
| Observaciones | Textarea | Obligatorio si Observa o Rechaza |

Comportamiento:
- **Aprobar:** certificado válido. Ausencia justificada.
- **Observar:** falta información. Sistema notifica al asociado (via supervisor) que tiene 24hs más para presentar uno corregido.
- **Rechazar:** certificado nulo. Ausencia potencialmente injustificada. Dispara hook opcional a Sanciones.

### 7.4 Modal "Gestionar retiro mensual"

Modal donde RRHH carga el retiro del caso para un mes específico.

Muestra:
- Info del caso (asociado, tipo, fecha inicio, valor hora congelado).
- Selector de período (mes/año).
- Cálculo automático propuesto.

**Sección — Cálculo:**

| Campo | Tipo | Notas |
|---|---|---|
| Período | Select (YYYY-MM) | Obligatorio |
| Días del caso en el mes | Auto | Calculado |
| Horas propuestas | Auto | Días × jornada estándar según categoría |
| Horas ajustadas | Number editable | Default = propuestas |
| Valor hora congelado | Readonly | Del caso |
| **Monto del retiro** | Auto | horas × valor |

Al confirmar: crea registro en `retiros_enfermos_pendientes` en estado Pendiente.

Este registro será consumido por Liquidaciones cuando migre.

### 7.5 Modal "Cerrar caso"

| Campo | Tipo | Notas |
|---|---|---|
| Motivo de cierre | Radio (Alta médica / Decisión RRHH) | Obligatorio |
| Fecha de alta efectiva | Date | Obligatorio |
| Certificado de alta (si aplica) | File input | Obligatorio si Alta médica |
| Observaciones | Textarea | Obligatorio si Decisión RRHH |

Al cerrar:
- Estado del caso → Cerrado (por alta o decisión).
- Fecha de alta efectiva registrada.
- Se libera al asociado del "en tratamiento" del legajo.
- Pasa al tab Histórico.

---

## 8. Lógica crítica

### 8.1 Abrir caso con valor hora congelado

```javascript
async function abrirCaso(datosDelCaso) {
  const legajo = obtenerLegajo(datosDelCaso.legajo_id_local);
  
  let valorHoraSnapshot = null;
  let valorHoraIdLocal = null;
  
  if (legajo.tipo === 'Operativo') {
    // Consultar módulo Categorías
    if (!legajo.categoria_id_local) {
      throw new Error('El asociado no tiene categoría asignada. Cargala en el legajo antes de abrir el caso.');
    }
    if (!legajo.servicio) {
      throw new Error('El asociado no tiene servicio asignado.');
    }
    
    const valorVigente = window.categoriasAPI.obtenerValorHoraVigente(
      legajo.categoria_id_local,
      legajo.servicio,
      new Date()
    );
    
    if (!valorVigente) {
      throw new Error(
        `No hay valor hora vigente para categoría "${legajo.categoria_nombre}" ` +
        `en servicio "${legajo.servicio}". Cargalo en el módulo Categorías antes de continuar.`
      );
    }
    
    valorHoraSnapshot = valorVigente.valor_hora;
    valorHoraIdLocal = valorVigente.id_local;
  }
  // Si es administrativo: valor hora queda en null, cálculo pendiente
  
  const caso = {
    id_local: generarIdLocal(),
    ...datosDelCaso,
    valor_hora_congelado: valorHoraSnapshot,
    valor_hora_id_local: valorHoraIdLocal,
    categoria_id_local: legajo.categoria_id_local,
    categoria_nombre: legajo.categoria_nombre,
    servicio_al_ingreso: legajo.servicio,
    estado: 'Abierto',
    cargado_por: usuarioActual.nombre
  };
  
  supaSync('casosEnfermosAccidentes', caso);
  registrarEvento(caso.id_local, null, 'Abierto', usuarioActual.nombre);
  
  // Marca al asociado como en tratamiento en su legajo
  actualizarLegajoEnTratamiento(legajo.id_local, true);
  
  toast('✅ Caso abierto. Valor hora congelado: $' + valorHoraSnapshot);
}
```

### 8.2 Cálculo de retiro mensual

```javascript
function calcularRetiroMensual(casoId, periodo) {
  const caso = obtenerCaso(casoId);
  const [anio, mes] = periodo.split('-').map(Number);
  
  // Rango de fechas del mes
  const inicioMes = new Date(anio, mes - 1, 1);
  const finMes = new Date(anio, mes, 0);
  
  // Rango de fechas efectivas del caso en el mes
  const inicioCasoEnMes = caso.fecha_inicio > inicioMes.toISOString().slice(0,10)
    ? new Date(caso.fecha_inicio)
    : inicioMes;
  const finCasoEnMes = caso.fecha_alta_efectiva && caso.fecha_alta_efectiva < finMes.toISOString().slice(0,10)
    ? new Date(caso.fecha_alta_efectiva)
    : finMes;
  
  const diasDelCasoEnMes = Math.floor((finCasoEnMes - inicioCasoEnMes) / (1000*60*60*24)) + 1;
  
  // Carga horaria estándar según categoría
  const legajo = obtenerLegajo(caso.legajo_id_local);
  const cat = window.categoriasAPI.obtenerCategoria(legajo.categoria_id_local);
  const horasPorDia = cat && cat.nombre.includes('Media Jornada') ? 4 : 8;
  
  const horasCalculadas = diasDelCasoEnMes * horasPorDia;
  const montoRetiro = horasCalculadas * caso.valor_hora_congelado;
  
  return {
    dias_del_caso_en_mes: diasDelCasoEnMes,
    horas_calculadas: horasCalculadas,
    valor_hora_congelado: caso.valor_hora_congelado,
    monto_retiro: montoRetiro
  };
}
```

### 8.3 Puente manual con planilla de horas (búsqueda de art 42)

```javascript
function buscarCasosArt42ConTresDias() {
  const treDiasAtras = new Date();
  treDiasAtras.setDate(treDiasAtras.getDate() - 3);
  
  // Agrupa DB.art42 por asociado y busca 3+ días consecutivos
  const porAsociado = {};
  DB.art42.forEach(registro => {
    if (!porAsociado[registro.legajo_id_local]) {
      porAsociado[registro.legajo_id_local] = [];
    }
    porAsociado[registro.legajo_id_local].push(registro);
  });
  
  const candidatos = [];
  for (const [legajoId, registros] of Object.entries(porAsociado)) {
    const ordenados = registros.sort((a,b) => 
      new Date(a.fecha) - new Date(b.fecha)
    );
    
    // Detectar 3+ días consecutivos
    let diasConsecutivos = 1;
    for (let i = 1; i < ordenados.length; i++) {
      const anterior = new Date(ordenados[i-1].fecha);
      const actual = new Date(ordenados[i].fecha);
      const diff = (actual - anterior) / (1000*60*60*24);
      
      if (diff === 1) {
        diasConsecutivos++;
        if (diasConsecutivos >= 3) {
          // Verificar que no exista ya caso abierto
          const yaExisteCaso = DB.casosEnfermosAccidentes.some(c =>
            c.legajo_id_local === legajoId &&
            c.estado === 'Abierto' &&
            c.fecha_inicio <= ordenados[i-2].fecha
          );
          
          if (!yaExisteCaso) {
            candidatos.push({
              legajo_id_local: legajoId,
              fecha_inicio: ordenados[i-2].fecha,
              dias_consecutivos: diasConsecutivos
            });
          }
          break;
        }
      } else {
        diasConsecutivos = 1;
      }
    }
  }
  
  return candidatos;
}
```

### 8.4 Cierre de caso

```javascript
async function cerrarCaso(casoId, motivoCierre, fechaAlta, observaciones) {
  const caso = obtenerCaso(casoId);
  
  caso.estado = motivoCierre === 'Alta médica' 
    ? 'Cerrado por alta médica' 
    : 'Cerrado por decisión RRHH';
  caso.fecha_alta_efectiva = fechaAlta;
  caso.fecha_cierre = new Date();
  caso.cerrado_por = usuarioActual.nombre;
  caso.motivo_cierre = motivoCierre;
  caso.observaciones_cierre = observaciones;
  
  supaSync('casosEnfermosAccidentes', caso);
  registrarEvento(casoId, 'Abierto', caso.estado, usuarioActual.nombre);
  
  // Libera al asociado del "en tratamiento"
  actualizarLegajoEnTratamiento(caso.legajo_id_local, false);
  
  toast('✅ Caso cerrado. Pasa al histórico.');
}
```

---

## 9. Integraciones

### 9.1 Módulo Categorías (dependencia crítica)
Consumir `window.categoriasAPI.obtenerValorHoraVigente()` al abrir casos operativos.

Si no está disponible: bloquear apertura de casos operativos con error claro.

### 9.2 Módulo Legajos
- Agregar sección "Historial médico" que muestre los casos del asociado.
- Agregar campo `en_tratamiento boolean` que se activa cuando tiene caso abierto.
- El diagnóstico CIE-10 solo se muestra si el usuario tiene rol autorizado.

### 9.3 Módulo Liquidación de horas
Por ahora manual con puente. El botón "Buscar casos art 42 ≥ 3 días" consulta `DB.art42`.

**Hook automático futuro:** cuando Liquidación de horas se migre, exponer función:
```javascript
window.enfermosAccidentesAPI.notificarEscaladaArt42(legajoId, fechaInicio)
```

Se dispara desde el módulo Liquidación al detectar el 3er día consecutivo.

### 9.4 Módulo Sanciones (opcional)
Cuando un certificado es rechazado o no se presenta en 24 hs:
```javascript
if (window.sancionesAPI && window.sancionesAPI.sugerirSancion) {
  window.sancionesAPI.sugerirSancion({
    legajo_id_local: legajoId,
    infraccion: 'INF-003', // Ausencia sin aviso
    contexto: 'Certificado médico no presentado o rechazado'
  });
}
```

No aplica sanción automática — solo alerta al supervisor.

### 9.5 Módulo Liquidaciones (futuro)
Consumirá `retiros_enfermos_pendientes` cuando migre. Documentado como TODO.

### 9.6 Sistema de notificaciones
Reutiliza `notificaciones_sistema`.

---

## 10. Etapas de implementación

### Etapa 0 — Prerequisito
**El módulo Categorías debe estar implementado antes que este.** Ver `docs/DISENO_categorias.md`.

### Etapa 1 — Base persistente
- Aplicar SQL.
- Mapeo en `supabase.js`.
- Estructura del módulo.
- Modelo básico: abrir caso, campos comunes.
- Tab 1 y 2 (Enfermedades y Accidentes activos).
- Modal "Abrir nuevo caso" con congelamiento de valor hora.

### Etapa 2 — Certificados
- Modal "Cargar certificado" con validación ley 17132.
- Tab 4 (Certificados).
- Modal "Validar certificado" (Aprobar / Observar / Rechazar).
- Chequeo automático de plazo 24hs.

### Etapa 3 — Retiro mensual
- Modal "Gestionar retiro mensual".
- Tabla `retiros_enfermos_pendientes`.
- Cálculo automático + edición manual.

### Etapa 4 — Cierre y Histórico
- Modal "Cerrar caso".
- Tab 3 (Histórico).
- Exportar a Excel.

### Etapa 5 — Puente con Liquidación de horas
- Botón "Buscar casos art 42 ≥ 3 días".

### Etapa 6 — Integraciones futuras
- Hook automático desde Liquidación de horas (cuando migre).
- Hook con Sanciones (opcional).

---

## 11. Casos borde

### 11.1 Asociado dado de baja durante caso activo
El caso sigue activo pero el asociado queda con badge "Dado de baja". RRHH decide cerrar el caso o mantenerlo.

### 11.2 Caso sin valor hora vigente (Categorías desactualizado)
Bloqueo al abrir. Error visible: "No hay valor hora vigente para la categoría en el servicio. Cargalo antes de continuar."

### 11.3 Certificado presentado después de las 24 hs
Se acepta pero queda marcado como "Extemporáneo". RRHH decide si valida.

### 11.4 Certificado con matrícula duplicada o inválida
Sistema puede tener una tabla de médicos válidos a futuro. Por ahora solo se valida que los campos obligatorios estén presentes.

### 11.5 Caso muy largo (>6 meses)
Sin restricción. RRHH puede cerrar por decisión con motivo si considera excesivo.

### 11.6 Asociado con múltiples casos
Puede tener varios casos históricos pero solo uno abierto a la vez. Sistema bloquea abrir uno nuevo si ya tiene abierto.

### 11.7 Retiro mensual ya generado y hay que corregir
Anular el registro (soft delete) y generar uno nuevo. No se edita el existente.

### 11.8 Fecha de inicio en el pasado (más de 30 días)
Soft warning. RRHH confirma.

### 11.9 Alta médica con fecha en el futuro
Se acepta pero el caso queda abierto hasta que llegue la fecha. Sistema alerta el día X.

### 11.10 Diagnóstico visible en el legajo
Solo para usuarios autorizados (RRHH, Admin total). Otros ven "Diagnóstico no disponible".

---

## 12. Convenciones

- Nombres en español.
- Confidencialidad de datos médicos (política).
- Soft delete siempre (política A.7).
- Congelamiento de valor hora al ingreso (política A.6).
- Un commit por cambio lógico.

---

## 13. Prerequisitos

1. **Módulo Categorías implementado** con seed cargado y valores hora cargados por RRHH.
2. **Legajos operativos tienen categoría asignada** (`categoria_id_local`).
3. **Legajos operativos tienen servicio asignado** (ya lo tienen).
4. **Sistema de adjuntos** disponible (para foto de certificado).

---

## 14. FAQ

**¿Los administrativos participan?**
Sí, pero el cálculo económico es distinto (sueldo mensual proporcional). TODO para clarificar con Gabi.

**¿Se puede tener varios casos abiertos a la vez?**
No. Solo uno por asociado. Puede tener múltiples históricos.

**¿El diagnóstico se guarda encriptado?**
No en esta versión. Solo se restringe la visibilidad por rol.

**¿Qué pasa si el asociado tiene 3 días de art 42 y luego vuelve a trabajar?**
No se abre caso formal. Los 3 días quedan solo en la planilla de horas.

**¿Y si tiene 3 días, vuelve, y a los 10 días vuelve a faltar por lo mismo?**
Son casos separados. Sistema detecta como dos episodios distintos.

**¿La misma enfermedad reincidente se trata como caso nuevo cada vez?**
Sí. Cada episodio con ausencia formal es un caso propio.

**¿Puedo tocar Liquidación de horas?**
No. Por ahora solo consultamos `DB.art42`. Cuando se migre, se coordina el hook.

**¿Puedo tocar Legajos?**
Solo lo mínimo: agregar `en_tratamiento` y sección de "Historial médico". Coordinar con Lautaro.

---

## 15. Cierre

Este módulo cierra el círculo del seguimiento médico formal. Tiene alta complejidad por:
- Integración con módulo Categorías (valor hora congelado).
- Confidencialidad de datos médicos.
- Validación legal de certificados.
- Cálculo mensual de retiros para Liquidaciones.
- Puente manual + hook futuro con Liquidación de horas.

**Estimación:** 100-150 horas para Fede.

**Prerequisito crítico:** módulo Categorías implementado y con valores hora cargados. Sin esto, el módulo Enfermos no puede abrir casos operativos.

**Coordinación con Lautaro requerida en:**
- Definición final de las categorías administrativas (cuando se resuelva con Gabi).
- Hook con Liquidación de horas (cuando migre).
- Integración con Sanciones (cuando se decida).

Ante duda: **preguntar antes de codear** (política A.4).

**¡Salud y trabajo!** 🏥
