-- =====================================================================
-- Notas de aumento -- carga del FIRMANTE en notas_config (correr una vez).
-- Solo texto (nombre + cargo). Las imagenes (logo/firma) las sigue leyendo
-- el generador desde notas/logo_b64.txt y notas/firma_b64.txt.
-- Idempotente: si la tabla esta vacia inserta; si ya hay fila sin firmante,
-- lo completa. No duplica al re-correr.
-- =====================================================================

-- 1) Tabla vacia -> inserta la fila con el firmante.
insert into public.notas_config (firmante_nombre, firmante_cargo)
select 'ARIEL GOROSITO', 'COORD. COMERCIAL'
where not exists (select 1 from public.notas_config);

-- 2) Ya habia una fila sin firmante -> la completa.
update public.notas_config
   set firmante_nombre = 'ARIEL GOROSITO',
       firmante_cargo  = 'COORD. COMERCIAL',
       updated_at      = now()
 where firmante_nombre is null;

-- Verificacion.
select firmante_nombre, firmante_cargo
  from public.notas_config
 order by created_at
 limit 1;
