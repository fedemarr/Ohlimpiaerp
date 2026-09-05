// Función serverless de Vercel — alta de usuarios del sistema (v098).
// Crea la cuenta en Supabase Auth (admin.createUser) y completa la fila
// correspondiente en public.usuarios, usando la service_role key.
//
// ¿Por qué un endpoint y no el cliente del navegador? createUser requiere
// service_role — jamás puede vivir en el front. El llamador (tab "Acceso y
// perfiles" de Configuración) envía su access_token; acá se verifica que:
//   1. el token sea válido,
//   2. quien llama sea 'Administrador total' según public.usuarios.
// El trigger handle_new_user (sql/v013) autoprovisiona la fila en
// public.usuarios cuando se crea el auth user; este endpoint hace después
// el UPDATE con nombre/perfil/funcion/nickname definitivos.

// Multi-empresa (05/09/2026, ticket "supabaseKey is required en Clean Paz"): esta URL
// estaba hardcodeada a Ohlimpia en las 10 funciones serverless de api/ —
// cualquier deploy de otra empresa (mismo código, otro proyecto Vercel)
// terminaba escribiendo en la base de OHLIMPIA en vez de la propia. El
// frontend ya resuelve esto con VITE_SUPABASE_URL (ver src/shared/supabase.js);
// Vercel expone las env vars VITE_* también server-side, así que alcanza con
// leerla acá — el fallback deja el deploy de Ohlimpia sin cambios.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://caeqsieiuunqvicfpudu.supabase.co';
// Fix (26/08/2026): SUPABASE_ANON_KEY nunca se configuró como variable de
// entorno en Vercel (solo estaba SUPABASE_SERVICE_ROLE_KEY) → createClient
// recibía '' y tiraba "supabaseKey is required.", rompiendo el alta de
// usuarios enteramente. Es la misma anon/publishable key que ya usa el
// cliente del navegador (src/shared/supabase.js) — es pública por diseño
// (por eso el prefijo "publishable"), no un secreto; se hardcodea el mismo
// fallback acá para no depender de que alguien la vuelva a cargar a mano.
const SUPABASE_ANON_KEY_FALLBACK = 'sb_publishable__SBdO6cSQXYfgR16FrztwA_Cf9sNosd';

const PERFILES_VALIDOS = [
  'Administrador total', 'Gerencia General', 'Consejo Directivo', 'Finanzas',
  'RRHH', 'Logística', 'Auditor', 'Supervisor', 'Comercial', 'Operaciones',
  'DEVELOPER',
];

function limpiar(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const body = req.body || {};
  const token = limpiar(body.access_token);
  const email = limpiar(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const nombre = limpiar(body.nombre);
  const perfil = limpiar(body.perfil);
  const funcion = limpiar(body.funcion) || null;
  const nickname = limpiar(body.nickname) || null;

  if (!token) { res.status(401).json({ error: 'Falta el token de sesión' }); return; }
  if (!nombre || !email || !perfil) {
    res.status(400).json({ error: 'Nombre, email y perfil son obligatorios' });
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).json({ error: 'Email inválido' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    return;
  }
  if (!PERFILES_VALIDOS.includes(perfil)) {
    res.status(400).json({ error: 'Perfil desconocido: ' + perfil });
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');

    // Cliente 1 — con el token del llamador, para verificar identidad.
    const supaUser = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_FALLBACK, {
      global: { headers: { Authorization: 'Bearer ' + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sesion, error: errSesion } = await supaUser.auth.getUser(token);
    if (errSesion || !sesion?.user) {
      res.status(401).json({ error: 'Sesión inválida o expirada' });
      return;
    }

    // Cliente 2 — service_role para todo lo demás.
    const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Autorización: solo Administrador total da de alta usuarios.
    const { data: caller } = await supa.from('usuarios')
      .select('perfil').eq('id', sesion.user.id).maybeSingle();
    if (!caller || caller.perfil !== 'Administrador total') {
      res.status(403).json({ error: 'Solo Administrador total puede crear usuarios' });
      return;
    }

    const { data: existente } = await supa.auth.admin.listUsers();
    if (existente?.users?.some(u => (u.email || '').toLowerCase() === email)) {
      res.status(409).json({ error: 'Ya existe un usuario con ese email' });
      return;
    }

    // Crea la cuenta. El trigger on_auth_user_created inserta la fila en
    // public.usuarios con el id uuid — luego se completa acá abajo.
    const { data: nuevo, error: errCrear } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (errCrear || !nuevo?.user) {
      console.error('crear-usuario - error createUser:', errCrear);
      res.status(500).json({ error: errCrear?.message || 'No se pudo crear la cuenta' });
      return;
    }

    const { data: fila, error: errUpdate } = await supa.from('usuarios')
      .update({ nombre, perfil, funcion, nickname })
      .eq('id', nuevo.user.id)
      .select()
      .single();
    if (errUpdate) {
      console.error('crear-usuario - error update usuarios:', errUpdate);
      res.status(500).json({
        error: 'La cuenta se creó pero no se pudieron guardar los datos (' + errUpdate.message + ')',
      });
      return;
    }

    // snake → camel para que la UI lo use directo como resto de DB.usuarios.
    res.status(200).json({
      ok: true,
      usuario: {
        id: fila.id,
        nombre: fila.nombre,
        email: fila.email,
        perfil: fila.perfil,
        funcion: fila.funcion,
        nickname: fila.nickname,
        activo: fila.activo,
      },
    });
  } catch (e) {
    console.error('crear-usuario error:', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
}
