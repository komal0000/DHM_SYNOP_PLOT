import Select from 'ol/interaction/Select';
import GeoJSON from 'ol/format/GeoJSON';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import { fromLonLat } from 'ol/proj';
import { config } from './config.js';
import { editSource, editLayer, measureLayer } from './interactionLayers.js';
import { saveHistory, undoHistory, redoHistory } from './historyManager.js';
import { exportMap, copyMapToClipboard, addDragBoxExportInteraction } from './exportInteractions.js';
import { addMeasureInteraction, clearMeasureInteractions } from './measureInteractions.js';
import { addEditInteraction, addIconInteraction, addSignInteraction, addTextBoxInteraction, addEraserInteraction, clearEditInteractions } from './editInteractions.js';
import { showSpinner, hideSpinner, showWarning } from './utils.js';
import {transformExtent} from 'ol/proj';

const exportExtent = transformExtent([50, 0, 100, 40], 'EPSG:4326', 'EPSG:3857');
console.log('Calling exportMap with extent:', exportExtent);
export function setupToolbarInteractions(map) {
  const selectInteraction = new Select({
    layers: [editLayer],
    style: new Style({
      fill: new Fill({ color: 'rgba(255, 0, 0, 0.4)' }),
      stroke: new Stroke({ color: '#ff0000', width: 2 })
    })
  });
  map.addInteraction(selectInteraction);

  document.querySelector('.import-map')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.geojson';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const geojson = JSON.parse(event.target.result);
          const features = new GeoJSON().readFeatures(geojson, { featureProjection: 'EPSG:3857' });
          editSource.addFeatures(features);
          saveHistory();
          showWarning('GeoJSON imported successfully.', false);
        } catch (err) {
          console.error('Error importing GeoJSON:', err);
          showWarning('Failed to import GeoJSON.', true);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  document.querySelector('.export-map')?.addEventListener('click', () => {
    const observationTime = document.getElementById('observation-time')?.value;
    if (!observationTime) {
      showWarning('Please select an observation time before exporting.', true);
      return;
    }
    const mapType = prompt('Enter map type (PNG or SVG):', 'PNG').toUpperCase();
    if (!['PNG', 'SVG'].includes(mapType)) {
      showWarning('Invalid map type. Use PNG or SVG.', true);
      return;
    }

    showSpinner();
    fetch(`${config.apiBaseUrl}/api/export/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        map_type: mapType,
        level: 'SURFACE',
        observation_time: observationTime
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.message === 'Map export started' && data.map_url) {
          showWarning('Map export completed.', false);
          window.open(data.map_url, '_blank');
        } else {
          showWarning('Error starting map export.', true);
        }
      })
      .catch(error => {
        console.error('Error exporting map:', error);
        showWarning('Failed to export map.', true);
      })
      .finally(() => hideSpinner());
  });

  document.querySelector('.export-jpeg')?.addEventListener('click', () => {
    exportMap(map, 'jpeg', 'weather_map',exportExtent);
  });

  document.querySelector('.export-png')?.addEventListener('click', () => {
    exportMap(map, 'png', 'weather_map',exportExtent);
  });

  document.querySelector('.export-pdf')?.addEventListener('click', () => {
    exportMap(map, 'pdf', 'weather_map',exportExtent);
  });

  document.querySelector('.copy-clipboard')?.addEventListener('click', () => {
    copyMapToClipboard(map);
  });

  document.querySelector('.export-area')?.addEventListener('click', () => {
    showWarning('Draw a rectangle to select the export area.', false);
    addDragBoxExportInteraction(map, (extent) => {
      const format = prompt('Select export format (jpeg, png, pdf, clipboard):', 'png').toLowerCase();
      if (['jpeg', 'png', 'pdf'].includes(format)) {
        exportMap(map, format, 'weather_map_area', extent);
      } else if (format === 'clipboard') {
        copyMapToClipboard(map, extent);
      } else {
        showWarning('Invalid format. Use jpeg, png, pdf, or clipboard.', true);
      }
    });
  });

  document.querySelector('.pan-up')?.addEventListener('click', () => {
    const view = map.getView();
    const center = view.getCenter();
    view.animate({ center: [center[0], center[1] + 100000], duration: 300 });
  });

  document.querySelector('.pan-down')?.addEventListener('click', () => {
    const view = map.getView();
    const center = view.getCenter();
    view.animate({ center: [center[0], center[1] - 100000], duration: 300 });
  });

  document.querySelector('.pan-reset')?.addEventListener('click', () => {
    map.getView().animate({
      center: fromLonLat([85.324, 27.6172]),
      zoom: 7,
      duration: 300
    });
  });

  document.querySelector('.measure-distance')?.addEventListener('click', () => {
    addMeasureInteraction(map, 'distance');
    measureLayer.setVisible(false);
  });

  document.querySelector('.measure-area')?.addEventListener('click', () => {
    addMeasureInteraction(map, 'area');
    measureLayer.setVisible(false);
  });

  document.querySelector('.measure-clear')?.addEventListener('click', () => {
    clearMeasureInteractions(map);
    showWarning('Measurements cleared.', false);
  });

  document.querySelector('.measure-toggle')?.addEventListener('click', () => {
    const visible = !measureLayer.getVisible();
    measureLayer.setVisible(visible);
    showWarning(`Measurement layer ${visible ? 'enabled' : 'disabled'}.`, false);
  });

  document.querySelector('.edit-point')?.addEventListener('click', () => {
    addEditInteraction(map, 'point');
  });

  document.querySelector('.edit-line')?.addEventListener('click', () => {
    addEditInteraction(map, 'line');
  });

  document.querySelector('.edit-polygon')?.addEventListener('click', () => {
    addEditInteraction(map, 'polygon');
  });

  document.querySelector('.edit-high')?.addEventListener('click', () => {
    addIconInteraction(map, 'high');
  });

  document.querySelector('.edit-low')?.addEventListener('click', () => {
    addIconInteraction(map, 'low');
  });

  document.querySelector('.edit-depression')?.addEventListener('click', () => {
    addIconInteraction(map, 'depression');
  });

  document.querySelector('.edit-sign')?.addEventListener('click', () => {
    addSignInteraction(map);
  });

  document.querySelector('.edit-textbox')?.addEventListener('click', () => {
    addTextBoxInteraction(map);
  });

  document.querySelector('.edit-eraser')?.addEventListener('click', () => {
    addEraserInteraction(map);
  });

  document.querySelector('.edit-delete')?.addEventListener('click', () => {
    const selectedFeatures = selectInteraction.getFeatures();
    if (selectedFeatures.getLength() === 0) {
      showWarning('No features selected to delete.', true);
      return;
    }
    selectedFeatures.forEach(feature => editSource.removeFeature(feature));
    saveHistory();
    showWarning('Selected features deleted.', false);
    selectedFeatures.clear();
  });

  document.querySelector('.edit-undo')?.addEventListener('click', () => {
    if (undoHistory()) {
      showWarning('Undo successful.', false);
    } else {
      showWarning('Nothing to undo.', true);
    }
  });

  document.querySelector('.edit-redo')?.addEventListener('click', () => {
    if (redoHistory()) {
      showWarning('Redo successful.', false);
    } else {
      showWarning('Nothing to redo.', true);
    }
  });
}