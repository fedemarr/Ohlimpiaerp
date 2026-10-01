import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket (reporte de usuario, captura adjunta, 01/10/2026): en la matriz de
// Gestión de horas, al hacer scroll vertical la fila de meses desaparecía
// y los valores "HS"/"Δ" no quedaban alineados con su columna.
//
// Causa real: el thead tiene DOS filas (meses arriba con colspan=2 por
// mes, HS/Δ abajo) — la regla genérica .tabla-wrap thead th le daba
// top:0 a las DOS por igual, así que al pegarse sticky la fila de abajo
// quedaba pintada ENCIMA de la de arriba en la misma posición. De paso,
// los <th>HS</th><th>Δ</th> generados no tenían text-align, heredaban
// "left" de la regla global mientras las celdas de datos usan
// text-align:right — quedaban desalineados.
//
// OJO al medir en Playwright: position:sticky se aplica a los <th>, NO al
// <tr> que los contiene — el <tr> nunca "se mueve" de su posición natural
// en el flujo de la tabla aunque sus celdas sí queden fijas visualmente.
// Medir boundingBox() de un <tr> da un falso negativo.

async function sembrarServicios(page, n = 15) {
  await page.evaluate((n) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.objetivos = DB.objetivos || [];
      for (let i = 0; i < n; i++) {
        DB.objetivos.push({
          id: 993200000 + i, codigo: 'E2E.STICKY.' + i, nombre: 'Servicio Sticky E2E ' + i,
          estado: 'Operativo', anulado: false,
          puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true, martes: true } }],
        });
      }
      window.navTo('gestion_horas');
    });
  }, n);
  await page.waitForTimeout(500);
}

test('La fila de meses y la fila HS/Δ quedan apiladas y visibles al hacer scroll — no se superponen ni desaparecen', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarServicios(page);

  const monthTh = page.locator('#hor-thead tr.hor-thead-r1 th').nth(1);
  const hsTh = page.locator('#hor-thead tr.hor-thead-r2 th').first();

  const topesSinScroll = { mes: (await monthTh.boundingBox()).y, hs: (await hsTh.boundingBox()).y };

  await page.evaluate(() => { document.querySelector('#screen-gestion_horas .tabla-wrap').scrollTop = 500; });
  await page.waitForTimeout(300);

  // Ambas filas se quedan en el MISMO lugar que antes de scrollear (eso es
  // justamente "sticky" funcionando) — nunca se van de la pantalla.
  await expect(monthTh).toBeVisible();
  await expect(hsTh).toBeVisible();
  const topesConScroll = { mes: (await monthTh.boundingBox()).y, hs: (await hsTh.boundingBox()).y };
  expect(topesConScroll.mes).toBeCloseTo(topesSinScroll.mes, 0);
  expect(topesConScroll.hs).toBeCloseTo(topesSinScroll.hs, 0);

  // Las dos filas quedan UNA DEBAJO DE LA OTRA, no superpuestas: la fila
  // HS/Δ empieza justo donde termina la de meses (con tolerancia de 1px).
  const altoFilaMeses = (await monthTh.boundingBox()).height;
  expect(topesConScroll.hs).toBeGreaterThanOrEqual(topesConScroll.mes + altoFilaMeses - 1);

  // El contenido de la fila de meses sigue siendo LEGIBLE (no tapado).
  await expect(monthTh).toContainText('/');
});

test('Los valores HS/Δ quedan alineados a la derecha, igual que las celdas de datos', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarServicios(page, 2);

  const hsTh = page.locator('#hor-thead tr.hor-thead-r2 th').first();
  const deltaTh = page.locator('#hor-thead tr.hor-thead-r2 th').nth(1);
  await expect(hsTh).toHaveCSS('text-align', 'right');
  await expect(deltaTh).toHaveCSS('text-align', 'right');

  // La celda de datos de HS (primera fila, primera columna de mes) ya
  // usaba text-align:right — ahora coincide con su header.
  const primeraCeldaHs = page.locator('#hor-tbody tr').first().locator('td.hor-hs').first();
  await expect(primeraCeldaHs).toHaveCSS('text-align', 'right');
});
