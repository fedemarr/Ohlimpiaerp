# DELTA — Cobros / Importación desde Tango v2

**Versión:** 2 (modelo de importación cerrado y validado con datos reales)
**Fecha:** 30 de julio de 2026
**Autor del diseño:** Lautaro (con asistencia de Claude web)
**Destinatario:** Fede (implementación)
**Estado:** Modelo de importación CERRADO y validado. Quedan detalles menores (ver final).
**Reemplaza a:** `DELTA_comercial_cobros_tango_v1.md` (conceptual)
**Insumo validado:** `Estado_de_cuenta_total.xlsx` — export real de Tango, histórico completo, 31.337 filas, 269 clientes.

---

## Novedad principal respecto de v1: Tango SÍ exporta a Excel

El reporte se consigue en **Excel** (no solo PDF). Esto simplifica y hace confiable la importación: los datos vienen en **columnas con nombre**, no hay que parsear un PDF por posición.

### Estructura del Excel (columnas)
| Columna | Contenido |
|---|---|
| COD_GRU / NOMBRE_GRU | Grupo (normalmente vacío) |
| **COD_CLI** | Código de cliente en Tango (ej: `000003`) — **6 dígitos, con ceros a la izquierda** |
| RAZON_SOC | Nombre del cliente |
| FECHA | Fecha del comprobante (para las facturas) |
| **T_COMP** | Tipo de comprobante origen (`FAC` = factura) |
| **N_COMP** | Número de comprobante origen |
| FECHA_VTO | Vencimiento de la factura |
| FECHA_APL / **TCOMP_APL** / NCOMP_APL | Comprobante **aplicado** contra la factura (REC, N/C, N/D, etc.) |
| **IMPORTE** | Monto. **Facturas en positivo, pagos/notas de crédito en negativo** |
| IMP_CTA | Estado (IMPUTADO / a cuenta) |

Cada fila es o bien una **factura** (tiene T_COMP=FAC) o bien un **comprobante aplicado** (tiene TCOMP_APL con REC/N/C/etc. e IMPORTE negativo). Los comprobantes aplicados aparecen debajo de su factura.

---

## Decisiones cerradas y VALIDADAS

### C.1 — Enfoque: el sistema procesa el histórico completo y calcula el saldo
Se importa el Excel completo tal como lo exporta Tango (no se depende de filtrar en Tango). El sistema calcula el estado real.

### C.2 — Cálculo del saldo (VALIDADO AL CENTAVO)
**Saldo del cliente = suma de todos sus IMPORTE** (facturas positivas + pagos/notas negativas). No hace falta interpretar cada tipo de comprobante: todos vienen con el signo correcto.

Validado contra el reporte PDF de Tango, coincide exacto:
| Cliente | Calculado | Tango (PDF) |
|---|---|---|
| 000003 ASOC. CRISTIANA | 1.401.416,49 | 1.401.416,49 ✓ |
| 000013 COTO | 8.325.517,61 | 8.325.517,61 ✓ |
| 000020 HIT 1 | 847.973,89 | 847.973,89 ✓ |
| 000153 SMARTFIT | −5.030.822,21 | −5.030.822,21 ✓ (saldo negativo = crédito a favor) |

Tipos de comprobante presentes: FAC; y aplicados REC, N/C, N/D, IND, DRT, NDI, NCI, FA1, CRT. **No hay que programar lógica por tipo** — sumar respetando el signo alcanza.

### C.3 — [NOTA TÉCNICA CRÍTICA — Fede] El código de cliente es TEXTO, no número
`COD_CLI` = `000003`. Si se lee como número se convierte en `3` y **pierde los ceros**, rompiendo el matcheo (comprobado: leído como número dio 0 filas). Tratar SIEMPRE como texto. Es el mismo problema de códigos que ya arrastra el proyecto.

### C.4 — Matcheo con clientes de Ohlimpia por Código Tango
La importación asocia cada factura a un cliente de Ohlimpia por el **Código Tango** (los 6 dígitos), que debe estar guardado en la ficha del cliente. Confirmado que el código interno de Ohlimpia y el de Tango son **distintos** (Coto = "46" en Ohlimpia vs "000013" en Tango). Si un cliente no tiene Código Tango cargado, sus facturas no matchean — prever ese caso (lista de no-matcheados para completar a mano).

### C.5 — Facturas pendientes: dos niveles de vista
- **Vista principal:** saldo por cliente (total que debe cada uno) → para priorizar a quién reclamar.
- **Al abrir un cliente:** las facturas individuales que componen ese saldo, cada una con su **saldo remanente**.

> **[NOTA TÉCNICA — Fede]** El remanente por factura requiere emparejar cada FAC con sus comprobantes aplicados (columnas FECHA_APL/TCOMP_APL/NCOMP_APL) y restar. Es el paso que más cuidado requiere. Los datos están completos; es cuestión de procesarlos bien.

### C.6 — Cobros registrados: una línea por recibo (Forma 1, ya definido en v1)
Cada REC es una línea propia: cliente, N° factura, importe facturado, importe cobrado, N° recibo, fecha de cobro.

### C.7 — Factura pagada en cuotas
Una factura permanece en "Facturas pendientes" mientras su **saldo sea mayor a cero**, mostrando siempre el **saldo remanente** (no el importe original), que baja a medida que Tango trae recibos aplicados. Solo cuando el saldo llega a **cero** se considera confirmada y se refleja en "Cobros registrados".

### C.8 — Reconciliación: marca de la gestora vs Tango
Circuito del delta v1.2 (2.6.2): la gestora marca "Cobrada (pendiente Tango)"; la factura sigue en pendientes hasta que Tango confirme. Al importar:
- **Tango cubre la factura entera (saldo cero)** → confirmada: pasa a Cobros registrados con datos oficiales. La marca de la gestora quedó validada.
- **Tango NO la confirma (sigue con saldo)** → mantiene la marca "Cobrada (pendiente Tango)" + **alerta visible** ("pasó una importación y Tango no confirmó este cobro"). No se borra la marca (el pago puede estar en camino), pero se avisa para que la gestora chequee.
- El emparejamiento marca↔recibo se hace por **número de factura**.

### C.9 — Frecuencia y mecánica de importación
- **Frecuencia:** manual, disparada por la gestora al subir el Excel. Ritmo esperado hasta ~4 veces por semana.
- **Mecánica: reemplazar datos de Tango, conservar datos de gestión.** Cada import trae el histórico completo (verdad actualizada), así que los **datos de Tango** (facturas, recibos, notas, saldos) se **reemplazan**. Las **marcas propias de la gestión** (tilde cobrada-pendiente-Tango, próxima gestión, fecha posible de cobro, notas de llamados, historial de gestiones) se **conservan** — NO viven en Tango.

> **[NOTA TÉCNICA — Fede]** Separar dos tipos de dato: (1) datos de Tango, se reemplazan; (2) datos de gestión, se conservan. El vínculo es el **número de factura**: al reemplazar los datos de Tango, volver a "colgar" las marcas de la gestora sobre las facturas correspondientes. Esta mecánica de reemplazo es la que ejecuta la reconciliación de C.8.

---

## Pendiente (menor) para próxima sesión de Cobros
- **Diagnóstico de la pantalla de la gestora** ("Gestión de cobros"): tiene columnas/funciones nuevas a revisar en detalle — fecha posible de cobro, probabilidad de cobro (85%/60%), estado (gestión activa/impago), botones "Proyección IA" y "Agente IA".
- **Notas de crédito/débito en la vista de detalle:** para el saldo total no importan (ya suman con su signo), pero definir si se muestran discriminadas al abrir el detalle de un cliente.
- **Comprobantes "a cuenta"** (IMP_CTA): definir si se tratan distinto de los imputados en la vista.

---

## Resumen del flujo (para tener el modelo de un vistazo)
1. La gestora exporta de Tango el "Estado de cuenta total" (Excel) y lo sube (~4x/semana).
2. El sistema lee el Excel, trata COD_CLI como texto, matchea clientes por Código Tango.
3. Reemplaza los datos de Tango; conserva las marcas de la gestión.
4. Suma importes por cliente → saldo. Facturas con saldo > 0 → "Facturas pendientes" (saldo por cliente, y al abrir, factura por factura con remanente).
5. Los recibos → "Cobros registrados" (una línea por recibo).
6. Reconcilia las marcas de la gestora: confirma (saldo cero) o alerta (Tango no confirmó).
