// FinFlow — Alto del contenedor con scroll, MEDIDO, no clavado.
//
// Extraida de precios.js. Se comparte al necesitarla el CRM.
//
// POR QUE NO UN NUMERO FIJO (el clasico `max-height: calc(100vh - 190px)`)
// Ese 190 es la suma de encabezado + barra de filtros a UN escalado de pantalla.
// Windows al 125% o 150% agranda todo eso y el numero deja de valer: la tabla se
// pasa del viewport y la barra de scroll horizontal queda abajo, fuera de la vista.
// Ademas se rompe solo con agregar una fila de filtros.
//
// Se mide la posicion REAL del contenedor y se llena hasta el borde de la ventana.
//
// SE RECALCULA POR DOS MOTIVOS:
//   · resize          -> cambio de ventana o de escalado.
//   · ResizeObserver  -> cambio de alto de LO QUE ESTA ARRIBA (chips que pasan a
//                        dos renglones, una barra que aparece). Observar el
//                        contenedor de los controles cubre todos esos casos sin
//                        tener que enumerarlos uno por uno.

const el = (x) => (typeof x === "string" ? document.querySelector(x) : x);

// contenedor = el elemento con overflow:auto que tiene que ocupar lo que queda
// observar   = elemento de arriba cuyo alto puede cambiar (la barra de controles)
// margen     = px libres hasta el borde inferior; el default deja ver el borde y
//              su barra de scroll horizontal.
//              PUEDE SER UNA FUNCION, y se evalua en cada ajuste. Es para las
//              barras flotantes (position:fixed) que aparecen y desaparecen: no
//              cambian el alto de nada, asi que el observador no las ve, pero
//              tapan la parte de abajo del contenedor. Devolviendo el alto que
//              tapan, ese espacio se descuenta solo.
// minimo     = piso, para que en una ventana muy baja no quede en cero
//
// Devuelve la funcion de ajuste, por si hace falta llamarla a mano.
export function wireAltoTabla({ contenedor, observar, margen = 16, minimo = 120 }) {
  const cont = el(contenedor);
  if (!cont) return () => {};

  const ajustar = () => {
    const top = cont.getBoundingClientRect().top;
    const libre = typeof margen === "function" ? margen() : margen;
    cont.style.height = Math.max(minimo, window.innerHeight - top - libre) + "px";
  };

  ajustar();
  window.addEventListener("resize", ajustar);

  const arriba = el(observar);
  if (arriba && "ResizeObserver" in window) new ResizeObserver(ajustar).observe(arriba);

  return ajustar;
}
