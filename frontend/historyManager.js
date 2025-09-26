import GeoJSON from 'ol/format/GeoJSON';
import { editSource } from './interactionLayers.js';

// History for undo/redo
let history = [];
let historyIndex = -1;
const maxHistorySize = 50;

export function saveHistory() {
  const geojson = new GeoJSON().writeFeatures(editSource.getFeatures(), { featureProjection: 'EPSG:3857' });
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  history.push(geojson);
  if (history.length > maxHistorySize) {
    history.shift();
  }
  historyIndex = history.length - 1;
}

export function undoHistory() {
  if (historyIndex > 0) {
    historyIndex--;
    editSource.clear();
    const features = new GeoJSON().readFeatures(history[historyIndex], { featureProjection: 'EPSG:3857' });
    editSource.addFeatures(features);
    return true;
  }
  return false;
}

export function redoHistory() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    editSource.clear();
    const features = new GeoJSON().readFeatures(history[historyIndex], { featureProjection: 'EPSG:3857' });
    editSource.addFeatures(features);
    return true;
  }
  return false;
}