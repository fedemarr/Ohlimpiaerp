// FinFlow — Cartuchos (chips) de etiqueta con color propio: grupos, responsables.
//
// Origen: nacio dentro de precios.js, donde se pintan los cartuchos de Grupo y
// de Resp. Neg. Se extrajo acá cuando el CRM necesito los mismos colores. El
// motivo de compartirla y no copiarla: el umbral de contraste es un numero que
// algun dia vamos a ajustar porque un color queda ilegible, y con dos copias se
// corrige una sola y la otra queda muda. Misma falla que un script SQL que no
// refleja la base.
//
// SOLO FORMATO. No lee la base, no toca el DOM, no depende de ninguna pantalla:
// le entra un nombre y un color, le sale HTML. Por eso se puede compartir sin
// arrastrar riesgo de una pantalla a la otra.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Color neutro cuando hay nombre pero el color falta o no es un hex usable.
// Mejor un cartucho gris que ninguno: el nombre se tiene que leer igual.
export const COLOR_NEUTRO = "#3a4453";

// Hex de 3 o 6 digitos, nada mas. Los de 8 (#RRGGBBAA) traen canal alfa: el
// color que se ve en pantalla depende del fondo que tienen detras, y
// textoContraste calcularia el brillo sobre el hex crudo, eligiendo mal.
const HEX_OK = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const colorValido = (color) => typeof color === "string" && HEX_OK.test(color);

// Texto oscuro/claro segun luminancia del fondo (YIQ, umbral 145 para favorecer
// texto oscuro en los claros). Ante cualquier duda devuelve texto oscuro, que es
// lo legible sobre el gris neutro y sobre la mayoria de los colores de la paleta.
export function textoContraste(hex) {
  const c = String(hex || "").replace("#", "");
  let r, g, b;
  if (c.length === 3) { r = parseInt(c[0] + c[0], 16); g = parseInt(c[1] + c[1], 16); b = parseInt(c[2] + c[2], 16); }
  else if (c.length >= 6) { r = parseInt(c.slice(0, 2), 16); g = parseInt(c.slice(2, 4), 16); b = parseInt(c.slice(4, 6), 16); }
  else return "#12161c";
  if ([r, g, b].some(Number.isNaN)) return "#12161c";
  return (r * 299 + g * 587 + b * 114) / 1000 >= 145 ? "#12161c" : "#f4f8ff";   // fondo claro -> texto oscuro
}

// Fondo efectivo de un cartucho: el color propio si sirve, gris neutro si no.
export const fondoEtq = (color) => (colorValido(color) ? color : COLOR_NEUTRO);

// Cartucho de etiqueta. SIN NOMBRE -> "" (celda vacia, sin cartucho gris): un
// cartucho gris vacio se lee como un dato que existe y no se puede nombrar,
// cuando lo que pasa es que no hay asignacion.
//
// clase: cada pantalla estila el cartucho como le sirve (en Precios llena la
// celda entera, en el CRM va en linea con el texto), asi que el nombre de la
// clase lo elige el caller. Por defecto, la de Precios.
export function chipEtq(nombre, color, clase = "chip-etq") {
  if (!nombre) return "";
  const bg = fondoEtq(color);
  return `<span class="${esc(clase)}" style="background:${bg};color:${textoContraste(bg)}" title="${esc(nombre)}">${esc(nombre)}</span>`;
}
