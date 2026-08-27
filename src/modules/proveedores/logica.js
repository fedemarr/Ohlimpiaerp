// Módulo Proveedores — lógica pura (sin DOM ni Supabase) para poder testear.
// Convención: igual que categorias/consultas.js y vacaciones/saldo.js.

// ========== CATÁLOGOS (compartidos entre UI y tests) ==========

export const RUBROS_PROVEEDOR = [
  'PRODUCTOS',
  'REPARACIÓN MÁQUINAS',
  'ALQUILER MÁQUINAS',
  'UNIFORMES',
  'OTRO',
];

export const CONDICIONES_ARCA = [
  'Responsable Inscripto (Factura A)',
  'Monotributo (Factura C)',
  'Exento',
];

export const CONDICIONES_PAGO = [
  'Contado',
  'Cta cte 30 días',
  'Contra factura c/ OK Logística',
];

export const FRECUENCIAS_PEDIDO = ['Mensual', 'Quincenal', 'A demanda'];

// Umbral para considerar desactualizada la lista de precios (mockup: NIMI con
// lista de junio "hace 2 meses ⚠" en agosto → ~45 días de tolerancia).
export const DIAS_LISTA_VIGENTE = 45;

// ========== CUIT / MAIL ==========

export function normalizarCuit(s) {
  return String(s || '').replace(/\D/g, '');
}

// Dígito verificador ARCA/AFIP: pesos [5,4,3,2,7,6,5,4,3,2] sobre los
// primeros 10 dígitos; dv = 11 - (suma % 11); 11→0, 10→9.
export function calcularDigitoCuit(diezDigitos) {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(diezDigitos[i]) * pesos[i];
  const dv = 11 - (suma % 11);
  if (dv === 11) return 0;
  if (dv === 10) return 9;
  return dv;
}

// Acepta con/sin guiones y espacios. Vacío = válido (el campo no es obligatorio);
// texto presente sin ningún dígito ('abc') = inválido.
export function validarCuit(s) {
  const raw = String(s ?? '').trim();
  if (!raw) return true;
  const d = raw.replace(/\D/g, '');
  if (!d) return false;
  if (d.length !== 11) return false;
  return calcularDigitoCuit(d) === Number(d[10]);
}

export function validarMail(s) {
  if (!s) return true; // opcional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

// ========== CÓDIGO PROV-xxx ==========

// Siguiente código = max(PROV-nnn existente) + 1, pad 3. Ignora nulos/raros.
export function proximoCodigoProveedores(proveedores) {
  let max = 0;
  (proveedores || []).forEach(p => {
    const m = /^PROV-(\d+)$/.exec(String(p.codigo || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'PROV-' + String(max + 1).padStart(3, '0');
}

// ========== RUBROS ==========

// rubros vive como jsonb (array). Tolera null/viejos formatos.
export function rubrosDe(prov) {
  if (!prov) return [];
  if (Array.isArray(prov.rubros)) return prov.rubros.filter(Boolean);
  return [];
}

export function tieneRubro(prov, rubro) {
  return rubrosDe(prov).includes(rubro);
}

// ========== LISTAS DE PRECIOS (viene del módulo Pedido de productos) ==========
// ppPrecios: { productoIdLocal, vigenciaDesde:'YYYY-MM-DD', vigenciaHasta, costoUnit, anulado }
// ppProductos: { id, proveedorIdLocal, anulado }

function _diasDesde(fechaISO, fechaRefISO) {
  if (!fechaISO) return null;
  const ref = fechaRefISO ? new Date(fechaRefISO + 'T00:00:00') : new Date();
  const f = new Date(fechaISO + 'T00:00:00');
  return Math.floor((ref - f) / 86400000);
}

// Última vigenciaDesde entre los productos activos del proveedor.
// Devuelve { fecha, dias } o null si no tiene catálogo con precios.
export function ultimaListaProveedor({ productos, precios, proveedorId, fechaRefISO }) {
  const prodIds = new Set(
    (productos || [])
      .filter(p => !p.anulado && String(p.proveedorIdLocal || '') === String(proveedorId))
      .map(p => String(p.id))
  );
  if (!prodIds.size) return null;
  let max = null;
  (precios || []).forEach(pr => {
    if (pr.anulado) return;
    if (!prodIds.has(String(pr.productoIdLocal))) return;
    if (!pr.vigenciaDesde) return;
    if (!max || pr.vigenciaDesde > max) max = pr.vigenciaDesde;
  });
  if (!max) return null;
  return { fecha: max, dias: _diasDesde(max, fechaRefISO) };
}

// Chip de vigencia: 'vigente' | 'desactualizada' | null
export function estadoLista(info) {
  if (!info) return null;
  return info.dias <= DIAS_LISTA_VIGENTE ? 'vigente' : 'desactualizada';
}

// Precio vigente a fecha de hoy (misma regla que pedido_productos.precioVigente).
export function precioVigenteDe(precios, productoId, fechaISO) {
  let mejor = null;
  (precios || []).forEach(pr => {
    if (pr.anulado) return;
    if (String(pr.productoIdLocal) !== String(productoId)) return;
    if (pr.vigenciaDesde > fechaISO) return;
    if (pr.vigenciaHasta && pr.vigenciaHasta < fechaISO) return;
    if (!mejor || pr.vigenciaDesde > mejor.vigenciaDesde) mejor = pr;
  });
  return mejor ? Number(mejor.costoUnit) || 0 : 0;
}

// ========== COMPRAS (ppItems × ppPedidos × ppPeriodos) ==========
// Solo pedidos que ya salieron del borrador del supervisor (= compra real).

export function comprasPorPeriodoProveedor({ items, productos, pedidos, periodos, precios, proveedorId, fechaRefISO }) {
  const provIds = new Set(
    (productos || [])
      .filter(p => String(p.proveedorIdLocal || '') === String(proveedorId))
      .map(p => String(p.id))
  );
  const pedidoById = new Map((pedidos || []).filter(p => !p.anulado).map(p => [String(p.id), p]));
  // FIX 27/08: mismo bug que pedido_productos.js — pedido.periodoIdLocal
  // se guardaba con el id COMPLETO del período, pero tras recargar la
  // página periodo.id pasa a ser el id_local TRUNCADO (9 caracteres,
  // ver supaSync en supabase.js). Se indexa por los últimos 9
  // caracteres de los dos lados para que matchee sin importar cuál de
  // las dos formas trae cada uno.
  const periodoById = new Map((periodos || []).map(p => [String(p.id).slice(-9), p]));
  const porMes = new Map();

  (items || []).forEach(it => {
    if (it.anulado) return;
    if (!provIds.has(String(it.productoIdLocal))) return;
    const pedido = pedidoById.get(String(it.pedidoIdLocal));
    if (!pedido || pedido.estado === 'borrador') return;
    const periodo = periodoById.get(String(pedido.periodoIdLocal).slice(-9));
    const mes = periodo ? periodo.mes : '?';
    const cant = it.cantAutorizada != null ? it.cantAutorizada : (it.cantSolicitada || 0);
    const costo = it.costoCongelado > 0
      ? it.costoCongelado
      : precioVigenteDe(precios, it.productoIdLocal, fechaRefISO || new Date().toISOString().slice(0, 10));
    const acc = porMes.get(mes) || { mes, lineas: 0, total: 0 };
    acc.lineas++;
    acc.total += cant * costo;
    porMes.set(mes, acc);
  });

  return [...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}

export function comprasAno(filas, ano) {
  return (filas || []).filter(f => String(f.mes || '').startsWith(String(ano))).reduce((s, f) => s + f.total, 0);
}

// ========== ACTIVIDAD DESDE MÁQUINAS ==========
// maquinas_tickets.proveedorNombre y maquinas.proveedorAlquiler son texto
// libre: se matchean contra la razón social exacta (trim + case-insensitive).
// Supuesto documentado hasta que Máquinas apunte al padrón por id.

const _normNombre = s => String(s || '').trim().toLowerCase();

export function ticketsDeProveedor(tickets, nombre) {
  const target = _normNombre(nombre);
  if (!target) return [];
  return (tickets || []).filter(t => !t.anulado && _normNombre(t.proveedorNombre) === target);
}

export function maquinasAlquiladas(maquinas, nombre) {
  const target = _normNombre(nombre);
  if (!target) return [];
  return (maquinas || []).filter(m => !m.anulado && m.propiedad === 'alquilada' && _normNombre(m.proveedorAlquiler) === target);
}

// ========== KPIs DEL PADRÓN ==========

// mesActual formato 'YYYY-MM' (igual que ppPeriodos.mes)
export function kpisProveedores({ proveedores, productos, precios, items, pedidos, periodos, mesActual, fechaRefISO }) {
  const vivos = (proveedores || []).filter(p => !p.anulado);
  const activos = vivos.filter(p => (p.estado || 'activo') !== 'inactivo');

  let conCatalogo = 0;
  let listaDesactualizada = 0;
  activos.forEach(p => {
    if (tieneRubro(p, 'PRODUCTOS')) {
      conCatalogo++;
      const est = estadoLista(ultimaListaProveedor({ productos, precios, proveedorId: p.id, fechaRefISO }));
      if (est === 'desactualizada') listaDesactualizada++;
    }
  });

  const comprasMesTotal = vivos.reduce((s, p) => {
    const filas = comprasPorPeriodoProveedor({ items, productos, pedidos, periodos, precios, proveedorId: p.id, fechaRefISO });
    return s + filas.filter(f => f.mes === mesActual).reduce((ss, f) => ss + f.total, 0);
  }, 0);

  return { total: vivos.length, activos: activos.length, conCatalogo, listaDesactualizada, comprasMes: comprasMesTotal };
}
