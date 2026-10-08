-- D9: unifica los tipos de servicio de solicitudes y vouchers con los del servicio (más OTRO).
-- Mismo mapa que LEGACY_SERVICE_TYPE_ALIASES en src/validators/service-types.ts. Idempotente:
-- volver a ejecutarlo no cambia nada porque los valores nuevos no están en el mapa.

-- Solicitudes: convierte cada tipo deseado y quita duplicados conservando el orden.
UPDATE "requests" r
SET "services" = (
  SELECT COALESCE(array_agg(t.value ORDER BY t.first_pos), ARRAY[]::text[])
  FROM (
    SELECT m.value, MIN(m.pos) AS first_pos
    FROM (
      SELECT CASE u.value
               WHEN 'HOTEL' THEN 'ALOJAMIENTO'
               WHEN 'AEREO' THEN 'PASAJE_AEREO'
               WHEN 'AÉREO' THEN 'PASAJE_AEREO'
               WHEN 'TOUR' THEN 'EXCURSION'
               WHEN 'TRANSFER' THEN 'TRASLADO'
               WHEN 'RENT_A_CAR' THEN 'ARRIENDO_AUTO'
               WHEN 'RESTAURANT' THEN 'OTRO'
               WHEN 'PAQUETE' THEN 'OTRO'
               ELSE u.value
             END AS value,
             u.pos
      FROM unnest(r."services") WITH ORDINALITY AS u(value, pos)
    ) m
    GROUP BY m.value
  ) t
)
WHERE r."services" && ARRAY['HOTEL', 'AEREO', 'AÉREO', 'TOUR', 'TRANSFER', 'RENT_A_CAR', 'RESTAURANT', 'PAQUETE']::text[];

-- Vouchers
UPDATE "vouchers"
SET "serviceType" = CASE "serviceType"
  WHEN 'HOTEL' THEN 'ALOJAMIENTO'
  WHEN 'AEREO' THEN 'PASAJE_AEREO'
  WHEN 'AÉREO' THEN 'PASAJE_AEREO'
  WHEN 'TOUR' THEN 'EXCURSION'
  WHEN 'TRANSFER' THEN 'TRASLADO'
  WHEN 'RENT_A_CAR' THEN 'ARRIENDO_AUTO'
  WHEN 'RESTAURANT' THEN 'OTRO'
  WHEN 'PAQUETE' THEN 'OTRO'
END
WHERE "serviceType" IN ('HOTEL', 'AEREO', 'AÉREO', 'TOUR', 'TRANSFER', 'RENT_A_CAR', 'RESTAURANT', 'PAQUETE');
