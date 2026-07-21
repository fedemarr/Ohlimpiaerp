// Regresión de dos bugs reales: (1) el reemplazante era texto libre +
// datalist, y si no se clickeaba la sugerencia exacta el sistema no lo
// reconocía aunque el campo se viera completo; (2) el selector de
// asociado (admin) tenía el mismo problema, solucionado con un
// buscador dedicado por N° de socio.
import { test, expect } from '@playwright/test';
import { loginComoAdmin, inyectarLegajo } from './helpers.js';

test('reemplazante es un <select> real, no texto libre', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.abrirNuevaSolicitud());
  await expect(page.locator('#modal-vac-solicitud')).toBeVisible();

  const tagName = await page.locator('#vs-reemplazante').evaluate((el) => el.tagName);
  expect(tagName).toBe('SELECT');
});

test('buscar asociado (admin) por N° de socio lo selecciona sin ambigüedad', async ({ page }) => {
  await loginComoAdmin(page);
  const legajo = await inyectarLegajo(page, { sector: 'Coord. RRHH' });
  await inyectarLegajo(page, { nombre: 'Compañero Reemplazo', sector: 'Coord. RRHH' });

  await page.evaluate(() => window.abrirNuevaSolicitud());
  await page.locator('#vs-admin-asociado-nro').fill(String(legajo.nro));

  await expect(page.locator('#vs-admin-asociado')).toHaveValue(new RegExp(`N°${legajo.nro}\\)$`));
  // El campo Reemplazante se repuebla con gente del mismo sector una
  // vez identificado el asociado — más que solo "Seleccionar..."
  await expect(page.locator('#vs-reemplazante option')).not.toHaveCount(1);
});
