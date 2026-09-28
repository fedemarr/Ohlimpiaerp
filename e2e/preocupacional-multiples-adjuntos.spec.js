import { test, expect } from '@playwright/test';

// Ticket #191 (Jimena, NO URGENTE): poder cargar MÁS de un archivo en
// Preocupacional (ej. el apto médico Y una beta de embarazo).
//
// La causa era src/shared/adjuntos.js: al subir un archivo invalidaba
// (vigente=false) los adjuntos vigentes del mismo (dni, tipo), y como el
// tipo en preocupacional sale del resultado ('apto-medico' / 'no-apto'), el
// segundo archivo tapaba al primero — que seguía en la base pero dejaba de
// listarse.
//
// El arreglo es un tipo nuevo, 'preocup-adicional', agregado a
// TIPOS_CON_HISTORIAL: no invalida a los anteriores, así que conviven N.
//
// Acá se prueban las dos mitades por separado:
//   1. el helper de adjuntos (subir 2 del mismo tipo NO se pisan) — con el
//      storage y la tabla interceptados;
//   2. la UI del modal (botón de adicionales, input multiple, listado).

const DNI = '30990401';

async function mockStorageYRest(page, filas) {
  // El INSERT de la tabla adjuntos devuelve la fila que el test ya definió,
  // para que subirAdjunto reciba el registro con id.
  await page.route('**/storage/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'k' }) }));
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    const metodo = req.method();
    if (metodo === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filas) });
    }
    if (metodo === 'PATCH') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

test('El tipo preocup-adicional está en TIPO_LEGIBLE y en TIPOS_CON_HISTORIAL', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function', { timeout: 20000 });
  const info = await page.evaluate(async () => {
    const { TIPO_LEGIBLE, TIPOS_CON_HISTORIAL } = await import('/src/shared/adjuntos.js');
    return { legible: TIPO_LEGIBLE['preocup-adicional'], conHistorial: TIPOS_CON_HISTORIAL.includes('preocup-adicional') };
  });
  expect(info.legible).toBe('Documento adicional');
  // Si no estuviera en la lista, subirAdjunto() tiraría "Tipo de adjunto
  // desconocido" y, peor, el segundo archivo invalidaría al primero.
  expect(info.conHistorial).toBe(true);
});

test('Subir 2 documentos adicionales NO invalida al primero (los 2 quedan vigentes)', async ({ page }) => {
  const patches = [];
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function', { timeout: 20000 });
  await page.route('**/storage/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'k' }) }));
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      patches.push(JSON.parse(req.postData() || '{}'));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });

  const errores = await page.evaluate(async ({ dni }) => {
    const { subirAdjunto } = await import('/src/shared/adjuntos.js');
    const archivo = new File(['x'], 'beta.pdf', { type: 'application/pdf' });
    try {
      await subirAdjunto({ dni, etapa: 'preocupacional', tipo: 'preocup-adicional', file: archivo });
      await subirAdjunto({ dni, etapa: 'preocupacional', tipo: 'preocup-adicional', file: archivo });
      return null;
    } catch (e) { return e.message; }
  }, { dni: DNI });

  expect(errores).toBeNull();
  // Cero invalidaciones: los adicionales no se pisan entre sí.
  expect(patches).toHaveLength(0);
});

test('El tipo apto-medico SÍ sigue invalidando al anterior (no se rompió la regla)', async ({ page }) => {
  const patches = [];
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function', { timeout: 20000 });
  await page.route('**/storage/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'k' }) }));
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      patches.push(JSON.parse(req.postData() || '{}'));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });

  await page.evaluate(async ({ dni }) => {
    const { subirAdjunto } = await import('/src/shared/adjuntos.js');
    const archivo = new File(['x'], 'apto.pdf', { type: 'application/pdf' });
    await subirAdjunto({ dni, etapa: 'preocupacional', tipo: 'apto-medico', file: archivo });
  }, { dni: DNI });

  // El apto médico es de los que se reemplazan: sigue invalidando el previo.
  expect(patches).toHaveLength(1);
  expect(patches[0].vigente).toBe(false);
});

test('El modal de Preocupacional ofrece la caja de adicionales y lista los N archivos', async ({ page }) => {
  await mockStorageYRest(page, [
    { id: 1, dni: DNI, etapa: 'preocupacional', tipo: 'apto-medico', url: 'a.pdf', nombre_archivo: 'Apto Medico - DNI X.pdf', vigente: true, borrado: false, subido_en: '2026-09-20T10:00:00Z' },
    { id: 2, dni: DNI, etapa: 'preocupacional', tipo: 'preocup-adicional', url: 'b.pdf', nombre_archivo: 'Documento adicional 2026-09-20 - DNI X.pdf', vigente: true, borrado: false, subido_en: '2026-09-21T10:00:00Z' },
    { id: 3, dni: DNI, etapa: 'preocupacional', tipo: 'preocup-adicional', url: 'c.pdf', nombre_archivo: 'Documento adicional 2026-09-22 - DNI X.pdf', vigente: true, borrado: false, subido_en: '2026-09-22T10:00:00Z' },
  ]);

  // Las rutas se mockean ANTES de navegar, así el supaInit() de arranque no
  // le pega a la base real.
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function', { timeout: 20000 });

  await page.evaluate(async ({ dni }) => {
    const { DB } = await import('/src/shared/state.js');
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre: 'Test E2E', perfil: 'Administrador total' });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    DB.preocupacionales = DB.preocupacionales || [];
    DB.preocupacionales.push({
      id: 9909031, candidatoId: 9909031, nombre: 'PREOCUPTEST', dni, zona: 'CABA',
      fechaTurno: '01/09/2026', prestador: 'LAB DEMO', resultado: 'APTO', motivo: '',
      estado: 'Pendiente', obs: '', anulado: false,
    });
    window.navTo('preocupacional');
  }, { dni: DNI });
  await page.waitForTimeout(300);

  await page.evaluate(() => window.abrirGestionPreocup('9909031'));
  await expect(page.locator('#modal-preocup-gestion')).toBeVisible();

  // El botón de adicionales existe y el input acepta varios archivos.
  await expect(page.locator('button[onclick*="pr-adjunto-adicional-file"]')).toBeVisible();
  const input = page.locator('#pr-adjunto-adicional-file');
  await expect(input).toHaveAttribute('multiple', '');

  // Los 3 archivos vigentes se listan juntos: el apto y los 2 adicionales.
  await expect(page.locator('#pr-adjunto-lista')).toContainText('Apto Medico');
  await expect(page.locator('#pr-adjunto-lista')).toContainText('Documento adicional');
  await expect(page.locator('#pr-adjunto-lista button[onclick*="verAdjuntoPreocup"]')).toHaveCount(3);
});
