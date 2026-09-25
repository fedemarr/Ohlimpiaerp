-- v168 — Pedido de productos: "borrador guardado el <fecha>"
--
-- Ticket de Lautaro 25/09 (PERIODOS_estado_pedidos_para_Fede.md) + mockup
-- "Estado de los pedidos": el modal de detalle muestra por cada borrador
-- "guardado 23/09" — o sea, cuándo lo guardó por última vez el supervisor.
--
-- Por qué una columna nueva y no updated_at:
--   · pp_pedidos no tiene trigger de updated_at (v085 lo creó con el DEFAULT
--     now() pero sin trigger) → updated_at nunca se movió solo.
--   · aunque lo tuviera, _toCamel() descarta 'created_at'/'updated_at' de
--     TODAS las tablas (ver src/shared/supabase.js) → nunca llegaría a JS.
--   · updated_at se movería también al cambiar de estado, y "cuándo se
--     guardó el borrador" es un dato distinto del "última modificación".
--
-- Sigo la convención de v085: los timestamps del flujo de pedido de productos
-- se guardan como text (no timestamptz) y en ISO, y son written desde la app
-- (guardarBorradorPedidoPP / repetirPedidoMesAnteriorPP).
--
-- Aditiva: no toca datos ni columnas existentes. Los borradores ya cargados
-- quedan con NULL y el modal los muestra como "en carga" (en la práctica no
-- hay ninguno: contra la base al 25/09 los 147 borradores del período 2026-10
-- no tienen ni un ítem, o sea que son "sin iniciar", que no usan esta fecha).

alter table public.pp_pedidos
  add column if not exists borrador_guardado_en text;

comment on column public.pp_pedidos.borrador_guardado_en is
  'Última vez que el supervisor guardó el pedido como borrador (ISO). NULL = nunca lo guardó explícitamente.';
