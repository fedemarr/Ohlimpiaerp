// Sanciones v1 — descargo del asociado (obligatorio a partir de nivel
// 2, plazo mínimo 48hs — ver flujo.js:chequearDescargosVencidos para
// el caso de plazo vencido sin presentación).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { subirAdjunto } from '@shared/adjuntos.js';
import { crearNotificacion } from '@shared/notificaciones.js';
import { getSancionById, idLocalTrunc } from './flujo.js';
import { nombreGerenteRRHH } from './permisos.js';

const MEDIOS_DESCARGO = ['Sistema', 'WhatsApp', 'Presencial', 'Email'];

async function registrarEventoSancion(sancion, estadoDesde, estadoHasta, observaciones = '') {
  const ev = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    sancionIdLocal: idLocalTrunc(sancion.id),
    estadoDesde, estadoHasta,
    ejecutadoPor: currentUser?.nombre || '',
    ejecutadoRol: currentUser?.perfil || '',
    ejecutadoEn: new Date().toISOString(),
    observaciones,
  };
  if (!DB.sancionEventos) DB.sancionEventos = [];
  DB.sancionEventos.push(ev);
  await supaSync('sancionEventos', ev);
}

export async function registrarDescargo({ sancionIdLocal, medio, descripcion, adjuntosSubidos, registradoPor }) {
  const s = getSancionById(sancionIdLocal);
  if (!s) { toast('⚠️ No se encontró la sanción'); return null; }
  if (!['Pendiente descargo', 'Descargo recibido'].includes(s.estado)) { toast('⚠️ Esta sanción no está esperando un descargo'); return null; }
  if (!descripcion || !descripcion.trim()) { toast('⚠️ Ingresá la descripción del descargo'); return null; }

  const extemporaneo = s.fechaLimiteDescargo && new Date(s.fechaLimiteDescargo).getTime() < Date.now();

  const d = {
    id: Date.now(),
    sancionIdLocal: idLocalTrunc(s.id),
    legajoIdLocal: s.legajoIdLocal,
    medio, descripcion: descripcion.trim(),
    adjuntos: adjuntosSubidos || [],
    registradoPor: registradoPor || currentUser?.nombre || '',
  };
  if (!DB.sancionDescargos) DB.sancionDescargos = [];
  DB.sancionDescargos.push(d);
  await supaSync('sancionDescargos', d);

  const estadoDesde = s.estado;
  s.descargoIdLocal = idLocalTrunc(d.id);
  s.estado = 'Descargo recibido';
  if (extemporaneo) s.observaciones = (s.observaciones ? s.observaciones + ' — ' : '') + 'Descargo extemporáneo (presentado fuera de plazo)';
  await supaSync('sancionesDisciplinarias', s);
  await registrarEventoSancion(s, estadoDesde, s.estado, extemporaneo ? 'Descargo extemporáneo' : '');

  await crearNotificacion({ tipo: 'sancion_descargo_presentado', entidadTipo: 'sancion', entidadIdLocal: s.id, destinatarioNombre: nombreGerenteRRHH(), mensaje: `📝 ${s.nombreSancionado} presentó su descargo — listo para revisar.` });
  toast(extemporaneo ? '📝 Descargo registrado (extemporáneo)' : '📝 Descargo registrado');
  return d;
}

// ========== MODAL ==========

let _sancionDescargoId = null;

function ensureModalDescargo() {
  if ($('modal-sanc-descargo')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-sanc-descargo';
  m.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>📝 Registrar descargo</h3><button class="btn-close" onclick="cerrarModal('modal-sanc-descargo')">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Medio *</label>
          <select id="sd-medio">${MEDIOS_DESCARGO.map(m2 => `<option>${m2}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Descripción del descargo *</label><textarea id="sd-descripcion" rows="4"></textarea></div>
        <div class="form-group"><label>Adjuntos (opcional)</label><input type="file" id="sd-adjuntos" multiple accept="application/pdf,image/jpeg,image/png"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-sanc-descargo')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarRegistrarDescargo()">Guardar descargo</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirRegistrarDescargo(sancionIdLocal) {
  const s = getSancionById(sancionIdLocal);
  if (!s) return;
  _sancionDescargoId = sancionIdLocal;
  ensureModalDescargo();
  $('sd-medio').value = 'Sistema';
  $('sd-descripcion').value = '';
  $('sd-adjuntos').value = '';
  abrirModal('modal-sanc-descargo');
}

export async function confirmarRegistrarDescargo() {
  const s = getSancionById(_sancionDescargoId);
  if (!s) return;
  const medio = $('sd-medio').value;
  const descripcion = $('sd-descripcion').value;
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(s.legajoIdLocal));

  const archivos = Array.from($('sd-adjuntos')?.files || []);
  const adjuntosSubidos = [];
  if (archivos.length && !legajo?.dni) {
    toast('⚠️ El legajo del sancionado no tiene DNI cargado — no se pueden subir adjuntos'); return;
  }
  for (const file of archivos) {
    try {
      const adj = await subirAdjunto({ dni: legajo.dni, etapa: 'sanciones', tipo: 'descargo-sancion', file });
      adjuntosSubidos.push({ nombre: file.name, id: adj.id });
    } catch (e) {
      toast('⚠️ No se pudo subir un adjunto: ' + e.message);
    }
  }

  const resultado = await registrarDescargo({ sancionIdLocal: _sancionDescargoId, medio, descripcion, adjuntosSubidos });
  if (resultado) cerrarModal('modal-sanc-descargo');
}
