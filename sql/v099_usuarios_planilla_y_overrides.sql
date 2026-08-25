-- =============================================================================
-- Migración: v099 — Overrides individuales de la hoja "USUARIOS → PERFIL"
-- Fecha:    2026-08-24
-- Fuente:   MATRIZ_ACCESOS_PERFILES.xlsx
--           · hoja "USUARIOS → PERFIL" (37 usuarios)
--           · hoja "REGLAS DE LA GRILLA" (#6 y #7)
-- =============================================================================
--
-- ⚠️ ORDEN DE EJECUCIÓN
-- --------
-- 1. v098 (tablas + seed de la matriz).
-- 2. CREAR LAS CUENTAS: la hoja asigna perfil a 37 personas pero Supabase
--    Auth necesita un email real por cuenta. Los mails de la planilla son
--    nicknames sin dominio (ej. "jmelicabe"). Crear cada usuario desde
--    Configuración → Acceso y perfiles → "+ Nuevo usuario del sistema"
--    con el email definitivo (nick@<dominio>).
--
--    REGLAS #6 — los 4 de Logística SIN mail necesitan login propio igual:
--      Maximiliano Poncino            (LOGÍSTICA)
--      Miguel Angel Pereyra           (LOGÍSTICA — técnico de máquinas)
--      Lucas Ariel Sosa               (LOGÍSTICA)
--      Alex Federico Ramirez Recalde  (LOGÍSTICA)
--    Definir con Gabi qué dirección llevarán antes de crearlos.
--
--    Federico Martinez (fmartinez) mantiene PERFIL 'DEVELOPER' (REGLAS #6).
--
-- 3. Recién entonces correr ESTE archivo: matchea usuarios por prefijo de
--    email (LIKE 'nick@%') así que no importa el dominio, pero las filas
--    tienen que existir.
--
-- PERFILES SEGÚN LA HOJA (referencia rápida para el paso 2)
-- -------
--   GERENCIA GRAL : jmelicabe (Juan Manuel Eliçabe)
--   CONSEJO       : jcperetti (Juan Carlos Peretti — Presidente)
--   FINANZAS      : nguillen (Natividad Guillén), lelicabe (Lautaro Eliçabe),
--                   crecalde (Cecilia Recalde), jayala (Junior Ayala)
--   RRHH          : glucero, jmartinezguillen, melicabe, mramirez,
--                   mnoceti, nrodriguez
--   LOGÍSTICA     : rrecalde (Richard Recalde — Coordinador), + los 4 sin mail
--   VENTAS        : jbianchi (Jorgelina Bianchi), gmartinezguillen (Gina),
--                   ajuballes (Álvaro hijo), pelicabe (Polo Eliçabe)
--   AUDITOR       : mgmoure (Marcelo Gonzalez Moure — audita PRODUCTOS)
--   SUPERVISOR    : acacciato, aarispe, auballes, ccazenave, cgonzalez,
--                   dlage, lunzain, mmaidana, fbenvenuto, pscaglia, sayala
--   OPERACIONES   : relicabe (Ricardo Eliçabe), flascano (Fernando Lascano)
--   SISTEMAS/DEV  : fmartinez
--
-- Nota: el resto de la hoja son notas contextuales (Presidente, Tesorera,
-- Coordinador/a...) que se cargan como FUNCIÓN al crear el usuario, no como
-- overrides de acceso.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- REGLAS #7 — Bianchi (Secretaria) y Ricardo (Síndico) suman las LECTURAS del
-- perfil CONSEJO Directivo sobre su perfil de área:
-- donde CONSEJO ve algo (nivel > 0) y SU plantilla de área no les da nada
-- (nivel 0 o sin fila), se inserta un override de solo lectura (1).
-- Si su perfil de área ya les da acceso, no se toca nada.
-- -----------------------------------------------------------------------------
INSERT INTO public.usuario_accesos (usuario_id, modulo_key, nivel)
SELECT u.id, con.modulo_key, 1
FROM public.usuarios u
JOIN public.perfil_accesos con
  ON con.perfil = 'Consejo Directivo' AND con.nivel > 0
WHERE (u.email LIKE 'jbianchi@%' OR u.email LIKE 'relicabe@%')  -- Bianchi (VENTAS) · Ricardo (OPERACIONES)
  -- su plantilla de área NO cubre este módulo (o lo tiene en 0):
  AND NOT EXISTS (
    SELECT 1 FROM public.perfil_accesos p2
    WHERE p2.perfil = u.perfil
      AND p2.modulo_key = con.modulo_key
      AND p2.nivel > 0
  )
ON CONFLICT (usuario_id, modulo_key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Hoja USUARIOS fila 9 — Lautaro Eliçabe (FINANZAS):
--   "⚙ Override: + Configuración total (proyecto ERP)"
-- Finanzas tiene Configuración en L(1); él queda en M(2).
-- -----------------------------------------------------------------------------
INSERT INTO public.usuario_accesos (usuario_id, modulo_key, nivel)
SELECT id, 'configuracion', 2
FROM public.usuarios
WHERE email LIKE 'lelicabe@%'
ON CONFLICT (usuario_id, modulo_key)
DO UPDATE SET nivel = EXCLUDED.nivel;

-- -----------------------------------------------------------------------------
-- Hoja USUARIOS fila 20 — Miguel Angel Pereyra:
--   "Técnico máquinas: + M en tickets de Máquinas"
-- NO requiere override: la plantilla LOGÍSTICA ya le da M(2) en 'maquinas'
-- (sql/v098). Documentado para que no se busque una fila que no existe.
--
-- Hoja USUARIOS filas 35-37 — Fabio Benvenuto, Patricia Scaglia y Santiago
-- Ayala (SUPERVISOR): "+ auxiliar operaciones".
-- Lectura conservadora: les suma como override individual las lecturas de
-- los dos módulos de Operaciones que Supervisor no tiene: Clientes y
-- Supervisión de servicios. Si Gabi quiere que "auxiliar" alcance a más
-- módulos, agregarlos a esta lista.
-- -----------------------------------------------------------------------------
INSERT INTO public.usuario_accesos (usuario_id, modulo_key, nivel)
SELECT u.id, m.modulo_key, 1
FROM public.usuarios u
CROSS JOIN (VALUES ('clientes'), ('supervision')) AS m(modulo_key)
WHERE u.email LIKE 'fbenvenuto@%'
   OR u.email LIKE 'pscaglia@%'
   OR u.email LIKE 'sayala@%'
ON CONFLICT (usuario_id, modulo_key) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN POST-EJECUCIÓN
-- =============================================================================
-- Lecturas CONSEJO sumadas (debe devolver las filas insertadas):
--   SELECT u.nombre, ua.modulo_key
--   FROM usuario_accesos ua JOIN usuarios u ON u.id = ua.usuario_id
--   WHERE u.email LIKE 'jbianchi@%' OR u.email LIKE 'relicabe@%';
--
-- Lautaro con Configuración total:
--   SELECT u.nombre, ua.nivel FROM usuario_accesos ua
--   JOIN usuarios u ON u.id = ua.usuario_id WHERE u.email LIKE 'lelicabe@%';
-- =============================================================================
