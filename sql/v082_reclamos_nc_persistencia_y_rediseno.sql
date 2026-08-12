-- =============================================================================
-- Migración: v082 — Reclamos/NC: fix de persistencia crítico + campos para
--            el rediseño kanban (tema 9 del relevamiento)
-- Fecha:     2026-08-11
-- Autor:     Fede
-- =============================================================================
--
-- CONTEXTO — BUG CRÍTICO ENCONTRADO
-- ----------------------------------
-- Las tablas `reclamos` y `no_conformidades` YA EXISTÍAN en Supabase
-- (probablemente de una migración vieja) pero NUNCA se registraron en
-- _SM (mapa de tablas de src/shared/supabase.js). Resultado: cada
-- llamada a supaSync('reclamos', ...) hacía early-return silencioso
-- (tabla=_SM['reclamos']=undefined) — TODOS los reclamos y NC creados
-- en el sistema, siempre, vivieron solo en memoria del navegador y se
-- perdieron en cada recarga. Verificado contra la base real: ambas
-- tablas existen con las columnas correctas pero 0 filas.
--
-- Se corrige acá (columnas nuevas + _SM) y en el JS (supaSync ya
-- registrado + guardarReclamo/guardarNC ya no dependen de "el último
-- elemento del array" para saber qué sincronizar).
--
-- CAMPOS NUEVOS PARA EL TEMA 9
-- -----------------------------
-- - no_conformidades.reclamo_id: existía en el objeto JS pero la tabla
--   real no tenía la columna — se agrega (si no, el insert fallaría en
--   cuanto se sincronice de verdad).
-- - no_conformidades.nc_firmada_asociado_nro_socio: a qué legajo se le
--   imprime/hace firmar la NC — necesario para el movimiento en la
--   solapa Sanciones del legajo (tema 1).
-- - no_conformidades.firmada, firmada_en: si ya se subió la foto del
--   documento firmado.
-- =============================================================================

BEGIN;

ALTER TABLE public.no_conformidades
  ADD COLUMN IF NOT EXISTS reclamo_id bigint,
  ADD COLUMN IF NOT EXISTS asociado_nro_socio text,
  ADD COLUMN IF NOT EXISTS firmada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS firmada_en timestamptz;

-- Foto del documento de NC firmado por el asociado — mismo bucket/tabla
-- `adjuntos` que el resto del sistema (patrón v074/v080). Se verificó el
-- valor EXACTO vigente del constraint antes de recrearlo.
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_tipo_check;
ALTER TABLE public.adjuntos ADD CONSTRAINT adjuntos_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'informe-psico','apto-medico','no-apto','antecedente','libreta','curso',
    'dni-frente','dni-dorso','foto-rostro','monotributo','inaes',
    'certificado-capacitacion','constancia-uniforme','denuncia-policial-uniforme',
    'evidencia-sancion','descargo-sancion','entrevista','poliza-seguro','proceso',
    'certificado-mipyme','nc-firmada'
  ]));

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
