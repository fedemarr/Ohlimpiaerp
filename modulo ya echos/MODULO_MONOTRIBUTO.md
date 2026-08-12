# MÓDULO MONOTRIBUTO — Especificación completa

**Sesión:** Lautaro + Claude · 11/08/2026
**Para:** Fede
**Nota:** documento independiente del relevamiento general.

---

## 1. Arquitectura del módulo — cómo se conecta todo

El módulo tiene **dos mundos que no hay que mezclar**:

- **PADRÓN** — los TABs existentes (Padrón, Fuera de categoría, Tablas de categorías y CUR, Historial de cambios). Es la foto maestra de análisis de categoría: está "congelada" y solo cambia con recategorización.
- **TAB NUEVO de Pago de monotributos** — mensual y operativo, porque el monotributo se paga todos los meses y eso no puede vivir en el padrón.

### Flujo definido

```
Padrón (fuente maestra)
   ↓
TAB Pagos arma su lista mensual desde el padrón
   → solo activos que trabajaron ese período
     (sale de la liquidación de horas: los que van a cobrar retiro)
   ↓
CONGELA los montos del mes (CUR vigente + adherentes)
   ↓
LIQUIDACIÓN descuenta esos importes congelados del retiro bruto
   ↓
RRHH exporta, paga y tilda
```

**Por qué así:** lo descontado, lo que hay que pagar y lo tildado son siempre la misma lista, y los cambios de tabla o categoría no tocan meses cerrados (política A.6 de vigencias).

---

## 2. TABs existentes (Padrón) — columnas a agregar

### ADHERENTES
Cantidad (0..N) + **MONTO TOTAL manual por persona**. Los casos reales son heterogéneos: hay una persona con 1 adherente y monto $0.

Reemplaza al campo "Con familia" del formulario. Con trazabilidad de los montos.

### MONOTRIBUTO A PAGAR
El CUR que sale de la tabla ARCA importada, según **categoría y zona** de la persona, con la **vigencia** correspondiente.

El campo "CUR manual" existente queda como excepción para pisar el valor.

### PENDIENTE DE ANÁLISIS
La convivencia entre las columnas "CUR + FAMILIA" de la tabla ARCA y el esquema de adherentes con monto manual queda **A ANALIZAR** más adelante.

Por ahora el CUR de la persona sale de las columnas individuales.

---

## 3. TAB nuevo: Pago de monotributos (mensual)

**Paso 1 —** Al abrir el mes, arma la lista desde el padrón con los activos que trabajaron el período (los que cobran retiro). Congela CUR + adherentes de ese mes.

**Paso 2 —** La liquidación de retiros descuenta del bruto: monotributo propio + adherentes + demás descuentos, y se deposita el neto.

**Paso 3 —** RRHH exporta la planilla del mes en **CSV** para subir al banco. Soportar los distintos métodos de pago que se usan, **cheque incluido**.

**Paso 4 —** RRHH tilda persona por persona a quién ya se le pagó el monotributo. Queda registrado **quién tildó, cuándo y con qué método**. Los no tildados quedan visibles como pendientes del mes.

---

## 4. Integración con Legajos

### Certificado MiPyME
- Adjuntar el archivo del certificado en el legajo
- **Con archivo:** estado `TRAMITADO`
- **Sin archivo:** etiqueta roja `MiPyME PENDIENTE` + notificación a RRHH/Administración
- Columna Pendiente/Tramitado en la lista de legajos
- **Dato útil:** el certificado vence el **30/04** de cada año (renovación automática de ARCA si la persona está al día) → conviene alerta anual

### Estado del CUIT
Mismo esquema que MiPyME: estado `ACTIVO`/`INACTIVO` de carga manual, con fecha de última verificación, columna en la lista y notificación de quiénes están inactivos.

### Clave fiscal (ARCA)
- Campo editable (ya existe en la ficha)
- **SIN** historial de claves
- **CON** fecha de última actualización visible
- Guardarla **encriptada** y visible solo por rol RRHH/Administración

### Adherentes
La cantidad y monto de adherentes del asociado se ven también en su legajo.

### N° INAES
El campo "N° INAES" de la ficha del legajo **ES el número de asociado/legajo**: debe completarse automáticamente con ese mismo número (hoy figura vacío).

---

## 5. Import inicial — archivo entregado

Se entrega **`IMPORT_MONOTRIBUTO_completo.xlsx`**:

- **413 personas únicas** (depurados 10 duplicados del origen)
- Match por **N° de socio**
- Contiene: clave ARCA + fecha, certificado MiPyME (`TRAMITADO`/`DESCARGADO`/`PENDIENTE`), estado CUIT (`ACTIVO`/`VERIFICAR`), adherentes con monto

**Datos a completar/verificar (celdas amarillas):**
- 37 sin dato de MiPyME
- 2 casos especiales de MiPyME: "dar de baja" y "tiene un error"
- 13 con estado CUIT a chequear
- 22 personas con adherentes; 1 caso con monto $0 a confirmar

Las celdas amarillas son lo que RRHH debe completar o verificar después del import.
