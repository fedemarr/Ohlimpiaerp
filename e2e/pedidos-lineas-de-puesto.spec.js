import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// PEDIDOS_LINEAS_PERFIL_para_Fede.md + mockup_pedido_multilinea_1.html.
// Caso real que motiva el ticket: PP-29 pedía "2× Operario A" en un solo
// horario/perfil cuando en verdad eran dos personas con horarios y
// perfiles distintos (una de mañana de semana part-time, una franquera de
// finde rotativa) — las dos candidatas ("Perez") quedaban indistinguibles
// en Seguimiento. El pedido pasa a ser cabecera + N líneas de puesto, cada
// una con su propio puesto/horario/días/perfil, y cada línea genera sus
// propias vacantes individuales (V1, V2…) en Seguimiento.

async function mockRestOk(page) {
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}

test('Form de pedido — agregar línea, copiar la última y quitar (mínimo 1 línea)', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(() => { window.navTo('pedidos'); window.abrirNuevoPedido(); });
  await expect(page.locator('#modal-pedido')).toBeVisible();
  await expect(page.locator('#p-lineas > div')).toHaveCount(1);

  await page.click('button:has-text("+ Agregar línea de puesto")');
  await expect(page.locator('#p-lineas > div')).toHaveCount(2);

  // Copiar la última: la línea 3 nace con los mismos valores que la 2.
  await page.evaluate(() => { window.lineasPedidoTemp[1].puesto = 'Franquero'; window.lineasPedidoTemp[1].cantidad = 3; window.renderLineasPedido(); });
  await page.click('button:has-text("⧉ Agregar copiando la última")');
  await expect(page.locator('#p-lineas > div')).toHaveCount(3);
  const copiada = await page.evaluate(() => window.lineasPedidoTemp[2]);
  expect(copiada.puesto).toBe('Franquero');
  expect(copiada.cantidad).toBe(3);

  // Quitar una línea cuando hay más de una funciona.
  await page.locator('#p-lineas > div').nth(2).locator('button:has-text("✕ Quitar")').click();
  await expect(page.locator('#p-lineas > div')).toHaveCount(2);

  // No se puede bajar de 1 línea.
  await page.locator('#p-lineas > div').nth(1).locator('button:has-text("✕ Quitar")').click();
  await expect(page.locator('#p-lineas > div')).toHaveCount(1);
  await expect(page.locator('#p-lineas > div').first().locator('button:has-text("✕ Quitar")')).toHaveCount(0);
});

test('Guardar un pedido con 2 líneas — persiste lineas[], agrega puesto/cantidad para las vistas que muestran un solo valor', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ id: 990950001, codigo: 'LOS.PINOS.TEST', nombre: 'LOS PINOS TEST', estado: 'Operativo', anulado: false, supervisorAsignado: 'Alejandro Cacciato', dir: 'Colombia 1340' });
  });
  await page.evaluate(() => { window.poblarSelects(); window.navTo('pedidos'); window.abrirNuevoPedido(); });
  await page.selectOption('#p-supervisor', 'Alejandro Cacciato');
  await page.evaluate(() => window.onChangeSupervisorPedido());
  await page.selectOption('#p-servicio', 'LOS.PINOS.TEST');
  await page.evaluate(() => window.onChangeServicioPedido());

  // Línea 1: mañana de semana, part time. Línea 2: finde, rotativo.
  await page.click('button:has-text("+ Agregar línea de puesto")');
  await page.evaluate(() => {
    window.lineasPedidoTemp[0] = { puesto: 'Operario A', cantidad: 1, dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true }, horarioDesde: '06:00', horarioHasta: '14:00', tipoHorario: 'fijo', perfil: [{ codigo: 'disponibilidad', valor: 'Media jornada' }] };
    window.lineasPedidoTemp[1] = { puesto: 'Operario A', cantidad: 1, dias: { sabados: true, domingos: true, feriados: true }, horarioDesde: '06:00', horarioHasta: '22:00', tipoHorario: 'rotativo', perfil: [{ codigo: 'certificaciones', valor: ['Libreta sanitaria'] }] };
    window.renderLineasPedido();
  });
  await page.fill('#p-fecha-limite', '25/09/2026');
  await page.evaluate(() => window.guardarPedido());
  await page.waitForTimeout(150);

  const pedido = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidos.find(p => p.servicio === 'LOS.PINOS.TEST');
  });
  expect(pedido).toBeTruthy();
  expect(pedido.lineas).toHaveLength(2);
  expect(pedido.lineas[0].horarioDesde).toBe('06:00');
  expect(pedido.lineas[0].horarioHasta).toBe('14:00');
  expect(pedido.lineas[1].tipoHorario).toBe('rotativo');
  expect(pedido.puesto).toBe('2 líneas'); // agregado para la tabla — compat hacia atrás
  expect(pedido.cantidad).toBe(2);

  // La tabla de Activos muestra el agregado, no las líneas.
  await expect(page.locator('#tbody-pedidos')).toContainText('2 líneas');
  await expect(page.locator('#tbody-pedidos')).toContainText(`PP-${pedido.numero}`);

  // La ficha (👁) SÍ muestra cada línea por separado.
  await page.evaluate((id) => window.verDetallePedido(id), pedido.id);
  await expect(page.locator('#pedido-body')).toContainText('Línea 1:');
  await expect(page.locator('#pedido-body')).toContainText('Línea 2:');
  await expect(page.locator('#pedido-body')).toContainText('06:00 a 14:00');
  await expect(page.locator('#pedido-body')).toContainText('06:00 a 22:00');
  await expect(page.locator('#pedido-body')).toContainText('Libreta sanitaria');
});

test('Editar un pedido viejo sin `lineas` (datos previos a v158) — se reconstruye como 1 línea desde los campos planos', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const pedido = {
    id: 990950099, numero: 950, servicio: 'OBJ.SEG.TEST', supervisor: 'Sup Demo', fecha: '20/09/2026', estado: 'Pendiente', urgencia: 'Media',
    puesto: 'Operario A', cantidad: 2,
    horarioSemanal: { dias: { lunes: true, martes: true }, horarioDesde: '08:00', horarioHasta: '16:00', tipoHorario: 'fijo' },
    perfil: [{ codigo: 'genero', valor: 'Femenino' }],
    // sin `lineas` — simula un pedido cargado antes de este ticket.
  };
  await page.evaluate(async (pedido) => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ id: 990950098, codigo: 'OBJ.SEG.TEST', nombre: 'OBJ SEG TEST', estado: 'Operativo', anulado: false, supervisorAsignado: 'Sup Demo' });
    DB.pedidos = DB.pedidos || [];
    DB.pedidos.push(pedido);
  }, pedido);
  await page.evaluate(() => { window.poblarSelects(); window.navTo('pedidos'); });
  await page.evaluate((id) => window.abrirEdicionPedido(id), pedido.id);
  await expect(page.locator('#modal-pedido')).toBeVisible();
  await expect(page.locator('#p-lineas > div')).toHaveCount(1);
  const linea = await page.evaluate(() => window.lineasPedidoTemp[0]);
  expect(linea.puesto).toBe('Operario A');
  expect(linea.cantidad).toBe(2);
  expect(linea.horarioDesde).toBe('08:00');

  await page.evaluate(() => window.guardarPedido());
  await page.waitForTimeout(150);
  const guardado = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidos.find(p => String(p.id) === String(id));
  }, pedido.id);
  expect(guardado.lineas).toHaveLength(1); // a partir de acá ya queda con `lineas` persistido
});

test('Seguimiento — dos candidatas en el mismo pedido con líneas distintas dejan de ser indistinguibles (caso real PP-29)', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const pedido = {
    id: 990950002, numero: 951, servicio: 'OBJ.SEG.TEST', supervisor: 'Sup Demo', fecha: '20/09/2026', estado: 'En búsqueda', urgencia: 'Alta',
    puesto: '2 líneas', cantidad: 2,
    lineas: [
      { puesto: 'Operario A', cantidad: 1, dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true }, horarioDesde: '06:00', horarioHasta: '14:00', tipoHorario: 'fijo', perfil: [] },
      { puesto: 'Operario A', cantidad: 1, dias: { sabados: true, domingos: true }, horarioDesde: '06:00', horarioHasta: '22:00', tipoHorario: 'rotativo', perfil: [] },
    ],
  };
  const clemencia = { id: 990950010, apellido: 'Perez', nombre: 'Clemencia', dni: '40950010', estado: 'Entrevistado', zona: 'CABA', pedidoVinculadoIdLocal: String(pedido.id), pedidoVacanteIdx: 0 };
  const barbara = { id: 990950011, apellido: 'Perez', nombre: 'Barbara', dni: '40950011', estado: 'Entrevistado', zona: 'CABA', pedidoVinculadoIdLocal: String(pedido.id), pedidoVacanteIdx: 1 };
  await page.evaluate(async ({ pedido, cands }) => {
    const { DB } = await import('/src/shared/state.js');
    DB.pedidos = DB.pedidos || []; DB.pedidos.push(pedido);
    DB.candidatos = DB.candidatos || []; DB.candidatos.push(...cands);
  }, { pedido, cands: [clemencia, barbara] });
  await page.evaluate(() => { window.navTo('pedidos'); window.cambiarTabPedidos('seguimiento'); });
  await page.waitForTimeout(200);

  const fila = page.locator('#tbody-seg-sel tr', { hasText: 'PP-951' });
  await expect(fila).toContainText('V1');
  await expect(fila).toContainText('V2');
  await expect(fila).toContainText('06:00–14:00');
  await expect(fila).toContainText('06:00–22:00');
  await expect(fila).toContainText('línea 1');
  await expect(fila).toContainText('línea 2');
  await expect(fila).toContainText('Perez, Clemencia');
  await expect(fila).toContainText('Perez, Barbara');
  await expect(fila).toContainText('0 de 2'); // ninguna cubierta todavía (sin alta), pero cada una en SU vacante

  // Vincular candidato nuevo directo a V2 (no a V1) — la vacante puntual
  // que se clickea es la que se vincula.
  const nuevo = { id: 990950020, apellido: 'Respaldo', nombre: 'Franquera', dni: '40950020', estado: 'Sin citar', zona: 'CABA' };
  await page.evaluate((c) => import('/src/shared/state.js').then(({ DB }) => DB.candidatos.push(c)), nuevo);
  await fila.locator('button[data-vincular-vacante="1"]').first().click();
  await expect(page.locator('#modal-ped-vincular')).toBeVisible();
  await expect(page.locator('#vinc-pedido-titulo')).toContainText('V2');
  await page.fill('#vinc-buscar', 'Respaldo');
  await page.click('[data-elegir-cand]');
  await expect(page.locator('#modal-ped-vincular')).toBeHidden();

  const vinculado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.candidatos.find(c => c.apellido === 'Respaldo');
  });
  expect(vinculado.pedidoVacanteIdx).toBe(1);
});

test('Desvincular limpia también el índice de vacante puntual', async ({ page }) => {
  await mockRestOk(page);
  await loginComoAdmin(page);
  const pedido = { id: 990950003, numero: 952, servicio: 'OBJ.SEG.TEST', supervisor: 'Sup Demo', fecha: '20/09/2026', estado: 'Pendiente', urgencia: 'Media', puesto: 'Operario A', cantidad: 1, lineas: [{ puesto: 'Operario A', cantidad: 1, dias: {}, horarioDesde: '', horarioHasta: '', tipoHorario: 'fijo', perfil: [] }] };
  const cand = { id: 990950030, apellido: 'Test', nombre: 'Uno', dni: '40950030', estado: 'Entrevistado', zona: 'CABA', pedidoVinculadoIdLocal: String(pedido.id), pedidoVacanteIdx: 0 };
  await page.evaluate(async ({ pedido, cand }) => {
    const { DB } = await import('/src/shared/state.js');
    DB.pedidos = DB.pedidos || []; DB.pedidos.push(pedido);
    DB.candidatos = DB.candidatos || []; DB.candidatos.push(cand);
  }, { pedido, cand });
  await page.evaluate(() => { window.navTo('pedidos'); window.cambiarTabPedidos('seguimiento'); });
  await page.waitForTimeout(200);

  page.once('dialog', (d) => d.accept());
  await page.evaluate((id) => window.desvincularCandidatoPorId(id), cand.id);
  await page.waitForTimeout(150);
  const actualizado = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    return DB.candidatos.find(c => c.apellido === 'Test');
  });
  expect(actualizado.pedidoVinculadoIdLocal).toBeFalsy();
  expect(actualizado.pedidoVacanteIdx).toBeFalsy();
});
