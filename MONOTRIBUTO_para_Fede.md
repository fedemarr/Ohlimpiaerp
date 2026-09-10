# MÓDULO MONOTRIBUTOS — Rediseño: la cuota es una SUMA DE COMPONENTES
**Fecha:** 04/09/2026 · **De:** Lautaro (Finanzas) · **Acompañan:** `mockup_monotributo_componentes.html` (módulo completo con los cambios) · `MONOTRIBUTO_TABLAS_IIBB_AGO2026_para_Fede.xlsx` · `IIBB_ARBA_ago2026.csv` · `IIBB_AGIP_ago2026.csv` · `PADRON_MONOTRIBUTO_import_sistema.csv` (padrón completo para importar)

Validamos el modelo contra las **credenciales de pago reales (F.1520) de 399 asociados** descargadas de ARCA: la fórmula reproduce el total de la credencial **en los 399 casos, al centavo**. Esto no es teoría — es cómo ARCA arma la cuota.

---

## 1. EL CAMBIO DE FONDO: la cuota no es un valor por categoría, es una SUMA

```
CUOTA MENSUAL = Impuesto integrado (imp. 20)
             + Aporte jubilatorio SIPA (imp. 21)
             + Obra social (imp. 24) × (1 + adherentes)
             + IIBB unificado (ARBA si Zona=Provincia / AGIP si Zona=Capital, solo si aporta)
```

**El sistema calcula la cuota — nunca se carga a mano.** Cada componente sale de la tabla vigente según categoría, condición, zona y adherentes.

## 2. Condiciones (campo nuevo del asociado — define qué componentes paga)

| Condición | Imp. integrado | SIPA | Obra social | Regla |
|---|---|---|---|---|
| **Común** | ✔ | ✔ (tabla) | ✔ ×(1+adh) | El default |
| **Asociado a cooperativa** | ✘ NO paga | ✔ **$18.246,86** (valor especial) | ✔ ×(1+adh) | **EXCLUSIVO de categoría A.** Si lo recategorizan fuera de A pierde la condición → pasa a Común automáticamente (queda en el historial) |
| **Jubilado (Ley 24241)** | ✔ | ✔ **$18.246,86** | ✘ NO paga (PAMI) | |
| **No aportante al régimen** | ✔ | ✘ | ✘ | Caso Peretti: paga SOLO el imp. integrado (aporta jubilación y obra social por otro lado) |

En el padrón real: 250 comunes, 145 asociados a cooperativa, 2 jubilados, 2 no aportantes.

- IIBB: **cualquier** categoría puede estar adherida al unificado (no solo la A). AGIP es **mensual desde 01/2026** (dejó de ser bimestral: $44.970 bim → $22.485 mensual ene-26 → $30.025 desde ago-26).
- **Todo es "locaciones y prestaciones de servicios"**: la cooperativa paga por lo trabajado en Ohlimpia; si el asociado tiene otra actividad, la diferencia es problema suyo. → **SIN campo Actividad, SIN columnas de ventas** en las tablas.
- **CUR (código) y credencial quedan FUERA del sistema** (solo control externo de RRHH).

## 3. Cambios por pantalla (todo maquetado en el mockup)

**Padrón** — se mantiene tu estructura (proyección anual vs tope, neto último mes, estado). Solo: columna **CONDICIÓN** nueva, y "CUR mensual" pasa a llamarse **"Cuota mensual"** con hover que muestra el desglose (20 + 21 + 24 + IIBB).

**Ficha del monotributista** — campos: Categoría · **Zona** (define la jurisdicción IIBB; al lado un tilde "aporta IIBB", destildado por defecto) · **Condición** (la opción "Asociado a cooperativa" SOLO aparece si Categoría=A) · **Adherentes: cantidad** (el monto lo calcula el sistema: obra social × cantidad). SE QUITAN: monto de adherentes a mano, "Con familia", CUR manual, campo Estado, Actividad. A la derecha, la cuota calculada en vivo con su desglose.

**Tablas de categorías** — ARCA con estos encabezados: Categoría · Tope de ingresos brutos anuales · Impuesto integrado · Aporte jubilatorio (SIPA) · Obra social · Cuota base mensual · Asociados. Más **2 filas especiales de SIPA**: JUBILADO $18.246,86 · ASOC. COOPERATIVA $18.246,86. Y dos tabs nuevos: **ARBA** (una columna por categoría — usar solo la columna locaciones del CSV) y **AGIP** (una columna), ambas con vigencias como ARCA (2026-08 vigente; ⚠ de la vigencia 2026-01 de AGIP solo el valor de A $22.485 está confirmado — B a K del mockup son ilustrativos, no importar esa vigencia sin la tabla oficial). Botón "Importar tabla" con los CSV adjuntos.

**Fuera de categoría** — botón **Recategorizar**: sugiere la primera categoría cuyo tope cubre la proyección; ventana con vigencia + motivo + impacto (cuota nueva, tope nuevo, y si pierde la condición cooperativa lo avisa). Impacta Padrón, Historial y Pago mensual (los meses ya armados quedan congelados).

**Pago mensual** — al armar el mes se **congela el desglose** (20 / 21 / 24 / IIBB / total por asociado); el export lleva los componentes.

**Idea para después** (no bloquea): "Importar comprobantes de pago" en Pago mensual — RRHH tiene los comprobantes (Pago24/Telerecargas/Mercado Pago); matcheando CUIT + período el sistema marca Pagado con fecha, canal y N° de operación, y detecta duplicados y pagos fuera de término.

## 4. El CSV del padrón (importar con "Importar CSV")

`PADRON_MONOTRIBUTO_import_sistema.csv` — 428 filas en el formato del import (N° socio, Categoría, Adherentes cant, Adherentes monto, CUR[=cuota], Observaciones, Estado, Motivo estado):

- **399 con dato REAL de su credencial F.1520** (categoría, condición, adherentes, zona, IIBB y cuota exacta) — la observación dice "dato de credencial F.1520".
- **29 sin credencial todavía** (faltantes + ingresantes) — van con el dato de la planilla de RRHH y observación "SIN CREDENCIAL — validar".
- **26 marcados "⚠ REVISAR"**: la planilla de RRHH paga distinto de lo que dice la credencial. Los resuelve RRHH/Lautaro — el sistema los importa igual, la observación queda como marca. Composición real: 367 cat. A · 111 de Capital (AGIP) · solo 9 aportan IIBB · 30 con adherentes.

## 5. Orden sugerido

1. Tablas: encabezados ARCA + filas SIPA especiales + tabs ARBA/AGIP con importación de los CSV.
2. Ficha con Condición/Zona/Adherentes-cantidad y cuota calculada (la fórmula del punto 1).
3. Importar el CSV del padrón.
4. Padrón (columna Condición + renombre) · Recategorizar · Pago mensual con desglose congelado.
