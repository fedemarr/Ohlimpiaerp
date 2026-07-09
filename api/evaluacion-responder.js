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

    // Competencia Anual: puntos por responder la evaluación + por cada
    // respuesta correcta (src/modules/competencia/movimientos.js). Esta
    // función serverless es autocontenida (sin acceso a DB.legajos ni al
    // bundle del frontend, mismo criterio que el resto de api/*.js) —
    // se duplica acá minimalista la resolución de versión vigente.
    // Ninguna de las 2 reglas tiene cascada en el seed (compañero/
    // supervisor en 0), así que alcanza con el movimiento del operario.
    // Los puntos son un efecto secundario: si algo falla acá, no debe
    // romper la corrección de la evaluación en sí (try/catch propio).
    try {
      let offset = 90000;
      const nextIdLocal = () => idLocal(offset++);

      const { data: legajo } = await supa
        .from('legajos').select('nro, nombre, servicio, supervisor, estado')
        .eq('nro', Number(ev.nro_socio)).maybeSingle();

      if (legajo && legajo.estado === 'Activo' && (legajo.servicio || '').trim().toUpperCase() !== 'ADMINISTRATIVO') {
        const fechaEvento = ahora;
        const fechaISO = fechaEvento.slice(0, 10);

        const resolverReglaYVersion = async (codigo) => {
          const { data: regla } = await supa.from('reglas_competencia').select('id_local, activa').eq('codigo', codigo).eq('anulado', false).maybeSingle();
          if (!regla || !regla.activa) return null;
          const { data: versiones } = await supa.from('reglas_competencia_versiones')
            .select('id_local, puntos_individual, vigencia_desde, vigencia_hasta')
            .eq('regla_id_local', regla.id_local).eq('anulado', false)
            .lte('vigencia_desde', fechaISO)
            .order('vigencia_desde', { ascending: false });
          const version = (versiones || []).find(v => !v.vigencia_hasta || v.vigencia_hasta >= fechaISO);
          return version ? { regla, version } : null;
        };

        const generarMovimientoOperario = async ({ regla, version, puntos, referenciaExterna }) => {
          const { data: eventoExistente } = await supa.from('eventos_puntos')
            .select('id').eq('regla_id_local', regla.id_local).eq('referencia_externa', referenciaExterna).eq('anulado', false).maybeSingle();
          if (eventoExistente) return;
          const eventoIdLocal = nextIdLocal();
          await supa.from('eventos_puntos').insert({
            id_local: eventoIdLocal, regla_id_local: regla.id_local, regla_version_id_local: version.id_local,
            operario_id_local: String(legajo.nro), nombre_operario: legajo.nombre,
            servicio_al_momento: legajo.servicio || '', supervisor_al_momento: legajo.supervisor || '',
            fecha_evento: fechaEvento, origen: 'Automático', modulo_origen: 'Capacitaciones',
            referencia_externa: referenciaExterna, cargado_por: 'Sistema (evaluacion-responder)',
          });
          await supa.from('movimientos_puntos').insert({
            id_local: nextIdLocal(),
            evento_id_local: eventoIdLocal, regla_id_local: regla.id_local, regla_version_id_local: version.id_local,
            destinatario_id_local: String(legajo.nro), nombre_destinatario: legajo.nombre, tipo_destinatario: 'Operario',
            servicio_al_momento: legajo.servicio || '', supervisor_al_momento: legajo.supervisor || '',
            puntos_congelados: puntos, fecha_evento: fechaEvento, anio_competencia: new Date(fechaEvento).getFullYear(),
          });
        };

        const resp = await resolverReglaYVersion('responder_evaluacion');
        if (resp) {
          await generarMovimientoOperario({ ...resp, puntos: resp.version.puntos_individual, referenciaExterna: 'eval:' + ev.id_local });
        }

        if (aciertos > 0) {
          const ok = await resolverReglaYVersion('respuesta_correcta');
          if (ok) {
            // Un solo movimiento agregado (aciertos × puntos), no uno
            // por pregunta — evita decenas de filas por evaluación.
            await generarMovimientoOperario({ ...ok, puntos: aciertos * ok.version.puntos_individual, referenciaExterna: 'eval:' + ev.id_local + ':aciertos' });
          }
        }
      }
    } catch (eComp) {
      console.error('evaluacion-responder - hook Competencia Anual:', eComp);
    }

    res.status(200).json({ resultado, puntaje });
  } catch (e) {
    console.error('evaluacion-responder error:', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
}
