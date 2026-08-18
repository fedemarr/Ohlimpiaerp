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
}
