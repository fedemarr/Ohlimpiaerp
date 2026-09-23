import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket "permitir vincular MÁS DE UNA persona al mismo pedido" (23/09).
// Investigado antes de tocar código: el modelo YA soporta varios candidatos
// por pedido — candidato.pedidoVinculadoIdLocal es un campo simple sin
// UNIQUE (sql/v127) y candidatosVinculadosA() ya hace .filter() (array), no
// .find(). Lo único que bloqueaba un segundo candidato era el botón
// "+Vincular" de Seguimiento: dejaba de ofrecerse en cuanto la cantidad de
// candidatos "en proceso" alcanzaba las vacantes libres del pedido, aunque
// esas vacantes no estuvieran REALMENTE cubiertas (nadie hizo el alta
// todavía). No hizo falta ninguna tabla ni migración nueva.

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

async function sembrar(page, { pedido, candidatos }) {
  return page.evaluate(async ({ pedido, candidatos }) => {
    const { DB } = await import('/src/shared/state.js');
    DB.pedidos = DB.pedidos || [];
    DB.pedidos.push(pedido);
    DB.candidatos = DB.candidatos || [];
    DB.candidatos.push(...candidatos);
    window.navTo('pedidos');
    window.cambiarTabPedidos('seguimiento');
  }, { pedido, candidatos });
}

test('Pedido con 1 vacante y 0 candidatos — el flujo de siempre no cambió', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const pedido = { id: 990900001, numero: 901, servicio: 'OBJ.SEG.TEST', supervisor: 'Sup Demo', puesto: 'Operario A', cantidad: 1, fecha: '20/09/2026', estado: 'Pendiente', urgencia: 'Media' };
  await sembrar(page, { pedido, candidatos: [] });
  await page.waitForTimeout(200);

  const fila = page.locator('#tbody-seg-sel tr', { hasText: 'PP-901' });
  await expect(fila).toContainText('Vacante: en búsqueda');
  await expect(fila.locator('button:has-text("+ Vincular")')).toHaveCount(1);
  await expect(fila).not.toContainText('en proceso para');
});

test('Pedido con 1 vacante y 1 candidato ya en proceso — ahora SÍ se puede sumar un segundo (respaldo)', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const pedido = { id: 990900002, numero: 902, servicio: 'OBJ.SEG.TEST', supervisor: 'Sup Demo', puesto: 'Operario A', cantidad: 1, fecha: '20/09/2026', estado: 'Pendiente', urgencia: 'Media' };
  const cand1 = { id: 990900010, apellido: 'Primero', nombre: 'Candidato', dni: '40900010', estado: 'Entrevistado', zona: 'CABA', pedidoVinculadoIdLocal: String(pedido.id) };
  await sembrar(page, { pedido, candidatos: [cand1] });
  await page.waitForTimeout(200);

  const fila = page.locator('#tbody-seg-sel tr', { hasText: 'PP-902' });
  await expect(fila).toContainText('Primero, Candidato'); // el primero se sigue viendo
  await expect(fila).toContainText('1 en proceso para 1 vacante — se puede sumar un candidato de respaldo');
  const btnRespaldo = fila.locator('button:has-text("+ Vincular otro candidato")');
  await expect(btnRespaldo).toBeVisible();

  // Vincular un SEGUNDO candidato al mismo pedido — antes esto era imposible
  // porque el botón "+Vincular" ya no se ofrecía con la vacante "ocupada".
  const cand2 = { id: 990900011, apellido: 'Segundo', nombre: 'Respaldo', dni: '40900011', estado: 'Sin citar', zona: 'CABA' };
  await page.evaluate((c) => import('/src/shared/state.js').then(({ DB }) => DB.candidatos.push(c)), cand2);

  await btnRespaldo.click();
  await expect(page.locator('#modal-ped-vincular')).toBeVisible();
  await expect(page.locator('#vinc-pedido-titulo')).toContainText('ya hay 1 en proceso — este se suma como respaldo');
  await page.fill('#vinc-buscar', 'Segundo');
  await page.click('[data-elegir-cand]');

  await expect(page.locator('#modal-ped-vincular')).toBeHidden();
  const vinculados = await page.evaluate(async (pedidoId) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.candidatos.filter(c => String(c.pedidoVinculadoIdLocal) === String(pedidoId)).map(c => c.apellido);
  }, pedido.id);
  expect(vinculados.sort()).toEqual(['Primero', 'Segundo']); // los DOS quedan vinculados, ninguno se pisó

  const filaActualizada = page.locator('#tbody-seg-sel tr', { hasText: 'PP-902' });
  await expect(filaActualizada).toContainText('Primero, Candidato');
  await expect(filaActualizada).toContainText('Segundo, Respaldo');
});

test('El detalle ("Ver") del pedido lista a TODOS los candidatos vinculados, no solo uno', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const pedido = { id: 990900003, numero: 903, servicio: 'OBJ.SEG.TEST', supervisor: 'Sup Demo', puesto: 'Operario A', cantidad: 1, fecha: '20/09/2026', estado: 'Pendiente', urgencia: 'Media' };
  const cands = [
    { id: 990900020, apellido: 'Uno', nombre: 'A', dni: '40900020', estado: 'Entrevistado', zona: 'CABA', pedidoVinculadoIdLocal: String(pedido.id) },
    { id: 990900021, apellido: 'Dos', nombre: 'B', dni: '40900021', estado: 'Citado', zona: 'CABA', pedidoVinculadoIdLocal: String(pedido.id) },
  ];
  await sembrar(page, { pedido, candidatos: cands });
  await page.waitForTimeout(200);

  await page.evaluate((id) => window.abrirDetallePedidoSeguimiento(id), pedido.id);
  await expect(page.locator('#modal-seg-ver-pedido')).toBeVisible();
  await expect(page.locator('#tbody-seg-ver')).toContainText('Uno, A');
  await expect(page.locator('#tbody-seg-ver')).toContainText('Dos, B');
});

test('Pedido ya cubierto con alta real — no ofrece sumar más candidatos', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const pedido = { id: 990900004, numero: 904, servicio: 'OBJ.SEG.TEST', supervisor: 'Sup Demo', puesto: 'Operario A', cantidad: 1, fecha: '20/09/2026', estado: 'En búsqueda', urgencia: 'Media' };
  const candCubierto = { id: 990900030, apellido: 'Cubrio', nombre: 'La Vacante', dni: '40900030', estado: 'Aprobado', zona: 'CABA', pedidoVinculadoIdLocal: String(pedido.id) };
  await sembrar(page, { pedido, candidatos: [candCubierto] });
  await page.evaluate((dni) => import('/src/shared/state.js').then(({ DB }) => {
    DB.legajos.push({ nro: 990900031, nombre: 'Cubrio La Vacante', dni, estado: 'Activo', ingreso: '20/09/2026' });
  }), candCubierto.dni);
  await page.evaluate(() => window.renderPedidosScreen());
  await page.waitForTimeout(200);

  const fila = page.locator('#tbody-seg-sel tr', { hasText: 'PP-904' });
  await expect(fila).toContainText('1 de 1');
  await expect(fila).not.toContainText('en proceso para');
  await expect(fila.locator('button:has-text("Vincular")')).toHaveCount(0);
});
