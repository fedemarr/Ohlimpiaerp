-- v105: sacar el CHECK constraint de objetivo_precios.tipo_servicio
--
-- Mismo problema que sql/v104 (sucursales.tipo_servicio): CHECK heredado
-- sin adaptar del port de FinFlow, sólo permitía 'vigilancia' | 'custodia'
-- | 'otro'. Bloqueaba la carga de precios reales de Ohlimpia (tipo_servicio
-- real: 'Limpieza' / 'OBRA' / 'RUNNER', copiado desde sucursales.tipo_servicio
-- al importar valores hora reales por cliente-servicio, 08/2026).

ALTER TABLE public.objetivo_precios DROP CONSTRAINT IF EXISTS objetivo_precios_tipo_servicio_check;
