# DELTA — Servicios: ajustes (Tipo de sitio + Modelos de precio)

**Fecha:** 30 de julio de 2026
**Autor:** Lautaro (con Claude web)
**Destinatario:** Fede
**Estado:** Cerrado, listo para implementar
**Relacionado:** `DELTA_comercial_diagnostico_v1.3.md` (Servicios). Este documento **corrige y amplía** el punto 2.2 (modelo de precio) de ese delta.

---

## 1 — Campo nuevo "Tipo de sitio"

Un campo nuevo en **"Datos del servicio"**: **"Tipo de sitio"**, distinto del "Tipo de servicio" existente.
- **Tipo de servicio** (ya existe) = qué **tarea** se hace (Limpieza, Mantenimiento…).
- **Tipo de sitio** (nuevo) = qué **tipo de lugar** es (Supermercado, Centro logístico, Oficina, Hospital, Consorcio…).

**Por qué:** un cliente puede tener muchos servicios de la misma tarea en lugares distintos. Ej: Chango tiene ~20 mayoristas (supermercados) + 1 centro logístico; en todos se hace limpieza, pero el tipo de lugar difiere.

**Requisitos:**
1. Campo **parametrizable desde Configuración** (pizarrón central), como "Tipo de cliente".
2. **Columna "Tipo de sitio"** en la lista de servicios.
3. **Filtro por "Tipo de sitio"** en la lista.

---

## 2 — TRES modelos de precio (CORRIGE el diseño previo de 2 modelos)

**Importante:** en la sesión del delta v1.3 se habían manejado DOS modelos. En realidad son **TRES**. Este es el diseño correcto.

### Modelo 1 — Por EFT (horas fijas pactadas)
- Se factura **siempre** la cantidad de horas pactada (el EFT), pase lo que pase con las horas reales.
- **Se cargan:** cantidad de horas (EFT) + valor hora.
- **Se calcula:** valor mensual = horas × valor hora. **Firme.** Campo bloqueado en gris.

### Modelo 2 — Por horas variables (según lo trabajado cada mes)
- No hay tope fijo: se factura según las horas **realmente trabajadas** cada mes (un mes 180, otro 220).
- La cantidad de horas que se carga al alta es **estimada, SOLO para informe/referencia** — NO impacta directo en facturación. El monto real sale de las horas trabajadas del mes (vía liquidación de horas).
- **Se cargan:** cantidad de horas estimada + valor hora.
- **Se calcula:** monto **estimado** a facturar = horas estimadas × valor hora. **Orientativo, no firme.**

### Modelo 3 — Abono mensual fijo
- Monto cerrado pactado.
- **Se carga:** valor mensual.
- **Se calcula:** valor hora de referencia = valor mensual ÷ cantidad de horas. Campo bloqueado en gris.

> Nota: EFT y horas variables se **cargan igual** (horas + valor hora → mensual), pero el significado del resultado difiere: en EFT es firme, en variables es estimado.

### BUG a corregir (detectado en pantalla)
La pantalla de **"Por horas variables"** hoy pide **Valor mensual** y calcula **Valor hora de referencia** — esa es la lógica del modelo **Abono fijo**, quedó cruzada. Debe pedir **cantidad de horas estimada + valor hora** y calcular el **monto estimado**. Verificar que cada uno de los tres modelos pida y calcule según corresponde.

---

## 3 — Ficha de detalle: mostrar el precio según el modelo

Hoy la ficha muestra **Valor mensual** y **Monto estimado a facturar** con el mismo número (redundante). Debe mostrar **solo el campo relevante** según el modelo:

| Modelo | Qué se muestra | Qué se oculta |
|---|---|---|
| Por EFT | **Monto a facturar por mes** (firme) | Valor mensual |
| Por horas variables | **Monto estimado a facturar por mes** (aclarar que es *estimado* según horas reales) | Valor mensual |
| Abono mensual fijo | **Valor mensual** | Monto estimado |

- El campo que no corresponde se **oculta por completo** (no con guión). Un guión sugiere "dato faltante"; la ausencia comunica "no aplica a este modelo". Es ocultamiento visual; el dato subyacente puede seguir existiendo.
- **Etiquetas:** en EFT "Monto a facturar" (firme), en variables "Monto estimado a facturar" (referencia). Que la etiqueta refleje si es compromiso o estimación, aunque el cálculo sea el mismo (horas × valor hora).

---

## Validado en esta sesión (funciona bien con data real)
- Cálculo del modelo Abono fijo: Chango Caseros nuevo → $540.000 = 60hs × $9.000 ✓ (Por EFT), y otro servicio $1.158.190 con valor hora ref. $10.529 (Abono fijo) ✓.
- Jurisdicción + Localidad encadenadas: funcionando (Provincia de Bs As → Lanús / Castelli).
- Personal por puestos: funcionando ("5 personas · 07:00 a 21:00 · L,M,X,J,V,S,Fer").
- Facturación de productos, historial de estados con reactivación: funcionando.
- El desajuste anterior de Chango Brown ($850.000 vs $21.249) era **data de prueba vieja** (3hs mal cargadas), no un bug.
