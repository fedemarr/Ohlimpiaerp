// Nivel 1 (OHLIMPIA_TESTS_STAGING.md, Parte 2): "las queries de liquidación
// devuelven los montos esperados sobre datos conocidos del seed" +
// "un valor con vigente-desde posterior no afecta un período anterior".
//
// Corre contra la base de STAGING real (scripts/seed_staging.mjs ya
// corrido) — sin mocks, sin recalcular la fórmula acá (eso sería
// circular). Los montos contra los que se compara son las constantes
// literales del seed, con la cuenta a mano en el comentario de al lado.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { conectarStaging } from './_conexion.js';
import { LEGAJO_LIQUIDACION_OK, LEGAJO_FUERA_DE_CATEGORIA, MES_CERRADO, MES_ABIERTO } from '../../scripts/seed_staging.mjs';

let client;
beforeAll(async () => { client = await conectarStaging(); });
afterAll(async () => { await client.end(); });

describe('Liquidación — período cerrado, montos conocidos del seed', () => {
  it('el neto ya pagado (lotes_pago_items) coincide con la cuenta a mano: 176h × $1.000 + 3% presentismo = $181.280', async () => {
    const r = await client.query(
      `select monto from public.lotes_pago_items where legajo_nro = $1`,
      [String(LEGAJO_LIQUIDACION_OK.nro)],
    );
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0].monto)).toBe(LEGAJO_LIQUIDACION_OK.NETO_ESPERADO);
    expect(LEGAJO_LIQUIDACION_OK.NETO_ESPERADO).toBe(181280); // ancla literal, no solo contra la constante
  });

  it('el período cerrado está congelado y confirmado', async () => {
    const r = await client.query(`select congelado, confirmado from public.periodos_liquidacion where periodo = $1`, [MES_CERRADO]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].congelado).toBe(true);
    expect(r.rows[0].confirmado).toBe(true);
  });

  it('el período abierto NO está congelado', async () => {
    const r = await client.query(`select congelado from public.periodos_liquidacion where periodo = $1`, [MES_ABIERTO]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].congelado).toBe(false);
  });

  it('la grilla del mes cerrado tiene las 176 horas cargadas para el legajo de prueba', async () => {
    const r = await client.query(
      `select asociados from public.grillas_liq where objetivo_codigo = $1 and periodo = $2`,
      [LEGAJO_LIQUIDACION_OK.servicio, MES_CERRADO],
    );
    expect(r.rows).toHaveLength(1);
    const asoc = r.rows[0].asociados.find((a) => a.nro === LEGAJO_LIQUIDACION_OK.nro);
    const totalHoras = Object.values(asoc.horas).reduce((a, b) => a + b, 0);
    expect(totalHoras).toBe(176); // 22 días × 8hs
  });
});

describe('Vigencias — un valor hora con vigencia posterior no afecta el mes cerrado', () => {
  it('para MES_CERRADO, el valor hora vigente es $1.000, no el $1.500 que arranca el mes siguiente', async () => {
    const r = await client.query(
      `select valor_hora from public.valores_hora_categoria
       where categoria_id_local = $1 and vigencia_desde <= $2 and not anulado
       order by vigencia_desde desc limit 1`,
      [LEGAJO_LIQUIDACION_OK.categoriaIdLocal, `${MES_CERRADO}-01`],
    );
    expect(Number(r.rows[0].valor_hora)).toBe(1000);
  });

  it('para MES_ABIERTO (mes siguiente), el valor hora vigente ya es el nuevo: $1.500', async () => {
    const r = await client.query(
      `select valor_hora from public.valores_hora_categoria
       where categoria_id_local = $1 and vigencia_desde <= $2 and not anulado
       order by vigencia_desde desc limit 1`,
      [LEGAJO_LIQUIDACION_OK.categoriaIdLocal, `${MES_ABIERTO}-01`],
    );
    expect(Number(r.rows[0].valor_hora)).toBe(1500);
  });
});

describe('Caso borde — asociado fuera de categoría (sin valor hora vigente)', () => {
  it('su categoría NO tiene ninguna fila en valores_hora_categoria — el cálculo tiene que dar null, nunca inventar 0', async () => {
    const r = await client.query(
      `select count(*)::int as n from public.valores_hora_categoria where categoria_id_local = $1 and not anulado`,
      [LEGAJO_FUERA_DE_CATEGORIA.categoriaIdLocal],
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('igual está en el padrón y en la grilla del mes — el hueco es real, no un dato faltante por error del seed', async () => {
    const padron = await client.query(`select 1 from public.padron_categorias_asociado where legajo_nro = $1`, [String(LEGAJO_FUERA_DE_CATEGORIA.nro)]);
    expect(padron.rows).toHaveLength(1);
    const grilla = await client.query(
      `select asociados from public.grillas_liq where objetivo_codigo = $1 and periodo = $2`,
      [LEGAJO_FUERA_DE_CATEGORIA.servicio, MES_CERRADO],
    );
    const asoc = grilla.rows[0].asociados.find((a) => a.nro === LEGAJO_FUERA_DE_CATEGORIA.nro);
    expect(asoc).toBeTruthy();
  });
});
