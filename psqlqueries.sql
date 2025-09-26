SELECT distinct s.observation_time,
    s.id,
    w.country,
	w."name",
    -- s.level,
    s.visibility,
    s.wind_direction,
    s.wind_speed,
    s.temperature,
    s.dew_point,
    s.pressure,
    s.pressure_tendency,
    s.pressure_change,
    s.cloud_cover,
    s.cloud_base,
    s.weather,
    s.station_id
FROM 
    public.analysis_synopreport s
INNER JOIN 
    public.analysis_weatherstation w
    ON s.station_id = w.station_id
WHERE 
    w.country = 'Nepal';
-- TRUNCATE TABLE public.analysis_synopreport;