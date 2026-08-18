-- v001_base_tablas_faltantes.sql
-- Esquema real de las tablas que nunca quedaron documentadas en ningún
-- archivo SQL versionado (creadas a mano en Supabase antes de que
-- empezara la disciplina de migraciones numeradas). Reconstruido por
-- introspección directa contra la base de producción de Ohlimpia
-- (information_schema + pg_catalog), 18/08/2026 — no a mano, así queda
-- fiel a lo que realmente existe, columna por columna, PK incluida.
--
-- Con esto + setup_supabase.sql + v002 en adelante, una base nueva
-- (para una empresa cliente nueva) puede levantar el esquema completo
-- desde cero, cosa que antes no era posible: sin este archivo, decenas
-- de migraciones fallaban en cascada porque asumían que estas 34 tablas
-- ya existían.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabla: legajos
CREATE TABLE IF NOT EXISTS public.legajos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nro                    integer DEFAULT 0,
  nombre                 text DEFAULT ''::text,
  dni                    text DEFAULT ''::text,
  funcion                text DEFAULT ''::text,
  servicio               text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  ingreso                text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  estado_legal           text DEFAULT ''::text,
  estado_medico          text DEFAULT ''::text,
  fecha_baja             text DEFAULT ''::text,
  fecha_reincorp         text DEFAULT ''::text,
  seguro                 text DEFAULT ''::text,
  localidad              text DEFAULT ''::text,
  tel                    text DEFAULT ''::text,
  mail                   text DEFAULT ''::text,
  cuit                   text DEFAULT ''::text,
  estado_civil           text DEFAULT ''::text,
  nac                    text DEFAULT ''::text,
  banco                  text DEFAULT ''::text,
  calzado                integer DEFAULT 0,
  ambo                   text DEFAULT ''::text,
  periodo_prueba         integer DEFAULT 0,
  fecha_ingreso_prueba   text DEFAULT ''::text,
  adjuntos_legal         jsonb DEFAULT '[]'::jsonb,
  adjuntos_medico        jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  direccion              text,
  fec_nac                text,
  zona                   text,
  cbu                    text,
  art                    text,
  obra_social            text,
  forma_pago             text,
  integracion            integer,
  categoria              text,
  genero                 text,
  legajo_anterior_nro    integer,
  historial_movimientos  jsonb DEFAULT '[]'::jsonb,
  sector                 text,
  dias_vacaciones_anuales integer DEFAULT 0,
  jefe_directo_legajo_id_local text,
  talles_uniforme        jsonb,
  categoria_id_local     text,
  en_tratamiento         boolean NOT NULL DEFAULT false,
  clave_fiscal           text,
  inaes                  text,
  partido                text,
  codigo_postal          text,
  polizas                jsonb DEFAULT '[]'::jsonb,
  obra_social_inicio_tramite text,
  alta_obra_social       boolean NOT NULL DEFAULT false,
  alta_obra_social_fecha timestamp with time zone,
  mipyme_estado          text,
  cuit_estado            text,
  cuit_fecha_verificacion date,
  clave_fiscal_fecha_actualizacion date,
  UNIQUE (id_local)
);

ALTER TABLE public.legajos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.legajos;
CREATE POLICY "Solo usuarios autenticados" ON public.legajos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: clientes
CREATE TABLE IF NOT EXISTS public.clientes (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  razon                  text DEFAULT ''::text,
  cuit                   text DEFAULT ''::text,
  direccion              text DEFAULT ''::text,
  contacto               text DEFAULT ''::text,
  tel                    text DEFAULT ''::text,
  mail                   text DEFAULT ''::text,
  zona                   text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  servicio               text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  desde                  text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  ingresos_brutos        text,
  jurisdiccion_iibb      text,
  cond_pago              text,
  codigo_tango           text,
  fact_por               text,
  periodo_fact           text,
  productos_en_factura   text,
  req_oc                 text,
  notas_fact             text,
  doc_req                jsonb,
  contactos              jsonb,
  responsable            text,
  tipo_contrato          text,
  codigo                 text,
  responsable_tipo       text,
  responsable_contacto   text,
  gestiones_cobro        jsonb NOT NULL DEFAULT '[]'::jsonb,
  tipo                   text,
  iva                    text,
  arca                   text,
  forma_pago             text,
  ciudad                 text,
  logo                   text,
  pct_supervision        numeric(5,2),
  UNIQUE (id_local)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_id_local ON public.clientes USING btree (id_local) WHERE (id_local IS NOT NULL);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.clientes;
CREATE POLICY "Solo usuarios autenticados" ON public.clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: objetivos
CREATE TABLE IF NOT EXISTS public.objetivos (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  cliente_id_local       text NOT NULL,
  codigo                 text NOT NULL,
  nombre                 text NOT NULL,
  tipo                   text NOT NULL,
  dir                    text,
  ciudad                 text,
  supervisor_asignado    text,
  supervisor_asignado_por text,
  fecha_asignacion_supervisor timestamp with time zone,
  modelo_precio          text NOT NULL,
  valor                  numeric(12,2),
  valor_hora             numeric(10,2),
  efts                   numeric(6,2),
  valor_eft              numeric(12,2),
  fecha_inicio           date,
  fecha_fin              date,
  contrato               text,
  productos              text,
  clausula_actualizacion text,
  periodo_fact           text,
  req_oc                 text,
  texto_factura          text,
  estado                 text NOT NULL DEFAULT 'Presupuestado'::text,
  notas                  text,
  observaciones          text,
  cargado_por            text NOT NULL,
  fecha_carga            timestamp with time zone NOT NULL DEFAULT now(),
  modificado_por         text,
  modificado_en          timestamp with time zone,
  fecha_baja             date,
  dado_de_baja_por       text,
  motivo_baja            text,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  motivo_baja_razon      text,
  motivo_baja_detalle    text,
  fecha_reactivacion     date,
  reactivado_por         text,
  localidad              text,
  personal_horario       text,
  jurisdiccion           text,
  puestos_necesarios     jsonb NOT NULL DEFAULT '[]'::jsonb,
  log_productos          text,
  log_elementos          text,
  log_maquinas           text,
  tipo_sitio             text,
  comisiones             jsonb NOT NULL DEFAULT '[]'::jsonb,
  productos_limpieza     jsonb NOT NULL DEFAULT '[]'::jsonb,
  elementos_limpieza     jsonb NOT NULL DEFAULT '[]'::jsonb,
  maquinas_necesarias    jsonb NOT NULL DEFAULT '[]'::jsonb,
  supervisores_asignados jsonb NOT NULL DEFAULT '[]'::jsonb,
  pct_supervision        numeric(5,2),
  UNIQUE (codigo),
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_obj_cliente ON public.objetivos USING btree (cliente_id_local) WHERE (NOT anulado);
CREATE INDEX IF NOT EXISTS idx_obj_estado ON public.objetivos USING btree (estado) WHERE (NOT anulado);
CREATE INDEX IF NOT EXISTS idx_obj_codigo ON public.objetivos USING btree (codigo) WHERE (NOT anulado);

ALTER TABLE public.objetivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "objetivos_all" ON public.objetivos;
CREATE POLICY "objetivos_all" ON public.objetivos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: usuarios
CREATE TABLE IF NOT EXISTS public.usuarios (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text NOT NULL,
  email                  text,
  perfil                 text,
  funcion                text,
  activo                 boolean DEFAULT true,
  nickname               text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (email)
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_select_authenticated" ON public.usuarios;
CREATE POLICY "usuarios_select_authenticated" ON public.usuarios FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "usuarios_update_propio_o_admin" ON public.usuarios;
CREATE POLICY "usuarios_update_propio_o_admin" ON public.usuarios FOR UPDATE TO authenticated USING (((id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = auth.uid()) AND (u.perfil = 'Administrador total'::text))))));

-- Tabla: monotributos
CREATE TABLE IF NOT EXISTS public.monotributos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  historial_categorias   jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  nombre                 text,
  cuit                   text,
  categoria              text,
  fecha_alta             text,
  zona                   text DEFAULT 'provincia'::text,
  obra_social            boolean DEFAULT false,
  jubilado               boolean DEFAULT false,
  cur                    numeric DEFAULT 0,
  estado                 text DEFAULT 'Al día'::text,
  obs                    text,
  nro_socio              text,
  cur_manual             boolean NOT NULL DEFAULT false,
  adherentes_cantidad    integer NOT NULL DEFAULT 0,
  adherentes_monto       numeric NOT NULL DEFAULT 0,
  UNIQUE (id_local)
);

ALTER TABLE public.monotributos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.monotributos;
CREATE POLICY "Solo usuarios autenticados" ON public.monotributos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: uniformes
CREATE TABLE IF NOT EXISTS public.uniformes (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  legajo_id_local        text,
  nro_socio              text,
  nombre                 text NOT NULL,
  fecha                  date NOT NULL,
  talle                  text,
  prendas                jsonb,
  descuento              numeric NOT NULL DEFAULT 0,
  estado                 text NOT NULL DEFAULT 'Pendiente'::text,
  observaciones          text,
  editado_por            text,
  editado_en             timestamp with time zone,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_uniformes_legajo ON public.uniformes USING btree (legajo_id_local) WHERE (NOT anulado);

ALTER TABLE public.uniformes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.uniformes;
CREATE POLICY "Solo usuarios autenticados" ON public.uniformes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: retenciones
CREATE TABLE IF NOT EXISTS public.retenciones (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  legajo_id_local        text,
  nro_socio              text,
  nombre                 text NOT NULL,
  tipo                   text NOT NULL,
  periodo                text,
  monto                  numeric NOT NULL DEFAULT 0,
  motivo                 text,
  estado                 text NOT NULL DEFAULT 'Activa'::text,
  fecha_liberacion       date,
  editado_por            text,
  editado_en             timestamp with time zone,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  motivo_tipificado      text,
  tipo_valor             text NOT NULL DEFAULT 'Monto'::text,
  origen                 text,
  creado_por             text,
  creado_en              timestamp with time zone,
  liberado_por           text,
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_retenciones_legajo ON public.retenciones USING btree (legajo_id_local) WHERE (NOT anulado);

ALTER TABLE public.retenciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.retenciones;
CREATE POLICY "Solo usuarios autenticados" ON public.retenciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: capacitaciones
CREATE TABLE IF NOT EXISTS public.capacitaciones (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  legajo_id_local        text NOT NULL,
  nro_socio              text NOT NULL,
  nombre_asociado        text NOT NULL,
  tipo                   text NOT NULL,
  fecha                  date NOT NULL,
  lugar                  text NOT NULL,
  servicio               text,
  instructor             text NOT NULL,
  metodo_evaluacion      text,
  estado                 text NOT NULL DEFAULT 'Programada'::text,
  resultado              text,
  puntaje                integer,
  observaciones          text,
  adjunto_id_local       text,
  materiales_ids         text[],
  coordinado_asociado    text,
  coordinado_supervisor  text,
  editado_por            text,
  editado_en             timestamp with time zone,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.capacitaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.capacitaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.capacitaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: reasignaciones
CREATE TABLE IF NOT EXISTS public.reasignaciones (
  id                     bigint NOT NULL PRIMARY KEY,
  id_local               text NOT NULL,
  legajo_id_local        text,
  nro_socio              text NOT NULL,
  nombre_asociado        text NOT NULL,
  servicio_origen        text NOT NULL,
  supervisor_origen      text NOT NULL,
  funcion_origen         text,
  zona_origen            text,
  servicio_destino       text NOT NULL,
  supervisor_destino     text NOT NULL,
  funcion_destino        text,
  zona_destino           text,
  motivo                 text NOT NULL,
  fecha_solicitud        date NOT NULL DEFAULT CURRENT_DATE,
  fecha_efectiva         date NOT NULL,
  fecha_ejecucion        date,
  descripcion            text,
  elevado_por            text NOT NULL,
  originada_por          text NOT NULL,
  pedido_vinculado_id_local text,
  requiere_altura        boolean NOT NULL DEFAULT false,
  requiere_poliza_esp    boolean NOT NULL DEFAULT false,
  estado                 text NOT NULL DEFAULT 'Borrador'::text,
  aprobado_por           text,
  fecha_aprobacion       timestamp with time zone,
  motivo_rechazo         text,
  fecha_rechazo          timestamp with time zone,
  anulado_por            text,
  fecha_anulacion        timestamp with time zone,
  editado_por            text,
  editado_en             timestamp with time zone,
  anulado                boolean NOT NULL DEFAULT false,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.reasignaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.reasignaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.reasignaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: casos_legales
CREATE TABLE IF NOT EXISTS public.casos_legales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  asociado               text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  estado                 text DEFAULT ''::text,
  abogado                text DEFAULT ''::text,
  estudio                text DEFAULT ''::text,
  supervisor_al_alta     text DEFAULT ''::text,
  servicio               text DEFAULT ''::text,
  fecha_inicio           text DEFAULT ''::text,
  ultima_novedad         text DEFAULT ''::text,
  adjuntos               jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  abogado_cooperativa    text,
  estudio_cooperativa    text,
  supervisor_actual      text,
  tipo_reclamo           text,
  tipo_cliente           text,
  monto_reclamado        numeric(12,2),
  descripcion            text,
  relacion_otros_casos   text,
  fecha_proxima_instancia date,
  fecha_cierre           date,
  resultado              text,
  monto_final            numeric(12,2),
  observaciones_cierre   text,
  cerrado_por            text,
  UNIQUE (id_local)
);

ALTER TABLE public.casos_legales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.casos_legales;
CREATE POLICY "Solo usuarios autenticados" ON public.casos_legales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: prestamos
CREATE TABLE IF NOT EXISTS public.prestamos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  monto                  numeric DEFAULT 0,
  cuotas                 integer DEFAULT 0,
  monto_cuota            text DEFAULT ''::text,
  fecha_otorgamiento     text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  pagos                  jsonb DEFAULT '[]'::jsonb,
  obs                    text DEFAULT ''::text,
  aprobado_por           text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  supervisor_nombre      text,
  origen                 text DEFAULT 'Formal'::text,
  periodo                text,
  fecha_pedido           date,
  motivo_rechazo_rrhh    text,
  motivo_rechazo_finanzas text,
  aprobado_por_rrhh      text,
  fecha_aprobacion_rrhh  timestamp with time zone,
  pagado_por             text,
  fecha_pago             timestamp with time zone,
  monto_solicitado       numeric(10,2),
  cuotas_solicitadas     integer,
  monto_cuota_solicitado numeric(10,2),
  legajo_id_local        text,
  supera_tope            boolean NOT NULL DEFAULT false,
  anulado                boolean NOT NULL DEFAULT false,
  UNIQUE (id_local)
);

ALTER TABLE public.prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.prestamos;
CREATE POLICY "Solo usuarios autenticados" ON public.prestamos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: facturas
CREATE TABLE IF NOT EXISTS public.facturas (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  cliente_id             bigint DEFAULT 0,
  objetivo_cod           text DEFAULT ''::text,
  nro_factura            text DEFAULT ''::text,
  periodo_desde          text DEFAULT ''::text,
  periodo_hasta          text DEFAULT ''::text,
  importe                numeric(14,2) DEFAULT 0,
  fecha_factura          text DEFAULT ''::text,
  vencimiento            text DEFAULT ''::text,
  forma_pago             text DEFAULT ''::text,
  contacto_cobro         text DEFAULT ''::text,
  telefono_cobro         text DEFAULT ''::text,
  horario_cobro          text DEFAULT ''::text,
  ultimo_contacto        text DEFAULT ''::text,
  proxima_gestion        text DEFAULT ''::text,
  prob_cobro             integer DEFAULT 0,
  estado                 text DEFAULT ''::text,
  fecha_posible_cobro    text DEFAULT ''::text,
  acciones               jsonb DEFAULT '[]'::jsonb,
  tipo                   text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  nota                   text DEFAULT ''::text,
  notas                  text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  saldo                  numeric(14,2) NOT NULL DEFAULT 0,
  marcada_cobrada_por    text,
  fecha_marcada_cobrada  text,
  alerta_tango_no_confirmo boolean NOT NULL DEFAULT false,
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON public.facturas USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_estado ON public.facturas USING btree (estado);
CREATE INDEX IF NOT EXISTS idx_facturas_nro ON public.facturas USING btree (nro_factura);

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.facturas;
CREATE POLICY "Solo usuarios autenticados" ON public.facturas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: leads
CREATE TABLE IF NOT EXISTS public.leads (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  empresa                text DEFAULT ''::text,
  contacto               text DEFAULT ''::text,
  tipo                   text DEFAULT ''::text,
  zona                   text DEFAULT ''::text,
  valor                  integer DEFAULT 0,
  etapa                  text DEFAULT ''::text,
  responsable            text DEFAULT ''::text,
  origen                 text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  acciones               jsonb DEFAULT '[]'::jsonb,
  fecha                  text DEFAULT ''::text,
  resp                   text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  nota                   text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  cliente_borrador_id    bigint,
  motivo_perdida         text,
  tipo_cliente           text,
  cliente_id_vinculado   bigint,
  UNIQUE (id_local)
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.leads;
CREATE POLICY "Solo usuarios autenticados" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: propuestas_precios
CREATE TABLE IF NOT EXISTS public.propuestas_precios (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  objetivo_cod           text DEFAULT ''::text,
  cliente_nombre         text DEFAULT ''::text,
  objetivo_nombre        text DEFAULT ''::text,
  valor_actual           numeric DEFAULT 0,
  valor_hora_actual      numeric DEFAULT 0,
  valor_propuesto        numeric DEFAULT 0,
  valor_hora_propuesto   numeric DEFAULT 0,
  pct_aumento            numeric DEFAULT 0,
  clausula               text DEFAULT ''::text,
  motivo_cliente         text DEFAULT ''::text,
  fecha_propuesta        text DEFAULT ''::text,
  fecha_vigencia         text DEFAULT ''::text,
  aprobado_cliente       boolean DEFAULT false,
  fecha_aprob_cliente    text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  aprobado_por           text DEFAULT ''::text,
  proyeccion_meses       integer DEFAULT 0,
  origen_paritaria       text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  objetivo_id            bigint,
  cliente_id             bigint,
  tipo_modificacion      text NOT NULL DEFAULT 'Aumento'::text,
  motivo                 text,
  niveles                jsonb,
  tipo_convalidar        text,
  tramos                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  autorizada_por         text,
  fecha_autorizacion     text,
  confirmada_por         text,
  fecha_confirmacion     text,
  motivo_rechazo_gerente text,
  motivo_rechazo_cliente text,
  lote_id                text,
  propuesta_anterior_id  bigint,
  cargado_por            text,
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_propuestas_precios_lote ON public.propuestas_precios USING btree (lote_id);
CREATE INDEX IF NOT EXISTS idx_propuestas_precios_objetivo ON public.propuestas_precios USING btree (objetivo_id);

ALTER TABLE public.propuestas_precios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.propuestas_precios;
CREATE POLICY "Solo usuarios autenticados" ON public.propuestas_precios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: sugerencias
CREATE TABLE IF NOT EXISTS public.sugerencias (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  tipo                   text DEFAULT ''::text,
  modulo                 text DEFAULT ''::text,
  modulo_label           text DEFAULT ''::text,
  descripcion            text DEFAULT ''::text,
  esperado               text DEFAULT ''::text,
  frecuencia             text DEFAULT ''::text,
  nombre_usuario         text DEFAULT ''::text,
  usuario                text DEFAULT ''::text,
  perfil                 text DEFAULT ''::text,
  prioridad              text DEFAULT ''::text,
  estado                 text DEFAULT 'Pendiente'::text,
  fecha                  text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  fecha_estimada         text DEFAULT ''::text,
  fecha_resolucion       text DEFAULT ''::text,
  obs_admin              text DEFAULT ''::text,
  motivo_rechazo         text DEFAULT ''::text,
  visto_bueno            boolean DEFAULT false,
  reabierto              boolean DEFAULT false,
  historial              jsonb DEFAULT '[]'::jsonb,
  ult_accion             text DEFAULT ''::text,
  titulo                 text,
  respuesta_dev          text,
  UNIQUE (id_local)
);

ALTER TABLE public.sugerencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.sugerencias;
CREATE POLICY "Solo usuarios autenticados" ON public.sugerencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: no_conformidades
CREATE TABLE IF NOT EXISTS public.no_conformidades (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nro                    integer DEFAULT 0,
  fecha                  text DEFAULT ''::text,
  origen                 text DEFAULT ''::text,
  col_desc               text DEFAULT ''::text,
  causa_raiz             text DEFAULT ''::text,
  tratamiento            text DEFAULT ''::text,
  responsable            text DEFAULT ''::text,
  fecha_cierre           text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  reclamo_id             bigint,
  asociado_nro_socio     text,
  firmada                boolean NOT NULL DEFAULT false,
  firmada_en             timestamp with time zone,
  UNIQUE (id_local)
);

ALTER TABLE public.no_conformidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.no_conformidades;
CREATE POLICY "Solo usuarios autenticados" ON public.no_conformidades FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: adelantos_informales
CREATE TABLE IF NOT EXISTS public.adelantos_informales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nro_socio              integer DEFAULT 0,
  supervisor_nombre      text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  periodo                text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.adelantos_informales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.adelantos_informales;
CREATE POLICY "Solo usuarios autenticados" ON public.adelantos_informales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: art42
CREATE TABLE IF NOT EXISTS public.art42 (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  dias_semana            integer DEFAULT 0,
  horas_por_dia          numeric DEFAULT 0,
  trabaja_feriados       boolean DEFAULT false,
  trabaja_finde          boolean DEFAULT false,
  t12                    numeric DEFAULT 0,
  col_00                 integer DEFAULT 0,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.art42 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.art42;
CREATE POLICY "Solo usuarios autenticados" ON public.art42 FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: categorias_salariales
CREATE TABLE IF NOT EXISTS public.categorias_salariales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  valor_hora_actual      numeric DEFAULT 0,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.categorias_salariales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.categorias_salariales;
CREATE POLICY "Solo usuarios autenticados" ON public.categorias_salariales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: cobros
CREATE TABLE IF NOT EXISTS public.cobros (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  cliente_id             bigint DEFAULT 0,
  objetivo_cod           text DEFAULT ''::text,
  nro_factura            text DEFAULT ''::text,
  periodo_desde          text DEFAULT ''::text,
  periodo_hasta          text DEFAULT ''::text,
  importe_facturado      numeric(14,2) DEFAULT 0,
  importe_cobrado        numeric(14,2) DEFAULT 0,
  nro_recibo             text DEFAULT ''::text,
  fecha_cobro            text DEFAULT ''::text,
  fecha_acreditacion     text DEFAULT ''::text,
  forma_pago             text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

CREATE INDEX IF NOT EXISTS idx_cobros_cliente ON public.cobros USING btree (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cobros_nro_factura ON public.cobros USING btree (nro_factura);
CREATE INDEX IF NOT EXISTS idx_cobros_nro_recibo ON public.cobros USING btree (nro_recibo);

ALTER TABLE public.cobros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.cobros;
CREATE POLICY "Solo usuarios autenticados" ON public.cobros FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: enfermos
CREATE TABLE IF NOT EXISTS public.enfermos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  asociado               text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  tipo                   text DEFAULT ''::text,
  fecha_hecho            text DEFAULT ''::text,
  dias                   integer DEFAULT 0,
  ultimo_contacto        text DEFAULT ''::text,
  certif                 text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  habilitado             boolean DEFAULT false,
  adjuntos               jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.enfermos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.enfermos;
CREATE POLICY "Solo usuarios autenticados" ON public.enfermos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: evaluaciones
CREATE TABLE IF NOT EXISTS public.evaluaciones (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  cap                    text DEFAULT ''::text,
  maquinarias            jsonb DEFAULT '[]'::jsonb,
  modalidad              text DEFAULT ''::text,
  preguntas              jsonb DEFAULT '[]'::jsonb,
  respondieron           integer DEFAULT 0,
  total_enviadas         integer DEFAULT 0,
  aprobaron              integer DEFAULT 0,
  puntos_prom            integer DEFAULT 0,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.evaluaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.evaluaciones;
CREATE POLICY "Solo usuarios autenticados" ON public.evaluaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: feriados
CREATE TABLE IF NOT EXISTS public.feriados (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  fecha                  text DEFAULT ''::text,
  nombre                 text DEFAULT ''::text,
  tipo                   text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.feriados;
CREATE POLICY "Solo usuarios autenticados" ON public.feriados FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: materiales
CREATE TABLE IF NOT EXISTS public.materiales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  video                  jsonb DEFAULT '[]'::jsonb,
  tipo                   text DEFAULT ''::text,
  cap_tipo               text DEFAULT ''::text,
  maquinarias            jsonb DEFAULT '[]'::jsonb,
  url                    text DEFAULT ''::text,
  https                  text DEFAULT ''::text,
  duracion               text DEFAULT ''::text,
  col_desc               text DEFAULT ''::text,
  requiere_eval          text DEFAULT ''::text,
  fecha_alta             text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.materiales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.materiales;
CREATE POLICY "Solo usuarios autenticados" ON public.materiales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: motivos_fuera_eft
CREATE TABLE IF NOT EXISTS public.motivos_fuera_eft (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  codigo                 text DEFAULT ''::text,
  descripcion            text DEFAULT ''::text,
  activo                 boolean DEFAULT false,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.motivos_fuera_eft ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.motivos_fuera_eft;
CREATE POLICY "Solo usuarios autenticados" ON public.motivos_fuera_eft FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: motivos_no_fact
CREATE TABLE IF NOT EXISTS public.motivos_no_fact (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  codigo                 text DEFAULT ''::text,
  descripcion            text DEFAULT ''::text,
  activo                 boolean DEFAULT false,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.motivos_no_fact ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.motivos_no_fact;
CREATE POLICY "Solo usuarios autenticados" ON public.motivos_no_fact FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: paritarias
CREATE TABLE IF NOT EXISTS public.paritarias (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nombre                 text DEFAULT ''::text,
  sindicato              text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  vigencia               text DEFAULT ''::text,
  pct_aumento            numeric DEFAULT 0,
  homologada             boolean DEFAULT false,
  fecha_homologacion     text DEFAULT ''::text,
  estado_aplicacion      text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  escala                 jsonb DEFAULT '[]'::jsonb,
  categoria              text DEFAULT ''::text,
  valor_anterior         integer DEFAULT 0,
  valor_nuevo            numeric DEFAULT 0,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.paritarias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.paritarias;
CREATE POLICY "Solo usuarios autenticados" ON public.paritarias FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: planillas_adelantos
CREATE TABLE IF NOT EXISTS public.planillas_adelantos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  supervisor             text,
  fecha                  text,
  estado                 text DEFAULT 'Borrador'::text,
  items                  jsonb DEFAULT '[]'::jsonb,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_planillas_id_local ON public.planillas_adelantos USING btree (id_local);

ALTER TABLE public.planillas_adelantos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.planillas_adelantos;
CREATE POLICY "Solo usuarios autenticados" ON public.planillas_adelantos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: planillas_informales
CREATE TABLE IF NOT EXISTS public.planillas_informales (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  periodo                text DEFAULT ''::text,
  supervisor_nombre      text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  fecha_creacion         text DEFAULT ''::text,
  items                  jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.planillas_informales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.planillas_informales;
CREATE POLICY "Solo usuarios autenticados" ON public.planillas_informales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: reclamos
CREATE TABLE IF NOT EXISTS public.reclamos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  cliente_id             bigint DEFAULT 0,
  objetivo_cod           text DEFAULT ''::text,
  tipo                   text DEFAULT ''::text,
  prioridad              text DEFAULT ''::text,
  iniciador              text DEFAULT ''::text,
  col_desc               text DEFAULT ''::text,
  responsable            text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  fecha_cierre           text DEFAULT ''::text,
  genera_nc              boolean DEFAULT false,
  nc                     text DEFAULT ''::text,
  tratamiento            text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.reclamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.reclamos;
CREATE POLICY "Solo usuarios autenticados" ON public.reclamos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: retenes
CREATE TABLE IF NOT EXISTS public.retenes (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  periodo                text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  fecha_creacion         text DEFAULT ''::text,
  items                  jsonb DEFAULT '[]'::jsonb,
  nombre                 text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  dias_trabajados        integer DEFAULT 0,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.retenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.retenes;
CREATE POLICY "Solo usuarios autenticados" ON public.retenes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: sanciones
CREATE TABLE IF NOT EXISTS public.sanciones (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  asociado               text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  tipo                   text DEFAULT ''::text,
  motivo                 text DEFAULT ''::text,
  fecha                  text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  adjuntos               jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.sanciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.sanciones;
CREATE POLICY "Solo usuarios autenticados" ON public.sanciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: solicitudes_prestamos
CREATE TABLE IF NOT EXISTS public.solicitudes_prestamos (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  periodo                text DEFAULT ''::text,
  supervisor_nombre      text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  fecha_creacion         text DEFAULT ''::text,
  items                  jsonb DEFAULT '[]'::jsonb,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.solicitudes_prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.solicitudes_prestamos;
CREATE POLICY "Solo usuarios autenticados" ON public.solicitudes_prestamos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: vac_admin
CREATE TABLE IF NOT EXISTS public.vac_admin (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  nro_socio              integer DEFAULT 0,
  asociado               text DEFAULT ''::text,
  sector                 text DEFAULT ''::text,
  anio                   text DEFAULT ''::text,
  dias_corresp           integer DEFAULT 0,
  planilla               text DEFAULT ''::text,
  dias_sol               integer DEFAULT 0,
  desde                  text DEFAULT ''::text,
  hasta                  text DEFAULT ''::text,
  pendientes             integer DEFAULT 0,
  cumple                 text DEFAULT ''::text,
  reemplaza              text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.vac_admin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.vac_admin;
CREATE POLICY "Solo usuarios autenticados" ON public.vac_admin FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tabla: vac_operativo
CREATE TABLE IF NOT EXISTS public.vac_operativo (
  id                     uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  id_local               text,
  fecha_sol              text DEFAULT ''::text,
  nro_socio              integer DEFAULT 0,
  asociado               text DEFAULT ''::text,
  supervisor             text DEFAULT ''::text,
  servicio               text DEFAULT ''::text,
  cantidad               text DEFAULT ''::text,
  anio                   text DEFAULT ''::text,
  desde                  text DEFAULT ''::text,
  hasta                  text DEFAULT ''::text,
  retorno                text DEFAULT ''::text,
  cumple                 text DEFAULT ''::text,
  form_fisico            text DEFAULT ''::text,
  reemplaza              text DEFAULT ''::text,
  estado                 text DEFAULT ''::text,
  obs                    text DEFAULT ''::text,
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  UNIQUE (id_local)
);

ALTER TABLE public.vac_operativo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.vac_operativo;
CREATE POLICY "Solo usuarios autenticados" ON public.vac_operativo FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
