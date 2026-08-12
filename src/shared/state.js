// ========== ESTADO GLOBAL ==========

export const DB = {
  rrhh: ['Jimena', 'Naara', 'Gabi'],
  // Catálogo de atributos del perfil solicitado en Pedidos de personal
  // (sql/v073). Se carga solo vía supaInit() — no hay ABM todavía.
  perfilPersonalAtributos: [],
  // Catálogo de motivos tipificados de Retenciones (sql/v076). Se carga
  // solo vía supaInit() — no hay ABM todavía (mismo estado que
  // perfilPersonalAtributos de arriba).
  motivosRetencion: [],
  // Catálogo de roles de contacto de cliente (sql/v077) — mismo estado
  // que los dos catálogos de arriba, seed-only por ahora.
  rolesContacto: [],
  // Catálogo de productos/elementos/máquinas del servicio (sql/v079) —
  // mismo estado que los catálogos de arriba, seed-only por ahora.
  itemsLogisticaServicio: [],
  // Módulo Supervisores (sql/v081, tema 7 del relevamiento) — catálogo
  // con % de comisión propio por supervisor, seed-only por ahora (mismo
  // estado que los catálogos de arriba).
  supervisoresConfig: [],
  // Código de servicio → supervisor, persistido en Supabase (sql/v067) —
  // se carga solo vía supaInit(). Ver src/modules/servicios_supervisor/
  // (pantalla en Configuración → Servicios) y
  // sincronizarServiciosSupervisor() (mantiene DB.servicios en sync para
  // los 9+ consumidores existentes de obtenerServiciosActivos()).
  serviciosSupervisor: [],
  // + Patricia Scaglia, Maximiliano Poncino, Sandra Luna (08/2026):
  // aparecen como supervisores asignados en la planilla "Selección y
  // Reubicaciones" (ver DB.serviciosSupervisor, sql/v067) y no estaban
  // en esta lista.
  supervisores: ['Alvaro Uballes', 'Alejandro Cacciato', 'Claudia Cazenave', 'Claudio Gonzalez', 'Fabio Benvenuto', 'Matias Maidana', 'Marcelo Moure', 'Santiago Ayala', 'Richard Recalde', 'Alfredo Arispe', 'Lorena Unzain', 'Dario Lage', 'Patricia Scaglia', 'Maximiliano Poncino', 'Sandra Luna'],
  // Deprecado (Clientes y Objetivos v1.1, v039) — no usar como fuente
  // directa. Usar window.obtenerServiciosActivos() (legacy.js), que
  // devuelve DB.objetivos.codigo (Operativos) + los códigos de esta lista
  // que todavía no tengan un objetivo creado (fallback, para no romper
  // legajos/datalists existentes mientras Comercial carga objetivos reales).
  //
  // Reemplazado (08/2026) por la planilla oficial "Selección y
  // Reubicaciones" de RRHH (Código + Supervisor asignado) — reemplaza a
  // la carga masiva del 05/08/2026 completa, a pedido explícito de Fede
  // ("elimines a todos y los reemplaces con esto"), no una fusión. Ver
  // la tabla servicios_supervisor (sql/v067, cargada en
  // DB.serviciosSupervisor) para el supervisor de cada código — esa pieza
  // nueva es la que faltaba para que Altas/Reasignaciones completen el
  // supervisor solos en vez de dejarlo en blanco para cualquier código
  // que no tuviera todavía un objetivo comercial.
  //
  // Códigos que SÍ estaban en la carga anterior y NO están en esta
  // planilla (CENARD, RETEN.GENERAL, ANAC, NEWSAN.CAMPANA, SULFOQUIMICA,
  // COTO.GARIN, TEKNOPOLIS, HACOAJ.TIGRE, ADMINISTRATIVO) quedaron afuera
  // a propósito, confirmado con Fede — dejan de ofrecerse en el
  // desplegable de Altas. No afecta a los legajos que ya tienen alguno de
  // esos códigos cargado (servicio es texto libre en el legajo, no una
  // referencia a esta lista).
  servicios: ['AGENCIA.FIBRA', 'AMERICAN.LOGISTIC', 'CLUB.VASCO', 'BILLINGHURST.2048', 'CIBRA', 'LIBERTADOR.260', 'BOULOGNE.662', 'E.LAMARCA.1679', 'LMC.46', 'MAURE.1560', 'OHIGGINS.1949', 'PALPA.2426', 'SALGUERO.2124', 'DISTR.VR', 'EMBA.CABILDO', 'EMBA.PAMPA', 'EMBA.PAMPA2', 'EMBA.CIUDAD', 'ZAPIOLA.GALERIA', 'GESNEXT', 'HIGHFLOW', 'HIT.LIBERTADOR.CEL', 'HIT.LIBERTADOR.8614', 'LIBERTADOR.6343', 'HIT.LMC.877', 'MIGUELETES.2423', 'ALTO.MOLINO', 'PAMPA.1391', 'HIT.MAIPU', 'HIT.TECNO', 'HIT.CHICLANA.3345', 'HIT.UGARTE.2110', 'IUTRACE.SAS', 'JOSIMAR.AVELLANEDA', 'JOSIMAR.CENTRO.DISTR', 'JOSIMAR.LANUS', 'JOSIMAR.LOMAS', 'JOSIMAR.MTE.GRANDE', 'JOSIMAR.BARRACAS', 'JOSIMAR.QUILMES', 'LOS.PINOS', 'OFFICE.PARK', 'ROCAMORA', 'SAN.ANTONIO', 'REYLAT', 'GYM.CONGRESO', 'GYM.DEVOTO', 'GYM.CAÑITAS', 'GYM.PERON', 'GYM.RECOLETA', 'TECTOOLS', 'TSOFT.CHICLANA', 'UML', 'JOSIMAR. BANFIELD', 'HIT.POLO', 'HIT.ALPARGATAS', 'NATIONAL.SHIPPING', 'HOSPITAL.CAMPANA', 'MAURE.1601', 'GYM.CABALLITO', 'INDICOM', 'CONS.DELGADO', 'ASCENSORES', 'SKYGLASS', 'ALSINA.1609', 'LORETO.1510', 'ARCOS', 'CAZADORES', 'HIT.VILO', 'IOMA', 'ZUG.VERDI', 'ZUG.CAAMAÑO', 'LINCE', 'EVERNEX', 'MACSTATION', 'HIT.ARGUIBEL', 'GYM.NUÑEZ', 'ELDAR', 'HIT.GIGENA', 'LOTBA', 'CONEXA', 'OTIS', 'CONS.JUNCAL', 'BIOSINTESIS', 'CAMPANA.JOVEN', 'CAMPANA.BIBLOTECA', 'CAMPANA.CORAZONES ABIERTOS', 'CAMPANA.TEATRO', 'CHANGO. BROWN', 'CHANGO. LA TABLADA', 'CHANGO.3 DE FEBRERO', 'CHANGO.CASEROS', 'CHANGO.CATAN', 'CHANGO.LAFERRERE', 'CHANGO.MALVARG', 'CHANGO.MATADEROS', 'CHANGO.MORENO 1', 'CHANGO.MORENO 2', 'CHANGO.MORENO 3', 'CHANGO.MORÓN', 'CAMPANA.RECICLADO', 'CAMPANA.REFUGIO', 'CONS.OLLEROS', 'CHANGO.LANUS', 'CHANGO.CAMPANA', 'CAMPANA.ELECTROMECANICA', 'CAMPANA.RIOLUJAN', 'CAMPANA.CORRALON', 'CAMPANA.CIMOPU', 'CAMPANA.DIGITAL', 'CAMPANA.CBC', 'JOSIMAR.BERAZATEGUI', 'GYM.BCHINO', 'GYM.FLORES', 'CHANGO.PILAR', 'CHANGO.SANJUSTO', 'CHANGO.QUILMES', 'CHANGO.SARANDI', 'CHANGO.AVELLANEDA', 'GYM.VCRESPO', 'UNIVERSAL.MUSIC', 'GYM.BALVANERA', 'UPGAMING', 'CONS.CHICLANA', 'ADBLICK', 'CAMPANA.REGISTRO', 'CAMPANA.JUZGADO1', 'CAMPANA.JUZGADO.NIÑEZ', 'CAMPANA.JUZGADO.FALTAS', 'GYM.BELGRANO', 'CAJA.VALORES', 'GENOVESA.CENTRAL', 'RESIDENCIA.SMART', 'CAMPANA.DESARROLLO', 'CAMPANA.OBISPADO', 'CAMPANA.CEMENTERIO', 'CONS.RIVADAVIA', 'CHANGO.SVICENTE', 'CHANGO.CLAYPOLE', 'HURLINGHAM.VILLEGAS', 'CHANGO.TIGRE', 'CHANGO.LUJAN', 'CHANGO.TEMPERLEY', 'CHANGO.PERGAMINO', 'CHANGO.JUNIN', 'HURLINGHAN.VERGARA', 'CHANGO.JOSE C PAZ', 'CONS.TERRERO', 'POTIS', 'GRUPSA', 'CAPITALHUMANO.AUSTRIA', 'GYM.CASAMATRIZ', 'SUPPLYCHAIN', 'BRIGNONE', 'DONADO', 'HIT.PAMPA.OBRA', 'DADONE.MIGUELETES'],
  // Zona de residencia/operativa — antes solo distinguía Provincia (CABA vs.
  // Buenos Aires, un solo valor para todo el conurbano). A pedido de RRHH
  // (04/08/2026) se amplía a zonificación real por dispersión geográfica —
  // catálogo compartido por Candidatos, Pedidos, Altas, Reclamos y CRM, así
  // que el cambio de vocabulario aplica parejo en todos esos módulos (son
  // simples selects sobre este array, sin lógica propia por valor — la
  // única rama con lógica especial por zona es onChangeZonaCand() en
  // candidatos.js, que arma la cascada de localidad).
  zonas: ['CABA', 'Zona Norte', 'Zona Sur', 'Zona Oeste'],
  // Catálogo parametrizable (mismo patrón no-persistido que tiposCliente/
  // tiposSitio) para el campo "Disponibilidad horaria" del candidato.
  disponibilidadesHorarias: ['Full time', 'Part time', 'Turno mañana', 'Turno tarde', 'Turno noche', 'Fines de semana'],
  // Ticket "Medio de convocatoria": Instagram -> Redes sociales (más
  // general) + Bolsa de trabajo y Otros nuevas. Candidatos ya guardados
  // con 'Instagram' se migran a 'Redes sociales' por SQL (sql/v062) —
  // mismo valor conceptual, no hace falta mantenerlo aparte.
  medios: ['WhatsApp', 'Formulario web', 'Referido', 'Redes sociales', 'Búsqueda activa', 'Bolsa de trabajo', 'Otros'],
  categorias: ['Operario A', 'Operario B', 'Referente', 'Encargado A', 'Encargado B', 'Encargado C', 'Retén', 'Supervisor', 'Auxiliar administrativo', 'Coordinador de área'],
  // 2.1.1 (Delta Comercial v1.2) — antes hardcodeados en <option> de
  // index.html (cli-tipo/cf-cli-tipo/cli-arca), duplicados y sin fuente
  // única. Se mueven acá con los mismos valores para no romper clientes
  // ya cargados, y ahora son editables desde Configuración → Comercial
  // (mismo patrón que tiposServicio, condicionesIVA, etc. — que, igual
  // que estos dos, no tienen tabla propia en Supabase: lo agregado en
  // Configuración vive solo en memoria del navegador y se pierde al
  // recargar la página. Es una limitación preexistente de todo ese
  // sistema de catálogos, no algo nuevo de este cambio).
  tiposCliente: ['Cadena supermercados', 'Hospital', 'Corporativo', 'Gobierno', 'Educación', 'Otro'],
  // DELTA_servicios_tipo_de_sitio_v1 (30/07/2026) — "Tipo de servicio" es
  // la TAREA (Limpieza, Mantenimiento...); "Tipo de sitio" es el LUGAR
  // (Supermercado, Centro logístico...). Un cliente puede tener muchos
  // servicios de la misma tarea en lugares distintos (ej. Chango: ~20
  // supermercados + 1 centro logístico, todos "Limpieza"). Mismo patrón
  // que tiposCliente — parametrizable desde Configuración, sin tabla
  // propia en Supabase (el campo tipoSitio de cada objetivo sí persiste).
  tiposSitio: ['Supermercado', 'Centro logístico', 'Oficina', 'Hospital', 'Consorcio', 'Industria', 'Otro'],
  categoriasArca: ['Gran contribuyente', 'MiPyME', 'Pequeño contribuyente', 'Otro'],
  // 2.2.6 (Delta Comercial v1.2) — motivo parametrizable al dar de baja un
  // objetivo/servicio (antes era 100% texto libre vía prompt()).
  motivosBajaObjetivo: ['Fin de contrato', 'Impago del cliente', 'Cliente cierra operación', 'Cambio de proveedor', 'Rescisión por incumplimiento nuestro', 'Otro'],
  // A.4 (Delta Comercial v1.3) — localidad del servicio en dos pasos
  // encadenados: jurisdicción → localidad dependiente. Objeto plano
  // {jurisdicción: [localidades]} a propósito, para que agregar otra
  // provincia a futuro sea agregar una clave más, no tocar código.
  jurisdiccionesServicio: {
    'CABA': ['Retiro','San Nicolás','Puerto Madero','San Telmo','Montserrat','Constitución','Recoleta','Balvanera','San Cristóbal','La Boca','Barracas','Parque Patricios','Nueva Pompeya','Almagro','Boedo','Caballito','Flores','Parque Chacabuco','Villa Soldati','Villa Riachuelo','Villa Lugano','Liniers','Mataderos','Parque Avellaneda','Versalles','Monte Castro','Floresta','Vélez Sarsfield','Villa Luro','Villa Real','Villa General Mitre','Villa Devoto','Villa del Parque','Villa Santa Rita','Coghlan','Saavedra','Villa Urquiza','Villa Pueyrredón','Núñez','Belgrano','Colegiales','Palermo','Chacarita','Villa Crespo','Paternal','Agronomía','Villa Ortúzar','Parque Chas'],
    'Provincia de Buenos Aires': ['Adolfo Alsina','Adolfo Gonzales Chaves','Alberti','Almirante Brown','Arrecifes','Avellaneda','Ayacucho','Azul','Bahía Blanca','Balcarce','Baradero','Benito Juárez','Berazategui','Berisso','Bolívar','Bragado','Brandsen','Campana','Cañuelas','Capitán Sarmiento','Carlos Casares','Carlos Tejedor','Carmen de Areco','Castelli','Chacabuco','Chascomús','Chivilcoy','Colón','Coronel Dorrego','Coronel Pringles','Coronel Rosales','Coronel Suárez','Daireaux','Dolores','Ensenada','Escobar','Esteban Echeverría','Exaltación de la Cruz','Ezeiza','Florencio Varela','Florentino Ameghino','General Alvarado','General Alvear','General Arenales','General Belgrano','General Guido','General Juan Madariaga','General La Madrid','General Las Heras','General Lavalle','General Paz','General Pinto','General Pueyrredón','General Rodríguez','General San Martín','General Viamonte','General Villegas','Guaminí','Hipólito Yrigoyen','Hurlingham','Ituzaingó','José C. Paz','Junín','La Costa','La Matanza','Lanús','La Plata','Laprida','Las Flores','Leandro N. Alem','Lezama','Lincoln','Lobería','Lobos','Lomas de Zamora','Luján','Magdalena','Maipú','Malvinas Argentinas','Mar Chiquita','Marcos Paz','Mercedes','Merlo','Monte','Monte Hermoso','Moreno','Morón','Navarro','Necochea','Nueve de Julio','Olavarría','Patagones','Pehuajó','Pellegrini','Pergamino','Pila','Pilar','Pinamar','Presidente Perón','Puán','Punta Indio','Quilmes','Ramallo','Rauch','Rivadavia','Rojas','Roque Pérez','Saavedra','Saladillo','Salliqueló','Salto','San Andrés de Giles','San Antonio de Areco','San Cayetano','San Fernando','San Isidro','San Miguel','San Nicolás','San Pedro','San Vicente','Suipacha','Tandil','Tapalqué','Tigre','Tordillo','Tornquist','Trenque Lauquen','Tres Arroyos','Tres de Febrero','Tres Lomas','Veinticinco de Mayo','Vicente López','Villa Gesell','Villarino','Zárate'],
  },
  localidades: ['Floresta', 'Villa del Parque', 'Barracas', 'Retiro', 'Villa Soldati', 'Palermo', 'Belgrano', 'Caballito', 'San Telmo', 'Montserrat', 'San Justo', 'Isidro Casanova', 'Laferrere', 'Quilmes', 'Avellaneda', 'Lanús', 'Lomas de Zamora', 'Berazategui', 'San Martín', 'Caseros', 'Tres de Febrero', 'José C. Paz', 'Tigre', 'San Fernando', 'Pilar', 'Campana', 'Grand Bourg'],
  movimientos: ['Nuevo ingreso', 'Reubicación interna', 'Reingreso', 'Cambio de servicio', 'Cambio de categoría'],
  estadosLegales: ['Carta documento recibida', 'Carta documento contestada', 'Conciliación SECLO', 'Conciliación interna', 'Estado judicial', 'Cerrado', 'Pre-legal'],
  tiposLegales: ['Despido indirecto', 'Accidente de trabajo', 'Enfermedad profesional', 'Discriminación', 'Incumplimiento contractual'],
  abogados: ['Dr. Martínez Carlos — Estudio Martínez & Asoc.', 'Dr. García Luis — Estudio García'],
  tiposMedicos: ['Enfermedad inculpable', 'Accidente laboral', 'Accidente in itinere', 'Enfermedad profesional', 'Cirugía programada', 'Otro'],
  estadosMedicos: ['Activo — sin trabajar', 'En tratamiento', 'Reposo domiciliario', 'Internado', 'Alta médica'],
  medicosCfg: ['Dr. López — Hospital Italiano', 'Dra. Pérez — Centro Médico Norte'],
  // Funciones de usuarios del sistema — preparametrizables desde Configuración
  funcionesUsuario: ['Auxiliar', 'Subcoordinador/a', 'Coordinador/a', 'Gerente', 'Gerente General', 'Tesorero/a', 'Secretario/a', 'Presidente', 'Supervisor/a'],
  // Aprobadores autorizados de reasignaciones — configurables
  aprobadoresReas: ['Gerente de Operaciones', 'Gerente de RRHH'],
  // Motivos de reasignación — configurables desde Configuración → Reasignaciones
  motivosReasignacion: ['Baja del servicio (cliente)', 'Conflicto con cliente', 'Conflicto con compañeros', 'Pedido del supervisor', 'Pedido del asociado', 'Reducción de personal en servicio', 'Cobertura de otro servicio', 'Sanción disciplinaria', 'Mejora de condiciones', 'Cambio de categoría/función', 'Reingreso', 'Otro'],
  // Catálogos de Capacitaciones (hardcoded por ahora, no en DB — spec §4.4)
  tiposCapacitacion: ['Capacitación de Ingreso: Cooperativismo', 'Capacitación de Ingreso: Productos y maquinarias', 'Capacitación de Ingreso: Normativas de trabajo', 'Maquinarias: uso, manejo y mantenimiento', 'Interpretación del Plan de trabajo en Servicio', 'Productos, herramientas y modalidades de limpieza', 'Liderazgo', 'Atención al Cliente'],
  instructores: ['Miguel Pereyra', 'Patricia Scaglia', 'Marina Iglesias', 'Gina Martinez', 'Santiago Ayala', 'Encargado', 'Referente', 'Supervisor'],
  metodosEval: ['Evaluación oral', 'Evaluación escrita', 'Auditoría proceso', 'Auditoría SOL', 'Auditoría sistema', 'Evolución de indicador', 'Informe del supervisor', 'Encuesta al asociado'],
  smvm: [
    { periodo: '2024-01', valor: 156000, resolucion: 'Res. 1/2024', vigente: false },
    { periodo: '2024-07', valor: 234315, resolucion: 'Res. 7/2024', vigente: false },
    { periodo: '2025-01', valor: 294000, resolucion: 'Res. 1/2025', vigente: true },
  ],
  candidatos: [],
  turnos: [],
  reasignaciones: [],
  capacitaciones: [],
  materialesCapacitacion: [],
  preguntasEvaluacion: [],
  plantillasEvaluacion: [],
  evaluacionesEnviadas: [],
  respuestasEvaluacion: [],
  // Competencia Anual v2 (v033) — motor de puntos con ledger auditable.
  // reglasCompetencia ahora es el catálogo real (array de filas, una por
  // regla, cargado genérico por supaInit() vía _SM) — ya no es un objeto
  // singleton reshapeado a mano como en la versión anterior.
  reglasCompetencia: [],
  reglasCompetenciaVersiones: [],
  eventosPuntos: [],
  movimientosPuntos: [],
  premiosCompetenciaAnual: [],
  notificacionesNoParticipan: [],
  aniosCompetencia: [],
  // Sanciones v1 (v034) — niveles 0-2, catálogo de infracciones.
  sancionesDisciplinarias: [],
  sancionEventos: [],
  sancionDescargos: [],
  catalogoInfracciones: [],
  catalogoInfraccionesVersiones: [],
  // Categorías v1 (v035) — catálogo de categorías, valores hora y
  // plus adicionales, todos con vigencia temporal.
  categoriasBase: [],
  valoresHoraCategoria: [],
  plusAdicionales: [],
  valoresPlus: [],
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
  documentacionIngreso: [],
  legajos: [
    { nro: 2, nombre: 'Peretti Juan Carlos', dni: '6263572', funcion: 'Coordinador de área', servicio: 'ADMINISTRATIVO', supervisor: 'ADMINISTRATIVO', ingreso: '01/02/2011', estado: 'Activo', estadoLegal: '', estadoMedico: '', fechaBaja: '', fechaReincorp: '', seguro: 'Completo', localidad: 'Belgrano', tel: '1131543167', mail: 'juanperetti_46@hotmail.com', cuit: '20062635720', estadoCivil: 'Casado', nac: 'Argentina', banco: 'Banco Nación', calzado: 43, ambo: 'XL', periodoPrueba: 6, fechaIngresoPrueba: '2011-02-01', adjuntosLegal: [], adjuntosMedico: [] },
    { nro: 32, nombre: 'Tolaba Maximiliano Ezequiel', dni: '32343528', funcion: 'Referente', servicio: 'MIGUELETES.2423', supervisor: 'Alvaro Uballes', ingreso: '15/03/2018', estado: 'Activo', estadoLegal: '', estadoMedico: '', fechaBaja: '', fechaReincorp: '', seguro: 'Completo', localidad: 'Lomas de Zamora', tel: '', mail: '', cuit: '20323435287', estadoCivil: 'Soltero', nac: 'Argentina', banco: '', calzado: 41, ambo: 'M', periodoPrueba: 6, fechaIngresoPrueba: '2018-03-15', adjuntosLegal: [], adjuntosMedico: [] },
    { nro: 43, nombre: 'Arispe Alfredo Julian', dni: '18348699', funcion: 'Supervisor', servicio: 'ADMINISTRATIVO', supervisor: 'ADMINISTRATIVO', ingreso: '11/03/2011', estado: 'Activo', estadoLegal: '', estadoMedico: '', fechaBaja: '', fechaReincorp: '', seguro: 'Completo', localidad: 'Pompeya', tel: '1122751445', mail: 'alfredoarispe@hotmail.com', cuit: '20183486994', estadoCivil: 'Soltero', nac: 'Argentina', banco: '', calzado: 42, ambo: 'L', periodoPrueba: 6, fechaIngresoPrueba: '2011-03-11', adjuntosLegal: [], adjuntosMedico: [] },
    { nro: 46, nombre: 'Camacho Solis Katherine', dni: '93991411', funcion: 'Operario', servicio: 'CIBRA', supervisor: 'Alejandro Cacciato', ingreso: '25/04/2014', estado: 'Activo', estadoLegal: 'Carta documento recibida', estadoMedico: '', fechaBaja: '', fechaReincorp: '', seguro: 'Pendiente', localidad: 'Tigre', tel: '1150581888', mail: '', cuit: '27939914116', estadoCivil: 'Soltera', nac: 'Peruana', banco: '', calzado: 38, ambo: 'S', periodoPrueba: 6, fechaIngresoPrueba: '2014-04-25', adjuntosLegal: ['carta_doc_1.pdf'], adjuntosMedico: [] },
    { nro: 71, nombre: 'Gomez Diego Alejandro', dni: '26148208', funcion: 'Retén', servicio: 'RETEN.GENERAL', supervisor: 'Santiago Ayala', ingreso: '27/05/2022', estado: 'Activo', estadoLegal: '', estadoMedico: 'Activo — sin trabajar', fechaBaja: '', fechaReincorp: '', seguro: 'Completo', localidad: 'Tres de Febrero', tel: '1156072183', mail: '', cuit: '20261482089', estadoCivil: 'Casado', nac: 'Argentina', banco: '', calzado: 43, ambo: 'L', periodoPrueba: 6, fechaIngresoPrueba: '2022-05-27', adjuntosLegal: [], adjuntosMedico: ['certif_medico.pdf'] },
    { nro: 22, nombre: 'Godoy Alicia Alejandra', dni: '25189767', funcion: 'Operario', servicio: '—', supervisor: '—', ingreso: '28/08/2015', estado: 'Baja', estadoLegal: 'Estado judicial', estadoMedico: '', fechaBaja: '15/03/2024', fechaReincorp: '', seguro: '—', localidad: 'Avellaneda', tel: '', mail: '', cuit: '', estadoCivil: '', nac: '', banco: '', calzado: 38, ambo: 'S', periodoPrueba: 6, fechaIngresoPrueba: '2015-08-28', adjuntosLegal: ['carta_doc_1.pdf', 'escrito_judicial.pdf'], adjuntosMedico: [] },
    { nro: 97, nombre: 'Sanchez Ocas Segundo', dni: '94243288', funcion: 'Operario', servicio: 'LOS.PINOS', supervisor: 'Alvaro Uballes', ingreso: '12/02/2016', estado: 'Activo', estadoLegal: '', estadoMedico: '', fechaBaja: '05/06/2018', fechaReincorp: '14/01/2020', seguro: 'Completo', localidad: 'CABA', tel: '', mail: '', cuit: '20942432888', estadoCivil: '', nac: '', banco: '', calzado: 42, ambo: 'L', periodoPrueba: 6, fechaIngresoPrueba: '2020-01-14', adjuntosLegal: [], adjuntosMedico: [] },
  ],
  // Situaciones Legales v1.1 — sin seed mock (confidencialidad: no
  // hardcodear casos, ni siquiera de prueba, en el bundle de JS). Sale
  // entero de Supabase vía supaInit().
  casosLegales: [],
  novedadesCasoLegal: [],
  casosLegalesAdjuntos: [],
  // Enfermos y Accidentes v1 (v037) — sin seed mock (confidencialidad
  // de datos médicos: no hardcodear casos, ni de prueba, en el bundle
  // de JS — mismo criterio que Situaciones Legales). Sale entero de
  // Supabase vía supaInit().
  casosEnfermosAccidentes: [],
  certificadosMedicos: [],
  retirosEnfermosPendientes: [],
  casoEventosEnfermos: [],
  // Pedidos de Adelantos + Gestión de Adelantos v1.1 (v038) — modelo
  // aplanado, reemplaza planillasAdelantos/planillasInformales/
  // adelantosInformales/solicitudesPrestamos (esas quedan huérfanas en
  // legacy.js, no se leen más). prestamos sigue siendo la misma tabla
  // de siempre, ahora extendida con el flujo nuevo.
  pedidosAdelantos: [],
  pedidosAdelantosEventos: [],
  descuentosAdelantosPendientes: [],
  configuracionAdelantosPrestamos: [],
  topesAdelantosVersiones: [],
  sugerencias: [],
  // Se puebla desde Supabase Auth (tabla public.usuarios) al loguear —
  // ver cargarListaUsuarios() en src/shared/auth.js. Ya no vive hardcodeado
  // acá para no mandar contraseñas en texto plano al bundle del cliente.
  usuarios: [],
  // Tickets del perfil DEVELOPER — se sincronizan desde `sugerencias` la
  // primera vez que ese perfil inicia sesión (ver developer.js).
  tickets: [],
  // Módulo Vacaciones (sector administrativo) y campana de notificaciones
  // del sistema (compartida, ver shared/notificaciones.js).
  vacaciones: [],
  notificacionesSistema: [],
};

// SERVICIO_SUPERVISOR (código de servicio → supervisor) se movió a la
// tabla servicios_supervisor (sql/v067) — se carga en DB.serviciosSupervisor
// vía supaInit(). Ver src/modules/servicios_supervisor/.

// ========== PERFILES Y ACCESOS ==========

export const PERFILES = {
  'Administrador total': { color: 'badge-rojo', modulos: ['inicio', 'candidatos', 'pedidos', 'psicotecnico', 'preocupacional', 'documentacion', 'altas', 'legajos', 'reasignaciones', 'legal', 'enfermos', 'capacitaciones', 'vacaciones', 'descansos', 'competencia', 'clientes', 'objetivos', 'precios', 'paritarias', 'categorias', 'crm', 'reclamos', 'cobros', 'comisiones', 'supervisores', 'liquidacion', 'feriados', 'liq_admin', 'liquidaciones', 'retenes', 'mantenimiento', 'configuracion', 'smvm', 'monotributos', 'uniformes', 'stock', 'retenciones', 'sanciones', 'adelantos', 'pedidos_adelantos', 'gestion_adelantos', 'sugerencias'], desc: 'Acceso completo.' },
  // Reorganización de menú/permisos (Lautaro, 12/08/2026): RRHH tiene que
  // VER toda el área Personal — antes no veía 'legal' ni 'enfermos' pese a
  // que esas 2 pantallas ya listaban 'RRHH' en su propio item.perfiles
  // (metadata que no se usa para el control de acceso real — eso lo hace
  // este array .modulos). Monotributos/Retenciones quedan igual: RRHH ya
  // los tenía y los sigue teniendo aunque esos módulos ahora vivan en la
  // sección de menú Finanzas — la sección es organización, no permiso.
  'RRHH': { color: 'badge-azul', modulos: ['inicio', 'candidatos', 'psicotecnico', 'preocupacional', 'documentacion', 'altas', 'legajos', 'reasignaciones', 'legal', 'enfermos', 'capacitaciones', 'vacaciones', 'descansos', 'competencia', 'reclamos', 'paritarias', 'categorias', 'liquidacion', 'liq_admin', 'liquidaciones', 'retenes', 'monotributos', 'uniformes', 'retenciones', 'sanciones', 'adelantos', 'pedidos_adelantos', 'gestion_adelantos', 'sugerencias'], desc: 'RRHH, legajos, capacitaciones.' },
  'Operaciones': { color: 'badge-verde', modulos: ['inicio', 'pedidos', 'legajos', 'reasignaciones', 'capacitaciones', 'vacaciones', 'descansos', 'competencia', 'clientes', 'objetivos', 'precios', 'paritarias', 'crm', 'reclamos', 'cobros', 'comisiones', 'supervisores', 'liquidacion', 'retenes', 'mantenimiento', 'feriados', 'uniformes', 'sanciones', 'pedidos_adelantos', 'sugerencias'], desc: 'Operaciones y ventas.' },
  'Finanzas': { color: 'badge-acento', modulos: ['inicio', 'legajos', 'smvm', 'cobros', 'comisiones', 'paritarias', 'liquidacion', 'liq_admin', 'liquidaciones', 'retenes', 'mantenimiento', 'monotributos', 'retenciones', 'adelantos', 'gestion_adelantos', 'sugerencias'], desc: 'Finanzas y liquidación.' },
  'Supervisor': { color: 'badge-gris', modulos: ['inicio', 'pedidos', 'legajos', 'descansos', 'competencia', 'liquidacion', 'liquidaciones', 'adelantos', 'pedidos_adelantos', 'uniformes', 'sanciones', 'sugerencias', 'retenciones'], desc: 'Pedidos, legajos, descansos, competencia y liquidación de horas.' },
  'Comercial': { color: 'badge-naranja', modulos: ['inicio', 'clientes', 'objetivos', 'precios', 'crm', 'reclamos', 'comisiones', 'sugerencias'], desc: 'Clientes, objetivos, precios, CRM, reclamos y comisiones.' },
  'Logística': { color: 'badge-gris', modulos: ['inicio', 'legajos', 'uniformes', 'stock', 'sugerencias'], desc: 'Consulta de legajos, gestión de pedidos de uniformes y stock.' },
  'Asociado': { color: 'badge-verde', modulos: ['mis_adelantos', 'sugerencias'], desc: 'Portal del asociado — pedidos de adelanto y préstamo.' },
  'DEVELOPER': { color: 'badge-azul', modulos: ['dev_inicio', 'dev_tickets', 'dev_proyeccion', 'dev_seguridad'], desc: 'Panel de desarrollo — tickets, roadmap y seguridad.' },
};

// ========== MENÚ ==========
//
// Reorganización de menú (Lautaro, 12/08/2026 — "REORGANIZACIÓN DEL
// MENÚ Y PERMISOS"): la sección/área acá abajo es solo ORGANIZACIÓN,
// no un límite de acceso — quién ve y quién modifica cada módulo lo
// define PERFILES[perfil].modulos más arriba, no en qué sección de
// menú vive la key. Ej.: Monotributos vive en Finanzas pero RRHH sigue
// operándolo (ya está en RRHH.modulos).
//
// Movimientos de esta pasada (ver tabla del ticket): Altas→Selección,
// Legajos→Personal, Reasignaciones→Operaciones, Monotributos→Finanzas,
// Uniformes (Ingreso+Logística, duplicado)→Logística (queda 1 solo),
// Retenciones→Finanzas, Situaciones legales→Personal, Enfermos y
// accidentes→Personal, Sanciones→Personal, Feriados→Administración,
// Pedidos de adelantos→Finanzas. Las secciones Ingreso y Seguimiento
// quedaron sin ítems y se eliminan. Reportes y sugerencias pasa de
// sección propia a Finanzas (sigue visible para todos los perfiles que
// ya tenía en su item.perfiles/PERFILES.modulos — la sección es el
// título bajo el que se agrupa en el menú, no cambia quién la ve).
// Dentro de cada sección, orden alfabético por label (pedido explícito
// del ticket).
//
// Nota: "Supervisores" (módulo nuevo, agregado el 11/08 — un día antes
// de este ticket) no aparece en el listado "Menú final" del documento.
// No hay instrucción de sacarlo ni de dónde ponerlo, así que se dejó
// donde ya estaba (Comercial, junto a Servicios/Comisiones) en vez de
// adivinar — a confirmar con Lautaro si tiene otro lugar pensado.
export const MENU = [
  { section: '', items: [
    { key: 'inicio', icon: '🏠', label: 'Inicio', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas', 'Supervisor', 'Comercial', 'Logística'] },
  ]},
  { section: 'Selección', items: [
    { key: 'altas', icon: '✅', label: 'Altas de asociados', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'candidatos', icon: '👥', label: 'Candidatos', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'documentacion', icon: '📄', label: 'Documentación de ingreso', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'pedidos', icon: '📋', label: 'Pedidos de personal', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Supervisor'] },
    { key: 'preocupacional', icon: '🏥', label: 'Pre-ocupacional', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'psicotecnico', icon: '🧠', label: 'Psicotécnico', perfiles: ['Administrador total', 'RRHH'] },
  ]},
  { section: 'Logística', items: [
    { key: 'stock', icon: '📦', label: 'Stock', perfiles: ['Administrador total', 'Logística'] },
    { key: 'uniformes', icon: '👕', label: 'Uniformes', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Supervisor', 'Logística'] },
  ]},
  { section: 'Operaciones', items: [
    { key: 'liq_admin', icon: '🏢', label: 'Liquidación Administración', badge: 'liqadm', perfiles: ['Administrador total', 'RRHH', 'Finanzas'] },
    { key: 'liquidacion', icon: '📋', label: 'Liquidación de horas', badge: 'liqh', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas', 'Supervisor'] },
    { key: 'mantenimiento', icon: '🔧', label: 'Mantenimiento', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas'] },
    { key: 'reasignaciones', icon: '🔄', label: 'Reasignaciones', badge: 'reas', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
    { key: 'retenes', icon: '🔄', label: 'Retenes', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas'] },
  ]},
  { section: 'Comercial', items: [
    { key: 'clientes', icon: '🏢', label: 'Clientes', perfiles: ['Administrador total', 'Operaciones', 'Comercial'] },
    { key: 'comisiones', icon: '🤝', label: 'Comisiones', perfiles: ['Administrador total', 'Finanzas', 'Operaciones', 'Comercial'] },
    { key: 'crm', icon: '📊', label: 'CRM Comercial', badge: 'crm', perfiles: ['Administrador total', 'Operaciones', 'Comercial'] },
    { key: 'cobros', icon: '💳', label: 'Gestión de cobros', perfiles: ['Administrador total', 'Finanzas', 'Operaciones'] },
    { key: 'precios', icon: '💲', label: 'Gestión de precios', badge: 'prec', perfiles: ['Administrador total', 'Operaciones', 'Comercial'] },
    { key: 'reclamos', icon: '📣', label: 'Reclamos y NC', badge: 'rec', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Comercial'] },
    { key: 'objetivos', icon: '📍', label: 'Servicios', perfiles: ['Administrador total', 'Operaciones', 'Comercial'] },
    { key: 'supervisores', icon: '🧑‍💼', label: 'Supervisores', perfiles: ['Administrador total', 'Operaciones'] },
  ]},
  { section: 'Personal', items: [
    { key: 'capacitaciones', icon: '🎓', label: 'Capacitaciones', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
    { key: 'competencia', icon: '🏆', label: 'Competencia anual', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Supervisor'] },
    { key: 'descansos', icon: '👷', label: 'Descansos', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Supervisor'] },
    { key: 'enfermos', icon: '🏥', label: 'Enfermos y accidentes', badge: 'enf', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
    { key: 'legajos', icon: '📁', label: 'Legajos', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas', 'Supervisor', 'Comercial', 'Logística'] },
    { key: 'sanciones', icon: '⚠️', label: 'Sanciones', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Supervisor'] },
    { key: 'legal', icon: '⚖️', label: 'Situaciones legales', badge: 'legal', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'vacaciones', icon: '🏖️', label: 'Vacaciones', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
  ]},
  { section: 'Administración', items: [
    { key: 'categorias', icon: '🏷️', label: 'Categorías', perfiles: ['Administrador total', 'RRHH'] },
    { key: 'configuracion', icon: '⚙️', label: 'Configuración', perfiles: ['Administrador total'] },
    { key: 'feriados', icon: '📅', label: 'Feriados', perfiles: ['Administrador total', 'RRHH', 'Operaciones'] },
    { key: 'paritarias', icon: '📜', label: 'Paritarias', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas'] },
    { key: 'smvm', icon: '💵', label: 'SMVM histórico', perfiles: ['Administrador total', 'Finanzas'] },
  ]},
  { section: 'Finanzas', items: [
    { key: 'gestion_adelantos', icon: '🏦', label: 'Gestión de adelantos', perfiles: ['Administrador total', 'Finanzas', 'RRHH'] },
    { key: 'liquidaciones', icon: '💰', label: 'Liquidaciones', perfiles: ['Administrador total', 'RRHH', 'Finanzas', 'Supervisor'] },
    { key: 'monotributos', icon: '💸', label: 'Monotributos', perfiles: ['Administrador total', 'RRHH', 'Finanzas'] },
    { key: 'pedidos_adelantos', icon: '💵', label: 'Pedidos de adelantos', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Supervisor'] },
    { key: 'sugerencias', icon: '💬', label: 'Reportes y sugerencias', perfiles: ['Administrador total', 'RRHH', 'Operaciones', 'Finanzas', 'Supervisor', 'Comercial', 'Logística', 'Asociado'] },
    { key: 'retenciones', icon: '🔒', label: 'Retenciones', perfiles: ['Administrador total', 'RRHH', 'Finanzas', 'Supervisor'] },
  ]},
  { section: 'Próximamente', items: [
    { key: 'maquinas', icon: '🔧', label: 'Máquinas', disabled: true, perfiles: [] },
  ]},
  { section: 'Desarrollador', items: [
    { key: 'dev_inicio', icon: '🏠', label: 'Inicio Dev', perfiles: ['DEVELOPER'] },
    { key: 'dev_tickets', icon: '🎫', label: 'Tickets', perfiles: ['DEVELOPER'] },
    { key: 'dev_proyeccion', icon: '🗺️', label: 'Proyección', perfiles: ['DEVELOPER'] },
    { key: 'dev_seguridad', icon: '🔐', label: 'Seguridad', perfiles: ['DEVELOPER'] },
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
  '1CD': 'badge-naranja', '2CD': 'badge-rojo', 'Exclusión': 'badge-rojo',
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

// Localidades reales dentro de cada partido — dataset pasado por RRHH
// (05/08/2026) para el selector en cascada Partido → Localidad de
// Candidatos (búsqueda de personal). Antes no existía esta granularidad:
// LOCALIDADES_BA (arriba) es la lista de partidos, sin las localidades
// de adentro. Ensenada y Mercedes no vinieron en el dataset — se dejan
// con su propia cabecera como única localidad hasta que RRHH confirme el
// resto. Solo se usa en Candidatos por ahora (ver onChangeZonaCand /
// onChangePartidoCand) — Altas sigue con el campo Partido de texto libre.
export const PARTIDOS_LOCALIDADES = {
  'Almirante Brown': ['Adrogué', 'Burzaco', 'Claypole', 'Don Orione', 'Glew', 'Longchamps', 'Malvinas Argentinas', 'Rafael Calzada', 'San José'],
  'Avellaneda': ['Avellaneda', 'Dock Sud', 'Gerli', 'Piñeyro', 'Sarandí', 'Villa Domínico', 'Wilde'],
  'Berazategui': ['Berazategui', 'Berazategui Oeste', 'El Pato', 'Hudson', 'Juan María Gutiérrez', 'Pereyra', 'Plátanos', 'Ranelagh', 'Sourigues', 'Villa España'],
  'Berisso': ['Berisso', 'Villa Argüello', 'Villa Zula', 'Los Talas'],
  'Brandsen': ['Coronel Brandsen', 'Altamira', 'Gómez', 'Jeppener', 'Olea', 'Samborombón', 'Gándara'],
  'Campana': ['Campana', 'Llompart', 'Río Luján'],
  'Cañuelas': ['Cañuelas', 'Alejandro Petión', 'Uribelarrea', 'Máximo Paz', 'Vicente Casares'],
  'Ensenada': ['Ensenada'],
  'Escobar': ['Belén de Escobar', 'Garín', 'Ingeniero Maschwitz', 'Maquinista Savio', 'Matheu'],
  'Esteban Echeverría': ['Monte Grande', 'El Jagüel', 'Luis Guillón', '9 de Abril'],
  'Exaltación de la Cruz': ['Capilla del Señor', 'Los Cardales', 'Parada Robles'],
  'Ezeiza': ['Ezeiza', 'Tristán Suárez', 'La Unión', 'Carlos Spegazzini', 'Canning'],
  'Florencio Varela': ['Florencio Varela', 'Bosques', 'Zeballos', 'Gobernador Costa', 'Ingeniero Allan'],
  'General Las Heras': ['General Las Heras', 'Plomer', 'Villars', 'La Choza'],
  'General Rodríguez': ['General Rodríguez'],
  'General San Martín': ['San Martín', 'Villa Ballester', 'José León Suárez', 'Billinghurst', 'Chilavert'],
  'Hurlingham': ['Hurlingham', 'William Morris', 'Villa Tesei'],
  'Ituzaingó': ['Ituzaingó', 'Villa Udaondo'],
  'José C. Paz': ['José C. Paz'],
  'La Matanza': ['San Justo', 'Ramos Mejía', 'Lomas del Mirador', 'La Tablada', 'Villa Madero', 'Tapiales', 'Aldo Bonzi', 'Ciudad Evita', 'González Catán', 'Gregorio de Laferrere', 'Isidro Casanova', 'Virrey del Pino', '20 de Junio', 'Villa Luzuriaga'],
  'Lanús': ['Lanús Este', 'Lanús Oeste', 'Remedios de Escalada', 'Monte Chingolo', 'Valentín Alsina'],
  'La Plata': ['La Plata', 'Los Hornos', 'City Bell', 'Villa Elisa', 'Tolosa', 'Melchor Romero', 'Gonnet', 'Ringuelet'],
  'Lomas de Zamora': ['Lomas de Zamora', 'Banfield', 'Temperley', 'Llavallol', 'Turdera', 'Villa Fiorito', 'Ingeniero Budge'],
  'Luján': ['Luján', 'Jáuregui', 'Open Door', 'Olivera', 'Carlos Keen'],
  'Malvinas Argentinas': ['Los Polvorines', 'Grand Bourg', 'Tortuguitas', 'Ing. Adolfo Sourdeaux', 'Pablo Nogués'],
  'Marcos Paz': ['Marcos Paz'],
  'Mercedes': ['Mercedes'],
  'Merlo': ['Merlo', 'San Antonio de Padua', 'Libertad', 'Mariano Acosta', 'Pontevedra'],
  'Moreno': ['Moreno', 'Paso del Rey', 'Trujui', 'Cuartel V', 'La Reja', 'Francisco Álvarez'],
  'Morón': ['Morón', 'Castelar', 'Haedo', 'El Palomar', 'Villa Sarmiento'],
  'Pilar': ['Pilar', 'Del Viso', 'Derqui', 'Fátima', 'Manzanares', 'Manuel Alberti', 'Zelaya', 'Villa Rosa'],
  'Presidente Perón': ['Guernica'],
  'Quilmes': ['Quilmes', 'Bernal', 'Don Bosco', 'Ezpeleta', 'San Francisco Solano', 'Quilmes Oeste'],
  'San Fernando': ['San Fernando', 'Virreyes', 'Victoria', 'Delta de San Fernando'],
  'San Isidro': ['San Isidro', 'Beccar', 'Boulogne', 'Martínez', 'Acassuso'],
  'San Miguel': ['San Miguel', 'Bella Vista', 'Muñiz', 'Campo de Mayo'],
  'San Vicente': ['San Vicente', 'Alejandro Korn'],
  'Tigre': ['Tigre', 'Rincón de Milberg', 'Don Torcuato', 'General Pacheco', 'Benavídez', 'El Talar', 'Dique Luján', 'Nordelta'],
  'Tres de Febrero': ['Caseros', 'Ciudadela', 'Villa Bosch', 'Santos Lugares', 'Martín Coronado', 'Loma Hermosa', 'Pablo Podestá'],
  'Vicente López': ['Vicente López', 'Olivos', 'Florida', 'La Lucila', 'Munro', 'Carapachay', 'Villa Martelli'],
  'Zárate': ['Zárate', 'Lima'],
};

// Índice inverso de PARTIDOS_LOCALIDADES (localidad -> partido) — permite
// elegir directamente la Localidad en Candidatos sin tener que saber antes
// a qué Partido pertenece (onChangeLocalidadCand la usa para autocompletar
// el Partido solo). Se computa una sola vez acá en vez de duplicar a mano
// los ~200 pares; los nombres de localidad no se repiten entre partidos
// (verificado), así que el mapeo es 1 a 1 sin ambigüedad.
export const LOCALIDAD_A_PARTIDO = Object.fromEntries(
  Object.entries(PARTIDOS_LOCALIDADES).flatMap(([partido, locs]) => locs.map(loc => [loc, partido]))
);

// ========== BARRIOS CABA ==========

export const BARRIOS_CABA = [
  'Agronomía', 'Almagro', 'Balvanera', 'Barracas', 'Belgrano', 'Boedo', 'Caballito', 'Chacarita',
  'Coghlan', 'Colegiales', 'Constitución', 'Flores', 'Floresta', 'La Boca', 'La Paternal', 'Liniers',
  'Mataderos', 'Monserrat', 'Monte Castro', 'Nueva Pompeya', 'Núñez', 'Palermo', 'Parque Avellaneda',
  'Parque Chacabuco', 'Parque Chas', 'Parque Patricios', 'Puerto Madero', 'Recoleta', 'Retiro',
  'Saavedra', 'San Cristóbal', 'San Nicolás', 'San Telmo', 'Vélez Sarsfield', 'Versalles',
  'Villa Crespo', 'Villa del Parque', 'Villa Devoto', 'Villa General Mitre', 'Villa Lugano',
  'Villa Luro', 'Villa Ortúzar', 'Villa Pueyrredón', 'Villa Real', 'Villa Riachuelo',
  'Villa Santa Rita', 'Villa Soldati', 'Villa Urquiza',
];

// ========== USUARIO ACTUAL ==========

export let currentUser = null;

export function setCurrentUser(user) {
  currentUser = user;
}
