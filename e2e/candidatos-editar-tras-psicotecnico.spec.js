import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket #186 (Jimena): "después de que la persona avanza de la fase de
// candidatos a psicotécnico permitir editar los datos".
//
// La causa era una sola línea: 'Psicotecnico' estaba en `estadosHist`, así
// que al avanzar a psicotécnico el candidato se iba de la tab Activos a la
// Hist.rico — y en Hist.rico el único botón es "Eliminar". Es decir: los
// datos quedaban congelados sin ninguna forma de corregirlos.
//
// Acá se verifica que el estado vuelve a Activos, que el botón de editar
// está, y que el modal abre precargado. También que Rechazado sigue en
// Histórico (el split no se rompió de más).

async function sembrar(page) {
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.candidatos = DB.candidatos || [];
    DB.candidatos.push(
      { id: 9908021, apellido: 'PSICOTEST', nombre: 'Candidato', dni: '30980821', cuit: '20-30980821-9', estado: 'Psicotecnico', zona: 'CABA', tel: '1100000000', calle: 'Calle Falsa 123' },
      { id: 9908022, apellido: 'RECHTEST', nombre: 'Candidato', dni: '30980822', cuit: '20-30980822-8', estado: 'Rechazado', zona: 'CABA', calle: 'Calle Falsa 456', motivoRechazo: 'Noшёл a la entrevista' },
    );
    window.navTo('candidatos');
  });
  await page.waitForTimeout(300);
}

test('Un candidato en Psicotécnico queda en Activos (no se va al Histórico)', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrar(page);

  // Activos es la sub-tab por defecto.
  await expect(page.locator('#tbody-candidatos')).toContainText('PSICOTEST, Candidato');
  await expect(page.locator('#tbody-candidatos')).not.toContainText('RECHTEST, Candidato');

  await page.evaluate(() => window.tabCandidatos('historico'));
  await expect(page.locator('#tbody-candidatos')).not.toContainText('PSICOTEST, Candidato');
  await expect(page.locator('#tbody-candidatos')).toContainText('RECHTEST, Candidato');
});

test('El candidato en Psicotécnico tiene botón de editar y el modal abre precargado', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrar(page);

  const fila = page.locator('#tbody-candidatos tr').filter({ hasText: 'PSICOTEST' });
  const btnEditar = fila.locator('button[data-action="editar"]');
  await expect(btnEditar).toBeVisible();

  await btnEditar.click();
  await expect(page.locator('#modal-candidato')).toBeVisible();
  await expect(page.locator('#c-apellido')).toHaveValue('PSICOTEST');
  await expect(page.locator('#c-nombre')).toHaveValue('Candidato');
  await expect(page.locator('#c-dni')).toHaveValue('30980821');
  await expect(page.locator('#c-cuit')).toHaveValue('20-30980821-9');
  // El estado precargado es el que tenía, no uno por defecto.
  await page.evaluate(() => window.cerrarModal('modal-candidato'));
});

test('Editar un dato y guardar mueve el dato al candidato en Psicotécnico', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await loginComoAdmin(page);
  await sembrar(page);

  await page.locator('#tbody-candidatos tr').filter({ hasText: 'PSICOTEST' })
    .locator('button[data-action="editar"]').click();
  await expect(page.locator('#modal-candidato')).toBeVisible();

  await page.fill('#c-nombre', 'Nombre Corregido');
  await page.click('button[onclick="guardarCandidato()"]');
  await page.waitForTimeout(400);

  const guardado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const c = DB.candidatos.find(x => x.dni === '30980821');
    return { nombre: c?.nombre, estado: c?.estado };
  });
  expect(guardado.nombre).toBe('Nombre Corregido');
  // Editar NO debe cambiar el estado del circuito.
  expect(guardado.estado).toBe('Psicotecnico');
});
