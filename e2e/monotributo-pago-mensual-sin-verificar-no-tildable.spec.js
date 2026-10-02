import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md 12 "Mientras tanto": las filas que
// el import viejo dejo sin nombre real NO se pueden tildar.
//
// No es cosmetico. En produccion hay 29 filas asi, en 2026-09 y 2026-10.
// OJO: la hipotesis inicial era FALSA y los datos reales la desmentieron. NO
// son importes corruptos: cada fila cuadra con sus componentes y con el Padron,
// y que 8 personas compartan $49.527,18 al centavo es correcto porque son
// todas categoria A, condicion comun, sin adherentes ni IIBB. Lo que esta roto
// es que hay DUPLICADOS (Sequeira Nicole, 4 filas por periodo; Diaz Daniela, 2
// en 2026-10) y HUERFANOS (113, 4734 y 5495 no existen en legajos). Sin esto se
// paga dos veces a la misma persona. Ninguna de las 29 esta pagada todavia.
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

test('Pago mensual - el CSV del banco no incluye las filas excluidas del mes', async ({ page }) => {
  await loginComoAdmin(page);

  const periodo = mesActualISO();
  await page.evaluate((periodo) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monoPagosMes = DB.monoPagosMes || [];
      const base = { periodo, pagado: false, enRevision: false };
      DB.monoPagosMes.push({ ...base, id: Date.now() + 1, nroSocio: '995720', nombre: 'Pago Valido', total: 1000 });
      // Estas dos son lo que deja v185: nombre humano (ya no "sin verificar"),
      // pero excluidas del mes. El CSV es lo que se manda al banco, asi que
      // tienen que estar AFUERA del archivo.
      DB.monoPagosMes.push({
        ...base, id: Date.now() + 2, nroSocio: '995721', nombre: 'Duplicado Excluido',
        total: 49527.18, excluidoMes: true,
        enRevisionMotivo: 'Duplicado del import viejo (v185): la persona ya tiene su fila en el período.',
      });
      DB.monoPagosMes.push({
        ...base, id: Date.now() + 3, nroSocio: '995722', nombre: 'Huerfano Excluido',
        total: 49527.18, excluidoMes: true,
        enRevisionMotivo: 'Sin legajo asociado (v185): N° 995722 no existe en legajos, no es una persona real.',
      });
    });
  }, periodo);

  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('pagos', null); });
  await page.waitForTimeout(200);

  const csv = await page.evaluate(() => new Promise((resolve, reject) => {
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
  }));

  expect(csv).toContain('Pago Valido');
  expect(csv).toContain('995720');
  // El caso que antes se colaba: nombre limpio, asi que la marca
  // [SIN VERIFICAR] no lo frenaba. Sólo el filtro por excluidoMes lo saca.
  expect(csv).not.toContain('995721');
  expect(csv).not.toContain('Duplicado Excluido');
  expect(csv).not.toContain('995722');
  expect(csv).not.toContain('Huerfano Excluido');
});

test('Pago mensual - el comprobante tampoco puede confirmar una fila del import viejo', async ({ page }) => {
  await loginComoAdmin(page);

  const periodo = mesActualISO();
  // 4 filas malas del mismo nro_socio (5581), todas con el CUIT de Sequeira
  // Nicole — el caso real de produccion. El lote matchea por CUIT, asi que sin
  // el guard un solo pago con su comprobante las tildaba de a una.
  await page.evaluate((periodo) => {
    return import('/src/shared/state.js').then(({ DB }) => {
      DB.monotributos = DB.monotributos || [];
      DB.monotributos.push({
        nroSocio: '995710', nombre: 'Sequeira Nicole Test', cuit: '27431832432',
        categoria: 'B', condicion: 'comun', adherentesCantidad: 0, iibbAporta: false,
        estado: 'Activo',
      });
      DB.monoPagosMes = DB.monoPagosMes || [];
      ['5578', '5580', '5578', '5580'].forEach((nombre, i) => {
        DB.monoPagosMes.push({
          id: Date.now() * 10 + 20 + i, periodo, nroSocio: '995710', nombre,
          total: 49527.18, pagado: false, enRevision: false,
        });
      });
    });
  }, periodo);

  const resultado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const mod = await import('/src/modules/monotributo_comprobantes/comprobantes.js');
    const mala = DB.monoPagosMes.find(x => x.nombre === '5578');
    // El guard corta ANTES de subir el archivo, asi que un File falso alcanza:
    // si el guard no estuviera, esto reventaria en el upload.
    const file = new File(['contenido'], 'comprobante.pdf', { type: 'application/pdf' });
    return mod.confirmarComprobantePagoMensual(mala.id, file);
  });

  expect(resultado.ok).toBe(false);

  const estado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.monoPagosMes.filter(x => x.nroSocio === '995710').map(p => ({
      pagado: p.pagado, enRevision: p.enRevision, path: p.comprobantePath ?? null,
    }));
  });
  // Ninguna de las 4 queda pagada ni con comprobante colgado.
  expect(estado).toHaveLength(4);
  for (const f of estado) {
    expect(f.pagado).toBe(false);
    expect(f.path).toBeNull();
  }

  // El toast del camino comprobante es distinto al del tilde manual, pero
  // dice lo mismo: registro del import viejo, no se aplica.
  await expect(page.locator('text=registro del import viejo')).toBeVisible();
});
