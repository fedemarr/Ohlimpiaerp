-- Continuación desde v101 (se cortó por el bug de lpad, ya corregido)
-- v082 a v100 (salvo v099) ya corrieron OK en el intento anterior
-- v101 — Stock inicial de uniformes (ticket "Stock inicial de uniformes", 08/2026)
--
-- Carga el inventario físico que Logística relevó en depósito (14/08/2026,
-- 1.080 unidades en 6 prendas: BUZO, AMBO, CAMPERA, CALZADO/Zapatos,
-- PANTALON/Grafa, CHOMBA) como punto de partida del stock del módulo
-- Uniformes, para que las salidas (pedidos) y entradas (compras) varíen
-- correctamente a partir de esa base.
--
-- No agrega columnas ni tablas nuevas: stock_uniformes y
-- stock_uniformes_movimientos (v071) ya tenían todo lo necesario.
--
-- ENFOQUE ELEGIDO: se reconcilia igual que un conteo físico (ver
-- guardarConteoFisico() en src/modules/uniformes/stock.js) — un movimiento
-- tipo:'ajuste' por cada combinación prenda/talle, con
-- cantidad = valor_del_archivo - cantidad_actual_en_sistema. Esto:
--   1) deja stock_uniformes_movimientos como ledger consistente (el nivel
--      siempre es la suma de sus movimientos, sin doble conteo);
--   2) reconcilia sin problema las 4 filas de prueba que ya existían
--      (Ambo/M, Zapatos/42, Chomba/L, Polar/L, las 4 en cantidad -1 —
--      quedaron así por pedidos reales descontados antes de que hubiera
--      stock inicial cargado, el mismo problema que este ticket resuelve);
--   3) funciona igual si la fila prenda/talle ya existe o no.
--
-- Equivalencias de nombre (archivo de Logística → catálogo del módulo):
--   CALZADO → Zapatos · PANTALON → Grafa (pantalón grafa) · resto, igual.
-- POLAR: sin stock informado (0 unidades, confirmado por Logística) pero
-- tenía la fila de prueba Polar/L en -1 → se reconcilia a 0 explícitamente.
-- REMERA: sin stock informado y sin prenda propia en el catálogo todavía
-- (no se crea fila — agregar a PRENDAS/TALLES_POR_PRENDA en catalogos.js
-- si Logística la releva a futuro).
--
-- Talles: unificados a notación numérica S/M/L/XL/2XL/3XL/4XL/5XL en todo
-- el catálogo (ver catalogos.js TALLES_POR_PRENDA — antes usaba
-- XXL/XXXL/XXXXL para Buzo/Ambo/Chomba/Polar/Campera, y el select de
-- "Talle de ambo" en Altas/Documentación usaba una tercera notación mixta
-- S..XL,XXL,XXXL,4XL,5XL; con el stock inicial llegando en notación
-- numérica hasta 5XL para Buzo y Ambo, se adoptó esa como única
-- convención en todo el proyecto).
--
-- Aplicado a producción manualmente el 25/08/2026 vía script Node
-- (mismo cálculo que este SQL). Este archivo documenta esa carga de forma
-- idempotente (el guard de abajo evita duplicar si se corre más de una
-- vez) — es el "script SQL de seed" pedido como entregable del ticket.

do $$
declare
  v_ya_importado boolean;
begin
  select exists(select 1 from stock_uniformes_movimientos where ref_tipo = 'stock_inicial')
    into v_ya_importado;
  if v_ya_importado then
    raise notice 'Stock inicial ya importado (existe un movimiento con ref_tipo=stock_inicial) — no se repite.';
    return;
  end if;

  create temporary table _stock_inicial_csv (prenda text, talle text, cantidad numeric) on commit drop;
  insert into _stock_inicial_csv (prenda, talle, cantidad) values
    ('Buzo','S',23),('Buzo','M',31),('Buzo','L',17),('Buzo','XL',20),
    ('Buzo','2XL',40),('Buzo','3XL',30),('Buzo','4XL',16),('Buzo','5XL',17),
    ('Ambo','S',40),('Ambo','M',35),('Ambo','L',35),('Ambo','XL',20),
    ('Ambo','2XL',30),('Ambo','3XL',21),('Ambo','4XL',23),('Ambo','5XL',11),
    ('Campera','S',10),('Campera','M',13),('Campera','L',12),('Campera','XL',15),('Campera','2XL',10),
    ('Zapatos','35',19),('Zapatos','36',8),('Zapatos','37',7),('Zapatos','38',3),
    ('Zapatos','39',11),('Zapatos','40',8),('Zapatos','41',6),('Zapatos','42',10),
    ('Zapatos','43',17),('Zapatos','44',25),('Zapatos','45',11),('Zapatos','46',1),
    ('Grafa','36',59),('Grafa','38',4),('Grafa','40',50),('Grafa','42',10),
    ('Grafa','44',29),('Grafa','46',25),('Grafa','48',40),('Grafa','50',30),
    ('Grafa','52',35),('Grafa','54',18),('Grafa','56',25),('Grafa','58',6),('Grafa','60',14),
    ('Chomba','S',25),('Chomba','M',23),('Chomba','L',26),('Chomba','XL',10),
    ('Chomba','2XL',12),('Chomba','3XL',40),('Chomba','4XL',4),
    ('Polar','L',0); -- sin stock informado; reconcilia la fila de prueba vieja a 0

  -- Crea las filas de stock_uniformes que todavía no existen, en 0
  -- (el ajuste de abajo las deja en el valor del CSV).
  insert into stock_uniformes (id_local, prenda, talle, cantidad)
  select right((extract(epoch from clock_timestamp())::bigint * 1000 + row_number() over ())::text, 9),
         c.prenda, c.talle, 0
  from _stock_inicial_csv c
  where not exists (
    select 1 from stock_uniformes s where s.prenda = c.prenda and s.talle = c.talle
  );

  -- Ajusta cada fila al valor del archivo y registra el movimiento.
  with deltas as (
    select s.id, s.prenda, s.talle, s.cantidad as actual, c.cantidad as objetivo,
           (c.cantidad - s.cantidad) as delta
    from stock_uniformes s
    join _stock_inicial_csv c on c.prenda = s.prenda and c.talle = s.talle
  )
  update stock_uniformes s
  set cantidad = d.objetivo, updated_at = now()
  from deltas d
  where s.id = d.id and d.delta <> 0;

  insert into stock_uniformes_movimientos (id_local, tipo, prenda, talle, cantidad, motivo, ref_tipo, ref_id_local, registrado_por)
  select right((extract(epoch from clock_timestamp())::bigint * 1000 + row_number() over ())::text, 9),
         'ajuste', d.prenda, d.talle, d.delta,
         'Stock inicial — inventario físico Logística 14/08/2026' ||
           case when d.prenda = 'Polar' then ' (sin stock informado por Logística — Polar)' else '' end,
         'stock_inicial', 'STKINI001', 'seed SQL v101'
  from (
    select s.id, s.prenda, s.talle, s.cantidad as actual, c.cantidad as objetivo,
           (c.cantidad - s.cantidad) as delta
    from stock_uniformes s
    join _stock_inicial_csv c on c.prenda = s.prenda and c.talle = s.talle
  ) d
  where d.delta <> 0;

  raise notice 'Stock inicial de uniformes importado.';
end $$;
-- v102: Agregar columna fecha_transicion a candidatos
-- Causa: registrarAsistencia() setea c.fechaTransicion pero no existe como
-- columna en Supabase → PostgREST rechaza el UPDATE con error de columna
-- desconocida → supaSync retorna false → toast genérico.
-- Esta columna registra cuándo cambió el último estado del candidato.

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS fecha_transicion timestamptz;
-- v103: Agregar 'Precandidato' al enum estado_candidato
-- Causa: el flujo de Precandidatos (commit 180211d, 19/08/2026) usa
-- estado='Precandidato' desde /postularme (api/postular.js) y desde la
-- tab Precandidatos de Candidatos, pero el valor nunca se agregó al enum
-- estado_candidato en producción → INSERT/UPDATE con ese estado se
-- rechaza con "invalid input value for enum estado_candidato" → toda
-- postulación pública falla con 500 ("No se pudo guardar la postulación").
--
-- No se puede agregar un valor a un enum y usarlo en la misma transacción
-- (ALTER TYPE ... ADD VALUE no es transaccional en ese sentido en
-- versiones viejas de Postgres) — se deja como sentencia suelta, sin
-- BEGIN/COMMIT explícito, tal como recomienda la documentación de
-- Postgres para este caso.

ALTER TYPE public.estado_candidato ADD VALUE IF NOT EXISTS 'Precandidato' BEFORE 'Sin citar';
-- v104: sacar el CHECK constraint de sucursales.tipo_servicio
--
-- Causa raíz de "faltan servicios activos en Precios" (ticket "Archivo de
-- precios de cliente", 08/2026): sucursales.tipo_servicio tenía un CHECK
-- que sólo permitía 'vigilancia' | 'custodia' | 'otro' — vocabulario de
-- una empresa de seguridad, heredado sin adaptar del port de FinFlow
-- (sql/v097a_precios.sql, la app original de la que se portó el módulo
-- Precios LIGE es de otro rubro). Ohlimpia es una cooperativa de
-- limpieza: sus servicios reales (objetivos.tipo) son 'Limpieza', 'OBRA',
-- 'RUNNER' — ninguno matchea esos 3 valores, así que CUALQUIER intento de
-- crear una fila en sucursales para un servicio real fallaba con
-- "violates check constraint sucursales_tipo_servicio_check", dejando la
-- tabla casi vacía (4 filas de prueba, contra 164 servicios activos
-- reales en objetivos).
--
-- Se saca el constraint en vez de ampliarlo a la lista real: tipo_servicio
-- acá es sólo informativo (no gobierna ninguna lógica de negocio en
-- precios.js, a diferencia de estado_candidato que sí tiene una máquina
-- de estados) — no tiene sentido mantenerlo cerrado a una lista fija que
-- va a quedar desactualizada de nuevo apenas aparezca un tipo de servicio
-- nuevo en Objetivos.

ALTER TABLE public.sucursales DROP CONSTRAINT IF EXISTS sucursales_tipo_servicio_check;
-- v105: sacar el CHECK constraint de objetivo_precios.tipo_servicio
--
-- Mismo problema que sql/v104 (sucursales.tipo_servicio): CHECK heredado
-- sin adaptar del port de FinFlow, sólo permitía 'vigilancia' | 'custodia'
-- | 'otro'. Bloqueaba la carga de precios reales de Ohlimpia (tipo_servicio
-- real: 'Limpieza' / 'OBRA' / 'RUNNER', copiado desde sucursales.tipo_servicio
-- al importar valores hora reales por cliente-servicio, 08/2026).

ALTER TABLE public.objetivo_precios DROP CONSTRAINT IF EXISTS objetivo_precios_tipo_servicio_check;
-- =============================================================================
-- Migración: v106 — Pedidos de personal: ajustes de mockup v1.5
-- Fecha:     2026-08-26
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo pedido de personas — AJUSTES", con mockup HTML adjunto
-- (mockup_pedidos_personal_v1_5.html) del área de Operaciones/RRHH. Agrega
-- workflow completo al módulo (hoy solo tenía alta + edición libre):
--   Pendiente → En búsqueda (RRHH lo toma) → Cubierto | Cancelado (con motivo)
--
-- DECISIONES CONFIRMADAS POR EL SOLICITANTE (26/08):
--   - Puede haber otros perfiles además de Operaciones cargando pedidos
--     (no se restringe "cargado_por" a un rol fijo).
--   - N° de pedido: correlativo simple (PP-1, PP-2, ...).
--   - Umbral de "VENCIDO": parametrizable, por urgencia (tabla pedidos_config).
--   - Motivos de cancelación: parametrizable (catálogo, mismo patrón que
--     perfil_personal_atributos de v073 — solo seed SQL por ahora, sin ABM).
--   - Notificaciones (🔔): NO en este alcance. Queda pendiente para más
--     adelante.
--   - Urgencia Alto/Medio/Bajo → Alta/Media/Baja: SIN necesidad de mantener
--     compatibilidad con lo viejo.
--   - N° de socio del candidato cubierto: campo LIBRE por ahora (sin validar
--     contra legajos reales). Se podrá mejorar después.
--   - Los pedidos cargados hasta hoy son de prueba: se BORRAN (no se
--     migran). Confirmado explícitamente por el solicitante.
--
-- Sigue el mismo patrón id_local / RLS endurecida directo que usa el resto
-- del módulo (v014, v073, v088).
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) Limpieza de datos de prueba (confirmado por el solicitante)
-- ============================================================
TRUNCATE public.pedidos;

-- ============================================================
-- 2) pedidos — columnas nuevas del workflow
-- ============================================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS numero               integer,
  ADD COLUMN IF NOT EXISTS cantidad             integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fecha_limite         text,
  ADD COLUMN IF NOT EXISTS cargado_por          text,
  -- Reemplazan al viejo "candidato" (texto libre suelto, sin estructura).
  -- Se dropea abajo: no hay datos que migrar (tabla recién vaciada).
  ADD COLUMN IF NOT EXISTS ingreso_tipo         text,   -- 'nuevo' | 'interno'
  ADD COLUMN IF NOT EXISTS nombre_candidato     text,
  ADD COLUMN IF NOT EXISTS nro_socio_candidato  text,   -- libre, sin validar contra legajos (por ahora)
  ADD COLUMN IF NOT EXISTS fecha_inicio         text,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion   text,
  ADD COLUMN IF NOT EXISTS motivo_detalle       text;

ALTER TABLE public.pedidos DROP COLUMN IF EXISTS candidato;

-- Urgencia ya no usa Alto/Medio/Bajo (sin compat hacia atrás, confirmado).
-- No hace falta UPDATE: la tabla está vacía tras el TRUNCATE de arriba.
-- El check de valores válidos queda a nivel de aplicación (como ya era).

-- numero: correlativo. UNIQUE pero nullable a nivel de columna porque
-- Postgres permite múltiples NULL en una UNIQUE — en la práctica la
-- aplicación SIEMPRE lo completa (max(numero)+1, mismo patrón que usa
-- Altas para nro de socio).
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_numero_key ON public.pedidos (numero) WHERE numero IS NOT NULL;

-- ============================================================
-- 3) pedidos_eventos — timeline por pedido (creado/tomado/cubierto/cancelado)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_eventos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  pedido_id_local text NOT NULL REFERENCES public.pedidos(id_local) ON DELETE CASCADE,
  tipo          text NOT NULL,   -- 'creado' | 'en_busqueda' | 'cubierto' | 'cancelado' | 'editado'
  detalle       text,
  usuario       text,
  -- Texto DD/MM/AAAA HH:MM, mismo criterio que pedidos.fecha (v014):
  -- created_at/updated_at los descarta _toCamel() (supabase.js:1036), así
  -- que la fecha visible en el timeline necesita su PROPIA columna.
  fecha         text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedidos_eventos_pedido_idx ON public.pedidos_eventos (pedido_id_local);

ALTER TABLE public.pedidos_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4) pedidos_motivos_cancelacion — catálogo parametrizable (mismo patrón
--    que perfil_personal_atributos de v073: solo seed SQL, sin ABM todavía)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_motivos_cancelacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text NOT NULL UNIQUE,

  codigo      text NOT NULL UNIQUE,
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos_motivos_cancelacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_motivos_cancelacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pedidos_motivos_cancelacion (id_local, codigo, nombre, orden) VALUES
  ('mot_reduccion',   'reduccion_horas',   'El cliente redujo horas',    10),
  ('mot_cubierto_otro','cubierto_otro',    'Se cubrió por otro lado',    20),
  ('mot_baja_servicio','baja_servicio',    'El servicio se dio de baja', 30),
  ('mot_duplicado',   'duplicado',         'Pedido duplicado',           40),
  ('mot_otro',        'otro',              'Otro',                       50)
ON CONFLICT (id_local) DO NOTHING;

-- ============================================================
-- 5) pedidos_config — clave/valor genérico, arranca con el umbral de
--    "VENCIDO" por urgencia (en días sin movimiento). Editable directo en
--    la tabla mientras no tenga pantalla propia.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos_config (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pedidos_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo usuarios autenticados" ON public.pedidos_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.pedidos_config (clave, valor) VALUES
  ('umbral_vencido_dias', '{"Alta":5,"Media":15,"Baja":30}')
ON CONFLICT (clave) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- =============================================================================
-- Migración: v107 — Stock de uniformes: columna Talle, tab Mínimos, tab Precios
-- Fecha:     2026-08-27
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "STOCK DE UNIFORMES — Talles, mínimos y precios" (Lautaro,
-- 26/08), con mockup_stock_uniformes_minimos_4.html. Los "tres agregados"
-- sobre el módulo que ya funciona (stock inicial importado, v101):
--   1. Columna TALLE en la grilla de Stock actual (+ valorización PPP/vigente).
--   2. Tab MÍNIMOS (nuevo) — vive en el módulo, NO en Configuración.
--   3. Tab PRECIOS (nuevo, solo uniformes) — precio de reposición vigente
--      con vigencia mensual (mecánica "Valores hora" de Categorías).
--
-- LO QUE YA EXISTÍA Y SE REUSA TAL CUAL (sin tocar esquema):
--   - precios_uniformes (v032): ya soporta prenda+talle+vigencia. El
--     ticket pide "SIN excepciones por talle" para el tab nuevo — se logra
--     usando esta misma tabla con talle SIEMPRE null, sin cambiar el
--     esquema (talle ya es nullable y obtenerPrecioVigente() ya prioriza
--     "sin talle" como precio general).
--   - stock_uniformes_movimientos (v071): ya registra las salidas por
--     entrega — de ahí sale "Consumo prom./mes" sin tabla nueva.
--
-- LO QUE SE AGREGA:
--   - stock_uniformes.costo_ppp: columna nueva, en 0 hasta que exista un
--     circuito de "Nueva compra" de uniformes (compras_uniformes ya
--     existe desde v071 pero sin UI todavía — FUERA de alcance de este
--     ticket, que son los "tres agregados"). Con costo_ppp en 0 la
--     grilla muestra "—", igual que un precio de reposición sin cargar.
--   - stock_minimos: unificada uniformes (prenda+talle) y productos
--     (producto_id_local) — el ticket pide expresamente que Mínimos
--     sirva para las dos categorías con la misma grilla.
--   - stock_minimos_ajustes: registro de cambios (usuario, fecha, valor
--     anterior) — pedido explícito del ticket.
--   - stock_config: umbral BAJO⚠ (% del mínimo, default 60%) y N meses
--     para la "propuesta general" (default 2) — parametrizable, mismo
--     patrón que pedidos_config (v106): seed SQL, editable directo en la
--     tabla, sin pantalla de ABM todavía.
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) stock_uniformes — costo_ppp (queda en 0 = "sin dato" hasta que haya
--    compras de uniformes cargadas)
-- ============================================================
ALTER TABLE public.stock_uniformes
  ADD COLUMN IF NOT EXISTS costo_ppp numeric NOT NULL DEFAULT 0;

-- ============================================================
-- 2) stock_minimos — uniformes (prenda+talle) y productos (producto_id_local)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_minimos (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local         text NOT NULL UNIQUE,

  categoria        text NOT NULL,   -- 'UNIFORMES' | 'PRODUCTOS'
  prenda           text,            -- solo UNIFORMES
  talle            text,            -- solo UNIFORMES
  producto_id_local text,           -- solo PRODUCTOS (matchea ppProductos.id, como stock_productos)
  minimo           numeric NOT NULL DEFAULT 0,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Una fila por combinación prenda+talle (uniformes) o por producto (productos).
CREATE UNIQUE INDEX IF NOT EXISTS stock_minimos_unif_key
  ON public.stock_minimos (prenda, talle) WHERE categoria = 'UNIFORMES';
CREATE UNIQUE INDEX IF NOT EXISTS stock_minimos_prod_key
  ON public.stock_minimos (producto_id_local) WHERE categoria = 'PRODUCTOS';

ALTER TABLE public.stock_minimos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.stock_minimos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3) stock_minimos_ajustes — registro de cambios (pedido explícito del ticket)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_minimos_ajustes (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local       text NOT NULL UNIQUE,

  categoria      text NOT NULL,
  -- Texto ya armado ("AMBO (8 talles)", "AMBO 5XL", nombre del producto):
  -- evita tener que resolver joins para mostrar el historial.
  clave          text NOT NULL,
  valor_anterior numeric,
  valor_nuevo    numeric NOT NULL,
  motivo         text,             -- ej. "mínimo general de la prenda", "propuesta general", null = ajuste manual puntual
  usuario        text,
  fecha          text,             -- DD/MM/AAAA HH:MM, mismo criterio que pedidos_eventos.fecha (v106):
                                    -- created_at lo descarta _toCamel(), hace falta columna propia para mostrarlo.

  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_minimos_ajustes_fecha_idx ON public.stock_minimos_ajustes (created_at DESC);

ALTER TABLE public.stock_minimos_ajustes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.stock_minimos_ajustes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4) stock_config — umbral BAJO⚠ y N meses de la propuesta general
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_config (
  clave       text PRIMARY KEY,
  valor       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.stock_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.stock_config (clave, valor) VALUES
  ('umbral_bajo_critico_pct', '0.6'),
  ('meses_propuesta_minimo', '2')
ON CONFLICT (clave) DO NOTHING;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- =============================================================================
-- Migración: v108 — Pedido de productos: ajustes (ticket "Módulo productos", 31/08)
-- Fecha:     2026-08-31
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo productos" (Lautaro, 31/08), acompañado de
-- mockup_pedido_productos_14_3.html y PEDIDO_PRODUCTOS_ajustes_para_Fede.md.
-- Se implementan los puntos 1–9 del checklist del MD (prioridad que el
-- propio documento marca como "primero"); 10–13 (Compras por proveedor,
-- Entregas, tab Recargos, tab Margen) quedan para una vuelta siguiente.
--
-- CAMBIOS DE ESTADO (punto 7 del MD — sin CHECK constraint que tocar:
-- pp_pedidos.estado ya es text libre, sin enum):
--   Antes: borrador → cerrado_supervisor → en_auditoria → autorizado → en_compra → entregado
--   Ahora: borrador → confirmado (directo, PAGAN+dentro de presupuesto+sin
--          excepciones) | confirmado_revision (al auditor) → observado
--          (devuelto) | autorizado (aprobado) → en_compra → entregado
--   No hace falta backfill: los pedidos viejos en 'cerrado_supervisor'/
--   'en_auditoria' siguen siendo válidos, el código los sigue leyendo.
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) pp_periodos — un solo período EN CARGA a la vez (punto 8)
-- ============================================================
ALTER TABLE public.pp_periodos
  ADD COLUMN IF NOT EXISTS cierre_programado    text,     -- fecha/hora ISO de cierre (DD/MM HH:MM en la UI)
  ADD COLUMN IF NOT EXISTS recordatorio_enviado boolean NOT NULL DEFAULT false;
-- estado pasa a admitir además 'habilitado' (próximo período, todavía no
-- abierto) — mismo texto libre que ya tenía la columna, no hace falta ALTER.

-- ============================================================
-- 2) pp_pedidos — trazabilidad de CONFIRMADO / OBSERVADO (puntos 7 y 9)
-- ============================================================
ALTER TABLE public.pp_pedidos
  ADD COLUMN IF NOT EXISTS confirmado_por      text,
  ADD COLUMN IF NOT EXISTS confirmado_en       text,
  ADD COLUMN IF NOT EXISTS observado_por       text,
  ADD COLUMN IF NOT EXISTS observado_en        text,
  ADD COLUMN IF NOT EXISTS observado_motivo    text,   -- chip obligatorio (EXCEDE / CON AUTORIZACIÓN / etc. — texto libre)
  ADD COLUMN IF NOT EXISTS observado_comentario text;  -- comentario obligatorio del auditor

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- =============================================================================
-- Migración: v109 — Pedido de productos: Compras por proveedor + Entregas
-- Fecha:     2026-08-31
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
--
-- CONTEXTO
-- --------
-- Ticket "Módulo productos" (Lautaro, 31/08), puntos 10 y 11 del checklist
-- de PEDIDO_PRODUCTOS_ajustes_para_Fede.md — la parte que quedó afuera de
-- v108 (que cubrió 1-9). Cambio de fondo que pide el punto 6: Logística NO
-- compra por servicio, compra el CONSOLIDADO por proveedor. Son dos
-- unidades y dos circuitos distintos:
--   - COMPRAS   (unidad: el proveedor) — consolidado → sugerencias de
--     equivalentes más baratos → simulación de ahorro → orden de compra →
--     seguimiento hasta la recepción → factura (alimenta PPP + cta cte).
--   - ENTREGAS  (unidad: el servicio) — arranca con lo recibido, armado
--     con checklist → remito → reparto → entregado (firma/foto).
--
-- Los botones viejos "Marcar en compra"/"Marcar entregado" (a nivel
-- PEDIDO, v085) quedan tal cual para pedidos que ya estén en ese flujo —
-- no se tocan datos existentes. El circuito nuevo es ADITIVO: la
-- consolidación de v109 solo toma ítems que todavía no tengan
-- orden_compra_id_local (pp_items.orden_compra_id_local, nuevo).
-- =============================================================================

BEGIN;

-- ============================================================
-- 1) pp_items — enganche con la orden de compra que se los llevó
--    (evita re-consolidar un ítem que ya está en una orden)
-- ============================================================
ALTER TABLE public.pp_items
  ADD COLUMN IF NOT EXISTS orden_compra_id_local text,
  ADD COLUMN IF NOT EXISTS cantidad_recibida     numeric,   -- null = todavía sin recepción cargada
  ADD COLUMN IF NOT EXISTS armado                boolean NOT NULL DEFAULT false;  -- checklist de Entregas

-- ============================================================
-- 2) pp_grupos_equivalencia — "productos iguales" de distintos proveedores
--    (Comparador de precios, punto 6a.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pp_grupos_equivalencia (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local      text NOT NULL UNIQUE,

  nombre        text NOT NULL,
  unidad_comun  text NOT NULL,   -- ej "BOLSA", "LITRO" — a qué se lleva todo con el factor
  anulado       boolean NOT NULL DEFAULT false,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pp_grupos_equivalencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_grupos_equivalencia FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pp_grupos_equivalencia_items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  grupo_id_local      text NOT NULL REFERENCES public.pp_grupos_equivalencia(id_local) ON DELETE CASCADE,
  producto_id_local   text NOT NULL,
  factor_conversion   numeric NOT NULL DEFAULT 1,  -- 1 unidad de compra = factor × unidad común

  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_geq_items_grupo ON public.pp_grupos_equivalencia_items(grupo_id_local);
ALTER TABLE public.pp_grupos_equivalencia_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_grupos_equivalencia_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3) pp_ordenes_compra — unidad PROVEEDOR (punto 6a.1/6a.4). items en
--    jsonb (mismo patrón que compras_uniformes de v071): es un snapshot
--    de lo que se pidió, no hace falta una tabla de líneas aparte.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pp_ordenes_compra (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local              text NOT NULL UNIQUE,

  numero                text,             -- "OC-2026-031", correlativo (se arma en JS)
  periodo_id_local      text NOT NULL,
  proveedor_id_local    text NOT NULL,

  estado                text NOT NULL DEFAULT 'confirmada',
    -- confirmada / enviada / recibida_parcial / recibida_completa
  items                 jsonb NOT NULL DEFAULT '[]',
    -- [{productoIdLocal, codigoProveedor, descripcion, costoUnit,
    --   cantidad, cantidadRecibida, obsLinea, sustituidoPor}]
  total                 numeric(14,2) NOT NULL DEFAULT 0,

  confirmada_por        text,
  confirmada_en         text,
  enviada_en            text,
  recibida_en           text,             -- última recepción cargada (parcial o completa)
  backorder_fecha_comprometida text,      -- fecha que dio el proveedor para lo pendiente

  factura_nro           text,
  factura_fecha         text,
  factura_monto         numeric(14,2),
  factura_registrada_por text,
  factura_registrada_en text,

  anulado               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_ordenes_periodo ON public.pp_ordenes_compra(periodo_id_local) WHERE NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pp_ordenes_proveedor ON public.pp_ordenes_compra(proveedor_id_local) WHERE NOT anulado;
ALTER TABLE public.pp_ordenes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_ordenes_compra FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4) proveedores_cta_cte_movimientos — punto 6a.4: la factura genera el
--    movimiento en la cuenta corriente del proveedor. Ledger simple
--    (debe/haber en un solo campo con signo), sin saldo materializado —
--    el saldo se calcula sumando (mismo criterio que
--    stock_uniformes_movimientos, v071).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.proveedores_cta_cte_movimientos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  proveedor_id_local  text NOT NULL,
  tipo                text NOT NULL,   -- 'factura' | 'pago' | 'ajuste'
  monto               numeric(14,2) NOT NULL,  -- factura = positivo (aumenta la deuda), pago = negativo
  motivo              text,
  ref_tipo            text,            -- 'orden_compra'
  ref_id_local        text,

  registrado_por      text,
  fecha               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_ctacte_proveedor ON public.proveedores_cta_cte_movimientos(proveedor_id_local);
ALTER TABLE public.proveedores_cta_cte_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.proveedores_cta_cte_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 5) pp_remitos — unidad SERVICIO (punto 6b): se genera al completar el
--    armado con checklist. Correlativo propio (independiente del de
--    órdenes de compra).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pp_remitos (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local            text NOT NULL UNIQUE,

  numero              text,            -- correlativo "R-000123"
  pedido_id_local     text NOT NULL,
  servicio_codigo     text NOT NULL,

  items               jsonb NOT NULL DEFAULT '[]',  -- snapshot armado: [{productoIdLocal, descripcion, cantidad}]

  estado              text NOT NULL DEFAULT 'armado',  -- armado / en_reparto / entregado
  armado_por          text,
  armado_en           text,
  en_reparto_en       text,
  entregado_a         text,            -- quién recibió
  entregado_en        text,
  foto_path           text,            -- Storage: bucket ohlimpia-adjuntos
  firma_cliente       boolean NOT NULL DEFAULT false,  -- true si el servicio es PAGAN y hubo firma

  anulado             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_remitos_pedido ON public.pp_remitos(pedido_id_local);
ALTER TABLE public.pp_remitos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_remitos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 6) pp_pedidos — fecha límite de entrega (Hoja de recorrido, punto 6b)
-- ============================================================
ALTER TABLE public.pp_pedidos
  ADD COLUMN IF NOT EXISTS fecha_limite_entrega text;

COMMIT;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
-- =============================================================================
-- Migración: v110 — Pedido de productos: tab Recargos + tab Margen (puntos 12-13)
-- Fecha:     2026-08-31
-- Autor:     Federico (con asistencia de Claude)
-- =============================================================================
-- Cierra el checklist del MD (puntos 1-13). Margen de productos (13) es
-- de solo lectura — no agrega tablas, lee lo que ya existe.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pp_recargo_general (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local       text NOT NULL UNIQUE,
  pct            numeric NOT NULL,             -- 0.30 = 30%
  vigencia_desde text NOT NULL,                -- YYYY-MM
  vigencia_hasta text,
  cargado_por    text,
  motivo         text,
  anulado        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pp_recargo_general ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_recargo_general FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.pp_recargo_general (id_local, pct, vigencia_desde, cargado_por, motivo) VALUES
  ('rg_inicial', 0.30, '2026-01', 'Sistema', 'Valor general ya vigente al construir el tab')
ON CONFLICT (id_local) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pp_recargo_servicio (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local        text NOT NULL UNIQUE,
  servicio_codigo text NOT NULL,
  pct             numeric NOT NULL,
  vigencia_desde  text NOT NULL,
  vigencia_hasta  text,
  cargado_por     text,
  motivo          text,
  anulado         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_recargo_servicio_cod ON public.pp_recargo_servicio(servicio_codigo) WHERE NOT anulado;
ALTER TABLE public.pp_recargo_servicio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo usuarios autenticados" ON public.pp_recargo_servicio FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
-- =============================================================================
-- Migración: v111 — Reclamos/NC internos (sin cliente obligatorio)
-- Fecha:     2026-08-31
-- Autor:     Fede
--
-- CONTEXTO
-- --------
-- Ticket Reclamos y NC: poder registrar reclamos/no conformidades INTERNOS,
-- sin que sea obligatorio asociar un cliente. Hoy el formulario marca
-- "Cliente *" como obligatorio, lo que bloquea NC de origen interno
-- (incidencias de procesos, problemas internos, etc.).
--
-- DECISIÓN DE DISEÑO
-- ------------------
-- Se agrega un flag booleano `es_interno` (default false) tanto en
-- `reclamos` como en `no_conformidades`, coherente con el patrón de flags
-- ya existente en esas tablas (`genera_nc`, `firmada`). Cuando `es_interno
-- = true`, el reclamo/NC no requiere cliente.
--
-- NOTA IMPORTANTE
-- ---------------
-- `reclamos.cliente_id` ya es `bigint DEFAULT 0` SIN NOT NULL (v001), así
-- que NO hay que alterar su nulabilidad: ya acepta NULL. El cambio acá es
-- SOLO agregar el flag de origen. Los reclamos internos persistirán con
-- `cliente_id = 0` (igual que hoy los que no eligen cliente), pero
-- marcados con `es_interno = true` para poder filtrarlos/distinguirlos.
--
-- RLS: no se toca. Ambas tablas usan "Solo usuarios autenticados"
-- FOR ALL TO authenticated USING(true) — ya cubre el caso.
-- =============================================================================

BEGIN;

ALTER TABLE public.reclamos
  ADD COLUMN IF NOT EXISTS es_interno boolean NOT NULL DEFAULT false;

ALTER TABLE public.no_conformidades
  ADD COLUMN IF NOT EXISTS es_interno boolean NOT NULL DEFAULT false;

-- Índice opcional si el volumen amerita filtrar por origen; sin él también
-- filtra bien en este volumen. Se deja comentado para no agregar peso si no
-- hace falta.
-- CREATE INDEX IF NOT EXISTS idx_reclamos_es_interno ON public.reclamos(es_interno);

COMMIT;

-- =============================================================================
-- CÓMO APLICARLO
--   En el SQL Editor de Supabase (Dashboard → SQL → New query), pegar este
--   archivo completo y ejecutar. Es idempotente (IF NOT EXISTS), seguro de
--   re-ejecutar. No borra ni altera datos existentes: los reclamos/NC ya
--   creados quedan con es_interno = false (comportamiento actual intacto).
-- =============================================================================
