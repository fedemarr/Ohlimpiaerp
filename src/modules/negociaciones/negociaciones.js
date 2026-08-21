// Pantalla CRM de negociación — PASOS 1 y 2: lista + filtros.
//
// Todavía sin selección en bloque, sin acciones y sin caso individual: son los
// pasos 3 y 4. El checkbox se dibuja pero no hace nada.
//
// ORDEN por defecto: fecha_proxima_accion con los NULOS AL FINAL y después
// cliente A-Z. Una sola regla que sirve hoy y después: hoy todas las fechas son
// nulas (falta paritarias.plazo_aceptacion_tacita) y ordena alfabético; cuando
// el plazo exista, lo urgente sube solo sin cambiar nada acá.
//
// CONTADORES DE LOS CHIPS: cada dimensión se cuenta sobre el conjunto filtrado
// por todas las OTRAS dimensiones, no por la propia. El número del chip es una
// promesa —"apretame y vas a ver N filas"— y tiene que cumplirse. Si contaran el
// total, filtrar por un responsable y después apretar un estado mostraría un
// número distinto al prometido. Si contaran el conjunto completo (incluyendo el
// filtro propio), al elegir un estado el resto caería a cero y no se podría
// navegar a ningún otro.

const v = new URL(import.meta.url).searchParams.get("v") ?? "";
const q = v ? `?v=${v}` : "";
import { SUPA as supabase } from '@shared/supabase.js';
import { chipEtq, fondoEtq, textoContraste } from '@/shared/finflow/etiquetas-color.js';
import { wireResizeColumnas, clampAncho } from '@/shared/finflow/columnas-resize.js';
import { acortarNombre } from '@/shared/finflow/nombres.js';
import { abrirPopupLista } from '@/shared/finflow/filtro-popup.js';
import { confirmar } from '@/shared/finflow/confirmar.js';
import { wireAltoTabla } from '@/shared/finflow/alto-tabla.js';
import { abrirDocStorage } from '@/shared/finflow/ver-doc.js';

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const ESTADO_TXT = {
  pendiente_envio: "Pendiente de envío",
  enviada: "Enviada",
  sin_respuesta: "Sin respuesta",
  en_renegociacion: "En renegociación",
  reclamo_posterior: "Reclamo posterior",
  precerrada: "Precerrada",
  cerrada: "Cerrada",
};
// El orden de los chips sigue el circuito del documento, no el alfabético.
const ESTADOS = Object.keys(ESTADO_TXT);
// ABIERTOS = "lo que me falta trabajar". Precerrada saca el caso de la lista de
// Comercial (su tarea terminó) y cerrada la confirma el pago.
const ABIERTOS = ["pendiente_envio", "enviada", "sin_respuesta", "en_renegociacion", "reclamo_posterior"];

const CANAL_TXT = {
  mail: "mail", celular: "celular", whatsapp: "WhatsApp",
  personal: "personal", intermediario: "intermediario",
};

const SIN_RESP = "SIN";   // clave del chip "sin asignar"

// dd/mm/aaaa. Las fechas vienen como 'YYYY-MM-DD' (date) — se parten a mano en
// vez de pasarlas por new Date(), que las interpreta en UTC y las corre un día.
function fmtFecha(f) {
  if (!f) return "";
  const [y, m, d] = String(f).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// ---- Semáforo de la fecha tope ----
//
// Días desde hoy hasta la fecha; negativo = ya pasó. Se compara por FECHA y no por
// milisegundos: dos momentos del mismo día tienen que dar 0 aunque sean 00:01 y
// 23:59. Los dos lados se arman con Date.UTC para que un cambio de horario de
// verano no corra el resultado un día.
function diasHasta(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const h = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000);
}

// UMBRAL DEL AMARILLO: 3 días.
//
// Es el número más chico que hace que el VIERNES avise de lo del LUNES. Con 2, el
// fin de semana se come el aviso: cerrás el viernes con todo en verde y el lunes te
// encontrás cosas ya vencidas sin haber podido anticiparlas.
//
// Y no más de 3 porque el eslabón típico dura 7 días —es el valor por defecto que
// pone "Avanzar el caso"—, así que 3 es el último tercio: queda tiempo de actuar
// pero ya no hay holgura. Con 5, media lista estaría amarilla siempre y el color
// dejaría de significar algo.
const DIAS_AMARILLO = 3;

const semaforo = (dias) => (dias == null ? "" : dias < 0 ? "rojo" : dias <= DIAS_AMARILLO ? "amarillo" : "verde");

// El color dice SI urge; este texto dice CUÁNTO. El color solo no reemplaza la
// cuenta mental, la esconde.
const textoDias = (dias) => (dias == null ? "" : dias < 0 ? `hace ${-dias} d` : dias === 0 ? "hoy" : `en ${dias} d`);

const $ = (sel) => document.querySelector(sel);
function status(t) { const el = $("[data-role=crm-status]"); if (el) el.textContent = t || ""; }

async function fetchAllRows(table, columns, filtro) {
  const out = []; let from = 0;
  for (;;) {
    let qb = supabase.from(table).select(columns);
    if (filtro) qb = filtro(qb);
    const { data, error } = await qb.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data); if (data.length < 1000) break; from += data.length;
  }
  return out;
}

// COMPROMISO CONSCIENTE: se traen TODAS las gestiones de cada caso para sacar la
// última, y todos los casos de todas las paritarias para poder contar las facetas
// en memoria. Con ~300 casos por paritaria y 2-4 paritarias por año, el techo está
// a años de distancia. Cuando moleste, la última gestión pasa a una vista en la
// base y la carga se acota por paritaria.
//
// El embed de grupos_clientes lleva la pista explícita !responsable_id porque
// crm_casos y clientes apuntan las dos a esa tabla: sin la pista, PostgREST no
// sabe por cuál de las dos relaciones tiene que ir.
const COLUMNAS = `
  id, estado, fecha_proxima_accion, created_at, cliente_id, responsable_id, paritaria_id,
  proxima_accion_id, proxima_accion_detalle, observaciones,
  clientes ( nombre ),
  grupos_clientes!responsable_id ( nombre, color ),
  crm_acciones!proxima_accion_id ( nombre, depende_de ),
  paritarias ( codigo, nombre ),
  crm_gestiones ( id, fecha, canal, descripcion, negociado_por_texto, cargado_por_email, created_at,
                  tipo_id, crm_gestion_tipos ( nombre ) )
`;

let CASOS = [];
// Notas de aumento CON PDF guardado. Clave: "cliente_id|paritaria_id", que es exactamente
// la identidad de un caso. Solo se traen las que tienen archivo: las demás no se muestran
// de ninguna forma, así que no hay para qué cargarlas.
const NOTAS_PDF = new Map();
// Lo que se está viendo ahora. Lo guarda render() para que la barra de acciones y
// la casilla del encabezado no tengan que recalcular el filtro en cada clic.
let FILAS = [];
// TODOS los responsables activos, no solo los que ya tienen casos: para asignar
// hace falta poder elegir a alguien que todavía no aparece en ninguno.
let RESPONSABLES = [];
// Próximas acciones configurables (crm_acciones). Solo las activas: una acción
// retirada sigue explicando casos viejos pero no se puede asignar de nuevo.
let ACCIONES = [];
// "Qué se hizo" en cada gestión. Es el campo agrupable de la bitácora: el canal es
// dato de color y por eso quedó opcional.
let TIPOS_GESTION = [];
// Casos tildados. Se PODA en cada render a lo que está a la vista (ver podarSeleccion).
const SELECCION = new Set();
// Casos con la fila de detalle abierta. NO se poda como la selección: es estado de
// lectura, no toca nada, y volver a un filtro anterior con lo que habías abierto
// todavía abierto es lo esperable.
const EXPANDIDOS = new Set();
// Conjunto vacío = SIN FILTRO en esa dimensión. Estado arranca con los abiertos.
//
// estados y responsables los comparten los CHIPS de la barra y los EMBUDOS de la
// tabla: son dos puertas al mismo cuarto. No hay un segundo estado que pueda
// quedar desincronizado, porque no hay un segundo estado.
//
// ult y prox son "con dato / sin dato": los valores posibles son "con" y "sin".
// Un filtro por rango de fechas no tendría sentido todavía — falta
// paritarias.plazo_aceptacion_tacita y hoy todas las fechas próximas son nulas.
// prox = ids de ACCIÓN; ult = ids de TIPO de gestión (más "__sin__" para los casos
// sin ninguna). vencimiento = las cuatro categorías del semáforo.
//
// El chip "Vencidos" NO es un filtro aparte: es un atajo que deja `vencimiento` en
// {vencida}. Dos puertas al mismo estado, igual que los chips de Estado y su embudo.
const F = {
  paritaria: "", texto: "",
  estados: new Set(ABIERTOS), responsables: new Set(),
  clientes: new Set(), ult: new Set(), prox: new Set(),
  depende: new Set(), vencimiento: new Set(),
};

// Un cliente puede tener DOS notas en la misma paritaria: la de la escala y la "virtual"
// (el aumento cargado a mano). Si las dos tienen PDF hay que elegir cuál se abre desde el
// caso, porque el caso es UNO solo. Gana la ENVIADA —es la que efectivamente vio el
// cliente— y, si empatan, la subida más tarde.
// Mismo criterio que mejorNota() en Precios y que crm_generar_casos en la base: un solo
// criterio en los tres lados, para que los tres muestren la misma nota.
function mejorNotaPdf(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ea = a.fecha_enviada || "", eb = b.fecha_enviada || "";
  if (ea !== eb) return ea > eb ? a : b;   // "" (sin enviar) pierde contra cualquier fecha
  return (a.pdf_subido_en || "") >= (b.pdf_subido_en || "") ? a : b;
}

// ORDEN de las gestiones, de la más NUEVA a la más vieja.
//
// UNA sola definición, y la usan los dos lugares que muestran gestiones: la columna
// "Últ. gestión" y el historial del panel. Con un criterio en cada lado, los dos
// pueden mostrar cosas distintas de los mismos datos — que es exactamente lo que
// estaba pasando.
//
// DESEMPATA POR created_at, y ahí estaba el bug: `fecha` es la del CONTACTO y
// empata seguido (dos llamados el mismo día es lo normal). Comparando solo por
// fecha, el ganador lo decidía el orden en que PostgREST devolvió el embebido, que
// no es cronológico. Por eso "Últ. gestión" mostraba la vieja.
function cmpGestionDesc(a, b) {
  const fa = String(a?.fecha ?? ""), fb = String(b?.fecha ?? "");
  if (fa !== fb) return fa < fb ? 1 : -1;
  const ca = String(a?.created_at ?? ""), cb = String(b?.created_at ?? "");
  return ca < cb ? 1 : ca > cb ? -1 : 0;
}

function ultimaGestion(caso) {
  const gs = caso.crm_gestiones || [];
  if (!gs.length) return null;
  return gs.reduce((a, b) => (cmpGestionDesc(a, b) <= 0 ? a : b));
}

const nomCliente = (c) => c.clientes?.nombre || "(cliente borrado)";
// Con responsable_id pero sin fila embebida, el responsable fue borrado. Se
// NOMBRA, no se deja en blanco: una celda vacia se lee como una falla de la
// pantalla, un texto se lee como el dato que es. Mismo criterio que el chip.
const nomResp = (c) => c.grupos_clientes?.nombre || (c.responsable_id ? "(responsable borrado)" : "");
const colorResp = (c) => c.grupos_clientes?.color || null;
const claveResp = (c) => c.responsable_id || SIN_RESP;
// De quién depende que el caso avance. Null si no tiene acción pendiente o si la
// acción todavía no está clasificada ("Otro").
const dependeDe = (c) => c.crm_acciones?.depende_de || null;
// Vencido = la fecha tope ya pasó. No depende de plazo_aceptacion_tacita: esa
// fecha la carga Comercial. Son dos vencimientos distintos.
const estaVencida = (c) => bucketVenc(c) === "vencida";

// Las cuatro categorías del vencimiento. Son EXACTAMENTE las del semáforo, más
// "sin agenda": si el filtro usara cortes distintos de los colores, filtrarías por
// una cosa y verías otra.
const VENCIMIENTOS = [
  ["vencida", "Vencidas"],
  ["acerca", `Se acercan (${DIAS_AMARILLO} días o menos)`],
  ["adelante", "Más adelante"],
  ["sin", "Sin agenda"],
];
function bucketVenc(c) {
  const d = diasHasta(c.fecha_proxima_accion);
  if (d == null) return "sin";
  return d < 0 ? "vencida" : d <= DIAS_AMARILLO ? "acerca" : "adelante";
}

// Última gestión: su TIPO, o "__sin__" si el caso no tiene ninguna.
const SIN_GESTION = "__sin__";
const claveUlt = (c) => {
  const g = ultimaGestion(c);
  return g ? (g.tipo_id || SIN_GESTION) : SIN_GESTION;
};
const nomParitaria = (c) => {
  const p = c.paritarias;
  if (!p) return "(sin paritaria)";
  return p.codigo ? `${p.codigo} · ${p.nombre}` : p.nombre;
};

// omitir = dimensión que NO se aplica, para poder contar las facetas de esa misma.
function pasa(c, omitir) {
  if (omitir !== "paritaria" && F.paritaria && c.paritaria_id !== F.paritaria) return false;
  if (omitir !== "texto" && F.texto && !nomCliente(c).toLowerCase().includes(F.texto)) return false;
  if (omitir !== "estado" && F.estados.size && !F.estados.has(c.estado)) return false;
  if (omitir !== "responsable" && F.responsables.size && !F.responsables.has(claveResp(c))) return false;
  if (omitir !== "cliente" && F.clientes.size && !F.clientes.has(c.cliente_id)) return false;
  if (omitir !== "ult" && F.ult.size && !F.ult.has(claveUlt(c))) return false;
  if (omitir !== "prox" && F.prox.size && !F.prox.has(c.proxima_accion_id)) return false;
  // Omitir "prox" omite TAMBIÉN el vencimiento: los dos salen del mismo embudo, así
  // que para contar sus facetas hay que sacar el control entero, no media mitad.
  if (omitir !== "vencimiento" && omitir !== "prox"
      && F.vencimiento.size && !F.vencimiento.has(bucketVenc(c))) return false;
  if (omitir !== "depende" && F.depende.size && !F.depende.has(dependeDe(c))) return false;
  return true;
}

function contar(omitir, clave) {
  const m = new Map();
  for (const c of CASOS) if (pasa(c, omitir)) m.set(clave(c), (m.get(clave(c)) || 0) + 1);
  return m;
}

function ordenar(casos) {
  return casos.sort((a, b) => {
    const fa = a.fecha_proxima_accion, fb = b.fecha_proxima_accion;
    if (fa !== fb) {
      if (!fa) return 1;      // los nulos al final...
      if (!fb) return -1;
      return fa < fb ? -1 : 1;
    }
    return nomCliente(a).localeCompare(nomCliente(b), "es");   // ...y dentro, alfabético
  });
}

// Un chip en cero se ATENÚA pero sigue clickeable. Deshabilitarlo dejaba trabado
// al que se deseleccionaba y caía a cero, y se sentía como una falla: apretás un
// botón y perdés la posibilidad de volver atrás, sin ninguna señal de que es a
// propósito. Es peor perder el control que apretar un filtro que no cambia nada.
//
// bg = fondo ya resuelto del color propio (responsables), o nada si esa dimension
// no tiene color (estados, "sin asignar"). El PUNTO se ve siempre, apretado o no,
// para poder asociar responsable y color sin tener que activar el filtro. El
// RELLENO reemplaza al azul genérico solo cuando esta apretado: si se pintara
// siempre, no se distinguiria un filtro puesto de uno que no.
function chip(dim, val, txt, n, activo, bg) {
  const cero = (!n && !activo) ? " crm-chip-cero" : "";
  const estilo = (bg && activo) ? ` style="background:${bg};border-color:${bg};color:${textoContraste(bg)}"` : "";
  // El punto va SIEMPRE con su color propio: apretado no se ve, porque el CSS lo
  // oculta (el chip entero ya ES ese color y el punto sobraria).
  const punto = bg ? `<span class="crm-chip-punto" style="background:${bg}"></span>` : "";
  return `<button class="crm-chip${cero}" data-dim="${dim}" data-val="${esc(val)}" aria-pressed="${activo}"${estilo}>`
       + punto + `${esc(txt)}<span class="crm-chip-n">${n}</span></button>`;
}

// Meta-chips: hacen VISIBLE el estado "sin filtro", que si no es invisible (una
// fila sin nada prendido no dice nada). Con esto los dos grupos tienen la misma
// estructura y la misma regla, aunque arranquen con valores distintos.
function chipMeta(meta, txt, n, activo, sep) {
  return `<button class="crm-chip${sep ? " crm-chip-sep" : ""}" data-meta="${meta}" aria-pressed="${activo}">`
       + `${esc(txt)}<span class="crm-chip-n">${n}</span></button>`;
}

const esAbiertos = () => F.estados.size === ABIERTOS.length && ABIERTOS.every((e) => F.estados.has(e));

// ---- Limpiar filtros ----
// Vuelve al ESTADO INICIAL, no a "sin ningún filtro": la lista de trabajo diaria es
// «Abiertos» sobre la paritaria vigente. Ver todo ya tiene su propio control (el
// chip «Todos» de Estado y «(todas)» en Paritaria); volver a la lista de trabajo no
// lo tenía, y es lo que se necesita después de perderse entre filtros.
let PARITARIA_INICIAL = "";

// Se pregunta por dimSinFiltro y no por `size`: ahora "sin filtro" puede estar
// guardado como vacío O como la lista completa (si tildaste todo a mano), y las dos
// formas son el mismo estado. Mirando solo el tamaño, el botón quedaría habilitado
// sin tener nada que limpiar.
const esEstadoInicial = () => F.paritaria === PARITARIA_INICIAL && !F.texto && esAbiertos()
  && dimSinFiltro("responsable") && dimSinFiltro("cliente") && dimSinFiltro("ult") && dimSinFiltro("prox")
  && dimSinFiltro("depende") && dimSinFiltro("vencimiento");

function limpiarFiltros() {
  F.paritaria = PARITARIA_INICIAL;
  F.texto = "";
  F.estados = new Set(ABIERTOS);
  F.responsables = new Set(); F.clientes = new Set(); F.ult = new Set(); F.prox = new Set();
  F.depende = new Set(); F.vencimiento = new Set();
  // El buscador es el único control que no se repinta solo (los chips y el select
  // se rearman en cada render, el input conserva lo tipeado).
  const inp = $("[data-role=f-texto]"); if (inp) inp.value = "";
  render();
}

// Responsables presentes en los casos, con su nombre y su fondo ya resuelto.
// LO USAN LOS CHIPS Y EL EMBUDO: una sola fuente, así las dos puertas ofrecen
// exactamente las mismas opciones en el mismo orden.
//
// bg se resuelve acá y no en quien lo pinta: "sin asignar" va SIN color a propósito
// (no es un responsable, es la ausencia de uno), mientras un responsable real sin
// color cargado sí lleva el gris neutro, igual que en Precios.
function respsOrdenados() {
  const m = new Map([[SIN_RESP, { nom: "— sin asignar", bg: null }]]);
  for (const c of CASOS) if (c.responsable_id) m.set(c.responsable_id, { nom: nomResp(c), bg: fondoEtq(colorResp(c)) });
  return [...m.entries()].sort((a, b) => (a[0] === SIN_RESP ? 1 : b[0] === SIN_RESP ? -1 : a[1].nom.localeCompare(b[1].nom, "es")));
}

// Clientes presentes en los casos. Se ofrece el nombre REAL, no el abreviado: el
// buscador del popup compara contra el texto que ve, y con "Cons. Prop." escrito
// buscar "consorcio" no encontraría nada.
function clientesOrdenados() {
  const m = new Map();
  for (const c of CASOS) if (c.cliente_id && !m.has(c.cliente_id)) m.set(c.cliente_id, nomCliente(c));
  return [...m.entries()].map(([val, nombre]) => ({ val, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function pintarFiltros() {
  // --- Paritaria (select, con el conteo al lado) ---
  const cP = contar("paritaria", (c) => c.paritaria_id);
  const paris = new Map();
  for (const c of CASOS) if (!paris.has(c.paritaria_id)) paris.set(c.paritaria_id, nomParitaria(c));
  const sel = $("[data-role=f-paritaria]");
  sel.innerHTML = `<option value="">(todas) — ${CASOS.length}</option>`
    + [...paris.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], "es"))
        .map(([id, nom]) => `<option value="${esc(id)}"${id === F.paritaria ? " selected" : ""}>${esc(nom)} — ${cP.get(id) || 0}</option>`)
        .join("");

  // --- Estados ---
  const cE = contar("estado", (c) => c.estado);
  const totE = [...cE.values()].reduce((a, b) => a + b, 0);
  const totAb = ABIERTOS.reduce((a, e) => a + (cE.get(e) || 0), 0);
  const marcE = marcadosDim("estado");
  $("[data-role=f-estados]").innerHTML =
    chipMeta("estado-todos", "Todos", totE, dimSinFiltro("estado"), false)
    + chipMeta("estado-abiertos", "Abiertos", totAb, esAbiertos(), true)
    + ESTADOS.map((e) => chip("estado", e, ESTADO_TXT[e], cE.get(e) || 0, marcE.has(e))).join("");

  // --- Responsables ---
  const cR = contar("responsable", claveResp);
  const orden = respsOrdenados();
  const totR = [...cR.values()].reduce((a, b) => a + b, 0);
  const marcR = marcadosDim("responsable");
  $("[data-role=f-responsables]").innerHTML =
    chipMeta("resp-todos", "Todos", totR, dimSinFiltro("responsable"), true)
    + orden.map(([k, r]) => chip("responsable", k, r.nom, cR.get(k) || 0, marcR.has(k), r.bg)).join("");

  // --- Agenda: vencidos + de quién depende ---
  // Vencidos se cuenta sobre el conjunto filtrado por las OTRAS dimensiones, igual
  // que el resto: el número del chip tiene que ser la promesa de lo que vas a ver.
  const nVenc = CASOS.filter((c) => pasa(c, "vencimiento") && estaVencida(c)).length;
  // El chip es un ATAJO de un valor del embudo, no un filtro aparte: está prendido
  // cuando el vencimiento es exactamente "vencidas".
  const soloVencidas = F.vencimiento.size === 1 && F.vencimiento.has("vencida");
  const cD = contar("depende", dependeDe);
  const marcD = marcadosDim("depende");
  const totD = ["nosotros", "terceros"].reduce((a, k) => a + (cD.get(k) || 0), 0);
  // Dos cosas distintas caen en "sin naturaleza", y hay que separarlas:
  //   · el caso TIENE acción pendiente pero no está clasificada (hoy, "Otro")
  //   · el caso NO tiene ninguna acción pendiente -> está vivo y sin agenda, que es
  //     un problema en sí mismo, no una categoría de acción
  // Contarlos juntos daría un número que no significa nada.
  const conAccion = CASOS.filter((c) => pasa(c, "depende") && c.proxima_accion_id);
  const sinClasif = conAccion.filter((c) => !dependeDe(c)).length;
  const sinAgenda = CASOS.filter((c) => pasa(c, "depende")
    && !c.proxima_accion_id && !CIERRAN.includes(c.estado)).length;
  $("[data-role=f-agenda]").innerHTML =
    chipMeta("venc", "Vencidos", nVenc, soloVencidas, true)
    + chipMeta("dep-todos", "Todas", totD, dimSinFiltro("depende"), false)
    + chip("depende", "nosotros", "Mi trabajo", cD.get("nosotros") || 0, marcD.has("nosotros"))
    + chip("depende", "terceros", "Esperando a terceros", cD.get("terceros") || 0, marcD.has("terceros"))
    + (sinClasif ? `<span class="crm-chip-nota" title="Su acción pendiente todavía no está clasificada (hoy, «Otro»)">${sinClasif} sin clasificar</span>` : "")
    // Un caso vivo sin agenda no le aparece a nadie. Se avisa acá porque ningún
    // filtro de naturaleza lo va a mostrar: no tiene naturaleza, no tiene acción.
    + (sinAgenda ? `<span class="crm-chip-nota crm-chip-alerta" title="Casos vivos sin ninguna próxima acción: no le aparecen a nadie en la agenda">${sinAgenda} sin agenda</span>` : "");
}

// ---- Embudos por columna ----
// Abren el popup compartido (js/shared/filtro-popup.js), que no sabe qué se está
// filtrando: recibe opciones y devuelve lo tildado.
//
// Estado y Responsable escriben en los MISMOS conjuntos que los chips de la barra.
// Por eso tildar en el embudo prende el chip y al revés, sin ningún código de
// sincronización: no hay dos estados que puedan discrepar, hay uno.
// "depende" no tiene embudo (se filtra con chips), pero entra igual para que use la
// misma convención de "vacío = todos" que el resto.
const DIM_EMBUDO = { cliente: "clientes", estado: "estados", responsable: "responsables",
                     ult: "ult", prox: "prox", depende: "depende", vencimiento: "vencimiento" };

// ---- Vacío = TODOS ----
// Por dentro, "sin filtro" se guarda como conjunto vacío, y así se queda: `pasa()`
// NO cambia, porque filtrar con el conjunto completo da exactamente las mismas filas
// que no filtrar. Lo que cambia es cómo se MUESTRA: un conjunto vacío se dibuja con
// todo marcado, que es la verdad —los estás viendo a todos— en vez de con nada
// marcado, que se leía como "veo todo pero no elegí nada".

// Valores posibles de cada dimensión. Hace falta para poder dibujar "todos".
function valoresDim(col) {
  if (col === "estado") return ESTADOS;
  if (col === "responsable") return respsOrdenados().map(([k]) => k);
  if (col === "cliente") return clientesOrdenados().map((o) => o.val);
  if (col === "depende") return ["nosotros", "terceros"];
  if (col === "vencimiento") return VENCIMIENTOS.map(([v]) => v);
  if (col === "prox") return ACCIONES.map((a) => a.id);
  if (col === "ult") return [...TIPOS_GESTION.map((t) => t.id), SIN_GESTION];
  return [];
}

// Lo que hay que dibujar marcado: el conjunto tal cual, o la lista completa si está
// vacío. Es la única traducción entre el estado interno y lo que se ve.
function marcadosDim(col) {
  const set = F[DIM_EMBUDO[col]];
  return (set && set.size) ? set : new Set(valoresDim(col));
}

// "No excluye nada": ni el vacío ni el completo restringen. Es la condición del chip
// «Todos», y por eso ahora también se prende si tildaste todos los valores a mano.
function dimSinFiltro(col) {
  const set = F[DIM_EMBUDO[col]];
  if (!set || set.size === 0) return true;
  return valoresDim(col).every((v) => set.has(v));
}

// "Está filtrando" = esta dimensión OCULTA FILAS. No alcanza con que excluya
// valores posibles: «Abiertos» deja afuera Precerrada y Cerrada, pero si no hay
// ningún caso en esos dos estados no se oculta nada, y el dorado estaría avisando
// de un filtro que no filtra.
//
// Es el mismo criterio que el azul de los nombres —hay filas ocultas— pero por
// dimensión: se cuenta cuántas filas se ven con TODOS los filtros contra cuántas se
// verían sin ESTE. Si el número no cambia, esta columna no está escondiendo nada.
function dimFiltra(col) {
  const set = F[DIM_EMBUDO[col]];
  if (!set || set.size === 0) return false;   // vacío = sin filtro; atajo, no cambia el resultado
  let con = 0, sin = 0;
  for (const c of CASOS) {
    if (!pasa(c, col)) continue;              // lo que ya descartan las OTRAS dimensiones no cuenta
    sin++;
    if (pasa(c, null)) con++;
  }
  return con < sin;
}

// Dorado en las columnas con filtro puesto. Sin esto no habría forma de saber que
// una columna está filtrando sin abrir su popup de a uno.
function pintarEmbudos() {
  document.querySelectorAll("table[data-role=tabla-casos] .funnel").forEach((f) => {
    f.classList.toggle("activo", dimFiltra(f.dataset.fcol));
  });
}

function abrirEmbudo(f) {
  const col = f.dataset.fcol, dim = DIM_EMBUDO[col];
  if (!dim) return;
  const abrir = (titulo, opciones) => abrirPopupLista(f, {
    // Mismo criterio que los chips: sin filtro se abre con TODO tildado. Si el popup
    // mostrara todo vacío mientras los chips muestran todo marcado, cambiaríamos una
    // contradicción por otra. Es además cómo se comportan los filtros de Excel.
    titulo, opciones, marcados: marcadosDim(col),
    // El popup devuelve un conjunto nuevo; se reemplaza el anterior y se repinta
    // todo. Los chips leen F en cada render, así que se actualizan solos.
    onAplicar: (vals) => { F[dim] = vals; render(); },
    onLimpiar: () => { F[dim] = new Set(); render(); },
  });

  if (col === "cliente") abrir("Cliente", clientesOrdenados());
  else if (col === "estado") abrir("Estado", ESTADOS.map((e) => ({ val: e, nombre: ESTADO_TXT[e] })));
  else if (col === "responsable") abrir("Responsable", respsOrdenados().map(([val, r]) => ({ val, nombre: r.nom, color: r.bg })));
  else if (col === "ult") {
    // Por TIPO de gestión, que es lo que la columna muestra. "con/sin gestiones" no
    // respondía ninguna pregunta real.
    abrir("Últ. gestión", [
      ...TIPOS_GESTION.map((t) => ({ val: t.id, nombre: t.nombre })),
      { val: SIN_GESTION, nombre: "— sin gestiones" },
    ]);
  } else if (col === "prox") {
    // DOS SECCIONES en un solo embudo: arriba el vencimiento, abajo las acciones.
    // Son dos atributos de la MISMA celda —el punto y el nombre—, así que separarlos
    // en dos columnas partiría en la pantalla lo que se lee junto.
    //
    // El encabezado usa el hueco `encabezado` del módulo compartido, que existe
    // desde que se extrajo justamente para este caso (los radios del filtro de
    // Coordinador en Precios). Sus casillas quedan FUERA de .fp-list, así que el
    // buscador y "Seleccionar todos" no las tocan — que es lo correcto.
    const marcV = marcadosDim("vencimiento");
    const enc = `<div class="fp-sub">Vencimiento</div>`
      + VENCIMIENTOS.map(([v, t]) =>
          `<label class="fp-venc"><input type="checkbox" data-venc="${v}"${marcV.has(v) ? " checked" : ""} />${esc(t)}</label>`
        ).join("")
      + `<div class="fp-sub">Acción</div>`;
    abrirPopupLista(f, {
      titulo: "Próxima acción",
      encabezado: enc,
      opciones: ACCIONES.map((a) => ({ val: a.id, nombre: a.nombre })),
      marcados: marcadosDim("prox"),
      // El segundo argumento es el nodo del popup: es lo que permite leer los
      // controles del encabezado, que no son parte de la lista.
      onAplicar: (vals, pop) => {
        F.prox = vals;
        const marcadas = [...pop.querySelectorAll("[data-venc]")].filter((i) => i.checked).map((i) => i.dataset.venc);
        // Todas tildadas equivale a ninguna: las dos formas son "sin filtro".
        F.vencimiento = new Set(marcadas.length === VENCIMIENTOS.length ? [] : marcadas);
        render();
      },
      onLimpiar: () => { F.prox = new Set(); F.vencimiento = new Set(); render(); },
    });
  }
}

// Panel de la fila expandida. SOLO LECTURA: acá se lee lo que se cargó, no se
// escribe. Escribir va a ser el caso individual.
//
// Existe porque `observaciones` se apila con fecha y crece sin techo: en una celda
// no entra, y en un globito de hover no se puede leer con calma ni copiar.
function panelDetalle(c) {
  const accNom = c.crm_acciones?.nombre || "";
  const det = c.proxima_accion_detalle || "";
  // Cada línea del historial viene como "AAAA-MM-DD - texto" (la arma el RPC).
  // Se parte para poder mostrar la fecha en formato local y alineada.
  const lineas = String(c.observaciones || "").split("\n").map((s) => s.trim()).filter(Boolean);

  const prox = accNom
    ? `<div class="crm-det-linea"><b>${esc(accNom)}</b>`
      + (c.fecha_proxima_accion ? ` · vence el <span class="crm-fecha">${esc(fmtFecha(c.fecha_proxima_accion))}</span>` : "")
      + (det ? `<div class="crm-det-sub">${esc(det)}</div>` : "")
      + `</div>`
    : `<div class="crm-det-vacio">Sin próxima acción cargada.</div>`;

  const hist = lineas.length
    ? `<ul class="crm-det-obs">` + lineas.map((l) => {
        const m = l.match(/^(\d{4}-\d{2}-\d{2})\s*-\s*([\s\S]*)$/);
        return m
          ? `<li><span class="crm-fecha">${esc(fmtFecha(m[1]))}</span> ${esc(m[2])}</li>`
          : `<li>${esc(l)}</li>`;
      }).join("") + `</ul>`
    : `<div class="crm-det-vacio">Sin observaciones todavía.</div>`;

  // Gestiones: de la más nueva a la más vieja. La columna solo muestra la última;
  // acá está la conversación entera.
  // Mismo criterio que la columna: fecha del contacto y, si empata, cuándo se cargó.
  const gs = [...(c.crm_gestiones || [])].sort(cmpGestionDesc);
  const ges = gs.length
    ? `<ul class="crm-det-ges">` + gs.map((g) => {
        // Vacío = lo negoció quien lo cargó. Es la convención que se anuncia en el
        // formulario, así que acá se escribe en vez de dejar el hueco.
        const quien = g.negociado_por_texto || g.cargado_por_email || "";
        // El tipo va en negrita —es lo que se hizo—; el canal, entre paréntesis y
        // solo si está, porque es opcional.
        const canal = g.canal ? ` (${CANAL_TXT[g.canal] || g.canal})` : "";
        return `<li><span class="crm-fecha">${esc(fmtFecha(g.fecha))}</span>`
          + ` · <b>${esc(g.crm_gestion_tipos?.nombre || "(sin tipo)")}</b>${esc(canal)}`
          + ` — ${esc(g.descripcion || "")}`
          + (quien ? `<div class="crm-det-sub">negoció: ${esc(quien)}</div>` : "")
          + `</li>`;
      }).join("") + `</ul>`
    : `<div class="crm-det-vacio">Sin gestiones registradas.</div>`;

  // "Corregir" solo si hay algo que corregir y el caso sigue vivo. Es la excepción
  // —mover una fecha sin haber hecho nada—; el camino normal es avanzar el caso
  // desde la celda.
  const btnCorregir = (accNom && !CIERRAN.includes(c.estado))
    ? `<button type="button" class="crm-det-btn" data-role="det-corregir" data-caso="${esc(c.id)}">corregir</button>`
    : "";

  return `<div class="crm-det">`
    + `<div class="crm-det-tit">Próxima acción${btnCorregir}</div>${prox}`
    + `<div class="crm-det-tit">Gestiones`
    + `<button type="button" class="crm-det-btn" data-role="det-gestion" data-caso="${esc(c.id)}">+ Anotar gestión</button>`
    + `</div>${ges}`
    + `<div class="crm-det-tit">Historial de observaciones</div>${hist}`
    + `</div>`;
}

// 📄 de la nota, SOLO si este caso tiene su PDF guardado en Storage. Sin archivo no se
// pinta nada: las notas viejas se generaron antes de que el sistema las guardara y no
// hay nada que abrir, así que tampoco hay nada que avisar.
//
// VA EN LA CELDA DE ESTADO, NO EN LA DEL CLIENTE. En Cliente el ícono se perdía: el
// nombre largo se corta con puntos suspensivos y el 📄 desaparecía con él, justo en las
// filas donde el nombre más ocupa. La columna Estado lleva un cartucho de ancho topeado,
// así que el borde derecho SIEMPRE queda libre.
// Lo ancla el CSS contra ese borde derecho; el espacio se reserva en TODAS las celdas de
// la columna, tengan ícono o no. Mismo criterio que el 📄 de la columna Nota de Precios.
function iconoNotaPdf(c) {
  if (!NOTAS_PDF.has(`${c.cliente_id}|${c.paritaria_id}`)) return "";
  return `<span class="crm-nota-pdf" data-nota="${esc(c.cliente_id)}|${esc(c.paritaria_id)}" title="Ver la nota de aumento (PDF)">📄</span>`;
}

// Abre la nota del caso. El PDF es el MISMO archivo que abre la columna Nota de Precios:
// se guarda una sola vez al generar la tanda y se mira desde los dos lados.
async function verNotaCaso(clave) {
  const n = NOTAS_PDF.get(clave);
  if (!n?.pdf_path) return;
  await abrirDocStorage(supabase, n.pdf_path, (err) => status("No se pudo abrir la nota. " + (err?.message || err)));
}

function pintarTabla(filas) {
  const tbody = $("[data-role=tabla-casos] tbody");
  if (!filas.length) {
    const vacioPorFiltro = CASOS.length > 0;
    tbody.innerHTML = `<tr><td colspan="6" class="crm-vacio">`
      + (vacioPorFiltro
          ? `Ningún caso cumple el filtro. Probá ampliar los estados o limpiar la búsqueda.`
          : `No hay casos todavía. Se crean al marcar las notas como enviadas, o con el botón «Crear» del cuadro de notas de Precios.`)
      + `</td></tr>`;
    return;
  }
  tbody.innerHTML = filas.map((c) => {
    const ug = ultimaGestion(c);
    const cli = nomCliente(c);
    const abierto = EXPANDIDOS.has(c.id);
    const tdResp = c.responsable_id
      ? `<td class="crm-resp" data-caso="${esc(c.id)}" title="Asignar responsable a este caso">${chipEtq(nomResp(c), colorResp(c), "crm-etq")}</td>`
      // Sin color, pero con la MISMA caja que el cartucho: como texto suelto medía
      // menos y la fila quedaba mas baja que las que si tienen responsable.
      : `<td class="crm-resp" data-caso="${esc(c.id)}" title="Asignar responsable a este caso"><span class="crm-etq crm-etq-vacio">— sin asignar</span></td>`;
    // Celda-acción: el clic abre el formulario para ANOTAR, no el historial. Anotar
    // es lo que se hace seguido; el historial ya se lee en el panel expandido.
    // Vale también cuando dice "sin gestiones", que es justo el caso donde más
    // falta anotar una.
    // Se muestra QUÉ SE HIZO, no el canal: el canal es dato de color y encima
    // ahora puede estar vacío. El canal queda en el panel expandido.
    const ugTxt = ug ? (ug.crm_gestion_tipos?.nombre || CANAL_TXT[ug.canal] || "") : "";
    const tdUlt = ug
      ? `<td class="crm-ult" data-caso="${esc(c.id)}" title="Anotar una gestión"><span class="crm-fecha">${esc(fmtFecha(ug.fecha))}</span> · ${esc(ugTxt)}</td>`
      : `<td class="crm-ult crm-vacio" data-caso="${esc(c.id)}" title="Anotar una gestión">sin gestiones</td>`;
    // Próxima acción: la ACCIÓN y la fecha. Antes mostraba solo la fecha, y la
    // acción —que es el campo agrupable, el que existe para poder contar cuántos
    // casos esperan al Consejo— era el único dato que no se veía en ningún lado.
    // El detalle va en el title, con una marca visible: un hover que no se anuncia
    // es un dato escondido.
    const accNom = c.crm_acciones?.nombre || "";
    const accDet = c.proxima_accion_detalle || "";
    // Celda-acción, salvo en los que no tienen agenda: un precerrado o un cerrado
    // no se reagenda, así que la celda no se ofrece como clickeable. Si se ofreciera,
    // el RPC lo saltearía y el clic no haría nada visible.
    const agendable = !SIN_AGENDA.includes(c.estado);
    const attrProx = agendable ? ` data-caso="${esc(c.id)}" title="Cambiar la próxima acción (no cambia el estado)"` : "";
    const claseProx = agendable ? "crm-prox" : "crm-prox-fija";
    let tdProx;
    if (!c.fecha_proxima_accion && !accNom) {
      tdProx = `<td class="${claseProx} crm-vacio"${attrProx}>—</td>`;
    } else {
      // DOS SEÑALES EN LA MISMA CELDA, en lugares distintos y a propósito:
      // la FECHA lleva el semáforo (responde cuándo) y la ACCIÓN lleva el punto de
      // quién depende (responde de quién). Así no compiten entre sí.
      const dias = diasHasta(c.fecha_proxima_accion);
      const sem = semaforo(dias);
      // El semáforo va como PUNTO y a la IZQUIERDA de todo: se lee de izquierda a
      // derecha, y lo primero que hay que saber es si urge. El color del texto se
      // dejó neutro — con el punto grande alcanza, y así el naranja de la
      // naturaleza no compite contra una fecha pintada.
      const tsem = sem === "rojo" ? "Vencida" : sem === "amarillo" ? "Se acerca" : "Falta tiempo";
      const fh = c.fecha_proxima_accion
        ? `<span class="crm-sem crm-sem-${sem}" title="${tsem}"></span>`
          + `<span class="crm-fecha">${esc(fmtFecha(c.fecha_proxima_accion))}</span>`
          + `<span class="crm-dias">(${esc(textoDias(dias))})</span>`
        : "";
      const dep = dependeDe(c);
      const punto = accNom
        ? `<span class="crm-dep crm-dep-${dep || "nada"}" title="${dep === "nosotros" ? "Depende de nosotros" : dep === "terceros" ? "Estamos esperando a un tercero" : "Sin clasificar"}"></span>`
        : "";
      const tit = [accNom, accDet].filter(Boolean).join(" — ");
      tdProx = `<td class="${claseProx}"${attrProx}${(!agendable && tit) ? ` title="${esc(tit)}"` : ""}>`
        + fh + (fh && accNom ? " · " : "") + punto + esc(accNom)
        + (accDet ? ` <span class="crm-prox-det" title="Tiene detalle">✎</span>` : "")
        + `</td>`;
    }
    return `<tr>`
      + `<td class="crm-sel"><input type="checkbox" data-caso="${esc(c.id)}"${SELECCION.has(c.id) ? " checked" : ""} /></td>`
      // La flechita es un control PROPIO: expande solo ella. El resto de la fila
      // queda libre para la selección — un clic que a veces selecciona y a veces
      // expande es peor que dos controles separados.
      // Se pinta el nombre acortado, pero el title lleva el COMPLETO: la abreviatura
      // es solo visual y el nombre real tiene que seguir estando a un hover.
      + `<td class="crm-cliente" title="${esc(cli)}">`
      + `<span class="crm-exp" data-exp="${esc(c.id)}" title="Ver el detalle">${abierto ? "▼" : "▶"}</span>`
      + `${esc(acortarNombre(cli))}</td>`
      // Celda-acción: el clic cambia el estado de ESTE caso. Es la versión
      // individual del botón en bloque, mismo modal y mismas reglas.
      // El 📄 de la nota vive DENTRO de esta celda, anclado por CSS a su borde
      // derecho. Que esté dentro de una celda-acción no lo vuelve ambiguo: el
      // listener del tbody atiende [data-nota] ANTES que td.crm-est.
      + `<td class="crm-est" data-caso="${esc(c.id)}" title="Cambiar el estado de este caso">`
      + `<span class="crm-badge crm-e-${esc(c.estado)}">${esc(ESTADO_TXT[c.estado] || c.estado)}</span>${iconoNotaPdf(c)}</td>`
      + tdResp + tdUlt + tdProx
      + `</tr>`
      // La fila de detalle va como una fila más, debajo de la suya. No es un
      // panel flotante: así acompaña el scroll y no tapa nada.
      + (abierto ? `<tr class="crm-detalle"><td colspan="6">${panelDetalle(c)}</td></tr>` : "");
  }).join("");
}

// ---- Selección y acciones en bloque ----
//
// LA SELECCIÓN SE PODA A LO VISIBLE en cada repintado. Si no, el botón diría "60
// seleccionados" mientras en pantalla hay 12, y una acción en bloque tocaría 48
// casos que no estás mirando: es la forma más fácil de precerrar por accidente.
// El costo es que tocar un filtro pierde la selección; es el lado correcto para
// equivocarse.
function podarSeleccion(filas) {
  if (!SELECCION.size) return;
  const visibles = new Set(filas.map((c) => c.id));
  for (const id of SELECCION) if (!visibles.has(id)) SELECCION.delete(id);
}

// Mensaje del resultado de la última acción. `alerta` lo pinta en ámbar: se usa
// cuando la base tocó menos casos de los seleccionados.
function accMsg(txt, alerta = false) {
  const el = $("[data-role=acc-msg]");
  if (!el) return;
  el.textContent = txt || "";
  el.classList.toggle("crm-acc-alerta", !!alerta);
}

function pintarAcciones(filas) {
  const n = SELECCION.size;
  const et = $("[data-role=sel-n]");
  if (et) {
    et.textContent = n ? `${n} de ${filas.length} seleccionados` : "Ningún caso seleccionado";
    et.classList.toggle("crm-acc-hay", n > 0);
  }
  for (const r of ["acc-estado", "acc-resp", "sel-limpiar"]) {
    const b = $(`[data-role=${r}]`);
    if (b) b.disabled = n === 0;
  }
  const todos = $("[data-role=sel-todos]");
  if (todos) {
    todos.disabled = filas.length === 0;
    todos.checked = filas.length > 0 && n === filas.length;
    // Estado a medias: ni vacía ni llena. Es lo que distingue "algunos" de
    // "ninguno", que con solo dos estados se confunden.
    todos.indeterminate = n > 0 && n < filas.length;
  }
}

// Marca o desmarca las casillas ya dibujadas, sin repintar la tabla entera: con
// 300 filas, repintar en cada clic se nota.
function sincroCasillas() {
  document.querySelectorAll("[data-role=tabla-casos] tbody input[data-caso]")
    .forEach((chk) => { chk.checked = SELECCION.has(chk.dataset.caso); });
}

// Los RPC del CRM levantan mensajes en castellano pensados para leerse tal cual,
// con su hint. Mostrarlos crudos es mejor que traducirlos a un genérico.
const msgError = (e) => [e?.message, e?.hint].filter(Boolean).join(" — ")
  || "No se pudo completar la acción.";

const cerrarModalAcc = () => { const m = $("[data-role=modal-acc]"); if (m) m.hidden = true; };

// Error de validación DENTRO del modal. No puede ir a la barra de acciones: el
// modal la tapa, así que el aviso quedaría escrito detrás de lo que el usuario
// está mirando y parecería que el botón no hizo nada.
function modalErr(txt) {
  const el = $("[data-role=modal-err]");
  if (el) el.textContent = txt || "";
}

// Igual que el de estado: con la barra son los seleccionados, con un clic en la
// celda es ese caso y nada más.
let CASOS_RESP = [];

function abrirModalResp(ids) {
  CASOS_RESP = (ids && ids.length) ? ids : [...SELECCION];
  const n = CASOS_RESP.length;
  if (!n) return;
  const uno = n === 1 ? CASOS.find((x) => x.id === CASOS_RESP[0]) : null;
  const box = $("[data-role=modal-acc-box]");
  box.innerHTML = `<div class="cfm-titulo">Asignar responsable</div>`
    + `<div class="crm-modal-msg">`
    + (uno ? esc(nomCliente(uno)) : `Se va a asignar a <b>${n}</b> casos.`)
    + `</div>`
    + `<label class="crm-modal-fila">Responsable`
    + `<select data-role="ma-resp"><option value="">(elegí uno)</option>`
    + RESPONSABLES.map((r) => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join("")
    + `</select></label>`
    + `<label class="crm-modal-chk"><input type="checkbox" data-role="ma-pisar" />`
    + ` Pisar el responsable que ya tengan los clientes</label>`
    + `<div class="crm-modal-nota">Esta acción <b>también escribe en la ficha del cliente</b>, no solo en los casos. `
    + `A los clientes que no tengan responsable se les completa <b>siempre</b>. `
    + `A los que ya tengan otro, solo si marcás la casilla de arriba.</div>`
    + `<div class="crm-modal-err" data-role="modal-err"></div>`
    + `<div class="cfm-acc"><button type="button" data-role="ma-no">Cancelar</button>`
    + `<button type="button" data-role="ma-si" class="cfm-si">Asignar</button></div>`;
  $("[data-role=modal-acc]").hidden = false;
  box.querySelector("[data-role=ma-resp]")?.focus();
}

// ---- Anotar gestión ----
//
// El caso sobre el que se está anotando. El modal es uno solo para todas las
// acciones, así que hay que recordar de dónde salió.
let CASO_GESTION = null;

// Fecha de HOY en hora local. NO se usa toISOString(): devuelve la fecha en UTC,
// y después de las 21:00 en Argentina eso ya es el día siguiente — la gestión
// nacería fechada mañana.
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Hoy + n días, en hora local. Se usa como valor por defecto de la fecha tope: un
// campo vacío obliga a pensar una fecha en cada eslabón, y lo que se necesita es
// que el caso vuelva a aparecer, no que la fecha sea exacta.
function enDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Aviso NO ACTUANTE: cuando lo que se hizo cumple la acción que estaba pendiente,
// se dice y nada más. No marca nada ni cambia la agenda.
//
// POR QUE NO ACTÚA: no existe un estado "cumplida". La gestión ya ES el registro
// de lo que se hizo, y el tipo declara qué acción cierra (cumple_accion_id). Un
// campo o un paso extra diría lo mismo dos veces y podría contradecirse.
//
// El problema real que resuelve es otro y más chico: uno anota el llamado y se
// olvida de reagendar, y el caso queda con una acción vencida que ya está hecha.
// El aviso aparece justo en ese momento y dice dónde seguir.
function sincroAvisoGestion() {
  const box = $("[data-role=ag-aviso]");
  if (!box) return;
  const c = CASOS.find((x) => x.id === CASO_GESTION);
  const tipo = TIPOS_GESTION.find((t) => t.id === ($("[data-role=ag-tipo]")?.value || ""));
  const pendiente = c?.proxima_accion_id || null;
  const cumple = tipo?.cumple_accion_id && pendiente && tipo.cumple_accion_id === pendiente;
  box.innerHTML = cumple
    ? `<div class="crm-modal-nota">Esto cumple la acción que estaba pendiente `
      + `(<b>${esc(c.crm_acciones?.nombre || "")}</b>). Cuando guardes, acordate de dejar la `
      + `siguiente: se hace con un clic en la celda <b>Próxima acción</b> de ese caso.</div>`
    : "";
}

function abrirModalGestion(casoId) {
  const c = CASOS.find((x) => x.id === casoId);
  if (!c) return;
  CASO_GESTION = casoId;
  const box = $("[data-role=modal-acc-box]");
  box.innerHTML = `<div class="cfm-titulo">Anotar gestión</div>`
    + `<div class="crm-modal-msg">${esc(nomCliente(c))}</div>`
    // La fecha es la del CONTACTO, no la de carga: si el llamado fue el jueves y
    // se anota el lunes, la gestión es del jueves. Cuándo se cargó ya queda en
    // created_at. Por eso el campo admite fechas pasadas; el tope de hoy solo
    // frena el error de tipeo (2027 en vez de 2026).
    + `<label class="crm-modal-fila">Fecha del contacto`
    + `<input type="date" data-role="ag-fecha" value="${hoyISO()}" max="${hoyISO()}" /></label>`
    // El canal queda arriba, donde estaba, pero OPCIONAL: era lo único obligatorio
    // y es lo que menos importa. Obligarlo hacía que se eligiera cualquiera con tal
    // de poder guardar, y ensuciaba el único dato que ese campo podía dar.
    + `<label class="crm-modal-fila">Canal`
    + `<select data-role="ag-canal"><option value="">(sin especificar)</option>`
    + Object.entries(CANAL_TXT).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")
    + `</select></label>`
    // "Qué se hizo" es el campo AGRUPABLE: el que después permite contar.
    + `<label class="crm-modal-fila">Qué se hizo`
    + `<select data-role="ag-tipo"><option value="">(elegí una)</option>`
    + TIPOS_GESTION.map((t) => `<option value="${esc(t.id)}">${esc(t.nombre)}</option>`).join("")
    + `</select></label>`
    + `<div data-role="ag-aviso"></div>`
    + `<label class="crm-modal-fila">Detalle`
    + `<input type="text" data-role="ag-desc" placeholder="Qué se habló" /></label>`
    + `<label class="crm-modal-fila">Quién negoció`
    + `<input type="text" data-role="ag-quien" placeholder="vacío = lo negoció quien carga" /></label>`
    // La convención se ESCRIBE. Un campo vacío que significa algo y no lo dice es
    // una regla que solo existe en la cabeza del que la programó.
    + `<div class="crm-modal-nota">Dejalo vacío si negociaste vos. Completalo cuando habló otro `
    + `—el coordinador de cuenta, por ejemplo—: no es lo mismo quién tuvo la conversación que `
    + `quién la registró.</div>`
    + `<div class="crm-modal-err" data-role="modal-err"></div>`
    + `<div class="cfm-acc"><button type="button" data-role="ag-no">Cancelar</button>`
    + `<button type="button" data-role="ag-si" class="cfm-si">Guardar</button></div>`;
  $("[data-role=modal-acc]").hidden = false;
  box.querySelector("[data-role=ag-desc]")?.focus();
}

async function guardarGestion() {
  const fecha = $("[data-role=ag-fecha]")?.value || "";
  const canal = $("[data-role=ag-canal]")?.value || "";
  const desc = ($("[data-role=ag-desc]")?.value || "").trim();
  const quien = ($("[data-role=ag-quien]")?.value || "").trim();

  const tipoId = $("[data-role=ag-tipo]")?.value || "";

  if (!fecha) { modalErr("Poné la fecha del contacto."); return; }
  if (!tipoId) { modalErr("Elegí qué se hizo. Es lo que después permite contar."); return; }
  // descripcion es NOT NULL en la base: el detalle es obligatorio en TODAS las
  // gestiones, por eso los tipos no llevan bandera de "requiere detalle".
  if (!desc) { modalErr("Escribí qué pasó. Una gestión sin texto no sirve dentro de seis meses."); return; }

  const caso = CASO_GESTION;
  cerrarModalAcc();
  try {
    accMsg("Guardando…");
    const { error } = await supabase.from("crm_gestiones").insert({
      caso_id: caso,
      fecha,
      tipo_id: tipoId,
      // Opcional: vacío va como null, no como cadena vacía (el CHECK de la base
      // solo admite los cinco canales, y "" no es uno).
      canal: canal || null,
      descripcion: desc,
      // Vacío va como null, no como cadena vacía: null significa "quien cargó",
      // y una cadena vacía sería un nombre en blanco.
      negociado_por_texto: quien || null,
      // cargado_por / cargado_por_email NO se mandan: los sella el trigger desde
      // la sesión. Si fueran campos del alta, "quién cargó" lo elegiría el que carga.
    });
    if (error) throw error;
    // Relee y repinta: la columna "Últ. gestión" y el panel se actualizan solos,
    // sin recargar la pantalla. La fila queda expandida porque EXPANDIDOS no se toca.
    await recargarCasos();
    accMsg("Gestión anotada.");
  } catch (e) {
    console.error(e);
    accMsg(msgError(e), true);
  }
}

// ---- AVANZAR EL CASO: un eslabón de la cadena ----
//
// LA CADENA: la acción pendiente no es un campo que se reemplaza, es el eslabón de
// adelante. Cumplirla la vuelve pasado —queda como gestión— y ese mismo acto
// engancha el siguiente. Registrar, mover el estado y reagendar son UN acto, y por
// eso van en un solo RPC (crm_registrar_gestion): en llamadas separadas, un corte
// deja una gestión anotada con la agenda vieja.
//
// EL ESTADO es de otra escala: no se mueve con cada eslabón, sino con los hechos
// que cambian de qué se trata el caso. Se SUGIERE desde el tipo de gestión y el
// usuario confirma — nunca se cambia en silencio.
let CASO_AVANZA = null;
// "sigue" (queda algo agendado) o "cierra" (el caso termina). Se recuerda para no
// rearmar el bloque —y borrar lo que el usuario ya escribió— en cada cambio.
let AV_MODO = "";

const CIERRAN = ["precerrada", "cerrada"];

function bloqueSigue(modo) {
  if (modo === "cierra") {
    return `<div class="crm-modal-nota">El caso se cierra: <b>no queda nada agendado</b>. `
      + `Es el único momento en que la cadena se corta.</div>`;
  }
  return `<div class="crm-av-tit">¿Qué sigue?</div>`
    + `<label class="crm-modal-fila">Acción`
    + `<select data-role="av-accion"><option value="">(elegí una)</option>`
    + ACCIONES.map((a) => `<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join("")
    + `</select></label>`
    + `<label class="crm-modal-fila">Para cuándo`
    + `<input type="date" data-role="av-tope" value="${esc(enDias(7))}" /></label>`
    + `<label class="crm-modal-fila">Detalle`
    + `<input type="text" data-role="av-detalle" placeholder="opcional" /></label>`;
}

// Rearma lo que depende del estado elegido: el motivo (solo lo pide precerrada) y
// el bloque de "qué sigue", que desaparece cuando el caso se cierra.
function sincroAvanzarEstado() {
  const est = $("[data-role=av-estado]")?.value || "";
  const tipo = TIPOS_GESTION.find((t) => t.id === ($("[data-role=av-tipo]")?.value || ""));

  const cajaMot = $("[data-role=av-motivo]");
  if (cajaMot) {
    cajaMot.innerHTML = est === "precerrada"
      ? `<label class="crm-modal-fila">Motivo`
        + `<select data-role="av-mot">`
        + MOTIVOS.map(([v, t]) => `<option value="${v}"${v === tipo?.motivo_sugerido ? " selected" : ""}>${esc(t)}</option>`).join("")
        + `</select></label>`
      : "";
  }

  const modo = CIERRAN.includes(est) ? "cierra" : "sigue";
  if (modo !== AV_MODO) {
    AV_MODO = modo;
    const cajaSig = $("[data-role=av-sigue]");
    if (cajaSig) cajaSig.innerHTML = bloqueSigue(modo);
  }
}

// El tipo de gestión SUGIERE el estado. Se aplica al selector para que se vea
// ANTES de guardar: el que opera tiene que enterarse de que el caso va a moverse.
function sincroAvanzarTipo() {
  const tipo = TIPOS_GESTION.find((t) => t.id === ($("[data-role=av-tipo]")?.value || ""));
  const sel = $("[data-role=av-estado]");
  if (sel && tipo?.estado_sugerido) sel.value = tipo.estado_sugerido;
  sincroAvanzarEstado();
}

function abrirModalAvanzar(casoId) {
  const c = CASOS.find((x) => x.id === casoId);
  if (!c) return;
  CASO_AVANZA = casoId;
  AV_MODO = "";

  const pend = c.crm_acciones?.nombre || "";
  // ATAJO DEL PENDIENTE: si abrís desde esta celda es porque venís a cumplir eso,
  // así que el tipo que la cumple viene puesto. Precargado, no impuesto.
  const tipoSug = c.proxima_accion_id
    ? TIPOS_GESTION.find((t) => t.cumple_accion_id === c.proxima_accion_id)
    : null;
  // El estado ACTUAL va primero y seleccionado: el caso normal es no tocarlo.
  const estados = [...new Set([c.estado, ...ESTADOS_BLOQUE])];

  const box = $("[data-role=modal-acc-box]");
  box.innerHTML = `<div class="cfm-titulo">Avanzar el caso</div>`
    + `<div class="crm-modal-msg">${esc(nomCliente(c))}</div>`
    // Contexto, no campo: qué venías a cumplir, sin tener que ir a buscarlo.
    + (pend
        ? `<div class="crm-av-pend">Pendiente: <b>${esc(pend)}</b>`
          + (c.fecha_proxima_accion ? ` · vence el <span class="crm-fecha">${esc(fmtFecha(c.fecha_proxima_accion))}</span>` : "")
          + `</div>`
        : `<div class="crm-av-pend crm-vacio">Este caso no tenía nada pendiente.</div>`)

    + `<div class="crm-av-tit">¿Qué pasó?</div>`
    + `<label class="crm-modal-fila">Qué se hizo`
    + `<select data-role="av-tipo"><option value="">(elegí una)</option>`
    + TIPOS_GESTION.map((t) => `<option value="${esc(t.id)}"${t.id === tipoSug?.id ? " selected" : ""}>${esc(t.nombre)}</option>`).join("")
    + `</select></label>`
    + `<div class="crm-av-fila2">`
    + `<label class="crm-modal-fila">Cuándo<input type="date" data-role="av-fecha" value="${hoyISO()}" max="${hoyISO()}" /></label>`
    + `<label class="crm-modal-fila">Canal<select data-role="av-canal"><option value="">(sin especificar)</option>`
    + Object.entries(CANAL_TXT).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")
    + `</select></label>`
    + `</div>`
    + `<label class="crm-modal-fila">Qué se habló`
    + `<input type="text" data-role="av-desc" placeholder="Qué se habló" /></label>`
    + `<label class="crm-modal-fila">Quién negoció`
    + `<input type="text" data-role="av-quien" placeholder="vacío = lo negociaste vos" /></label>`

    + `<div class="crm-av-tit">¿En qué queda?</div>`
    // La flecha muestra el MOVIMIENTO: lo que era y lo que pasa a ser. Si los dos
    // lados dicen lo mismo, es que el caso no se mueve — y eso también se ve.
    + `<div class="crm-av-trans">`
    + `<span class="crm-badge crm-e-${esc(c.estado)}">${esc(ESTADO_TXT[c.estado] || c.estado)}</span>`
    + `<span class="crm-av-flecha">▸</span>`
    + `<select data-role="av-estado">`
    + estados.map((e) => `<option value="${e}">${esc(ESTADO_TXT[e] || e)}</option>`).join("")
    + `</select></div>`
    + `<div data-role="av-motivo"></div>`

    + `<div data-role="av-sigue"></div>`
    + `<div class="crm-modal-err" data-role="modal-err"></div>`
    + `<div class="cfm-acc"><button type="button" data-role="av-no">Cancelar</button>`
    // "Avanzar el caso" y no "Guardar": distingue este movimiento de una corrección.
    + `<button type="button" data-role="av-si" class="cfm-si">Avanzar el caso</button></div>`;

  // Si el tipo vino precargado, su sugerencia de estado tiene que aplicarse ya.
  sincroAvanzarTipo();
  $("[data-role=modal-acc]").hidden = false;
  box.querySelector("[data-role=av-desc]")?.focus();
}

async function aplicarAvanzar() {
  const tipoId = $("[data-role=av-tipo]")?.value || "";
  const fecha = $("[data-role=av-fecha]")?.value || "";
  const canal = $("[data-role=av-canal]")?.value || "";
  const desc = ($("[data-role=av-desc]")?.value || "").trim();
  const quien = ($("[data-role=av-quien]")?.value || "").trim();
  const est = $("[data-role=av-estado]")?.value || "";
  const motivo = $("[data-role=av-mot]")?.value || null;
  const cierra = CIERRAN.includes(est);
  const accId = cierra ? null : ($("[data-role=av-accion]")?.value || "");
  const tope = cierra ? null : ($("[data-role=av-tope]")?.value || "");
  const detalle = cierra ? null : ($("[data-role=av-detalle]")?.value || "").trim();

  if (!tipoId) { modalErr("Elegí qué se hizo. Es lo que después permite contar."); return; }
  if (!fecha) { modalErr("Poné la fecha del contacto."); return; }
  if (!desc) { modalErr("Escribí qué se habló. Una gestión sin texto no sirve dentro de seis meses."); return; }
  // La acción siguiente es obligatoria salvo que el caso se cierre: un caso vivo
  // sin agenda no le aparece a nadie. La base lo exige igual; esto evita el viaje.
  if (!cierra && (!accId || !tope)) { modalErr("Hacen falta la acción que sigue y para cuándo."); return; }
  const acc = ACCIONES.find((a) => a.id === accId);
  if (acc?.requiere_detalle && !detalle) { modalErr(`La acción "${acc.nombre}" necesita un detalle.`); return; }

  const caso = CASO_AVANZA;
  const c = CASOS.find((x) => x.id === caso);
  cerrarModalAcc();

  // Confirmación solo cuando el caso SE CIERRA: es el único movimiento que corta
  // la cadena, y el único difícil de deshacer.
  if (cierra) {
    const ok = await confirmar({
      titulo: "Cerrar el caso",
      mensaje: `<b>${esc(nomCliente(c))}</b> pasa a <b>${esc(ESTADO_TXT[est] || est)}</b>.<br><br>`
        + `Sale de la lista de trabajo y <b>se le limpia la agenda</b>. La cadena de acciones termina acá.`,
      si: "Cerrar el caso", no: "Cancelar", peligro: true,
    });
    if (!ok) return;
  }

  try {
    accMsg("Guardando…");
    const { data, error } = await supabase.rpc("crm_registrar_gestion", {
      p_caso: caso, p_tipo_id: tipoId, p_fecha: fecha, p_descripcion: desc,
      p_canal: canal || null, p_negociado: quien || null,
      p_estado: est || null, p_motivo: motivo,
      p_accion_id: accId || null, p_fecha_tope: tope || null, p_detalle: detalle || null,
    });
    if (error) throw error;
    const r = (Array.isArray(data) ? data[0] : data) || {};
    // Se informa QUÉ se movió, no solo que salió bien: el estado y la agenda pueden
    // haber cambiado o no, y eso es justo lo que hay que poder confirmar de un vistazo.
    accMsg("Gestión anotada"
      + (r.estado_cambiado ? ` · estado a ${ESTADO_TXT[est] || est}` : "")
      + (r.agenda_cambiada && !cierra ? " · agenda al día" : "")
      + (cierra ? " · caso cerrado" : ""));
    await recargarCasos();
  } catch (e) {
    console.error(e);
    accMsg(msgError(e), true);
  }
}

// ---- Fijar la próxima acción, SIN tocar el estado ----
//
// Es una operación propia, no un atajo del cambio de estado: mover la fecha tope o
// pasar de "Esperando respuesta" a "Enviar nueva propuesta" pasa con el caso quieto
// en renegociación. Va contra crm_fijar_proxima_accion (abm_44), que tiene las
// mismas reglas que abm_40 — acción vigente, acción y fecha juntas, detalle
// obligatorio en las que lo piden.
let CASOS_PROX = [];

// Los cerrados y precerrados no tienen agenda a propósito: no se les ofrece.
const SIN_AGENDA = ["precerrada", "cerrada"];

function abrirModalProx(ids) {
  CASOS_PROX = (ids && ids.length) ? ids : [...SELECCION];
  const n = CASOS_PROX.length;
  if (!n) return;
  const uno = n === 1 ? CASOS.find((x) => x.id === CASOS_PROX[0]) : null;
  const box = $("[data-role=modal-acc-box]");
  // Con un solo caso se precargan sus valores actuales: cambiar la fecha no tiene
  // por qué obligar a volver a elegir la acción.
  const accAct = uno?.proxima_accion_id || "";
  const fechaAct = uno?.fecha_proxima_accion ? String(uno.fecha_proxima_accion).slice(0, 10) : "";
  const detAct = uno?.proxima_accion_detalle || "";

  box.innerHTML = `<div class="cfm-titulo">Próxima acción</div>`
    + `<div class="crm-modal-msg">`
    + (uno ? esc(nomCliente(uno)) : `Se van a reagendar <b>${n}</b> casos.`)
    + `</div>`
    + `<label class="crm-modal-fila">Acción`
    + `<select data-role="ap-accion"><option value="">(elegí una)</option>`
    + ACCIONES.map((a) => `<option value="${esc(a.id)}"${a.id === accAct ? " selected" : ""}>${esc(a.nombre)}</option>`).join("")
    + `</select></label>`
    + `<label class="crm-modal-fila">Fecha tope`
    + `<input type="date" data-role="ap-fecha" value="${esc(fechaAct)}" /></label>`
    + `<label class="crm-modal-fila">Detalle`
    + `<input type="text" data-role="ap-detalle" value="${esc(detAct)}" placeholder="opcional" /></label>`
    + `<div class="crm-modal-nota">Esto <b>no cambia el estado</b> del caso. `
    + `La acción y la fecha van juntas: un caso vivo sin fecha no le aparece a nadie en la agenda.</div>`
    + `<div class="crm-modal-err" data-role="modal-err"></div>`
    + `<div class="cfm-acc"><button type="button" data-role="ap-no">Cancelar</button>`
    + `<button type="button" data-role="ap-si" class="cfm-si">Guardar</button></div>`;
  $("[data-role=modal-acc]").hidden = false;
  box.querySelector("[data-role=ap-accion]")?.focus();
}

async function aplicarProx() {
  const accId = $("[data-role=ap-accion]")?.value || "";
  const fecha = $("[data-role=ap-fecha]")?.value || "";
  const detalle = ($("[data-role=ap-detalle]")?.value || "").trim();

  if (!accId || !fecha) { modalErr("Hacen falta la acción y la fecha tope."); return; }
  const acc = ACCIONES.find((a) => a.id === accId);
  if (acc?.requiere_detalle && !detalle) {
    modalErr(`La acción "${acc.nombre}" necesita un detalle.`); return;
  }

  const ids = CASOS_PROX;
  const n = ids.length;
  cerrarModalAcc();
  try {
    accMsg("Guardando…");
    const { data, error } = await supabase.rpc("crm_fijar_proxima_accion", {
      p_casos: ids, p_accion_id: accId, p_fecha: fecha, p_detalle: detalle || null,
    });
    if (error) throw error;
    const act = ((Array.isArray(data) ? data[0] : data) || {}).casos_actualizados ?? 0;
    accMsg(`${act} de ${n} casos reagendados`
      + (act < n ? " · el resto está precerrado o cerrado" : ""), act < n);
    await recargarCasos();
  } catch (e) {
    console.error(e);
    accMsg(msgError(e), true);
  }
}

// ---- Cambiar estado en bloque ----
//
// Los cinco que el RPC acepta. `cerrada` NO está: la confirma el pago, no una
// persona, y la base la rechaza. `pendiente_envio` tampoco: es el estado de
// partida, no un destino.
const ESTADOS_BLOQUE = ["enviada", "sin_respuesta", "en_renegociacion", "precerrada", "reclamo_posterior"];
// Los tres donde el caso SIGUE VIVO: sin acción ni fecha quedaría abierto y sin
// aparecer en la agenda de nadie. Es la misma lista que valida abm_40; acá se
// repite para poder avisar ANTES de mandar, no para reemplazar el control.
const EXIGEN_ACCION = ["sin_respuesta", "en_renegociacion", "reclamo_posterior"];
const MOTIVOS = [
  ["aceptacion", "El cliente aceptó"],
  ["tacita", "Venció el plazo (aceptación tácita)"],
  ["rebaja", "Se cerró con precio menor"],
  ["otro", "Otro (necesita descripción)"],
];

// Repinta solo las partes que dependen del estado elegido. Se hace acá y no
// escondiendo/mostrando con CSS para que los campos que no aplican NO EXISTAN:
// un campo oculto que igual se lee es la forma más fácil de mandar un dato viejo.
function sincroModalEstado() {
  const est = $("[data-role=me-estado]")?.value || "";
  const box = $("[data-role=me-dinamico]");
  if (!box) return;
  modalErr("");   // cambiar de estado destino invalida el aviso anterior
  let html = "";
  if (est === "precerrada") {
    html = `<label class="crm-modal-fila">Motivo`
      + `<select data-role="me-motivo">`
      + MOTIVOS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")
      + `</select></label>`
      + `<div class="crm-modal-nota">Al precerrar, el caso sale de la lista de trabajo y `
      + `<b>se limpia la próxima acción</b>: el caso terminó y no queda nada agendado.</div>`;
  } else if (EXIGEN_ACCION.includes(est)) {
    html = `<label class="crm-modal-fila">Próxima acción`
      + `<select data-role="me-accion"><option value="">(elegí una)</option>`
      + ACCIONES.map((a) => `<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join("")
      + `</select></label>`
      + `<label class="crm-modal-fila">Fecha tope`
      + `<input type="date" data-role="me-fecha" /></label>`
      + `<label class="crm-modal-fila">Detalle`
      + `<input type="text" data-role="me-detalle" placeholder="opcional" /></label>`
      + `<div class="crm-modal-nota">En este estado el caso sigue vivo: <b>la acción y la fecha son `
      + `obligatorias</b>. Sin ellas quedaría abierto sin aparecer en la agenda de nadie.</div>`;
  }
  box.innerHTML = html;
}

// Sobre qué casos actúa el modal de estado. Con la barra son los seleccionados;
// con un clic en la celda de Estado es ese caso y nada más.
let CASOS_ESTADO = [];

function abrirModalEstado(ids) {
  CASOS_ESTADO = (ids && ids.length) ? ids : [...SELECCION];
  const n = CASOS_ESTADO.length;
  if (!n) return;
  // Con un solo caso se nombra el cliente: "Se va a cambiar 1 caso" no dice cuál.
  const uno = n === 1 ? CASOS.find((x) => x.id === CASOS_ESTADO[0]) : null;
  const box = $("[data-role=modal-acc-box]");
  box.innerHTML = `<div class="cfm-titulo">Cambiar estado</div>`
    + `<div class="crm-modal-msg">`
    + (uno ? esc(nomCliente(uno)) : `Se van a cambiar <b>${n}</b> casos.`)
    + `</div>`
    + `<label class="crm-modal-fila">Estado`
    + `<select data-role="me-estado">`
    + ESTADOS_BLOQUE.map((e) => `<option value="${e}">${esc(ESTADO_TXT[e])}</option>`).join("")
    + `</select></label>`
    + `<div data-role="me-dinamico"></div>`
    + `<label class="crm-modal-fila">Descripción`
    + `<input type="text" data-role="me-obs" placeholder="opcional" /></label>`
    // La aclaración del grupo SOLO cuando hay grupo: sobre un caso suelto sería
    // una advertencia sobre algo que no está pasando.
    + (n > 1
        ? `<div class="crm-modal-nota">La descripción es <b>una sola para todo el grupo</b> y se suma `
          + `al historial de cada caso con la fecha, sin pisar lo anterior. Lo particular de un caso `
          + `se agrega después, desde el caso.</div>`
        : `<div class="crm-modal-nota">La descripción se suma al historial con la fecha, `
          + `sin pisar lo anterior.</div>`)
    + `<div class="crm-modal-err" data-role="modal-err"></div>`
    + `<div class="cfm-acc"><button type="button" data-role="me-no">Cancelar</button>`
    + `<button type="button" data-role="me-si" class="cfm-si">Aplicar</button></div>`;
  sincroModalEstado();
  $("[data-role=modal-acc]").hidden = false;
  box.querySelector("[data-role=me-estado]")?.focus();
}

async function aplicarCambioEstado() {
  const est = $("[data-role=me-estado]")?.value || "";
  const obs = ($("[data-role=me-obs]")?.value || "").trim();
  const motivo = $("[data-role=me-motivo]")?.value || null;
  const accId = $("[data-role=me-accion]")?.value || null;
  const fecha = $("[data-role=me-fecha]")?.value || null;
  const detalle = ($("[data-role=me-detalle]")?.value || "").trim();

  // Controles ANTES de mandar. No reemplazan a los de abm_40 —esos son el candado
  // real— pero evitan el viaje y dan el mensaje al lado del campo que falta.
  if (est === "precerrada" && motivo === "otro" && !obs) {
    modalErr('El motivo "otro" necesita una descripción.'); return;
  }
  if (EXIGEN_ACCION.includes(est) && (!accId || !fecha)) {
    modalErr("Este estado necesita próxima acción y fecha tope."); return;
  }
  const acc = ACCIONES.find((a) => a.id === accId);
  if (acc?.requiere_detalle && !detalle) {
    modalErr(`La acción "${acc.nombre}" necesita un detalle.`); return;
  }

  const ids = CASOS_ESTADO;
  const n = ids.length;
  cerrarModalAcc();

  const resumen = est === "precerrada"
    ? `<br><br>Precerrar saca los casos de la lista de trabajo y les <b>limpia la próxima acción</b>.`
    : (acc ? `<br><br>Próxima acción: <b>${esc(acc.nombre)}</b>, con fecha tope <b>${esc(fmtFecha(fecha))}</b>.` : "");
  const ok = await confirmar({
    titulo: "Cambiar estado",
    mensaje: `Pasar <b>${n}</b> caso${n > 1 ? "s" : ""} a <b>${esc(ESTADO_TXT[est] || est)}</b>.` + resumen,
    si: "Aplicar", no: "Cancelar", peligro: est === "precerrada",
  });
  if (!ok) return;

  try {
    accMsg("Aplicando…");
    const { data, error } = await supabase.rpc("crm_cambiar_estado", {
      p_casos: ids,
      p_estado: est,
      p_motivo: est === "precerrada" ? motivo : null,
      p_observacion: obs || null,
      p_accion_id: accId || null,
      p_fecha: fecha || null,
      p_detalle: detalle || null,
    });
    if (error) throw error;
    const r = (Array.isArray(data) ? data[0] : data) || {};
    const act = r.casos_actualizados ?? 0;
    // El RPC saltea los cerrados y los que ya estaban en ese estado. Decirlo es
    // lo único que distingue una acción que no hizo nada de una que funcionó.
    accMsg(`${act} de ${n} casos actualizados`
      + (act < n ? " · el resto ya estaba en ese estado o está cerrado" : ""), act < n);
    await recargarCasos();
  } catch (e) {
    console.error(e);
    accMsg(msgError(e), true);
  }
}

async function aplicarAsignarResp() {
  const rid = $("[data-role=ma-resp]")?.value || "";
  if (!rid) { modalErr("Elegí un responsable."); return; }
  const pisar = !!$("[data-role=ma-pisar]")?.checked;
  const nom = RESPONSABLES.find((r) => r.id === rid)?.nombre || "";
  const ids = CASOS_RESP;
  const n = ids.length;
  cerrarModalAcc();

  // Pisar el responsable de un cliente es escribir sobre un dato maestro desde
  // una pantalla de casos: va marcado como peligroso y se dice explícitamente.
  const ok = await confirmar({
    titulo: "Asignar responsable",
    mensaje: `Asignar <b>${esc(nom)}</b> a <b>${n}</b> caso${n > 1 ? "s" : ""}.<br><br>`
      + (pisar
          ? `Además se va a <b>PISAR</b> el responsable de los clientes que ya tuvieran otro. Eso cambia la ficha del cliente para todas las paritarias que vengan.`
          : `A los clientes sin responsable se les va a completar. A los que ya tengan otro no se los toca.`),
    si: "Asignar", no: "Cancelar", peligro: pisar,
  });
  if (!ok) return;

  try {
    accMsg("Aplicando…");
    const { data, error } = await supabase.rpc("crm_asignar_responsable", {
      p_casos: ids, p_responsable_id: rid, p_pisar_cliente: pisar,
    });
    if (error) throw error;
    const r = (Array.isArray(data) ? data[0] : data) || {};
    const act = r.casos_actualizados ?? 0;
    // Se informan los TRES números, y se avisa si se tocaron menos casos de los
    // elegidos: el RPC saltea los que ya tenían ese responsable, y sin decirlo
    // una acción que no hizo nada se ve igual que una que funcionó.
    accMsg(`${act} de ${n} casos · ${r.clientes_completados ?? 0} clientes completados`
      + (pisar ? ` · ${r.clientes_pisados ?? 0} pisados` : ""), act < n);
    await recargarCasos();
  } catch (e) {
    console.error(e);
    accMsg(msgError(e), true);
  }
}

function render() {
  const filas = CASOS.filter((c) => pasa(c, null));
  FILAS = filas;
  podarSeleccion(filas);   // antes de pintar: las casillas tienen que salir ya podadas
  pintarFiltros();
  pintarEmbudos();
  pintarTabla(filas);
  // Nombres de Cliente en azul cuando lo que se ve NO es todo (mismo criterio que
  // Precios). Se decide por el RESULTADO —hay filas ocultas— y no dimensión por
  // dimensión: es la misma cuenta que ya muestra el "N de M casos" de abajo, así
  // que las dos señales no pueden contradecirse.
  $("table[data-role=tabla-casos]").classList.toggle("filtrando", filas.length < CASOS.length);
  // Deshabilitado cuando no hay nada que limpiar: un botón que no haría nada no
  // tiene que ofrecerse como si fuera a hacer algo.
  const btnLimpiar = $("[data-role=limpiar-filtros]");
  if (btnLimpiar) btnLimpiar.disabled = esEstadoInicial();
  pintarAcciones(filas);
  const sinResp = filas.filter((c) => !c.responsable_id).length;
  status(`${filas.length} de ${CASOS.length} casos`
    + (sinResp ? ` · ${sinResp} sin responsable` : ""));
}

// ---- Ancho de columnas: arrastre del borde + persistencia local ----
// El ancho es preferencia de la PC de cada uno, no dato del negocio: va a
// localStorage, no a la base. Mismo criterio que Precios.
//
// La última columna (Próxima acción) NO esta acá: no tiene ancho propio, absorbe
// el sobrante para que el arrastre de las otras sea 1:1 (ver el colgroup del HTML).
// resp pasó de 120 a 150 al agregarle el embudo: "RESPONSABLE ▾" en mayúsculas no
// entraba en 120px y el ▾ quedaba cortado (table-layout:fixed recorta, no ensancha).
// No agranda el cartucho: está topeado en 150px y la celda descuenta su padding.
//
// estado pasó de 150 a 168 al mudarle el 📄 de la nota: la celda ahora reserva 18px a
// la derecha para el ícono (ver el CSS de td.crm-est). Sin compensar el ancho, esos
// 18px salían del cartucho y "Pendiente de envío" empezaba a cortarse con puntos
// suspensivos. Por el mismo motivo el mínimo pasó de 90 a 108: es el mismo ancho útil
// de antes, corrido por el espacio del ícono.
const ANCHO_COL = { cliente: 320, estado: 168, resp: 150, ult: 180 };
const LIM_COL = { cliente: [160, 600], estado: [108, 260], resp: [80, 300], ult: [110, 320] };
const VISTA_KEY = "finflow.crm.vista";
// Subir cada vez que cambien las columnas, para invalidar lo guardado. 1 -> 2: el ancho
// de estado cambió de significado (ahora incluye el lugar del ícono). Sin subirla, el
// navegador de quien ya usó la pantalla restauraría los 150px viejos y vería el cartucho
// cortado — el ancho guardado se aplica igual aunque el default cambie.
const VISTA_VER = 2;

const aplicarAncho = (col, px) => {
  const el = $(`table[data-role=tabla-casos] col[data-col="${col}"]`);
  if (el) el.style.width = px + "px";
};

function cargarVista() {
  try {
    const raw = localStorage.getItem(VISTA_KEY);
    if (!raw) return;                              // nada guardado → defaults
    const data = JSON.parse(raw);
    if (!data || data.v !== VISTA_VER) return;     // versión distinta → defaults
    if (data.anchoCol && typeof data.anchoCol === "object")
      for (const k of Object.keys(ANCHO_COL)) {    // solo claves conocidas
        const w = data.anchoCol[k];
        // Clamp a los límites: un valor corrupto o de una versión vieja no puede
        // dejar una columna en 3px y la pantalla inutilizable.
        if (typeof w === "number" && isFinite(w)) ANCHO_COL[k] = clampAncho(w, ...(LIM_COL[k] || [40, 600]));
      }
  } catch (e) { /* JSON corrupto o storage bloqueado → defaults, la pantalla sigue andando */ }
}

function guardarVista() {
  try { localStorage.setItem(VISTA_KEY, JSON.stringify({ v: VISTA_VER, anchoCol: { ...ANCHO_COL } })); }
  catch (e) { /* storage lleno o bloqueado → se ignora, el ancho vale para esta sesión */ }
}

function wireColumnas() {
  cargarVista();
  for (const k of Object.keys(ANCHO_COL)) aplicarAncho(k, ANCHO_COL[k]);
  wireResizeColumnas({
    thead: $("table[data-role=tabla-casos] thead"),
    anchos: ANCHO_COL, limites: LIM_COL,
    aplicar: aplicarAncho, onCommit: guardarVista,
  });
}

function conectar() {
  // Chips: delegación sobre la barra entera.
  $("[data-role=crm-filtros]").addEventListener("click", (e) => {
    const b = e.target.closest(".crm-chip");
    if (!b) return;
    if (b.dataset.meta) {
      if (b.dataset.meta === "estado-todos") F.estados.clear();
      else if (b.dataset.meta === "estado-abiertos") F.estados = new Set(ABIERTOS);
      else if (b.dataset.meta === "resp-todos") F.responsables.clear();
      else if (b.dataset.meta === "dep-todos") F.depende.clear();
      // El chip escribe el MISMO estado que el embudo: prenderlo deja "vencidas"
      // marcada allá, y apagarlo lo limpia. No hay dos filtros, hay dos puertas.
      else if (b.dataset.meta === "venc") {
        const solo = F.vencimiento.size === 1 && F.vencimiento.has("vencida");
        F.vencimiento = solo ? new Set() : new Set(["vencida"]);
      }
      render(); return;
    }
    const dim = b.dataset.dim;
    const set = dim === "estado" ? F.estados : dim === "depende" ? F.depende : F.responsables;
    // Vacío = "todos", y los chips se ven marcados. El primer clic tiene que QUITAR
    // el que tocaste, no agregarlo: agregándolo al conjunto vacío se apagarían los
    // otros seis, o sea que apretás uno prendido y se apagan todos menos ése.
    // Materializar la lista completa antes de sacar es lo que hace que el clic
    // signifique lo que parece.
    if (!set.size) for (const v of valoresDim(dim)) set.add(v);
    set.has(b.dataset.val) ? set.delete(b.dataset.val) : set.add(b.dataset.val);
    render();
  });
  // Embudos: delegación en el thead. stopPropagation para que el clic no llegue al
  // document, que es donde el popup escucha el "clic afuera" para cerrarse.
  $("table[data-role=tabla-casos] thead").addEventListener("click", (e) => {
    const f = e.target.closest(".funnel");
    if (!f) return;
    e.stopPropagation();
    abrirEmbudo(f);
  });
  $("[data-role=limpiar-filtros]").addEventListener("click", limpiarFiltros);

  // Expandir/contraer en bloque. "Expandir todos" abre LO FILTRADO, igual que la
  // tilde del encabezado selecciona lo filtrado; "Contraer todos" cierra todo,
  // incluidos los que quedaron abiertos fuera del filtro actual.
  $("[data-role=expandir]").addEventListener("click", () => {
    for (const c of FILAS) EXPANDIDOS.add(c.id);
    render();
  });
  $("[data-role=contraer]").addEventListener("click", () => {
    EXPANDIDOS.clear();
    render();
  });

  // Flechita de detalle. Repinta la tabla entera, que acá está bien: expandir no
  // es una acción que se repita decenas de veces por segundo como tildar casillas.
  $("[data-role=tabla-casos] tbody").addEventListener("click", (e) => {
    // Ver la nota (📄 en la celda de Estado). VA PRIMERO Y NO ES DECORATIVO EL ORDEN:
    // desde que el ícono se mudó a la celda de Estado está DENTRO de una celda-acción.
    // Si esto quedara después del td.crm-est de abajo, el clic en el 📄 abriría el
    // modal de cambio de estado en vez de la nota.
    const vn = e.target.closest("[data-nota]");
    if (vn) { verNotaCaso(vn.dataset.nota); return; }
    // "Anotar gestión", que vive dentro del panel expandido.
    const g = e.target.closest("[data-role=det-gestion]");
    if (g) { abrirModalGestion(g.dataset.caso); return; }
    // Celdas-acción: actuar sobre UN caso desde su propia celda, sin seleccionar
    // ni desplegar. Van antes que la flechita porque son celdas distintas y no
    // hay solapamiento posible.
    const est = e.target.closest("td.crm-est");
    if (est) { abrirModalEstado([est.dataset.caso]); return; }
    const ult = e.target.closest("td.crm-ult");
    if (ult) { abrirModalGestion(ult.dataset.caso); return; }
    const rsp = e.target.closest("td.crm-resp");
    if (rsp) { abrirModalResp([rsp.dataset.caso]); return; }
    // Corregir la acción pendiente sin registrar gestión: es la excepción, así que
    // vive en el panel expandido (donde ya estás revisando), no en la celda.
    const cor = e.target.closest("[data-role=det-corregir]");
    if (cor) { abrirModalProx([cor.dataset.caso]); return; }
    // La celda de Próxima acción abre el camino PRINCIPAL: avanzar el caso. Cumplir
    // el eslabón y enganchar el siguiente son el mismo acto.
    const prx = e.target.closest("td.crm-prox");
    if (prx) { abrirModalAvanzar(prx.dataset.caso); return; }
    const t = e.target.closest(".crm-exp");
    if (!t) return;
    const id = t.dataset.exp;
    EXPANDIDOS.has(id) ? EXPANDIDOS.delete(id) : EXPANDIDOS.add(id);
    render();
  });

  // --- Selección ---
  // Casilla por fila: solo se refresca la barra, no se repinta la tabla.
  $("[data-role=tabla-casos] tbody").addEventListener("change", (e) => {
    const chk = e.target.closest("input[data-caso]");
    if (!chk) return;
    chk.checked ? SELECCION.add(chk.dataset.caso) : SELECCION.delete(chk.dataset.caso);
    pintarAcciones(FILAS);
  });
  // Casilla del encabezado = TODO LO FILTRADO. Es literal: la tabla no tiene
  // paginación, pinta todas las filas que pasan el filtro.
  $("[data-role=sel-todos]").addEventListener("change", (e) => {
    SELECCION.clear();
    if (e.target.checked) for (const c of FILAS) SELECCION.add(c.id);
    sincroCasillas();
    pintarAcciones(FILAS);
  });
  $("[data-role=sel-limpiar]").addEventListener("click", () => {
    SELECCION.clear();
    sincroCasillas();
    pintarAcciones(FILAS);
    accMsg("");
  });

  // --- Acciones en bloque ---
  // Sin argumentos: el modal cae en la selección. Pasar la función directo le
  // metería el evento como si fueran los ids.
  $("[data-role=acc-estado]").addEventListener("click", () => abrirModalEstado());
  $("[data-role=acc-resp]").addEventListener("click", abrirModalResp);
  const boxAcc = $("[data-role=modal-acc-box]");
  boxAcc.addEventListener("click", (e) => {
    const r = e.target.dataset.role;
    if (["ma-no", "me-no", "ag-no", "ap-no", "av-no"].includes(r)) cerrarModalAcc();
    else if (r === "ma-si") aplicarAsignarResp();
    else if (r === "me-si") aplicarCambioEstado();
    else if (r === "ag-si") guardarGestion();
    else if (r === "ap-si") aplicarProx();
    else if (r === "av-si") aplicarAvanzar();
  });
  boxAcc.addEventListener("change", (e) => {
    // Al cambiar el estado destino se rearman los campos que dependen de él.
    const r = e.target.dataset.role;
    if (r === "me-estado") sincroModalEstado();
    // El aviso se recalcula con cada cambio de "qué se hizo": aparece si ese tipo
    // cumple lo pendiente, y se va si elegís otro.
    else if (r === "ag-tipo") sincroAvisoGestion();
    // En "Avanzar el caso": el tipo sugiere el estado, y el estado define si queda
    // algo agendado o el caso se cierra.
    else if (r === "av-tipo") sincroAvanzarTipo();
    else if (r === "av-estado") sincroAvanzarEstado();
  });
  $("[data-role=f-paritaria]").addEventListener("change", (e) => { F.paritaria = e.target.value; render(); });
  $("[data-role=f-texto]").addEventListener("input", (e) => { F.texto = e.target.value.trim().toLowerCase(); render(); });
}

// Relee los casos y repinta, SIN tocar los filtros. Se usa después de cada acción
// en bloque. No se puede reusar cargar() para esto: cargar() recalcula cuál es la
// paritaria vigente y te movería el filtro que tenías puesto.
async function recargarCasos() {
  CASOS = ordenar(await fetchAllRows("crm_casos", COLUMNAS));
  render();
}

async function cargar() {
  // Antes del fetch y fuera del try: los anchos y el alto se aplican sobre la tabla
  // vacía (si fueran después, se vería el salto), y el arrastre queda andando
  // aunque la carga de datos falle.
  wireColumnas();
  wireAltoTabla({
    contenedor: "[data-role=crm-container]",
    observar: "main > section.controls",   // chips, barra de acciones, mensajes
  });
  try {
    status("Cargando…");
    // Los responsables van en su propio pedido y NO salen de los casos: para poder
    // asignar hace falta la lista completa de activos, incluidos los que todavía no
    // aparecen en ningún caso.
    const [casos, resps, accs, tips, notas] = await Promise.all([
      fetchAllRows("crm_casos", COLUMNAS),
      fetchAllRows("grupos_clientes", "id, nombre, activo, tipo"),
      fetchAllRows("crm_acciones", "id, nombre, orden, activa, requiere_detalle"),
      // Sin requiere_detalle: la columna no existe. El detalle es obligatorio en
      // TODAS las gestiones porque crm_gestiones.descripcion es NOT NULL.
      // estado_sugerido y motivo_sugerido son lo que alimenta la propuesta de
      // estado en "Avanzar el caso": sin ellos el tipo no sugeriría nada.
      fetchAllRows("crm_gestion_tipos",
        "id, nombre, orden, activa, cumple_accion_id, estado_sugerido, motivo_sugerido"),
      // Solo las notas que TIENEN el PDF guardado: son las únicas que se pueden abrir.
      // Si la tabla todavía no tuviera las columnas, el catch de abajo dejaría la pantalla
      // sin cargar, así que va con su propio respaldo (ver el catch del Promise).
      fetchAllRows("notas_emitidas", "cliente_id, paritaria_id, pdf_path, fecha_enviada, pdf_subido_en",
        (qb) => qb.not("pdf_path", "is", null)).catch((e) => {
          console.warn("No se pudieron leer las notas guardadas; los casos igual se muestran.", e?.message || e);
          return [];   // el CRM sirve para negociar aunque no se pueda abrir ningún PDF
        }),
    ]);
    CASOS = ordenar(casos);
    NOTAS_PDF.clear();
    for (const n of notas) {
      if (!n.cliente_id || !n.paritaria_id) continue;   // sin paritaria no se puede atar a un caso
      const k = `${n.cliente_id}|${n.paritaria_id}`;
      NOTAS_PDF.set(k, mejorNotaPdf(NOTAS_PDF.get(k), n));
    }
    const porOrden = (a, b) => (a.orden ?? 999) - (b.orden ?? 999);
    ACCIONES = accs.filter((a) => a.activa).sort(porOrden);
    TIPOS_GESTION = tips.filter((t) => t.activa).sort(porOrden);
    RESPONSABLES = resps
      .filter((g) => g.tipo === "responsable" && g.activo !== false)
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
    // "La paritaria vigente" = la del caso creado más recientemente. Se define así
    // y no por el código de la paritaria para no depender de cómo se ordenan esos
    // códigos, que los pone un trigger.
    const ultimo = CASOS.reduce((a, b) => (!a || String(b.created_at) > String(a.created_at) ? b : a), null);
    PARITARIA_INICIAL = ultimo?.paritaria_id || "";   // ancla del botón "Limpiar filtros"
    F.paritaria = PARITARIA_INICIAL;
    conectar();
    render();
  } catch (e) {
    console.error(e);
    status("No se pudieron cargar los casos. " + (e?.message || e));
  }
}

export { cargar };

export function renderNegociaciones() { cargar(); }
