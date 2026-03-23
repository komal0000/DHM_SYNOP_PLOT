import DragBox from 'ol/interaction/DragBox';
import { jsPDF } from 'jspdf';
import { showSpinner, hideSpinner, showWarning } from './utils.js';
import { config, apiUrl } from './config.js';

let dragBoxInteraction = null;

function normalizeSelection(selection) {
  if (!selection) {
    return null;
  }

  if (Array.isArray(selection)) {
    return { extent: selection, pixelBounds: null };
  }

  return {
    extent: selection.extent || null,
    pixelBounds: selection.pixelBounds || null,
  };
}

function getResolutionScaleFactor() {
  const input = prompt('Select resolution scale: (e.g., 1x for standard (~150 DPI), 2x for high (~300 DPI), 4x for ultra-high (~600 DPI)): ', '2');
  const scaleFactor = parseInt(input, 10);
  if ([1, 2, 4].includes(scaleFactor)) {
    return scaleFactor;
  }
  showWarning('Invalid resolution scale. Defaulting to 2x (~300 DPI).', true);
  return 2; // Default to 2x
}

function exportMap(map, format, filename, selection) {
  showSpinner();
  const scaleFactor = getResolutionScaleFactor();
  const originalSize = map.getSize();
  const originalPixelRatio = window.devicePixelRatio;
  const originalViewExtent = map.getView().calculateExtent(originalSize);
  const normalizedSelection = normalizeSelection(selection);

  let exportSize = [originalSize[0] * scaleFactor, originalSize[1] * scaleFactor];
  let crop = null;

  window.devicePixelRatio = originalPixelRatio * scaleFactor;
  map.once('rendercomplete', () => {
    // Composite ALL canvases from the viewport (base tiles + vector layers like isobars)
    const mapCanvas = document.createElement('canvas');
    const layerCanvases = map.getViewport().querySelectorAll('.ol-layer canvas');

    // Use the actual rendered canvas dimensions (already at high DPI from devicePixelRatio)
    const firstCanvas = layerCanvases[0];
    if (!firstCanvas) {
      showWarning('Failed to export map.', true);
      hideSpinner();
      window.devicePixelRatio = originalPixelRatio;
      return;
    }
    mapCanvas.width = firstCanvas.width;
    mapCanvas.height = firstCanvas.height;
    const mapCtx = mapCanvas.getContext('2d');

    layerCanvases.forEach((canvas) => {
      if (canvas.width > 0 && canvas.height > 0) {
        const opacity = canvas.parentNode.style.opacity || canvas.style.opacity;
        mapCtx.globalAlpha = opacity === '' ? 1 : Number(opacity);
        const transform = canvas.style.transform;
        const matrix = transform.match(/^matrix\(([^\(]*)\)$/);
        if (matrix) {
          const values = matrix[1].split(',').map(Number);
          CanvasRenderingContext2D.prototype.setTransform.apply(mapCtx, values);
        } else {
          mapCtx.setTransform(1, 0, 0, 1, 0, 0);
        }
        mapCtx.drawImage(canvas, 0, 0);
      }
    });
    mapCtx.globalAlpha = 1;
    mapCtx.setTransform(1, 0, 0, 1, 0, 0);

    const canvasWidth = mapCanvas.width;
    const canvasHeight = mapCanvas.height;
    let exportCanvas = mapCanvas;

    if (normalizedSelection) {
      if (normalizedSelection.pixelBounds) {
        const { minX, minY, maxX, maxY } = normalizedSelection.pixelBounds;
        crop = {
          x: Math.max(0, Math.round(minX * scaleFactor)),
          y: Math.max(0, Math.round(minY * scaleFactor)),
          width: Math.min(canvasWidth, Math.round(maxX * scaleFactor)) - Math.max(0, Math.round(minX * scaleFactor)),
          height: Math.min(canvasHeight, Math.round(maxY * scaleFactor)) - Math.max(0, Math.round(minY * scaleFactor))
        };
      } else if (normalizedSelection.extent) {
        const extent = normalizedSelection.extent;
        const mapWidth = originalViewExtent[2] - originalViewExtent[0];
        const mapHeight = originalViewExtent[3] - originalViewExtent[1];

        const x1 = ((extent[0] - originalViewExtent[0]) / mapWidth) * canvasWidth;
        const y1 = ((originalViewExtent[3] - extent[3]) / mapHeight) * canvasHeight;
        const x2 = ((extent[2] - originalViewExtent[0]) / mapWidth) * canvasWidth;
        const y2 = ((originalViewExtent[3] - extent[1]) / mapHeight) * canvasHeight;

        crop = {
          x: Math.max(0, Math.round(x1)),
          y: Math.max(0, Math.round(y1)),
          width: Math.min(canvasWidth, Math.round(x2)) - Math.max(0, Math.round(x1)),
          height: Math.min(canvasHeight, Math.round(y2)) - Math.max(0, Math.round(y1))
        };
      }

      if (!crop || crop.width <= 0 || crop.height <= 0) {
        showWarning('Selected area is invalid. Please draw the area again.', true);
        window.devicePixelRatio = originalPixelRatio;
        map.setSize(originalSize);
        map.renderSync();
        hideSpinner();
        return;
      }

      exportCanvas = document.createElement('canvas');
      exportCanvas.width = crop.width;
      exportCanvas.height = crop.height;

      // Safety check: if the browser silently capped the canvas to 0 (too large),
      // bail out with a clear message instead of sending an empty data URL to the API.
      if (exportCanvas.width === 0 || exportCanvas.height === 0) {
        showWarning('Selected area is too large. Please lower the resolution scale or select a smaller area.', true);
        window.devicePixelRatio = originalPixelRatio;
        map.setSize(originalSize);
        map.renderSync();
        hideSpinner();
        return;
      }

      const ctx = exportCanvas.getContext('2d');
      ctx.drawImage(
        mapCanvas,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, exportCanvas.width, exportCanvas.height
      );
    } else {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvasWidth;
      exportCanvas.height = canvasHeight;

      const ctx = exportCanvas.getContext('2d');
      ctx.drawImage(mapCanvas, 0, 0);
    }

    // Load logo
    const logo = new Image();
    logo.src = '/res/nepallogo.png';

    logo.onload = () => {
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = exportCanvas.width;
      finalCanvas.height = exportCanvas.height;

      const ctx = finalCanvas.getContext('2d');

      // Draw white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

      // Draw map image
      ctx.drawImage(exportCanvas, 0, 0);

      const isAreaExport = Boolean(normalizedSelection);
      const headerLines = [
        'Department of Hydrology and Meteorology',
        'Meteorological Forecasting Division',
        'Babarmahal, Kathmandu, Nepal'
      ];
      const canvasShortSide = Math.min(finalCanvas.width, finalCanvas.height);
      const padding = Math.max(12, Math.round(canvasShortSide * 0.028));
      const fontSize = Math.max(9, Math.round(canvasShortSide * (isAreaExport ? 0.018 : 0.016)));
      const metaFontSize = Math.max(8, Math.round(fontSize * 0.95));
      const lineHeight = Math.round(fontSize * 1.2);
      const logoSize = Math.max(26, Math.round(canvasShortSide * (isAreaExport ? 0.055 : 0.045)));
      const logoMarginBottom = Math.max(8, Math.round(logoSize * 0.25));
      const fontFamily = 'Arial';
      const logoX = padding;
      const logoY = finalCanvas.height - padding - logoSize - (headerLines.length * lineHeight) - logoMarginBottom;
      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

      // Keep the full branding text but size it down for area exports.
      ctx.fillStyle = 'red';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `${fontSize}px ${fontFamily}`;
      let currentY = finalCanvas.height - padding - lineHeight;
      headerLines.slice().reverse().forEach((line) => {
        ctx.fillText(line, padding, currentY);
        currentY -= lineHeight;
      });

      // Draw observation time (bottom-left)
      let observationTime = document.getElementById('legend-observation-time')?.innerText.trim() || 'N/A';
      if (observationTime.toLowerCase().startsWith('observation time:')) {
        observationTime = observationTime.substring('observation time:'.length).trim();
      }
      ctx.fillStyle = 'black';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `${metaFontSize}px ${fontFamily}`;
      ctx.fillText(observationTime, padding, finalCanvas.height - padding);

      // Draw "Prepared by" (bottom-right)
      ctx.fillStyle = 'black';
      ctx.textAlign = 'right';
      ctx.font = `${metaFontSize}px ${fontFamily}`;
      ctx.fillText('Prepared by: ....................', finalCanvas.width - padding, finalCanvas.height - padding);

      // ---- EXPORT ----
      try {
        if (format === 'pdf') {
          const pdf = new jsPDF({
            orientation: finalCanvas.width > finalCanvas.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [finalCanvas.width, finalCanvas.height]
          });

          const imgData = finalCanvas.toDataURL('image/png', 1.0);
          pdf.addImage(imgData, 'PNG', 0, 0, finalCanvas.width, finalCanvas.height);

          // ✅ FIX: Generate proper base64 PDF for backend
          const arrayBuffer = pdf.output('arraybuffer');
          const base64Data = btoa(
            new Uint8Array(arrayBuffer)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          const pdfData = `data:application/pdf;base64,${base64Data}`;

          console.log('Fixed PDF data URI length:', pdfData.length);
          console.log('Starts with:', pdfData.substring(0, 50));

          // Save to database
          saveExportToDatabaseDirect(pdfData, filename, 'PDF', normalizedSelection?.extent || null)
            .then(() => showWarning('PDF saved to database successfully.', false))
            .catch((error) => {
              console.error('Failed to save PDF to database:', error);
              showWarning('PDF export completed but failed to save to database.', true);
            });

          // Download locally
          pdf.save(`${filename}.pdf`);
          showWarning('PDF exported successfully.', false);

        } else {
          // PNG or JPEG
          const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
          const quality = format === 'jpeg' ? 0.9 : 1.0;
          const dataUrl = finalCanvas.toDataURL(mimeType, quality);

          saveExportToDatabaseDirect(dataUrl, filename, format.toUpperCase(), normalizedSelection?.extent || null)
            .then(() => showWarning(`${format.toUpperCase()} saved to database successfully.`, false))
            .catch((error) => {
              console.error(`Failed to save ${format} to database:`, error);
              showWarning(`${format.toUpperCase()} export completed but failed to save to database.`, true);
            });

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

      // Cleanup
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


function copyMapToClipboard(map, selection) {
  showSpinner();
  const scaleFactor = getResolutionScaleFactor();
  const originalSize = map.getSize();
  const originalPixelRatio = window.devicePixelRatio;
  const originalViewExtent = map.getView().calculateExtent(originalSize);
  const normalizedSelection = normalizeSelection(selection);
  let exportSize = [originalSize[0] * scaleFactor, originalSize[1] * scaleFactor];
  let crop = null;

  if (normalizedSelection) {
    if (normalizedSelection.pixelBounds) {
      const { minX, minY, maxX, maxY } = normalizedSelection.pixelBounds;
      crop = {
        x: Math.max(0, Math.round(minX * scaleFactor)),
        y: Math.max(0, Math.round(minY * scaleFactor)),
        width: Math.min(Math.round(originalSize[0] * scaleFactor), Math.round(maxX * scaleFactor)) - Math.max(0, Math.round(minX * scaleFactor)),
        height: Math.min(Math.round(originalSize[1] * scaleFactor), Math.round(maxY * scaleFactor)) - Math.max(0, Math.round(minY * scaleFactor))
      };
    } else if (normalizedSelection.extent) {
      const extent = normalizedSelection.extent;
      const mapWidth = originalViewExtent[2] - originalViewExtent[0];
      const mapHeight = originalViewExtent[3] - originalViewExtent[1];
      const canvasWidth = originalSize[0];
      const canvasHeight = originalSize[1];

      const x1 = ((extent[0] - originalViewExtent[0]) / mapWidth) * canvasWidth;
      const y1 = ((originalViewExtent[3] - extent[3]) / mapHeight) * canvasHeight;
      const x2 = ((extent[2] - originalViewExtent[0]) / mapWidth) * canvasWidth;
      const y2 = ((originalViewExtent[3] - extent[1]) / mapHeight) * canvasHeight;

      crop = {
        x: Math.max(0, Math.round(x1 * scaleFactor)),
        y: Math.max(0, Math.round(y1 * scaleFactor)),
        width: Math.min(Math.round(canvasWidth * scaleFactor), Math.round(x2 * scaleFactor)) - Math.max(0, Math.round(x1 * scaleFactor)),
        height: Math.min(Math.round(canvasHeight * scaleFactor), Math.round(y2 * scaleFactor)) - Math.max(0, Math.round(y1 * scaleFactor))
      };
    }

    if (!crop || crop.width <= 0 || crop.height <= 0) {
      showWarning('Selected area is invalid. Please draw the area again.', true);
      hideSpinner();
      return;
    }

  }

  window.devicePixelRatio = originalPixelRatio * scaleFactor;
  map.once('rendercomplete', () => {
    // Composite ALL canvases from the viewport (base tiles + vector layers like isobars)
    const mapCanvas = document.createElement('canvas');
    const layerCvs = map.getViewport().querySelectorAll('.ol-layer canvas');

    const firstCvs = layerCvs[0];
    if (!firstCvs) {
      showWarning('Failed to copy to clipboard.', true);
      hideSpinner();
      window.devicePixelRatio = originalPixelRatio;
      return;
    }
    mapCanvas.width = firstCvs.width;
    mapCanvas.height = firstCvs.height;
    const mapCtx = mapCanvas.getContext('2d');

    layerCvs.forEach((cvs) => {
      if (cvs.width > 0 && cvs.height > 0) {
        const opacity = cvs.parentNode.style.opacity || cvs.style.opacity;
        mapCtx.globalAlpha = opacity === '' ? 1 : Number(opacity);
        const transform = cvs.style.transform;
        const matrix = transform.match(/^matrix\(([^\(]*)\)$/);
        if (matrix) {
          const values = matrix[1].split(',').map(Number);
          CanvasRenderingContext2D.prototype.setTransform.apply(mapCtx, values);
        } else {
          mapCtx.setTransform(1, 0, 0, 1, 0, 0);
        }
        mapCtx.drawImage(cvs, 0, 0);
      }
    });
    mapCtx.globalAlpha = 1;
    mapCtx.setTransform(1, 0, 0, 1, 0, 0);

    let exportCanvas = mapCanvas;
    if (crop) {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = crop.width;
      exportCanvas.height = crop.height;
      const ctx = exportCanvas.getContext('2d');
      ctx.drawImage(mapCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
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

export function showAreaFormatPicker(onFormat) {
  const overlay = document.getElementById('area-export-picker');
  if (!overlay) return;
  overlay.style.display = 'flex';
  function cleanup() {
    overlay.querySelectorAll('.aep-btn').forEach(btn => {
      if (btn._aepHandler) { btn.removeEventListener('click', btn._aepHandler); delete btn._aepHandler; }
    });
    const cancel = overlay.querySelector('.aep-cancel');
    if (cancel && cancel._aepHandler) { cancel.removeEventListener('click', cancel._aepHandler); delete cancel._aepHandler; }
  }
  overlay.querySelectorAll('.aep-btn').forEach(btn => {
    btn._aepHandler = () => { overlay.style.display = 'none'; cleanup(); onFormat(btn.dataset.format); };
    btn.addEventListener('click', btn._aepHandler);
  });
  const cancel = overlay.querySelector('.aep-cancel');
  if (cancel) {
    cancel._aepHandler = () => { overlay.style.display = 'none'; cleanup(); };
    cancel.addEventListener('click', cancel._aepHandler);
  }
}

export function addDragBoxExportInteraction(map, callback) {
  if (dragBoxInteraction) {
    map.removeInteraction(dragBoxInteraction);
  }
  dragBoxInteraction = new DragBox({});

  dragBoxInteraction.on('boxend', () => {
    const geometry = dragBoxInteraction.getGeometry();
    const extent = geometry.getExtent();
    const topLeft = map.getPixelFromCoordinate([extent[0], extent[3]]);
    const bottomRight = map.getPixelFromCoordinate([extent[2], extent[1]]);
    const selection = {
      extent,
      pixelBounds: {
        minX: Math.min(topLeft[0], bottomRight[0]),
        minY: Math.min(topLeft[1], bottomRight[1]),
        maxX: Math.max(topLeft[0], bottomRight[0]),
        maxY: Math.max(topLeft[1], bottomRight[1]),
      },
    };
    map.removeInteraction(dragBoxInteraction);
    dragBoxInteraction = null;
    map.getTargetElement().style.cursor = 'default';
    callback(selection);
  });

  dragBoxInteraction.on('boxstart', () => {
    map.getTargetElement().style.cursor = 'crosshair';
  });

  map.addInteraction(dragBoxInteraction);
}

/**
 * Save PDF blob to the database via API
 * @param {Blob} pdfBlob - The PDF blob to save
 * @param {string} filename - The filename for the PDF
 * @param {Array} extent - The map extent (optional)
 */
async function savePDFToDatabase(pdfBlob, filename, extent = null) {
  try {
    console.log('savePDFToDatabase called with blob size:', pdfBlob.size);

    // Convert blob to base64
    const base64Data = await blobToBase64(pdfBlob);
    console.log('Base64 data length:', base64Data.length);
    console.log('Base64 data starts with:', base64Data.substring(0, 50));

    // Get current observation time
    const observationTimeElement = document.getElementById('observation-time');
    const observationTime = observationTimeElement ? observationTimeElement.value : null;

    // Prepare form data
    const formData = new FormData();
    formData.append('pdf_data', base64Data);
    formData.append('level', 'SURFACE'); // Default level
    if (observationTime) {
      formData.append('observation_time', observationTime);
    }

    // Send to API
  const apiUrlVar = apiUrl('api/pdf-export/');
  console.log('Sending request to:', apiUrlVar);
    console.log('FormData keys:', Array.from(formData.keys()));

    const response = await fetch(apiUrlVar, {
      method: 'POST',
      body: formData
    });

    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);

    if (!response.ok) {
      console.error('Response not ok:', response.status, response.statusText);
      let errorData;
      try {
        errorData = await response.json();
        console.error('Error data from server:', errorData);
      } catch (e) {
        console.error('Could not parse error response as JSON:', e);
        const errorText = await response.text();
        console.error('Error response text:', errorText);
        errorData = { error: errorText || `HTTP ${response.status}` };
      }
      throw new Error(errorData.error || 'Failed to save PDF');
    }

    const result = await response.json();
    console.log('PDF saved to database:', result);
    return result;

  } catch (error) {
    console.error('Error saving PDF to database:', error);
    throw error;
  }
}

/**
 * Convert blob to base64 string
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} Base64 string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      console.log('FileReader result type:', typeof reader.result);
      console.log('FileReader result length:', reader.result?.length);
      resolve(reader.result);
    };
    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(error);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Save export file data URI directly to the database via API
 * @param {string} fileDataUri - The file data URI
 * @param {string} filename - The filename for the export
 * @param {string} format - The file format (PDF, PNG, JPEG)
 * @param {Array} extent - The map extent (optional)
 */
async function saveExportToDatabaseDirect(fileDataUri, filename, format, extent = null) {
  try {
    console.log(`saveExportToDatabaseDirect called for ${format} with data URI length:`, fileDataUri.length);

    // Get current observation time
    const observationTimeElement = document.getElementById('observation-time');
    const observationTime = observationTimeElement ? observationTimeElement.value : null;

    // Detect which dashboard we're on by checking if upper-export-drawer exists
    const isUpperAirDashboard = document.getElementById('upper-export-drawer') !== null;
    const level = isUpperAirDashboard ? 'UPPERAIRMAP' : 'SURFACE';
    
    console.log(`Detected dashboard: ${isUpperAirDashboard ? 'Upper Air' : 'Surface'}, level: ${level}`);

    // Prepare form data
    const formData = new FormData();
    formData.append('file_data', fileDataUri); // Send data URI directly
    formData.append('format', format); // PDF, PNG, or JPEG
    formData.append('level', level); // UPPERAIRMAP or SURFACE
    if (observationTime) {
      formData.append('observation_time', observationTime);
    }

    // Send to API
  const apiUrlVar = apiUrl('api/export-file/');
  console.log(`Sending ${format} export request to:`, apiUrlVar);
    console.log('FormData keys:', Array.from(formData.keys()));

    const response = await fetch(apiUrlVar, {
      method: 'POST',
      body: formData
    });

    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);

    if (!response.ok) {
      console.error('Response not ok:', response.status, response.statusText);
      let errorData;
      try {
        errorData = await response.json();
        console.error('Error data from server:', errorData);
      } catch (e) {
        console.error('Could not parse error response as JSON:', e);
        const errorText = await response.text();
        console.error('Error response text:', errorText);
        errorData = { error: errorText || `HTTP ${response.status}` };
      }
      throw new Error(errorData.error || `Failed to save ${format}`);
    }

    const result = await response.json();
    console.log(`${format} saved to database:`, result);
    return result;

  } catch (error) {
    console.error('Error saving PDF to database:', error);
    throw error;
  }
}

// Keep backward compatibility function
async function savePDFToDatabaseDirect(pdfDataUri, filename, extent = null) {
  return saveExportToDatabaseDirect(pdfDataUri, filename, 'PDF', extent);
}

export { exportMap, copyMapToClipboard, savePDFToDatabase, savePDFToDatabaseDirect, saveExportToDatabaseDirect };
