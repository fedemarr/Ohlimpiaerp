// Función serverless de Vercel — a partir de un ticket (perfil DEVELOPER),
// genera un prompt listo para pegar en Claude Code + recomendaciones.
//
// Mismo patrón que api/analizar-documento.js: la API key de Anthropic vive
// solo acá (variable de entorno de Vercel), nunca en el bundle del cliente.
// A diferencia del enfoque original de la spec (fetch directo desde el
// navegador con la key expuesta), esto valida el token de sesión contra
// Supabase Auth y llama a Claude del lado del servidor.

// Multi-empresa (05/09/2026, ticket "supabaseKey is required en Clean Paz"): esta URL
// estaba hardcodeada a Ohlimpia en las 10 funciones serverless de api/ —
// cualquier deploy de otra empresa (mismo código, otro proyecto Vercel)
// terminaba escribiendo en la base de OHLIMPIA en vez de la propia. El
// frontend ya resuelve esto con VITE_SUPABASE_URL (ver src/shared/supabase.js);
// Vercel expone las env vars VITE_* también server-side, así que alcanza con
// leerla acá — el fallback deja el deploy de Ohlimpia sin cambios.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://caeqsieiuunqvicfpudu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__SBdO6cSQXYfgR16FrztwA_Cf9sNosd';

const SCHEMA = {
  type: 'object',
  properties: {
    prompt: { type: 'string', description: 'Prompt en español, listo para pegar en Claude Code, con contexto suficiente para que un agente pueda resolver el ticket sin más preguntas.' },
    recomendaciones: {
      type: 'array',
      description: 'Hasta 3 recomendaciones concretas sobre cómo abordar el ticket.',
      items: {
        type: 'object',
        properties: {
          prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
          titulo: { type: 'string' },
          detalle: { type: 'string' },
        },
        required: ['prioridad', 'titulo', 'detalle'],
        additionalProperties: false,
      },
    },
  },
  required: ['prompt', 'recomendaciones'],
  additionalProperties: false,
};

// Saca surrogates UTF-16 huérfanos (típico al pegar texto con emojis mal
// cortado desde WhatsApp/el celular al título o la descripción del ticket).
// Un surrogate huérfano es "string" válido en JS y pasa JSON.stringify sin
// problema, pero no tiene codificación UTF-8 válida — el body del fetch
// queda mal formado y la API de Anthropic lo rechaza con un 400 genérico
// "Invalid request data" sin decir qué campo falló. Array.from(s) separa el
// string por code point: un par de surrogates válido (ej. un emoji) queda
// junto en un solo elemento con codePointAt >= 0x10000; un surrogate suelto
// queda solo en su elemento con codePointAt en el rango 0xD800-0xDFFF, así
// que filtrarlo por ese rango saca justo los huérfanos y deja los emojis.
function limpiarTexto(s) {
  if (typeof s !== 'string') return s;
  return Array.from(s)
    .filter(ch => {
      const code = ch.codePointAt(0);
      return !(code >= 0xD800 && code <= 0xDFFF);
    })
    .join('');
}

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

  const { titulo, descripcion, tipo, modulo } = req.body || {};
  if (!titulo) {
    res.status(400).json({ error: 'Falta el título del ticket' });
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser(token);
    if (userErr || !userData?.user) {
      res.status(401).json({ error: 'Sesión inválida' });
      return;
    }

    const { data: perfilRow } = await supa.from('usuarios').select('perfil').eq('id', userData.user.id).maybeSingle();
    if (perfilRow?.perfil !== 'DEVELOPER') {
      res.status(403).json({ error: 'Esta acción es exclusiva del perfil Desarrollador' });
      return;
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const contexto = [
      `Título: ${limpiarTexto(titulo)}`,
      descripcion ? `Descripción: ${limpiarTexto(descripcion)}` : '',
      tipo ? `Tipo: ${limpiarTexto(tipo)}` : '',
      modulo ? `Módulo del ERP: ${limpiarTexto(modulo)}` : '',
    ].filter(Boolean).join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: 'Sos un asistente que ayuda a un desarrollador a convertir tickets de soporte de un ERP interno (Ohlimpia, cooperativa de limpieza — Vite + vanilla JS + Supabase) en un prompt listo para pegarle a un agente de codificación (Claude Code). '
            + 'A partir de este ticket, redactá un prompt en español, claro y accionable, que le dé a un agente todo el contexto necesario para investigar y resolver el problema en el repo (sin inventar rutas de archivo si no las sabés — pedile al agente que las busque). '
            + 'También dame hasta 3 recomendaciones concretas sobre cómo abordarlo.\n\n' + contexto,
        }],
      }],
    });

    if (message.stop_reason === 'refusal') {
      res.status(422).json({ error: 'La generación fue rechazada por los filtros de seguridad del modelo' });
      return;
    }
    if (message.stop_reason === 'max_tokens') {
      res.status(502).json({ error: 'La respuesta del modelo fue demasiado larga y se cortó — probá de nuevo' });
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
    console.error('generar-prompt-ticket error:', e);
    res.status(500).json({ error: e.message || 'Error interno al generar el prompt' });
  }
}
