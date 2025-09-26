-- DELETE FROM public.analysis_upperairsynopreport
-- WHERE station_id IN (
--   SELECT station_id
--   FROM public.analysis_upperairweatherstation
--   WHERE ST_X(location::geometry) > 100
-- );
-- DELETE FROM public.analysis_upperairweatherstation
-- WHERE ST_X(location::geometry) > 100;

SELECT
  station_id,
  name,
  ST_Y(location::geometry) AS latitude,
  ST_X(location::geometry) AS longitude,
  elevation,
  country
FROM public.analysis_upperairweatherstation order by longitude desc;