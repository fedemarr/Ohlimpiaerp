// Login: signInWithPassword → vuelve al destino guardado (o inicio.html).
const v = new URL(import.meta.url).searchParams.get("v") ?? "";
const q = v ? `?v=${v}` : "";
const { supabase } = await import(`../supabase-client.js${q}`);   // aplicarGuard se saltea en login.html

const $ = (r) => document.querySelector(`[data-role=${r}]`);
// Destino tras loguearse: el que guardó el guard (sessionStorage), o inicio por defecto.
function destino() {
  let n = null;
  try { n = sessionStorage.getItem("finflow_next"); sessionStorage.removeItem("finflow_next"); } catch (_) {}
  return (n && n !== "login.html") ? n : "inicio.html";
}

// Si ya hay sesión VÁLIDA (confirmada contra el server), saltear el login.
// getSession() puede devolver un token viejo/inválido → validamos con getUser antes de redirigir,
// así no rebotamos contra el guard (que mandaría de vuelta a login → loop).
const { data } = await supabase.auth.getSession();
if (data.session) {
  const { data: u, error } = await supabase.auth.getUser();
  if (u && u.user && !error) location.replace(destino());
  else { try { await supabase.auth.signOut(); } catch (_) {} }   // sesión inválida → limpiar y mostrar el form
}

const form = $("login-form"), msg = $("msg"), btn = $("ingresar");
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = ($("email").value || "").trim();
  const password = $("password").value || "";
  if (!email || !password) { msg.textContent = "Completá email y contraseña."; return; }
  msg.textContent = ""; btn.disabled = true; btn.textContent = "Ingresando…";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    msg.textContent = "Email o contraseña incorrectos.";
    btn.disabled = false; btn.textContent = "Ingresar";
    return;
  }
  location.replace(destino());
});
