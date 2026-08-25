// Función serverless de Vercel — resetea la contraseña de un usuario del
// sistema (ticket "resetear contraseña", 26/08/2026).
//
// Mismo patrón que crear-usuario.js: admin.updateUserById requiere
// service_role, jamás puede vivir en el front. El llamador (tab "Acceso y
// perfiles" de Configuración) envía su access_token; acá se verifica que:
//   1. el token sea válido,
//   2. quien llama sea 'Administrador total' según public.usuarios.
// No hay forma de "recuperar" la contraseña anterior — Supabase Auth sólo
// guarda el hash, nunca el valor en texto plano — por eso esto genera una
// nueva, no muestra la vieja.

const SUPABASE_URL = 'https://caeqsieiuunqvicfpudu.supabase.co';
// Misma anon/publishable key pública que crear-usuario.js — ver comentario
// ahí sobre por qué se hardcodea el fallback.
const SUPABASE_ANON_KEY_FALLBACK = 'sb_publishable__SBdO6cSQXYfgR16FrztwA_Cf9sNosd';

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
  const usuarioId = limpiar(body.usuarioId);
  const nuevaPassword = typeof body.nuevaPassword === 'string' ? body.nuevaPassword : '';

  if (!token) { res.status(401).json({ error: 'Falta el token de sesión' }); return; }
  if (!usuarioId) { res.status(400).json({ error: 'Falta el usuario a resetear' }); return; }
  if (nuevaPassword.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
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

    // Autorización: solo Administrador total resetea contraseñas ajenas.
    const { data: caller } = await supa.from('usuarios')
      .select('perfil').eq('id', sesion.user.id).maybeSingle();
    if (!caller || caller.perfil !== 'Administrador total') {
      res.status(403).json({ error: 'Solo Administrador total puede resetear contraseñas' });
      return;
    }

    const { data: destino } = await supa.from('usuarios')
      .select('id, email, nombre').eq('id', usuarioId).maybeSingle();
    if (!destino) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const { error: errUpdate } = await supa.auth.admin.updateUserById(usuarioId, {
      password: nuevaPassword,
    });
    if (errUpdate) {
      console.error('resetear-password - error updateUserById:', errUpdate);
      res.status(500).json({ error: errUpdate.message || 'No se pudo resetear la contraseña' });
      return;
    }

    res.status(200).json({ ok: true, email: destino.email, nombre: destino.nombre });
  } catch (e) {
    console.error('resetear-password error:', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
}
