// stations.js
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import { Point } from 'ol/geom';
import Style from 'ol/style/Style';
import Circle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import { fromLonLat } from 'ol/proj';
import { Feature } from 'ol';
import { showWarning } from './utils.js';
import { stationLayers } from './layers.js';

export function addStationsToMap(stations) {
  const vectorSource = new VectorSource();
  let validStations = 0;

//   console.log('Stations received:', stations);

  stations.forEach(station => {
    let coordinates = [85.324, 27.6172];
    try {
      const geometryObj = typeof station.geometry === 'string'
        ? JSON.parse(station.geometry)
        : station.geometry;
      if (geometryObj?.coordinates?.length === 2) {
        coordinates = geometryObj.coordinates;
      }
    } catch (err) {
      console.warn(`Invalid geometry for station "${station.name}":`, station.geometry);
    }

    const point = new Point(fromLonLat(coordinates));
    const feature = new Feature({
      geometry: point,
      name: station.properties?.name || station.name || 'Unknown',
      elevation: station.properties?.elevation || station.elevation || 'N/A',
      country: station.properties?.country || station.country || 'N/A',
      coordinates: coordinates
    });

    vectorSource.addFeature(feature);
    validStations++;
  });

  if (validStations === 0) {
    showWarning('No valid weather stations found.', true);
  } else {
    console.log(`Added ${validStations} stations to the map`);
  }

  const vectorLayer = new VectorLayer({
    title: 'Weather Stations',
    source: vectorSource,
    zIndex: 1000, // Ensure high z-index
    visible: false, // Ensure layer is visible
    style: new Style({
      image: new Circle({
        radius: 4, // Larger for visibility
        fill: new Fill({ color: 'rgba(47, 0, 255, 0.8)' }),
        stroke: new Stroke({ color: 'orange', width: 2 })
      })
    })
  });

  stationLayers.getLayers().push(vectorLayer);
//   console.log('Station layer added to stationLayers:', vectorLayer);
  // Force map update
  vectorLayer.getSource().changed();
};