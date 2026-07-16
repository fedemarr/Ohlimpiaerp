// Función serverless de Vercel — analiza un PDF (certificado de antecedentes
// o apto médico) con la API de Claude y devuelve campos estructurados.
//
// La API key de Anthropic vive solo acá (variable de entorno de Vercel),
// nunca en el bundle del cliente. Ver CLAUDE.md / sql/README para el resto
// del proyecto — esta es la primera pieza de "backend propio".

const SUPABASE_URL = 'https://caeqsieiuunqvicfpudu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__SBdO6cSQXYfgR16FrztwA_Cf9sNosd';
const BUCKET = 'ohlimpia-adjuntos';
const MAX_PDF_BYTES = 10 * 1024 * 1024; // mismo límite que adjuntos.js al subir

// nombreDetectado/dniDetectado: se piden en los 3 esquemas para que el
// frontend pueda verificar que el documento realmente pertenece a la persona
// del registro (comparando contra el nombre/DNI ya cargados), en vez de
// confiar ciegamente en qué adjunto subió cada quien.
const IDENTIDAD_PROPS = {
  nombreDetectado: { type: 'string', description: 'Nombre completo de la persona tal como figura en el documento. Cadena vacía si no es legible.' },
  dniDetectado: { type: 'string', description: 'Número de DNI de la persona tal como figura en el documento, solo dígitos. Cadena vacía si no es legible.' },
};

const SCHEMAS = {
  antecedente: {
    type: 'object',
    properties: {
      resultado: { type: 'string', enum: ['Sin antecedentes', 'Con antecedentes', 'No se pudo determinar'] },
      fechaEmision: { type: 'string', description: 'Fecha de emisión del certificado en formato YYYY-MM-DD. Cadena vacía si no figura en el documento.' },
      detalles: { type: 'string', description: 'Resumen breve en español de lo encontrado (organismo emisor, jurisdicción, observaciones relevantes).' },
      confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
      ...IDENTIDAD_PROPS,
    },
    required: ['resultado', 'fechaEmision', 'detalles', 'confianza', 'nombreDetectado', 'dniDetectado'],
    additionalProperties: false,
  },
  'apto-medico': {
    type: 'object',
    properties: {
      resultado: { type: 'string', enum: ['APTO', 'APTO B', 'APTO C', 'APTO PENDIENTE', 'NO APTO', 'No se pudo determinar'] },
      fecha: { type: 'string', description: 'Fecha del examen o certificado en formato YYYY-MM-DD. Cadena vacía si no figura en el documento.' },
      detalles: { type: 'string', description: 'Resumen breve en español de restricciones u observaciones médicas relevantes.' },
      confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
      ...IDENTIDAD_PROPS,
    },
    required: ['resultado', 'fecha', 'detalles', 'confianza', 'nombreDetectado', 'dniDetectado'],
    additionalProperties: false,
  },
  'informe-psico': {
    type: 'object',
    properties: {
      resultado: { type: 'string', enum: ['Apto', 'Apto+', 'Apto-', 'Apto condicional', 'No Apto', 'No se pudo determinar'] },
      detalles: { type: 'string', description: 'Resumen breve en español de las observaciones relevantes del informe.' },
      confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
      ...IDENTIDAD_PROPS,
    },
    required: ['resultado', 'detalles', 'confianza', 'nombreDetectado', 'dniDetectado'],
    additionalProperties: false,
  },
};

const PROMPTS = {
  antecedente: 'Este PDF es un certificado de antecedentes penales de Argentina. Leelo y determiná si la persona tiene o no antecedentes registrados, la fecha de emisión del certificado, y cualquier detalle relevante (organismo emisor, jurisdicción). También extraé el nombre completo y el DNI de la persona tal como figuran en el documento. Si el documento no es legible o no es un certificado de antecedentes, usá resultado "No se pudo determinar" y explicá por qué en "detalles".',
  'apto-medico': 'Este PDF es un certificado de aptitud médica laboral (preocupacional) de Argentina. Leelo y determiná el resultado del examen, la fecha, y cualquier restricción u observación médica relevante. También extraé el nombre completo y el DNI de la persona tal como figuran en el documento. Si el documento no es legible o no es un apto médico, usá resultado "No se pudo determinar" y explicá por qué en "detalles".',
  'informe-psico': 'Este PDF es un informe psicotécnico laboral de Argentina. Leelo y determiná el resultado de la evaluación, cualquier observación relevante, y el nombre completo y DNI de la persona evaluada tal como figuran en el documento. Si el documento no es legible o no es un informe psicotécnico, usá resultado "No se pudo determinar" y explicá por qué en "detalles".',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'Falta el token de sesión' });
    return;
  }

  const { tipo, path } = req.body || {};
  if (!tipo || !SCHEMAS[tipo] || !path) {
    res.status(400).json({ error: 'Falta tipo o path, o el tipo no es válido' });
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Valida el token contra Supabase Auth — cualquier usuario logueado puede
    // llamar este endpoint (mismo nivel de exigencia que el resto del sistema).
    const { data: userData, error: userErr } = await supa.auth.getUser(token);
    if (userErr || !userData?.user) {
      res.status(401).json({ error: 'Sesión inválida' });
      return;
    }

    const { data: signed, error: signErr } = await supa.storage.from(BUCKET).createSignedUrl(path, 300);
    if (signErr || !signed?.signedUrl) {
      res.status(404).json({ error: 'No se pudo acceder al archivo' });
      return;
    }

    const pdfResp = await fetch(signed.signedUrl);
    if (!pdfResp.ok) {
      res.status(502).json({ error: 'No se pudo descargar el archivo' });
      return;
    }
    const contentLength = parseInt(pdfResp.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_PDF_BYTES) {
      res.status(413).json({ error: 'El archivo supera el límite de 10 MB' });
      return;
    }
    const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());
    if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
      res.status(413).json({ error: 'El archivo supera el límite de 10 MB' });
      return;
    }
    const base64Pdf = pdfBuffer.toString('base64');

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // El servicio de IA devuelve 529 (overloaded) o 429 (rate limit) de vez
    // en cuando — son transitorios, no un error real del documento. Un
    // reintento con una pequeña espera resuelve la mayoría sin que el
    // usuario tenga que volver a apretar el botón.
    const esTransitorio = e => e?.status === 529 || e?.status === 429;
    let message;
    for (let intento = 0; ; intento++) {
      try {
        message = await anthropic.messages.create({
          model: 'claude-opus-4-8',
          max_tokens: 1024,
          output_config: { format: { type: 'json_schema', schema: SCHEMAS[tipo] } },
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
              { type: 'text', text: PROMPTS[tipo] },
            ],
          }],
        });
        break;
      } catch (e) {
        if (esTransitorio(e) && intento === 0) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        throw e;
      }
    }

    if (message.stop_reason === 'refusal') {
      res.status(422).json({ error: 'El análisis fue rechazado por los filtros de seguridad del modelo' });
      return;
    }

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'El modelo no devolvió un resultado' });
      return;
    }

    const resultado = JSON.parse(textBlock.text);
    res.status(200).json(resultado);
  } catch (e) {
    console.error('analizar-documento error:', e);
    const mensaje = (e?.status === 529 || e?.status === 429)
      ? 'El servicio de IA está saturado en este momento. Esperá unos segundos y volvé a intentar.'
      : (e.message || 'Error interno al analizar el documento');
    res.status(e?.status === 529 || e?.status === 429 ? 503 : 500).json({ error: mensaje });
  }
}
