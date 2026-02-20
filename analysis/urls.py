from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WeatherStationViewSet, SynopReportViewSet, 
    IsobarViewSet, IsothermViewSet, PressureCenterViewSet, ExportMapView,
    ObservationTimesView,GridDataViewSet,
    UpperAirWeatherStationViewSet,UpperAirSynopReportViewSet,UpperAirIsobarViewSet,UpperAirIsothermViewSet,UpperAirPressureCenterViewSet,AvailableLevelsView,UpperAirObservationTimesView,
    ExportFileView, ExportListView, ExportDownloadView
    , ExportDelete
)
from .geoserver_proxy import GeoServerProxy

router = DefaultRouter()
router.register(r'weather-stations', WeatherStationViewSet, basename='station')
router.register(r'reports', SynopReportViewSet, basename='synopreport')
router.register(r'isobars', IsobarViewSet, basename='isobar')
router.register(r'isotherms', IsothermViewSet, basename='isotherm')
router.register(r'pressure-centers', PressureCenterViewSet, basename='pressurecenter')
router.register(r'grid', GridDataViewSet, basename='grid')

router.register(r'upperair-stations', UpperAirWeatherStationViewSet, basename='upperair-station')
router.register(r'upperair-reports', UpperAirSynopReportViewSet, basename='upperair-synopreport')
router.register(r'upperair-isobars', UpperAirIsobarViewSet, basename='upperair-isobar')
router.register(r'upperair-isotherms', UpperAirIsothermViewSet, basename='upperair-isotherm')
router.register(r'upperair-pressure-centers', UpperAirPressureCenterViewSet, basename='upperair-pressurecenter')

urlpatterns = [
    path('', include(router.urls)),
    path('export/', ExportMapView.as_view(), name='export-map'),
    path('observation-times/', ObservationTimesView.as_view(), name='observation-times'),
    path('upperair-observation-times/', UpperAirObservationTimesView.as_view(), name='upperair-observation-times'),
    path('available-levels/', AvailableLevelsView.as_view(), name='available-levels'),
    path('export-file/', ExportFileView.as_view(), name='export-file'),
    path('export-list/', ExportListView.as_view(), name='export-list'),
    path('export-delete/<int:export_id>/', ExportDelete.as_view(), name='export-delete'),
    path('export-download/<int:export_id>/', ExportDownloadView.as_view(), name='export-download'),
    path('geoserver-proxy/<path:wms_path>', GeoServerProxy.as_view(), name='geoserver-proxy'),
    ]
