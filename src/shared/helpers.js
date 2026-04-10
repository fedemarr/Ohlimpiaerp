import { DB, BADGE_MAP } from '@shared/state.js';

// ========== DOM ==========

export const $ = id => document.getElementById(id);

// ========== TEXTO Y FORMATO ==========

export const initials = n => {
  const p = n.trim().split(' ');
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
};

export const avatarEl = (n, sz = 32) =>
  `<div class="avatar" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz / 2.8)}px;">${initials(n)}</div>`;

export const toTitleCase = s =>
  (s || '').toLowerCase().replace(/(?:^|[\s-])\S/g, c => c.toUpperCase());

export const cleanText = s => (s || '').trim();

export const badge = v =>
  `<span class="badge ${BADGE_MAP[v] || 'badge-gris'}">${v || '—'}</span>`;

// ========== FECHAS ==========

export const hoyStr = () => new Date().toISOString().split('T')[0];

// Formatea un período DD/MM/AAAA → MM/AAAA (solo mes y año)
export function formatPeriodo(desde, hasta) {
  if (!desde && !hasta) return '—';
  const getMMAAAA = f => {
    if (!f) return '';
    const parts = f.split('/');
    if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
    return f;
  };
  const d = getMMAAAA(desde);
  const h = getMMAAAA(hasta);
  if (d === h) return d;
  if (!d) return h;
  if (!h) return d;
  return `${d} – ${h}`;
}

export function calcularDiasEntre(f1, f2) {
  try {
    const p = f => {
      const [d, m, y] = f.split('/');
      return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    };
    return Math.round(Math.abs(p(f2) - p(f1)) / (1000 * 3600 * 24));
  } catch {
    return '—';
  }
}

export function esFeriado(fechaISO) {
  return DB.feriados.some(f => f.fecha === fechaISO);
}

export function esFinde(fechaISO) {
  const d = new Date(fechaISO + 'T12:00:00');
  return d.getDay() === 0 || d.getDay() === 6;
}

export function getDiasDelMes(mesISO) {
  const [y, m] = mesISO.split('-').map(Number);
  const dias = [];
  const total = new Date(y, m, 0).getDate();
  for (let d = 1; d <= total; d++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dias.push({ iso, d, esFeriado: esFeriado(iso), esFinde: esFinde(iso) });
  }
  return dias;
}

// ========== DOM: FORMULARIOS ==========

export const applyTitleCase = id => {
  const el = document.getElementById(id);
  if (el) el.value = toTitleCase(el.value);
};

export function validarCampos(campos, toast) {
  let ok = true;
  campos.forEach(c => {
    const el = document.getElementById(c.id);
    if (!el) return;
    el.style.border = '';
    if (!el.value || !el.value.trim()) {
      el.style.border = '2px solid #dc2626';
      if (ok) { el.focus(); toast('⚠️ Completá: ' + c.label); }
      ok = false;
    }
  });
  return ok;
}

// ========== DOM: SELECTS ==========

export const fillSelect = (id, items, prefix = []) => {
  const el = $(id);
  if (!el) return;
  const ph = el.options[0]?.value === '' ? el.options[0].outerHTML : '';
  el.innerHTML = ph + [...prefix, ...items].map(i => `<option>${i}</option>`).join('');
};

export const fillDL = (id, items) => {
  const el = $(id);
  if (el) el.innerHTML = items.map(i => `<option value="${i}">`).join('');
};
