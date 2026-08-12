# DELTA — Módulo de Comisiones (NUEVO) v1

**Fecha:** 30 de julio de 2026
**Autor:** Lautaro (con Claude web)
**Destinatario:** Fede
**Estado:** Diseño cerrado. Módulo NUEVO (no existe hoy).
**Relacionado:** módulo de Servicios (asignación), liquidación de horas (base de cálculo), importación de Tango/Cobros (habilitación de pago), `POLITICAS_PROYECTO.md` (vigencia temporal, fuente única).

---

## Qué es este módulo

Gestiona las **comisiones** que cobran las personas que traen ventas a Ohlimpia. Es, en esencia, una **cuenta corriente de comisiones** por persona: se le van sumando las comisiones que gana (según lo que se cobra de sus servicios) y restando lo que se le paga.

### Dos tipos de comisión (regla de duración distinta)
- **Continuo (coordinador de cuenta):** cobra comisión **mientras dure el servicio**, sobre cada factura que se cobra. Sin límite de tiempo.
- **Temporal (vendedor de Comercial):** cobra comisión por **X períodos** (ver más abajo cómo se cuentan) y después deja de cobrar.

---

## 1 — Personas que cobran comisión

Fuente única, sin duplicar:
- **Internos** (asociados, vendedores): se leen de **Legajos**. **Cualquier asociado** puede traer una venta y cobrar comisión — no hay lista cerrada ni rol fijo de "coordinador". Toda persona de Legajos es elegible.
- **Externos:** se cargan en un **mini-registro propio** del módulo (no están en Legajos).

---

## 2 — La comisión es POR SERVICIO (no por cliente)

La comisión se asigna a cada **servicio individual**. Un mismo cliente puede tener servicios traídos por distintas personas (ej: alguien trae un cliente con 5 servicios; otra persona trae el 6º — cada una cobra por lo que trajo).

### Varias comisiones por servicio
Un servicio puede tener **varias comisiones simultáneas**: uno o varios continuos, y/o uno o varios temporales, en cualquier combinación. No es un dato único, es una **lista**. Cada entrada: persona + tipo (continuo/temporal) + % (con vigencia) + (si temporal) cantidad de períodos.

### Dónde se asigna
En el **alta del servicio**, tab "Precio y contrato", **antes del campo Modelo de precio**. Sección desplegable:
- **"¿Este servicio paga comisión?"** (sí/no). Si no, nada más.
- Si sí: **+ agregar comisión** (se pueden agregar varias), cada una con: quién cobra (buscador de Legajos o externo), tipo (continuo/temporal), **% inicial**, y si es temporal, **cantidad de períodos**.
- El % cargado acá es el **inicial**; los cambios futuros se gestionan desde el módulo de Comisiones.

### Aviso por límite
Cuando la suma de comisiones de un servicio supera un límite, el sistema **avisa** (no bloquea): "este servicio suma X% de comisión". El límite es **parametrizable** desde Configuración. Mismo criterio que el tope del 6% en Productos.

---

## 3 — Base de cálculo: desde las HORAS, no desde Tango

**Decisión clave:** la comisión NO se calcula sobre la factura de Tango, sino sobre las **horas** del servicio. Motivo: hay facturas mixtas (horas + productos en renglones separados), y la comisión es **solo sobre las horas de servicio, nunca sobre los productos**. Calcular desde las horas deja los productos afuera automáticamente.

Cálculo según el modelo de precio del servicio:
- **Abono mensual fijo:** el importe mensual vigente.
- **EFT / Horas variables:** horas realizadas (de liquidación de horas) × valor hora vigente.

Fuentes (ya existen): **horas facturables** del módulo de liquidación de horas; **valor hora / abono vigente** del servicio (Precio y contrato).

> **Dependencia a verificar (Fede):** que la vigencia temporal de precios quede implementada de forma que el sistema pueda responder "valor hora / abono vigente de este servicio en tal período" (parte del delta de precios pendiente).

---

## 4 — Timing: se genera al facturar, se habilita al cobrar

- La comisión se **genera (devenga)** cuando se emite la factura del período.
- Se **habilita para pago** solo cuando el cliente **cancela (paga)** esa factura — coherente con "comisión sobre lo cobrado" (más sano: no se paga comisión por plata que no entró).
- Estados de una comisión: **devengada** (facturada, no cobrada) → **disponible para pagar** (cliente pagó) → **pagada** (se abonó al coordinador).

### Conteo del tipo temporal (vendedor)
Los "X períodos" se cuentan como **facturas efectivamente cobradas**, NO como meses de calendario. Cada período se habilita cuando el cliente paga esa factura puntual. Ej: 3 períodos = las 3 primeras facturas del servicio que se cobren; al cobrarse la 3ª se agota el derecho, sin importar cuánto tardaron. Es un contador de facturas cobradas que se descuenta.

---

## 5 — Porcentaje con vigencia temporal

El % de comisión de cada servicio puede cambiar en el tiempo (subir/bajar). Se maneja con **vigencia temporal**: no se pisa, se agrega un tramo nuevo con fecha ("5% hasta marzo, 4% desde abril"). Al calcular la comisión de un período, se usa el % vigente ese período. Se gestiona desde el módulo. Mismo patrón que precios/servicios.

---

## 6 — Estado de cuenta del coordinador (dos niveles)

Vista central del módulo: la cuenta corriente de cada persona que cobra comisión. Igual que "Facturas pendientes" en Cobros, tiene **dos niveles**:

- **Resumen (arriba):** el **saldo total** que se le debe hoy al coordinador (foto rápida).
- **Detalle (al abrir):** la lista de sus comisiones ordenadas de **más antigua a más nueva**, cada una con: servicio, período, %, monto de la comisión, cuánto se pagó, y **saldo pendiente**. También el estado de cada una (devengada / disponible / pagada). Se ve cómo el pago FIFO fue saldando de arriba (lo más viejo) hacia abajo.

### Aclaración: dos flujos distintos (no confundir)
Son dos flujos separados, y ambos hablan de "antigüedad" pero significan cosas distintas:
1. La comisión **se devenga/habilita** a medida que el cliente paga sus facturas (entra a la cuenta del coordinador según los cobros del cliente).
2. El **pago al coordinador** se aplica de lo más viejo a lo más nuevo (FIFO) cuando la empresa le abona.

El "más antiguo primero" aplica SOLO al flujo (2), no al (1).

---

## 7 — Registro de pagos

### Acción "Registrar pago"
Desde el estado de cuenta del coordinador, botón **"Registrar pago"**. Ventana simple:
- **Monto pagado** (ej: $6M)
- **Fecha del pago**
- **Referencia** (opcional: transferencia / efectivo / N° comprobante)

Por defecto, al confirmar, el sistema aplica el monto **FIFO automático** (de la comisión más antigua a la más nueva), actualiza los saldos y registra la fecha de pago en cada comisión afectada.

- Admite **pagos parciales**: cada comisión tiene su saldo, que va bajando; se salda cuando llega a cero, y el remanente pasa a la siguiente comisión más vieja.
- **Ejemplo:** saldo $2M (mayo) + $10M (junio) = $12M. Se paga $6M → cancela los $2M de mayo (saldada) + $4M a junio → junio queda con $6M pendientes. Saldo total: $6M.
- Mismo principio de saldo remanente que las facturas en cuotas de Cobros.

### Opción de ajuste manual (casos especiales)
Detrás de un click ("modo avanzado" / "elegir a qué comisiones aplicar"), el usuario puede **elegir a qué comisiones puntuales** aplicar el pago, salteando el orden FIFO (ej: acuerdo especial de pagar primero un servicio específico). Es la excepción, escondida para no molestar en el uso normal.

> **[Para Fede]** En ambos modos (automático o manual), el sistema debe registrar **cómo se aplicó** el pago (qué comisiones saldó, cuáles quedaron parciales/pendientes) para mantener la trazabilidad. La flexibilidad no puede romper la trazabilidad.

### Historial de pagos
Queda un historial de pagos del coordinador: fecha + monto de cada pago realizado. Trazabilidad completa de lo que se le abonó.

---

## Resumen del flujo del módulo
1. Al crear un servicio, se le asignan una o varias comisiones (persona + tipo + % + períodos si es temporal).
2. Cada período, cuando se factura el servicio, se **devenga** la comisión (calculada sobre las horas × valor hora vigente, o abono vigente).
3. Cuando el cliente **paga** esa factura, la comisión pasa a **disponible para pagar**. (Para temporales, descuenta un período de su contador.)
4. La empresa le paga al coordinador un monto; el sistema lo aplica de lo más viejo a lo nuevo, admitiendo parciales.
5. El estado de cuenta muestra en todo momento qué se le debe a cada uno.

---

## Verificaciones técnicas para Fede
- **[V.1]** Confirmar que liquidación de horas puede entregar "horas facturables por servicio y período".
- **[V.2]** Confirmar que la vigencia temporal de precios permite consultar "valor hora / abono vigente en tal período" (depende del delta de precios).
- El módulo de facturación (mencionado como futuro) NO es necesario para calcular la comisión: alcanza con horas × valor hora vigente. Sí se necesita saber cuándo se facturó y cuándo se cobró (esto último ya viene del circuito de Cobros/Tango).

## Dependencias con otros módulos
- **Liquidación de horas:** provee las horas facturables (base de cálculo). Ya existe.
- **Servicios:** provee valor hora / abono vigente y es donde se asignan las comisiones. Existe (vigencia pendiente en Fede).
- **Cobros/Tango:** provee la señal de "factura cobrada" que habilita el pago de la comisión. Diseñado.
