import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// GESTION_HORAS_para_Fede.md + mockup_gestion_horas_1.html. "El gemelo de
// Gestión de precios": Precios dice a cuánto la hora, este módulo dice
// cuántas horas — calculadas de una REGLA (puestos × horario × días ×
// Fer) contra el calendario real (feriados), nunca un número fijo. Los
// cambios de contrato son VIGENCIAS (nunca se pisa la anterior), mismo
// patrón ya probado en Supervisión de servicios.

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

// Mismo feriado que usa el ejemplo real del documento: "8 hs L a V sin
// feriados da 176 en septiembre y 168 en octubre (feriado del 12)".
async function seedFeriados(page) {
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.feriados = [{ fecha: '2026-10-12', nombre: 'Día del Respeto a la Diversidad Cultural', tipo: 'trasladable' }];
  });
}

test('Menú — Gestión de horas vive en Operaciones y renderiza la matriz', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page, 'Operaciones');
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await expect(page.locator('#screen-gestion_horas')).toBeVisible();
  await expect(page.locator('#hor-thead')).toBeVisible();
  await expect(page.locator('#topbar-title')).toContainText('Gestión de horas');
});

test('Backfill automático — un servicio con Personal necesario pero sin vigencia se siembra solo al renderizar', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await seedFeriados(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || []; DB.objetivos.push({
      id: 990970001, codigo: 'HOR.BACKFILL.1', nombre: 'Servicio Backfill Test', estado: 'Operativo', anulado: false,
      puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(150);

  const vigencia = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.horasVigencias.find(v => v.objCodigo === 'HOR.BACKFILL.1');
  });
  expect(vigencia).toBeTruthy();
  expect(vigencia.origen).toBe('backfill');
  await expect(page.locator('#hor-tbody')).toContainText('HOR.BACKFILL.1');
});

test('La matriz calcula las horas reales del ejemplo del documento: 176 en septiembre, 168 en octubre', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await seedFeriados(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || []; DB.objetivos.push({
      id: 990970002, codigo: 'HOR.CALCULO.1', nombre: 'Servicio Cálculo Test', estado: 'Operativo', anulado: false,
      puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(150);

  const fila = page.locator('#hor-tbody tr', { hasText: 'HOR.CALCULO.1' });
  await expect(fila).toContainText('176');
  await expect(fila).toContainText('168');
});

test('Expandir el servicio muestra la regla vigente, el historial y el botón de nueva vigencia', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await seedFeriados(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || []; DB.objetivos.push({
      id: 990970003, codigo: 'HOR.DETALLE.1', nombre: 'Servicio Detalle Test', estado: 'Operativo', anulado: false,
      puestos: [{ puesto: 'Operario A', cantidad: 2, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.toggleDetalleHoras('HOR.DETALLE.1'));
  await page.waitForTimeout(100);

  const det = page.locator('tr.hor-det');
  await expect(det).toContainText('2× Operario A');
  await expect(det).toContainText('Backfill');
  await expect(det.locator('button:has-text("Nueva vigencia")')).toBeVisible();
});

test('Nueva vigencia — vista previa en vivo, motivo obligatorio, y la matriz recalcula desde ese mes en adelante sin tocar el pasado', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await seedFeriados(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || []; DB.objetivos.push({
      id: 990970004, codigo: 'HOR.VIGENCIA.1', nombre: 'Servicio Vigencia Test', estado: 'Operativo', anulado: false,
      puestos: [{ puesto: 'Operario A', cantidad: 3, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
    });
  });
  await page.evaluate(() => { window.navTo('gestion_horas'); });
  await page.waitForTimeout(150);

  const horasSeptiembreAntes = await page.evaluate(async () => {
    const mod = await import('/src/modules/gestion_horas/index.js');
    return mod.horasServicioMes('HOR.VIGENCIA.1', new Date().toISOString().slice(0, 7));
  });
  expect(horasSeptiembreAntes).toBeGreaterThan(0);

  await page.evaluate(() => window.abrirVigenciaHoras('HOR.VIGENCIA.1'));
  await expect(page.locator('#modal-vigencia-horas')).toBeVisible();

  // Reduce de 3 a 1 puesto — la vista previa debe mostrar la baja y la
  // advertencia de dotación reducida.
  await page.evaluate(() => { window.EDIT_PUESTOS[0].cantidad = 1; window.previewVigenciaHoras(); });
  await expect(page.locator('#hor-vig-preview')).toContainText('pactado pasa de');
  await expect(page.locator('#hor-vig-warn')).toContainText('Reduce dotación');

  // Sin motivo, no guarda.
  await page.click('button:has-text("Guardar nueva vigencia")');
  await expect(page.locator('#modal-vigencia-horas')).toBeVisible();

  const desdeElegido = await page.locator('#hor-vig-desde').inputValue();
  await page.fill('#hor-vig-motivo', 'Reducción pedida por el cliente — E2E');
  await page.click('button:has-text("Guardar nueva vigencia")');
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-vigencia-horas')).toBeHidden();

  const vigencias = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.horasVigencias.filter(v => v.objCodigo === 'HOR.VIGENCIA.1');
  });
  expect(vigencias.length).toBe(2); // backfill original + la nueva
  const nueva = vigencias.find(v => v.motivo.includes('E2E'));
  expect(nueva).toBeTruthy();
  expect(nueva.vigenteDesde).toBe(desdeElegido);
  expect(nueva.puestos[0].cantidad).toBe(1);

  // El mes ANTERIOR a la nueva vigencia sigue leyendo la regla vieja (3
  // puestos) — "los períodos ya liquidados leen la vigencia que les tocó".
  const horasSeptiembreDespues = await page.evaluate(async () => {
    const mod = await import('/src/modules/gestion_horas/index.js');
    return mod.horasServicioMes('HOR.VIGENCIA.1', new Date().toISOString().slice(0, 7));
  });
  expect(horasSeptiembreDespues).toBe(horasSeptiembreAntes);
});

test('El alta de un servicio nuevo siembra su vigencia inicial de horas automáticamente', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const objetivo = {
      id: 990970005, codigo: 'HOR.ALTA.1', nombre: 'Servicio Alta Test', estado: 'Operativo', anulado: false,
      cargadoPor: 'Comercial E2E', fechaInicio: '01/11/2026',
      puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '09:00', horarioHasta: '17:00', tipoHorario: 'fijo', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
    };
    window.sembrarVigenciaHorasDesdeAlta(objetivo);
  });
  const vigencia = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.horasVigencias.find(v => v.objCodigo === 'HOR.ALTA.1');
  });
  expect(vigencia).toBeTruthy();
  expect(vigencia.origen).toBe('alta');
  expect(vigencia.vigenteDesde).toBe('2026-11');
  expect(vigencia.motivo).toContain('Alta del servicio');
});
