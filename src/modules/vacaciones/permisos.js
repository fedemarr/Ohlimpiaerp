// Wrappers sobre el sistema global de permisos y facultades — que TODAVÍA
// NO EXISTE en el proyecto (DISENO_vacaciones.md §12.2 ya anticipaba este
// caso). Se usa un mock temporal con placeholders (decisión del usuario:
// "placeholders por ahora, los edito yo cuando tenga la lista definitiva").
//
// TODO: reemplazar por el sistema global de permisos y facultades cuando
// exista. El punto de reemplazo son estas 4 funciones exportadas — nada
// más del módulo Vacaciones debería necesitar tocarse.

// TODO: reemplazar cada valor por el nombre real del Gerente de ese sector.
const MOCK_GERENTES = {
  'Consejo de Administración': '[Gerente Consejo de Administración]',
  'Coord. General': '[Gerente Coord. General]',
  'Coord. RRHH': '[Gerente Coord. RRHH]',
  'Coord. Operaciones y Planeamiento': '[Gerente Coord. Operaciones y Planeamiento]',
  'Coord. Calidad': '[Gerente Coord. Calidad]',
  'Coord. Logística y Distribución': '[Gerente Coord. Logística y Distribución]',
  'Coord. Marketing y Ventas': '[Gerente Coord. Marketing y Ventas]',
  'Coord. Administración y Finanzas': '[Gerente Coord. Administración y Finanzas]',
};

// TODO: reemplazar cada valor por el nombre real del miembro del Consejo.
const MOCK_CONSEJO = {
  presidente: '[Presidente del Consejo]',
  tesorero: '[Tesorero del Consejo]',
  secretario: '[Secretario del Consejo]',
};

export function gerenteDeSector(sector) {
  return MOCK_GERENTES[sector] || null;
}

export function esGerenteDeArea(nombre, sector) {
  return !!nombre && gerenteDeSector(sector) === nombre;
}

// Devuelve 'Presidente' | 'Tesorero' | 'Secretario' | null
export function rolEnConsejo(nombre) {
  if (!nombre) return null;
  if (MOCK_CONSEJO.presidente === nombre) return 'Presidente';
  if (MOCK_CONSEJO.tesorero === nombre) return 'Tesorero';
  if (MOCK_CONSEJO.secretario === nombre) return 'Secretario';
  return null;
}

export function esMiembroConsejo(nombre) {
  return rolEnConsejo(nombre) !== null;
}

export function nombresConsejo() {
  return { presidente: MOCK_CONSEJO.presidente, tesorero: MOCK_CONSEJO.tesorero, secretario: MOCK_CONSEJO.secretario };
}
