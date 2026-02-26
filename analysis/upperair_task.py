import requests
from weather_map.celery import shared_task
from datetime import datetime, timezone as dt_timezone, timedelta
from django.utils.timezone import make_aware
from analysis.models import UpperAirWeatherStation, UpperAirSynopReport
from bs4 import BeautifulSoup
import logging
import urllib3

# Disable SSL warnings when verify=False is used
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)


def parse_ttaa_report(report):
    if report == 'NIL' or not report.strip():
        logger.warning("Empty or NIL TTAA report received")
        return None

    try:
        report = report.strip('=').replace('\n', ' ').strip()
        parts = report.split()

        # Parse header (assuming Ogimet format with full timestamp)
        timestamp_str = parts[0]
        observation_time = datetime.strptime(timestamp_str, "%Y%m%d%H%M")
        if parts[1] != 'TTAA':
            logger.warning(f"Invalid report type, expected TTAA but got {parts[1]}")
            return None
        station_id = parts[3]
        if not (station_id.isdigit() and len(station_id) == 5):
            logger.warning(f"Invalid station ID: {station_id}")
            return None

        data = {
            'station_id': station_id,
            'observation_time': observation_time,
            'levels': []
        }

        level_map = {
            '850': '850HPA',
            '700': '700HPA',
            '500': '500HPA',
            '200': '200HPA'
        }

        i = 4
        n = len(parts)

        while i < n:
            group = parts[i]
            if group in ['88999', '77999', '31313', '51515']:
                break

            if len(group) == 5 and group.isdigit():
                if group.startswith('99'):
                    pressure_hpa = int(group[2:])
                elif group.startswith('00'):
                    pressure_hpa = 1000
                else:
                    pressure_hpa = int(group[:2]) * 10

                pressure_key = str(pressure_hpa)
                if pressure_key in level_map:
                    level_data = {
                        'level': level_map[pressure_key],
                        'pressure': pressure_hpa,
                        'temperature': None,
                        'dew_point': None,
                        'wind_direction': None,
                        'wind_speed': None,
                        'height': None
                    }

                    # Parse height
                    if group.startswith('00'):
                        height_raw = int(group[2:])
                        level_data['height'] = -(height_raw - 500) if height_raw >= 500 else height_raw
                    elif not group.startswith('99'):
                        height_raw = int(group[2:])
                        if pressure_hpa <= 500:
                            level_data['height'] = height_raw * 10
                        else:
                            level_data['height'] = height_raw + 1000 if pressure_hpa <= 850 else height_raw

                    # Parse temperature and dew point
                    if i + 1 < n and parts[i + 1] != '/////':
                        temp_group = parts[i + 1]
                        if len(temp_group) == 5 and temp_group.isdigit():
                            temp_raw = int(temp_group[:3])
                            sign = -1 if (int(temp_group[2]) % 2 == 1) else 1
                            temp = sign * (temp_raw / 10.0)
                            dpd_raw = int(temp_group[3:])
                            dpd = dpd_raw - 50 if dpd_raw >= 50 else dpd_raw / 10.0
                            level_data['temperature'] = temp
                            level_data['dew_point'] = temp - dpd

                    # Parse wind
                    if i + 2 < n and parts[i + 2] != '/////':
                        wind_group = parts[i + 2]
                        if len(wind_group) == 5 and wind_group.isdigit():
                            wind_dir = int(wind_group[:2]) * 10
                            wind_spd = int(wind_group[2:])
                            if wind_group[2] in ['1', '5'] and wind_spd >= 500:
                                wind_dir = (int(wind_group[:2]) - 50) * 10
                                wind_spd -= 500
                            level_data['wind_direction'] = wind_dir
                            level_data['wind_speed'] = wind_spd

                    data['levels'].append(level_data)
                    i += 3
                else:
                    logger.debug(f"Skipping pressure level {pressure_hpa} not in level_map")
                    i += 1
            else:
                i += 1

        return data

    except Exception as e:
        logger.error(f"Error parsing TTAA report: {report[:40]}..., {str(e)}")
        return None


@shared_task(bind=True, max_retries=3, retry_backoff=True)
def fetch_upper_air_data(self):

    upper_air_stations = UpperAirWeatherStation.objects.all()
    upper_air_station_map = {str(s.station_id).zfill(5): s for s in upper_air_stations}

    # upper_air_station_map = {
    #     '41923': UpperAirWeatherStation.objects.get(station_id="41923")
    # }

    # Use a 30-day window (1 month) to include multiple observation times (00Z and 12Z)
    now_utc = datetime.now(dt_timezone.utc)
    start_time = (now_utc - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
    end_time = now_utc.replace(minute=0, second=0, microsecond=0)

    logger.info(
        f"Fetching upper air data for stations in range: {start_time.isoformat()} to {end_time.isoformat()} (last 30 days)"
    )

    
    upper_air_url = "https://www.ogimet.com/display_sond.php"
    total_rows = 0

    for station_id, station in upper_air_station_map.items():
        params = {
            'lang': 'en',
            # Request only TTAA format soundings (parser expects TTAA)
            'tipo': 'ALL',
            'ord': 'DIR',
            'nil': 'SI',
            'fmt': 'txt',
            # 3-day range start (00Z)
            'ano': start_time.strftime('%Y'),
            'mes': start_time.strftime('%m'),
            'day': start_time.strftime('%d'),
            'hora': "00",
            # 3-day range end (12Z of the last day)
            'anof': end_time.strftime('%Y'),
            'mesf': end_time.strftime('%m'),
            'dayf': end_time.strftime('%d'),
            'horaf': "12",
            'lugar': station_id,
            'send': 'send'
        }

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/124.0.0.0 Safari/537.36"
        }

        try:
            # Disable SSL verification to handle certificate date issues
            response = requests.get(upper_air_url, params=params, timeout=30, headers=headers, verify=False)
            response.raise_for_status()

            logger.info(
                f"Fetching upper air data for station {station_id} between {start_time.isoformat()} and {end_time.isoformat()}"
            )
            soup = BeautifulSoup(response.text, "html.parser")
            pre_tag = soup.find("pre")
            if not pre_tag:
                logger.warning(f"No <pre> tag found in response for station {station_id}")
                continue

            data_text = pre_tag.get_text()
            upper_air_row_count = 0

            # Robustly extract TTAA message blocks: start with 12-digit timestamp + ' TTAA'
            import re
            pattern = re.compile(r"(\d{12}\s+TTAA\b.*?)(?:\n\s*=\s*\n|\Z)", re.S | re.M)
            ttaa_blocks = pattern.findall(data_text + "\n=\n")

            if not ttaa_blocks:
                logger.debug(f"No TTAA blocks found in response for station {station_id}. First 300 chars: {data_text[:300]!r}")

            for report in ttaa_blocks:
                report = report.strip()
                if not report:
                    continue

                parsed_data = parse_ttaa_report(report)
                if not parsed_data:
                    logger.warning(f"Failed to parse TTAA report for station {station_id}")
                    continue

                # Use the actual observation time embedded in the TTAA report
                parsed_obs_time = parsed_data.get('observation_time')
                if parsed_obs_time is None:
                    logger.warning(f"Parsed TTAA missing observation time for station {station_id}")
                    continue

                # Ensure timezone-aware UTC datetime
                try:
                    obs_time_aware = make_aware(parsed_obs_time, dt_timezone.utc) if parsed_obs_time.tzinfo is None else parsed_obs_time
                except Exception as tz_e:
                    logger.warning(f"Failed to make observation time timezone-aware: {tz_e}; falling back to naive time")
                    obs_time_aware = parsed_obs_time

                for level_data in parsed_data['levels']:
                    if UpperAirSynopReport.objects.filter(
                        station=station,
                        observation_time=obs_time_aware,
                        level=level_data['level']
                    ).exists():
                        logger.debug(f"Report exists for station {station_id} at {obs_time_aware} ({level_data['level']})")
                        continue

                    UpperAirSynopReport.objects.create(
                        station=station,
                        observation_time=obs_time_aware,
                        level=level_data['level'],
                        pressure=level_data['pressure'],
                        temperature=level_data['temperature'],
                        dew_point=level_data['dew_point'],
                        wind_direction=level_data['wind_direction'],
                        wind_speed=level_data['wind_speed'],
                        height=level_data['height']
                    )
                    logger.info(f"Created report for station {station_id} at {obs_time_aware} ({level_data['level']})")
                    upper_air_row_count += 1

            logger.info(f"Processed {upper_air_row_count} reports for station {station_id}")
            total_rows += upper_air_row_count

        except requests.RequestException as e:
            logger.error(f"Error fetching data for station {station_id}: {e}")
            raise self.retry(exc=e, countdown=60)

    if total_rows == 0:
        logger.warning("No new data fetched for any station.")
