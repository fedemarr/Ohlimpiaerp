// v167 — Catálogo de listas parametrizables de Configuración.
//
// Fuente única de los valores por defecto de las 28 listas editables desde
// Configuración. Antes estos valores vivían duplicados: state.js para las
// de RRHH/legal y legacy.js para las de Comercial, y en los dos casos eran
// solo defaults en memoria — nada se persistía, así que al recargar la
// página lo agregado se perdía (tickets #193 y #194).
//
// Estos defaults NO son la fuente de verdad en runtime: después de cargar
// de Supabase manda `config_listas`. Sirven para (a) una base nueva sin la
// migración aplicada y (b) que el código que lee DB[clave] antes de que
// termine la carga no encuentre undefined.

export const CATALOGO_LISTAS = {
  // ---------- Personal / RRHH ----------
  zonas: ['CABA', 'Zona Norte', 'Zona Sur', 'Zona Oeste'],
  medios: ['WhatsApp', 'Formulario web', 'Referido', 'Redes sociales', 'Búsqueda activa', 'Bolsa de trabajo', 'Otros'],
  categorias: ['Operario A', 'Operario B', 'Referente', 'Encargado A', 'Encargado B', 'Encargado C', 'Retén', 'Supervisor', 'Auxiliar administrativo', 'Coordinador de área'],
  disponibilidadesHorarias: ['Full time', 'Part time', 'Turno mañana', 'Turno tarde', 'Turno noche', 'Fines de semana'],
  movimientos: ['Nuevo ingreso', 'Reubicación interna', 'Reingreso', 'Cambio de servicio', 'Cambio de categoría'],
  funcionesUsuario: ['Auxiliar', 'Subcoordinador/a', 'Coordinador/a', 'Gerente', 'Gerente General', 'Tesorero/a', 'Secretario/a', 'Presidente', 'Supervisor/a'],

  // ---------- Legal ----------
  estadosLegales: ['Carta documento recibida', 'Carta documento contestada', 'Conciliación SECLO', 'Conciliación interna', 'Estado judicial', 'Cerrado', 'Pre-legal'],
  tiposLegales: ['Despido indirecto', 'Accidente de trabajo', 'Enfermedad profesional', 'Discriminación', 'Incumplimiento contractual'],
  abogados: ['Dr. Martínez Carlos — Estudio Martínez & Asoc.', 'Dr. García Luis — Estudio García'],

  // ---------- Tantos eagerly ----------
  tiposMedicos: ['Enfermedad inculpable', 'Accidente laboral', 'Accidente in itinere', 'Enfermedad profesional', 'Cirugía programada', 'Otro'],
  estadosMedicos: ['Activo — sin trabajar', 'En tratamiento', 'Reposo domiciliario', 'Internado', 'Alta médica'],
  medicosCfg: ['Dr. López — Hospital Italiano', 'Dra. Pérez — Centro Médico Norte'],

  // ---------- Comercial ----------
  tiposServicio: ['Limpieza', 'Mantenimiento', 'Final de obra', 'Evento', 'Obra', 'Otro'],
  tiposCliente: ['Cadena supermercados', 'Hospital', 'Corporativo', 'Gobierno', 'Educación', 'Otro'],
  tiposSitio: ['Supermercado', 'Centro logístico', 'Oficina', 'Hospital', 'Consorcio', 'Industria', 'Otro'],
  categoriasArca: ['Gran contribuyente', 'MiPyME', 'Pequeño contribuyente', 'Otro'],
  motivosBajaObjetivo: ['Fin de contrato', 'Impago del cliente', 'Cliente cierra operación', 'Cambio de proveedor', 'Rescisión por incumplimiento nuestro', 'Otro'],
  clausulasActualizacion: ['Paritarias', 'Inflación mensual (IPC)', 'Índice trimestral', 'Índice semestral', 'Libre negociación', 'Sin cláusula'],
  condicionesIVA: ['Responsable inscripto', 'Monotributista', 'Exento', 'Consumidor final', 'No responsable'],
  condicionesPago: ['30 días', '45 días', '60 días', '90 días', 'A 30/60 días', 'Contado', '15 días', 'A 30/60/90 días'],
  formasPago: ['Transferencia', 'Cheque físico', 'E-cheq', 'Transferencia programada', 'Efectivo'],
  modelosPrecio: ['Abono mensual fijo', 'Por EFT', 'Por horas variables'],
  periodosFacturacion: ['Del 1 al último del mes', 'Del 21 al 20', 'Del 26 al 25', 'Del 16 al 15', 'Otro'],
  rolesResponsables: ['Gerente general', 'Gerente de operaciones', 'Gerente de sucursal', 'Jefe de seguridad', 'Jefe de servicios', 'Encargado', 'Contacto de cobros', 'Contacto de facturación', 'Otro'],
  tiposReclamo: ['Calidad del servicio', 'Falta de personal', 'Falta de insumos', 'Incidente de seguridad', 'Comunicación', 'Facturación', 'Otro'],

  // ---------- CRM ----------
  etapasCRM: ['Prospecto', 'Primer contacto', 'Propuesta enviada', 'Negociación', 'Contrato', 'Cerrado perdido'],
  tiposAccionCRM: ['Llamada', 'Reunión', 'Email', 'Visita', 'Propuesta', 'Seguimiento'],
  motivosPerdidaCRM: ['Precio', 'Eligió competencia', 'Sin personal disponible para cubrir', 'No respondió', 'Otro'],
};

// Colores por defecto de las etapas del CRM — el único catálogo que se
// pinta con un color configurable (DB.colorEtapasCRM). En el resto de las
// listas la columna `color` queda en NULL.
export const COLOR_ETAPAS_CRM = {
  'Prospecto': '#94a3b8',
  'Primer contacto': 'var(--azul)',
  'Propuesta enviada': '#8b5cf6',
  'Negociación': 'var(--naranja)',
  'Contrato': 'var(--verde)',
  'Cerrado perdido': 'var(--rojo)',
};
