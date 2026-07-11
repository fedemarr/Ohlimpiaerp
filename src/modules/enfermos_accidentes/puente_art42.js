// Enfermos y Accidentes v1 — puente manual con Liquidación de horas
// (diseño §3.11/§9.3). DB.art42 NO es una lista granular de días
// sueltos: es la salida de un modal ya existente en legacy.js
// (abrirModalArt42/guardarArt42) donde ya se cargan casos completos
// con `dias` (cantidad), `fechaInicio`, `estado:'Abierto'`. No hace
// falta ningún algoritmo de detección de racha de 3+ días — alcanza
// con leer los que siguen `estado==='Abierto'`. No se toca el código
// de Liquidación de horas (política del propio diseño), solo se lee
// el array compartido DB.art42 (nunca persiste a Supabase — es
// intencional, vive en memoria de sesión).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { casoAbiertoDeLegajo } from './flujo.js';

export function casosArt42Candidatos() {
  return (DB.art42 || []).filter(a => a.estado === 'Abierto').map(a => {
    const legajo = (DB.legajos || []).find(l => String(l.nro) === String(a.nroSocio));
    return { art42: a, legajo, tieneCasoAbierto: legajo ? !!casoAbiertoDeLegajo(legajo.nro) : false };
  });
}

function ensureModalArt42() {
  if ($('modal-enf-art42')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-enf-art42';
  m.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header"><h3>🔎 Buscar casos Art. 42 ≥ 3 días</h3><button class="btn-close" onclick="cerrarModal('modal-enf-art42')">×</button></div>
      <div class="modal-body">
        <p style="font-size:12.5px;color:var(--texto-suave);margin-top:0;">Candidatos cargados desde Liquidación de horas (planilla de Art. 42) que todavía no tienen un caso formal abierto acá.</p>
        <div id="art42-lista"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="cerrarModal('modal-enf-art42')">Cerrar</button></div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirBuscarArt42() {
  ensureModalArt42();
  const candidatos = casosArt42Candidatos();
  $('art42-lista').innerHTML = candidatos.length === 0
    ? '<p class="text-muted">Sin candidatos pendientes</p>'
    : candidatos.map(({ art42: a, legajo, tieneCasoAbierto }) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 14px;margin-bottom:8px;">
        <div>
          <div style="font-size:13px;font-weight:600;">${a.asociado} — N° ${a.nroSocio}</div>
          <div style="font-size:11px;color:var(--texto-suave);">${a.servicio || '—'} · Desde ${a.fechaInicio || '—'} · ${a.dias} días cargados</div>
          ${tieneCasoAbierto ? '<div style="font-size:11px;color:var(--rojo);margin-top:2px;">Ya tiene un caso abierto</div>' : ''}
        </div>
        <button class="btn btn-primary btn-sm" ${tieneCasoAbierto || !legajo ? 'disabled' : ''} onclick="abrirComoCasoFormal(${a.id})">Abrir como caso formal</button>
      </div>`).join('');
  abrirModal('modal-enf-art42');
}

export function abrirComoCasoFormal(art42Id) {
  const a = (DB.art42 || []).find(x => String(x.id) === String(art42Id));
  if (!a) return;
  const legajo = (DB.legajos || []).find(l => String(l.nro) === String(a.nroSocio));
  if (!legajo) { toast('⚠️ No se encontró el legajo del asociado'); return; }
  cerrarModal('modal-enf-art42');
  window.abrirNuevoCasoEnfermos && window.abrirNuevoCasoEnfermos({
    legajoNro: legajo.nro,
    fechaInicio: a.fechaInicio,
    art42IdParaConvertir: a.id,
  });
}

// Se llama desde flujo de guardado del modal de apertura cuando vino
// de un candidato art42 — marca el registro en memoria (nunca
// persiste, art42 no está mapeado en _SM, y no se toca ese mapeo).
export function marcarArt42Convertido(art42Id) {
  const a = (DB.art42 || []).find(x => String(x.id) === String(art42Id));
  if (a) a.estado = 'Convertido a caso formal';
}
