import { test, expect } from '@playwright/test';

async function loginComo(page, nombre, perfil) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function', { timeout: 20000 });
  await cambiarRol(page, nombre, perfil);
  await page.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}
async function cambiarRol(page, nombre, perfil) {
  await page.evaluate(async ({ nombre, perfil }) => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre, perfil });
  }, { nombre, perfil });
}

// PRESTAMOS_para_Fede.md fases 4-5: la cuota se DEBITA recién cuando el
// retiro se paga (no cuando se calcula), y Finanzas reprograma el plan con
// la invariante "suma de pendientes = saldo", motivo e historial.
test('Préstamos — débito al pagar el retiro + plan editable (postergar/redistribuir)', async ({ page }) => {
  await loginComo(page, 'Lautaro Finanzas', 'Finanzas');
  const mes = new Date().toISOString().slice(0, 7);

  const id = await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    const [y, m] = mes.split('-').map(Number);
    const per = (k) => { const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
    DB.legajos.push({ nro: 992601, nombre: 'DEBITO TEST UNO', dni: '30992601', estado: 'Activo', servicio: 'OBJ-DEB', supervisor: 'X', funcion: 'Operario A', cuit: '20992601001' });
    const p = {
      id: Date.now(), nombre: 'DEBITO TEST UNO', nroSocio: '992601', legajoIdLocal: '992601', servicio: 'OBJ-DEB',
      supervisorNombre: 'X', montoSolicitado: 400000, monto: 400000, tasaInteres: 10, montoTotal: 440000,
      cuotas: 4, montoCuota: 110000, periodo: per(-1), fechaPedido: per(-1) + '-15', estado: 'Aprobada', anulado: false,
      planCuotas: [0, 1, 2, 3].map(i => ({ numero: i + 1, periodo: per(i), monto: 110000, estado: 'Pendiente' })), // 1ra cuota = este mes
      movimientos: [], historialReprogramaciones: [],
    };
    DB.prestamos.push(p);
    return p.id;
  }, mes);

  // --- Fase 4: la cuota del período se LEE para descontarla del neto ---
  const cuotas = await page.evaluate((mes) => window.cuotasPrestamoDelPeriodo('992601', mes), mes);
  expect(cuotas).toHaveLength(1);
  expect(cuotas[0].monto).toBe(110000);

  // Retiro insuficiente (neto negativo): NO se debita nada.
  await page.evaluate((mes) => { window._registrarPagoAsociado(mes, 'DEBITO TEST UNO', 100000, -5000, '01/01/2026', 'test', {}); }, mes);
  let plan = await page.evaluate(async (i) => { const { DB } = await import('/src/shared/state.js'); return DB.prestamos.find(p => p.id === i).planCuotas; }, id);
  expect(plan[0].estado).toBe('Pendiente');

  // Retiro pagado de verdad: la cuota pasa a DEBITADA y queda el movimiento.
  await page.evaluate((mes) => { window._registrarPagoAsociado(mes, 'DEBITO TEST UNO', 500000, 390000, '01/01/2026', 'test', {}); }, mes);
  await page.waitForTimeout(150);
  let p = await page.evaluate(async (i) => { const { DB } = await import('/src/shared/state.js'); return DB.prestamos.find(x => x.id === i); }, id);
  expect(p.planCuotas[0].estado).toBe('Debitada');
  expect(p.movimientos.some(m => m.tipo === 'Débito cuota' && m.monto === 110000)).toBe(true);

  // Idempotente: volver a registrar el pago no debita otra cuota del mismo mes... (la siguiente es de otro período)
  const otra = await page.evaluate((mes) => window.cuotasPrestamoDelPeriodo('992601', mes), mes);
  expect(otra).toHaveLength(0);

  // --- Fase 5: ficha editable por Finanzas ---
  await page.evaluate(() => window.navTo('gestion_adelantos'));
  await page.evaluate(() => window.tabGestAdl('prestamos'));
  await expect(page.locator('#tbody-pr-cartera')).toContainText('ACTIVO 1/4');
  await expect(page.locator('#tbody-pr-cartera')).toContainText('330.000'); // saldo = 440.000 − 110.000
  await page.evaluate((i) => window.abrirFichaPrestamo(i), id);
  await expect(page.locator('#prf-barra')).toContainText('Plan balanceado');

  // Postergar la cuota 2 → el plan se alarga a 5 filas y sigue balanceado.
  await page.evaluate(() => window.postergarCuotaFicha(1));
  await expect(page.locator('#prf-cuerpo')).toContainText('POSTERGADA');
  await expect(page.locator('#prf-barra')).toContainText('Plan balanceado');

  // Desbalancear (bajar una cuota) frena el guardado.
  await page.fill('#prf-monto-2', '100.000');
  await expect(page.locator('#prf-barra')).toContainText('desbalanceado');
  await expect(page.locator('#prf-barra')).toContainText('por debajo');
  await expect(page.locator('#prf-guardar')).toBeDisabled();

  // Redistribuir: subir otra pendiente por la diferencia (10.000) → balancea.
  await page.fill('#prf-monto-3', '120.000');
  await expect(page.locator('#prf-barra')).toContainText('Plan balanceado');
  await expect(page.locator('#prf-guardar')).toBeEnabled();

  // Sin motivo no guarda; con motivo sí, y queda historial + movimiento.
  await page.evaluate(() => window.guardarReprogramacionFicha());
  p = await page.evaluate(async (i) => { const { DB } = await import('/src/shared/state.js'); return DB.prestamos.find(x => x.id === i); }, id);
  expect(p.historialReprogramaciones).toHaveLength(0);
  await page.fill('#prf-motivo', 'pidió el asociado — posterga el segundo mes');
  await page.evaluate(() => window.guardarReprogramacionFicha());
  await page.waitForTimeout(150);
  p = await page.evaluate(async (i) => { const { DB } = await import('/src/shared/state.js'); return DB.prestamos.find(x => x.id === i); }, id);
  expect(p.historialReprogramaciones).toHaveLength(1);
  expect(p.historialReprogramaciones[0].motivo).toContain('pidió el asociado');
  expect(p.historialReprogramaciones[0].planAnterior).toHaveLength(4); // lo original nunca se pisa
  expect(p.planCuotas).toHaveLength(5);
  expect(p.planCuotas[1].estado).toBe('Postergada');
  expect(p.movimientos.some(m => m.tipo === 'Reprogramación')).toBe(true);
  const pend = p.planCuotas.filter(c => c.estado === 'Pendiente').reduce((s, c) => s + c.monto, 0);
  expect(pend).toBe(330000); // = saldo

  // La cuota postergada ya no cae en su mes original: ese mes NO se debita
  // (Liquidaciones lee el plan nuevo); la próxima que toca es la 3, un mes después.
  const sumar = (k) => page.evaluate(({ mes, k }) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }, { mes, k });
  const enMes1 = await page.evaluate((per) => window.cuotasPrestamoDelPeriodo('992601', per), await sumar(1));
  expect(enMes1).toHaveLength(0);
  const enMes2 = await page.evaluate((per) => window.cuotasPrestamoDelPeriodo('992601', per), await sumar(2));
  expect(enMes2).toHaveLength(1);
  expect(enMes2[0].numero).toBe(3);

  // RRHH ve la ficha en solo lectura (sin inputs ni botones de edición).
  await cambiarRol(page, 'Nati RRHH', 'RRHH');
  await page.evaluate((i) => window.abrirFichaPrestamo(i), id);
  await expect(page.locator('#prf-guardar')).toHaveCount(0);
  await expect(page.locator('#prf-cuerpo')).toContainText('lo edita Finanzas');
});
