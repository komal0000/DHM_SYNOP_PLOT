import csv
from django.core.management.base import BaseCommand
from django.contrib.gis.geos import Point
from analysis.models import UpperAirWeatherStation

class Command(BaseCommand):
    help = 'Import weather stations from a CSV file with decimal coordinates (handles missing elevation)'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str, help='Path to the CSV file containing station data')

    def handle(self, *args, **options):
        csv_file_path = options['csv_file']
        try:
            with open(csv_file_path, newline='', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                for row in reader:
                    try:
                        latitude = float(row['Latitude'])
                        longitude = float(row['Longitude'])

                        # Handle missing elevation
                        elevation_str = row.get('Elevation', '').strip()
                        elevation = float(elevation_str) if elevation_str else 0.0

                        UpperAirWeatherStation.objects.update_or_create(
                            station_id=row['station_id'],
                            defaults={
                                'name': row['station_name'],
                                'location': Point(longitude, latitude, srid=4326),
                                'elevation': elevation,
                                'country': row['Country'],
                            }
                        )
                        self.stdout.write(self.style.SUCCESS(
                            f"Imported station: {row['station_id']} - {row['station_name']}"
                        ))
                    except Exception as row_error:
                        self.stdout.write(self.style.ERROR(
                            f"Error processing row {row.get('station_id', '[unknown]')}: {row_error}"
                        ))

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f"CSV file not found: {csv_file_path}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error importing stations: {e}"))
