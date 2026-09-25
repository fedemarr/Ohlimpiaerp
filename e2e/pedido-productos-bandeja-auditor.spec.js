import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// BANDEJA_AUDITOR_solo_no_pagan_para_Fede.md (Lautaro, Finanzas, 25/09):
// al auditor SOLO le importan los pedidos que no se facturan.
//
// Cubre los 3 puntos del pedido:
//   1. Un PAGAN nunca cae en la bandeja, ni aunque exceda el 6%. Va directo a
//      Compras y aparece en "Pasaron directo a Compras" con su % a la vista.
//   2. El chip de motivo ya no repite el porcentaje (que tiene su columna).
//   3. El motivo dice la situación presupuestaria (EXCEDE rojo / DENTRO gris)
//      y la tabla se auto-ordena: excedidos primero, por % descendente.

const MES = '2027-05';

// presupuesto = facturacionNeta * 0.06. Con facturacionNeta 1_000_000 el
// presupuesto es 60_000, así que cant × costo decide si excede:
//   10 × 1.000 = 10.000  -> 17%  DENTRO
//   10 × 7.000 = 70.000  -> 117% EXCEDE
async function sembrar(page) {
  return page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    const per = { id: 991500001, mes, estado: 'abierto', cierreProgramado: '2027-05-31T17:00:00.000Z', recordatorioEnviado: true, anulado: false };
    DB.ppPeriodos = [per];

    // Dos clientes: uno PAGAN y uno NO PAGAN. El flag viene del alta del
    // cliente ("productos se facturan"), la bandeja solo lo lee.
    DB.clientes = [
      { idLocal: 991510001, nombre: 'Cli PAGA', productosEnFactura: 'SE FACTURA', anulado: false },
      { idLocal: 991510002, nombre: 'Cli NO PAGA', productosEnFactura: 'NO SE FACTURA', anulado: false },
    ];
    const mkObj = (codigo, nombre, cli) => ({ id: 991520000 + codigo.length, codigo, nombre, estado: 'Operativo', anulado: false, clienteIdLocal: cli, supervisorAsignado: '' });
    const servicios = [
      mkObj('E2E.PAGAN.EXC', 'Pagan que excede', 991510001),
      mkObj('E2E.PAGAN.OK', 'Pagan que no excede', 991510001),
      mkObj('E2E.NOPAG.EXC', 'No pagan que excede', 991510002),
      mkObj('E2E.NOPAG.DENT', 'No pagan dentro', 991510002),
      mkObj('E2E.NOPAG.SIN', 'No pagan sin presupuesto', 991510002),
      // Para el test del semáforo: quedan en borrador.
      mkObj('E2E.PAGAN.SEM', 'Pagan para el semaforo', 991510001),
      mkObj('E2E.NOPAG.SEM', 'No pagan para el semaforo', 991510002),
    ];
    DB.objetivos = [...(DB.objetivos || []), ...servicios];

    // Producto real: confirmarCongela el costo con precioVigente(), así que
    // sin catálogo el total se va a $0 y el % no se puede probar. El precio de
    // cada uno va más abajo, uno por pedido.
    const nPedidos = 7;
    DB.ppProductos = [...(DB.ppProductos || []), ...Array.from({ length: nPedidos }, (_, i) => ({
      id: 991550001 + i, descripcion: 'Producto E2E ' + (i + 1), tipoUso: 'normal', unidadMedida: 'u', anulado: false,
    }))];

    const pedidos = [];
    let n = 0;
    const pedido = (codigo, estado, costoUnit, facturacionNeta) => {
      n += 1;
      return {
        id: 991530000 + n, periodoIdLocal: String(per.id).slice(-9), servicioCodigo: codigo,
        facturacionNeta, porcentajeTope: 0.06, estado, tipoPedido: 'mensual',
        supervisor: 'Sup E2E', anulado: false,
        confirmadoEn: estado === 'borrador' ? null : '2027-05-10T14:38:00.000Z',
        confirmadoPor: estado === 'borrador' ? null : 'Sup E2E',
        _costoUnit: costoUnit,
      };
    };
    // Cada pedido lleva un producto distinto con SU precio, así el
    // congelamiento al confirmar no los pisa entre sí.
    //   10 × 7.000 = 70.000 -> 117% del presupuesto de 60.000 (EXCEDE)
    //   10 × 1.000 = 10.000 ->  17% (DENTRO)
    pedidos.push(pedido('E2E.PAGAN.EXC', 'borrador', 7_000, 1_000_000));
    pedidos.push(pedido('E2E.PAGAN.OK', 'borrador', 1_000, 1_000_000));
    pedidos.push(pedido('E2E.NOPAG.EXC', 'borrador', 7_000, 1_000_000));
    pedidos.push(pedido('E2E.NOPAG.DENT', 'borrador', 1_000, 1_000_000));
    pedidos.push(pedido('E2E.NOPAG.SIN', 'borrador', 1_000, 0));
    // Estos quedan en borrador para poder abrir la pantalla de carga y leer el
    // semáforo (que se calcula antes de confirmar).
    pedidos.push(pedido('E2E.PAGAN.SEM', 'borrador', 7_000, 1_000_000));
    pedidos.push(pedido('E2E.NOPAG.SEM', 'borrador', 1_000, 1_000_000));
    DB.ppPedidos = pedidos;
    DB.ppItems = pedidos.map((p, i) => ({
      id: 991540000 + p.id, pedidoIdLocal: String(p.id).slice(-9),
      productoIdLocal: String(991550001 + i), cantSolicitada: 10, cantAutorizada: null,
      costoCongelado: p._costoUnit, anulado: false,
    }));
    DB.ppPrecios = [...DB.ppPrecios, ...pedidos.map((p, i) => ({
      id: 991570000 + i, productoIdLocal: String(991550001 + i), costoUnit: p._costoUnit,
      vigenciaDesde: '2026-01-01', vigenciaHasta: null, anulado: false,
    }))];
    return { perId: String(per.id) };
  }, MES);
}

async function irABandeja(page) {
  await page.waitForTimeout(500);
  await page.evaluate(() => window.navTo('pedido_productos'));
  await page.waitForTimeout(700);
  await page.locator('#pp-tab-btn-auditoria').click();
  await page.waitForTimeout(300);
}

test('Bandeja del auditor — solo los NO PAGAN, con motivo = situación presupuestaria y orden por %', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrar(page);
  await irABandeja(page);

  // ============ Punto 1: los PAGAN no pasan por acá ============
  // Se confirman los 5 borradores, que es el momento en que se decide el
  // destino. Van silenciosos (como el cierre de período) porque acá no hay
  // modal de carga abierto: la lógica de decisión es la misma.
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const aConfirmar = DB.ppPedidos.filter(p => p.estado === 'borrador' && !p.servicioCodigo.endsWith('.SEM'));
    for (const p of aConfirmar) await window.confirmarPedidoPP(String(p.id), { silencioso: true });
  });
  const estados = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const out = {};
    DB.ppPedidos.forEach(p => { out[p.servicioCodigo] = p.estado; });
    return out;
  });
  expect(estados['E2E.PAGAN.EXC'], 'PAGAN excediendo 117% NO va a la bandeja').toBe('confirmado');
  expect(estados['E2E.PAGAN.OK']).toBe('confirmado');
  expect(estados['E2E.NOPAG.EXC']).toBe('confirmado_revision');
  expect(estados['E2E.NOPAG.DENT']).toBe('confirmado_revision');
  expect(estados['E2E.NOPAG.SIN'], 'NO PAGAN va siempre, aunque no haya presupuesto').toBe('confirmado_revision');

  await page.locator('#pp-aud-periodo-sel').selectOption('991500001');
  await page.waitForTimeout(300);

  const pend = page.locator('#tbody-pp-auditoria tr');
  // Solo los 3 NO PAGAN.
  await expect(pend).toHaveCount(3);
  await expect(pend.nth(0)).toContainText('No pagan que excede');
  await expect(pend.nth(1)).toContainText('No pagan dentro');
  await expect(pend.nth(2)).toContainText('No pagan sin presupuesto');
  await expect(page.locator('#tbody-pp-auditoria')).not.toContainText('Pagan que');

  // ============ Punto 3: orden excedidos primero, por % desc ============
  // 117% arriba, después los dos grises.
  await expect(pend.nth(0)).toContainText('117%');
  await expect(pend.nth(1)).toContainText('17%');

  // ============ Punto 2: chip sin porcentaje ============
  // El % ya tiene columna; el chip va solo con el texto (y con espacio).
  // El chip de motivo es la 3ra celda (la 1ra badge de la fila es el estado).
  await expect(pend.nth(0).locator('td').nth(2)).toHaveText('EXCEDE PRESUPUESTO');
  await expect(pend.nth(0)).not.toContainText('EXCEDE PRESUPUESTO117%');

  // ============ Punto 3: motivo = situación presupuestaria ============
  // Ya no dice "NO FACTURA PRODUCTOS": con los PAGAN afuera todas las filas
  // serían NO PAGAN y el chip no informaba nada.
  await expect(page.locator('#tbody-pp-auditoria')).not.toContainText('NO FACTURA PRODUCTOS');
  await expect(pend.nth(0).locator('td').nth(2)).toHaveText('EXCEDE PRESUPUESTO');
  await expect(pend.nth(1).locator('td').nth(2)).toHaveText('DENTRO DEL PRESUPUESTO');
  // Sin facturación no hay vara para comparar: no puede decir "dentro".
  await expect(pend.nth(2).locator('td').nth(2)).toHaveText('SIN PRESUPUESTO QUE COMPARAR');
  await expect(pend.nth(2)).toContainText('—');   // % sin presupuesto
  // El rojo del chip de EXCEDE.
  const chipExcede = pend.nth(0).locator('td').nth(2).locator('.badge');
  await expect(chipExcede).toHaveCSS('color', 'rgb(161, 28, 28)');

  // ============ Los PAGAN quedan listados para control, con su % ============
  const directo = page.locator('#tbody-pp-auditoria-directo tr');
  await expect(directo).toHaveCount(2);
  await expect(directo.nth(0)).toContainText('Pagan que excede');
  await expect(directo.nth(1)).toContainText('Pagan que no excede');
  await expect(directo.nth(0)).toContainText('sin intervención del auditor');
  await expect(directo.nth(1)).toContainText('sin intervención del auditor');
  // El % del PAGAN excedido se ve (informativo, en rojo) pero no bloqueó nada.
  await expect(directo.nth(0)).toContainText('117%');
  await expect(directo.nth(1)).toContainText('17%');
});

// El semáforo le dice al supervisor a dónde va su pedido ANTES de confirmar.
// Antes de este cambio el color y los motivos decidían el destino, así que un
// PAGAN al 117% le anunciaba "pasa por el AUDITOR" — la misma contradicción que
// llenaba la bandeja.
test('Bandeja del auditor — el semáforo anuncia el destino según PAGAN/NO PAGAN', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrar(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.navTo('pedido_productos'));
  await page.waitForTimeout(700);

  const abrir = async (codigo) => {
    const id = await page.evaluate(async (c) => {
      const { DB } = await import('/src/shared/state.js');
      return DB.ppPedidos.find(p => p.servicioCodigo === c).id;
    }, codigo);
    await page.evaluate((i) => window.abrirCargaPedidoPP(String(i)), id);
    await page.waitForTimeout(300);
  };

  // PAGAN excediendo el 6%: el semáforo puede estar rojo, pero el destino es
  // directo a Compras.
  await abrir('E2E.PAGAN.SEM');
  let resumen = page.locator('#pp-carga-resumen');
  await expect(resumen).toContainText('DIRECTO a Compras');
  await expect(resumen).not.toContainText('pasa por el AUDITOR');
  await expect(resumen).toContainText('Excede el presupuesto');   // el rojo sigue informando el %
  await page.evaluate(() => window.cerrarModal('modal-pp-carga'));

  // NO PAGAN dentro del presupuesto: semáforo verde y, aun así, al auditor.
  await abrir('E2E.NOPAG.SEM');
  await expect(resumen).toContainText('pasa por el AUDITOR');
  await expect(resumen).toContainText('servicio NO PAGAN');
});
