import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

test('Retenes v2 — muestra retén activo con hs fac/no fac/rechazo y detalle', async ({ page }) => {
  await loginComoAdmin(page);

  const mes = new Date().toISOString().slice(0, 7);
  const hoy = new Date().toISOString().slice(0, 10);
  const dias = mes.split('-').reduce((acc, _, i, arr) => acc, null);

  await page.evaluate(async ({ mes, hoy }) => {
    const { DB } = await import('/src/shared/state.js');

    DB.categoriasBase = DB.categoriasBase || [];
    DB.categoriasBase.push({ id: 9, id_local: 'cat_reten_hora_base', codigo: 'CAT-009', nombre: 'Retén Hora Base', anulado: false });

    DB.padronCategoriasAsociado = DB.padronCategoriasAsociado || [];
    DB.padronCategoriasAsociado.push({
      id: Date.now(), legajoNro: 887766, categoriaIdLocal: 9,
      vigenciaDesde: mes + '-01', vigenciaHasta: null, anulado: false,
    });

    DB.legajos = DB.legajos || [];
    DB.legajos.push({ nro: 887766, nombre: 'RETEN E2E TEST', estado: 'Activo' });

    DB.periodosLiq = DB.periodosLiq || [];
    DB.periodosLiq.push({ periodo: mes, congelado: false });

    // día 3 = facturable (10hs), día 4 = no facturable (6hs), día 5 = rechazo (AI)
    const d3 = mes + '-03', d4 = mes + '-04', d5 = mes + '-05';
    DB.grillasLiq = DB.grillasLiq || [];
    DB.grillasLiq.push({
      id: 'GRL-E2E-1', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-E2E', nombre: 'Servicio E2E Uno', supervisor: 'Sup Uno',
      asociados: [{ nombre: 'RETEN E2E TEST', tipoHora: 'facturable', horas: { [d3]: 10, [d5]: 'AI' } }],
    });
    DB.grillasLiq.push({
      id: 'GRL-E2E-2', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-E2E-2', nombre: 'Servicio E2E Dos', supervisor: 'Sup Dos',
      asociados: [{ nombre: 'RETEN E2E TEST', tipoHora: 'no_facturable', horas: { [d4]: 6 } }],
    });

    window.navTo('retenes');
  }, { mes, hoy });

  await page.waitForTimeout(300);

  await expect(page.locator('#screen-retenes')).toBeVisible();
  await expect(page.locator('#kpi-ret-activos')).toHaveText('1');
  await expect(page.locator('#kpi-ret-servicios')).toHaveText('2');
  await expect(page.locator('#kpi-ret-rechazos')).toHaveText('1');
  await expect(page.locator('#kpi-ret-hs')).toContainText('16');
  await expect(page.locator('#kpi-ret-hs')).toContainText('10 fac');
  await expect(page.locator('#kpi-ret-hs')).toContainText('6 no fac');
  await expect(page.locator('#ret-chip-periodo')).toContainText('PERÍODO VIGENTE');

  const fila = page.locator('.fila-reten').first();
  await expect(fila).toContainText('RETEN E2E TEST');
  await expect(fila).toContainText('RETÉN HORA BASE');

  await fila.click();
  await page.waitForTimeout(150);
  await expect(page.locator('#tbody-retenes')).toContainText('Servicio E2E Uno');
  await expect(page.locator('#tbody-retenes')).toContainText('Servicio E2E Dos');
  await expect(page.locator('#tbody-retenes')).toContainText('✅ Facturable');
  await expect(page.locator('#tbody-retenes')).toContainText('❌ No facturable');
  await expect(page.locator('#tbody-retenes')).toContainText('ver grilla');

  await page.screenshot({ path: 'e2e/screenshots/retenes-detalle.png', fullPage: true });

  await page.locator('#tbody-retenes a:has-text("ver grilla")').first().click();
  await page.waitForTimeout(400);
  await expect(page.locator('#screen-liquidacion')).toBeVisible();
  await expect(page.locator('#liq-mes-sel')).toHaveValue(mes);

  // Período congelado — mismo chip que el resto del sistema
  await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    DB.periodosLiq.find(p => p.periodo === mes).congelado = true;
    window.navTo('retenes');
  }, mes);
  await page.waitForTimeout(200);
  await expect(page.locator('#ret-chip-periodo')).toContainText('PERÍODO ANTERIOR');
  await expect(page.locator('#ret-chip-periodo')).toContainText('congelado');
});

test('Retenes v2 — sin retenes activos muestra el estado vacío correcto', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.navTo('retenes'));
  await page.waitForTimeout(300);

  await expect(page.locator('#kpi-ret-activos')).toHaveText('0');
  await expect(page.locator('#tbody-retenes')).toContainText('Sin retenes activos');
  await expect(page.locator('#tbody-retenes')).toContainText('Retén Hora Base');
});
