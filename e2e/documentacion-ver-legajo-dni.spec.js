import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket "Ver legajo abre a otra persona" (Riveros Bastias Carolina del
// Valle / Luque Balmaceda Marcelo Daniel): la fila de Documentación de
// ingreso → Histórico de Carolina resolvía "Ver Legajo" por DNI, y su
// registro tenía cargado (mal) el DNI real de Marcelo — el botón abría
// SU legajo sin ningún aviso. Causa raíz: un dato mal cargado, no un bug
// de índice/closure. El fix agrega una señal de seguridad: si el legajo
// encontrado por DNI no comparte ni una palabra con el nombre de este
// registro, se avisa en vez de ofrecer el link.

test('DNI cargado mal (coincide con el de otra persona) → aviso, no el link a "Ver Legajo"', async ({ page }) => {
  await loginComoAdmin(page);

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const DNI_COMPARTIDO = '31979724'; // el DNI real es de Marcelo, mal cargado en el registro de Carolina

    DB.legajos = DB.legajos || [];
    DB.legajos.push({ nro: 5582, nombre: 'Luque Balmaceda Marcelo Daniel', dni: DNI_COMPARTIDO, estado: 'Activo', servicio: 'OBJ.MARCELO' });

    DB.catAltPendientes = DB.catAltPendientes || [];
    DB.catAltPendientes.push({ id: 9001, dni: DNI_COMPARTIDO, estado: 'Alta completada' });

    DB.documentacionIngreso = DB.documentacionIngreso || [];
    DB.documentacionIngreso.push({
      id: 9002, nombre: 'Riveros Bastias Carolina Del Valle', dni: DNI_COMPARTIDO, zona: 'Zona Sur',
      estado: 'Aprobado', anulado: false, antecResultado: 'Sin antecedentes',
    });

    window.navTo('documentacion');
    window.tabDocum('historico');
  });
  await page.waitForTimeout(150);

  const fila = page.locator('#tbody-docum tr', { hasText: 'Riveros Bastias Carolina' });
  await expect(fila).toContainText('DNI no coincide');
  await expect(fila.locator('button:has-text("Ver Legajo")')).toHaveCount(0);
});

test('DNI correcto (coincide de verdad) → sigue mostrando el link a "Ver Legajo"', async ({ page }) => {
  await loginComoAdmin(page);

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const DNI = '40111222';

    DB.legajos = DB.legajos || [];
    DB.legajos.push({ nro: 6001, nombre: 'Fernandez Laura', dni: DNI, estado: 'Activo', servicio: 'OBJ.LAURA' });

    DB.catAltPendientes = DB.catAltPendientes || [];
    DB.catAltPendientes.push({ id: 9003, dni: DNI, estado: 'Alta completada' });

    DB.documentacionIngreso = DB.documentacionIngreso || [];
    DB.documentacionIngreso.push({
      id: 9004, nombre: 'Fernandez Laura', dni: DNI, zona: 'CABA',
      estado: 'Aprobado', anulado: false, antecResultado: 'Sin antecedentes',
    });

    window.navTo('documentacion');
    window.tabDocum('historico');
  });
  await page.waitForTimeout(150);

  const fila = page.locator('#tbody-docum tr', { hasText: 'Fernandez Laura' });
  await expect(fila).toContainText('ver Legajo');
  await expect(fila).not.toContainText('DNI no coincide');
});
