import requests
import csv
from io import StringIO
from weather_map.celery import shared_task
from django.contrib.gis.geos import Point
from datetime import datetime, timedelta, timezone
from django.utils import timezone as django_timezone
from analysis.models import WeatherStation, SynopReport, ExportedMap
from django.conf import settings
import logging
import os
logger = logging.getLogger(__name__)

def parse_synop_report(report):
    """
    Parses AAXX formatted weather data into a structured dictionary according to WMO standards.
    
    Args:
        report (str): The AAXX formatted weather data string
        
    Returns:
        dict: Parsed weather data with labeled sections and groups, or None if invalid
    """
    if report == 'NIL' or not report.strip():
        logger.warning("Empty or NIL report received")
        return None

    try:
        # Remove '=' and split into groups
        report = report.strip('=').replace('\n', ' ')
        parts = report.split()
        
        if len(parts) < 5 or parts[0] != 'AAXX':
            logger.warning(f"Invalid report format: {report[:20]}...")
            return None

        # Initialize result dictionary for compatibility with existing code
        data = {
            'wind_direction': None,
            'wind_speed': None,
            'temperature': None,
            'dew_point': None,
            'pressure': None,
            'pressure_tendency': None,
            'pressure_change': None,
            'cloud_cover': None,
            'cloud_base': None,
            'visibility': None,
            'weather': None,
            'section0': {},  # Identification section
            'section1': {},  # Ground observation data
            'section3': {}   # Additional data
        }

        # Parse Section 0 (Identification section)
        date_time_group = parts[1]
        try:
            day = int(date_time_group[:2])
            hour = int(date_time_group[2:4])
        except ValueError:
            logger.warning(f"Invalid date format: {date_time_group}")
            return None

        data['section0'] = {
            'report_type': parts[0],  # AAXX
            'datetime': parts[1],     # YYGGiw
            'station_id': parts[2],   # Iliii
        }

        # Initialize Section 1 data
        data['section1'] = {
            'visibility': None,
            'cloud_cover': None,
            'wind': {'direction': None, 'speed': None},
            'temperature': {'sign': None, 'value': None},
            'dew_point': {'sign': None, 'value': None},
            'station_pressure': None,
            'sea_level_pressure': None,
            'weather': {'present': None, 'past': None},
            # 'clouds': {'cover': None, 'low_type': None, 'mid_type': None, 'high_type': None}
            'clouds': {'low_type': None, 'mid_type': None, 'high_type': None}
        }

        # Find where section 3 starts (marked by '333')
        section1_end = len(parts)
        for i in range(5, len(parts)):
            if parts[i] == '333':
                section1_end = i
                break

        # Parse Section 1 (Ground observation data)
        for i, part in enumerate(parts[3:section1_end], start=3):
            if len(part) != 5:
                continue

            if i == 3:  # iRixhVV - Visibility
                data['visibility'] = float(part[3:5]) if part[3:5].isdigit() else None
                data['section1']['visibility'] = data['visibility']
            elif i== 4:  # Nddff - Wind direction and speed
                data['cloud_cover'] =int(part[0:1]) if part[0:1].isdigit() else None
                data['wind_direction'] = int(part[1:3]) * 10 if part[1:3].isdigit() else None
                data['wind_speed'] = float(part[3:5]) if part[3:5].isdigit() else None
                data['section1']['wind'] = {
                    'direction': data['wind_direction'],
                    'speed': data['wind_speed']
                }
            elif part.startswith('1'):  # 1snTTT - Temperature
                data['temperature'] = float(part[2:5]) / 10 * (1 if part[1] == '0' else -1) if part[2:5].isdigit() else None
                data['section1']['temperature'] = {
                    'sign': '0' if part[1] == '0' else '1',
                    'value': float(part[2:5]) / 10 if part[2:5].isdigit() else None
                }
            elif part.startswith('2'):  # 2snTdTdTd - Dew point
                data['dew_point'] = float(part[2:5]) / 10 * (1 if part[1] == '0' else -1) if part[2:5].isdigit() else None
                data['section1']['dew_point'] = {
                    'sign': '0' if part[1] == '0' else '1',
                    'value': float(part[2:5]) / 10 if part[2:5].isdigit() else None
                }
            elif part.startswith('3'):  # 3P0P0P0P0 - Station pressure
                if part[1:5].isdigit():
                    pressure = float(part[1:5]) / 10
                    data['section1']['station_pressure'] = pressure
            elif part.startswith('4'):  # 4PPPP - Sea level pressure
                if part[1:5].isdigit():
                    pressure = float(part[1:5]) / 10
                    if pressure < 500:
                        pressure += 1000
                    data['pressure'] = pressure
                    data['section1']['sea_level_pressure'] = pressure
            elif part.startswith('7'):  # 7wwW1W2 - Present and past weather
                data['weather'] = part[1:3] if part[1:3].isdigit() else None
                data['section1']['weather'] = {
                    'present': part[1:3] if part[1:3].isdigit() else None,
                    'past': part[3:5] if part[3:5].isdigit() else None
                }
            elif part.startswith('8'):  # 8NhCLCMCH - Clouds
                # data['cloud_cover'] = int(part[1]) if part[1].isdigit() else None
                data['section1']['clouds'] = {
                    # 'cover': data['cloud_cover'],
                    'low_type': part[2] if len(part) > 2 and part[2].isdigit() else None,
                    'mid_type': part[3] if len(part) > 3 and part[3].isdigit() else None,
                    'high_type': part[4] if len(part) > 4 and part[4].isdigit() else None
                }

        # Parse Section 3 (Additional data) if present
        if '333' in parts:
            section3_start = parts.index('333') + 1
            for part in parts[section3_start:]:
                if part.startswith('1'):  # 1snTxTxTx - Maximum temperature
                    data['section3']['max_temperature'] = {
                        'sign': '0' if part[1] == '0' else '1',
                        'value': float(part[2:5]) / 10 if part[2:5].isdigit() else None
                    }
                elif part.startswith('2'):  # 2snTnTnTn - Minimum temperature
                    data['section3']['min_temperature'] = {
                        'sign': '0' if part[1] == '0' else '1',
                        'value': float(part[2:5]) / 10 if part[2:5].isdigit() else None
                    }
                elif part.startswith('5'):  # 5appp - Pressure tendency
                    data['pressure_tendency'] = int(part[1]) if part[1].isdigit() else None
                    data['pressure_change'] = float(part[2:5]) / 10 if part[2:5].isdigit() else None
                    data['section3']['pressure_tendency'] = {
                        'characteristic': data['pressure_tendency'],
                        'change': data['pressure_change']
                    }
                elif part.startswith('6'):  # 6RRRtR - Precipitation amount
                    data['section3']['precipitation'] = float(part[1:4]) / 10 if part[1:4].isdigit() else None
                elif part.startswith('7'):  # 7R24R24R24R24 - 24-hour precipitation
                    data['section3']['precipitation_24h'] = float(part[1:5]) / 10 if part[1:5].isdigit() else None

        # Validate data
        if data['pressure'] is not None and (data['pressure'] < 800 or data['pressure'] > 1100):
            logger.warning(f"Invalid pressure value: {data['pressure']}")
            data['pressure'] = None
        if data['temperature'] is not None and (data['temperature'] < -50 or data['temperature'] > 50):
            logger.warning(f"Invalid temperature value: {data['temperature']}")
            data['temperature'] = None

        return data
    except Exception as e:
        logger.error(f"Error parsing SYNOP report: {report[:20]}..., {str(e)}")
        return None

@shared_task(bind=True, max_retries=3, retry_backoff=True)
def fetch_meteo_data(self):
    # Fetch station info from DB
    stations = WeatherStation.objects.all()
    station_ids = set(str(s.station_id).zfill(5) for s in stations)
    station_map = {str(s.station_id).zfill(5): s for s in stations}
    blocks = set(station_id[:2] for station_id in station_ids)

    # Try the last 3 hours first

    end_time = datetime.utcnow()
    # begin_time_str = "2025-06-15 12:00:00+00"
    # begin_time = datetime.fromisoformat(begin_time_str)
    begin_time = end_time - timedelta(hours=3)
    begin_str = begin_time.strftime('%Y%m%d%H%M')
    end_str = end_time.strftime('%Y%m%d%H%M')
    logger.info(f"Fetching data from {begin_str} to {end_str}")

    total_rows = 0
    for block in blocks:
        params = {
            'begin': begin_str,
            'end': end_str,
            'block': block,
            'lang': 'en',
            'header': 'yes',
            'ship': 'no'
        }
        url = "https://www.ogimet.com/cgi-bin/getsynop"
        logger.info(f"Requesting URL for block {block}: {url}")

        try:
            response = requests.get(url, params=params, timeout=30)
            logger.debug(f"Response for block {block} (status {response.status_code}): {response.text[:200]}")
            response.raise_for_status()

            csv_data = StringIO(response.text)
            reader = csv.DictReader(csv_data)
            row_count = 0
            for row in reader:
                row_count += 1
                station_id = row['STATION']
                if station_id not in station_map:
                    logger.warning(f"Station {station_id} not in station_map. Skipping.")
                    continue
                station = station_map[station_id]
                report = row['REPORT'].strip()
                logger.debug(f"Processing station {station_id}: {report[:50]}")

                if report == 'NIL':
                    logger.debug(f"Skipping NIL report for station {station_id}")
                    continue

                try:
                    station = WeatherStation.objects.get(station_id=station_id)
                except WeatherStation.DoesNotExist:
                    logger.warning(f"Station {station_id} not found in WeatherStation model. Skipping.")
                    continue

                year = int(row['YEAR'])
                month = int(row['MONTH'])
                day = int(row['DAY'])
                hour = int(row['HOUR'])
                minute = int(row['MINUTE'])
                observation_time = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)

                if SynopReport.objects.filter(station=station, observation_time=observation_time).exists():
                    logger.debug(f"SynopReport already exists for station {station_id} at {observation_time}. Skipping.")
                    continue

                parsed_data = parse_synop_report(report)
                if not parsed_data:
                    logger.warning(f"Failed to parse report for station {station_id}: {report}")
                    continue
                SynopReport.objects.create(
                    station=station,
                    observation_time=observation_time,
                    level='SURFACE',
                    wind_direction=parsed_data['wind_direction'],
                    wind_speed=parsed_data['wind_speed'],
                    temperature=parsed_data['temperature'],
                    dew_point=parsed_data['dew_point'],
                    station_pressure=parsed_data['section1'].get('station_pressure'),
                    sea_level_pressure=parsed_data['section1'].get('sea_level_pressure'),
                    cloud_cover=parsed_data['cloud_cover'],
                    cloud_low_type=parsed_data['section1']['clouds']['low_type'],
                    cloud_mid_type=parsed_data['section1']['clouds']['mid_type'],
                    cloud_high_type=parsed_data['section1']['clouds']['high_type'],
                    visibility=parsed_data['visibility'],
                    weather_present=parsed_data['section1']['weather']['present'],
                    weather_past=parsed_data['section1']['weather']['past'],
                    pressure_tendency=parsed_data['pressure_tendency'],
                    pressure_change=parsed_data['pressure_change'],
                    max_temperature=parsed_data['section3'].get('max_temperature', {}).get('value'),
                    min_temperature=parsed_data['section3'].get('min_temperature', {}).get('value'),
                    precipitation=parsed_data['section3'].get('precipitation'),
                    precipitation_24h=parsed_data['section3'].get('precipitation_24h')
                )
                logger.info(f"Created SynopReport for station {station_id} at {observation_time}")
            logger.info(f"Processed {row_count} rows for block {block}")
            total_rows += row_count
        except requests.RequestException as e:
            logger.error(f"Error fetching data for block {block}: {e}")
            raise self.retry(exc=e, countdown=60)
    
    # Fallback: Try the previous 24 hours
    if total_rows == 0:
        logger.warning("No new data fetched in the last 3 hours. Falling back to the last 24 hours.")
        end_time = datetime.utcnow()
        begin_time = end_time - timedelta(hours=24)
        begin_str = begin_time.strftime('%Y%m%d%H%M')
        end_str = end_time.strftime('%Y%m%d%H%M')
        logger.info(f"Fallback: Fetching data from {begin_str} to {end_str}")

        for block in blocks:
            params = {
                'begin': begin_str,
                'end': end_str,
                'block': block,
                'lang': 'en',
                'header': 'yes',
                'ship': 'no'
            }
            url = "https://www.ogimet.com/cgi-bin/getsynop"
            logger.info(f"Requesting URL for block {block}: {url}")

            try:
                response = requests.get(url, params=params, timeout=30)
                logger.debug(f"Response for block {block} (status {response.status_code}): {response.text[:200]}")
                response.raise_for_status()

                csv_data = StringIO(response.text)
                reader = csv.DictReader(csv_data)
                row_count = 0
                for row in reader:
                    row_count += 1
                    station_id = row['STATION']
                    if station_id not in station_map:
                        logger.warning(f"Station {station_id} not in station_map. Skipping.")
                        continue
                    station = station_map[station_id]
                    report = row['REPORT'].strip()
                    logger.debug(f"Processing station {station_id}: {report[:50]}")

                    if report == 'NIL':
                        logger.debug(f"Skipping NIL report for station {station_id}")
                        continue

                    try:
                        station = WeatherStation.objects.get(station_id=station_id)
                    except WeatherStation.DoesNotExist:
                        logger.warning(f"Station {station_id} not found in WeatherStation model. Skipping.")
                        continue

                    year = int(row['YEAR'])
                    month = int(row['MONTH'])
                    day = int(row['DAY'])
                    hour = int(row['HOUR'])
                    minute = int(row['MINUTE'])
                    observation_time = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)

                    if SynopReport.objects.filter(station=station, observation_time=observation_time).exists():
                        logger.debug(f"SynopReport already exists for station {station_id} at {observation_time}. Skipping.")
                        continue

                    parsed_data = parse_synop_report(report)
                    if not parsed_data:
                        logger.warning(f"Failed to parse report for station {station_id}: {report}")
                        continue

                    SynopReport.objects.create(
                        station=station,
                        observation_time=observation_time,
                        level='SURFACE',
                        wind_direction=parsed_data['wind_direction'],
                        wind_speed=parsed_data['wind_speed'],
                        temperature=parsed_data['temperature'],
                        dew_point=parsed_data['dew_point'],
                        station_pressure=parsed_data['section1'].get('station_pressure'),
                        sea_level_pressure=parsed_data['section1'].get('sea_level_pressure'),
                        cloud_cover=parsed_data['cloud_cover'],
                        cloud_low_type=parsed_data['section1']['clouds']['low_type'],
                        cloud_mid_type=parsed_data['section1']['clouds']['mid_type'],
                        cloud_high_type=parsed_data['section1']['clouds']['high_type'],
                        visibility=parsed_data['visibility'],
                        weather_present=parsed_data['section1']['weather']['present'],
                        weather_past=parsed_data['section1']['weather']['past'],
                        pressure_tendency=parsed_data['pressure_tendency'],
                        pressure_change=parsed_data['pressure_change'],
                        max_temperature=parsed_data['section3'].get('max_temperature', {}).get('value'),
                        min_temperature=parsed_data['section3'].get('min_temperature', {}).get('value'),
                        precipitation=parsed_data['section3'].get('precipitation'),
                        precipitation_24h=parsed_data['section3'].get('precipitation_24h')
                    )
                    logger.info(f"Created SynopReport for station {station_id} at {observation_time}")
                logger.info(f"Processed {row_count} rows for block {block}")
                total_rows += row_count
            except requests.RequestException as e:
                logger.error(f"Error fetching data for block {block}: {e}")
                raise self.retry(exc=e, countdown=60)

    if total_rows == 0:
        logger.warning("No new data fetched even after fallback.")

    logger.info("Upper-level data fetching not implemented. Requires external data source.")

@shared_task
def clean_exported_maps():
    """Clean up exported maps older than 7 days."""
    threshold = django_timezone.now() - timedelta(days=7)
    old_maps = ExportedMap.objects.filter(created_at__lt=threshold)
    for map in old_maps:
        try:
            if os.path.exists(map.file_path.path):
                os.remove(map.file_path.path)
                logger.info(f"Deleted exported map file: {map.file_path}")
            map.delete()
            logger.info(f"Deleted exported map record: {map.file_name}")
        except Exception as e:
            logger.error(f"Error deleting exported map {map.file_name}: {e}")