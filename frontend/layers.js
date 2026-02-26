// layers.js
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import LayerGroup from 'ol/layer/Group';
import { TileWMS } from 'ol/source';
import Graticule from 'ol/layer/Graticule.js';
import Stroke from 'ol/style/Stroke';
import { config } from './config.js';

// Base Layer (OpenStreetMap)
export const osmLayer = new TileLayer({
  title: 'OSM',
  visible: false,
  source: new OSM()
});

// Administrative Layers

export const nepal = new TileLayer({
  title: 'Nepal',
  visible: false,
  source: new TileWMS({
    url: '/geoserver-proxy/NepalAdmin/wms',
    params: { 'LAYERS': 'NepalAdmin:province', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous',
  })
});


export const bhutan = new TileLayer({
  title: 'Bhutan',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:btn_adm1', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

export const indiaState = new TileLayer({
  title: 'India',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:ind_adm1', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});
export const srilanka = new TileLayer({
  title: 'Sri Lanka',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:lka_adm0', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

export const bangladesh = new TileLayer({
  title: 'Bangladesh',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:bgd_adm1', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

export const china = new TileLayer({
  title: 'China',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:chn_adm1', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

export const pakistan = new TileLayer({
  title: 'Pakistan',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:pak_adm1', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

// Layer Groups
export const baseLayers = new LayerGroup({
  title: 'Base Layers',
  openInLayerSwitcher: true,
  layers: [osmLayer, nepal, bhutan, indiaState, pakistan, bangladesh, srilanka, china]
});

export const stationLayers = new LayerGroup({
  title: 'Station Layers',
  openInLayerSwitcher: true,
  layers: []
});

export const temperatureLayers = new LayerGroup({
  title: 'Parameter',
  openInLayerSwitcher: false,
  layers: []
});
export const upperair_temperatureLayers = new LayerGroup({
  title: 'Parameter',
  openInLayerSwitcher: false,
  layers: []
});

export const isobarLayers = new LayerGroup({
  title: 'Isobar Layers',
  openInLayerSwitcher: true,
  layers: [],
  wrapX: false,
});

export const isothermLayers = new LayerGroup({
  title: 'Isotherm Layers',
  openInLayerSwitcher: true,
  layers: []
});

export const pressureCenterLayers = new LayerGroup({
  title: 'Pressure Center Layers',
  openInLayerSwitcher: true,
  layers: []
});

export const gridLayers = new LayerGroup({
  title: 'Grid Data Layers',
  openInLayerSwitcher: false,
  layers: []
});

export const measureLayers = new LayerGroup({
  title: 'Measurement Layers',
  openInLayerSwitcher: false,
  layers: []
});

export const grid = new Graticule({
    title: 'Grid',
  strokeStyle: new Stroke({
    color: 'rgba(255,120,0,0.9)',
    width: 2,
    lineDash: [0.5, 4],
  }),
  showLabels: true,
  wrapX: false,
});
