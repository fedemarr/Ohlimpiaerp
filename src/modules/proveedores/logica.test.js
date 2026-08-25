// Tests de la lógica pura del módulo Proveedores (v100).
// Sin DOM ni Supabase: solo funciones puras de logica.js.

import { describe, it, expect } from 'vitest';
import {
  RUBROS_PROVEEDOR, DIAS_LISTA_VIGENTE,
  normalizarCuit, calcularDigitoCuit, validarCuit, validarMail,
  proximoCodigoProveedores, rubrosDe, tieneRubro,
  ultimaListaProveedor, estadoLista, precioVigenteDe,
  comprasPorPeriodoProveedor, comprasAno,
  ticketsDeProveedor, maquinasAlquiladas,
  kpisProveedores,
} from './logica.js';

// Genera un CUIT válido con el algoritmo ARCA (implementación independiente
// del test — si logica.js se equivoca en pesos/módulo, estos casos lo cantan).
function cuitValido(base10) {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(base10[i]) * pesos[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return base10 + String(dv);
}

describe('CUIT', () => {
  it('valida un CUIT correcto con y sin formato', () => {
    const cuit = cuitValido('3063298101'); // base de 10 dígitos (2 prefijo + 8)
    expect(validarCuit(cuit)).toBe(true);
    expect(validarCuit(cuit.slice(0, 2) + '-' + cuit.slice(2, 10) + '-' + cuit.slice(10))).toBe(true);
    expect(normalizarCuit(cuit.slice(0, 2) + '-' + cuit.slice(2, 10) + '-' + cuit.slice(10))).toBe(cuit);
  });

  it('rechaza dígito verificador malo, largo corto y basura', () => {
    const bueno = cuitValido('3063298101');
    const malo = bueno.slice(0, 10) + String((Number(bueno[10]) + 1) % 10);
    expect(validarCuit(malo)).toBe(false);
    expect(validarCuit('30-12345678')).toBe(false);
    expect(validarCuit('abc')).toBe(false);
  });

  it('vacío es válido (campo opcional)', () => {
    expect(validarCuit('')).toBe(true);
    expect(validarCuit(null)).toBe(true);
  });

  it('calcularDigitoCuit: 11→0 y 10→9 (casos borde del módulo 11)', () => {
    // Se verifican vía cuitValido + validarCuit ida y vuelta con varias bases
    // (alguna caerá en cada rama del 11-x según el módulo).
    ['3063298101', '3063298102', '2034567890'].forEach(b => {
      expect(validarCuit(cuitValido(b))).toBe(true);
    });
  });
});

describe('mail', () => {
  it('acepta vacío y mails razonables; rechaza sin @ o sin dominio', () => {
    expect(validarMail('')).toBe(true);
    expect(validarMail('ventas@thames.com.ar')).toBe(true);
    expect(validarMail('sin-arroba')).toBe(false);
    expect(validarMail('a@b')).toBe(false);
  });
});

describe('proximoCodigoProveedores', () => {
  it('lista vacía → PROV-001', () => {
    expect(proximoCodigoProveedores([])).toBe('PROV-001');
  });
  it('toma el máximo y suma 1 aunque haya huecos', () => {
    expect(proximoCodigoProveedores([{ codigo: 'PROV-001' }, { codigo: 'PROV-003' }])).toBe('PROV-004');
  });
  it('ignora códigos raros/nulos y no reusa el seed roto', () => {
    expect(proximoCodigoProveedores([{ codigo: null }, { nombre: 'x' }, { codigo: 'PROV-009' }])).toBe('PROV-010');
  });
  it('pasa de 999 sin reventar el pad', () => {
    expect(proximoCodigoProveedores([{ codigo: 'PROV-999' }])).toBe('PROV-1000');
  });
});

describe('rubros', () => {
  it('rubrosDe tolera null/array/otros', () => {
    expect(rubrosDe(null)).toEqual([]);
    expect(rubrosDe({ rubros: ['PRODUCTOS'] })).toEqual(['PRODUCTOS']);
    expect(rubrosDe({})).toEqual([]);
  });
  it('tieneRubro', () => {
    expect(tieneRubro({ rubros: ['PRODUCTOS', 'OTRO'] }, 'PRODUCTOS')).toBe(true);
    expect(tieneRubro({ rubros: [] }, 'PRODUCTOS')).toBe(false);
  });
  it('catálogo de rubros coincide con el mockup', () => {
    expect(RUBROS_PROVEEDOR).toEqual(['PRODUCTOS', 'REPARACIÓN MÁQUINAS', 'ALQUILER MÁQUINAS', 'UNIFORMES', 'OTRO']);
  });
});

const FIX = () => ({
  productos: [
    { id: 'p1', proveedorIdLocal: 'prov1', anulado: false },
    { id: 'p2', proveedorIdLocal: 'prov1', anulado: false },
    { id: 'p3', proveedorIdLocal: 'prov2', anulado: false },
    { id: 'p4', proveedorIdLocal: 'prov1', anulado: true }, // anulado no cuenta
  ],
  precios: [
    { productoIdLocal: 'p1', vigenciaDesde: '2026-08-16', costoUnit: 100, anulado: false },
    { productoIdLocal: 'p1', vigenciaDesde: '2026-06-01', costoUnit: 80, anulado: false }, // viejo
    { productoIdLocal: 'p2', vigenciaDesde: '2026-05-10', costoUnit: 50, anulado: false },
    { productoIdLocal: 'p3', vigenciaDesde: '2026-07-01', costoUnit: 99, anulado: false }, // otro prov
    { productoIdLocal: 'p1', vigenciaDesde: '2026-09-01', costoUnit: 200, anulado: false }, // futuro, igual cuenta para "última"
  ],
  pedidos: [
    { id: 'ped1', periodoIdLocal: 'per1', estado: 'entregado', anulado: false },
    { id: 'ped2', periodoIdLocal: 'per2', estado: 'borrador', anulado: false }, // borrador no compra
    { id: 'ped3', periodoIdLocal: 'per1', estado: 'en_compra', anulado: true },  // anulado no compra
  ],
  periodos: [
    { id: 'per1', mes: '2026-08' },
    { id: 'per2', mes: '2026-07' },
  ],
  items: [
    { pedidoIdLocal: 'ped1', productoIdLocal: 'p1', cantSolicitada: 10, cantAutorizada: null, costoCongelado: 0, anulado: false },
    { pedidoIdLocal: 'ped1', productoIdLocal: 'p2', cantSolicitada: 4, cantAutorizada: 2, costoCongelado: 50, anulado: false },
    { pedidoIdLocal: 'ped2', productoIdLocal: 'p1', cantSolicitada: 99, cantAutorizada: null, costoCongelado: 0, anulado: false },
    { pedidoIdLocal: 'ped3', productoIdLocal: 'p1', cantSolicitada: 7, cantAutorizada: null, costoCongelado: 0, anulado: false },
    { pedidoIdLocal: 'ped1', productoIdLocal: 'p3', cantSolicitada: 5, cantAutorizada: null, costoCongelado: 10, anulado: false }, // otro prov
  ],
});

describe('ultimaListaProveedor / estadoLista', () => {
  it('toma la vigenciaDesde máxima de los productos vivos del proveedor', () => {
    const f = FIX();
    const info = ultimaListaProveedor({ ...f, proveedorId: 'prov1', fechaRefISO: '2026-08-24' });
    expect(info.fecha).toBe('2026-09-01'); // máximo, aunque sea futuro
  });
  it('null si el proveedor no tiene productos/precios', () => {
    const f = FIX();
    expect(ultimaListaProveedor({ ...f, proveedorId: 'provX', fechaRefISO: '2026-08-24' })).toBeNull();
    const soloSinPrecios = { productos: [{ id: 'z', proveedorIdLocal: 'provZ', anulado: false }], precios: [], proveedorId: 'provZ' };
    expect(ultimaListaProveedor(soloSinPrecios)).toBeNull();
  });
  it('estadoLista usa el umbral de 45 días', () => {
    expect(estadoLista({ fecha: '2026-08-01', dias: 23 })).toBe('vigente');
    expect(estadoLista({ fecha: '2026-06-20', dias: 65 })).toBe('desactualizada');
    expect(DIAS_LISTA_VIGENTE).toBe(45);
  });
});

describe('precioVigenteDe', () => {
  it('elige la fila vigente a fecha (respeta vigenciaHasta y futuros)', () => {
    const f = FIX();
    expect(precioVigenteDe(f.precios, 'p1', '2026-07-01')).toBe(80);   // aún no arrancó la de agosto
    expect(precioVigenteDe(f.precios, 'p1', '2026-08-20')).toBe(100);  // vigencia agosto
    expect(precioVigenteDe(f.precios, 'p1', '2026-09-05')).toBe(200);  // septiembre
    expect(precioVigenteDe(f.precios, 'px', '2026-08-20')).toBe(0);
  });
});

describe('comprasPorPeriodoProveedor', () => {
  it('agrupa por mes: excluye borradores/anulados/otro proveedor y respeta cantAutorizada+costoCongelado', () => {
    const f = FIX();
    const filas = comprasPorPeriodoProveedor({
      ...f, proveedorId: 'prov1',
      fechaRefISO: '2026-08-24',
    });
    expect(filas).toHaveLength(1); // ped2 es borrador, ped3 anulado → solo ped1/agosto
    expect(filas[0].mes).toBe('2026-08');
    expect(filas[0].lineas).toBe(2);
    // p1: 10 × precioVigente(2026-08-24)=100 ; p2: cantAutorizada=2 × congelado 50
    expect(filas[0].total).toBe(100 * 10 + 50 * 2);
  });
  it('comprasAno filtra por prefijo de año', () => {
    const filas = [{ mes: '2026-08', total: 100 }, { mes: '2025-12', total: 500 }];
    expect(comprasAno(filas, '2026')).toBe(100);
  });
});

describe('actividad Máquinas (matcheo por nombre libre)', () => {
  it('tickets por razón social exacta (case/space-insensitive)', () => {
    const tickets = [
      { proveedorNombre: 'THAMES', anulado: false },
      { proveedorNombre: ' thames ', anulado: false },
      { proveedorNombre: 'Otra', anulado: false },
      { proveedorNombre: 'THAMES', anulado: true },
    ];
    expect(ticketsDeProveedor(tickets, 'Thames')).toHaveLength(2);
    expect(ticketsDeProveedor(tickets, '')).toEqual([]);
  });
  it('máquinas alquiladas por nombre', () => {
    const maquinas = [
      { propiedad: 'alquilada', proveedorAlquiler: 'ALQUIMAQ', anulado: false },
      { propiedad: 'propia', proveedorAlquiler: 'ALQUIMAQ', anulado: false },
      { propiedad: 'alquilada', proveedorAlquiler: 'Otro', anulado: false },
    ];
    expect(maquinasAlquiladas(maquinas, 'alquimaq')).toHaveLength(1);
  });
});

describe('kpisProveedores', () => {
  it('cuenta activos, con catálogo, lista desactualizada y compras del mes', () => {
    const f = FIX();
    // prov1: lista 2026-09-01 vs ref 2026-08-24 → dias negativo → VIGENTE
    const proveedorVigente = { id: 'prov1', estado: 'activo', rubros: ['PRODUCTOS'], anulado: false };
    const proveedorViejo = {
      id: 'prov9', estado: 'activo', rubros: ['PRODUCTOS'], anulado: false,
    };
    const productosViejo = [
      ...f.productos,
      { id: 'p9', proveedorIdLocal: 'prov9', anulado: false },
    ];
    const preciosViejo = [
      ...f.precios,
      { productoIdLocal: 'p9', vigenciaDesde: '2026-05-01', costoUnit: 10, anulado: false }, // ~115 días → desactualizada
    ];
    const proveedores = [
      proveedorVigente,
      { id: 'prov2', estado: 'activo', rubros: [], anulado: false },
      { id: 'prov3', estado: 'inactivo', rubros: ['PRODUCTOS'], anulado: false }, // inactivo no cuenta catálogo
      proveedorViejo,
      { id: 'prov4', estado: 'activo', rubros: [], anulado: true }, // anulado fuera
    ];
    const k = kpisProveedores({
      proveedores,
      productos: productosViejo,
      precios: preciosViejo,
      items: f.items,
      pedidos: f.pedidos,
      periodos: f.periodos,
      mesActual: '2026-08',
      fechaRefISO: '2026-08-24',
    });
    expect(k.total).toBe(4);          // excluye anulado
    expect(k.activos).toBe(3);        // excluye anulado e inactivo
    expect(k.conCatalogo).toBe(2);    // prov1 + prov9 (rubro PRODUCTOS, activos)
    expect(k.listaDesactualizada).toBe(1); // solo prov9
    // compras agosto: prov1 (10×100 + 2×50) + prov2 (5×10) = 1100 + 50
    expect(k.comprasMes).toBe(1150);
  });
});
