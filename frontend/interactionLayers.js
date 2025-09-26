import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Text from 'ol/style/Text';
import CircleStyle from 'ol/style/Circle';
import { measureLayers } from './layers.js';

// Measurement and Editing Layers
export const measureSource = new VectorSource();
export const editSource = new VectorSource();

export const measureLayer = new VectorLayer({
  title: 'Measurements',
  source: measureSource,
  style: new Style({
    fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
    stroke: new Stroke({ color: '#ffcc33', width: 2 })
  }),
  visible: false
});
measureLayers.getLayers().push(measureLayer);

export const editLayer = new VectorLayer({
  title: 'Editable Features',
  source: editSource,
  style: function(feature) {
    const featureType = feature.get('type');
    if (featureType === 'high' || featureType === 'low' || featureType === 'depression') {
      return new Style({
        text: new Text({
          text: featureType === 'high' ? 'H' : featureType === 'low' ? 'L' : 'D',
          font: 'bold 20px Arial',
          fill: new Fill({ color: featureType === 'high' ? '#0000ff' : featureType === 'low' ? '#ff0000' : '#ff00ff' }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
          offsetY: -10
        })
      });
    } else if (featureType === 'sign') {
      return new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: '#000000' }),
          stroke: new Stroke({ color: '#ffffff', width: 1 })
        })
      });
    } else if (featureType === 'textbox') {
      return new Style({
        text: new Text({
          text: feature.get('text') || '',
          font: '14px Arial',
          fill: new Fill({ color: '#000000' }),
          stroke: new Stroke({ color: '#ffffff', width: 1 }),
          backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.7)' }),
          padding: [3, 3, 3, 3],
          offsetY: -10
        })
      });
    }
    return new Style({
      fill: new Fill({ color: 'rgba(0, 255, 0, 0.2)' }),
      stroke: new Stroke({ color: '#0000ff', width: 1 })
    });
  }
});
measureLayers.getLayers().push(editLayer);