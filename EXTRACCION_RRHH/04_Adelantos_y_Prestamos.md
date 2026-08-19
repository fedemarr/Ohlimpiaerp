# 04 — Adelantos y préstamos

Flujo de adelantos y préstamos a los asociados, con 3 niveles de aprobación
(Supervisor → RRHH → Finanzas) y un portal de autoservicio para el asociado.

---

## 4.1 Arquitectura del flujo

- **Shared (`src/modules/adelantos_prestamos_shared/`):**
  - `permisos.js`: `esSupervisor` (Supervisor), `esOperaciones` (Operaciones/Admin), `esRrhh` (RRHH/Admin), `esFinanzas` (Finanzas/Admin).
  - `flujo.js`: eventos con `{ejecutadoPor, ejecutadoRol}`; el ítem inicial lleva `supervisorNombre` y `origen`.
- **Entidades:** `pedidosAdelantos`, `pedidosAdelantosEventos`, `descuentosAdelantosPendientes` (v084). Tablas homónimas.

## 4.2 Pedidos de adelantos (`src/modules/pedidos_adelantos/`)

- **Propósito:** el Supervisor (o el asociado vía portal) solicita un adelanto que queda en la planilla de su servicio.
- **Mecánica (legacy para el portal, migrado para el pedido):** al solicitar se agrega un ítem `{nombre, nroSocio, monto, estado:'Pendiente', obs:motivo, origen:'asociado'}` a la **planilla Borrador del supervisor** del mes (`DB.planillasAdelantos`, match por `periodo===mes && supervisorNombre===legajo.supervisor && estado==='Borrador'`).
- Los préstamos van a `DB.solicitudesPrestamos` (ítem `{montoSolicitado, cuotasSolicitadas, montoCuota: round(monto/cuotas), estado:'Pendiente', obs, origen}`).
- **Regla de alerta:** si `monto >= DB.adelantosConfig.alertaMonto` (default 50000) → aviso de "aprobación especial" diferido.

## 4.3 Gestión de adelantos (`src/modules/gestion_adelantos/`)

- **Propósito:** revisión y aprobación por RRHH y Finanzas de las planillas de adelantos (formales e informales) y préstamos.
- **Distinción formal/informal:**
  - `DB.planillasAdelantos` = adelantos **formales** (planillas por mes/supervisor).
  - `DB.planillasInformales`, `DB.adelantosInformales` = adelantos **informales**.
  - `DB.prestamos`, `DB.solicitudesPrestamos` = préstamos con cuotas.
- **Estado del ítem para el asociado (`_calcEstadoAsociado`):** `Depositado > Rechazado > Aprobado > Aprobado por RRHH > En revisión RRHH > Aprobado por supervisor > Pendiente de supervisor`. Rechazo reporta `rechazadoPorRrhh→'RRHH'`, `resueltoPor` (default 'Finanzas').
- **Barra de progreso:** Supervisor → RRHH → Finanzas → Depositado.
- **Config:** `DB.adelantosConfig` — `montoFijo` (default 30000), `maxCuotas`, `tablaCuotas`, `alertaMonto` (50000).

## 4.4 Portal del asociado — Mis adelantos (`src/legacy.js:13100-13368`, pantalla `screen-mis_adelantos`)

- **Propósito:** el asociado ve sus pedidos de adelantos/préstamos y solicita nuevos.
- **Login (`auth.js` `loginAsociado`):** sesión **anónima de Supabase** (RLS "solo autenticados"); match legajo por `nro === nroSocio && nombre.includes(apellido) && estado === 'Activo'`; crea `usrAsoc {perfil:'Asociado', nroSocio}`. `iniciarSesion` navega a `'inicio'` y **no** inicia polling para Asociado.
- **Entidades leídas:** `DB.planillasAdelantos` (formal), `DB.planillasInformales` (informal), `DB.solicitudesPrestamos`, `DB.adelantosConfig`, `DB.legajos`.
- **Funciones:** `renderMisAdelantos`, `_calcEstadoAsociado`, `_getPrimerRechazo`, `_barraProgresoAdelantos`, `abrirModalSolicitarAsociado` (precarga legajo, tipo 'Adelanto', monto `montoFijo`), `actualizarModalAsoc` (muestra cuotas para Préstamo filtradas por `maxCuotas`), `confirmarSolicitudAsociado`.
- **Reglas:** Adelanto → ítem en planilla Borrador del supervisor del mes; Préstamo → ítem en `solicitudesPrestamos`; card coloreado por estado (rojo Rechazado / verde Depositado), badge + barra de progreso.
- **Permisos:** perfil Asociado (menú `['mis_adelantos','sugerencias']`).

## 4.5 Hallazgos / pendientes

- `mis_adelantos` **no aparece en el MENU actual** de state.js ni en SCREEN_CONFIG — en el monolito v164 el perfil Asociado sí tenía `modulos:['mis_adelantos']`. Candidato a completar la migración.
- El render legacy de Retenciones y Descuentos quedó como código muerto (ya hay módulos migrados).
