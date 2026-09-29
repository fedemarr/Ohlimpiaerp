// Nivel 1: "descuento en cuotas a mitad de plan" — préstamo con 1 de 4
// cuotas ya debitada, saldo verificable a mano.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { conectarStaging } from './_conexion.js';
import { PRESTAMO_MITAD_DE_PLAN } from '../../scripts/seed_staging.mjs';

let client;
beforeAll(async () => { client = await conectarStaging(); });
afterAll(async () => { await client.end(); });

describe('Préstamos — plan de cuotas a mitad de camino', () => {
  it('monto_total = capital × 1.10 = $440.000, monto_cuota = $110.000', async () => {
    const r = await client.query(
      `select monto, monto_total, monto_cuota, cuotas from public.prestamos where nro_socio = $1`,
      [String(PRESTAMO_MITAD_DE_PLAN.nroSocio)],
    );
    expect(r.rows).toHaveLength(1);
    const p = r.rows[0];
    expect(Number(p.monto)).toBe(PRESTAMO_MITAD_DE_PLAN.capital);
    expect(Number(p.monto_total)).toBe(PRESTAMO_MITAD_DE_PLAN.MONTO_TOTAL_ESPERADO);
    expect(Number(p.monto_cuota)).toBe(PRESTAMO_MITAD_DE_PLAN.MONTO_CUOTA_ESPERADO);
    expect(PRESTAMO_MITAD_DE_PLAN.MONTO_TOTAL_ESPERADO).toBe(440000); // ancla literal
  });

  it('1 de 4 cuotas está Debitada, y el saldo pendiente da exactamente $330.000', async () => {
    const r = await client.query(`select plan_cuotas from public.prestamos where nro_socio = $1`, [String(PRESTAMO_MITAD_DE_PLAN.nroSocio)]);
    const plan = r.rows[0].plan_cuotas;
    expect(plan).toHaveLength(4);
    const debitadas = plan.filter((c) => c.estado === 'Debitada');
    const pendientes = plan.filter((c) => c.estado === 'Pendiente');
    expect(debitadas).toHaveLength(1);
    expect(pendientes).toHaveLength(3);
    const saldo = pendientes.reduce((acc, c) => acc + Number(c.monto), 0);
    expect(saldo).toBe(PRESTAMO_MITAD_DE_PLAN.SALDO_ESPERADO_A_MITAD_DE_PLAN);
    expect(saldo).toBe(330000); // ancla literal, independiente de la constante
  });

  it('la cuota debitada quedó en el mes cerrado, con su movimiento de débito registrado', async () => {
    const r = await client.query(`select plan_cuotas, movimientos from public.prestamos where nro_socio = $1`, [String(PRESTAMO_MITAD_DE_PLAN.nroSocio)]);
    const cuota1 = r.rows[0].plan_cuotas.find((c) => c.numero === 1);
    expect(cuota1.estado).toBe('Debitada');
    expect(r.rows[0].movimientos.some((m) => m.tipo === 'Débito cuota' && m.cuotaNro === 1)).toBe(true);
  });
});
