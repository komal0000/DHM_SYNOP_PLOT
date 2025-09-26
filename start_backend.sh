#!/bin/bash
# DHM SYNOP Backend Services Startup Script

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project directory
PROJECT_DIR="/home/komal/Downloads/DHM_SYNOP_PLOT"

echo -e "${BLUE}=== DHM SYNOP Backend Startup Script ===${NC}"
echo -e "${YELLOW}Project Directory: $PROJECT_DIR${NC}"

# Navigate to project directory
cd "$PROJECT_DIR" || {
    echo -e "${RED}Error: Could not navigate to project directory${NC}"
    exit 1
}

# Check if virtual environment exists
if [ ! -f "venv/bin/activate" ]; then
    echo -e "${RED}Error: Virtual environment not found. Please create it first.${NC}"
    exit 1
fi

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source venv/bin/activate

# Check if Django is installed
python -c "import django" 2>/dev/null || {
    echo -e "${RED}Error: Django not found in virtual environment${NC}"
    exit 1
}

# Check services
echo -e "${BLUE}Checking required services...${NC}"

# Check PostgreSQL
if ! systemctl is-active --quiet postgresql; then
    echo -e "${RED}Error: PostgreSQL is not running${NC}"
    echo -e "${YELLOW}Start it with: sudo systemctl start postgresql${NC}"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL is running${NC}"

# Check Redis
if ! systemctl is-active --quiet redis-server && ! systemctl is-active --quiet redis; then
    echo -e "${RED}Error: Redis is not running${NC}"
    echo -e "${YELLOW}Start it with: sudo systemctl start redis-server${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Redis is running${NC}"

# Run migrations
echo -e "${BLUE}Running database migrations...${NC}"
python manage.py migrate || {
    echo -e "${RED}Error: Database migration failed${NC}"
    echo -e "${YELLOW}You may need to set up the database first. Check the troubleshooting guide.${NC}"
    exit 1
}

# Import weather station data (if not already imported)
if [ -f "analysis/data/teststation.csv" ]; then
    echo -e "${BLUE}Importing weather station data...${NC}"
    python manage.py import_stations analysis/data/teststation.csv 2>/dev/null || {
        echo -e "${YELLOW}Weather station data may already be imported${NC}"
    }
fi

# Import upper air station data (if available and not already imported)
if [ -f "analysis/data/upperAirSation.csv" ]; then
    echo -e "${BLUE}Importing upper air station data...${NC}"
    python manage.py import_upperstations analysis/data/upperAirSation.csv 2>/dev/null || {
        echo -e "${YELLOW}Upper air station data may already be imported${NC}"
    }
fi

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Stopping services...${NC}"
    if [ ! -z "$DJANGO_PID" ]; then
        kill $DJANGO_PID 2>/dev/null
        echo -e "${GREEN}✓ Django server stopped${NC}"
    fi
    if [ ! -z "$CELERY_WORKER_PID" ]; then
        kill $CELERY_WORKER_PID 2>/dev/null
        echo -e "${GREEN}✓ Celery worker stopped${NC}"
    fi
    if [ ! -z "$CELERY_BEAT_PID" ]; then
        kill $CELERY_BEAT_PID 2>/dev/null
        echo -e "${GREEN}✓ Celery beat scheduler stopped${NC}"
    fi
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Start Django development server
echo -e "${BLUE}Starting Django development server...${NC}"
python manage.py runserver 0.0.0.0:8001 &
DJANGO_PID=$!

# Wait a moment for Django to start
sleep 2

# Check if Django started successfully
if ! kill -0 $DJANGO_PID 2>/dev/null; then
    echo -e "${RED}Error: Django server failed to start${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Django server started (PID: $DJANGO_PID)${NC}"

# Start Celery worker
echo -e "${BLUE}Starting Celery worker...${NC}"
celery -A weather_map worker --loglevel=info &
CELERY_WORKER_PID=$!
echo -e "${GREEN}✓ Celery worker started (PID: $CELERY_WORKER_PID)${NC}"

# Start Celery beat scheduler
echo -e "${BLUE}Starting Celery beat scheduler...${NC}"
celery -A weather_map beat --loglevel=info &
CELERY_BEAT_PID=$!
echo -e "${GREEN}✓ Celery beat scheduler started (PID: $CELERY_BEAT_PID)${NC}"

# Display access information
echo -e "\n${GREEN}=== Backend services started successfully! ===${NC}"
echo -e "${BLUE}Access URLs:${NC}"
echo -e "  Django server:     ${YELLOW}http://127.0.0.1:8001/${NC}"
echo -e "  Django admin:      ${YELLOW}http://127.0.0.1:8001/admin/${NC}"
echo -e "  API endpoint:      ${YELLOW}http://127.0.0.1:8001/api/${NC}"
echo -e "  Weather stations:  ${YELLOW}http://127.0.0.1:8001/api/weather-stations/${NC}"

echo -e "\n${GREEN}Default login credentials:${NC}"
echo -e "  Username: ${YELLOW}dhm@2025${NC}"
echo -e "  Password: ${YELLOW}dhm@2025${NC}"

echo -e "\n${BLUE}Press [CTRL+C] to stop all services...${NC}"

# Wait for user input or process termination
wait $DJANGO_PID