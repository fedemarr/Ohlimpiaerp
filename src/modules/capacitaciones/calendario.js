// Módulo Capacitaciones — Tab Calendario + generador de plan mensual
// (Etapa 2, spec §8). Reemplaza el placeholder "🚧 en rediseño" de la
// Etapa 1 y el viejo "Plan anual" simulado de legacy.js
// (generarPlanIA/renderCalendarioPlan trabajaban sobre DB.planCapacitaciones,
// un array en memoria sin relación con datos reales).
//
// Es la misma tabla `capacitaciones` que el tab Registro, solo cambia la
// vista (spec §3.1/§8.1) — reutiliza abrirEditarCapacitacionPorId/
// abrirDictarCapacitacionPorId/anularCapacitacionPorId ya escritas para
// Registro, cero lógica de acciones duplicada.
//
// El plan mensual es un borrador en memoria (no persiste) hasta que se
// confirma — ahí se crean como capacitaciones reales (misma mecánica que
// agendar una a la vez). No requiere tablas nuevas.

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { abrirNuevaCapacitacion, abrirEditarCapacitacionPorId, abrirDictarCapacitacionPorId, anularCapacitacionPorId } from './capacitaciones.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const COLOR_LUGAR = { Servicio: 'var(--azul)', 'Oficina Central': 'var(--verde)', Virtual: 'var(--acento)', Externo: 'var(--rojo)' };

let mesCapOffset = 0;
let borradorPlan = [];

const tieneAprobado = (nroSocio, tipo) => (DB.capacitaciones || []).some(c => !c.anulado && String(c.nroSocio) === String(nroSocio)
  && c.tipo === tipo && c.estado === 'Dictada' && c.resultado === 'Aprobado');

// ========== GRILLA MENSUAL ==========

export function cambiarMesCap(dir) { mesCapOffset += dir; renderCalendarioCap(); }

export function renderCalendarioCap() {
  const cont = $('calendario-cap'); if (!cont) return;
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth() + mesCapOffset, 1);
  const mes = base.getMonth(), anio = base.getFullYear();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const lbl = $('mes-cap-label'); if (lbl) lbl.textContent = `${MESES[mes]} ${anio}`;

  const caps = (DB.capacitaciones || []).filter(c => !c.anulado
    && (c.estado === 'Programada' || (c.estado === 'Dictada' && c.resultado === 'Pendiente evaluación')));

  const diasNom = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const primerDia = new Date(anio, mes, 1).getDay();

  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">';
  diasNom.forEach(d => html += `<div style="text-align:center;font-size:11px;font-weight:700;color:var(--texto-suave);padding:4px 0;">${d}</div>`);
  for (let i = 0; i < primerDia; i++) html += '<div></div>';

  for (let d = 1; d <= diasEnMes; d++) {
    const fechaIso = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const delDia = caps.filter(c => c.fecha === fechaIso);
    const esHoy = anio === hoy.getFullYear() && mes === hoy.getMonth() && d === hoy.getDate();
    const dow = new Date(anio, mes, d).getDay();
    const esFin = dow === 0 || dow === 6;
    html += `<div class="cal-dia-cap" data-fecha="${fechaIso}" style="min-height:76px;border:1px solid var(--borde);border-radius:8px;padding:4px;cursor:pointer;background:${esHoy ? 'var(--azul-claro)' : esFin ? 'var(--gris-suave)' : 'white'};">
      <div style="font-size:11px;font-weight:${esHoy ? '700' : '500'};color:${esHoy ? 'var(--azul)' : 'var(--texto-suave)'};">${d}</div>
      ${delDia.map(c => `<div style="background:${COLOR_LUGAR[c.lugar] || 'var(--azul)'};color:white;border-radius:3px;padding:1px 3px;margin-top:2px;font-size:9px;display:flex;align-items:center;gap:3px;">
        <span data-action="editar" data-id="${c.id}" style="cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;" title="${c.nombreAsociado} — ${c.tipo}">${(c.nombreAsociado || '').split(' ')[0]} · ${c.tipo.split(':').pop().trim().substring(0, 10)}</span>
        <span data-action="dictar" data-id="${c.id}" style="cursor:pointer;" title="Dictar / cargar resultado">🎓</span>
        ${c.estado === 'Programada' ? `<span data-action="anular" data-id="${c.id}" style="cursor:pointer;" title="Anular">❌</span>` : ''}
      </div>`).join('')}
    </div>`;
  }
  html += '</div>';
  html += `<div style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap;">
    ${Object.entries(COLOR_LUGAR).map(([m, c]) => `<div style="display:flex;align-items:center;gap:5px;font-size:11px;"><div style="width:12px;height:12px;border-radius:3px;background:${c};"></div>${m}</div>`).join('')}
  </div>`;

  cont.innerHTML = html;
  cont.onclick = (e) => {
    const accion = e.target.closest('[data-action]');
    if (accion) {
      e.stopPropagation();
      const id = accion.dataset.id;
      const act = accion.dataset.action;
      if (act === 'editar') abrirEditarCapacitacionPorId(id);
      else if (act === 'dictar') abrirDictarCapacitacionPorId(id);
      else if (act === 'anular') anularCapacitacionPorId(id);
      return;
    }
    const dia = e.target.closest('.cal-dia-cap');
    if (dia) abrirNuevaCapacitacion(dia.dataset.fecha);
  };
}

// ========== PANEL DEL GENERADOR ==========

export function toggleGeneradorPlan() {
  const el = $('cap-generador-config'); if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

export function poblarSelectMesObjetivo() {
  const sel = $('cap-plan-mes'); if (!sel) return;
  const hoy = new Date();
  let opts = '';
  for (let i = 0; i < 6; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opts += `<option value="${val}">${MESES[d.getMonth()]} ${d.getFullYear()}</option>`;
  }
  sel.innerHTML = opts;
}

function tiposPendientes(l) {
  return (DB.tiposCapacitacion || []).filter(t => !tieneAprobado(l.nro, t));
}

export function generarPlanMensual() {
  const mesVal = ($('cap-plan-mes') || { value: '' }).value;
  if (!mesVal) { toast('⚠️ Seleccioná el mes objetivo'); return; }
  const [anioStr, mesStr] = mesVal.split('-');
  const anio = parseInt(anioStr, 10), mes = parseInt(mesStr, 10) - 1;
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  const modalidades = [];
  if (($('cap-plan-mod-servicio') || {}).checked) modalidades.push('Servicio');
  if (($('cap-plan-mod-oficina') || {}).checked) modalidades.push('Oficina Central');
  if (($('cap-plan-mod-virtual') || {}).checked) modalidades.push('Virtual');
  if (($('cap-plan-mod-externo') || {}).checked) modalidades.push('Externo');
  if (!modalidades.length) { toast('⚠️ Habilitá al menos una modalidad'); return; }

  const prioridad = ($('cap-plan-prioridad') || { value: '' }).value;
  const maxSemana = parseInt(($('cap-plan-max') || { value: '2' }).value, 10) || 2;

  let lista = (DB.legajos || []).filter(l => l.estado === 'Activo');
  if (prioridad === 'ingresos') {
    lista = [...lista].sort((a, b) => new Date(b.fechaIngresoPrueba || '2000-01-01') - new Date(a.fechaIngresoPrueba || '2000-01-01'));
  } else if (prioridad === 'ninguna') {
    const cant = l => (DB.capacitaciones || []).filter(c => !c.anulado && String(c.nroSocio) === String(l.nro)).length;
    lista = [...lista].sort((a, b) => cant(a) - cant(b));
  }

  const primerDow = new Date(anio, mes, 1).getDay();
  const inicioSemana = (primerDow + 6) % 7; // 0 = Lunes
  const weekOf = d => Math.floor((d - 1 + inicioSemana) / 7);
  const countPorSemana = {};
  let dia = 1;
  function proximoHueco() {
    while (dia <= diasEnMes) {
      const w = weekOf(dia);
      if ((countPorSemana[w] || 0) < maxSemana) {
        countPorSemana[w] = (countPorSemana[w] || 0) + 1;
        return dia++;
      }
      dia++;
    }
    return null;
  }

  borradorPlan = [];
  let lleno = false;
  for (const l of lista) {
    if (lleno) break;
    for (const tipo of tiposPendientes(l)) {
      const d = proximoHueco();
      if (d === null) { lleno = true; break; }
      const modalidad = modalidades[Math.floor(Math.random() * modalidades.length)];
      borradorPlan.push({
        tempId: 'b' + (borradorPlan.length + 1),
        nombreAsociado: l.nombre,
        nroSocio: String(l.nro),
        servicio: l.servicio || '',
        tipo,
        lugar: modalidad,
        instructor: 'Referente',
        fecha: `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      });
    }
  }

  if (!borradorPlan.length) { toast('ℹ️ No hay capacitaciones pendientes para generar en ese mes'); return; }
  ensureModalBorradorPlan();
  renderBorradorPlan();
  abrirModal('modal-cap-borrador');
}

// ========== MODAL DE REVISIÓN DEL BORRADOR ==========

function ensureModalBorradorPlan() {
  if ($('modal-cap-borrador')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-cap-borrador';
  m.innerHTML = [
    '<div class="modal" style="max-width:900px;">',
      '<div class="modal-header"><h3>🤖 Borrador del plan mensual</h3><button class="btn-close" onclick="cerrarModal(\'modal-cap-borrador\')">×</button></div>',
      '<div class="modal-body" style="max-height:60vh;overflow-y:auto;">',
        '<div id="cap-borrador-resumen" style="font-size:12px;color:var(--texto-suave);margin-bottom:10px;"></div>',
        '<div class="tabla-wrap"><table><thead><tr>',
          '<th>Asociado</th><th>Tipo</th><th>Fecha</th><th>Modalidad</th><th>Instructor</th><th></th>',
        '</tr></thead><tbody id="tbody-cap-borrador"></tbody></table></div>',
      '</div>',
      '<div class="modal-footer">',
        '<button class="btn btn-secondary" onclick="cerrarModal(\'modal-cap-borrador\')">Cancelar</button>',
        '<button class="btn btn-primary" onclick="confirmarPlanMensual()">✅ Confirmar plan</button>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(m);
}

function renderBorradorPlan() {
  const resumen = $('cap-borrador-resumen');
  if (resumen) {
    const asociados = new Set(borradorPlan.map(b => b.nroSocio));
    resumen.textContent = `${borradorPlan.length} capacitaciones planificadas para ${asociados.size} asociados. Podés sacar filas o ajustar fecha/instructor antes de confirmar.`;
  }
  const tbody = $('tbody-cap-borrador'); if (!tbody) return;
  tbody.innerHTML = borradorPlan.map(b => `<tr>
    <td style="font-size:12px;">${b.nombreAsociado}</td>
    <td style="font-size:12px;">${b.tipo.replace('Capacitación de Ingreso: ', '')}</td>
    <td><input type="date" data-field="fecha" data-tempid="${b.tempId}" value="${b.fecha}" style="font-size:12px;padding:3px 5px;border:1px solid var(--borde-fuerte);border-radius:5px;"></td>
    <td style="font-size:12px;">${b.lugar}</td>
    <td><select data-field="instructor" data-tempid="${b.tempId}" style="font-size:12px;padding:3px 5px;border:1px solid var(--borde-fuerte);border-radius:5px;">${(DB.instructores || []).map(i => `<option${i === b.instructor ? ' selected' : ''}>${i}</option>`).join('')}</select></td>
    <td><button data-action="quitar" data-tempid="${b.tempId}" style="font-size:11px;padding:3px 8px;border:none;border-radius:4px;background:#dc2626;color:white;cursor:pointer;">🗑️</button></td>
  </tr>`).join('');

  tbody.onchange = (e) => {
    const field = e.target.dataset.field;
    const tempId = e.target.dataset.tempid;
    if (!field || !tempId) return;
    const b = borradorPlan.find(x => x.tempId === tempId);
    if (b) b[field] = e.target.value;
  };
  tbody.onclick = (e) => {
    const btn = e.target.closest('[data-action="quitar"]');
    if (!btn) return;
    borradorPlan = borradorPlan.filter(b => b.tempId !== btn.dataset.tempid);
    renderBorradorPlan();
  };
}

export function confirmarPlanMensual() {
  if (!borradorPlan.length) { toast('⚠️ No hay filas en el borrador'); return; }
  const nowIso = new Date().toISOString();
  borradorPlan.forEach((b, i) => {
    const c = {
      id: Date.now() + i,
      legajoIdLocal: b.nroSocio,
      nroSocio: b.nroSocio,
      nombreAsociado: b.nombreAsociado,
      tipo: b.tipo,
      fecha: b.fecha,
      lugar: b.lugar,
      servicio: b.servicio || null,
      instructor: b.instructor,
      metodoEvaluacion: null,
      estado: 'Programada',
      resultado: null,
      observaciones: 'Generada por el plan mensual',
      editadoPor: currentUser?.nombre || '',
      editadoEn: nowIso,
    };
    DB.capacitaciones.push(c);
    supaSync('capacitaciones', c);
  });
  const n = borradorPlan.length;
  borradorPlan = [];
  cerrarModal('modal-cap-borrador');
  renderCalendarioCap();
  toast(`✅ ${n} capacitaciones creadas como Programada`);
}

// ========== COORDINACIÓN POR WHATSAPP (placeholder — Etapa 4) ==========

export function coordinarWhatsappCap() {
  toast('📱 Función disponible cuando WhatsApp esté conectado');
}
