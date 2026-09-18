-- v146: ajuste de wording pendiente de v145 (confirmado por el usuario)
-- — alinea el motivo de cancelación "El cliente redujo horas" al texto
-- literal del ticket "Reducción de horas". Solo dato (UPDATE nombre),
-- no toca id_local/codigo ni esquema. No afecta pedidos ya cancelados
-- con este motivo (motivo_cancelacion guarda el texto como snapshot al
-- momento de cancelar, no una referencia al catálogo).
BEGIN;

UPDATE public.pedidos_motivos_cancelacion
SET nombre = 'Reducción de horas', updated_at = now()
WHERE id_local = 'mot_reduccion';

COMMIT;

-- Verificación sugerida después de correr:
-- SELECT id_local, nombre FROM public.pedidos_motivos_cancelacion ORDER BY orden;
