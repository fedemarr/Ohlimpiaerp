import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md 12 "Mientras tanto": las filas que
// el import viejo dejo sin nombre real NO se pueden tildar.
//
// No es cosmetico. En produccion hay 29 filas asi y 8 personas distintas
// (Sosa, Cocha, Sequeira, Martinez, Recalde, Avalos, Quiroga, Cacerez) comparten
// el mismo total de $49.527,18 al centavo - imposible que sea un pago real. Y
// los N 5578/5582/5583 aparecen solo dentro del campo nombre, nunca como
// nro_socio: el import les piso la fila y esas personas no estan en ninguna
// lista. Tildar las 24 seria payingles ~$1,2M a fantasma.
//
// La deteccion tiene que calcar la de
// sql/INVESTIGACION_filas_sin_nombre_READONLY.sql, o la app y la conciliacion
// divergen.

function mesActualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Los tres formatos que aparecen en produccion, mas un control con nombre real
// para probar que el guard no come gente que si existe. El nombre no sirve para
// anclar la fila (uno de los casos es solo whitespace), asi que cada caso lleva
// su nro de socio y la fila se busca por ahi.
const CASOS = [
  { etiqueta: 'NUM', nombre: '5578', nro: '995700' },
  { etiqueta: 'NUMCAT', nombre: '113 (B)', nro: '995701' },
  { etiqueta: 'PLACEHOLDER', nombre: 'SOCIO 5581 (sin legajo encontrado)', nro: '995702' },
  { etiqueta: 'VACIO', nombre: '   ', nro: '995703' },
  { etiqueta: 'REAL', nombre: 'PERSONA REAL TEST', nro: '995704' },
];

test('Pago mensual - una fila sin nombre real no se puede tildar, y una con nombre real si', async ({ page }) => {
  await loginComoAdmin(page);

  const periodo = mesActualISO();
  await page.evaluate(({ periodo, casos }) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoPagosMes = DB.monoPagosMes || [];
      casos.forEach((c, i) => {
        DB.monoPagosMes.push({
          id: Date.now() * 10 + i, periodo, nroSocio: String(995700 + i), nombre: c.nombre,
          // el total constante que comparten todas en produccion, a proposito
          total: 49527.18, impIntegradoCongelado: 4952.7, sipaCongelado: 18000,
          obraSocialCongelado: 25000, iibbCongelado: 1574.48,
          pagado: false, enRevision: false,
        });
      });
    });
  }, { periodo, casos: CASOS });

  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(200);

  // 1. Las 4 malas no ofrecen "Tildar pagado"; la buena si.
  for (const { etiqueta, nro } of CASOS) {
    const fila = page.locator('#tbody-mono-pagos tr', { hasText: nro });
    await expect(fila).toHaveCount(1);
    if (etiqueta === 'REAL') {
      await expect(fila.locator('text=Tildar pagado')).toHaveCount(1);
    } else {
      await expect(fila.locator('text=Tildar pagado')).toHaveCount(0);
      await expect(fila).toContainText('sin verificar');
    }
  }

  // 2. El guard en tildarPagoMono: aunque se lo llame a mano (el onclick inline
  //    queda en el DOM de filas ya pintadas y es invocable desde la consola),
  //    no tilda. Esta es la defensa real, no la del boton ausente.
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const p = DB.monoPagosMes.find(x => x.nroSocio === '995700');
    window.tildarPagoMono(p.id);
  });
  await page.waitForTimeout(200);

  const trasTildarAMano = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const p = DB.monoPagosMes.find(x => x.nroSocio === '995700');
    return { pagado: p.pagado, pagadoPor: p.pagadoPor, fecha: p.comprobanteFechaPago };
  });
  expect(trasTildarAMano.pagado).toBe(false);
  expect(trasTildarAMano.pagadoPor).toBeFalsy();
  expect(trasTildarAMano.fecha).toBeFalsy();

  await expect(page.locator('text=No se puede tildar')).toBeVisible();

  // 3. La de nombre real sigue tildando normal - el guard no puede ser
  //    demasiado ancho o deja de pagar a los que si deben.
  const filaReal = page.locator('#tbody-mono-pagos tr', { hasText: '995704' });
  await filaReal.locator('input[type="date"]').fill('2026-09-05');
  await filaReal.locator('text=Tildar pagado').click();
  await page.waitForTimeout(200);

  const realTildada = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monoPagosMes.find(x => x.nroSocio === '995704');
  });
  expect(realTildada.pagado).toBe(true);
  expect(realTildada.metodoPago).toBe('Manual');
});

test('Pago mensual - el CSV que va al banco marca las filas sin verificar', async ({ page }) => {
  await loginComoAdmin(page);

  const periodo = mesActualISO();
  await page.evaluate((periodo) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoPagosMes = DB.monoPagosMes || [];
      DB.monoPagosMes.push({
        id: Date.now(), periodo, nroSocio: '995705', nombre: '5578',
        total: 49527.18, pagado: false, enRevision: false,
      });
    });
  }, periodo);

  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(200);

  const csv = await page.evaluate(() => {
    // exportarMonoPagosCSV() dispara un <a download> con un Blob; interceptamos
    // createObjectURL para leer el texto en vez de pelear con la descarga.
    return new Promise((resolve, reject) => {
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = (blob) => { blob.text().then(resolve); return origCreate.call(URL, blob); };
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      try { window.exportarMonoPagosCSV(); } catch (e) { reject(e); }
      setTimeout(() => {
        URL.createObjectURL = origCreate;
        HTMLAnchorElement.prototype.click = origClick;
        resolve('');
      }, 500);
    });
  });

  // El CSV marca la fila en vez de dropearla: la lista del mes tiene que seguir
  // viéndose entera, pero el archivo que se manda al banco no puede pasar
  // inadvertido un $49.527,18 sin verificar.
  expect(csv).toContain('[SIN VERIFICAR - NO PAGAR] 5578');
  expect(csv).toContain('995705');
});
