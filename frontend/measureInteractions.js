import Draw from 'ol/interaction/Draw';
import Overlay from 'ol/Overlay';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import { getLength, getArea } from 'ol/sphere';
import { unByKey } from 'ol/Observable';
import { measureSource, measureLayer } from './interactionLayers.js';

let drawInteraction = null;
let measureTooltip = null;

export function addMeasureInteraction(map, type) {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction);
  }
  drawInteraction = new Draw({
    source: measureSource,
    type: type === 'distance' ? 'LineString' : 'Polygon',
    style: new Style({
      fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
      stroke: new Stroke({ color: '#ffcc33', width: 2 })
    })
  });
  map.addInteraction(drawInteraction);

  const tooltipElement = document.createElement('div');
  tooltipElement.className = 'tooltip';
  tooltipElement.style.background = 'rgba(0, 0, 0, 0.7)';
  tooltipElement.style.color = 'white';
  tooltipElement.style.padding = '5px';
  tooltipElement.style.borderRadius = '3px';
  measureTooltip = new Overlay({
    element: tooltipElement,
    offset: [0, -15],
    positioning: 'bottom-center'
  });
  map.addOverlay(measureTooltip);

  let listener;
  drawInteraction.on('drawstart', (evt) => {
    const sketch = evt.feature;
    listener = sketch.getGeometry().on('change', (evt) => {
      const geom = evt.target;
      let output;
      if (geom instanceof LineString) {
        output = `${getLength(geom).toFixed(2)} km`;
      } else if (geom instanceof Polygon) {
        output = `${getArea(geom).toFixed(2)} km²`;
      }
      tooltipElement.innerHTML = output;
      measureTooltip.setPosition(geom.getLastCoordinate());
    });
  });

  drawInteraction.on('drawend', () => {
    measureTooltip.setPosition(undefined);
    unByKey(listener);
  });
}

export function clearMeasureInteractions(map) {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  }
  if (measureTooltip) {
    measureTooltip.setPosition(undefined);
  }
  measureSource.clear();
  measureLayer.setVisible(false);
}