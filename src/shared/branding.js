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

function _comprimirImagen(archivo, maxLado = 480, calidad = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxLado || height > maxLado) {
          const escala = maxLado / Math.max(width, height);
          width = Math.round(width * escala);
          height = Math.round(height * escala);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const esTransparente = archivo.type === 'image/png' || archivo.type === 'image/svg+xml';
        resolve(canvas.toDataURL(esTransparente ? 'image/png' : 'image/jpeg', calidad));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(archivo);
  });
}

// Botón "✏️ Cambiar logo" del propio Inicio (18/08/2026) — el mismo cambio
// que hace subirLogoEmpresa() en Superadmin, pero desde ADENTRO de la
// propia empresa, con su propio SUPA ya logueado — evita el cruce entre
// dos proyectos de Supabase distintos (URL/anon key a mano) que puede
// fallar por muchos motivos. Es el camino más simple y más confiable.
export async function subirLogoPropio(supa, toast) {
  const input = document.getElementById('inicio-logo-file');
  const archivo = input && input.files[0];
  if (!archivo) return;
  if (archivo.size > 15 * 1024 * 1024) { toast?.('⚠️ La imagen es muy pesada (máx. 15MB)'); return; }

  try {
    const dataUrl = await _comprimirImagen(archivo);
    const { data: existente, error: errSelect } = await supa.from('branding_config').select('id').limit(1).maybeSingle();
    if (errSelect) throw errSelect;
    const { error: errWrite } = existente
      ? await supa.from('branding_config').update({ logo_url: dataUrl, updated_at: new Date().toISOString() }).eq('id', existente.id)
      : await supa.from('branding_config').insert({ logo_url: dataUrl });
    if (errWrite) throw errWrite;

    const el = document.getElementById('inicio-hero-logo');
    if (el) el.src = dataUrl;
    toast?.('✓ Logo actualizado');
  } catch (err) {
    console.error('subirLogoPropio:', err);
    toast?.('⚠️ No se pudo guardar el logo: ' + (err.message || 'error desconocido'));
  } finally {
    if (input) input.value = '';
  }
}
