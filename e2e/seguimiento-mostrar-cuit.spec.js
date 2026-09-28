import { test, expect } from '@playwright/test';
import { loginComoAdmin } from './helpers.js';

// Ticket #185 (Jimena): "en vez de que figure el dni abajo del candidato que
// se encuentra realizando el proceso de ingreso necesito que figure el
// CUIT/CUIL".
//
// El campo `cuit` ya existía en la tabla `candidatos` y en el formulario de
// carga, así que el ticket era solo de qué se muestra: la tarjeta del
// candidato en Seguimiento imprimía "DNI <dni>". Ahora imprime el CUIT, con
// el DNI como fallback para los candidatos cargados antes de que existiera
// el campo.

const PEDIDO_ID = 990801;
const CANDIDATO_ID = 9908011;

async function sembrarConCandidato(page, candidato) {
  await page.evaluate(async ({ pedidoId, candidatoId, c }) => {
    const { DB } = await import('/src/shared/state.js');
    DB.objetivos = DB.objetivos || [];
    if (!DB.objetivos.some(o => o.codigo === 'OBJ-CUIT-E2E')) {
      DB.objetivos.push({ codigo: 'OBJ-CUIT-E2E', nombre: 'Servicio CUIT E2E', supervisorAsignado: 'SUP CUIT E2E', estado: 'Operativo', anulado: false, localidad: 'San Isidro' });
    }
    DB.pedidos = DB.pedidos || [];
    DB.pedidos.push({
      id: pedidoId, numero: 9801, fecha: '01/09/2026', cargadoPor: 'Test E2E', supervisor: 'SUP CUIT E2E',
      servicio: 'OBJ-CUIT-E2E', zona: 'Zona Norte', puesto: 'Operario/a', cantidad: 1, fechaLimite: '31/12/2099',
      urgencia: 'Media', perfil: [], obs: '', estado: 'En búsqueda',
    });
    DB.candidatos = DB.candidatos || [];
    DB.candidatos.push({ ...c, id: candidatoId, pedidoVinculadoIdLocal: String(pedidoId) });
    window.navTo('pedidos');
  }, { pedidoId: PEDIDO_ID, candidatoId: CANDIDATO_ID, c: candidato });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.cambiarTabPedidos('seguimiento'));
  await page.waitForTimeout(250);
}

test('La tarjeta del candidato muestra CUIT/CUIL en lugar de DNI', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarConCandidato(page, {
    apellido: 'CUITOK', nombre: 'Candidato', dni: '30990801', cuit: '20-30980801-9',
    tel: '', zona: 'Zona Norte', medio: '', estado: 'Aprobado', asistio: '', motivoRechazo: '',
  });

  const card = page.locator('#tbody-seg-sel .seg-cand').filter({ hasText: 'CUITOK' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('CUIT/CUIL 20-30980801-9');
  await expect(card).not.toContainText('DNI 30990801');
});

test('Sin CUIT cargado se sigue viendo el DNI (candidatos cargados antes del campo)', async ({ page }) => {
  await loginComoAdmin(page);
  await sembrarConCandidato(page, {
    apellido: 'SINCUIT', nombre: 'Candidato', dni: '30990802', cuit: '',
    tel: '', zona: 'Zona Norte', medio: '', estado: 'Aprobado', asistio: '', motivoRechazo: '',
  });

  const card = page.locator('#tbody-seg-sel .seg-cand').filter({ hasText: 'SINCUIT' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('DNI 30990802');
  await expect(card).not.toContainText('CUIT/CUIL');
});
