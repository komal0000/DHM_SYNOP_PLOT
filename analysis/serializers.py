
from rest_framework import serializers
from rest_framework_gis.serializers import GeoFeatureModelSerializer
from django.contrib.gis.geos import GEOSGeometry
from .models import (WeatherStation, SynopReport, Isobar, Isotherm, PressureCenter, ExportedMap, GridData,UpperAirWeatherStation,UpperAirSynopReport,UpperAirIsobar,UpperAirIsotherm,UpperAirPressureCenter)
import logging
from django.core.exceptions import ValidationError as DjangoValidationError

logger = logging.getLogger(__name__)

class WeatherStationSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = WeatherStation
        geo_field = 'location'
        fields = ['station_id', 'name', 'location', 'elevation', 'country']
        extra_kwargs = {
            'location': {'write_only': False}  # Ensure location is readable
        }

    def validate_location(self, value):
        """Ensure valid Point geometry."""
        if not isinstance(value, GEOSGeometry) or value.geom_type != 'Point':
            logger.error(f"Invalid geometry for WeatherStation: {value}")
            raise serializers.ValidationError("Location must be a valid Point geometry.")
        return value
class UpperAirWeatherStationSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = UpperAirWeatherStation
        geo_field = 'location'
        fields = ['station_id', 'name', 'location', 'elevation', 'country']
        extra_kwargs = {
            'location': {'write_only': False}  # Ensure location is readable
        }

    def validate_location(self, value):
        """Ensure valid Point geometry."""
        if not isinstance(value, GEOSGeometry) or value.geom_type != 'Point':
            logger.error(f"Invalid geometry for WeatherStation: {value}")
            raise serializers.ValidationError("Location must be a valid Point geometry.")
        return value

class SynopReportSerializer(GeoFeatureModelSerializer):
    station_id = serializers.CharField(source='station.station_id', read_only=True)
    location = serializers.SerializerMethodField()

    class Meta:
        model = SynopReport
        geo_field = 'location'
        fields = [
            'id', 'station_id', 'location', 'observation_time', 'level',
            'wind_direction', 'wind_speed', 'temperature', 'dew_point',
            'sea_level_pressure', 'pressure_tendency', 'pressure_change', 'cloud_cover', 'visibility','cloud_low_type',
            'cloud_mid_type', 'cloud_high_type', 'weather_present', 'weather_past'
        ]
        extra_kwargs = {
            'wind_direction': {'min_value': 0, 'max_value': 360},
            'wind_speed': {'min_value': 0},
            'cloud_cover': {'min_value': 0, 'max_value': 8},
            'visibility': {'min_value': 0}
        }

    def get_location(self, obj):
        """Return station location as GeoJSON."""
        try:
            return obj.station.location.geojson
        except Exception as e:
            logger.error(f"Error serializing location for SynopReport {obj.id}: {e}")
            return None

    def validate(self, data):
        """Validate interdependent fields."""
        if data.get('pressure') is not None and (data['pressure'] < 800 or data['pressure'] > 1100):
            logger.warning(f"Invalid pressure value: {data['pressure']}")
            raise serializers.ValidationError("Pressure must be between 800 and 1100 hPa")
        if data.get('temperature') is not None and (data['temperature'] < -50 or data['temperature'] > 50):
            logger.warning(f"Invalid temperature value: {data['temperature']}")
            raise serializers.ValidationError("Temperature must be between -50 and 50 °C")
        if data.get('dew_point') is not None and data.get('temperature') is not None:
            if data['dew_point'] > data['temperature']:
                logger.warning(f"Dew point {data['dew_point']} exceeds temperature {data['temperature']}")
                raise serializers.ValidationError("Dew point cannot exceed temperature")
        return data

    def to_representation(self, instance):
        """Optimize related field queries."""
        self._context['prefetch_related'] = ['station']
        return super().to_representation(instance)
class UpperAirSynopReportSerializer(GeoFeatureModelSerializer):
    station_id = serializers.CharField(source='station.station_id', read_only=True)
    location = serializers.SerializerMethodField()

    class Meta:
        model = UpperAirSynopReport
        geo_field = 'location'
        fields = [
            'id', 'station_id', 'location', 'observation_time', 'level',
            'wind_direction', 'wind_speed', 'temperature', 'dew_point',
            'pressure', 'height'
        ]
        extra_kwargs = {
            'wind_direction': {'min_value': 0, 'max_value': 360},
            'wind_speed': {'min_value': 0}
        }

    def get_location(self, obj):
        """Return station location as GeoJSON."""
        try:
            return obj.station.location.geojson
        except Exception as e:
            logger.error(f"Error serializing location for UpperAirSynopReport {obj.id}: {e}")
            return None

    def to_representation(self, instance):
        """Optimize related field queries."""
        self._context['prefetch_related'] = ['station']
        return super().to_representation(instance)

class IsobarSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Isobar
        geo_field = 'geometry'
        fields = ['id', 'pressure', 'geometry', 'level', 'observation_time']
        extra_kwargs = {
            'geometry': {'write_only': False},
            'pressure': {'min_value': 800, 'max_value': 1100}
        }

    def validate_geometry(self, value):
        """Ensure valid LineString geometry."""
        if not isinstance(value, GEOSGeometry) or value.geom_type != 'LineString':
            logger.error(f"Invalid geometry for Isobar: {value}")
            raise serializers.ValidationError("Geometry must be a valid LineString.")
        if value.empty or len(value.coords) < 2:
            logger.warning(f"Empty or insufficient coordinates for Isobar geometry: {value}")
            raise serializers.ValidationError("LineString must have at least 2 points.")
        return value
class UpperAirIsobarSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = UpperAirIsobar
        geo_field = 'geometry'
        fields = ['id', 'pressure', 'geometry', 'level', 'observation_time']
        extra_kwargs = {
            'geometry': {'write_only': False},
            'pressure': {'min_value': 700, 'max_value': 16000}  # Updated to height range (meters)
        }

    def validate_geometry(self, value):
        """Ensure valid LineString geometry."""
        if not isinstance(value, GEOSGeometry) or value.geom_type != 'LineString':
            logger.error(f"Invalid geometry for UpperAirIsobar: {value}")
            raise serializers.ValidationError("Geometry must be a valid LineString.")
        if value.empty or len(value.coords) < 2:
            logger.warning(f"Empty or insufficient coordinates for UpperAirIsobar geometry: {value}")
            raise serializers.ValidationError("LineString must have at least 2 points.")
        return value

class IsothermSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Isotherm
        geo_field = 'geometry'
        fields = ['id', 'temperature', 'geometry', 'level', 'observation_time']
        extra_kwargs = {
            'geometry': {'write_only': False},
            'temperature': {'min_value': -50, 'max_value': 50}
        }

    def validate_geometry(self, value):
        """Ensure valid LineString geometry."""
        if not isinstance(value, GEOSGeometry) or value.geom_type != 'LineString':
            logger.error(f"Invalid geometry for Isotherm: {value}")
            raise serializers.ValidationError("Geometry must be a valid LineString.")
        if value.empty or len(value.coords) < 2:
            logger.warning(f"Empty or insufficient coordinates for Isotherm geometry: {value}")
            raise serializers.ValidationError("LineString must have at least 2 points.")
        return value

class UpperAirIsothermSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = UpperAirIsotherm
        geo_field = 'geometry'
        fields = ['id', 'temperature', 'geometry', 'level', 'observation_time']
        extra_kwargs = {
            'geometry': {'write_only': False},
            'temperature': {'min_value': -50, 'max_value': 50}
        }

    def validate_geometry(self, value):
        """Ensure valid LineString geometry."""
        if not isinstance(value, GEOSGeometry) or value.geom_type != 'LineString':
            logger.error(f"Invalid geometry for UpperAirIsotherm: {value}")
            raise serializers.ValidationError("Geometry must be a valid LineString.")
        if value.empty or len(value.coords) < 2:
            logger.warning(f"Empty or insufficient coordinates for UpperAirIsotherm geometry: {value}")
            raise serializers.ValidationError("LineString must have at least 2 points.")
        return value
class PressureCenterSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = PressureCenter
        geo_field = 'location'
        fields = ['id', 'center_type', 'location', 'pressure', 'level', 'observation_time']
        extra_kwargs = {
            'location': {'write_only': False},
            'pressure': {'min_value': 800, 'max_value': 1100}
        }

    def validate_location(self, value):
        """Ensure valid Point geometry."""
        if not isinstance(value, GEOSGeometry) or value.geom_type != 'Point':
            logger.error(f"Invalid geometry for PressureCenter: {value}")
            raise serializers.ValidationError("Location must be a valid Point geometry.")
        return value
class UpperAirPressureCenterSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = UpperAirPressureCenter
        geo_field = 'location'
        fields = ['id', 'center_type', 'location', 'pressure', 'level', 'observation_time']
        extra_kwargs = {
            'location': {'write_only': False},
            'pressure': {'min_value': 200, 'max_value': 850}  # Updated to upper air pressure range
        }

    def validate_location(self, value):
        """Ensure valid Point geometry."""
        if not isinstance(value, GEOSGeometry) or value.geom_type != 'Point':
            logger.error(f"Invalid geometry for UpperAirPressureCenter: {value}")
            raise serializers.ValidationError("Location must be a valid Point geometry.")
        return value

class ExportedMapSerializer(serializers.ModelSerializer):
    absolute_url = serializers.SerializerMethodField()

    class Meta:
        model = ExportedMap
        fields = ['id', 'file_name', 'map_type', 'absolute_url', 'created_at', 'level', 'observation_time']

    def get_absolute_url(self, obj):
        try:
            return obj.get_absolute_url()
        except Exception as e:
            logger.error(f"Error generating absolute URL for ExportedMap {obj.id}: {e}")
            return None

class GridDataSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = GridData
        geo_field = 'geometry'
        fields = ['id', 'level', 'observation_time', 'geometry']

    def validate_geometry(self, value):
        """Ensure valid GeometryCollection with Points."""
        if not isinstance(value, GEOSGeometry) or value.geom_type != 'GeometryCollection':
            logger.error(f"Invalid geometry for GridData: {value}")
            raise serializers.ValidationError("Geometry must be a valid GeometryCollection.")
        if not all(geom.geom_type == 'Point' for geom in value):
            logger.error(f"Non-Point geometries in GridData: {value}")
            raise serializers.ValidationError("GeometryCollection must contain only Points.")
        return value

    def to_representation(self, instance):
        """Optimize large GeoJSON output."""
        ret = super().to_representation(instance)
        geometry = ret.get('geometry')
        if geometry and len(geometry.get('geometries', [])) > 1000:
            logger.info(f"Serializing large GridData with {len(geometry.get('geometries', []))} points")
        return ret
