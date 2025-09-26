# DHM SYNOP Backend Server Startup Guide

## Prerequisites Check ✅

Your system has the following services ready:
- ✅ PostgreSQL is running
- ✅ Redis is running  
- ✅ Python virtual environment exists (`venv/`)
- ✅ Django 5.2.6 is installed

## Step-by-Step Backend Startup

### 1. Navigate to Project Directory
```bash
cd /home/komal/Downloads/DHM_SYNOP_PLOT
```

### 2. Activate Virtual Environment
```bash
source venv/bin/activate
```

### 3. Set Database Password (if needed)
If you encounter database connection issues, set the PostgreSQL password:
```bash
# Connect to PostgreSQL as postgres user
sudo -u postgres psql

# Set password for komal user
ALTER USER komal PASSWORD 'password123';

# Create database if it doesn't exist
CREATE DATABASE weather_map OWNER komal;

# Enable PostGIS extension
\c weather_map
CREATE EXTENSION IF NOT EXISTS postgis;

# Exit PostgreSQL
\q
```

### 4. Run Database Migrations
```bash
python manage.py migrate
```

### 5. Import Weather Station Data
```bash
python manage.py import_stations analysis/data/teststation.csv
```

### 6. Import Upper Air Stations (if available)
```bash
python manage.py import_upperstations analysis/data/upperAirSation.csv
```

### 7. Create Superuser (Optional - for admin access)
```bash
python manage.py createsuperuser
```

### 8. Start the Django Development Server
```bash
python manage.py runserver 0.0.0.0:8001
```

### 9. Start Celery Worker (in a new terminal)
```bash
# Open new terminal, navigate to project directory
cd /home/komal/Downloads/DHM_SYNOP_PLOT
source venv/bin/activate

# Start Celery worker
celery -A weather_map worker --loglevel=info
```

### 10. Start Celery Beat Scheduler (in another new terminal)
```bash
# Open another new terminal, navigate to project directory
cd /home/komal/Downloads/DHM_SYNOP_PLOT
source venv/bin/activate

# Start Celery beat scheduler
celery -A weather_map beat --loglevel=info
```

## Quick Start Script

Create this script to start everything easily:

```bash
#!/bin/bash
# File: start_backend.sh

cd /home/komal/Downloads/DHM_SYNOP_PLOT
source venv/bin/activate

echo "Starting Django development server..."
python manage.py runserver 0.0.0.0:8001 &
DJANGO_PID=$!

echo "Starting Celery worker..."
celery -A weather_map worker --loglevel=info &
CELERY_WORKER_PID=$!

echo "Starting Celery beat scheduler..."
celery -A weather_map beat --loglevel=info &
CELERY_BEAT_PID=$!

echo "Backend services started!"
echo "Django server: http://127.0.0.1:8001/"
echo "Django admin: http://127.0.0.1:8001/admin/"
echo "API endpoint: http://127.0.0.1:8001/api/"

# Function to cleanup on exit
cleanup() {
    echo "Stopping services..."
    kill $DJANGO_PID $CELERY_WORKER_PID $CELERY_BEAT_PID 2>/dev/null
    echo "All services stopped."
}

# Set trap to cleanup on script exit
trap cleanup EXIT

# Wait for user input to stop
echo "Press [CTRL+C] to stop all services..."
wait
```

## Access URLs

Once running, you can access:

- **Django Development Server**: http://127.0.0.1:8001/
- **Django Admin Panel**: http://127.0.0.1:8001/admin/
- **REST API**: http://127.0.0.1:8001/api/
- **Weather Stations API**: http://127.0.0.1:8001/api/weather-stations/
- **SYNOP Reports API**: http://127.0.0.1:8001/api/reports/

## Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
systemctl status postgresql

# Check if database exists
sudo -u postgres psql -l | grep weather_map

# Reset database password
sudo -u postgres psql
ALTER USER komal PASSWORD 'password123';
```

### Redis Connection Issues
```bash
# Check if Redis is running
systemctl status redis-server

# Test Redis connection
redis-cli ping
```

### Celery Issues
```bash
# Check if Redis is accessible for Celery
python -c "import redis; r=redis.Redis(); print('Redis ping:', r.ping())"

# Clear Celery tasks
celery -A weather_map purge
```

### Port Already in Use
```bash
# Find process using port 8001
sudo lsof -i :8001

# Kill process if needed
sudo kill -9 <PID>
```

## Environment Variables

Make sure your `.env` file contains:
```
SECRET_KEY="9fkh!f-@)rq2myg7!y&ola6cn3u4fbcn0g80of=(jgvab%vid9"
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,127.0.0.1:8000,127.0.0.1:8001,0.0.0.0,10.8.0.9

DB_NAME=weather_map
DB_USER=komal
DB_PASSWORD=password123
DB_HOST=localhost
DB_PORT=5432

REDIS_URL=redis://localhost:6379/0
```

## Testing the Backend

### Check API Endpoints
```bash
# Test weather stations endpoint
curl http://127.0.0.1:8001/api/weather-stations/

# Test observation times
curl http://127.0.0.1:8001/api/observation-times/

# Test with authentication (if required)
curl -H "Authorization: Token YOUR_TOKEN" http://127.0.0.1:8001/api/weather-stations/
```

### Manual Data Fetch (Optional)
```bash
# Activate Django shell
python manage.py shell

# In Django shell:
from analysis.tasks import fetch_meteo_data
fetch_meteo_data.delay()
```

## Default Login Credentials

From the documentation:
- **Username**: `dhm@2025`
- **Password**: `dhm@2025`