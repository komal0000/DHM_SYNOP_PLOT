# DHM SYNOP Weather Mapping System - Project Documentation

## 📋 Overview

**Purpose**: A comprehensive weather mapping and visualization system designed for meteorological data analysis and display, specifically focused on SYNOP (Surface Synoptic Observations) weather reports and upper air data.

**Goals**:
- Provide real-time weather station data visualization
- Generate meteorological contour maps (isobars, isotherms, pressure centers)
- Support both surface and upper air weather observations
- Enable data export and analysis capabilities
- Serve as a decision support tool for weather forecasting and analysis

**Key Features**:
- Interactive weather station mapping with OpenLayers
- SYNOP report processing and visualization
- Contour generation using Kriging interpolation
- Real-time data fetching from meteorological sources
- Multi-level weather data support (surface, 850hPa, 700hPa, 500hPa, 200hPa)
- PDF map export functionality

---

## 🏗️ Architecture & Structure

### **Backend Architecture (Django + PostgreSQL/PostGIS)**

```
weather_map/ (Django Project)
├── weather_map/ (Main Settings)
│   ├── settings.py (Configuration)
│   ├── urls.py (URL routing)
│   ├── celery.py (Background task configuration)
│   └── wsgi.py (WSGI application)
├── analysis/ (Main Django App)
│   ├── models.py (Data models)
│   ├── views.py (API endpoints)
│   ├── serializers.py (Data serialization)
│   ├── tasks.py (Background processing)
│   ├── contours.py (Map generation)
│   ├── urls.py (App routing)
│   └── management/commands/ (Custom commands)
├── static/ (Static files)
├── media/ (User uploads)
└── logs/ (Application logs)
```

### **Frontend Architecture (Vite + OpenLayers)**

```
frontend/
├── config.js (API configuration)
├── main.js (Application entry point)
├── index.html (Main HTML template)
├── style.css (Global styles)
├── layers.js (Map layer management)
├── interactions.js (Map interactions)
├── stations.js (Station data handling)
├── synop.js (SYNOP data processing)
└── utils.js (Utility functions)
```

### **Technology Stack**

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Backend Framework** | Django 5.2.6 | Web framework & API |
| **API Framework** | Django REST Framework | RESTful API development |
| **Database** | PostgreSQL + PostGIS | Spatial data storage |
| **Background Tasks** | Celery + Redis | Asynchronous processing |
| **Frontend Framework** | Vite | Build tool & dev server |
| **Mapping Library** | OpenLayers | Interactive maps |
| **Spatial Analysis** | MetPy, SciPy, NumPy | Weather data analysis |
| **Interpolation** | PyKrige | Spatial interpolation |
| **Data Processing** | Pandas, GeoPandas | Data manipulation |

### **Data Flow Architecture**

```
External Data Sources → Celery Tasks → Database → Django API → Frontend → User Interface
       ↓                    ↓            ↓           ↓          ↓           ↓
   [OGIMET API] → [Data Fetching] → [PostGIS] → [REST API] → [OpenLayers] → [Web Browser]
```

---

## 🔄 Workflow

### **Data Ingestion Pipeline**

1. **Station Data Import**
   ```
   CSV Files → Django Management Command → WeatherStation Model → PostGIS Database
   ```

2. **Weather Data Collection**
   ```
   External APIs (OGIMET) → Celery Scheduled Tasks → SYNOP Report Parsing → Database Storage
   ```

3. **Real-time Data Processing**
   ```
   Raw SYNOP Data → AAXX Format Parser → Structured Weather Data → Model Instances
   ```

### **Map Generation Workflow**

1. **Data Retrieval**
   ```
   User Request → API Endpoint → Database Query → Weather Data Selection
   ```

2. **Spatial Analysis**
   ```
   Point Data → Kriging Interpolation → Contour Generation → GeoJSON Output
   ```

3. **Visualization Pipeline**
   ```
   GeoJSON Data → OpenLayers Renderer → Interactive Map → User Display
   ```

### **Complete User Interaction Flow**

```
1. User opens application in browser
   ↓
2. Frontend loads and requests station data from API
   ↓
3. Django API queries PostGIS database for stations
   ↓
4. Stations displayed on OpenLayers map
   ↓
5. User selects observation time/level
   ↓
6. Frontend requests weather data for selected parameters
   ↓
7. Django API retrieves SYNOP reports from database
   ↓
8. Data processed and sent to frontend as JSON
   ↓
9. Frontend renders weather data on map
   ↓
10. Optional: User requests contour generation
    ↓
11. Backend performs spatial interpolation
    ↓
12. Contour data returned and displayed on map
    ↓
13. Optional: User exports map as PDF
```

### **Background Processing Flow**

```
Scheduled Tasks (Celery Beat)
    ↓
Data Fetching Tasks
    ↓
SYNOP Report Processing
    ↓
Database Updates
    ↓
Cache Invalidation
    ↓
Frontend Data Refresh
```

### **Key Data Transformations**

1. **SYNOP Format → Structured Data**
   ```
   AAXX 12345 12121 31560 10146 20012 39812 40182 52001 60001 81505 333 20012
   ↓
   {
     "station_id": "12345",
     "wind_direction": 315,
     "wind_speed": 60,
     "temperature": 14.6,
     "dew_point": 0.1,
     "pressure": 1014.6,
     ...
   }
   ```

2. **Point Data → Contour Maps**
   ```
   Weather Stations (Points) → Kriging Interpolation → Isobars/Isotherms (Lines)
   ```

### **API Endpoints Structure**

```
/api/
├── weather-stations/ (Station management)
├── reports/ (SYNOP reports)
├── isobars/ (Pressure contours)
├── isotherms/ (Temperature contours)
├── pressure-centers/ (Weather systems)
├── observation-times/ (Available timestamps)
├── grid/ (Grid data for interpolation)
└── export/ (Map export functionality)
```

---

## 🚀 Quick Start for Developers

### **Prerequisites**
- Python 3.13+
- PostgreSQL + PostGIS
- Redis
- Node.js + npm

### **Setup Commands**
```bash
# Backend setup
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py import_stations analysis/data/teststation.csv

# Frontend setup
cd frontend && npm install

# Start services
redis-server &
celery -A weather_map worker --loglevel=info &
celery -A weather_map beat --loglevel=info &
python manage.py runserver &
cd frontend && npm run dev
```

### **Development URLs**
- **Backend API**: http://127.0.0.1:8001/api/
- **Frontend**: http://localhost:5173/
- **Django Admin**: http://127.0.0.1:8001/admin/

This system provides a complete meteorological data visualization platform with real-time data processing, spatial analysis, and interactive mapping capabilities.