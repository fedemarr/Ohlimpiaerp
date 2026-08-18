// Multi-empresa (18/08/2026): identidad visual por deploy — nombre, slogan
// y logo de la empresa cliente. Sin estas env vars configuradas (caso de
// Ohlimpia hoy) todo cae a los valores originales de Ohlimpia, así que el
// deploy de Ohlimpia queda exactamente igual que siempre (zero-config).
// Cada empresa cliente nueva setea VITE_EMPRESA_NOMBRE / VITE_EMPRESA_SLOGAN /
// VITE_EMPRESA_LOGO_URL al desplegar su propia instancia (ver superadmin.js
// y MODULOS_CONTRATADOS en nav.js para el resto del aislamiento por empresa).

export const EMPRESA_NOMBRE = import.meta.env.VITE_EMPRESA_NOMBRE || 'Ohlimpia';
export const EMPRESA_SLOGAN = import.meta.env.VITE_EMPRESA_SLOGAN || 'Lo que cuidamos, lo construimos entre todos';
export const EMPRESA_LOGO_URL = import.meta.env.VITE_EMPRESA_LOGO_URL || '';

// Usamos getElementById en vez de selectores de clase a propósito: la clase
// "nombre" se repite en el sidebar (nombre de la empresa) y en el nombre del
// usuario logueado — un selector por clase pisaría el nombre de usuario.
export function aplicarBranding() {
  if (EMPRESA_NOMBRE === 'Ohlimpia' && !EMPRESA_LOGO_URL) return; // no-op para Ohlimpia

  document.title = document.title.replace(/Ohlimpia/g, EMPRESA_NOMBRE);

  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const setImg = (id, url) => { const el = document.getElementById(id); if (el && url) el.src = url; };

  setText('boot-logo-texto', EMPRESA_NOMBRE);
  setText('login-marca', EMPRESA_NOMBRE);
  setText('sidebar-empresa-nombre', EMPRESA_NOMBRE);
  setText('inicio-hero-nombre', EMPRESA_NOMBRE.toUpperCase());
  // "Sistema de Gestión Cooperativa" es específico de Ohlimpia (no todo
  // cliente es cooperativa) — para otras empresas se reemplaza por algo genérico.
  setText('login-sub', 'Sistema de Gestión');

  if (EMPRESA_LOGO_URL) {
    setImg('inicio-hero-logo', EMPRESA_LOGO_URL);
  }

  // Plantilla de WhatsApp del calendario de entrevistas (Candidatos) — decía
  // "Cooperativa Ohlimpia" fijo. No todo cliente es una cooperativa, así que
  // para otras empresas queda genérico (sin la palabra "Cooperativa").
  const tplWhatsapp = document.getElementById('tpl-whatsapp-entrevista');
  if (tplWhatsapp) {
    tplWhatsapp.value = tplWhatsapp.value.replace('Cooperativa Ohlimpia', EMPRESA_NOMBRE);
  }
}

// Logo "en vivo" (18/08/2026): a diferencia de VITE_EMPRESA_LOGO_URL (env
// var, hornea el logo en el build — cambiarlo pide redeploy), esto lee la
// tabla branding_config de la base de ESTA empresa en cada carga de
// página. Así, subir un logo nuevo desde el panel de Superadmin de
// Ohlimpia se refleja acá solo, sin que Fede tenga que redesplegar nada.
// Si la tabla no existe todavía en esta base (empresas viejas, o Ohlimpia
// mismo) o no hay fila cargada, no hace nada — no rompe nada.
export async function aplicarBrandingRemoto(supa) {
  try {
    const { data, error } = await supa.from('branding_config').select('logo_url').limit(1).maybeSingle();
    if (error || !data || !data.logo_url) return;
    const el = document.getElementById('inicio-hero-logo');
    if (el) el.src = data.logo_url;
  } catch {
    // tabla inexistente en esta base u otro error de red — no es crítico,
    // el logo simplemente se queda con el que ya tenía (env var o default).
  }
}
