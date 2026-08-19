# REORGANIZACIÓN DEL MENÚ Y PERMISOS

**Sesión:** Lautaro + Claude · 12/08/2026
**Para:** Fede

---

## 1. Regla general — áreas vs. permisos

El área del menú donde vive un módulo es **ORGANIZACIÓN, no un límite de acceso**.

Quién ve y quién modifica cada módulo se define **POR ROL** en `Configuración → Accesos y perfiles`.

> **Ejemplo dado por Lautaro:** Monotributos vive en Finanzas, pero el usuario de RRHH es quien opera y hace modificaciones dentro de ese módulo.

---

## 2. Movimientos de módulos

| # | Módulo | Desde | Hacia |
|---|---|---|---|
| 1 | Altas de asociados | Ingreso | **SELECCIÓN** |
| 2 | Legajos | Ingreso | **PERSONAL** |
| 3 | Reasignaciones | Ingreso | **OPERACIONES** |
| 4 | Monotributos | Ingreso | **FINANZAS** |
| 5 | Uniformes | Ingreso + Logística | **LOGÍSTICA** (queda uno solo) |
| 6 | Retenciones | Ingreso | **FINANZAS** |
| 7 | Situaciones legales | Seguimiento | **PERSONAL** |
| 8 | Enfermos y accidentes | Seguimiento | **PERSONAL** |
| 9 | Sanciones | Operaciones | **PERSONAL** |
| 10 | Feriados | Operaciones | **ADMINISTRACIÓN** |
| 11 | Pedidos de adelantos | Operaciones | **FINANZAS** |

**Notas:**
- **Altas de asociados** pasa a SELECCIÓN porque cierra el flujo: candidato → psicotécnico → preocupacional → documentación → alta.
- **Uniformes** estaba **duplicado** en Ingreso y Logística. Queda **uno solo** en LOGÍSTICA.

### Secciones que desaparecen
**INGRESO** y **SEGUIMIENTO** — quedaron vacías.

---

## 3. Menú final

> Dentro de cada área, los módulos van en **ORDEN ALFABÉTICO**.

### SELECCIÓN
- Altas de asociados
- Candidatos
- Documentación de ingreso
- Pedidos de personal
- Pre-ocupacional
- Psicotécnico

### LOGÍSTICA
- Stock
- Uniformes

### OPERACIONES
- Liquidación Administración
- Liquidación de horas
- Mantenimiento
- Reasignaciones
- Retenes

### COMERCIAL
- Clientes
- Comisiones
- CRM Comercial
- Gestión de cobros
- Gestión de precios
- Reclamos y NC
- Servicios

### PERSONAL
- Capacitaciones
- Competencia anual
- Descansos
- Enfermos y accidentes
- Legajos
- Sanciones
- Situaciones legales
- Vacaciones

### ADMINISTRACIÓN
- Categorías
- Configuración
- Feriados
- Paritarias
- SMVM histórico

### FINANZAS
- Gestión de adelantos
- Liquidaciones
- Monotributos
- Pedidos de adelantos
- Reportes y sugerencias
- Retenciones

### PRÓXIMAMENTE
- Máquinas

---

## 4. Permisos del rol RRHH

- **Área Personal:** el rol de RRHH debe **VER toda el área PERSONAL**. Hoy no ve Situaciones legales ni Enfermos y accidentes → **corregir**.
- **Finanzas:** RRHH **opera y modifica** dentro de Monotributos y Retenciones, aunque esos módulos vivan en Finanzas.
- **Resto:** el ajuste fino de cada usuario se hace en `Configuración → Accesos y perfiles`, como siempre.
