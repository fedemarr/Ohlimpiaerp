// Módulo Pre-ocupacional — Entry point

export { renderPreocup, tabPreocup, filtrarPreocup, poblarFiltrosColumnasPreocup, abrirGestionPreocup, actualizarMotivoPreocup, guardarPreocup, aprobarPreocup, bajaPreocup, revertirPreocup, cargarAdjuntoPreocup, seleccionarArchivoPreocup, verAdjuntoPreocup, eliminarAdjuntoPreocup, analizarAptoMedicoIA, usarDatosIAApto } from './preocupacional.js';

import { renderPreocup, tabPreocup, filtrarPreocup, poblarFiltrosColumnasPreocup, abrirGestionPreocup, actualizarMotivoPreocup, guardarPreocup, aprobarPreocup, bajaPreocup, revertirPreocup, cargarAdjuntoPreocup, seleccionarArchivoPreocup, verAdjuntoPreocup, eliminarAdjuntoPreocup, analizarAptoMedicoIA, usarDatosIAApto } from './preocupacional.js';

export const preocupScreenConfig = {
  preocupacional: {
    title: 'Pre-ocupacional',
    btn: null,
    fn: null,
    render: () => tabPreocup('activos'),
  },
};

window.renderPreocup = renderPreocup;
window.tabPreocup = tabPreocup;
window.filtrarPreocup = filtrarPreocup;
window.poblarFiltrosColumnasPreocup = poblarFiltrosColumnasPreocup;
window.abrirGestionPreocup = abrirGestionPreocup;
window.actualizarMotivoPreocup = actualizarMotivoPreocup;
window.guardarPreocup = guardarPreocup;
window.aprobarPreocup = aprobarPreocup;
window.bajaPreocup = bajaPreocup;
window.revertirPreocup = revertirPreocup;
window.cargarAdjuntoPreocup = cargarAdjuntoPreocup;
window.seleccionarArchivoPreocup = seleccionarArchivoPreocup;
window.verAdjuntoPreocup = verAdjuntoPreocup;
window.eliminarAdjuntoPreocup = eliminarAdjuntoPreocup;
window.analizarAptoMedicoIA = analizarAptoMedicoIA;
window.usarDatosIAApto = usarDatosIAApto;
