// Función serverless de Vercel — recibe la postulación del formulario
// público (postularme.html) y crea el candidato directamente en Supabase
// en estado 'Precandidato', usando la service_role key. Sin agendamiento
// acá (ticket 25/08/2026) — la entrevista se coordina después, desde
// Candidatos → tab Precandidatos, mandando el link de /agendar-entrevista
// por WhatsApp (ver api/agendar-turno.js, que sí crea el turno).
//
// `candidatos` tiene RLS "solo autenticados" (sql/v015). Esta función es
// la única puerta de escritura para gente sin sesión — toda la validación
// vive acá server-side, nada queda librado al JS del navegador.

const SUPABASE_URL = 'https://caeqsieiuunqvicfpudu.supabase.co';

const GENEROS_VALIDOS = ['Masculino', 'Femenino', 'Otro'];

function limpiar(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function idLocal(offset = 0) {
  return String(Date.now() + offset).slice(-9);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const body = req.body || {};

  // Honeypot: un bot que completa este campo oculto se "acepta" en
  // silencio, sin escribir nada, para no darle pistas de que fue detectado.
  // El nombre es intencionalmente no descriptivo — un campo llamado
  // "empresa"/"company" termina autocompletado por el navegador aunque esté
  // oculto con CSS, lo que tiraba abajo postulaciones reales sin avisar.
  if (limpiar(body.hp_3x9)) {
    res.status(200).json({ ok: true });
    return;
  }

  const apellido = limpiar(body.apellido);
  const nombre = limpiar(body.nombre);
  const dni = limpiar(body.dni);
  const tel = limpiar(body.tel);
  const calle = limpiar(body.calle);
  const zona = limpiar(body.zona);

  if (!apellido || !nombre || !dni || !tel || !calle || !zona) {
    res.status(400).json({ error: 'Faltan datos obligatorios' });
    return;
  }
  if (!/^\d{6,8}$/.test(dni)) {
    res.status(400).json({ error: 'El DNI debe tener entre 6 y 8 dígitos numéricos' });
    return;
  }

  const cuit = limpiar(body.cuit) || null;
  const fecNac = limpiar(body.fecNac) || null;
  const estadoCivil = limpiar(body.estadoCivil) || null;
  const generoRaw = limpiar(body.genero);
  const genero = GENEROS_VALIDOS.includes(generoRaw) ? generoRaw : null;
  const nacionalidad = limpiar(body.nacionalidad) || null;
  const email = limpiar(body.email) || null;
  const piso = limpiar(body.piso) || null;
  const localidad = limpiar(body.localidad) || null;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existente } = await supa.from('candidatos').select('id').eq('dni', dni).maybeSingle();
    if (existente) {
      res.status(409).json({ error: 'Ya existe una postulación con ese DNI' });
      return;
    }

    const nuevoCandidato = {
      id_local: idLocal(),
      apellido,
      nombre,
      dni,
      cuit,
      fec_nac: fecNac,
      estado_civil: estadoCivil,
      genero,
      nacionalidad,
      tel,
      email,
      calle,
      piso,
      zona,
      localidad,
      medio: 'Formulario web',
      estado: 'Precandidato',
      creado_por: 'Formulario público',
    };

    const { error: errCand } = await supa.from('candidatos').insert(nuevoCandidato);

    if (errCand) {
      if (errCand.code === '23505') {
        res.status(409).json({ error: 'Ya existe una postulación con ese DNI' });
        return;
      }
      console.error('postular - error creando candidato:', errCand);
      res.status(500).json({ error: 'No se pudo guardar la postulación' });
      return;
    }

    res.status(200).json({ ok: true, citado: false });
  } catch (e) {
    console.error('postular error:', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
}
