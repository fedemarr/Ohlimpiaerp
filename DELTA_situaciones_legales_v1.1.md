# Delta de cambios — Módulo Situaciones Legales v1.1

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Situaciones Legales
**Autor:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-09
**Versión:** 1.1 (delta sobre lo existente)

---

## ⚠️ Cómo usar este documento

Este documento es un **delta de cambios** sobre el módulo Situaciones Legales que **ya existe en el sistema**. NO es un rediseño desde cero — es una consolidación y agregado de features.

**Base del delta:**
- Módulo actual en `src/legacy.js` con estructura funcional pero desconectada de la práctica real.
- Ver `docs/INVENTARIO_situaciones_legales_legacy.md` para el detalle del estado actual.

**Contexto crítico:**
- El módulo **NO se usa en la práctica**. Los casos legales se manejan por fuera del sistema (RRHH + abogado externo).
- **Objetivo:** activar el uso del sistema centralizando la información en un único lugar seguro y con confidencialidad garantizada.

**Antes de aplicar los cambios:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, y el inventario técnico.

---

## 1. Contexto del delta

### 1.1 Qué son las Situaciones Legales

**Alcance del módulo:**
- **Juicios laborales:** asociado que demandó a la cooperativa (despido, indemnización, salarios adeudados, etc.).
- **Etapas previas a juicio:** intimaciones, cartas documento, mediaciones.

**NO cubre** (fuera de alcance):
- Embargos (no se descuentan del retiro — no hay integración con Liquidaciones).
- Denuncias internas entre asociados.
- Procesos penales personales del asociado.
- Perimetrales o restricciones judiciales personales.

### 1.2 Proceso real actual

- **Quien maneja:** RRHH (Gabriela) + abogado externo de la cooperativa.
- **Donde vive la información:** carpetas físicas + emails + mensajes con el abogado. Fuera del sistema.
- **Contexto típico:** cuando un asociado entra en esta etapa, ya se está desvinculando de la cooperativa. Rara vez sigue trabajando activamente durante el proceso.
- **El abogado NO usa el sistema.** Participa por fuera.

### 1.3 Estado en el sistema actual

Del inventario técnico:

**Cosas que funcionan:**
- **La tabla `casos_legales` SÍ persiste** en Supabase (a diferencia de otros módulos).
- Modal de alta existe en el DOM.
- Menú restringido a RRHH + Administrador total (confidencialidad básica).
- Catálogo de estados en `state.js`.

**Problemas identificados:**

1. **🔒 Fuga parcial al Legajo.** `guardarLegal` copia `estadoLegal` al legajo. El legajo es visible para más perfiles → el estado legal se propaga a una pantalla más accesible que el módulo Legal.

2. **⚠️ Adjuntos no son reales.** `subirAdjuntoLegal` solo guarda el nombre del archivo. `verAdjunto` es un stub. No hay almacenamiento real, ni control de acceso a documentos.

3. **📝 Modal con campos ignorados.** El modal captura fecha, "nuestro abogado", relación con otros casos, tipo de cliente, descripción — pero `guardarLegal` los descarta.

4. **🐛 Bug de persistencia.** Por el mismo patrón que Enfermos: por llaves faltantes, cuando el asociado matchea un legajo, ni el caso ni el legajo se persisten.

5. **❌ Sin timeline de novedades estructurado.** Solo hay un campo `ultimaNovedad` — no queda historial de eventos del caso.

6. **📁 Sin tab Histórico.** Los casos cerrados quedan mezclados con los activos.

### 1.4 Objetivo del delta

Con los cambios:
- Confidencialidad reforzada — el estado legal deja de propagarse al legajo.
- Historial de movimientos en el legajo registra los cambios (con permisos por rol).
- Adjuntos con almacenamiento real y sensible al rol.
- Modal alineado con lo que efectivamente se guarda.
- Timeline de novedades por caso.
- Tab Histórico para casos cerrados.
- Cierre formal del caso con resultado.

### 1.5 Estrategia del delta

- **Consolidar:** eliminar fuga al legajo, arreglar bug de llaves, alinear modal con persistencia.
- **Agregar:** timeline de novedades, tab Histórico, cierre formal, campo Supervisor actual, integración con historial de movimientos del legajo.
- **Preservar:** modelo de datos existente (que persiste), estados actuales, catálogo, menú y permisos actuales.

---

## 2. Aclaración importante — Dos "Historiales"

Hay dos "historiales" distintos en el sistema que NO deben confundirse:

### 2.1 Historial de movimientos del legajo (existente en Legajos)

**Qué es:** log general de todo lo que le pasa al asociado en la cooperativa a lo largo del tiempo. Vive en el módulo Legajos.

**Qué muestra:** reasignaciones, sanciones, cambios de categoría, movimientos legales, capacitaciones, etc.

**Quién lo ve:** depende del sistema de permisos. Los eventos legales solo son visibles para quien tenga permiso (RRHH + Admin).

**Rol en este módulo:** cada cambio de estado del caso legal genera una entrada en el historial de movimientos del legajo. La entrada dice algo como "Situación legal — estado actualizado a [X]" con fecha y usuario. Los detalles sensibles NO se copian; solo el hecho de que hubo un movimiento.

### 2.2 Tab Histórico del módulo Situaciones Legales (nuevo)

**Qué es:** repositorio de casos legales cerrados. Vive dentro del módulo Situaciones Legales.

**Qué muestra:** casos con estado terminal (Cerrado ganado, Cerrado perdido, Cerrado conciliado, Archivado).

**Quién lo ve:** solo RRHH + Admin (mismo permiso que el módulo).

**Rol en el flujo:** cuando RRHH cierra un caso, el caso se mueve del tab principal (activos) al tab Histórico.

**Los dos coexisten y son complementarios.**

---

## 3. Cambios de v1.1

Los cambios se agrupan por prioridad de implementación.

### 🔴 Cambios estructurales (críticos)

#### Cambio 1 — Eliminar propagación de `estadoLegal` al legajo

**Qué hay hoy:**
- `guardarLegal` (legacy.js:304) hace `leg.estadoLegal = estado`.
- El campo `estadoLegal` del legajo es visible en el módulo Legajos, que tiene más perfiles habilitados.

**Qué cambia:**
- **Eliminar la asignación** `leg.estadoLegal = estado` de `guardarLegal`.
- **El campo `estadoLegal` en la tabla de legajos queda sin uso.** No se toca la base (soft-deprecar), simplemente no se escribe más.
- El estado legal SOLO vive en `casos_legales`.

**En lugar de propagar, se registra en el historial de movimientos:**
Ver Cambio 4 — la creación/cambio de estado del caso genera una entrada en `movimientos_legajo` con visibilidad restringida.

**Impacto:**
- Los legajos existentes con `estadoLegal` seteado NO se tocan (respetamos histórico).
- Los cambios nuevos NO propagan más al legajo.
- Los supervisores ya no ven el estado legal del asociado en el legajo.

#### Cambio 2 — Alinear modal con persistencia

**Qué hay hoy:**
- El modal captura: asociado, nroSocio, estado, abogado, estudio, supervisor, servicio, fechaInicio, ultimaNovedad, adjuntos.
- Además captura: fecha, "nuestro abogado" (abogado de la cooperativa), relación con otros casos, tipo de cliente, descripción.
- **Pero `guardarLegal` solo persiste los primeros.** Los últimos 5 se descartan silenciosamente.

**Qué cambia:**
- Ampliar la tabla `casos_legales` para incluir los campos que hoy se descartan.
- Persistir todos los campos del modal.

**SQL nuevo:**

```sql
-- v024_ampliar_casos_legales.sql
BEGIN;

ALTER TABLE public.casos_legales
  ADD COLUMN IF NOT EXISTS abogado_cooperativa       text,
  ADD COLUMN IF NOT EXISTS estudio_cooperativa       text,
  ADD COLUMN IF NOT EXISTS supervisor_actual         text,
  ADD COLUMN IF NOT EXISTS tipo_reclamo              text,
  ADD COLUMN IF NOT EXISTS monto_reclamado           numeric(12,2),
  ADD COLUMN IF NOT EXISTS descripcion               text,
  ADD COLUMN IF NOT EXISTS relacion_otros_casos      text,
  ADD COLUMN IF NOT EXISTS fecha_proxima_instancia   date,
  
  -- Cierre del caso
  ADD COLUMN IF NOT EXISTS fecha_cierre              date,
  ADD COLUMN IF NOT EXISTS resultado                 text,     -- Ganado / Perdido / Conciliado / Archivado sin resolución
  ADD COLUMN IF NOT EXISTS monto_final               numeric(12,2),
  ADD COLUMN IF NOT EXISTS observaciones_cierre      text,
  ADD COLUMN IF NOT EXISTS cerrado_por               text;

COMMIT;
```

**Nota:** Fede debe verificar el schema actual de `casos_legales` antes de aplicar. Los nombres exactos de columnas pueden requerir ajuste.

#### Cambio 3 — Arreglar bug de llaves en persistencia

**Qué hay hoy:**
- Mismo patrón que Enfermos: por llaves faltantes, cuando el asociado matchea un legajo, la persistencia del caso se saltea.
- El `supaSync('casos_legales', ...)` corre solo en el `else` (cuando no hay legajo).

**Qué cambia:**
- Arreglar las llaves en `guardarLegal`.
- El caso siempre se persiste, matchee o no legajo.
- Después del Cambio 1, el legajo ya no se modifica desde este módulo — así que el `supaSync` del legajo no se necesita más acá.

#### Cambio 4 — Registrar cambios en historial de movimientos del legajo

**Qué hay hoy:**
- Al crear o cambiar el estado del caso, no hay entrada en el historial de movimientos del asociado.

**Qué cambia:**
- Al crear un caso legal → agregar entrada al historial de movimientos del legajo:
  - **Tipo:** "Situación legal".
  - **Descripción:** "Caso legal registrado — [tipo de reclamo]".
  - **Fecha:** now().
  - **Usuario:** currentUser.
  - **Visibilidad:** solo RRHH + Admin (según sistema de permisos).

- Al cambiar el estado del caso → agregar entrada:
  - **Descripción:** "Situación legal — estado actualizado a [X]".

- Al cerrar el caso → agregar entrada:
  - **Descripción:** "Situación legal — cerrado con resultado [X]".

**Estructura de la tabla `movimientos_legajo`:**

Si no existe, crearla. Si ya existe (probable, según el sistema), agregar el campo de visibilidad si no está:

```sql
-- v025_movimientos_legajo_visibilidad.sql
BEGIN;

-- Si movimientos_legajo no existe, crear con este schema:
CREATE TABLE IF NOT EXISTS public.movimientos_legajo (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  legajo_id_local        text NOT NULL,
  
  tipo                   text NOT NULL,       -- Reasignación / Sanción / Situación legal / Capacitación / etc.
  descripcion            text NOT NULL,
  origen_modulo          text NOT NULL,       -- Nombre del módulo que generó el evento
  origen_id_local        text,                -- id del registro origen (opcional)
  
  fecha_evento           timestamptz NOT NULL DEFAULT now(),
  registrado_por         text NOT NULL,
  
  -- Confidencialidad
  visibilidad_roles      text NOT NULL DEFAULT 'todos',
    -- 'todos' / 'rrhh_admin' / 'solo_admin'
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Si ya existe, agregar solo el campo:
ALTER TABLE public.movimientos_legajo
  ADD COLUMN IF NOT EXISTS visibilidad_roles text NOT NULL DEFAULT 'todos';

COMMIT;
```

**Comportamiento en el módulo Legajos:**
- Al mostrar el historial de movimientos, filtrar según `visibilidad_roles`:
  - Si `todos` → visible siempre.
  - Si `rrhh_admin` → solo si el usuario es RRHH o Admin.
  - Si `solo_admin` → solo Admin.
- Los eventos de Situación Legal se registran con `visibilidad_roles = 'rrhh_admin'`.

**Este cambio afecta al módulo Legajos.** Coordinar con Lautaro para agregar el filtro en el renderer del historial.

#### Cambio 5 — Integrar adjuntos con almacenamiento real

**Qué hay hoy:**
- `subirAdjuntoLegal` solo guarda el nombre del archivo en `caso.adjuntos[]`.
- `verAdjunto` es un stub ("en producción se abrirá desde Firebase Storage").
- **No hay almacenamiento real.** Los archivos "cargados" no existen.

**Qué cambia:**
- Fede debe verificar qué sistema de almacenamiento usa el proyecto (probablemente Supabase Storage) y replicar el patrón que usan otros módulos que ya guardan adjuntos correctamente.
- **Importante:** los adjuntos legales deben tener control de acceso adicional. Solo RRHH + Admin pueden descargarlos.

**Referencia para Fede:** buscar cómo otros módulos manejan adjuntos (probablemente Uniformes, Sanciones, o Enfermos si están migrados). Replicar patrón + agregar restricción de rol.

**Fallback si no hay sistema de storage aún:**
- Documentar como TODO.
- El campo `adjuntos` guarda al menos: nombre, tamaño, tipo, fecha, cargado_por.
- Cuando el sistema de storage esté listo, se cablea la carga/descarga real.

---

### 🟡 Cambios de agregado (features nuevas)

#### Cambio 6 — Tab Histórico

**Qué hay hoy:**
- Todos los casos se muestran mezclados (activos + cerrados).

**Qué cambia:**
Nuevo tab **📋 Histórico** en el módulo.

**Contenido:**
Tabla con casos cerrados (estados terminales).

**Columnas:**
- Asociado.
- Nº socio.
- Tipo de reclamo.
- Fecha inicio.
- Fecha cierre.
- Duración total.
- Resultado (Ganado / Perdido / Conciliado / Archivado).
- Monto final.
- Cerrado por (RRHH).
- Acciones.

**Filtros:**
- Buscador.
- Por año.
- Por resultado.
- Por tipo de reclamo.

**Acciones:**
- 👁 Ver detalle completo del caso (solo lectura).
- 📥 Exportar seleccionados a Excel.

Los tabs originales (Activos con sus filtros) siguen mostrando **solo casos no cerrados**.

#### Cambio 7 — Timeline de novedades por caso

**Qué hay hoy:**
- Un solo campo `ultimaNovedad` — se sobrescribe cada vez.
- No queda historial de eventos del caso.

**Qué cambia:**
Nueva tabla `novedades_caso_legal` que registra cada evento del caso a lo largo del tiempo.

**SQL nuevo:**

```sql
-- v026_novedades_caso_legal.sql
BEGIN;

CREATE TABLE public.novedades_caso_legal (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  caso_id_local          text NOT NULL,       -- ref a casos_legales
  
  fecha_evento           date NOT NULL,
  tipo_evento            text NOT NULL,       -- Audiencia / Presentación escrito / Notificación / Sentencia / Reunión / Otro
  descripcion            text NOT NULL,
  adjuntos               jsonb,               -- lista de adjuntos específicos de esta novedad
  
  cargada_por            text NOT NULL,
  cargada_en             timestamptz NOT NULL DEFAULT now(),
  
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ncl_caso  ON public.novedades_caso_legal(caso_id_local) WHERE NOT anulado;
CREATE INDEX idx_ncl_fecha ON public.novedades_caso_legal(fecha_evento) WHERE NOT anulado;

COMMIT;
```

**En el detalle del caso:**
- Timeline vertical con todas las novedades ordenadas por fecha.
- Botón "+ Agregar novedad" (para RRHH) que abre modal con:
  - Fecha del evento.
  - Tipo (select).
  - Descripción (textarea).
  - Adjuntos opcionales.

**Nota:** el campo `ultima_novedad` de `casos_legales` puede quedar como campo derivado (calculado desde `novedades_caso_legal`) o eliminarse. Sugerencia: dejarlo por ahora y recalcularlo desde la novedad más reciente en cada carga.

#### Cambio 8 — Cierre formal del caso

**Qué hay hoy:**
- No hay flujo de cierre estructurado.

**Qué cambia:**
Nuevo botón "🏁 Cerrar caso" en el detalle. Abre modal con:

| Campo | Tipo | Obligatorio |
|---|---|---|
| Fecha de cierre | Date (default: hoy) | Sí |
| Resultado | Radio (Ganado / Perdido / Conciliado / Archivado sin resolución) | Sí |
| Monto final (si aplica) | Number | Depende del resultado |
| Observaciones de cierre | Textarea | Sí |

Al cerrar:
- Estado del caso pasa a un estado terminal (Cerrado ganado / Cerrado perdido / Conciliado / Archivado).
- El caso desaparece del tab principal y aparece en el tab Histórico.
- Se registra entrada en historial de movimientos del legajo (con visibilidad restringida).

#### Cambio 9 — Agregar campo Supervisor actual

**Qué hay hoy:**
- El modal tiene un campo "supervisor" pero se lee del legajo al momento del alta.
- No queda claro si es supervisor "al momento del alta" o "actual".

**Qué cambia:**
- El campo `supervisor` se renombra a `supervisor_al_alta` en el modelo.
- Se agrega campo `supervisor_actual` que se actualiza automáticamente cuando cambia el supervisor del asociado (via reasignación).
- **En el modal:** ambos campos son readonly (del legajo).

Esto permite ver:
- Quién era el supervisor cuando empezó el caso (histórico).
- Quién es el supervisor actual (para consulta).

---

### 🟢 Cambios de consolidación menor

#### Cambio 10 — Catálogo de estados sin duplicación

**Qué hay hoy:**
- El catálogo de estados vive en `state.js:12` (`estadosLegales`).
- El HTML del módulo tiene los estados duplicados desincronizados.

**Qué cambia:**
- El HTML debe leer los estados desde el catálogo único de `state.js`.
- Eliminar la duplicación.

#### Cambio 11 — Persistencia de nroSocio

**Qué hay hoy:**
- El campo `nroSocio` queda en "—" al guardar.

**Qué cambia:**
- Al elegir asociado en el modal, autocompletar `nroSocio` del legajo y persistirlo en el caso.

---

## 4. Modelo del flujo actualizado

### 4.1 Diagrama del ciclo

```
[Caso creado]
    ↓ (RRHH agrega novedades progresivamente)
[Estado avanza según catálogo: Pre-legal → ... → etapas del proceso]
    ↓ (Se cargan novedades por cada evento)
[Novedades acumuladas en timeline]
    ↓ (Fin del caso)
[Cerrado] → resultado: Ganado / Perdido / Conciliado / Archivado
    ↓
[Pasa al tab Histórico]
```

### 4.2 Registro en historial de movimientos del legajo

En cada punto crítico se genera entrada en `movimientos_legajo` (con `visibilidad_roles = 'rrhh_admin'`):

| Evento | Descripción en historial |
|---|---|
| Caso creado | "Situación legal — caso registrado ([tipo reclamo])" |
| Cambio de estado | "Situación legal — estado actualizado a [X]" |
| Novedad agregada | (opcional, solo si es relevante — a decidir por RRHH) |
| Caso cerrado | "Situación legal — cerrado con resultado [X]" |

---

## 5. Integraciones

### 5.1 Módulo Legajos (impacto crítico)

**Cambios en Legajos:**
- Renderer del historial de movimientos debe filtrar según `visibilidad_roles`.
- El campo `estadoLegal` del legajo queda sin uso desde este módulo (soft-deprecar).
- Los supervisores ya no ven que un asociado tenga situación legal.

**Coordinar con Lautaro** los cambios en Legajos antes de que Fede modifique el renderer del historial.

### 5.2 Sistema de adjuntos

Fede verifica el sistema de almacenamiento real del proyecto. Si existe en otros módulos migrados, replica el patrón. Si no existe, documenta TODO y usa mock persistente (nombre, tamaño, tipo).

**Restricción especial:** los adjuntos legales requieren rol RRHH + Admin para descarga.

### 5.3 Módulo Liquidaciones (NO integra)

No hay descuento automático por embargos (fuera de alcance del módulo).

### 5.4 Módulo Reasignaciones (NO integra)

No hay impacto en Reasignaciones (fuera de alcance).

### 5.5 Módulo Sanciones (NO integra)

Un caso legal y una sanción son procesos independientes. No hay cruce automático.

---

## 6. Etapas de implementación

### Etapa 1 — Consolidación estructural (crítica)
- Cambio 1: eliminar propagación al legajo.
- Cambio 2: ampliar tabla y alinear modal.
- Cambio 3: arreglar bug de llaves.
- Cambio 4: integración con historial de movimientos del legajo + agregar `visibilidad_roles`.
- Cambio 11: persistir nroSocio.

**Al terminar:** el módulo persiste todo correctamente y respeta confidencialidad.

### Etapa 2 — Novedades y cierre
- Cambio 7: timeline de novedades.
- Cambio 8: cierre formal.
- Cambio 6: Tab Histórico.
- Cambio 9: campo supervisor actual.

**Al terminar:** flujo completo del caso desde apertura hasta cierre.

### Etapa 3 — Adjuntos
- Cambio 5: integración con sistema de almacenamiento real.

**Puede hacerse en paralelo con Etapa 2.**

### Etapa 4 — Consolidación menor
- Cambio 10: unificar catálogo de estados.

### Etapa 5 — Migración a `src/modules/`
- Extraer el módulo de `legacy.js` a `src/modules/situaciones_legales/`.
- Consistencia con otros módulos migrados.

---

## 7. Prerequisitos

Antes de que Fede arranque:

1. **Verificar schema actual de `casos_legales`** en Supabase — algunos campos del ALTER pueden ya existir con otro nombre.

2. **Verificar existencia de tabla `movimientos_legajo`** — si no existe, crearla; si existe, agregar solo el campo `visibilidad_roles`.

3. **Coordinar con Lautaro los cambios en el módulo Legajos** — el renderer del historial de movimientos debe filtrar por visibilidad.

4. **Verificar sistema de almacenamiento de archivos** — replicar patrón de otros módulos que ya lo tienen.

5. **Los datos existentes en `casos_legales`** NO deben perderse. Solo agregamos campos.

---

## 8. Casos borde

### 8.1 Caso con asociado dado de baja durante el proceso
Es lo esperable — según Lautaro, "cuando un asociado entra en esta etapa, ya se está desvinculando". El caso sigue en el sistema aunque el legajo esté en estado Baja.

### 8.2 Caso reabierto después del cierre
No permitido por default. Si RRHH necesita reabrir (raro), se crea un caso nuevo con referencia al anterior (`relacion_otros_casos`).

### 8.3 Múltiples casos del mismo asociado
Permitidos. Un asociado puede tener varios casos simultáneos o históricos. Todos aparecen en su historial de movimientos.

### 8.4 Novedad con fecha en el pasado
Permitida — RRHH puede cargar novedades históricas si se enteró tarde de un evento.

### 8.5 Cierre con "Archivado sin resolución"
Se usa cuando el caso queda inactivo sin resolución formal (por ejemplo, el asociado se dio de baja y no siguió el reclamo). No cuenta como Ganado ni Perdido.

### 8.6 Adjunto sensible cargado sin sistema de storage
Si Fede detecta que el sistema de storage no está disponible aún, documentar como TODO y NO permitir carga real de archivos. Solo registrar metadata.

---

## 9. Convenciones respetadas

- Nombres en español.
- camelCase en frontend, snake_case en Supabase.
- Soft delete (política A.7).
- Historización de movimientos con visibilidad por rol.
- Un commit por cambio lógico (política A.3).
- Confidencialidad como criterio central de diseño.

---

## 10. Bugs conocidos a corregir del legacy

Del inventario:

1. **Fuga al legajo** — se elimina la propagación (Cambio 1).
2. **Modal con campos ignorados** — se persisten todos (Cambio 2).
3. **Bug de llaves en `guardarLegal`** — se arregla (Cambio 3).
4. **Adjuntos falsos** — se integra sistema real (Cambio 5).
5. **Sin timeline de novedades** — se agrega tabla estructurada (Cambio 7).
6. **Sin tab Histórico** — se agrega (Cambio 6).
7. **`nroSocio` no persiste** — se corrige (Cambio 11).
8. **Catálogo duplicado** — se unifica (Cambio 10).

---

## 11. FAQ

**¿El módulo cubre embargos?**
No. Los embargos no se descuentan del retiro. Fuera de alcance.

**¿El abogado externo tiene acceso al sistema?**
No. Solo RRHH usa el módulo. El abogado sigue trabajando por fuera (email, teléfono, reuniones).

**¿Los supervisores ven la situación legal del asociado?**
No. Ni en el módulo ni en el legajo. Cuando la información aparece en el historial de movimientos del legajo, está oculta para roles distintos de RRHH y Admin.

**¿Los datos existentes se pierden?**
No. Solo se agregan campos y tablas. Los casos históricos siguen siendo consultables.

**¿Puedo tocar el código de Legajos?**
Solo lo mínimo necesario para agregar el filtro de visibilidad en el historial de movimientos. Coordinar con Lautaro.

**¿Puedo tocar Liquidaciones, Sanciones, Reasignaciones?**
No. Este módulo no integra con esos.

**¿Qué pasa con casos legales que ya estaban en el sistema con el bug de llaves?**
Fede debe hacer una revisión: casos con `estadoLegal` seteado en el legajo pero sin caso en `casos_legales` son huérfanos del bug. Documentar como TODO — probablemente sean datos de prueba.

**¿Cuál es la diferencia entre "Cerrado ganado", "Cerrado perdido" y "Archivado"?**
- Ganado: sentencia favorable a la cooperativa.
- Perdido: sentencia desfavorable — la cooperativa paga.
- Conciliado: acuerdo entre partes sin sentencia.
- Archivado: caso inactivo sin resolución (por baja del asociado, prescripción, etc.).

---

## 12. Cierre

Este delta consolida y refuerza un módulo que ya existe pero **no se usa**. El objetivo es que RRHH empiece a centralizar la información de situaciones legales en el sistema en lugar de mantenerla en carpetas físicas y correos con el abogado.

Los cambios clave:
1. **Confidencialidad reforzada** — eliminación de propagación al legajo, historial de movimientos con visibilidad por rol.
2. **Adjuntos reales** con control de acceso adicional.
3. **Timeline estructurado** de novedades por caso.
4. **Cierre formal** con resultado y monto final.
5. **Tab Histórico** para casos cerrados.
6. **Persistencia completa** de todos los campos del modal.

**Estimación de trabajo para Fede:** 30-50 horas. Es el módulo más chico de los últimos porque:
- Ya persiste (no hay que rediseñar la base).
- Uso limitado (solo RRHH).
- Sin integraciones complejas con otros módulos.
- Sin política escrita que restrinja.

**Objetivo estratégico:** que Gabriela empiece a usar el módulo para casos reales cuando le entregues el paquete a probar.

Ante duda: **preguntar antes de codear** (política A.4).

**⚖️ Confidencialidad primero.**
