// Función serverless de Vercel — recibe las respuestas de la página
// pública evaluacion.html, corrige contra preguntas_evaluacion, calcula
// el puntaje y actualiza evaluaciones_enviadas + la capacitación
// vinculada. Mismo patrón que api/postular.js: toda la validación vive
// acá server-side (token, vigencia, corrección) — nada librado al JS del
// navegador, que nunca ve la respuesta correcta.

const SUPABASE_URL = 'https://caeqsieiuunqvicfpudu.supabase.co';
const LETRAS_VALIDAS = ['A', 'B', 'C', 'D'];

function idLocal(offset = 0) {
  return String(Date.now() + offset).slice(-9);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const body = req.body || {};
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const respuestas = Array.isArray(body.respuestas) ? body.respuestas : [];
  if (!token || !respuestas.length) {
    res.status(400).json({ error: 'Faltan datos' });
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
      res.status(404).json({ error: 'Link inválido.' });
      return;
    }
    if (ev.estado === 'Respondida') {
      res.status(409).json({ error: 'Esta evaluación ya fue respondida.' });
      return;
    }
    if (ev.estado === 'Vencida' || new Date(ev.fecha_limite) < new Date()) {
      if (ev.estado !== 'Vencida') await supa.from('evaluaciones_enviadas').update({ estado: 'Vencida' }).eq('id', ev.id);
      res.status(409).json({ error: 'Esta evaluación ya venció.' });
      return;
    }

    const { data: plantilla, error: errPl } = await supa
      .from('plantillas_evaluacion').select('*').eq('tipo_capacitacion', ev.tipo_capacitacion).maybeSingle();
    if (errPl || !plantilla || !(plantilla.preguntas_ids || []).length) {
      res.status(404).json({ error: 'La evaluación no tiene preguntas configuradas.' });
      return;
    }

    const { data: preguntas, error: errPreg } = await supa
      .from('preguntas_evaluacion').select('id_local, correcta').in('id_local', plantilla.preguntas_ids);
    if (errPreg || !preguntas || !preguntas.length) {
      res.status(404).json({ error: 'No se encontraron las preguntas de la evaluación.' });
      return;
    }

    const correctaPorId = {};
    preguntas.forEach(p => { correctaPorId[p.id_local] = p.correcta; });

    let aciertos = 0;
    const filasRespuestas = [];
    respuestas.forEach((r, i) => {
      const letra = typeof r.respuesta === 'string' ? r.respuesta.toUpperCase() : '';
      if (!LETRAS_VALIDAS.includes(letra)) return;
      const correctaEsperada = correctaPorId[r.preguntaIdLocal];
      if (!correctaEsperada) return; // pregunta no pertenece a esta evaluación, se ignora
      const esCorrecta = letra === correctaEsperada;
      if (esCorrecta) aciertos++;
      filasRespuestas.push({
        id_local: idLocal(i),
        evaluacion_id_local: ev.id_local,
        pregunta_id_local: r.preguntaIdLocal,
        respuesta: letra,
        correcta: esCorrecta,
      });
    });

    if (!filasRespuestas.length) {
      res.status(400).json({ error: 'No se pudo corregir ninguna respuesta.' });
      return;
    }

    const puntaje = Math.round(aciertos / preguntas.length * 100);
    const resultado = puntaje >= (plantilla.nota_minima || 70) ? 'Aprobada' : 'Desaprobada';
    const ahora = new Date().toISOString();

    const { error: errInsert } = await supa.from('respuestas_evaluacion').insert(filasRespuestas);
    if (errInsert) {
      console.error('evaluacion-responder - insert respuestas:', errInsert);
      res.status(500).json({ error: 'No se pudo guardar la respuesta.' });
      return;
    }

    await supa.from('evaluaciones_enviadas').update({
      estado: 'Respondida', puntaje, resultado, fecha_respuesta: ahora,
    }).eq('id', ev.id);

    await supa.from('capacitaciones').update({
      resultado: resultado === 'Aprobada' ? 'Aprobado' : 'Desaprobado',
      puntaje,
    }).eq('id_local', ev.capacitacion_id_local);

    res.status(200).json({ resultado, puntaje });
  } catch (e) {
    console.error('evaluacion-responder error:', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
}
