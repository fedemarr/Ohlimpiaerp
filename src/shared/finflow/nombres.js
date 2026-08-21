// FinFlow — Formato de nombres para MOSTRAR en pantalla.
//
// SOLO VISUAL. El dato real no se toca nunca: lo que se acorta es lo que se pinta
// en la celda, y el nombre completo va en el title. Filtros, busquedas, orden y
// exportaciones siguen trabajando sobre el nombre real.
//
// POR QUE ESTA COMPARTIDO: al extraerla habia TRES copias en el repo (precios.js,
// caja.js, horas.js) con DOS expresiones distintas, y no daban el mismo resultado.
// Con un cliente escrito "Consorcio de Propitarios ..." (sin la e, variante que
// existe), la version de caja/horas devolvia "Cons. Prop. itarios ...". Esta es la
// de precios.js, que es la que maneja bien esa variante.
//
// Caja y Horas ya usan esta funcion (sus copias locales se borraron). precios.js
// todavia tiene la suya: su migracion es un paso aparte.

// Prefijo "Consorcio de Propietarios" y variantes -> "Cons. Prop. ".
// Cubre: consorcio/cons/cons., de opcional, copropietarios/propietarios,
// la variante mal escrita "propitarios", y prop/prop. abreviado.
// Exige espacio despues del prefijo para no comerse parte de un nombre pegado.
const RE_CONS = /^cons(?:orcio)?\.?\s+(?:de\s+)?(?:co)?prop(?:ietarios|itarios)?\.?\s+/i;

export const acortarNombre = (n) => String(n ?? "").replace(RE_CONS, "Cons. Prop. ");

// "Esqueleto" de un nombre: minusculas, sin tildes, solo alfanumerico (sin puntos
// ni espacios). Si dos nombres tienen el mismo esqueleto son EL MISMO NOMBRE
// escrito distinto: "TARIK S.C.A." y "TARIK SCA" dan "tariksca".
//
// SE USA PARA DOS COSAS Y LAS DOS IMPORTAN:
//  1. En el ABM, distinguir una diferencia de nombre COSMETICA de una real.
//  2. En los dos cruces con LIGE, detectar que un cliente YA EXISTE aunque su CUIT
//     no matchee — que es lo que evita crear duplicados. Sin esto, un cliente
//     cargado con otro CUIT (TARIK, IDERO, UPSALA) o sin ninguno (FOCIDA, GHAL,
//     BA PROPERTY) se daba de alta de nuevo y el historial quedaba partido en dos.
//
// VIVE ACA Y NO EN CADA PANTALLA por el mismo motivo que acortarNombre: dos copias
// con expresiones apenas distintas dan resultados distintos, y el dia que una
// pantalla diga "es el mismo cliente" y la otra diga que no, nadie va a saber cual
// tiene razon.
// El rango de acentos va con escapes (\u0300-\u036f) y no con los caracteres
// literales: son marcas combinantes INVISIBLES en el editor, y un copiado que se
// coma una deja la funcion silenciosamente distinta de la de al lado.
export const esqueletoNombre = (s) => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]/g, "");
