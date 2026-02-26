import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Text from 'ol/style/Text';
import CircleStyle from 'ol/style/Circle';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { LineString } from 'ol/geom';
import * as turf from '@turf/turf';
import { transform } from 'ol/proj';
import { editSource, editLayer } from './interactionLayers.js'; // Your main editable source
import { saveHistory } from './historyManager.js';
import { showWarning } from './utils.js';

let drawInteraction = null;
let modifyInteraction = null;
let eraserInteraction = null;
let isobarModifyInteraction = null;

// Registry for additional sources the eraser should also erase from (e.g. isobar sources)
let extraEraserSources = [];

export function addEditInteraction(map, type) {
  clearAllInteractions(map);
  
  // Ensure edit layer is visible so drawn features are shown
  try {
    if (editLayer && typeof editLayer.setVisible === 'function') {
      editLayer.setVisible(true);
    }
  } catch (err) {
    console.warn('Failed to set edit layer visible:', err);
  }
  
  console.log('addEditInteraction called with type:', type);
  
  drawInteraction = new Draw({
    source: editSource,
    type: type === 'point' ? 'Point' : type === 'line' ? 'LineString' : 'Polygon',
    // Enable freehand (pencil-like) drawing for lines/polygons - drag to draw
    freehand: type !== 'point',
    style: new Style({
      fill: new Fill({ color: 'rgba(0, 255, 0, 0.2)' }),
      stroke: new Stroke({ color: '#0000ff', width: 2 }),
    }),
  });
  
  modifyInteraction = new Modify({
    source: editSource,
    features: editSource.getFeaturesCollection(),
  });
  
  drawInteraction.on('drawstart', (evt) => {
    console.log('drawstart event fired for type:', type);
  });
  
  drawInteraction.on('drawend', (evt) => {
    console.log('drawend event fired for type:', type);
    saveHistory();
  });
  
  modifyInteraction.on('modifyend', () => {
    console.log('modifyend event fired');
    saveHistory();
  });
  
  map.addInteraction(drawInteraction);
  map.addInteraction(modifyInteraction);
  map.getTargetElement().style.cursor = 'crosshair';
  
  console.log('Draw and modify interactions added to map');
}

export function addIconInteraction(map, iconType) {
  clearAllInteractions(map);
  drawInteraction = new Draw({
    source: editSource,
    type: 'Point',
    style: new Style({
      text: new Text({
        text: iconType === 'high' ? 'H' : iconType === 'low' ? 'L' : 'D',
        font: 'bold 20px Arial',
        fill: new Fill({ color: iconType === 'high' ? '#0000ff' : iconType === 'low' ? '#ff0000' : '#ff00ff' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
        offsetY: -10,
      }),
    }),
  });
  drawInteraction.on('drawend', (evt) => {
    evt.feature.set('type', iconType);
    saveHistory();
  });
  map.addInteraction(drawInteraction);
  map.getTargetElement().style.cursor = 'crosshair';
}

export function addSignInteraction(map) {
  clearAllInteractions(map);
  drawInteraction = new Draw({
    source: editSource,
    type: 'Point',
    style: new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: '#000000' }),
        stroke: new Stroke({ color: '#ffffff', width: 1 }),
      }),
    }),
  });
  drawInteraction.on('drawend', (evt) => {
    evt.feature.set('type', 'sign');
    saveHistory();
  });
  map.addInteraction(drawInteraction);
  map.getTargetElement().style.cursor = 'crosshair';
}

export function addTextBoxInteraction(map) {
  clearAllInteractions(map);
  drawInteraction = new Draw({
    source: editSource,
    type: 'Point',
    style: new Style({
      text: new Text({
        text: '',
        font: '14px Arial',
        fill: new Fill({ color: '#000000' }),
        stroke: new Stroke({ color: '#ffffff', width: 1 }),
        backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.7)' }),
        padding: [3, 3, 3, 3],
        offsetY: -10,
      }),
    }),
  });
  drawInteraction.on('drawend', (evt) => {
    const text = prompt('Enter text for the annotation:');
    if (text) {
      evt.feature.set('type', 'textbox');
      evt.feature.set('text', text);
      saveHistory();
    } else {
      editSource.removeFeature(evt.feature);
    }
  });
  map.addInteraction(drawInteraction);
  map.getTargetElement().style.cursor = 'crosshair';
}

/**
 * Register additional VectorSources that the eraser should also operate on.
 * Call this after loading isobar/isotherm data so the eraser can erase from those sources too.
 */
export function registerEraserSources(sources) {
  extraEraserSources = Array.isArray(sources) ? sources : [sources];
}

/**
 * Clear any registered extra eraser sources (call on layer refresh/clear).
 */
export function clearEraserSources() {
  extraEraserSources = [];
}

/**
 * Add a Modify interaction on an isobar source so users can drag/reshape isobar lines.
 * Returns the interaction so the caller can remove it later.
 */
export function addIsobarModifyInteraction(map, isobarSource) {
  // Remove any previous isobar modify interaction
  removeIsobarModifyInteraction(map);

  isobarModifyInteraction = new Modify({
    source: isobarSource,
  });

  isobarModifyInteraction.on('modifyend', () => {
    console.log('Isobar modified');
  });

  map.addInteraction(isobarModifyInteraction);
  console.log('Isobar modify interaction added');
  return isobarModifyInteraction;
}

/**
 * Remove the isobar modify interaction from the map.
 */
export function removeIsobarModifyInteraction(map) {
  if (isobarModifyInteraction) {
    map.removeInteraction(isobarModifyInteraction);
    isobarModifyInteraction = null;
  }
}

export function addEraserInteraction(map) {
  console.log('=== ERASER INTERACTION STARTED ===');
  clearAllInteractions(map);

  const tempSource = new VectorSource();
  const brushRadius = 5; // Reduced pixel radius for precise erasing

  eraserInteraction = new Draw({
    source: tempSource,
    type: 'LineString',
    freehand: true,
    style: new Style({
      stroke: new Stroke({
        color: 'rgba(255, 0, 0, 0.8)',
        width: 4, // Visual indicator width
        lineDash: [8, 4]
      }),
    }),
  });

  let eraserPath = [];

  eraserInteraction.on('drawstart', (evt) => {
    console.log('=== ERASER DRAWSTART ===');
    eraserPath = [];
    
    const editCount = editSource.getFeatures().length;
    const extraCount = extraEraserSources.reduce((sum, src) => sum + src.getFeatures().length, 0);
    const featuresCount = editCount + extraCount;
    console.log('Features available to erase:', featuresCount, '(edit:', editCount, ', extra:', extraCount, ')');
    
    if (featuresCount === 0) {
      showWarning('No features found to erase.', false);
      return;
    }
  });

  eraserInteraction.on('drawend', (evt) => {
    console.log('=== ERASER DRAWEND ===');
    
    // Clear the temporary drawing
    tempSource.clear();
    
    const eraserGeometry = evt.feature.getGeometry();
    const eraserCoords = eraserGeometry.getCoordinates();
    
    if (!eraserCoords || eraserCoords.length < 2) {
      showWarning('Eraser path too short. Try drawing a longer stroke.', false);
      return;
    }
    
    console.log('Eraser path coordinates:', eraserCoords);
    
    try {
      // Gather features from editSource AND any registered extra sources (e.g. isobar)
      const allSourcesToErase = [editSource, ...extraEraserSources];
      
      let erasedCount = 0;
      let processedCount = 0;

      allSourcesToErase.forEach((source) => {
        const features = source.getFeatures().slice(); // Make a copy
        
        features.forEach((feature, index) => {
          try {
            const featureGeometry = feature.getGeometry();
            const featureType = featureGeometry.getType();
          
            // Check if eraser path intersects with feature
            let shouldErase = false;
          
            if (featureType === 'LineString') {
              shouldErase = checkLineStringIntersection(eraserCoords, featureGeometry.getCoordinates(), brushRadius, map);
            } else if (featureType === 'Point') {
              shouldErase = checkPointIntersection(eraserCoords, featureGeometry.getCoordinates(), brushRadius, map);
            } else if (featureType === 'Polygon') {
              shouldErase = checkPolygonIntersection(eraserCoords, featureGeometry.getCoordinates(), brushRadius, map);
            }
          
            if (shouldErase) {
              console.log(`Feature intersects with eraser - attempting partial erase`);
            
              if (featureType === 'LineString') {
                // For LineStrings, try to cut them where they intersect with the eraser
                const remainingSegments = cutLineString(featureGeometry.getCoordinates(), eraserCoords, brushRadius, map);
              
                // Remove original feature
                source.removeFeature(feature);
              
                // Add remaining segments as new features
                remainingSegments.forEach(segment => {
                  if (segment.length >= 2) {
                    const newFeature = feature.clone();
                    newFeature.setGeometry(new LineString(segment));
                    source.addFeature(newFeature);
                  }
                });
              
                erasedCount++;
              } else {
                // For Points and Polygons, remove completely if intersected
                source.removeFeature(feature);
                erasedCount++;
              }
            }
          
            processedCount++;
          } catch (error) {
            console.error(`Error processing feature:`, error);
          }
        });
      });
      
      console.log(`Processed ${processedCount} features, erased parts of ${erasedCount} features`);
      
      if (erasedCount > 0) {
        saveHistory();
        showWarning(`Erased parts of ${erasedCount} feature(s).`, false);
      } else {
        showWarning('No features intersected with eraser path.', false);
      }
      
    } catch (error) {
      console.error('Error during erasing operation:', error);
      showWarning('Error occurred during erasing operation.', true);
    }
  });

  map.addInteraction(eraserInteraction);
  map.getTargetElement().style.cursor = 'crosshair';
  console.log('Eraser interaction added to map');
}

// Helper function to check if a LineString intersects with the eraser path
function checkLineStringIntersection(eraserCoords, lineCoords, brushRadius, map) {
  const view = map.getView();
  const resolution = view.getResolution();
  const brushDistance = brushRadius * resolution;
  
  for (let i = 0; i < lineCoords.length - 1; i++) {
    const lineStart = lineCoords[i];
    const lineEnd = lineCoords[i + 1];
    
    for (let j = 0; j < eraserCoords.length - 1; j++) {
      const eraserStart = eraserCoords[j];
      const eraserEnd = eraserCoords[j + 1];
      
      if (lineSegmentDistance(lineStart, lineEnd, eraserStart, eraserEnd) < brushDistance) {
        return true;
      }
    }
  }
  return false;
}

// Helper function to check if a Point intersects with the eraser path
function checkPointIntersection(eraserCoords, pointCoords, brushRadius, map) {
  const view = map.getView();
  const resolution = view.getResolution();
  const brushDistance = brushRadius * resolution;
  
  for (let i = 0; i < eraserCoords.length; i++) {
    const distance = Math.sqrt(
      Math.pow(pointCoords[0] - eraserCoords[i][0], 2) +
      Math.pow(pointCoords[1] - eraserCoords[i][1], 2)
    );
    if (distance < brushDistance) {
      return true;
    }
  }
  return false;
}

// Helper function to check if a Polygon intersects with the eraser path
function checkPolygonIntersection(eraserCoords, polygonCoords, brushRadius, map) {
  // Simple check: if any vertex of the polygon is close to the eraser path
  const outerRing = polygonCoords[0];
  
  for (let vertex of outerRing) {
    if (checkPointIntersection(eraserCoords, vertex, brushRadius, map)) {
      return true;
    }
  }
  return false;
}

// Helper function to calculate distance between two line segments
function lineSegmentDistance(line1Start, line1End, line2Start, line2End) {
  // Simplified distance calculation between line segments
  // This is a basic implementation - could be improved for better accuracy
  const distances = [
    pointToLineDistance(line1Start, line2Start, line2End),
    pointToLineDistance(line1End, line2Start, line2End),
    pointToLineDistance(line2Start, line1Start, line1End),
    pointToLineDistance(line2End, line1Start, line1End)
  ];
  return Math.min(...distances);
}

// Helper function to calculate distance from a point to a line segment
function pointToLineDistance(point, lineStart, lineEnd) {
  const A = point[0] - lineStart[0];
  const B = point[1] - lineStart[1];
  const C = lineEnd[0] - lineStart[0];
  const D = lineEnd[1] - lineStart[1];
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) {
    return Math.sqrt(A * A + B * B);
  }
  
  let param = dot / lenSq;
  
  let xx, yy;
  
  if (param < 0) {
    xx = lineStart[0];
    yy = lineStart[1];
  } else if (param > 1) {
    xx = lineEnd[0];
    yy = lineEnd[1];
  } else {
    xx = lineStart[0] + param * C;
    yy = lineStart[1] + param * D;
  }
  
  const dx = point[0] - xx;
  const dy = point[1] - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Helper function to cut a LineString where it intersects with the eraser
function cutLineString(lineCoords, eraserCoords, brushRadius, map) {
  const view = map.getView();
  const resolution = view.getResolution();
  const brushDistance = brushRadius * resolution;
  
  // Mark which points should be cut based on proximity to eraser path
  const cutMarks = new Array(lineCoords.length).fill(false);
  
  for (let i = 0; i < lineCoords.length; i++) {
    const point = lineCoords[i];
    
    // Check distance to each segment of the eraser path
    for (let j = 0; j < eraserCoords.length - 1; j++) {
      const eraserStart = eraserCoords[j];
      const eraserEnd = eraserCoords[j + 1];
      
      // Calculate distance from point to eraser line segment
      const distance = pointToLineDistance(point, eraserStart, eraserEnd);
      
      if (distance < brushDistance) {
        cutMarks[i] = true;
        break;
      }
    }
    
    // Also check distance to individual eraser points (for single clicks)
    if (!cutMarks[i]) {
      for (let eraserPoint of eraserCoords) {
        const distance = Math.sqrt(
          Math.pow(point[0] - eraserPoint[0], 2) +
          Math.pow(point[1] - eraserPoint[1], 2)
        );
        if (distance < brushDistance) {
          cutMarks[i] = true;
          break;
        }
      }
    }
  }
  
  // Build segments from unmarked points
  const segments = [];
  let currentSegment = [];
  
  for (let i = 0; i < lineCoords.length; i++) {
    if (cutMarks[i]) {
      // This point should be cut - end current segment
      if (currentSegment.length >= 2) {
        segments.push([...currentSegment]);
      }
      currentSegment = [];
    } else {
      // Keep this point
      currentSegment.push(lineCoords[i]);
    }
  }
  
  // Add final segment if it has enough points
  if (currentSegment.length >= 2) {
    segments.push(currentSegment);
  }
  
  return segments;
}

export function clearEditInteractions(map) {
  clearAllInteractions(map);
  map.getTargetElement().style.cursor = 'default';
}

function clearAllInteractions(map) {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  }
  if (modifyInteraction) {
    map.removeInteraction(modifyInteraction);
    modifyInteraction = null;
  }
  if (eraserInteraction) {
    map.removeInteraction(eraserInteraction);
    eraserInteraction = null;
  }
}
