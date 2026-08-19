// Función serverless de Vercel — permite al candidato agendar su propia
// entrevista desde el link público (/agendar-entrevista).
//
// Dos acciones:
//   - disponibilidad: retorna franjas horarias libres para los próximos días
//   - reservar: crea/actualiza candidato + turno con estado 'Pendiente'
//
// Usa la service_role key (RLS "solo autenticados").

const SUPABASE_URL = 'https://caeqsieiuunqvicfpudu.supabase.co';
const MAX_POR_TURNO = 2;

const CONFIG_DEFAULT = {
  diasHabilitados: [1, 2, 3, 4, 5],
  horaDesde: '09:00',
  horaHasta: '17:00',
  duracion: 20,
  maxPorTurno: 2,
};

function generarFranjas(config) {
  const franjas = [];
  const [hD, mD] = config.horaDesde.split(':').map(Number);
  const [hH, mH] = config.horaHasta.split(':').map(Number);
  let cur = hD * 60 + mD;
  const fin = hH * 60 + mH;
  while (cur < fin) {
    const h = Math.floor(cur / 60).toString().padStart(2, '0');
    const m = (cur % 60).toString().padStart(2, '0');
    franjas.push(h + ':' + m);
    cur += config.duracion;
  }
  return franjas;
}

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
  const action = body.action;

  if (action === 'disponibilidad') {
    return handleDisponibilidad(req, res, body);
  }
  if (action === 'reservar') {
    return handleReservar(req, res, body);
  }
  res.status(400).json({ error: 'Acción no válida' });
}

async function handleDisponibilidad(req, res, body) {
  const dias = Math.min(parseInt(body.dias) || 14, 30);

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const hasta = new Date(hoy);
    hasta.setDate(hoy.getDate() + dias);

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

    const config = CONFIG_DEFAULT;
    const franjas = generarFranjas(config);
    const ocupacion = {};
    (turnos || []).forEach(t => {
      const key = t.fecha + '|' + t.hora;
      ocupacion[key] = (ocupacion[key] || 0) + 1;
    });

    const ocupados = {};
    Object.keys(ocupacion).forEach(k => { ocupados[k] = ocupacion[k]; });

    res.status(200).json({
      config: {
        diasHabilitados: config.diasHabilitados,
        horaDesde: config.horaDesde,
        horaHasta: config.horaHasta,
        duracionMin: config.duracion,
        maxPorFranja: config.maxPorTurno,
      },
      franjas,
      ocupados,
      desde: hoy.toISOString().split('T')[0],
      hasta: hasta.toISOString().split('T')[0],
    });
  } catch (e) {
    console.error('agendar-turno disponibilidad error:', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
}

async function handleReservar(req, res, body) {
  const nombre = limpiar(body.nombre);
  const apellido = limpiar(body.apellido);
  const dni = limpiar(body.dni);
  const fecha = limpiar(body.fecha);
  const hora = limpiar(body.hora);

  if (!nombre || !apellido || !dni || !fecha || !hora) {
    res.status(400).json({ error: 'Faltan datos obligatorios (nombre, apellido, dni, fecha, hora)' });
    return;
  }
  if (!/^\d{6,8}$/.test(dni)) {
    res.status(400).json({ error: 'El DNI debe tener entre 6 y 8 dígitos numéricos' });
    return;
  }

  const telefono = limpiar(body.telefono) || null;
  const email = limpiar(body.email) || null;
  const observaciones = limpiar(body.observaciones) || null;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supa = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verificar cupo
    const { data: ocupados, error: errOcup } = await supa
      .from('turnos')
      .select('id')
      .eq('fecha', fecha)
      .eq('hora', hora)
      .neq('estado', 'Cancelado');
    if (errOcup) {
      res.status(500).json({ error: 'No se pudo verificar el horario' });
      return;
    }
    if ((ocupados || []).length >= MAX_POR_TURNO) {
      res.status(409).json({ error: 'Ese horario ya se ocupó, elegí otro' });
      return;
    }

    // Buscar candidato existente por DNI
    const { data: existente } = await supa
      .from('candidatos')
      .select('id_local')
      .eq('dni', dni)
      .maybeSingle();

    const nombreCompleto = apellido + ' ' + nombre;

    if (existente) {
      // Actualizar candidato existente
      const { error: errUpd } = await supa
        .from('candidatos')
        .update({
          fecha_cita: fecha,
          hora_cita: hora,
          estado: 'Citado',
          ...(telefono ? { telefono } : {}),
          ...(email ? { email } : {}),
          ...(observaciones ? { obs: observaciones } : {}),
        })
        .eq('id_local', existente.id_local);
      if (errUpd) {
        console.error('agendar-turno - error actualizando candidato:', errUpd);
        res.status(500).json({ error: 'No se pudo actualizar el candidato' });
        return;
      }
    } else {
      // Crear nuevo candidato
      const nuevoCandidato = {
        id_local: idLocal(),
        apellido,
        nombre,
        dni,
        tel: telefono || '',
        email,
        zona: '',
        medio: 'Agendamiento online',
        estado: 'Citado',
        fecha_cita: fecha,
        hora_cita: hora,
        creado_por: 'Agendamiento público',
      };
      const { error: errIns } = await supa.from('candidatos').insert(nuevoCandidato);
      if (errIns) {
        if (errIns.code === '23505') {
          res.status(409).json({ error: 'Ya existe una postulación con ese DNI' });
          return;
        }
        console.error('agendar-turno - error creando candidato:', errIns);
        res.status(500).json({ error: 'No se pudo crear el candidato' });
        return;
      }
    }

    // Crear turno
    const nuevoTurno = {
      id_local: idLocal(1),
      nombre: nombreCompleto,
      fecha,
      hora,
      estado: 'Pendiente',
      responsable: '',
      ...(observaciones ? { observacion: observaciones } : {}),
    };
    const { error: errTurno } = await supa.from('turnos').insert(nuevoTurno);
    if (errTurno) console.error('agendar-turno - error creando turno:', errTurno);

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('agendar-turno reservar error:', e);
    res.status(500).json({ error: e.message || 'Error interno' });
  }
}
