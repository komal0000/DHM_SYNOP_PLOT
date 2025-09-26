import numpy as np
from scipy.spatial import distance_matrix
from scipy.ndimage import gaussian_filter
from scipy.interpolate import splprep, splev
from django.contrib.gis.geos import LineString, Point
from django.db import transaction, utils as db_utils
from .models import UpperAirSynopReport, UpperAirIsobar, UpperAirPressureCenter, UpperAirIsotherm
import logging
import pytz
from datetime import datetime, timedelta
import matplotlib
matplotlib.use('Agg')  # Force non-GUI backend to avoid Tkinter
import matplotlib.pyplot as plt
from pykrige.ok import OrdinaryKriging

# Set up logging
logger = logging.getLogger(__name__)

def validate_data(data, data_type, level, observation_time, time_tolerance_minutes=30):
    if not data:
        logger.warning(f"No {data_type} data provided")
        return []

    validated_data = []
    min_val, max_val = (700, 24000) if data_type == 'height' else (-50, 50) if data_type == 'temperature' else (None, None)
    if min_val is None or max_val is None:
        raise ValueError(f"Invalid data_type: {data_type}")

    time_min = observation_time - timedelta(minutes=time_tolerance_minutes)
    time_max = observation_time + timedelta(minutes=time_tolerance_minutes)

    unique_stations = set()
    for lon, lat, val, station_id, obs_time in data:
        if not (time_min <= obs_time <= time_max):
            continue
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            continue
        if val is None or (isinstance(val, str) and val.lower() == 'null'):
            continue
        try:
            val = float(val)
        except (ValueError, TypeError):
            continue
        if not (min_val <= val <= max_val):
            continue
        station_key = (station_id, obs_time.isoformat())
        if station_key in unique_stations:
            continue
        unique_stations.add(station_key)
        validated_data.append((lon, lat, val))

    logger.info(f"Validated {len(validated_data)} {data_type} data points")
    return validated_data

def upper_air_generate_contours(level, observation_time=None, map_type=None):
    # Set dynamic observation time to current Nepal time if not provided
    if observation_time is None:
        observation_time = datetime.now(tz=pytz.timezone('Asia/Kathmandu')).replace(
            microsecond=0, second=0, minute=0
        )
        logger.info(f"No observation time provided, using current time: {observation_time}")
    else:
        try:
            if not isinstance(observation_time, str):
                raise ValueError("observation_time must be a string in ISO format")
            observation_time_str = observation_time.replace('Z', '+00:00')
            observation_time = datetime.fromisoformat(observation_time_str).astimezone(
                pytz.timezone('Asia/Kathmandu')
            )
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid observation_time format: {observation_time}, error: {str(e)}")
            return False

    logger.info(f"Using observation time: {observation_time}")

    # Fetch reports with retry mechanism
    for attempt in range(3):
        try:
            reports = UpperAirSynopReport.objects.filter(level=level)
            time_tolerance = timedelta(minutes=60)
            time_min = observation_time - time_tolerance
            time_max = observation_time + time_tolerance
            reports = reports.filter(observation_time__range=(time_min, time_max))

            report_count = reports.count()
            logger.info(f"Found {report_count} reports for level={level}, time range: {time_min} to {time_max}")
            if report_count == 0:
                logger.warning(f"No reports found for level={level}, observation_time={observation_time}")
                if attempt == 0:
                    logger.info("Triggering data fetch...")
                    continue
                return False

            height_data = [
                (r.station.location.x, r.station.location.y, r.height, r.station_id, r.observation_time)
                for r in reports if r.height is not None and r.station.location is not None
            ]
            temperature_data = [
                (r.station.location.x, r.station.location.y, r.temperature, r.station_id, r.observation_time)
                for r in reports if r.temperature is not None and r.station.location is not None
            ]
            logger.info(f"Extracted {len(height_data)} height data points, {len(temperature_data)} temperature data points")

            break
        except db_utils.DatabaseError as db_err:
            if attempt == 2:
                logger.error(f"Database error after retries: {str(db_err)}")
                return False
            logger.warning(f"Database error, retrying ({attempt+1}/3): {str(db_err)}")
            continue

    height_data = validate_data(height_data, 'height', level, observation_time)
    temperature_data = validate_data(temperature_data, 'temperature', level, observation_time)
    if len(height_data) < 3 or len(temperature_data) < 3:
        logger.error("Insufficient valid data")
        return False

    height_lons, height_lats, height_vals = zip(*height_data)
    temp_lons, temp_lats, temp_vals = zip(*temperature_data)

    # Determine height levels based on station data with 60 GPM interval
    min_height = np.floor(min(height_vals) / 60) * 60
    max_height = np.ceil(max(height_vals) / 60) * 60
    height_levels = np.arange(min_height, max_height + 60, 60)
    temp_levels = np.arange(np.floor(min(temp_vals)), np.ceil(max(temp_vals)) + 1, 1)  # 1°C intervals
    logger.info(f"Dynamic height range: {min_height} to {max_height} meters, temperature range: {min(temp_vals)} to {max(temp_vals)}°C")

    with transaction.atomic():
        UpperAirIsobar.objects.filter(level=level, observation_time=observation_time).delete()
        UpperAirPressureCenter.objects.filter(level=level, observation_time=observation_time).delete()

        # Identify pressure centers directly from station data (using height for context)
        geojson_centers = {"type": "FeatureCollection", "features": []}
        pressure_center_count = 0
        centers = []
        height_range = max(height_vals) - min(height_vals)
        threshold = max(90, 0.015 * height_range)  # Adjusted threshold (min 90 meters)
        for i, (lon, lat, val) in enumerate(height_data):
            neighbors = []
            for j, (lon2, lat2, val2) in enumerate(height_data):
                if i != j and distance_matrix([[lon, lat]], [[lon2, lat2]])[0][0] < 4:  # Reduced to 4°
                    neighbors.append(val2)
            if neighbors and len(neighbors) > 3:  # Ensure at least 3 neighbors
                neighbor_max = max(neighbors)
                neighbor_min = min(neighbors)
                if val > neighbor_max + threshold:  # High pressure (low height) center
                    centers.append(('HIGH', lon, lat, val))
                    UpperAirPressureCenter.objects.create(
                        level=level, observation_time=observation_time, location=Point(lon, lat, srid=4326),
                        center_type='HIGH', pressure=float(val)  # Using height as proxy for pressure center
                    )
                    pressure_center_count += 1
                    geojson_centers["features"].append({
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [lon, lat]},
                        "properties": {"type": "HIGH", "height": float(val), "level": level, "time": observation_time.isoformat()}
                    })
                elif val < neighbor_min - threshold:  # Low pressure (high height) center
                    centers.append(('LOW', lon, lat, val))
                    UpperAirPressureCenter.objects.create(
                        level=level, observation_time=observation_time, location=Point(lon, lat, srid=4326),
                        center_type='LOW', pressure=float(val)  # Using height as proxy for pressure center
                    )
                    pressure_center_count += 1
                    geojson_centers["features"].append({
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [lon, lat]},
                        "properties": {"type": "LOW", "height": float(val), "level": level, "time": observation_time.isoformat()}
                    })
                logger.debug(f"Station {i}: val={val}, neighbors={len(neighbors)}, max_diff={max(val - neighbor_max, neighbor_min - val) if neighbors else 0}")
            else:
                logger.debug(f"Station {i}: val={val}, neighbors={len(neighbors)}, max_diff=0")
        logger.info(f"Generated {pressure_center_count} pressure centers")

        # Create region-wide grid based on upper air coverage
        min_lon, max_lon = 35.0, 120.0
        min_lat, max_lat = 0.0, 45.0
        resolution = 0.25  # Finer resolution for smoother contours
        num_points_lon = int((max_lon - min_lon) / resolution) + 1
        num_points_lat = int((max_lat - min_lat) / resolution) + 1
        grid_lon, grid_lat = np.meshgrid(
            np.linspace(min_lon, max_lon, num_points_lon),
            np.linspace(min_lat, max_lat, num_points_lat)
        )
        logger.debug(f"Grid shapes: grid_lon={grid_lon.shape}, grid_lat={grid_lat.shape}")

        # Interpolate height and temperature values onto the grid using Kriging
        try:
            # Kriging for height
            ok_height = OrdinaryKriging(
                height_lons,
                height_lats,
                height_vals,
                variogram_model='spherical',
                variogram_parameters={'sill': np.var(height_vals), 'range': 10.0, 'nugget': 0.1},
                verbose=False,
                enable_plotting=False
            )
            grid_height, _ = ok_height.execute('grid', np.linspace(min_lon, max_lon, num_points_lon), np.linspace(min_lat, max_lat, num_points_lat))
            grid_height = np.array(grid_height)  # Ensure it's a numpy array
            logger.debug(f"Height grid shape after Kriging: {grid_height.shape}")

            # Kriging for temperature
            ok_temp = OrdinaryKriging(
                temp_lons,
                temp_lats,
                temp_vals,
                variogram_model='spherical',
                variogram_parameters={'sill': np.var(temp_vals), 'range': 10.0, 'nugget': 0.1},
                verbose=False,
                enable_plotting=False
            )
            grid_temp, _ = ok_temp.execute('grid', np.linspace(min_lon, max_lon, num_points_lon), np.linspace(min_lat, max_lat, num_points_lat))
            grid_temp = np.array(grid_temp)  # Ensure it's a numpy array
            logger.debug(f"Temperature grid shape after Kriging: {grid_temp.shape}")

            # Ensure grid shapes match
            if grid_height.shape != grid_lon.shape:
                logger.warning(f"Reshaping grid_height from {grid_height.shape} to {grid_lon.shape}")
                grid_height = grid_height.reshape(grid_lon.shape)
            if grid_temp.shape != grid_lon.shape:
                logger.warning(f"Reshaping grid_temp from {grid_temp.shape} to {grid_lon.shape}")
                grid_temp = grid_temp.reshape(grid_lon.shape)

        except Exception as e:
            logger.error(f"Kriging interpolation failed: {str(e)}")
            return False

        # Fill NaN values with nearest neighbor and apply smoothing
        mask = np.isnan(grid_height)
        if np.any(mask):
            from scipy.interpolate import griddata
            logger.debug(f"Filling {np.sum(mask)} NaN values in grid_height")
            grid_height[mask] = griddata(
                [(lon, lat) for lon, lat, _ in height_data],
                height_vals,
                (grid_lon[mask], grid_lat[mask]),
                method='nearest'
            )
        grid_height = gaussian_filter(grid_height, sigma=2.0)  # Increased sigma for smoother contours
        logger.debug(f"Applied Gaussian filter to grid_height with sigma=2.0")

        mask = np.isnan(grid_temp)
        if np.any(mask):
            from scipy.interpolate import griddata
            logger.debug(f"Filling {np.sum(mask)} NaN values in grid_temp")
            grid_temp[mask] = griddata(
                [(lon, lat) for lon, lat, _ in temperature_data],
                temp_vals,
                (grid_lon[mask], grid_lat[mask]),
                method='nearest'
            )
        grid_temp = gaussian_filter(grid_temp, sigma=2.0)  # Increased sigma for smoother contours
        logger.debug(f"Applied Gaussian filter to grid_temp with sigma=2.0")

        # Verify shapes before contouring
        logger.debug(f"Final shapes: grid_lon={grid_lon.shape}, grid_lat={grid_lat.shape}, grid_height={grid_height.shape}, grid_temp={grid_temp.shape}")
        if grid_height.shape != grid_lon.shape or grid_temp.shape != grid_lon.shape:
            logger.error(f"Shape mismatch: grid_lon={grid_lon.shape}, grid_height={grid_height.shape}, grid_temp={grid_temp.shape}")
            return False

        # Generate height contours and isotherms
        geojson_height_contours = {"type": "FeatureCollection", "features": []}
        geojson_isotherms = {"type": "FeatureCollection", "features": []}
        height_contour_count = 0
        isotherm_count = 0
        fig, ax = plt.subplots()
        try:
            cs_height = ax.contour(grid_lon, grid_lat, grid_height, levels=height_levels, colors='blue', corner_mask=True)
            clabels_height = ax.clabel(cs_height, fmt='%d m', inline=True, fontsize=12, inline_spacing=5)
            cs_temp = ax.contour(grid_lon, grid_lat, grid_temp, levels=temp_levels, colors='red', linestyles='dashed', corner_mask=True)
            clabels_temp = ax.clabel(cs_temp, fmt='%d°C', inline=True, fontsize=10, inline_spacing=4)
        except Exception as e:
            logger.error(f"Contour generation failed: {str(e)}")
            return False

        # Function to smooth contour paths using spline interpolation
        def smooth_contour_path(path, num_points=200, s=0.1):
            if len(path) < 4:  # Skip smoothing for very short paths
                logger.debug(f"Skipping spline smoothing for path with {len(path)} points")
                return path
            try:
                x, y = path[:, 0], path[:, 1]
                t = np.linspace(0, 1, len(x))
                spl, u = splprep([x, y], s=s, k=3, quiet=True)
                u_new = np.linspace(0, 1, num_points)
                x_new, y_new = splev(u_new, spl)
                return np.column_stack((x_new, y_new))
            except Exception as e:
                logger.warning(f"Spline smoothing failed for path with {len(path)} points: {str(e)}")
                return path

        # Process height contours with spline smoothing
        for i, contour in enumerate(cs_height.allsegs):
            for path in contour:
                if len(path) > 1:
                    smoothed_path = smooth_contour_path(path, num_points=200, s=0.1)
                    logger.debug(f"Height contour path: original points={len(path)}, smoothed points={len(smoothed_path)}")
                    geom = LineString(smoothed_path, srid=4326)
                    level_val = height_levels[i]
                    UpperAirIsobar.objects.create(
                        level=level, observation_time=observation_time, pressure=float(level_val), geometry=geom  # Reusing pressure as height placeholder
                    )
                    height_contour_count += 1
                    geojson_height_contours["features"].append({
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": smoothed_path.tolist()},
                        "properties": {"height": float(level_val), "level": level, "time": observation_time.isoformat()}
                    })

        # Process isotherms with spline smoothing
        for i, contour in enumerate(cs_temp.allsegs):
            for path in contour:
                if len(path) > 1:
                    smoothed_path = smooth_contour_path(path, num_points=200, s=0.1)
                    logger.debug(f"Isotherm path: original points={len(path)}, smoothed points={len(smoothed_path)}")
                    geom = LineString(smoothed_path, srid=4326)
                    level_val = temp_levels[i]
                    try:
                        UpperAirIsotherm.objects.create(
                            level=level,
                            observation_time=observation_time,
                            temperature=float(level_val),
                            geometry=geom
                        )
                        isotherm_count += 1
                        geojson_isotherms["features"].append({
                            "type": "Feature",
                            "geometry": {"type": "LineString", "coordinates": smoothed_path.tolist()},
                            "properties": {
                                "temperature": float(level_val),
                                "level": level,
                                "time": observation_time.isoformat()
                            }
                        })
                    except Exception as e:
                        logger.error(f"Failed to save isotherm for temperature {level_val}°C: {str(e)}")
                        continue

        logger.info(f"Generated {height_contour_count} height contours, {isotherm_count} isotherms")
        plt.close(fig)  # Ensure figure is closed to release resources
        if map_type == 'DEBUG':
            ax.scatter(height_lons, height_lats, c='gray', s=10, alpha=0.5)
            for center_type, lon, lat, val in centers:
                color = 'blue' if center_type == 'HIGH' else 'red'
                ax.text(lon, lat, center_type, fontsize=14, ha='center', va='center', color=color, weight='bold')
            plt.savefig(f"debug_map_{level}_{observation_time.isoformat()}.png", dpi=300, bbox_inches='tight')
            logger.info("Debug map saved")

    return {
        "height_contours": geojson_height_contours,
        "isotherms": geojson_isotherms,
        "centers": geojson_centers
    }