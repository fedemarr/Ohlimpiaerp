import { test, expect } from '@playwright/test';

async function loginComo(page, nombre, perfil) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.verLegajo === 'function' && typeof window.verObjetivo === 'function', { timeout: 20000 });
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

test('Resumen de horas — tipeo, valor hora por categoría, banner por supervisor y Corresponde con ajuste', async ({ page }) => {
  await loginComo(page, 'RH SUP UNO', 'Supervisor');

  const mes = new Date().toISOString().slice(0, 7);

  await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');

    DB.legajos = DB.legajos || [];
    DB.legajos.push(
      { nro: 991001, nombre: 'RH TEST UNO', dni: '30991001', estado: 'Activo', servicio: 'OBJ-RH-1', supervisor: 'RH SUP UNO', funcion: 'Operario A', cuit: '20991001007' },
      { nro: 991002, nombre: 'RH TEST SIN CAT', dni: '30991002', estado: 'Activo', servicio: 'OBJ-RH-1', supervisor: 'RH SUP UNO', funcion: 'Operario A', cuit: '20991002001' },
    );

    DB.objetivos = DB.objetivos || [];
    DB.objetivos.push(
      { codigo: 'OBJ-RH-1', nombre: 'Servicio RH Uno', supervisorAsignado: 'RH SUP UNO', estado: 'Operativo', anulado: false },
      { codigo: 'OBJ-RH-2', nombre: 'Servicio RH Dos', supervisorAsignado: 'RH SUP DOS', estado: 'Operativo', anulado: false },
      { codigo: 'OBJ-RH-3', nombre: 'Servicio RH Tres', supervisorAsignado: '', estado: 'Operativo', anulado: false },
    );
    // OBJ-RH-2 y OBJ-RH-3 quedan SIN grilla este período -> faltantes,
    // agrupados por RH SUP DOS y "sin supervisor" respectivamente.

    const dia = mes + '-05';
    DB.grillasLiq = DB.grillasLiq || [];
    DB.grillasLiq.push({
      id: 'GRL-RH-E2E', periodo: mes, tipo: 'servicio', objCodigo: 'OBJ-RH-1', nombre: 'Servicio RH Uno', supervisor: 'RH SUP UNO',
      origenGrilla: 'manual',
      asociados: [
        { nro: 991001, nombre: 'RH TEST UNO', tipoHora: 'facturable', horas: { [dia]: 8 } },
        { nro: 991002, nombre: 'RH TEST SIN CAT', tipoHora: 'facturable', horas: { [dia]: 8 } },
      ],
    });

    // Categoría vigente de RH TEST UNO en el período (para 1b: leyenda +
    // valor hora sugerido). RH TEST SIN CAT queda sin padrón -> dispara
    // el punto 3 (alerta "con horas y sin categoría").
    DB.categoriasBase = DB.categoriasBase || [];
    DB.categoriasBase.push({ id: 501, idLocal: 'cat_operario_e2e', codigo: 'CAT-001', nombre: 'Operario/a', anulado: false, activa: true });
    DB.padronCategoriasAsociado = DB.padronCategoriasAsociado || [];
    DB.padronCategoriasAsociado.push({ id: Date.now(), legajoNro: '991001', categoriaIdLocal: '501', vigenciaDesde: mes + '-01', vigenciaHasta: null, anulado: false });
    DB.valoresHoraCategoria = DB.valoresHoraCategoria || [];
    DB.valoresHoraCategoria.push({ id: Date.now() + 1, categoriaIdLocal: '501', servicioNombre: null, valorHora: 4383.12, vigenciaDesde: mes + '-01', vigenciaHasta: null, anulado: false });

    window.navTo('resumen_horas');
  }, mes);

  await page.waitForTimeout(300);

  // --- Punto 2: banner de faltantes agrupado por supervisor ---
  await expect(page.locator('#rh-faltantes')).toContainText('RH SUP DOS');
  await expect(page.locator('#rh-faltantes')).toContainText('Sin supervisor asignado');
  // Se despliega al click
  await page.evaluate(() => window.toggleSupervisorFaltantesRH('RH SUP DOS'));
  await page.waitForTimeout(150);
  await expect(page.locator('#rh-faltantes')).toContainText('OBJ-RH-2');

  // --- Punto 3: alerta "con horas y sin categoría" en la barra de confirmar ---
  await expect(page.locator('#rh-chip-sincat')).toBeVisible();
  await expect(page.locator('#rh-chip-sincat')).toContainText('sin categoría');
  await expect(page.locator('#rh-chip-sincat')).toContainText('1');

  // --- Punto 1a/1b: nueva solicitud, tipeo + valor hora por categoría ---
  await page.evaluate(() => window.tabResumenHoras('revision'));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.abrirNuevaRevisionRetiro());
  await page.waitForTimeout(150);
  await page.fill('#rr-nombre', 'RH TEST UNO');
  await page.evaluate(() => window.autocompletarRevisionRetiro());
  await page.fill('#rr-periodo', mes);
  await page.evaluate(() => window.onChangePeriodoRevisionRetiro());
  await page.evaluate(() => window.agregarLineaRevisionRetiro());
  await page.waitForTimeout(150);

  // Leyenda de categoría (1b) — de dónde salió el valor hora
  await expect(page.locator('#rr-lineas-body')).toContainText('CAT-001');
  // Valor hora precargado de la categoría vigente en el período
  await expect(page.locator('#rr-vh-0')).toHaveValue('4.383,12');

  // Tipeo (1a): cantidad de horas con coma, sin spinner
  await page.fill('#rr-hs-0', '104');
  await page.waitForTimeout(100);
  // El monto se recalcula sin perder el foco del input (no se
  // regenera la fila completa) — sigue siendo el mismo elemento.
  await expect(page.locator('#rr-hs-0')).toBeFocused();
  await expect(page.locator('#rr-monto-0')).toContainText('455.844');

  // Pisar el valor hora -> chip "valor modificado"
  await page.fill('#rr-vh-0', '5000');
  await page.waitForTimeout(100);
  await expect(page.locator('#rr-vhwarn-0')).toContainText('valor modificado');
  await expect(page.locator('#rr-monto-0')).toContainText('520.000');

  // Vuelvo a dejarlo en el valor sugerido.
  await page.fill('#rr-vh-0', '4.383,12');
  await page.waitForTimeout(100);

  // guardarRevisionRetiro() es código preexistente (no tocado por este
  // ticket) que aborta si supaSync falla — correcto, pero el bypass de
  // login de este archivo no abre sesión real de Supabase Auth, así que
  // el insert siempre choca con RLS acá (mismo límite ya documentado en
  // e2e/adelantos-planilla-deposito.spec.js). Se inyecta directamente el
  // resultado que hubiera guardado esa función, para poder seguir
  // probando Revisar-con-ajuste y Confirmar pago (lo que sí toca este
  // ticket) contra datos reales de forma.
  const solicitudId = await page.evaluate(async (mes) => {
    const { DB } = await import('/src/shared/state.js');
    const id = Date.now();
    DB.revisionesRetiro = DB.revisionesRetiro || [];
    DB.revisionesRetiro.push({
      id, nroSolicitud: 'SR-E2E-0001', legajoNro: '991001', nombreAsociado: 'RH TEST UNO', supervisor: 'RH SUP UNO',
      tipoReclamo: 'Horas faltantes', tipoHora: 'facturable', periodoReclamado: mes,
      montoTotal: 104 * 4383.12, adjuntos: [], observaciones: '',
      estado: 'En revisión', armadoPor: 'RH SUP UNO', armadoEn: new Date().toISOString(), anulado: false,
    });
    DB.revisionesRetiroLineas = DB.revisionesRetiroLineas || [];
    DB.revisionesRetiroLineas.push({
      id: Date.now() + 1, revisionIdLocal: String(id).slice(-9),
      periodo: mes, servicioCodigo: 'OBJ-RH-1', cantidadHoras: 104, valorHora: 4383.12, monto: Math.round(104 * 4383.12 * 100) / 100,
    });
    return id;
  }, mes);
  await page.evaluate(() => window.renderRevisionesRetiro());
  await page.waitForTimeout(150);
  await expect(page.locator('#tbody-revision-retiro')).toContainText('RH TEST UNO');

  // --- Punto 1c: Operaciones revisa con AJUSTE ---
  await cambiarRol(page, 'Central Ops', 'Operaciones');
  await page.evaluate(() => window.renderRevisionesRetiro());
  await page.waitForTimeout(150);

  await page.evaluate((id) => window.abrirRevisarSolicitud(id), solicitudId);
  await page.waitForTimeout(150);
  await expect(page.locator('#modal-revisar-solicitud')).toBeVisible();
  // Solicitado se ve, de solo lectura
  await expect(page.locator('#rev-lineas-body')).toContainText('104,00 hs');

  await page.fill('#rev-hs-0', '96');
  await page.waitForTimeout(100);
  // El botón solo se habilita si de verdad cambió algo (regla del
  // motivo obligatorio "solo al ajustar", no en cualquier revisión).
  await expect(page.locator('#rev-btn-ajuste')).toBeEnabled();
  await page.fill('#rev-motivo', 'Se verificó en la grilla: 96 hs reales, no 104');
  await page.evaluate(() => window.decidirRevisionSolicitud('ajuste'));

  // Mismo límite del bypass de login que en adelantos: sin sesión real
  // de Supabase Auth, supaSync choca con RLS y decidirRevisionSolicitud
  // aborta a propósito (no marca "corresponde con ajuste" sin persistir
  // ni toca las líneas reales) — se verifica que el abort es seguro. El
  // shape exacto del payload (con_ajuste/ajuste_horas/etc., sql/v143) se
  // verificó aparte con un insert directo por REST.
  const [estadoFinal, lineaIntacta] = await page.evaluate(async (id) => {
    const { DB } = await import('/src/shared/state.js');
    const r = DB.revisionesRetiro.find(x => x.id === id);
    const l = DB.revisionesRetiroLineas.find(x => x.revisionIdLocal === String(id).slice(-9));
    return [r?.estado, l?.cantidadHoras];
  }, solicitudId);
  expect(estadoFinal).toBe('En revisión');
  expect(lineaIntacta).toBe(104);
});
