import { $ } from '@shared/helpers.js';

// ========== TOAST ==========

export function toast(msg, dur = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ========== MODALES ==========

export function abrirModal(id) { $(id).classList.add('open'); }

export function cerrarModal(id) { $(id).classList.remove('open'); }

export function initModalClickOutside() {
  document.querySelectorAll('.modal-overlay').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) cerrarModal(m.id); })
  );
}

// ========== MODAL GENÉRICO DE INPUT (reemplaza prompt() del navegador) ==========

let _inputSimpleCallback = null;
let _inputSimpleObligatorio = true;

// callback(valor) se ejecuta solo al confirmar; nunca al cancelar (mismo
// contrato que prompt(), que devuelve null si el usuario cancela).
export function abrirModalInput({ titulo = 'Ingresar dato', etiqueta = 'Valor', placeholder = '', obligatorio = true, valorInicial = '' } = {}, callback) {
  $('input-simple-titulo').textContent = titulo;
  $('input-simple-etiqueta').textContent = etiqueta;
  $('input-simple-valor').placeholder = placeholder;
  $('input-simple-valor').value = valorInicial;
  _inputSimpleCallback = callback;
  _inputSimpleObligatorio = obligatorio;
  abrirModal('modal-input-simple');
  setTimeout(() => $('input-simple-valor')?.focus(), 50);
}

export function confirmarModalInputSimple() {
  const valor = ($('input-simple-valor').value || '').trim();
  if (_inputSimpleObligatorio && !valor) { toast('⚠️ Completá el campo'); return; }
  cerrarModal('modal-input-simple');
  const cb = _inputSimpleCallback;
  _inputSimpleCallback = null;
  if (cb) cb(valor);
}

// ========== ORDENAMIENTO DE TABLAS ==========

const sortState = {};

export function makeTableSortable(tbodyId, data, renderFn, cols) {
  const tbody = $(tbodyId);
  if (!tbody) return;
  const thead = tbody.closest('table')?.querySelector('thead tr');
  if (!thead) return;
  const ths = thead.querySelectorAll('th');
  ths.forEach((th, i) => {
    const col = cols[i];
    if (!col || !col.key) return;
    th.classList.add('sortable');
    if (!th.querySelector('.sort-icon')) {
      const icon = document.createElement('span');
      icon.className = 'sort-icon';
      th.appendChild(icon);
    }
    th.onclick = () => {
      const cur = sortState[tbodyId];
      let dir = 'asc';
      if (cur && cur.col === col.key && cur.dir === 'asc') dir = 'desc';
      sortState[tbodyId] = { col: col.key, dir };
      ths.forEach(t => { t.classList.remove('sort-asc', 'sort-desc'); });
      th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
      const sorted = [...data].sort((a, b) => {
        let va = a[col.key] || '', vb = b[col.key] || '';
        if (col.type === 'num') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; return dir === 'asc' ? va - vb : vb - va; }
        if (col.type === 'date') { va = new Date(va.split('/').reverse().join('-') || 0); vb = new Date(vb.split('/').reverse().join('-') || 0); return dir === 'asc' ? va - vb : vb - va; }
        va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
        return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
      renderFn(sorted);
    };
  });
}

export function activarOrdenamientoTabla(tablaId) {
  const tabla = $(tablaId);
  if (!tabla) return;
  const headers = tabla.querySelectorAll('thead th');
  headers.forEach((th, idx) => {
    if (th.querySelector('input') || th.querySelector('select')) return;
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    if (!th.querySelector('.sort-icon')) {
      const ico = document.createElement('span');
      ico.className = 'sort-icon';
      ico.style.cssText = 'font-size:10px;color:var(--texto-muy-suave);margin-left:4px;';
      ico.textContent = '⇅';
      th.appendChild(ico);
    }
    th.onclick = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const prev = sortState[tablaId] || {};
      const dir = prev.col === idx && prev.dir === 'asc' ? 'desc' : 'asc';
      sortState[tablaId] = { col: idx, dir };
      headers.forEach((h, i) => {
        const si = h.querySelector('.sort-icon');
        if (si) si.textContent = i === idx ? (dir === 'asc' ? '↑' : '↓') : '⇅';
      });
      const tbody = tabla.querySelector('tbody');
      if (!tbody) return;
      const rows = [...tbody.querySelectorAll('tr')];
      rows.sort((a, b) => {
        const av = (a.querySelectorAll('td')[idx]?.textContent || '').trim();
        const bv = (b.querySelectorAll('td')[idx]?.textContent || '').trim();
        const an = parseFloat(av.replace(/[$%k.,\s]/g, ''));
        const bn = parseFloat(bv.replace(/[$%k.,\s]/g, ''));
        const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv, 'es', { sensitivity: 'base' });
        return dir === 'asc' ? cmp : -cmp;
      });
      rows.forEach(r => tbody.appendChild(r));
    };
  });
}

export function activarOrdenamiento() {
  const tablas = [
    'tbody-candidatos', 'tbody-pedidos', 'tbody-legajos', 'tbody-capacitaciones',
    'tbody-vac-admin', 'tbody-vac-op', 'tbody-reasignaciones', 'tbody-cobros', 'tbody-cobrados',
    'tbody-clientes', 'tbody-objetivos', 'tbody-leads', 'tbody-acciones', 'tbody-reclamos',
    'tbody-nc', 'tbody-propuestas-precio',
  ];
  tablas.forEach(id => {
    const tbody = $(id);
    if (!tbody) return;
    const tabla = tbody.closest('table');
    if (!tabla) return;
    if (!tabla.id) tabla.id = 'tbl-' + id;
    activarOrdenamientoTabla(tabla.id);
  });
}

// ========== BUSCADOR EN GRILLAS ==========

export function handleBuscadorKeydown(e, grillaId) {
  const resEl = document.getElementById('res-asoc-' + grillaId);
  if (!resEl) return;

  if (e.key === 'Escape') {
    resEl.style.display = 'none';
    resEl.innerHTML = '';
    e.preventDefault();
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const primerItem = resEl.querySelector('.res-asoc-item');
    if (primerItem) primerItem.click();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const items = resEl.querySelectorAll('div[onclick]');
    if (items.length) items[0].focus();
  }
}
