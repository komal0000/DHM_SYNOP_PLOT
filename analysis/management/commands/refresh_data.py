"""
Fetch both surface and upper-air data, then clear the cache.
Usage: python manage.py refresh_data
"""
from django.core.management.base import BaseCommand
from django.core.cache import cache
from analysis.tasks import fetch_meteo_data
from analysis.upperair_task import fetch_upper_air_data
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Fetch surface and upper-air data, then clear cache (refresh)'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting refresh: surface + upper-air fetch, then cache clear...'))
        try:
            # Fetch surface
            fetch_meteo_data()
            self.stdout.write(self.style.SUCCESS('Surface data fetched.'))

            # Fetch upper-air
            fetch_upper_air_data()
            self.stdout.write(self.style.SUCCESS('Upper-air data fetched.'))

            # Clear cache
            cache.clear()
            self.stdout.write(self.style.SUCCESS('Cache cleared.'))

            self.stdout.write(self.style.SUCCESS('Refresh complete.'))
        except Exception as e:
            logger.error('Error during refresh_data command', exc_info=True)
            self.stderr.write(self.style.ERROR(f'Refresh failed: {e}'))
