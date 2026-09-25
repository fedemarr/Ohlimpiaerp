-- v167: tickets #193 y #194 — "las listas parametrizables de Configuración
-- desaparecen cuando doy refresh".
--
-- DIAGNÓSTICO
--   Todos los catálogos editables desde Configuración (agregarItem /
--   eliminarItem para zonas, medios, categorías, movimientos, estados/tipos
--   legales, abogados, tipos/estados médicos, médicos, disponibilidades
--   horarias, funciones de usuario; agregarCfgComercial / eliminarCfgComercial
--   para tiposCliente, tiposServicio, tiposSitio, categoríasArca,
--   motivosBajaObjetivo, condicionesIVA, condicionesPago, formasPago,
--   modelosPrecio, periodosFacturacion, rolesResponsables, tiposAccionCRM,
--   motivosPerdidaCRM, tiposReclamo; y etapas CRM con su color) vivían
--   SOLO en memoria: los pushes a DB[...] no llamaban supaSync(), así que
--   al recargar la página la lista volvía al array hardcodeado de
--   state.js / legacy.js y lo agregado se perdía. El toast de "✓ agregado"
--   se mostraba igual — de ahí que el síntoma pareciera un problema de RLS
--   o de refresh, cuando en realidad nunca se escribía nada.
--
-- DECISIÓN
--   Una sola tabla `config_listas` (clave + valor + orden + color + soft
--   delete) en vez de 28 tablas: es el mismo criterio que ya usan
--   motivos_reasignacion / aprobadores_reasignacion (v021) para las listas
--   de configuración de Reasignaciones, extendido a todos los catálogos de
--   Configuración. `clave` es la key de DB (`zonas`, `tiposCliente`,
--   `etapasCRM`...), `valor` el string que ve el usuario.
--
--   Soft delete (anulado) en vez de DELETE físico: si mañana se agrega una
--   columna a una de estas tablas y hay que referenciar el valor (ej. un
--   legajo guardado con la zona "Zona Sur"), el histórico sigue siendo
--   trazable. El UNIQUE es parcial (solo no anulados) para poder re-agregar
--   un valor que se había eliminado.
--
--   `color` existe solo porque las etapas del CRM se pintan con un color
--   configurable; en el resto de las listas queda NULL.
--
-- SEMILLA
--   Se siembran los valores que ya usaba el sistema (los mismos arrays de
--   state.js y legacy.js, copiados textualmente) para que un base nueva o
--   un ambiente donde la tabla se acaba de crear muestre exactamente lo
--   mismo que antes, sin ventana de "listas vacías". ON CONFLICT DO NOTHING
--   hace la migración idempotente y no pisa lo que alguien ya haya
--   configurado.
BEGIN;

CREATE TABLE IF NOT EXISTS public.config_listas (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_local    text UNIQUE NOT NULL,
  clave       text NOT NULL,
  valor       text NOT NULL,
  color       text,
  orden       integer NOT NULL DEFAULT 0,
  anulado     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_config_listas_clave_valor
  ON public.config_listas (clave, valor) WHERE NOT anulado;

CREATE INDEX IF NOT EXISTS ix_config_listas_clave
  ON public.config_listas (clave) WHERE NOT anulado;

-- ---------------------------------------------------------------------------
-- Semilla — valores vigentes al 25/09/2026
-- ---------------------------------------------------------------------------
INSERT INTO public.config_listas (id_local, clave, valor, color, orden) VALUES
  -- Personal / RRHH
  ('cfg_zonas_01','zonas','CABA',NULL,1),
  ('cfg_zonas_02','zonas','Zona Norte',NULL,2),
  ('cfg_zonas_03','zonas','Zona Sur',NULL,3),
  ('cfg_zonas_04','zonas','Zona Oeste',NULL,4),
  ('cfg_medios_01','medios','WhatsApp',NULL,1),
  ('cfg_medios_02','medios','Formulario web',NULL,2),
  ('cfg_medios_03','medios','Referido',NULL,3),
  ('cfg_medios_04','medios','Redes sociales',NULL,4),
  ('cfg_medios_05','medios','Búsqueda activa',NULL,5),
  ('cfg_medios_06','medios','Bolsa de trabajo',NULL,6),
  ('cfg_medios_07','medios','Otros',NULL,7),
  ('cfg_categorias_01','categorias','Operario A',NULL,1),
  ('cfg_categorias_02','categorias','Operario B',NULL,2),
  ('cfg_categorias_03','categorias','Referente',NULL,3),
  ('cfg_categorias_04','categorias','Encargado A',NULL,4),
  ('cfg_categorias_05','categorias','Encargado B',NULL,5),
  ('cfg_categorias_06','categorias','Encargado C',NULL,6),
  ('cfg_categorias_07','categorias','Retén',NULL,7),
  ('cfg_categorias_08','categorias','Supervisor',NULL,8),
  ('cfg_categorias_09','categorias','Auxiliar administrativo',NULL,9),
  ('cfg_categorias_10','categorias','Coordinador de área',NULL,10),
  ('cfg_disp_01','disponibilidadesHorarias','Full time',NULL,1),
  ('cfg_disp_02','disponibilidadesHorarias','Part time',NULL,2),
  ('cfg_disp_03','disponibilidadesHorarias','Turno mañana',NULL,3),
  ('cfg_disp_04','disponibilidadesHorarias','Turno tarde',NULL,4),
  ('cfg_disp_05','disponibilidadesHorarias','Turno noche',NULL,5),
  ('cfg_disp_06','disponibilidadesHorarias','Fines de semana',NULL,6),
  ('cfg_mov_01','movimientos','Nuevo ingreso',NULL,1),
  ('cfg_mov_02','movimientos','Reubicación interna',NULL,2),
  ('cfg_mov_03','movimientos','Reingreso',NULL,3),
  ('cfg_mov_04','movimientos','Cambio de servicio',NULL,4),
  ('cfg_mov_05','movimientos','Cambio de categoría',NULL,5),
  ('cfg_func_01','funcionesUsuario','Auxiliar',NULL,1),
  ('cfg_func_02','funcionesUsuario','Subcoordinador/a',NULL,2),
  ('cfg_func_03','funcionesUsuario','Coordinador/a',NULL,3),
  ('cfg_func_04','funcionesUsuario','Gerente',NULL,4),
  ('cfg_func_05','funcionesUsuario','Gerente General',NULL,5),
  ('cfg_func_06','funcionesUsuario','Tesorero/a',NULL,6),
  ('cfg_func_07','funcionesUsuario','Secretario/a',NULL,7),
  ('cfg_func_08','funcionesUsuario','Presidente',NULL,8),
  ('cfg_func_09','funcionesUsuario','Supervisor/a',NULL,9),
  -- Legal
  ('cfg_estlegal_01','estadosLegales','Carta documento recibida',NULL,1),
  ('cfg_estlegal_02','estadosLegales','Carta documento contestada',NULL,2),
  ('cfg_estlegal_03','estadosLegales','Conciliación SECLO',NULL,3),
  ('cfg_estlegal_04','estadosLegales','Conciliación interna',NULL,4),
  ('cfg_estlegal_05','estadosLegales','Estado judicial',NULL,5),
  ('cfg_estlegal_06','estadosLegales','Cerrado',NULL,6),
  ('cfg_estlegal_07','estadosLegales','Pre-legal',NULL,7),
  ('cfg_tipolegal_01','tiposLegales','Despido indirecto',NULL,1),
  ('cfg_tipolegal_02','tiposLegales','Accidente de trabajo',NULL,2),
  ('cfg_tipolegal_03','tiposLegales','Enfermedad profesional',NULL,3),
  ('cfg_tipolegal_04','tiposLegales','Discriminación',NULL,4),
  ('cfg_tipolegal_05','tiposLegales','Incumplimiento contractual',NULL,5),
  ('cfg_abog_01','abogados','Dr. Martínez Carlos — Estudio Martínez & Asoc.',NULL,1),
  ('cfg_abog_02','abogados','Dr. García Luis — Estudio García',NULL,2),
  -- Tantos eagerly
  ('cfg_tipomed_01','tiposMedicos','Enfermedad inculpable',NULL,1),
  ('cfg_tipomed_02','tiposMedicos','Accidente laboral',NULL,2),
  ('cfg_tipomed_03','tiposMedicos','Accidente in itinere',NULL,3),
  ('cfg_tipomed_04','tiposMedicos','Enfermedad profesional',NULL,4),
  ('cfg_tipomed_05','tiposMedicos','Cirugía programada',NULL,5),
  ('cfg_tipomed_06','tiposMedicos','Otro',NULL,6),
  ('cfg_estmed_01','estadosMedicos','Activo — sin trabajar',NULL,1),
  ('cfg_estmed_02','estadosMedicos','En tratamiento',NULL,2),
  ('cfg_estmed_03','estadosMedicos','Reposo domiciliario',NULL,3),
  ('cfg_estmed_04','estadosMedicos','Internado',NULL,4),
  ('cfg_estmed_05','estadosMedicos','Alta médica',NULL,5),
  ('cfg_medcfg_01','medicosCfg','Dr. López — Hospital Italiano',NULL,1),
  ('cfg_medcfg_02','medicosCfg','Dra. Pérez — Centro Médico Norte',NULL,2),
  -- Comercial
  ('cfg_tipserv_01','tiposServicio','Limpieza',NULL,1),
  ('cfg_tipserv_02','tiposServicio','Mantenimiento',NULL,2),
  ('cfg_tipserv_03','tiposServicio','Final de obra',NULL,3),
  ('cfg_tipserv_04','tiposServicio','Evento',NULL,4),
  ('cfg_tipserv_05','tiposServicio','Obra',NULL,5),
  ('cfg_tipserv_06','tiposServicio','Otro',NULL,6),
  ('cfg_tipcli_01','tiposCliente','Cadena supermercados',NULL,1),
  ('cfg_tipcli_02','tiposCliente','Hospital',NULL,2),
  ('cfg_tipcli_03','tiposCliente','Corporativo',NULL,3),
  ('cfg_tipcli_04','tiposCliente','Gobierno',NULL,4),
  ('cfg_tipcli_05','tiposCliente','Educación',NULL,5),
  ('cfg_tipcli_06','tiposCliente','Otro',NULL,6),
  ('cfg_tipsitio_01','tiposSitio','Supermercado',NULL,1),
  ('cfg_tipsitio_02','tiposSitio','Centro logístico',NULL,2),
  ('cfg_tipsitio_03','tiposSitio','Oficina',NULL,3),
  ('cfg_tipsitio_04','tiposSitio','Hospital',NULL,4),
  ('cfg_tipsitio_05','tiposSitio','Consorcio',NULL,5),
  ('cfg_tipsitio_06','tiposSitio','Industria',NULL,6),
  ('cfg_tipsitio_07','tiposSitio','Otro',NULL,7),
  ('cfg_arca_01','categoriasArca','Gran contribuyente',NULL,1),
  ('cfg_arca_02','categoriasArca','MiPyME',NULL,2),
  ('cfg_arca_03','categoriasArca','Pequeño contribuyente',NULL,3),
  ('cfg_arca_04','categoriasArca','Otro',NULL,4),
  ('cfg_motbaja_01','motivosBajaObjetivo','Fin de contrato',NULL,1),
  ('cfg_motbaja_02','motivosBajaObjetivo','Impago del cliente',NULL,2),
  ('cfg_motbaja_03','motivosBajaObjetivo','Cliente cierra operación',NULL,3),
  ('cfg_motbaja_04','motivosBajaObjetivo','Cambio de proveedor',NULL,4),
  ('cfg_motbaja_05','motivosBajaObjetivo','Rescisión por incumplimiento nuestro',NULL,5),
  ('cfg_motbaja_06','motivosBajaObjetivo','Otro',NULL,6),
  ('cfg_clausula_01','clausulasActualizacion','Paritarias',NULL,1),
  ('cfg_clausula_02','clausulasActualizacion','Inflación mensual (IPC)',NULL,2),
  ('cfg_clausula_03','clausulasActualizacion','Índice trimestral',NULL,3),
  ('cfg_clausula_04','clausulasActualizacion','Índice semestral',NULL,4),
  ('cfg_clausula_05','clausulasActualizacion','Libre negociación',NULL,5),
  ('cfg_clausula_06','clausulasActualizacion','Sin cláusula',NULL,6),
  ('cfg_iva_01','condicionesIVA','Responsable inscripto',NULL,1),
  ('cfg_iva_02','condicionesIVA','Monotributista',NULL,2),
  ('cfg_iva_03','condicionesIVA','Exento',NULL,3),
  ('cfg_iva_04','condicionesIVA','Consumidor final',NULL,4),
  ('cfg_iva_05','condicionesIVA','No responsable',NULL,5),
  ('cfg_condpago_01','condicionesPago','30 días',NULL,1),
  ('cfg_condpago_02','condicionesPago','45 días',NULL,2),
  ('cfg_condpago_03','condicionesPago','60 días',NULL,3),
  ('cfg_condpago_04','condicionesPago','90 días',NULL,4),
  ('cfg_condpago_05','condicionesPago','A 30/60 días',NULL,5),
  ('cfg_condpago_06','condicionesPago','Contado',NULL,6),
  ('cfg_condpago_07','condicionesPago','15 días',NULL,7),
  ('cfg_condpago_08','condicionesPago','A 30/60/90 días',NULL,8),
  ('cfg_formapago_01','formasPago','Transferencia',NULL,1),
  ('cfg_formapago_02','formasPago','Cheque físico',NULL,2),
  ('cfg_formapago_03','formasPago','E-cheq',NULL,3),
  ('cfg_formapago_04','formasPago','Transferencia programada',NULL,4),
  ('cfg_formapago_05','formasPago','Efectivo',NULL,5),
  ('cfg_modelo_01','modelosPrecio','Abono mensual fijo',NULL,1),
  ('cfg_modelo_02','modelosPrecio','Por EFT',NULL,2),
  ('cfg_modelo_03','modelosPrecio','Por horas variables',NULL,3),
  ('cfg_perfact_01','periodosFacturacion','Del 1 al último del mes',NULL,1),
  ('cfg_perfact_02','periodosFacturacion','Del 21 al 20',NULL,2),
  ('cfg_perfact_03','periodosFacturacion','Del 26 al 25',NULL,3),
  ('cfg_perfact_04','periodosFacturacion','Del 16 al 15',NULL,4),
  ('cfg_perfact_05','periodosFacturacion','Otro',NULL,5),
  ('cfg_rolresp_01','rolesResponsables','Gerente general',NULL,1),
  ('cfg_rolresp_02','rolesResponsables','Gerente de operaciones',NULL,2),
  ('cfg_rolresp_03','rolesResponsables','Gerente de sucursal',NULL,3),
  ('cfg_rolresp_04','rolesResponsables','Jefe de seguridad',NULL,4),
  ('cfg_rolresp_05','rolesResponsables','Jefe de servicios',NULL,5),
  ('cfg_rolresp_06','rolesResponsables','Encargado',NULL,6),
  ('cfg_rolresp_07','rolesResponsables','Contacto de cobros',NULL,7),
  ('cfg_rolresp_08','rolesResponsables','Contacto de facturación',NULL,8),
  ('cfg_rolresp_09','rolesResponsables','Otro',NULL,9),
  ('cfg_tipreclamo_01','tiposReclamo','Calidad del servicio',NULL,1),
  ('cfg_tipreclamo_02','tiposReclamo','Falta de personal',NULL,2),
  ('cfg_tipreclamo_03','tiposReclamo','Falta de insumos',NULL,3),
  ('cfg_tipreclamo_04','tiposReclamo','Incidente de seguridad',NULL,4),
  ('cfg_tipreclamo_05','tiposReclamo','Comunicación',NULL,5),
  ('cfg_tipreclamo_06','tiposReclamo','Facturación',NULL,6),
  ('cfg_tipreclamo_07','tiposReclamo','Otro',NULL,7),
  -- CRM
  ('cfg_etapacrm_01','etapasCRM','Prospecto','#94a3b8',1),
  ('cfg_etapacrm_02','etapasCRM','Primer contacto','var(--azul)',2),
  ('cfg_etapacrm_03','etapasCRM','Propuesta enviada','#8b5cf6',3),
  ('cfg_etapacrm_04','etapasCRM','Negociación','var(--naranja)',4),
  ('cfg_etapacrm_05','etapasCRM','Contrato','var(--verde)',5),
  ('cfg_etapacrm_06','etapasCRM','Cerrado perdido','var(--rojo)',6),
  ('cfg_accioncrm_01','tiposAccionCRM','Llamada',NULL,1),
  ('cfg_accioncrm_02','tiposAccionCRM','Reunión',NULL,2),
  ('cfg_accioncrm_03','tiposAccionCRM','Email',NULL,3),
  ('cfg_accioncrm_04','tiposAccionCRM','Visita',NULL,4),
  ('cfg_accioncrm_05','tiposAccionCRM','Propuesta',NULL,5),
  ('cfg_accioncrm_06','tiposAccionCRM','Seguimiento',NULL,6),
  ('cfg_motperdida_01','motivosPerdidaCRM','Precio',NULL,1),
  ('cfg_motperdida_02','motivosPerdidaCRM','Eligió competencia',NULL,2),
  ('cfg_motperdida_03','motivosPerdidaCRM','Sin personal disponible para cubrir',NULL,3),
  ('cfg_motperdida_04','motivosPerdidaCRM','No respondió',NULL,4),
  ('cfg_motperdida_05','motivosPerdidaCRM','Otro',NULL,5)
ON CONFLICT (clave, valor) WHERE NOT anulado DO NOTHING;

-- RLS: mismo tratamiento y mismo nombre de policy que el resto de las tablas
-- operativas ("Solo usuarios autenticados") — la app escribe con el usuario
-- autenticado, el anon key no debe poder leer ni modificar la configuración
-- de la empresa.
ALTER TABLE public.config_listas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'config_listas' AND policyname = 'Solo usuarios autenticados'
  ) THEN
    CREATE POLICY "Solo usuarios autenticados" ON public.config_listas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- Verificación:
--   select clave, count(*) from public.config_listas
--   where not anulado group by 1 order by 1;
--   -- debe devolver 28 claves, 162 filas.
--   select * from public.config_listas where clave = 'tiposCliente' order by orden;
