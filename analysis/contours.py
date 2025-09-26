import numpy as np
from scipy.spatial import distance_matrix
from scipy.ndimage import gaussian_filter
from scipy.interpolate import splprep, splev
from django.contrib.gis.geos import LineString, Point
from django.db import transaction, utils as db_utils
from .models import SynopReport, Isobar, PressureCenter, Isotherm
import logging
import pytz
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
from pykrige.ok import OrdinaryKriging

# Set up logging
logger = logging.getLogger(__name__)

def validate_data(data, data_type, level, observation_time, time_tolerance_minutes=30):
    if not data:
        logger.warning(f"No {data_type} data provided")
        return []

    validated_data = []
    min_val, max_val = (965, 1050) if data_type == 'sea_level_pressure' else (-50, 50) if data_type == 'temperature' else (None, None)
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

def generate_contours(level, observation_time=None, map_type=None):
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
            reports = SynopReport.objects.filter(level=level)
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

            pressure_data = [
                (r.station.location.x, r.station.location.y, r.sea_level_pressure, r.station_id, r.observation_time)
                for r in reports if r.sea_level_pressure is not None and r.station.location is not None
            ]
            temperature_data = [
                (r.station.location.x, r.station.location.y, r.temperature, r.station_id, r.observation_time)
                for r in reports if r.temperature is not None and r.station.location is not None
            ]
            logger.info(f"Extracted {len(pressure_data)} pressure data points, {len(temperature_data)} temperature data points")

            break
        except db_utils.DatabaseError as db_err:
            if attempt == 2:
                logger.error(f"Database error after retries: {str(db_err)}")
                return False
            logger.warning(f"Database error, retrying ({attempt+1}/3): {str(db_err)}")
            continue

    pressure_data = validate_data(pressure_data, 'sea_level_pressure', level, observation_time)
    temperature_data = validate_data(temperature_data, 'temperature', level, observation_time)
    if len(pressure_data) < 3 or len(temperature_data) < 3:
        logger.error("Insufficient valid data")
        return False

    pressure_lons, pressure_lats, pressure_vals = zip(*pressure_data)
    temp_lons, temp_lats, temp_vals = zip(*temperature_data)

    # Determine pressure levels based on station data
    min_pressure = np.floor(min(pressure_vals) / 2) * 2
    max_pressure = np.ceil(max(pressure_vals) / 2) * 2
    pressure_levels = np.arange(min_pressure, max_pressure + 2, 2)
    temp_levels = np.arange(np.floor(min(temp_vals)), np.ceil(max(temp_vals)) + 1, 1)  # 1°C intervals
    logger.info(f"Dynamic pressure range: {min_pressure} to {max_pressure} hPa, temperature range: {min(temp_vals)} to {max(temp_vals)}°C")

    with transaction.atomic():
        Isobar.objects.filter(level=level, observation_time=observation_time).delete()
        PressureCenter.objects.filter(level=level, observation_time=observation_time).delete()

        # Identify pressure centers directly from station data
        geojson_centers = {"type": "FeatureCollection", "features": []}
        pressure_center_count = 0
        centers = []
        pressure_range = max(pressure_vals) - min(pressure_vals)
        threshold = max(1.5, 0.015 * pressure_range)  # Adjusted threshold (min 1.5 hPa)
        for i, (lon, lat, val) in enumerate(pressure_data):
            neighbors = []
            for j, (lon2, lat2, val2) in enumerate(pressure_data):
                if i != j and distance_matrix([[lon, lat]], [[lon2, lat2]])[0][0] < 4:  # Reduced to 4°
                    neighbors.append(val2)
            if neighbors and len(neighbors) > 3:  # Ensure at least 3 neighbors
                neighbor_max = max(neighbors)
                neighbor_min = min(neighbors)
                if val > neighbor_max + threshold:  # High pressure center
                    centers.append(('HIGH', lon, lat, val))
                    PressureCenter.objects.create(
                        level=level, observation_time=observation_time, location=Point(lon, lat, srid=4326),
                        center_type='HIGH', pressure=float(val)
                    )
                    pressure_center_count += 1
                    geojson_centers["features"].append({
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [lon, lat]},
                        "properties": {"type": "HIGH", "pressure": float(val), "level": level, "time": observation_time.isoformat()}
                    })
                elif val < neighbor_min - threshold:  # Low pressure center
                    centers.append(('LOW', lon, lat, val))
                    PressureCenter.objects.create(
                        level=level, observation_time=observation_time, location=Point(lon, lat, srid=4326),
                        center_type='LOW', pressure=float(val)
                    )
                    pressure_center_count += 1
                    geojson_centers["features"].append({
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [lon, lat]},
                        "properties": {"type": "LOW", "pressure": float(val), "level": level, "time": observation_time.isoformat()}
                    })
            logger.debug(f"Station {i}: val={val}, neighbors={len(neighbors)}, max_diff={max(val - neighbor_max, neighbor_min - val) if neighbors else 0}")
        logger.info(f"Generated {pressure_center_count} pressure centers")

        # Create region-wide grid based on the image's coverage
        min_lon, max_lon = 50.0, 100.0
        min_lat, max_lat = 5.0, 35.0
        resolution = 0.25  # Finer resolution for smoother contours
        num_points_lon = int((max_lon - min_lon) / resolution) + 1
        num_points_lat = int((max_lat - min_lat) / resolution) + 1
        grid_lon, grid_lat = np.meshgrid(
            np.linspace(min_lon, max_lon, num_points_lon),
            np.linspace(min_lat, max_lat, num_points_lat)
        )
        logger.debug(f"Grid shapes: grid_lon={grid_lon.shape}, grid_lat={grid_lat.shape}")

        # Interpolate pressure and temperature values onto the grid using Kriging
        try:
            # Kriging for pressure
            ok_pressure = OrdinaryKriging(
                pressure_lons,
                pressure_lats,
                pressure_vals,
                variogram_model='spherical',
                variogram_parameters={'sill': np.var(pressure_vals), 'range': 10.0, 'nugget': 0.1},
                verbose=False,
                enable_plotting=False
            )
            grid_pressure, _ = ok_pressure.execute('grid', np.linspace(min_lon, max_lon, num_points_lon), np.linspace(min_lat, max_lat, num_points_lat))
            grid_pressure = np.array(grid_pressure)  # Ensure it's a numpy array
            logger.debug(f"Pressure grid shape after Kriging: {grid_pressure.shape}")

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
            if grid_pressure.shape != grid_lon.shape:
                logger.warning(f"Reshaping grid_pressure from {grid_pressure.shape} to {grid_lon.shape}")
                grid_pressure = grid_pressure.reshape(grid_lon.shape)
            if grid_temp.shape != grid_lon.shape:
                logger.warning(f"Reshaping grid_temp from {grid_temp.shape} to {grid_lon.shape}")
                grid_temp = grid_temp.reshape(grid_lon.shape)

        except Exception as e:
            logger.error(f"Kriging interpolation failed: {str(e)}")
            return False

        # Fill NaN values with nearest neighbor and apply smoothing
        mask = np.isnan(grid_pressure)
        if np.any(mask):
            from scipy.interpolate import griddata
            logger.debug(f"Filling {np.sum(mask)} NaN values in grid_pressure")
            grid_pressure[mask] = griddata(
                [(lon, lat) for lon, lat, _ in pressure_data],
                pressure_vals,
                (grid_lon[mask], grid_lat[mask]),
                method='nearest'
            )
        grid_pressure = gaussian_filter(grid_pressure, sigma=2.0)  # Increased sigma for smoother contours
        logger.debug(f"Applied Gaussian filter to grid_pressure with sigma=2.0")

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
        logger.debug(f"Final shapes: grid_lon={grid_lon.shape}, grid_lat={grid_lat.shape}, grid_pressure={grid_pressure.shape}, grid_temp={grid_temp.shape}")
        if grid_pressure.shape != grid_lon.shape or grid_temp.shape != grid_lon.shape:
            logger.error(f"Shape mismatch: grid_lon={grid_lon.shape}, grid_pressure={grid_pressure.shape}, grid_temp={grid_temp.shape}")
            return False

        # Generate isobars and isotherms
        geojson_isobars = {"type": "FeatureCollection", "features": []}
        geojson_isotherms = {"type": "FeatureCollection", "features": []}
        isobar_count = 0
        isotherm_count = 0
        fig, ax = plt.subplots()
        try:
            cs_pressure = ax.contour(grid_lon, grid_lat, grid_pressure, levels=pressure_levels, colors='blue', corner_mask=True)
            clabels_pressure = ax.clabel(cs_pressure, fmt='%d hPa', inline=True, fontsize=12, inline_spacing=5)
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
                # Parameterize by arc length
                t = np.linspace(0, 1, len(x))
                # Fit spline
                spl, u = splprep([x, y], s=s, k=3, quiet=True)
                # Generate new points
                u_new = np.linspace(0, 1, num_points)
                x_new, y_new = splev(u_new, spl)
                return np.column_stack((x_new, y_new))
            except Exception as e:
                logger.warning(f"Spline smoothing failed for path with {len(path)} points: {str(e)}")
                return path

        # Process isobars with spline smoothing
        for i, contour in enumerate(cs_pressure.allsegs):
            for path in contour:
                if len(path) > 1:
                    # Apply spline smoothing
                    smoothed_path = smooth_contour_path(path, num_points=200, s=0.1)
                    logger.debug(f"Isobar path: original points={len(path)}, smoothed points={len(smoothed_path)}")
                    geom = LineString(smoothed_path, srid=4326)
                    level_val = pressure_levels[i]
                    Isobar.objects.create(
                        level=level, observation_time=observation_time, pressure=float(level_val), geometry=geom
                    )
                    isobar_count += 1
                    geojson_isobars["features"].append({
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": smoothed_path.tolist()},
                        "properties": {"pressure": float(level_val), "level": level, "time": observation_time.isoformat()}
                    })

        # Process isotherms with spline smoothing
        for i, contour in enumerate(cs_temp.allsegs):
            for path in contour:
                if len(path) > 1:
                    # Apply spline smoothing
                    smoothed_path = smooth_contour_path(path, num_points=200, s=0.1)
                    logger.debug(f"Isotherm path: original points={len(path)}, smoothed points={len(smoothed_path)}")
                    geom = LineString(smoothed_path, srid=4326)
                    level_val = temp_levels[i]
                    # Save isotherm to database
                    try:
                        Isotherm.objects.create(
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

        logger.info(f"Generated {isobar_count} isobars, {isotherm_count} isotherms")
        plt.close(fig)
        # Optional: Plot stations and pressure centers for debugging
        if map_type == 'DEBUG':
            ax.scatter(pressure_lons, pressure_lats, c='gray', s=10, alpha=0.5)
            for center_type, lon, lat, val in centers:
                color = 'blue' if center_type == 'HIGH' else 'red'
                ax.text(lon, lat, center_type, fontsize=14, ha='center', va='center', color=color, weight='bold')
            plt.savefig(f"debug_map_{level}_{observation_time.isoformat()}.png", dpi=300, bbox_inches='tight')
            logger.info("Debug map saved")

    return {
        "isobars": geojson_isobars,
        "isotherms": geojson_isotherms,
        "centers": geojson_centers
    }