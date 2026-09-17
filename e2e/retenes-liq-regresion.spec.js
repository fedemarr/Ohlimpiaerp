import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Regresión: antes de este ticket, un retén con horas cargadas en la
// grilla se contaba dos veces en Liquidaciones — una vez en "1.
// Servicios" (que no filtra por tipoHora) y otra en el bloque "4.
// Retenes" (ahora eliminado). Confirmamos que aparece UNA sola vez.
test('Liquidaciones — un retén con horas de grilla aparece una sola vez, no duplicado', async ({ page }) => {
  await loginComoAdmin(page);

  const mes = new Date().toISOString().slice(0, 7);

  await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');

    DB.categoriasBase = DB.categoriasBase || [];
    DB.categoriasBase.push({ id: 9, id_local: 'cat_reten_hora_base', codigo: 'CAT-009', nombre: 'Retén Hora Base', anulado: false });
    DB.padronCategoriasAsociado = DB.padronCategoriasAsociado || [];
    DB.padronCategoriasAsociado.push({ id: Date.now(), legajoNro: 887799, categoriaIdLocal: 9, vigenciaDesde: mes + '-01', vigenciaHasta: null, anulado: false });

    DB.legajos = DB.legajos || [];
    DB.legajos.push({ nro: 887799, nombre: 'RETEN LIQ REGRESION', estado: 'Activo', funcion: 'Retén', servicio: 'OBJ-LIQ-E2E', supervisor: 'Sup Regresion', cuit: '20887799001' });

    DB.grillasLiq = DB.grillasLiq || [];
    DB.grillasLiq.push({
      id: 'GRL-LIQ-E2E', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-LIQ-E2E', nombre: 'Servicio Liq E2E', supervisor: 'Sup Regresion',
      asociados: [{ nombre: 'RETEN LIQ REGRESION', tipoHora: 'facturable', horas: { [mes + '-03']: 8 } }],
    });

    window.navTo('liquidacion');
  }, mes);

  await page.waitForTimeout(300);
  await page.evaluate(() => window.tabLiquidacion && window.tabLiquidacion('liquidaciones'));
  await page.waitForTimeout(300);
  await page.evaluate((mes) => {
    const sel = document.getElementById('lqs-mes-sel');
    if (sel) sel.value = mes;
    window.renderLiquidaciones && window.renderLiquidaciones();
  }, mes);
  await page.waitForTimeout(300);

  const filas = page.locator('#tbody-lqs tr', { hasText: 'RETEN LIQ REGRESION' });
  await expect(filas).toHaveCount(1);
});
