// Cuentas CBU v1 — Entry point. Ver consultas.js (modelo de datos) y
// cuentas_cbu.js (render de los 3 tabs + modales).

export {
  cbuChecksumValido, deducirBanco, getCuentaCbu, cbuVigenteLegajo,
  guardarCuentaCbu, crearFilaAltaCbu, historialCuentaCbu,
} from './consultas.js';

export {
  renderCuentasCbu, tabCbu,
  renderCbuPendientes, renderCbuPadron, filtrarPadronCbu, renderCbuHistorial, filtrarHistorialCbu,
  exportarPadronCbu,
  abrirIniciarTramiteCbu, onChangeBancoTramiteCbu, guardarIniciarTramiteCbu,
  abrirCargarCbuModal, validarCbuInputCuentas, chequearTitularCuentas, guardarCargaCbu,
  abrirImportCbuMasivo, seleccionarArchivoImportCbu, confirmarImportCbuMasivo,
} from './cuentas_cbu.js';

// ========== SCREEN CONFIG ==========

import { renderCuentasCbu } from './cuentas_cbu.js';

export const cuentasCbuScreenConfig = {
  cuentas_cbu: {
    title: 'Cuentas CBU',
    btn: '⬆ Import masivo',
    fn: () => window.abrirImportCbuMasivo(),
    render: renderCuentasCbu,
  },
};

// ========== WINDOW BINDINGS ==========

import {
  tabCbu, filtrarPadronCbu, filtrarHistorialCbu, exportarPadronCbu,
  abrirIniciarTramiteCbu, onChangeBancoTramiteCbu, guardarIniciarTramiteCbu,
  abrirCargarCbuModal, validarCbuInputCuentas, chequearTitularCuentas, guardarCargaCbu,
  abrirImportCbuMasivo, seleccionarArchivoImportCbu, confirmarImportCbuMasivo,
} from './cuentas_cbu.js';

window.tabCbu = tabCbu;
window.filtrarPadronCbu = filtrarPadronCbu;
window.filtrarHistorialCbu = filtrarHistorialCbu;
window.exportarPadronCbu = exportarPadronCbu;
window.abrirIniciarTramiteCbu = abrirIniciarTramiteCbu;
window.onChangeBancoTramiteCbu = onChangeBancoTramiteCbu;
window.guardarIniciarTramiteCbu = guardarIniciarTramiteCbu;
window.abrirCargarCbuModal = abrirCargarCbuModal;
window.validarCbuInputCuentas = validarCbuInputCuentas;
window.chequearTitularCuentas = chequearTitularCuentas;
window.guardarCargaCbu = guardarCargaCbu;
window.abrirImportCbuMasivo = abrirImportCbuMasivo;
window.seleccionarArchivoImportCbu = seleccionarArchivoImportCbu;
window.confirmarImportCbuMasivo = confirmarImportCbuMasivo;
