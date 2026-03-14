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

// Administrative Boundary Layers
// Each country has ONE layer. Default WMS params = adm0 (Country Border Only).
// The border mode toggle updates the LAYERS param to swap between adm0 and adm1.
export const nepal = new TileLayer({
  title: 'Nepal',
  visible: true,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:npl_adm0', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous',
  })
});

export const indiaState = new TileLayer({
  title: 'India',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:ind_adm0', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

export const bhutan = new TileLayer({
  title: 'Bhutan',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:btn_adm0', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

export const bangladesh = new TileLayer({
  title: 'Bangladesh',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:bgd_adm0', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

export const china = new TileLayer({
  title: 'China',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:chn_adm0', 'TILED': true },
    serverType: 'geoserver',
    crossOrigin: 'anonymous'
  })
});

export const pakistan = new TileLayer({
  title: 'Pakistan',
  visible: false,
  source: new TileWMS({
    url: config.geoserverUrl,
    params: { 'LAYERS': 'NepalAdmin:pak_adm0', 'TILED': true },
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

// WMS layer name pairs for border mode switching.
// 'adm0' = country border only, 'adm1' = country + provinces.
export const COUNTRY_WMS = [
  { layer: nepal,      adm0: 'NepalAdmin:npl_adm0', adm1: 'NepalAdmin:province' },
  { layer: indiaState, adm0: 'NepalAdmin:ind_adm0', adm1: 'NepalAdmin:ind_adm1'  },
  { layer: bhutan,     adm0: 'NepalAdmin:btn_adm0', adm1: 'NepalAdmin:btn_adm1'  },
  { layer: bangladesh, adm0: 'NepalAdmin:bgd_adm0', adm1: 'NepalAdmin:bgd_adm1'  },
  { layer: china,      adm0: 'NepalAdmin:chn_adm0', adm1: 'NepalAdmin:chn_adm1'  },
  { layer: pakistan,   adm0: 'NepalAdmin:pak_adm0', adm1: 'NepalAdmin:pak_adm1'  },
  { layer: srilanka,   adm0: 'NepalAdmin:lka_adm0', adm1: 'NepalAdmin:lka_adm1'  },
];

// Layer Groups
export const baseLayers = new LayerGroup({
  title: 'Base Layers',
  openInLayerSwitcher: true,
  layers: [osmLayer, nepal, indiaState, bhutan, bangladesh, china, pakistan, srilanka],
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
