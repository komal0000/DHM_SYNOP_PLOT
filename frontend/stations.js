// stations.js
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import LayerGroup from 'ol/layer/Group';
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
  // Group stations by country
  const countryMap = {};
  let validStations = 0;

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

    const country = station.properties?.country || station.country || 'Unknown';

    const point = new Point(fromLonLat(coordinates));
    const feature = new Feature({
      geometry: point,
      name: station.properties?.name || station.name || 'Unknown',
      elevation: station.properties?.elevation || station.elevation || 'N/A',
      country: country,
      coordinates: coordinates,
      isStation: true  // marker so popup handler can identify station features
    });

    if (!countryMap[country]) {
      countryMap[country] = [];
    }
    countryMap[country].push(feature);
    validStations++;
  });

  if (validStations === 0) {
    showWarning('No valid weather stations found.', true);
    return;
  }

  console.log(`Added ${validStations} stations across ${Object.keys(countryMap).length} countries`);

  // Create a VectorLayer per country
  const stationStyle = new Style({
    image: new Circle({
      radius: 4,
      fill: new Fill({ color: 'rgba(47, 0, 255, 0.8)' }),
      stroke: new Stroke({ color: 'orange', width: 2 })
    })
  });

  // Sort countries alphabetically, but put Nepal first
  const countries = Object.keys(countryMap).sort((a, b) => {
    if (a === 'Nepal') return -1;
    if (b === 'Nepal') return 1;
    return a.localeCompare(b);
  });

  const countryLayers = countries.map(country => {
    const source = new VectorSource({ features: countryMap[country] });
    return new VectorLayer({
      title: country,
      source: source,
      zIndex: 1000,
      visible: false,
      style: stationStyle
    });
  });

  // Wrap all country layers in a "Weather Stations" group
  const stationsGroup = new LayerGroup({
    title: 'Weather Stations',
    openInLayerSwitcher: true,
    layers: countryLayers
  });

  stationLayers.getLayers().push(stationsGroup);

  // Force update
  countryLayers.forEach(l => l.getSource().changed());
};