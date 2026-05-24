// ========== ESTADO GLOBAL ==========

export const DB = {
  rrhh: ['Jimena', 'Naara', 'Gabi'],
  supervisores: ['Alvaro Uballes', 'Alejandro Cacciato', 'Claudia Cazenave', 'Claudio Gonzalez', 'Fabio Benvenuto', 'Matias Maidana', 'Marcelo Moure', 'Santiago Ayala', 'Richard Recalde', 'Alfredo Arispe', 'Lorena Unzain', 'Dario Lage'],
  servicios: ['HOSPITAL.CAMPANA', 'GYM.RECOLETA', 'HIT.LIBERTADOR.CEL', 'HIT.LIBERTADOR.8614', 'HACOAJ.TIGRE', 'LOS.PINOS', 'CENARD', 'ANAC', 'NEWSAN.CAMPANA', 'SULFOQUIMICA', 'COTO.GARIN', 'MIGUELETES.2423', 'TEKNOPOLIS', 'RETEN.GENERAL', 'ADMINISTRATIVO'],
  zonas: ['CABA', 'Buenos Aires'],
  medios: ['WhatsApp', 'Formulario web', 'Referido', 'Instagram', 'Búsqueda activa'],
  categorias: ['Operario A', 'Operario B', 'Referente', 'Encargado A', 'Encargado B', 'Encargado C', 'Retén', 'Supervisor', 'Auxiliar administrativo', 'Coordinador de área'],
  localidades: ['Floresta', 'Villa del Parque', 'Barracas', 'Retiro', 'Villa Soldati', 'Palermo', 'Belgrano', 'Caballito', 'San Telmo', 'Montserrat', 'San Justo', 'Isidro Casanova', 'Laferrere', 'Quilmes', 'Avellaneda', 'Lanús', 'Lomas de Zamora', 'Berazategui', 'San Martín', 'Caseros', 'Tres de Febrero', 'José C. Paz', 'Tigre', 'San Fernando', 'Pilar', 'Campana', 'Grand Bourg'],
  movimientos: ['Nuevo ingreso', 'Reubicación interna', 'Reingreso', 'Cambio de servicio', 'Cambio de categoría'],
  estadosLegales: ['Carta documento recibida', 'Carta documento contestada', 'Conciliación SECLO', 'Conciliación interna', 'Estado judicial', 'Cerrado', 'Pre-legal'],
  tiposLegales: ['Despido indirecto', 'Accidente de trabajo', 'Enfermedad profesional', 'Discriminación', 'Incumplimiento contractual'],
  abogados: ['Dr. Martínez Carlos — Estudio Martínez & Asoc.', 'Dr. García Luis — Estudio García'],
  tiposMedicos: ['Enfermedad inculpable', 'Accidente laboral', 'Accidente in itinere', 'Enfermedad profesional', 'Cirugía programada', 'Otro'],
  estadosMedicos: ['Activo — sin trabajar', 'En tratamiento', 'Reposo domiciliario', 'Internado', 'Alta médica'],
  medicosCfg: ['Dr. López — Hospital Italiano', 'Dra. Pérez — Centro Médico Norte'],
  smvm: [
    { periodo: '2024-01', valor: 156000, resolucion: 'Res. 1/2024', vigente: false },
    { periodo: '2024-07', valor: 234315, resolucion: 'Res. 7/2024', vigente: false },
    { periodo: '2025-01', valor: 294000, resolucion: 'Res. 1/2025', vigente: true },
  ],
  candidatos: [],
  turnos: [],
  pedidos: [
    { id: 1, fecha: '09/10/2023', supervisor: 'Claudia Cazenave', servicio: 'HOSPITAL.CAMPANA', zona: 'Buenos Aires', puesto: 'Operario', horario: '22hs a 06hs nocturno 6×1', urgencia: 'Alto', estado: 'Cubierto', candidato: 'Lima Romina', obs: '' },
    { id: 2, fecha: '27/11/2023', supervisor: 'Alvaro Uballes', servicio: 'HIT.LIBERTADOR.CEL', zona: 'CABA', puesto: 'Retén', horario: 'Rotativos full time 6×1', urgencia: 'Medio', estado: 'Pendiente', candidato: '', obs: '' },
    { id: 3, fecha: '02/04/2026', supervisor: 'Alejandro Cacciato', servicio: 'SULFOQUIMICA', zona: 'Buenos Aires', puesto: 'Operario', horario: 'L-V 14/22hs', urgencia: 'Alto', estado: 'Pendiente', candidato: '', obs: '' },
  ],
  psicos: [
    { id: 1, nombre: 'Bobadilla Ruiz Laura', dni: '96048133', zona: 'CABA', rrhh: 'Naara', resultado: 'Apto', preocup: 'Realizado', estado: 'Ingreso', fecha: '05/10/2025', obs: '' },
    { id: 2, nombre: 'Ramirez Gabriel Jonathan', dni: '45397397', zona: 'CABA', rrhh: 'Naara', resultado: 'No apto', preocup: 'No realizó', estado: 'Baja', fecha: '03/10/2025', obs: '' },
    { id: 3, nombre: 'Jara Fabricio', dni: '52113159', zona: 'CABA', rrhh: 'Naara', resultado: 'Apto', preocup: 'Realizado', estado: 'Ingreso', fecha: '05/10/2025', obs: '' },
  ],
  preocupacionales: [],
  legajos: [
    { nro: 2, nombre: 'Peretti Juan Carlos', dni: '6263572', funcion: 'Coordinador de área', servicio: 'ADMINISTRATIVO', supervisor: 'ADMINISTRATIVO', ingreso: '01/02/2011', estado: 'Activo', estadoLegal: '', estadoMedico: '', fechaBaja: '', fechaReincorp: '', seguro: 'Completo', localidad: 'Belgrano', tel: '1131543167', mail: 'juanperetti_46@hotmail.com', cuit: '20062635720', estadoCivil: 'Casado', nac: 'Argentina', banco: 'Banco Nación', calzado: 43, ambo: 'XL', periodoPrueba: 6, fechaIngresoPrueba: '2011-02-01', adjuntosLegal: [], adjuntosMedico: [] },
    { nro: 32, nombre: 'Tolaba Maximiliano Ezequiel', dni: '32343528', funcion: 'Referente', servicio: 'MIGUELETES.2423', supervisor: 'Alvaro Uballes', ingreso: '15/03/2018', estado: 'Activo', estadoLegal: '', estadoMedico: '', fechaBaja: '', fechaReincorp: '', seguro: 'Completo', localidad: 'Lomas de Zamora', tel: '', mail: '', cuit: '20323435287', estadoCivil: 'Soltero', nac: 'Argentina', banco: '', calzado: 41, ambo: 'M', periodoPrueba: 6, fechaIngresoPrueba: '2018-03-15', adjuntosLegal: [], adjuntosMedico: [] },
    { nro: 43, nombre: 'Arispe Alfredo Julian', dni: '18348699', funcion: 'Supervisor', servicio: 'ADMINISTRATIVO', supervisor: 'ADMINISTRATIVO', ingreso: '11/03/2011', estado: 'Activo', estadoLegal: '', estadoMedico: '', fechaBaja: '', fechaReincorp: '', seguro: 'Completo', localidad: 'Pompeya', tel: '1122751445', mail: 'alfredoarispe@hotmail.com', cuit: '20183486994', estadoCivil: 'Soltero', nac: 'Argentina', banco: '', calzado: 42, ambo: 'L', periodoPrueba: 6, fechaIngresoPrueba: '2011-03-11', adjuntosLegal: [], adjuntosMedico: [] },
    { nro: 46, nombre: 'Camacho Solis Katherine', dni: '93991411', funcion: 'Operario', servicio: 'CIBRA', supervisor: 'Alejandro Cacciato', ingreso: '25/04/2014', estado: 'Activo', estadoLegal: 'Carta documento recibida', estadoMedico: '', fechaBaja: '', fechaReincorp: '', seguro: 'Pendiente', localidad: 'Tigre', tel: '1150581888', mail: '', cuit: '27939914116', estadoCivil: 'Soltera', nac: 'Peruana', banco: '', calzado: 38, ambo: 'S', periodoPrueba: 6, fechaIngresoPrueba: '2014-04-25', adjuntosLegal: ['carta_doc_1.pdf'], adjuntosMedico: [] },
    { nro: 71, nombre: 'Gomez Diego Alejandro', dni: '26148208', funcion: 'Retén', servicio: 'RETEN.GENERAL', supervisor: 'Santiago Ayala', ingreso: '27/05/2022', estado: 'Activo', estadoLegal: '', estadoMedico: 'Activo — sin trabajar', fechaBaja: '', fechaReincorp: '', seguro: 'Completo', localidad: 'Tres de Febrero', tel: '1156072183', mail: '', cuit: '20261482089', estadoCivil: 'Casado', nac: 'Argentina', banco: '', calzado: 43, ambo: 'L', periodoPrueba: 6, fechaIngresoPrueba: '2022-05-27', adjuntosLegal: [], adjuntosMedico: ['certif_medico.pdf'] },
    { nro: 22, nombre: 'Godoy Alicia Alejandra', dni: '25189767', funcion: 'Operario', servicio: '—', supervisor: '—', ingreso: '28/08/2015', estado: 'Baja', estadoLegal: 'Estado judicial', estadoMedico: '', fechaBaja: '15/03/2024', fechaReincorp: '', seguro: '—', localidad: 'Avellaneda', tel: '', mail: '', cuit: '', estadoCivil: '', nac: '', banco: '', calzado: 38, ambo: 'S', periodoPrueba: 6, fechaIngresoPrueba: '2015-08-28', adjuntosLegal: ['carta_doc_1.pdf', 'escrito_judicial.pdf'], adjuntosMedico: [] },
    { nro: 97, nombre: 'Sanchez Ocas Segundo', dni: '94243288', funcion: 'Operario', servicio: 'LOS.PINOS', supervisor: 'Alvaro Uballes', ingreso: '12/02/2016', estado: 'Activo', estadoLegal: '', estadoMedico: '', fechaBaja: '05/06/2018', fechaReincorp: '14/01/2020', seguro: 'Completo', localidad: 'CABA', tel: '', mail: '', cuit: '20942432888', estadoCivil: '', nac: '', banco: '', calzado: 42, ambo: 'L', periodoPrueba: 6, fechaIngresoPrueba: '2020-01-14', adjuntosLegal: [], adjuntosMedico: [] },
  ],
  casosLegales: [
    { id: 1, asociado: 'Godoy Alicia Alejandra', nroSocio: 22, estado: 'Estado judicial', abogado: 'Dr. Martínez Carlos', estudio: 'Estudio Martínez & Asoc.', supervisor: 'Matias Maidana', servicio: 'COTO.SARANDI', fechaInicio: '15/01/2024', ultimaNovedad: '10/03/2024', adjuntos: ['carta_doc_1.pdf', 'escrito_judicial.pdf'] },
    { id: 2, asociado: 'Camacho Solis Katherine', nroSocio: 46, estado: 'Carta documento recibida', abogado: 'Dr. García Luis', estudio: 'Estudio García', supervisor: 'Alejandro Cacciato', servicio: 'CIBRA', fechaInicio: '20/03/2026', ultimaNovedad: '01/04/2026', adjuntos: ['carta_doc_1.pdf'] },
  ],
  enfermos: [
    { id: 1, asociado: 'Rodriguez Maria Elena', nroSocio: 155, tipo: 'Enfermedad inculpable', fechaHecho: '15/02/2026', dias: 45, ultimoContacto: '28/03/2026', certif: 'Presentado', estado: 'Activo — sin trabajar', habilitado: 'No — en reposo médico', adjuntos: ['certif_medico.pdf', 'orden_medica.pdf'] },
    { id: 2, asociado: 'Gomez Diego Alejandro', nroSocio: 71, tipo: 'Accidente laboral', fechaHecho: '01/03/2026', dias: 32, ultimoContacto: '30/03/2026', certif: 'Presentado', estado: 'En tratamiento', habilitado: 'No — en reposo médico', adjuntos: ['certif_medico.pdf'] },
    { id: 3, asociado: 'Torres Ana Beatriz', nroSocio: 98, tipo: 'Accidente in itinere', fechaHecho: '10/01/2026', dias: 82, ultimoContacto: '02/04/2026', certif: 'Presentado', estado: 'En tratamiento', habilitado: 'No — en reposo médico', adjuntos: ['certif_medico.pdf', 'estudio_rx.pdf', 'kine_informe.pdf'] },
  ],
  sugerencias: [],
  usuarios: [
    { id: 1, nombre: 'Juan Peretti', email: 'admin@ohlimpia.coop', pass: 'admin123', perfil: 'Administrador total', funcion: 'Presidente', activo: true, nickname: 'Admin' },
    { id: 2, nombre: 'Jimena Rrhh', email: 'rrhh@ohlimpia.coop', pass: 'rrhh2024', perfil: 'RRHH', funcion: 'Coordinador/a', activo: true, nickname: 'Jimena' },
    { id: 3, nombre: 'Operaciones User', email: 'operaciones@ohlimpia.coop', pass: 'ops2024', perfil: 'Operaciones', funcion: 'Coordinador/a', activo: true, nickname: 'Operaciones' },
    { id: 4, nombre: 'Finanzas User', email: 'finanzas@ohlimpia.coop', pass: 'fin2024', perfil: 'Finanzas', funcion: 'Tesorero/a', activo: true, nickname: 'Finanzas' },
    { id: 5, nombre: 'Supervisor Demo', email: 'supervisor@ohlimpia.coop', pass: 'sup2024', perfil: 'Supervisor', funcion: 'Supervisor/a', activo: true, nickname: 'Supervisor' },
  ],
};

// ========== PERFILES Y ACCESOS ==========

export const PERFILES = {
  'Administrador total': { color: 'badge-rojo', modulos: ['candidatos', 'pedidos', 'psicotecnico', 'preocupacional', 'altas', 'legajos', 'reasignaciones', 'legal', 'enfermos', 'capacitaciones', 'vacaciones', 'competencia', 'clientes', 'objetivos', 'precios', 'paritarias', 'crm', 'reclamos', 'cobros', 'liquidacion', 'feriados', 'liq_admin', 'liquidaciones', 'retenes', 'mantenimiento', 'configuracion', 'smvm', 'monotributos', 'uniformes', 'retenciones', 'sanciones', 'adelantos', 'pedidos_adelantos', 'gestion_adelantos', 'sugerencias'], desc: 'Acceso completo.' },
  'RRHH': { color: 'badge-azul', modulos: ['candidatos', 'psicotecnico', 'preocupacional', 'altas', 'legajos', 'reasignaciones', 'capacitaciones', 'vacaciones', 'competencia', 'reclamos', 'paritarias', 'liquidacion', 'liq_admin', 'liquidaciones', 'retenes', 'monotributos', 'uniformes', 'retenciones', 'sanciones', 'adelantos', 'pedidos_adelantos', 'gestion_adelantos', 'sugerencias'], desc: 'RRHH, legajos, capacitaciones.' },
  'Operaciones': { color: 'badge-verde', modulos: ['pedidos', 'legajos', 'reasignaciones', 'capacitaciones', 'vacaciones', 'competencia', 'clientes', 'objetivos', 'precios', 'paritarias', 'crm', 'reclamos', 'cobros', 'liquidacion', 'retenes', 'mantenimiento', 'feriados', 'uniformes', 'sanciones', 'pedidos_adelantos', 'sugerencias'], desc: 'Operaciones y ventas.' },
  'Finanzas': { color: 'badge-acento', modulos: ['legajos', 'smvm', 'cobros', 'paritarias', 'liquidacion', 'liq_admin', 'liquidaciones', 'retenes', 'mantenimiento', 'monotributos', 'retenciones', 'adelantos', 'gestion_adelantos', 'sugerencias'], desc: 'Finanzas y liquidación.' },
  'Supervisor': { color: 'badge-gris', modulos: ['pedidos', 'legajos', 'competencia', 'liquidacion', 'liquidaciones', 'adelantos', 'pedidos_adelantos', 'sugerencias'], desc: 'Pedidos, legajos, competencia y liquidación de horas.' },
  'Ventas': { color: 'badge-naranja', modulos: ['clientes', 'objetivos', 'crm', 'reclamos', 'sugerencias'], desc: 'Clientes, objetivos, CRM y reclamos.' },
  'Logística': { color: 'badge-gris', modulos: ['legajos', 'sugerencias'], desc: 'Consulta de legajos.' },
  'Asociado': { color: 'badge-verde', modulos: ['mis_adelantos'], desc: 'Portal del asociado — pedidos de adelanto y préstamo.' },
};

// ========== MENÚ ==========

export const MENU = [
  { section: '', items: [
    { key: 'inicio', icon: '🏠', label: 'Inicio', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas', 'Supervisor', 'Ventas', 'Logística'] },
  ]},
  { section: 'Selección', items: [
    { key: 'candidatos', icon: '👥', label: 'Candidatos', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'pedidos', icon: '📋', label: 'Pedidos de personal', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Supervisor'] },
    { key: 'psicotecnico', icon: '🧠', label: 'Psicotécnico', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'preocupacional', icon: '🏥', label: 'Pre-ocupacional', perfiles: ['Administrador total', 'RRHH'] },
  ]},
  { section: 'Ingreso', items: [
    { key: 'altas', icon: '✅', label: 'Altas de asociados', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'legajos', icon: '📁', label: 'Legajos', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas', 'Supervisor', 'Ventas', 'Logística'] },
    { key: 'reasignaciones', icon: '🔄', label: 'Reasignaciones', badge: 'reas', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
    { key: 'monotributos', icon: '💸', label: 'Monotributos', perfiles: ['Administrador total', 'RRHH', 'Finanzas'] },
    { key: 'uniformes', icon: '👕', label: 'Uniformes', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
    { key: 'retenciones', icon: '🔒', label: 'Retenciones', perfiles: ['Administrador total', 'RRHH', 'Finanzas'] },
  ]},
  { section: 'Operaciones', items: [
    { key: 'liquidacion', icon: '📋', label: 'Liquidación de horas', badge: 'liqh', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas', 'Supervisor'] },
    { key: 'liq_admin', icon: '🏢', label: 'Liquidación Administración', badge: 'liqadm', perfiles: ['Administrador total', 'RRHH', 'Finanzas'] },
    { key: 'retenes', icon: '🔄', label: 'Retenes', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas'] },
    { key: 'mantenimiento', icon: '🔧', label: 'Mantenimiento', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas'] },
    { key: 'sanciones', icon: '⚠️', label: 'Sanciones', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
    { key: 'pedidos_adelantos', icon: '💵', label: 'Pedidos de adelantos', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Supervisor'] },
    { key: 'feriados', icon: '📅', label: 'Feriados', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
  ]},
  { section: 'Ventas', items: [
    { key: 'clientes', icon: '🏢', label: 'Clientes', perfiles: ['Administrador total', 'Operaciones', 'Ventas'] },
    { key: 'objetivos', icon: '📍', label: 'Objetivos / Servicios', perfiles: ['Administrador total', 'Operaciones', 'Ventas'] },
    { key: 'precios', icon: '💲', label: 'Gestión de precios', badge: 'prec', perfiles: ['Administrador total', 'Operaciones', 'Ventas'] },
    { key: 'crm', icon: '📊', label: 'CRM Comercial', badge: 'crm', perfiles: ['Administrador total', 'Operaciones', 'Ventas'] },
    { key: 'reclamos', icon: '📣', label: 'Reclamos y NC', badge: 'rec', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Ventas'] },
    { key: 'cobros', icon: '💳', label: 'Gestión de cobros', perfiles: ['Administrador total', 'Finanzas', 'Operaciones'] },
  ]},
  { section: 'Seguimiento', items: [
    { key: 'legal', icon: '⚖️', label: 'Situaciones legales', badge: 'legal', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'enfermos', icon: '🏥', label: 'Enfermos y accidentes', badge: 'enf', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
  ]},
  { section: 'Administración', items: [
    { key: 'paritarias', icon: '📜', label: 'Paritarias', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas'] },
    { key: 'configuracion', icon: '⚙️', label: 'Configuración', perfiles: ['Administrador total'] },
    { key: 'smvm', icon: '💵', label: 'SMVM histórico', perfiles: ['Administrador total', 'Finanzas'] },
  ]},
  { section: 'Personal', items: [
    { key: 'capacitaciones', icon: '🎓', label: 'Capacitaciones', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
    { key: 'vacaciones', icon: '🏖️', label: 'Vacaciones y descanso', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
    { key: 'competencia', icon: '🏆', label: 'Competencia anual', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
  ]},
  { section: 'Finanzas', items: [
    { key: 'liquidaciones', icon: '💰', label: 'Liquidaciones', perfiles: ['Administrador total', 'RRHH', 'Finanzas', 'Supervisor'] },
    { key: 'gestion_adelantos', icon: '🏦', label: 'Gestión de adelantos', perfiles: ['Administrador total', 'Finanzas', 'RRHH'] },
  ]},
  { section: '', items: [
    { key: 'sugerencias', icon: '💬', label: 'Reportes y sugerencias', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas', 'Supervisor', 'Ventas', 'Logística'] },
  ]},
  { section: 'Próximamente', items: [
    { key: 'stock', icon: '📦', label: 'Stock', disabled: true, perfiles: [] },
    { key: 'maquinas', icon: '🔧', label: 'Máquinas', disabled: true, perfiles: [] },
  ]},
];

// ========== MÓDULOS DEL SISTEMA — TABLA MATRICIAL DE PERMISOS ==========
// Lista de módulos sobre los que la tabla de "Accesos y perfiles"
// asigna permisos (0=sin acceso, 1=lectura, 2=modificar). Es un subset
// histórico de módulos clave, no todos los del MENU.
export const MODULOS_SISTEMA = [
  { key: 'candidatos',     label: 'Candidatos',    icon: '👥' },
  { key: 'pedidos',        label: 'Pedidos',       icon: '📋' },
  { key: 'psicotecnico',   label: 'Psicotécnico',  icon: '🧠' },
  { key: 'altas',          label: 'Altas',         icon: '✅' },
  { key: 'legajos',        label: 'Legajos',       icon: '📁' },
  { key: 'reasignaciones', label: 'Reasignac.',    icon: '🔄' },
  { key: 'legal',          label: 'Legal',         icon: '⚖️' },
  { key: 'enfermos',       label: 'Enfermos',      icon: '🏥' },
  { key: 'capacitaciones', label: 'Capacit.',      icon: '🎓' },
  { key: 'vacaciones',     label: 'Vacaciones',    icon: '🏖️' },
  { key: 'competencia',    label: 'Competencia',   icon: '🏆' },
  { key: 'configuracion',  label: 'Config.',       icon: '⚙️' },
  { key: 'smvm',           label: 'SMVM',          icon: '💵' },
  { key: 'liquidacion',    label: 'Liquidación',   icon: '📊' },
  { key: 'liq_admin',      label: 'Liq. Admin',    icon: '🏢' },
  { key: 'liquidaciones',  label: 'Liquidaciones', icon: '💰' },
];

// ========== BADGE MAP ==========

export const BADGE_MAP = {
  'Sin citar': 'badge-gris', 'Citado': 'badge-acento', 'Confirmado': 'badge-verde', 'No asistió': 'badge-rojo', 'En proceso': 'badge-azul', 'Descartado': 'badge-rojo',
  'Cubierto': 'badge-verde', 'Pendiente': 'badge-acento', 'En búsqueda': 'badge-azul', 'Cancelado': 'badge-rojo', 'Pausado': 'badge-gris',
  'Apto': 'badge-verde', 'No apto': 'badge-rojo', 'Apto condicional': 'badge-naranja', 'Ingreso': 'badge-verde', 'Baja': 'badge-rojo',
  'Alto': 'badge-rojo', 'Medio': 'badge-acento', 'Bajo': 'badge-verde', 'Activo': 'badge-verde', 'Completo': 'badge-verde',
  'Carta documento recibida': 'badge-naranja', 'Carta documento contestada': 'badge-acento', 'Conciliación SECLO': 'badge-rojo',
  'Conciliación interna': 'badge-naranja', 'Estado judicial': 'badge-rojo', 'Cerrado': 'badge-gris',
  'Activo — sin trabajar': 'badge-rojo', 'En tratamiento': 'badge-naranja', 'Alta médica': 'badge-verde',
  'No — en reposo médico': 'badge-rojo', 'Sí — alta médica confirmada': 'badge-verde',
};

// ========== ÁREAS DE PERSONAL ==========

export const AREAS = {
  rrhh: [
    { nombre: 'Jimena Rrhh', nickname: 'Jime', funcion: 'Auxiliar administrativo', nroSocio: 2, puedeModificar: true },
    { nombre: 'Naara Admin', nickname: 'Naara', funcion: 'Auxiliar administrativo', nroSocio: 2, puedeModificar: false },
  ],
  operaciones: [],
  finanzas: [],
  logistica: [],
  comercial: [],
};

// ========== LOCALIDADES BUENOS AIRES ==========

export const LOCALIDADES_BA = [
  'Almirante Brown', 'Avellaneda', 'Berazategui', 'Berisso', 'Brandsen', 'Campana', 'Cañuelas',
  'Ensenada', 'Escobar', 'Esteban Echeverría', 'Exaltación de la Cruz', 'Ezeiza', 'Florencio Varela',
  'General Las Heras', 'General Rodríguez', 'General San Martín', 'Hurlingham', 'Ituzaingó',
  'José C. Paz', 'La Matanza', 'La Plata', 'Lanús', 'Lomas de Zamora', 'Luján', 'Marcos Paz',
  'Malvinas Argentinas', 'Mercedes', 'Merlo', 'Moreno', 'Morón', 'Pilar', 'Presidente Perón',
  'Quilmes', 'San Fernando', 'San Isidro', 'San Miguel', 'San Vicente', 'Tigre',
  'Tres de Febrero', 'Vicente López', 'Zárate',
];

// ========== USUARIO ACTUAL ==========

export let currentUser = null;

export function setCurrentUser(user) {
  currentUser = user;
}
