import Overlay from 'ol/Overlay';

export function createPopup(map) {
  const popupElement = document.createElement('div');
  popupElement.id = 'weather-popup';
  popupElement.className = 'weather-popup';
  popupElement.style.backgroundColor = 'white';
  popupElement.style.padding = '10px';
  popupElement.style.border = '1px solid #ccc';
  popupElement.style.borderRadius = '5px';
  popupElement.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)';
  popupElement.style.maxWidth = '300px';
  popupElement.style.zIndex = '10000';
  popupElement.style.position = 'absolute';
  popupElement.style.display = 'none';

  const mapTarget = map.getTargetElement();
  mapTarget.appendChild(popupElement);

  const popup = new Overlay({
    element: popupElement,
    autoPan: {
      animation: { duration: 250 },
      margin: 10
    },
    positioning: 'bottom-center',
    offset: [0, -15],
    stopEvent: false
  });
  map.addOverlay(popup);
  return popup;
}