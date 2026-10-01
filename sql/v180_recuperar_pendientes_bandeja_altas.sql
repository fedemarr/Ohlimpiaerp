-- =============================================================================
-- v180 — Diagnóstico (NO es una migración de schema, no hay DDL): bandeja
--        de Pendientes de Alta atascada ("recuperar datos de la carpeta y
--        migrar a Legajos")
-- Fecha:     01/10/2026
-- Autor:     Fede
-- =============================================================================
--
-- RESULTADO CONFIRMADO (01/10/2026, corrido contra producción)
-- --------------------------------------------------------------
-- El PASO 1 confirmó que hoy hay exactamente 10 filas en
-- 'Pendiente de alta', TODAS caso C (sin legajo, snapshot de
-- cat_alt_pendientes vacío salvo uniforme). El PASO 2 confirmó que las 10
-- SÍ tienen su candidato original en `candidatos` (DNI, CUIT, email, tel,
-- domicilio, fecha de nac., estado civil, género) — "la carpeta" del
-- ticket es la tabla `candidatos`, no un snapshot ni un bucket.
--
-- CONCLUSIÓN: no hace falta ningún INSERT ni UPDATE por SQL para estas 10
-- personas. El camino es abrir "Registrar alta →" desde la bandeja para
-- cada una — el modal de Alta ya cruza por DNI contra `candidatos` y
-- precarga identificación/domicilio solo (altas.js:452-479). Completar a
-- mano lo que nunca sale de una postulación (servicio, supervisor,
-- categoría, período de prueba, forma de pago, integración, obra social,
-- banco/CBU, fecha de ingreso) y confirmar — ahí se crea el legajo y la
-- fila sale sola de la bandeja (altas.js:1227-1242 marca 'Alta completada').
--
-- Dos datos de origen para avisarle a quien cargue estas altas (no se
-- tocaron, son de `candidatos`, no un bug de este sistema):
--  - Accogli Franco (DNI 33198099): el CUIT cargado en `candidatos`
--    (20-46637684-2) no corresponde numéricamente a ese DNI — verificar
--    antes de confirmar el alta.
--  - Varios nombres tienen tabs/espacios de más pegados del origen
--    ("Gomez[TAB]Ayelen Andrea ", "Accogli[TAB]Franco", etc.) — limpiarlos
--    al cargar el nombre para que no queden así en el legajo.
--
-- El PASO 3 (UPDATE, caso A) queda documentado más abajo para el día que
-- aparezca ese caso — hoy no aplica a ninguna de las 10 filas actuales.
-- =============================================================================
--
-- CONTEXTO (investigación original, antes de correr el diagnóstico)
-- --------
-- Ticket: "hay asociados en la bandeja de pendientes cuyos datos se
-- guardaron en una carpeta; hay que recuperarlos y pasarlos a Legajos, y
-- que desaparezcan de la bandeja".
--
-- Investigación (sin tocar nada todavía):
-- - La "bandeja de pendientes" de Altas es un FILTRO, no una tabla aparte:
--   renderAltas()/filtrarAltas() (src/modules/altas/altas.js:19-50) muestran
--   toda fila de `cat_alt_pendientes` con estado = 'Pendiente de alta'.
-- - "La carpeta donde quedaron guardados los datos" no es un bucket de
--   Storage ni una carpeta de archivos — no existe nada así en el repo ni
--   en Supabase Storage (se revisaron todos los `.storage.from(...)` del
--   código: 'ohlimpia-adjuntos' y 'finflow-docs', ninguno guarda datos
--   estructurados de personas, solo PDFs/imágenes sueltas). Lo que SÍ
--   existe, y es casi seguro a lo que se refiere el ticket, son los 7
--   campos jsonb de snapshot de cada fila de `cat_alt_pendientes`
--   (identificacion, domicilio, operativo, uniforme, capital, seguros,
--   cuenta_bancaria) — ahí queda TODO lo que RRHH ya tipeó para esa
--   persona, se haya terminado el alta o no (ver altas.js:401-402,
--   abrirModalAlta() precarga el modal desde ahí).
-- - Hay un bug de código ya corregido (commit da63b72, 30/09/2026):
--   confirmarAlta() comparaba `a.id === altaId` (number) contra un id
--   reconstruido como string tras un reload — la comparación daba
--   siempre false, el legajo se creaba bien pero `cat_alt_pendientes`
--   nunca pasaba a 'Alta completada'. Confirmado en producción: 9 de
--   cada 10 altas revisadas al azar tenían este problema (ver
--   PENDIENTES_FEDE.md, sección "Bug crítico real"). El fix de código ya
--   está andando; este script es la limpieza de los datos que quedaron
--   mal MIENTRAS el bug estuvo activo — el mismo pendiente que esa
--   sección de PENDIENTES_FEDE.md dejó esperando tu OK.
-- - Precedente de un bug más viejo y ya resuelto una vez (sql/v129): antes
--   de que confirmarAlta() esperara y chequeara el resultado del guardado
--   del legajo, un fallo de red podía dejar `cat_alt_pendientes` marcada
--   'Alta completada' SIN que el legajo llegara a existir — la
--   recuperación en ese caso fue reconstruir el legajo a mano desde el
--   snapshot jsonb (INSERT INTO legajos con los valores reales, revisados
--   persona por persona). Ese bug de guardado-no-chequeado también está
--   corregido (altas.js:1139-1149, ya espera y verifica supaSync).
--
-- Con el fix de código ya aplicado, lo que puede haber HOY en la bandeja
-- de "Pendiente de alta" cae en 3 casos distintos, y cada uno se resuelve
-- distinto:
--   (A) Ya tiene un legajo ACTIVO con el mismo DNI (el caso del bug de
--       da63b72: el legajo SÍ se creó, solo quedó mal marcado el estado
--       de origen). No hay que recuperar ni migrar ningún dato — nada se
--       perdió. Sobra con un UPDATE de estado.
--   (B) NO tiene legajo, pero el snapshot jsonb tiene los datos mínimos
--       para reconstruirlo (nombre, dni, domicilio, etc. completos).
--       Necesita un INSERT a `legajos` armado a mano desde ese snapshot
--       (mismo patrón que sql/v129) — a propósito NO se genera ese INSERT
--       automáticamente acá: son datos reales de personas y el snapshot
--       de distintas épocas del alta no siempre tiene las mismas claves
--       dentro de cada jsonb, así que conviene mirar cada caso antes de
--       escribir los VALUES (el PASO 2 de este script da el detalle ya
--       aplanado para que sea rápido de armar).
--   (C) NO tiene legajo y el snapshot está incompleto (alta recién
--       empezada, RRHH no llegó a cargar todo). No se puede migrar por
--       SQL sin inventar datos — hay que completarla a mano desde la UI
--       (botón "Registrar alta →" de la bandeja, que ya precarga todo lo
--       que esa persona tiene guardado).
--
-- NADA de este script se ejecuta solo. Es 100% de solo lectura hasta el
-- PASO 3, y el PASO 3 (el único UPDATE) queda comentado a propósito.
-- =============================================================================


-- =====================================================================
-- PASO 1 — Panorama general: cuántas filas hay en la bandeja hoy y en
-- qué caso (A/B/C) cae cada una. Correr esto primero y mirar los
-- números antes de seguir.
-- =====================================================================
SELECT
  cap.id_local,
  cap.nombre          AS nombre_en_altas,
  cap.dni,
  cap.fecha           AS fecha_alta_iniciada,
  cap.rrhh,
  l.nro               AS legajo_nro_si_existe,
  l.estado            AS legajo_estado_si_existe,
  CASE
    WHEN l.nro IS NOT NULL AND l.estado = 'Activo' THEN 'A — ya tiene legajo activo, solo falta cerrar el estado'
    WHEN l.nro IS NULL
         AND cap.identificacion ? 'nombre' AND cap.identificacion ? 'dni'
         AND cap.domicilio ? 'direccion'
         AND cap.operativo ? 'servicio'
      THEN 'B — sin legajo, snapshot con datos suficientes para reconstruir'
    WHEN l.nro IS NULL THEN 'C — sin legajo, snapshot incompleto: completar a mano desde la UI'
    ELSE 'revisar a mano (legajo existe pero con otro estado, ej. Baja)'
  END AS caso
FROM public.cat_alt_pendientes cap
LEFT JOIN public.legajos l ON l.dni = cap.dni
WHERE cap.estado = 'Pendiente de alta'
ORDER BY caso, cap.fecha;


-- =====================================================================
-- PASO 2 — Para los casos B (sin legajo, con snapshot aprovechable):
-- esto aplana los 7 jsonb en columnas para que arrancar el INSERT a
-- legajos (uno por uno, como sql/v129) sea copiar y pegar en vez de
-- transcribir a mano. NO inserta nada — es una consulta de lectura.
--
-- CORRECCIÓN (01/10, tras correr esto contra producción): el primer
-- intento de esta consulta pedía identificacion/domicilio/operativo del
-- JSONB de cat_alt_pendientes — y salió TODO null salvo uniforme, para
-- las 10 filas reales que hay hoy sin legajo. Eso NO significa que no
-- haya datos: _crearAltaDesdeDocum() (src/modules/documentacion/
-- documentacion.js:442-461) arranca esos 7 jsonb vacíos a propósito y
-- recién se llenan cuando alguien abre el modal de Alta y lo completa —
-- estas 10 personas nunca llegaron a esa parte. Los campos de verdad
-- confiables en este punto son las columnas PLANAS de cat_alt_pendientes
-- (nombre, dni, tel, zona — las llena _crearAltaDesdeDocum() siempre) y,
-- sobre todo, la tabla `candidatos` (su postulación original): el modal
-- de Alta YA cruza por DNI contra `candidatos` y precarga desde ahí CUIT,
-- fecha de nacimiento, email, estado civil, domicilio, género y
-- nacionalidad (altas.js:452-479) — es decir, "la carpeta" del ticket es
-- muy probablemente ESTO, no el snapshot de cat_alt_pendientes.
-- =====================================================================
SELECT
  cap.id_local,
  cap.nombre                               AS nombre_en_bandeja,
  cap.dni,
  cap.tel                                  AS tel_en_bandeja,
  cap.zona                                 AS zona_en_bandeja,
  cap.fecha                                AS fecha_alta_iniciada,
  cap.rrhh,
  cand.id_local                            AS candidato_id_local,
  cand.cuit                                AS candidato_cuit,
  cand.email                               AS candidato_email,
  cand.tel                                 AS candidato_tel,
  cand.fec_nac                             AS candidato_fec_nac,
  cand.estado_civil                        AS candidato_estado_civil,
  cand.genero                              AS candidato_genero,
  cand.calle                               AS candidato_calle,
  cand.piso                                AS candidato_piso,
  cand.zona                                AS candidato_zona,
  cand.localidad                           AS candidato_localidad,
  cap.uniforme                             AS uniforme_jsonb,
  (SELECT COALESCE(MAX(nro), 0) + 1 FROM public.legajos) AS proximo_nro_socio_sugerido
FROM public.cat_alt_pendientes cap
LEFT JOIN public.legajos l    ON l.dni = cap.dni
LEFT JOIN public.candidatos cand ON cand.dni = cap.dni
WHERE cap.estado = 'Pendiente de alta' AND l.nro IS NULL
ORDER BY cap.fecha;

-- Si `candidato_id_local` NO es null para una fila: esa persona tiene su
-- postulación completa en `candidatos` y el camino correcto es abrir
-- "Registrar alta →" para ella desde la bandeja — el modal va a
-- autocompletar identificación/domicilio solo (no hace falta ningún
-- INSERT por SQL, no se perdió ningún dato).
--
-- Si `candidato_id_local` SÍ es null (no hay match por DNI ni en
-- candidatos): ahí sí sería el caso C real — no hay ninguna fuente de
-- datos conocida en el sistema, hay que conseguir los datos de otro
-- lado (RRHH/papel) y cargarlos a mano desde la UI.
--
-- El caso B (snapshot de cat_alt_pendientes YA completo, reconstrucción
-- tipo sql/v129) solo aplica si una fila de esta consulta tuviera
-- identificacion/domicilio/operativo con datos reales — hoy no es el
-- caso de ninguna de las 10, así que ese INSERT manual probablemente NO
-- hace falta para esta tanda. Si en el futuro aparece una fila así, armar
-- el INSERT a mano igual que sql/v129_recuperar_legajos_perdidos.sql.


-- =====================================================================
-- PASO 3 — Para los casos A (ya tiene legajo activo, mismo DNI): cerrar
-- la bandeja sin tocar el legajo. Reversible (UPDATE de vuelta a
-- 'Pendiente de alta' si hiciera falta). Comentado a propósito — revisar
-- la lista del PASO 1 (caso 'A') antes de descomentar y correr.
-- =====================================================================
-- UPDATE public.cat_alt_pendientes cap
--    SET estado = 'Alta completada',
--        operativo = COALESCE(cap.operativo, '{}'::jsonb)
--                     || jsonb_build_object(
--                          'notaImportacion',
--                          'Cerrada por v180 — ya tenía legajo activo N° ' ||
--                            (SELECT l.nro FROM public.legajos l WHERE l.dni = cap.dni AND l.estado = 'Activo' LIMIT 1) ||
--                          ' (bug de confirmarAlta()/id string vs number, fix en da63b72)'
--                        )
--   FROM public.legajos l
--  WHERE l.dni = cap.dni
--    AND l.estado = 'Activo'
--    AND cap.estado = 'Pendiente de alta';

-- Verificación sugerida después del PASO 3 (debería devolver 0 filas: ya
-- no debería quedar ninguna fila "Pendiente de alta" con un legajo activo
-- del mismo DNI):
-- SELECT cap.id_local, cap.nombre, cap.dni, l.nro
--   FROM public.cat_alt_pendientes cap
--   JOIN public.legajos l ON l.dni = cap.dni AND l.estado = 'Activo'
--  WHERE cap.estado = 'Pendiente de alta';

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
