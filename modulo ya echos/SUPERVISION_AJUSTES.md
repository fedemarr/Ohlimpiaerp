# SUPERVISIÓN DE SERVICIOS — Ajustes al módulo construido

**Sesión:** Lautaro + Claude · 15/08/2026
**Para:** Fede

> **El módulo ya está construido y funciona.** Este documento lista **SOLO los ajustes acordados sobre lo existente**.
>
> **Acompaña:** `mockup_supervisores.html` actualizado — todos los ajustes son navegables ahí.
>
> **Vigencia:** la especificación original (`MODULO_SUPERVISION_para_Fede.docx`) sigue vigente en todo lo demás.

---

## 1. Tab "% por servicio" — grilla

### Filtros y búsqueda
Agregar una **fila de filtros** debajo de los títulos:

- Buscador de cliente/servicio
- Buscador de supervisor
- Filtro de neta: `Todas` / `Solo PROYECTADAS`
- Filtro por origen: `GENERAL` / `CLIENTE` / `SERVICIO`

Filtran **en vivo**. Los indicadores de arriba **no cambian** — solo se ocultan filas.

### Clientes de un solo servicio
Un cliente con **UN SOLO servicio** se muestra como **UNA SOLA FILA** (cliente + supervisor + neta + % + monto juntos), y el % se edita ahí directo — **no hace falta desplegar nada**.

Los clientes con **VARIOS servicios** se despliegan/colapsan **tocando la fila del cliente** (flechita ▸/▾).

### Neta del mes
La columna pasa a llamarse **"Neta (últ. fact.)"** y trae la **última facturación** del servicio — **la misma fuente** que usa el tope de Pedido de productos.

| Caso | Qué muestra |
|---|---|
| Servicio con facturación | Valor real de la última facturación |
| Servicio NUEVO sin facturar | El **PROYECTADO**, en **violeta** con chip `PROYECTADO` |

Cuando factura por primera vez, **pasa solo** al valor real.

### % siempre visible
El campo de % **NUNCA queda vacío**: siempre muestra el valor vigente (el 3% general, el del cliente, o el propio del servicio).

- **Tooltip** con el origen: *"heredado del GENERAL — editá para pisar"*
- Al cambiarlo: se ve el % nuevo **al instante**, el chip pasa a `SERVICIO` y el campo queda **marcado con borde** como pisado

---

## 2. Ventana "Cambiar % de supervisión"

El modal actual (nuevo % · rige desde · motivo obligatorio · guardar vigencia) **está bien y queda igual**, con **un agregado**:

### Línea de ALCANCE arriba
Debe decir exactamente qué se está tocando:

```
CHANGO.MAS — nivel CLIENTE (hereda a sus 26 servicios)
DANONE.MIGUELETES — nivel SERVICIO
```

**Por qué:** para que nunca haya dudas de si se pisa un servicio o se arrastra a todos los del cliente.

**Al guardar:** impacta la grilla y agrega la fila al Historial de cambios.

---

## 3. "Heredar" pide confirmación

Al tocar **"heredar"** (limpiar un override), se abre una **ventana de confirmación** con:

- El **ALCANCE**
- El cambio explicado **con números**: *"Deja el 2,00% propio y vuelve a heredar del GENERAL: 3,00%"*
- El **RIGE DESDE** — porque volver a heredar **también es un cambio con vigencia**

**Al confirmar:** queda registrado en el Historial de cambios con motivo `"Vuelve a heredar de la cascada"`.

**Cancelar:** no toca nada.

---

## 4. Historial dividido en dos tabs

### Tab "HISTORIAL DE CAMBIOS"
**SOLO** el registro de modificaciones:

`fecha · usuario · nivel (GENERAL/CLIENTE/SERVICIO) · alcance · % anterior → % nuevo · rige desde · motivo`

Acá caen los cambios del modal y los **"heredar" confirmados**.

### Tab "HISTORIAL DE PERÍODOS" *(nuevo, separado)*

**Título interno:** "Porcentajes vigentes por período", con selector de **"Período consultado"**.

Muestra la grilla completa de un mes dado:

`servicio · neta de ese mes (con el violeta de PROYECTADO donde aplique) · % vigente ese mes · origen · supervisión ($)`

**Exportable** (Excel/PDF) para respaldar la liquidación.

> ⚠️ **IMPORTANTE:** no es una copia guardada — se **RECONSTRUYE** de las vigencias. Por eso los meses cerrados se ven siempre iguales.

---

## 5. Indicadores de arriba

**ELIMINAR** la tarjeta **"Vigencia de cambios"** (Rige desde…). La vigencia se pide en cada modal de cambio, que es donde corresponde.

**Quedan tres tarjetas:**
1. Servicios activos
2. Costo supervisión del mes
3. Servicios fuera del % general
