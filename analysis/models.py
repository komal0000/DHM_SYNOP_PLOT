from django.db import models
from django.contrib.gis.db import models
from django.contrib.gis.geos import Point, LineString
from django.utils import timezone
class WeatherStation(models.Model):
    station_id = models.CharField(max_length=10, primary_key=True)
    name = models.CharField(max_length=100)
    location = models.PointField(srid=4326, spatial_index=True)
    elevation = models.FloatField(help_text="Elevation in meters")
    country = models.CharField(max_length=50, default='')

    def __str__(self):
        return f"{self.station_id} - {self.name}"
class SynopReport(models.Model):
    station = models.ForeignKey('WeatherStation', on_delete=models.CASCADE)
    observation_time = models.DateTimeField()

    level = models.CharField(
        max_length=10,
        choices=[
            ('SURFACE', 'Surface'),
            ('850HPA', '850 hPa'),
            ('700HPA', '700 hPa'),
            ('500HPA', '500 hPa'),
            ('200HPA', '200 hPa'),
        ],
        default='SURFACE'
    )

    # Main variables from Section 1
    wind_direction = models.IntegerField(null=True, blank=True, help_text="Wind direction in degrees")
    wind_speed = models.FloatField(null=True, blank=True, help_text="Wind speed in knots")
    temperature = models.FloatField(null=True, blank=True, help_text="Temperature in °C")
    dew_point = models.FloatField(null=True, blank=True, help_text="Dew point in °C")
    station_pressure = models.FloatField(null=True, blank=True, help_text="Station pressure in hPa")
    sea_level_pressure = models.FloatField(null=True, blank=True, help_text="Sea level pressure in hPa")

    # Weather and cloud data
    cloud_cover = models.IntegerField(null=True, blank=True, help_text="Cloud cover in oktas")
    cloud_low_type = models.CharField(max_length=1, null=True, blank=True, help_text="Low cloud type (WMO code)")
    cloud_mid_type = models.CharField(max_length=1, null=True, blank=True, help_text="Mid cloud type (WMO code)")
    cloud_high_type = models.CharField(max_length=1, null=True, blank=True, help_text="High cloud type (WMO code)")
    visibility = models.FloatField(null=True, blank=True, help_text="Visibility in km")
    weather_present = models.CharField(max_length=2, null=True, blank=True, help_text="Present weather code")
    weather_past = models.CharField(max_length=2, null=True, blank=True, help_text="Past weather code")

    # Section 3 - Additional data
    pressure_tendency = models.IntegerField(null=True, blank=True, help_text="Pressure tendency code")
    pressure_change = models.FloatField(null=True, blank=True, help_text="Pressure change in hPa/3h")
    max_temperature = models.FloatField(null=True, blank=True, help_text="Maximum temperature (°C)")
    min_temperature = models.FloatField(null=True, blank=True, help_text="Minimum temperature (°C)")
    precipitation = models.FloatField(null=True, blank=True, help_text="Precipitation (last period, mm)")
    precipitation_24h = models.FloatField(null=True, blank=True, help_text="24-hour precipitation (mm)")

    class Meta:
        indexes = [
            models.Index(fields=['observation_time']),
            models.Index(fields=['level']),
        ]
        unique_together = ('station', 'observation_time', 'level')

    def __str__(self):
        return f"{self.station.station_id} @ {self.observation_time} ({self.level})"

    @property
    def location(self):
        return self.station.location

class Isobar(models.Model):
    pressure = models.FloatField(help_text="Pressure in hPa")
    geometry = models.LineStringField(srid=4326)
    level = models.CharField(
        max_length=10,
        choices=[
            ('SURFACE', 'Surface'),
            ('850HPA', '850 hPa'),
            ('700HPA', '700 hPa'),
            ('500HPA', '500 hPa'),
            ('200HPA', '200 hPa'),
        ],default='SURFACE'
    )
    observation_time = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Isobar {self.pressure} hPa ({self.level})"

class Isotherm(models.Model):
    temperature = models.FloatField(help_text="Temperature in °C")
    geometry = models.LineStringField(srid=4326)
    level = models.CharField(
        max_length=10,
        choices=[
            ('SURFACE', 'Surface'),
            ('850HPA', '850 hPa'),
            ('700HPA', '700 hPa'),
            ('500HPA', '500 hPa'),
            ('200HPA', '200 hPa'),
        ]
    )
    observation_time = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Isotherm {self.temperature} °C ({self.level})"

class PressureCenter(models.Model):
    center_type = models.CharField(max_length=4, choices=[('HIGH', 'High'), ('LOW', 'Low')])
    location = models.PointField(srid=4326)
    pressure = models.FloatField(help_text="Pressure in hPa")
    level = models.CharField(
        max_length=10,
        choices=[
            ('SURFACE', 'Surface'),
            ('850HPA', '850 hPa'),
            ('700HPA', '700 hPa'),
            ('500HPA', '500 hPa'),
            ('200HPA', '200 hPa'),
        ]
    )
    observation_time = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.center_type} Center ({self.level})"

class ExportedMap(models.Model):
    file_name = models.CharField(max_length=255)
    file_path = models.FileField(upload_to='exports/')
    map_type = models.CharField(max_length=50, choices=[('PNG', 'PNG'), ('SVG', 'SVG')])
    level = models.CharField(
        max_length=10,
        choices=[
            ('SURFACE', 'Surface'),
            ('850HPA', '850 hPa'),
            ('700HPA', '700 hPa'),
            ('500HPA', '500 hPa'),
            ('200HPA', '200 hPa'),
        ]
    )
    observation_time = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Exported Map {self.file_name} ({self.level})"

    def get_absolute_url(self):
        from django.conf import settings
        return f"{settings.MFD_WEBSITE_URL}/media/{self.file_path}"

class GridData(models.Model):
    level = models.CharField(max_length=20)
    observation_time = models.DateTimeField(null=True, blank=True, default=timezone.now)
    geometry = models.PointField(srid=4326)  # Changed to PointField
    pressure = models.FloatField(help_text="Pressure in hPa")  # Added for clarity
    temperature = models.FloatField(help_text="Temperature in °C")  # Added for clarity

    class Meta:
        indexes = [
            models.Index(fields=['level', 'observation_time']),
        ]


class UpperAirWeatherStation(models.Model):
    station_id = models.CharField(max_length=10, primary_key=True)
    name = models.CharField(max_length=100)
    location = models.PointField(srid=4326, spatial_index=True)
    elevation = models.FloatField(help_text="Elevation in meters")
    country = models.CharField(max_length=50, default='')

    def __str__(self):
        return f"{self.station_id} - {self.name}"
    
class UpperAirSynopReport(models.Model):
    station = models.ForeignKey('UpperAirWeatherStation', on_delete=models.CASCADE)
    observation_time = models.DateTimeField()

    level = models.CharField(
        max_length=10,
        choices=[
            ('850HPA', '850 hPa'),
            ('700HPA', '700 hPa'),
            ('500HPA', '500 hPa'),
            ('200HPA', '200 hPa'),
        ],
        default='850HPA'
    )

    # Main variables from Section 1
    wind_direction = models.IntegerField(null=True, blank=True, help_text="Wind direction in degrees")
    wind_speed = models.FloatField(null=True, blank=True, help_text="Wind speed in knots")
    temperature = models.FloatField(null=True, blank=True, help_text="Temperature in °C")
    dew_point = models.FloatField(null=True, blank=True, help_text="Dew point in °C")
    pressure = models.FloatField(null=True, blank=True, help_text="pressure in hPa")
    height = models.FloatField(null=True, blank=True, help_text="Pressure height in hPa")
    

    class Meta:
        indexes = [
            models.Index(fields=['observation_time']),
            models.Index(fields=['level']),
        ]
        unique_together = ('station', 'observation_time', 'level')

    def __str__(self):
        return f"{self.station.station_id} @ {self.observation_time} ({self.level})"

    @property
    def location(self):
        return self.station.location

class UpperAirIsobar(models.Model):
    pressure = models.FloatField(help_text="Pressure in hPa")
    geometry = models.LineStringField(srid=4326)
    level = models.CharField(
        max_length=10,
        choices=[
            ('SURFACE', 'Surface'),
            ('850HPA', '850 hPa'),
            ('700HPA', '700 hPa'),
            ('500HPA', '500 hPa'),
            ('200HPA', '200 hPa'),
        ],default='SURFACE'
    )
    observation_time = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Isobar {self.pressure} hPa ({self.level})"

class UpperAirIsotherm(models.Model):
    temperature = models.FloatField(help_text="Temperature in °C")
    geometry = models.LineStringField(srid=4326)
    level = models.CharField(
        max_length=10,
        choices=[
            ('850HPA', '850 hPa'),
            ('700HPA', '700 hPa'),
            ('500HPA', '500 hPa'),
            ('200HPA', '200 hPa'),
        ]
    )
    observation_time = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Isotherm {self.temperature} °C ({self.level})"

class UpperAirPressureCenter(models.Model):
    center_type = models.CharField(max_length=4, choices=[('HIGH', 'High'), ('LOW', 'Low')])
    location = models.PointField(srid=4326)
    pressure = models.FloatField(help_text="Pressure in hPa")
    level = models.CharField(
        max_length=10,
        choices=[
            ('850HPA', '850 hPa'),
            ('700HPA', '700 hPa'),
            ('500HPA', '500 hPa'),
            ('200HPA', '200 hPa'),
        ]
    )
    observation_time = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.center_type} Center ({self.level})"