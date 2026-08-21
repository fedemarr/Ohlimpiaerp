// FinFlow — Popup de filtro por columna (el embudo ▾ del encabezado).
//
// Extraido de precios.js. Es el CAPARAZON, no el filtro: la lista con checkboxes,
// el buscador, seleccionar/deseleccionar, el contador, la posicion y el teclado.
// NO SABE QUE ESTA FILTRANDO. Recibe las opciones y devuelve lo tildado; que
// significan esos valores y a que estado van es problema de cada pantalla.
//
// POR QUE COMPARTIRLO Y NO REESCRIBIRLO: el caparazon tiene decisiones finas que
// se ven poco y se rompen facil (ver los comentarios de cada una). Reimplementarlo
// "parecido" en otra pantalla es como quedan dos comportamientos distintos para el
// mismo control, y despues nadie sabe por que en una anda distinto que en la otra.
//
// Lo que quedo AFUERA porque es de Precios y de nadie mas: el popup de las columnas
// de MES (operadores >, <, entre) y el armado de cada columna con sus datos.

// Minusculas y sin acentos, para que "Peron" encuentre "Perón" y al reves.
// Se usa \p{M} (propiedad Unicode "marca") en vez del rango de caracteres literales
// que tiene precios.js: ahi los caracteres son marcas combinantes INVISIBLES en el
// editor, y un guardado con otra codificacion los rompe sin que se note. Verificado
// que da el mismo resultado sobre nombres con tildes, dieresis y enies.
const normaliza = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Hex de 3 a 8 digitos: es solo un cuadradito de color, no se calcula contraste
// encima, asi que el alfa de los de 8 no molesta. (A diferencia de
// etiquetas-color.js, que si calcula y por eso es mas estricto.)
const HEX_SW = /^#[0-9a-fA-F]{3,8}$/;

let POP = null;        // nodo del popup: uno por pagina, se reusa en cada apertura
let ACTIVO = null;     // descriptor del popup abierto (null = cerrado)

export function cerrarPopup() {
  if (POP) POP.hidden = true;
  ACTIVO = null;
}

// Cuenta las opciones que el buscador dejo visibles y actualiza el "(sobre los N)".
function actualizarVisCount(pop) {
  const el = pop.querySelector("[data-role=fp-vis-count]");
  if (!el) return;
  const n = [...pop.querySelectorAll(".fp-list label")].filter((lb) => lb.style.display !== "none").length;
  el.textContent = `(sobre los ${n} visibles)`;
}

// Las opciones que el buscador dejo a la vista. Todo lo de "seleccionar todos"
// opera sobre estas y no sobre la lista entera: buscar algo y tildar "todos"
// no puede marcar en silencio cosas que no estas viendo.
const visibles = (pop) =>
  [...pop.querySelectorAll(".fp-list label")].filter((lb) => lb.style.display !== "none");

function seleccionVisibles(pop, val) {
  for (const lb of visibles(pop)) {
    const chk = lb.querySelector("input[type=checkbox]");
    if (chk) chk.checked = val;
  }
}

// Estado de la casilla "Seleccionar todos". TRES estados y no dos: con solo
// tildada/destildada, "algunos" se confunde con "ninguno" y la casilla miente.
// Mismo criterio que la casilla de seleccion de filas del CRM.
function sincroSelTodos(pop) {
  const chk = pop.querySelector("[data-role=fp-sel-todos]");
  if (!chk) return;
  const vis = visibles(pop);
  const marcados = vis.filter((lb) => lb.querySelector("input[type=checkbox]")?.checked).length;
  chk.disabled = vis.length === 0;
  chk.checked = vis.length > 0 && marcados === vis.length;
  chk.indeterminate = marcados > 0 && marcados < vis.length;
}

function aplicar() {
  if (!ACTIVO) return;
  const vals = [...POP.querySelectorAll(".fp-list input[type=checkbox]:checked")].map((i) => i.value);
  const { onAplicar } = ACTIVO;
  const pop = POP;
  cerrarPopup();                       // se cierra ANTES del callback: si el caller
  onAplicar?.(new Set(vals), pop);     // repinta la tabla, el popup ya no esta ahi
}

function limpiar() {
  if (!ACTIVO) return;
  const { onLimpiar } = ACTIVO;
  cerrarPopup();
  onLimpiar?.();
}

// Listeners: una sola vez por nodo. El flag evita que una segunda pantalla (o una
// segunda llamada) los enganche de nuevo y cada clic cuente doble.
function wire(pop) {
  if (pop.dataset.fpWired) return;
  pop.dataset.fpWired = "1";

  pop.addEventListener("click", (e) => {
    e.stopPropagation();               // sin esto, el clic adentro llega al document y lo cierra
    const role = e.target.dataset.role;
    if (role === "fp-aplicar") aplicar();
    else if (role === "fp-limpiar") limpiar();
  });

  // "Seleccionar todos" es una CASILLA, no un boton: su propio estado tiene que
  // decir si lo de abajo esta todo, algo o nada marcado. Va por `change` y no por
  // `click` para que el navegador ya haya resuelto el nuevo valor al leerlo.
  pop.addEventListener("change", (e) => {
    if (e.target.dataset.role === "fp-sel-todos") {
      seleccionVisibles(pop, e.target.checked);
      sincroSelTodos(pop);
    } else if (e.target.closest(".fp-list")) {
      sincroSelTodos(pop);             // tildar una opcion suelta puede completar (o romper) el "todos"
    }
  });

  pop.addEventListener("keydown", (e) => {
    if (e.key === "Enter") aplicar();
    if (e.key === "Escape") cerrarPopup();
  });

  pop.addEventListener("input", (e) => {
    if (e.target.dataset.role !== "fp-buscar") return;
    const q = normaliza(e.target.value);
    pop.querySelectorAll(".fp-list label").forEach((lb) => {
      const chk = lb.querySelector("input[type=checkbox]")?.checked;
      // Se busca contra el NOMBRE, no contra el textContent de la fila: desde que la
      // opcion puede llevar un contador al costado, el textContent incluye digitos y
      // tipear "12" empezaria a matchear por la cuenta en vez de por el nombre.
      const nom = lb.querySelector(".fp-nom")?.textContent ?? lb.textContent;
      // Lo YA TILDADO queda visible aunque no coincida con la busqueda: si
      // desapareciera, perderias de vista lo que llevas seleccionado y no habria
      // forma de saber que sigue puesto.
      lb.style.display = (!q || normaliza(nom).includes(q) || chk) ? "" : "none";
    });
    actualizarVisCount(pop);
    sincroSelTodos(pop);
  });

  // Clic afuera cierra. Va en el document, y por eso el clic de adentro corta su
  // propagacion mas arriba.
  document.addEventListener("click", (e) => {
    if (pop.hidden) return;
    if (e.target.closest("[data-role=filtro-popup]") || e.target.closest(".funnel")) return;
    cerrarPopup();
  });
}

// Devuelve el nodo del popup de esta pagina. Si el HTML no lo trae, lo crea: asi
// una pantalla nueva no tiene que acordarse de agregar el div.
function nodo() {
  if (POP && POP.isConnected) return POP;
  POP = document.querySelector("[data-role=filtro-popup]");
  if (!POP) {
    POP = document.createElement("div");
    POP.className = "filtro-popup";
    POP.dataset.role = "filtro-popup";
    POP.hidden = true;
    document.body.appendChild(POP);
  }
  wire(POP);
  return POP;
}

// Una opcion de la lista. El nombre va en una linea con ellipsis + title: los
// nombres largos no pueden ensanchar el popup ni cortar la fila en dos.
// `n` opcional: cuantas filas caen en esa opcion. Lo usa Deuda, que cuenta por
// facetas; las pantallas que no lo pasan no dibujan nada.
function opcionHtml({ val, nombre, color, n }) {
  const sw = (color && HEX_SW.test(color)) ? `<span class="fp-sw" style="background:${color}"></span>` : "";
  const cnt = n == null ? "" : `<span class="fp-n">${esc(n)}</span>`;
  return `<label><input type="checkbox" value="${esc(val)}" />${sw}`
       + `<span class="fp-nom" title="${esc(nombre)}">${esc(nombre)}</span>${cnt}</label>`;
}

// ---------------------------------------------------------------------------
// ancla     = el elemento embudo que se apreto (define donde se abre el popup)
// titulo    = encabezado del popup
// opciones  = [{ val, nombre, color }] en el orden en que se muestran
// marcados  = Set de vals tildados al abrir
// onAplicar = (Set de vals, nodoDelPopup) => void
// onLimpiar = () => void
// encabezado = HTML opcional arriba del buscador. Existe para que el popup de
//              Coordinador de Precios (que lleva radios de franquicia/Lince arriba
//              de la lista) pueda migrar sin tocar este archivo. El segundo
//              argumento de onAplicar es el que permite leer esos controles.
// ---------------------------------------------------------------------------
export function abrirPopupLista(ancla, { titulo, opciones = [], marcados = new Set(), onAplicar, onLimpiar, encabezado = "" }) {
  const pop = nodo();

  pop.innerHTML = `<div class="fp-title">${esc(titulo || "")}</div>`
    + encabezado
    + `<input type="text" data-role="fp-buscar" placeholder="filtrar opciones…" />`
    + `<label class="fp-selbar"><input type="checkbox" data-role="fp-sel-todos" />`
    + `<span>Seleccionar todos</span>`
    + `<span class="fp-vis-count" data-role="fp-vis-count"></span></label>`
    + `<div class="fp-list">` + opciones.map(opcionHtml).join("") + `</div>`
    + `<div class="fp-acc"><button type="button" data-role="fp-aplicar">Aplicar</button>`
    + `<button type="button" data-role="fp-limpiar">Limpiar</button></div>`;

  // Los checked se ponen por propiedad, no en el HTML: asi un valor con comillas o
  // acentos no depende de como quedo escrito el atributo.
  pop.querySelectorAll(".fp-list input[type=checkbox]").forEach((chk) => { chk.checked = marcados.has(chk.value); });

  ACTIVO = { onAplicar, onLimpiar };
  actualizarVisCount(pop);
  sincroSelTodos(pop);

  // Posicion: pegado abajo del embudo, pero sin pasarse de los bordes. Hay que
  // mostrarlo ANTES de medir: oculto, offsetWidth da 0 y el clamp no ajustaria nada.
  pop.hidden = false;
  const r = ancla.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + "px";
  pop.style.top = (r.bottom + 4) + "px";

  pop.querySelector("[data-role=fp-buscar]")?.focus();
}
