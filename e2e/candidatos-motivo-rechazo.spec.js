import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket "Sacar un filtro de ACTIVOS": la columna "Motivo rechazo" vivía en
// el <thead> ÚNICO compartido por las 3 sub-tabs de "Base de candidatos"
// (Precandidatos/Activos/Histórico apuntan al mismo <table>). En Activos —
// la solapa principal (tab por defecto) — ningún candidato puede tener
// motivoRechazo (Rechazado/Baja/etc. quedan excluidos de ese filtro), así
// que la columna se veía siempre en "—". Ahora solo se muestra en Histórico.
async function sembrarCandidatos(page) {
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.candidatos = DB.candidatos || [];
    DB.candidatos.push(
      { id: 990800001, apellido: 'Activo', nombre: 'Test', dni: '40800001', estado: 'Entrevistado', zona: 'CABA' },
      { id: 990800002, apellido: 'Rechazado', nombre: 'Test', dni: '40800002', estado: 'Rechazado', zona: 'CABA', motivoRechazo: 'No se presentó a la segunda entrevista' },
      { id: 990800003, apellido: 'Precand', nombre: 'Test', dni: '40800003', estado: 'Precandidato', zona: 'CABA' },
    );
    window.navTo('candidatos');
  });
  await page.waitForTimeout(200);
}

test('Activos (solapa principal) — la columna "Motivo rechazo" no se muestra', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  // "activos" es la sub-tab por defecto al entrar al módulo.
  await expect(page.locator('#th-cand-motivo')).toBeHidden();
  await expect(page.locator('#tbody-candidatos')).toContainText('Activo, Test');
  await expect(page.locator('#tbody-candidatos')).not.toContainText('Rechazado, Test'); // no aplica a Activos
  // Ninguna celda de la fila visible dice "Motivo rechazo" ni arrastra un "—" residual de esa columna.
  const columnas = await page.locator('#tbody-candidatos tr').first().locator('td').count();
  const columnasHeader = await page.locator('thead th:visible').count();
  expect(columnas).toBe(columnasHeader);
});

test('Histórico — la columna "Motivo rechazo" sigue existiendo con el detalle real', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  await page.evaluate(() => window.tabCandidatos('historico'));
  await expect(page.locator('#th-cand-motivo')).toBeVisible();
  await expect(page.locator('#tbody-candidatos')).toContainText('No se presentó a la segunda entrevista');

  const columnas = await page.locator('#tbody-candidatos tr').first().locator('td').count();
  const columnasHeader = await page.locator('thead th:visible').count();
  expect(columnas).toBe(columnasHeader);
});

test('Precandidatos — tampoco se muestra la columna (nadie ahí tiene motivo de rechazo)', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  await page.evaluate(() => window.tabCandidatos('precandidatos'));
  await expect(page.locator('#th-cand-motivo')).toBeHidden();
  await expect(page.locator('#tbody-candidatos')).toContainText('Precand, Test');
});

test('Volver de Histórico a Activos vuelve a ocultar la columna (toggle en los dos sentidos)', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  await page.evaluate(() => window.tabCandidatos('historico'));
  await expect(page.locator('#th-cand-motivo')).toBeVisible();
  await page.evaluate(() => window.tabCandidatos('activos'));
  await expect(page.locator('#th-cand-motivo')).toBeHidden();
});
