// Helpers compartidos para los tests E2E. La app usa Supabase Auth
// real — sin credenciales de test, entramos directo inyectando estado
// en el mismo módulo ES que ya usa la app corriendo (los módulos ES
// son singletons por URL en el navegador, así que import() acá agarra
// la MISMA instancia de DB/currentUser que ve la UI).

export async function loginComoAdmin(page, perfil = 'Administrador total') {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function', { timeout: 20000 });
  await page.evaluate(async (perfil) => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre: 'Test E2E', perfil });
  }, perfil);
}

let _contador = 0;

export async function inyectarLegajo(page, overrides = {}) {
  _contador += 1;
  const nro = overrides.nro ?? (900000 + _contador);
  return page.evaluate(async ({ nro, overrides }) => {
    const { DB } = await import('/src/shared/state.js');
    const legajo = {
      nro, nombre: 'E2E Test', dni: '20202020', funcion: 'Operario A',
      servicio: 'Objetivo Demo', supervisor: 'Supervisor Demo', ingreso: '01/01/2026',
      estado: 'Activo', estadoLegal: '', fechaBaja: '', fechaReincorp: '', legajoAnteriorNro: null,
      seguro: 'Pendiente', localidad: 'CABA', tel: '1100000000', mail: 'e2e@test.com',
      cuit: '20202020209', claveFiscal: '', inaes: '', estadoCivil: 'Soltero/a', nac: 'Argentina',
      genero: 'Masculino', banco: '', calzado: 42, ambo: 'M', periodoPrueba: 180,
      fechaIngresoPrueba: '2026-01-01', adjuntosLegal: [], adjuntosMedico: [],
      ...overrides, nro,
    };
    DB.legajos = DB.legajos || [];
    DB.legajos.push(legajo);
    return legajo;
  }, { nro, overrides });
}
