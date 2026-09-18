import { test, expect } from '@playwright/test';

// Bypass de login (mismo patrón que e2e/helpers.js) pero seteando el
// nombre/perfil que necesita cada paso del circuito Supervisor → RRHH →
// Finanzas, todo dentro de la misma sesión de navegador (los módulos ES
// son singletons por URL, currentUser vive en memoria compartida).
async function loginComo(page, nombre, perfil) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function', { timeout: 20000 });
  await cambiarRol(page, nombre, perfil);
  await page.evaluate(() => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  });
}

// Cambia de rol SIN recargar la página — un page.goto() reinicia todos
// los módulos ES (DB vuelve al estado inicial), perdiendo los datos
// inyectados. El circuito Supervisor → RRHH → Finanzas es una sola
// sesión de navegador con el mismo DB en memoria, solo cambia
// currentUser.
async function cambiarRol(page, nombre, perfil) {
  await page.evaluate(async ({ nombre, perfil }) => {
    const { setCurrentUser } = await import('/src/shared/state.js');
    setCurrentUser({ nombre, perfil });
  }, { nombre, perfil });
}

test('Adelantos — planilla del período, avisos, revisión RRHH y depósito por tandas', async ({ page }) => {
  await loginComo(page, 'SUP TEST', 'Supervisor');

  const mes = new Date().toISOString().slice(0, 7);
  const mesAnt = (() => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

  await page.evaluate(async ({ mes, mesAnt }) => {
    const { DB } = await import('/src/shared/state.js');
    DB.legajos = DB.legajos || [];
    DB.legajos.push(
      { nro: 778811, nombre: 'ADELANTO TEST UNO', dni: '30778811', estado: 'Activo', servicio: 'OBJ-ADEL-E2E', supervisor: 'SUP TEST', funcion: 'Operario A', cuit: '20778811009' },
      { nro: 778822, nombre: 'ADELANTO TEST DOS', dni: '30778822', estado: 'Activo', servicio: 'OBJ-ADEL-E2E', supervisor: 'SUP TEST', funcion: 'Operario A', cuit: '20778822004' },
    );
    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push({ codigo: 'OBJ-ADEL-E2E', nombre: 'Servicio Adelanto E2E', supervisorAsignado: 'SUP TEST', estado: 'Operativo', anulado: false });

    const diaVer = mes + '-05';
    DB.grillasLiq = DB.grillasLiq || [];
    DB.grillasLiq.push({
      id: 'GRL-ADEL-E2E', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-ADEL-E2E', nombre: 'Servicio Adelanto E2E', supervisor: 'SUP TEST',
      // ADELANTOS_bugs_para_Fede.md bug 2: la planilla ahora exige que el
      // asociado tenga fila en la grilla de ESTE período (con nro, la
      // identidad real — ver LIQ_HORAS_grillas_ajustes §1) para aparecer.
      // Los dos legajos de este test necesitan su entrada acá.
      asociados: [
        { nro: 778811, nombre: 'ADELANTO TEST UNO', tipoHora: 'facturable', horas: { [diaVer]: 8 }, estadoDia: { [diaVer]: 'ver' } },
        { nro: 778822, nombre: 'ADELANTO TEST DOS', tipoHora: 'facturable', horas: { [diaVer]: 8 } },
      ],
    });

    // Adelanto del período anterior (para la columna "Adelanto anterior")
    DB.pedidosAdelantos = DB.pedidosAdelantos || [];
    DB.pedidosAdelantos.push({
      id: Date.now() - 1000, legajoIdLocal: '778811', nroSocio: '778811', nombreAsociado: 'ADELANTO TEST UNO',
      supervisorNombre: 'SUP TEST', origen: 'Formal', monto: 15000, periodo: mesAnt, fechaPedido: mesAnt + '-10',
      estado: 'Aprobada', cargadoPor: 'SUP TEST',
    });
    // Pedido YA vigente este período para el segundo legajo, cargado por
    // OTRO supervisor — dispara el aviso de duplicado.
    DB.pedidosAdelantos.push({
      id: Date.now() - 500, legajoIdLocal: '778822', nroSocio: '778822', nombreAsociado: 'ADELANTO TEST DOS',
      supervisorNombre: 'OTRO SUPERVISOR', origen: 'Formal', monto: 20000, periodo: mes, fechaPedido: mes + '-02',
      estado: 'Enviada', cargadoPor: 'OTRO SUPERVISOR',
    });

    window.navTo('pedidos_adelantos');
  }, { mes, mesAnt });

  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabPedAdl('planilla'));
  await page.waitForTimeout(200);

  // --- Planilla: HS verif, adelanto anterior, aviso de duplicado ---
  const filaUno = page.locator('#tbody-padl-planilla tr', { hasText: 'ADELANTO TEST UNO' });
  await expect(filaUno).toContainText('8 hs');
  await expect(filaUno).toContainText('$15.000');

  const filaDos = page.locator('#tbody-padl-planilla tr', { hasText: 'ADELANTO TEST DOS' });
  await expect(filaDos).toContainText('OTRO SUPERVISOR');
  await expect(filaDos).toContainText('20.000');

  // Cargo monto solo al primero y elevo
  await page.fill('#plamonto-778811', '30000');
  await page.evaluate(() => window.recalcPlanilla(778811));
  await expect(page.locator('#kpi-padl-pla-aso')).toHaveText('1');
  await expect(page.locator('#kpi-padl-pla-tot')).toContainText('30.000');
  await expect(page.locator('#btn-padl-pla-elevar')).toBeEnabled();

  await page.click('#btn-padl-pla-elevar');
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-padl-resumen')).toBeVisible();
  // Se invoca la acción directamente (en vez de .click() en el botón del
  // modal) para que Playwright espere la cadena async completa
  // (crearPedidoAdelanto + elevarPedido, cada uno con su propio
  // supaSync/registrarEvento) antes de seguir — un .click() no la espera.
  await page.evaluate(() => window.confirmarElevarPlanilla());

  const pedidoId = await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    const p = DB.pedidosAdelantos.find(x => x.legajoIdLocal === '778811' && x.monto === 30000);
    return p ? p.id : null;
  });
  expect(pedidoId).not.toBeNull();

  const estadoTrasElevar = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidosAdelantos.find(p => p.id === id)?.estado;
  }, pedidoId);
  expect(estadoTrasElevar).toBe('Enviada');

  await page.evaluate(() => window.tabPedAdl('mios'));
  await page.waitForTimeout(150);
  await expect(page.locator('#tbody-padl-mios')).toContainText('PENDIENTE');

  // --- Cuentas CBU para el depósito ---
  await page.evaluate(async () => {
    const { DB } = await import('/src/shared/state.js');
    DB.cuentasCbu = DB.cuentasCbu || [];
    DB.cuentasCbu.push(
      { legajoNro: '778811', banco: 'BBVA', cbu: '2850590940090418135201', estado: 'ACTIVA', anulado: false },
    );
  });

  // --- RRHH aprueba ---
  await cambiarRol(page, 'Nati RRHH', 'RRHH');
  await page.evaluate(() => window.navTo('gestion_adelantos'));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabGestAdl('rrhh'));
  await page.waitForTimeout(150);
  await expect(page.locator('#tbody-gadl-rrhh')).toContainText('ADELANTO TEST UNO');

  await page.evaluate((id) => window.abrirRevisionRRHH('Adelanto', id), pedidoId);
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-gadl-revision')).toBeVisible();
  await page.evaluate(() => window.aprobarRevisionRRHH());

  const estadoTrasAprobar = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    return DB.pedidosAdelantos.find(p => p.id === id)?.estado;
  }, pedidoId);
  expect(estadoTrasAprobar).toBe('Aprobada RRHH');

  // --- Finanzas deposita por tandas (hojas de copiado) ---
  await cambiarRol(page, 'Lautaro Finanzas', 'Finanzas');
  await page.evaluate(() => window.navTo('gestion_adelantos'));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.tabGestAdl('deposito'));
  await page.waitForTimeout(150);

  const filaDeposito = page.locator('#tbody-gadl-deposito tr', { hasText: 'ADELANTO TEST UNO' });
  await expect(filaDeposito).toContainText('BBVA');
  await filaDeposito.locator('input[type=checkbox]').check();
  await page.waitForTimeout(100);
  await expect(page.locator('#btn-gdep-depositar')).toBeEnabled();
  await expect(page.locator('#gdep-sel-n')).toHaveText('1');

  await page.evaluate(() => window.abrirConfirmarDeposito());
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-gadl-modo-deposito')).toBeVisible();
  await page.evaluate(() => window.confirmarLoteAdelantos('archivos'));

  // El bypass de login de este archivo (mismo patrón que e2e/helpers.js)
  // no abre una sesión real de Supabase Auth — no hay credenciales de
  // test. Eso alcanza para elevarPedido/aprobarRRHH (mutan el objeto en
  // memoria ANTES de intentar el supaSync, así que el estado avanza
  // igual aunque el insert real falle por RLS), pero confirmarLoteAdelantos
  // es deliberadamente estricto: aborta si el lote no se pudo persistir,
  // para no marcar un depósito de plata real sin dejar registro. Contra
  // Supabase real (auth.uid() presente) el insert pasa la política
  // "Solo usuarios autenticados" sin problema — verificado aparte con un
  // insert directo por REST usando exactamente el shape que arma este
  // código (ver sql/v142_adelantos_planilla_y_lotes.sql). Acá se verifica
  // la mitad que SÍ es observable sin auth real: el abort es seguro, no
  // deja el pedido a mitad de camino ni crea un lote fantasma.
  const [estadoFinal, lote] = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    const p = DB.pedidosAdelantos.find(x => x.id === id);
    const l = (DB.lotesAdelantos || [])[0];
    return [p?.estado, l];
  }, pedidoId);
  expect(estadoFinal).toBe('Aprobada RRHH');
  expect(lote).toBeUndefined();
});
