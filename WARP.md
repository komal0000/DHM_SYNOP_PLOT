# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project summary
- Backend: Django + Django REST Framework with PostGIS (spatial) and Celery/Redis for background jobs
- Frontend: Vite-based app (OpenLayers) in frontend/
- Data domain: SYNOP surface observations and upper-air data; contour generation (isobars/isotherms/centers) using Kriging; geo output persisted to PostGIS and served as GeoJSON

Common commands
Backend (Python/Django)
- Create venv and install deps
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt

- Database setup (PostgreSQL with PostGIS already provisioned)
  python manage.py migrate

- Import station metadata (custom management commands)
  python manage.py import_stations analysis/data/teststation.csv
  python manage.py import_upperstations analysis/data/upperAirSation.csv

- Run dev server
  python manage.py runserver 0.0.0.0:8001

- Start Celery
  celery -A weather_map worker --loglevel=info
  celery -A weather_map beat --loglevel=info

- Manually trigger background tasks (from Django shell)
  python manage.py shell -c "from analysis.tasks import fetch_meteo_data; fetch_meteo_data.delay()"
  python manage.py shell -c "from analysis.upperair_task import fetch_upper_air_data; fetch_upper_air_data.delay()"

- Run all tests
  python manage.py test

- Run a single test
  python manage.py test analysis.tests.YourTestCase.test_method

Frontend (Vite/OpenLayers)
- Install deps
  cd frontend && npm install

- Dev server
  npm run dev

- Build
  npm run build

- Preview production build
  npm run serve

- One-shot startup script (optional)
  bash start_backend.sh

Key runtime expectations
- PostgreSQL with PostGIS and Redis must be running locally
- Configuration is read from .env via django-environ (see weather_map/settings.py for keys like SECRET_KEY, ALLOWED_HOSTS, DB_*, and CELERY_*). GDAL is picked up from CONDA_PREFIX when present.
- Dev URLs: Backend http://127.0.0.1:8001/ (API at /api/), Frontend http://localhost:5173/

High-level architecture and flow
- Django project weather_map
  - settings.py uses django-environ for secrets and DB; enables GIS backend (django.contrib.gis) with PostGIS; configures CORS and DRF; wires Celery to Redis at redis://localhost:6379/0 and schedules periodic tasks via CELERY_BEAT_SCHEDULE
  - urls.py mounts app APIs at /api/ and serves media

- analysis app (core domain logic)
  - Models capture stations and derived meteorology
    - WeatherStation, SynopReport (surface); UpperAirWeatherStation, UpperAirSynopReport (upper air)
    - Derived geospatial layers: Isobar, Isotherm, PressureCenter and upper-air equivalents; GridData as point collections; ExportedMap for saved outputs
  - Serializers expose GeoJSON via DRF GeoFeatureModelSerializer
  - Views provide read-only ViewSets for each layer with common filters
    - On GET, if a requested layer set is missing for a level/time, the view may opportunistically trigger generation (generate_contours or upper_air_generate_contours) and then respond with fresh data
    - Bounding box filters are supported; time parameters are ISO strings (Z or explicit offsets) normalized to timezones where needed
  - Contour generation
    - analysis/contours.py (surface) and analysis/upperair_counters.py (upper air) fetch point observations near the requested time, validate ranges, Krige to a grid (PyKrige), smooth with Gaussian filters, generate matplotlib contour lines, spline-smooth paths, and persist LineStrings to PostGIS (plus point centers)
  - Background tasks (Celery)
    - analysis/tasks.py fetches recent SYNOP AAXX reports from Ogimet for configured blocks, parses, and stores SynopReport rows; includes a periodic cleanup for exported maps
    - analysis/upperair_task.py scrapes TTAA upper-air soundings (Ogimet), parses level groups to UpperAirSynopReport
  - Management commands
    - import_stations and import_upperstations load station metadata from CSV (lat/lon in decimal degrees, elevation optional)

- Frontend (frontend/)
  - Vite-based OpenLayers UI consuming Django API
  - config.js reads window._env_ overrides (API_BASE_URL, GEOSERVER_URL) with sensible localhost defaults
  - Key modules: main.js entry, layers/interactions utilities, synop/upper air views, print/export helpers

Notable docs and their key takeaways
- PROJECT_DOCUMENTATION.md: end-to-end overview, quick start commands, and dev URLs; mirrors the flow summarized above
- SETUP.md and START_BACKEND_GUIDE.md: concrete environment setup and service startup recipes for Ubuntu, including Celery worker/beat, Redis/PostgreSQL checks, and sample import commands

Conventions and caveats
- Spatial DB: All geometries use SRID 4326; PostGIS is required
- Time handling: Incoming observation_time query params accept ISO strings; surface views normalize to UTC or Asia/Kathmandu where noted
- On-demand generation: Some read endpoints generate contours if none exist for the requested level/time; be aware of compute cost
- Frontend expects API at API_BASE_URL (default http://127.0.0.1:8001/) and uses /api/ endpoints registered in analysis/urls.py
