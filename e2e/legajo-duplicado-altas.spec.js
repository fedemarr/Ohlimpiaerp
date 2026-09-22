import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Caso real "Luque Balmaceda" (22/09): la persona seguía "Pendiente de
// alta" en Altas de asociados porque ya había entrado a Legajos por el
// importador masivo de CSV (un camino totalmente aparte del flujo
// Candidatos → ... → Altas), con el DNI tipeado distinto en cada lado — el
// guard por DNI de confirmarAlta() no lo detectaba. Cubre las tres piezas
// del fix: el aviso + auto-completado del importador, el aviso por nombre
// de Altas, y el guard de doble envío.

async function mockSupabaseGenerico(page) {
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

const CSV_HEADER = 'nro_socio,apellido,nombre,dni,fecha_nac,cuit,estado_civil,fecha_ingreso,servicio_actual,funcion,supervisor_actual,nacionalidad,calle,numero,piso,dpto,localidad,cp,cel_personal,calzado,ambo,chomba,grafa,genero,mails,clave_fiscal,banco';
function filaCSV(vals) {
  const m = { nro_socio: '', apellido: '', nombre: '', dni: '', fecha_nac: '', cuit: '', estado_civil: '', fecha_ingreso: '01/09/2026', servicio_actual: 'Objetivo Demo', funcion: 'Operario', supervisor_actual: 'Sup Demo', nacionalidad: 'Argentina', calle: '', numero: '', piso: '', dpto: '', localidad: '', cp: '', cel_personal: '', calzado: '', ambo: '', chomba: '', grafa: '', genero: '', mails: '', clave_fiscal: '', banco: '', ...vals };
  return CSV_HEADER.split(',').map(k => m[k]).join(',');
}

test('Importador CSV — avisa si la persona sigue "Pendiente de alta" y, al importar, la marca completada', async ({ page }) => {
  await mockSupabaseGenerico(page);
  await loginComoAdmin(page);

  await page.evaluate(() => {
    const win = window;
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.catAltPendientes = DB.catAltPendientes || [];
      DB.catAltPendientes.push({
        id: 777001, id_local: '777001', dni: '36381955', nombre: 'Balmaceda \t Marcelo Daniel Luque',
        estado: 'Pendiente de alta', zona: 'Zona Norte',
      });
    });
  });

  await page.evaluate(() => window.abrirImportadorLegajos());
  const csv = CSV_HEADER + '\n' + filaCSV({ nro_socio: '5582', apellido: 'Luque Balmaceda', nombre: 'Marcelo Daniel', dni: '31979724' }) + '\n';
  await page.setInputFiles('#imp-leg-file', { name: 'legajos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await page.waitForTimeout(200);

  // El aviso aparece aunque el DNI sea distinto (matchea por nombre normalizado).
  await expect(page.locator('#imp-leg-preview')).toContainText('Pendiente de alta');
  await expect(page.locator('#imp-leg-preview')).toContainText('se marca como completada');

  await page.evaluate(() => window.confirmarImportacionLegajos());
  await page.waitForTimeout(300);

  const estado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.catAltPendientes.find(a => a.id === 777001).estado;
  });
  expect(estado).toBe('Alta completada');
  const legajoImportado = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.legajos.find(l => l.dni === '31979724'));
  expect(legajoImportado).toBeTruthy();
  expect(legajoImportado.nro).toBe(5582);
});

test('Altas — nombre parecido a un legajo activo con OTRO DNI avisa antes de confirmar (no bloquea DNI distintos legítimos)', async ({ page }) => {
  await mockSupabaseGenerico(page);
  await loginComoAdmin(page);

  await page.evaluate(() => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.legajos.push({ nro: 5582, nombre: 'Luque Balmaceda Marcelo Daniel', dni: '31979724', estado: 'Activo' });
    });
  });

  const llenarFormularioAlta = async (dni) => {
    await page.evaluate(() => window.abrirModalAlta());
    await expect(page.locator('#modal-alta-nuevo')).toBeVisible();
    await page.evaluate(() => window.tabAlta(0));
    await page.fill('#alt-nombre', 'Balmaceda Marcelo Daniel Luque');
    await page.fill('#alt-dni', dni);
    await page.fill('#alt-cuit', '20' + dni + '9');
    await page.fill('#alt-tel', '1100000000');
    await page.fill('#alt-fec-ingreso', '2026-09-22');
    await page.evaluate(() => window.tabAlta(1));
    await page.fill('#alt-direccion', 'Calle Falsa 123');
    await page.selectOption('#alt-zona', 'CABA');
    await page.evaluate(() => window.tabAlta(2));
    await page.selectOption('#alt-funcion', { index: 1 });
    await page.selectOption('#alt-categoria', { index: 1 });
    await page.evaluate(() => window.tabAlta(3));
    await page.fill('#alt-calzado', '42');
    await page.evaluate(() => window.tabAlta(4));
    await page.fill('#alt-integracion', '1000');
    await page.evaluate(() => window.tabAlta(5));
    await page.selectOption('#alt-seguro', 'Básico');
  };

  // Cancelando el confirm(): no se crea un segundo legajo duplicado.
  await llenarFormularioAlta('36381955');
  page.once('dialog', d => d.dismiss());
  await page.evaluate(() => window.confirmarAlta());
  await page.waitForTimeout(200);
  let nLegajos = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.legajos.filter(l => l.dni === '36381955').length);
  expect(nLegajos).toBe(0);
  await expect(page.locator('#modal-alta-nuevo')).toBeVisible();

  // Aceptando el confirm(): sigue siendo el humano quien decide (puede ser
  // una persona distinta con el mismo nombre) — el alta se completa.
  page.once('dialog', d => d.accept());
  await page.evaluate(() => window.confirmarAlta());
  await page.waitForTimeout(200);
  nLegajos = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.legajos.filter(l => l.dni === '36381955').length);
  expect(nLegajos).toBe(1);
});

test('Altas — el botón se deshabilita mientras confirma, evitando un doble envío', async ({ page }) => {
  // Respuesta lenta a propósito para poder pescar el botón deshabilitado
  // en pleno guardado y confirmar que un segundo click no dispara nada más.
  let posts = 0;
  await page.route('**/rest/v1/**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (route.request().url().includes('/legajos')) {
      posts++;
      await new Promise(r => setTimeout(r, 400));
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await loginComoAdmin(page);

  await page.evaluate(() => window.abrirModalAlta());
  await page.evaluate(() => window.tabAlta(0));
  await page.fill('#alt-nombre', 'Test E2E Doble Click');
  await page.fill('#alt-dni', '40777888');
  await page.fill('#alt-cuit', '20407778889');
  await page.fill('#alt-tel', '1100000000');
  await page.fill('#alt-fec-ingreso', '2026-09-22');
  await page.evaluate(() => window.tabAlta(1));
  await page.fill('#alt-direccion', 'Calle Falsa 123');
  await page.selectOption('#alt-zona', 'CABA');
  await page.evaluate(() => window.tabAlta(2));
  await page.selectOption('#alt-funcion', { index: 1 });
  await page.selectOption('#alt-categoria', { index: 1 });
  await page.evaluate(() => window.tabAlta(3));
  await page.fill('#alt-calzado', '42');
  await page.evaluate(() => window.tabAlta(4));
  await page.fill('#alt-integracion', '1000');
  await page.evaluate(() => window.tabAlta(5));
  await page.selectOption('#alt-seguro', 'Básico');

  const p1 = page.evaluate(() => window.confirmarAlta());
  await page.waitForTimeout(50);
  await expect(page.locator('#alta-btn-cta')).toBeDisabled();
  await page.evaluate(() => window.confirmarAlta()); // segundo click mientras el primero sigue en curso
  await p1;
  await page.waitForTimeout(100);

  expect(posts).toBe(1);
  await expect(page.locator('#alta-btn-cta')).toBeEnabled();
  const nLegajos = await page.evaluate(async () => (await import('/src/shared/state.js')).DB.legajos.filter(l => l.dni === '40777888').length);
  expect(nLegajos).toBe(1);
});
