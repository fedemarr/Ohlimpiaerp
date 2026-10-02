import { test, expect } from '@playwright/test';

async function loginComoAdmin(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function' && typeof window.verObjetivo === 'function', { timeout: 20000 });
  await page.evaluate(async () => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre: 'Nati RRHH', perfil: 'Administrador total' });
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §8: Historial de cambios deja de
// ser solo "cambios de categoría" — ahora cualquier tipo de evento
// (condición, baja, alta por bandeja, etc.) loguea con su propio `tipo` y
// columnas Antes/Después genéricas, filtrable por tipo. Los eventos viejos
// (sin `tipo`, solo categoría) siguen viéndose igual que siempre.
test('Monotributo — Historial de cambios generalizado: filtro por tipo y columnas Antes/Después', async ({ page }) => {
  await loginComoAdmin(page);

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.monoCambios = DB.monoCambios || [];
    DB.monoCambios.push(
      // Evento histórico SIN tipo (dato real preexistente) — debe seguir
      // tratándose como 'categoria' y mostrar cat. anterior/nueva.
      { id: 1001, nombre: 'HIST VIEJO SIN TIPO', fecha: '01/01/2026', catAnterior: 'B', catNueva: 'C', curAnterior: 100, curNuevo: 150, motivo: 'Recategorización automática', decidoPor: 'Sistema', resultado: 'Aprobado' },
      // Evento nuevo de tipo 'baja'.
      { id: 1002, nombre: 'HIST BAJA NUEVA', fecha: '02/01/2026', tipo: 'baja', antes: 'Al día', despues: 'Baja', curAnterior: 0, curNuevo: 0, motivo: 'Desvinculación', decidoPor: 'RRHH', resultado: 'Rechazado' },
    );
    window.navTo('monotributos');
    window.tabMonotributos('historial', null);
  });
  await page.waitForTimeout(200);

  const tbody = page.locator('#tbody-mono-hist');
  await expect(tbody).toContainText('HIST VIEJO SIN TIPO');
  await expect(tbody).toContainText('HIST BAJA NUEVA');
  // El evento viejo sin `tipo` se clasifica igual que siempre (categoría).
  await expect(tbody.locator('tr', { hasText: 'HIST VIEJO SIN TIPO' })).toContainText('Categoría');

  // Filtrar por tipo 'baja' deja solo el evento nuevo.
  await page.selectOption('#mono-hist-tipo', 'baja');
  await expect(tbody).toContainText('HIST BAJA NUEVA');
  await expect(tbody).not.toContainText('HIST VIEJO SIN TIPO');
  await expect(tbody.locator('tr', { hasText: 'HIST BAJA NUEVA' })).toContainText('Al día');
  await expect(tbody.locator('tr', { hasText: 'HIST BAJA NUEVA' })).toContainText('Baja');

  // Volver a "Todos los tipos" muestra ambos de nuevo.
  await page.selectOption('#mono-hist-tipo', '');
  await expect(tbody).toContainText('HIST VIEJO SIN TIPO');
  await expect(tbody).toContainText('HIST BAJA NUEVA');
});

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §5: a partir de 3 meses adeudados
// (deuda acumulada real, no un atraso de uno o dos meses) el Padrón resume
// en vez de listar mes por mes — "⚠ Debe N meses · desde [el más viejo]".
test('Monotributo — Padrón: con 1-2 meses de deuda lista los meses, con 3+ resume "desde"', async ({ page }) => {
  await loginComoAdmin(page);

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    function hace(mesesAtras) {
      const d = new Date();
      d.setMonth(d.getMonth() - mesesAtras);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    DB.monotributos.push(
      { id: Date.now() + 1, nombre: 'DEUDA DOS MESES', nroSocio: 995301, categoria: 'A', estado: 'Al día', zona: 'provincia', condicion: 'comun' },
      { id: Date.now() + 2, nombre: 'DEUDA TRES MESES', nroSocio: 995302, categoria: 'A', estado: 'Al día', zona: 'provincia', condicion: 'comun' },
    );
    DB.monoPagosMes = DB.monoPagosMes || [];
    // Dos meses sin pagar: el período más viejo (sin fila = no pagado) y el actual.
    DB.monoPagosMes.push({ id: Date.now() + 10, periodo: hace(1), nroSocio: '995301', nombre: 'DEUDA DOS MESES', total: 1000, pagado: false });
    // Cuatro meses sin pagar (desde hace 3 meses hasta el actual).
    DB.monoPagosMes.push({ id: Date.now() + 11, periodo: hace(3), nroSocio: '995302', nombre: 'DEUDA TRES MESES', total: 1000, pagado: false });
    window.navTo('monotributos');
    window.tabMonotributos('padron', null);
  });
  await page.waitForTimeout(200);

  const tbody = page.locator('#tbody-mono');
  const filaDos = tbody.locator('tr', { hasText: 'DEUDA DOS MESES' });
  const filaTres = tbody.locator('tr', { hasText: 'DEUDA TRES MESES' });
  await expect(filaDos).toContainText('Debe 2 meses');
  await expect(filaTres).toContainText('Debe 4 meses');
  // 2 meses: se siguen listando todos (separados por ·, no dice "desde").
  await expect(filaDos).not.toContainText('desde');
  // 3+ meses: se resume con el más viejo.
  await expect(filaTres).toContainText('desde');
});

// MONOTRIBUTO_cierre_modulo_para_Fede_1.md §5: "el detalle completo vive
// en el modal del botón '💰 pagos'" — tiene que mostrar TODOS los meses
// adeudados, incluso los que nunca llegaron a tener una fila armada en
// mono_pagos_mes (antes el modal solo listaba filas ya existentes).
test('Monotributo — Padrón: el modal "💰 pagos" muestra los meses adeudados aunque nunca se haya armado la lista de ese período', async ({ page }) => {
  await loginComoAdmin(page);

  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    function hace(mesesAtras) {
      const d = new Date();
      d.setMonth(d.getMonth() - mesesAtras);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    const persona = { id: Date.now(), nombre: 'DETALLE MODAL PAGOS', nroSocio: 995303, categoria: 'A', estado: 'Al día', zona: 'provincia', condicion: 'comun' };
    DB.monotributos.push(persona);
    window._idDetalleModalPagos = persona.id;
    DB.monoPagosMes = DB.monoPagosMes || [];
    // Solo UNA fila real armada (el mes más viejo); los otros 3 meses
    // adeudados hasta el actual nunca tuvieron fila.
    DB.monoPagosMes.push({ id: Date.now() + 1, periodo: hace(3), nroSocio: '995303', nombre: 'DETALLE MODAL PAGOS', total: 49527.18, pagado: false });
  });
  await page.evaluate(() => { window.navTo('monotributos'); window.tabMonotributos('padron', null); });
  await page.waitForTimeout(150);

  await page.evaluate((id) => window.verHistorialPagosMono(id), await page.evaluate(() => window._idDetalleModalPagos));
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-hist-pagos-mono')).toBeVisible();
  const lista = page.locator('#hist-pagos-mono-lista');
  // 4 períodos en total: 1 con fila real + 3 "sin registro".
  await expect(lista.locator('text=⚠ Sin registro')).toHaveCount(3);
  await expect(lista).toContainText('estimado');
});
