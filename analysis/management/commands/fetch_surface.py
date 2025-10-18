"""
Management command to manually fetch surface SYNOP data from Ogimet.
Usage: python manage.py fetch_surface
"""
from django.core.management.base import BaseCommand
from analysis.tasks import fetch_meteo_data
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Manually fetch surface SYNOP data and populate the database'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting surface data fetch (SYNOP)...'))

        try:
            # Call the Celery task directly (synchronously)
            result = fetch_meteo_data()
            self.stdout.write(self.style.SUCCESS('Successfully fetched surface SYNOP data.'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error fetching surface data: {str(e)}'))
            logger.error(f"Error in fetch_surface command: {e}", exc_info=True)
