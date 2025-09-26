# DHM SYNOP Weather Mapping Project Setup

This is a Django-based weather mapping application with a Vite frontend that visualizes meteorological data using OpenLayers.

## Project Structure

- **Backend**: Django with PostGIS database, Celery for background tasks
- **Frontend**: Vite + OpenLayers for interactive weather maps
- **Key Features**: Weather station data, upper air data, contour plotting, SYNOP reports

## Prerequisites

Before setting up the project, ensure you have the following installed:

### System Requirements
```bash
# Install required system packages (Ubuntu/Debian)
sudo apt update
sudo apt install -y python3.13-venv python3-pip python3-full postgresql postgresql-contrib postgis redis-server

# Install Node.js (if not already installed)
snap install node --classic
```

### Database Setup (PostgreSQL with PostGIS)
```bash
# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql
CREATE DATABASE weather_map;
CREATE USER postgres WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE weather_map TO postgres;
CREATE EXTENSION postgis;
\q
```

## Installation Steps

### 1. Python Environment Setup
```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

### 2. Environment Configuration
The `.env` file has been created with default values. **Update the following**:
- `SECRET_KEY`: Generate a new Django secret key
- `DB_PASSWORD`: Use your PostgreSQL password
- `ALLOWED_HOSTS`: Add your domain/IP addresses

### 3. Frontend Setup
```bash
cd frontend
npm install
```

### 4. Django Database Setup
```bash
# Run migrations
python manage.py migrate

# Create superuser (optional)
python manage.py createsuperuser

# Load initial data (if available)
python manage.py loaddata analysis/fixtures/sample_data.json
```

### 5. Start Services

#### Start Redis (for Celery)
```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Start Celery Worker (background tasks)
```bash
# In a separate terminal
source venv/bin/activate
celery -A weather_map worker --loglevel=info
```

#### Start Celery Beat (scheduled tasks)
```bash
# In another separate terminal
source venv/bin/activate
celery -A weather_map beat --loglevel=info
```

#### Start Django Development Server
```bash
source venv/bin/activate
python manage.py runserver
```

#### Start Frontend Development Server
```bash
cd frontend
npm run dev
```

## Current Setup Status

✅ **Completed:**
- Project structure analysis
- Environment configuration (`.env` file created with proper credentials)
- Frontend dependencies installed
- Node.js installed
- Python virtual environment created and activated
- All Python dependencies installed (including pykrige, django-environ)
- PostgreSQL database configured with PostGIS extension
- Django migrations completed successfully
- Redis server running for Celery
- **Backend service running** at http://127.0.0.1:8000/
- **Frontend service running** at http://localhost:5173/

✅ **All setup tasks completed successfully!**

## Manual Steps Required

1. **Install system packages:**
   ```bash
   sudo apt install python3.13-venv python3-pip python3-full postgresql postgresql-contrib postgis redis-server
   ```

2. **Create Python virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Setup PostgreSQL database:**
   - Create database and user
   - Install PostGIS extension

4. **Update `.env` file with your actual credentials**

## Key Files

- `weather_map/settings.py` - Django configuration
- `frontend/package.json` - Frontend dependencies
- `requirements.txt` - Python dependencies
- `analysis/` - Main Django app with weather data models
- `manage.py` - Django management commands

## Development URLs

- Django Backend: http://127.0.0.1:8000/
- Frontend (Vite): http://127.0.0.1:5173/
- Django Admin: http://127.0.0.1:8000/admin/

## Troubleshooting

### Common Issues:

1. **"externally-managed-environment" error:**
   - Install `python3-venv` system package
   - Use virtual environment instead of system Python

2. **PostgreSQL connection errors:**
   - Ensure PostgreSQL is running
   - Check database credentials in `.env`
   - Verify PostGIS extension is installed

3. **Frontend build errors:**
   - Ensure Node.js is installed
   - Run `npm install` in frontend directory
   - Check for dependency conflicts

4. **Celery connection errors:**
   - Ensure Redis is running
   - Check Redis URL in settings

## Next Steps

1. Install the required system packages
2. Complete the Python environment setup
3. Run Django migrations
4. Test the application
5. Load sample data for development