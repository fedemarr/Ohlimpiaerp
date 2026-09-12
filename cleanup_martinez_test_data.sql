-- Limpieza de datos de prueba de Fede ("Martinez Federico"), pedida
-- explícitamente en MONOTRIBUTO_pago_mensual_para_Fede.md (11/09, punto 2):
-- "Borrar al asociado de prueba... Borrar el registro completo, retención
-- incluida." Sin N° de socio real, no matchea con el padrón — solo ensucia
-- las listas de Monotributo/Retenciones para RRHH/Finanzas.
--
-- No requiere BEGIN/COMMIT — son deletes puntuales por id_local, revisables
-- uno por uno antes de correr si querés (el SELECT de abajo los muestra).

-- Ver antes de borrar:
-- select 'monotributos' t, id_local, nombre from public.monotributos where nombre ilike '%Martinez Federico%'
-- union all
-- select 'mono_pagos_mes', id_local, nombre from public.mono_pagos_mes where nombre ilike '%Martinez Federico%'
-- union all
-- select 'retenciones', id_local, nombre from public.retenciones where nombre ilike '%Martinez Federico%';

delete from public.monotributos where id_local = '384098895'; -- Martinez Federico, padrón de Monotributo
delete from public.mono_pagos_mes where id_local in ('631922467','631959021','577287046'); -- sus 3 meses armados (07,08,09-2026)
delete from public.retenciones where id_local = '529383567'; -- su retención de prueba (socio 146, período 2026-07)
