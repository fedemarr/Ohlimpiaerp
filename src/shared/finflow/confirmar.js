// FinFlow — Confirmacion in-modal, en reemplazo de window.confirm.
//
// Extraida de precios.js, donde nacio y donde tiene 16 usos. Se comparte al
// necesitarla el CRM para las acciones en bloque: una accion que toca 60 casos de
// produccion no puede dispararse sin un "estas seguro".
//
// POR QUE NO window.confirm: el del navegador no se puede estilar, no admite
// resaltar la accion peligrosa, y en algunos navegadores se puede silenciar con
// "no volver a mostrar", que es exactamente lo que no queremos en una accion
// destructiva.
//
// ES BLOQUEANTE A PROPOSITO: no se cierra por clic afuera ni con Escape, solo con
// los botones. Un clic distraido en el fondo no puede contar como respuesta.
//
// El nodo se crea solo la primera vez: una pantalla nueva no tiene que acordarse
// de agregar nada al HTML.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let FONDO = null;
let CAJA = null;

function nodos() {
  if (FONDO && FONDO.isConnected) return;
  FONDO = document.createElement("div");
  FONDO.className = "cfm-fondo";
  FONDO.hidden = true;
  CAJA = document.createElement("div");
  CAJA.className = "cfm-caja";
  FONDO.appendChild(CAJA);
  document.body.appendChild(FONDO);
}

// titulo  = encabezado
// mensaje = HTML SIMPLE permitido (<b>, <br>) — es a proposito, para poder
//           resaltar cuantos registros se van a tocar. Los datos dinamicos los
//           escapa QUIEN LLAMA; acá no se escapa para no romper ese uso.
// si / no = textos de los botones
// peligro = pinta el boton de confirmar en rojo (borrar, precerrar en bloque)
//
// Devuelve Promise<boolean>.
export function confirmar({ titulo = "Confirmar", mensaje = "", si = "Sí", no = "Cancelar", peligro = false } = {}) {
  return new Promise((resolve) => {
    nodos();
    CAJA.innerHTML = `<div class="cfm-titulo">${esc(titulo)}</div>`
      + `<div class="cfm-msg">${mensaje}</div>`
      + `<div class="cfm-acc">`
      + `<button type="button" data-role="cfm-no">${esc(no)}</button>`
      + `<button type="button" data-role="cfm-si" class="cfm-si${peligro ? " cfm-peligro" : ""}">${esc(si)}</button>`
      + `</div>`;
    FONDO.hidden = false;

    const cerrar = (val) => {
      FONDO.hidden = true;
      CAJA.innerHTML = "";
      CAJA.onclick = null;
      resolve(val);
    };
    CAJA.onclick = (e) => {
      const r = e.target.dataset.role;
      if (r === "cfm-si") cerrar(true);
      else if (r === "cfm-no") cerrar(false);
    };
    // El foco arranca en CANCELAR, no en confirmar: si alguien viene apretando
    // Enter de un formulario anterior, no confirma sin leer.
    CAJA.querySelector("[data-role=cfm-no]")?.focus();
  });
}
