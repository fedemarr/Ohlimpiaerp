import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket "filtro por género en Candidatos ACTIVOS" (23/09): hay vacantes
// que piden específicamente M o F y no había forma de filtrar por eso.
// candidatos.genero guarda el valor completo ("Masculino"/"Femenino"/
// "Otro"/vacío) — verificado contra la base real (129 candidatos: 61
// Masculino, 63 Femenino, 1 Otro, 4 sin cargar) — el <select> compacto
// muestra "M"/"F" pero filtra por esos valores reales.
async function sembrarCandidatos(page) {
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.candidatos = DB.candidatos || [];
    DB.candidatos.push(
      { id: 990920001, apellido: 'Varon', nombre: 'Test', dni: '40920001', estado: 'Entrevistado', zona: 'CABA', genero: 'Masculino' },
      { id: 990920002, apellido: 'Mujer', nombre: 'Test', dni: '40920002', estado: 'Entrevistado', zona: 'CABA', genero: 'Femenino' },
      { id: 990920003, apellido: 'SinGenero', nombre: 'Test', dni: '40920003', estado: 'Entrevistado', zona: 'CABA' },
      { id: 990920004, apellido: 'Otro', nombre: 'Test', dni: '40920004', estado: 'Entrevistado', zona: 'Buenos Aires', genero: 'Otro' },
    );
    window.navTo('candidatos');
  });
  await page.waitForTimeout(200);
}

test('Filtro Género — M y F filtran contra el valor real ("Masculino"/"Femenino")', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  await expect(page.locator('#tbody-candidatos')).toContainText('Varon, Test');
  await expect(page.locator('#tbody-candidatos')).toContainText('Mujer, Test');

  await page.selectOption('#cand-filtro-genero', 'Masculino');
  await expect(page.locator('#tbody-candidatos')).toContainText('Varon, Test');
  await expect(page.locator('#tbody-candidatos')).not.toContainText('Mujer, Test');
  await expect(page.locator('#tbody-candidatos')).not.toContainText('SinGenero, Test');
  await expect(page.locator('#tbody-candidatos')).not.toContainText('Otro, Test');

  await page.selectOption('#cand-filtro-genero', 'Femenino');
  await expect(page.locator('#tbody-candidatos')).toContainText('Mujer, Test');
  await expect(page.locator('#tbody-candidatos')).not.toContainText('Varon, Test');
});

test('Sin género cargado no aparece al filtrar por M ni por F, pero sí sin filtro', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  await expect(page.locator('#tbody-candidatos')).toContainText('SinGenero, Test'); // sin filtro, se ve

  await page.selectOption('#cand-filtro-genero', 'Masculino');
  await expect(page.locator('#tbody-candidatos')).not.toContainText('SinGenero, Test');
  await page.selectOption('#cand-filtro-genero', 'Femenino');
  await expect(page.locator('#tbody-candidatos')).not.toContainText('SinGenero, Test');
});

test('Volver a "Género" (sin valor) muestra a todos de nuevo', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  await page.selectOption('#cand-filtro-genero', 'Masculino');
  await page.selectOption('#cand-filtro-genero', '');
  await expect(page.locator('#tbody-candidatos')).toContainText('Varon, Test');
  await expect(page.locator('#tbody-candidatos')).toContainText('Mujer, Test');
  await expect(page.locator('#tbody-candidatos')).toContainText('SinGenero, Test');
});

test('Género se combina con los demás filtros (zona) — AND, no pisa al otro', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarCandidatos(page);

  await page.selectOption('#cand-filtro-zona', 'CABA');
  await page.selectOption('#cand-filtro-genero', 'Femenino');
  await expect(page.locator('#tbody-candidatos')).toContainText('Mujer, Test'); // CABA + Femenino
  await expect(page.locator('#tbody-candidatos')).not.toContainText('Varon, Test'); // CABA pero Masculino
  await expect(page.locator('#tbody-candidatos')).not.toContainText('Otro, Test'); // Femenino... no, es Otro y de Buenos Aires: ninguno de los dos criterios
});
