import { DB } from '@shared/state.js';
import { $, avatarEl, badge, fillSelect } from '@shared/helpers.js';
import { toast, abrirModal, cerrarModal } from '@shared/ui.js';
import { supaSync } from '@shared/supabase.js';
import { listarAdjuntos, obtenerUrlFirmada, TIPO_LEGIBLE } from '@shared/adjuntos.js';
import { calcularEstadoVencimiento } from '../documentacion/documentacion.js';

// Busca, para un DNI, la documentación de ingreso más reciente que tenga
// vencimiento de antecedentes cargado (puede no haber ninguna si el legajo
// se importó por CSV o es muy viejo).
function _antecedentesDelLegajo(dni) {
  const docs = (DB.documentacionIngreso || []).filter(d => d.dni === dni && d.antecVencimiento);
  return docs.length ? docs[docs.length - 1] : null;
}

// ========== ESTADO INTERNO ==========

let legajoActualNro = null;

// ========== HELPER — PERÍODO DE PRUEBA ==========

export function calcularPrueba(l) {
  const ingreso = new Date(l.fechaIngresoPrueba);
  const hoy = new Date();
  const diasTotales = l.periodoPrueba * 30;
  const diasPasados = Math.floor((hoy - ingreso) / (1000 * 60 * 60 * 24));
  const pct = Math.min(100, Math.round(diasPasados / diasTotales * 100));
  const enPrueba = diasPasados < diasTotales;
  return { pct, diasPasados, diasTotales, enPrueba };
}

// ========== RENDER TABLA ==========

export function renderLegajos(lista) {
  const rows = lista || DB.legajos;
  const tbody = $('tbody-legajos');
  if (!tbody) return;
  tbody.innerHTML = rows.map(l => {
    const pr = calcularPrueba(l);
    const pruebaEl = pr.enPrueba
      ? `<div class="prueba-bar"><div style="font-size:11px;font-weight:500;color:${pr.pct > 80 ? 'var(--rojo)' : pr.pct > 50 ? 'var(--naranja)' : 'var(--azul)'};">Día ${pr.diasPasados}/${pr.diasTotales}</div><div class="prueba-bar-track"><div class="prueba-bar-fill${pr.pct > 80 ? ' danger' : pr.pct > 50 ? ' warn' : ''}" style="width:${pr.pct}%;"></div></div></div>`
      : `<span class="badge badge-verde">Completado</span>`;
    const adjLegal = l.adjuntosLegal && l.adjuntosLegal.length ? `<span class="chip">📎 ${l.adjuntosLegal.length}</span>` : '';
    const docAntec = _antecedentesDelLegajo(l.dni);
    const estAntec = docAntec ? calcularEstadoVencimiento(docAntec.antecVencimiento) : null;
    const antecEl = estAntec
      ? `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:${estAntec.bg};color:${estAntec.color};">${estAntec.texto}</span>`
      : '<span class="text-muted">—</span>';
    return `<tr onclick="verLegajo(${l.nro})">
      <td style="font-family:'DM Mono',monospace;font-weight:700;color:var(--azul);">${l.nro}</td>
      <td><div style="display:flex;align-items:center;gap:10px;">${avatarEl(l.nombre)}<div style="font-weight:500;">${l.nombre}</div></div></td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;">${l.dni}</td>
      <td><span class="chip">${l.funcion}</span></td>
      <td style="font-size:12px;">${l.servicio}</td>
      <td style="font-size:12px;">${l.supervisor}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${l.ingreso}</td>
      <td>${pruebaEl}</td>
      <td>${badge(l.estado)}</td>
      <td>${l.estadoLegal ? badge(l.estadoLegal) + '<br>' + adjLegal : '<span class="text-muted">—</span>'}</td>
      <td>${antecEl}</td>
      <td style="font-size:12px;color:var(--texto-suave);">${l.fechaBaja || '—'}</td>
      <td style="font-size:12px;color:${l.fechaReincorp ? 'var(--verde)' : 'var(--texto-muy-suave)'};">${l.fechaReincorp || '—'}</td>
      <td>${l.estadoMedico ? `<span class="badge badge-naranja" style="font-size:10px;">🏥 ${l.estadoMedico.split(' ')[0]}</span>` : ''}${badge(l.seguro === 'Completo' ? 'Completo' : 'Pendiente')}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();verLegajo(${l.nro})">Ver legajo</button></td>
    </tr>`;
  }).join('');
}

// ========== FILTROS ==========

export function filtrarLegajos() {
  const nro = ($('cf-leg-nro') || { value: '' }).value.toLowerCase();
  const nombre = ($('cf-leg-nombre') || { value: '' }).value.toLowerCase();
  const dni = ($('cf-dni') || { value: '' }).value.toLowerCase();
  const funcion = ($('cf-funcion') || { value: '' }).value;
  const serv = ($('cf-leg-serv') || { value: '' }).value.toLowerCase();
  const sup = ($('cf-leg-sup') || { value: '' }).value.toLowerCase();
  const ingreso = ($('cf-leg-ingreso') || { value: '' }).value.toLowerCase();
  const estado = ($('cf-estado') || { value: '' }).value;
  const estLegal = ($('cf-estado-legal') || { value: '' }).value;
  const baja = ($('cf-leg-baja') || { value: '' }).value.toLowerCase();
  const reincorp = ($('cf-leg-reincorp') || { value: '' }).value.toLowerCase();
  const seguro = ($('cf-leg-seguro') || { value: '' }).value;
  const bg = ($('buscador-global') || { value: '' }).value.toLowerCase();
  const busq = nombre || bg;
  const prueba = ($('cf-leg-prueba') || { value: '' }).value;

  renderLegajos(DB.legajos.filter(l => {
    const pr = calcularPrueba(l);
    return (
      (!nro || String(l.nro).includes(nro)) &&
      (!busq || l.nombre.toLowerCase().includes(busq) || l.dni.includes(busq) || String(l.nro).includes(busq)) &&
      (!dni || l.dni.includes(dni)) &&
      (!funcion || l.funcion.toLowerCase().includes(funcion.toLowerCase())) &&
      (!serv || l.servicio.toLowerCase().includes(serv)) &&
      (!sup || l.supervisor.toLowerCase().includes(sup)) &&
      (!ingreso || l.ingreso.includes(ingreso)) &&
      (!prueba || (prueba === 'en' ? pr.enPrueba : !pr.enPrueba)) &&
      (!estado || l.estado === estado) &&
      (!estLegal || l.estadoLegal === estLegal) &&
      (!baja || (l.fechaBaja || '').includes(baja)) &&
      (!reincorp || (l.fechaReincorp || '').includes(reincorp)) &&
      (!seguro || l.seguro === seguro)
    );
  }));
}

// ========== VER DETALLE ==========

export function verLegajo(nro) {
  legajoActualNro = nro;
  const l = DB.legajos.find(x => x.nro === nro);
  if (!l) return;
  const pr = calcularPrueba(l);
  $('legajo-title').textContent = `Legajo N° ${l.nro} — ${l.nombre}`;

  // Campos actualizados a los nombres nuevos de la reescritura de
  // Reasignaciones (nroSocio/servicioOrigen/etc. en vez de nro/servOrig/etc.,
  // y 'Aprobada ejecutada' en vez de 'Aprobado') — quedaron desactualizados
  // acá cuando se reescribió ese módulo.
  const reasDelAsoc = (DB.reasignaciones || []).filter(r => String(r.nroSocio) === String(l.nro) && r.estado === 'Aprobada ejecutada');
  const capsDelAsoc = (DB.capacitaciones || []).filter(c => !c.anulado && String(c.legajoIdLocal) === String(l.nro))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  $('legajo-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
      ${avatarEl(l.nombre, 56)}
      <div><div style="font-size:17px;font-weight:600;">${l.nombre}</div>
      <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap;">${badge(l.estado)}<span class="chip">${l.funcion}</span>${l.estadoLegal ? badge(l.estadoLegal) : ''}<span class="chip">N° ${l.nro}</span></div></div>
    </div>
    ${pr.enPrueba ? `<div class="alerta alerta-warn" style="margin-bottom:14px;"><strong>Período de prueba:</strong> Día ${pr.diasPasados} de ${pr.diasTotales} (${pr.pct}% completado — ${pr.diasTotales - pr.diasPasados} días restantes)</div>` : ''}
    ${l.estadoLegal ? `<div class="alerta alerta-danger" style="margin-bottom:14px;"><strong>⚖️ Situación legal activa:</strong> ${l.estadoLegal}</div>` : ''}
    <div class="tabs">
      <button class="tab-btn active" onclick="tabLeg(0,this)">Datos personales</button>
      <button class="tab-btn" onclick="tabLeg(1,this)">Operativo</button>
      <button class="tab-btn" onclick="tabLeg(2,this)">Movimientos ${reasDelAsoc.length > 0 ? `<span class="badge badge-azul" style="font-size:10px;margin-left:4px;">${reasDelAsoc.length}</span>` : ''}</button>
      <button class="tab-btn" onclick="tabLeg(3,this)">Historial completo</button>
      <button class="tab-btn" onclick="tabLeg(4,this)">📎 Adjuntos</button>
      <button class="tab-btn" onclick="tabLeg(5,this)">🎓 Capacitaciones</button>
    </div>
    <div id="leg-tab-0" class="tab-content active"><div class="info-grid">
      <div class="info-item"><div class="key">DNI</div><div class="val">${l.dni}</div></div>
      <div class="info-item"><div class="key">CUIT</div><div class="val">${l.cuit || '—'}</div></div>
      <div class="info-item"><div class="key">Estado civil</div><div class="val">${l.estadoCivil || '—'}</div></div>
      <div class="info-item"><div class="key">Nacionalidad</div><div class="val">${l.nac || '—'}</div></div>
      <div class="info-item"><div class="key">Localidad</div><div class="val">${l.localidad || '—'}</div></div>
      <div class="info-item"><div class="key">Celular</div><div class="val">${l.tel || '—'}</div></div>
      <div class="info-item"><div class="key">Mail</div><div class="val">${l.mail || '—'}</div></div>
      <div class="info-item"><div class="key">Banco</div><div class="val">${l.banco || '—'}</div></div>
    </div></div>
    <div id="leg-tab-1" class="tab-content"><div class="info-grid">
      <div class="info-item"><div class="key">Función</div><div class="val">${l.funcion}</div></div>
      <div class="info-item"><div class="key">Servicio actual</div><div class="val" style="font-weight:600;color:var(--azul);">${l.servicio}</div></div>
      <div class="info-item"><div class="key">Supervisor</div><div class="val">${l.supervisor}</div></div>
      <div class="info-item"><div class="key">Ingreso</div><div class="val">${l.ingreso}</div></div>
      <div class="info-item"><div class="key">Período prueba</div><div class="val">${l.periodoPrueba} meses</div></div>
      <div class="info-item"><div class="key">Fecha baja</div><div class="val">${l.fechaBaja || '—'}</div></div>
      <div class="info-item"><div class="key">Estado legal</div><div class="val">${l.estadoLegal ? badge(l.estadoLegal) : 'Sin situación legal'}</div></div>
      <div class="info-item"><div class="key">Seguro</div><div class="val">${badge(l.seguro === 'Completo' ? 'Completo' : 'Pendiente')}</div></div>
    </div></div>
    <div id="leg-tab-2" class="tab-content">
      ${reasDelAsoc.length === 0 ? `
        <div class="empty-state"><div class="icon">🔄</div><p>Sin movimientos registrados</p></div>` : `
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${reasDelAsoc.map(r => `
            <div style="background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:12px 14px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                <div>
                  <div style="font-size:13px;font-weight:600;">
                    <span style="color:var(--texto-suave);">${r.servicioOrigen}</span>
                    <span style="margin:0 8px;color:var(--azul);">→</span>
                    <span style="color:var(--azul);">${r.servicioDestino}</span>
                  </div>
                  <div style="font-size:11px;color:var(--texto-suave);margin-top:4px;">${r.supervisorOrigen} → ${r.supervisorDestino}</div>
                  <div style="font-size:11px;color:var(--texto-muy-suave);margin-top:2px;">${r.descripcion || ''}</div>
                </div>
                <div style="text-align:right;">
                  <div><span class="chip" style="font-size:10px;">${r.motivo}</span></div>
                  <div style="font-size:11px;color:var(--texto-muy-suave);margin-top:4px;">${r.fechaEfectiva}</div>
                </div>
              </div>
            </div>`).join('')}
        </div>`}
    </div>
    <div id="leg-tab-3" class="tab-content"><div class="timeline">
      <div class="tl-item"><div class="tl-dot"></div><div class="tl-content"><h4>Alta como asociado</h4><p>${l.ingreso} — ${l.servicio}</p></div></div>
      ${reasDelAsoc.map(r => `<div class="tl-item"><div class="tl-dot" style="background:var(--azul-medio);"></div><div class="tl-content"><h4>Reasignación: ${r.servicioOrigen} → ${r.servicioDestino}</h4><p>${r.fechaEfectiva} · ${r.motivo}</p></div></div>`).join('')}
      ${l.estadoLegal ? `<div class="tl-item"><div class="tl-dot rojo"></div><div class="tl-content"><h4>Situación legal: ${l.estadoLegal}</h4><p>Registrada en el sistema</p></div></div>` : ''}
      ${l.fechaBaja ? `<div class="tl-item"><div class="tl-dot rojo"></div><div class="tl-content"><h4>Baja registrada</h4><p>${l.fechaBaja}</p></div></div>` : ''}
      ${l.fechaReincorp ? `<div class="tl-item"><div class="tl-dot" style="background:var(--verde);"></div><div class="tl-content"><h4>Reincorporación</h4><p>${l.fechaReincorp}${l.legajoAnteriorNro ? ' · Legajo anterior N° ' + l.legajoAnteriorNro : ''}</p></div></div>` : ''}
    </div></div>
    <div id="leg-tab-4" class="tab-content"><div id="leg-adjuntos-lista" style="color:var(--texto-suave);">Cargando…</div></div>
    <div id="leg-tab-5" class="tab-content">
      ${capsDelAsoc.length === 0 ? '<div class="empty-state"><div class="icon">🎓</div><p>Sin capacitaciones registradas</p></div>' : `
        <div class="tabla-wrap"><table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#1e3a8a;color:white;">
            <th style="padding:8px;text-align:left;">Fecha</th>
            <th style="padding:8px;text-align:left;">Tipo</th>
            <th style="padding:8px;text-align:left;">Instructor</th>
            <th style="padding:8px;text-align:center;">Estado</th>
            <th style="padding:8px;text-align:center;">Resultado</th>
            <th style="padding:8px;text-align:center;">Puntaje</th>
          </tr></thead>
          <tbody>${capsDelAsoc.map(c => `<tr>
            <td style="padding:6px 8px;">${(c.fecha || '').split('-').reverse().join('/')}</td>
            <td style="padding:6px 8px;">${c.tipo}</td>
            <td style="padding:6px 8px;">${c.instructor}</td>
            <td style="padding:6px 8px;text-align:center;">${badge(c.estado)}</td>
            <td style="padding:6px 8px;text-align:center;">${c.resultado || '—'}</td>
            <td style="padding:6px 8px;text-align:center;">${c.puntaje != null ? c.puntaje : '—'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`}
    </div>
  `;
  abrirModal('modal-legajo');
  cargarAdjuntosLegajo(l.dni);
}

// ========== ADJUNTOS (todo lo cargado durante el proceso de ingreso) ==========

async function cargarAdjuntosLegajo(dni) {
  const cont = $('leg-adjuntos-lista');
  if (!cont) return;
  const adjuntos = await listarAdjuntos({ dni });
  if (!adjuntos.length) {
    cont.innerHTML = '<div class="empty-state"><div class="icon">📎</div><p>Sin adjuntos cargados</p></div>';
    return;
  }
  cont.innerHTML = adjuntos.map(a => `
    <div style="display:flex;align-items:center;gap:10px;background:var(--fondo);border:1px solid var(--borde);border-radius:var(--radio);padding:10px 14px;margin-bottom:8px;">
      <span class="chip">${TIPO_LEGIBLE[a.tipo] || a.tipo}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">${a.nombreArchivo || 'Archivo'}</span>
      <span style="font-size:11px;color:var(--texto-muy-suave);">${a.subidoEn ? new Date(a.subidoEn).toLocaleDateString('es-AR') : ''}</span>
      <button type="button" class="btn btn-secondary btn-sm" onclick="verAdjuntoLegajo('${a.url}')">👁️ Ver</button>
    </div>
  `).join('');
}

export async function verAdjuntoLegajo(path) {
  const url = await obtenerUrlFirmada(path);
  if (!url) { toast('⚠️ No se pudo abrir el archivo'); return; }
  window.open(url, '_blank');
}

// ========== TABS DETALLE ==========

export function tabLeg(idx, btn) {
  document.querySelectorAll('#legajo-body .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#legajo-body .tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const tab = $('leg-tab-' + idx);
  if (tab) tab.classList.add('active');
}

// ========== EDITAR ==========

// Sectores administrativos hardcodeados (mismo catálogo que hoy vive en
// legacy.js como DB.sectoresAdmin) — reexportado para que src/modules/
// vacaciones/ lo reuse sin duplicar la lista.
export const SECTORES_ADMIN = [
  'Consejo de Administración', 'Coord. General', 'Coord. RRHH',
  'Coord. Operaciones y Planeamiento', 'Coord. Calidad',
  'Coord. Logística y Distribución', 'Coord. Marketing y Ventas',
  'Coord. Administración y Finanzas',
];

// Muestra/oculta la sección de campos de Vacaciones según si el
// servicio cargado es 'ADMINISTRATIVO' (mismo criterio que ya usa el
// resto del proyecto para distinguir administrativos de operarios).
export function toggleSeccionVacacionesLegajo() {
  const servicio = ($('edit-servicio') || { value: '' }).value.trim().toUpperCase();
  const sec = $('edit-admin-vac-section');
  if (sec) sec.style.display = servicio === 'ADMINISTRATIVO' ? 'block' : 'none';
}

export function editarLegajoActual() {
  const l = DB.legajos.find(x => x.nro === legajoActualNro);
  if (!l) return;
  $('editar-legajo-title').textContent = `Editar — ${l.nombre}`;
  const p = l.nombre.split(' ');
  $('edit-apellido').value = p[0] || '';
  $('edit-nombre').value = p.slice(1).join(' ') || '';
  $('edit-dni').value = l.dni;
  $('edit-cuit').value = l.cuit || '';
  $('edit-tel').value = l.tel || '';
  $('edit-mail').value = l.mail || '';
  $('edit-banco').value = l.banco || '';
  $('edit-localidad').value = l.localidad || '';
  $('edit-nac').value = l.nac || '';
  $('edit-servicio').value = l.servicio;
  $('edit-supervisor').value = l.supervisor;
  $('edit-estado').value = l.estado;
  $('edit-calzado').value = l.calzado || '';
  const fechaBajaEl = $('edit-fecha-baja');
  if (fechaBajaEl) fechaBajaEl.value = l.fechaBaja ? l.fechaBaja.split('/').reverse().join('-') : '';
  const estLegalEl = $('edit-estado-legal');
  if (estLegalEl) estLegalEl.value = l.estadoLegal || '';
  fillSelect('edit-funcion', DB.categorias);
  const ef = $('edit-funcion');
  for (let i = 0; i < ef.options.length; i++) {
    if (ef.options[i].text === l.funcion) { ef.selectedIndex = i; break; }
  }
  fillSelect('edit-sector', SECTORES_ADMIN);
  if ($('edit-sector')) $('edit-sector').value = l.sector || '';
  if ($('edit-dias-vac')) $('edit-dias-vac').value = l.diasVacacionesAnuales || 0;
  const jefe = l.jefeDirectoLegajoIdLocal ? DB.legajos.find(x => String(x.nro) === String(l.jefeDirectoLegajoIdLocal)) : null;
  if ($('edit-jefe-directo')) $('edit-jefe-directo').value = jefe ? `${jefe.nombre} (N°${jefe.nro})` : '';
  const dlJefe = $('dl-edit-jefe-directo');
  if (dlJefe) dlJefe.innerHTML = DB.legajos.filter(x => x.estado === 'Activo' && x.nro !== l.nro).map(x => `<option value="${x.nombre} (N°${x.nro})">`).join('');
  toggleSeccionVacacionesLegajo();
  cerrarModal('modal-legajo');
  abrirModal('modal-editar-legajo');
}

export function guardarEdicionLegajo() {
  const l = DB.legajos.find(x => x.nro === legajoActualNro);
  if (!l) return;
  const a = $('edit-apellido').value.trim();
  const n = $('edit-nombre').value.trim();
  if (!a || !n) { toast('Nombre y apellido obligatorios'); return; }
  const dni = $('edit-dni').value.trim();
  if (dni && !/^\d{6,8}$/.test(dni)) {
    toast('⚠️ El DNI debe tener entre 6 y 8 dígitos numéricos');
    $('edit-dni').focus();
    return;
  }
  const dniDuplicado = dni && DB.legajos.some(x => x.dni === dni && x.nro !== legajoActualNro);
  if (dniDuplicado) {
    toast('⚠️ Ya existe un legajo con ese DNI');
    $('edit-dni').focus();
    return;
  }
  l.nombre = `${a} ${n}`;
  l.dni = dni;
  l.cuit = $('edit-cuit').value;
  l.tel = $('edit-tel').value;
  l.mail = $('edit-mail').value;
  l.banco = $('edit-banco').value;
  l.localidad = $('edit-localidad').value;
  l.nac = $('edit-nac').value;
  l.funcion = $('edit-funcion').value;
  l.servicio = $('edit-servicio').value;
  l.supervisor = $('edit-supervisor').value;
  l.estado = $('edit-estado').value;
  l.calzado = parseInt($('edit-calzado').value) || l.calzado;
  l.ambo = $('edit-ambo').value;
  l.seguro = $('edit-seguro').value === 'Completo' ? 'Completo' : 'Pendiente';
  const fb = $('edit-fecha-baja');
  if (fb && fb.value) { l.fechaBaja = new Date(fb.value).toLocaleDateString('es-AR'); }
  const el = $('edit-estado-legal');
  if (el) l.estadoLegal = el.value || '';
  if (l.servicio.trim().toUpperCase() === 'ADMINISTRATIVO') {
    l.sector = ($('edit-sector') || { value: '' }).value || '';
    l.diasVacacionesAnuales = parseInt(($('edit-dias-vac') || { value: 0 }).value) || 0;
    const jefeTexto = ($('edit-jefe-directo') || { value: '' }).value;
    const jefeMatch = jefeTexto.match(/\(N°(\d+)\)\s*$/);
    l.jefeDirectoLegajoIdLocal = jefeMatch ? jefeMatch[1] : '';
  }
  supaSync('legajos', l);
  cerrarModal('modal-editar-legajo');
  renderLegajos();
  toast('✓ Legajo actualizado');
}

// ========== IMPRIMIR ==========

export function imprimirLegajo() {
  const l = DB.legajos.find(x => x.nro === legajoActualNro);
  if (!l) return;
  const w = window.open('', '_blank', 'width=800,height=700');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Legajo N° ${l.nro}</title>
  <style>body{font-family:Arial,sans-serif;font-size:13px;padding:32px;max-width:720px;margin:0 auto;}h1{font-size:20px;margin-bottom:4px;}h2{font-size:13px;font-weight:700;border-bottom:2px solid #1b4fa8;color:#1b4fa8;padding-bottom:4px;margin:18px 0 10px;}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;}.item .key{font-size:10px;color:#888;text-transform:uppercase;}.item .val{font-size:13px;font-weight:500;}.header{display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0f2d6b;}.logo{font-size:22px;font-weight:800;color:#0f2d6b;}.firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px;border-top:1px solid #ccc;padding-top:14px;text-align:center;font-size:11px;color:#666;}</style></head><body>
  <div class="header"><div><div class="logo">Cooperativa Ohlimpia</div><div style="font-size:12px;color:#666;">Legajo N° ${l.nro}</div></div><div style="text-align:right;font-size:12px;color:#666;">${new Date().toLocaleDateString('es-AR')}</div></div>
  <h2>Datos personales</h2><div class="grid">
  <div class="item"><div class="key">Nombre</div><div class="val">${l.nombre}</div></div>
  <div class="item"><div class="key">DNI</div><div class="val">${l.dni}</div></div>
  <div class="item"><div class="key">CUIT</div><div class="val">${l.cuit || '—'}</div></div>
  <div class="item"><div class="key">Estado civil</div><div class="val">${l.estadoCivil || '—'}</div></div>
  <div class="item"><div class="key">Nacionalidad</div><div class="val">${l.nac || '—'}</div></div>
  <div class="item"><div class="key">Localidad</div><div class="val">${l.localidad || '—'}</div></div>
  <div class="item"><div class="key">Celular</div><div class="val">${l.tel || '—'}</div></div>
  <div class="item"><div class="key">Mail</div><div class="val">${l.mail || '—'}</div></div></div>
  <h2>Operativo</h2><div class="grid">
  <div class="item"><div class="key">Función</div><div class="val">${l.funcion}</div></div>
  <div class="item"><div class="key">Servicio</div><div class="val">${l.servicio}</div></div>
  <div class="item"><div class="key">Supervisor</div><div class="val">${l.supervisor}</div></div>
  <div class="item"><div class="key">Fecha ingreso</div><div class="val">${l.ingreso}</div></div>
  <div class="item"><div class="key">Estado</div><div class="val">${l.estado}</div></div>
  <div class="item"><div class="key">Fecha baja</div><div class="val">${l.fechaBaja || '—'}</div></div></div>
  <div class="firmas"><div>Firma del asociado</div><div>RRHH — Cooperativa Ohlimpia</div></div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}
