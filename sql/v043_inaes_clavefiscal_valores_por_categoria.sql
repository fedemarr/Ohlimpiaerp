-- v043_inaes_clavefiscal_valores_por_categoria.sql
-- Feedback del equipo admin (Gabi, 2026-07-14). Dos cambios sin relación
-- entre sí, agrupados en una sola migración por conveniencia:

-- 1) Libro de asociados — legajos.claveFiscal (clave AFIP, dato nuevo)
--    y legajos.inaes (N° de registro INAES) ya se muestran en el legajo
--    (tab Datos personales) y se editan desde el modal de edición.
ALTER TABLE public.legajos
  ADD COLUMN IF NOT EXISTS clave_fiscal text,
  ADD COLUMN IF NOT EXISTS inaes text;

-- 2) Valores hora — la paritaria dejó de negociar por servicio, ahora
--    es un único valor por categoría. Se saca el NOT NULL de
--    servicio_nombre para poder cargar registros "generales"
--    (servicio_nombre = NULL) sin romper el único consumidor real que
--    ya existía del modelo viejo por servicio: Enfermos y Accidentes
--    (categoria_helper.js → congelarValorHora), que sigue funcionando
--    igual porque el código nuevo (obtenerValorHoraVigente) prioriza un
--    valor específico de servicio por sobre uno general cuando ambos
--    están vigentes. Los datos históricos por servicio quedan intactos,
--    solo se habilita coexistencia con el modelo nuevo.
ALTER TABLE public.valores_hora_categoria
  ALTER COLUMN servicio_nombre DROP NOT NULL;
