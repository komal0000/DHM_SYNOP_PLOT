import DragBox from 'ol/interaction/DragBox';
import { jsPDF } from 'jspdf';
import { platformModifierKeyOnly } from 'ol/events/condition';
import { showSpinner, hideSpinner, showWarning } from './utils.js';

let dragBoxInteraction = null;

function getResolutionScaleFactor() {
  const input = prompt('Select resolution scale: (e.g., 1x for standard (~150 DPI), 2x for high (~300 DPI), 4x for ultra-high (~600 DPI)): ', '2');
  const scaleFactor = parseInt(input, 10);
  if ([1, 2, 4].includes(scaleFactor)) {
    return scaleFactor;
  }
  showWarning('Invalid resolution scale. Defaulting to 2x (~300 DPI).', true);
  return 2; // Default to 2x
}

function exportMap(map, format, filename, extent) {
  showSpinner();
  const scaleFactor = getResolutionScaleFactor();
  const originalSize = map.getSize();
  const originalPixelRatio = window.devicePixelRatio;

  let exportSize = [originalSize[0] * scaleFactor, originalSize[1] * scaleFactor];
  let crop = null;

  window.devicePixelRatio = originalPixelRatio * scaleFactor;
  map.once('rendercomplete', () => {
    const canvas = map.getViewport().querySelector('canvas');
    if (!canvas) {
      showWarning('Failed to export map.', true);
      hideSpinner();
      window.devicePixelRatio = originalPixelRatio;
      return;
    }

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    let exportCanvas = canvas;

    if (extent) {
      const view = map.getView();
      const mapExtent = view.calculateExtent(map.getSize());
      const mapWidth = mapExtent[2] - mapExtent[0];
      const mapHeight = mapExtent[3] - mapExtent[1];

      const x1 = ((extent[0] - mapExtent[0]) / mapWidth) * canvasWidth;
      const y1 = ((mapExtent[3] - extent[3]) / mapHeight) * canvasHeight;
      const x2 = ((extent[2] - mapExtent[0]) / mapWidth) * canvasWidth;
      const y2 = ((mapExtent[3] - extent[1]) / mapHeight) * canvasHeight;

      crop = {
        x: x1,
        y: y1,
        width: (x2 - x1),
        height: (y2 - y1)
      };
      exportSize = [crop.width * scaleFactor, crop.height * scaleFactor];

      exportCanvas = document.createElement('canvas');
      exportCanvas.width = exportSize[0];
      exportCanvas.height = exportSize[1];

      const ctx = exportCanvas.getContext('2d');
      ctx.drawImage(
        canvas,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, exportCanvas.width, exportCanvas.height
      );
    } else {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvasWidth;
      exportCanvas.height = canvasHeight;

      const ctx = exportCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
    }

    // Load logo
    const logo = new Image();
    logo.src = '/res/nepallogo.png'; // ⚠️ Update this path as needed

    logo.onload = () => {
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = exportCanvas.width;
      finalCanvas.height = exportCanvas.height;

      const ctx = finalCanvas.getContext('2d');

      // Draw white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

      // Draw main exportCanvas image
      ctx.drawImage(exportCanvas, 0, 0);

      // Header details
      const headerLines = [
        'Department of Hydrology and Meteorology',
        'Meteorological Forecasting Division',
        'TIA, Kathmandu, Nepal'
      ];

      const padding = 20 * scaleFactor;
      const lineHeight = 16 * scaleFactor;
      const fontSize = 12 * scaleFactor;
      const fontFamily = 'Arial';

      // Draw logo
      const logoWidth = 80 * scaleFactor;
      const logoHeight = 80 * scaleFactor;
      const logoX = padding;
      const logoY = finalCanvas.height - padding - logoHeight - (headerLines.length * lineHeight) - 10 * scaleFactor;
      ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);

      // Draw header lines (bottom-up)
      ctx.fillStyle = 'red';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `${fontSize}px ${fontFamily}`;
      let currentY = finalCanvas.height - padding - lineHeight;
      headerLines.slice().reverse().forEach(line => {
        ctx.fillText(line, padding, currentY);
        currentY -= lineHeight;
      });

      // Draw observation time in black
      let observationTime = document.getElementById('legend-observation-time')?.innerText.trim() || 'N/A';
if (observationTime.toLowerCase().startsWith('observation time:')) {
  observationTime = observationTime.substring('observation time:'.length).trim();
}

      ctx.fillStyle = 'black';
      ctx.fillText(observationTime, padding, finalCanvas.height - padding);

      // Export to format
      try {
        if (format === 'pdf') {
          const pdf = new jsPDF({
            orientation: finalCanvas.width > finalCanvas.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [finalCanvas.width, finalCanvas.height]
          });
          const imgData = finalCanvas.toDataURL('image/png', 1.0);
          pdf.addImage(imgData, 'PNG', 0, 0, finalCanvas.width, finalCanvas.height);
          pdf.save(`${filename}.pdf`);
          showWarning('PDF exported successfully.', false);
        } else {
          const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
          const quality = format === 'jpeg' ? 0.9 : 1.0;
          const dataUrl = finalCanvas.toDataURL(mimeType, quality);
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = `${filename}.${format}`;
          link.click();
          showWarning(`${format.toUpperCase()} exported successfully.`, false);
        }
      } catch (err) {
        console.error('Export error:', err);
        showWarning(`Failed to export ${format.toUpperCase()}.`, true);
      }

      window.devicePixelRatio = originalPixelRatio;
      map.setSize(originalSize);
      map.renderSync();
      hideSpinner();
    };

    logo.onerror = () => {
      showWarning('Failed to load logo image.', true);
      window.devicePixelRatio = originalPixelRatio;
      map.setSize(originalSize);
      map.renderSync();
      hideSpinner();
    };
  });

  map.setSize(exportSize);
  map.renderSync();
}

function copyMapToClipboard(map, extent) {
  showSpinner();
  const scaleFactor = getResolutionScaleFactor();
  const originalSize = map.getSize();
  const originalPixelRatio = window.devicePixelRatio;
  let exportSize = [originalSize[0] * scaleFactor, originalSize[1] * scaleFactor];
  let crop = null;

  if (extent) {
    const view = map.getView();
    const mapSize = map.getSize();
    const mapExtent = view.calculateExtent(mapSize);
    const mapWidth = mapExtent[2] - mapExtent[0];
    const mapHeight = mapExtent[3] - mapExtent[1];
    const canvasWidth = mapSize[0];
    const canvasHeight = mapSize[1];

    const x1 = ((extent[0] - mapExtent[0]) / mapWidth) * canvasWidth;
    const y1 = ((mapExtent[3] - extent[3]) / mapHeight) * canvasHeight;
    const x2 = ((extent[2] - mapExtent[0]) / mapWidth) * canvasWidth;
    const y2 = ((mapExtent[3] - extent[1]) / mapHeight) * canvasHeight;

    crop = {
      x: x1 * scaleFactor,
      y: y1 * scaleFactor,
      width: (x2 - x1) * scaleFactor,
      height: (y2 - y1) * scaleFactor
    };
    exportSize = [crop.width, crop.height];
  }

  window.devicePixelRatio = originalPixelRatio * scaleFactor;
  map.once('rendercomplete', () => {
    const canvas = map.getViewport().querySelector('canvas');
    if (!canvas) {
      showWarning('Failed to copy to clipboard.', true);
      hideSpinner();
      window.devicePixelRatio = originalPixelRatio;
      return;
    }

    let exportCanvas = canvas;
    if (crop) {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = crop.width;
      exportCanvas.height = crop.height;
      const ctx = exportCanvas.getContext('2d');
      ctx.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    }

    exportCanvas.toBlob((blob) => {
      try {
        navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]).then(() => {
          showWarning('Map copied to clipboard as PNG.', false);
        }).catch((err) => {
          console.error('Clipboard error:', err);
          showWarning('Failed to copy to clipboard.', true);
        });
      } catch (err) {
        console.error('Clipboard error:', err);
        showWarning('Failed to copy to clipboard.', true);
      }

      window.devicePixelRatio = originalPixelRatio;
      map.setSize(originalSize);
      map.renderSync();
      hideSpinner();
    }, 'image/png', 1.0);
  });

  map.setSize(exportSize);
  map.renderSync();
}

export function addDragBoxExportInteraction(map, callback) {
  if (dragBoxInteraction) {
    map.removeInteraction(dragBoxInteraction);
  }
  dragBoxInteraction = new DragBox({
    condition: platformModifierKeyOnly
  });

  dragBoxInteraction.on('boxend', () => {
    const extent = dragBoxInteraction.getGeometry().getExtent();
    map.removeInteraction(dragBoxInteraction);
    dragBoxInteraction = null;
    map.getTargetElement().style.cursor = 'default';
    callback(extent);
  });

  dragBoxInteraction.on('boxstart', () => {
    map.getTargetElement().style.cursor = 'crosshair';
  });

  map.addInteraction(dragBoxInteraction);
}

export { exportMap, copyMapToClipboard };
