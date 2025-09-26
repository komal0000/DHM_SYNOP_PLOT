import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Point } from 'ol/geom';
import Style from 'ol/style/Style';
import Icon from 'ol/style/Icon';
import { fromLonLat } from 'ol/proj';
import { Feature } from 'ol';
import { temperatureLayers } from './layers.js';

export function synopObservation(data) {
  function createWindBarb(speed, direction, my_temp, my_dewpt, cloud_state, cloud_high_type, cloud_low_type, cloud_mid_type, pressure, pressure_change, visibility, weather_code, type, stationId) {
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 150;
    const stage = new createjs.Stage(canvas);
    const station = new createjs.Shape();
    const stationIdText = new createjs.Text("N/A", "bold 16px Arial");
    const stationIdBox = new createjs.Shape();
    const windBarb = new createjs.Shape();
    const sky = new createjs.Shape();
    const cloudLow = new createjs.Shape();
    const cloudMid = new createjs.Shape();
    const cloudHigh = new createjs.Shape();
    const temp = new createjs.Text("00", "bold 18px Arial");
    const temp_box = new createjs.Shape();
    const dewpt = new createjs.Text("00", "bold 18px Arial");
    const dewpt_box = new createjs.Shape();
    const pressureText = new createjs.Text("000", "bold 18px Arial");
    const pressure_box = new createjs.Shape();
    const tendency = new createjs.Text("0.0", "bold 18px Arial");
    const tendency_box = new createjs.Shape();
    const visibilityText = new createjs.Text("00", "bold 18px Arial");
    const visibility_box = new createjs.Shape();
    const weather = new createjs.Shape();

    if (type === 'station') {
      station.graphics.ss(2).s("#000").dc(0, 0, 10);
    }
    station.x = canvas.width / 2;
    station.y = canvas.height / 2;
    const rowY = station.y - 20;
    if (type === 'station_id') {
      drawStationId(stationIdText, stationId);
      stationIdText.x = station.x - 35;
      stationIdText.y = station.y - 60;
      stationIdBox.graphics.f("rgba(255,255,255,0.1)").dr(stationIdText.x - 22, stationIdText.y - 11, 50, 22, 5);
      stage.addChild(stationIdBox, stationIdText);
    }

    function drawStationId(obj, stationId) {
      obj.text = stationId || 'N/A';
      obj.color = '#0000FF';
    }

    function draw_sky(obj, sky_state) {
      obj.graphics.clear();
      if (sky_state == 1) {
        obj.graphics.ss(8).s("#000").f("rgba(0,0,0,0)").mt(0, 10).lt(0, -10);
      } else if (sky_state == 7) {
        obj.graphics.ss(0).s("#000").f("rgba(0,0,0,1)").dc(0, 0, 10).ss(8).s("#fff").f("rgba(0,0,0,0)").mt(0, 10).lt(0, -10);
      } else if (sky_state == 9) {
        obj.graphics.ss(4).s("#000").f("rgba(0,0,0,0)")
  .mt(8.84, 8.84)
  .lt(-8.84, -8.84)
  .mt(-8.84, 8.84)
  .lt(8.84, -8.84);

      } else if (sky_state == 0) {
        // do nothing
      } else {
        obj.graphics.ss(0).s("#000").f("rgba(0,0,0,1)").mt(0, 0).lt(0, -10).a(0, 0, 10, -1 * Math.PI / 2, Math.PI / 2 * (Math.floor(sky_state / 2) - 1));
        if (sky_state == 3) {
          obj.graphics.ss(3).s("#000").f("rgba(0,0,0,0)").mt(1, 0).lt(1, 10);
        } else if (sky_state == 5) {
          obj.graphics.ss(3).s("#000").f("rgba(0,0,0,0)").mt(0, 0).lt(-10, 0);
        }
      }
    }
    function drawCloudLow(obj, cloud_low_type) {
      obj.graphics.clear();
      const g = obj.graphics;
      const code = parseInt(cloud_low_type) || 0;
      console.log(`Drawing low cloud type: ${code}`);
      g.ss(3).s("#000").f("rgba(0,0,0,0)");

      if (code === 1) {
        // Semicircle: Fair weather cumulus
        g.mt(-10, 0).qt(0, -10, 10, 0); // upper arc
      } else if (code === 2) {
        // Two stacked semicircles
        g.mt(-10, 0).qt(0, -10, 10, 0);
        g.mt(-10, 8).qt(0, -2, 10, 8); // lower flatter arc
      } else if (code === 3) {
        // Cb with top dome and base
        g.mt(-10, 0).qt(0, -10, 10, 0);
        g.mt(-10, 10).lt(10, 10);
      } else if (code === 4) {
        // Horizontal oval and dot
        g.mt(-10, 5).lt(10, 5);
        g.dc(0, 5, 1);
      } else if (code === 5) {
        // Two horizontal lines (layered Sc)
        g.mt(-10, 0).lt(10, 0);
        g.mt(-10, 5).lt(10, 5);
      } else if (code === 6) {
        // Single horizontal line
        g.mt(-10, 0).lt(10, 0);
      } else if (code === 7) {
        // Dashed horizontal line (under deck)
        g.mt(-10, 0).lt(-5, 0);
        g.mt(-2, 0).lt(2, 0);
        g.mt(5, 0).lt(10, 0);
      } else if (code === 8) {
        // Flat base + bulging top (Cu/Cb with turrets)
        g.mt(-10, 10).lt(10, 10);
        g.mt(-10, 10).qt(0, 0, 10, 10);
      } else if (code === 9) {
        // Flat base + very large dome
        g.mt(-10, 10).lt(10, 10);
        g.mt(-10, 10).qt(0, -15, 10, 10);
      }
    }
    function drawCloudMid(obj, cloud_mid_type) {
      obj.graphics.clear();
      const g = obj.graphics;
      const code = parseInt(cloud_mid_type) || 0;
      console.log(`Drawing mid cloud type: ${code}`);
      g.ss(3).s("#000").f("rgba(0,0,0,0)");

      if (code === 1) {
        // Thin Altostratus (single slash)
        g.mt(-10, 0).lt(10, 0);
      } else if (code === 2) {
        // Thick As layer, one slash + small tail
        g.mt(-10, 0).lt(0, 0).lt(10, 5);
      } else if (code === 3) {
        // Three curved bands (transparent Ac)
        g.mt(-10, 0).qt(-5, -5, 0, 0).qt(5, 5, 10, 0);
      } else if (code === 4) {
        // Discontinuous elements at multiple levels
        g.mt(-10, 0).lt(0, 0);
        g.mt(0, 5).lt(10, 5);
      } else if (code === 5) {
        // Gradually thickening bands
        g.mt(-10, 0).qt(-5, -5, 0, 0).qt(5, 5, 10, 0);
        g.mt(-10, 5).qt(-5, 0, 0, 5).qt(5, 10, 10, 5);
      } else if (code === 6) {
        // Ac from spreading Cu — looks like U shape
        g.mt(-10, 5).qt(0, -5, 10, 5);
      } else if (code === 7) {
        // Thick layered Ac with Ns
        g.mt(-10, 0).lt(10, 0);
        g.mt(-10, 5).lt(10, 5);
        g.mt(-10, 10).lt(10, 10);
      } else if (code === 8) {
        // Tufted Ac with turrets
        g.mt(-10, 10).lt(10, 10);
        g.mt(-10, 10).qt(0, 0, 10, 10);
      } else if (code === 9) {
        // Chaotic Ac with dense Ci
        g.mt(-10, -5).lt(0, 5).lt(10, -5);
        g.mt(-10, 5).lt(10, 5);
      }
    }
    function drawCloudHigh(obj, cloud_high_type) {
      obj.graphics.clear();
      const g = obj.graphics;
      const code = parseInt(cloud_high_type) || 0;
      console.log(`Drawing high cloud type: ${code}`);
      g.ss(3).s("#000").f("rgba(0,0,0,0)");

      if (code === 1) {
        // Filaments of cirrus ("mares' tails")
        g.mt(-10, 0).lt(0, -5).lt(10, 0);
      } else if (code === 2) {
        // Tufted cirrus remnants, slight upward flick
        g.mt(-10, 0).lt(0, -5).lt(10, 0);
        g.mt(-10, 5).lt(0, 0).lt(10, 5);
      } else if (code === 3) {
        // Anvil-shaped cirrus from Cb
        g.mt(-10, 0).lt(0, -5).lt(10, 0);
        g.mt(-5, -5).lt(5, -5);
      } else if (code === 4) {
        // Hook-shaped cirrus
        g.mt(-10, 0).qt(-5, -10, 0, -5).qt(5, 0, 10, -5);
      } else if (code === 5) {
        // Converging bands not exceeding 45°
        g.mt(-10, -2).lt(0, 0).lt(10, -2);
        g.mt(-10, 2).lt(0, 0).lt(10, 2);
      } else if (code === 6) {
        // Converging bands exceeding 45°
        g.mt(-10, -5).lt(0, 0).lt(10, -5);
        g.mt(-10, 5).lt(0, 0).lt(10, 5);
      } else if (code === 7) {
        // Veil of cirrostratus covering sky
        g.mt(-10, -5).lt(10, -5);
        g.mt(-10, 0).lt(10, 0);
        g.mt(-10, 5).lt(10, 5);
      } else if (code === 8) {
        // Cirrostratus, not covering entire sky
        g.mt(-10, -2).lt(10, -2);
        g.mt(-10, 2).lt(10, 2);
      } else if (code === 9) {
        // Cirrocumulus or Cc with Ci/Cs (Cb as cirriform source)
        g.mt(-10, 5).lt(0, -5).lt(10, 5).mt(-5, -5).lt(5, -5);
      }
    }


    if (type === 'cloud') {
      draw_sky(sky, cloud_state || 0);
    }
    sky.x = canvas.width / 2;
    sky.y = canvas.height / 2;

    if (type === 'cloud_low_type') {
      drawCloudLow(cloudLow, cloud_low_type || 0);
      cloudLow.x = station.x - 10;
      cloudLow.y = station.y + 20;
    }
    if (type === 'cloud_mid_type') {
      drawCloudMid(cloudMid, cloud_mid_type || 0);
      cloudMid.x = station.x; // Center
      cloudMid.y = rowY;
    }
    if (type === 'cloud_high_type') {
      drawCloudHigh(cloudHigh, cloud_high_type || 0);
      cloudHigh.x = station.x ;
      cloudHigh.y = station.y - 40;
    }

    function drawWind(obj, wSpeed, wDir) {
      let windSpeed = Math.round(wSpeed || 0);
      let windDirection = Math.round(wDir || 0);
      if (windDirection > 359) windDirection -= 360;
      if (windSpeed > 200) windSpeed = 200;
      obj.graphics.clear();
      if (windSpeed <= 2) {
        obj.graphics.ss(2).s("#000").dc(0, 0, 5);
      } else {
        obj.graphics.ss(2).s("#000").mt(0, 0).lt(0, -40);
        let marker = -40;
        if (windSpeed >= 50) {
          obj.graphics.ss(1).s("#000").f("#000")
            .mt(0, marker).lt(10, marker + 5).lt(0, marker + 10).closePath();
          windSpeed -= 50;
          marker += 10;
        }
        while (windSpeed >= 10) {
          obj.graphics.ss(2).s("#000").mt(0, marker).lt(10, marker);
          windSpeed -= 10;
          marker += 5;
        }
        if (windSpeed >= 5) {
          obj.graphics.ss(2).s("#000").mt(0, marker).lt(5, marker - 2.5);
        }
      }
      obj.rotation = windDirection;
    }
    if (type === 'wind') {
      drawWind(windBarb, speed, direction);
    }
    windBarb.x = canvas.width / 2;
    windBarb.y = canvas.height / 2;

    function draw_T_Td(obj1, obj2, my_temp, my_dewpt) {
      obj1.text = Math.round(my_temp || 0).toString();
      obj2.text = Math.round(my_dewpt || 0).toString();
    }
    if (type === 'temperature' || type === 'dewpoint') {
      draw_T_Td(temp, dewpt, my_temp, my_dewpt);
    }
    if (type === 'temperature') {
      temp.x = station.x - 40; // Left of station
      temp.y = rowY;
      temp_box.graphics.f("rgba(255,255,255,0.1)").dr(temp.x - 2, temp.y - 11, 45, 22, 5);
    }
    if (type === 'dewpoint') {
      dewpt.x = station.x - 40;
      dewpt.y = station.y + 20;
      dewpt_box.graphics.f("rgba(255,255,255,0.1)").dr(dewpt.x - 2, dewpt.y - 11, 45, 22, 5);
    }

    function drawPressure(obj, pressure_mb) {
      const pressure = pressure_mb ?? 1000;
      const encoded = Math.round(pressure * 10) % 1000;
      obj.text = encoded.toString().padStart(4, '0');
    }
    if (type === 'pressure') {
      drawPressure(pressureText, pressure);
    }
    
    if (type === 'pressure') {
      pressureText.x = station.x + 20; // Right of station
      pressureText.y = rowY;
      pressure_box.graphics.f("rgba(255,255,255,0.1)").dr(pressureText.x - 2, pressureText.y - 11, 45, 22, 5);
    }

    function drawTendency(obj, change_mb) {
      const value = Math.abs(change_mb || 0).toFixed(1);
      const sign = (change_mb || 0) >= 0 ? "+" : "-";
      obj.text = `${sign}${value}`;
    }
    if (type === 'pressure_change') {
      drawTendency(tendency, pressure_change);
    }
    if (type === 'pressure_change') {
      tendency.x = station.x + 20;
      tendency.y = station.y ;
      tendency_box.graphics.f("rgba(255,255,255,0.1)").dr(tendency.x - 22, tendency.y - 11, 45, 22, 5);
    }

    function drawVisibility(obj, vis_km) {
      obj.text = Math.round(vis_km || 10).toString();
    }
    if (type === 'visibility') {
      drawVisibility(visibilityText, visibility);
    }
    if (type === 'visibility') {
      visibilityText.x = station.x - 60;
      visibilityText.y = station.y ;
      visibility_box.graphics.f("rgba(255,255,255,0.1)").dr(visibilityText.x - 22, visibilityText.y - 11, 45, 22, 5);
    }

    function drawPresentWeather(obj, weather_code) {
      obj.graphics.clear();
      obj.x = station.x - 50;
      obj.y = station.y;
      if (weather_code === 'RA') {
        obj.graphics.ss(2).s("#000").mt(-5, 0).lt(-5, 5).mt(5, 0).lt(5, 5);
      } else if (weather_code === 'SN') {
        obj.graphics.ss(2).s("#000").mt(0, 0).lt(0, 5).mt(-5, 0).lt(5, 0);
      } else if (weather_code === 'FG') {
        obj.graphics.ss(2).s("#000").mt(-5, 0).lt(5, 0).mt(-5, 2).lt(5, 2);
      }
    }
    if (type === 'weather') {
      drawPresentWeather(weather, weather_code || '');
    }

    if (type === 'station') stage.addChild(station);
    if (type === 'cloud') stage.addChild(sky);
    if (type === 'cloud_low_type') stage.addChild(cloudLow);
    if (type === 'cloud_mid_type') stage.addChild(cloudMid);
    if (type === 'cloud_high_type') stage.addChild(cloudHigh);
    if (type === 'wind') stage.addChild(windBarb);
    if (type === 'temperature') stage.addChild(temp_box, temp);
    if (type === 'dewpoint') stage.addChild(dewpt_box, dewpt);
    if (type === 'pressure') stage.addChild(pressure_box, pressureText);
    if (type === 'pressure_change') stage.addChild(tendency_box, tendency);
    if (type === 'visibility') stage.addChild(visibility_box, visibilityText);
    if (type === 'weather') stage.addChild(weather);

    stage.update();
    return canvas.toDataURL();
  }

  const features = data.map(item => {
    let coordinates = [85.324, 27.6172];
    let data = item.properties || item;
    // console.log(data);
    try {
      const geometryObj = typeof item.geometry === 'string' ? JSON.parse(item.geometry) : item.geometry;
      if (geometryObj?.coordinates?.length === 2) {
        coordinates = geometryObj.coordinates;
      }
    } catch (err) {
      console.warn('Invalid geometry in report:', item.geometry);
    }
    const windSpeed = (data.wind_speed || 0) * 1.94384;
    return new Feature({
      geometry: new Point(fromLonLat(coordinates)),
      speed: windSpeed,
      direction: data.wind_direction || 0,
      temperature: data.temperature || 0,
      dewPoint: data.dew_point || 0,
      cloud_state: data.cloud_cover || 0,
      cloud_low_type: data.cloud_low_type || 0,
      cloud_mid_type: data.cloud_mid_type || 0,
      cloud_high_type: data.cloud_high_type || 0,
      pressure: data.sea_level_pressure || 1000,
      pressure_change: data.pressure_change || 0,
      visibility: data.visibility || 10,
      weather_code: data.weather || '',
      coordinates: coordinates,
      stationId: data.station_id || 'N/A'
    });
  });

  const layerTypes = [
    { title: 'Station Circle', type: 'station' },
    { title: 'Wind Barbs', type: 'wind' },
    { title: 'Cloud Cover', type: 'cloud' },
    { title: 'Temperature', type: 'temperature' },
    { title: 'Dew Point', type: 'dewpoint' },
    { title: 'Pressure', type: 'pressure' },
    { title: 'Pressure Change', type: 'pressure_change' },
    { title: 'Visibility', type: 'visibility' },
    // { title: 'Weather Symbols', type: 'weather' },
    { title: 'Station ID', type: 'station_id' },
    { title: 'Low Cloud Type', type: 'cloud_low_type' },
    { title: 'Mid Cloud Type', type: 'cloud_mid_type' },
    { title: 'High Cloud Type', type: 'cloud_high_type' }
  ];

  layerTypes.forEach(({ title, type }) => {
    const layer = new VectorLayer({
      title,
      source: new VectorSource({ features }),
      visible: type === 'station',
      // visible: ['station', 'cloud_mid_type', 'temperature', 'dewpoint', 'pressure', 'pressure_change', 'visibility', 'station_id', 'cloud_low_type', 'cloud_high_type', 'wind'].includes(type),
      // visible: ['station', 'pressure_change', 'Visibility',  'pressure'].includes(type),

      

      style: (feature) => {
        const speed = feature.get('speed');
        const direction = feature.get('direction');
        const my_temp = feature.get('temperature');
        const my_dewpt = feature.get('dewPoint');
        const cloud_state = feature.get('cloud_state');
        const cloud_low_type = feature.get('cloud_low_type');
        const cloud_mid_type = feature.get('cloud_mid_type');
        const cloud_high_type = feature.get('cloud_high_type');
        const pressure = feature.get('pressure');
        const pressure_change = feature.get('pressure_change');
        const visibility = feature.get('visibility');
        const weather_code = feature.get('weather_code');
        const stationId = feature.get('stationId');

        return new Style({
          image: new Icon({
            src: createWindBarb(speed, direction, my_temp, my_dewpt, cloud_state,
                              cloud_high_type, cloud_low_type, cloud_mid_type,
                              pressure, pressure_change, visibility, weather_code, type, stationId),
            scale: 0.5,
            anchor: [0.5, 0.5]
          })
        });
      }
    });
    temperatureLayers.getLayers().push(layer);
  });
}