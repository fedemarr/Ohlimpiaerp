SELECT id_local, numero, supervisor, servicio, puesto, urgencia, estado,
       nombre_candidato, obs, created_at
FROM pedidos
WHERE cargado_por = 'Administrador'
ORDER BY created_at DESC;
