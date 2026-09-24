import { test, expect } from '@playwright/test';
import { loginComoAdmin, inyectarLegajo } from './helpers.js';

// DOTACION_para_Fede.md + mockup_dotacion_1.html — tablero de SOLO
// LECTURA para el Gerente de Operaciones: cuántos operarios activos hay,
// de qué categoría, y dónde están asignados. No carga nada: lee legajos
// + categorías + licencias + prepedidos/pedidos que ya existen.

test('Menú — Dotación vive en Operaciones y renderiza KPIs + tabla', async ({ page }) => {
  await loginComoAdmin(page, 'Operaciones');
  await page.evaluate(() => { window.navTo('dotacion'); });
  await expect(page.locator('#screen-dotacion')).toBeVisible();
  await expect(page.locator('#topbar-title')).toContainText('Dotación');
  await expect(page.locator('#dot-k-act')).toBeVisible();
});

test('Operario activo con servicio aparece TRABAJANDO; sin categoría en el padrón muestra el chip de alerta', async ({ page }) => {
  await loginComoAdmin(page);
  await inyectarLegajo(page, { nro: 700001, nombre: 'Camacho Solis Katherine', servicio: 'CIBRA', supervisor: 'C. Cazenave', zona: 'CABA' });
  await page.evaluate(() => { window.navTo('dotacion'); });
  await page.waitForTimeout(150);

  const fila = page.locator('#dot-tbody tr', { hasText: 'Camacho Solis Katherine' });
  await expect(fila).toContainText('🟢 TRABAJANDO');
  await expect(fila).toContainText('CIBRA');
  await expect(fila).toContainText('⚠ sin categoría'); // sin registro en el padrón de categorías (v124)
});

test('Un administrativo (legajo.servicio=ADMINISTRATIVO) y un supervisor por nombre NO aparecen en el tablero', async ({ page }) => {
  await loginComoAdmin(page);
  await inyectarLegajo(page, { nro: 700002, nombre: 'Admin Uno', servicio: 'ADMINISTRATIVO' });
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.supervisores = DB.supervisores || [];
    DB.supervisores.push('Supervisor Dos');
  });
  await inyectarLegajo(page, { nro: 700003, nombre: 'Supervisor Dos', servicio: 'CIBRA' });
  await page.evaluate(() => { window.navTo('dotacion'); });
  await page.waitForTimeout(150);

  await expect(page.locator('#dot-tbody')).not.toContainText('Admin Uno');
  await expect(page.locator('#dot-tbody')).not.toContainText('Supervisor Dos');
});

test('Un caso ABIERTO en Enfermos y accidentes marca al operario EN ARTÍCULO con la fecha y el origen', async ({ page }) => {
  await loginComoAdmin(page);
  await inyectarLegajo(page, { nro: 700004, nombre: 'Benítez Rosa', servicio: 'CHANGO.PILAR' });
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.casosEnfermosAccidentes = DB.casosEnfermosAccidentes || [];
    DB.casosEnfermosAccidentes.push({ nroSocio: '700004', estado: 'Abierto', fechaInicio: '12/09/2026', tipoCaso: 'Enfermedad', anulado: false });
  });
  await page.evaluate(() => { window.navTo('dotacion'); });
  await page.waitForTimeout(150);

  const fila = page.locator('#dot-tbody tr', { hasText: 'Benítez Rosa' });
  await expect(fila).toContainText('🟡 EN ARTÍCULO');
  await expect(fila).toContainText('12/09/2026');
  await expect(fila).toContainText('Enfermos y accidentes');
});

test('La banca (sin servicio) + botón "↔ Asignar" abre Reubicación con el operario precargado', async ({ page }) => {
  await loginComoAdmin(page);
  await inyectarLegajo(page, { nro: 700005, nombre: 'Pérez Jonathan', servicio: '' });
  await page.evaluate(() => { window.navTo('dotacion'); });
  await page.waitForTimeout(150);

  const filaBanca = page.locator('#dot-tbody tr', { hasText: 'Pérez Jonathan' });
  await expect(filaBanca).toContainText('⚪ SIN SERVICIO');
  await expect(page.locator('#dot-banca')).toContainText('Pérez Jonathan');

  await page.locator('#dot-banca button:has-text("↔ Asignar")').click();
  await expect(page.locator('#modal-reasignacion')).toBeVisible();
  await expect(page.locator('#reas-asociado')).toHaveValue(/Pérez Jonathan/);
});

test('Un servicio con vacantes sin cubrir aparece en "dotación incompleta" con su PRE-N', async ({ page }) => {
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const o = {
      id: 990300222, codigo: 'DOT.INCOMPLETO', nombre: 'SERVICIO DOTACION TEST', estado: 'Pendiente asignación operativa',
      anulado: false, tipo: 'Limpieza', localidad: 'Tigre', jurisdiccion: 'Buenos Aires',
      fechaInicio: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      fechaCarga: new Date().toISOString().slice(0, 10), cargadoPor: 'Comercial E2E', efts: 1,
      puestos: [{ cantidad: 1, puesto: 'Operario/a', horarioDesde: '06:00', horarioHasta: '14:00', tipoHorario: 'fijo', dias: { lunes: true }, obs: '' }],
    };
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push(o);
    window.sembrarPrepedido(o, { notificar: false });
  });
  await page.evaluate(() => { window.navTo('dotacion'); });
  await page.waitForTimeout(150);

  const ladoFalta = page.locator('#dot-falta');
  await expect(ladoFalta).toContainText('DOT.INCOMPLETO');
  await expect(ladoFalta).toContainText('0/1 cubierta');
  await expect(ladoFalta).toContainText('PRE-');
});
