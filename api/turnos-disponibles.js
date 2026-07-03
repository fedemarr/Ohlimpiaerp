// Función serverless de Vercel — calcula los turnos de entrevista libres
// para las próximas semanas, para el formulario público de postulación.
//
// Usa la service_role key (nunca expuesta al navegador) porque `turnos`
// tiene RLS "solo autenticados" (sql/v015). Esta función es la única puerta
// de lectura para gente sin sesión.

const SUPABASE_URL = 'https://caeqsieiuunqvicfpudu.supabase.co';

// Misma configuración por defecto que usa hoy calendario.js (configAgente).
// Esa config es efímera (no persiste entre reloads ni para RRHH), así que
// hardcodearla acá no es una regresión frente al comportamiento actual.
const CONFIG_AGENDA = {
  diasHabilitados: [1, 2, 3, 4, 5],
  horaDesde: '09:00',
  horaHasta: '17:00',
  duracion: 20,
  maxPorTurno: 2,
};
const SEMANAS_A_MOSTRAR = 3;

function generarFranjas() {
  const franjas = [];
  const [hD, mD] = CONFIG_AGENDA.horaDesde.split(':').map(Number);
  const [hH, mH] = CONFIG_AGENDA.horaHasta.split(':').map(Number);
  let cur = hD * 60 + mD;
  const fin = hH * 60 + mH;
  while (cur < fin) {
    const h = Math.floor(cur / 60).toString().padStart(2, '0');
    const m = (cur % 60).toString().padStart(2, '0');
    franjas.push(h + ':' + m);
    cur += CONFIG_AGENDA.duracion;
  }
  return franjas;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const hasta = new Date(hoy);
    hasta.setDate(hoy.getDate() + SEMANAS_A_MOSTRAR * 7);

    const { data: turnos, error } = await supa
      .from('turnos')
      .select('fecha, hora, estado')
      .gte('fecha', hoy.toISOString().split('T')[0])
      .lte('fecha', hasta.toISOString().split('T')[0])
      .neq('estado', 'Cancelado');

    if (error) {
      res.status(500).json({ error: 'No se pudo leer la agenda' });
      return;
    }

    const franjas = generarFranjas();
    const ocupacion = {}; // 'fecha|hora' -> cantidad
    (turnos || []).forEach(t => {
      const key = t.fecha + '|' + t.hora;
      ocupacion[key] = (ocupacion[key] || 0) + 1;
    });

    const disponibles = [];
    for (let i = 0; i < SEMANAS_A_MOSTRAR * 7; i++) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() + i);
      if (!CONFIG_AGENDA.diasHabilitados.includes(d.getDay())) continue;
      const fechaStr = d.toISOString().split('T')[0];
      franjas.forEach(hora => {
        const key = fechaStr + '|' + hora;
        const ocupados = ocupacion[key] || 0;
        if (ocupados < CONFIG_AGENDA.maxPorTurno) {
          disponibles.push({ fecha: fechaStr, hora });
        }
      });
    }

    res.status(200).json({ slots: disponibles });
  } catch (e) {
    console.error('turnos-disponibles error:', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
}
