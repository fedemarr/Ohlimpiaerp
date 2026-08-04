// Bug real reportado por Gabi (RRHH): el CSV exportado desde Excel con
// configuración regional argentina usa ';' como separador (la coma queda
// reservada para decimales). El parser de importadorHistorico.js asumía
// ',' fijo — con ';' cada fila entera caía en un solo campo, ningún
// encabezado matcheaba, todas las filas quedaban inválidas y el botón
// "Confirmar importación" (que solo aparece si hay filas válidas) nunca
// se mostraba. Este test cubre el caso semicolon-delimited.
import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

const CSV_SEMICOLON =
  'Fecha;Entrevistadora;Modalidad de Entrevista;Apellidos;Nombres;DNI;Género;Teléfono de Contacto;Zona de Residencia;EVALUACIÓN FINAL\n' +
  '28/07/2026;Jimena;Virtual;"Pérez, Gómez";Juan;40111222;M;1150001111;CABA;Aprobado\n' +
  '29/07/2026;Jimena;Presencial;Fernández;Ana;40333444;F;1150002222;Zona Sur;Desaprobado\n';

test('importar histórico reconoce CSV separado por ; (Excel Argentina) y muestra el botón Confirmar', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(() => window.navTo('candidatos'));
  await page.evaluate(() => window.tabCandPrincipal('importar'));

  const fileInput = page.locator('#imp-cand-file');
  await fileInput.setInputFiles({
    name: 'entrevistas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV_SEMICOLON, 'utf-8'),
  });

  const resumen = page.locator('#imp-cand-resumen');
  await expect(resumen).toContainText('2 lista(s) para importar');
  await expect(resumen).toContainText('0 con problemas');

  const filas = page.locator('#imp-cand-preview tbody tr');
  await expect(filas).toHaveCount(2);
  await expect(filas.nth(0)).toContainText('Pérez, Gómez, Juan');
  await expect(filas.nth(0)).toContainText('40111222');
  await expect(filas.nth(0)).toContainText('Aprobado → Aprobado');
  await expect(filas.nth(1)).toContainText('Fernández, Ana');
  await expect(filas.nth(1)).toContainText('40333444');
  await expect(filas.nth(1)).toContainText('Desaprobado → Rechazado');

  const btnConfirmar = page.locator('#btn-confirmar-importacion-candidatos');
  await expect(btnConfirmar).toBeVisible();
});

test('confirmar importación con CSV ; guarda los candidatos (mock de Supabase)', async ({ page }) => {
  await page.route('**/rest/v1/candidatos**', (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });

  await loginComoAdmin(page);
  await page.evaluate(() => window.navTo('candidatos'));
  await page.evaluate(() => window.tabCandPrincipal('importar'));

  await page.locator('#imp-cand-file').setInputFiles({
    name: 'entrevistas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV_SEMICOLON, 'utf-8'),
  });

  await expect(page.locator('#btn-confirmar-importacion-candidatos')).toBeVisible();
  await page.locator('#btn-confirmar-importacion-candidatos').click();

  await expect(page.locator('.toast, #toast')).toContainText('importado', { timeout: 10000 });
});
