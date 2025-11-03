
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework_gis.filters import InBBoxFilter
from .models import (WeatherStation, SynopReport, Isobar, Isotherm, PressureCenter, ExportedMap, GridData,UpperAirWeatherStation,UpperAirSynopReport,UpperAirIsobar,UpperAirIsotherm,UpperAirPressureCenter)
from .serializers import (
    WeatherStationSerializer, SynopReportSerializer, IsobarSerializer,
    IsothermSerializer, PressureCenterSerializer, ExportedMapSerializer, GridDataSerializer,
    UpperAirWeatherStationSerializer, UpperAirSynopReportSerializer, UpperAirIsobarSerializer,
    UpperAirIsothermSerializer, UpperAirPressureCenterSerializer
)
from rest_framework import serializers
import pytz
 
from datetime import datetime,timezone
import logging
from .contours import generate_contours
from .upperair_counters import upper_air_generate_contours
from celery.result import AsyncResult
import os
from django.conf import settings
from django.db.models import Count
from django.core.files.base import ContentFile
from django.http import HttpResponse, Http404
import base64
import uuid

logger = logging.getLogger(__name__)

class WeatherStationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WeatherStationSerializer
    queryset = WeatherStation.objects.all()
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['country']
    bbox_filter_field = 'location'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Return queryset with spatial filtering."""
        return super().get_queryset()   
class UpperAirWeatherStationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UpperAirWeatherStationSerializer
    queryset = UpperAirWeatherStation.objects.all()
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['country']
    bbox_filter_field = 'location'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Return queryset with spatial filtering."""
        return super().get_queryset()   

class SynopReportViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SynopReportSerializer
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['level', 'observation_time', 'station__station_id']
    bbox_filter_field = 'station__location'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Filter by level, observation_time, and optimize queries."""
        level = self.request.query_params.get('level', 'SURFACE')
        observation_time = self.request.query_params.get('observation_time')
        queryset = SynopReport.objects.filter(level=level).select_related('station')
        if observation_time:
            try:
                logger.debug(f"Received observation_time: {observation_time}")
                # Normalize timestamp: handle Z or explicit offset
                if observation_time.endswith('Z'):
                    observation_time = observation_time[:-1]  # Remove Z for parsing
                observation_time = datetime.fromisoformat(observation_time)
                # Ensure UTC timezone
                if observation_time.tzinfo is None:
                    observation_time = observation_time.replace(tzinfo=timezone.utc)
                queryset = queryset.filter(observation_time=observation_time)
            except ValueError as e:
                logger.error(f"Invalid observation_time format: {observation_time}, {e}")
                raise serializers.ValidationError({
                    "observation_time": "Invalid ISO format (e.g., 2025-04-24T06:00:00Z or 2025-04-24T06:00:00+00:00)"
                })
        return queryset
class UpperAirSynopReportViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UpperAirSynopReportSerializer
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['level', 'observation_time', 'station__station_id']
    bbox_filter_field = 'station__location'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Filter by level, observation_time, and optimize queries."""
        level = self.request.query_params.get('level', '200HPA')
        observation_time = self.request.query_params.get('observation_time')
        queryset = UpperAirSynopReport.objects.filter(level=level).select_related('station')
        if observation_time:
            try:
                logger.debug(f"Received observation_time: {observation_time}")
                # Normalize timestamp: handle Z or explicit offset
                if observation_time.endswith('Z'):
                    observation_time = observation_time[:-1]  # Remove Z for parsing
                observation_time = datetime.fromisoformat(observation_time)
                # Ensure UTC timezone
                if observation_time.tzinfo is None:
                    observation_time = observation_time.replace(tzinfo=timezone.utc)
                queryset = queryset.filter(observation_time=observation_time)
            except ValueError as e:
                logger.error(f"Invalid observation_time format: {observation_time}, {e}")
                raise serializers.ValidationError({
                    "observation_time": "Invalid ISO format (e.g., 2025-04-24T06:00:00Z or 2025-04-24T06:00:00+00:00)"
                })
        return queryset
class InBBoxFilter:
    """Custom filter to apply bounding box filtering using geometry__contained."""
    def filter_queryset(self, request, queryset, view):
        minx = request.query_params.get('minx')
        miny = request.query_params.get('miny')
        maxx = request.query_params.get('maxx')
        maxy = request.query_params.get('maxy')
        if all(v is not None for v in [minx, miny, maxx, maxy]):
            try:
                # Create a polygon from the bounding box
                from django.contrib.gis.geos import Polygon
                bbox = Polygon.from_bbox((float(minx), float(miny), float(maxx), float(maxy)))
                return queryset.filter(geometry__contained=bbox)
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid bbox parameters: {e}")
        return queryset

class IsobarViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = IsobarSerializer
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['level', 'observation_time', 'pressure']
    bbox_filter_field = 'geometry'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Filter isobars and trigger generation if empty."""
        level = self.request.query_params.get('level', 'SURFACE')
        observation_time_str = self.request.query_params.get('observation_time')

        # Initialize queryset
        queryset = Isobar.objects.filter(level=level)

        # Handle observation_time with timezone conversion
        observation_time = None
        if observation_time_str:
            try:
                observation_time = datetime.fromisoformat(observation_time_str.replace('Z', '+00:00'))
                observation_time = observation_time.astimezone(pytz.timezone('Asia/Kathmandu'))
                queryset = queryset.filter(observation_time=observation_time)
            except ValueError as e:
                logger.error(f"Invalid observation_time format: {observation_time_str}, {e}")
                raise serializers.ValidationError({"observation_time": "Invalid ISO format"})

        # Trigger contour generation if no isobars
        if not queryset.exists() and self.request.method == 'GET':
            try:
                result = generate_contours(level, observation_time_str)  # Pass string for compatibility
                if result and isinstance(result, dict):
                    logger.info(f"Generated isobars for level={level}, observation_time={observation_time_str}")
                    queryset = Isobar.objects.filter(level=level)
                    if observation_time:
                        queryset = queryset.filter(observation_time=observation_time)
                else:
                    logger.warning(f"Failed to generate isobars for level={level}, observation_time={observation_time_str}")
            except Exception as e:
                logger.error(f"Error generating isobars: {e}", exc_info=True)
                raise serializers.ValidationError({"detail": f"Failed to generate contours: {str(e)}"})

        return queryset
class UpperAirIsobarViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UpperAirIsobarSerializer
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['level', 'observation_time', 'pressure']
    bbox_filter_field = 'geometry'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Filter isobars and trigger generation of height contours if empty."""
        level = self.request.query_params.get('level', '200HPA')
        observation_time_str = self.request.query_params.get('observation_time')

        # Initialize queryset
        queryset = UpperAirIsobar.objects.filter(level=level)  # Changed to UpperAirIsobar

        # Handle observation_time with timezone conversion
        observation_time = None
        if observation_time_str:
            try:
                observation_time = datetime.fromisoformat(observation_time_str.replace('Z', '+00:00'))
                observation_time = observation_time.astimezone(pytz.timezone('Asia/Kathmandu'))
                queryset = queryset.filter(observation_time=observation_time)
            except ValueError as e:
                logger.error(f"Invalid observation_time format: {observation_time_str}, {e}")
                raise serializers.ValidationError({"observation_time": "Invalid ISO format"})

        # Trigger contour generation if no isobars (now height contours)
        if not queryset.exists() and self.request.method == 'GET':
            try:
                result = upper_air_generate_contours(level, observation_time_str)  # Pass string for compatibility
                if result and isinstance(result, dict):
                    logger.info(f"Generated height contours for level={level}, observation_time={observation_time_str}")
                    queryset = UpperAirIsobar.objects.filter(level=level)  # Updated to reflect height contours
                    if observation_time:
                        queryset = queryset.filter(observation_time=observation_time)
                else:
                    logger.warning(f"Failed to generate height contours for level={level}, observation_time={observation_time_str}")
            except Exception as e:
                logger.error(f"Error generating height contours: {e}", exc_info=True)
                raise serializers.ValidationError({"detail": f"Failed to generate contours: {str(e)}"})

        return queryset

class IsothermViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = IsothermSerializer
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['level', 'observation_time', 'temperature']
    bbox_filter_field = 'geometry'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Filter isotherms and trigger generation if empty."""
        level = self.request.query_params.get('level', 'SURFACE')
        observation_time = self.request.query_params.get('observation_time')
        queryset = Isotherm.objects.filter(level=level)
        if observation_time:
            try:
                observation_time = datetime.fromisoformat(observation_time.replace('Z', '+00:00'))
                queryset = queryset.filter(observation_time=observation_time)
            except ValueError as e:
                logger.error(f"Invalid observation_time format: {observation_time}, {e}")
                raise serializers.ValidationError({"observation_time": "Invalid ISO format"})
        
        # Trigger contour generation if no isotherms
        if not queryset.exists() and self.request.method == 'GET':
            try:
                success = generate_contours(level, observation_time)
                if success:
                    queryset = Isotherm.objects.filter(level=level)
                    if observation_time:
                        queryset = queryset.filter(observation_time=observation_time)
                    logger.info(f"Generated isotherms for level={level}, observation_time={observation_time}")
                else:
                    logger.warning(f"Failed to generate isotherms for level={level}, observation_time={observation_time}")
            except Exception as e:
                logger.error(f"Error generating isotherms: {e}", exc_info=True)
        return queryset
class UpperAirIsothermViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UpperAirIsothermSerializer
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['level', 'observation_time', 'temperature']
    bbox_filter_field = 'geometry'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Filter isotherms and trigger generation if empty."""
        level = self.request.query_params.get('level', '200HPA')
        observation_time_str = self.request.query_params.get('observation_time')
        queryset = UpperAirIsotherm.objects.filter(level=level)  # Changed to UpperAirIsotherm

        # Handle observation_time with timezone conversion
        observation_time = None
        if observation_time_str:
            try:
                observation_time = datetime.fromisoformat(observation_time_str.replace('Z', '+00:00'))
                observation_time = observation_time.astimezone(pytz.timezone('Asia/Kathmandu'))
                queryset = queryset.filter(observation_time=observation_time)
            except ValueError as e:
                logger.error(f"Invalid observation_time format: {observation_time_str}, {e}")
                raise serializers.ValidationError({"observation_time": "Invalid ISO format"})

        # Trigger contour generation if no isotherms
        if not queryset.exists() and self.request.method == 'GET':
            try:
                result = upper_air_generate_contours(level, observation_time_str)  # Pass string for compatibility
                if result and isinstance(result, dict):
                    logger.info(f"Generated isotherms for level={level}, observation_time={observation_time_str}")
                    queryset = UpperAirIsotherm.objects.filter(level=level)  # Updated to reflect generated data
                    if observation_time:
                        queryset = queryset.filter(observation_time=observation_time)
                else:
                    logger.warning(f"Failed to generate isotherms for level={level}, observation_time={observation_time_str}")
            except Exception as e:
                logger.error(f"Error generating isotherms: {e}", exc_info=True)
                raise serializers.ValidationError({"detail": f"Failed to generate contours: {str(e)}"})

        return queryset

class PressureCenterViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PressureCenterSerializer
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['level', 'observation_time', 'center_type']
    bbox_filter_field = 'location'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Filter pressure centers."""
        level = self.request.query_params.get('level', 'SURFACE')
        observation_time = self.request.query_params.get('observation_time')
        queryset = PressureCenter.objects.filter(level=level)
        if observation_time:
            try:
                observation_time = datetime.fromisoformat(observation_time.replace('Z', '+00:00'))
                queryset = queryset.filter(observation_time=observation_time)
            except ValueError as e:
                logger.error(f"Invalid observation_time format: {observation_time}, {e}")
                raise serializers.ValidationError({"observation_time": "Invalid ISO format"})
        return queryset
class UpperAirPressureCenterViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UpperAirPressureCenterSerializer
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['level', 'observation_time', 'center_type']
    bbox_filter_field = 'location'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Filter pressure centers and trigger generation if empty."""
        level = self.request.query_params.get('level', '200HPA')
        observation_time_str = self.request.query_params.get('observation_time')
        queryset = UpperAirPressureCenter.objects.filter(level=level)  # Changed to UpperAirPressureCenter

        # Handle observation_time with timezone conversion
        observation_time = None
        if observation_time_str:
            try:
                observation_time = datetime.fromisoformat(observation_time_str.replace('Z', '+00:00'))
                observation_time = observation_time.astimezone(pytz.timezone('Asia/Kathmandu'))
                queryset = queryset.filter(observation_time=observation_time)
            except ValueError as e:
                logger.error(f"Invalid observation_time format: {observation_time_str}, {e}")
                raise serializers.ValidationError({"observation_time": "Invalid ISO format"})

        # Trigger contour generation if no pressure centers
        if not queryset.exists() and self.request.method == 'GET':
            try:
                result = upper_air_generate_contours(level, observation_time_str)  # Pass string for compatibility
                if result and isinstance(result, dict):
                    logger.info(f"Generated pressure centers for level={level}, observation_time={observation_time_str}")
                    queryset = UpperAirPressureCenter.objects.filter(level=level)  # Updated to reflect generated data
                    if observation_time:
                        queryset = queryset.filter(observation_time=observation_time)
                else:
                    logger.warning(f"Failed to generate pressure centers for level={level}, observation_time={observation_time_str}")
            except Exception as e:
                logger.error(f"Error generating pressure centers: {e}", exc_info=True)
                raise serializers.ValidationError({"detail": f"Failed to generate contours: {str(e)}"})

        return queryset

class ExportMapView(APIView):
    def post(self, request):
        map_type = request.data.get('map_type')
        level = request.data.get('level', 'SURFACE')
        observation_time = request.data.get('observation_time')
        if map_type not in ['PNG', 'SVG']:
            return Response({"error": "Invalid map type"}, status=400)
        success = generate_contours(level, observation_time, map_type)
        if success:
            timestamp = observation_time or 'latest'
            map_filename = f'map_{level}_{timestamp}.{map_type.lower()}'
            map_url = os.path.join(settings.MEDIA_URL, 'exports', map_filename)
            return Response({"message": "Map export started", "map_url": map_url})
        return Response({"error": "Map export failed"}, status=500)
class ObservationTimesView(APIView):
    # Temporarily disabled cache to force refresh
    # @method_decorator(cache_page(60 * 15))  # Cache for 15 minutes
    def get(self, request):
        """Return distinct observation times for a level (last 7 days)."""
        level = request.query_params.get('level', 'SURFACE')
        try:
            # Calculate the date range: last 7 days to ensure we get data
            from datetime import timedelta
            now = datetime.now(timezone.utc)
            seven_days_ago = now - timedelta(days=7)
            
            logger.info(f"Fetching observation times for level={level}, from {seven_days_ago} to {now}")
            
            observation_times = (
                SynopReport.objects.filter(
                    level=level,
                    observation_time__gte=seven_days_ago
                )
                .values('observation_time')
                .distinct()
                .order_by('-observation_time')
            )
            
            logger.info(f"Found {observation_times.count()} observation times for level={level}")
            times = [t['observation_time'].isoformat() + 'Z' for t in observation_times]
            return Response(times)
        except Exception as e:
            logger.error(f"Error fetching observation times for level={level}: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to fetch observation times: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
class UpperAirObservationTimesView(APIView):
    # Temporarily disabled cache to force refresh
    # @method_decorator(cache_page(60 * 15))  # Cache for 15 minutes
    def get(self, request):
        """Return distinct observation times for a level (last 30 days including today)."""
        level = request.query_params.get('level', '200HPA')
        try:
            # Calculate the date range: last 30 days (1 month) to ensure we get upper air data
            from datetime import timedelta
            now = datetime.now(timezone.utc)  # Use timezone-aware datetime
            thirty_days_ago = now - timedelta(days=30)
            
            logger.info(f"Fetching upper air observation times for level={level}, from {thirty_days_ago} to {now}")
            
            observation_times = (
                UpperAirSynopReport.objects.filter(
                    level=level,
                    observation_time__gte=thirty_days_ago
                )
                .values('observation_time')
                .distinct()
                .order_by('-observation_time')
            )
            
            logger.info(f"Found {observation_times.count()} observation times for level={level}")
            times = [t['observation_time'].isoformat() + 'Z' for t in observation_times]
            return Response(times)
        except Exception as e:
            logger.error(f"Error fetching observation times for level={level}: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to fetch observation times: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
class AvailableLevelsView(APIView):
    """Return available pressure levels from both surface and upper air reports."""

    @method_decorator(cache_page(60 * 15))  # Cache for 15 minutes
    def get(self, request):
        try:
            # Upper-air levels
            upper_levels = UpperAirSynopReport.objects.values('level').annotate(count=Count('id'))
            logger.info(f"Upper air levels fetched: {list(upper_levels)}")

            # Combine both sources
            combined_levels = {}
            for entry in upper_levels:
                combined_levels[entry['level']] = combined_levels.get(entry['level'], 0) + entry['count']

            # Prepare response
            levels = [{'level': level, 'count': count} for level, count in combined_levels.items()]
            
            # Sort levels in a logical order (200, 500, 700, 850, etc.)
            level_order = {'200HPA': 1, '500HPA': 2, '700HPA': 3, '850HPA': 4}
            levels.sort(key=lambda x: level_order.get(x['level'], 999))

            logger.info(f"Returning {len(levels)} pressure levels")
            return Response(levels)
        except Exception as e:
            logger.error(f"Error fetching available levels: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to fetch levels: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
class GridDataViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = GridDataSerializer
    filter_backends = [DjangoFilterBackend, InBBoxFilter]
    filterset_fields = ['level', 'observation_time']
    bbox_filter_field = 'geometry'
    pagination_class = LimitOffsetPagination

    def get_queryset(self):
        """Filter grid data and optimize queries."""
        level = self.request.query_params.get('level', 'SURFACE')
        observation_time = self.request.query_params.get('observation_time')
        queryset = GridData.objects.filter(level=level)
        if observation_time:
            try:
                observation_time = datetime.fromisoformat(observation_time.replace('Z', '+00:00'))
                queryset = queryset.filter(observation_time=observation_time)
            except ValueError as e:
                logger.error(f"Invalid observation_time format: {observation_time}, {e}")
                raise serializers.ValidationError({"observation_time": "Invalid ISO format"})
        return queryset

    def list(self, request, *args, **kwargs):
        """Log large responses and trigger generation if empty."""
        queryset = self.filter_queryset(self.get_queryset())
        if not queryset.exists() and request.method == 'GET':
            level = request.query_params.get('level', 'SURFACE')
            observation_time = request.query_params.get('observation_time')
            try:
                success = generate_contours(level, observation_time)
                if success:
                    queryset = self.filter_queryset(self.get_queryset())
                    logger.info(f"Generated grid data for level={level}, observation_time={observation_time}")
                else:
                    logger.warning(f"Failed to generate grid data for level={level}, observation_time={observation_time}")
            except Exception as e:
                logger.error(f"Error generating grid data: {e}", exc_info=True)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        data = serializer.data
        if len(data) > 1000:
            logger.info(f"Returning large GridData response with {len(data)} items")
        return Response(data)


class ExportFileView(APIView):
    """Handle export file uploads (PDF, PNG, JPEG) and save them to the database."""
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        """Save an export file to the database."""
        try:
            logger.info(f"Export request received. Data keys: {list(request.data.keys())}")
            
            # Get data from request
            file_data = request.data.get('file_data')  # Base64 encoded file data
            level = request.data.get('level', 'SURFACE')
            observation_time_str = request.data.get('observation_time')
            map_type = request.data.get('format', 'PDF').upper()  # PDF, PNG, JPEG
            
            logger.info(f"Format: {map_type}, Level: {level}, Observation time: {observation_time_str}")
            logger.info(f"File data length: {len(file_data) if file_data else 0}")
            
            # Validate format
            if map_type not in ['PDF', 'PNG', 'JPEG']:
                logger.error(f"Invalid format: {map_type}")
                return Response(
                    {"error": "Format must be PDF, PNG, or JPEG"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not file_data:
                logger.error("No file data received")
                return Response(
                    {"error": "File data is required"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Parse observation time
            observation_time = None
            if observation_time_str:
                try:
                    observation_time = datetime.fromisoformat(observation_time_str.replace('Z', '+00:00'))
                except ValueError as e:
                    logger.error(f"Invalid observation_time format: {observation_time_str}, {e}")
                    return Response(
                        {"error": "Invalid observation_time format"}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # Decode base64 file data
            try:
                logger.info(f"File data starts with: {file_data[:50] if file_data else 'None'}")
                
                # Remove data URL prefix based on format
                if map_type == 'PDF' and file_data.startswith('data:application/pdf;base64,'):
                    file_data = file_data.replace('data:application/pdf;base64,', '')
                    logger.info("Removed PDF data URL prefix")
                elif map_type == 'PNG' and file_data.startswith('data:image/png;base64,'):
                    file_data = file_data.replace('data:image/png;base64,', '')
                    logger.info("Removed PNG data URL prefix")
                elif map_type == 'JPEG' and file_data.startswith('data:image/jpeg;base64,'):
                    file_data = file_data.replace('data:image/jpeg;base64,', '')
                    logger.info("Removed JPEG data URL prefix")
                
                file_bytes = base64.b64decode(file_data)
                logger.info(f"Successfully decoded {map_type}, size: {len(file_bytes)} bytes")
                
                # Validate file headers
                if map_type == 'PDF' and not file_bytes.startswith(b'%PDF-'):
                    logger.error(f"Invalid PDF header. First 10 bytes: {file_bytes[:10]}")
                    return Response(
                        {"error": "Invalid PDF file format"}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
                elif map_type == 'PNG' and not file_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                    logger.error(f"Invalid PNG header. First 10 bytes: {file_bytes[:10]}")
                    return Response(
                        {"error": "Invalid PNG file format"}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
                elif map_type == 'JPEG' and not file_bytes.startswith(b'\xff\xd8\xff'):
                    logger.error(f"Invalid JPEG header. First 10 bytes: {file_bytes[:10]}")
                    return Response(
                        {"error": "Invalid JPEG file format"}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
                    
            except Exception as e:
                logger.error(f"Error decoding {map_type} data: {e}")
                return Response(
                    {"error": f"Invalid {map_type} data"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Generate filename
            timestamp = observation_time.strftime('%Y%m%d_%H%M%S') if observation_time else 'latest'
            file_extension = map_type.lower()
            if file_extension == 'jpeg':
                file_extension = 'jpg'  # Use .jpg extension for JPEG files
            filename = f"weather_map_{level}_{timestamp}_{uuid.uuid4().hex[:8]}.{file_extension}"
            logger.info(f"Generated filename: {filename}")
            
            # Create ContentFile from file bytes
            export_file = ContentFile(file_bytes, name=filename)
            logger.info(f"Created ContentFile: {export_file}")
            
            # Create ExportedMap instance
            logger.info("Creating ExportedMap instance...")
            exported_map = ExportedMap.objects.create(
                file_name=filename,
                file_path=export_file,
                map_type=map_type,
                level=level,
                observation_time=observation_time
            )
            logger.info(f"Successfully created ExportedMap with ID: {exported_map.id}")
            
            # Serialize and return the created object
            serializer = ExportedMapSerializer(exported_map)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error saving PDF: {e}", exc_info=True)
            return Response(
                {"error": "Failed to save PDF"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ExportListView(APIView):
    """List all saved exports (PDF, PNG, JPEG)."""
    
    def get(self, request):
        """Return list of all saved exports."""
        try:
            # Get all export types (PDF, PNG, JPEG)
            export_formats = request.query_params.get('formats', 'PDF,PNG,JPEG').upper().split(',')
            valid_formats = [fmt.strip() for fmt in export_formats if fmt.strip() in ['PDF', 'PNG', 'JPEG']]
            
            if not valid_formats:
                valid_formats = ['PDF', 'PNG', 'JPEG']  # Default to all formats
            
            exports = ExportedMap.objects.filter(map_type__in=valid_formats).order_by('-created_at')
            
            # Apply optional filters
            level = request.query_params.get('level')
            if level:
                exports = exports.filter(level=level)
            
            observation_time = request.query_params.get('observation_time')
            if observation_time:
                try:
                    observation_time = datetime.fromisoformat(observation_time.replace('Z', '+00:00'))
                    exports = exports.filter(observation_time=observation_time)
                except ValueError:
                    pass  # Ignore invalid time format
            
            serializer = ExportedMapSerializer(exports, many=True)
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f"Error listing exports: {e}", exc_info=True)
            return Response(
                {"error": "Failed to list exports"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class ExportDelete(APIView):
    """Delete an exported map and its file from storage and database."""

    def delete(self, request, export_id):
        try:
            export = ExportedMap.objects.get(id=export_id)

            # Delete file from storage if exists
            try:
                if export.file_path:
                    storage = export.file_path.storage
                    file_name = export.file_path.name
                    if storage.exists(file_name):
                        storage.delete(file_name)
            except Exception as e:
                logger.warning(f"Failed to delete file for export {export_id}: {e}")

            # Delete DB record
            export.delete()

            return Response(status=status.HTTP_204_NO_CONTENT)
        except ExportedMap.DoesNotExist:
            return Response({"error": "Export not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error deleting export {export_id}: {e}", exc_info=True)
            return Response({"error": "Failed to delete export"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ExportDownloadView(APIView):
    """Download individual export files (PDF, PNG, JPEG)."""
    
    def get(self, request, export_id):
        """Download a specific export file."""
        try:
            # Get the export (any format)
            export = ExportedMap.objects.get(id=export_id)
            
            # Check if file exists
            if not export.file_path or not os.path.exists(export.file_path.path):
                raise Http404(f"{export.map_type} file not found")
            
            # Read file content
            with open(export.file_path.path, 'rb') as export_file:
                file_content = export_file.read()
            
            # Determine content type based on format
            content_type_map = {
                'PDF': 'application/pdf',
                'PNG': 'image/png',
                'JPEG': 'image/jpeg'
            }
            content_type = content_type_map.get(export.map_type, 'application/octet-stream')
            
            # Return file response
            response = HttpResponse(file_content, content_type=content_type)
            response['Content-Disposition'] = f'attachment; filename="{export.file_name}"'
            return response
            
        except ExportedMap.DoesNotExist:
            raise Http404("Export file not found")
        except Exception as e:
            logger.error(f"Error downloading export {export_id}: {e}", exc_info=True)
            return Response(
                {"error": "Failed to download export file"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
