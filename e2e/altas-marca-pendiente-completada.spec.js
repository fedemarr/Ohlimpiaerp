import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// BUG CRÍTICO real reportado por Fede (30/09/2026): "pasan la etapa
// anterior a Alta de asociados y ya se les hace un perfil en legajos sin
// ser aprobados en esa etapa" — confirmado en producción con datos reales:
// 9 de 10 altas recientes tenían el legajo YA activo mientras su registro
// en cat_alt_pendientes seguía en "Pendiente de alta" para siempre.
//
// Causa raíz: `_toCamel()` (src/shared/supabase.js) reconstruye el `id` de
// cualquier fila recargada desde Supabase a partir de `id_local` — un
// STRING truncado a 9 dígitos — mientras que un registro creado en la
// MISMA sesión tiene `id: Date.now()` (number). confirmarAlta() comparaba
// `a.id === altaId` con `altaId` forzado a number vía parseInt(): apenas
// hay un reload de por medio (el caso normal — Documentación aprueba en
// una sesión, RRHH completa el Alta en otra), la comparación daba SIEMPRE
// false. El legajo se creaba igual (no depende de esto), pero
// cat_alt_pendientes.estado nunca pasaba a "Alta completada".
//
// Este test simula exactamente ese escenario: un registro de
// cat_alt_pendientes con `id` STRING (como queda tras un reload real) y el
// onclick pasando el id como NUMBER (como lo hace el navegador al
// interpolarlo sin comillas en el HTML inline, ver abrirModalAlta()).

async function mockSupabaseGenerico(page) {
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

test('confirmarAlta marca cat_alt_pendientes como "Alta completada" aunque su id haya vuelto de Supabase como string', async ({ page }) => {
  await mockSupabaseGenerico(page);
  await loginComoAdmin(page);

  const DNI = '40888999';
  await page.evaluate((dni) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      // id STRING de 9 dígitos — exactamente el shape que deja _toCamel()
      // al reconstruir `id` desde `id_local` tras un supaInit() real.
      DB.catAltPendientes = DB.catAltPendientes || [];
      DB.catAltPendientes.push({
        id: '888999001', dni, nombre: 'Test Reload String Id', estado: 'Pendiente de alta',
        zona: 'CABA', tel: '1100000000', rrhh: '', identificacion: {}, domicilio: {},
        operativo: {}, uniforme: {}, capital: {}, seguros: {},
      });
    });
  }, DNI);

  // Abrir la Alta pasando el id como NUMBER — así es como el navegador lo
  // entrega desde un onclick inline sin comillas (abrirModalAlta(3, 888999001)),
  // aunque en memoria DB.catAltPendientes[0].id sea el string '888999001'.
  await page.evaluate((idNumerico) => window.abrirModalAlta(-1, idNumerico), 888999001);
  await expect(page.locator('#modal-alta-nuevo')).toBeVisible();

  await page.evaluate(() => window.tabAlta(0));
  await expect(page.locator('#alt-nombre')).toHaveValue('Test Reload String Id');
  await page.fill('#alt-dni', DNI);
  await page.fill('#alt-cuit', '20' + DNI + '9');
  await page.fill('#alt-tel', '1100000000');
  await page.fill('#alt-fec-ingreso', '2026-09-30');
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

  await page.evaluate(() => window.confirmarAlta());
  await page.waitForTimeout(250);
  await expect(page.locator('#modal-alta-nuevo')).toBeHidden();

  const estado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return {
      legajo: DB.legajos.find(l => l.dni === '40888999'),
      pendiente: DB.catAltPendientes.find(a => String(a.id) === '888999001'),
    };
  });
  expect(estado.legajo).toBeTruthy();
  expect(estado.pendiente).toBeTruthy();
  expect(estado.pendiente.estado).toBe('Alta completada');
});
