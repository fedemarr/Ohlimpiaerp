// Guard de sesión CENTRALIZADO. Se invoca una sola vez desde supabase-client.js
// (que todas las páginas importan), así ninguna se escapa y no hay que editar los 22 HTML.
// - Sin sesión → guarda el destino y redirige a login.html.
// - Sesión válida → inyecta "email · Salir" en el nav (o header).
// - Cierre / expiración de sesión (token no renovable) → vuelve a login.html.

const ESPERA_INFINITA = new Promise(() => {});   // frena la ejecución del módulo tras redirigir
const nombrePagina = () => (location.pathname.split("/").pop() || "").toLowerCase();
// Robusto: compara el nombre de archivo al final del pathname (no un includes/contains).
const esLogin = () => nombrePagina().startsWith("login");   // login.html, login, login.htm…

export async function aplicarGuard(supabase) {
  if (esLogin()) return;   // el login NO se protege (evita el loop)

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    // recordar a dónde quería ir, para volver ahí tras loguearse
    try { sessionStorage.setItem("finflow_next", nombrePagina() + location.search); } catch (_) {}
    location.replace("login.html");
    await ESPERA_INFINITA;   // no dejar que la página siga (evita consultas/flash de datos)
  }

  // Sesión válida → revelar el contenido que el snippet del <head> mantenía oculto.
  // El failsafe de 3s del snippet cubre el caso de que este módulo nunca cargue.
  document.documentElement.classList.remove("au-espera");

  // Sesión cerrada o expirada (refresh de token fallido) → login. Cubre el caso 401/sesión vencida.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && !esLogin()) location.replace("login.html");
  });

  // Barra de sesión (email + Salir). Robusto: reintenta hasta que el DOM esté, y se re-inyecta
  // si alguna página re-renderiza su header y la pisa.
  asegurarBarraSesion(supabase, data.session.user?.email || "");
}

let _observando = false;
function asegurarBarraSesion(supabase, email) {
  const intentar = () => document.querySelector("[data-role=au-salir]") ? true : montarBarraSesion(supabase, email);
  if (!intentar()) {
    let n = 0;
    const iv = setInterval(() => { if (intentar() || ++n > 40) clearInterval(iv); }, 120);   // por si el nav aún no está
    document.addEventListener("DOMContentLoaded", intentar, { once: true });
  }
  // Re-inyecta si un re-render borra la barra.
  if (!_observando && window.MutationObserver) {
    _observando = true;
    new MutationObserver(() => { if (!document.querySelector("[data-role=au-salir]")) montarBarraSesion(supabase, email); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
}

// Devuelve true si logró inyectar (había dónde), false si no (reintentar).
function montarBarraSesion(supabase, email) {
  if (document.querySelector("[data-role=au-salir]")) return true;   // idempotente
  const cont = document.querySelector("nav") || document.querySelector("header") || document.body;
  if (!cont) return false;

  const wrap = document.createElement("span");
  wrap.dataset.role = "au-bar";
  wrap.style.cssText = "display:inline-flex;gap:10px;align-items:center;margin-left:14px;font-size:13px;vertical-align:middle";

  const emailEl = document.createElement("span");
  emailEl.dataset.role = "au-email";
  emailEl.textContent = "👤 " + email;
  emailEl.style.cssText = "color:#cbd7ea;";

  const salir = document.createElement("a");
  salir.href = "#"; salir.textContent = "Salir"; salir.dataset.role = "au-salir";
  salir.style.cssText = "cursor:pointer;color:#38bdf8;text-decoration:none;border:1px solid rgba(56,189,248,0.6);border-radius:5px;padding:2px 10px;font-weight:600;";
  salir.addEventListener("click", async (e) => {
    e.preventDefault();
    try { await supabase.auth.signOut(); } catch (_) {}
    location.replace("login.html");
  });

  wrap.append(emailEl, salir);
  if (cont.tagName === "NAV") {
    cont.appendChild(wrap);   // dentro del nav, al final de los links
  } else {
    // header/body sin nav (inicio, planes-afip-import): barra fija arriba a la derecha
    wrap.style.cssText += "position:fixed;top:10px;right:14px;z-index:1000;background:rgba(15,20,27,0.85);padding:4px 10px;border-radius:6px;";
    cont.appendChild(wrap);
  }
  return true;
}
