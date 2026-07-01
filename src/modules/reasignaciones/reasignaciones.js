import { DB, currentUser } from '@shared/state.js';
import { $, avatarEl, badge } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { construirMenu } from '@shared/nav.js';

// ========== TABS ==========

export function tabReas(tab, btn) {
  document.querySelectorAll('#screen-reasignaciones .tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#screen-reasignaciones .tab-btn').forEach(b => b.classList.remove('active'));
  $('reas-tab-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');
  renderReasignaciones();
}

// ========== RENDER ==========

export function renderReasignaciones() {
  const pend = DB.reasignaciones.filter(r => r.estado === 'Pendiente');
  const hoy = new Date();
  const esteMes = DB.reasignaciones.filter(r => r.estado === 'Aprobado' && r.fecha.includes(String(hoy.getFullYear())));
  $('st-reas-pend').textContent = pend.length;
  $('st-reas-aprobadas').textContent = esteMes.length;
  $('st-reas-total').textContent = DB.reasignaciones.length;

  // Asociados con 3+ movimientos
  const movsPorAsoc = {};
  DB.reasignaciones.forEach(r => { movsPorAsoc[r.nro] = (movsPorAsoc[r.nro] || 0) + 1; });
  $('st-reas-rotativos').textContent = Object.values(movsPorAsoc).filter(v => v >= 3).length;

  renderReasPend(pend);
  renderReasHist(DB.reasignaciones);
  renderRotacion();
  poblarSelectsReas();
}

export function renderReasPend(lista) {
  const tbody = $('tbody-reas-pend'); if (!tbody) return;
  const rows = lista || DB.reasignaciones.filter(r => r.estado === 'Pendiente');
  tbody.innerHTML = rows.map((r, i) => {
    const impactoSeguro = r.altura === 'Sí — agregar cobertura adicional' || r.poliza === 'Sí — actualizar póliza';
    return `<tr>
      <td style="font-weight:500;">${r.asociado}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${r.nro}</td>
      <td style="font-size:12px;">${r.servOrig}<div style="font-size:10px;color:var(--texto-muy-suave);">${r.supOrig}</div></td>
      <td style="font-size:12px;">${r.supOrig}</td>
      <td style="font-size:12px;font-weight:500;color:var(--azul);">${r.servDest}<div style="font-size:10px;color:var(--texto-muy-suave);">${r.supDest}</div></td>
      <td style="font-size:12px;">${r.supDest}</td>
      <td><span class="chip" style="font-size:10px;">${r.motivo}</span></td>
      <td style="font-size:12px;color:var(--texto-suave);">${r.fecha}</td>
      <td style="font-size:12px;">${r.solicitante}</td>
      <td style="text-align:center;">${impactoSeguro ? '<span class="badge badge-naranja" style="font-size:10px;">⚠️ Revisar</span>' : '<span class="badge badge-verde" style="font-size:10px;">Sin cambios</span>'}</td>
      <td>${badge('Pendiente')}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-xs" style="background:var(--verde-claro);color:var(--verde);border:1px solid #9fdaba;" onclick="aprobarReasignacion(${i})">✓ Aprobar</button>
          <button class="btn btn-xs" style="background:var(--rojo-suave);color:var(--rojo);border:1px solid #f5c6c0;" onclick="rechazarReasignacion(${i})">✕</button>
          <button class="btn btn-xs btn-secondary" onclick="verDetalleReas(${i})">Ver</button>
        </div>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="12"><div class="empty-state"><div class="icon">✅</div><p>Sin reasignaciones pendientes</p></div></td></tr>`;
}

export function renderReasHist(lista) {
  const tbody = $('tbody-reas-hist'); if (!tbody) return;
  const rows = lista || DB.reasignaciones;
  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td style="font-weight:500;">${r.asociado}</td>
    <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--azul);">${r.nro}</td>
    <td style="font-size:12px;">${r.servOrig}</td>
    <td style="font-size:12px;font-weight:500;color:var(--azul);">${r.servDest}</td>
    <td><span class="chip" style="font-size:10px;">${r.motivo}</span></td>
    <td style="font-size:12px;color:var(--texto-suave);">${r.fecha}</td>
    <td style="font-size:12px;">${r.solicitante}</td>
    <td style="font-size:12px;">${r.aprobadoPor || '—'}</td>
    <td>${badge(r.estado === 'Aprobado' ? 'Activo' : r.estado === 'Rechazado' ? 'Baja' : 'Pendiente')}<span style="font-size:10px;display:block;">${r.estado}</span></td>
    <td><button class="btn btn-secondary btn-xs" onclick="verDetalleReas(${i})">Ver</button></td>
  </tr>`).join('') || `<tr><td colspan="10"><div class="empty-state"><div class="icon">🔄</div><p>Sin reasignaciones registradas</p></div></td></tr>`;
}

export function renderRotacion() {
  const el = $('grilla-rotacion'); if (!el) return;
  const movsPorAsoc = {};
  DB.reasignaciones.forEach(r => {
    if (!movsPorAsoc[r.nro]) movsPorAsoc[r.nro] = { nro: r.nro, nombre: r.asociado, movs: [] };
    movsPorAsoc[r.nro].movs.push(r);
  });
  DB.legajos.forEach(l => {
    if (!movsPorAsoc[l.nro]) {
      movsPorAsoc[l.nro] = {
        nro: l.nro, nombre: l.nombre, movs: [{
          id: 'inicial', servOrig: 'Alta', supOrig: '—', servDest: l.servicio, supDest: l.supervisor,
          motivo: 'Ingreso', fecha: l.ingreso, estado: 'Aprobado', desc: 'Alta como asociado',
        }],
      };
    } else {
      movsPorAsoc[l.nro].movs.unshift({
        id: 'inicial', servOrig: 'Alta', supOrig: '—', servDest: l.servicio, supDest: l.supervisor,
        motivo: 'Ingreso', fecha: l.ingreso, estado: 'Aprobado', desc: 'Alta como asociado',
      });
    }
  });

  const lista = Object.values(movsPorAsoc).sort((a, b) => b.movs.length - a.movs.length);
  const leg = nro => DB.legajos.find(l => l.nro === nro) || {};

  el.innerHTML = lista.map(a => {
    const l = leg(a.nro);
    const movs = a.movs.sort((x, y) => {
      const fx = x.fecha ? new Date(x.fecha.split('/').reverse().join('-')) : new Date(0);
      const fy = y.fecha ? new Date(y.fecha.split('/').reverse().join('-')) : new Date(0);
      return fx - fy;
    });
    const cantMovs = movs.filter(m => m.id !== 'inicial').length;
    const riesgoRotacion = cantMovs >= 3 ? 'badge-rojo' : cantMovs >= 2 ? 'badge-acento' : cantMovs >= 1 ? 'badge-azul' : 'badge-gris';
    const servicioActual = movs[movs.length - 1]?.servDest || l.servicio || '—';

    return `
      <div onclick="verDetalleRotacion(${a.nro})"
        style="background:white;border:1px solid var(--borde);border-radius:var(--radio-lg);overflow:hidden;cursor:pointer;transition:box-shadow .15s;"
        onmouseover="this.style.boxShadow='0 2px 12px rgba(0,0,0,.08)'"
        onmouseout="this.style.boxShadow='none'">
        <div style="padding:14px 18px;display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            ${avatarEl(a.nombre, 36)}
            <div>
              <div style="font-weight:600;font-size:14px;">${a.nombre}</div>
              <div style="font-size:12px;color:var(--texto-suave);">N°${a.nro} · ${l.funcion || '—'} · ${servicioActual}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge ${riesgoRotacion}">${cantMovs} movimiento${cantMovs !== 1 ? 's' : ''}</span>
            <span style="font-size:18px;color:var(--borde-fuerte);">›</span>
          </div>
        </div>
      </div>`;
  }).join('') || `<div class="empty-state"><div class="icon">🔄</div><p>Sin movimientos registrados</p></div>`;
}

export function verDetalleRotacion(nro) {
  const movsPorAsoc = {};
  DB.reasignaciones.forEach(r => {
    if (!movsPorAsoc[r.nro]) movsPorAsoc[r.nro] = { nro: r.nro, nombre: r.asociado, movs: [] };
    movsPorAsoc[r.nro].movs.push(r);
  });
  DB.legajos.forEach(l => {
    if (!movsPorAsoc[l.nro]) {
      movsPorAsoc[l.nro] = {
        nro: l.nro, nombre: l.nombre, movs: [{
          id: 'inicial', servOrig: 'Alta', supOrig: '—', servDest: l.servicio, supDest: l.supervisor,
          motivo: 'Ingreso', fecha: l.ingreso, estado: 'Aprobado', desc: 'Alta como asociado',
        }],
      };
    } else {
      movsPorAsoc[l.nro].movs.unshift({
        id: 'inicial', servOrig: 'Alta', supOrig: '—', servDest: l.servicio, supDest: l.supervisor,
        motivo: 'Ingreso', fecha: l.ingreso, estado: 'Aprobado', desc: 'Alta como asociado',
      });
    }
  });

  const a = movsPorAsoc[nro]; if (!a) return;
  const l = DB.legajos.find(x => x.nro === nro) || {};
  const movs = a.movs.sort((x, y) => {
    const fx = x.fecha ? new Date(x.fecha.split('/').reverse().join('-')) : new Date(0);
    const fy = y.fecha ? new Date(y.fecha.split('/').reverse().join('-')) : new Date(0);
    return fx - fy;
  });
  const cantMovs = movs.filter(m => m.id !== 'inicial').length;
  const servicioActual = movs[movs.length - 1]?.servDest || l.servicio || '—';

  // Poblar modal de detalle
  const el = $('reas-detalle-body'); if (!el) return;

  $('reas-detalle-titulo').textContent = a.nombre;
  $('reas-detalle-sub').textContent = `N°${nro} · ${l.funcion || '—'} · Servicio actual: ${servicioActual}`;

  // Timeline de servicios
  el.innerHTML = `
    <!-- Línea de tiempo visual -->
    <div style="overflow-x:auto;padding:16px 0;margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:0;min-width:max-content;padding:0 8px;">
        ${movs.map((m, i) => `
                color:${m.id === 'inicial' || m.estado === 'Aprobado' ? 'white' : 'var(--texto-suave)'};
                border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;">
                ${m.servDest || '—'}
            ${i < movs.length - 1 ? `<div style="width:48px;height:2px;background:var(--borde);position:relative;margin:0 4px;flex-shrink:0;">
              <span style="position:absolute;top:-9px;left:16px;font-size:16px;color:var(--texto-suave);">→</span>
            </div>` : ''}
          </div>`).join('')}
      </div>
    </div>
    <!-- Tabla detallada -->
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#374151;color:white;">
        <th style="padding:7px 12px;border:1px solid #6b7280;text-align:left;">Servicio destino</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;">Supervisor</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;">Motivo</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;">Fecha</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;text-align:center;">Estado</th>
        <th style="padding:7px 8px;border:1px solid #6b7280;">Descripción</th>
      </tr></thead>
      <tbody>
        ${movs.map(m => `<tr>
              ${m.id === 'inicial' ? 'Ingreso' : m.estado || '—'}
        </tr>`).join('')}
      </tbody>
    </table>
    `;

  abrirModal('modal-reas-detalle');
}

// ========== FILTROS ==========

export function filtrarReas() {
  const nom = ($('cf-rn-nombre') || { value: '' }).value.toLowerCase();
  const orig = ($('cf-rn-orig') || { value: '' }).value.toLowerCase();
  const dest = ($('cf-rn-dest') || { value: '' }).value.toLowerCase();
  const mot = ($('cf-rn-motivo') || { value: '' }).value;
  const bg = ($('buscar-reas') || { value: '' }).value.toLowerCase();
  renderReasPend(DB.reasignaciones.filter(r => r.estado === 'Pendiente').filter(r =>
    (!nom || r.asociado.toLowerCase().includes(nom)) &&
    (!orig || r.servOrig.toLowerCase().includes(orig)) &&
    (!dest || r.servDest.toLowerCase().includes(dest)) &&
    (!mot || r.motivo === mot) &&
    (!bg || r.asociado.toLowerCase().includes(bg) || r.servOrig.toLowerCase().includes(bg) || r.servDest.toLowerCase().includes(bg))
  ));
}

export function filtrarReasH() {
  const nom = ($('cf-rh-nombre') || { value: '' }).value.toLowerCase();
  const est = ($('cf-rh-est') || { value: '' }).value;
  const mot = ($('cf-rh-mot2') || { value: '' }).value;
  const bg = ($('buscar-reas-h') || { value: '' }).value.toLowerCase();
  renderReasHist(DB.reasignaciones.filter(r =>
    (!nom || r.asociado.toLowerCase().includes(nom)) &&
    (!est || r.estado === est) &&
    (!mot || r.motivo === mot) &&
    (!bg || r.asociado.toLowerCase().includes(bg) || r.servOrig.toLowerCase().includes(bg) || r.servDest.toLowerCase().includes(bg))
  ));
}

export function filtrarRotacion() {
  const busq = ($('buscar-rot') || { value: '' }).value.toLowerCase();
  // Re-render con filtro (simplificado — en producción filtrar la grilla)
  renderRotacion();
}

// ========== SELECTS ==========

export function poblarSelectsReas() {
  const fS = (id, items) => { const el = $(id); if (!el) return; const ph = el.options[0]?.outerHTML || ''; el.innerHTML = ph + [...new Set(items)].filter(Boolean).map(i => `<option>${i}</option>`).join(''); };
  const fDL = (id, items) => { const el = $(id); if (el) el.innerHTML = items.map(i => `<option value="${i}">`).join(''); };
  // Motivos desde DB.motivosReasignacion (configurables)
  fS('reas-motivo', DB.motivosReasignacion);
  fS('cf-reas-motivo', DB.motivosReasignacion);
  fS('cf-rn-motivo', DB.motivosReasignacion);
  fS('cf-rh-motivo', DB.motivosReasignacion);
  fS('cf-rh-mot2', DB.motivosReasignacion);
  fS('cf-reas-sup', DB.supervisores);
  fS('reas-sup-dest', DB.supervisores);
  // Pedidos pendientes para vincular
  const pedidosPend = (DB.pedidos || []).filter(p => p.estado === 'Pendiente' || p.estado === 'En búsqueda');
  fS('reas-pedido-vinculado', pedidosPend.map(p => `${p.servicio} — ${p.puesto || ''} (${p.supervisor})`));
  fDL('dl-asoc-reas', DB.legajos.map(l => `${l.nombre} (N°${l.nro})`));
  fDL('dl-serv-reas', DB.servicios);
  // Aprobadores en el modal — lista visual
  const aprobEl = $('lista-aprobadores-req');
  if (aprobEl) aprobEl.innerHTML = DB.aprobadoresReas.map(a => `
    <div style="display:flex;align-items:center;gap:6px;background:white;border-radius:var(--radio);padding:5px 12px;border:1px solid var(--azul-claro);">
      <span>🔐</span><span style="font-size:13px;font-weight:500;color:var(--azul-oscuro);">${a}</span>
    </div>`).join('') || '<span style="font-size:12px;color:rgba(0,0,0,.4);">Sin aprobadores configurados</span>';
  // Renderizar listas de config
  renderConfigMotivosReas();
  renderConfigAprobadoresReas();
}

export function autocompletarReas() {
  const val = ($('reas-asociado') || { value: '' }).value;
  const m = val.match(/N°(\d+)/);
  if (!m) return;
  const leg = DB.legajos.find(l => String(l.nro) === m[1]);
  if (leg) {
    if ($('reas-nro')) $('reas-nro').value = leg.nro;
    if ($('reas-serv-orig')) $('reas-serv-orig').value = leg.servicio;
    if ($('reas-sup-orig')) $('reas-sup-orig').value = leg.supervisor;
    if ($('reas-categoria')) $('reas-categoria').value = leg.funcion;
    // Limpiar sugerencias anteriores al cambiar de asociado
    const ia = $('ia-sugerencias'); if (ia) { ia.style.display = 'none'; ia.innerHTML = ''; }
    const btn = $('btn-sugerir-ia'); if (btn) { btn.textContent = '🤖 Sugerir servicios destino'; btn.disabled = false; }
  }
}

// ========== ALTA / APROBACIÓN ==========

export function guardarReasignacion(estado) {
  const asoc = ($('reas-asociado') || { value: '' }).value.trim();
  const motivo = ($('reas-motivo') || { value: '' }).value;
  const dest = ($('reas-serv-dest') || { value: '' }).value.trim();
  if (!asoc || !motivo || !dest) { toast('Completá asociado, motivo y servicio destino'); return; }
  const nro = parseInt(($('reas-nro') || { value: '0' }).value) || 0;
  const fechaVal = ($('reas-fecha') || { value: '' }).value;
  const fecha = fechaVal ? new Date(fechaVal).toLocaleDateString('es-AR') : new Date().toLocaleDateString('es-AR');
  const nueva = {
    id: Date.now(), nro,
    asociado: asoc.split('(')[0].trim(),
    servOrig: ($('reas-serv-orig') || { value: '—' }).value,
    supOrig: ($('reas-sup-orig') || { value: '—' }).value,
    servDest: dest,
    supDest: ($('reas-sup-dest') || { value: '—' }).value,
    motivo, fecha,
    solicitante: ($('reas-solicitante') || { value: 'Coordinador de Operaciones (Santiago Ayala)' }).value,
    aprobadoresReq: [...DB.aprobadoresReas],
    pedidoVinculado: ($('reas-pedido-vinculado') || { value: '' }).value,
    aprobadoPor: '',
    desc: ($('reas-desc') || { value: '' }).value,
    altura: ($('reas-altura') || { value: 'No' }).value,
    poliza: ($('reas-poliza') || { value: 'No' }).value,
    estado,
    notifAsoc: ($('reas-notif-asoc') || { checked: true }).checked,
    notifSupSal: ($('reas-notif-sup-sal') || { checked: true }).checked,
    notifSupEnt: ($('reas-notif-sup-ent') || { checked: true }).checked,
    notifAprob: ($('reas-notif-aprob') || { checked: true }).checked,
  };
  DB.reasignaciones.push(nueva);
  const msgs = [];
  if (nueva.notifAsoc) msgs.push(nueva.asociado);
  if (nueva.notifSupSal && nueva.supOrig !== '—') msgs.push(nueva.supOrig);
  if (nueva.notifSupEnt && nueva.supDest !== '—') msgs.push(nueva.supDest);
  if (nueva.notifAprob) msgs.push(...DB.aprobadoresReas);
  cerrarModal('modal-reasignacion');
  construirMenu(); supaSync('reasignaciones', DB.reasignaciones[DB.reasignaciones.length - 1]); renderReasignaciones();
  toast(`✓ Reasignación elevada${msgs.length ? ` — Notificando a: ${msgs.join(', ')}` : ''}`);
}

export function puedeAprobarReasignacion() {
  if (!currentUser) return false;
  if (currentUser.perfil === 'Administrador total') return true;
  // Verificar por perfil del sistema
  const perfilOk = DB.aprobadoresReas.some(a => {
    const al = a.toLowerCase();
    const pl = (currentUser.perfil || '').toLowerCase();
    return (al.includes('operaciones') && pl.includes('operacion')) ||
           (al.includes('rrhh') && pl.includes('rrhh')) ||
           (al.includes('administrador') && pl.includes('administrador'));
  });
  if (perfilOk) return true;
  // Verificar por función en la organización
  const funcionOk = DB.aprobadoresReas.some(a =>
    a === currentUser.funcion
  );
  return funcionOk;
}

export function aprobarReasignacion(idx) {
  if (!puedeAprobarReasignacion()) {
    const autorizados = DB.aprobadoresReas.join(' y ');
    toast(`⛔ Solo pueden aprobar: ${autorizados}`); return;
  }
  const pendientes = DB.reasignaciones.filter(r => r.estado === 'Pendiente');
  const r = pendientes[idx]; if (!r) return;
  r.estado = 'Aprobado';
  r.aprobadoPor = currentUser?.nombre || 'Administrador';
  r.funcionAprobador = currentUser?.funcion || currentUser?.perfil || '';
  // Actualizar legajo
  const leg = DB.legajos.find(l => l.nro === r.nro);
  if (leg) {
    if (!leg.historialMovimientos) leg.historialMovimientos = [];
    leg.historialMovimientos.push({ fecha: r.fecha, servOrig: r.servOrig, supOrig: r.supOrig, servDest: r.servDest, supDest: r.supDest, motivo: r.motivo, desc: r.desc });
    leg.servicio = r.servDest;
    leg.supervisor = r.supDest;
  }
  // Cubrir pedido vinculado si corresponde
  if (r.pedidoVinculado) {
    const ped = (DB.pedidos || []).find(p => `${p.servicio} — ${p.puesto || ''} (${p.supervisor})` === r.pedidoVinculado);
    if (ped) ped.estado = 'Cubierto';
  }
  construirMenu(); renderReasignaciones();
  if (window.renderLegajos) window.renderLegajos();
  toast(`✓ Aprobado por ${r.aprobadoPor}${r.funcionAprobador ? ' (' + r.funcionAprobador + ')' : ''} — ${r.asociado} → ${r.servDest}. Notificando...`, 5000);
}

export function rechazarReasignacion(idx) {
  if (!puedeAprobarReasignacion()) {
    toast(`⛔ Solo pueden rechazar: ${DB.aprobadoresReas.join(' y ')}`); return;
  }
  const pendientes = DB.reasignaciones.filter(r => r.estado === 'Pendiente');
  const r = pendientes[idx]; if (!r) return;
  r.estado = 'Rechazado';
  r.aprobadoPor = currentUser?.nombre || 'Administrador';
  construirMenu(); renderReasignaciones();
  toast(`Reasignación de ${r.asociado} rechazada por ${r.aprobadoPor}`);
}

export function verDetalleReas(idx) {
  const r = DB.reasignaciones[idx]; if (!r) return;
  const body = `<div class="info-grid" style="margin-bottom:16px;">
    <div class="info-item"><div class="key">Asociado</div><div class="val">${r.asociado} (N°${r.nro})</div></div>
    <div class="info-item"><div class="key">Estado</div><div class="val">${badge(r.estado === 'Aprobado' ? 'Activo' : r.estado === 'Rechazado' ? 'Baja' : 'Pendiente')} ${r.estado}</div></div>
    <div class="info-item"><div class="key">Origen</div><div class="val">${r.servOrig} · ${r.supOrig}</div></div>
    <div class="info-item"><div class="key">Destino</div><div class="val" style="font-weight:600;color:var(--azul);">${r.servDest} · ${r.supDest}</div></div>
    <div class="info-item"><div class="key">Motivo</div><div class="val">${r.motivo}</div></div>
    <div class="info-item"><div class="key">Fecha efectiva</div><div class="val">${r.fecha}</div></div>
    <div class="info-item"><div class="key">Solicitado por</div><div class="val">${r.solicitante}</div></div>
    <div class="info-item"><div class="key">Aprobado por</div><div class="val">${r.aprobadoPor || 'Pendiente'}</div></div>
  </div>
  <div class="form-section" style="margin-bottom:8px;">Descripción</div>
  <p style="font-size:13px;color:var(--texto-suave);">${r.desc || 'Sin descripción'}</p>
  ${r.altura !== 'No' || r.poliza !== 'No' ? `<div class="alerta alerta-warn" style="margin-top:12px;font-size:12px;"><strong>⚠️ Impacto en seguros:</strong> ${[r.altura !== 'No' ? r.altura : '', r.poliza !== 'No' ? r.poliza : ''].filter(Boolean).join(' · ')}</div>` : ''}`;
  $('pedido-title').textContent = `🔄 Reasignación — ${r.asociado}`;
  $('pedido-body').innerHTML = body;
  abrirModal('modal-ver-pedido');
}

export function abrirModalReasDesde(nro) {
  const leg = DB.legajos.find(l => l.nro === nro);
  if (!leg) return;
  poblarSelectsReas();
  if ($('reas-asociado')) $('reas-asociado').value = `${leg.nombre} (N°${leg.nro})`;
  if ($('reas-nro')) $('reas-nro').value = leg.nro;
  if ($('reas-serv-orig')) $('reas-serv-orig').value = leg.servicio;
  if ($('reas-sup-orig')) $('reas-sup-orig').value = leg.supervisor;
  abrirModal('modal-reasignacion');
}

// ========== CONFIGURACIÓN REASIGNACIONES ==========

export function renderConfigMotivosReas() {
  const el = $('lista-motivos-reas'); if (!el) return;
  el.innerHTML = DB.motivosReasignacion.map((m, i) => `
    <div class="config-item">
      <span style="font-size:13px;">${m}</span>
      <button class="btn btn-danger btn-xs" onclick="eliminarMotivoReas(${i})">Eliminar</button>
    </div>`).join('');
}
export function agregarMotivoReas() {
  const val = ($('nuevo-motivo-reas') || { value: '' }).value.trim();
  if (!val) { toast('Ingresá el motivo'); return; }
  if (DB.motivosReasignacion.includes(val)) { toast('Ya existe'); return; }
  DB.motivosReasignacion.push(val);
  $('nuevo-motivo-reas').value = '';
  renderConfigMotivosReas();
  poblarSelectsReas();
  toast(`✓ Motivo "${val}" agregado`);
}
export function eliminarMotivoReas(idx) {
  DB.motivosReasignacion.splice(idx, 1);
  renderConfigMotivosReas();
  poblarSelectsReas();
}

export function renderConfigAprobadoresReas() {
  const el = $('lista-aprobadores-reas'); if (!el) return;
  el.innerHTML = DB.aprobadoresReas.map((a, i) => `
    <div class="config-item">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">🔐</span>
        <span style="font-size:13px;font-weight:500;">${a}</span>
      </div>
      <button class="btn btn-danger btn-xs" onclick="eliminarAprobadorReas(${i})">Eliminar</button>
    </div>`).join('') || '<p class="text-muted" style="font-size:12px;">Sin aprobadores configurados — nadie puede aprobar reasignaciones.</p>';
}
export function agregarAprobadorReas() {
  const val = ($('nuevo-aprobador-reas') || { value: '' }).value;
  if (!val) { toast('Seleccioná un perfil'); return; }
  if (DB.aprobadoresReas.includes(val)) { toast('Ya está en la lista'); return; }
  DB.aprobadoresReas.push(val);
  $('nuevo-aprobador-reas').value = '';
  renderConfigAprobadoresReas();
  toast(`✓ "${val}" agregado como aprobador`);
}
export function eliminarAprobadorReas(idx) {
  DB.aprobadoresReas.splice(idx, 1);
  renderConfigAprobadoresReas();
}

// ========== SUGERIDOR IA — PUNTO 3 ==========

export function sugerirServiciosIA() {
  const nroVal = ($('reas-nro') || { value: '' }).value;
  const nro = parseInt(nroVal) || 0;
  const leg = DB.legajos.find(l => l.nro === nro);
  const btn = $('btn-sugerir-ia');
  const container = $('ia-sugerencias');
  if (!container) return;

  if (!leg) { toast('Seleccioná primero un asociado para obtener sugerencias'); return; }

  if (btn) { btn.textContent = '🤖 Analizando...'; btn.disabled = true; }

  // Simular análisis IA (en producción: Claude API)
  setTimeout(() => {
    const servOrig = ($('reas-serv-orig') || { value: '' }).value;

    // 1. Pedidos de personal pendientes — los que más necesitan personal
    const pedidosPend = DB.pedidos.filter(p => p.estado === 'Pendiente' || p.estado === 'En búsqueda');

    // 2. Calcular score de compatibilidad para cada pedido
    const sugerencias = pedidosPend.map(p => {
      let score = 0; const razones = [];

      // Categoría compatible
      const catAsoc = (leg.funcion || '').toLowerCase();
      const catPed = (p.puesto || '').toLowerCase();
      if (catAsoc.includes('operario') && catPed.includes('operario')) { score += 30; razones.push('✅ Categoría compatible'); }
      else if (catAsoc.includes('referente') && (catPed.includes('referente') || catPed.includes('operario'))) { score += 25; razones.push('✅ Puede cubrir el puesto'); }
      else if (catAsoc.includes('encargado')) { score += 20; razones.push('✅ Categoría igual o superior'); }

      // Zona compatible
      const zonaAsoc = (leg.localidad || '').toLowerCase();
      const zonaPed = (p.zona || '').toLowerCase();
      if (zonaAsoc.includes('caba') && zonaPed === 'caba') { score += 25; razones.push('📍 Misma zona (CABA)'); }
      else if (zonaAsoc && zonaPed && zonaAsoc.includes(zonaPed.substring(0, 4))) { score += 15; razones.push('📍 Zona cercana'); }

      // Urgencia
      if (p.urgencia === 'Alto') { score += 20; razones.push('⚡ Pedido urgente'); }
      else if (p.urgencia === 'Medio') { score += 10; }

      // No es el mismo servicio
      if (p.servicio !== servOrig) { score += 10; }

      // Capacitaciones del asociado en ese tipo de servicio
      const capsAsoc = (DB.capacitaciones || []).filter(c => c.nroSocio === String(leg.nro));
      if (capsAsoc.length > 0) { score += 5 * Math.min(capsAsoc.length, 3); razones.push(`🎓 ${capsAsoc.length} cap. realizadas`); }

      return { ...p, score, razones, supervisor: p.supervisor };
    }).filter(s => s.score > 20).sort((a, b) => b.score - a.score).slice(0, 4);

    if (!sugerencias.length) {
      container.innerHTML = `<div style="color:rgba(255,255,255,.7);font-size:12px;">No se encontraron pedidos pendientes compatibles. Podés asignar manualmente el servicio destino.</div>`;
    } else {
      container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
          ${sugerencias.map((s, i) => `
                 onclick="seleccionarSugerenciaIA('${s.servicio}','${s.supervisor}')"
                 onmouseover="this.style.borderColor='var(--acento)'" onmouseout="this.style.borderColor='transparent'">
                ${s.razones.map(r => `<span style="font-size:10px;background:rgba(255,255,255,.15);padding:1px 6px;border-radius:10px;">${r}</span>`).join('')}
            </div>`).join('')}
        </div>
        <div style="font-size:11px;opacity:.6;margin-top:8px;">Hacé click en una sugerencia para seleccionarla. Podés modificarla luego.</div>`;
    }

    container.style.display = 'block';
    if (btn) { btn.textContent = '🤖 Actualizar sugerencias'; btn.disabled = false; }
  }, 1200);
}

export function seleccionarSugerenciaIA(servicio, supervisor) {
  const inp = $('reas-serv-dest');
  const sel = $('reas-sup-dest');
  if (inp) inp.value = servicio;
  // Seleccionar el supervisor correspondiente en el select
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === supervisor || sel.options[i].text === supervisor) {
        sel.selectedIndex = i; break;
      }
    }
  }
  toast(`✓ Servicio "${servicio}" seleccionado como destino`);
}
