-- v008: agregar tel y rrhh a preocupacionales
-- El handoff (aprobarPsico → preocupacional) copia el snapshot del psico,
-- que incluye tel y rrhh. La tabla cat_alt_pendientes ya los tiene; espejamos.

ALTER TABLE public.preocupacionales ADD COLUMN tel text;
ALTER TABLE public.preocupacionales ADD COLUMN rrhh text;
