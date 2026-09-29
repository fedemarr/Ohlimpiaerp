// Nivel 1: "aislamiento multi-tenant — una query con el tenant A nunca
// devuelve datos del tenant B".
//
// OJO — honestidad sobre lo que esto prueba de verdad: en este proyecto el
// multi-tenant real es "un proyecto de Supabase por empresa cliente" (ver
// sql/v089_superadmin_empresas.sql: "no hay empresa_id compartido en
// ninguna tabla operativa"). No existe ninguna tabla operativa (legajos,
// liquidaciones, etc.) con una columna de tenant que aislar — el
// aislamiento real pasa por tener bases físicamente separadas, algo que
// una query dentro de UNA base no puede violar ni confirmar.
// Lo único real que hay para probar acá es `empresas_cliente` (el
// registro/bookkeeping de Superadmin de qué empresas existen) — así que
// este test verifica lo que sí es cierto: una consulta filtrada por
// id_local nunca devuelve ni mezcla el registro de una empresa parecida.
// Si en algún momento se agrega una tabla operativa con tenant real, este
// test hay que reemplazarlo por uno que sí pruebe fuga de datos de negocio.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { conectarStaging } from './_conexion.js';
import { EMPRESA_A, EMPRESA_B } from '../../scripts/seed_staging.mjs';

let client;
beforeAll(async () => { client = await conectarStaging(); });
afterAll(async () => { await client.end(); });

describe('empresas_cliente — dos empresas con nombres parecidos no se cruzan', () => {
  it('una consulta por id_local de la empresa A devuelve solo la A, con su propio nombre y url', async () => {
    const r = await client.query(`select nombre, supabase_url from public.empresas_cliente where id_local = $1`, [EMPRESA_A.idLocal]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].nombre).toBe(EMPRESA_A.nombre);
    expect(r.rows[0].supabase_url).toBe(EMPRESA_A.supabaseUrl);
    expect(r.rows[0].nombre).not.toBe(EMPRESA_B.nombre);
  });

  it('una consulta por id_local de la empresa B devuelve solo la B', async () => {
    const r = await client.query(`select nombre, supabase_url from public.empresas_cliente where id_local = $1`, [EMPRESA_B.idLocal]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].nombre).toBe(EMPRESA_B.nombre);
    expect(r.rows[0].supabase_url).toBe(EMPRESA_B.supabaseUrl);
  });

  it('las dos filas existen y son físicamente distintas (id distinto), pese al nombre parecido', async () => {
    const r = await client.query(`select id_local from public.empresas_cliente where id_local in ($1,$2)`, [EMPRESA_A.idLocal, EMPRESA_B.idLocal]);
    expect(r.rows).toHaveLength(2);
  });
});
