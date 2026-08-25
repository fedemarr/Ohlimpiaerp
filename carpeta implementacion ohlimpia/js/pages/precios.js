// Pantalla Precios — matriz objetivo × meses. CAPA 1: solo precios REALES cargados
// en objetivo_precios (SIN forward-fill; los meses sin dato quedan vacíos).
// Solo lectura.

const v = new URL(import.meta.url).searchParams.get("v") ?? "";
const q = v ? `?v=${v}` : "";
const { supabase } = await import(`../supabase-client.js${q}`);
// Horizonte y generación de meses: MISMA fuente que Económico/Financiero/Config.
const { leerHorizonteDesdeIndices, generateMonthKeys } = await import(`../shared/facturacion-calc.js${q}`);
const { confirmar } = await import(`../shared/confirmar.js${q}`);
const { wireAltoTabla } = await import(`../shared/alto-tabla.js${q}`);
// Abrir un archivo privado de finflow-docs (documentos de paritaria y notas). Compartida
// con el CRM, que abre las mismas notas desde el caso.
const { abrirDocStorage } = await import(`../shared/ver-doc.js${q}`);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Acorta SOLO VISUALMENTE el prefijo "Consorcio de Propietarios" (y variantes) a "Cons. Prop.".
// El dato real no se toca; se usa solo para mostrar en la columna Cliente/Objetivo.
const RE_CONS = /^cons(?:orcio)?\.?\s+(?:de\s+)?(?:co)?prop(?:ietarios|itarios)?\.?\s+/i;
const acortarNombre = (n) => String(n ?? "").replace(RE_CONS, "Cons. Prop. ");

// La confirmación in-modal se mudó a js/shared/confirmar.js (la usa también el
// CRM). Misma firma que la de acá: los 16 llamados no cambian.

// Traduce errores técnicos (Postgres/Supabase/red) a mensajes claros de negocio.
// Uso: catch (e) { meMsg(humanizarError(e)); }  — con opción de contexto.
function humanizarError(err, ctx = "") {
  const code = String((err && err.code) || "");
  // `details` entra al texto crudo: PostgREST manda ahí la mitad de la
  // información útil, y sin eso el mensaje queda a mitad de camino.
  const raw = [ (err && (err.message || err.hint)) || err || "", err && err.details ]
    .filter(Boolean).map(String).join(" · ");
  const m = raw.toLowerCase();
  // QUÉ COLUMNA LO CAUSÓ. Es la diferencia entre un cartel accionable y uno que
  // manda a buscar a ciegas: "Falta completar un dato obligatorio" hizo perder
  // varios minutos revisando campos de la pantalla cuando lo que faltaba era
  // precio_hora, una columna que la pantalla ni muestra en ese caso (15-ago).
  const col = (/column "([^"]+)"/i.exec(raw) || [])[1] || "";
  // Cola técnica, acotada. No es ruido: es lo que se copia y se pega para poder
  // reportar el problema sin tener que reproducirlo.
  const tec = raw ? ` (Detalle: ${raw.slice(0, 200)})` : "";
  if (code === "23505" || m.includes("duplicate key") || m.includes("unique constraint")) {
    if (ctx === "escala" || m.includes("escalas_aumento_detalle") || m.includes("(mes)") || m.includes("_mes_"))
      return "No podés cargar dos aumentos para el mismo mes. Revisá los meses de la escala (hay uno repetido).";
    return "Ya existe un registro con esos datos (dato duplicado).";
  }
  if (code === "23503" || m.includes("foreign key")) return "No se puede completar la acción porque el dato está relacionado con otros registros.";
  if (code === "23502" || m.includes("null value") || m.includes("not-null")) {
    return (col
      ? `La base exige un valor en «${col}» y la fila se mandó sin ese dato. No es un campo de esta pantalla: es una columna de la tabla.`
      : "Falta completar un dato obligatorio.") + tec;
  }
  if (code === "23514" || m.includes("check constraint")) {
    return (col ? `El valor de «${col}» no está entre los permitidos.` : "Algún valor no es válido. Revisá los datos cargados.") + tec;
  }
  if (code === "42P01" || (m.includes("relation") && m.includes("does not exist"))) return "Falta una tabla en la base. Avisá a Sistemas (puede faltar correr una migración).";
  if (code === "42883" || m.includes("function") && m.includes("does not exist")) return "Falta una función en la base. Avisá a Sistemas (puede faltar correr una migración).";
  if (code === "42501" || m.includes("permission denied")) return "No tenés permisos para esta acción.";
  if (m.includes("where clause")) return "La operación fue bloqueada por una protección de seguridad. Avisá a Sistemas.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network error") || m.includes("load failed")) return "No hay conexión con la base. Revisá internet y reintentá.";
  // Último recurso: mensaje genérico + detalle técnico acotado (para poder reportarlo).
  return "Ocurrió un error inesperado." + tec;
}
const fmtPct = (p) => (p == null ? "" : `${+(Number(p) * 100).toFixed(2)}%`);
// moneda argentina: $13.099,08 (miles con punto, decimales con coma). "" si no hay valor.
const fmtMoney = (n) => (n == null || n === "" || isNaN(n)) ? "" : "$" + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));

// Trae una tabla entera paginando de a 1000 (el tope que impone PostgREST).
//
// `filtro` opcional: (q) => q.eq("col", valor). Va acá y no en el llamador para no
// perder la paginación: sin range, PostgREST corta en 1000 filas SIN avisar.
//
// Con `orden` —una columna ÚNICA— la paginación va EN PARALELO: el primer pedido
// devuelve la primera página Y el total de filas, y con ese total se lanzan las que
// faltan, de a CONCURRENCIA por vez. objetivo_precios son 20.064 filas = 21 páginas,
// y encadenadas eran 5,7 segundos de esperas (medido el 31-jul-2026, 272 ms cada una).
//
// EL ORDEN NO ES UN DETALLE DE VELOCIDAD, es de correctitud: sin `order by`, Postgres
// no garantiza que dos pedidos de rangos distintos recorran las filas en el mismo
// orden, así que la paginación puede saltear o repetir. La versión secuencial de antes
// ya tenía ese agujero; en paralelo se nota más seguido.
//
// SIN `orden` se conserva el camino secuencial de siempre. Las demás tablas de la
// pantalla entran en una sola página, así que no ganarían nada y no vale la pena
// cambiarles el comportamiento.
const PAGINA = 1000;
// Tope de pedidos simultáneos. Una ráfaga de 21 de golpe puede volver como error de
// rate limit, y varias cargas de esta pantalla se tragan los errores en silencio.
const CONCURRENCIA = 5;

async function fetchAllRows(table, columns, filtro, orden) {
  const pedir = (desde, conConteo) => {
    let q = conConteo
      ? supabase.from(table).select(columns, { count: "exact" })
      : supabase.from(table).select(columns);
    if (filtro) q = filtro(q);
    if (orden) q = q.order(orden);
    return q.range(desde, desde + PAGINA - 1);
  };

  if (!orden) {
    const out = []; let from = 0;
    for (;;) {
      const { data, error } = await pedir(from, false);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...data); if (data.length < PAGINA) break; from += data.length;
    }
    return out;
  }

  const { data, error, count } = await pedir(0, true);
  if (error) throw new Error(`${table}: ${error.message}`);
  const out = [...data];
  if (count == null || count <= PAGINA) return out;

  // Los offsets que faltan. Se guardan en su posición para que el resultado quede
  // en el mismo orden que tendría la versión secuencial.
  const offsets = [];
  for (let d = PAGINA; d < count; d += PAGINA) offsets.push(d);
  const paginas = new Array(offsets.length);
  let proximo = 0;
  const obrero = async () => {
    for (;;) {
      const i = proximo++;
      if (i >= offsets.length) return;
      const { data: d, error: e } = await pedir(offsets[i], false);
      if (e) throw new Error(`${table}: ${e.message}`);
      paginas[i] = d;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, offsets.length) }, obrero));
  for (const p of paginas) out.push(...p);
  return out;
}

// Rango de meses: FIJO desde 2024-01 hasta (mes actual + horizonte).
function calcularMeses(horizonte) {
  const hoy = new Date();
  const finIdx = hoy.getUTCFullYear() * 12 + hoy.getUTCMonth() + horizonte; // absoluto: (mes actual) + horizonte
  const iniIdx = 2024 * 12 + 0;                                             // 2024-01
  const cant = finIdx - iniIdx + 1;
  return generateMonthKeys("2024-01-01", cant);   // ["YYYY-MM-01", ...]
}

let DATA = null;

// ---- Forward-fill por objetivo (misma lógica que el motor: arrastra el ÚLTIMO
//      precio_hora conocido hacia adelante; antes del primero → vacío) ----
// Devuelve array alineado a MESES: null | { precio, estado: 'real'|'proj' }.
//   'real' = mes con precio cargado en objetivo_precios.
//   'proj' = mes sin dato, se copia el último conocido (proyección plana).
function efectivoDeObjetivo(sucId, MESES, precioBy, campo = "precio_hora", ceroEsNulo = false) {
  const pmap = precioBy.get(sucId);
  const arr = [];
  let last = null;   // último precio conocido (número)
  for (const mes of MESES) {
    const row = pmap ? pmap.get(mes) : null;
    const raw = row ? row[campo] : null;
    // Para el precio B, 0 (o null) = "sin B" ese mes.
    const val = (raw == null || (ceroEsNulo && Number(raw) === 0)) ? null : Number(raw);
    if (val != null) {
      last = val;
      arr.push({ precio: last, estado: "real" });
    } else if (last != null) {
      arr.push({ precio: last, estado: "proj" });   // forward-fill
    } else {
      arr.push(null);                                // antes del primer precio
    }
  }
  return arr;
}

// Precio "común" del cliente en el mes i: null (nadie) | {dif:true} (difieren) | {precio,estado}.
function comunEnMes(objArrays, i) {
  const cells = objArrays.map((a) => a[i]).filter(Boolean);
  if (!cells.length) return null;
  const p0 = cells[0].precio;
  if (!cells.every((c) => c.precio === p0)) return { dif: true };
  const estado = cells.every((c) => c.estado === "real") ? "real" : "proj";
  return { precio: p0, estado };
}

// % de aumento mes a mes: "+8%" / "+6,14%" / "-5%"; "" si no hay variación o falta un extremo.
function fmtAum(cur, prev) {
  if (cur == null || prev == null || prev === 0) return "";
  const r = Math.round((cur / prev - 1) * 10000) / 100;   // 2 decimales
  if (r === 0) return "";
  return (r > 0 ? "+" : "") + r.toFixed(2).replace(".", ",") + "%";   // siempre 2 decimales: "+3,00%"
}

// Guion para la GRILLA cuando el mes tiene precio pero el anterior no: vacío se lee como
// dato faltante, y "0%" sería mentira (no aumentó cero: no hay con qué comparar).
// NO va adentro de fmtAum a propósito: fmtAum alimenta la tabla de aumentos de la NOTA que
// se le manda al cliente, y ahí un guion se imprimiría en el PDF.
// El PRIMER mes de la grilla queda vacío: ahí la falta de mes anterior es un límite de la
// ventana que se muestra, no un dato del objetivo.
const GUION_SIN_COMPARACION = "–";
function fmtAumGrid(cur, prev, esPrimerMes) {
  if (cur == null) return "";
  if (esPrimerMes) return "";
  if (prev == null || prev === 0) return GUION_SIN_COMPARACION;
  return fmtAum(cur, prev);
}

// 3 sub-celdas de un mes: % Aum | Precio | % Desc.
//   cell:    null | {dif:true} | {precio, estado}
//   aumTxt:  % de aumento ya formateado (o "")
//   descTxt: % de descuento del cliente (o "") — solo se llena en la fila del cliente
// edit: null | {sid, mes, pct} (fila objetivo A) | {sidb, mes, pct} (fila objetivo B)
//       | {cli, mes} (fila cliente) → hace la celda editable.
//   En la fila objetivo, edit.pct dice si ADEMÁS es editable la celda de % (solo donde ya
//   hay precio: sin mes anterior con valor no hay de dónde derivar el precio desde un %).
//   LA FILA B USA data-sidb, NUNCA data-sid: recomputarObjetivo junta las celdas del
//   objetivo con querySelectorAll(td.sub-pre[data-sid=…]) y ALINEA POR ÍNDICE la lista de
//   precios con la de porcentajes. Si las celdas del B entraran en esa búsqueda, las dos
//   listas quedarían corridas y la propagación del A escribiría en meses equivocados, sin
//   ningún error a la vista.
// `clsMes` = clases del mes al que pertenece la celda: la banda alternada y, si el mes
// cae fuera de la ventana visible, " mes-off" (ver ventanaMeses).
function celdaMes(cell, aumTxt, descTxt, clsMes, edit, aumColor, aumTitle) {
  const a = clsMes || "";
  const proj = cell && cell.estado === "proj" ? " proj" : "";
  const isObj = !!(edit && edit.sid);
  const isObjB = !!(edit && edit.sidb);
  const isCli = !!(edit && edit.cli);
  const cliAttrs = isCli ? ` data-cli="${esc(edit.cli)}" data-mes="${edit.mes}"` : "";

  // % AUM — color de la paritaria del aumento (inline; verde del CSS como fallback). El fondo .modificado va encima.
  // Los data-* de la fila objetivo van SIEMPRE, incluso donde el % no se edita:
  // recomputarObjetivo alinea por índice las celdas de % con las de precio buscándolas
  // por data-sid, y si faltaran en los meses sin precio las dos listas quedarían corridas.
  let aumCls = `sub sub-aum${proj}${a}`, aumAttrs = "";
  if (isObj) {
    if (edit.pct) aumCls += " editable-pct";
    aumAttrs = ` data-sid="${esc(edit.sid)}" data-mes="${esc(edit.mes)}" data-aumorig="${esc(aumTxt || "")}"`;
  }
  else if (isObjB) {   // misma regla que el A, con data-sidb (ver el comentario de arriba)
    if (edit.pct) aumCls += " editable-pct-b";
    aumAttrs = ` data-sidb="${esc(edit.sidb)}" data-mes="${esc(edit.mes)}" data-aumorig="${esc(aumTxt || "")}"`;
  }
  else if (isCli) { aumCls += " editable-cli-pct"; aumAttrs = `${cliAttrs} data-aumorig="${esc(aumTxt || "")}"`; }
  const aumStyle = (aumTxt && aumColor) ? ` style="color:${aumColor}"` : "";
  const aumTitleAttr = (aumTxt && aumTitle) ? ` title="${esc(aumTitle)}"` : "";
  const aum = `<td class="${aumCls}"${aumAttrs}${aumStyle}${aumTitleAttr}>${aumTxt ? esc(aumTxt) : ""}</td>`;

  // Precio
  let pre;
  if (!cell) {
    // Mes sin precio. En la fila objetivo TAMBIÉN es editable: es la única forma de
    // cargar el primer precio de un objetivo recién dado de alta, que no tiene ninguna
    // fila en objetivo_precios y por lo tanto ningún mes con dato.
    if (isObj) pre = `<td class="sub sub-pre${a} editable" data-sid="${esc(edit.sid)}" data-mes="${esc(edit.mes)}" data-orig=""></td>`;
    // Fila B: el mes SIN precio B NO es editable, al revés que en el A. Habilitarlo sería
    // CREAR un B donde no había, y un valor escrito ahí es peor que la falta (abm_51). Los
    // data-* van igual: recomputarObjetivoB también alinea sus celdas por índice.
    else if (isObjB) pre = `<td class="sub sub-pre${a}" data-sidb="${esc(edit.sidb)}" data-mes="${esc(edit.mes)}" data-orig=""></td>`;
    else if (isCli) pre = `<td class="sub sub-pre${a} editable-cli-precio"${cliAttrs} data-orig=""></td>`;
    else pre = `<td class="sub sub-pre${a}"></td>`;
  } else if (cell.dif) {
    pre = isCli
      ? `<td class="sub sub-pre marca-dif${a} editable-cli-precio"${cliAttrs} data-orig="" title="Precios diferenciados por objetivo — ver detalle"></td>`
      : `<td class="sub sub-pre marca-dif${a}" title="Precios diferenciados por objetivo — ver detalle"></td>`;
  } else {
    let cls = `sub sub-pre${proj}${a}`, attrs = "";
    if (isObj) { cls += " editable"; attrs = ` data-sid="${esc(edit.sid)}" data-mes="${edit.mes}" data-orig="${cell.precio}"`; }
    else if (isObjB) { cls += " editable-b"; attrs = ` data-sidb="${esc(edit.sidb)}" data-mes="${edit.mes}" data-orig="${cell.precio}"`; }
    else if (isCli) { cls += " editable-cli-precio"; attrs = `${cliAttrs} data-orig="${cell.precio}"`; }
    pre = `<td class="${cls}"${attrs}>${esc(fmtMoney(cell.precio))}</td>`;
  }
  const desc = `<td class="sub sub-desc${a}">${descTxt ? esc(descTxt) : ""}</td>`;
  return aum + pre + desc;
}

// ---- Ventana de meses VISIBLES ----
// MESES sigue entero y NO se toca: la escala elige sus meses de ahí (mesesEscala), las
// notas buscan ahí los meses de aumento de la paritaria, y los % se encadenan mes a mes.
// Esta ventana decide únicamente qué columnas se VEN.
//
// Las columnas de afuera SE DIBUJAN IGUAL y se ocultan por CSS. No es un descuido: si no
// se dibujaran, setRootObjetivo no encontraría la celda (`if (!cell) return`) y una escala
// aplicada a un mes fuera de la ventana no escribiría NADA, sin avisar. El ahorro está en
// el layout de la tabla, que es lo que cuesta con 168 columnas.
let verTodosLosMeses = false;
let nMesesVisibles = 0;   // para la barra de estado; lo calcula render()

function sumarMeses(mesISO, n) {
  const [y, m] = String(mesISO).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// Desde 12 meses antes del mes en curso, hasta el último mes de aumento de CUALQUIER
// paritaria más 3. Se toma el máximo de todas y no el de "la vigente" a propósito: la
// vigente se resuelve por la última nota emitida, así que generar una nota de una
// paritaria vieja correría la ventana de toda la pantalla hacia atrás.
function ventanaMeses() {
  let ultPari = "";
  for (const [, dets] of (DATA.paritariasDet || new Map())) {
    const u = dets.length ? String(dets[dets.length - 1].mes).slice(0, 10) : "";   // cargarEscalas ya los ordenó
    if (u > ultPari) ultPari = u;
  }
  return { desde: sumarMeses(MES_CUR, -12), hasta: sumarMeses(ultPari > MES_CUR ? ultPari : MES_CUR, 3) };
}

function wireVentanaMeses() {
  const btn = document.querySelector("[data-role=ver-meses]");
  if (!btn) return;
  const rotular = () => {
    btn.textContent = verTodosLosMeses ? "Menos meses" : "Todos los meses";
    btn.title = verTodosLosMeses
      ? "Volver a la ventana corta (la pantalla se dibuja más rápido)"
      : "Mostrar la serie completa. Los precios son los mismos: la ventana solo achica lo que se dibuja";
  };
  btn.addEventListener("click", () => {
    // render() rearma la tabla desde los precios GUARDADOS y no repinta los pendientes:
    // el borrador quedaría invisible aunque siga vivo en pendingChanges, y eso se lee
    // como "se me borraron los cambios". Mejor frenar y decirlo.
    if (pendingChanges.size) {
      mostrarMsgEdicion("Guardá o descartá los cambios pendientes antes de cambiar los meses a la vista.");
      return;
    }
    verTodosLosMeses = !verTodosLosMeses;
    rotular();
    render();   // termina en aplicarFiltros(), que reaplica filtros/plegado y la barra de estado
  });
  rotular();
}

// ---- Edición en memoria (Capa 1): NO toca la base ----
// key "sid|mes" = precio A · key "sid|mes|B" = precio B. Son claves DISTINTAS a propósito:
// con una sola, editar el A y el B del mismo mes se pisarían entre sí.
const pendingChanges = new Map();   // -> {sucursal_id, mes, precio_nuevo, precio_original, raiz, serie}
const keyB = (sid, mes) => `${sid}|${mes}|B`;
// Objetivos que tienen fila B dibujada. Se llena en render(). Evita salir a buscar celdas B
// al DOM para los ~463 objetivos que no tienen precio B, en un camino (las escalas) que
// recorre todos los objetivos visibles.
const sidsConB = new Set();
// Aplicaciones de escala hechas desde el último guardado (se registran al Guardar, se limpian al Descartar).
let aplicacionesPendientes = [];    // [{ escala_id, grupo_id|null, descripcion_filtro|null, clientes_ids:[] }]

// ---- Estado para edición a NIVEL CLIENTE (Capa 4) ----
let objetivosDeCliente = new Map();   // cli -> [sid...]
let clienteDeSid = new Map();         // sid -> cli
let sucById = new Map();              // sid -> fila de sucursales (para el objetivo SIN precios previos)
let MES_CUR = "";                     // mes en curso (ISO día 1)
const clientesDif = new Set();        // clientes diferenciados en el mes en curso (en vivo)

// Parseo tolerante de un precio tipeado (acepta "17597", "17597,50", "$17.597,00", "14664.17").
function parsePrecio(txt) {
  let s = String(txt).trim().replace(/\$/g, "").replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");   // es-AR: . miles, , decimal
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Precio ORIGINAL de una celda: null si el mes no tiene precio, número si lo tiene.
// El data-orig vacío NO es 0: Number("") daría 0 y "sin precio" pasaría a valer cero
// en la fila del cliente, en el modo y en la aplicación de escalas.
function origDe(td) {
  if (!td) return null;
  const raw = td.dataset.orig;
  return (raw == null || raw === "") ? null : Number(raw);
}

function actualizarContador() {
  const n = [...pendingChanges.values()].filter((v) => v.raiz).length;   // solo ediciones RAÍZ (no las propagadas)
  const hay = pendingChanges.size > 0;
  const span = document.querySelector("[data-role=contador-cambios]");
  if (span) span.textContent = n ? `${n} cambio${n > 1 ? "s" : ""} sin guardar` : "";
  const btnD = document.querySelector("[data-role=descartar]");
  if (btnD) btnD.disabled = !hay;
  const btnG = document.querySelector("[data-role=guardar]");
  if (btnG) btnG.disabled = !hay;   // Capa 5: Guardar se habilita si hay pendientes
}

// Refleja en la celda el valor pendiente (amarillo) o el original (sin edición).
function pintarCelda(td, key, orig) {
  if (pendingChanges.has(key)) {
    td.textContent = fmtMoney(pendingChanges.get(key).precio_nuevo);
    td.classList.add("modificado");
  } else {
    td.textContent = fmtMoney(orig);
    td.classList.remove("modificado");
  }
}

const R2 = (v) => Math.round(v * 100) / 100;

function aplicarEdicion(td, key, orig, nuevo) {
  const sid = td.dataset.sid;
  if (nuevo !== orig) {
    // Carga manual: se marca con la paritaria activa del selector (o null); sin escala.
    pendingChanges.set(key, { sucursal_id: sid, mes: td.dataset.mes, precio_nuevo: nuevo, precio_original: orig, raiz: true, serie: "A", paritaria_id: paritariaActivaId(), escala_id: null });
  } else {
    pendingChanges.delete(key);   // volvió al original → deja de ser edición raíz
  }
  limpiarResaltado();
  recomputarObjetivo(sid);        // Capa 2: propaga hacia adelante preservando cada % de aumento
  const cli = clienteDeSid.get(sid);
  recomputarCliente(cli);         // Capa 4: refleja el cambio en la fila del cliente (ámbar/uniforme)
  // Aviso no bloqueante (punto 4): editar un objetivo por debajo de la serie del cliente lo diferencia.
  mostrarMsgEdicion(clientesDif.has(cli) ? "Este objetivo quedó con un precio distinto al del cliente (fila del cliente en ámbar)." : "");
  actualizarContador();
  actualizarStatus();
}

// Parseo tolerante de un % tipeado: "8", "8%", "8,5", "-5" → decimal (0,08 / 0,085 / -0,05).
function parsePct(txt) {
  const s = String(txt).trim().replace(/%/g, "").replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n / 100;
}

// Recalcula, en BORRADOR, todos los meses del objetivo desde su primera edición raíz:
// cada mes posterior re-aplica su % de aumento ORIGINAL sobre la nueva base.
//   precio_nuevo[mes] = precio_nuevo[mes_anterior] × (1 + pct_original[mes])
// Propaga solo hacia adelante; los meses < primera raíz no se tocan.
// Actualiza también la columna % AUM (el % del mes raíz se recalcula; los propagados lo preservan).
function recomputarObjetivo(sid) {
  const preCells = [...document.querySelectorAll(`td.sub-pre[data-sid="${sid}"]`)];   // orden por mes
  const pctCells = [...document.querySelectorAll(`td.sub-aum[data-sid="${sid}"]`)];   // alineado con preCells
  if (!preCells.length) return;
  const orig = preCells.map(origDe);   // precios originales (base para los %); null = mes sin precio

  const restaurarPct = (td) => { td.classList.remove("modificado"); td.textContent = td.dataset.aumorig || ""; };

  // Limpiar propagados previos (raiz:false) de este objetivo; conservar las raíces.
  for (const [k, v] of [...pendingChanges]) {
    if (v.sucursal_id === sid && !v.raiz) pendingChanges.delete(k);
  }
  // Índices de las raíces (ediciones manuales de Juan) de este objetivo.
  const roots = new Map();
  const rootMeta = new Map();   // k -> { pid, eid } (procedencia de cada raíz)
  preCells.forEach((td, k) => {
    const p = pendingChanges.get(`${sid}|${td.dataset.mes}`);
    if (p && p.raiz) { roots.set(k, p.precio_nuevo); rootMeta.set(k, { pid: p.paritaria_id ?? null, eid: p.escala_id ?? null }); }
  });
  // Procedencia de una celda propagada = la de la raíz inmediatamente anterior (≤ k).
  const rootIdxSorted = [...roots.keys()].sort((a, b) => a - b);
  const metaDe = (k) => { let g = null; for (const ri of rootIdxSorted) { if (ri <= k) g = ri; else break; } return g != null ? rootMeta.get(g) : { pid: null, eid: null }; };

  // Sin raíces → restaurar precios y % a original.
  if (roots.size === 0) {
    preCells.forEach((td, k) => { td.classList.remove("modificado"); td.textContent = fmtMoney(orig[k]); });
    pctCells.forEach(restaurarPct);
    recomputarObjetivoB(sid);   // el B acompaña al A: se recalcula SIEMPRE, incluso al restaurar
    return;
  }

  const r0 = Math.min(...roots.keys());     // propagación desde la primera raíz hacia adelante
  const nuevo = new Array(preCells.length);
  for (let k = 0; k < preCells.length; k++) {
    if (k < r0) { nuevo[k] = orig[k]; continue; }                 // antes de la raíz: sin cambio
    if (roots.has(k)) { nuevo[k] = roots.get(k); continue; }      // mes con precio editado (raíz)
    if (orig[k] == null) { nuevo[k] = nuevo[k - 1]; continue; }   // mes sin precio propio: arrastra el nuevo
    // ANCLA: este mes tiene precio propio y el anterior no, así que no hay % que encadenar.
    // Por el forward-fill, ese caso es exactamente el PRIMER precio real del objetivo: se
    // respeta tal cual y la cadena arranca de nuevo desde acá. Sin esto, escribir en un mes
    // vacío ANTERIOR al primer precio le pisaría los precios reales que vienen después.
    if (orig[k - 1] == null) { nuevo[k] = orig[k]; continue; }
    const pct = orig[k - 1] ? (orig[k] / orig[k - 1] - 1) : 0;    // % de aumento ORIGINAL del mes (preservado)
    nuevo[k] = nuevo[k - 1] * (1 + pct);
  }

  preCells.forEach((td, k) => {
    const key = `${sid}|${td.dataset.mes}`;
    const pctTd = pctCells[k];
    if (k < r0) { td.classList.remove("modificado"); td.textContent = fmtMoney(orig[k]); if (pctTd) restaurarPct(pctTd); return; }

    const val = nuevo[k] == null ? null : R2(nuevo[k]);
    // Un mes que no tenía precio y ahora tiene uno cuenta como cambio: no hay original con
    // qué compararlo, y Math.abs(val - null) daría NaN, que se lee como "no cambió".
    const changed = val != null && (orig[k] == null || Math.abs(val - orig[k]) > 0.005);
    if (changed && !roots.has(k)) {   // celda propagada que efectivamente cambió
      const m = metaDe(k);   // hereda la procedencia de la raíz que la gobierna
      pendingChanges.set(key, { sucursal_id: sid, mes: td.dataset.mes, precio_nuevo: val, precio_original: orig[k], raiz: false, serie: "A", paritaria_id: m.pid, escala_id: m.eid });
    }
    td.classList.toggle("modificado", changed);
    td.textContent = fmtMoney(roots.has(k) ? roots.get(k) : val);

    // % AUM: en el mes raíz se recalcula (nueva base, mismo mes anterior); los demás preservan el original.
    if (!pctTd) return;
    if (roots.has(k)) {
      const pctTxt = fmtAumGrid(nuevo[k], k >= 1 ? nuevo[k - 1] : null, k === 0);
      pctTd.textContent = pctTxt;
      pctTd.classList.toggle("modificado", pctTxt !== "" && pctTxt !== GUION_SIN_COMPARACION);
    } else {
      restaurarPct(pctTd);   // propagado: % preservado = original
    }
  });

  recomputarObjetivoB(sid);   // el B se recalcula DESPUÉS del A: lee sus cambios ya asentados
}

// ---- Precio B en el BORRADOR: mismo criterio que el A ----
// El B se mueve por DOS vías que se combinan sin pisarse:
//   1) ACOMPAÑA AL A. Si el A de un mes cambió en un factor f = A nuevo / A viejo, el B se
//      multiplica por el mismo f. Es la regla del 31-jul: la razón B/A no cambia nunca.
//   2) SE EDITA A MANO. El valor tipeado pasa a ser la BASE, y de ahí hacia adelante cada
//      mes re-aplica su propio % de aumento original, igual que hace el A.
// EDITAR EL B NO LO DESENGANCHA: un aumento posterior del A lo vuelve a mover, pero con la
// proporción POSTERIOR a la edición. Eso se logra tomando el factor del A RELATIVO al de la
// raíz que gobierna el mes (factorA[k] / factorA[raíz]): el factor de la raíz ya está adentro
// del valor tipeado —Juan lo escribió mirando el B YA movido— y volver a aplicarlo lo
// contaría dos veces.
// Sin ninguna edición manual de B, la fórmula se reduce a "B viejo x factor del A", que es
// exactamente lo que se calculaba antes recién al guardar. El comportamiento no cambia; lo
// que cambia es CUÁNDO se ve, que ahora es en el momento de editar.
function recomputarObjetivoB(sid) {
  if (!sidsConB.has(sid)) return;   // objetivo sin fila B: no hay nada que recalcular
  const preCells = [...document.querySelectorAll(`td.sub-pre[data-sidb="${sid}"]`)];   // orden por mes
  const pctCells = [...document.querySelectorAll(`td.sub-aum[data-sidb="${sid}"]`)];   // alineado con preCells
  if (!preCells.length) return;
  const orig = preCells.map(origDe);   // B guardado (con forward-fill); null = antes del primer B

  const restaurarPct = (td) => { td.classList.remove("modificado"); td.textContent = td.dataset.aumorig || ""; };

  // Factor del A, mes a mes. 1 = el A no se movió, o no hay base con qué comparar: sin un A
  // viejo mayor que cero no hay proporción que trasladar.
  const preA = [...document.querySelectorAll(`td.sub-pre[data-sid="${sid}"]`)];
  const factorA = preCells.map((_, k) => {
    const a = preA[k];
    if (!a) return 1;
    const viejo = origDe(a);
    if (viejo == null || viejo <= 0) return 1;
    const p = pendingChanges.get(`${sid}|${a.dataset.mes}`);
    const nuevo = p ? p.precio_nuevo : viejo;
    return nuevo == null ? 1 : nuevo / viejo;
  });

  // Limpiar los propagados previos del B (raiz:false); conservar las raíces.
  for (const [k, v] of [...pendingChanges]) {
    if (v.serie === "B" && v.sucursal_id === sid && !v.raiz) pendingChanges.delete(k);
  }
  const roots = new Map();
  const rootMeta = new Map();   // k -> { pid, eid } (procedencia de cada raíz)
  preCells.forEach((td, k) => {
    const p = pendingChanges.get(keyB(sid, td.dataset.mes));
    if (p && p.raiz) { roots.set(k, p.precio_nuevo); rootMeta.set(k, { pid: p.paritaria_id ?? null, eid: p.escala_id ?? null }); }
  });
  const rootIdxSorted = [...roots.keys()].sort((a, b) => a - b);
  const govDe = (k) => { let g = null; for (const ri of rootIdxSorted) { if (ri <= k) g = ri; else break; } return g; };
  const metaDe = (k) => { const g = govDe(k); return g != null ? rootMeta.get(g) : { pid: null, eid: null }; };

  // BASE = la serie B como quedaría por las ediciones manuales solas, sin mirar el A.
  // Mismo algoritmo que el A: desde la primera raíz, cada mes re-aplica su % original.
  const r0 = rootIdxSorted.length ? rootIdxSorted[0] : Infinity;
  const base = new Array(preCells.length);
  for (let k = 0; k < preCells.length; k++) {
    if (k < r0) { base[k] = orig[k]; continue; }                  // antes de la raíz: el B guardado
    if (roots.has(k)) { base[k] = roots.get(k); continue; }       // mes editado a mano
    if (orig[k] == null) { base[k] = base[k - 1]; continue; }     // mes sin B propio: arrastra
    if (k === 0 || orig[k - 1] == null) { base[k] = orig[k]; continue; }   // ANCLA: primer B real
    const pct = orig[k - 1] ? (orig[k] / orig[k - 1] - 1) : 0;    // % de aumento ORIGINAL del B
    base[k] = base[k - 1] == null ? orig[k] : base[k - 1] * (1 + pct);
  }

  // FINAL = base x factor del A relativo a la raíz que gobierna el mes.
  const nuevo = base.map((b, k) => {
    if (b == null) return null;
    const g = govDe(k);
    return R2(b * (factorA[k] / (g != null ? factorA[g] : 1)));
  });

  preCells.forEach((td, k) => {
    const key = keyB(sid, td.dataset.mes);
    const val = nuevo[k];
    // Un mes que no tenía B y ahora tendría uno NO se registra: crear un B donde no había es
    // justo lo que reparó abm_51. Por construcción no puede pasar (base arrastra null), pero
    // el corte queda explícito porque el costo de equivocarse acá es alto.
    const changed = val != null && orig[k] != null && Math.abs(val - orig[k]) > 0.005;
    if (changed && !roots.has(k)) {   // celda propagada que efectivamente cambió
      const m = metaDe(k);   // hereda la procedencia de la raíz que la gobierna
      pendingChanges.set(key, { sucursal_id: sid, mes: td.dataset.mes, precio_nuevo: val, precio_original: orig[k], raiz: false, serie: "B", paritaria_id: m.pid, escala_id: m.eid });
    }
    td.classList.toggle("modificado", changed);
    td.textContent = fmtMoney(roots.has(k) ? roots.get(k) : val);

    // % AUM: donde el B cambió se recalcula contra el mes anterior YA recalculado; el resto
    // preserva el original. Igual que en el A.
    const pctTd = pctCells[k];
    if (!pctTd) return;
    if (changed) {
      const pctTxt = fmtAumGrid(nuevo[k], k >= 1 ? nuevo[k - 1] : null, k === 0);
      pctTd.textContent = pctTxt;
      pctTd.classList.toggle("modificado", pctTxt !== "" && pctTxt !== GUION_SIN_COMPARACION && pctTxt !== (pctTd.dataset.aumorig || ""));
    } else {
      restaurarPct(pctTd);
    }
  });
}

// Edición manual de una celda de precio B. No toca la fila del cliente: el precio del
// cliente se arma con los precios A, que son los que se facturan.
function aplicarEdicionB(td, key, orig, nuevo) {
  const sid = td.dataset.sidb;
  if (nuevo !== orig) {
    pendingChanges.set(key, { sucursal_id: sid, mes: td.dataset.mes, precio_nuevo: nuevo, precio_original: orig, raiz: true, serie: "B", paritaria_id: paritariaActivaId(), escala_id: null });
  } else {
    pendingChanges.delete(key);   // volvió al original → deja de ser edición raíz
  }
  recomputarObjetivoB(sid);
  actualizarContador();
}

function abrirEditor(td) {
  const key = `${td.dataset.sid}|${td.dataset.mes}`;
  const orig = origDe(td);
  const cur = pendingChanges.has(key) ? pendingChanges.get(key).precio_nuevo : orig;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "edit-input";
  input.value = cur == null ? "" : String(cur);   // mes sin precio → arranca vacío, no en "0"
  td.textContent = "";
  td.appendChild(input);
  input.focus(); input.select();

  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const val = parsePrecio(input.value);
    aplicarEdicion(td, key, orig, val == null ? cur : val);   // valor inválido → mantiene el actual
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }        // dispara commit vía blur
    else if (ev.key === "Escape") { done = true; pintarCelda(td, key, orig); }  // cancela, sin cambios
  });
  input.addEventListener("blur", commit);
}

// Editor del % AUM: Juan escribe un % → genera el precio del mes = precio(mes anterior) × (1 + %),
// y ese precio dispara el mismo recálculo hacia adelante (vía aplicarEdicion sobre la celda de precio).
function abrirEditorPct(pctTd) {
  const sid = pctTd.dataset.sid, mes = pctTd.dataset.mes;
  const preCells = [...document.querySelectorAll(`td.sub-pre[data-sid="${sid}"]`)];
  const kM = preCells.findIndex((c) => c.dataset.mes === mes);
  if (kM <= 0) return;   // sin mes anterior no se puede derivar el precio desde un %
  const prevKey = `${sid}|${preCells[kM - 1].dataset.mes}`;
  const prevPrice = pendingChanges.has(prevKey) ? pendingChanges.get(prevKey).precio_nuevo : origDe(preCells[kM - 1]);
  // Sin precio en el mes anterior no hay base sobre la cual aplicar el %. Antes esto
  // calculaba sobre NaN y dejaba la celda en blanco sin decir nada; ahora se avisa.
  if (prevPrice == null || prevPrice === 0) {
    mostrarMsgEdicion("El mes anterior no tiene precio: no hay sobre qué aplicar el %. Cargá primero el precio en la celda de Precio.");
    return;
  }
  const priceTd = preCells[kM];
  const key = `${sid}|${mes}`;
  const origPrice = origDe(priceTd);

  const input = document.createElement("input");
  input.type = "text"; input.className = "edit-input";
  input.value = pctTd.textContent.trim().replace(/[+%\s]/g, "");   // "8" / "6,14" / "-5" / ""
  pctTd.textContent = ""; pctTd.appendChild(input);
  input.focus(); input.select();

  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const dec = parsePct(input.value);
    if (dec == null) { recomputarObjetivo(sid); actualizarContador(); return; }   // inválido → re-pinta
    aplicarEdicion(priceTd, key, origPrice, R2(prevPrice * (1 + dec)));            // % → precio → recálculo
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
    else if (ev.key === "Escape") { done = true; recomputarObjetivo(sid); }
  });
  input.addEventListener("blur", commit);
}

// Editor de una celda de precio B. Mismo comportamiento que el del A (Enter confirma,
// Escape cancela, valor inválido deja lo que había).
function abrirEditorB(td) {
  const key = keyB(td.dataset.sidb, td.dataset.mes);
  const orig = origDe(td);
  const cur = pendingChanges.has(key) ? pendingChanges.get(key).precio_nuevo : orig;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "edit-input";
  input.value = cur == null ? "" : String(cur);
  td.textContent = "";
  td.appendChild(input);
  input.focus(); input.select();

  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const val = parsePrecio(input.value);
    aplicarEdicionB(td, key, orig, val == null ? cur : val);
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
    else if (ev.key === "Escape") { done = true; pintarCelda(td, key, orig); }
  });
  input.addEventListener("blur", commit);
}

// Editor del % AUM de la fila B: el % escrito se convierte en precio sobre el B del mes
// anterior —el del BORRADOR, que puede venir ya movido por una edición del A—.
function abrirEditorPctB(pctTd) {
  const sid = pctTd.dataset.sidb, mes = pctTd.dataset.mes;
  const preCells = [...document.querySelectorAll(`td.sub-pre[data-sidb="${sid}"]`)];
  const kM = preCells.findIndex((c) => c.dataset.mes === mes);
  if (kM <= 0) return;   // sin mes anterior no se puede derivar el precio desde un %
  const prevKey = keyB(sid, preCells[kM - 1].dataset.mes);
  const prevPrice = pendingChanges.has(prevKey) ? pendingChanges.get(prevKey).precio_nuevo : origDe(preCells[kM - 1]);
  if (prevPrice == null || prevPrice === 0) {
    mostrarMsgEdicion("El mes anterior no tiene precio B: no hay sobre qué aplicar el %.");
    return;
  }
  const priceTd = preCells[kM];
  const key = keyB(sid, mes);
  const origPrice = origDe(priceTd);

  const input = document.createElement("input");
  input.type = "text"; input.className = "edit-input";
  input.value = pctTd.textContent.trim().replace(/[+%\s]/g, "");
  pctTd.textContent = ""; pctTd.appendChild(input);
  input.focus(); input.select();

  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const dec = parsePct(input.value);
    if (dec == null) { recomputarObjetivoB(sid); actualizarContador(); return; }   // inválido → re-pinta
    aplicarEdicionB(priceTd, key, origPrice, R2(prevPrice * (1 + dec)));
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
    else if (ev.key === "Escape") { done = true; recomputarObjetivoB(sid); }
  });
  input.addEventListener("blur", commit);
}

function descartarCambios() {
  const sids = new Set([...pendingChanges.values()].map((v) => v.sucursal_id));
  const clis = new Set([...sids].map((sid) => clienteDeSid.get(sid)));
  pendingChanges.clear();
  aplicacionesPendientes = [];   // los borradores se descartan → no se registran aplicaciones
  limpiarResaltado();
  mostrarMsgEdicion("");
  sids.forEach((sid) => recomputarObjetivo(sid));   // sin raíces → restaura precios y %
  clis.forEach((cli) => recomputarCliente(cli));
  actualizarContador();
  actualizarStatus();
}

// ---- Capa 5: GUARDAR en la base (objetivo_precios) ----
// Metadatos para persistir una celda: si el mes tiene fila, la suya; si es proyectado (INSERT),
// los del mes fuente del forward-fill (respeta tipo_precio hora/fijo mixto de algunos objetivos).
function metaObjetivoParaMes(sid, mes) {
  const pmap = DATA.precioBy.get(sid);
  let row = pmap ? pmap.get(mes) : null;
  if (!row && pmap) {
    let best = null;
    for (const [m, r] of pmap) if (m < mes && (!best || m > best.mes)) best = { mes: m, r };
    row = best ? best.r : null;
  }
  // Sin ninguna fila previa (objetivo recién dado de alta), los datos del objetivo salen de
  // sucursales, no de un default inventado: tipo_servicio forma parte de la clave del upsert
  // (sucursal_id, mes, tipo_servicio), así que asumir 'vigilancia' guardaría el precio de un
  // objetivo de custodia bajo el servicio equivocado. El dominio del check es el mismo en las
  // dos tablas ('vigilancia' | 'custodia' | 'otro'), así que copiarlo es seguro.
  const s = sucById.get(sid);
  return {
    tipo_servicio: row ? row.tipo_servicio : ((s && s.tipo_servicio) || "vigilancia"),
    // tipo_precio: para un objetivo nuevo no hay de dónde sacarlo (sucursales no lo tiene).
    // Queda en 'hora'; si el objetivo se factura como monto fijo hay que corregirlo a mano.
    tipo_precio: row ? row.tipo_precio : "hora",
    codigo_objetivo: row ? row.codigo_objetivo : ((s && s.codigo_objetivo) || null),
    cliente_id: clienteDeSid.get(sid) || null,
  };
}

async function recargarDatos() {
  // "id" = orden estable para paginar en paralelo (es la PK). Ver fetchAllRows.
  const precios = await fetchAllRows("objetivo_precios", "sucursal_id, codigo_objetivo, mes, precio_hora, precio_hora_b, tipo_precio, tipo, tipo_servicio, paritaria_id, escala_id", null, "id");
  const precioBy = new Map();
  for (const p of precios) {
    const mes = String(p.mes).slice(0, 10);
    if (!precioBy.has(p.sucursal_id)) precioBy.set(p.sucursal_id, new Map());
    precioBy.get(p.sucursal_id).set(mes, p);
  }
  DATA.precios = precios;
  DATA.precioBy = precioBy;
  render();              // rebuild con el estado real guardado
  actualizarContador();
}

// ---- De cambios del borrador a FILAS de la base ----
// UNA FILA POR (objetivo, mes), con las dos series adentro. No es una prolijidad: la tabla
// tiene unicidad por (sucursal_id, mes, tipo_servicio), y si en un mismo lote viajan dos
// filas del mismo mes —una por el A y otra por el B— Postgres RECHAZA EL LOTE ENTERO
// ("cannot affect row a second time") y no se guarda nada.
//
// El precio B ya no se deriva acá: lo calculó recomputarObjetivoB y está a la vista en la
// pantalla. Antes se calculaba recién en este punto, y era una segunda fuente de verdad para
// el mismo número.
//
// precio_hora VIAJA SIEMPRE, incluso cuando solo cambió el B: la columna es NOT NULL, así que
// una fila que todavía no existe no se puede insertar sin ella. Se manda el A efectivo, que
// es el mismo que ya se ve en pantalla — no cambia ningún valor, solo materializa el mes.
// precio_hora_b, en cambio, SOLO viaja si el B cambió: lo que no va en el payload, PostgREST
// no lo pone en el SET del upsert, y así los ~463 objetivos sin B no lo pueden recibir.
function filasParaGuardar() {
  const filas = new Map();   // "sid|mes" -> { sucursal_id, mes, a, b }
  for (const c of pendingChanges.values()) {
    const k = `${c.sucursal_id}|${c.mes}`;
    if (!filas.has(k)) filas.set(k, { sucursal_id: c.sucursal_id, mes: c.mes, a: null, b: null });
    filas.get(k)[c.serie === "B" ? "b" : "a"] = c;
  }
  const listas = [], sinA = [];
  for (const f of filas.values()) {
    // Sin cambio de A, el precio_hora sale del efectivo del mes (pendiente o guardado).
    const precioA = f.a ? f.a.precio_nuevo : currentPrecio(f.sucursal_id, f.mes);
    // ---- MANDA EL PRECIO A, O NO? ----
    //
    // Solo si CAMBIÓ, o si hay que CREAR la fila. Antes viajaba siempre, y eso
    // ahora borraría dato: el volcado de LIGE crea filas con horas y precio_hora
    // en null, y `currentPrecio` no devuelve ese null sino el precio ARRASTRADO
    // que se ve en la celda (efectivoDeObjetivo forward-fillea). O sea que editar
    // el B de un mes sin precio escribiría el precio del mes anterior y la marca
    // de "sin precio" desaparecería sin que nadie lo pida.
    //
    // El caso de crear sigue mandándolo, igual que hoy: una fila que no existe no
    // se puede insertar sin su precio mientras la columna sea NOT NULL, y aunque
    // deje de serlo, un alta disparada por una persona tiene que llevar el valor
    // que esa persona está viendo.
    const filaExiste = !!(DATA.precioBy.get(f.sucursal_id)?.get(f.mes));
    const mandaA = !!f.a || !filaExiste;
    // Un mes sin ningún A no se puede escribir (NOT NULL). No debería pasar —donde hay B hay
    // A—, pero si pasa se avisa en vez de mandar la fila y que la base la rechace.
    // Solo aplica cuando el A efectivamente viaja: si la fila ya existe y el A no
    // cambió, que no haya precio es un estado válido y no bloquea guardar el B.
    if (mandaA && precioA == null) { sinA.push(f); continue; }
    listas.push({ ...f, precioA, mandaA, precioB: f.b ? f.b.precio_nuevo : null });
  }
  return { filas: listas, sinA };
}

async function guardarCambios() {
  if (!pendingChanges.size) return;
  // Backfill: si HAY paritaria activa, asignarla a los cambios manuales aún sin marcar
  // (cubre "edité sin selector → elegí paritaria → Guardar de nuevo": los previos se marcan,
  //  no solo los nuevos). Alcanza a la raíz manual y a sus propagados por forward-fill (ambos null/null).
  const pAct = paritariaActivaId();
  if (pAct) for (const c of pendingChanges.values()) { if (c.escala_id == null && c.paritaria_id == null) c.paritaria_id = pAct; }

  const changes = [...pendingChanges.values()];
  const { filas, sinA } = filasParaGuardar();
  const objetivos = new Set(filas.map((f) => f.sucursal_id));
  const clientes = new Set([...objetivos].map((sid) => clienteDeSid.get(sid)));
  // Se cuentan FILAS, no cambios: un mes con el A y el B tocados es UNA fila.
  const nConB = filas.filter((f) => f.precioB != null).length;
  const nBManual = changes.filter((c) => c.serie === "B" && c.raiz).length;
  // Sin ninguna fila armable no hay nada que confirmar, y seguir vaciaría el borrador sin escribir.
  if (!filas.length) {
    alert("No hay ninguna fila que se pueda guardar: los meses tocados no tienen precio A, y la fila no se puede crear sin él.\n\nLos cambios siguen pendientes.");
    return;
  }
  // GUARDA DEL TIPO DE PRECIO — LAS DOS DIRECCIONES.
  //
  // Esta pantalla NO PUEDE cambiar el tipo: al guardar lo COPIA de la fila que ya
  // estaba en ese mes (metaObjetivoParaMes). Cuando un servicio cambia de modalidad,
  // el importe nuevo entra bien y la etiqueta vieja queda. Sin aviso, se guarda en
  // silencio y no queda rastro de que alguien tenía que decidir algo.
  //
  // NO ALCANZA CON LA RED DE SEGURIDAD QUE YA EXISTE: calcFilaFacturacion deduce el
  // tipo con este mismo umbral, pero SOLO cuando viene VACÍO. Con un tipo escrito
  // —aunque sea el equivocado— la deducción no se activa. Un valor equivocado es
  // peor que un valor faltante.
  //
  // 1) HORA con monto grande → casi seguro es un monto fijo.
  //    PASÓ (13-ago): AGUAS DE FORMOSA (11225/6), 25 meses de $35.720.957 marcados
  //    'hora'; DIOXITEK (781/2), 6 meses de $17.156.453. Corregidos por SQL
  //    (supabase/fix_tipo_precio_fijo_mal_etiquetado.sql).
  //
  // 2) FIJO con monto chico → casi seguro es un precio por hora.
  //    ES EL PELIGROSO DE LOS DOS, y por eso el aviso es simétrico: $14.000 en una
  //    fila 'fijo' se factura como $14.000 AL MES, en vez de $14.000 × las horas.
  //    El caso 1 se descubre a ojo —ninguna hora cuesta $35 millones—; este no
  //    tiene nada de absurdo a simple vista: el número queda chico pero creíble, y
  //    lo que se pierde es un factor de doscientos.
  const UMBRAL_MONTO_FIJO = 100000;
  const metaDe = (f) => metaObjetivoParaMes(f.sucursal_id, f.mes);
  const comoHoraCaras = filas.filter((f) =>
    Number(f.precioA) >= UMBRAL_MONTO_FIJO && metaDe(f).tipo_precio !== "fijo");
  const comoFijoBaratas = filas.filter((f) =>
    Number(f.precioA) < UMBRAL_MONTO_FIJO && metaDe(f).tipo_precio === "fijo");
  if (comoHoraCaras.length || comoFijoBaratas.length) {
    // Un renglón por objetivo: la lista importa por QUIÉNES son, no por cuántos
    // meses de cada uno. Se muestra el importe más extremo en la dirección del error.
    const listar = (fs, esPeor) => {
      const porObj = new Map();
      for (const f of fs) {
        const cod = metaDe(f).codigo_objetivo || "(sin código)";
        const prev = porObj.get(cod);
        if (prev == null || esPeor(f.precioA, prev)) porObj.set(cod, f.precioA);
      }
      return [...porObj.entries()]
        .map(([cod, p]) => `<li><b>${esc(cod)}</b> — ${esc(fmtMoney(p))}</li>`).join("");
    };
    let msg = "";
    if (comoHoraCaras.length) {
      msg += `<b>${comoHoraCaras.length}</b> fila(s) quedarían con un precio <b>POR HORA</b> `
        + `de más de ${esc(fmtMoney(UMBRAL_MONTO_FIJO))}:`
        + `<ul>${listar(comoHoraCaras, (a, b) => a > b)}</ul>`
        + `Una hora no cuesta eso: casi seguro es un <b>monto mensual fijo</b>.`;
    }
    if (comoFijoBaratas.length) {
      if (msg) msg += "<br><br>";
      msg += `<b>${comoFijoBaratas.length}</b> fila(s) quedarían con un <b>MONTO FIJO</b> `
        + `de menos de ${esc(fmtMoney(UMBRAL_MONTO_FIJO))}:`
        + `<ul>${listar(comoFijoBaratas, (a, b) => a < b)}</ul>`
        + `Un monto mensual no suele ser tan chico: casi seguro es un <b>precio por hora</b>. `
        + `Guardado así, ese importe se factura <b>una sola vez al mes</b> en vez de `
        + `multiplicarse por las horas del objetivo.`;
    }
    msg += `<br><br>Esta pantalla <b>no puede cambiar el tipo de precio</b>, lo hereda de lo `
      + `que ya estaba cargado. Si el tipo está mal, guardá igual y pedí que se corrija en la base.`
      + `<br><br>Si el tipo es el correcto, seguí tranquilo.`;
    const seguir = await confirmar({
      titulo: "Revisá el tipo de precio",
      mensaje: msg,
      si: "Guardar igual",
      no: "Cancelar",
    });
    if (!seguir) {
      mostrarMsgEdicion("Guardado cancelado. Los cambios siguen pendientes.");
      return;
    }
  }

  const baseMsg = `Vas a guardar <b>${filas.length}</b> fila(s) de precio en <b>${objetivos.size}</b> objetivo(s) de <b>${clientes.size}</b> cliente(s).`
    + (nConB ? `<br><br>De esas, <b>${nConB}</b> llevan precio B`
      + (nBManual ? `, con <b>${nBManual}</b> editado(s) a mano.` : " (acompaña al A con el mismo %).") : "")
    // Si un mes no tiene ningún precio A no hay fila posible (precio_hora es obligatorio).
    // Se dice ANTES de escribir, que es el único momento en que se puede frenar.
    + (sinA.length ? `<br><br>⚠️ <b>${sinA.length}</b> cambio(s) quedan AFUERA: ese mes no tiene ningún precio A y la fila no se puede crear sin él.` : "");
  // Ediciones MANUALES (raíz, sin escala) que quedaron sin paritaria (selector vacío al guardar).
  const manualesSinPari = changes.filter((c) => c.raiz && c.escala_id == null && c.paritaria_id == null).length;
  if (manualesSinPari > 0) {
    const aviso = `<br><br>⚠️ Hay <b>${manualesSinPari}</b> cambio(s) manual(es) sin paritaria asignada (selector «Paritaria activa» vacío).`;
    // Dos opciones explícitas: [Elegir paritaria] (cancela + enfoca selector) · [Guardar igual] (sigue sin marcar).
    const guardarIgual = await confirmar({ titulo: "Guardar cambios", mensaje: baseMsg + aviso, si: "Guardar igual", no: "Elegir paritaria" });
    if (!guardarIgual) {
      const sel = document.querySelector("[data-role=paritaria-activa]");
      if (sel) { sel.scrollIntoView({ block: "nearest", inline: "nearest" }); sel.focus(); }
      mostrarMsgEdicion("Elegí una paritaria en «Paritaria activa» y volvé a dar Guardar (los cambios siguen pendientes).");
      return;
    }
  } else {
    if (!await confirmar({ titulo: "Guardar cambios", mensaje: baseMsg, si: "Sí, guardar", no: "No" })) return;
  }

  // Fila base (sin procedencia). pct_aumento se deja null: el precio es la única verdad; el % se calcula al vuelo.
  const baseRow = (f) => {
    const meta = metaObjetivoParaMes(f.sucursal_id, f.mes);
    return {
      sucursal_id: f.sucursal_id,
      mes: f.mes,
      // precio_hora pasó a ser OPCIONAL: viaja solo si cambió o si hay que crear la
      // fila (ver filasParaGuardar). Se omite con `...( )` y no poniéndolo en null,
      // porque null lo BORRARÍA: lo que no está en el payload es lo único que
      // PostgREST deja fuera del SET del upsert.
      ...(f.mandaA ? { precio_hora: f.precioA } : {}),
      tipo: f.mes < MES_CUR ? "real" : "negociado",   // pasado = corrección real; futuro = negociado
      tipo_servicio: meta.tipo_servicio,
      tipo_precio: meta.tipo_precio,
      codigo_objetivo: meta.codigo_objetivo,
      cliente_id: meta.cliente_id,
      fuente: "manual",
    };
  };
  // Las columnas OPCIONALES se omiten cuando no corresponden: lo que no viaja en el payload,
  // PostgREST no lo incluye en el SET del upsert y la base preserva lo que ya había.
  //  - paritaria_id/escala_id: se omiten en la carga manual sin selector.
  //  - precio_hora_b: se omite donde el B no cambió (y siempre en los objetivos sin B).
  //  - precio_hora: se omite donde el A no cambió y la fila YA existe. Es lo que
  //    protege el null de las filas que crea el volcado de LIGE.
  // Cada COMBINACIÓN de columnas presentes va en su propia llamada. En una sola, PostgREST
  // unifica las claves de todo el lote y rellena con null las que falten en alguna fila: un
  // lote mezclado le borraría el precio B a los 11 objetivos que sí lo tienen.
  // La procedencia sale del cambio de A; si el mes solo tuvo edición de B, del cambio de B.
  const proc = (f) => f.a || f.b;
  const conInfo = (f) => proc(f).paritaria_id != null || proc(f).escala_id != null;
  const lotes = new Map();
  for (const f of filas) {
    const row = baseRow(f);
    if (conInfo(f)) { row.paritaria_id = proc(f).paritaria_id ?? null; row.escala_id = proc(f).escala_id ?? null; }
    if (f.precioB != null) row.precio_hora_b = f.precioB;
    // EL PRECIO A ENTRA EN LA CLAVE DEL LOTE, y no es opcional que lo haga: si en
    // una misma llamada viajaran filas con precio_hora y filas sin él, PostgREST
    // unifica las columnas de todo el lote y rellena con null las que falten. Un
    // lote mezclado le BORRARÍA el precio a las filas que no lo mandaron — el
    // mismo accidente que el comentario de arriba describe para el precio B.
    const clave = `${conInfo(f) ? "info" : "-"}|${f.precioB != null ? "b" : "-"}|${f.mandaA ? "a" : "-"}`;
    if (!lotes.has(clave)) lotes.set(clave, []);
    lotes.get(clave).push(row);
  }

  const btnG = document.querySelector("[data-role=guardar]");
  if (btnG) btnG.disabled = true;
  mostrarMsgEdicion("Guardando…");
  for (const lote of lotes.values()) {
    if (!lote.length) continue;
    const { error } = await supabase.from("objetivo_precios").upsert(lote, { onConflict: "sucursal_id,mes,tipo_servicio" });
    if (error) {
      mostrarMsgEdicion("");
      if (btnG) btnG.disabled = false;
      alert(`No se pudieron guardar los cambios. ${humanizarError(error)}\n\nLos cambios NO se guardaron; siguen pendientes.`);
      return;   // el upsert es idempotente: reintentar Guardar es seguro
    }
  }
  const n = filas.length;
  const nFuera = sinA.length;
  pendingChanges.clear();
  clientesDif.clear();
  limpiarResaltado();
  await recargarDatos();     // refresca la pantalla con lo realmente guardado
  // Registrar las aplicaciones de escala hechas desde el último guardado (para "Generar notas").
  if (aplicacionesPendientes.length) {
    for (const a of aplicacionesPendientes) {
      const { error: eReg } = await supabase.rpc("registrar_aplicacion_escala", {
        p_escala_id: a.escala_id, p_grupo_id: a.grupo_id, p_descripcion_filtro: a.descripcion_filtro, p_clientes_ids: a.clientes_ids,
      });
      if (eReg) console.warn("No se pudo registrar la aplicación de escala:", eReg.message);   // no bloquea el guardado
    }
    aplicacionesPendientes = [];
  }
  mostrarMsgEdicion(`${n} fila(s) de precio guardada(s).` + (nFuera ? ` ${nFuera} quedaron afuera por no tener precio A.` : ""));
}

// ---- Capa 4: helpers y edición a nivel CLIENTE ----
function mostrarMsgEdicion(txt) {
  const el = document.querySelector("[data-role=msg-edicion]");
  if (el) el.textContent = txt || "";
}
function limpiarResaltado() {
  document.querySelectorAll("td.resaltado-dif").forEach((c) => c.classList.remove("resaltado-dif"));
}
function resaltar(sid, mes) {
  const cell = document.querySelector(`td.sub-pre[data-sid="${sid}"][data-mes="${mes}"]`);
  if (cell) cell.classList.add("resaltado-dif");
}
function prevMes(mes) {
  const i = DATA.MESES.indexOf(mes);
  return i > 0 ? DATA.MESES[i - 1] : null;
}
// precio efectivo ACTUAL (borrador) de un objetivo en un mes: pendiente si existe, si no el original.
function currentPrecio(sid, mes) {
  const key = `${sid}|${mes}`;
  if (pendingChanges.has(key)) return pendingChanges.get(key).precio_nuevo;
  const cell = document.querySelector(`td.sub-pre[data-sid="${sid}"][data-mes="${mes}"]`);
  return cell ? origDe(cell) : null;
}
// precio B efectivo ACTUAL (borrador) de un objetivo en un mes: pendiente si existe, si no el
// guardado. null = el objetivo no tiene fila B, o ese mes es anterior a su primer B.
function currentPrecioB(sid, mes) {
  const key = keyB(sid, mes);
  if (pendingChanges.has(key)) return pendingChanges.get(key).precio_nuevo;
  const cell = document.querySelector(`td.sub-pre[data-sidb="${sid}"][data-mes="${mes}"]`);
  return cell ? origDe(cell) : null;
}
// "precio del cliente" en un mes = el que comparte la mayoría de sus objetivos (modo).
function modoPrecio(sids, mes) {
  const cnt = new Map();
  for (const sid of sids) { const v = currentPrecio(sid, mes); if (v == null) continue; cnt.set(v, (cnt.get(v) || 0) + 1); }
  let best = null, bestN = 0;
  for (const [v, n] of cnt) if (n > bestN) { best = v; bestN = n; }
  return best;
}
function setRootObjetivo(sid, mes, val, paritariaId = null, escalaId = null) {
  const key = `${sid}|${mes}`;
  const cell = document.querySelector(`td.sub-pre[data-sid="${sid}"][data-mes="${mes}"]`);
  if (!cell) return;
  const orig = origDe(cell);
  if (val !== orig) pendingChanges.set(key, { sucursal_id: sid, mes, precio_nuevo: val, precio_original: orig, raiz: true, serie: "A", paritaria_id: paritariaId, escala_id: escalaId });
  else pendingChanges.delete(key);
}
function actualizarStatus() {
  const status = document.querySelector("[data-role=status]");
  if (!status || !DATA) return;
  const nMes = DATA.MESES.length;
  // Con la ventana corta se ven menos columnas: hay que DECIRLO. Una pantalla con menos
  // meses y sin explicación se lee como que faltan precios.
  const txtMeses = verTodosLosMeses
    ? `${nMes} meses (${DATA.MESES[0].slice(0, 7)} → ${DATA.MESES[nMes - 1].slice(0, 7)})`
    : `${nMesesVisibles} de ${nMes} meses a la vista`;
  if (filtrosActivos() > 0) {
    const nCli = [...document.querySelectorAll("tr.rel-cliente")].filter((t) => !t.hidden).length;
    const nObj = [...document.querySelectorAll("tr.rel-obj:not(.rel-obj-b)")].filter((t) => !t.hidden).length;   // no contar las filas B
    status.textContent = `Mostrando ${nCli} clientes / ${nObj} objetivos (filtrado) · de ${DATA.suc.length} objetivos totales · ${txtMeses}`;
    return;
  }
  status.textContent = `${objetivosDeCliente.size} clientes (${clientesDif.size} con precios diferenciados) · ${DATA.suc.length} objetivos · ${txtMeses}`;
}

// Recalcula la FILA DEL CLIENTE (precio común / ámbar / %) desde el estado ACTUAL de sus objetivos.
function recomputarCliente(cli) {
  if (!cli) return;
  const sids = objetivosDeCliente.get(cli) || [];
  const preCells = [...document.querySelectorAll(`td.sub-pre[data-cli="${cli}"]`)];   // orden por mes
  const pctCells = [...document.querySelectorAll(`td.sub-aum[data-cli="${cli}"]`)];
  const comun = preCells.map((td) => {
    const mes = td.dataset.mes, vals = [];
    for (const sid of sids) { const v = currentPrecio(sid, mes); if (v != null) vals.push(v); }
    if (!vals.length) return null;
    return vals.every((v) => v === vals[0]) ? { precio: vals[0] } : { dif: true };
  });
  preCells.forEach((td, k) => {
    const c = comun[k];
    const origCommon = origDe(td);
    td.classList.remove("modificado", "marca-dif");
    if (!c) td.textContent = "";
    else if (c.dif) { td.textContent = ""; td.classList.add("marca-dif"); }
    else {
      td.textContent = fmtMoney(c.precio);
      if (origCommon == null || Math.abs(c.precio - origCommon) > 0.005) td.classList.add("modificado");
    }
  });
  const cp = comun.map((c) => (c && c.precio != null ? c.precio : null));
  pctCells.forEach((td, k) => {
    const txt = fmtAumGrid(cp[k], k >= 1 ? cp[k - 1] : null, k === 0);
    td.textContent = txt;
    td.classList.toggle("modificado", txt !== "" && txt !== GUION_SIN_COMPARACION && txt !== (td.dataset.aumorig || ""));
  });
  // diferenciado en el mes en curso → marca ámbar (ya se pinta), auto-expand y contador en vivo.
  const esDif = !!(comun[DATA.MESES.indexOf(MES_CUR)] || {}).dif;
  if (esDif) clientesDif.add(cli); else clientesDif.delete(cli);
  const trCli = document.querySelector(`tr.rel-cliente[data-cliente="${cli}"]`);
  if (esDif && trCli && trCli.dataset.exp !== "1") setExpanded(trCli, true);
}

// Núcleo reusable: aplica un % a TODOS los objetivos del cliente en un mes (sobre el precio
// del mes anterior) y recalcula hacia adelante. SIN efectos de UI (resaltado/msg/contador),
// para poder llamarlo en lote (escalas). El caller hace las actualizaciones al final.
function aplicarPctClienteCore(cli, mes, dec, paritariaId = null, escalaId = null) {
  const sids = objetivosDeCliente.get(cli) || [];
  const pm = prevMes(mes);
  if (!pm) return;
  for (const sid of sids) {
    const prev = currentPrecio(sid, pm);
    if (prev == null) continue;
    setRootObjetivo(sid, mes, R2(prev * (1 + dec)), paritariaId, escalaId);   // procedencia: la escala aplicada
  }
  sids.forEach((sid) => recomputarObjetivo(sid));   // el caller recalcula la fila del cliente al final
}

// Nombre corto de un objetivo para los avisos: "1207/3 · SUCURSAL CENTRO".
function nombreObjetivo(sid) {
  const s = sucById.get(sid);
  if (!s) return sid;
  return `${s.codigo_objetivo || "?"}${s.nombre ? " · " + s.nombre : ""}`;
}

// Aviso de los objetivos que quedaron AFUERA de una edición a nivel cliente por no tener
// ningún precio todavía. Sin esto, un cliente con objetivos mixtos (algunos con precio, uno
// recién dado de alta sin ninguno) parece cargado correctamente mientras el nuevo queda
// afuera y nadie se entera. Se nombran hasta 3: la barra es de una línea.
function avisoSinPrecio(sids) {
  if (!sids.length) return "";
  const nombres = sids.slice(0, 3).map(nombreObjetivo).join(", ");
  const resto = sids.length > 3 ? ` y ${sids.length - 3} más` : "";
  return `No se cargó el precio en ${sids.length} objetivo(s) porque todavía no tienen ningún precio: ${nombres}${resto}. Cargalos en la fila del objetivo.`;
}

// Junta los avisos que hayan salido de una misma edición (pueden darse los dos a la vez).
function juntarAvisos(...partes) { return partes.filter(Boolean).join(" · "); }

// Edición a NIVEL CLIENTE por % : aplica el % a TODOS los objetivos (incluso los diferenciados).
function aplicarClientePct(cli, mes, dec) {
  limpiarResaltado();
  const sids = objetivosDeCliente.get(cli) || [];
  const pm = prevMes(mes);
  if (!pm) { mostrarMsgEdicion(""); return; }
  const ref = modoPrecio(sids, mes);
  const difs = [], sinPrecio = [];
  for (const sid of sids) {
    const prev = currentPrecio(sid, pm), cur = currentPrecio(sid, mes);
    // Dos motivos distintos para saltear, y se informan por separado: sin precio previo no
    // hay base sobre la cual aplicar el %, y eso hay que decirlo.
    if (prev == null || cur == null) { sinPrecio.push(sid); continue; }
    setRootObjetivo(sid, mes, R2(prev * (1 + dec)), paritariaActivaId(), null);   // manual: paritaria activa, sin escala
    if (ref != null && cur !== ref) difs.push(sid);
  }
  sids.forEach((sid) => recomputarObjetivo(sid));
  recomputarCliente(cli);
  difs.forEach((sid) => resaltar(sid, mes));
  mostrarMsgEdicion(juntarAvisos(
    difs.length ? "Hay objetivo(s) con valor diferente que fueron impactados por el mismo %." : "",
    avisoSinPrecio(sinPrecio),
  ));
  actualizarContador(); actualizarStatus();
}

// Edición a NIVEL CLIENTE por PRECIO : solo a los objetivos que comparten el precio del cliente.
function aplicarClientePrecio(cli, mes, newPrice) {
  limpiarResaltado();
  const sids = objetivosDeCliente.get(cli) || [];
  const ref = modoPrecio(sids, mes);
  const difs = [], sinPrecio = [];
  for (const sid of sids) {
    const cur = currentPrecio(sid, mes);
    // Sin ningún precio no se puede decidir si comparte la serie del cliente, así que queda
    // afuera. Es un motivo DISTINTO de "difiere", y va en su propio aviso: mezclarlos (o
    // callarlos, como antes) es lo que hacía que el objetivo nuevo desapareciera sin rastro.
    if (cur == null) { sinPrecio.push(sid); continue; }
    if (ref != null && cur === ref) setRootObjetivo(sid, mes, newPrice, paritariaActivaId(), null);   // manual: paritaria activa, sin escala
    else difs.push(sid);   // difiere del cliente → NO se toca (se respeta su precio propio)
  }
  sids.forEach((sid) => recomputarObjetivo(sid));
  recomputarCliente(cli);
  difs.forEach((sid) => resaltar(sid, mes));
  mostrarMsgEdicion(juntarAvisos(
    difs.length ? "Hay objetivo(s) con valor diferente que no fueron modificados porque difieren de la serie del cliente." : "",
    avisoSinPrecio(sinPrecio),
  ));
  actualizarContador(); actualizarStatus();
}

function abrirEditorClientePct(td) {
  const cli = td.dataset.cli, mes = td.dataset.mes;
  if (!prevMes(mes)) return;
  const input = document.createElement("input");
  input.type = "text"; input.className = "edit-input";
  input.value = td.textContent.trim().replace(/[+%\s]/g, "");
  td.textContent = ""; td.appendChild(input); input.focus(); input.select();
  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const dec = parsePct(input.value);
    if (dec == null) { recomputarCliente(cli); return; }
    aplicarClientePct(cli, mes, dec);
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
    else if (ev.key === "Escape") { done = true; recomputarCliente(cli); }
  });
  input.addEventListener("blur", commit);
}

function abrirEditorClientePrecio(td) {
  const cli = td.dataset.cli, mes = td.dataset.mes;
  const ref = modoPrecio(objetivosDeCliente.get(cli) || [], mes);
  const input = document.createElement("input");
  input.type = "text"; input.className = "edit-input";
  input.value = ref != null ? String(ref) : "";
  td.textContent = ""; td.appendChild(input); input.focus(); input.select();
  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const val = parsePrecio(input.value);
    if (val == null) { recomputarCliente(cli); return; }
    aplicarClientePrecio(cli, mes, val);
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
    else if (ev.key === "Escape") { done = true; recomputarCliente(cli); }
  });
  input.addEventListener("blur", commit);
}

function wireEdicion() {
  const tbody = document.querySelector("[data-role=tabla-precios] tbody");
  tbody.addEventListener("click", (e) => {
    const pre = e.target.closest("td.sub-pre.editable");
    if (pre && !pre.querySelector("input")) { abrirEditor(pre); return; }
    const pct = e.target.closest("td.sub-aum.editable-pct");
    if (pct && !pct.querySelector("input")) { abrirEditorPct(pct); return; }
    const preB = e.target.closest("td.sub-pre.editable-b");
    if (preB && !preB.querySelector("input")) { abrirEditorB(preB); return; }
    const pctB = e.target.closest("td.sub-aum.editable-pct-b");
    if (pctB && !pctB.querySelector("input")) { abrirEditorPctB(pctB); return; }
    const cpre = e.target.closest("td.sub-pre.editable-cli-precio");
    if (cpre && !cpre.querySelector("input")) { abrirEditorClientePrecio(cpre); return; }
    const cpct = e.target.closest("td.sub-aum.editable-cli-pct");
    if (cpct && !cpct.querySelector("input")) { abrirEditorClientePct(cpct); return; }
  });
  document.querySelector("[data-role=descartar]")?.addEventListener("click", descartarCambios);
  document.querySelector("[data-role=guardar]")?.addEventListener("click", guardarCambios);
  // Aviso al salir con cambios sin guardar (recargar/cerrar/navegar).
  window.addEventListener("beforeunload", (e) => {
    if (pendingChanges.size > 0) { e.preventDefault(); e.returnValue = ""; }
  });
}

// ---- Cartuchos (chips) de Grupo / Resp. Neg. ----
// Texto oscuro/claro según luminancia del fondo (YIQ, umbral 145 para favorecer texto oscuro en los claros).
function textoContraste(hex) {
  const c = String(hex || "").replace("#", "");
  let r, g, b;
  if (c.length === 3) { r = parseInt(c[0] + c[0], 16); g = parseInt(c[1] + c[1], 16); b = parseInt(c[2] + c[2], 16); }
  else if (c.length >= 6) { r = parseInt(c.slice(0, 2), 16); g = parseInt(c.slice(2, 4), 16); b = parseInt(c.slice(4, 6), 16); }
  else return "#12161c";
  if ([r, g, b].some(Number.isNaN)) return "#12161c";
  return (r * 299 + g * 587 + b * 114) / 1000 >= 145 ? "#12161c" : "#f4f8ff";   // fondo claro → texto oscuro
}
// Cartucho de etiqueta. Sin nombre → "" (celda vacía, sin cartucho gris). Solo hex de 3 o 6 dígitos
// (los de 8, #RRGGBBAA, tendrían alfa y textoContraste calcularía mal → van al color neutro).
function chipEtq(nombre, color) {
  if (!nombre) return "";
  const bg = (typeof color === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) ? color : "#3a4453";
  return `<span class="chip-etq" style="background:${bg};color:${textoContraste(bg)}" title="${esc(nombre)}">${esc(nombre)}</span>`;
}

function render() {
  const { suc, clientes, MESES, precioBy } = DATA;
  sidsConB.clear();   // se vuelve a llenar acá abajo: qué objetivos tienen fila B depende de los datos
  // Color del % de aumento = color de la paritaria de ese precio (sanitizado a hex; verde si no hay/ inválido).
  const colorParitaria = (pid) => {
    const p = pid ? (DATA.paritarias || []).find((x) => x.id === pid) : null;
    const c = p && p.color;
    return (typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : "#4ade80";
  };
  const colorAumObj = (sid, mes) => colorParitaria(precioBy.get(sid)?.get(mes)?.paritaria_id);
  // Fila cliente: color común si todos los objetivos comparten paritaria ese mes; si difieren → verde neutro + aviso.
  const colorAumCli = (objsArr, mes) => {
    const ps = objsArr.map((s) => precioBy.get(s.id)?.get(mes)).filter(Boolean).map((r) => r.paritaria_id ?? null);
    if (!ps.length) return { color: "#4ade80", mixed: false };
    return ps.every((p) => p === ps[0]) ? { color: colorParitaria(ps[0]), mixed: false } : { color: "#4ade80", mixed: true };
  };
  const contPrev = document.querySelector("[data-role=precios-container]");
  const scrollPrev = contPrev ? contPrev.scrollLeft : 0;   // preservar posición horizontal en re-renders
  const cName = new Map(clientes.map((c) => [c.id, c.nombre]));
  const cDesc = new Map(clientes.map((c) => [c.id, c.descuento_pronto_pago]));

  // Industria (nivel cliente) y Coordinador de Cuenta (nivel objetivo, vigente)
  const iName = new Map((DATA.industrias || []).map((i) => [i.id, i.nombre]));
  const cInd = new Map(clientes.map((c) => [c.id, c.industria_id]));
  const pName = new Map((DATA.personas || []).map((p) => [p.id, p.nombre]));
  const ocBySuc = new Map();
  for (const r of DATA.ocs || []) {
    if (r.vigente_hasta) continue;                                        // solo vigentes
    if (r.rol !== "coord_cuenta" && r.rol !== "franquicia") continue;
    if (!ocBySuc.has(r.sucursal_id)) ocBySuc.set(r.sucursal_id, { coord_cuenta: [], franquicia: [] });
    ocBySuc.get(r.sucursal_id)[r.rol].push(r.persona_id);
  }
  const coordParts = (sid) => {
    const g = ocBySuc.get(sid) || { coord_cuenta: [], franquicia: [] };
    return [
      ...g.franquicia.map((pid) => ({ nom: pName.get(pid) || "?", franq: true })),
      ...g.coord_cuenta.map((pid) => ({ nom: pName.get(pid) || "?", franq: false })),
    ];
  };
  const coordHtml = (parts) => parts.map((p) => p.franq ? `<span class="rel-franq">${esc(p.nom)} (franq.)</span>` : esc(p.nom)).join(", ");
  const coordPlain = (parts) => parts.map((p) => p.nom + (p.franq ? " (franq.)" : "")).join(", ");

  // objetivos por cliente
  const sucByCli = new Map();
  for (const s of suc) {
    if (!sucByCli.has(s.cliente_id)) sucByCli.set(s.cliente_id, []);
    sucByCli.get(s.cliente_id).push(s);
  }
  const cliOrden = [...sucByCli.keys()].sort((a, b) => (cName.get(a) || "").localeCompare(cName.get(b) || ""));

  // mapas para edición a nivel cliente (Capa 4)
  objetivosDeCliente = new Map([...sucByCli].map(([cli, arr]) => [cli, arr.map((s) => s.id)]));
  clienteDeSid = new Map(suc.map((s) => [s.id, s.cliente_id]));
  sucById = new Map(suc.map((s) => [s.id, s]));
  clientesDif.clear();

  // índice del mes en curso (para decidir uniforme vs diferenciado)
  const hoy = new Date();
  const mesEnCurso = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const idxCur = Math.max(0, MESES.indexOf(mesEnCurso));
  MES_CUR = MESES[idxCur];

  // Clases del mes i: banda alternada + " mes-off" si queda fuera de la ventana visible.
  // Una sola fuente para el encabezado y para las celdas, así no se pueden desalinear.
  const { desde, hasta } = ventanaMeses();
  const fueraVentana = (m) => !verTodosLosMeses && (m.slice(0, 10) < desde || m.slice(0, 10) > hasta);
  const clsMes = (m, i) => `${i % 2 === 1 ? " m-alt" : ""}${fueraVentana(m) ? " mes-off" : ""}`;
  nMesesVisibles = MESES.filter((m) => !fueraVentana(m)).length;
  const tabla = document.querySelector("[data-role=tabla-precios]");
  if (tabla) tabla.classList.toggle("ventana-corta", !verTodosLosMeses);

  // Encabezados agrupados: fila 1 = mes (colspan 3), fila 2 = % Aum | Precio | % Desc.
  const thead = document.querySelector("[data-role=tabla-precios] thead");
  const grp = MESES.map((m, i) => {
    const [y, mm] = m.split("-");
    const a = clsMes(m, i);
    return `<th class="mes-grp${a}" data-mes="${m.slice(0, 10)}" colspan="3">${mm}/${y}</th>`;
  }).join("");
  const sub = MESES.map((m, i) => {
    const a = clsMes(m, i);
    const mes = m.slice(0, 10);
    const fn = (campo) => ` <span class="funnel funnel-mes" data-fmes="${mes}" data-fcampo="${campo}" title="Filtrar por esta columna">▾</span>`;
    return `<th class="sub sub-aum${a}">% Aum${fn("aum")}</th><th class="sub sub-pre${a}">Precio${fn("precio")}</th><th class="sub sub-desc${a}">% Desc${fn("desc")}</th>`;
  }).join("");
  const rh = (col) => `<span class="col-resize" data-col="${col}" title="Arrastrar para ajustar el ancho"></span>`;   // handle de redimensión
  thead.innerHTML =
      `<tr class="grp"><th class="sticky-col col-obj" rowspan="2">Cliente / Objetivo <span class="funnel" data-fcol="cliente" title="Filtrar por esta columna">▾</span><span class="col-menu-btn" data-role="col-menu-btn" title="Mostrar / ocultar columnas">☰</span>${rh("obj")}</th>`
    + `<th class="sticky-col col-tipo" rowspan="2" title="Tipo (A/B)">T${rh("tipo")}</th>`
    + `<th class="sticky-col col-ind" rowspan="2">Industria <span class="funnel" data-fcol="industria" title="Filtrar por esta columna">▾</span>${rh("ind")}</th>`
    + `<th class="sticky-col col-coord" rowspan="2">Coordinador <span class="funnel" data-fcol="coordinador" title="Filtrar por esta columna">▾</span>${rh("coord")}</th>`
    + `<th class="sticky-col col-grupo" rowspan="2">Grupo <span class="funnel" data-fcol="grupo" title="Filtrar por esta columna">▾</span>${rh("grupo")}</th>`
    + `<th class="sticky-col col-resp" rowspan="2">Resp. Neg. <span class="funnel" data-fcol="responsable" title="Filtrar por esta columna">▾</span>${rh("resp")}</th>`
    // El embudo va inline junto al rótulo y el selector de paritaria abajo (.nota-sel es
    // display:block), así conviven en la misma celda sin pisarse. Sin notasOK no hay
    // ninguno de los dos: no habría estado que filtrar.
    + `<th class="sticky-col col-nota" rowspan="2">Nota${notasOK ? ` <span class="funnel" data-fcol="nota" title="Filtrar por estado de la nota">▾</span>` : ""}${selectorNotaHtml()}${rh("nota")}</th>${grp}</tr>`
    + `<tr class="sub">${sub}</tr>`;

  let html = "";
  let nDif = 0;
  for (const cli of cliOrden) {
    const objs = sucByCli.get(cli).slice().sort((a, b) =>
      String(a.codigo_objetivo).localeCompare(String(b.codigo_objetivo), undefined, { numeric: true }));
    const cliNom = cName.get(cli) || "?";
    const desc = cDesc.get(cli);
    const descTxt = desc != null ? fmtPct(desc).replace(".", ",") : "";   // % Desc del cliente (fijo, se repite por mes)

    // efectivo (con forward-fill) por objetivo + serie común del cliente
    const objArrays = objs.map((s) => efectivoDeObjetivo(s.id, MESES, precioBy));
    const objArraysB = objs.map((s) => efectivoDeObjetivo(s.id, MESES, precioBy, "precio_hora_b", true));   // serie B (0/null = sin B)
    const comun = MESES.map((_, i) => comunEnMes(objArrays, i));
    const comunPrecio = comun.map((c) => (c && c.precio != null ? c.precio : null));

    // ¿diferenciado en el mes en curso? → se expande solo; el % va por objetivo
    const cc = comun[idxCur];
    const esDif = !!(cc && cc.dif);
    if (esDif) { nDif++; clientesDif.add(cli); }
    const exp = esDif ? 1 : 0;

    // Industria (nivel cliente) y Coordinador común (si todos los objetivos comparten el mismo).
    const industriaTxt = iName.get(cInd.get(cli)) || "";
    const partsPorObj = objs.map((s) => coordParts(s.id));
    const keys = partsPorObj.map(coordPlain);
    const allEq = keys.length > 0 && keys.every((k) => k === keys[0]);
    const coordUnif = allEq && keys[0] !== "";
    const coordCliHtml = coordUnif ? coordHtml(partsPorObj[0])
      : (keys.every((k) => k === "") ? "" : `<span class="rel-none">(varios)</span>`);
    const coordCliPlain = coordUnif ? keys[0] : (keys.every((k) => k === "") ? "" : "(varios)");

    // Fila CLIENTE: precio común + % aumento (si uniforme) + % Desc (siempre, repetido por mes). Editable.
    const celdasCli = MESES.map((_, i) => {
      const aum = !esDif ? fmtAumGrid(comunPrecio[i], comunPrecio[i - 1], i === 0) : "";
      let color = null, title = null;
      // El guion no lleva color de paritaria: no representa un aumento de ninguna.
      if (aum && aum !== GUION_SIN_COMPARACION) { const r = colorAumCli(objs, MESES[i]); color = r.color; if (r.mixed) title = "paritarias distintas por objetivo"; }
      return celdaMes(comun[i], aum, descTxt, clsMes(MESES[i], i), { cli, mes: MESES[i].slice(0, 10) }, color, title);
    }).join("");
    const gid = grupoDeCliente.get(cli) || "";
    const grupoNom = gid ? nombreGrupo(gid) : "";
    const cg = gid ? colorGrupo(gid) : null;   // color del grupo (fondo del cartucho)
    const nota = notasPorCliente.get(cli);   // estado de la nota del CLIENTE (la paritaria elegida en el encabezado)
    const rid = responsableDeCliente.get(cli) || "";
    const respNom = rid ? nombreResponsable(rid) : "";
    const cr = rid ? colorResponsable(rid) : null;
    html += `<tr class="rel-cliente" data-cliente="${esc(cli)}" data-exp="${exp}" data-grupo="${esc(gid)}" data-resp="${esc(rid)}">`
      + `<td class="sticky-col col-obj" title="${esc(cliNom)}"><input type="checkbox" class="chk-grupo" data-cli="${esc(cli)}" /><span class="rel-arrow">${exp ? "▼" : "▶"}</span>${esc(acortarNombre(cliNom))}</td>`
      + `<td class="sticky-col col-tipo"></td>`
      + `<td class="sticky-col col-ind" title="${esc(industriaTxt)}">${esc(industriaTxt)}</td>`
      + `<td class="sticky-col col-coord" title="${esc(coordCliPlain)}">${coordCliHtml}</td>`
      + `<td class="sticky-col col-grupo" title="${esc(grupoNom || "(sin grupo)")}">${chipEtq(grupoNom, cg)}</td>`
      + `<td class="sticky-col col-resp" title="${esc(respNom || "(sin responsable)")}">${chipEtq(respNom, cr)}</td>`
      + `<td class="sticky-col col-nota" title="${esc(tituloNota(nota))}">${chipNota(nota, cli)}</td>`
      + celdasCli
      + `</tr>`;

    // Filas OBJETIVO: precio (real/proj) por mes. El % va acá SOLO si el cliente es diferenciado.
    //   % Desc queda vacío en el objetivo (es dato del cliente, se ve en su fila).
    objs.forEach((s, oi) => {
      const efe = objArrays[oi];
      const nom = `${s.codigo_objetivo} · ${s.nombre || ""}`;
      const nomDisp = `${s.codigo_objetivo} · ${acortarNombre(s.nombre || "")}`;   // solo display; nom (real) va en title/data-txt
      const coordObj = coordHtml(partsPorObj[oi]);                    // coordinador de cuenta de ESTE objetivo
      const coordNames = partsPorObj[oi].map((p) => p.nom).join("|"); // para el filtro (nombres exactos)
      // tipo de coordinación del objetivo: franq (≥1 franquicia) | lince (tiene coords, ninguno franq) | "" (sin coord)
      const coordtipo = partsPorObj[oi].length ? (partsPorObj[oi].some((p) => p.franq) ? "franq" : "lince") : "";
      const celdas = MESES.map((_, i) => {
        const aum = esDif ? fmtAumGrid(efe[i] ? efe[i].precio : null, efe[i - 1] ? efe[i - 1].precio : null, i === 0) : "";
        // El PRECIO es editable siempre (para poder cargar el primero); el % solo donde ya hay.
        const edit = { sid: s.id, mes: MESES[i].slice(0, 10), pct: !!efe[i] };
        return celdaMes(efe[i], aum, "", clsMes(MESES[i], i), edit, (aum && aum !== GUION_SIN_COMPARACION) ? colorAumObj(s.id, MESES[i]) : null);
      }).join("");
      html += `<tr class="rel-obj" data-obj-de="${esc(cli)}" data-sid="${esc(s.id)}"`
        + ` data-txt="${esc(cliNom + " " + nom)}" data-ind="${esc(cInd.get(cli) || "")}" data-coord="${esc(coordNames)}" data-coordtipo="${coordtipo}" data-grupo="${esc(gid)}" data-resp="${esc(rid)}"${exp ? "" : " hidden"}>`
        + `<td class="sticky-col col-obj nombre" title="${esc(nom)}">${esc(nomDisp)}</td>`
        + `<td class="sticky-col col-tipo">A</td>`
        + `<td class="sticky-col col-ind"></td>`
        + `<td class="sticky-col col-coord" title="${esc(coordPlain(partsPorObj[oi]))}">${coordObj}</td>`
        + `<td class="sticky-col col-grupo"></td>`
        + `<td class="sticky-col col-resp"></td>`
        + `<td class="sticky-col col-nota"></td>`   // la nota es por CLIENTE: en objetivo va vacía
        + celdas
        + `</tr>`;

      // Fila B: solo si el objetivo tiene precio B en algún mes (no-nulo/no-cero). A los que
      // NO tienen B no se les dibuja la fila, y por eso no hay dónde escribirles el primero:
      // es a propósito (decidido 10-ago, ver Pendiente_Finflow.txt).
      const efeB = objArraysB[oi];
      if (efeB.some(Boolean)) {
        sidsConB.add(s.id);
        const celdasB = MESES.map((_, i) => {
          const aum = esDif ? fmtAumGrid(efeB[i] ? efeB[i].precio : null, efeB[i - 1] ? efeB[i - 1].precio : null, i === 0) : "";
          // Editable igual que el A, pero con sidb: el precio solo donde YA hay B; el % solo ahí también.
          const edit = { sidb: s.id, mes: MESES[i].slice(0, 10), pct: !!efeB[i] };
          return celdaMes(efeB[i], aum, "", clsMes(MESES[i], i), edit, (aum && aum !== GUION_SIN_COMPARACION) ? colorAumObj(s.id, MESES[i]) : null);
        }).join("");
        html += `<tr class="rel-obj rel-obj-b" data-obj-de="${esc(cli)}" data-sid="${esc(s.id)}" data-tipo="B"`
          + ` data-txt="${esc(cliNom + " " + nom)}" data-ind="${esc(cInd.get(cli) || "")}" data-coord="${esc(coordNames)}" data-coordtipo="${coordtipo}" data-grupo="${esc(gid)}" data-resp="${esc(rid)}"${exp ? "" : " hidden"}>`
          + `<td class="sticky-col col-obj nombre" title="${esc(nom)}">${esc(nomDisp)}</td>`
          + `<td class="sticky-col col-tipo">B</td>`
          + `<td class="sticky-col col-ind"></td>`
          + `<td class="sticky-col col-coord" title="${esc(coordPlain(partsPorObj[oi]))}">${coordObj}</td>`
          + `<td class="sticky-col col-grupo"></td>`
          + `<td class="sticky-col col-resp"></td>`
          + `<td class="sticky-col col-nota"></td>`   // la nota es por CLIENTE: en objetivo va vacía
          + celdasB
          + `</tr>`;
      }
    });
  }
  document.querySelector("[data-role=tabla-precios] tbody").innerHTML = html;
  aplicarColsFijas();   // re-aplica anchos/ocultas de columnas fijas (el thead se reconstruye en cada render)

  // Leyenda de paritarias PRESENTES (con aumentos cargados): cuadradito de su color + nombre.
  const pidsPresentes = new Set();
  for (const [, pmap] of precioBy) for (const row of pmap.values()) if (row.paritaria_id != null) pidsPresentes.add(row.paritaria_id);
  const leyPari = [...pidsPresentes]
    .map((pid) => (DATA.paritarias || []).find((x) => x.id === pid)).filter(Boolean)
    .sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || "")))
    .map((p) => `<span title="${esc((p.codigo ? p.codigo + " · " : "") + p.nombre)}"><span class="sw" style="background:${colorParitaria(p.id)}"></span>${esc(p.nombre)}</span>`)
    .join("");
  const leyEl = document.querySelector("[data-role=leyenda-paritarias]");
  if (leyEl) leyEl.innerHTML = leyPari;

  // Opciones para los filtros (solo rubros/coordinadores PRESENTES) + mapa de descuentos.
  const indsPres = new Map(), coordsPres = new Set();
  for (const cli of cliOrden) {
    const iid = cInd.get(cli);
    if (iid && iName.has(iid)) indsPres.set(iid, iName.get(iid));
    for (const s of sucByCli.get(cli)) for (const p of coordParts(s.id)) coordsPres.add(p.nom);
  }
  FILTROS_OPC = {
    clientes: cliOrden.map((cli) => ({ id: cli, nombre: cName.get(cli) || "?" })),   // ya alfabético
    industrias: [...indsPres].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    coordinadores: [...coordsPres].sort((a, b) => a.localeCompare(b)),
    grupos: (DATA.grupos || []).map((g) => ({ id: g.id, nombre: g.nombre })),
  };
  descDeCliente = new Map(clientes.map((c) => [c.id, c.descuento_pronto_pago]));

  aplicarFiltros();   // reaplica filtros vigentes (o restaura plegado si no hay) + status
  if (contPrev) contPrev.scrollLeft = scrollPrev;   // restaurar scroll (evita saltar a 01/2024)
}

// ================= FILTROS por columna (combinables, AND) =================
const filtros = { clientes: new Set(), industrias: new Set(), coordinadores: new Set(), coordTipo: "", grupos: new Set(), responsables: new Set(), nota: new Set(), mes: [] };
let FILTROS_OPC = { clientes: [], industrias: [], coordinadores: [], grupos: [], responsables: [] };
let descDeCliente = new Map();

const normaliza = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function filtrosActivos() {
  return (filtros.clientes.size ? 1 : 0) + (filtros.industrias.size ? 1 : 0) + (filtros.coordinadores.size ? 1 : 0) + (filtros.coordTipo ? 1 : 0) + (filtros.grupos.size ? 1 : 0) + (filtros.responsables.size ? 1 : 0) + (filtros.nota.size ? 1 : 0) + filtros.mes.length;
}
// Texto legible de los filtros activos (para registrar aplicaciones "a filtrados").
function describirFiltros() {
  const partes = [];
  if (filtros.industrias.size) partes.push("Industria: " + FILTROS_OPC.industrias.filter((i) => filtros.industrias.has(i.id)).map((i) => i.nombre).join(", "));
  if (filtros.coordinadores.size) partes.push("Coordinador: " + [...filtros.coordinadores].join(", "));
  if (filtros.coordTipo) partes.push("Coordinador: " + (filtros.coordTipo === "franq" ? "solo franquicia" : "solo Lince"));
  if (filtros.grupos.size) partes.push("Grupo: " + FILTROS_OPC.grupos.filter((g) => filtros.grupos.has(g.id)).map((g) => g.nombre).join(", "));
  if (filtros.responsables.size) partes.push("Resp. Neg.: " + FILTROS_OPC.responsables.filter((g) => filtros.responsables.has(g.id)).map((g) => g.nombre).join(", "));
  if (filtros.nota.size) partes.push("Nota: " + [...filtros.nota].map((v) => NOTA_ESTADOS[v] || v).join(", "));
  if (filtros.clientes.size) partes.push("Cliente: " + FILTROS_OPC.clientes.filter((c) => filtros.clientes.has(c.id)).map((c) => c.nombre).join(", "));
  if (filtros.mes.length) partes.push("Mes: " + filtros.mes.map(labelMesFiltro).join(", "));
  return partes.length ? partes.join("; ") : "Todos los clientes";
}

// Valor de un objetivo en un mes para el campo pedido (usa el valor ACTUAL, con borradores).
function valorMes(sid, mes, campo) {
  const cur = currentPrecio(sid, mes);
  if (campo === "precio") return cur;
  if (campo === "aum") {
    const pm = prevMes(mes); if (!pm) return null;
    const prev = currentPrecio(sid, pm);
    return (prev && cur != null) ? (cur / prev - 1) * 100 : null;
  }
  if (campo === "desc") { const d = descDeCliente.get(clienteDeSid.get(sid)); return d != null ? d * 100 : 0; }
  return null;
}
function pasaMesFiltro(sid, f) {
  const val = valorMes(sid, f.mes, f.campo);
  if (f.op === "valores") { return val != null && f.vals.some((v) => Math.abs(v - val) < 0.005); }
  switch (f.op) {
    case "gt": return val != null && val > f.v1;
    case "lt": return val != null && val < f.v1;
    case "between": return val != null && val >= f.v1 && val <= f.v2;
    case "con": return val != null && val > 0;
    case "sin": return val == null || val === 0;
  }
  return true;
}

// valores únicos presentes en una columna (mes+campo), formateados y ordenados.
function fmtValor(v, campo) {
  if (campo === "precio") return fmtMoney(v);
  const num = String(Math.round(v * 100) / 100).replace(".", ",");
  return campo === "aum" ? (v > 0 ? "+" : "") + num + "%" : num + "%";
}
function valoresColumna(mes, campo) {
  const m = new Map();
  for (const s of DATA.suc) {
    const v = valorMes(s.id, mes, campo);
    if (v == null) continue;
    const r = Math.round(v * 100) / 100;
    if (!m.has(r)) m.set(r, fmtValor(r, campo));
  }
  return [...m.entries()].map(([v, disp]) => ({ v, disp })).sort((a, b) => a.v - b.v);
}
function objetivoPasa(tr) {
  if (modoArmarGrupo) {   // modo armar: solo clientes SIN esa etiqueta (grupo o responsable, según abmTipo)
    const cli = tr.dataset.objDe;
    if ((abmTipo === "responsable" ? responsableDeCliente.get(cli) : grupoDeCliente.get(cli))) return false;
  }
  if (filtros.clientes.size && !filtros.clientes.has(tr.dataset.objDe)) return false;
  if (filtros.industrias.size && !filtros.industrias.has(tr.dataset.ind || "")) return false;
  if (filtros.coordinadores.size) {
    const coords = (tr.dataset.coord || "").split("|").filter(Boolean);
    if (!coords.some((c) => filtros.coordinadores.has(c))) return false;
  }
  if (filtros.coordTipo && (tr.dataset.coordtipo || "") !== filtros.coordTipo) return false;   // franquicia / Lince
  if (filtros.grupos.size) {
    const g = tr.dataset.grupo || "";
    if (!((g && filtros.grupos.has(g)) || (!g && filtros.grupos.has("__sin__")))) return false;
  }
  if (filtros.responsables.size) {
    const r = tr.dataset.resp || "";
    if (!((r && filtros.responsables.has(r)) || (!r && filtros.responsables.has("__sin__")))) return false;
  }
  // El estado de la nota es del CLIENTE, no del objetivo: todos los objetivos de un
  // cliente comparten el mismo, así que el cliente entra o queda afuera entero.
  if (filtros.nota.size && !filtros.nota.has(estadoNota(tr.dataset.objDe))) return false;
  if (filtros.mes.length) {
    const sid = tr.dataset.sid;
    for (const f of filtros.mes) if (!pasaMesFiltro(sid, f)) return false;
  }
  return true;
}

function aplicarFiltros() {
  const activos = filtrosActivos();
  const modo = modoArmarGrupo;
  const tabla = document.querySelector("[data-role=tabla-precios]");
  tabla?.classList.toggle("filtrando", activos > 0 || modo);
  tabla?.classList.toggle("modo-grupo", modo);
  const objRows = [...document.querySelectorAll("tr.rel-obj")];
  const cliRows = [...document.querySelectorAll("tr.rel-cliente")];

  if (!activos && !modo) {
    // sin filtros → restaurar plegado normal
    cliRows.forEach((tr) => {
      tr.hidden = false;
      const arrow = tr.querySelector(".rel-arrow"); if (arrow) arrow.textContent = tr.dataset.exp === "1" ? "▼" : "▶";
    });
    objRows.forEach((tr) => {
      const cliTr = document.querySelector(`tr.rel-cliente[data-cliente="${tr.dataset.objDe}"]`);
      tr.hidden = !(cliTr && cliTr.dataset.exp === "1");
    });
    actualizarFiltrosInfo(); actualizarStatus();
    return;
  }

  const passByCli = new Set();
  objRows.forEach((tr) => {
    const pass = objetivoPasa(tr);
    if (pass) passByCli.add(tr.dataset.objDe);
    tr.hidden = modo ? true : !pass;         // en modo armar grupo los objetivos no se muestran
  });
  cliRows.forEach((tr) => {
    const vis = passByCli.has(tr.dataset.cliente);   // cliente visible si algún objetivo pasa (y sin grupo, en modo)
    tr.hidden = !vis;
    if (vis && !modo) { const arrow = tr.querySelector(".rel-arrow"); if (arrow) arrow.textContent = "▼"; }  // auto-expandido
  });
  actualizarFiltrosInfo(); actualizarStatus();
}

function actualizarFiltrosInfo() {
  const n = filtrosActivos();
  const info = document.querySelector("[data-role=filtros-info]");
  if (info) info.textContent = n ? `${n} filtro${n > 1 ? "s" : ""} activo${n > 1 ? "s" : ""}` : "";
  const btn = document.querySelector("[data-role=limpiar-filtros]");
  if (btn) btn.disabled = n === 0;
  // limpiar marcas de columna/mes
  document.querySelectorAll("th.col-filtrada").forEach((t) => t.classList.remove("col-filtrada"));
  document.querySelectorAll("th.mes-filtrado").forEach((t) => t.classList.remove("mes-filtrado"));
  const mesesConFiltro = new Set(filtros.mes.map((x) => x.mes));
  document.querySelectorAll(".funnel").forEach((f) => {
    if (f.dataset.fmes) {   // embudo de columna de mes
      const act = filtros.mes.some((x) => x.mes === f.dataset.fmes && x.campo === f.dataset.fcampo);
      f.classList.toggle("activo", act);
      if (act) f.closest("th")?.classList.add("col-filtrada");   // resalta el sub-encabezado de esa columna
      return;
    }
    const c = f.dataset.fcol;
    const act = c === "cliente" ? filtros.clientes.size > 0 : c === "industria" ? filtros.industrias.size > 0
      : c === "coordinador" ? (filtros.coordinadores.size > 0 || !!filtros.coordTipo)
      : c === "responsable" ? filtros.responsables.size > 0
      : c === "nota" ? filtros.nota.size > 0 : filtros.grupos.size > 0;
    f.classList.toggle("activo", act);
  });
  document.querySelectorAll("th.mes-grp").forEach((t) => { if (mesesConFiltro.has(t.dataset.mes)) t.classList.add("mes-filtrado"); });
}

function limpiarFiltros() {
  filtros.clientes.clear(); filtros.industrias.clear(); filtros.coordinadores.clear(); filtros.coordTipo = ""; filtros.grupos.clear(); filtros.responsables.clear(); filtros.nota.clear(); filtros.mes = [];
  renderChips(); cerrarPopup(); aplicarFiltros();
}

// ---- chips de los filtros de mes ----
function labelMesFiltro(f) {
  const campo = f.campo === "precio" ? "Precio" : f.campo === "aum" ? "% Aum" : "% Desc";
  const mesLbl = `${f.mes.slice(5, 7)}/${f.mes.slice(0, 4)}`;
  const u = f.campo === "precio" ? "$" : "", s = f.campo === "precio" ? "" : "%";
  if (f.op === "valores") return `${campo} ${mesLbl}: ${f.vals.length} valor${f.vals.length > 1 ? "es" : ""}`;
  if (f.op === "con") return `${campo} ${mesLbl} con dato`;
  if (f.op === "sin") return `${campo} ${mesLbl} sin/=0`;
  if (f.op === "between") return `${campo} ${mesLbl} entre ${u}${f.v1}${s} y ${u}${f.v2}${s}`;
  return `${campo} ${mesLbl} ${f.op === "gt" ? ">" : "<"} ${u}${f.v1}${s}`;
}
function renderChips() {
  const cont = document.querySelector("[data-role=fm-chips]");
  if (cont) cont.innerHTML = filtros.mes.map((f, i) => `<span class="chip">${esc(labelMesFiltro(f))} <span class="chip-x" data-chip="${i}">✕</span></span>`).join(" ");
}

// ---- popup de los filtros de columnas fijas ----
function cerrarPopup() { const p = document.querySelector("[data-role=filtro-popup]"); if (p) p.hidden = true; }
// Barra de acciones sobre la lista + contador de visibles.
const fpSelBar = () => `<div class="fp-selbar"><button type="button" data-role="fp-sel-todos">Seleccionar todos</button>`
  + `<button type="button" data-role="fp-sel-ninguno">Deseleccionar todos</button>`
  + `<span class="fp-vis-count" data-role="fp-vis-count"></span></div>`;
// Opción (label) con nombre en UNA línea (ellipsis + title). `pre` = html antes del nombre (ej. swatch de color).
const fpOpcion = (val, nombre, checked, pre = "") => `<label><input type="checkbox" value="${esc(val)}"${checked ? " checked" : ""}/>${pre}<span class="fp-nom" title="${esc(nombre)}">${esc(nombre)}</span></label>`;
// Cuenta las opciones visibles (no ocultas por el buscador interno) y actualiza el "(sobre los N visibles)".
function actualizarVisCount(pop) {
  const el = pop.querySelector("[data-role=fp-vis-count]"); if (!el) return;
  const n = [...pop.querySelectorAll(".fp-list label")].filter((lb) => lb.style.display !== "none").length;
  el.textContent = `(sobre los ${n} visibles)`;
}
// Tilda/destilda SOLO las opciones visibles (respeta el buscador interno del popup).
function seleccionVisibles(pop, val) {
  pop.querySelectorAll(".fp-list label").forEach((lb) => {
    if (lb.style.display === "none") return;
    const chk = lb.querySelector('input[type=checkbox]'); if (chk) chk.checked = val;
  });
}
function abrirPopupFiltro(funnel) {
  const col = funnel.dataset.fcol;
  const pop = document.querySelector("[data-role=filtro-popup]");
  const buscar = `<input type="text" data-role="fp-buscar" placeholder="filtrar opciones…" />`;
  const acc = `<div class="fp-acc"><button data-role="fp-aplicar">Aplicar</button><button data-role="fp-limpiar-col">Limpiar</button></div>`;
  let html = "";
  if (col === "cliente") {
    html = `<div class="fp-title">Cliente / Objetivo</div>` + buscar + fpSelBar() + `<div class="fp-list">`
      + FILTROS_OPC.clientes.map((c) => fpOpcion(c.id, c.nombre, filtros.clientes.has(c.id))).join("")
      + `</div>` + acc;
  } else if (col === "industria") {
    html = `<div class="fp-title">Industria</div>` + buscar + fpSelBar() + `<div class="fp-list">`
      + FILTROS_OPC.industrias.map((i) => fpOpcion(i.id, i.nombre, filtros.industrias.has(i.id))).join("")
      + `</div>` + acc;
  } else if (col === "coordinador") {
    const nTot = document.querySelectorAll("tr.rel-obj:not(.rel-obj-b)").length;
    const nFranq = document.querySelectorAll('tr.rel-obj:not(.rel-obj-b)[data-coordtipo="franq"]').length;
    const nLince = document.querySelectorAll('tr.rel-obj:not(.rel-obj-b)[data-coordtipo="lince"]').length;
    const ct = filtros.coordTipo || "";
    const rc = (val, lbl) => `<label style="display:block;cursor:pointer"><input type="radio" name="coordtipo" value="${val}" ${ct === val ? "checked" : ""}/> ${lbl}</label>`;
    html = `<div class="fp-title">Coordinador de Cuenta</div>`
      + `<div style="margin-bottom:6px;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:6px">`
      + rc("", `Todos (${nTot})`) + rc("franq", `Solo franquicia (${nFranq})`) + rc("lince", `Solo Lince (${nLince})`)
      + `</div>` + buscar + fpSelBar() + `<div class="fp-list">`
      + FILTROS_OPC.coordinadores.map((n) => fpOpcion(n, n, filtros.coordinadores.has(n))).join("")
      + `</div>` + acc;
  } else if (col === "nota") {
    // Tres opciones fijas: no hay buscador ni "seleccionar todos" (sobrarían). Los
    // contadores se cuentan sobre TODOS los clientes, no sobre los visibles: la pregunta
    // que responde este filtro es "cuántos faltan", y esa no puede depender de lo filtrado.
    const cont = { enviada: 0, generada: 0, ninguna: 0 };
    for (const tr of document.querySelectorAll("tr.rel-cliente")) cont[estadoNota(tr.dataset.cliente)]++;
    const op = (val) => fpOpcion(val, `${NOTA_ESTADOS[val]} (${cont[val]})`, filtros.nota.has(val));
    html = `<div class="fp-title">Nota — ${nombreParitaria(notaPariSel) || "paritaria elegida"}</div>`
      + `<div class="fp-list">` + op("enviada") + op("generada") + op("ninguna") + `</div>` + acc;
  } else if (col === "responsable") {
    const swHtml = (g) => (g.color && /^#[0-9a-fA-F]{3,8}$/.test(g.color)) ? `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:${g.color};margin-right:4px;vertical-align:middle;flex:none"></span>` : "";
    html = `<div class="fp-title">Resp. Neg.</div>` + buscar + fpSelBar() + `<div class="fp-list">`
      + fpOpcion("__sin__", "(sin responsable)", filtros.responsables.has("__sin__"))
      + FILTROS_OPC.responsables.map((g) => fpOpcion(g.id, g.nombre, filtros.responsables.has(g.id), swHtml(g))).join("")
      + `</div>` + acc;
  } else {   // grupo
    html = `<div class="fp-title">Grupo</div>` + buscar + fpSelBar() + `<div class="fp-list">`
      + fpOpcion("__sin__", "(sin grupo)", filtros.grupos.has("__sin__"))
      + FILTROS_OPC.grupos.map((g) => {
          const sw = (g.color && /^#[0-9a-fA-F]{3,8}$/.test(g.color)) ? `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:${g.color};margin-right:4px;vertical-align:middle;flex:none"></span>` : "";
          return fpOpcion(g.id, g.nombre, filtros.grupos.has(g.id), sw);
        }).join("")
      + `</div>` + acc;
  }
  pop.innerHTML = html;
  actualizarVisCount(pop);
  pop.dataset.col = col;
  pop.dataset.mode = "fija";
  const r = funnel.getBoundingClientRect();
  pop.hidden = false;
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + "px";
  pop.style.top = (r.bottom + 4) + "px";
  const foco = pop.querySelector("input"); if (foco) foco.focus();
}
// ---- popup contextual de una columna de MES (prueba) ----
function sincroPmOp() {
  const pop = document.querySelector("[data-role=filtro-popup]");
  const op = pop.querySelector("[data-role=pm-op]")?.value;
  const v1 = pop.querySelector("[data-role=pm-v1]"), v2 = pop.querySelector("[data-role=pm-v2]");
  if (v1) v1.style.display = (op === "con" || op === "sin") ? "none" : "";
  if (v2) v2.style.display = (op === "between") ? "" : "none";
}
function abrirPopupMes(funnel) {
  const mes = funnel.dataset.fmes, campo = funnel.dataset.fcampo;
  const pop = document.querySelector("[data-role=filtro-popup]");
  const campoLbl = campo === "precio" ? "Precio" : campo === "aum" ? "% Aum" : "% Desc";
  const mesLbl = `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
  const cur = filtros.mes.find((f) => f.mes === mes && f.campo === campo);
  const esCond = cur && cur.op !== "valores";
  const sel = (v) => esCond && cur.op === v ? " selected" : "";
  const valSel = (cur && cur.op === "valores") ? cur.vals : [];
  const chk = (v) => valSel.some((vv) => Math.abs(vv - v) < 0.005) ? " checked" : "";
  const lista = valoresColumna(mes, campo);
  pop.innerHTML = `<div class="fp-title">${campoLbl} · ${mesLbl}</div>`
    + `<div class="fp-sub">Por condición:</div>`
    + `<select data-role="pm-op">`
    + `<option value="gt"${sel("gt")}>mayor a</option><option value="lt"${sel("lt")}>menor a</option>`
    + `<option value="between"${sel("between")}>entre</option><option value="con"${sel("con")}>con dato / &gt;0</option>`
    + `<option value="sin"${sel("sin")}>sin / = 0</option></select>`
    + `<input type="text" data-role="pm-v1" class="fm-val" placeholder="valor" value="${esCond && cur.v1 != null ? cur.v1 : ""}" />`
    + `<input type="text" data-role="pm-v2" class="fm-val" placeholder="y…" value="${esCond && cur.v2 != null ? cur.v2 : ""}" />`
    + `<div class="fp-sub">o por valores (${lista.length}):</div>`
    + `<input type="text" data-role="fp-buscar" placeholder="filtrar valores…" />`
    + `<div class="fp-list">`
    + lista.map((x) => `<label><input type="checkbox" value="${x.v}"${chk(x.v)}/> ${esc(x.disp)}</label>`).join("")
    + `</div>`
    + `<div class="fp-acc"><button data-role="pm-aplicar">Aplicar</button><button data-role="pm-quitar">Quitar</button></div>`;
  pop.dataset.mode = "mes"; pop.dataset.mes = mes; pop.dataset.campo = campo;
  const r = funnel.getBoundingClientRect();
  pop.hidden = false;
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + "px";
  pop.style.top = (r.bottom + 4) + "px";
  sincroPmOp();
}
function aplicarPopupMes() {
  const pop = document.querySelector("[data-role=filtro-popup]");
  const mes = pop.dataset.mes, campo = pop.dataset.campo;
  const otros = filtros.mes.filter((f) => !(f.mes === mes && f.campo === campo));   // reemplaza el de esta columna

  // Si hay valores tildados, GANA la lista; si no, gana la condición.
  const vals = [...pop.querySelectorAll(".fp-list input:checked")].map((i) => parseFloat(i.value));
  if (vals.length) {
    filtros.mes = [...otros, { mes, campo, op: "valores", vals }];
    renderChips(); cerrarPopup(); aplicarFiltros();
    return;
  }
  const op = pop.querySelector("[data-role=pm-op]").value;
  const parse = (s) => campo === "precio" ? parsePrecio(s) : (isNaN(parseFloat(String(s).replace(",", "."))) ? null : parseFloat(String(s).replace(",", ".")));
  let a = null, b = null;
  if (op === "gt" || op === "lt" || op === "between") {
    a = parse(pop.querySelector("[data-role=pm-v1]").value); if (a == null) return;
    if (op === "between") { b = parse(pop.querySelector("[data-role=pm-v2]").value); if (b == null) return; }
  }
  filtros.mes = [...otros, { mes, campo, op, v1: a, v2: b }];
  renderChips(); cerrarPopup(); aplicarFiltros();
}
function quitarPopupMes() {
  const pop = document.querySelector("[data-role=filtro-popup]");
  const mes = pop.dataset.mes, campo = pop.dataset.campo;
  filtros.mes = filtros.mes.filter((f) => !(f.mes === mes && f.campo === campo));
  renderChips(); cerrarPopup(); aplicarFiltros();
}

function aplicarPopup() {
  const pop = document.querySelector("[data-role=filtro-popup]");
  const col = pop.dataset.col;
  const marcados = [...pop.querySelectorAll(".fp-list input:checked")].map((i) => i.value);
  if (col === "cliente") filtros.clientes = new Set(marcados);
  else if (col === "industria") filtros.industrias = new Set(marcados);
  else if (col === "coordinador") {
    filtros.coordinadores = new Set(marcados);
    filtros.coordTipo = pop.querySelector('input[name="coordtipo"]:checked')?.value || "";
  }
  else if (col === "responsable") filtros.responsables = new Set(marcados);
  else if (col === "nota") filtros.nota = new Set(marcados);
  else filtros.grupos = new Set(marcados);
  cerrarPopup(); aplicarFiltros();
}
function limpiarPopupCol() {
  const pop = document.querySelector("[data-role=filtro-popup]");
  const col = pop.dataset.col;
  if (col === "cliente") filtros.clientes.clear();
  else if (col === "industria") filtros.industrias.clear();
  else if (col === "coordinador") { filtros.coordinadores.clear(); filtros.coordTipo = ""; }
  else if (col === "responsable") filtros.responsables.clear();
  else if (col === "nota") filtros.nota.clear();
  else filtros.grupos.clear();
  cerrarPopup(); aplicarFiltros();
}

// ---- Columnas fijas: ancho (redimensionable) y visibilidad (menú ☰). Estado de sesión. ----
const anchoCol = { obj: 300, tipo: 40, ind: 180, coord: 180, grupo: 150, resp: 110, nota: 150 };   // ancho real (cuando visible)
const ocultas = { tipo: false, ind: false, coord: false, grupo: false, resp: true, nota: false };   // Resp. Neg. OCULTA por defecto; Nota VISIBLE
const LIM_COL = { obj: [200, 600], tipo: [24, 120], ind: [60, 360], coord: [60, 360], grupo: [60, 300], resp: [60, 300], nota: [90, 300] };
// Nota se oculta también cuando no hay dato utilizable: sin esto quedaría una columna
// vacía que se lee como error. Un solo lugar decide, para que el menú ☰ y la grilla
// no puedan discrepar.
const notaOculta = () => !!ocultas.nota || !notasOK;
// Escribe las variables CSS --w-* en el <table> y las clases hide-*; los offsets sticky se recalculan con calc().
function aplicarColsFijas() {
  const tabla = document.querySelector("[data-role=tabla-precios]");
  if (!tabla) return;
  tabla.style.setProperty("--w-obj", anchoCol.obj + "px");
  for (const k of ["tipo", "ind", "coord", "grupo", "resp", "nota"]) {
    const off = k === "nota" ? notaOculta() : !!ocultas[k];
    tabla.style.setProperty(`--w-${k}`, (off ? 0 : anchoCol[k]) + "px");   // oculta → 0 (recorre las siguientes)
    tabla.classList.toggle(`hide-${k}`, off);
  }
}

// ---- Persistencia de la vista (columnas visibles + anchos) en localStorage. Por PC/usuario, NO en la base. ----
const VISTA_KEY = "finflow.precios.vista";
const VISTA_VER = 3;   // subir este número cada vez que cambien las columnas fijas (agregar, sacar o reordenar), para invalidar lo guardado
                       // 3 = entra la columna Nota (27-jul-2026): con la 2, el navegador restauraba un layout sin ella
function cargarVista() {
  try {
    const raw = localStorage.getItem(VISTA_KEY);
    if (!raw) return;                              // nada guardado → defaults
    const data = JSON.parse(raw);
    if (!data || data.v !== VISTA_VER) return;     // versión distinta → ignora lo viejo, usa defaults
    if (data.ocultas && typeof data.ocultas === "object")
      for (const k of Object.keys(ocultas))        // solo claves conocidas (extras se ignoran)
        if (typeof data.ocultas[k] === "boolean") ocultas[k] = data.ocultas[k];
    if (data.anchoCol && typeof data.anchoCol === "object")
      for (const k of Object.keys(anchoCol)) {
        const w = data.anchoCol[k];
        if (typeof w === "number" && isFinite(w)) {
          const [mn, mx] = LIM_COL[k] || [40, 600];
          anchoCol[k] = Math.max(mn, Math.min(mx, w));   // clamp a límites: un valor corrupto no rompe el layout
        }
      }
  } catch (e) { /* JSON corrupto o storage bloqueado → defaults, la pantalla sigue funcionando */ }
}
function guardarVista() {
  try {
    localStorage.setItem(VISTA_KEY, JSON.stringify({ v: VISTA_VER, ocultas: { ...ocultas }, anchoCol: { ...anchoCol } }));
  } catch (e) { /* storage bloqueado/lleno → se ignora */ }
}

function wireResizeColObj() {
  const tabla = document.querySelector("[data-role=tabla-precios]");
  const thead = tabla?.querySelector("thead");
  if (!thead) return;
  // Arrastre de cualquier handle (data-col) → cambia el ancho de esa columna, con su min/max.
  thead.addEventListener("mousedown", (e) => {
    const h = e.target.closest(".col-resize"); if (!h) return;
    e.preventDefault();
    const col = h.dataset.col, [mn, mx] = LIM_COL[col] || [40, 600];
    const startX = e.clientX, startW = anchoCol[col];
    const onMove = (ev) => { tabla.style.setProperty(`--w-${col}`, Math.max(mn, Math.min(mx, startW + (ev.clientX - startX))) + "px"); };
    const onUp = (ev) => {
      anchoCol[col] = Math.max(mn, Math.min(mx, startW + (ev.clientX - startX)));
      document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.userSelect = "";
      guardarVista();   // persiste el nuevo ancho
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  // Botón ☰: menú mostrar/ocultar columnas.
  thead.addEventListener("click", (e) => { if (e.target.closest("[data-role=col-menu-btn]")) abrirMenuColumnas(e.target.closest("[data-role=col-menu-btn]")); });
}
const COLS_MENU = [{ k: "tipo", lbl: "Tipo" }, { k: "ind", lbl: "Industria" }, { k: "coord", lbl: "Coordinador" }, { k: "grupo", lbl: "Grupo" }, { k: "resp", lbl: "Resp. Neg." }, { k: "nota", lbl: "Nota" }];
function abrirMenuColumnas(btn) {
  const pop = document.querySelector("[data-role=col-menu-pop]");
  if (!pop) return;
  if (!pop.hidden) { pop.hidden = true; return; }   // toggle
  // Si la lectura de notas falló, Nota ni se ofrece: tildarla mostraría una columna vacía.
  const cols = COLS_MENU.filter((c) => c.k !== "nota" || notasOK);
  pop.innerHTML = `<div class="fp-title" style="font-weight:600;margin-bottom:4px">Columnas</div>`
    + cols.map((c) => `<label><input type="checkbox" data-col="${c.k}" ${ocultas[c.k] ? "" : "checked"}/> ${esc(c.lbl)}</label>`).join("");
  const r = btn.getBoundingClientRect();
  pop.hidden = false;
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + "px";
  pop.style.top = (r.bottom + 4) + "px";
}
// El <select> vive DENTRO del th de Nota y el thead se reconstruye entero en cada
// render: por eso el listener va DELEGADO en el thead y no atado al elemento, que se
// perdería al primer repintado. La paritaria elegida vive en notaPariSel.
function wireColumnaNota() {
  const thead = document.querySelector("[data-role=tabla-precios] thead");
  if (!thead) return;
  thead.addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-role=nota-pari]"); if (!sel) return;
    e.stopPropagation();   // el change no sale del thead: elegir paritaria es solo eso
    const pid = sel.value, prev = notaPariSel;
    if (!pid || pid === prev) return;
    sel.disabled = true;   // dos cambios encima no pueden cruzar sus respuestas
    try {
      notasPorCliente = await cargarNotas(pid);   // cacheada: ir y volver no re-consulta
      notaPariSel = pid;
      repintarColumnaNota();   // solo las celdas: no se pierden el scroll ni las filas abiertas
    } catch (err) {
      sel.value = prev;   // la columna sigue mostrando la paritaria anterior, no un estado a medias
      mostrarMsgEdicion("No se pudieron leer las notas de esa paritaria. " + humanizarError(err));
    } finally { sel.disabled = false; }
  });
}

function wireMenuColumnas() {
  const pop = document.querySelector("[data-role=col-menu-pop]");
  pop?.addEventListener("change", (e) => {
    const col = e.target.dataset.col; if (!col) return;
    ocultas[col] = !e.target.checked;   // destildado → oculta
    aplicarColsFijas();
    guardarVista();   // persiste la visibilidad de columnas
  });
  // cerrar al hacer clic fuera (ni en el menú ni en el botón ☰)
  document.addEventListener("click", (e) => {
    if (pop.hidden) return;
    if (e.target.closest("[data-role=col-menu-pop]") || e.target.closest("[data-role=col-menu-btn]")) return;
    pop.hidden = true;
  });
}

function wireFiltros() {
  // embudos (delegación en el thead)
  const thead = document.querySelector("[data-role=tabla-precios] thead");
  thead.addEventListener("click", (e) => {
    const f = e.target.closest(".funnel");
    if (!f) return;
    e.stopPropagation();
    if (f.dataset.fmes) abrirPopupMes(f); else abrirPopupFiltro(f);
  });
  // acciones del popup
  const pop = document.querySelector("[data-role=filtro-popup]");
  pop.addEventListener("click", (e) => e.stopPropagation());
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && pop.dataset.mode === "fija") aplicarPopup();
    if (e.key === "Enter" && pop.dataset.mode === "mes") aplicarPopupMes();
    if (e.key === "Escape") cerrarPopup();
  });
  pop.addEventListener("input", (e) => {   // buscador dentro de los popups (Cliente/Industria/Coordinador/Grupo)
    if (e.target.dataset.role !== "fp-buscar") return;
    const q = normaliza(e.target.value);
    pop.querySelectorAll(".fp-list label").forEach((lb) => {
      const chk = lb.querySelector("input").checked;
      lb.style.display = (!q || normaliza(lb.textContent).includes(q) || chk) ? "" : "none";
    });
    actualizarVisCount(pop);   // el contador refleja los visibles tras la búsqueda
  });
  pop.addEventListener("change", (e) => { if (e.target.dataset.role === "pm-op") sincroPmOp(); });
  pop.addEventListener("click", (e) => {
    const role = e.target.dataset.role;
    if (role === "fp-aplicar") aplicarPopup();
    else if (role === "fp-limpiar-col") limpiarPopupCol();
    else if (role === "fp-sel-todos") seleccionVisibles(pop, true);       // tilda los visibles
    else if (role === "fp-sel-ninguno") seleccionVisibles(pop, false);    // destilda los visibles
    else if (role === "pm-aplicar") aplicarPopupMes();
    else if (role === "pm-quitar") quitarPopupMes();
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("[data-role=filtro-popup]") && !e.target.closest(".funnel")) cerrarPopup(); });

  // quitar un chip de filtro de mes
  document.querySelector("[data-role=fm-chips]")?.addEventListener("click", (e) => {
    const x = e.target.closest(".chip-x"); if (!x) return;
    filtros.mes.splice(Number(x.dataset.chip), 1); renderChips(); aplicarFiltros();
  });
  document.querySelector("[data-role=limpiar-filtros]")?.addEventListener("click", limpiarFiltros);
}

// Deja el MES EN CURSO a la vista al abrir (con un par de meses previos de contexto a la izquierda).
function scrollAlMesEnCurso() {
  const cont = document.querySelector("[data-role=precios-container]");
  const th = document.querySelector(`th.mes-grp[data-mes="${MES_CUR}"]`);
  const fixOrder = ["obj", "tipo", "ind", "coord", "grupo", "resp", "nota"];   // última columna fija VISIBLE = borde derecho del bloque sticky
  let stickyTh = null;
  for (const k of fixOrder) { const el = document.querySelector(`th.col-${k}`); if (el && el.offsetParent !== null) stickyTh = el; }   // col-obj siempre visible → nunca queda null
  if (!cont || !th || !stickyTh) return;
  const contLeft = cont.getBoundingClientRect().left;
  const stickyRight = stickyTh.getBoundingClientRect().right - contLeft;   // ancho de las columnas fijas
  const thLeft = th.getBoundingClientRect().left - contLeft;              // posición actual del mes en curso
  const contexto = th.offsetWidth * 2;                                    // ~2 meses previos visibles
  cont.scrollLeft += thLeft - stickyRight - contexto;
}

// La medición del alto se mudó a js/shared/alto-tabla.js (la usa también el CRM).
// Con altura fija y medida, la barra de scroll horizontal queda clavada en el
// borde inferior y NO se mueve al expandir filas.
const wireAltoTablaPrecios = () => wireAltoTabla({
  contenedor: "[data-role=precios-container]",
  observar: "main > section.controls",   // chips de filtro, barra "armar grupo", mensaje de edición
});

// Plegado por cliente (idéntico a relaciones).
function setExpanded(tr, exp) {
  const cli = tr.dataset.cliente;
  tr.dataset.exp = exp ? "1" : "0";
  const arrow = tr.querySelector(".rel-arrow");
  if (arrow) arrow.textContent = exp ? "▼" : "▶";
  document.querySelectorAll(`[data-obj-de="${cli}"]`).forEach((r) => { r.hidden = !exp; });
}

function wireToggle() {
  const tbody = document.querySelector("[data-role=tabla-precios] tbody");
  tbody.addEventListener("click", (e) => {
    // La nota va PRIMERO y corta acá. Si no, el clic seguiría de largo hasta el toggle de
    // abajo y abrir la nota plegaría los objetivos del cliente en el mismo movimiento.
    const vn = e.target.closest("[data-role=ver-nota]");
    if (vn) { verNotaCliente(vn.dataset.cli); return; }
    // col-nota entra en las excepciones: la celda de la nota informa y abre, no pliega.
    if (e.target.closest("td.editable-cli-precio, td.editable-cli-pct, td.col-grupo, td.col-resp, td.col-nota, .chk-grupo, .edit-input")) return;  // no plegar al editar grupo/resp
    const tr = e.target.closest("tr.rel-cliente");
    if (tr) setExpanded(tr, tr.dataset.exp !== "1");
  });
  const all = (exp) => document.querySelectorAll("tr.rel-cliente").forEach((tr) => setExpanded(tr, exp));
  document.querySelector("[data-role=expandir]")?.addEventListener("click", () => all(true));
  document.querySelector("[data-role=colapsar]")?.addEventListener("click", () => all(false));
}

// ================= ESCALAS DE AUMENTO (paritarias) =================
async function cargarEscalas() {
  try {
    const [escalas, dets, paritarias, paDets] = await Promise.all([
      fetchAllRows("escalas_aumento", "id, nombre, descripcion, paritaria, paritaria_id, activa, texto_nota").catch(() => fetchAllRows("escalas_aumento", "id, nombre, paritaria, activa")),
      fetchAllRows("escalas_aumento_detalle", "escala_id, mes, pct_aumento"),
      fetchAllRows("paritarias", "id, codigo, nombre, descripcion, color, nota_generica, activa, acta_url, acta_path, acta_nombre, homologacion_path, homologacion_nombre").catch(() => []),
      fetchAllRows("paritarias_detalle", "paritaria_id, mes, pct_aumento").catch(() => []),
    ]);
    DATA.escalas = escalas;
    DATA.escalasDet = new Map();
    for (const d of dets) {
      if (!DATA.escalasDet.has(d.escala_id)) DATA.escalasDet.set(d.escala_id, []);
      DATA.escalasDet.get(d.escala_id).push(d);
    }
    for (const [, arr] of DATA.escalasDet) arr.sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
    DATA.paritarias = (paritarias || []).sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || "")));
    DATA.paritariasDet = new Map();
    for (const d of paDets) {
      if (!DATA.paritariasDet.has(d.paritaria_id)) DATA.paritariasDet.set(d.paritaria_id, []);
      DATA.paritariasDet.get(d.paritaria_id).push(d);
    }
    for (const [, arr] of DATA.paritariasDet) arr.sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  } catch (e) {
    DATA.escalas = []; DATA.escalasDet = new Map();
    DATA.paritarias = []; DATA.paritariasDet = new Map();
    console.warn("No se pudieron cargar escalas/paritarias:", e.message ?? e);
  }
  poblarSelectorParitaria();   // mantiene el selector de "paritaria activa" en sync
}
// Selector de "paritaria activa" (toolbar): para marcar la carga MANUAL de precios.
function poblarSelectorParitaria() {
  const sel = document.querySelector("[data-role=paritaria-activa]");
  if (!sel) return;
  const actual = sel.value || "";   // preservar la elección de Juan al recargar datos
  sel.innerHTML = `<option value="">— ninguna —</option>`
    + (DATA.paritarias || []).map((p) => `<option value="${esc(p.id)}">${esc(p.codigo || "")} · ${esc(p.nombre)}</option>`).join("");
  if (actual && (DATA.paritarias || []).some((p) => p.id === actual)) sel.value = actual;
}
const paritariaActivaId = () => (document.querySelector("[data-role=paritaria-activa]")?.value || null);
// "código · nombre" de una paritaria por id (para listas y selects).
function nombreParitaria(pid) { const p = (DATA.paritarias || []).find((x) => x.id === pid); return p ? `${p.codigo || ""} · ${p.nombre}` : ""; }

const pctDecToTxt = (d) => `${String(+(Number(d) * 100).toFixed(2)).replace(".", ",")}%`;
function clientesVisibles() {
  if (filtrosActivos() > 0) return [...document.querySelectorAll("tr.rel-cliente")].filter((t) => !t.hidden).map((t) => t.dataset.cliente);
  return [...objetivosDeCliente.keys()];
}
function meMsg(txt) { const el = document.querySelector("[data-role=me-msg]"); if (el) el.textContent = txt || ""; }

// En una escala solo tienen sentido los meses del mes en curso en adelante (los aumentos van hacia adelante).
const mesesEscala = () => DATA.MESES.map((m) => m.slice(0, 10)).filter((m) => m >= MES_CUR);
// Mes por defecto de un renglón nuevo: el siguiente al último cargado, o el mes en curso si es el primero.
function proximoMesEscala(box) {
  box = box || document.querySelector("[data-role=modal-escalas-box]");
  const sels = [...box.querySelectorAll(".me-renglon [data-role=me-mes]")];
  const meses = mesesEscala();
  const ultimo = sels.length ? sels[sels.length - 1].value : "";
  if (!ultimo) return meses[0] || "";
  const i = meses.indexOf(ultimo);
  return (i >= 0 && i + 1 < meses.length) ? meses[i + 1] : (meses[meses.length - 1] || "");
}
function renglonEscalaHtml(mesISO, pctTxt) {
  let meses = mesesEscala();
  if (mesISO && !meses.includes(mesISO)) meses = [mesISO, ...meses];   // preservar un mes guardado fuera de rango
  const opts = meses.map((m) => `<option value="${m}"${m === mesISO ? " selected" : ""}>${m.slice(5, 7)}/${m.slice(0, 4)}</option>`).join("");
  return `<div class="me-renglon"><select data-role="me-mes"><option value="">— mes —</option>${opts}</select>`
    + ` <input type="text" data-role="me-pct" class="me-pct" value="${esc(pctTxt)}" placeholder="8%" />`
    + ` <span class="me-x" title="quitar">✕</span></div>`;
}
function apMsg(txt) { const el = document.querySelector("[data-role=ap-msg]"); if (el) el.textContent = txt || ""; }
function resumenEscalaHtml(id) {
  const dets = DATA.escalasDet.get(id) || [];
  if (!dets.length) return "";
  return `<table class="ap-tabla"><thead><tr><th>Mes</th><th>% Aumento</th></tr></thead><tbody>`
    + dets.map((d) => `<tr><td>${String(d.mes).slice(5, 7)}/${String(d.mes).slice(0, 4)}</td><td class="ap-pct">${esc(pctDecToTxt(d.pct_aumento))}</td></tr>`).join("")
    + `</tbody></table>`;
}
function refrescarResumenAplicar() {
  const box = document.querySelector("[data-role=modal-box]");
  const eid = box.querySelector("[data-role=ap-escala]")?.value;
  const div = box.querySelector("[data-role=ap-resumen]");
  if (!div) return;
  if (!eid) { div.innerHTML = `<span class="rel-none">No hay escalas: creá una con el botón «Escalas».</span>`; return; }
  div.innerHTML = resumenEscalaHtml(eid) || `<span class="rel-none">(la escala no tiene renglones)</span>`;
}
// ---- Modal APLICAR (solo aplica, no crea) ----
function renderModalAplicar() {
  const box = document.querySelector("[data-role=modal-box]");
  const grupos = (DATA.grupos || []).filter((g) => g.activo !== false);   // incluir aunque activo venga null
  const escalas = (DATA.escalas || []).filter((x) => x.activa !== false);
  box.innerHTML = `<div class="me-title">Aplicar escala de aumento</div>`
    + `<label class="me-fila">Aplicar a: <select data-role="ap-target">`
    + grupos.map((g) => `<option value="${esc(g.id)}">${esc(g.nombre)} (${conteoGrupo(g.id)})</option>`).join("")
    + `<option value="__filtrados__">los clientes filtrados</option></select></label>`
    + `<label class="me-fila">Escala: <select data-role="ap-escala">`
    + (escalas.length ? escalas.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}${x.paritaria_id ? ` — ${esc(nombreParitaria(x.paritaria_id))}` : (x.paritaria ? ` — ${esc(x.paritaria)}` : "")}</option>`).join("") : `<option value="">(no hay escalas)</option>`)
    + `</select></label>`
    + `<div class="me-sub">Aumentos de la escala:</div>`
    + `<div class="ap-resumen" data-role="ap-resumen"></div>`
    + `<div class="me-acc"><button data-role="ap-aplicar">Aplicar</button><button data-role="ap-cerrar">Cerrar</button></div>`
    + `<div class="me-msg" data-role="ap-msg"></div>`;
  refrescarResumenAplicar();
}
function abrirModalAplicar() { renderModalAplicar(); document.querySelector("[data-role=modal-escala]").hidden = false; }
function cerrarModalAplicar() { document.querySelector("[data-role=modal-escala]").hidden = true; }

// ---- Modal ESCALAS (gestión pura: lista + editar/borrar + nueva) ----
function renderModalEscalas() {
  const box = document.querySelector("[data-role=modal-escalas-box]");
  const lista = (DATA.escalas || []).length
    ? `<table class="gm-table"><thead><tr><th>Nombre</th><th>Descripción</th><th>Paritaria</th><th class="gm-tramos">Tramos</th><th class="gm-acc"></th></tr></thead><tbody>`
      + (DATA.escalas || []).map((e) => {
          const pariFull = e.paritaria_id ? nombreParitaria(e.paritaria_id) : (e.paritaria || "");
          return `<tr><td class="gm-elip" title="${esc(e.nombre)}">${esc(e.nombre)}</td>`
            + `<td class="gm-desc" title="${esc(e.descripcion || "")}">${esc(e.descripcion || "")}</td>`
            + `<td class="gm-pari" title="${esc(pariFull)}">${esc(pariFull)}</td>`
            + `<td class="gm-tramos">${(DATA.escalasDet.get(e.id) || []).length}</td>`
            + `<td class="gm-acc"><button data-role="es-editar" data-eid="${esc(e.id)}">Editar</button>`
            + `<button data-role="es-borrar" data-eid="${esc(e.id)}">Borrar</button></td></tr>`;
        }).join("")
      + `</tbody></table>`
    : `<div class="me-sub">No hay escalas todavía.</div>`;
  box.innerHTML = `<div class="me-title">Escalas de aumento</div>`
    + lista
    + `<div class="me-acc"><button data-role="es-nueva">+ NUEVA ESCALA</button><button data-role="es-cerrar">Cerrar</button></div>`
    + `<div class="me-msg" data-role="me-msg"></div>`;
}
function renderFormEscala(escalaId) {
  const box = document.querySelector("[data-role=modal-escalas-box]");
  const e = (DATA.escalas || []).find((x) => x.id === escalaId);
  const nombre = e ? e.nombre : "", paritariaSel = e ? (e.paritaria_id || "") : "", descEsc = e ? (e.descripcion || "") : "";
  const dets = e ? (DATA.escalasDet.get(e.id) || []) : [];
  const renglones = dets.length ? dets.map((d) => ({ mes: String(d.mes).slice(0, 10), pct: pctDecToTxt(d.pct_aumento) })) : [{ mes: MES_CUR, pct: "" }];
  box.dataset.eid = escalaId || "";
  box.innerHTML = `<div class="me-title">${escalaId ? "Editar" : "Nueva"} escala</div>`
    + `<label class="me-fila">Paritaria: <select data-role="me-paritaria-id"><option value="">— elegí una paritaria —</option>`
    + (DATA.paritarias || []).map((p) => `<option value="${esc(p.id)}"${p.id === paritariaSel ? " selected" : ""}>${esc(p.codigo || "")} · ${esc(p.nombre)}</option>`).join("")
    + `</select></label>`
    + `<label class="me-fila">Nombre: <input type="text" data-role="me-nombre" value="${esc(nombre)}" placeholder="PARITARIA JUL-DIC 2026 - CONSORCIOS" /></label>`
    + `<label class="me-fila">Descripción: <input type="text" data-role="me-desc" value="${esc(descEsc)}" placeholder="(opcional)" /></label>`
    + `<div class="me-sub">Aumentos (mes + %):</div>`
    + `<div class="me-renglones" data-role="me-renglones">${renglones.map((r) => renglonEscalaHtml(r.mes, r.pct)).join("")}</div>`
    + `<button data-role="me-add-renglon">+ Agregar renglón</button>`
    + `<div class="me-sub" style="margin-top:14px">Texto de la nota:</div>`
    + `<div class="me-ayuda">Pegá el texto de la nota. Escribí <b>[TABLA]</b> en una línea sola donde va la tabla de aumentos. Los párrafos se separan con una línea en blanco.</div>`
    + btnInsertarTabla("me-insertar-tabla")
    + btnInsertarLink("me-insertar-link")
    + `<textarea data-role="me-texto" class="me-texto" rows="10" placeholder="Por medio de la presente le informamos…&#10;&#10;[TABLA]&#10;&#10;Ante cualquier consulta, quedamos a disposición.">${esc(e ? (e.texto_nota || "") : "")}</textarea>`
    + `<div class="me-acc"><button data-role="me-guardar">Guardar</button><button data-role="es-volver">Cancelar</button></div>`
    + `<div class="me-msg" data-role="me-msg"></div>`;
}
function abrirModalEscalas() { renderModalEscalas(); document.querySelector("[data-role=modal-escalas]").hidden = false; }
function cerrarModalEscalas() { document.querySelector("[data-role=modal-escalas]").hidden = true; }

async function borrarEscala(id) {
  const e = (DATA.escalas || []).find((x) => x.id === id);
  if (!await confirmar({ titulo: "Borrar escala", mensaje: `¿Borrar la escala <b>${esc(e ? e.nombre : "")}</b>?`, si: "Sí, borrar", no: "No", peligro: true })) return;
  try {
    const { error } = await supabase.from("escalas_aumento").delete().eq("id", id);   // cascade borra el detalle
    if (error) throw error;
    await cargarEscalas(); renderModalEscalas(); meMsg("Escala borrada.");
  } catch (err) { meMsg("No se pudo borrar la escala. " + humanizarError(err)); }
}

function leerRenglonesModal(box) {
  box = box || document.querySelector("[data-role=modal-escalas-box]");
  const out = [];
  box.querySelectorAll(".me-renglon").forEach((row) => {
    const mes = row.querySelector("[data-role=me-mes]").value;
    const dec = parsePct(row.querySelector("[data-role=me-pct]").value);
    if (mes && dec != null) out.push({ mes, pct: dec });
  });
  return out;
}

async function guardarEscala() {
  const box = document.querySelector("[data-role=modal-escalas-box]");
  const escalaId = box.dataset.eid || "";   // "" = nueva
  const nombre = box.querySelector("[data-role=me-nombre]").value.trim().toUpperCase();   // nombres de escala SIEMPRE en mayúscula
  const paritariaId = box.querySelector("[data-role=me-paritaria-id]").value || null;
  const descripcion = box.querySelector("[data-role=me-desc]").value.trim() || null;
  const textoNota = (box.querySelector("[data-role=me-texto]")?.value || "").trim() || null;
  const renglones = leerRenglonesModal();
  if (!nombre) { meMsg("Poné un nombre para la escala."); return; }
  if (!paritariaId) { meMsg("Elegí la paritaria a la que pertenece la escala."); return; }
  if (!renglones.length) { meMsg("Agregá al menos un renglón (mes + %)."); return; }
  // Chequeo de mes repetido ANTES de ir a la base (evita el error técnico de unique key).
  const meses = renglones.map((r) => r.mes);
  if (new Set(meses).size !== meses.length) { meMsg("No podés cargar dos aumentos para el mismo mes. Revisá los meses de la escala (hay uno repetido)."); return; }
  const faltaTabla = textoNota && !textoNota.split(/\r?\n/).some((l) => l.trim() === "[TABLA]");
  meMsg("Guardando…");
  try {
    let id = escalaId;
    if (id) {
      const { error } = await supabase.from("escalas_aumento").update({ nombre, descripcion, paritaria_id: paritariaId, texto_nota: textoNota }).eq("id", id);
      if (error) throw error;
      const { error: eDel } = await supabase.from("escalas_aumento_detalle").delete().eq("escala_id", id);
      if (eDel) throw eDel;
    } else {
      const { data, error } = await supabase.from("escalas_aumento").insert({ nombre, descripcion, paritaria_id: paritariaId, texto_nota: textoNota }).select("id").single();
      if (error) throw error;
      id = data.id;
    }
    const dets = renglones.map((r) => ({ escala_id: id, mes: r.mes, pct_aumento: r.pct }));
    const { error: e2 } = await supabase.from("escalas_aumento_detalle").insert(dets);
    if (e2) throw e2;
    await cargarEscalas();
    renderModalEscalas();   // vuelve a la lista
    meMsg(faltaTabla ? "Escala guardada. Ojo: el texto no tiene una línea [TABLA]; la tabla irá al final del texto." : "Escala guardada.");
  } catch (err) {
    meMsg(humanizarError(err, "escala"));
  }
}

async function aplicarEscalaDesdeModal() {
  const box = document.querySelector("[data-role=modal-box]");
  const eid = box.querySelector("[data-role=ap-escala]").value;
  if (!eid) { apMsg("Creá una escala primero con el botón «Escalas»."); return; }
  const target = box.querySelector("[data-role=ap-target]").value;
  const escala = (DATA.escalas || []).find((x) => x.id === eid);
  const renglones = (DATA.escalasDet.get(eid) || []).map((d) => ({ mes: String(d.mes).slice(0, 10), pct: Number(d.pct_aumento) }));
  if (!renglones.length) { apMsg("La escala no tiene renglones."); return; }

  let clientesF, etiqueta;
  if (target === "__filtrados__") {
    clientesF = clientesVisibles();
    etiqueta = filtrosActivos() > 0 ? "los clientes filtrados" : "todos los clientes";
  } else {
    // Filtrar la pantalla por ese grupo para que Juan VEA a quién se va a aplicar.
    filtros.clientes.clear(); filtros.industrias.clear(); filtros.coordinadores.clear(); filtros.coordTipo = ""; filtros.responsables.clear(); filtros.mes = [];
    filtros.grupos = new Set([target]);
    renderChips(); aplicarFiltros();
    const g = (DATA.grupos || []).find((x) => x.id === target);
    const miembros = new Set(clientesDeGrupo(target));
    clientesF = [...objetivosDeCliente.keys()].filter((cli) => miembros.has(cli));   // solo miembros con objetivos
    etiqueta = `grupo "${g ? g.nombre : ""}"`;
  }
  cerrarModalAplicar();   // así Juan ve la pantalla filtrada detrás de la confirmación
  const M = clientesF.length;
  const K = clientesF.reduce((a, cli) => a + (objetivosDeCliente.get(cli) || []).length, 0);
  if (!M) { alert("El destino no tiene clientes (con objetivos)."); return; }
  // Si cancela: queda el filtro puesto pero SIN aplicar.
  if (!await confirmar({ titulo: "Aplicar escala", mensaje: `Vas a aplicar la escala <b>${esc(escala.nombre)}</b> a ${esc(etiqueta)}: <b>${M}</b> clientes, <b>${K}</b> objetivos.`, si: "Sí, aplicar", no: "No" })) return;
  const rs = [...renglones].sort((a, b) => a.mes.localeCompare(b.mes));   // por mes: cada aumento sobre el anterior ya recalculado
  for (const cli of clientesF) {
    for (const r of rs) aplicarPctClienteCore(cli, r.mes, r.pct, escala.paritaria_id || null, eid);   // procedencia: paritaria de la escala + escala
    recomputarCliente(cli);
  }
  // Anotar la aplicación (se registra en la base al Guardar). Dedup por combinación.
  const nueva = {
    escala_id: eid,
    grupo_id: target === "__filtrados__" ? null : target,
    descripcion_filtro: target === "__filtrados__" ? describirFiltros() : null,
    clientes_ids: clientesF.slice(),
  };
  const keyAp = (a) => `${a.escala_id}|${a.grupo_id || ""}|${a.descripcion_filtro || ""}`;
  aplicacionesPendientes = aplicacionesPendientes.filter((a) => keyAp(a) !== keyAp(nueva));
  aplicacionesPendientes.push(nueva);
  actualizarContador(); actualizarStatus();
  mostrarMsgEdicion(`Escala "${escala.nombre}" aplicada a ${M} cliente(s) — revisá y guardá con "Guardar cambios".`);
}

function wireEscalas() {
  // --- Modal APLICAR ---
  document.querySelector("[data-role=aplicar-escala]")?.addEventListener("click", abrirModalAplicar);
  const modalAp = document.querySelector("[data-role=modal-escala]");
  const boxAp = document.querySelector("[data-role=modal-box]");
  modalAp?.addEventListener("click", (e) => { if (e.target === modalAp) cerrarModalAplicar(); });
  boxAp?.addEventListener("change", (e) => { if (e.target.dataset.role === "ap-escala") refrescarResumenAplicar(); });
  boxAp?.addEventListener("click", (e) => {
    const role = e.target.dataset.role;
    if (role === "ap-aplicar") aplicarEscalaDesdeModal();
    else if (role === "ap-cerrar") cerrarModalAplicar();
  });

  // --- Modal ESCALAS (gestión) ---
  document.querySelector("[data-role=escalas]")?.addEventListener("click", abrirModalEscalas);
  const modalEs = document.querySelector("[data-role=modal-escalas]");
  const boxEs = document.querySelector("[data-role=modal-escalas-box]");
  modalEs?.addEventListener("click", (e) => { if (e.target === modalEs) cerrarModalEscalas(); });
  boxEs?.addEventListener("click", (e) => {
    if (e.target.classList.contains("me-x")) { e.target.closest(".me-renglon")?.remove(); return; }
    const role = e.target.dataset.role;
    if (role === "es-nueva") renderFormEscala("");
    else if (role === "es-editar") renderFormEscala(e.target.dataset.eid);
    else if (role === "es-borrar") borrarEscala(e.target.dataset.eid);
    else if (role === "es-volver") renderModalEscalas();
    else if (role === "me-add-renglon") document.querySelector("[data-role=me-renglones]").insertAdjacentHTML("beforeend", renglonEscalaHtml(proximoMesEscala(), ""));
    else if (role === "me-insertar-tabla") insertarTablaEn(document.querySelector("[data-role=me-texto]"), meMsg);
    else if (role === "me-insertar-link") insertarLinkEn(document.querySelector("[data-role=me-texto]"), meMsg);
    else if (role === "me-guardar") guardarEscala();
    else if (role === "es-cerrar") cerrarModalEscalas();
  });
}

// ================= PARITARIAS =================
// La paritaria es la entidad de primer nivel (acuerdo informativo/histórico, con color y nota genérica).
// La escala cuelga de una paritaria y es el instrumento práctico de carga.
const PALETA_PARITARIAS = ["#4ade80", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#a3e635"];
function paMsg(txt) { const el = document.querySelector("[data-role=pa-msg]"); if (el) el.textContent = txt || ""; }

// Modal de gestión: lista + editar/borrar + nueva (réplica del de escalas).
function renderModalParitarias() {
  const box = document.querySelector("[data-role=modal-paritarias-box]");
  const lista = (DATA.paritarias || []).length
    ? `<table class="gm-table"><thead><tr><th class="gm-color"></th><th>Nombre</th><th>Descripción</th><th class="gm-tramos">Tramos</th><th class="gm-acc"></th></tr></thead><tbody>`
      + (DATA.paritarias || []).map((p) => `<tr>`
          + `<td class="gm-color"><span style="background:${esc(p.color || "#666")}"></span></td>`
          + `<td class="gm-elip" title="${esc(p.nombre)}">${esc(p.nombre)}</td>`
          + `<td class="gm-desc" title="${esc(p.descripcion || "")}">${esc(p.descripcion || "")}</td>`
          + `<td class="gm-tramos">${(DATA.paritariasDet.get(p.id) || []).length}</td>`
          + `<td class="gm-acc"><button data-role="pa-editar" data-pid="${esc(p.id)}">Editar</button>`
          + `<button data-role="pa-borrar" data-pid="${esc(p.id)}">Borrar</button></td></tr>`).join("")
      + `</tbody></table>`
    : `<div class="me-sub">No hay paritarias todavía.</div>`;
  box.innerHTML = `<div class="me-title">Paritarias</div>`
    + lista
    + `<div class="me-acc"><button data-role="pa-nueva">+ NUEVA PARITARIA</button><button data-role="pa-cerrar">Cerrar</button></div>`
    + `<div class="me-msg" data-role="pa-msg"></div>`;
}
function renderFormParitaria(pid) {
  const box = document.querySelector("[data-role=modal-paritarias-box]");
  const p = (DATA.paritarias || []).find((x) => x.id === pid);
  const nombre = p ? p.nombre : "", desc = p ? (p.descripcion || "") : "", color = p ? (p.color || "") : "";
  const dets = p ? (DATA.paritariasDet.get(p.id) || []) : [];
  const renglones = dets.map((d) => ({ mes: String(d.mes).slice(0, 10), pct: pctDecToTxt(d.pct_aumento) }));   // tramos: pueden ser cero
  const actaUrl = p ? (p.acta_url || "") : "";
  const homoNom = p ? (p.homologacion_nombre || "") : "", homoPath = p ? (p.homologacion_path || "") : "";
  const actaNom = p ? (p.acta_nombre || "") : "", actaPath = p ? (p.acta_path || "") : "";
  box.dataset.pid = pid || "";
  const swatches = PALETA_PARITARIAS.map((c) => `<span class="pa-swatch" data-color="${c}" style="display:inline-block;width:24px;height:24px;border-radius:4px;margin-right:6px;cursor:pointer;background:${c};border:2px solid ${c === color ? "#fff" : "transparent"};box-shadow:0 0 0 1px rgba(0,0,0,0.4)"></span>`).join("");
  box.innerHTML = `<div class="me-title">${pid ? "Editar" : "Nueva"} paritaria</div>`
    + (pid ? `<label class="me-fila">Código: <input type="text" data-role="pa-codigo" value="${esc(p ? (p.codigo || "") : "")}" readonly /></label>` : "")
    + `<label class="me-fila">Nombre: <input type="text" data-role="pa-nombre" value="${esc(nombre)}" placeholder="PARITARIA UPSRA 2026" /></label>`
    + `<label class="me-fila">Descripción: <input type="text" data-role="pa-desc" value="${esc(desc)}" placeholder="(opcional)" /></label>`
    + `<div class="me-fila">Color: <span data-role="pa-swatches">${swatches}</span><input type="hidden" data-role="pa-color" value="${esc(color)}" /></div>`
    + `<div class="me-sub">Tramos teóricos (mes + %):</div>`
    + `<div class="me-renglones" data-role="me-renglones">${renglones.map((r) => renglonEscalaHtml(r.mes, r.pct)).join("")}</div>`
    + `<button data-role="me-add-renglon">+ Agregar renglón</button>`
    + `<div class="me-sub" style="margin-top:14px">Nota genérica:</div>`
    + `<div class="me-ayuda">Texto por defecto de las notas de esta paritaria. Escribí <b>[TABLA]</b> en una línea sola donde va la tabla de aumentos.</div>`
    + btnInsertarTabla("pa-insertar-tabla")
    + btnInsertarLink("pa-insertar-link")
    + `<textarea data-role="pa-texto" class="me-texto" rows="8" placeholder="Por medio de la presente…&#10;&#10;[TABLA]&#10;&#10;Ante cualquier consulta, quedamos a disposición.">${esc(p ? (p.nota_generica || "") : "")}</textarea>`
    + `<div class="me-sub" style="margin-top:14px">Documentación respaldatoria:</div>`
    + `<label class="me-fila">URL del acta (UPSRA): <input type="url" data-role="pa-acta-url" value="${esc(actaUrl)}" placeholder="https://…" /></label>`
    + `<div class="me-ayuda">Link al acta en el sitio del sindicato (empieza con http:// o https://). No se adjunta: va como link en la nota.</div>`
    + docParitariaCtrl("Homologación (se adjunta al mail)", "pa-homolog-file", "pa-ver-homolog", homoNom, homoPath,
        "Subir uno nuevo no borra el anterior: queda como respaldo y la vigente pasa a ser la nueva. Las notas ya enviadas siguen apuntando a la que se mandó.")
    + docParitariaCtrl("Acta (respaldo interno, no se envía)", "pa-acta-file", "pa-ver-acta", actaNom, actaPath,
        "Copia interna por si el sitio de UPSRA cambia y el link muere. Subir uno nuevo no borra el anterior.")
    + `<div class="me-acc"><button data-role="pa-guardar">Guardar</button><button data-role="pa-volver">Cancelar</button></div>`
    + `<div class="me-msg" data-role="pa-msg"></div>`;
}
function abrirModalParitarias() { renderModalParitarias(); document.querySelector("[data-role=modal-paritarias]").hidden = false; }
function cerrarModalParitarias() { document.querySelector("[data-role=modal-paritarias]").hidden = true; }

async function borrarParitaria(id) {
  const p = (DATA.paritarias || []).find((x) => x.id === id);
  const nEsc = (DATA.escalas || []).filter((e) => e.paritaria_id === id).length;
  if (nEsc > 0) { paMsg(`No se puede borrar: tiene ${nEsc} escala(s) asociada(s). Borrá primero las escalas.`); return; }
  if (!await confirmar({ titulo: "Borrar paritaria", mensaje: `¿Borrar la paritaria <b>${esc(p ? `${p.codigo || ""} · ${p.nombre}` : "")}</b>?`, si: "Sí, borrar", no: "No", peligro: true })) return;
  try {
    const { error } = await supabase.from("paritarias").delete().eq("id", id);   // la base rechaza (restrict) si tiene escalas
    if (error) throw error;
    await cargarEscalas(); renderModalParitarias(); paMsg("Paritaria borrada.");
  } catch (err) {
    // Respaldo por si el chequeo en memoria no vio las escalas (restrict de la base).
    if (String(err && err.code) === "23503" || String((err && err.message) || "").toLowerCase().includes("foreign key"))
      paMsg("No se puede borrar: tiene escala(s) asociada(s). Borrá primero las escalas.");
    else paMsg("No se pudo borrar la paritaria. " + humanizarError(err));
  }
}

// Núcleo genérico: sube contenido (File o Blob) a finflow-docs con path ÚNICO + upsert:false → nunca pisa (inmutable).
// Reusado por paritarias (documentos) y por notas (logo/firma). Devuelve { path, nombre }.
async function subirDocStorage(carpeta, contenido, nombre, mime) {
  const safe = (String(nombre || "").replace(/[\\/:*?"<>|\r\n]/g, " ").trim().replace(/[^\w.\-]+/g, "_")) || "archivo";
  const path = `${carpeta}/${Date.now()}-${Math.floor(Math.random() * 1e6)}-${safe}`;
  const { error } = await supabase.storage.from("finflow-docs")
    .upload(path, contenido, { contentType: mime || "application/octet-stream", upsert: false });
  if (error) throw error;
  return { path, nombre };
}
// Wrapper de paritarias (mantiene la firma de siempre): documento de una paritaria por tipo.
async function subirDocParitaria(pid, tipo, file) {   // tipo: 'homologacion' | 'acta'
  return subirDocStorage(`paritarias/${pid}/${tipo}`, file, file.name, file.type || "application/octet-stream");
}
// Devuelve una imagen del membrete como data-URI para pdfmake. Si hay puntero en Storage la baja de ahí;
// si no (o si falla), cae al .txt local. `local:true` avisa que se usó el archivo local (no está en el deploy).
async function cargarImagenNota(path, txtFallbackUrl) {
  if (path) {
    try {
      const { data, error } = await supabase.storage.from("finflow-docs").download(path);
      if (error) throw error;
      const b64 = bytesToB64(new Uint8Array(await data.arrayBuffer()));
      return { src: `data:${data.type || "image/png"};base64,${b64}`, local: false };
    } catch (_) { /* falla la bajada → cae al .txt */ }
  }
  const r = await fetch(txtFallbackUrl);
  if (!r.ok) throw new Error(`No se encontró ${txtFallbackUrl.replace("../", "")} y no hay imagen en Storage. Migrá el logo/firma desde Configuración de notas.`);
  return { src: (await r.text()).trim(), local: true };
}
// Abre un documento privado con una signed URL de vida corta (bucket privado → descarga
// autenticada). La mecánica vive en shared/ver-doc.js desde que el CRM abre las mismas
// notas; acá queda solo a quién se le avisa si falla.
async function verDocParitaria(path) {
  await abrirDocStorage(supabase, path, (err) => paMsg("No se pudo abrir el documento. " + humanizarError(err)));
}
// Control de un documento (homologación / acta) en el form: nombre actual + link Ver + file input.
function docParitariaCtrl(label, fileRole, verRole, nombre, path, ayuda) {
  return `<div class="me-doc">`
    + `<div class="me-doc-label">${esc(label)}</div>`
    + (nombre
        ? `<div class="me-doc-actual">Actual: <b>${esc(nombre)}</b>${path ? ` <a href="#" data-role="${verRole}" data-path="${esc(path)}">Ver</a>` : ""}</div>`
        : `<div class="me-doc-actual me-doc-vacio">(sin documento cargado)</div>`)
    + `<label class="me-doc-file">${nombre ? "Reemplazar" : "Subir"} (PDF): <input type="file" accept="application/pdf" data-role="${fileRole}" /></label>`
    + `<div class="me-ayuda">${esc(ayuda)}</div></div>`;
}

async function guardarParitaria() {
  const box = document.querySelector("[data-role=modal-paritarias-box]");
  const pid = box.dataset.pid || "";   // "" = nueva
  const nombre = box.querySelector("[data-role=pa-nombre]").value.trim().toUpperCase();   // misma regla que escalas
  const descripcion = box.querySelector("[data-role=pa-desc]").value.trim() || null;
  const color = box.querySelector("[data-role=pa-color]").value.trim();
  const notaGen = (box.querySelector("[data-role=pa-texto]")?.value || "").trim() || null;
  const renglones = leerRenglonesModal(box);
  // Documentación respaldatoria
  const actaUrl = (box.querySelector("[data-role=pa-acta-url]")?.value || "").trim() || null;
  const homoFile = box.querySelector("[data-role=pa-homolog-file]")?.files?.[0] || null;
  const actaFile = box.querySelector("[data-role=pa-acta-file]")?.files?.[0] || null;
  if (!nombre) { paMsg("Poné un nombre para la paritaria."); return; }
  if (!color) { paMsg("Elegí un color para la paritaria."); return; }
  if (actaUrl && !/^https?:\/\//i.test(actaUrl)) { paMsg("La URL del acta tiene que empezar con http:// o https://."); return; }
  if (homoFile && homoFile.type !== "application/pdf") { paMsg("La homologación tiene que ser un PDF."); return; }
  if (actaFile && actaFile.type !== "application/pdf") { paMsg("El acta tiene que ser un PDF."); return; }
  const meses = renglones.map((r) => r.mes);
  if (new Set(meses).size !== meses.length) { paMsg("No podés cargar dos tramos para el mismo mes. Revisá los meses (hay uno repetido)."); return; }
  paMsg("Guardando…");

  // PASO 1 — fila base + tramos (no depende de archivos). Errores acá → "no se pudo guardar la paritaria".
  let id = pid;
  try {
    if (id) {
      const { error } = await supabase.from("paritarias").update({ nombre, descripcion, color, nota_generica: notaGen, acta_url: actaUrl }).eq("id", id);
      if (error) throw error;
      const { error: eDel } = await supabase.from("paritarias_detalle").delete().eq("paritaria_id", id);
      if (eDel) throw eDel;
    } else {
      const { data, error } = await supabase.from("paritarias").insert({ nombre, descripcion, color, nota_generica: notaGen, acta_url: actaUrl }).select("id").single();   // código lo pone el trigger
      if (error) throw error;
      id = data.id;
    }
    if (renglones.length) {
      const dets = renglones.map((r) => ({ paritaria_id: id, mes: r.mes, pct_aumento: r.pct }));
      const { error: e2 } = await supabase.from("paritarias_detalle").insert(dets);
      if (e2) throw e2;
    }
  } catch (err) { paMsg("No se pudo guardar la paritaria. " + humanizarError(err)); return; }

  // PASO 2 — archivos (necesitan el id). Se distingue "falló la subida" de "subió pero falló el update".
  const docUpd = {};
  try {
    if (homoFile) { const r = await subirDocParitaria(id, "homologacion", homoFile); docUpd.homologacion_path = r.path; docUpd.homologacion_nombre = r.nombre; }
    if (actaFile) { const r = await subirDocParitaria(id, "acta", actaFile); docUpd.acta_path = r.path; docUpd.acta_nombre = r.nombre; }
  } catch (err) {
    paMsg("El documento no se pudo subir. El documento vigente sigue siendo el anterior. Reintentá. " + humanizarError(err));
    return;   // no se hizo ningún update de punteros → el anterior queda intacto
  }
  if (Object.keys(docUpd).length) {
    try {
      const { error } = await supabase.from("paritarias").update(docUpd).eq("id", id);
      if (error) throw error;
    } catch (err) {
      paMsg("El archivo se subió pero no se pudo actualizar la paritaria. El documento vigente sigue siendo el anterior. Reintentá. " + humanizarError(err));
      return;   // el PDF quedó en Storage pero la fila sigue apuntando al anterior: se avisa explícito, no se da por buena
    }
  }

  await cargarEscalas();
  renderModalParitarias();   // vuelve a la lista
  paMsg("Paritaria guardada.");
}

function wireParitarias() {
  document.querySelector("[data-role=paritarias]")?.addEventListener("click", abrirModalParitarias);
  const modalPa = document.querySelector("[data-role=modal-paritarias]");
  const boxPa = document.querySelector("[data-role=modal-paritarias-box]");
  modalPa?.addEventListener("click", (e) => { if (e.target === modalPa) cerrarModalParitarias(); });
  boxPa?.addEventListener("click", (e) => {
    if (e.target.classList.contains("me-x")) { e.target.closest(".me-renglon")?.remove(); return; }
    if (e.target.classList.contains("pa-swatch")) {   // elegir color
      const c = e.target.dataset.color;
      boxPa.querySelector("[data-role=pa-color]").value = c;
      boxPa.querySelectorAll(".pa-swatch").forEach((s) => { s.style.border = "2px solid " + (s.dataset.color === c ? "#fff" : "transparent"); });
      return;
    }
    const role = e.target.dataset.role;
    if (role === "pa-nueva") renderFormParitaria("");
    else if (role === "pa-editar") renderFormParitaria(e.target.dataset.pid);
    else if (role === "pa-borrar") borrarParitaria(e.target.dataset.pid);
    else if (role === "pa-volver") renderModalParitarias();
    else if (role === "me-add-renglon") boxPa.querySelector("[data-role=me-renglones]").insertAdjacentHTML("beforeend", renglonEscalaHtml(proximoMesEscala(boxPa), ""));
    else if (role === "pa-insertar-tabla") insertarTablaEn(boxPa.querySelector("[data-role=pa-texto]"), paMsg);
    else if (role === "pa-insertar-link") insertarLinkEn(boxPa.querySelector("[data-role=pa-texto]"), paMsg);
    else if (role === "pa-ver-homolog" || role === "pa-ver-acta") { e.preventDefault(); verDocParitaria(e.target.dataset.path); }
    else if (role === "pa-guardar") guardarParitaria();
    else if (role === "pa-cerrar") cerrarModalParitarias();
  });
}

// ================= GRUPOS DE CLIENTES + RESPONSABLES DE NEGOCIACIÓN =================
// grupos_clientes.tipo discrimina: 'grupo' (aplica aumentos) vs 'responsable' (solo califica/filtra).
// El ABM se reusa parametrizado por `abmTipo`. La partición en cargarGrupos protege TODO lo que
// hoy lee DATA.grupos (dropdown de Aplicar escala, filtro Grupo, ABM, etc.) de ver responsables.
let grupoDeCliente = new Map();         // cliente_id -> grupo_id ("" si sin grupo)
let responsableDeCliente = new Map();   // cliente_id -> responsable_id ("")
let modoArmarGrupo = false;
let abmTipo = "grupo";                  // 'grupo' | 'responsable' — contexto del ABM (default SEGURO)
const CFG_ABM = {
  grupo:       { data: () => DATA.grupos,       campo: "grupo_id",       mapa: () => grupoDeCliente,       filtros: "grupos",       nuevoLbl: "+ NUEVO GRUPO",       titulo: "Grupos de clientes",           armar: "Armar grupo",       nuevaFrase: "grupo" },
  responsable: { data: () => DATA.responsables, campo: "responsable_id", mapa: () => responsableDeCliente, filtros: "responsables", nuevoLbl: "+ NUEVO RESPONSABLE", titulo: "Responsables de negociación", armar: "Armar responsable", nuevaFrase: "responsable" },
};
const cfgAbm = () => CFG_ABM[abmTipo] || CFG_ABM.grupo;

async function cargarGrupos() {
  try {
    const todos = (await fetchAllRows("grupos_clientes", "id, nombre, descripcion, color, activo, tipo"))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    DATA.grupos = todos.filter((g) => g.tipo === "grupo");             // POSITIVO: un tipo futuro no se cuela en aumentos
    DATA.responsables = todos.filter((g) => g.tipo === "responsable");
  } catch (e) {
    DATA.grupos = []; DATA.responsables = [];
    console.warn("No se pudieron cargar grupos/responsables:", e.message ?? e);
  }
  grupoDeCliente = new Map((DATA.clientes || []).map((c) => [c.id, c.grupo_id || ""]));
  responsableDeCliente = new Map((DATA.clientes || []).map((c) => [c.id, c.responsable_id || ""]));
  FILTROS_OPC.grupos = (DATA.grupos || []).map((g) => ({ id: g.id, nombre: g.nombre, color: g.color || null }));
  FILTROS_OPC.responsables = (DATA.responsables || []).map((g) => ({ id: g.id, nombre: g.nombre, color: g.color || null }));
}
const nombreGrupo = (gid) => { const g = (DATA.grupos || []).find((x) => x.id === gid); return g ? g.nombre : ""; };
const nombreResponsable = (rid) => { const g = (DATA.responsables || []).find((x) => x.id === rid); return g ? g.nombre : ""; };
// item del ABM por id (grupo o responsable): para color/edición que sirven a ambos tipos.
const itemAbm = (gid) => (DATA.grupos || []).find((x) => x.id === gid) || (DATA.responsables || []).find((x) => x.id === gid);
// color del grupo (sanitizado a hex; null si no tiene o es inválido) — SOLO grupos (columna de la grilla).
const colorGrupo = (gid) => { const g = (DATA.grupos || []).find((x) => x.id === gid); const c = g && g.color; return (typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : null; };
const colorResponsable = (rid) => { const g = (DATA.responsables || []).find((x) => x.id === rid); const c = g && g.color; return (typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : null; };

// ================= COLUMNA "NOTA" — estado de la nota de aumento por CLIENTE =================
// El cuadro de aplicaciones muestra el estado por escala/paritaria y no baja a cliente.
// Esto es SOLO LECTURA de notas_emitidas: no crea ni modifica nada.
let notaPariSel = "";                 // paritaria elegida en el encabezado de la columna
let notasPorCliente = new Map();      // cliente_id -> fila ganadora de la paritaria elegida
let notasOK = false;                  // false = no hay dato utilizable -> la columna no se dibuja
const notasCache = new Map();         // paritaria_id -> Map(cliente_id -> fila) ya resuelto

// Un cliente puede tener DOS filas en la misma paritaria: una por escala y una virtual
// (escala_id null). El unique de la tabla es por origen_id = coalesce(escala_id,
// paritaria_id), así que la base acepta las dos. Para esta columna es UN estado.
// Misma convención que crm_generar_casos (abm_42): gana la ya ENVIADA.
// Leerlo mal le mostraría "Generada" a un cliente al que la nota ya le salió.
function mejorNota(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ea = a.fecha_enviada || "", eb = b.fecha_enviada || "";
  if (ea !== eb) return ea > eb ? a : b;   // "" (sin enviar) pierde contra cualquier fecha = nulls last
  return (a.fecha_generada || "") >= (b.fecha_generada || "") ? a : b;
}

// Una sola consulta por paritaria, cacheada. Sin try/catch a propósito: si falla,
// el error sube al llamador y la caché NO queda envenenada con un resultado a medias.
async function cargarNotas(pid) {
  if (!pid) return new Map();
  if (notasCache.has(pid)) return notasCache.get(pid);
  const filas = await fetchAllRows("notas_emitidas", "cliente_id, fecha_generada, fecha_enviada, pdf_path",
    (q) => q.eq("paritaria_id", pid));
  const m = new Map();
  for (const r of filas) m.set(r.cliente_id, mejorNota(m.get(r.cliente_id), r));
  notasCache.set(pid, m);
  return m;
}

// "Vigente" = la paritaria de la NOTA más reciente. No hay campo que lo diga, y el
// criterio tiene que mirar NOTAS y no precios: con paritarias cargadas por adelantado,
// la del último aumento saltaría a una futura donde todavía no se mandó nada.
// updated_at (y no fecha_generada) porque lo pisan tanto la generación como el marcado
// de enviadas: es "la última nota tocada".
async function paritariaVigente() {
  const existe = (pid) => (DATA.paritarias || []).some((p) => p.id === pid);
  try {
    const { data, error } = await supabase.from("notas_emitidas")
      .select("paritaria_id, updated_at").order("updated_at", { ascending: false }).limit(5);
    if (error) throw error;
    // limit 5 y no 1: si la más reciente apunta a una paritaria borrada, sigue la que le sigue.
    for (const r of (data || [])) if (r.paritaria_id && existe(r.paritaria_id)) return r.paritaria_id;
  } catch (e) { console.warn("Nota: no se pudo leer la última nota emitida.", e.message ?? e); }
  // Respaldo 1 (no hay notas todavía): la paritaria con el mes de aumento más reciente.
  let mejor = "", mejorMes = "";
  for (const [pid, dets] of (DATA.paritariasDet || new Map())) {
    const ult = dets.length ? String(dets[dets.length - 1].mes) : "";   // cargarEscalas ya los ordenó por mes
    if (ult > mejorMes && existe(pid)) { mejorMes = ult; mejor = pid; }
  }
  // Respaldo 2: la primera por código, para no arrancar con el selector en blanco.
  return mejor || (DATA.paritarias || [])[0]?.id || "";
}

// Generar notas y marcar enviadas escriben notas_emitidas desde ESTA pantalla (son los
// dos únicos puntos de escritura del sistema: el CRM solo lee). Sin invalidar, el flujo
// normal —generar, marcar enviada, mirar la columna— seguiría mostrando "Generada" y se
// leería como que el marcado falló.
// NUNCA lanza: se la llama después de que la escritura ya se aplicó en la base, y un
// error de refresco no puede hacer fracasar una operación que salió bien.
async function invalidarNotas(pid) {
  if (pid) notasCache.delete(pid); else notasCache.clear();   // sin paritaria conocida → se tira todo
  if (!notasOK || !notaPariSel) return;
  if (pid && pid !== notaPariSel) return;   // se escribió otra paritaria: alcanza con haber limpiado la caché
  try {
    notasPorCliente = await cargarNotas(notaPariSel);
    repintarColumnaNota();
  } catch (e) { console.warn("No se pudo refrescar la columna Nota.", e.message ?? e); }
}

// Colores del cartucho. Verde = ya salió; ámbar = generada pero sin enviar (falta un
// acto humano). Mismo criterio de semáforo que el cuadro de aplicaciones.
const CHIP_NOTA_ENV = "#22c55e", CHIP_NOTA_GEN = "#f59e0b";
// Estado de la nota de un cliente, con su rótulo. Es la MISMA regla que aplican chipNota
// y tituloNota (enviada gana sobre generada): si cambia el criterio, cambian los tres.
// Lo usa el filtro de la columna Nota.
const NOTA_ESTADOS = { enviada: "Enviada", generada: "Generada, sin enviar", ninguna: "Sin nota" };
function estadoNota(cli) {
  const r = notasPorCliente.get(cli);
  if (r && r.fecha_enviada) return "enviada";
  if (r && r.fecha_generada) return "generada";
  return "ninguna";
}

// Los tres estados son EXCLUYENTES y los tres se escriben: "sin nota" va con guión
// gris, nunca celda en blanco (se leería como que el dato no cargó).
function chipNota(r, cli) {
  if (!r || (!r.fecha_enviada && !r.fecha_generada)) return `<span class="nota-sin">—</span>`;
  const chip = r.fecha_enviada
    ? chipEtq(`Enviada ${fmtDDMM(r.fecha_enviada)}`, CHIP_NOTA_ENV)
    : chipEtq(`Generada ${fmtDDMM(r.fecha_generada)}`, CHIP_NOTA_GEN);
  // Sin PDF guardado el cartucho queda igual que siempre: sin ícono y sin poder clickearse.
  // Es lo normal en las notas viejas, generadas antes de que el sistema guardara el archivo:
  // no hay nada que abrir, así que tampoco hay nada que avisar.
  if (!r.pdf_path) return chip;
  // El 📄 es la señal de que se puede abrir; el área clickeable es la CELDA entera, para no
  // obligar a apuntarle a un ícono de diez píxeles.
  // El ícono va fuera del cartucho y lo posiciona el CSS contra el borde derecho de la
  // columna: metido adentro ensanchaba el cartucho y los dejaba de distinto ancho según la
  // nota tuviera archivo o no.
  return `<span class="nota-ver" data-role="ver-nota" data-cli="${esc(cli)}" title="Ver la nota (PDF)">${chip}<span class="nota-pdf">📄</span></span>`;
}
// El cartucho muestra día/mes; el tooltip, la fecha y hora completas.
function tituloNota(r) {
  if (!r || (!r.fecha_enviada && !r.fecha_generada)) return "Sin nota en esta paritaria";
  return r.fecha_enviada
    ? `Enviada el ${fmtFechaHora(r.fecha_enviada)}`
    : `Generada el ${fmtFechaHora(r.fecha_generada)} — todavía NO enviada`;
}
// Selector de paritaria del encabezado. El thead se reconstruye en cada render, así que
// el valor elegido vive en notaPariSel y se re-marca acá; el listener va delegado.
function selectorNotaHtml() {
  if (!notasOK) return "";
  const ops = (DATA.paritarias || []).slice().reverse()   // más nuevas arriba (vienen ordenadas por código)
    .map((p) => `<option value="${esc(p.id)}"${p.id === notaPariSel ? " selected" : ""}>${esc(p.codigo || p.nombre)}</option>`).join("");
  return `<select class="nota-sel" data-role="nota-pari" title="Paritaria de la nota">${ops}</select>`;
}
// Repintado por celda (sin re-render): cambiar de paritaria no debe perder el scroll
// ni las filas expandidas. Mismo patrón que pintarGrupoCliente.
function pintarNotaCliente(cli) {
  const td = document.querySelector(`tr.rel-cliente[data-cliente="${cli}"] td.col-nota`);
  if (!td) return;
  const r = notasPorCliente.get(cli);
  td.innerHTML = chipNota(r, cli);
  td.title = tituloNota(r);
}
// Abre el PDF de la nota de un cliente (columna Nota). El puntero sale del mismo mapa que
// pinta el cartucho, así que lo que se abre es SIEMPRE la nota que se está viendo.
// Si falla, el aviso va a la línea de estado: es el único lugar visible de esta pantalla que
// no obliga a abrir un modal para dar una noticia de una línea.
async function verNotaCliente(cli) {
  const r = notasPorCliente.get(cli);
  if (!r?.pdf_path) return;   // sin archivo no hay nada que abrir (no debería llegar acá: sin pdf_path no se pinta el ícono)
  await abrirDocStorage(supabase, r.pdf_path, (err) => {
    const st = document.querySelector("[data-role=status]");
    if (st) st.textContent = "No se pudo abrir la nota. " + humanizarError(err);
  });
}
function repintarColumnaNota() {
  document.querySelectorAll("tr.rel-cliente").forEach((tr) => pintarNotaCliente(tr.dataset.cliente));
  // Cambiar de paritaria cambia el estado de cada nota, así que si se está filtrando por
  // ese estado hay que rehacer el filtro. Sin esto quedarían a la vista clientes que ya no
  // cumplen: la grilla mostraría "los que faltan" de la paritaria ANTERIOR.
  if (filtros.nota.size) aplicarFiltros();
}

// Punto de entrada del arranque. Si algo falla, la columna se apaga y la grilla se
// pinta igual: el padrón es lo que Comercial usa todos los días.
async function cargarColumnaNota() {
  try {
    notaPariSel = await paritariaVigente();
    if (!notaPariSel) { notasOK = false; return; }   // sin paritarias no hay nada que mostrar
    notasPorCliente = await cargarNotas(notaPariSel);
    notasOK = true;
  } catch (e) {
    notasOK = false;
    notasPorCliente = new Map();
    ocultas.nota = true;   // OJO: solo en memoria. Nada de guardarVista() acá: dejaría la
                           // columna escondida para siempre en esta PC aunque mañana funcione.
    console.warn("No se pudo leer notas_emitidas; la columna Nota queda oculta.", e.message ?? e);
  }
}

// ---- Paleta de colores desplegable propia (reemplaza el input type=color nativo) ----
const PALETA_GRUPOS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c",
  "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#7c3aed",
];
// Cuadradito clickeable que muestra el color actual (o rayado si no tiene). Abre la paleta.
const swatchAnchor = (color, extraAttrs = "") => {
  const ok = color && /^#[0-9a-fA-F]{6}$/.test(color);
  const bg = ok ? color : "repeating-linear-gradient(45deg,#3a3a3a,#3a3a3a 3px,#555 3px,#555 6px)";
  return `<span class="cp-anchor" title="Elegir color" ${extraAttrs} style="display:inline-block;width:20px;height:20px;border-radius:4px;cursor:pointer;vertical-align:middle;border:1px solid rgba(255,255,255,0.5);background:${bg}"></span>`;
};
let _paletaOnPick = null;
function abrirPaleta(anchor, colorActual, onPick) {
  const pop = document.querySelector("[data-role=color-pop]");
  if (!pop) return;
  _paletaOnPick = onPick;
  const grid = PALETA_GRUPOS.map((c) => `<span class="cp-sw" data-color="${c}" title="${c}" style="background:${c};border:2px solid ${c === colorActual ? "#fff" : "transparent"}"></span>`).join("");
  pop.innerHTML = `<div class="cp-grid">${grid}</div>`
    + `<div class="cp-acc"><button type="button" data-role="cp-sincolor">Sin color</button><button type="button" data-role="cp-otro">Otro…</button></div>`;
  const r = anchor.getBoundingClientRect();
  pop.hidden = false;   // mostrar antes de medir para posicionar sin tapar
  const top = (r.bottom + 4 + pop.offsetHeight > window.innerHeight) ? (r.top - pop.offsetHeight - 4) : (r.bottom + 4);
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + "px";
  pop.style.top = Math.max(8, top) + "px";
}
function cerrarPaleta() { const pop = document.querySelector("[data-role=color-pop]"); if (pop) pop.hidden = true; _paletaOnPick = null; }
function wireColorPop() {
  const pop = document.querySelector("[data-role=color-pop]");
  if (!pop) return;
  pop.addEventListener("click", (e) => {
    const sw = e.target.closest(".cp-sw");
    const cb = _paletaOnPick;
    if (sw) { cerrarPaleta(); cb && cb(sw.dataset.color); return; }
    const role = e.target.dataset.role;
    if (role === "cp-sincolor") { cerrarPaleta(); cb && cb(null); return; }
    if (role === "cp-otro") {   // color libre: input nativo temporal
      const inp = document.createElement("input"); inp.type = "color"; inp.value = "#3b82f6";
      inp.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(inp);
      inp.addEventListener("change", () => { const v = inp.value; inp.remove(); cerrarPaleta(); cb && cb(v); }, { once: true });
      inp.click();
      return;
    }
  });
  document.addEventListener("click", (e) => {
    if (pop.hidden) return;
    if (e.target.closest("[data-role=color-pop]") || e.target.closest(".cp-anchor")) return;   // no cerrar al abrir/usar
    cerrarPaleta();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) cerrarPaleta(); });
}
const clientesDeGrupo = (gid) => (DATA.clientes || []).filter((c) => c.grupo_id === gid).map((c) => c.id);
const conteoGrupo = (gid) => (DATA.clientes || []).filter((c) => c.grupo_id === gid).length;
const conteoAbm = (gid) => { const campo = cfgAbm().campo; return (DATA.clientes || []).filter((c) => c[campo] === gid).length; };
const cap1 = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

function mgMsg(txt) { const el = document.querySelector("[data-role=mg-msg]"); if (el) el.textContent = txt || ""; }
// Modal SIMPLE parametrizado por abmTipo: lista (nombre + N clientes + color + borrar) + NUEVO.
function renderModalGrupo() {
  const box = document.querySelector("[data-role=modal-grupo-box]");
  const cfg = cfgAbm();
  const lista = cfg.data() || [];
  const filas = lista.length
    ? lista.map((g) =>
        `<div class="mg-item"><span class="mg-item-nom">${esc(g.nombre)}</span>`
          + `<span class="mg-item-n">${conteoAbm(g.id)} clientes</span>`
          + `<span class="mg-swatches">${swatchAnchor(g.color, `data-gid="${esc(g.id)}" data-role="mg-color-sw"`)}</span>`
          + `<button data-role="mg-borrar" data-gid="${esc(g.id)}">Borrar</button></div>`).join("")
    : `<div class="me-sub">No hay ${cfg.nuevaFrase}s todavía.</div>`;
  box.innerHTML = `<div class="me-title">${esc(cfg.titulo)}</div>`
    + `<div class="mg-lista-grupos">${filas}</div>`
    + `<div class="me-acc"><button data-role="mg-nuevo">${cfg.nuevoLbl}</button><button data-role="mg-cerrar">Cerrar</button></div>`
    + `<div class="me-msg" data-role="mg-msg"></div>`;
}
async function setColorGrupo(gid, color) {   // color = hex o null (sin color). Sirve a grupos Y responsables.
  const g = itemAbm(gid); if (!g) return;
  try {
    const { error } = await supabase.from("grupos_clientes").update({ color }).eq("id", gid);
    if (error) throw error;
    g.color = color;
    for (const arr of [FILTROS_OPC.grupos, FILTROS_OPC.responsables]) { const fo = (arr || []).find((x) => x.id === gid); if (fo) fo.color = color; }
    document.querySelectorAll("tr.rel-cliente").forEach((tr) => { pintarGrupoCliente(tr.dataset.cliente); pintarResponsableCliente(tr.dataset.cliente); });   // repinta ambas columnas
    renderModalGrupo();
  } catch (err) { mgMsg("No se pudo cambiar el color. " + humanizarError(err)); }
}
function abrirModalGrupo(tipo) {
  abmTipo = (tipo === "responsable") ? "responsable" : "grupo";
  renderModalGrupo();
  document.querySelector("[data-role=modal-grupo]").hidden = false;
}
function cerrarModalGrupo() { document.querySelector("[data-role=modal-grupo]").hidden = true; }

async function borrarGrupo(gid) {
  const cfg = cfgAbm();
  const g = itemAbm(gid);
  if (!await confirmar({ titulo: `Borrar ${cfg.nuevaFrase}`, mensaje: `¿Borrar el ${cfg.nuevaFrase} <b>${esc(g ? g.nombre : "")}</b>?<br><br>Los clientes quedan sin ${cfg.nuevaFrase} (no se borran).`, si: "Sí, borrar", no: "No", peligro: true })) return;
  try {
    const { error } = await supabase.from("grupos_clientes").delete().eq("id", gid);   // FK on delete set null en clientes
    if (error) throw error;
    for (const c of DATA.clientes || []) if (c[cfg.campo] === gid) c[cfg.campo] = null;
    await cargarGrupos();
    document.querySelectorAll("tr.rel-cliente").forEach((tr) => { pintarGrupoCliente(tr.dataset.cliente); pintarResponsableCliente(tr.dataset.cliente); });
    renderModalGrupo(); mgMsg(`${cap1(cfg.nuevaFrase)} borrado.`);
  } catch (err) { mgMsg(`No se pudo borrar el ${cfg.nuevaFrase}. ` + humanizarError(err)); }
}

// ---- MODO ARMAR GRUPO (desde la pantalla principal) ----
function entrarModoArmarGrupo() {
  cerrarModalGrupo();
  modoArmarGrupo = true;
  const cfg = cfgAbm();
  // Limpiar filtros del usuario: así se ven TODOS los clientes sin esa etiqueta (Juan filtra desde cero).
  filtros.clientes.clear(); filtros.industrias.clear(); filtros.coordinadores.clear(); filtros.coordTipo = ""; filtros.grupos.clear(); filtros.responsables.clear(); filtros.mes = [];
  renderChips();
  document.querySelectorAll(".chk-grupo").forEach((c) => { c.checked = false; });
  const bar = document.querySelector("[data-role=armar-bar]");
  if (bar) {
    bar.hidden = false;
    const tit = bar.querySelector("[data-role=ag-titulo]"); if (tit) tit.textContent = cfg.armar + ":";
    const btn = bar.querySelector("[data-role=ag-crear]"); if (btn) btn.textContent = "Crear " + cfg.nuevaFrase;
    const inp = bar.querySelector("[data-role=ag-nombre]"); if (inp) inp.value = "";
    const ci = bar.querySelector("[data-role=ag-color]"); if (ci) ci.value = "";   // sin color por defecto
    const sw = bar.querySelector("[data-role=ag-color-sw]"); if (sw) sw.style.background = "repeating-linear-gradient(45deg,#3a3a3a,#3a3a3a 3px,#555 3px,#555 6px)";
  }
  aplicarFiltros();               // muestra SOLO clientes sin esa etiqueta (grupo o responsable)
  actualizarArmarInfo();
}
function salirModoArmarGrupo() {
  modoArmarGrupo = false;
  const bar = document.querySelector("[data-role=armar-bar]"); if (bar) bar.hidden = true;
  document.querySelectorAll(".chk-grupo").forEach((c) => { c.checked = false; });
  aplicarFiltros();
}
function clientesTildadosArmar() {
  return [...document.querySelectorAll("tr.rel-cliente:not([hidden]) .chk-grupo:checked")].map((c) => c.dataset.cli);
}
function seleccionarTodosArmar(val) {
  document.querySelectorAll("tr.rel-cliente:not([hidden]) .chk-grupo").forEach((c) => { c.checked = val; });
  actualizarArmarInfo();
}
function actualizarArmarInfo() {
  const el = document.querySelector("[data-role=ag-info]");
  if (el) el.textContent = `${clientesTildadosArmar().length} seleccionados`;
}
async function crearGrupo() {
  // DEFENSA: nunca insertar apoyándose en el default de la DB. abmTipo TIENE que ser un tipo válido.
  if (abmTipo !== "grupo" && abmTipo !== "responsable") {
    alert(`Error interno: tipo de ABM inválido ("${abmTipo}"). No se creó nada. Reabrí el modal de Grupos o Responsables.`);
    return;
  }
  const tipo = abmTipo;                 // 'grupo' | 'responsable' — SIEMPRE explícito en el INSERT
  const cfg = cfgAbm();
  const campo = cfg.campo;              // 'grupo_id' | 'responsable_id'
  const bar = document.querySelector("[data-role=armar-bar]");
  const nombre = bar.querySelector("[data-role=ag-nombre]").value.trim().toUpperCase();   // nombres SIEMPRE en mayúscula
  const cids = clientesTildadosArmar();
  if (!nombre) { alert(`Poné un nombre para el ${cfg.nuevaFrase}.`); return; }
  if (!cids.length) { alert("Seleccioná al menos un cliente."); return; }
  if (!await confirmar({ titulo: `Crear ${cfg.nuevaFrase}`, mensaje: `¿Crear el ${cfg.nuevaFrase} <b>${esc(nombre)}</b> con <b>${cids.length}</b> cliente(s)?`, si: "Sí, crear", no: "No" })) return;
  const color = document.querySelector("[data-role=ag-color]")?.value || null;   // color opcional elegido en la barra
  try {
    const { data, error } = await supabase.from("grupos_clientes").insert({ nombre, color, tipo }).select("id").single();
    if (error) throw error;
    const gid = data.id;
    const { error: e2 } = await supabase.from("clientes").update({ [campo]: gid }).in("id", cids);
    if (e2) throw e2;
    for (const c of DATA.clientes || []) if (cids.includes(c.id)) c[campo] = gid;
    await cargarGrupos();   // reconstruye DATA.grupos/responsables + los mapas grupoDeCliente/responsableDeCliente
    const repintar = (tipo === "grupo") ? pintarGrupoCliente : pintarResponsableCliente;   // repinta la columna del tipo creado
    cids.forEach((cli) => repintar(cli));
    salirModoArmarGrupo();
    mostrarMsgEdicion(`${cap1(cfg.nuevaFrase)} "${nombre}" creado con ${cids.length} cliente(s).`);
  } catch (err) { alert(`No se pudo crear el ${cfg.nuevaFrase}. ` + humanizarError(err)); }
}

// ---- columna GRUPO editable (cambio directo en la base, con confirmación) ----
function pintarGrupoCliente(cli) {
  const gid = grupoDeCliente.get(cli) || "";
  const tr = document.querySelector(`tr.rel-cliente[data-cliente="${cli}"]`);
  if (tr) {
    tr.dataset.grupo = gid;
    const td = tr.querySelector("td.col-grupo");
    if (td) {
      const nom = gid ? nombreGrupo(gid) : "";
      td.innerHTML = chipEtq(nom, gid ? colorGrupo(gid) : null);
      td.title = nom || "(sin grupo)";
    }
  }
  document.querySelectorAll(`tr.rel-obj[data-obj-de="${cli}"]`).forEach((r) => { r.dataset.grupo = gid; });
}
function editarGrupoCliente(td) {
  if (td.querySelector("select")) return;
  const tr = td.closest("tr.rel-cliente");
  const cli = tr.dataset.cliente;
  const cur = grupoDeCliente.get(cli) || "";
  const sel = document.createElement("select");
  sel.innerHTML = `<option value="">(sin grupo)</option>`
    + (DATA.grupos || []).map((g) => `<option value="${esc(g.id)}"${g.id === cur ? " selected" : ""}>${esc(g.nombre)}</option>`).join("");
  td.textContent = ""; td.appendChild(sel); sel.focus();
  let done = false;
  sel.addEventListener("change", async () => {
    done = true;
    const nuevo = sel.value || null;
    const nomCli = tr.querySelector(".col-obj")?.title || "";
    const nomNuevo = nuevo ? nombreGrupo(nuevo) : "(sin grupo)";
    if (!await confirmar({ titulo: "Cambiar grupo del cliente", mensaje: `¿Cambiar el grupo de <b>${esc(nomCli)}</b> a <b>${esc(nomNuevo)}</b>?<br><br>Es un cambio directo de configuración (se guarda en la base).`, si: "Sí, cambiar", no: "No" })) { pintarGrupoCliente(cli); return; }
    try {
      const { error } = await supabase.from("clientes").update({ grupo_id: nuevo }).eq("id", cli);
      if (error) throw error;
      const c = (DATA.clientes || []).find((x) => x.id === cli); if (c) c.grupo_id = nuevo;
      grupoDeCliente.set(cli, nuevo || "");
      pintarGrupoCliente(cli);
    } catch (err) { alert("No se pudo cambiar el grupo del cliente. " + humanizarError(err)); pintarGrupoCliente(cli); }
  });
  sel.addEventListener("blur", () => { if (!done) pintarGrupoCliente(cli); });
}

// ---- columna RESP. NEG. editable (espejo de la de Grupo, sobre clientes.responsable_id) ----
function pintarResponsableCliente(cli) {
  const rid = responsableDeCliente.get(cli) || "";
  const tr = document.querySelector(`tr.rel-cliente[data-cliente="${cli}"]`);
  if (tr) {
    tr.dataset.resp = rid;
    const td = tr.querySelector("td.col-resp");
    if (td) {
      const nom = rid ? nombreResponsable(rid) : "";
      td.innerHTML = chipEtq(nom, rid ? colorResponsable(rid) : null);
      td.title = nom || "(sin responsable)";
    }
  }
  document.querySelectorAll(`tr.rel-obj[data-obj-de="${cli}"]`).forEach((r) => { r.dataset.resp = rid; });
}
function editarResponsableCliente(td) {
  if (td.querySelector("select")) return;
  const tr = td.closest("tr.rel-cliente");
  const cli = tr.dataset.cliente;
  const cur = responsableDeCliente.get(cli) || "";
  const sel = document.createElement("select");
  sel.innerHTML = `<option value="">(sin responsable)</option>`
    + (DATA.responsables || []).map((g) => `<option value="${esc(g.id)}"${g.id === cur ? " selected" : ""}>${esc(g.nombre)}</option>`).join("");
  td.textContent = ""; td.appendChild(sel); sel.focus();
  let done = false;
  sel.addEventListener("change", async () => {
    done = true;
    const nuevo = sel.value || null;
    const nomCli = tr.querySelector(".col-obj")?.title || "";
    const nomNuevo = nuevo ? nombreResponsable(nuevo) : "(sin responsable)";
    if (!await confirmar({ titulo: "Cambiar responsable del cliente", mensaje: `¿Cambiar el responsable de negociación de <b>${esc(nomCli)}</b> a <b>${esc(nomNuevo)}</b>?<br><br>Es un cambio directo de configuración (se guarda en la base).`, si: "Sí, cambiar", no: "No" })) { pintarResponsableCliente(cli); return; }
    try {
      const { error } = await supabase.from("clientes").update({ responsable_id: nuevo }).eq("id", cli);
      if (error) throw error;
      const c = (DATA.clientes || []).find((x) => x.id === cli); if (c) c.responsable_id = nuevo;
      responsableDeCliente.set(cli, nuevo || "");
      pintarResponsableCliente(cli);
    } catch (err) { alert("No se pudo cambiar el responsable del cliente. " + humanizarError(err)); pintarResponsableCliente(cli); }
  });
  sel.addEventListener("blur", () => { if (!done) pintarResponsableCliente(cli); });
}

function wireGrupos() {
  document.querySelector("[data-role=grupos]")?.addEventListener("click", () => abrirModalGrupo("grupo"));
  document.querySelector("[data-role=responsables]")?.addEventListener("click", () => abrirModalGrupo("responsable"));
  const modal = document.querySelector("[data-role=modal-grupo]");
  const box = document.querySelector("[data-role=modal-grupo-box]");
  modal?.addEventListener("click", (e) => { if (e.target === modal) cerrarModalGrupo(); });
  box?.addEventListener("click", (e) => {
    const swMod = e.target.closest("[data-role=mg-color-sw]");   // cuadradito de color → paleta propia
    if (swMod) {
      const gid = swMod.dataset.gid;
      abrirPaleta(swMod, itemAbm(gid)?.color || "", (color) => setColorGrupo(gid, color));   // grupo o responsable
      return;
    }
    const role = e.target.dataset.role;
    if (role === "mg-nuevo") entrarModoArmarGrupo();
    else if (role === "mg-borrar") borrarGrupo(e.target.dataset.gid);
    else if (role === "mg-cerrar") cerrarModalGrupo();
  });

  // barra del modo armar grupo
  const bar = document.querySelector("[data-role=armar-bar]");
  bar?.querySelector("[data-role=ag-todos]")?.addEventListener("click", () => seleccionarTodosArmar(true));
  bar?.querySelector("[data-role=ag-ninguno]")?.addEventListener("click", () => seleccionarTodosArmar(false));
  bar?.querySelector("[data-role=ag-crear]")?.addEventListener("click", crearGrupo);
  bar?.querySelector("[data-role=ag-cancelar]")?.addEventListener("click", salirModoArmarGrupo);
  // color del grupo nuevo: paleta propia; el hidden ag-color es la fuente de verdad, el swatch muestra la elección.
  bar?.querySelector("[data-role=ag-color-sw]")?.addEventListener("click", (e) => {
    const swEl = e.currentTarget;
    const actual = bar.querySelector("[data-role=ag-color]").value || "";
    abrirPaleta(swEl, actual, (color) => {
      bar.querySelector("[data-role=ag-color]").value = color || "";
      swEl.style.background = (color && /^#[0-9a-fA-F]{6}$/.test(color)) ? color : "repeating-linear-gradient(45deg,#3a3a3a,#3a3a3a 3px,#555 3px,#555 6px)";
    });
  });

  // celdas GRUPO y RESP. NEG. editables + checkbox de armado (delegación en el tbody)
  const tbody = document.querySelector("[data-role=tabla-precios] tbody");
  tbody?.addEventListener("click", (e) => {
    if (modoArmarGrupo) return;   // en modo armar, la celda no se edita (se usa el checkbox)
    const tdG = e.target.closest("td.col-grupo");
    if (tdG && tdG.closest("tr.rel-cliente")) { editarGrupoCliente(tdG); return; }
    const tdR = e.target.closest("td.col-resp");
    if (tdR && tdR.closest("tr.rel-cliente")) editarResponsableCliente(tdR);
  });
  tbody?.addEventListener("change", (e) => { if (e.target.classList.contains("chk-grupo")) actualizarArmarInfo(); });
}

// ================= EXPORTAR A EXCEL (.xlsx con agrupación de filas) =================
const XLSX_CDN = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
async function exportarExcel() {
  const XLSX = await import(XLSX_CDN);

  // meses 2026 completos
  const meses = DATA.MESES.map((m) => m.slice(0, 10)).filter((m) => m >= "2026-01-01" && m <= "2026-12-01");
  const mesLbl = (m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

  // mails (defensivo: las columnas pueden no existir aún si no se corrió abm_27)
  let mails = new Map();
  try {
    const em = await fetchAllRows("clientes", "id, email_para, email_cc");
    mails = new Map(em.map((c) => [c.id, c]));
  } catch { /* columnas email_para/email_cc aún no creadas */ }

  const cById = new Map(DATA.clientes.map((c) => [c.id, c]));
  const iName = new Map((DATA.industrias || []).map((i) => [i.id, i.nombre]));
  const pName = new Map((DATA.personas || []).map((p) => [p.id, p.nombre]));
  const ocBySuc = new Map();
  for (const r of DATA.ocs || []) {
    if (r.vigente_hasta || (r.rol !== "coord_cuenta" && r.rol !== "franquicia")) continue;
    if (!ocBySuc.has(r.sucursal_id)) ocBySuc.set(r.sucursal_id, { coord_cuenta: [], franquicia: [] });
    ocBySuc.get(r.sucursal_id)[r.rol].push(r.persona_id);
  }
  const coordParts = (sid) => {
    const g = ocBySuc.get(sid) || { coord_cuenta: [], franquicia: [] };
    return [...g.franquicia.map((pid) => ({ nom: pName.get(pid) || "?", franq: true })), ...g.coord_cuenta.map((pid) => ({ nom: pName.get(pid) || "?", franq: false }))];
  };
  const coordTxt = (parts) => parts.map((p) => p.nom + (p.franq ? " (franq.)" : "")).join(", ");
  const sucByCli = new Map();
  for (const s of DATA.suc) { if (!sucByCli.has(s.cliente_id)) sucByCli.set(s.cliente_id, []); sucByCli.get(s.cliente_id).push(s); }

  const vis = new Set(clientesVisibles());
  const hayFiltro = filtrosActivos() > 0;
  const objPasa = (sid) => { if (!hayFiltro) return true; const tr = document.querySelector(`tr.rel-obj[data-sid="${sid}"]`); return tr ? objetivoPasa(tr) : true; };
  const cliOrden = [...sucByCli.keys()].filter((c) => vis.has(c)).sort((a, b) => (cById.get(a)?.nombre || "").localeCompare(cById.get(b)?.nombre || ""));

  const fijas = ["CUIT", "Cliente", "Objetivo", "Tipo", "Paritaria", "Industria", "Coordinador", "Grupo", "Resp. Neg.", "Email Para", "Email CC", "% PP"];
  const head1 = [...fijas], head2 = fijas.map(() => "");
  for (const m of meses) { head1.push(mesLbl(m), "", ""); head2.push("% Aum", "Precio", "% Desc"); }
  const aoa = [head1, head2];
  const niveles = [];   // outline level por fila de datos
  const R2 = (v) => Math.round(v * 100) / 100;
  const aum = (v, prev) => (v != null && prev != null && prev !== 0 && R2((v / prev - 1) * 100) !== 0) ? R2((v / prev - 1) * 100) / 100 : null;
  // Paritaria de los aumentos del objetivo en el rango exportado: nombre único, "(varias)" o "".
  const pariSetObj = (sid) => { const set = new Set(); for (const m of meses) { const pid = DATA.precioBy.get(sid)?.get(m)?.paritaria_id; if (pid != null) set.add(pid); } return set; };
  const pariTxt = (set) => (!set.size ? "" : (set.size > 1 ? "(varias)" : nombreParitaria([...set][0])));

  for (const cli of cliOrden) {
    const c = cById.get(cli);
    const objs = (sucByCli.get(cli) || []).slice()
      .sort((a, b) => String(a.codigo_objetivo).localeCompare(String(b.codigo_objetivo), undefined, { numeric: true }))
      .filter((s) => objPasa(s.id));
    if (!objs.length) continue;
    const partsPorObj = objs.map((s) => coordParts(s.id));
    const keys = partsPorObj.map(coordTxt);
    const coordCli = (keys.length && keys.every((k) => k === keys[0]) && keys[0] !== "") ? keys[0] : (keys.every((k) => k === "") ? "" : "(varios)");
    const desc = c?.descuento_pronto_pago;
    const em = mails.get(cli) || {};

    // precio común del cliente por mes (valores ACTUALES, con borradores)
    const comun = meses.map((m) => {
      const vs = objs.map((s) => currentPrecio(s.id, m)).filter((v) => v != null);
      if (!vs.length) return null;
      return vs.every((v) => v === vs[0]) ? vs[0] : "DIF";
    });
    const setCli = new Set(); for (const s of objs) for (const pid of pariSetObj(s.id)) setCli.add(pid);
    const rc = [String(c?.cuit || ""), c?.nombre || "", "", "", pariTxt(setCli), iName.get(c?.industria_id) || "", coordCli,
      nombreGrupo(c?.grupo_id || "") || "", nombreResponsable(c?.responsable_id || "") || "", em.email_para || "", em.email_cc || "", desc != null ? desc : null];
    let prev = null;
    for (let i = 0; i < meses.length; i++) {
      const v = comun[i];
      const num = (v != null && v !== "DIF") ? v : null;
      rc.push(aum(num, (prev !== "DIF" ? prev : null)), num, desc != null ? desc : null);
      prev = v;
    }
    aoa.push(rc); niveles.push(0);

    objs.forEach((s, oi) => {
      const parTxt = pariTxt(pariSetObj(s.id));
      const nom = `${s.codigo_objetivo} · ${s.nombre || ""}`;
      const ro = ["", c?.nombre || "", nom, "A", parTxt, "", coordTxt(partsPorObj[oi]), "", "", "", "", null];
      let p = null;
      for (const m of meses) { const v = currentPrecio(s.id, m); ro.push(aum(v, p), v != null ? v : null, null); p = v; }
      aoa.push(ro); niveles.push(1);

      // Fila B: sale del BORRADOR, igual que la A. Si saliera de lo guardado, un export hecho
      // con cambios sin guardar mostraría el A nuevo y el B viejo en la misma planilla.
      const bVals = meses.map((m) => currentPrecioB(s.id, m));
      if (bVals.some((v) => v != null)) {
        const roB = ["", c?.nombre || "", nom, "B", parTxt, "", coordTxt(partsPorObj[oi]), "", "", "", "", null];
        let pb = null;
        for (let i = 0; i < meses.length; i++) { const v = bVals[i]; roB.push(aum(v, pb), v != null ? v : null, null); pb = v; }
        aoa.push(roB); niveles.push(1);   // mismo nivel que la fila A → colapsa con el cliente
      }
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // encabezados combinados
  const merges = [];
  for (let c = 0; c < fijas.length; c++) merges.push({ s: { r: 0, c }, e: { r: 1, c } });
  let col = fijas.length;
  for (let i = 0; i < meses.length; i++) { merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + 2 } }); col += 3; }
  ws["!merges"] = merges;
  // agrupación de filas (objetivos colapsados bajo el cliente)
  ws["!rows"] = [{}, {}];
  for (const lvl of niveles) ws["!rows"].push(lvl === 1 ? { level: 1, hidden: true } : { level: 0 });
  ws["!outline"] = { summaryBelow: false };
  // formatos numéricos
  const enc = XLSX.utils.encode_cell;
  for (let r = 2; r < aoa.length; r++) {
    const setz = (cc, z) => { const cell = ws[enc({ r, c: cc })]; if (cell && typeof cell.v === "number") cell.z = z; };
    for (let i = 0; i < meses.length; i++) { const b = fijas.length + i * 3; setz(b, "0.00%"); setz(b + 1, '"$"#,##0.00'); setz(b + 2, "0.00%"); }
    setz(fijas.length - 1, "0.00%");   // % PP (última columna fija)
  }
  ws["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 34 }, { wch: 6 }, { wch: 26 }, { wch: 20 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 28 }, { wch: 7 },
    ...meses.flatMap(() => [{ wch: 8 }, { wch: 12 }, { wch: 8 }])];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Precios 2026");
  const h = new Date();
  const fecha = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `precios_${fecha}.xlsx`);
}

// ================= NOTAS DE AUMENTO (.docx por cliente → ZIP) =================
const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const PDF_CDN = {
  // pdfmake se carga por <script> clásico (expone window.pdfMake + window.pdfMake.vfs);
  // el +esm de vfs_fonts rompe (asigna sobre un pdfMake inexistente).
  pdfmake: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js",
  vfs: "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js",
  jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm",
};
// Carga un <script> clásico una sola vez.
function cargarScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-lib="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src; s.dataset.lib = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error("No se pudo cargar " + src + " (¿sin internet / CDN caído?)"));
    document.head.appendChild(s);
  });
}
// Deja window.pdfMake listo (lib + fuentes VFS), o tira error claro.
async function cargarPdfMake() {
  if (window.pdfMake && window.pdfMake.vfs && Object.keys(window.pdfMake.vfs).length) return window.pdfMake;
  await cargarScript(PDF_CDN.pdfmake);            // define window.pdfMake
  await cargarScript(PDF_CDN.vfs);                // agrega window.pdfMake.vfs (Roboto)
  if (!window.pdfMake) throw new Error("pdfmake no se cargó (window.pdfMake indefinido).");
  if (!window.pdfMake.vfs || !Object.keys(window.pdfMake.vfs).length) throw new Error("Las fuentes de pdfmake (VFS) no se cargaron.");
  return window.pdfMake;
}
const FIRMANTE = { nombre: "ARIEL GOROSITO", cargo: "COORD. COMERCIAL" };   // fallback si notas_config está vacío
function ntMsg(t) { const el = document.querySelector("[data-role=nt-msg]"); if (el) el.textContent = t || ""; }
function fmtFechaNota(val) { const [y, m, d] = val.split("-"); return `Buenos Aires ${d} de ${MESES_ES[Number(m) - 1]} de ${y}`; }
function refrescarResumenNotas() {
  const box = document.querySelector("[data-role=modal-notas-box]");
  const eid = box.querySelector("[data-role=nt-escala]")?.value;
  const div = box.querySelector("[data-role=nt-resumen]");
  if (div) div.innerHTML = eid ? (resumenEscalaHtml(eid) || "(sin renglones)") : `<span class="rel-none">No hay escalas: creá una con el botón «Escalas».</span>`;
}
let aplicacionesActuales = [];   // aplicaciones cargadas en el modal de notas (para el botón Generar)

function renderModalNotas() {
  const box = document.querySelector("[data-role=modal-notas-box]");
  const h = new Date();
  const hoyVal = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
  box.innerHTML = `<div class="me-title">Generar notas de aumento (PDF)</div>`
    + `<div class="nt-controls">`
    + `<label class="me-fila">Fecha de la nota: <input type="date" data-role="nt-fecha" value="${hoyVal}" /></label>`
    // Los defaults van al error MÁS BARATO. Sin precio se arregla mandando otra nota;
    // con precio de más ya no se deshace. Y olvidarse del .eml obliga a rehacer la tanda.
    + `<label class="me-fila"><input type="checkbox" data-role="nt-conprecio" /> Incluir precio en la tabla</label>`
    + `<label class="me-fila"><input type="checkbox" data-role="nt-conmail" checked /> Generar también borradores de mail (.eml)</label>`
    + `</div>`
    + `<div class="me-ayuda">⚠️ Generá después de Aplicar la escala y <b>Guardar cambios</b>: la nota usa el precio guardado (lo que se va a facturar).</div>`
    + `<div class="snap-list" data-role="nt-aplic"><div class="me-sub">Cargando aplicaciones…</div></div>`
    + `<div class="me-acc"><button data-role="nt-cerrar">Cerrar</button></div>`
    + `<div class="me-msg" data-role="nt-msg"></div>`;
  cargarAplicaciones();
}

function fmtDDMM(ts) { try { const d = new Date(ts); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); } catch (_) { return ""; } }

// Clientes (con objetivos) de una aplicación: grupo → miembros actuales; filtro → clientes guardados.
function clientesDeAplicacion(a) {
  if (a.grupo_id) { const miem = new Set(clientesDeGrupo(a.grupo_id)); return [...objetivosDeCliente.keys()].filter((cli) => miem.has(cli)); }
  const ids = Array.isArray(a.clientes_ids) ? a.clientes_ids : [];
  return ids.filter((cli) => objetivosDeCliente.has(cli));
}
// Clientes de un ítem (escala real → grupo/filtro; virtual → los que tienen aumentos manuales de la paritaria).
function clientesDeItem(item) {
  return item.tipo === "virtual" ? (item._clientes || []) : clientesDeAplicacion(item);
}
// Estado del ítem según notas_emitidas. La clave distingue escala (E|escala_id|cli) de virtual (P|paritaria_id|cli).
function computarEstadoItem(item, notasMap) {
  const clientes = clientesDeItem(item);
  const pref = item.tipo === "virtual" ? `P|${item.paritaria_id}` : `E|${item.escala_id}`;
  let gen = 0, env = 0, ultGen = null, ultEnv = null;
  for (const cli of clientes) {
    const r = notasMap.get(`${pref}|${cli}`);
    if (!r) continue;
    if (r.fecha_generada) { gen++; if (!ultGen || r.fecha_generada > ultGen) ultGen = r.fecha_generada; }
    if (r.fecha_enviada) { env++; if (!ultEnv || r.fecha_enviada > ultEnv) ultEnv = r.fecha_enviada; }
  }
  return { total: clientes.length, gen, env, ultGen, ultEnv };
}
function estadoBadge(st) {
  if (st.env > 0) return { txt: `Enviada (${fmtDDMM(st.ultEnv)})`, cls: "st-enviada" };
  if (st.gen > 0) return { txt: `Generada (${fmtDDMM(st.ultGen)}) · ${st.gen}/${st.total}`, cls: "st-generada" };
  return { txt: "Pendiente", cls: "st-pendiente" };
}

async function cargarAplicaciones() {
  const cont = document.querySelector("[data-role=nt-aplic]");
  try {
    const { data, error } = await supabase.from("aplicaciones_escala")
      .select("id, escala_id, grupo_id, descripcion_filtro, clientes_ids, fecha_aplicacion")
      .order("fecha_aplicacion", { ascending: false });
    if (error) throw error;
    // Ítems de ESCALA (aplicaciones reales) + la paritaria a la que pertenecen.
    const items = (data || []).map((a) => ({
      ...a, tipo: "escala", key: `esc|${a.id}`,
      paritaria_id: (DATA.escalas || []).find((x) => x.id === a.escala_id)?.paritaria_id ?? null,
    }));
    // Ítems VIRTUALES: paritarias con aumentos cargados A MANO (rows con escala_id null y paritaria_id).
    const cliByPari = new Map();   // paritaria_id -> Set(cliente)
    for (const [sid, pmap] of (DATA.precioBy || new Map())) {
      const cli = clienteDeSid.get(sid);
      if (!cli) continue;
      for (const row of pmap.values()) {
        if (row.escala_id == null && row.paritaria_id != null) {
          if (!cliByPari.has(row.paritaria_id)) cliByPari.set(row.paritaria_id, new Set());
          cliByPari.get(row.paritaria_id).add(cli);
        }
      }
    }
    for (const [pid, set] of cliByPari) { if (set.size) items.push({ tipo: "virtual", key: `vir|${pid}`, escala_id: null, paritaria_id: pid, _clientes: [...set] }); }
    aplicacionesActuales = items;
    // Estado desde notas_emitidas: filas de escala (por escala_id) + filas virtuales (escala_id null, por paritaria_id).
    const escalaIds = [...new Set(items.filter((it) => it.tipo === "escala" && it.escala_id).map((it) => it.escala_id))];
    const pariIds = [...new Set(items.filter((it) => it.tipo === "virtual").map((it) => it.paritaria_id))];
    const notasMap = new Map();
    try {
      if (escalaIds.length) {
        const { data: nem, error: e2 } = await supabase.from("notas_emitidas")
          .select("escala_id, paritaria_id, cliente_id, fecha_generada, fecha_enviada").in("escala_id", escalaIds);
        if (e2) throw e2;
        for (const r of (nem || [])) notasMap.set(`E|${r.escala_id}|${r.cliente_id}`, r);
      }
      if (pariIds.length) {
        const { data: nemv, error: e3 } = await supabase.from("notas_emitidas")
          .select("escala_id, paritaria_id, cliente_id, fecha_generada, fecha_enviada").is("escala_id", null).in("paritaria_id", pariIds);
        if (e3) throw e3;
        for (const r of (nemv || [])) notasMap.set(`P|${r.paritaria_id}|${r.cliente_id}`, r);
      }
    } catch (_) { /* si falta la tabla/columna, todo queda Pendiente */ }
    for (const it of items) it._estado = computarEstadoItem(it, notasMap);
    renderTablaAplicaciones(items);
  } catch (e) {
    aplicacionesActuales = [];
    cont.innerHTML = `<div class="me-sub">No se pudieron leer las aplicaciones. ${esc(humanizarError(e))} (Si persiste, ¿se corrió abm_32?)</div>`;
  }
}

function renderTablaAplicaciones(list) {
  const cont = document.querySelector("[data-role=nt-aplic]");
  if (!list.length) {
    cont.innerHTML = `<div class="me-sub">Todavía no hay aplicaciones de escala ni aumentos manuales con paritaria. Aplicá una escala («Aplicar escala») o cargá aumentos a mano con una «Paritaria activa» y guardá.</div>`;
    return;
  }
  const filas = list.map((it, i) => {
    const esVirtual = it.tipo === "virtual";
    const titulo = esVirtual ? (nombreParitaria(it.paritaria_id) || "(paritaria)")
      : ((DATA.escalas || []).find((x) => x.id === it.escala_id)?.nombre || "(escala borrada)");
    const destino = esVirtual ? "(carga manual)"
      : (it.grupo_id ? `Grupo: ${esc(nombreGrupo(it.grupo_id) || "?")}` : `Filtro: ${esc(it.descripcion_filtro || "?")}`);
    const st = it._estado || { total: 0, gen: 0, env: 0 };
    const badge = estadoBadge(st);
    const generarLabel = st.gen > 0 ? "Regenerar" : "Generar";
    const enviarDis = (st.gen === 0 || st.env > 0) ? "disabled" : "";
    return `<tr${esVirtual ? ` style="font-style:italic" title="Fila virtual: aumentos cargados a mano con esta paritaria"` : ""}>`
      + `<td class="snap-filas">${esVirtual ? "✎" : (i + 1)}</td>`
      + `<td>${destino}</td>`
      + `<td>${esc(titulo)}</td>`
      + `<td><span class="st-badge ${badge.cls}">${esc(badge.txt)}</span></td>`
      + `<td class="snap-acc"><button data-role="nt-modelo" data-key="${esc(it.key)}">Ver/Editar</button></td>`
      + `<td class="snap-acc"><button data-role="nt-generar-fila" data-key="${esc(it.key)}">${generarLabel}</button></td>`
      + `<td class="snap-acc"><button data-role="nt-probar-fila" data-key="${esc(it.key)}" title="Genera UNA sola nota (PDF + .eml) para revisarla en Outlook antes de la tanda">Probar 1</button></td>`
      + `<td class="snap-acc"><button data-role="nt-enviar-fila" data-key="${esc(it.key)}" ${enviarDis} title="Solo registra que ya fueron enviadas (no envía mails)">Marcar enviadas</button></td>`
      + `<td class="snap-acc"><button class="nt-sec" data-role="nt-casos-fila" data-key="${esc(it.key)}" title="Crea los casos que falten (reparación)">Crear</button></td>`
      + `</tr>`;
  }).join("");
  cont.innerHTML = `<table class="snap-table"><thead><tr>`
    + `<th>Nº</th><th>Grupo (o filtro)</th><th>Escala / Paritaria</th><th>Estado</th>`
    + `<th class="snap-acc">Modelo Nota</th><th class="snap-acc">Generar</th>`
    + `<th class="snap-acc">Probar</th><th class="snap-acc">Marcar enviadas</th>`
    + `<th class="snap-acc">Casos</th>`
    + `</tr></thead><tbody>${filas}</tbody></table>`;
}

// "Ver/Editar" (Modelo Nota) → editor SIMPLE de solo el texto_nota (no toca meses/%/paritaria).
function nteMsg(t) { const el = document.querySelector("[data-role=nte-msg]"); if (el) el.textContent = t || ""; }
function abrirEditorTextoNota(key) {
  const item = (aplicacionesActuales || []).find((x) => x.key === key);
  if (!item) { ntMsg("No encontré esa fila (recargá el modal)."); return; }
  const box = document.querySelector("[data-role=modal-nota-texto-box]");
  const ayudaTabla = `<div class="me-ayuda">Escribí <b>[TABLA]</b> donde va la tabla de aumentos y <b>[LINK]</b> donde mencionás el acta. Los párrafos se separan con una línea en blanco.</div>`
    + btnInsertarTabla("nte-insertar-tabla") + btnInsertarLink("nte-insertar-link");
  const acc = `<div class="me-acc"><button data-role="nte-guardar">Guardar</button><button data-role="nte-cancelar">Cancelar</button></div><div class="me-msg" data-role="nte-msg"></div>`;
  if (item.tipo === "virtual") {
    const p = (DATA.paritarias || []).find((x) => x.id === item.paritaria_id);
    if (!p) { ntMsg("No encontré esa paritaria (recargá la página)."); return; }
    box.dataset.modo = "paritaria"; box.dataset.pid = item.paritaria_id; box.dataset.eid = "";
    box.innerHTML = `<div class="me-title">Nota genérica de la paritaria</div>`
      + `<div class="me-ayuda">Paritaria: <b>${esc(nombreParitaria(item.paritaria_id))}</b>. Es la nota por defecto de los aumentos cargados a mano de esta paritaria.</div>`
      + ayudaTabla
      + `<textarea data-role="nte-texto" class="me-texto" rows="14" placeholder="Por medio de la presente le informamos…&#10;&#10;[TABLA]&#10;&#10;Quedamos a disposición.">${esc(p.nota_generica || "")}</textarea>`
      + acc;
  } else {
    const e = (DATA.escalas || []).find((x) => x.id === item.escala_id);
    if (!e) { ntMsg("No encontré esa escala (recargá la página e intentá de nuevo)."); return; }
    box.dataset.modo = "escala"; box.dataset.eid = item.escala_id; box.dataset.pid = "";
    box.innerHTML = `<div class="me-title">Texto de la nota</div>`
      + `<div class="me-ayuda">Escala: <b>${esc(e.nombre)}</b>. Acá se edita <b>solo el texto</b> (los meses y % se cambian en «Escalas»).</div>`
      + ayudaTabla
      + `<textarea data-role="nte-texto" class="me-texto" rows="14" placeholder="Por medio de la presente le informamos…&#10;&#10;[TABLA]&#10;&#10;Quedamos a disposición.">${esc(e.texto_nota || "")}</textarea>`
      + acc;
  }
  document.querySelector("[data-role=modal-notas]").hidden = true;
  document.querySelector("[data-role=modal-nota-texto]").hidden = false;
}
function cerrarEditorTextoNota() {
  document.querySelector("[data-role=modal-nota-texto]").hidden = true;
  document.querySelector("[data-role=modal-notas]").hidden = false;   // vuelve al cuadro de notas
}
// Inserta el marcador [TABLA] en su propia línea, en la posición del cursor. No duplica si ya existe.
// Inserta [TABLA] en la posición del cursor de un textarea, en su propia línea. Reutilizable por los 3 editores.
function insertarMarcadorEn(ta, marca, avisar) {
  if (!ta) return;
  const val = ta.value;
  if (val.split(/\r?\n/).some((l) => l.trim() === marca)) { if (avisar) avisar(`El texto ya tiene el marcador ${marca}.`); return; }
  const start = ta.selectionStart, end = ta.selectionEnd;
  const before = val.slice(0, start), after = val.slice(end);
  const nlAntes = (before === "" || before.endsWith("\n")) ? "" : "\n";
  const nlDespues = (after === "" || after.startsWith("\n")) ? "" : "\n";
  ta.value = before + nlAntes + marca + nlDespues + after;
  const cursor = before.length + nlAntes.length + marca.length;   // justo después del marcador
  ta.focus();
  ta.setSelectionRange(cursor, cursor);
  if (avisar) avisar("");
}
function insertarTablaEn(ta, avisar) { insertarMarcadorEn(ta, "[TABLA]", avisar); }
function insertarLinkEn(ta, avisar) { insertarMarcadorEn(ta, "[LINK]", avisar); }
// Botones reutilizables (mismo markup en los tres editores).
const btnInsertarTabla = (role) => `<div style="display:flex;gap:8px;align-items:center;margin:0 0 6px">`
  + `<button type="button" data-role="${role}" title="Inserta el marcador [TABLA] en su propia línea">➕ Insertar [TABLA]</button>`
  + `<span class="me-ayuda" style="margin:0">marca dónde va la tabla de aumentos</span></div>`;
const btnInsertarLink = (role) => `<div style="display:flex;gap:8px;align-items:center;margin:0 0 6px">`
  + `<button type="button" data-role="${role}" title="Inserta el marcador [LINK] en su propia línea">➕ Insertar [LINK]</button>`
  + `<span class="me-ayuda" style="margin:0">marca dónde va el link al acta (si la paritaria tiene URL)</span></div>`;
function insertarMarcadorTabla() { insertarTablaEn(document.querySelector("[data-role=nte-texto]"), nteMsg); }
async function guardarTextoNota() {
  const box = document.querySelector("[data-role=modal-nota-texto-box]");
  const modo = box.dataset.modo || "escala";
  const texto = (box.querySelector("[data-role=nte-texto]").value || "").trim() || null;
  const faltaTabla = texto && !texto.split(/\r?\n/).some((l) => l.trim() === "[TABLA]");
  nteMsg("Guardando…");
  try {
    if (modo === "paritaria") {
      const pid = box.dataset.pid;
      const { error } = await supabase.from("paritarias").update({ nota_generica: texto }).eq("id", pid);
      if (error) throw error;
      const p = (DATA.paritarias || []).find((x) => x.id === pid); if (p) p.nota_generica = texto;   // refresca en memoria
    } else {
      const eid = box.dataset.eid;
      const { error } = await supabase.from("escalas_aumento").update({ texto_nota: texto }).eq("id", eid);
      if (error) throw error;
      const e = (DATA.escalas || []).find((x) => x.id === eid); if (e) e.texto_nota = texto;   // refresca en memoria
    }
    cerrarEditorTextoNota();
    ntMsg(faltaTabla ? "Texto guardado. Ojo: no tiene una línea [TABLA]; la tabla irá al final del texto." : "Texto guardado.");
  } catch (e) { nteMsg("No se pudo guardar el texto. " + humanizarError(e)); }
}

// "Generar"/"Regenerar" de una fila: arma el set de clientes y llama al core.
async function generarDesdeAplicacion(key, btn, prueba = false) {
  const it = aplicacionesActuales.find((x) => x.key === key);
  if (!it) { ntMsg("No encontré esa fila (recargá el modal)."); return; }
  const st = it._estado || {};
  if (!prueba && st.gen > 0) {   // ya generada → confirmar antes de regenerar (no pisar por accidente). La prueba no confirma.
    const ok = await confirmar({ titulo: "Regenerar notas", mensaje: `Ya generaste estas notas el <b>${esc(fmtDDMM(st.ultGen))}</b>. ¿Regenerarlas?`, si: "Sí, regenerar", no: "No" });
    if (!ok) return;
  }
  const box = document.querySelector("[data-role=modal-notas-box]");
  const fechaVal = box.querySelector("[data-role=nt-fecha]").value;
  const conPrecio = box.querySelector("[data-role=nt-conprecio]").checked;
  const conEml = box.querySelector("[data-role=nt-conmail]").checked;
  const clientes = clientesDeItem(it);
  const prev = btn.textContent; btn.disabled = true; btn.textContent = prueba ? "Probando…" : "Generando…";
  try { await generarNotasCore({ eid: it.escala_id, paritariaId: it.paritaria_id, clientes, fechaVal, conPrecio, conEml, prueba }); }   // escala → eid+paritaria; virtual → eid null + paritaria
  catch (e) { ntMsg("No se pudieron generar las notas. " + humanizarError(e)); }
  finally { btn.disabled = false; btn.textContent = prev; if (!prueba) await cargarAplicaciones(); }   // la prueba no cambia estado
}

// Crea los casos del CRM de una fila (RPC crm_generar_casos). Devuelve el texto
// para el mensaje y NUNCA lanza: la llama el marcado de enviadas DESPUÉS de que el
// update ya se aplicó, y un error del CRM no puede cambiar el resultado de algo
// que ya salió bien.
// Se le pasa la LISTA de clientes, no null: el RPC trabaja por paritaria y la
// pantalla por escala. Sin acotar, marcar la escala A abriría casos de la escala B
// en 'pendiente_envio' que después nadie actualiza (on conflict do nothing).
async function crearCasosCRM(it) {
  if (!it.paritaria_id) return "Esta escala no tiene paritaria asociada: no se crearon casos en el CRM.";
  const clientes = clientesDeItem(it);
  if (!clientes.length) return "Esta fila no tiene clientes: no se crearon casos.";
  try {
    const { data, error } = await supabase.rpc("crm_generar_casos", { p_paritaria_id: it.paritaria_id, p_clientes: clientes });
    if (error) throw error;
    const r = (Array.isArray(data) ? data[0] : data) || {};   // returns table → llega como array de una fila
    let txt = `Se abrieron ${r.casos_creados ?? 0} casos en el CRM.`;
    // El envío de la nota se registra como primera gestión de cada caso nuevo
    // (abm_41). Se informa: si no, se crean gestiones que el mensaje no menciona.
    if (r.casos_marcados_enviada > 0) txt += ` Se marcaron ${r.casos_marcados_enviada} casos como enviados.`;
    if (r.gestiones_creadas > 0) txt += ` Se registró el envío de la nota en ${r.gestiones_creadas}.`;
    if (r.ya_existian > 0) txt += ` (${r.ya_existian} ya existían.)`;
    if (r.creados_sin_responsable > 0) {
      txt += ` ⚠ ATENCIÓN: ${r.creados_sin_responsable} quedaron SIN RESP. NEG. y no le van a aparecer a nadie en la agenda.`
           + ` Cargá el responsable en el ABM de clientes y volvé a apretar «Crear» (columna Casos).`;
    }
    return txt;
  } catch (e) {
    return `No se pudieron crear los casos del CRM (${humanizarError(e)}). Podés crearlos con «Crear» (columna Casos) en esta misma fila.`;
  }
}

// "Crear casos" de una fila: REPARACIÓN. Es la misma llamada que hace el marcado de
// enviadas; la única diferencia es quién la dispara. El RPC es idempotente, así que
// apretarlo de más no hace daño: devuelve 0 creados y lo dice.
async function crearCasosDesdeAplicacion(key, btn) {
  const it = aplicacionesActuales.find((x) => x.key === key);
  if (!it) { ntMsg("No encontré esa fila (recargá el modal)."); return; }
  const prev = btn.textContent; btn.disabled = true; btn.textContent = "Creando…";
  try { ntMsg(await crearCasosCRM(it)); }
  finally { btn.disabled = false; btn.textContent = prev; }
}

// "Enviar" de una fila: marca las notas como enviadas (manual por ahora).
async function enviarDesdeAplicacion(key, btn) {
  const it = aplicacionesActuales.find((x) => x.key === key);
  if (!it) { ntMsg("No encontré esa fila (recargá el modal)."); return; }
  const st = it._estado || {};
  if (st.gen === 0) { ntMsg("Primero generá las notas de esta fila."); return; }
  if (st.env > 0) { ntMsg("Estas notas ya están marcadas como enviadas."); return; }
  const titulo = it.tipo === "virtual" ? `paritaria ${nombreParitaria(it.paritaria_id)}` : `escala ${(DATA.escalas || []).find((x) => x.id === it.escala_id)?.nombre || ""}`;
  const destino = it.tipo === "virtual" ? "carga manual" : (it.grupo_id ? `grupo ${nombreGrupo(it.grupo_id) || "?"}` : `filtro (${it.descripcion_filtro || "?"})`);
  const ok = await confirmar({ titulo: "Marcar como enviadas", mensaje: `¿Marcar como <b>enviadas</b> las notas de <b>${esc(destino)}</b> — <b>${esc(titulo)}</b>?<br><br>Esto <b>no envía</b> mails: solo registra en el sistema que ya fueron enviadas (fecha de envío).`, si: "Sí, marcar enviadas", no: "No" });
  if (!ok) return;
  const clientes = clientesDeItem(it);
  const prev = btn.textContent; btn.disabled = true; btn.textContent = "Marcando…";
  try {
    const nowISO = new Date().toISOString();
    let q = supabase.from("notas_emitidas").update({ fecha_enviada: nowISO, updated_at: nowISO }).in("cliente_id", clientes);
    q = it.tipo === "virtual" ? q.is("escala_id", null).eq("paritaria_id", it.paritaria_id) : q.eq("escala_id", it.escala_id);   // solo toca filas ya generadas
    const { error } = await q;
    if (error) throw error;
    // Desde acá el marcado YA se aplicó en la base. Nada de lo que sigue puede
    // hacer fallar esta operación: el CRM va en su propio try/catch y su
    // resultado solo se SUMA al mensaje.
    await invalidarNotas(it.paritaria_id);   // la columna Nota tiene que pasar a Enviada acá mismo
    let crmTxt = "";
    try { crmTxt = await crearCasosCRM(it); }
    catch (_) { crmTxt = "No se pudieron crear los casos del CRM. Podés crearlos con «Crear» (columna Casos) en esta misma fila."; }
    ntMsg("Notas marcadas como enviadas. " + crmTxt);
    await cargarAplicaciones();
  } catch (e) { ntMsg("No se pudo marcar como enviadas. " + humanizarError(e)); btn.disabled = false; btn.textContent = prev; }
}

// ---- pdfmake: piezas del documento ----
const NOTA_VERDE = "#1a5c3a", NOTA_GRIS = "#666";
function pieInstitucionalNota() {
  const col = (titulo, dir) => ({ alignment: "center", fontSize: 7, stack: [
    { text: titulo, bold: true, color: NOTA_VERDE }, { text: dir, color: NOTA_GRIS },
  ] });
  return { margin: [40, 6, 40, 0], stack: [
    { text: "Tel: 0800 444 LINCE    ·    Web: www.linceseguridad.com.ar    ·    Mail: comercial@linceseguridad.com.ar    ·    IG: LinceSeguridadOficial", alignment: "center", fontSize: 8, color: NOTA_GRIS },
    // línea horizontal verde (separa contacto de sucursales)
    { canvas: [{ type: "line", x1: 0, y1: 3, x2: 515, y2: 3, lineWidth: 1, lineColor: NOTA_VERDE }], margin: [0, 3, 0, 4] },
    { columns: [
      col("Suc. Mar del Plata", "Av. Colón 3083 3° Piso, Mar del Plata"),
      col("Casa Central CABA", "Av. Federico Lacroze 4168 – C1427 – 11-5927-8989"),
      col("Suc. Formosa", "Barrio Parque Urbano II Mz 215 Casa 4, Formosa CP 3600"),
    ] },
  ] };
}
function tablaAumentosNota(aumentos, conPrecio) {
  // Columna "Precio B" solo si hay al menos un B en esta tabla; ahí "Precio" pasa a "Precio A".
  const hayB = conPrecio && aumentos.some((a) => a.precioB);
  // Anchos fijos y angostos: la tabla no ocupa todo el ancho de la hoja. Encabezados y valores centrados (consistentes).
  const head = [{ text: "Mes", bold: true, alignment: "center" }, { text: "% Aumento", bold: true, alignment: "center" }];
  if (conPrecio) head.push({ text: hayB ? "Precio A" : "Precio", bold: true, alignment: "center" });
  if (hayB) head.push({ text: "Precio B", bold: true, alignment: "center" });
  const body = [head];
  for (const a of aumentos) {
    const row = [{ text: a.mes, alignment: "center" }, { text: a.pct, alignment: "center" }];
    if (conPrecio) row.push({ text: a.precio, alignment: "center" });
    if (hayB) row.push({ text: a.precioB || "", alignment: "center" });
    body.push(row);
  }
  const widths = hayB ? [52, 66, 84, 84] : (conPrecio ? [58, 78, 92] : [60, 90]);
  const tabla = { table: { headerRows: 1, widths, body },
    layout: { hLineWidth: () => 0.7, vLineWidth: () => 0.7, hLineColor: () => "#999", vLineColor: () => "#999",
      paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 3, paddingBottom: () => 3 } };
  // Centrada en la hoja: espaciadores "*" a ambos lados de la tabla (ancho "auto").
  return { columns: [{ width: "*", text: "" }, { width: "auto", ...tabla }, { width: "*", text: "" }], margin: [0, 6, 0, 10] };
}
const LINK_ACTA_TXT = "Acta paritaria homologada — UPSRA";   // texto descriptivo del enlace (PDF y mail)
function parrafosNota(t, actaUrl) {
  const mkLink = () => ({ text: LINK_ACTA_TXT, link: actaUrl, color: "#1155cc", decoration: "underline" });
  return String(t).replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)                 // línea en blanco (doble Enter) = párrafo nuevo (con espacio entre párrafos)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const lines = p.split("\n");
      if (!lines.some((l) => l.trim() === "[LINK]")) return { text: p, alignment: "justify", margin: [0, 0, 0, 8] };
      // El párrafo tiene una línea [LINK]: la reemplazo por el enlace (si hay URL) o la quito limpia (si no).
      const parts = [];
      lines.forEach((l) => { if (l.trim() === "[LINK]") { if (actaUrl) parts.push(mkLink()); } else parts.push(l); });
      if (!parts.length) return null;   // párrafo era solo [LINK] sin URL → desaparece sin dejar hueco
      const withBreaks = [];
      parts.forEach((x, i) => { if (i > 0) withBreaks.push("\n"); withBreaks.push(x); });
      return { text: withBreaks, alignment: "justify", margin: [0, 0, 0, 8] };
    })
    .filter(Boolean);
}
function buildDocDefNota({ cliente, fecha, textoNota, tablaContent, firmante, logo, firma, actaUrl }) {
  const lines = String(textoNota).split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trim() === "[TABLA]");
  const antes = idx >= 0 ? lines.slice(0, idx).join("\n") : textoNota;   // sin [TABLA] → todo antes, tabla al final
  const despues = idx >= 0 ? lines.slice(idx + 1).join("\n") : "";
  return {
    pageSize: "A4", pageMargins: [60, 110, 60, 95],
    images: { logo, firma },
    header: () => ({ image: "logo", width: 150, alignment: "center", margin: [0, 25, 0, 0] }),
    footer: () => pieInstitucionalNota(),
    content: [
      { text: fecha, alignment: "right", margin: [0, 0, 0, 14] },
      { text: `ESTIMADO ${cliente}:`, bold: true, margin: [0, 0, 0, 12] },
      ...parrafosNota(antes, actaUrl),
      ...tablaContent,
      ...parrafosNota(despues, actaUrl),
      // Sello de firma: bloque UBICADO a la derecha, pero su contenido (firma+nombre+cargo)
      // CENTRADO entre sí — columna izquierda flexible como spacer, columna derecha auto.
      { margin: [0, 26, 0, 0], columns: [
        { width: "*", text: "" },
        { width: "auto", alignment: "center", stack: [
          // fit[] respeta el aspect ratio (orig. 197x225 → no se deforma)
          { image: "firma", fit: [115, 131], alignment: "center", margin: [0, 0, 0, 2] },
          { text: firmante.nombre, bold: true, alignment: "center" },
          { text: firmante.cargo, alignment: "center" },
        ] },
      ] },
    ],
    defaultStyle: { fontSize: 11, alignment: "justify", lineHeight: 1.15 },
  };
}

// ---- Borradores de mail (.eml) ----
const EMAIL_ASUNTO = "Actualización de precio - Lince Seguridad";
const EMAIL_CUERPO = "Estimados,\n\nAdjuntamos la nota con la actualización de precios correspondiente.\n\nAnte cualquier consulta, quedamos a su disposición.\n\nSaludos cordiales,\nComercial - Lince Seguridad";
const EMAIL_FROM = "comercial@linceseguridad.com.ar";

function bytesToB64(bytes) {   // Uint8Array/Buffer -> base64 (por chunks, no revienta con archivos grandes)
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < b.length; i += chunk) bin += String.fromCharCode.apply(null, b.subarray(i, i + chunk));
  return btoa(bin);
}
function b64utf8(str) { return bytesToB64(new TextEncoder().encode(str)); }
function wrap76(b64) { return (b64.match(/.{1,76}/g) || []).join("\r\n"); }
function encHeader(str) { return /^[\x00-\x7F]*$/.test(str) ? str : "=?UTF-8?B?" + b64utf8(str) + "?="; }   // RFC 2047 si hay acentos
function normalizarMails(s) { return String(s || "").split(/[;,]+/).map((x) => x.trim()).filter(Boolean).join(", "); }   // ; -> ,

function descargarBlob(blob, filename) {   // descarga un blob como archivo suelto (usado por la prueba de 1 nota)
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}
const sanitizarNombreArchivo = (s) => String(s || "").replace(/[\\/:*?"<>|\r\n]/g, " ").replace(/\s+/g, " ").trim();

// Arma un .eml (RFC 822, CRLF) que Outlook escritorio abre como BORRADOR (X-Unsent: 1).
// Estructura: multipart/mixed { multipart/alternative { text/plain, text/html }, PDF nota, [PDF homologación] }.
// El link al acta (actaUrl) va al final del cuerpo, clickeable en el HTML y como URL en el texto plano.
function buildEml({ to, cc, subject, bodyText, pdfBytes, pdfName, homolog, actaUrl, boundary }) {
  const CRLF = "\r\n";
  const alt = boundary + "_alt";
  const H = [];
  H.push("From: " + EMAIL_FROM);
  H.push("To: " + (to || ""));
  if (cc) H.push("Cc: " + cc);
  H.push("Subject: " + encHeader(subject));
  H.push("Date: " + new Date().toUTCString().replace(/GMT$/, "+0000"));
  H.push("X-Unsent: 1");                                   // <- abre como borrador editable en Outlook
  H.push("MIME-Version: 1.0");
  H.push('Content-Type: multipart/mixed; boundary="' + boundary + '"');
  // Cuerpo: multipart/alternative (texto plano primero, HTML después → Outlook toma el HTML).
  const plain = String(bodyText) + (actaUrl ? "\n\nActa paritaria homologada (UPSRA):\n" + actaUrl : "");
  const html = '<html><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt">'
    + String(bodyText).split(/\n/).map((l) => esc(l)).join("<br>")
    + (actaUrl ? '<br><br><a href="' + esc(actaUrl) + '">Acta paritaria homologada — UPSRA</a>' : "")
    + "</body></html>";
  const altPart = "--" + boundary + CRLF
    + 'Content-Type: multipart/alternative; boundary="' + alt + '"' + CRLF + CRLF
    + "--" + alt + CRLF
    + 'Content-Type: text/plain; charset="utf-8"' + CRLF + "Content-Transfer-Encoding: base64" + CRLF + CRLF
    + wrap76(b64utf8(plain.replace(/\n/g, CRLF))) + CRLF
    + "--" + alt + CRLF
    + 'Content-Type: text/html; charset="utf-8"' + CRLF + "Content-Transfer-Encoding: base64" + CRLF + CRLF
    + wrap76(b64utf8(html.replace(/\n/g, CRLF))) + CRLF
    + "--" + alt + "--" + CRLF;
  const att = (bytes, name, mime) => "--" + boundary + CRLF
    + 'Content-Type: ' + (mime || "application/octet-stream") + '; name="' + name + '"' + CRLF
    + "Content-Transfer-Encoding: base64" + CRLF
    + 'Content-Disposition: attachment; filename="' + name + '"' + CRLF + CRLF
    + wrap76(bytesToB64(bytes)) + CRLF;
  let body = altPart + att(pdfBytes, pdfName, "application/pdf");
  if (homolog && homolog.bytes) body += att(homolog.bytes, sanitizarNombreArchivo(homolog.name) || "homologacion.pdf", homolog.mime || "application/pdf");
  return H.join(CRLF) + CRLF + CRLF + body + "--" + boundary + "--" + CRLF;
}

// Sube a Storage los PDF de una tanda YA generada. Devuelve qué se subió y qué falló.
// NUNCA lanza: se la llama después de que los ZIP ya se descargaron, y una falla de
// Storage no puede convertir en error una generación que salió bien.
// De a 5 en paralelo: 300 subidas de a una son minutos de espera, y las 300 juntas
// saturan la cola del navegador y dejan el contador sin informar nada útil.
const SUBIDA_TANDA = 5;
async function subirPdfsNotas(lista, paritariaId) {
  const subidos = new Map();   // cliente_id -> { path, nombre }
  const fallaron = [];         // nombres de cliente, para el aviso en pantalla
  for (let i = 0; i < lista.length; i += SUBIDA_TANDA) {
    await Promise.all(lista.slice(i, i + SUBIDA_TANDA).map(async (it) => {
      try {
        // Blob con type explícito: sin el content-type, Storage lo guarda como binario
        // genérico y el navegador después lo ofrece para descargar en vez de mostrarlo.
        const r = await subirDocStorage(`notas/emitidas/${paritariaId}/${it.cli}`,
          new Blob([it.pdf], { type: "application/pdf" }), it.fname, "application/pdf");
        subidos.set(it.cli, r);
      } catch (e) {
        fallaron.push(it.nombre);
        console.warn("No se pudo subir el PDF de la nota:", it.nombre, e?.message ?? e);
      }
    }));
    ntMsg(`Guardando en el sistema… ${Math.min(i + SUBIDA_TANDA, lista.length)}/${lista.length}`);
  }
  return { subidos, fallaron };
}

async function generarNotasCore({ eid, paritariaId, clientes, fechaVal, conPrecio, conEml, prueba = false }) {
  if (!fechaVal) { ntMsg("Elegí una fecha."); return; }
  const escala = eid ? (DATA.escalas || []).find((x) => x.id === eid) : null;
  const P = paritariaId ?? (escala ? escala.paritaria_id : null);   // paritaria de la nota (escala → su paritaria; virtual → la elegida)
  if (!P) { ntMsg("No se pudo determinar la paritaria de esta nota."); return; }
  const paritaria = (DATA.paritarias || []).find((p) => p.id === P);
  // Texto: el de la escala; si no tiene, cae a la nota genérica de la paritaria.
  const textoNota = (escala && escala.texto_nota && escala.texto_nota.trim())
    ? escala.texto_nota.trim()
    : (paritaria && paritaria.nota_generica && paritaria.nota_generica.trim() ? paritaria.nota_generica.trim() : "");
  if (!textoNota) { ntMsg(escala ? "La escala no tiene texto de nota (ni la paritaria una nota genérica). Cargalo con «Ver/Editar»." : "La paritaria no tiene nota genérica. Cargala con «Ver/Editar»."); return; }
  if (pendingChanges.size > 0) { ntMsg("Hay cambios de precios sin guardar. Guardá los cambios antes de generar las notas, para que reflejen los precios definitivos que se van a facturar."); return; }
  if (!clientes || !clientes.length) { ntMsg("El destino no tiene clientes (con objetivos)."); return; }

  // Estado previo de las notas de este origen (para no regenerar las ya ENVIADAS).
  // Si la tabla aún no existe (abm_29 sin correr), seguimos sin bloquear.
  let estadoPrev = new Map();
  try {
    let q = supabase.from("notas_emitidas").select("cliente_id, fecha_enviada");
    q = eid ? q.eq("escala_id", eid) : q.is("escala_id", null).eq("paritaria_id", P);   // escala vs fila virtual
    const { data, error } = await q;
    if (error) throw error;
    estadoPrev = new Map((data || []).map((r) => [r.cliente_id, r]));
  } catch (_) { estadoPrev = new Map(); }

  const yaEnviadas = clientes.filter((cli) => estadoPrev.get(cli)?.fecha_enviada);
  if (!prueba && yaEnviadas.length) {   // la prueba de 1 nota no bloquea por "ya enviadas"
    const cById0 = new Map(DATA.clientes.map((c) => [c.id, c]));
    const fechas = yaEnviadas.map((cli) => estadoPrev.get(cli).fecha_enviada).sort();
    const masAntigua = new Date(fechas[0]).toLocaleDateString("es-AR");
    const lista = yaEnviadas.slice(0, 8).map((cli) => "· " + esc(cById0.get(cli)?.nombre || cli)).join("<br>");
    const extra = yaEnviadas.length > 8 ? `<br>… y ${yaEnviadas.length - 8} más` : "";
    const msg = yaEnviadas.length === 1
      ? `Esta nota ya fue enviada el <b>${esc(masAntigua)}</b> (${esc(cById0.get(yaEnviadas[0])?.nombre || "")}).<br><br>¿Regenerarla igual?`
      : `<b>${yaEnviadas.length}</b> nota(s) de esta escala ya fueron ENVIADAS (la más antigua el <b>${esc(masAntigua)}</b>):<br>${lista}${extra}`;
    const regenerarTodas = await confirmar({
      titulo: "Hay notas ya enviadas",
      mensaje: msg,
      si: yaEnviadas.length === 1 ? "Regenerarla igual" : "Regenerar todas",
      no: yaEnviadas.length === 1 ? "No regenerar" : "Solo las no enviadas",
    });
    if (!regenerarTodas) {
      const setEnv = new Set(yaEnviadas);
      clientes = clientes.filter((cli) => !setEnv.has(cli));
      if (!clientes.length) { ntMsg("Todas las notas del destino ya fueron enviadas. No hay nada para generar."); return; }
    }
  }

  // pdfmake (script clásico → window.pdfMake + VFS) + jszip (ESM)
  ntMsg("Cargando pdfmake…");
  const pdfMake = await cargarPdfMake();
  const jsMod = await import(PDF_CDN.jszip);
  const JSZip = jsMod.default || jsMod;

  // Fase 1: firmante + imágenes (logo/firma) desde notas_config → Storage; con fallback al .txt local.
  let cfg = null, firmante = FIRMANTE;
  try {
    const { data, error } = await supabase.from("notas_config").select("firmante_nombre, firmante_cargo, logo_path, firma_path").order("created_at").limit(1);
    if (error) throw error;
    cfg = data && data[0];
    if (cfg && (cfg.firmante_nombre || cfg.firmante_cargo)) firmante = { nombre: cfg.firmante_nombre || FIRMANTE.nombre, cargo: cfg.firmante_cargo || FIRMANTE.cargo };
  } catch (_) { cfg = null; firmante = FIRMANTE; }
  ntMsg("Cargando membrete…");
  const [logoR, firmaR] = await Promise.all([
    cargarImagenNota(cfg?.logo_path, "../notas/logo_b64.txt"),
    cargarImagenNota(cfg?.firma_path, "../notas/firma_b64.txt"),
  ]);
  const logo = logoR.src, firma = firmaR.src;
  // Aviso VISIBLE si alguna imagen se leyó del archivo local (no va a existir en la versión publicada).
  const localesImg = [logoR.local ? "el logo" : null, firmaR.local ? "la firma" : null].filter(Boolean);
  const avisoLocal = localesImg.length
    ? ` ⚠️ ATENCIÓN: ${localesImg.join(" y ")} se ${localesImg.length > 1 ? "están leyendo" : "está leyendo"} de un archivo LOCAL. En la versión publicada NO van a estar. Migralos desde Configuración de notas.`
    : "";
  const sinMarcador = !textoNota.split(/\r?\n/).some((l) => l.trim() === "[TABLA]");

  const cById = new Map(DATA.clientes.map((c) => [c.id, c]));
  const sucByCli = new Map();
  for (const s of DATA.suc) { if (!sucByCli.has(s.cliente_id)) sucByCli.set(s.cliente_id, []); sucByCli.get(s.cliente_id).push(s); }
  const nombreMes = (m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;   // MM/AAAA (incluye el año: las escalas pueden cruzar de año)
  const money = (v) => (v == null ? "" : fmtMoney(v));
  const fecha = fmtFechaNota(fechaVal);
  const cliOrden = clientes.slice().sort((a, b) => (cById.get(a)?.nombre || "").localeCompare(cById.get(b)?.nombre || ""));

  // Precios GUARDADOS (objetivo_precios con forward-fill; NO dependen del DOM ni de los borradores).
  // El % de la tabla se calcula de estos precios (precio_mes / precio_mes_anterior − 1), no de la escala.
  const effCache = new Map();
  const eff = (sid) => { if (!effCache.has(sid)) effCache.set(sid, efectivoDeObjetivo(sid, DATA.MESES, DATA.precioBy)); return effCache.get(sid); };
  const idxMes = (mes) => DATA.MESES.indexOf(mes);
  const precioSaved = (sid, mes) => { const i = idxMes(mes); if (i < 0) return null; const c = eff(sid)[i]; return c ? c.precio : null; };
  const pctSavedTxt = (sid, mes) => { const i = idxMes(mes); if (i <= 0) return ""; const arr = eff(sid); return fmtAum(arr[i] ? arr[i].precio : null, arr[i - 1] ? arr[i - 1].precio : null); };
  // Serie B (precio_hora_b), misma lógica de forward-fill que el A; ceroEsNulo → 0/null = sin B.
  const effBCache = new Map();
  const effB = (sid) => { if (!effBCache.has(sid)) effBCache.set(sid, efectivoDeObjetivo(sid, DATA.MESES, DATA.precioBy, "precio_hora_b", true)); return effBCache.get(sid); };
  const precioSavedB = (sid, mes) => { const i = idxMes(mes); if (i < 0) return null; const c = effB(sid)[i]; return c ? c.precio : null; };
  // Meses donde ESTE objetivo tiene un aumento REAL de la paritaria P: row con paritaria_id === P
  // y precio distinto al del mes anterior. Excluye los meses propagados por forward-fill (mismo precio).
  const mesesAumentoObj = (sid) => {
    const out = [];
    for (let i = 1; i < DATA.MESES.length; i++) {
      const mes = DATA.MESES[i];
      const row = DATA.precioBy.get(sid)?.get(mes);
      if (!row || row.paritaria_id !== P) continue;
      if (precioSaved(sid, mes) !== precioSaved(sid, DATA.MESES[i - 1])) out.push(mes);
    }
    return out;
  };

  // Documentación de la paritaria (link + homologación). La homologación se descarga UNA sola vez por tanda.
  const actaUrl = paritaria?.acta_url || null;
  const wantEml = conEml || prueba;   // la prueba siempre arma el .eml (es lo que se revisa en Outlook)
  let homolog = null;
  if (wantEml && paritaria?.homologacion_path) {
    ntMsg("Descargando homologación…");
    try {
      const { data, error } = await supabase.storage.from("finflow-docs").download(paritaria.homologacion_path);
      if (error) throw error;
      homolog = { bytes: new Uint8Array(await data.arrayBuffer()), name: paritaria.homologacion_nombre || "homologacion.pdf", mime: data.type || "application/pdf" };
    } catch (e) { ntMsg("No se pudo descargar la homologación de la paritaria. NO se generó (para no mandar la nota sin el adjunto). " + humanizarError(e)); return; }
  }

  const zip = new JSZip();
  const emlZip = conEml ? new JSZip() : null;
  const sinMail = [];   // clientes sin email_para (el .eml se genera con To vacío)
  let n = 0;
  let confirmadoPeso = false;   // el aviso de peso se muestra una sola vez, con la primera nota real
  const generados = [];
  const pdfs = [];         // { cli, fname, nombre, pdf } de la tanda, para subirlos DESPUÉS de las descargas
  const sinAumento = [];   // clientes del destino SIN aumentos de esta paritaria → se omiten y se avisan al final
  for (const cli of cliOrden) {
    const c = cById.get(cli);
    const objs = (sucByCli.get(cli) || []).slice().sort((a, b) => String(a.codigo_objetivo).localeCompare(String(b.codigo_objetivo), undefined, { numeric: true }));
    if (!objs.length) continue;
    // Meses de aumento de esta paritaria, por objetivo, y su unión a nivel cliente.
    const mesesObj = objs.map((s) => mesesAumentoObj(s.id));
    const unionMeses = [...new Set(mesesObj.flat())].sort((a, b) => a.localeCompare(b));
    if (!unionMeses.length) { sinAumento.push(c?.nombre || cli); continue; }
    let tablaContent;
    if (!conPrecio) {
      // Sin precio: SIEMPRE una sola tabla (Mes + % Aumento). El % es uniforme; se toma de un objetivo
      // que tenga el aumento ese mes (no se desglosa por objetivo ni por A/B: serían todas iguales).
      const pctEnMes = (mes) => { for (let k = 0; k < objs.length; k++) if (mesesObj[k].includes(mes)) return pctSavedTxt(objs[k].id, mes); return ""; };
      const aumentos = unionMeses.map((mes) => ({ mes: nombreMes(mes), pct: pctEnMes(mes), precio: "", precioB: "" }));
      tablaContent = [tablaAumentosNota(aumentos, false)];
    } else {
    // Con precio: uniforme vs diferenciado — los objetivos deben compartir precio en A Y en B.
    // A ignora nulls (objetivo sin precio ese mes); B es ESTRICTO (null-vs-valor cuenta como distinto,
    // para no informar un B que no corresponde a alguno de los objetivos).
    let diff = false;
    for (const mes of unionMeses) {
      const vsA = objs.map((s) => precioSaved(s.id, mes)).filter((v) => v != null);
      if (vsA.length && !vsA.every((v) => v === vsA[0])) { diff = true; break; }
      const vsB = objs.map((s) => precioSavedB(s.id, mes));
      if (!vsB.every((v) => v === vsB[0])) { diff = true; break; }
    }
    if (!diff) {
      const aumentos = unionMeses.map((mes) => {
        const vs = objs.map((s) => precioSaved(s.id, mes)).filter((v) => v != null);
        const vsB = objs.map((s) => precioSavedB(s.id, mes)).filter((v) => v != null);
        return { mes: nombreMes(mes), pct: pctSavedTxt(objs[0].id, mes), precio: conPrecio ? money(vs.length ? vs[0] : null) : "", precioB: conPrecio ? money(vsB.length ? vsB[0] : null) : "" };
      });
      tablaContent = [tablaAumentosNota(aumentos, conPrecio)];
    } else {
      tablaContent = [];
      objs.forEach((s, k) => {
        const meses = mesesObj[k];
        if (!meses.length) return;   // este objetivo no tuvo aumento de la paritaria → no lo listamos
        const aumentos = meses.map((mes) => { const v = precioSaved(s.id, mes); return { mes: nombreMes(mes), pct: pctSavedTxt(s.id, mes), precio: conPrecio ? money(v) : "", precioB: conPrecio ? money(precioSavedB(s.id, mes)) : "" }; });
        tablaContent.push({ text: `${s.codigo_objetivo} · ${s.nombre || ""}`, bold: true, margin: [0, 8, 0, 4] });
        tablaContent.push(tablaAumentosNota(aumentos, conPrecio));
      });
    }
    }
    const dd = buildDocDefNota({ cliente: c?.nombre || "", fecha, textoNota, tablaContent, firmante, logo, firma, actaUrl });
    const pdf = await new Promise((res) => pdfMake.createPdf(dd).getBuffer((buf) => res(buf)));
    const fname = `${c?.cuit || ""} - ${c?.nombre || "cliente"}`.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() + ".pdf";

    // PRUEBA: una sola nota (la primera con aumentos). Descarga PDF + .eml sueltos y termina;
    // no registra estado y NO sube nada a Storage: sale por este return, mucho antes de la
    // subida. Es una nota para mirar en Outlook, no una nota emitida.
    if (prueba) {
      const eml = buildEml({ to: normalizarMails(c?.email_para), cc: normalizarMails(c?.email_cc), subject: EMAIL_ASUNTO, bodyText: EMAIL_CUERPO, pdfBytes: pdf, pdfName: fname, homolog, actaUrl, boundary: `=_lince_${fechaVal}_prueba` });
      descargarBlob(new Blob([pdf], { type: "application/pdf" }), "PRUEBA - " + fname);
      descargarBlob(new Blob([eml], { type: "message/rfc822" }), "PRUEBA - " + fname.replace(/\.pdf$/i, ".eml"));
      ntMsg(`Nota de PRUEBA generada para ${esc(c?.nombre || cli)} (PDF + .eml). Abrí el .eml en Outlook para revisarlo. NO se registró como generada.${avisoLocal}`);
      return;
    }

    // Aviso de peso ANTES de la tanda completa (una vez, con la primera nota real), siempre que haya homologación.
    if (emlZip && homolog && !confirmadoPeso) {
      confirmadoPeso = true;
      const nEst = cliOrden.length;
      const notaB = pdf.length;
      const notasZip = nEst * notaB;
      const mailsZip = nEst * ((notaB + homolog.bytes.length) * 4 / 3 + 1200);   // base64 infla ~33% + overhead de headers
      const totalMB = (notasZip + mailsZip) / 1048576;
      const ok = await confirmar({
        titulo: "Confirmar generación",
        mensaje: `Se generarán ~<b>${nEst}</b> nota(s), con la homologación (${(homolog.bytes.length / 1024).toFixed(0)} KB) adjunta en cada mail.<br><br>`
          + `Estimado: ZIP de notas ~${(notasZip / 1048576).toFixed(0)} MB + ZIP de mails ~${(mailsZip / 1048576).toFixed(0)} MB = <b>~${totalMB.toFixed(0)} MB en total</b>.<br><br>¿Continuar?`,
        si: "Sí, generar", no: "Cancelar",
      });
      if (!ok) { ntMsg("Generación cancelada."); return; }
    }

    zip.file(fname, pdf);
    if (emlZip) {
      const para = normalizarMails(c?.email_para);
      const ccx = normalizarMails(c?.email_cc);
      if (!para) sinMail.push(c?.nombre || cli);
      const eml = buildEml({ to: para, cc: ccx, subject: EMAIL_ASUNTO, bodyText: EMAIL_CUERPO, pdfBytes: pdf, pdfName: fname, homolog, actaUrl, boundary: `=_lince_${fechaVal}_${n}` });
      emlZip.file(fname.replace(/\.pdf$/i, ".eml"), eml);
    }
    generados.push(cli);
    pdfs.push({ cli, fname, nombre: c?.nombre || cli, pdf });
    n++; ntMsg(`Generando… ${n}/${cliOrden.length}`);
  }
  if (!n) { ntMsg(`No se generó ninguna nota.${sinAumento.length ? ` ${sinAumento.length} cliente(s) sin aumentos de esta paritaria.` : ""}`); return; }
  const outBlob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(outBlob); a.download = `notas_aumento_${fechaVal}.zip`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);

  // Borradores de mail (.eml), en un ZIP aparte.
  if (emlZip) {
    const emlBlob = await emlZip.generateAsync({ type: "blob" });
    const a2 = document.createElement("a");
    a2.href = URL.createObjectURL(emlBlob); a2.download = `mails_${fechaVal}.zip`;
    document.body.appendChild(a2); a2.click(); a2.remove(); URL.revokeObjectURL(a2.href);
  }

  // Guardar los PDF en Storage. Va DESPUÉS de las dos descargas y aparte: los ZIP son lo
  // que Comercial necesita para trabajar hoy y ya están en la máquina. Si Storage falla,
  // la tanda no se pierde ni hay que rehacerla; solo queda sin copia en el sistema.
  const { subidos, fallaron } = await subirPdfsNotas(pdfs, P);

  // Registrar estado: marcar Generada (upsert no toca fecha_enviada si la fila ya existía).
  try {
    const nowISO = new Date().toISOString();
    const fila = (cli) => ({ escala_id: eid, cliente_id: cli, paritaria_id: P, fecha_generada: nowISO, fecha_nota: fechaVal, incluye_precio: conPrecio, updated_at: nowISO });
    // DOS upserts y no uno: el upsert pisa las columnas que van en el payload. Si las notas
    // sin PDF viajaran con pdf_path en null, al regenerar una nota cuya subida falló se
    // BORRARÍA el puntero del PDF que esa nota ya tenía guardado de antes. Separadas, las
    // que fallaron ni mencionan las columnas del PDF, así que no las tocan.
    const conPdf = generados.filter((cli) => subidos.has(cli))
      .map((cli) => ({ ...fila(cli), pdf_path: subidos.get(cli).path, pdf_nombre: subidos.get(cli).nombre, pdf_subido_en: nowISO }));
    const sinPdf = generados.filter((cli) => !subidos.has(cli)).map(fila);
    for (const rows of [conPdf, sinPdf]) {
      if (!rows.length) continue;
      const { error } = await supabase.from("notas_emitidas").upsert(rows, { onConflict: "origen_id,cliente_id" });   // origen_id = coalesce(escala_id, paritaria_id), columna generada
      if (error) throw error;
    }
  } catch (e) {
    ntMsg(`Notas generadas y descargadas, pero NO se pudo registrar el estado. ${humanizarError(e)} (¿Corriste abm_29_notas_estado.sql?)`);
    return;
  }
  await invalidarNotas(P);   // recién acá el estado quedó registrado: la columna Nota pasa a Generada
  const emlTxt = emlZip ? ` + ${n} mail(s) .eml` : "";
  const sinTxt = (emlZip && sinMail.length) ? ` ⚠️ ${sinMail.length} sin destinatario (To vacío): ${sinMail.slice(0, 5).join(", ")}${sinMail.length > 5 ? "…" : ""}.` : "";
  const sinAumTxt = sinAumento.length ? ` ⚠️ ${sinAumento.length} sin aumentos de esta paritaria (omitido/s): ${sinAumento.slice(0, 5).join(", ")}${sinAumento.length > 5 ? "…" : ""}.` : "";
  // El aviso de las subidas fallidas es explícito: el ZIP igual las tiene, así que el
  // problema no es la nota sino la copia en el sistema.
  const pdfTxt = fallaron.length
    ? ` ⚠️ ${fallaron.length} PDF NO se guardaron en el sistema (${fallaron.slice(0, 5).join(", ")}${fallaron.length > 5 ? "…" : ""}). El ZIP que se descargó los tiene igual.`
    : ` Los ${subidos.size} PDF quedaron guardados en el sistema.`;
  ntMsg(`Listo: ${n} nota(s) en PDF${emlTxt}.${pdfTxt}${sinMarcador ? " (El texto no tiene [TABLA]: la tabla quedó al final.)" : ""}${sinTxt}${sinAumTxt}${avisoLocal}`);
}

function wireNotas() {
  document.querySelector("[data-role=generar-notas]")?.addEventListener("click", () => { renderModalNotas(); document.querySelector("[data-role=modal-notas]").hidden = false; });
  const modal = document.querySelector("[data-role=modal-notas]");
  const box = document.querySelector("[data-role=modal-notas-box]");
  modal?.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
  box?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-role]");   // robusto: toma el botón aunque se clickee un hijo
    if (!btn) return;
    const role = btn.dataset.role;
    if (role === "nt-cerrar") { modal.hidden = true; return; }
    if (role === "nt-modelo") { abrirEditorTextoNota(btn.dataset.key); return; }
    if (role === "nt-generar-fila") { generarDesdeAplicacion(btn.dataset.key, btn); return; }
    if (role === "nt-probar-fila") { generarDesdeAplicacion(btn.dataset.key, btn, true); return; }
    if (role === "nt-enviar-fila") { enviarDesdeAplicacion(btn.dataset.key, btn); return; }
    if (role === "nt-casos-fila") { crearCasosDesdeAplicacion(btn.dataset.key, btn); return; }
  });
  // Editor simple del texto de la nota (modal aparte, bloqueante para no perder la edición).
  const boxTxt = document.querySelector("[data-role=modal-nota-texto-box]");
  boxTxt?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-role]");
    if (!btn) return;
    if (btn.dataset.role === "nte-guardar") guardarTextoNota();
    else if (btn.dataset.role === "nte-cancelar") cerrarEditorTextoNota();
    else if (btn.dataset.role === "nte-insertar-tabla") insertarMarcadorTabla();
    else if (btn.dataset.role === "nte-insertar-link") insertarLinkEn(document.querySelector("[data-role=nte-texto]"), nteMsg);
  });
}

// ---- Modal CONFIG de notas (firmante + logo/firma; imágenes en Storage con fallback al .txt local) ----
function cfgMsg(t) { const el = document.querySelector("[data-role=cfg-msg]"); if (el) el.textContent = t || ""; }
function bloqueImagenCfg(titulo, key, cfg, prev) {
  const path = cfg?.[`${key}_path`];
  const nom = cfg?.[`${key}_nombre`] || "";
  const estado = path
    ? `<span class="cfg-badge cfg-ok">en Storage</span>`
    : `<span class="cfg-badge cfg-local">solo local (pendiente de migrar)</span>`;
  const img = prev?.src
    ? `<img class="cfg-preview" src="${esc(prev.src)}" alt="${esc(titulo)}" />`
    : `<div class="cfg-preview cfg-nopreview">(sin vista previa)</div>`;
  return `<div class="cfg-img"><div class="cfg-img-head"><b>${esc(titulo)}</b> ${estado}</div>`
    + img
    + `<label class="me-doc-file">${path ? "Reemplazar" : "Subir"} (PNG): <input type="file" accept="image/png" data-role="cfg-${key}-file" /></label>`
    + (nom ? `<div class="me-doc-actual">Archivo: ${esc(nom)}</div>` : "")
    + `</div>`;
}
function renderModalConfig(cfg, previews) {
  const box = document.querySelector("[data-role=modal-config-box]");
  const nombre = cfg?.firmante_nombre ?? FIRMANTE.nombre;
  const cargo = cfg?.firmante_cargo ?? FIRMANTE.cargo;
  const faltaMigrar = !cfg?.logo_path || !cfg?.firma_path;
  box.innerHTML = `<div class="me-title">Config de notas</div>`
    + `<label class="me-fila">Firmante: <input type="text" data-role="cfg-nombre" value="${esc(nombre)}" placeholder="ARIEL GOROSITO" /></label>`
    + `<label class="me-fila">Cargo: <input type="text" data-role="cfg-cargo" value="${esc(cargo)}" placeholder="COORD. COMERCIAL" /></label>`
    + `<div class="me-sub" style="margin-top:12px">Membrete (aparece en cada nota):</div>`
    + bloqueImagenCfg("Logo", "logo", cfg, previews?.logo)
    + bloqueImagenCfg("Firma", "firma", cfg, previews?.firma)
    + (faltaMigrar ? `<div class="me-ayuda">Hay imágenes sin migrar. La migración toma el archivo local actual (el ya corregido/rotado) y lo sube a Storage. <b>Corré esto desde tu PC (localhost)</b>: en el sitio publicado los archivos locales no existen.</div><button data-role="cfg-migrar">Migrar logo y firma actuales a Storage</button>` : "")
    + `<div class="me-acc" style="margin-top:12px"><button data-role="cfg-guardar">Guardar</button><button data-role="cfg-cerrar">Cerrar</button></div>`
    + `<div class="me-msg" data-role="cfg-msg"></div>`;
}
// Preview de una imagen para la config: signed URL si está en Storage; si no, el data-URI del .txt local.
async function previewImagenCfg(path, txtFallbackUrl) {
  if (path) {
    try { const { data, error } = await supabase.storage.from("finflow-docs").createSignedUrl(path, 300); if (!error && data) return { src: data.signedUrl, local: false }; } catch (_) {}
  }
  try { const r = await fetch(txtFallbackUrl); if (r.ok) return { src: (await r.text()).trim(), local: true }; } catch (_) {}
  return null;
}
async function abrirModalConfig() {
  renderModalConfig(null, {});
  document.querySelector("[data-role=modal-config]").hidden = false;
  cfgMsg("Cargando…");
  try {
    const { data, error } = await supabase.from("notas_config").select("firmante_nombre, firmante_cargo, logo_path, logo_nombre, firma_path, firma_nombre").order("created_at").limit(1);
    if (error) throw error;
    const cfg = data && data[0];
    const previews = {
      logo: await previewImagenCfg(cfg?.logo_path, "../notas/logo_b64.txt"),
      firma: await previewImagenCfg(cfg?.firma_path, "../notas/firma_b64.txt"),
    };
    renderModalConfig(cfg, previews);
    cfgMsg("");
  } catch (e) { cfgMsg("No se pudo leer notas_config (¿corriste el ALTER de las columnas de imagen?). Se usan los valores por defecto."); }
}
async function guardarConfig() {
  const box = document.querySelector("[data-role=modal-config-box]");
  const nombre = box.querySelector("[data-role=cfg-nombre]").value.trim();
  const cargo = box.querySelector("[data-role=cfg-cargo]").value.trim();
  const logoFile = box.querySelector("[data-role=cfg-logo-file]")?.files?.[0] || null;
  const firmaFile = box.querySelector("[data-role=cfg-firma-file]")?.files?.[0] || null;
  if (!nombre) { cfgMsg("Poné el nombre del firmante."); return; }
  if (logoFile && logoFile.type !== "image/png") { cfgMsg("El logo tiene que ser PNG."); return; }
  if (firmaFile && firmaFile.type !== "image/png") { cfgMsg("La firma tiene que ser PNG."); return; }
  cfgMsg("Guardando…");
  let logoPtr = null, firmaPtr = null;   // subidas primero (no dependen del id); path nuevo, no pisa
  try {
    if (logoFile) logoPtr = await subirDocStorage("notas/logo", logoFile, logoFile.name, logoFile.type);
    if (firmaFile) firmaPtr = await subirDocStorage("notas/firma", firmaFile, firmaFile.name, firmaFile.type);
  } catch (e) { cfgMsg("La imagen no se pudo subir. La vigente sigue siendo la anterior. Reintentá. " + humanizarError(e)); return; }
  const row = { firmante_nombre: nombre, firmante_cargo: cargo };
  if (logoPtr) { row.logo_path = logoPtr.path; row.logo_nombre = logoPtr.nombre; }
  if (firmaPtr) { row.firma_path = firmaPtr.path; row.firma_nombre = firmaPtr.nombre; }
  try {
    const { data, error } = await supabase.from("notas_config").select("id").order("created_at").limit(1);
    if (error) throw error;
    const id = data && data[0] && data[0].id;
    if (id) { const { error: e2 } = await supabase.from("notas_config").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id); if (e2) throw e2; }
    else { const { error: e3 } = await supabase.from("notas_config").insert(row); if (e3) throw e3; }
  } catch (e) {
    cfgMsg((logoPtr || firmaPtr)
      ? "La imagen se subió pero no se pudo actualizar la config. La vigente sigue siendo la anterior. Reintentá. " + humanizarError(e)
      : "No se pudo guardar. " + humanizarError(e));
    return;
  }
  await abrirModalConfig();
  cfgMsg("Guardado.");
}
// Migración one-time (desde localhost): data-URI del .txt (ya corregido/rotado) → PNG → Storage → puntero en notas_config.
async function migrarUnaImagenNota(txtUrl, carpeta, nombre) {
  const r = await fetch(txtUrl);
  if (!r.ok) throw new Error(`No se encontró ${txtUrl.replace("../", "")}`);
  const dataUri = (await r.text()).trim();
  const blob = await (await fetch(dataUri)).blob();   // decodifica el data-URI a bytes PNG (preserva la rotación horneada)
  return subirDocStorage(carpeta, blob, nombre, blob.type || "image/png");
}
async function migrarImagenesNotas() {
  cfgMsg("Migrando…");
  try {
    const { data, error } = await supabase.from("notas_config").select("id, logo_path, firma_path").order("created_at").limit(1);
    if (error) throw error;
    const cur = data && data[0];
    const upd = {};
    if (!cur?.logo_path) { const p = await migrarUnaImagenNota("../notas/logo_b64.txt", "notas/logo", "logo.png"); upd.logo_path = p.path; upd.logo_nombre = p.nombre; }
    if (!cur?.firma_path) { const p = await migrarUnaImagenNota("../notas/firma_b64.txt", "notas/firma", "firma.png"); upd.firma_path = p.path; upd.firma_nombre = p.nombre; }
    if (!Object.keys(upd).length) { cfgMsg("Las imágenes ya estaban migradas."); return; }
    const id = cur?.id;
    if (id) { const { error: e2 } = await supabase.from("notas_config").update({ ...upd, updated_at: new Date().toISOString() }).eq("id", id); if (e2) throw e2; }
    else { const { error: e3 } = await supabase.from("notas_config").insert({ firmante_nombre: FIRMANTE.nombre, firmante_cargo: FIRMANTE.cargo, ...upd }); if (e3) throw e3; }
    await abrirModalConfig();
    cfgMsg("Migradas. Revisá el preview (que la firma no esté torcida) antes de generar.");
  } catch (e) { cfgMsg("No se pudo migrar. " + humanizarError(e) + " — Ojo: corré esto desde localhost (los .txt no están en el sitio publicado)."); }
}
function wireConfig() {
  document.querySelector("[data-role=config-notas]")?.addEventListener("click", () => { abrirModalConfig(); });
  const modal = document.querySelector("[data-role=modal-config]");
  const box = document.querySelector("[data-role=modal-config-box]");
  modal?.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
  box?.addEventListener("click", (e) => {
    const role = e.target.dataset.role;
    if (role === "cfg-cerrar") modal.hidden = true;
    else if (role === "cfg-guardar") guardarConfig();
    else if (role === "cfg-migrar") migrarImagenesNotas();
  });
}

// ---- Backup / Restaurar precios (snapshots de objetivo_precios) ----
function rsMsg(t) { const el = document.querySelector("[data-role=rs-msg]"); if (el) el.textContent = t || ""; }
function fmtFechaHora(ts) { try { return new Date(ts).toLocaleString("es-AR"); } catch (_) { return String(ts); } }

// Nombre automático del backup: AAAA-MM-DD-HH-MM (hora local).
function nombreAutoBackup() {
  const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}`;
}
async function hacerBackup(btn) {
  const desc = window.prompt("Descripción del backup (opcional, ej. \"antes de paritaria Jul\"). Dejala vacía si no querés:", "");
  if (desc === null) return;   // canceló el prompt
  const nombre = nombreAutoBackup();
  const d = desc.trim();
  const prev = btn.textContent; btn.disabled = true; btn.textContent = "Guardando…";
  try {
    const { data: newId, error } = await supabase.rpc("crear_precios_snapshot", { p_nombre: nombre, p_descripcion: d || null });
    if (error) throw error;
    let filasTxt = "";
    try { const { data: row } = await supabase.from("precios_snapshots").select("n_filas").eq("id", newId).single(); if (row) filasTxt = ` (${row.n_filas} filas)`; } catch (_) {}
    window.alert(`Backup guardado "${nombre}"${d ? ` — ${d}` : ""}${filasTxt}.`);
  } catch (e) {
    window.alert("No se pudo guardar el backup. " + humanizarError(e) + "\n(Si el problema persiste, ¿se corrió abm_31_precios_snapshots.sql?)");
  } finally { btn.disabled = false; btn.textContent = prev; }
}

// "2026-07-20-08-22" -> "2026-07-20 08:22" (si no matchea, devuelve el nombre tal cual).
function fmtNombreBackup(nombre) {
  const p = String(nombre || "").split("-");
  return p.length === 5 ? `${p[0]}-${p[1]}-${p[2]} ${p[3]}:${p[4]}` : (nombre || "(sin nombre)");
}

function renderModalRestore(list) {
  const box = document.querySelector("[data-role=modal-restore-box]");
  let cuerpo;
  if (list === null) {
    cuerpo = `<div class="me-sub">Cargando…</div>`;
  } else if (!list.length) {
    cuerpo = `<div class="me-sub">No hay backups guardados todavía.</div>`;
  } else {
    const filas = list.map((s) => {
      const auto = (s.descripcion || "").startsWith("AUTO");
      const fechaHora = fmtNombreBackup(s.nombre);
      const origen = auto
        ? `<span class="snap-origen snap-origen-auto">Auto</span>`
        : `<span class="snap-origen">Usuario</span>`;
      let desc = s.descripcion || "";
      if (auto) desc = desc.replace(/^AUTO\s*-?\s*/i, "");   // el Origen ya dice "Auto"
      return `<tr class="${auto ? "snap-auto" : ""}">`
        + `<td class="snap-fecha">${esc(fechaHora)}</td>`
        + `<td>${origen}</td>`
        + `<td>${desc ? esc(desc) : "—"}</td>`
        + `<td class="snap-filas">${s.n_filas ?? "?"}</td>`
        + `<td class="snap-acc">`
        + `<button data-role="rs-restaurar" data-id="${esc(s.id)}" data-nom="${esc(fechaHora)}">Restaurar</button>`
        + `<button class="snap-borrar" data-role="rs-borrar" data-id="${esc(s.id)}" data-nom="${esc(fechaHora)}">Borrar</button>`
        + `</td></tr>`;
    }).join("");
    cuerpo = `<table class="snap-table"><thead><tr>`
      + `<th>Fecha/Hora</th><th>Origen</th><th>Descripción</th><th>Filas</th><th>Acciones</th>`
      + `</tr></thead><tbody>${filas}</tbody></table>`;
  }
  box.innerHTML = `<div class="me-title">Restaurar precios desde un backup</div>`
    + `<div class="me-ayuda">Restaurar <b>pisa todos los precios actuales</b> con la foto elegida. Antes de pisar, el sistema guarda una foto automática (Origen «Auto»).</div>`
    + `<div class="snap-list">${cuerpo}</div>`
    + `<div class="me-acc"><button data-role="rs-cerrar">Cerrar</button></div>`
    + `<div class="me-msg" data-role="rs-msg"></div>`;
}

async function cargarListaRestore() {
  try {
    const { data, error } = await supabase.from("precios_snapshots").select("id, nombre, descripcion, creado_at, n_filas").order("creado_at", { ascending: false });
    if (error) throw error;
    renderModalRestore(data || []);
    return true;
  } catch (e) { renderModalRestore([]); rsMsg("No se pudieron leer los backups. " + humanizarError(e) + " (Si persiste, ¿se corrió abm_31?)"); return false; }
}

async function abrirModalRestore() {
  renderModalRestore(null);
  document.querySelector("[data-role=modal-restore]").hidden = false;
  rsMsg("Cargando…");
  await cargarListaRestore();
}

// Pantalla final del restore (sin lista ni botones "Restaurar", para no confundir).
function renderRestoreExito(nombre) {
  const box = document.querySelector("[data-role=modal-restore-box]");
  box.innerHTML = `<div class="me-title">✓ Precios restaurados</div>`
    + `<div class="me-ayuda">Se restauraron los precios del backup <b>${esc(nombre)}</b>. La pantalla ya quedó actualizada.</div>`
    + `<div class="me-acc"><button data-role="rs-cerrar">Cerrar</button></div>`;
}

async function restaurarSnapshot(id, nombre) {
  const ok = await confirmar({
    titulo: "Restaurar backup",
    mensaje: `Vas a restaurar el backup <b>${esc(nombre)}</b>.<br><br>Esto <b>reemplaza todos los precios actuales</b> con los de esa foto. Antes de pisar se guarda una foto automática del estado actual, por las dudas.`,
    si: "Sí, restaurar", no: "No, volver", peligro: true,
  });
  if (!ok) return;
  rsMsg("Restaurando…");
  try {
    const { error } = await supabase.rpc("restaurar_precios_snapshot", { p_snapshot: id });
    if (error) throw error;
    pendingChanges.clear();          // los borradores en pantalla ya no aplican
    await recargarDatos();           // refresca la matriz con lo restaurado
    renderRestoreExito(nombre);      // pantalla final inequívoca (no vuelve a la lista)
  } catch (e) { rsMsg("No se pudo restaurar el backup. " + humanizarError(e)); }
}

async function borrarSnapshot(id, nombre) {
  const ok = await confirmar({
    titulo: "Borrar backup",
    mensaje: `¿Borrar el backup <b>${esc(nombre)}</b>?<br><br>Esta acción no se puede deshacer.`,
    si: "Sí, borrar", no: "No", peligro: true,
  });
  if (!ok) return;
  rsMsg("Borrando…");
  try {
    const { error } = await supabase.rpc("borrar_precios_snapshot", { p_snapshot: id });
    if (error) throw error;
    await cargarListaRestore();
    rsMsg("Backup borrado.");
  } catch (e) { rsMsg("No se pudo borrar el backup. " + humanizarError(e)); }
}

function wireBackupRestore() {
  document.querySelector("[data-role=backup]")?.addEventListener("click", (e) => hacerBackup(e.target));
  document.querySelector("[data-role=restaurar]")?.addEventListener("click", () => abrirModalRestore());
  const modal = document.querySelector("[data-role=modal-restore]");
  const box = document.querySelector("[data-role=modal-restore-box]");
  // Modal BLOQUEANTE: NO se cierra por clic afuera ni scroll; solo con "Cerrar".
  box?.addEventListener("click", (e) => {
    const role = e.target.dataset.role;
    if (role === "rs-cerrar") { modal.hidden = true; return; }
    if (role === "rs-restaurar") restaurarSnapshot(e.target.dataset.id, e.target.dataset.nom);
    else if (role === "rs-borrar") borrarSnapshot(e.target.dataset.id, e.target.dataset.nom);
  });
}

async function init() {
  const status = document.querySelector("[data-role=status]");
  try {
    if (status) status.textContent = "Cargando…";
    const [indices, precios, suc, clientes, industrias, ocs, personas] = await Promise.all([
      fetchAllRows("indices_economicos", "mes, tipo, valor"),
      // "id" = orden estable para paginar en paralelo (es la PK). Ver fetchAllRows.
      fetchAllRows("objetivo_precios", "sucursal_id, codigo_objetivo, mes, precio_hora, precio_hora_b, tipo_precio, tipo, tipo_servicio, paritaria_id, escala_id", null, "id"),
      fetchAllRows("sucursales", "id, cliente_id, codigo_objetivo, nombre, tipo_servicio"),
      fetchAllRows("clientes", "id, nombre, descuento_pronto_pago, industria_id, grupo_id, responsable_id, cuit, email_para, email_cc"),
      fetchAllRows("industrias", "id, nombre"),
      fetchAllRows("objetivo_comisionistas", "sucursal_id, persona_id, rol, vigente_hasta"),
      fetchAllRows("personas", "id, nombre"),
    ]);
    const horizonte = leerHorizonteDesdeIndices(indices);
    const MESES = calcularMeses(horizonte);

    // precio por objetivo por mes: Map(sucursal_id -> Map(mes "YYYY-MM-01" -> fila))
    const precioBy = new Map();
    for (const p of precios) {
      const mes = String(p.mes).slice(0, 10);
      if (!precioBy.has(p.sucursal_id)) precioBy.set(p.sucursal_id, new Map());
      precioBy.get(p.sucursal_id).set(mes, p);
    }

    DATA = { suc, clientes, MESES, precioBy, horizonte, industrias, ocs, personas };
    // Escalas y grupos son independientes entre sí (grupos solo necesita DATA.clientes,
    // que ya está cargado), así que van juntas en vez de una atrás de la otra.
    await Promise.all([
      cargarEscalas(),   // escalas/modelos de aumento
      cargarGrupos(),    // grupos de clientes
    ]);
    // Esta SÍ va después: paritariaVigente() lee DATA.paritarias, que puebla cargarEscalas.
    await cargarColumnaNota();   // estado de notas de la paritaria vigente (columna Nota)
    wireToggle();
    wireVentanaMeses();   // botón "ver todos los meses" (antes del render: fija el rótulo)
    wireEdicion();   // edición en memoria (Capa 1)
    cargarVista();   // restaura columnas visibles + anchos guardados (antes del render, que aplica vía aplicarColsFijas)
    render();   // arranca COLAPSADO (las filas de objetivo van con hidden)
    wireFiltros();   // filtros por columna (thead + popup ya existen)
    wireResizeColObj();   // redimensionar columnas fijas (handles)
    wireMenuColumnas();   // menú ☰ mostrar/ocultar columnas fijas
    wireColumnaNota();    // selector de paritaria de la columna Nota (delegado en el thead)
    wireColorPop();       // paleta de colores desplegable (grupos)
    wireEscalas();   // módulo de escalas de aumento
    wireParitarias();   // módulo de paritarias (entidad de primer nivel)
    wireGrupos();    // gestión de grupos de clientes
    wireNotas();     // notas de aumento (PDF)
    wireConfig();    // config de notas (firmante editable)
    wireBackupRestore();   // backup / restaurar precios (snapshots)
    document.querySelector("[data-role=exportar]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = "Exportando…";
      mostrarMsgEdicion("Generando Excel…");
      try {
        await exportarExcel();
        mostrarMsgEdicion("Excel generado.");
        setTimeout(() => { if (document.querySelector("[data-role=msg-edicion]")?.textContent === "Excel generado.") mostrarMsgEdicion(""); }, 4000);
      } catch (err) {
        mostrarMsgEdicion("");
        alert("No se pudo exportar. " + humanizarError(err));
      } finally {
        btn.disabled = false; btn.textContent = "Exportar";
      }
    });
    wireAltoTablaPrecios();   // altura medida del contenedor + recálculo por resize/ResizeObserver
    // dejar el mes en curso a la vista (tras aplicar estilos/layout)
    requestAnimationFrame(() => requestAnimationFrame(scrollAlMesEnCurso));
  } catch (e) {
    console.error(e);
    if (status) status.textContent = "No se pudo cargar la pantalla. " + humanizarError(e);
  }
}

await init();
