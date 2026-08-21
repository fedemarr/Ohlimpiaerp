// FinFlow — Redimensionar columnas arrastrando el borde del encabezado.
//
// Extraido de precios.js, donde nacio. Se comparte SOLO la mecanica del arrastre:
// donde empezo el mouse, cuanto se movio, el clamp a min/max, el commit al soltar.
// Eso es identico en cualquier tabla y no tiene nada de la pantalla adentro.
//
// Lo que NO se comparte, y por eso entra como callback `aplicar`: COMO se pinta el
// ancho. Precios no puede escribir el <col> porque sus columnas son fijas (sticky)
// y los offsets `left` se calculan con calc() sobre variables CSS, asi que escribe
// --w-<col> en el <table>. El CRM no tiene columnas fijas y escribe el <col>
// derecho. Meter los dos caminos acá obligaria a una pantalla a trabajar como la
// otra sin ninguna razon.
//
// Tampoco se comparte la persistencia: en Precios el ancho viaja en el mismo
// localStorage que la visibilidad de columnas (menu de columnas), que el CRM no
// tiene. Entra como `onCommit`, y se llama UNA vez al soltar.

export const clampAncho = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

// thead      = elemento donde se delega el mousedown (los handles viven adentro)
// anchos     = objeto col -> px. SE MUTA al soltar: es el estado que el caller persiste
// limites    = col -> [min, max]
// aplicar    = (col, px) => void. Como pinta el ancho esta pantalla
// onCommit   = () => void. Se llama al soltar, para persistir
export function wireResizeColumnas({ thead, anchos, limites, aplicar, onCommit, limiteDefecto = [40, 600] }) {
  if (!thead || !anchos || typeof aplicar !== "function") return;

  thead.addEventListener("mousedown", (e) => {
    const h = e.target.closest(".col-resize");
    if (!h) return;
    const col = h.dataset.col;
    if (!col || !(col in anchos)) return;   // handle sin columna conocida: no hace nada
    e.preventDefault();                     // sin esto, el arrastre selecciona el texto del encabezado

    const [mn, mx] = limites?.[col] || limiteDefecto;
    const startX = e.clientX, startW = anchos[col];
    const anchoEn = (ev) => clampAncho(startW + (ev.clientX - startX), mn, mx);

    // Durante el arrastre se PINTA pero no se guarda: persistir en cada mousemove
    // escribiria decenas de veces por segundo. El commit va una sola vez, al soltar.
    const onMove = (ev) => aplicar(col, anchoEn(ev));
    const onUp = (ev) => {
      anchos[col] = anchoEn(ev);
      aplicar(col, anchos[col]);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      onCommit?.();
    };

    document.body.style.userSelect = "none";   // el arrastre no deja texto seleccionado atras
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
