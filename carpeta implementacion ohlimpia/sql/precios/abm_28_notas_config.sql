-- =====================================================================
-- Notas de aumento — PASO 1: estructura (enfoque nuevo: PDF generado por
-- el sistema, sin Word). Guarda el TEXTO de la nota por escala/paritaria y
-- la CONFIGURACION del membrete + firma (imagenes en base64).
-- Sin begin/commit. Idempotente (if not exists).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) texto_nota en escalas_aumento
--    El texto completo de la nota para esa escala/paritaria. Juan lo edita.
--    Dentro, una linea con [TABLA] marca donde se inserta la tabla de
--    aumentos (Mes | % | Precio) al generar el PDF.
-- ---------------------------------------------------------------------
alter table public.escalas_aumento add column if not exists texto_nota text;

comment on column public.escalas_aumento.texto_nota is
  'Texto completo de la nota de aumento para esa escala/paritaria (editable). Incluir una linea con el marcador [TABLA] para indicar donde va la tabla de aumentos (Mes | % | Precio) al generar el PDF.';


-- ---------------------------------------------------------------------
-- 2) notas_config — configuracion unica: firma + membrete.
--    La app lee la PRIMERA fila (order by created_at). Imagenes en base64
--    (data URI) para simplicidad; si crecen mucho, se puede migrar a Storage.
-- ---------------------------------------------------------------------
create table if not exists public.notas_config (
  id              uuid primary key default gen_random_uuid(),
  firmante_nombre text,                          -- ej. "ARIEL GOROSITO"
  firmante_cargo  text,                          -- ej. "COORD. COMERCIAL"
  firma_imagen    text,                          -- firma escaneada, base64 (data URI: "data:image/png;base64,...")
  membrete_header text,                          -- logo/encabezado, base64
  membrete_footer text,                          -- pie institucional, base64
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.notas_config is
  'Configuracion unica de las notas de aumento: datos del firmante e imagenes del membrete (encabezado/pie) y la firma. La app usa la primera fila. Imagenes en base64 (data URI).';
comment on column public.notas_config.firmante_nombre is 'Nombre del firmante (ej. "ARIEL GOROSITO"). Editable por si cambia el gerente.';
comment on column public.notas_config.firmante_cargo  is 'Cargo del firmante (ej. "COORD. COMERCIAL").';
comment on column public.notas_config.firma_imagen    is 'Imagen de la firma escaneada, base64 (data URI).';
comment on column public.notas_config.membrete_header is 'Imagen del encabezado/logo del membrete, base64 (data URI). A futuro cambiable.';
comment on column public.notas_config.membrete_footer is 'Imagen del pie institucional del membrete, base64 (data URI).';


-- ---------------------------------------------------------------------
-- Verificacion
-- ---------------------------------------------------------------------
-- (a) escalas_aumento tiene texto_nota
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'escalas_aumento' and column_name = 'texto_nota';

-- (b) notas_config creada (0 filas) + columnas
select count(*) as filas from public.notas_config;
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'notas_config'
 order by ordinal_position;
