// Enfermos y Accidentes v1 — cálculo mensual del retiro a pagar
// mientras dura el caso, usando el valor hora congelado al ingreso
// (política A.6 — no se recalcula aunque haya paritaria en el medio).

import { DB, currentUser } from '@shared/state.js';
import { $ } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { getCasoById, idLocalTrunc } from './flujo.js';
import { horasPorDia } from './categoria_helper.js';

// Días del caso en el mes: intersección entre el rango del caso
// (fechaInicio..fechaAltaEfectiva o hoy si sigue abierto) y el mes.
export function calcularRetiroMensual(caso, periodo) {
  if (caso.pendienteAdministrativo) return { pendienteAdministrativo: true };

  const [anio, mes] = periodo.split('-').map(Number);
  const inicioMes = new Date(anio, mes - 1, 1);
  const finMes = new Date(anio, mes, 0);
  const fechaInicioCaso = new Date(caso.fechaInicio + 'T00:00:00');
  const inicioCasoEnMes = fechaInicioCaso > inicioMes ? fechaInicioCaso : inicioMes;
  const fechaAlta = caso.fechaAltaEfectiva ? new Date(caso.fechaAltaEfectiva + 'T00:00:00') : null;
  const finCasoEnMes = (fechaAlta && fechaAlta < finMes) ? fechaAlta : finMes;

  const diasDelCasoEnMes = Math.max(0, Math.floor((finCasoEnMes - inicioCasoEnMes) / (1000 * 60 * 60 * 24)) + 1);
  const hpd = horasPorDia(caso.categoriaIdLocal);
  const horasCalculadas = diasDelCasoEnMes * hpd;
  const valorHora = Number(caso.valorHoraCongelado) || 0;
  const montoRetiro = horasCalculadas * valorHora;

  return { pendienteAdministrativo: false, diasDelCasoEnMes, horasCalculadas, valorHora, montoRetiro };
}

export function retirosDeCaso(casoIdLocal) {
  return (DB.retirosEnfermosPendientes || [])
    .filter(r => !r.anulado && String(r.casoIdLocal) === idLocalTrunc(casoIdLocal))
    .sort((a, b) => (b.periodo || '').localeCompare(a.periodo || ''));
}

// No se edita un retiro ya generado (diseño §11.7): se anula el
// anterior del mismo caso+período y se crea uno nuevo.
export async function guardarRetiroMensual({ casoIdLocal, periodo, horasAjustadas }) {
  const caso = getCasoById(casoIdLocal);
  if (!caso) throw new Error('No se encontró el caso');
  if (caso.pendienteAdministrativo) throw new Error('Cálculo pendiente — clarificar con Gabi. No se puede generar un retiro para este caso todavía.');

  const calc = calcularRetiroMensual(caso, periodo);
  const anterior = (DB.retirosEnfermosPendientes || []).find(r =>
    !r.anulado && String(r.casoIdLocal) === idLocalTrunc(casoIdLocal) && r.periodo === periodo
  );
  if (anterior) {
    anterior.anulado = true;
    await supaSync('retirosEnfermosPendientes', anterior);
  }

  const horas = horasAjustadas != null && horasAjustadas !== '' ? Number(horasAjustadas) : calc.horasCalculadas;
  const nuevo = {
    id: Date.now(),
    casoIdLocal: idLocalTrunc(casoIdLocal),
    legajoIdLocal: caso.legajoIdLocal,
    periodo,
    diasDelCasoEnMes: calc.diasDelCasoEnMes,
    horasCalculadas: calc.horasCalculadas,
    horasAjustadas: horas,
    valorHoraCongelado: calc.valorHora,
    montoRetiro: horas * calc.valorHora,
    estado: 'Pendiente',
    cargadoPor: currentUser?.nombre || '',
  };
  if (!DB.retirosEnfermosPendientes) DB.retirosEnfermosPendientes = [];
  DB.retirosEnfermosPendientes.push(nuevo);
  await supaSync('retirosEnfermosPendientes', nuevo);
  return nuevo;
}

// ========== MODAL — GESTIONAR RETIRO MENSUAL ==========

let _casoRetiroId = null;

function ensureModalRetiro() {
  if ($('modal-enf-retiro')) return;
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'modal-enf-retiro';
  m.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3>💰 Gestionar retiro mensual</h3><button class="btn-close" onclick="cerrarModal('modal-enf-retiro')">×</button></div>
      <div class="modal-body">
        <div id="ret-pendiente-admin" class="alerta alerta-warn" style="display:none;">Cálculo pendiente — clarificar con Gabi. Este caso es de un asociado administrativo.</div>
        <div id="ret-cuerpo">
          <div class="form-group"><label>Período *</label><input type="month" id="ret-periodo" onchange="recalcularRetiroModal()"></div>
          <div class="info-grid" style="margin:10px 0;">
            <div class="info-item"><div class="key">Días del caso en el mes</div><div class="val" id="ret-dias">—</div></div>
            <div class="info-item"><div class="key">Horas propuestas</div><div class="val" id="ret-horas-prop">—</div></div>
            <div class="info-item"><div class="key">Valor hora congelado</div><div class="val" id="ret-valor-hora">—</div></div>
          </div>
          <div class="form-group"><label>Horas ajustadas</label><input type="number" id="ret-horas-ajustadas" min="0" step="0.5" oninput="recalcularMontoModal()"></div>
          <div class="info-item" style="margin-top:8px;"><div class="key">Monto del retiro</div><div class="val" id="ret-monto" style="font-size:18px;font-weight:700;">$0</div></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="cerrarModal('modal-enf-retiro')">Cancelar</button>
        <button class="btn btn-primary" id="ret-btn-guardar" onclick="confirmarGuardarRetiro()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

export function abrirGestionarRetiro(casoIdLocal) {
  const caso = getCasoById(casoIdLocal);
  if (!caso) return;
  _casoRetiroId = casoIdLocal;
  ensureModalRetiro();

  const admin = !!caso.pendienteAdministrativo;
  $('ret-pendiente-admin').style.display = admin ? 'block' : 'none';
  $('ret-cuerpo').style.display = admin ? 'none' : 'block';
  $('ret-btn-guardar').style.display = admin ? 'none' : 'inline-block';
  if (admin) { abrirModal('modal-enf-retiro'); return; }

  $('ret-periodo').value = new Date().toISOString().slice(0, 7);
  $('ret-horas-ajustadas').value = '';
  recalcularRetiroModal();
  abrirModal('modal-enf-retiro');
}

export function recalcularRetiroModal() {
  const caso = getCasoById(_casoRetiroId);
  const periodo = $('ret-periodo').value;
  if (!caso || !periodo) return;
  const calc = calcularRetiroMensual(caso, periodo);
  $('ret-dias').textContent = calc.diasDelCasoEnMes;
  $('ret-horas-prop').textContent = calc.horasCalculadas + ' hs';
  $('ret-valor-hora').textContent = '$' + Number(calc.valorHora).toLocaleString('es-AR');
  $('ret-horas-ajustadas').value = calc.horasCalculadas;
  recalcularMontoModal();
}

export function recalcularMontoModal() {
  const caso = getCasoById(_casoRetiroId);
  if (!caso) return;
  const horas = parseFloat($('ret-horas-ajustadas').value) || 0;
  const monto = horas * (Number(caso.valorHoraCongelado) || 0);
  $('ret-monto').textContent = '$' + monto.toLocaleString('es-AR');
}

export async function confirmarGuardarRetiro() {
  const periodo = $('ret-periodo').value;
  if (!periodo) { toast('⚠️ Elegí el período'); return; }
  try {
    await guardarRetiroMensual({ casoIdLocal: _casoRetiroId, periodo, horasAjustadas: $('ret-horas-ajustadas').value });
    cerrarModal('modal-enf-retiro');
    window.abrirDetalleCasoEnfermos && window.abrirDetalleCasoEnfermos(_casoRetiroId);
    toast('✅ Retiro mensual guardado');
  } catch (e) {
    toast('⚠️ ' + e.message);
  }
}
