import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// GESTION_HORAS_v2_tipos_sembrado_para_Fede.md §1 y §2 — la regla "FT
// fija". Un contrato con banco de horas mensual (modelo de precio "Por
// EFT" o "Abono mensual fijo") NO se calcula con puestos × calendario:
// es un número pactado que da lo mismo en un mes de 22 hábiles que en uno
// de 21 con feriado. Chango Sarandí es el caso real: 1.118 hs/mes.
//
// Estos tests cubren el sembrado automático (§2) y la edición manual por
// tipo de regla desde el modal (§1) — la lógica pura ya está cubierta en
// calculo.test.js y gestion_horas.test.js.

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

// BUG CRÍTICO real (30/09/2026): `_toSnake()` (src/shared/supabase.js) ya
// tenía `objCodigo` mapeado a 'objetivo_codigo' para OTRA tabla (grillas_liq,
// v040) — el diccionario es global, no por tabla. La columna real de
// `horas_vigencias` es `obj_codigo`, así que CADA guardado de una vigencia
// mandaba la columna equivocada y Supabase lo rechazaba en silencio
// (fire-and-forget, nadie chequeaba el resultado). Confirmado con una
// consulta directa a producción: 0 filas en `horas_vigencias` a pesar de que
// el sembrado automático corre en cada render y debería haber creado
// decenas. Este test inspecciona el PAYLOAD real que se manda a Supabase —
// los tests que solo miran `DB.horasVigencias` en memoria (como los de
// arriba) no detectan este bug porque el objeto en memoria siempre estuvo
// bien armado; lo que fallaba era la traducción a snake_case al guardar.
test('El POST a horas_vigencias manda la columna real obj_codigo (nunca objetivo_codigo)', async ({ page }) => {
  let bodyEnviado = null;
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (req.url().includes('/horas_vigencias') && !bodyEnviado) {
      bodyEnviado = JSON.parse(req.postData() || '{}');
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 990990099, codigo: 'HOR.PAYLOAD.1', nombre: 'Payload Test', estado: 'Operativo', anulado: false,
      modeloPrecio: 'Por EFT', efts: 500, puestos: [],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(300);

  expect(bodyEnviado).toBeTruthy();
  expect(bodyEnviado.obj_codigo).toBe('HOR.PAYLOAD.1');
  expect(bodyEnviado.objetivo_codigo).toBeUndefined();
});

test('Un servicio "Por EFT" sin Personal necesario se siembra solo como FT fija y muestra el MISMO número en todos los meses', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.feriados = [{ fecha: new Date().getFullYear() + '-10-12', nombre: 'Feriado Test', tipo: 'trasladable' }];
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 990990001, codigo: 'HOR.FTIJA.1', nombre: 'Banco Mensual Test', estado: 'Operativo', anulado: false,
      modeloPrecio: 'Por EFT', efts: 1118, puestos: [],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(200);

  // El sembrado corrió en el render (sincronizarVigenciasHoras).
  const vigencia = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.horasVigencias.find(v => v.horasObjCodigo === 'HOR.FTIJA.1');
  });
  expect(vigencia).toBeTruthy();
  expect(vigencia.tipoRegla).toBe('fija');
  expect(Number(vigencia.horasFijasMes)).toBe(1118);
  expect(vigencia.puestos).toEqual([]);

  // Todas las celdas con número dan 1.118 — ninguna baila con el calendario.
  const fila = page.locator('#hor-tbody tr', { hasText: 'HOR.FTIJA.1' });
  await expect(fila).not.toContainText('⚠ sin regla');
  const celdas = fila.locator('td.hor-hs');
  const textos = await celdas.allInnerTexts();
  const conNumero = textos.filter(t => t.replace(/[^\d]/g, '') !== '');
  expect(conNumero.length).toBeGreaterThan(0);
  conNumero.forEach(t => expect(t).toContain('1.118'));
  // Y el detalle describe el banco mensual, no una lista de puestos.
  await page.evaluate(() => window.toggleDetalleHoras('HOR.FTIJA.1'));
  await expect(page.locator('tr.hor-det')).toContainText('FT FIJA');
  await expect(page.locator('tr.hor-det')).toContainText('1.118 hs/mes');
});

test('"Por horas variables" NO se siembra aunque tenga efts (ahí el efts es promedio, no banco pactado)', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 990990002, codigo: 'HOR.VARIABLES.1', nombre: 'Horas Variables Test', estado: 'Operativo', anulado: false,
      modeloPrecio: 'Por horas variables', efts: 800, puestos: [],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(200);

  const fila = page.locator('#hor-tbody tr', { hasText: 'HOR.VARIABLES.1' });
  await expect(fila).toContainText('⚠ sin regla');
  await expect(fila.locator('td.hor-hs').first()).toHaveText('—');
});

test('El modal deja elegir FT fija: oculta Puestos, pide el número, y guarda sin tocar ningún puesto', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 990990003, codigo: 'HOR.MODALFIJA.1', nombre: 'Modal FT Test', estado: 'Operativo', anulado: false,
      modeloPrecio: 'Abono mensual fijo', efts: 0, puestos: [],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(150);

  await page.evaluate(() => window.toggleDetalleHoras('HOR.MODALFIJA.1'));
  await page.waitForTimeout(100);
  await page.locator('tr.hor-det button:has-text("Cargar regla")').first().click();
  await expect(page.locator('#modal-vigencia-horas')).toBeVisible();

  // Arranca en calendario (no hay regla previa) → se ve la sección de puestos.
  await expect(page.locator('#hor-vig-tipo')).toHaveValue('calendario');
  await expect(page.locator('#hor-vig-seccion-puestos')).toBeVisible();
  await expect(page.locator('#hor-vig-fija-row')).toBeHidden();

  // Cambiar a FT fija: aparece el número, desaparece Puestos.
  await page.selectOption('#hor-vig-tipo', 'fija');
  await expect(page.locator('#hor-vig-fija-row')).toBeVisible();
  await expect(page.locator('#hor-vig-seccion-puestos')).toBeHidden();

  // Sin número no se guarda (no se crea una regla fija de 0 hs).
  await page.click('button:has-text("Guardar regla inicial")');
  await page.waitForTimeout(120);
  await expect(page.locator('#modal-vigencia-horas')).toBeVisible();

  await page.fill('#hor-vig-fijas', '860');
  await page.click('button:has-text("Guardar regla inicial")');
  await page.waitForTimeout(200);
  await expect(page.locator('#modal-vigencia-horas')).toBeHidden();

  const guardado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.horasVigencias.find(v => v.horasObjCodigo === 'HOR.MODALFIJA.1');
  });
  expect(guardado.tipoRegla).toBe('fija');
  expect(guardado.horasFijasMes).toBe(860);
  expect(guardado.puestos).toEqual([]);

  // Y la fila muestra 860 en todas las columnas.
  const fila = page.locator('#hor-tbody tr', { hasText: 'HOR.MODALFIJA.1' });
  const textos = await fila.locator('td.hor-hs').allInnerTexts();
  textos.filter(t => t.replace(/[^\d]/g, '') !== '').forEach(t => expect(t).toContain('860'));
});

test('Con tipo calendario ya no es obligatorio elegir la categoría del puesto, sólo el horario', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 990990004, codigo: 'HOR.SINCATEG.1', nombre: 'Sin Categoría Test', estado: 'Operativo', anulado: false, puestos: [],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.toggleDetalleHoras('HOR.SINCATEG.1'));
  await page.waitForTimeout(100);
  await page.locator('tr.hor-det button:has-text("Cargar regla")').first().click();

  await page.evaluate(() => {
    window.agregarPuestoHoras();
    // Sin `puesto` (categoría) — antes esto bloqueaba el guardado.
    window.EDIT_PUESTOS[0].cantidad = 1;
    window.EDIT_PUESTOS[0].horarioDesde = '08:00';
    window.EDIT_PUESTOS[0].horarioHasta = '16:00';
    window.EDIT_PUESTOS[0].dias = { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true };
  });
  await page.click('button:has-text("Guardar regla inicial")');
  await page.waitForTimeout(200);
  await expect(page.locator('#modal-vigencia-horas')).toBeHidden();

  const guardado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.horasVigencias.find(v => v.horasObjCodigo === 'HOR.SINCATEG.1');
  });
  expect(guardado).toBeTruthy();
  expect(guardado.tipoRegla).toBe('calendario');
  expect(guardado.puestos[0].horarioDesde).toBe('08:00');
});