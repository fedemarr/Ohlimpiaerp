# REDISEÑO — Módulo Supervisión de Servicios

**Sesión:** Lautaro + Claude · 13/08/2026
**Para:** Fede

**Archivos que acompañan:**
- `mockup_supervisores.html` — diseño navegable
- `IMPORT_SUPERVISION_porcentajes.xlsx` — carga inicial

---

## 1. Cambio de enfoque — el % vive en el SERVICIO

La pantalla actual pone el % en el supervisor. **Está al revés.**

El % es una propiedad de la **relación servicio-supervisión**: el servicio paga un % de supervisión que la empresa ajusta servicio por servicio o cliente por cliente (ej.: Chango MAS al 2,5%).

**Vista principal del módulo:** grilla de **servicios activos agrupados por cliente**, con el % editable en la fila.

**Catálogo de supervisores:** queda como pantalla secundaria SOLO para altas/bajas de personas, **sin %**.

---

## 2. Nomenclatura — nunca "comisión"

> "Comisión" queda reservado a la **venta** (coordinadores de cuenta).

| Concepto | Término correcto |
|---|---|
| El porcentaje | **% de supervisión** |
| Lo que cobra el supervisor | **Adicional por supervisión** |
| El módulo | **Supervisión de servicios** |

⚠️ Revisar que **ninguna** pantalla, reporte ni export use "comisión" para esto.

---

## 3. Cascada de defaults: GENERAL → CLIENTE → SERVICIO

| Nivel | Dónde vive | Comportamiento |
|---|---|---|
| **GENERAL** | Parámetro en Configuración (hoy **3%**) | Aplica a todo servicio sin definición más específica |
| **CLIENTE** | Campo "% supervisión" opcional en ficha del cliente (Comercial) | Sus servicios lo heredan. Caso real: **CHANGO.MAS = 2,5%** |
| **SERVICIO** | Override puntual en el servicio | **Gana sobre todo lo demás** |

### Dónde vive vs. dónde se edita

El dato **VIVE** en las entidades de Comercial (Configuración / Cliente / Servicio), pero la **EDICIÓN se hace únicamente desde la grilla del módulo Supervisión**:

- Editar la **fila-cliente** → escribe el campo del cliente (y los servicios sin override heredan al instante)
- Editar una **fila-servicio** → escribe el override del servicio

### Indicadores en la grilla

- **Chip de ORIGEN:** `GENERAL` verde · `CLIENTE` amarillo · `SERVICIO` rojo
- **Link "heredar":** limpia el override

En las fichas de Comercial el campo se ve en **solo lectura**, con link "gestionar en Supervisión". **Un solo lugar de edición.**

---

## 4. Vigencias e historial (trazabilidad mes a mes)

Cada % se guarda como registro de **vigencia**:

```
nivel (general/cliente/servicio) · alcance · % ·
vigente-desde · vigente-hasta · usuario · fecha · motivo
```

**Regla clave:** cambiar un % **nunca pisa el anterior** — cierra la vigencia y abre una nueva.

La liquidación de cada mes usa el % vigente de **ESE** mes → los meses cerrados se reconstruyen exactos siempre (**política A.6** del proyecto).

### Vigencia del cambio
Al confirmar un cambio, Finanzas elige **desde qué período rige**.
- **Default:** mes en curso, si aún no se liquidó
- **Meses ya liquidados:** intocables

### Tab "Historial de %"
Dos vistas:

**(a) REGISTRO DE CAMBIOS** — log cronológico filtrable: fecha, usuario, nivel, alcance, % anterior → nuevo, rige desde, motivo.

**(b) FOTO POR MES** — selector de período que muestra la grilla con los % vigentes de ese mes.

Además: **ícono de historial en cada fila** de la grilla, con la línea de tiempo del servicio.

---

## 5. Permisos

| Rol | Puede |
|---|---|
| **FINANZAS** | Edita los % (todos los niveles), sus vigencias, y la columna "Ajuste de nivelación" en Liquidación Administración |
| **GERENCIA GENERAL** | Define los valores del "Ajuste de nivelación" (la carga en el sistema la hace Finanzas) |
| **RESTO** | Lectura del módulo y del reporte |

---

## 6. Reparto con varios supervisores

Si un servicio tiene más de un supervisor asignado, el % del servicio se divide en **PARTES IGUALES** entre los asignados. *(Confirmado por Lautaro.)*

> Hoy todos los servicios del maestro tienen un solo supervisor.

---

## 7. El pago NO sale de este módulo — flujo a Liquidación Administración

Los supervisores ya tienen su fila en Liquidación Administración (HS fijas × valor/h). Se agregan **dos columnas**:

### "Adicional por supervisión"
- Viene calculada y **BLOQUEADA** desde este módulo
- Fórmula: `Σ neta facturada × % vigente de sus servicios del mes`
- Con **drill-down** al detalle

### "Ajuste de nivelación"
- **Editable** en más o en menos
- Edita **FINANZAS**; los valores los define el **Gerente General**
- Con motivo y auditoría

```
Total a pagar = base + adicional + ajuste
```

### Por qué el ajuste va como línea aparte

Hoy el Gerente General **pisa los retiros en el Excel** para emparejar la escala. En el sistema hace lo mismo (nivelar mirando toda la nómina junta, en el momento de liquidar) **pero sin pisar el cálculo**:

- Queda registrado cuánto era "por fórmula" y cuánto fue nivelación
- El costo real de supervisión por servicio **no se distorsiona** en el Económico

---

## 8. Reporte por supervisor (solo lectura)

Pestaña con el total por supervisor: servicios que supervisa, neta supervisada, % aplicados y adicional del mes.

Es la vista que mira el **Gerente General** antes de decidir ajustes.

> La pantalla actual (lista de supervisores con %) **desaparece** como lugar de configuración.

---

## 9. Carga inicial — `IMPORT_SUPERVISION_porcentajes.xlsx`

| Hoja | Contenido |
|---|---|
| **CONFIG** | GENERAL 3% (Configuración) |
| **CLIENTES** | CHANGO.MAS 2,5% — único % de cliente al arranque |
| **SERVICIOS** | 165 servicios activos con supervisor asignado, % inicial efectivo y origen (26 servicios CHANGO heredan 2,5%; el resto 3% general) |

**Excluidos:** UTCYDRA (tercerizado, sin supervisión propia) y CHANGO.SMARTIN (baja).

### Nombres a unificar en el catálogo antes de conectar

- **"Lorena Unzain"** (sistema) vs **"Lorena Uzabain"** (planillas) → confirmar apellido
- **"Marcelo Moure"** = Marcelo Gonzalez Moura
- **Maximiliano Poncino** y **Patricia Scaglia** figuran sin servicios → ¿asignar o desactivar?
- Verificar que **Santiago Ayala** esté en el catálogo

---

## 10. Referencia visual

El archivo `mockup_supervisores.html` muestra el diseño navegable:

- Grilla con cascada y chips de origen (editable, con recálculo en vivo)
- Reporte por supervisor
- La fila del supervisor en Liquidación Administración (adicional bloqueado + Ajuste de nivelación)
- El tab Historial de %

> **Respetar esa disposición como guía de UI.**
