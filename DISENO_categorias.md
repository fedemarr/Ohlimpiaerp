# Diseño del módulo Categorías — Especificación para implementación

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Categorías (infraestructura transversal)
**Autor del diseño:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-09
**Versión:** 1.0

---

## Cómo usar este documento

Este documento define la **infraestructura de categorías y valores hora** de la cooperativa. Es transversal — no es solo del módulo Enfermos y Accidentes, sino que sirve también a Liquidaciones y otros módulos futuros.

**Prerequisito para:**
- Módulo Enfermos y Accidentes (necesita valor hora congelado).
- Módulo Liquidaciones (cuando migre).
- Otros módulos con impacto económico.

**Antes de escribir código:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, y la **Política de Categorías de Retiros — Coop. Ohlimpia** (documento adjunto de RRHH).

---

## 1. Contexto

### 1.1 Qué son las categorías

Las **categorías** clasifican a los asociados operativos según su puesto y responsabilidad. Cada asociado operativo tiene una **categoría base**. La categoría determina el valor hora que cobra.

**Categorías base actuales (según política de RRHH):**

- Operario
- Operario Media Jornada (jornada fija <30hs semanales)
- Operario de Primera (Operario con 1+ año + evaluación positiva)
- Referente (auxiliar de encargado)
- Encargado A (hasta 8 operarios a cargo)
- Encargado B (9-15 operarios a cargo)
- Encargado C (más de 15 operarios a cargo)
- Tareas Especiales
- Retén (con 7 sub-categorías según tipo de jornada)
- Franqueros Eventuales (usan lógica y valores de Retén)

**Plus (adicionales):**
- Extra Sanidad (para servicios de salud).
- Extra Nocturno (jornadas 22hs-6am).

### 1.2 Complejidad del modelo

**El valor hora efectivo depende de 3 dimensiones combinables:**

1. **Categoría base** (Operario, Encargado A, etc.).
2. **Servicio asignado** (Newsan, Migueletes, etc.) — actualmente el valor varía por servicio; el objetivo a largo plazo es unificar pero por ahora es así.
3. **Plus** (Extra Sanidad, Extra Nocturno) — puede haber ninguno, uno o varios acumulables.

**Ejemplos de combinaciones:**
- Operario Newsan → valor X.
- Operario Migueletes → valor Y (distinto de X).
- Encargado A Migueletes / HIT Ugarte / Pampa 1391 → valor Z (agrupa 3 servicios con mismo valor).
- Operario Newsan + Extra Nocturno → valor X + adicional.
- Operario Hospital Campana + Extra Sanidad → valor + plus.

### 1.3 Retenes (caso especial)

Los Retenes tienen **7 sub-categorías** según el tipo de jornada realizada:

| Sub-categoría | Cuándo aplica |
|---|---|
| Retén Hora Base | En su servicio de base |
| Retén Media Distancia | Fuera de zona, hasta 1.5hs de viaje |
| Retén Larga Distancia | +1.5hs de viaje o +3 trasbordos |
| Retén Media Jornada | Cubre servicio <6 horas |
| Retén Nocturno | Jornada 22hs-6am |
| Retén Doble Jornada | 2da jornada tras completar 1ra |
| Retén HIT | Exclusivos de la cadena HIT |

Los **Franqueros Eventuales** usan la misma lógica y valores que Retén cuando cubren servicios distintos al suyo de base.

### 1.4 Objetivo del sistema

**Modelar categorías con vigencia temporal** para que:

1. RRHH pueda cargar y modificar el catálogo de categorías desde la interfaz.
2. Cada categoría + servicio pueda tener versiones con vigencia temporal (por paritarias/aumentos).
3. Al calcular el valor hora vigente, el sistema use la versión activa en la fecha correspondiente.
4. Los módulos consumidores (Enfermos, Liquidaciones) puedan **congelar el valor** vigente a una fecha específica y respetarlo aunque después cambien las paritarias.
5. Historial completo de valores anteriores para trazabilidad.

### 1.5 Estado actual

**No existe módulo de Categorías.** Los valores hora se cargan manualmente en los legajos o en la Liquidación de horas. No hay vigencia temporal ni historial estructurado.

**Los servicios sí existen** en el sistema (campo `servicio` en el legajo). Este módulo NO gestiona el catálogo de servicios (viene de otro lado — Legajos actual o módulo Clientes futuro). Solo los referencia.

### 1.6 Alcance

**Este módulo NO gestiona servicios.** Los servicios existentes se leen de las fuentes actuales (Legajos, listado de servicios activos). Cuando exista módulo Clientes, se integrará.

**Este módulo NO calcula liquidaciones.** Solo provee el valor hora vigente para una combinación categoría + servicio en una fecha. Otros módulos consumen esa información.

**Este módulo NO gestiona sueldos de administrativos.** Los administrativos cobran mensual fijo — su modelo económico se resuelve por otro camino (probablemente el módulo Administrativos o Legajos administrativos). Documentado como TODO para más adelante.

---

## 2. Decisiones tomadas

### 2.1 Modelo con vigencia temporal (política A.6)
Cada combinación categoría + servicio tiene versiones con `vigencia_desde` y `vigencia_hasta`. Cuando hay paritaria, se crea nueva versión.

### 2.2 Distinción "corrección de error" vs "cambio con vigencia"
Como en precios de Uniformes y reglas de Competencia:
- **Corregir error:** modifica la versión vigente sin crear nueva (queda en auditoría).
- **Cambio con vigencia:** crea nueva versión con nuevo `vigencia_desde`. Los movimientos históricos NO se recalculan.

### 2.3 Los servicios se leen de fuentes existentes
El módulo NO tiene catálogo propio de servicios. Los servicios vienen del legajo (o del futuro módulo Clientes). En el módulo, cada valor de categoría se vincula al nombre del servicio como string.

### 2.4 Las categorías base son un catálogo administrable por RRHH
RRHH puede agregar/desactivar categorías base. Las 10 iniciales de la política están precargadas.

### 2.5 Los plus son categorías especiales que se suman
"Extra Sanidad" y "Extra Nocturno" no son categorías separadas — son **incrementos aditivos** que se suman al valor base cuando corresponde.

Modelo: cada combinación (categoría + servicio) tiene su valor base. Adicionalmente, existen "adicionales" (Extra Sanidad, Extra Nocturno) con su propio valor. El sistema puede combinarlos al calcular el valor efectivo.

### 2.6 Los administrativos NO están en este módulo
Los administrativos cobran mensual fijo, no por hora. Documentado como TODO para módulo futuro de administrativos.

### 2.7 Historial de vigencias visible
RRHH puede consultar el historial completo de cambios de valores por combinación.

---

## 3. Modelo de datos

### 3.1 Convenciones

- `id bigserial PK`, `id_local text UNIQUE NOT NULL`, `created_at`, `updated_at`, `anulado boolean DEFAULT false`.
- Snake_case en DB, camelCase en frontend.
- Referencias por `id_local`.

### 3.2 SQL versionado

Crear `sql/v020_categorias.sql`:

```sql
-- v020 — Módulo Categorías (infraestructura transversal)
-- Categorías, plus y valores hora con vigencia temporal.
BEGIN;

-- Tabla 1 — categorias_base (catálogo maestro)
CREATE TABLE public.categorias_base (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  codigo                 text UNIQUE NOT NULL, -- CAT-001, CAT-002, etc.
  nombre                 text NOT NULL,        -- Operario / Encargado A / Retén Hora Base / etc.
  descripcion            text,
  
  -- Grupo de agrupación para UI
  grupo                  text NOT NULL,        -- Operativo / Encargado / Retén / Especial
  
  -- Si es un Retén o Franquero (con lógica especial)
  es_reten               boolean NOT NULL DEFAULT false,
  
  activa                 boolean NOT NULL DEFAULT true,
  orden                  integer NOT NULL DEFAULT 0,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cb_activa ON public.categorias_base(activa) WHERE NOT anulado;
CREATE INDEX idx_cb_grupo  ON public.categorias_base(grupo) WHERE NOT anulado;

-- Tabla 2 — valores_hora_categoria (versiones con vigencia temporal)
-- Un valor por combinación categoría + servicio + fecha
CREATE TABLE public.valores_hora_categoria (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  categoria_id_local     text NOT NULL,        -- ref a categorias_base
  servicio_nombre        text NOT NULL,        -- nombre del servicio (no ref, se lee del legajo)
  
  valor_hora             numeric(10,2) NOT NULL,
  
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,                 -- NULL = vigente
  
  cargada_por            text NOT NULL,
  motivo_carga           text,                 -- "Carga inicial" / "Paritaria" / "Ajuste manual" / "Corrección" / etc.
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vhc_categoria ON public.valores_hora_categoria(categoria_id_local) WHERE NOT anulado;
CREATE INDEX idx_vhc_servicio  ON public.valores_hora_categoria(servicio_nombre) WHERE NOT anulado;
CREATE INDEX idx_vhc_vigencia  ON public.valores_hora_categoria(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- Tabla 3 — plus_adicionales (Extra Sanidad, Extra Nocturno)
CREATE TABLE public.plus_adicionales (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  codigo                 text UNIQUE NOT NULL, -- PLUS-001, PLUS-002
  nombre                 text NOT NULL,        -- Extra Sanidad / Extra Nocturno
  descripcion            text,
  
  activa                 boolean NOT NULL DEFAULT true,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Tabla 4 — valores_plus (valores de los plus con vigencia temporal)
CREATE TABLE public.valores_plus (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  
  plus_id_local          text NOT NULL,        -- ref a plus_adicionales
  
  valor_adicional        numeric(10,2) NOT NULL,  -- monto que se suma al valor base
  
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,
  
  cargada_por            text NOT NULL,
  motivo_carga           text,
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vp_plus     ON public.valores_plus(plus_id_local) WHERE NOT anulado;
CREATE INDEX idx_vp_vigencia ON public.valores_plus(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- Modificaciones al legajo — asignar categoría base
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS categoria_id_local text;

COMMIT;

-- SEED — Categorías iniciales según política de RRHH
BEGIN;

INSERT INTO public.categorias_base (id_local, codigo, nombre, grupo, es_reten, orden) VALUES
  ('cat_operario',             'CAT-001', 'Operario',                  'Operativo', false, 10),
  ('cat_operario_media',       'CAT-002', 'Operario Media Jornada',    'Operativo', false, 20),
  ('cat_operario_primera',     'CAT-003', 'Operario de Primera',       'Operativo', false, 30),
  ('cat_referente',            'CAT-004', 'Referente',                 'Encargado', false, 40),
  ('cat_encargado_a',          'CAT-005', 'Encargado A',               'Encargado', false, 50),
  ('cat_encargado_b',          'CAT-006', 'Encargado B',               'Encargado', false, 60),
  ('cat_encargado_c',          'CAT-007', 'Encargado C',               'Encargado', false, 70),
  ('cat_tareas_especiales',    'CAT-008', 'Tareas Especiales',         'Especial',  false, 80),
  ('cat_reten_hora_base',      'CAT-009', 'Retén Hora Base',           'Retén',     true,  90),
  ('cat_reten_media_dist',     'CAT-010', 'Retén Media Distancia',     'Retén',     true, 100),
  ('cat_reten_larga_dist',     'CAT-011', 'Retén Larga Distancia',     'Retén',     true, 110),
  ('cat_reten_media_jornada',  'CAT-012', 'Retén Media Jornada',       'Retén',     true, 120),
  ('cat_reten_nocturno',       'CAT-013', 'Retén Nocturno',            'Retén',     true, 130),
  ('cat_reten_doble_jornada',  'CAT-014', 'Retén Doble Jornada',       'Retén',     true, 140),
  ('cat_reten_hit',            'CAT-015', 'Retén HIT',                 'Retén',     true, 150),
  ('cat_franquero_eventual',   'CAT-016', 'Franquero Eventual',        'Retén',     true, 160);

-- SEED — Plus iniciales
INSERT INTO public.plus_adicionales (id_local, codigo, nombre, descripcion) VALUES
  ('plus_extra_sanidad',  'PLUS-001', 'Extra Sanidad',  'Plus por desempeñar tareas en espacios de salud'),
  ('plus_extra_nocturno', 'PLUS-002', 'Extra Nocturno', 'Plus por jornada entre 22hs y 6am');

-- Los valores hora de cada categoría por servicio se cargan por RRHH desde el sistema
-- (no hay seed inicial — RRHH debe cargarlos manualmente al arrancar).

COMMIT;
```

### 3.3 Mapeo en `src/shared/supabase.js`

```javascript
categoriasBase:       'categorias_base',
valoresHoraCategoria: 'valores_hora_categoria',
plusAdicionales:      'plus_adicionales',
valoresPlus:          'valores_plus',
```

---

## 4. Estructura del módulo

```
src/modules/categorias/
├── index.js           — Re-exports y bindings al window
├── categorias.js      — Lógica principal (tabs + renders)
├── valores.js         — Gestión de valores hora con vigencia
├── plus.js            — Gestión de plus adicionales
└── consultas.js       — Funciones puras de consulta (usadas por otros módulos)
```

**Funciones críticas expuestas para otros módulos** (via `window.categoriasAPI` o similar):

```javascript
// Consultas que otros módulos usan
obtenerValorHoraVigente(categoriaIdLocal, servicio, fecha)
  → { valor_hora, valor_hora_id_local, vigencia_desde, vigencia_hasta }
  
obtenerValorPlusVigente(plusIdLocal, fecha)
  → { valor_adicional, valor_plus_id_local, ...}

calcularValorEfectivo(categoriaIdLocal, servicio, plusIdLocals[], fecha)
  → { valor_base, plus_total, valor_efectivo, referencias_ids }

obtenerCategoriaLegajo(legajoIdLocal)
  → { categoria_id_local, nombre_categoria, es_reten, ... }
```

---

## 5. Tabs del módulo

Módulo con **4 tabs**:

### 5.1 Tab 1 — Catálogo de categorías

Vista con las categorías base activas + inactivas.

Columnas: Código · Nombre · Grupo · Es Retén · Cantidad de servicios con valor cargado · Estado · Acciones.

Acciones: ✏️ Editar (nombre, descripción, grupo) · 🔄 Activar/Desactivar · 👁 Ver valores por servicio.

Botón "+ Nueva categoría" — modal con: código (auto), nombre, descripción, grupo, es_reten.

### 5.2 Tab 2 — Valores hora por categoría + servicio

Vista central del módulo. Tabla cruzada con:
- **Filas:** categorías activas.
- **Columnas:** servicios existentes (leídos de los legajos).
- **Celdas:** valor hora vigente (o "sin cargar" si no hay).

Con filtros por categoría (multi-select) y servicio (multi-select) para casos con muchos servicios.

Acciones por celda:
- 👁 Ver historial de esa combinación categoría+servicio.
- ✏️ Cargar / modificar valor (abre modal).

Botón "+ Carga masiva" — para actualizar varios valores a la vez (por ejemplo, ante paritaria).

### 5.3 Tab 3 — Plus adicionales

Vista con Extra Sanidad, Extra Nocturno (y cualquier plus futuro).

Columnas: Nombre · Descripción · Valor adicional vigente · Vigente desde · Acciones.

Acciones: ✏️ Editar (con vigencia temporal) · 👁 Historial · 🔄 Activar/Desactivar.

### 5.4 Tab 4 — Historial de cambios

Auditoría completa: cada cambio de valor con quién lo hizo, cuándo, motivo.

Columnas: Fecha del cambio · Tipo (Categoría / Plus) · Objeto (categoría+servicio o plus) · Valor anterior · Valor nuevo · Vigencia desde · Cargado por · Motivo.

Filtros: por rango de fechas, por categoría, por servicio, por tipo de cambio, por usuario que cargó.

Botón "📥 Exportar a Excel".

---

## 6. Modales del módulo

### 6.1 Modal "Cargar/modificar valor hora"

| Campo | Tipo | Notas |
|---|---|---|
| Categoría | Select | Obligatorio |
| Servicio | Autocompletado sobre servicios existentes | Obligatorio |
| Valor hora | Number | Obligatorio, positivo |
| Tipo de cambio | Radio (Corregir error / Cambio con vigencia) | Obligatorio |
| Vigencia desde | Date | Solo si "Cambio con vigencia" |
| Motivo | Textarea | Obligatorio |

Comportamiento:
- **Corregir error:** modifica versión vigente. Queda en auditoría.
- **Cambio con vigencia:** cierra la versión anterior con `vigencia_hasta = vigencia_desde nueva - 1 día`. Crea nueva. Los cálculos anteriores NO se recalculan.

### 6.2 Modal "Nueva categoría"

Simple. Código autogenerado + nombre + descripción + grupo + es_reten.

### 6.3 Modal "Carga masiva de valores"

Para actualizar varios valores en paritaria.

Muestra tabla con: categoría, servicio, valor vigente, nuevo valor (editable).

RRHH ingresa nuevos valores + vigencia_desde común a todos + motivo. Sistema crea N versiones nuevas.

---

## 7. Función principal — obtener valor hora vigente

Es la función más usada por otros módulos.

```javascript
/**
 * Obtiene el valor hora vigente para una combinación categoría + servicio + fecha.
 * Usado por: módulo Enfermos (congelar valor), Liquidaciones (calcular retiros).
 */
function obtenerValorHoraVigente(categoriaIdLocal, servicioNombre, fecha) {
  const fechaISO = new Date(fecha).toISOString().slice(0,10);
  
  const valores = DB.valoresHoraCategoria.filter(v =>
    v.categoria_id_local === categoriaIdLocal &&
    v.servicio_nombre === servicioNombre &&
    v.vigencia_desde <= fechaISO &&
    (v.vigencia_hasta === null || v.vigencia_hasta >= fechaISO) &&
    !v.anulado
  );
  
  if (valores.length === 0) return null;
  
  // Si hay más de uno vigente en la misma fecha (raro pero posible por error),
  // devolvemos el más recientemente cargado
  return valores.sort((a,b) => 
    new Date(b.vigencia_desde) - new Date(a.vigencia_desde)
  )[0];
}
```

**Guard obligatorio:** si un módulo consumidor no encuentra valor vigente al momento de necesitarlo, debe fallar con error claro. Nunca asumir valor cero o cualquier default.

---

## 8. Etapas de implementación

### Etapa 1 — Base persistente (crítica)
- Aplicar SQL.
- Cargar seed de categorías y plus.
- Actualizar mapeo en `supabase.js`.
- Crear estructura del módulo.
- Implementar Tab 1 (Catálogo).

### Etapa 2 — Valores hora
- Implementar Tab 2 (Valores por categoría + servicio).
- Implementar modales de carga con vigencia temporal.
- Implementar funciones de consulta.

### Etapa 3 — Plus y auditoría
- Implementar Tab 3 (Plus).
- Implementar Tab 4 (Historial).

### Etapa 4 — Carga masiva
- Modal de carga masiva para paritarias.
- Exportar a Excel.

### Etapa 5 — Integración con módulos consumidores
- Exponer API para Enfermos y Accidentes.
- Cuando Liquidaciones migre: exponer API.

---

## 9. Casos borde

### 9.1 Consultar valor de una combinación sin cargar
Retorna null. El módulo consumidor debe manejar el error.

### 9.2 Modificar valor de una categoría que ya se usó en casos activos
Si es "cambio con vigencia": no afecta valores ya congelados en casos activos. Solo aplica desde vigencia_desde.

### 9.3 Categoría desactivada usada en casos históricos
Los casos históricos siguen consultando la versión que tenían. Al desactivar solo se impide crear casos NUEVOS con esa categoría.

### 9.4 Aumento retroactivo
RRHH carga aumento con `vigencia_desde` en el pasado. Sistema pregunta confirmación: "Este aumento aplica retroactivamente desde [fecha]. Los cálculos anteriores NO se recalculan. ¿Continuar?".

### 9.5 Un mismo servicio se llama distinto en distintos lugares
Riesgo real. El módulo Categorías depende del nombre del servicio como string. Si en el legajo dice "Newsan" y en Categorías se cargó "NEWSAN", no matchean. **Recomendación:** normalizar antes de guardar (uppercase o titlecase consistente).

---

## 10. Convenciones

- Nombres en español.
- Historización con vigencia temporal (política A.6).
- Soft delete (política A.7).
- Un commit por cambio lógico.

---

## 11. Prerequisitos

Antes de arrancar:

1. **Legajos debe tener campo `categoria_id_local`** para asociados operativos. Si no existe, hay un ALTER (incluido en el SQL).
2. **Los servicios deben estar disponibles** desde algún catálogo (Legajos actual). Este módulo los lee, no los gestiona.

---

## 12. FAQ

**¿Los administrativos tienen categoría en este módulo?**
No. Cobran mensual fijo, modelo distinto. TODO para módulo futuro de administrativos.

**¿Los servicios son parte de este módulo?**
No. Se leen de los legajos actuales. Cuando exista módulo Clientes, migrarán ahí.

**¿Qué pasa si un Retén cambia de tipo de jornada?**
Un mismo asociado puede tener distintas categorías durante el día según el tipo de jornada realizada. Este módulo permite consultar el valor de cada tipo de Retén. El módulo Liquidación de horas es quien maneja qué tipo aplica cada día.

**¿Se pueden combinar plus?**
Sí. Un asociado en Hospital Campana con jornada nocturna cobra: valor base + Extra Sanidad + Extra Nocturno.

**¿Puedo tocar Legajos?**
Solo el mínimo: agregar campo `categoria_id_local`. Coordinar con Lautaro.

---

## 13. Cierre

Este documento define la infraestructura de categorías y valores hora — **fundamental para Enfermos, Liquidaciones y otros módulos económicos futuros**.

Con este módulo implementado, el módulo Enfermos y Accidentes puede consumir la función `obtenerValorHoraVigente` para congelar el valor al momento del inicio del caso. Lo mismo hará Liquidaciones cuando migre.

**Estimación:** 40-60 horas para Fede. Módulo mediano pero fundamental.

Ante duda: **preguntar antes de codear** (política A.4).
