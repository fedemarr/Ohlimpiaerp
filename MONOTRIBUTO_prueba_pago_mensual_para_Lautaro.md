# Prueba de Pago mensual — qué revisar (para Lautaro)

## Qué cambió y por qué

En **Pago mensual** hay 29 filas que el import viejo dejó con basura en el
campo *Nombre*: números ("5578", "113 (B)") o un placeholder. Son de personas
reales pero con la fila pisada, más algunas filas de N° que no corresponden a
nadie.

**Los importes están bien.** Es importante que lo sepas porque la hipótesis
inicial era al revés y quedó descartada con los datos: que 8 personas
compartan $49.527,18 al centavo es correcto, porque todas están en la misma
situación (categoría A, común, sin adherentes, sin IIBB). Cada importe cuadra
con la suma de sus partes.

Lo que sí estaba mal:

- **Duplicados.** Sequeira Nicole (5581) tiene 4 filas en el mismo mes.
  Tildar el mes le pagaba 4 veces.
- **N° sin legajo.** 113, 4734 y 5495 no existen como personas. No hay forma
  de saber a quién corresponden.
- **Placeholders.** El Padrón quedó con nombres tipo
  "SOCIO 5582 (sin legajo encontrado)".

**Ninguna de las 29 estaba pagada.** Esto no tapa un pago ya hecho: evita el
que se haría al tildar a ciegas.

## Antes de empezar

La migración de base de datos tiene que estar aplicada
(`sql/v185_mono_conciliacion_filas_import.sql`). Si todavía no está, las
filas raras siguen visibles pero **no se pueden tildar** — el botón aparece
bloqueado con un aviso. Eso ya es correcto y se puede probar igual.

## Qué probar

Entrá con tu usuario y andá a **Monotributos → Pago mensual**.

### 1. Las filas raras no se pueden pagar

Buscá una fila con nombre numérico o "sin verificar". Tiene que aparecer con
un aviso y **sin botón para tildar**.

Lo que hay que confirmar:
- No hay forma de marcarla como pagada.
- Si intentás el comprobante de esa fila, tiene que cortar con un aviso.
- En el detalle dice por qué: si es "sin verificar" es porque el import no
  dejó el nombre.

### 2. El archivo del banco está limpio — **lo más importante**

Exportá el CSV del mes.

Lo que hay que confirmar: **ninguna de las 29 filas dudosas aparece en el
archivo**, aunque ya se les haya puesto el nombre real. Este es el punto
crítico: el CSV es lo que se manda al banco, así que una fila ahí se traduce
en plata. Si aparece una sola, avisame antes de seguir.

Las filas que sí están bien (las 16 con nombre real) tienen que estar.

### 3. Los duplicados están fuera del mes

Después de la migración, Sequeira Nicole y Díaz Daniela tienen **1 sola fila
por mes**, no 4 ni 2.

- El conteo de filas del mes tiene que bajar.
- El importe total del mes tiene que bajar en la misma proporción. Si bajó el
  número de filas pero no el importe, o al revés, algo está mal: avisame.
- La lista tiene que seguir mostrando los nombres bien, no "Sin nombre".

### 4. Las excluidas se pueden volver a incluir

Las 13 filas que se sacaron tienen que estar en **"Excluidas del mes"**, cada
una con su motivo:
- "Duplicado del import viejo" → había otra fila de esa persona ese mes.
- "Sin legajo asociado" → el N° no existe en legajos.

Probá volver a incluir una y después excluirla de nuevo. Tiene que funcionar
en los dos sentidos.

### 5. El Padrón

En **Padrón**, buscá a **Díaz Daniela (5579)**. Antes figuraba como
"SOCIO 5582 (sin legajo encontrado)", ahora tiene su nombre.

## Qué NO hay que hacer

- **No tildes ni pagues ninguna fila** hasta que we've revisado el resultado.
  La idea es mirar primero.
- **No borres** filas. Si algo no cierra, se deja y se avisa.
- No toques las categorías, condiciones ni importes del Padrón.

## Si algo falla

Anotá: qué estabas viendo, qué esperabas, qué pasó, y en qué mes. Con eso
alcanza. No hace falta que intentes arreglarlo.

## Contexto para quien lea esto

Si tenés que mirar los números:

- Las 29 filas: **16 se conservan** (una por persona y mes) y **13 se excluyen**
  (5 sin legajo + 8 duplicados).
- La conciliación **no borra nada**. Todo queda marcado y es reversible desde
  el backup `mono_pagos_mes_v185_backup`.
- Cada cambio quedó registrado en **Historial de cambios**.