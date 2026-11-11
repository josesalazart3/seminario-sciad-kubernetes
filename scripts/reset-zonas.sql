-- ============================================================
-- SCIAD - Fase 8.3: deja SOLO las 3 zonas oficiales de acceso.
-- Lo ejecutan scripts/reset-datos.ps1 y .sh DENTRO de la misma transaccion y DESPUES de vaciar las tablas de negocio
-- (sin perfiles ni registros que apunten a zonas, las FK ON DELETE RESTRICT no chocan).
--
--   Puerta principal   seguridad MEDIO, riesgo MEDIO  (nivel normal)
--   Puerta secundaria  seguridad MEDIO, riesgo MEDIO  (nivel normal)
--   Bodega             seguridad ALTO,  riesgo ALTO   (zona restringida: el nivel mas alto de las 3)
--
-- Reglas: el nombre se compara sin distinguir mayusculas ni espacios sobrantes. Si una zona oficial no existe pero hay
-- una equivalente (p. ej. "Entrada Principal"), se RENOMBRA (conserva su id); si no hay ninguna, se crea. Toda otra zona
-- se borra. (zonas_acceso no tiene restricciones CHECK; se usan los mismos valores en mayusculas que el resto del sistema.)
-- Archivo solo ASCII a proposito: PowerShell 5.1 lo envia a psql como ASCII.
-- ============================================================
DO $$
DECLARE
    oficial record;
    zid integer;
    conservar integer[] := '{}';
BEGIN
    FOR oficial IN
        SELECT * FROM (VALUES
            (1, 'Puerta principal',  ARRAY['entrada principal', 'entrada', 'acceso principal', 'porton principal', 'puerta'], 'MEDIO', 'MEDIO', 200),
            (2, 'Puerta secundaria', ARRAY['entrada secundaria', 'acceso secundario', 'porton secundario', 'puerta trasera'], 'MEDIO', 'MEDIO', 100),
            (3, 'Bodega',            ARRAY['almacen', 'bodega principal'], 'ALTO', 'ALTO', 10)
        ) AS t(orden, nombre, equivalentes, seguridad, riesgo, capacidad)
        ORDER BY orden
    LOOP
        -- 1) misma zona (sin mayusculas ni espacios sobrantes); 2) si no, una equivalente; siempre la de menor id.
        SELECT z.id INTO zid FROM public.zonas_acceso z
         WHERE lower(regexp_replace(btrim(z.nombre), '\s+', ' ', 'g')) = lower(oficial.nombre)
           AND NOT (z.id = ANY (conservar))
         ORDER BY z.id LIMIT 1;
        IF zid IS NULL THEN
            SELECT z.id INTO zid FROM public.zonas_acceso z
             WHERE lower(regexp_replace(btrim(z.nombre), '\s+', ' ', 'g')) = ANY (oficial.equivalentes)
               AND NOT (z.id = ANY (conservar))
             ORDER BY z.id LIMIT 1;
        END IF;

        IF zid IS NULL THEN
            INSERT INTO public.zonas_acceso (nombre, nivel_seguridad, nivel_riesgo, capacidad, estado)
            VALUES (oficial.nombre, oficial.seguridad, oficial.riesgo, oficial.capacidad, 'activo')
            RETURNING id INTO zid;
            RAISE NOTICE 'Zona creada: % (id %)', oficial.nombre, zid;
        ELSE
            UPDATE public.zonas_acceso
               SET nombre = oficial.nombre, nivel_seguridad = oficial.seguridad, nivel_riesgo = oficial.riesgo,
                   capacidad = oficial.capacidad, estado = 'activo'
             WHERE id = zid;
            RAISE NOTICE 'Zona conservada: % (id %)', oficial.nombre, zid;
        END IF;
        conservar := conservar || zid;
    END LOOP;

    DELETE FROM public.zonas_acceso WHERE NOT (id = ANY (conservar));
    RAISE NOTICE 'Zonas finales: %', (SELECT count(*) FROM public.zonas_acceso);
END $$;
