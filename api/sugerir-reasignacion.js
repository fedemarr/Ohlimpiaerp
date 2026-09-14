// Función serverless de Vercel — sugiere hasta 4 servicios destino para
// reasignar a un asociado, cruzando su legajo con los clientes activos,
// sus capacitaciones, su historial reciente de reasignaciones y los
// pedidos de personal pendientes.
//
// Reemplaza al "sugeridor IA" que existía en legacy.js: ese botón era un
// simulacro (setTimeout, sin lógica real) y se sacó a propósito al migrar
// el módulo Reasignaciones (ver DISENO_reasignaciones.md §3.20) con el
// plan de construir la versión real más adelante — esta es esa versión.
//
// Mismo patrón que api/analizar-documento.js y api/generar-prompt-ticket.js:
// la API key de Anthropic vive solo acá, nunca en el bundle del cliente.
//
// Desvío vs. la spec original (DISENO_reasignaciones.md §10-11): sin
// geocodificación — los legajos no tienen coordenadas, solo `localidad`
// como texto, así que la cercanía se estima comparando zona/localidad
// como texto, no con distancia haversine. Tampoco usa una Edge Function
// de Supabase (Deno) como proponía la spec — sigue el patrón ya
// establecido en este proyecto de funciones serverless de Vercel.

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

const SCHEMA = {
  type: 'object',
  properties: {
    sugerencias: {
      type: 'array',
      description: 'Hasta 4 servicios destino sugeridos, ordenados por score descendente.',
      items: {
        type: 'object',
        properties: {
          servicio: { type: 'string', description: 'Código exacto del servicio (campo "servicio" de la lista de servicios activos), no el nombre.' },
          supervisor: { type: 'string' },
          zona: { type: 'string' },
          score: { type: 'integer', description: '0 a 100.' },
          justificacion: { type: 'string', description: '2-3 líneas explicando por qué es un buen candidato para ese servicio.' },
          alertas: { type: 'array', items: { type: 'string' }, description: 'Alertas relevantes (rotación reciente, conflicto previo con ese cliente, falta de dato de localidad, etc.) — array vacío si no hay ninguna.' },
        },
        required: ['servicio', 'supervisor', 'zona', 'score', 'justificacion', 'alertas'],
        additionalProperties: false,
      },
    },
  },
  required: ['sugerencias'],
  additionalProperties: false,
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

  const { nroSocio } = req.body || {};
  if (!nroSocio) {
    res.status(400).json({ error: 'Falta el número de socio del asociado' });
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

    const { data: legajo, error: legajoErr } = await supa.from('legajos').select('*').eq('nro', nroSocio).maybeSingle();
    if (legajoErr || !legajo) {
      res.status(404).json({ error: 'No se encontró el legajo del asociado' });
      return;
    }

    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);
    const seisMesesAtrasISO = seisMesesAtras.toISOString().slice(0, 10);

    // FIX (ticket "Reasignaciones — 3 consultas", 11-15/09): esto leía de
    // `clientes` (servicio/supervisor/zona), pero en el modelo real esas
    // columnas están SIEMPRE vacías ahí — el padrón real de servicios es
    // `objetivos` (tab Operativos), donde el código de servicio vive en
    // `codigo` y el supervisor en `supervisor_asignado`. Por eso el botón
    // devolvía "sin servicios activos" para cualquier asociado, siempre —
    // no era un tema de datos faltantes, apuntaba a la tabla que no es.
    const [objetivosRes, capacitacionesRes, pedidosRes, reasignacionesRes] = await Promise.all([
      supa.from('objetivos').select('codigo, nombre, supervisor_asignado, jurisdiccion, localidad, dir, observaciones, puestos_necesarios').eq('estado', 'Operativo'),
      supa.from('capacitaciones').select('tipo, fecha, estado, resultado').eq('nro_socio', String(nroSocio)).order('fecha', { ascending: false }).limit(20),
      supa.from('pedidos').select('servicio, puesto, urgencia, estado').eq('estado', 'Pendiente'),
      supa.from('reasignaciones').select('servicio_origen, servicio_destino, motivo, fecha_solicitud, estado').eq('nro_socio', String(nroSocio)).gte('fecha_solicitud', seisMesesAtrasISO),
    ]);

    const serviciosActivos = (objetivosRes.data || [])
      .filter(o => o.codigo && o.codigo !== legajo.servicio)
      .map(o => ({
        servicio: o.codigo, nombre: o.nombre, supervisor: o.supervisor_asignado || null,
        zona: [o.localidad, o.jurisdiccion].filter(Boolean).join(' — ') || null,
        direccion: o.dir || null, requisitos: o.observaciones || null, puestos_necesarios: o.puestos_necesarios || null,
      }));
    const capacitaciones = capacitacionesRes.data || [];
    const pedidosPendientes = pedidosRes.data || [];
    const reasignacionesRecientes = reasignacionesRes.data || [];

    if (!serviciosActivos.length) {
      res.status(200).json({ sugerencias: [] });
      return;
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const datosAsociado = {
      nombre: legajo.nombre, nro_socio: legajo.nro, funcion: legajo.funcion,
      servicio_actual: legajo.servicio, supervisor_actual: legajo.supervisor,
      localidad: legajo.localidad || null, ingreso: legajo.ingreso || null, estado: legajo.estado,
    };

    const prompt = `Sos un asistente experto en asignación de personal para una cooperativa de servicios de limpieza (Ohlimpia).

Tu tarea: recomendar hasta 4 servicios destino para reasignar a este asociado, según los datos que te doy.

DATOS DEL ASOCIADO:
${JSON.stringify(datosAsociado, null, 2)}

CAPACITACIONES DEL ASOCIADO (últimas ${capacitaciones.length}):
${JSON.stringify(capacitaciones, null, 2)}

REASIGNACIONES DEL ASOCIADO EN LOS ÚLTIMOS 6 MESES (para detectar rotación excesiva o conflictos previos con algún cliente):
${JSON.stringify(reasignacionesRecientes, null, 2)}

SERVICIOS ACTIVOS DISPONIBLES COMO POSIBLE DESTINO:
${JSON.stringify(serviciosActivos, null, 2)}

PEDIDOS DE PERSONAL PENDIENTES (servicios con necesidad real de gente ahora mismo — priorizalos, pero no te limites solo a estos):
${JSON.stringify(pedidosPendientes, null, 2)}

CRITERIOS A EVALUAR, en orden de prioridad:
1. Que el servicio tenga un pedido de personal pendiente (más urgente = mejor).
2. Cercanía: comparar la localidad del asociado con la zona/dirección del servicio (son datos de texto, no coordenadas — evaluá cercanía aproximada por barrio/partido/zona, no calcules distancia exacta).
3. Que sus capacitaciones sean relevantes para las exigencias del servicio (fijate en el campo "requisitos" del servicio, a veces menciona cosas como altura, habilitaciones especiales, etc.).
4. Que no haya rotado en exceso (3 o más reasignaciones en los últimos 6 meses es una señal de alerta, no descalificante).
5. Que no haya tenido un conflicto previo con ese mismo cliente/servicio (revisá el historial de reasignaciones y sus motivos).
6. Antigüedad en la cooperativa (mayor experiencia es un plus).

Si al asociado le falta el dato de localidad, no calcules cercanía y agregá una alerta aclarándolo — no lo excluyas por eso.

Devolvé hasta 4 servicios, ordenados por score descendente. Cada uno con: servicio (nombre exacto tal como aparece en la lista), supervisor, zona, score (0-100), justificacion (2-3 líneas) y alertas (array de strings, vacío si no hay ninguna).`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
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
    console.error('sugerir-reasignacion error:', e);
    res.status(500).json({ error: e.message || 'Error interno al generar las sugerencias' });
  }
}
