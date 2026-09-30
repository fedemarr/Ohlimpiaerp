// Función serverless de Vercel — login del Portal Asociado.
//
// Por qué existe: el Portal Asociado no tiene password propia (nro de
// socio + apellido), pero para poder LEER `legajos`/`prestamos`/etc bajo
// RLS ("FOR ALL TO authenticated USING (true)" en casi todo el proyecto)
// el navegador necesita algún tipo de sesión de Supabase Auth. Antes se
// resolvía con `signInAnonymously()` del lado del cliente — roto en
// producción porque el proveedor anónimo está deshabilitado (y a
// propósito: habilitarlo le daría una sesión `authenticated` a CUALQUIER
// visitante sin ningún dato, no solo a quien pase este chequeo — ver
// TICKET_RLS_ROL_ANON_AUTHENTICATED.md).
//
// Cómo funciona esto en cambio: el server (con service_role, que NUNCA
// sale de acá) valida nro+apellido contra `legajos` de verdad. Si matchea,
// genera un magic-link de Supabase Auth para una cuenta técnica única y
// compartida (no una por asociado — este perfil no distingue por
// auth.uid(), arma su `currentUser` a mano desde el legajo) y le devuelve
// al navegador el token para canjear, no la key de servicio. El navegador
// después llama `SUPA.auth.verifyOtp()` con la key pública de siempre —
// exactamente el mismo patrón de "server verifica identidad con lógica
// propia, cliente canjea un token de un solo uso" que ya usa cualquier
// login por link mágico.
//
// ⚠️ Aviso de seguridad realista (no es perfecto, pero no es peor que
// antes): nro de socio + apellido es una identificación débil — no es una
// contraseña. Esto NO le da a cualquiera acceso a los datos de OTRO
// asociado (la pantalla sigue filtrando por el legajo que matcheó), pero
// como la sesión resultante es `authenticated` a secas (RLS de este
// proyecto no distingue "soy el asociado X"), alguien que force varios
// nro+apellido hasta acertar uno real consigue una sesión que, por cómo
// están las policies HOY, puede leer más que su propio portal si abre la
// consola. Es el mismo modelo de seguridad que ya tenía este login antes
// de romperse — no lo empeora, pero tampoco resuelve el problema de fondo
// de las policies `USING (true)` (ver TICKET_RLS_ROL_ANON_AUTHENTICATED.md).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://caeqsieiuunqvicfpudu.supabase.co';
const TECH_EMAIL = 'portal-asociado@ohlimpia.internal';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { nroSocio, apellido } = req.body || {};
  const nro = parseInt(nroSocio, 10) || 0;
  const apellidoNorm = String(apellido || '').trim().toLowerCase();
  if (!nro || !apellidoNorm) {
    res.status(400).json({ error: 'Ingresá el número de socio y el apellido.' });
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'El Portal Asociado no está configurado del lado del servidor todavía — avisá a sistemas.' });
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Mismo criterio que ya usaba loginAsociado() del lado del cliente
    // (nro exacto + apellido como substring del nombre, activo) — se
    // mueve acá para no tener que exponer el legajo completo de nadie
    // antes de confirmar quién es.
    const { data: legajo, error: errLeg } = await supa
      .from('legajos')
      .select('nro, nombre, funcion, estado, servicio, supervisor')
      .eq('nro', nro)
      .eq('estado', 'Activo')
      .maybeSingle();

    if (errLeg) {
      console.error('portal-asociado-login: error consultando legajos:', errLeg.message);
      res.status(500).json({ error: 'No pudimos verificar tus datos en este momento — probá de nuevo en un rato.' });
      return;
    }

    // Mensaje verdadero (pedido explícito): si no matchea, es porque no
    // matchea — nunca porque falló otra cosa del lado del servidor. Y si
    // falla otra cosa del servidor, el mensaje de arriba/abajo lo dice tal
    // cual, no "número de socio incorrecto".
    if (!legajo || !legajo.nombre.toLowerCase().includes(apellidoNorm)) {
      res.status(401).json({ error: 'No encontramos un asociado activo con ese número de socio y ese apellido.' });
      return;
    }

    // Asegurar la cuenta técnica compartida (se crea una sola vez, después
    // se reusa siempre) — no es una cuenta por asociado.
    let userId = null;
    const { data: listado, error: errList } = await supa.auth.admin.listUsers();
    if (errList) {
      console.error('portal-asociado-login: error listando usuarios:', errList.message);
      res.status(500).json({ error: 'No pudimos iniciar tu sesión en este momento — probá de nuevo en un rato.' });
      return;
    }
    const existente = listado.users.find((u) => u.email === TECH_EMAIL);
    if (existente) {
      userId = existente.id;
    } else {
      const { data: creado, error: errCrear } = await supa.auth.admin.createUser({
        email: TECH_EMAIL,
        email_confirm: true,
        user_metadata: { tipo: 'cuenta_tecnica_portal_asociado' },
      });
      if (errCrear) {
        console.error('portal-asociado-login: error creando cuenta técnica:', errCrear.message);
        res.status(500).json({ error: 'No pudimos iniciar tu sesión en este momento — probá de nuevo en un rato.' });
        return;
      }
      userId = creado.user.id;
    }

    const { data: linkData, error: errLink } = await supa.auth.admin.generateLink({
      type: 'magiclink',
      email: TECH_EMAIL,
    });
    if (errLink || !linkData?.properties?.hashed_token) {
      console.error('portal-asociado-login: error generando el link:', errLink?.message);
      res.status(500).json({ error: 'No pudimos iniciar tu sesión en este momento — probá de nuevo en un rato.' });
      return;
    }

    res.status(200).json({
      ok: true,
      tokenHash: linkData.properties.hashed_token,
      tipoOtp: 'magiclink',
      legajo: { nro: legajo.nro, nombre: legajo.nombre, funcion: legajo.funcion, servicio: legajo.servicio, supervisor: legajo.supervisor },
    });
  } catch (e) {
    console.error('portal-asociado-login error:', e);
    res.status(500).json({ error: 'Ocurrió un error inesperado — probá de nuevo en un rato.' });
  }
}
