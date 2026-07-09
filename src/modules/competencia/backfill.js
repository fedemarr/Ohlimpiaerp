// Competencia Anual v2 — backfill del año en curso (decisión del
// usuario: migrar 2026 al ledger nuevo para que el ranking no arranque
// en cero a mitad de año). Idempotente por completo — se apoya en la
// misma idempotencia de registrarEvento() (chequeo en memoria +
// índice único en Supabase por regla+referenciaExterna), correr el
// botón dos veces no duplica nada.

import { DB, currentUser } from '@shared/state.js';
import { toast } from '@shared/ui.js';
import { registrarEvento, esAdministrativo, getReglaByCodigo, getVersionVigente } from './movimientos.js';
import { esRRHHoAdmin } from './permisos.js';

const ANIO_BACKFILL = '2026';

export async function backfill2026() {
  if (!esRRHHoAdmin()) { toast('⚠️ Solo RRHH o Administrador puede correr el backfill'); return; }
  if (!confirm(`¿Migrar al ledger nuevo las capacitaciones aprobadas y evaluaciones respondidas de ${ANIO_BACKFILL}? Puede tardar unos segundos. Es seguro correrlo más de una vez — no duplica nada.`)) return;

  let generados = 0, yaExistian = 0;
  const generadoPor = (currentUser?.nombre || 'Sistema') + ' (backfill)';

  const caps = (DB.capacitaciones || []).filter(c => !c.anulado && c.resultado === 'Aprobado' && (c.fecha || '').startsWith(ANIO_BACKFILL));
  for (const c of caps) {
    const legajo = (DB.legajos || []).find(l => String(l.nro) === String(c.nroSocio));
    if (!legajo || esAdministrativo(legajo)) continue;
    const codigoRegla = c.lugar === 'Oficina Central' ? 'capacitacion_presencial'
      : c.lugar === 'Servicio' ? 'capacitacion_servicio'
      : (c.lugar === 'Virtual' || c.lugar === 'Externo') ? 'capacitacion_virtual' : null;
    if (!codigoRegla) continue;
    const resultado = await registrarEvento({
      reglaCodigo: codigoRegla, fecha: c.fecha, protagonista: legajo,
      referenciaExterna: 'cap:' + String(c.id), origenModulo: 'Capacitaciones',
      observaciones: 'Backfill ' + ANIO_BACKFILL + ' — capacitación aprobada: ' + (c.tipo || ''), generadoPor,
    });
    if (resultado) generados++; else yaExistian++;
  }

  const evals = (DB.evaluacionesEnviadas || []).filter(e => !e.anulado && e.estado === 'Respondida' && (e.fechaEnvio || '').startsWith(ANIO_BACKFILL));
  for (const e of evals) {
    const legajo = (DB.legajos || []).find(l => String(l.nro) === String(e.nroSocio));
    if (!legajo || esAdministrativo(legajo)) continue;
    const fecha = e.fechaRespuesta || e.fechaEnvio;

    const r1 = await registrarEvento({
      reglaCodigo: 'responder_evaluacion', fecha, protagonista: legajo,
      referenciaExterna: 'eval:' + String(e.id), origenModulo: 'Capacitaciones',
      observaciones: 'Backfill ' + ANIO_BACKFILL + ' — evaluación respondida', generadoPor,
    });
    if (r1) generados++; else yaExistian++;

    const aciertos = (DB.respuestasEvaluacion || []).filter(r =>
      !r.anulado && r.correcta &&
      (String(r.evaluacionIdLocal) === String(e.id) || String(r.evaluacionIdLocal) === String(e.id).slice(-9))
    ).length;
    if (aciertos > 0) {
      const regla = getReglaByCodigo('respuesta_correcta');
      const version = regla ? getVersionVigente(regla.id, (fecha || '').slice(0, 10)) : null;
      if (version) {
        const r2 = await registrarEvento({
          reglaCodigo: 'respuesta_correcta', fecha, protagonista: legajo,
          referenciaExterna: 'eval:' + String(e.id) + ':aciertos', origenModulo: 'Capacitaciones',
          observaciones: 'Backfill ' + ANIO_BACKFILL + ` — ${aciertos} respuesta(s) correcta(s)`, generadoPor,
          puntosOverrideIndividual: aciertos * version.puntosIndividual,
        });
        if (r2) generados++; else yaExistian++;
      }
    }
  }

  toast(`✅ Backfill ${ANIO_BACKFILL} terminado — ${generados} evento(s) nuevo(s), ${yaExistian} ya existían`);
  return { generados, yaExistian };
}
