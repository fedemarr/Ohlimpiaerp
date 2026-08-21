// Cálculo canónico de facturación desde clientes_precios.
// Usado por economico.js y horas.js para garantizar resultados idénticos.
//
// Regla por mes (basada en tabla meses_cerrados) — ver filaCuenta():
//   1. Mes CERRADO → solo las filas tipo='real'. Igual que siempre.
//   2. Mes ABIERTO → TODAS las filas, tal como vienen. Cada objetivo entra
//      con su factura real si ya la tiene, y con su proyección si todavía no.
//   3. El cierre es explícito por el usuario, independiente de la fecha actual.
//
// Regla por fila:
//   - tipo_precio='fijo' → facturación = precio_hora (monto mensual).
//   - tipo_precio='hora' o null:
//       · Si precio_hora > 100.000 y tipo_precio es null → tratar como fijo.
//       · Si no → horas × precio_hora (0 si alguna es 0).

/** Clasifica una fila en su modo de facturación + monto.
 *  Exportada para permitir reuso en caja.js (cálculo per-cliente per-mes). */
export function calcFilaFacturacion(p) {
  const precio = Number(p.precio_hora) || 0;
  const horas = Number(p.horas_vendidas) || 0;
  const tipoPrecio = p.tipo_precio || (precio > 100000 ? "fijo" : "hora");
  if (precio <= 0) return { fact: 0, horas, tipoPrecio };
  if (tipoPrecio === "fijo") return { fact: precio, horas, tipoPrecio };
  if (horas > 0) return { fact: horas * precio, horas, tipoPrecio };
  return { fact: 0, horas, tipoPrecio };
}

/** Devuelve el tipo a usar para un mes: 'real' si está cerrado, sino 'proyectado'.
 *  QUEDA SOLO PARA LECTURA/DEBUG. La decisión de si una fila entra o no la toma
 *  filaCuenta(): desde la mezcla por fila (11-ago) un mes abierto ya no espera un
 *  único tipo. */
export function tipoParaMes(mes, mesesCerradosSet) {
  return mesesCerradosSet.has(mes) ? "real" : "proyectado";
}

/** LA REGLA. Escrita UNA sola vez; las tres rutas de cálculo la usan.
 *
 *  MES CERRADO → solo 'real'. Es una GUARDA, no una formalidad: cerrarMesInterno
 *  (economico.js) guarda un snapshot de las filas proyectadas del mes pero NO las
 *  borra, así que quedan huérfanas en clientes_precios. Si un mes cerrado las
 *  contara, la historia ya validada cambiaría de número sola.
 *
 *  MES ABIERTO → todas. Se puede porque la clave única de clientes_precios es
 *  (cliente_id, mes, tipo_servicio, contrato_id) y 'tipo' NO forma parte de ella:
 *  por cada clave hay UNA sola fila, que ya es real o ya es proyectada. La base ya
 *  tiene resuelta la mezcla; el filtro viejo tiraba información que ya existía.
 *  Verificado sobre los datos el 11-ago: cero claves con una fila real y una
 *  proyectada, así que no hay forma de contar dos veces al mismo cliente.
 *
 *  El tipo nulo NO entra, ni en mes abierto. Antes tampoco entraba (nunca era
 *  igual al tipo esperado); dejarlo entrar ahora sería un cambio silencioso de
 *  comportamiento que nadie pidió. */
export function filaCuenta(fila, mes, mesesCerradosSet) {
  if (mesesCerradosSet.has(mes)) return fila.tipo === "real";
  return fila.tipo === "real" || fila.tipo === "proyectado";
}

/** Estado de un mes, en TRES valores. El booleano viejo (isProj) no alcanzaba:
 *  un mes abierto con parte facturada no es ni real ni proyectado.
 *    'real'       → mes cerrado.
 *    'proyectado' → mes abierto sin ninguna fila real: todo estimado.
 *    'mixto'      → mes abierto con filas reales Y proyectadas.
 *  Devuelve además los conteos, para que la pantalla pueda decir cuánto de cada
 *  cosa hay en vez de solo el rótulo. */
export function estadoDelMes(mes, precios, mesesCerradosSet) {
  if (mesesCerradosSet.has(mes)) return { estado: "real", nReal: 0, nProy: 0 };
  let nReal = 0, nProy = 0;
  for (const p of precios) {
    if (p.mes !== mes) continue;
    if (p.tipo === "real") nReal++;
    else if (p.tipo === "proyectado") nProy++;
  }
  return { estado: nReal > 0 ? (nProy > 0 ? "mixto" : "real") : "proyectado", nReal, nProy };
}

/** Clientes cuya facturación REAL del mes quedó muy por debajo de su propia base.
 *
 *  POR QUÉ EXISTE: con la mezcla por fila, un cliente que facturó 2 de sus 5
 *  objetivos entra con su real —que está CORTO— como si fuera el mes completo, y
 *  nada lo delata. El total queda por debajo del real y el error es silencioso.
 *  Mientras no exista el vínculo objetivo↔factura, no hay forma de saber cuántos
 *  objetivos le faltan; lo que sí se puede es comparar contra su propio pasado.
 *
 *  BASE = el último mes ANTERIOR en que ese cliente tuvo filas reales con horas.
 *  Se compara por HORAS y no por importe: el importe se mueve con los aumentos de
 *  precio y ensuciaría la comparación. Las filas de precio fijo no tienen horas,
 *  así que ahí se compara el importe.
 *
 *  LIMITACIÓN, y hay que tenerla presente: si el mes base también estaba parcial,
 *  el cliente parece completo. Es el mismo criterio con el que se midieron los 26
 *  de julio contra junio. */
export function clientesParciales(precios, mes, mesesCerradosSet, umbral = 0.8) {
  if (mesesCerradosSet.has(mes)) return [];   // en un mes cerrado no hay nada que mezclar

  // Magnitud real por cliente y mes: horas si las hay, importe si es precio fijo.
  const porCliMes = new Map();   // cliente_id -> Map<mes, {horas, importe}>
  for (const p of precios) {
    if (p.tipo !== "real" || !p.cliente_id) continue;
    if (!porCliMes.has(p.cliente_id)) porCliMes.set(p.cliente_id, new Map());
    const m = porCliMes.get(p.cliente_id);
    const acc = m.get(p.mes) || { horas: 0, importe: 0 };
    acc.horas += Number(p.horas_vendidas) || 0;
    acc.importe += calcFilaFacturacion(p).fact;
    m.set(p.mes, acc);
  }

  const out = [];
  for (const [cliente_id, m] of porCliMes) {
    const actual = m.get(mes);
    if (!actual) continue;   // sin fila real en el mes: va por proyección, no aplica
    let base = null, baseMes = null;
    for (const [mm, v] of m) {
      if (mm >= mes) continue;
      if (!baseMes || mm > baseMes) { baseMes = mm; base = v; }
    }
    if (!base) continue;   // sin pasado real no hay con qué comparar
    const usaHoras = actual.horas > 0 || base.horas > 0;
    const vAct = usaHoras ? actual.horas : actual.importe;
    const vBase = usaHoras ? base.horas : base.importe;
    if (!(vBase > 0)) continue;
    const pct = vAct / vBase;
    if (pct < umbral) out.push({ cliente_id, mes, baseMes, actual: vAct, base: vBase, pct, magnitud: usaHoras ? "horas" : "importe" });
  }
  return out.sort((a, b) => a.pct - b.pct);
}

/** Días del mes para una clave 'YYYY-MM-01' (o cualquier ISO date). */
function daysInMonthIso(mesIso) {
  const [y, m] = String(mesIso).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calcula facturación total por mes (sin split por tipo_servicio).
 *  Retorna { out, estado, debug }:
 *    - out: Map<mes, total>
 *    - estado: Map<mes, 'real'|'proyectado'|'mixto'> — ver estadoDelMes()
 *    - debug: Map<mes, { nReal, nProj, nUsadas, nFF, total, totalFF }> — console.log
 *
 *  Forward-fill virtual por cliente: si un cliente no tiene NINGUNA fila utilizable
 *  para un mes abierto de monthKeys, se usan TODAS las filas del último mes anterior
 *  con datos del mismo cliente; las horas se proratean por días del mes
 *  (mes_destino/mes_origen). No se forward-fillea en meses cerrados (deben tener
 *  datos reales o nada). Virtual: NO escribe en clientes_precios, solo al vuelo.
 *
 *  `totalFF` aísla cuánto del total del mes vino del forward-fill. Existe para poder
 *  comparar contra Horas, que NO forward-fillea: la diferencia legítima entre las dos
 *  pantallas en un mes abierto es exactamente ese número, y sin medirlo cualquier
 *  resto se confundiría con un error. */
export function computeFacturacionDesdeHoras(precios, monthKeys, mesesCerrados) {
  const keysSet = new Set(monthKeys);
  const cerrados = mesesCerrados instanceof Set ? mesesCerrados : new Set(mesesCerrados || []);

  const out = new Map(monthKeys.map((k) => [k, 0]));
  const estado = new Map(monthKeys.map((k) => [k, estadoDelMes(k, precios, cerrados).estado]));
  const debug = new Map(monthKeys.map((k) => [k, { nReal: 0, nProj: 0, nUsadas: 0, nFF: 0, total: 0, totalFF: 0 }]));

  // Agrupar por cliente_id → mes → TODAS las filas de ese mes.
  //
  // ACÁ VIVÍA EL COLAPSO DE FILAS (arreglado 12-ago). El Map guardaba `mes → una
  // fila`, así que la última leída PISABA a la anterior y el cliente aportaba una
  // sola. La clave no incluye el tipo de servicio NI el contrato, con lo cual se
  // perdía cualquier segunda fila del mismo cliente y mes: vigilancia contra
  // custodia (EDESUR, DORINKA) y también dos contratos del MISMO tipo de servicio
  // (la Embajada, con dos filas de $5,2M de monto fijo; DIA ARGENTINA, con cinco).
  // Por eso el arreglo no es agregar el tipo de servicio a la clave —eso cubriría
  // solo el primer caso— sino dejar de descartar filas.
  // Cuál sobrevivía dependía del orden en que la API devolvía las filas: NO ERA
  // DETERMINISTA. DORINKA aportaba $306M o $4M según qué UUID viniera último.
  const byCli = new Map();
  for (const p of precios) {
    if (!p.cliente_id) continue;
    if (!byCli.has(p.cliente_id)) byCli.set(p.cliente_id, new Map());
    const mesMap = byCli.get(p.cliente_id);
    const delMes = mesMap.get(p.mes);
    if (delMes) delMes.push(p);
    else mesMap.set(p.mes, [p]);
    // Stats agregadas por mes (para debug).
    if (keysSet.has(p.mes)) {
      const d = debug.get(p.mes);
      if (p.tipo === "real") d.nReal++;
      else if (p.tipo === "proyectado") d.nProj++;
    }
  }

  // Para cada cliente, recorrer monthKeys con forward-fill virtual.
  for (const [, mesMap] of byCli) {
    const sortedMeses = [...mesMap.keys()].sort();
    for (const k of monthKeys) {
      // Filas propias del mes que cuentan → se usan TODAS, y NO se rellena. En un
      // mes abierto eso incluye la fila real: el cliente que ya facturó entra con lo
      // suyo. Que sean varias es lo normal, no la excepción: un cliente con
      // vigilancia y custodia, o con dos contratos, aporta una fila por cada uno.
      const directas = (mesMap.get(k) || []).filter((p) => filaCuenta(p, k, cerrados));
      if (directas.length) {
        const d = debug.get(k);
        for (const p of directas) {
          const { fact } = calcFilaFacturacion(p);
          d.nUsadas++;
          if (fact !== 0) {
            out.set(k, out.get(k) + fact);
            d.total += fact;
          }
        }
        continue;
      }
      // Forward-fill: solo en meses abiertos y solo si NINGUNA fila del mes es
      // utilizable. Arrastra todas las filas del último mes con datos, no una:
      // si el cliente tenía dos servicios, sigue teniendo dos.
      if (cerrados.has(k)) continue;
      let lastMes = null;
      for (const m of sortedMeses) {
        if (m < k) lastMes = m;
        else break;
      }
      if (!lastMes) continue;
      const diasOrig = daysInMonthIso(lastMes);
      const diasK = daysInMonthIso(k);
      const d = debug.get(k);
      for (const lastP of mesMap.get(lastMes)) {
        const horasOrig = Number(lastP.horas_vendidas) || 0;
        const horasFF = diasOrig > 0 ? horasOrig * (diasK / diasOrig) : 0;
        const virtual = { ...lastP, mes: k, horas_vendidas: horasFF, tipo: "proyectado" };
        const { fact } = calcFilaFacturacion(virtual);
        if (fact !== 0) {
          out.set(k, out.get(k) + fact);
          d.nUsadas++; d.nFF++; d.total += fact; d.totalFF += fact;
        }
      }
    }
  }
  return { out, estado, debug };
}

/** Calcula facturación + horas separadas por tipo_servicio, misma regla de
 *  mes_cerrado. tipo_servicio distinto de 'custodia' se clasifica como
 *  'vigilancia' (incluye NULL).
 *  Retorna: { vig: {horas, fact}, cus: {horas, fact}, debug } — horas/fact
 *  son arrays alineados con monthKeys. */
export function computeFacturacionPorTipoServicio(precios, monthKeys, mesesCerrados) {
  const cerrados = mesesCerrados instanceof Set ? mesesCerrados : new Set(mesesCerrados || []);
  const mesToIdx = new Map(monthKeys.map((m, i) => [m, i]));

  const zeros = () => monthKeys.map(() => 0);
  const vig = { horas: zeros(), fact: zeros() };
  const cus = { horas: zeros(), fact: zeros() };
  const debug = new Map(monthKeys.map((k) => [k, { nReal: 0, nProj: 0, nUsadas: 0, totalVig: 0, totalCus: 0 }]));

  for (const p of precios) {
    const idx = mesToIdx.get(p.mes);
    if (idx == null) continue;
    const d = debug.get(p.mes);
    if (p.tipo === "real") d.nReal++;
    else if (p.tipo === "proyectado") d.nProj++;

    if (!filaCuenta(p, p.mes, cerrados)) continue;   // misma regla que el Económico

    const { fact, horas } = calcFilaFacturacion(p);
    const esCustodia = p.tipo_servicio === "custodia";
    if (esCustodia) {
      cus.horas[idx] += horas;
      cus.fact[idx]  += fact;
      d.totalCus += fact;
    } else {
      vig.horas[idx] += horas;
      vig.fact[idx]  += fact;
      d.totalVig += fact;
    }
    d.nUsadas++;
  }
  return { vig, cus, debug };
}

// =====================================================================
// Horizonte de proyección global
// =====================================================================

export const HORIZONTE_DEFAULT = 12;

/** Genera array de mes-keys "YYYY-MM-01" desde `mesInicio` por `cantMeses`. */
export function generateMonthKeys(mesInicio, cantMeses) {
  const m = String(mesInicio).match(/^(\d{4})-(\d{2})/);
  if (!m) return [];
  const y0 = Number(m[1]);
  const m0 = Number(m[2]); // 1..12
  const out = [];
  for (let i = 0; i < cantMeses; i++) {
    const d = new Date(Date.UTC(y0, m0 - 1 + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
  }
  return out;
}

/** Extrae el valor de 'horizonte_meses' de indices_economicos (cualquier mes,
 *  el más reciente). indices es la misma colección que carga economico.js. */
export function leerHorizonteDesdeIndices(indices) {
  if (!Array.isArray(indices) || !indices.length) return HORIZONTE_DEFAULT;
  const rows = indices
    .filter((ix) => ix.tipo === "horizonte_meses" && Number.isFinite(Number(ix.valor)))
    .sort((a, b) => String(b.mes).localeCompare(String(a.mes)));
  if (!rows.length) return HORIZONTE_DEFAULT;
  const v = Math.round(Number(rows[0].valor));
  return v >= 1 && v <= 60 ? v : HORIZONTE_DEFAULT;
}

// =====================================================================
// Cobros: 3 buckets por fecha (real / vencido / no vencido)
// =====================================================================

/** Helper: console.log de diagnóstico para un mes específico. */
export function logDebugMes(label, debugMap, mesKey) {
  const d = debugMap.get(mesKey);
  if (!d) { console.log(`[${label}] ${mesKey}: sin datos`); return; }
  // eslint-disable-next-line no-console
  console.log(
    `[${label}] ${mesKey} → nReal=${d.nReal} nProj=${d.nProj} nUsadas=${d.nUsadas} ` +
    Object.entries(d).filter(([k]) => k.startsWith("total")).map(([k, v]) => `${k}=${Math.round(v)}`).join(" "),
  );
}
