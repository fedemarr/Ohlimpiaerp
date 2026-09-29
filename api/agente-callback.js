// AGENTE_TICKETS_OHLIMPIA.md — callback del agente (real o, en teoría,
// cualquier llamador que tenga el token). Lo llama el workflow de GitHub
// Actions cuando termina, NO un usuario logueado de Ohlimpia — por eso acá
// no hay sesión de Supabase Auth que validar. La autorización es el
// `callback_token` de un solo uso (punto 13: "por corrida, de un solo uso y
// con vencimiento"), y por eso mismo esta función necesita service_role
// (nadie sin sesión puede escribir en corridas_agente vía RLS — ver
// sql/v172 — así que hay que puentear la RLS acá, con el token como el
// único control de acceso real).
//
// La lógica de "qué estado sigue" vive en estados.js (aplicarCallback),
// importado por ruta relativa — ese archivo no tiene ningún import de
// '@shared/...' a propósito, para poder correr tanto en el navegador
// (dispatcher.js, callback simulado) como acá (runtime Node de Vercel).
import { aplicarCallback } from '../src/modules/agente/estados.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://caeqsieiuunqvicfpudu.supabase.co';

function corridaASnakeParaUpdate(c) {
  return {
    estado: c.estado,
    intentos: c.intentos,
    tests_ok: c.testsOk,
    tests_corridos: c.testsCorridos,
    tiene_migracion: c.tieneMigracion,
    sql_migracion: c.sqlMigracion,
    migracion_reversible: c.migracionReversible,
    migracion_filas_afectadas_estimado: c.migracionFilasAfectadasEstimado,
    resumen: c.resumen,
    que_probar: c.queProbar,
    archivos_tocados: c.archivosTocados,
    error: c.error,
    branch: c.branch,
    pr_url: c.prUrl,
    pr_number: c.prNumber,
    finalizada_en: c.finalizadaEn,
    deployado_en: c.deployadoEn,
  };
}

function filaASnakeCamel(row) {
  return {
    id: row.id,
    estado: row.estado,
    intentos: row.intentos,
    branch: row.branch,
    prUrl: row.pr_url,
    prNumber: row.pr_number,
    resumen: row.resumen,
    queProbar: row.que_probar,
    archivosTocados: row.archivos_tocados,
    finalizadaEn: row.finalizada_en,
    deployadoEn: row.deployado_en,
    callbackTokenUsado: row.callback_token_usado,
    callbackTokenExpiraEn: row.callback_token_expira_en,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { token, ...payload } = req.body || {};
  if (!token) {
    res.status(400).json({ error: 'Falta el token de callback' });
    return;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel' });
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: row, error } = await supa.from('corridas_agente').select('*').eq('callback_token', token).maybeSingle();
    if (error || !row) {
      res.status(404).json({ error: 'Token de callback inválido' });
      return;
    }
    if (row.callback_token_usado) {
      res.status(409).json({ error: 'Este token de callback ya fue usado' });
      return;
    }
    if (row.callback_token_expira_en && new Date(row.callback_token_expira_en) < new Date()) {
      res.status(410).json({ error: 'Este token de callback venció' });
      return;
    }

    const corrida = filaASnakeCamel(row);
    const actualizada = aplicarCallback(corrida, payload);
    const update = {
      ...corridaASnakeParaUpdate(actualizada),
      // Un solo uso (punto 13) — se marca acá, no antes, para no quemar el
      // token si algo de arriba fallara antes de llegar hasta acá.
      callback_token_usado: true,
    };

    const { error: updErr } = await supa.from('corridas_agente').update(update).eq('id', row.id);
    if (updErr) {
      res.status(500).json({ error: `No se pudo actualizar la corrida: ${updErr.message}` });
      return;
    }

    await supa.from('agente_audit_log').insert({
      id_local: ('a' + Date.now() + Math.floor(Math.random() * 900 + 100)).slice(-9),
      corrida_id_local: String(row.id_local),
      tipo: 'callback',
      detalle: `Callback recibido — estado: ${actualizada.estado}.`,
      actor: 'agente (callback)',
    });

    res.status(200).json({ ok: true, estado: actualizada.estado });
  } catch (e) {
    console.error('agente-callback error:', e);
    res.status(500).json({ error: e.message || 'Error interno procesando el callback' });
  }
}
