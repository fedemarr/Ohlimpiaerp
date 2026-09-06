// Función serverless de Vercel — analiza un certificado (antecedentes, apto
// médico o informe psicotécnico) con la API de Claude y devuelve campos
// estructurados. El adjunto puede ser un PDF o una foto (JPG/PNG) — los 3
// formularios que llaman acá aceptan los tres formatos (ver accept= en
// documentacion.js/preocupacional.js/psicotecnico.js), así que el tipo de
// contenido que se manda a Claude se arma según el content-type real del
// archivo en Storage, no asumiendo siempre PDF.
//
// La API key de Anthropic vive solo acá (variable de entorno de Vercel),
// nunca en el bundle del cliente. Ver CLAUDE.md / sql/README para el resto
// del proyecto — esta es la primera pieza de "backend propio".

// Multi-empresa (05/09/2026, ticket "supabaseKey is required en Clean Paz"): esta URL
// estaba hardcodeada a Ohlimpia en las 10 funciones serverless de api/ —
// cualquier deploy de otra empresa (mismo código, otro proyecto Vercel)
// terminaba escribiendo en la base de OHLIMPIA en vez de la propia. El
// frontend ya resuelve esto con VITE_SUPABASE_URL (ver src/shared/supabase.js);
// Vercel expone las env vars VITE_* también server-side, así que alcanza con
// leerla acá — el fallback deja el deploy de Ohlimpia sin cambios.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://caeqsieiuunqvicfpudu.supabase.co';
// Multi-empresa (05/09/2026, mismo ticket que la URL de arriba): esta clave
// también estaba hardcodeada a Ohlimpia — auth.getUser(token) validaba el
// token de sesión de CUALQUIER empresa contra el proyecto de Ohlimpia, y
// fallaba con "Sesión inválida" para cualquier otra empresa (el JWT lo firma
// cada proyecto de Supabase con su propio secreto).
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable__SBdO6cSQXYfgR16FrztwA_Cf9sNosd';
const BUCKET = 'ohlimpia-adjuntos';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // mismo límite que adjuntos.js al subir
// Mismos MIME permitidos que TIPOS_PERMITIDOS en src/shared/adjuntos.js.
const MEDIA_TYPES_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];

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
  antecedente: 'Este archivo (PDF o foto) es un certificado de antecedentes penales de Argentina. Leelo y determiná si la persona tiene o no antecedentes registrados, la fecha de emisión del certificado, y cualquier detalle relevante (organismo emisor, jurisdicción). También extraé el nombre completo y el DNI de la persona tal como figuran en el documento. Si el documento no es legible o no es un certificado de antecedentes, usá resultado "No se pudo determinar" y explicá por qué en "detalles".',
  'apto-medico': 'Este archivo (PDF o foto) es un certificado de aptitud médica laboral (preocupacional) de Argentina. Leelo y determiná el resultado del examen, la fecha, y cualquier restricción u observación médica relevante. También extraé el nombre completo y el DNI de la persona tal como figuran en el documento. Si el documento no es legible o no es un apto médico, usá resultado "No se pudo determinar" y explicá por qué en "detalles".',
  'informe-psico': 'Este archivo (PDF o foto) es un informe psicotécnico laboral de Argentina. Leelo y determiná el resultado de la evaluación, cualquier observación relevante, y el nombre completo y DNI de la persona evaluada tal como figuran en el documento. Si el documento no es legible o no es un informe psicotécnico, usá resultado "No se pudo determinar" y explicá por qué en "detalles".',
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

    const fileResp = await fetch(signed.signedUrl);
    if (!fileResp.ok) {
      res.status(502).json({ error: 'No se pudo descargar el archivo' });
      return;
    }
    const contentLength = parseInt(fileResp.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_FILE_BYTES) {
      res.status(413).json({ error: 'El archivo supera el límite de 10 MB' });
      return;
    }
    // El content-type real (pdf/jpeg/png) queda guardado en Storage desde la
    // subida (ver contentType: file.type en adjuntos.js) — se usa ESE para
    // decidir cómo mandarlo a Claude, no se asume PDF a ciegas.
    const mediaType = (fileResp.headers.get('content-type') || '').split(';')[0].trim();
    if (!MEDIA_TYPES_PERMITIDOS.includes(mediaType)) {
      res.status(415).json({ error: 'El archivo adjunto no es un PDF, JPG o PNG válido' });
      return;
    }
    const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
    if (fileBuffer.byteLength > MAX_FILE_BYTES) {
      res.status(413).json({ error: 'El archivo supera el límite de 10 MB' });
      return;
    }
    const base64Data = fileBuffer.toString('base64');

    // Multi-proveedor (06/09/2026, ticket "Gemini para Clean Paz"): Ohlimpia
    // usa Claude (Anthropic); Clean Paz no tenía una clave de Anthropic
    // utilizable y usa Gemini en su lugar. El proveedor se elige solo según
    // qué clave está configurada en el proyecto de Vercel — no hace falta
    // una variable aparte, y una empresa nueva puede usar cualquiera de las
    // dos sin tocar código. Si el día de mañana una empresa necesita las
    // DOS a la vez, ahí sí hace falta una variable explícita de preferencia.
    let resultado;
    if (process.env.ANTHROPIC_API_KEY) {
      resultado = await analizarConClaude(mediaType, base64Data, tipo);
    } else if (process.env.GEMINI_API_KEY) {
      resultado = await analizarConGemini(mediaType, base64Data, tipo);
    } else {
      res.status(500).json({ error: 'No hay ningún proveedor de IA configurado (falta ANTHROPIC_API_KEY o GEMINI_API_KEY en Vercel)' });
      return;
    }

    if (resultado.rechazado) {
      res.status(422).json({ error: 'El análisis fue rechazado por los filtros de seguridad del modelo' });
      return;
    }
    if (resultado.sinTexto) {
      res.status(502).json({ error: 'El modelo no devolvió un resultado' });
      return;
    }
    res.status(200).json(resultado.datos);
  } catch (e) {
    console.error('analizar-documento error:', e);
    const mensaje = e?.transitorio
      ? 'El servicio de IA está saturado en este momento. Esperá unos segundos y volvé a intentar.'
      : (e.message || 'Error interno al analizar el documento');
    res.status(e?.transitorio ? 503 : 500).json({ error: mensaje });
  }
}

// ── Claude (Anthropic) — proveedor de Ohlimpia ──
async function analizarConClaude(mediaType, base64Data, tipo) {
  const contentBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } };

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
            contentBlock,
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
      if (esTransitorio(e)) e.transitorio = true;
      throw e;
    }
  }

  if (message.stop_reason === 'refusal') return { rechazado: true };
  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock) return { sinTexto: true };
  return { datos: JSON.parse(textBlock.text) };
}

// Convierte el JSON Schema (minúsculas, estilo Anthropic) a la variante que
// espera Gemini (type en MAYÚSCULAS, sin additionalProperties — Gemini no
// lo soporta y lo ignora si viene, pero mejor no mandarlo).
function _schemaParaGemini(schema) {
  if (Array.isArray(schema)) return schema.map(_schemaParaGemini);
  if (schema && typeof schema === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === 'additionalProperties') continue;
      out[k] = k === 'type' && typeof v === 'string' ? v.toUpperCase() : _schemaParaGemini(v);
    }
    return out;
  }
  return schema;
}

// ── Gemini (Google) — proveedor de Clean Paz ──
// Lista de modelos, no uno solo (06/09/2026): en pruebas en vivo contra la
// API real, el 503 "high demand" resultó ser por MODELO, no un apagón
// general — en la misma tanda, mientras gemini-3.5-flash/3.6-flash/
// 3.1-flash-lite/flash-latest daban 503, gemini-3.7-flash y 3.8-flash
// respondían bien; media hora después 3.8-flash SOLO también dio 503 un
// par de veces seguidas con el mismo schema que acababa de andar para
// "apto-medico". Reintentar el mismo modelo 3 veces no alcanza si esa
// franja está saturada — se prueba el siguiente de la lista antes de
// rendirse. Si esto sigue dando problemas, listar modelos vigentes con
// GET /v1beta/models (los nombres de Gemini rotan seguido).
const GEMINI_MODELOS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite'];

async function _llamarGemini(modelo, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  return { ok: resp.ok, status: resp.status, data };
}

async function analizarConGemini(mediaType, base64Data, tipo) {
  const schemaGemini = _schemaParaGemini(SCHEMAS[tipo]);
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: mediaType, data: base64Data } },
        { text: PROMPTS[tipo] },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schemaGemini,
      maxOutputTokens: 2048,
    },
  };

  let data, ultimoErrorTransitorio = false;
  busquedaModelo:
  for (const modelo of GEMINI_MODELOS) {
    for (let intento = 0; intento < 2; intento++) {
      const r = await _llamarGemini(modelo, body);
      if (r.ok) { data = r.data; break busquedaModelo; }
      const esTransitorio = r.status === 503 || r.status === 429;
      ultimoErrorTransitorio = esTransitorio;
      if (esTransitorio) {
        if (intento === 0) { await new Promise(res => setTimeout(res, 1200)); continue; }
        break; // este modelo no respondió — probar el siguiente de la lista
      }
      // Error NO transitorio (400, schema inválido, etc.) — no tiene sentido
      // probar otro modelo, el problema es del pedido, no del modelo.
      const err = new Error(r.data?.error?.message || 'Error del servicio de IA');
      throw err;
    }
  }
  if (!data) {
    const err = new Error('Todos los modelos de IA están saturados en este momento');
    err.transitorio = ultimoErrorTransitorio;
    throw err;
  }

  const candidato = data.candidates?.[0];
  if (candidato?.finishReason === 'SAFETY' || candidato?.finishReason === 'PROHIBITED_CONTENT') return { rechazado: true };
  const textPart = candidato?.content?.parts?.find(p => typeof p.text === 'string');
  if (!textPart) return { sinTexto: true };
  return { datos: JSON.parse(textPart.text) };
}
