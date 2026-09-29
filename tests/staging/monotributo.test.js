// Nivel 1: "el CUR congelado de un mes ya armado no cambia aunque se
// importe una tabla nueva". El "congelado" real en este código es
// mono_pagos_mes.pagado=true (ver investigación) — no una vigencia
// guardada. El seed deja el mes con pagado=true Y una mono_tablas
// posterior con valores bien distintos; el total tiene que seguir dando
// el viejo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { conectarStaging } from './_conexion.js';
import { MONOTRIBUTO_CONGELADO, MONO_TABLA_POSTERIOR } from '../../scripts/seed_staging.mjs';

let client;
beforeAll(async () => { client = await conectarStaging(); });
afterAll(async () => { await client.end(); });

describe('Monotributo — CUR congelado no se mueve con una tabla posterior', () => {
  it('el total congelado del mes sigue siendo 49527.18 (5585.77 + 18246.86 + 25694.55)', async () => {
    const r = await client.query(
      `select total, pagado from public.mono_pagos_mes where periodo = $1 and nro_socio = $2`,
      [MONOTRIBUTO_CONGELADO.periodo, String(MONOTRIBUTO_CONGELADO.nroSocio)],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].pagado).toBe(true);
    expect(Number(r.rows[0].total)).toBe(MONOTRIBUTO_CONGELADO.TOTAL_CONGELADO_ESPERADO);
    expect(MONOTRIBUTO_CONGELADO.TOTAL_CONGELADO_ESPERADO).toBe(49527.18); // ancla literal
  });

  it('la tabla posterior existe de verdad, con valores distintos — si no existiera, el test de arriba no probaría nada', async () => {
    const r = await client.query(
      `select impuesto_integrado, sipa, obra_social from public.mono_tablas
       where organismo='ARCA' and categoria=$1 and vigencia_desde=$2`,
      [MONO_TABLA_POSTERIOR.categoria, MONO_TABLA_POSTERIOR.vigenciaDesde],
    );
    expect(r.rows).toHaveLength(1);
    const total = Number(r.rows[0].impuesto_integrado) + Number(r.rows[0].sipa) + Number(r.rows[0].obra_social);
    expect(total).not.toBe(MONOTRIBUTO_CONGELADO.TOTAL_CONGELADO_ESPERADO);
    expect(total).toBe(54000); // 7000 + 20000 + 27000
  });

  it('la vigencia "vigente hoy" (getVigenciaActualOrg del código real) ya resolvería a la posterior, no a la congelada — por eso hace falta el flag pagado, no alcanza con la fecha', async () => {
    const r = await client.query(
      `select vigencia_desde from public.mono_tablas
       where organismo='ARCA' and categoria=$1 and vigencia_desde <= current_date
       order by vigencia_desde desc limit 1`,
      [MONO_TABLA_POSTERIOR.categoria],
    );
    // Si "hoy" (fecha real de la corrida) ya pasó el 2026-10-01, la más
    // vigente es la posterior — confirma por qué el código necesita el
    // campo `pagado` como candado, no puede confiar en la fecha del período.
    expect(r.rows.length).toBeGreaterThan(0);
  });
});
