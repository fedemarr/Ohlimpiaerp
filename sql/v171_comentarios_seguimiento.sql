-- v171: comentarios por candidato en la vista de Seguimiento (ticket #184,
-- Jimena Martinez Guillen).
--
-- Pedido: "Dentro de la visualización de una persona en seguimiento tener la
-- posibilidad de agregar un comentario (me serviría para dejar la clave fiscal
-- y acceder cada que lo necesito)".
--
-- Se crea una tabla nueva en vez de colgar un array de comentarios del
-- candidato porque: (a) los comentarios tienen autor + fecha y se consultan
-- por candidato, que es un índice natural, (b) permite editar/borrar un
-- comentario puntual sin reescribir todo el objeto, y (c) es el mismo patrón
-- que ya usa el resto del ERP (sugerencia_adjuntos, adjunto_uniforme_eventos,
-- etc.).
--
-- La conciliación es por id_local del candidato (no por DNI) para no
-- depender de que el DNI se haya cargado completo, siguiendo el criterio ya
-- asentado en CLAUDE.md.
BEGIN;

CREATE TABLE IF NOT EXISTS public.candidato_comentarios (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text UNIQUE,
  candidato_id_local    text NOT NULL,
  comentario            text NOT NULL,
  autor                 text DEFAULT '',
  creado_en             timestamp with time zone DEFAULT now(),
  anulado               boolean NOT NULL DEFAULT false,
  anulado_por           text DEFAULT '',
  anulado_fecha         timestamp with time zone,
  created_at            timestamp with time zone DEFAULT now(),
  updated_at            timestamp with time zone DEFAULT now()
);

-- La lectura y el filtrado son siempre por candidato.
CREATE INDEX IF NOT EXISTS idx_candidato_comentarios_cand
  ON public.candidato_comentarios (candidato_id_local);

ALTER TABLE public.candidato_comentarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Solo usuarios autenticados" ON public.candidato_comentarios;
CREATE POLICY "Solo usuarios autenticados" ON public.candidato_comentarios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.candidato_comentarios IS
  'Comentarios libres asociados a un candidato, visibles desde Seguimiento';
COMMENT ON COLUMN public.candidato_comentarios.comentario IS
  'texto libre (ej: clave fiscal) que el usuario quiere recuperar después';
COMMENT ON COLUMN public.candidato_comentarios.anulado IS
  'borrado lógico: el registro se conserva para auditoría pero no se lista';

COMMIT;

-- Verificación:
--   \d public.candidato_comentarios
--   select candidato_id_local, count(*)
--   from public.candidato_comentarios
--   where anulado = false
--   group by 1;
