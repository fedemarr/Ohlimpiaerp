// Módulo Competencia Anual — Reglas y puntajes (rehecho de cero).
//
// Bugs reales corregidos de la versión en legacy.js:
//   - El panel "Tabla de puntajes" armaba un <div> por regla pero nunca
//     insertaba el texto de la acción ni el puntaje adentro — se veía
//     vacío. Acá sí se muestra.
//   - `guardarReglas()` llamaba a supaSync('reglasCompetencia', ...) pero
//     esa clave nunca estuvo en el mapa de tablas (_SM) — el guardado no
//     hacía nada. Ahora sí persiste (tabla reglas_competencia, v025).
//   - El input de puntaje de "No participar en evaluación" (-10 pts) tenía
//     `min="1"` en el HTML viejo, así que nunca se podía volver a poner un
//     valor negativo una vez cambiado — se corrige el mínimo.
//   - Cada input de puntaje mutaba `DB.reglasCompetencia` directo por un
//     `onchange` inline, sin pasar por guardarReglas() ni por supaSync —
//     ahora todo se junta y persiste en un solo punto (Guardar reglas).

import { DB } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';

// Mismos valores que el default de DB.reglasCompetencia en state.js — se
// duplican acá (en vez de leerlos de DB.reglasCompetencia en el momento
// del sync) porque para cuando esta función corre, supaInit() ya
// sobreescribió DB.reglasCompetencia con el array crudo de Supabase.
const PUNTAJES_DEFAULT = [
  { accion: 'Responder una evaluación', pts: 10, bonus: false },
  { accion: 'Respuesta correcta (por pregunta)', pts: 5, bonus: false },
  { accion: 'Capacitación presencial en oficina', pts: 20, bonus: true },
  { accion: 'Capacitación en servicio', pts: 10, bonus: false },
  { accion: 'Capacitación vía video (con evaluación)', pts: 8, bonus: false },
  { accion: 'Participación en equipo (mismo servicio responde juntos)', pts: 15, bonus: true },
  { accion: 'Capacitación por Meet/Virtual', pts: 12, bonus: false },
  { accion: 'No participar en evaluación (descuento al equipo y supervisor)', pts: -10, bonus: false },
];

// supaInit() carga reglasCompetencia como array genérico (vía _SM), pero
// acá se usa como objeto singleton — se llama una vez después de
// supaInit(), mismo patrón que sincronizarConfigReasignaciones().
export function sincronizarReglasCompetencia() {
  const filas = Array.isArray(DB.reglasCompetencia) ? DB.reglasCompetencia : [];
  const fila = filas.find(r => !r.anulado);
  if (!fila) {
    DB.reglasCompetencia = {
      id: 'global', duracion: 'Todo el año calendario',
      desempate: 'Mayor cantidad de evaluaciones respondidas',
      descuentoAusente: 10, puntajes: PUNTAJES_DEFAULT,
    };
    return;
  }
  DB.reglasCompetencia = {
    id: 'global',
    duracion: fila.duracion || 'Todo el año calendario',
    desempate: fila.desempate || 'Mayor cantidad de evaluaciones respondidas',
    descuentoAusente: fila.descuentoAusente ?? 10,
    puntajes: (fila.puntajes && fila.puntajes.length) ? fila.puntajes : PUNTAJES_DEFAULT,
  };
}

export function renderReglas() {
  const reg = DB.reglasCompetencia;
  const panelReg = $('panel-reglas');
  if (panelReg) {
    panelReg.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div class="info-item"><div class="key">Duración</div><div class="val">${reg.duracion}</div></div>
        <div class="info-item"><div class="key">Desempate</div><div class="val">${reg.desempate}</div></div>
        <div class="divider"></div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--texto-suave);">Equipos</div>
        <div class="info-item"><div class="key">Formación</div><div class="val">Por servicio (fijos)</div></div>
        <div class="info-item"><div class="key">Solitarios</div><div class="val">Solo tabla individual (sin equipo)</div></div>
        <div class="info-item"><div class="key">Supervisores</div><div class="val">Puntaje promedio de toda su gente</div></div>
        <div class="divider"></div>
        <div style="font-size:11px;color:var(--texto-muy-suave);">⭐ Los ítems con bonus están marcados con estrella dorada</div>
      </div>`;
  }
  const panelPts = $('panel-puntajes');
  if (panelPts) {
    panelPts.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">
      ${reg.puntajes.map(p => {
        const esDescuento = p.pts < 0;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:${esDescuento ? 'var(--rojo-suave)' : p.bonus ? 'var(--acento-suave)' : 'var(--fondo)'};border-radius:var(--radio);border:1px solid ${esDescuento ? '#f5c6c0' : p.bonus ? '#e6c84a' : 'var(--borde)'};">
          <span style="font-size:12.5px;">${p.bonus ? '⭐ ' : ''}${p.accion}</span>
          <span style="font-weight:700;font-size:13px;color:${esDescuento ? 'var(--rojo)' : 'var(--azul)'};">${p.pts > 0 ? '+' : ''}${p.pts} pts</span>
        </div>`;
      }).join('')}
    </div>`;
  }
}

export function abrirModalEditarReglas() {
  const reg = DB.reglasCompetencia;
  const form = $('reglas-puntajes-form');
  if (form) {
    form.innerHTML = reg.puntajes.map((p, i) => `
      <span style="font-size:12px;">${p.bonus ? '⭐ ' : ''}${p.accion}</span>
      <input type="number" data-idx="${i}" value="${p.pts}" min="-100" max="100" style="width:60px;padding:4px 8px;border:1px solid var(--borde-fuerte);border-radius:6px;font-size:12px;outline:none;">
    `).join('');
  }
  if ($('reg-duracion')) $('reg-duracion').value = reg.duracion;
  if ($('reg-desempate')) $('reg-desempate').value = reg.desempate;
  abrirModal('modal-reglas-edit');
}

export function guardarReglas() {
  const reg = DB.reglasCompetencia;
  reg.duracion = ($('reg-duracion') || { value: reg.duracion }).value;
  reg.desempate = ($('reg-desempate') || { value: reg.desempate }).value;
  document.querySelectorAll('#reglas-puntajes-form input[data-idx]').forEach(inp => {
    const idx = parseInt(inp.dataset.idx, 10);
    const val = parseInt(inp.value, 10);
    if (reg.puntajes[idx] && !isNaN(val)) reg.puntajes[idx].pts = val;
  });

  supaSync('reglasCompetencia', reg);
  cerrarModal('modal-reglas-edit');
  renderReglas();
  if (window.renderCompetencia) window.renderCompetencia();
  toast('✅ Reglas del torneo actualizadas');
}
