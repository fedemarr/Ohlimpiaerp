import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket real (23/09): "Tengo esta última chica que no me deja
// desvincularla del pedido, no es baja ni nada, pero la tengo que colocar
// en otra vacante y no me permite reemplazarla" — no existía ninguna acción
// para soltar el vínculo candidato↔pedido sin rechazar ni dar de baja a la
// persona. Se agrega "🔗 Desvincular" en la fila del candidato "en proceso"
// dentro de Seguimiento.

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

async function sembrar(page) {
  const pedido = { id: 990910001, numero: 911, servicio: 'OBJ.DESV.TEST', supervisor: 'Sup Demo', puesto: 'Operario A', cantidad: 1, fecha: '20/09/2026', estado: 'Pendiente', urgencia: 'Media' };
  const cand = { id: 990910010, apellido: 'Colangelo', nombre: 'Dara Agustina', dni: '40306571', estado: 'Citado', zona: 'CABA', pedidoVinculadoIdLocal: String(pedido.id) };
  await page.evaluate(async ({ pedido, cand }) => {
    const { DB } = await import('/src/shared/state.js');
    DB.pedidos = DB.pedidos || [];
    DB.pedidos.push(pedido);
    DB.candidatos = DB.candidatos || [];
    DB.candidatos.push(cand);
    window.navTo('pedidos');
    window.cambiarTabPedidos('seguimiento');
  }, { pedido, cand });
  await page.waitForTimeout(200);
  return { pedido, cand };
}

test('Seguimiento — "Desvincular" suelta al candidato del pedido sin rechazarlo ni darlo de baja', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const { pedido, cand } = await sembrar(page);

  const fila = page.locator('#tbody-seg-sel tr', { hasText: 'PP-911' });
  await expect(fila).toContainText('Colangelo, Dara Agustina');
  await expect(fila.locator('button:has-text("🔗 Desvincular")')).toBeVisible();

  page.once('dialog', d => d.accept());
  await fila.locator('button:has-text("🔗 Desvincular")').click();
  await page.waitForTimeout(200);

  const c = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.candidatos.find(x => x.id === id);
  }, cand.id);
  expect(c.pedidoVinculadoIdLocal).toBeFalsy();
  expect(c.estado).toBe('Citado'); // sigue en su etapa — no es rechazo ni baja

  const filaActualizada = page.locator('#tbody-seg-sel tr', { hasText: 'PP-911' });
  await expect(filaActualizada).not.toContainText('Colangelo, Dara Agustina');
  await expect(filaActualizada).toContainText('Vacante: en búsqueda'); // la vacante vuelve a quedar libre

  // Y ahora se puede vincular a OTRO pedido sin ningún aviso de conflicto.
  const pedido2 = { id: 990910002, numero: 912, servicio: 'OBJ.DESV.TEST2', supervisor: 'Sup Demo', puesto: 'Operario A', cantidad: 1, fecha: '20/09/2026', estado: 'Pendiente', urgencia: 'Media' };
  await page.evaluate((p) => import('/src/shared/state.js').then(({ DB }) => DB.pedidos.push(p)), pedido2);
  await page.evaluate(() => window.renderPedidosScreen());
  await page.locator('#tbody-seg-sel tr', { hasText: 'PP-912' }).locator('button:has-text("+ Vincular")').click();
  await expect(page.locator('#modal-ped-vincular')).toBeVisible();
  await page.fill('#vinc-buscar', 'Colangelo');
  await expect(page.locator('[data-elegir-cand]')).toContainText('disponible');
  await expect(page.locator('[data-elegir-cand]')).not.toContainText('ya vinculado');
});

test('Cancelar el confirm() de "Desvincular" no cambia nada', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const { cand } = await sembrar(page);

  page.once('dialog', d => d.dismiss());
  await page.locator('button:has-text("🔗 Desvincular")').click();
  await page.waitForTimeout(150);

  const c = await page.evaluate(async (id) => (await import('/src/shared/state.js')).DB.candidatos.find(x => x.id === id), cand.id);
  expect(String(c.pedidoVinculadoIdLocal)).toBe('990910001');
});
