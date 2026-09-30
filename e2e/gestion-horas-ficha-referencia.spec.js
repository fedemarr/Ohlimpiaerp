import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// GESTION_HORAS_v2_tipos_sembrado_para_Fede.md §4 — "Cantidad de horas" en
// la ficha del servicio deja de ser un campo libre cuando el servicio ya
// tiene una regla en Gestión de horas: pasa a ser una REFERENCIA de solo
// lectura, con un chip que lleva a la pantalla que la administra.
//
// El problema que resuelve: las horas viviendo en dos lugares (la ficha y la
// vigencia) se desincronizaban. Chango Sarandí mostraba 176 hs/mes en la
// ficha y facturaba 1.118 hs — nadie sabía cuál era el número cierto.

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

async function sembrarRegla(page, codigo, efts) {
  await page.evaluate(async ({ codigo, efts }) => {
    const { abrirNuevaVigenciaHoras } = await import('/src/modules/gestion_horas/gestion_horas.js');
    await abrirNuevaVigenciaHoras(codigo, [], new Date().toISOString().slice(0, 7), 'Test', 'Banco mensual', 'manual', 'fija', efts);
  }, { codigo, efts });
}

// Monta cliente + servicio en DB y abre la ficha del servicio en la tab
// "Precio y contrato". Ojo: abrirModalObjetivo() busca por idLocal, que es
// el id TRUNCADO a 9 dígitos (idLocalTrunc) — por eso no se pasa o.id tal cual.
async function abrirFicha(page, { clienteId, codigo, nombre, modelo, efts }) {
  await page.evaluate(async ({ clienteId, codigo, nombre, modelo, efts }) => {
    const { DB } = await import('/src/shared/state.js');
    DB.clientes.push({
      id: clienteId, razon: 'Cliente Ref Horas', nombre: 'Cliente Ref Horas', cuit: '30-9-9',
      estado: 'Activo', ciudad: 'Palermo', direccion: 'Av. Test 200', tipoContrato: 'Por hora', contactos: [],
    });
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({
      id: 990990100 + clienteId % 100, clienteId, codigo, nombre, estado: 'Operativo', anulado: false,
      dir: 'Calle Test 123', localidad: 'Palermo', fechaInicio: '01/09/2026',
      modeloPrecio: modelo, efts, valorHora: 1000, valor: (efts || 0) * 1000,
      // Un puesto mínimo: el checklist de guardarObjetivo() exige "Personal
      // necesario" aunque el servicio ya tenga regla en Gestión de horas.
      puestos: [{ puesto: 'Operario A', cantidad: 1, horarioDesde: '08:00', horarioHasta: '16:00', dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true } }],
      responsables: [], comisiones: [], productos: [],
      emailFacturacion: '', textoFactura: '', notas: '', logElementos: '', logMaquinas: '',
    });
  }, { clienteId, codigo, nombre, modelo, efts });
  await page.evaluate(async (codigo) => {
    const { DB } = await import('/src/shared/state.js');
    const o = DB.objetivos.find(x => x.codigo === codigo);
    window.navTo('objetivos');
    window.abrirModalObjetivo(String(o.id).slice(-9));
  }, codigo);
  await page.waitForTimeout(300);
  await page.click('#modal-objetivo .tab-btn:has-text("Precio y contrato")');
  await page.waitForTimeout(150);
}

test('Un servicio CON regla muestra "Cantidad de horas" bloqueada, con chip y aviso de dónde sale', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarRegla(page, 'REF.CONREGLA.1', 1118);
  await abrirFicha(page, { clienteId: 990991001, codigo: 'REF.CONREGLA.1', nombre: 'Con Regla', modelo: 'Por EFT', efts: 1118 });

  // Read-only y NO disabled: se ve gris pero el valor se puede seleccionar
  // y copiar, que es justo lo que alguien va a querer hacer con él.
  await expect(page.locator('#obj-efts')).toHaveJSProperty('readOnly', true);
  await expect(page.locator('#obj-efts')).not.toHaveJSProperty('disabled', true);
  await expect(page.locator('#obj-horas-ref-1')).toBeVisible();
  await expect(page.locator('#obj-horas-ref-hint')).toBeVisible();
  await expect(page.locator('#obj-horas-ref-hint')).toContainText('Gestión de horas');
  await expect(page.locator('#obj-horas-ref-hint')).toContainText('1.118');
  await expect(page.locator('#obj-horas-ref-hint')).toContainText('FT fija');
});

test('Un servicio SIN regla deja "Cantidad de horas" editable y sin chip', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await abrirFicha(page, { clienteId: 990991002, codigo: 'REF.SINREGLA.1', nombre: 'Sin Regla', modelo: 'Por EFT', efts: 200 });

  await expect(page.locator('#obj-efts')).toHaveJSProperty('readOnly', false);
  await expect(page.locator('#obj-horas-ref-1')).toBeHidden();
  await expect(page.locator('#obj-horas-ref-hint')).toBeHidden();
  await page.fill('#obj-efts', '250');
  await expect(page.locator('#obj-efts')).toHaveValue('250');
});

test('Al guardar un servicio con regla, el efts guardado sale de la regla (no del input viejo)', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  // La ficha tiene 176 hardcodeado (el síntoma del bug) pero la regla manda 1.118.
  await sembrarRegla(page, 'REF.SYNC.1', 1118);
  await abrirFicha(page, { clienteId: 990991003, codigo: 'REF.SYNC.1', nombre: 'Sync Efts', modelo: 'Por EFT', efts: 176 });
  // El input está read-only con el valor viejo (176) — igual, al guardar tiene
  // que ganar la regla (1.118).
  await expect(page.locator('#obj-efts')).toHaveValue('176');
  await page.click('button:has-text("Guardar servicio")');
  await page.waitForTimeout(300);

  const guardado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.objetivos.find(o => o.codigo === 'REF.SYNC.1');
  });
  expect(Number(guardado.efts)).toBe(1118);
});

test('El chip "= Gestión de horas ↗" lleva a la fila del servicio, ya desplegada', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await sembrarRegla(page, 'REF.CHIP.1', 900);
  await abrirFicha(page, { clienteId: 990991004, codigo: 'REF.CHIP.1', nombre: 'Chip', modelo: 'Por EFT', efts: 900 });

  await page.locator('#obj-horas-ref-1').click();
  await page.waitForTimeout(600);

  // Cierra la ficha y aterriza en Gestión de horas con el detalle ya abierto.
  await expect(page.locator('#modal-objetivo')).toBeHidden();
  await expect(page.locator('#screen-gestion_horas')).toBeVisible();
  // El código está en la fila principal; el detalle muestra la regla.
  await expect(page.locator('#hor-tbody tr', { hasText: 'REF.CHIP.1' })).toBeVisible();
  const det = page.locator('tr.hor-det');
  await expect(det).toContainText('FT FIJA');
  await expect(det).toContainText('900 hs/mes');
});