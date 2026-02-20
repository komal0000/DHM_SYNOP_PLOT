#!/bin/bash
# Script to import administrative boundary shapefiles into PostgreSQL/PostGIS
# Usage: ./import.sh <shapefile_path> <table_name>

set -e

# Database configuration
DB_NAME="analysis"
DB_USER="admin"
DB_HOST="localhost"
DB_PORT="5432"
DB_PASSWORD="7n#2q04Iog|?"

# Check if correct number of arguments provided
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <shapefile_path> <table_name>"
    echo "Example: $0 /path/to/NPL_adm1.shp province"
    exit 1
fi

SHAPEFILE="$1"
TABLE_NAME="$2"

# Check if shapefile exists
if [ ! -f "$SHAPEFILE" ]; then
    echo "Error: Shapefile not found: $SHAPEFILE"
    exit 1
fi

echo "Importing shapefile: $SHAPEFILE"
echo "Table name: $TABLE_NAME"
echo "Database: $DB_NAME"

# Import shapefile to PostgreSQL using ogr2ogr
# This method automatically handles field lengths and special characters better than shp2pgsql
# -f "PostgreSQL": Output format
# -nln: New layer name (table name)
# -overwrite: Drop and recreate table if it exists
# -lco GEOMETRY_NAME=geom: Name the geometry column 'geom'
# -lco FID=gid: Name the feature ID column 'gid'
# -t_srs EPSG:4326: Transform to WGS84 coordinate system
ogr2ogr -f "PostgreSQL" \
  PG:"dbname=$DB_NAME user=$DB_USER password=$DB_PASSWORD host=$DB_HOST port=$DB_PORT" \
  "$SHAPEFILE" \
  -nln "$TABLE_NAME" \
  -nlt PROMOTE_TO_MULTI \
  -overwrite \
  -lco GEOMETRY_NAME=geom \
  -lco FID=gid \
  -t_srs EPSG:4326

# Create spatial index
echo "Creating spatial index..."
PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -d "$DB_NAME" -h "$DB_HOST" -p "$DB_PORT" -c \
  "CREATE INDEX IF NOT EXISTS ${TABLE_NAME}_geom_idx ON $TABLE_NAME USING GIST (geom);"

echo "Successfully imported $SHAPEFILE to table $TABLE_NAME"
echo ""
echo "Next steps:"
echo "1. Go to GeoServer: http://localhost:8080/geoserver"
echo "2. Go to Layers -> Add new layer"
echo "3. Select 'weather_data' store"
echo "4. Publish the layer '$TABLE_NAME'"
echo "5. Set workspace prefix to 'DHM:' or 'NepalAdmin:'"
