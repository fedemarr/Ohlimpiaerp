// Función serverless de Vercel — trae la evaluación (estado + preguntas,
// sin la respuesta correcta) para la página pública evaluacion.html, a
// partir de un token. Mismo patrón que api/turnos-disponibles.js: usa la
// service_role key porque las tablas tienen RLS "solo autenticados", y es
// la única puerta de lectura para gente sin sesión.

const SUPABASE_URL = 'https://caeqsieiuunqvicfpudu.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!token) {
    res.status(400).json({ error: 'Falta el token' });
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: ev, error: errEv } = await supa
      .from('evaluaciones_enviadas').select('*').eq('token', token).maybeSingle();
    if (errEv || !ev || ev.anulado) {
      res.status(404).json({ error: 'Link inválido. Verificá con RRHH.' });
      return;
    }

    if (ev.estado === 'Respondida') {
      res.status(200).json({ estado: 'Respondida', resultado: ev.resultado, puntaje: ev.puntaje });
      return;
    }

    const vencida = ev.estado === 'Vencida' || new Date(ev.fecha_limite) < new Date();
    if (vencida) {
      if (ev.estado !== 'Vencida') {
        await supa.from('evaluaciones_enviadas').update({ estado: 'Vencida' }).eq('id', ev.id);
      }
      res.status(200).json({ estado: 'Vencida', fechaLimite: ev.fecha_limite });
      return;
    }

    const { data: plantilla, error: errPl } = await supa
      .from('plantillas_evaluacion').select('*').eq('tipo_capacitacion', ev.tipo_capacitacion).maybeSingle();
    if (errPl || !plantilla || !(plantilla.preguntas_ids || []).length) {
      res.status(404).json({ error: 'La evaluación no tiene preguntas configuradas. Contactá a RRHH.' });
      return;
    }

    const { data: preguntas, error: errPreg } = await supa
      .from('preguntas_evaluacion')
      .select('id_local, enunciado, opcion_a, opcion_b, opcion_c, opcion_d')
      .in('id_local', plantilla.preguntas_ids);
    if (errPreg || !preguntas || !preguntas.length) {
      res.status(404).json({ error: 'La evaluación no tiene preguntas configuradas. Contactá a RRHH.' });
      return;
    }

    res.status(200).json({
      estado: 'Enviada',
      tipo: ev.tipo_capacitacion,
      preguntas: preguntas.map(p => ({
        idLocal: p.id_local,
        enunciado: p.enunciado,
        opciones: { A: p.opcion_a, B: p.opcion_b, C: p.opcion_c, D: p.opcion_d },
      })),
    });
  } catch (e) {
    console.error('evaluacion-preguntas error:', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
}
