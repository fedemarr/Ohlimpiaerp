// Gestión de precios — valor hora pactado del MES DE INICIO de un servicio nuevo.
//
// Problema: un servicio dado de alta (objetivos) llega a la matriz de Precios
// sin ninguna fila en objetivo_precios, así que su valor hora pactado del mes
// de inicio quedaba vacío hasta que Comercial lo cargaba a mano (caso Zylsa,
// inicio 16/09/2026).
//
// Este archivo es LÓGICA PURA (sin Supabase ni DOM) para poder testearla: dado
// los servicios activos, las sucursales y las filas de precios que ya existen,
// decide qué filas sembrar y de cuáles servicios no se puede. El I/O vive en
// precios.js (sincronizarSucursalesDesdeObjetivos).

// El valor hora pactado sale del alta del servicio:
//  - "Por EFT" / "Por horas variables": la hora se carga directo (valor_hora).
//  - "Abono mensual fijo": se carga el mensual y la hora de referencia se
//    DERIVA (mensual / cantidad de horas), igual que el formulario de alta.
// null = no hay dato suficiente (no se inventa un valor).
export function valorHoraPactado(o) {
  const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const porHora = o.modelo_precio === 'Por EFT' || o.modelo_precio === 'Por horas variables';
  const v = porHora ? num(o.valor_hora) : (num(o.efts) > 0 ? num(o.valor) / num(o.efts) : 0);
  return v > 0 ? Math.round(v * 100) / 100 : null;
}

// fecha_inicio llega como 'YYYY-MM-DD' desde la base (columna date) o como
// 'D/M/AAAA' recién guardada en memoria. Devuelve 'YYYY-MM-01' o null.
export function mesDeInicio(fecha) {
  const s = String(fecha || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-01` : null;
}

// objetivos: filas de `objetivos` ya filtradas a activos (Operativo, no anulado).
// suc: sucursales ({id, cliente_id, codigo_objetivo, tipo_servicio}).
// precios: filas de objetivo_precios ({sucursal_id}).
// mesActual: 'YYYY-MM-01'.
//
// Solo se siembra si la sucursal NO tiene NINGÚN precio: es el servicio recién
// dado de alta. Un servicio con historia de precios (cargada de LIGE o a mano)
// no se toca, y volver a correr esto nunca duplica ni pisa una carga posterior.
export function planificarSemillas({ objetivos, suc, precios, mesActual }) {
  const sucPorCodigo = new Map(suc.filter((s) => s.codigo_objetivo).map((s) => [s.codigo_objetivo, s]));
  const conPrecios = new Set(precios.map((p) => p.sucursal_id));
  const filas = [];
  const sinValorHora = [];
  for (const o of objetivos) {
    const s = sucPorCodigo.get(o.codigo);
    if (!s || conPrecios.has(s.id)) continue;
    const mes = mesDeInicio(o.fecha_inicio);
    if (!mes) continue;   // sin fecha de inicio no hay mes donde ubicarlo
    const precio = valorHoraPactado(o);
    if (precio == null) { sinValorHora.push({ codigo: o.codigo, mes }); continue; }
    filas.push({
      sucursal_id: s.id,
      codigo_objetivo: s.codigo_objetivo,
      cliente_id: s.cliente_id || null,
      mes,
      precio_hora: precio,
      // Mismo criterio que guardar una celda a mano (precios.js): mes pasado =
      // real, mes en curso o futuro = negociado (es el precio pactado).
      tipo: mes < mesActual ? 'real' : 'negociado',
      tipo_precio: 'hora',
      // tipo_servicio integra la clave única (sucursal_id, mes, tipo_servicio);
      // mismo valor que usa metaObjetivoParaMes al guardar a mano.
      tipo_servicio: s.tipo_servicio || 'vigilancia',
      fuente: 'manual',
    });
  }
  return { filas, sinValorHora };
}
