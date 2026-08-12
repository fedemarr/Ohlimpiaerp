# DELTA — Cobros / Importación desde Tango v1 (conceptual)

**Versión:** 1 (diseño conceptual — falta la parte técnica de importación)
**Fecha:** 29 de julio de 2026
**Autor del diseño:** Lautaro (con asistencia de Claude web)
**Destinatario:** Fede (implementación)
**Estado:** Parte conceptual cerrada. Detalles técnicos de importación PENDIENTES para próxima sesión.
**Documentos base:** `DELTA_comercial_satelites_v1.1.md` (Cobros), `DELTA_comercial_mejoras_v1.2.md` (punto 2.6, circuito Tango)
**Insumos:** dos reportes reales de Tango — `COMPOSICION_DE_SALDO.pdf` (solo saldos pendientes) y `TODAS_LAS_FACTURAS.pdf` (histórico completo).

---

## Contexto y principio rector

Tango es el sistema de facturación actual y **la única fuente de verdad de los cobros** (decisión firme del delta v1.2, punto 2.6). El sistema Ohlimpia no reemplaza la contabilidad de Tango: la **lee** para que la gestora de cobranzas gestione. La gestora reclama; Tango imputa.

**Analogía de trabajo:** Tango es el banco que lleva la cuenta al centavo. Ohlimpia es la libreta de la gestora, que necesita saber (a) qué facturas siguen impagas —para reclamar— y (b) qué cobros entraron —para el registro. No replica el libro contable completo del banco.

---

## Cómo es el reporte de Tango (formato "Composición de Saldos")

Organizado **por cliente**. Cada cliente se identifica con un número de 6 dígitos (ej: `000013` COTO, `000153` SMARTFIT, `000020` HIT 1). Para cada cliente lista sus comprobantes:

- Línea **FAC** = una factura (lo que el cliente debe). Trae fecha, tipo, número, fecha de vencimiento, importe (DEBE) y saldo.
- Líneas **REC** indentadas debajo = recibos (cobros aplicados a la factura de arriba). La relación cobro↔factura está dada por la **posición**: el REC pertenece a la FAC que tiene encima.
- Otras líneas: **N/C** (nota de crédito), **N/D** (nota de débito), **DRT**, **IND**, "COMPROBANTES A CUENTA" — ajustes contables.
- **SALDO DEL CLIENTE** al final de cada cliente = total pendiente.

Hay dos variantes del reporte, que corresponden a las dos formas de importar:
- **Solo saldos** (`COMPOSICION_DE_SALDO`): trae solo comprobantes con saldo pendiente.
- **Histórico completo** (`TODAS_LAS_FACTURAS`): todas las facturas desde el origen, incluidas las saldadas (saldo 0.00).

**Ejemplo de lectura (pago parcial en varios recibos, cliente ASOC. CRISTIANA):**
```
29/02/2024  FAC  B0000100002909  ...  2,241,585.39
              12/08/2024  REC  0000200004110  1,741,293.57  → saldo 500,291.82
              15/11/2024  REC  0000200004574    223,644.43  → saldo 276,647.39
```
Una factura de $2.241.585 se fue cobrando con dos recibos; queda debiendo $276.647.

---

## Decisiones cerradas en esta sesión

### C.1 — Qué se importa (nivel de detalle)
Se trae un **punto medio** entre "solo saldo" y "todo el detalle contable":
- **Facturas con su saldo:** número, fecha, cliente, importe, vencimiento, saldo pendiente. Las de **saldo > 0** van al tab **Facturas pendientes**.
- **Recibos (REC):** cada cobro con su fecha, número y monto, y la factura a la que se aplicó. Van al tab **Cobros registrados**.
- **NO se replica** el detalle contable fino de Tango (orden exacto de aplicación de cada recibo, compensaciones internas de N/D, comprobantes a cuenta). Eso es cocina de Tango.

### C.2 — Relación cobro ↔ factura
Sale de la **posición en el reporte**: cada REC indentado pertenece a la FAC que tiene arriba. Al importar, se lee de arriba hacia abajo: al encontrar una FAC se abre "factura actual"; los REC siguientes se asocian a ella hasta la próxima FAC.

### C.3 — Cobros registrados: una línea por recibo (Forma 1)
Cuando una factura se cobra en varios recibos, **cada recibo es una línea propia** en "Cobros registrados" (no se suman en una sola línea). Columnas: cliente, N° factura, importe facturado, importe cobrado (del recibo), N° recibo, fecha de cobro.

> **Por qué:** "Cobros registrados" es el registro de la plata que entró. Cada recibo es un ingreso real con su fecha y número — lo fiel es una línea por recibo, como esperaría un contador. Coherente con Tango como fuente de verdad.

---

## VERIFICACIÓN TÉCNICA REFORZADA — Código interno vs Código Tango (para Fede)

**Confirmado con evidencia dura.** Los reportes de Tango identifican a los clientes con números de 6 dígitos (`000013` COTO, `000153` SMARTFIT, etc.). En el sistema Ohlimpia, los mismos clientes tienen otros códigos (Coto = "46", otros = "CLI-0001"). **No coinciden.**

Conclusión: el sistema DEBE tener su **código interno propio** como identidad, y el **Código Tango** debe ser un campo separado de referencia externa (para cruzar en la importación mientras Tango exista). A futuro Tango deja de usarse y el código interno queda como única identidad.

**Implicancia para la importación:** el matcheo entre una factura de Tango y el cliente en Ohlimpia se hace por el **Código Tango** (el número de 6 dígitos), que debe estar guardado en la ficha del cliente. Si un cliente no tiene su Código Tango cargado, sus facturas no van a poder asociarse automáticamente — hay que prever ese caso.

---

## PENDIENTE para próxima sesión (detalles técnicos de importación)

Estos temas NO se resolvieron y son necesarios antes de implementar:

1. **Formato del archivo — PDF vs Excel/CSV.** Los reportes hoy son **PDF**, y extraer datos limpios de un PDF es frágil. **Tarea para Lautaro:** averiguar si Tango puede exportar esta misma composición de saldos a **Excel o CSV**, que simplificaría muchísimo la importación y la haría más confiable.
2. **Manejo de notas de crédito / débito (N/C, N/D)** y comprobantes a cuenta: qué se hace con ellos (¿ajustan el saldo mostrado? ¿se ignoran para la gestión?).
3. **Interacción con el estado "Cobrada (pendiente Tango)"** (definido en delta v1.2, 2.6.2): cuando la gestora marcó una factura como cobrada a mano y luego llega la importación de Tango que la confirma, cómo se reconcilian (la factura debe pasar de "pendiente/cobrada-pendiente-Tango" a "Cobros registrados" con los datos oficiales del recibo).
4. **Frecuencia y mecánica de la importación:** ¿cada cuánto se importa? ¿reemplaza todo o actualiza incremental? ¿qué pasa con facturas que ya no aparecen en un reporte nuevo?
5. **Cuál de los dos reportes se usa** (solo saldos vs histórico completo) para cada propósito.
6. **Diagnóstico de la pantalla de la gestora** ("Gestión de cobros"): tiene columnas nuevas buenas (fecha posible cobro, probabilidad de cobro, estado, Proyección IA, Agente IA) que hay que revisar en detalle.

---

## Nota de proceso
La parte conceptual (qué se trae, cómo se relaciona, cómo se muestra) se cerró con la cabeza fresca porque es la más delicada (toca plata real). Los detalles técnicos se dejan para una sesión dedicada, idealmente después de que Lautaro confirme si Tango exporta a Excel/CSV (punto 1), que puede simplificar todo el diseño de importación.
