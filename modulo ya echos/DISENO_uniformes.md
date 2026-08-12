# Diseño del módulo Uniformes — Especificación para implementación

**Proyecto:** Ohlimpia (ERP cooperativo)
**Módulo:** Uniformes
**Autor del diseño:** Lautaro + Claude web
**Destinatario:** Fede (implementación)
**Fecha:** 2026-07-08
**Versión:** 1.0

---

## Cómo usar este documento

Este documento es la **fuente de verdad** para implementar el módulo Uniformes. Está pensado para que se pueda programar **sin necesidad de volver a preguntar** por decisiones de diseño.

**Antes de escribir cualquier código:** leer `POLITICAS_PROYECTO.md`, `CLAUDE.md`, el inventario técnico (`docs/INVENTARIO_uniformes_legacy.md`) y la **Política de Entrega de Uniformes** de la cooperativa (documento adjunto de RRHH).

---

## 1. Contexto del módulo

### 1.1 Qué es Ohlimpia
ERP cooperativo para gestionar una cooperativa de trabajo de servicios de limpieza con ~500 asociados.

### 1.2 Qué es el módulo Uniformes
Gestiona el **ciclo completo de entrega y devolución de uniformes** (ropa de trabajo). Cubre desde el pedido hasta la entrega firmada y la devolución del uniforme viejo.

**No incluye:** EPP, herramientas, máquinas, stock ni compras (todos van a módulos futuros).

**Sí incluye:** trazabilidad de entregas, política de descuentos automatizada, devoluciones, precios con vigencia temporal.

### 1.3 Los dueños del proceso

| Área | Rol en el sistema | Responsabilidades |
|---|---|---|
| **Recepción** | RRHH | Recibe pedidos, autoriza, entrega al supervisor, hace seguimiento |
| **Logística** | Logística | Arma pedidos, entrega a Recepción, mantiene stock y precios |
| **Supervisor** | Supervisor | Solicita, retira, entrega al operario con firma, devuelve constancia + viejo |

### 1.4 La política oficial

**SIN descuento:** Ingreso, Segunda muda, Renovación (contra entrega del viejo), Reubicación (contra devolución del anterior), Robo con constancia policial, Camperas/Polar/Calzado (única entrega inicial, camperas y polar solo marzo-septiembre).

**CON descuento** (4 cuotas fijas sobre el retiro): Pedido extra fuera de plazos, Daño o extravío.

**Devoluciones por baja:** al dar de baja, el asociado debe devolver los uniformes recibidos sin costo. Si no los devuelve → descuento en 1 sola cuota del último retiro.

**Ciclo semanal fijo:**
- **Lunes:** cierre semanal por Recepción.
- **Martes:** Logística arma y entrega a Recepción.
- **Miércoles:** Recepción entrega al Supervisor.
- **15 días** desde la entrega para devolver constancia firmada + uniforme viejo.

### 1.5 Estado actual del módulo

Vive en `src/legacy.js` (líneas ~8883-8945) pero está **prácticamente inerte**:
1. El modal para cargar entregas NO existe en el HTML.
2. No hay botón "Nueva entrega".
3. Nada persiste en Supabase.
4. La "integración con Liquidaciones" es un mito (dos caminos separados sin cablear).
5. Modelo de datos primitivo (sin distinguir motivo, sin ciclo de estados).
6. Cruce por `nombre` en vez de por ID.

### 1.6 Objetivo

**Rediseñar el módulo completo desde cero** en `src/modules/uniformes/` siguiendo la política A.11. Debe:
1. Persistir todo en Supabase con modelo rico.
2. Implementar 15 estados con **doble handshake** en traspasos físicos.
3. Reflejar fielmente la política oficial.
4. Gestionar precios con vigencia temporal (política A.6).
5. Integrarse con Legajos y Altas.
6. Preparar la infraestructura para Liquidaciones y WhatsApp.

---

## 2. Alcance

### 2.1 Incluye
- 6 tablas Supabase (ver §4).
- Módulo migrado en `src/modules/uniformes/`.
- 4 tabs + sub-vista de precios.
- Modal de pedido con validaciones reales.
- Doble handshake en cada traspaso físico.
- Alertas 24hs (handshake sin confirmar) y 15 días (constancia/viejo pendiente).
- Adjuntos: foto constancia obligatoria al entregar, foto denuncia policial opcional para robo.
- Descuentos automáticos según política, en 4 cuotas.
- Actualización del talle en legajo al entregar con firma.
- Hook desde Legajos (devolución por baja) y desde Altas (pre-cargar pedido por ingreso).

### 2.2 No incluye (etapas futuras)
- WhatsApp (espera Meta).
- Módulo Logística con stock/compras.
- Cobro efectivo en Liquidaciones (solo se registra compromiso).
- Módulo Auditoría (se deja el valor en el catálogo).
- Kit básico por servicio (por ahora carga manual).
- Constancia policial obligatoria (por ahora soft warning).

---

## 3. Decisiones tomadas

### 3.1 Rediseño completo (no parche)
Se implementa desde cero. El legacy queda intacto hasta que el nuevo funcione.

### 3.2 Tablero único con filtrado por rol
Un solo tablero. Cada rol ve lo suyo según el estado del pedido.

### 3.3 Doble handshake en traspasos físicos
Cada traspaso entre áreas requiere confirmación de ambas partes:
- Logística marca "envié" → RRHH confirma "recibí".
- RRHH marca "el Sup se lo llevó" → Supervisor confirma "sí, lo tengo".
- Supervisor marca "devolví constancia + viejo" → RRHH confirma "sí, llegó".

### 3.4 Alertas de 24hs por handshake sin confirmar
Si una parte marca su acción y la otra no confirma en 24hs → alerta a ambas áreas.

### 3.5 15 estados del ciclo
Ver §11 para el detalle completo.

### 3.6 Un solo motivo por pedido
Si el operario necesita cosas por distintos motivos, se hacen pedidos separados.

### 3.7 Catálogo fijo de prendas
Chomba, Grafa, Ambo, Polar, Campera, Zapatos.

### 3.8 Talles según prenda

| Prenda | Talles |
|---|---|
| Chomba, Ambo, Polar, Campera | S / M / L / XL / XXL / XXXL / XXXXL |
| Grafa | 36 / 38 / 40 / 42 / 44 / 46 / 48 / 50 / 52 / 54 / 56 / 58 / 60 / 62 |
| Zapatos | 35 / 36 / 37 / 38 / 39 / 40 / 41 / 42 / 43 / 44 / 45 / 46 |

### 3.9 Auto-completar talle desde legajo, editable
El sistema propone el talle del legajo. El supervisor puede cambiarlo si el operario cambió.

### 3.10 Actualización del talle en legajo al confirmar entrega con firma
Cuando el pedido queda en estado 9 (Entregado con firma) y el talle era distinto → actualiza el legajo.

### 3.11 Origen del pedido: 4 canales
Supervisor / Auditoría / Asociado directo / RRHH - Ingreso.

### 3.12 Cálculo automático de descuento según motivo
El motivo determina si lleva descuento. Se auto-calcula.

### 3.13 Descuento en 4 cuotas fijas
Al entregar con firma (estado 9), se genera registro en `descuentos_uniforme_pendientes` con 4 cuotas.

### 3.14 Precios con vigencia temporal
Historial obligatorio. Los pedidos pasados guardan el precio con el que se calcularon (no recalculan).

### 3.15 Adjuntos
- Constancia firmada: **obligatoria** al confirmar entrega.
- Constancia policial: **opcional** para robo (soft warning si falta).

### 3.16 Soft warning por temporada
Camperas/Polar fuera de marzo-septiembre → soft warning. No aplica al kit inicial de ingreso.

### 3.17 Recepción confirma solo llegada del viejo
No evalúa estado. Si el viejo llega incompleto (faltan prendas), se aplica descuento por la faltante.

### 3.18 Roles en configuración global de permisos
Los roles RRHH, Logística, Supervisor viven en el sistema global de permisos. Mock temporal si no existe.

### 3.19 Notificaciones a la campana del sistema
Se reutiliza `notificaciones_sistema` de Reasignaciones.

### 3.20 Devolución por baja disparada desde Legajos
Cuando Legajos cambia estado a "Baja" → hook al módulo Uniformes. Genera orden de devolución automática. RRHH revisa y confirma.


---

## 4. Modelo de datos

### 4.1 Convenciones
Todas las tablas siguen el patrón del proyecto: `id bigserial PK`, `id_local text UNIQUE NOT NULL`, `created_at`, `updated_at`, `anulado boolean DEFAULT false`. Snake_case en DB, camelCase en frontend. Referencias por `id_local`.

### 4.2 SQL versionado

Crear `sql/v017_uniformes.sql` (o el número que corresponda):

```sql
-- v017 — Módulo Uniformes
-- Crea 6 tablas del nuevo módulo Uniformes.
BEGIN;

-- Tabla 1 — pedidos_uniformes (registro central del ciclo)
CREATE TABLE public.pedidos_uniformes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  legajo_id_local        text NOT NULL,
  nro_socio              text NOT NULL,
  nombre_operario        text NOT NULL,
  servicio               text NOT NULL,
  supervisor_asignado    text NOT NULL,
  origen                 text NOT NULL,
  solicitado_por         text NOT NULL,
  fecha_solicitud        timestamptz NOT NULL DEFAULT now(),
  motivo                 text NOT NULL,
  con_descuento          boolean NOT NULL,
  estado                 text NOT NULL DEFAULT 'Borrador',
  autorizado_por_rrhh    text,
  fecha_autorizacion     timestamptz,
  motivo_rechazo         text,
  fecha_recibido_logistica         timestamptz,
  logistica_recibe_por             text,
  fecha_enviado_por_logistica      timestamptz,
  logistica_envia_por              text,
  fecha_recibido_por_rrhh          timestamptz,
  rrhh_recibe_por                  text,
  fecha_retirado_supervisor        timestamptz,
  rrhh_entrega_a_supervisor_por    text,
  fecha_confirmado_por_supervisor  timestamptz,
  supervisor_confirma_por          text,
  fecha_entrega_operario           timestamptz,
  supervisor_entrega_por           text,
  constancia_firmada_adjunto_id_local  text,
  fecha_devolucion_supervisor      timestamptz,
  supervisor_devuelve_por          text,
  fecha_cierre                     timestamptz,
  rrhh_cierra_por                  text,
  fecha_cancelacion                timestamptz,
  cancelado_por                    text,
  motivo_cancelacion               text,
  fecha_vencido                    timestamptz,
  vencido_constancia               boolean NOT NULL DEFAULT false,
  vencido_uniforme_viejo           boolean NOT NULL DEFAULT false,
  fecha_descuento_incumplimiento   timestamptz,
  descuento_aplicado_por           text,
  descuento_incumplimiento_motivo  text,
  descuento_incumplimiento_monto   numeric(10,2),
  constancia_policial_adjunto_id_local  text,
  falto_prenda_kit_devuelto        boolean NOT NULL DEFAULT false,
  prendas_faltantes_devolucion     text,
  observaciones                    text,
  editado_por                      text,
  editado_en                       timestamptz,
  anulado                          boolean NOT NULL DEFAULT false,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pu_legajo    ON public.pedidos_uniformes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_pu_estado    ON public.pedidos_uniformes(estado) WHERE NOT anulado;
CREATE INDEX idx_pu_solicit   ON public.pedidos_uniformes(fecha_solicitud) WHERE NOT anulado;
CREATE INDEX idx_pu_supervisor ON public.pedidos_uniformes(supervisor_asignado) WHERE NOT anulado;

-- Tabla 2 — pedido_uniforme_prendas (N prendas por pedido)
CREATE TABLE public.pedido_uniforme_prendas (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  pedido_id_local        text NOT NULL,
  prenda                 text NOT NULL,
  talle                  text NOT NULL,
  cantidad               integer NOT NULL,
  precio_unitario_congelado    numeric(10,2),
  precio_id_local_referencia   text,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pup_pedido ON public.pedido_uniforme_prendas(pedido_id_local) WHERE NOT anulado;

-- Tabla 3 — pedido_uniforme_eventos (auditoría de transiciones)
CREATE TABLE public.pedido_uniforme_eventos (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  pedido_id_local        text NOT NULL,
  estado_desde           text,
  estado_hasta           text NOT NULL,
  ejecutado_por          text NOT NULL,
  ejecutado_en           timestamptz NOT NULL DEFAULT now(),
  observaciones          text,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pue_pedido ON public.pedido_uniforme_eventos(pedido_id_local);

-- Tabla 4 — precios_uniformes (catálogo con vigencia temporal)
CREATE TABLE public.precios_uniformes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  prenda                 text NOT NULL,
  talle                  text,
  precio                 numeric(10,2) NOT NULL,
  vigencia_desde         date NOT NULL,
  vigencia_hasta         date,
  cargado_por            text NOT NULL,
  motivo_carga           text,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_precios_prenda    ON public.precios_uniformes(prenda) WHERE NOT anulado;
CREATE INDEX idx_precios_vigencia  ON public.precios_uniformes(vigencia_desde, vigencia_hasta) WHERE NOT anulado;

-- Tabla 5 — descuentos_uniforme_pendientes (compromisos para Liquidaciones)
CREATE TABLE public.descuentos_uniforme_pendientes (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  pedido_id_local        text NOT NULL,
  legajo_id_local        text NOT NULL,
  monto_total            numeric(10,2) NOT NULL,
  cuotas_totales         integer NOT NULL DEFAULT 4,
  cuotas_cobradas        integer NOT NULL DEFAULT 0,
  monto_cuota            numeric(10,2) NOT NULL,
  fecha_generado         timestamptz NOT NULL DEFAULT now(),
  fecha_primera_cuota    date,
  fecha_ultima_cuota     date,
  estado                 text NOT NULL DEFAULT 'En curso',
  motivo_generacion      text,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dup_legajo  ON public.descuentos_uniforme_pendientes(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_dup_estado  ON public.descuentos_uniforme_pendientes(estado) WHERE NOT anulado;

-- Tabla 6 — devoluciones_por_baja
CREATE TABLE public.devoluciones_por_baja (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local               text UNIQUE NOT NULL,
  legajo_id_local        text NOT NULL,
  nombre_operario        text NOT NULL,
  fecha_baja             date NOT NULL,
  fecha_generada         timestamptz NOT NULL DEFAULT now(),
  prendas_a_devolver     jsonb NOT NULL,
  estado                 text NOT NULL DEFAULT 'Pendiente devolución',
  fecha_confirmada       timestamptz,
  confirmada_por         text,
  prendas_devueltas      jsonb,
  monto_descuento        numeric(10,2),
  observaciones          text,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dpb_legajo ON public.devoluciones_por_baja(legajo_id_local) WHERE NOT anulado;
CREATE INDEX idx_dpb_estado ON public.devoluciones_por_baja(estado) WHERE NOT anulado;

COMMIT;
```

### 4.3 Mapeo en `src/shared/supabase.js`

```javascript
pedidosUniformes:             'pedidos_uniformes',
pedidoUniformePrendas:        'pedido_uniforme_prendas',
pedidoUniformeEventos:        'pedido_uniforme_eventos',
preciosUniformes:             'precios_uniformes',
descuentosUniformePendientes: 'descuentos_uniforme_pendientes',
devolucionesPorBaja:          'devoluciones_por_baja',
```

### 4.4 Catálogos hardcoded

```javascript
const ESTADOS_UNIFORMES = [
  'Borrador',                                                                   // 1
  'Pendiente autorización RRHH',                                                // 2
  'Autorizado por RRHH, esperando envío a Logística',                           // 3
  'En preparación por Logística',                                               // 4
  'Enviado por Logística, esperando confirmación RRHH',                         // 5
  'Recibido por RRHH, listo para retirar Supervisor',                           // 6
  'Retirado por Supervisor, esperando confirmación Supervisor',                 // 7
  'Confirmado por Supervisor, en tránsito a operario',                          // 8
  'Entregado al operario con firma, esperando constancia + viejo',              // 9
  'Constancia + viejo entregados por Supervisor, esperando confirmación RRHH',  // 10
  'Cerrado',                                                                    // 11
  'Rechazado por RRHH',                                                         // 12
  'Cancelado por Solicitante',                                                  // 13
  'Vencido',                                                                    // 14
  'Descuento aplicado por incumplimiento'                                       // 15
];

const PRENDAS = ['Chomba','Grafa','Ambo','Polar','Campera','Zapatos'];

const TALLES_POR_PRENDA = {
  'Chomba':  ['S','M','L','XL','XXL','XXXL','XXXXL'],
  'Ambo':    ['S','M','L','XL','XXL','XXXL','XXXXL'],
  'Polar':   ['S','M','L','XL','XXL','XXXL','XXXXL'],
  'Campera': ['S','M','L','XL','XXL','XXXL','XXXXL'],
  'Grafa':   ['36','38','40','42','44','46','48','50','52','54','56','58','60','62'],
  'Zapatos': ['35','36','37','38','39','40','41','42','43','44','45','46']
};

const MOTIVOS_SIN_DESCUENTO = ['Ingreso','Segunda muda','Renovación','Reubicación','Robo con denuncia','Camperas-Polar-Calzado inicial'];
const MOTIVOS_CON_DESCUENTO = ['Pedido extra','Daño o extravío'];
const ORIGENES = ['Supervisor','Auditoría','Asociado directo','RRHH - Ingreso'];
```

---

## 5. Estructura del módulo

```
src/modules/uniformes/
├── index.js              — Re-exports y bindings al window
├── uniformes.js          — Lógica principal (renders, ABM, filtros)
├── flujo.js              — Transiciones entre estados con handshakes
├── precios.js            — Sub-módulo de catálogo de precios
├── descuentos.js         — Cálculo de descuentos + generación de compromisos
├── devoluciones.js       — Devoluciones por baja
├── vencimientos.js       — Chequeos automáticos (24hs, 15 días)
└── permisos.js           — Wrappers sobre permisos globales (o mock)
```

El HTML se crea desde cero (el legacy solo tiene una tabla con stats).


---

## 6. Tab 1 — Pendientes (bandeja según rol)

### 6.1 Contenido según rol

**Supervisor:** sus pedidos elevados en curso + pedidos en estados 7-9 para actuar sobre ellos.

**RRHH:** pedidos en estados 2 (autorizar), 5 (confirmar recepción de Logística), 10 (confirmar cierre), 14 (decidir descuento).

**Logística:** pedidos en estados 3 (marcar recibido y armar) y 4 (marcar enviado).

**Administrador total:** vista completa.

### 6.2 Columnas

Operario · Servicio · Supervisor · Motivo · Prendas (resumen) · Con descuento (badge) · Fecha solicitud · Días en estado actual (con alerta visual verde/amarillo/rojo según handshake pendiente) · Estado · Progreso (iconos secuenciales) · Acciones.

### 6.3 Acciones según rol y estado

- ✅ Autorizar (RRHH, estado 2)
- ❌ Rechazar con motivo (RRHH, estado 2)
- 📥 Marcar recibido (Logística, estado 3)
- 📤 Marcar enviado a RRHH (Logística, estado 4)
- ✅ Confirmar recepción (RRHH, estado 5)
- 🚚 Marcar retirado por Supervisor (RRHH, estado 6)
- ✅ Confirmar retiro (Supervisor, estado 7)
- 👕 Marcar entregado con firma (Supervisor, estado 8) — modal con adjunto obligatorio
- 📄 Marcar devolución de constancia + viejo (Supervisor, estado 9)
- ✅ Confirmar cierre (RRHH, estado 10) — modal con opción "faltó prenda"
- 💸 Aplicar descuento por incumplimiento (RRHH, estado 14)
- 👁 Ver detalle (cualquiera, cualquier estado)

### 6.4 Filtros
Buscador general, servicio, supervisor, motivo, estado (multi-select), rango de fechas.

### 6.5 Botón "+ Nuevo pedido"
Abre el modal de nuevo pedido (§10).

---

## 7. Tab 2 — Todos los pedidos

Solo lectura. Todos los pedidos, cualquier estado, sin filtro temporal por defecto.

Columnas iguales al Tab 1 + Fecha de cierre + Total pagado por asociado.

Filtros: buscador, año, servicio, supervisor, motivo, estado, operario, rango de fechas.

Acción: 👁 Ver detalle con timeline completo de eventos.

---

## 8. Tab 3 — Descuentos aplicados

Muestra registros de `descuentos_uniforme_pendientes`.

Columnas: Operario · Motivo · Pedido asociado · Monto total · Cuotas totales (4) · Cuotas cobradas · Cuotas pendientes · Estado (En curso / Terminado / Cancelado) · Fecha generado · Fecha última cuota.

**Estado parcial:** hasta que Liquidaciones migre, las cuotas cobradas no se actualizan automáticamente. Solo muestra los compromisos generados.

Filtros: operario, estado, año, motivo de generación.

Botón "📥 Exportar a Excel" con SheetJS.

---

## 9. Tab 4 — Devoluciones por baja

Órdenes generadas al dar de baja un asociado.

Columnas: Operario · Fecha de baja · Fecha de generación · Prendas a devolver (resumen) · Estado (Pendiente devolución / Devuelto completo / Descuento aplicado por faltante) · Fecha de confirmación · Monto de descuento · Acciones.

Acciones:
- 👁 Ver detalle → modal con lista de prendas + opción de marcar cuáles se devolvieron.
- ✅ Cerrar orden → si todo devuelto → "Devuelto completo". Si falta → "Descuento aplicado por faltante" + registro en `descuentos_uniforme_pendientes` con **cuota única** (no 4).

Botón "+ Generar orden manual" — para casos donde Legajos no disparó el hook.

Filtros: operario, estado, año.

---

## 10. Modal de nuevo pedido

### 10.1 Sección 1 — Origen del pedido

| Campo | Tipo | Obligatorio |
|---|---|---|
| Origen | Radio (Supervisor / Auditoría / Asociado directo / RRHH - Ingreso) | Sí |
| Solicitado por | Readonly (usuario logueado) | — |
| Fecha del pedido | Readonly (hoy) | — |

### 10.2 Sección 2 — Operario

Operario (autocompletado sobre activos, filtrado si supervisor) · N° socio (auto) · Servicio (auto) · Supervisor (auto) · Antigüedad (auto).

### 10.3 Sección 3 — Motivo

| Campo | Tipo |
|---|---|
| Motivo | Select con los 8 motivos |
| Con descuento | Badge visual auto (según motivo) |
| Constancia policial | File input (foto) — solo si motivo = Robo |

### 10.4 Sección 4 — Prendas

Lista con "+ Agregar prenda". Cada línea: Prenda (select del catálogo) · Talle (select filtrado por prenda, auto-completado desde legajo, editable) · Cantidad (default 1) · Precio estimado (readonly, informativo).

### 10.5 Sección 5 — Descuento (solo si aplica)

Resumen calculado: monto total estimado + 4 cuotas de $X + nota "El monto se congela al confirmar la entrega con firma".

### 10.6 Sección 6 — Observaciones
Textarea opcional.

### 10.7 Validaciones al elevar

- Operario obligatorio y activo.
- Motivo obligatorio.
- Al menos 1 prenda.
- Origen obligatorio.
- Si motivo ≠ "Camperas-Polar-Calzado inicial" y hay Campera/Polar fuera de marzo-septiembre → soft warning.
- Si motivo = "Robo con denuncia" y falta constancia → soft warning.

### 10.8 Botones
- Guardar borrador → estado 1.
- 📤 Elevar para autorización → estado 2.
- Cancelar.

---

## 11. Flujo completo con doble handshake

### 11.1 Diagrama del ciclo

```
[1. Borrador]
    │ (Elevar)
    ▼
[2. Pendiente autorización RRHH]
    │
    ├─(Rechazar)─────────► [12. Rechazado por RRHH]
    ├─(Cancelar)─────────► [13. Cancelado por Solicitante]
    │ (Autorizar)
    ▼
[3. Autorizado por RRHH, esperando envío a Logística]
    │ (Logística marca "recibí")
    ▼
[4. En preparación por Logística]
    │ (Logística marca "envié")
    ▼
[5. Enviado por Logística, esperando confirmación RRHH]  ── 24hs → alerta
    │ (RRHH confirma "recibí")
    ▼
[6. Recibido por RRHH, listo para retirar Supervisor]
    │ (RRHH marca "Sup se lo llevó")
    ▼
[7. Retirado por Supervisor, esperando confirmación Sup]  ── 24hs → alerta
    │ (Supervisor confirma "sí, lo tengo")
    ▼
[8. Confirmado por Supervisor, en tránsito a operario]
    │ (Supervisor marca "entregué con firma" + foto)
    │ + Actualiza talle en legajo si cambió
    │ + Congela precios en pedido_uniforme_prendas
    │ + Si con_descuento: crea registro en descuentos_uniforme_pendientes
    ▼
[9. Entregado al operario con firma, esperando constancia + viejo]  ── 15 días → vencido
    │ (Supervisor marca "devolví constancia + viejo")
    ▼
[10. Constancia + viejo entregados, esperando confirmación RRHH]  ── 24hs → alerta
    │ (RRHH confirma) + Si faltó prenda: genera descuento adicional
    ▼
[11. Cerrado]

[9] ── 15 días sin devolución ──► [14. Vencido]
    ├─(RRHH aplica descuento)──► [15. Descuento aplicado por incumplimiento]
    └─(Sup devuelve tardíamente)─► [10. ...]
```

### 11.2 Notificaciones por transición

Todas van a `notificaciones_sistema`.

| Transición | A quién notificar | Tipo |
|---|---|---|
| 1 → 2 (Elevado) | RRHH | `uniforme_solicitado` |
| 2 → 3 (Autorizado) | Logística + Solicitante | `uniforme_autorizado` |
| 2 → 12 (Rechazado) | Solicitante | `uniforme_rechazado` |
| 3 → 4 (Logística recibe) | RRHH + Solicitante | `uniforme_en_preparacion` |
| 4 → 5 (Logística envía) | RRHH | `uniforme_enviado_a_rrhh` |
| 5 → 6 (RRHH confirma) | Logística | `uniforme_confirmado_rrhh` |
| **5 → 24hs sin confirmar** | RRHH + Logística | `uniforme_alerta_24hs_rrhh` |
| 6 → 7 (Retirado por Sup) | Supervisor | `uniforme_retirado_supervisor` |
| **7 → 24hs sin confirmar** | Supervisor + RRHH | `uniforme_alerta_24hs_sup` |
| 7 → 8 (Sup confirma) | RRHH | `uniforme_confirmado_supervisor` |
| 8 → 9 (Entregado con firma) | Solicitante + RRHH | `uniforme_entregado` |
| **9 → 15 días vencido** | Supervisor + RRHH | `uniforme_vencido_15_dias` |
| 9 → 10 (Sup devuelve) | RRHH | `uniforme_devolucion_a_rrhh` |
| **10 → 24hs sin confirmar** | RRHH + Supervisor | `uniforme_alerta_24hs_devolucion` |
| 10 → 11 (Cerrado) | Supervisor + Solicitante | `uniforme_cerrado` |
| 14 → 15 (Descuento) | Supervisor + operario | `uniforme_descuento_incumplimiento` |

### 11.3 Chequeos automáticos

**A — Handshakes vencidos (24hs):** para pedidos en estados 5, 7, 10 con >24hs sin confirmar → alerta. 1 sola vez por estado.

**B — Constancia + viejo (15 días):** pedidos en estado 9 con >15 días desde entrega → estado 14 (Vencido). Setear flags `vencido_constancia` y/o `vencido_uniforme_viejo`. Notificar.

Ver §19.1 para decisión de implementación (cron real vs check al abrir).

### 11.4 Lógica de transición 8 → 9 (crítica)

```javascript
function marcarEntregadoConFirma(pedidoId, adjuntoConstancia) {
  const pedido = obtenerPedido(pedidoId);
  
  if (pedido.estado !== 'Confirmado por Supervisor, en tránsito a operario') {
    throw new Error('Estado inválido para marcar entregado');
  }
  if (!adjuntoConstancia) {
    throw new Error('Debés adjuntar la foto de la constancia firmada');
  }
  
  // 1. Cambiar estado y guardar adjunto
  pedido.estado = 'Entregado al operario con firma, esperando constancia + viejo';
  pedido.fecha_entrega_operario = now();
  pedido.supervisor_entrega_por = usuarioActual.nombre;
  pedido.constancia_firmada_adjunto_id_local = guardarAdjunto(adjuntoConstancia);
  
  // 2. Actualizar talle en legajo si cambió
  const prendas = obtenerPrendasDelPedido(pedidoId);
  actualizarTallesEnLegajo(pedido.legajo_id_local, prendas);
  
  // 3. Congelar precios
  prendas.forEach(p => {
    const precioVigente = obtenerPrecioVigente(p.prenda, p.talle, now());
    p.precio_unitario_congelado = precioVigente.precio;
    p.precio_id_local_referencia = precioVigente.id_local;
    supaSync('pedidoUniformePrendas', p);
  });
  
  // 4. Si con descuento, generar compromiso
  if (pedido.con_descuento) {
    const montoTotal = prendas.reduce((acc, p) =>
      acc + (p.precio_unitario_congelado * p.cantidad), 0);
    crearDescuentoPendiente({
      pedido_id_local: pedido.id_local,
      legajo_id_local: pedido.legajo_id_local,
      monto_total: montoTotal,
      cuotas_totales: 4,
      monto_cuota: montoTotal / 4,
      motivo_generacion: 'Pedido con descuento'
    });
  }
  
  supaSync('pedidosUniformes', pedido);
  registrarEvento(pedidoId, 8, 9, usuarioActual.nombre);
  generarNotificacion('uniforme_entregado', pedido);
  
  toast('✅ Entrega confirmada. Contás con 15 días para devolver constancia y uniforme viejo.');
}
```

### 11.5 Lógica de transición 10 → 11

Modal de confirmación con checkbox "¿Faltó alguna prenda del kit devuelto?". Si checked, selector de prendas faltantes. Si aplica, generar descuento adicional en `descuentos_uniforme_pendientes` con motivo "Uniforme viejo faltante".


---

## 12. Gestión de precios con vigencia temporal

### 12.1 Ubicación en UI
Sub-vista "Precios" dentro del módulo Uniformes. A futuro migra al módulo Logística.

### 12.2 Vista de la sub-vista

Tabla con precios vigentes (donde `vigencia_hasta IS NULL`): Prenda · Talle · Precio actual · Vigente desde · Cargado por · Motivo · Botón "Ver historial".

Botón "Ver historial" abre modal con todos los registros históricos de esa prenda+talle, ordenados por vigencia_desde descendente.

### 12.3 Modal de carga/edición

| Campo | Notas |
|---|---|
| Prenda | Select del catálogo |
| Talle | Select filtrado (opcional; vacío = precio único para toda la prenda) |
| Precio | Number en pesos |
| Vigente desde | Date |
| Motivo | Textarea |

**Al guardar:**
- Si existe precio vigente para misma prenda+talle:
  - `vigencia_desde` del nuevo > hoy → nuevo a futuro, vigente sigue hasta esa fecha.
  - `vigencia_desde` del nuevo <= hoy → vigente se cierra con `vigencia_hasta = vigencia_desde - 1 día`. Nuevo pasa a vigente.
- Se crea nuevo registro. El anterior queda con datos históricos intactos.

**Distinción crítica (política A.6):**
- Botón "Corregir error" → modifica registro anterior (queda en auditoría). No crea nuevo.
- Cambio con vigencia → crea nuevo registro con vigencia_desde.

Fede debe implementar los dos flujos claramente diferenciados en la UI.

### 12.4 Cálculo de precio vigente

```javascript
function obtenerPrecioVigente(prenda, talle, fecha) {
  const precios = DB.preciosUniformes.filter(p =>
    p.prenda === prenda &&
    (p.talle === talle || p.talle === null) &&
    p.vigencia_desde <= fecha &&
    (p.vigencia_hasta === null || p.vigencia_hasta >= fecha) &&
    !p.anulado
  );
  
  // Prioriza el que tiene talle específico
  const conTalle = precios.find(p => p.talle === talle);
  return conTalle || precios.find(p => p.talle === null) || null;
}
```

**Guard:** si no hay precio vigente al intentar congelar (transición 8 → 9) → error visible. RRHH/Logística deben cargar el precio antes.

---

## 13. Flujo de baja del asociado

### 13.1 Disparo automático desde Legajos

```javascript
// En Legajos, al cambiar estado a Baja:
function alBajarAsociado(legajoId, fechaBaja) {
  // ... resto de la lógica de baja ...
  
  if (window.generarOrdenDevolucionUniformes) {
    window.generarOrdenDevolucionUniformes(legajoId, fechaBaja);
  }
}
```

En `src/modules/uniformes/devoluciones.js`:

```javascript
export function generarOrdenDevolucionUniformes(legajoId, fechaBaja) {
  // Buscar pedidos "Cerrado" sin descuento (uniformes dados sin cobrar)
  const pedidos = DB.pedidosUniformes.filter(p =>
    p.legajo_id_local === legajoId &&
    p.estado === 'Cerrado' &&
    !p.con_descuento &&
    !p.anulado
  );
  
  // Restar los ya devueltos (por Renovación o Reubicación)
  const prendasNoDevueltas = calcularPrendasNoDevueltas(pedidos);
  
  if (prendasNoDevueltas.length > 0) {
    crearDevolucionPorBaja({
      legajo_id_local: legajoId,
      nombre_operario: obtenerNombre(legajoId),
      fecha_baja: fechaBaja,
      prendas_a_devolver: prendasNoDevueltas,
      estado: 'Pendiente devolución'
    });
    generarNotificacion('devolucion_por_baja_pendiente', { legajo_id_local: legajoId }, 'RRHH');
  }
}
```

### 13.2 Cierre manual desde Tab 4

RRHH abre la orden, marca qué se devolvió, cierra:
- Todo devuelto → "Devuelto completo".
- Falta algo → "Descuento aplicado por faltante" + registro en `descuentos_uniforme_pendientes` con **cuota única** (política).

### 13.3 Botón "+ Generar orden manual"
Por si Legajos no dispara. RRHH selecciona operario dado de baja, sistema calcula prendas pendientes, RRHH confirma.

---

## 14. Integraciones con otros módulos

### 14.1 Módulo Legajos
**Cambios necesarios:**
- Cuando estado cambia a "Baja" → llamar hook `window.generarOrdenDevolucionUniformes(legajoId, fechaBaja)`.
- Cuando se actualiza el talle (desde Uniformes, en 8 → 9) → sin cambios; el módulo Uniformes lo hace directo con `supaSync`.

**Consulta desde Uniformes:**
- Autocompletar operarios activos.
- Si supervisor, filtrar por `supervisor === usuarioActual`.
- Leer talle actual para auto-completar en el modal.

Coordinar con Lautaro antes de cambios no triviales.

### 14.2 Módulo Altas
**Cambios necesarios:**
- Al generar alta nueva → llamar hook `window.prepararPedidoUniformePorIngreso(legajoId)`.

En Uniformes:

```javascript
export function prepararPedidoUniformePorIngreso(legajoId) {
  const legajo = obtenerLegajo(legajoId);
  const borrador = {
    id_local: generarIdLocal(),
    legajo_id_local: legajoId,
    nro_socio: legajo.nro_socio,
    nombre_operario: legajo.nombre,
    servicio: legajo.servicio,
    supervisor_asignado: legajo.supervisor,
    origen: 'RRHH - Ingreso',
    solicitado_por: usuarioActual.nombre,
    motivo: 'Ingreso',
    con_descuento: false,
    estado: 'Borrador',
    observaciones: 'Pre-cargado automáticamente al generar el alta. Completá las prendas del kit del servicio.'
  };
  supaSync('pedidosUniformes', borrador);
  toast('✅ Borrador de pedido creado. Completá las prendas.');
}
```

### 14.3 Módulo Liquidaciones (a futuro)
Uniformes registra compromisos en `descuentos_uniforme_pendientes`. Cuando Liquidaciones migre:
- Lee registros "En curso" al procesar cada liquidación.
- Descuenta la cuota del retiro.
- Incrementa `cuotas_cobradas`.
- Cuando `cuotas_cobradas = cuotas_totales` → "Terminado".

Fede documenta en el código con TODO. No implementar ahora.

### 14.4 Sistema de notificaciones
Reutilizar `notificaciones_sistema` de Reasignaciones. Ver tipos en §11.2.

### 14.5 WhatsApp (a futuro)
Cuando Meta destrabada, notificar en cada transición con templates a definir.

### 14.6 Módulo Auditoría (futuro)
Valor "Auditoría" queda en el catálogo. Cuando el módulo exista, se conecta.

---

## 15. Etapas de implementación

### Etapa 1 — Base persistente (crítica)
- Aplicar SQL `v017_uniformes.sql`.
- Actualizar mapeo en `supabase.js`.
- Crear estructura del módulo `src/modules/uniformes/`.
- Crear screen completo con 4 tabs.
- Implementar modal de pedido con validaciones.
- Implementar flujo completo con doble handshake (estados 1 → 11).
- Implementar Tabs 1 y 2.
- Implementar mock de permisos.
- Implementar chequeos automáticos (24hs y 15 días).

**Al terminar:** ciclo completo funcional con persistencia real.

### Etapa 2 — Precios y descuentos
- Sub-vista de Precios con vigencia temporal.
- Tab 3 (Descuentos aplicados).
- Cálculo automático de descuentos con congelamiento.
- Exportar a Excel.

### Etapa 3 — Devoluciones por baja
- Tab 4 (Devoluciones).
- Hook desde Legajos.
- Botón "Generar orden manual".

### Etapa 4 — Integración con Altas
Hook desde Altas para pre-cargar pedidos por ingreso. Puede hacerse en paralelo con Etapas 2 o 3.

### Etapa 5 — WhatsApp (espera Meta)
Notificaciones automáticas por WhatsApp.

### Etapa 6 — Integración con Liquidaciones
Cuando Liquidaciones migre, integrar lectura y actualización de `descuentos_uniforme_pendientes`.

### Etapa 7 — Migración a módulo Logística
Migrar sub-vista de Precios cuando exista módulo Logística.

### Etapa 8 — Integración con Auditoría
Conectar flujo de origen cuando el módulo exista.

---

## 16. Bugs conocidos a corregir

Del legacy actual:

1. Modal no existe en el DOM → crear completo.
2. No hay botón "Nueva entrega" → agregar.
3. Nada persiste en Supabase → mapear tablas.
4. Acceso por índice de array → usar `id_local`.
5. Edición pierde el `id` → no aplica en rediseño (todo por `id_local`).
6. Integración con Liquidaciones es un mito → implementar `descuentos_uniforme_pendientes`.
7. Cruce por `nombre` en vez de por ID → usar `legajo_id_local`.
8. Modelo de datos primitivo → usar modelo rico de §4.
9. Ciclo minimalista → implementar 15 estados definidos.

---

## 17. Casos borde y validaciones

### 17.1 Pedido vencido con devolución tardía
Si en estado 14 y el supervisor devuelve antes de que RRHH aplique descuento → volver a estado 10, seguir flujo normal.

### 17.2 Rechazo con motivos parciales
No soportado. Rechaza todo el pedido con un motivo. Si el supervisor quiere rechazar solo algunas prendas, tiene que cancelar y hacer uno nuevo con menos ítems.

### 17.3 Modificar pedido después de elevar
No permitido. Si hay error, cancelar (estado 13) y hacer uno nuevo.

### 17.4 Operario dado de baja durante ciclo
El pedido queda igual. Al confirmar entrega con firma, advertencia. RRHH decide caso por caso. El sistema NO cancela automáticamente.

### 17.5 Supervisor dado de baja durante ciclo
Pedido queda con supervisor "huérfano". El sistema permite que RRHH reasigne el supervisor.

### 17.6 24hs cuando cae fin de semana
Se cuentan corridas (no laborales). Si Logística marca "enviado" el viernes, sábado a la misma hora → alerta.

### 17.7 15 días vs feriados
Días corridos. Sin ajuste por feriados.

### 17.8 Robo sin constancia policial
Se puede elevar (soft warning). Guarda con `con_descuento = false` inicialmente.
**Recomendación UX:** al autorizar, RRHH puede tener botón "Cambiar motivo a Pedido extra con descuento" antes de autorizar.

### 17.9 Prenda sin precio vigente
Al congelar (8 → 9), si no hay precio → error. RRHH/Logística deben cargar antes.

### 17.10 Múltiples pedidos simultáneos
Un operario puede tener varios pedidos en curso simultáneos. Sin restricción.

### 17.11 Cancelación con adjunto ya subido
Adjunto se marca como huérfano, no se elimina automáticamente. Puede eliminarse manualmente si es necesario.

---

## 18. Convenciones del proyecto

### 18.1 Del código
- Nombres en español.
- camelCase en frontend, snake_case en Supabase.
- Un commit por cambio lógico.

### 18.2 De la base de datos
- Nunca modificar SQL versionado viejo → crear `vNNN` nuevo.
- Soft delete con `anulado`.
- Guard de idempotencia en transiciones críticas.
- Historización de precios (política A.6).

### 18.3 De la UI
- Toasts para feedback.
- Loading indicators si >1 segundo.
- Confirmaciones para acciones destructivas.
- Colores consistentes con otros módulos.

### 18.4 De testing
Probar manualmente el ciclo completo (elevar → autorizar → Logística arma → RRHH confirma → Sup retira → Sup confirma → entrega con firma → devolución → cierre). Probar handshakes vencidos, 15 días vencido, devolución tardía, rechazo, cancelación, gestión de precios con vigencia + histórico, descuentos por incumplimiento, orden por baja.

---

## 19. Decisiones técnicas delegadas a Fede

### 19.1 Chequeos automáticos: cron real vs check al abrir

**Contexto:** chequeos de 24hs y 15 días necesitan ejecución periódica.

**Opciones:** A) Check al abrir el módulo. B) Cron real (Supabase pg_cron o Edge Function).

**Recomendación:** empezar con A. Más simple. Migrar a B cuando volumen justifique.

### 19.2 Ubicación de sub-vista Precios

**Opciones:** A) Sub-tab dentro del módulo (5 tabs total). B) Botón secundario en el header ("Gestionar precios") que abre pantalla separada.

**Recomendación:** B. Vista de configuración, no de trabajo diario.

### 19.3 Precio único vs por talle

**Opciones:** A) Todos los precios por prenda + talle específico. B) Precio puede ser por prenda (talle NULL) o por prenda + talle (más específico gana).

**Recomendación:** B. Más flexible.

### 19.4 Sistema de adjuntos

**Opciones:** A) Reusar `src/shared/adjuntos.js` con nueva categoría "uniformes". B) Implementar aparte.

**Recomendación:** A. Consistencia. Coordinar con Lautaro si hay que agregar tipos.

---

## 20. FAQ

**¿Cubre EPP?** No. EPP va a módulo aparte a futuro.

**¿El asociado puede pedir directo desde el sistema?** No en esta versión. Pide al supervisor (informal), supervisor eleva. Catálogo tiene "Asociado directo" pero lo carga RRHH o el supervisor.

**¿El sistema valida la constancia policial?** No. Es foto que se sube. RRHH revisa manualmente. Si no sirve → cambia motivo a "Pedido extra" antes de autorizar.

**¿Cómo se maneja el reintegro al asociado que había pagado y devuelve al darse de baja?** La política menciona reintegro pero en esta versión no se implementa automático. RRHH ve estado del descuento en Tab 3 y gestiona fuera del sistema.

**¿Múltiples pedidos activos para un mismo operario?** Sí. Sin restricción.

**¿Pedidos por Auditoría si el módulo no existe?** Valor queda en catálogo. Cuando se implemente auditoría, generará pedidos con este origen. Por ahora, alguien puede marcar manualmente.

**¿Puedo tocar `src/legacy.js`?** No. Dejar como referencia. Cuando el nuevo funcione, se remueve del menú.

**¿Puedo tocar Legajos y Altas?** Solo lo mínimo para los hooks descritos en §14. Coordinar con Lautaro.

**¿Cómo se relaciona con Vacaciones y Descansos?** Comparten `notificaciones_sistema` y el patrón conceptual de doble handshake. Ver esos diseños para consistencia visual.

---

## 21. Cierre

Este documento se construyó a partir de:
1. Inventario técnico del legacy (`docs/INVENTARIO_uniformes_legacy.md`).
2. **Política oficial de RRHH** de la cooperativa.
3. Sesión de diseño con Lautaro sobre proceso real, ciclo semanal, áreas involucradas, modelo de doble handshake, política de descuentos, precios con vigencia temporal.
4. Alineación con `POLITICAS_PROYECTO.md` y `CLAUDE.md`.
5. Coherencia con módulos Vacaciones y Descansos.

Con este documento, Fede tiene todo lo necesario para implementar sin bloqueos. Ante duda de diseño no cubierta: **preguntar antes de codear** (política A.4).

**¡Buenas entregas!** 👕
