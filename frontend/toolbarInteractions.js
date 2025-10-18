import Select from 'ol/interaction/Select';
import GeoJSON from 'ol/format/GeoJSON';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import { fromLonLat } from 'ol/proj';
import { config, apiUrl } from './config.js';
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
  fetch(apiUrl('api/export/'), {
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

  // Upper Air Map Export Buttons
  document.querySelector('.export-upper-jpeg')?.addEventListener('click', () => {
    exportMap(map, 'jpeg', 'upper_air_map', exportExtent);
  });

  document.querySelector('.export-upper-png')?.addEventListener('click', () => {
    exportMap(map, 'png', 'upper_air_map', exportExtent);
  });

  document.querySelector('.export-upper-pdf')?.addEventListener('click', () => {
    exportMap(map, 'pdf', 'upper_air_map', exportExtent);
  });

  document.querySelector('.export-upper-area')?.addEventListener('click', () => {
    showWarning('Draw a rectangle to select the export area.', false);
    addDragBoxExportInteraction(map, (extent) => {
      const format = prompt('Select export format (jpeg, png, pdf, clipboard):', 'png').toLowerCase();
      if (['jpeg', 'png', 'pdf'].includes(format)) {
        exportMap(map, format, 'upper_air_map_area', extent);
      } else if (format === 'clipboard') {
        copyMapToClipboard(map, extent);
      } else {
        showWarning('Invalid format. Use jpeg, png, pdf, or clipboard.', true);
      }
    });
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

  // Export Container functionality
  document.querySelector('.export-container')?.addEventListener('click', () => {
    openExportDrawer();
  });
  document.querySelector('.upper-export-container')?.addEventListener('click', () => {
    openUpperExportDrawer();
  });


  document.querySelector('#export-drawer-close')?.addEventListener('click', () => {
    closeExportDrawer();
  });
  document.querySelector('#upper-export-drawer-close')?.addEventListener('click', () => {
    closeUpperExportDrawer();
  });
  // Keep backward compatibility for PDF container
  document.querySelector('.pdf-container')?.addEventListener('click', () => {
    openExportDrawer();
  });

  document.querySelector('#pdf-drawer-close')?.addEventListener('click', () => {
    closeExportDrawer();
  });
}

/**
 * Open export drawer and load export list
 */
function openExportDrawer() {
  const drawer = document.getElementById('export-drawer') || document.getElementById('pdf-drawer');
  if (drawer) {
    drawer.style.display = 'flex';
    loadExportList();
  }
}

/**
 * Close export drawer
 */
function closeExportDrawer() {
  const drawer = document.getElementById('export-drawer') || document.getElementById('pdf-drawer');
  if (drawer) {
    drawer.style.display = 'none';
  }
}

function openUpperExportDrawer() {
  const drawer = document.getElementById('upper-export-drawer');
  if (drawer) {
    drawer.style.display = 'flex';
    loadExportList();
  }
}

/**
 * Close export drawer
 */
function closeUpperExportDrawer() {
  const drawer = document.getElementById('upper-export-drawer');
  if (drawer) {
    drawer.style.display = 'none';
  }
}


// Keep backward compatibility functions
function openPDFDrawer() { openExportDrawer(); }
function closePDFDrawer() { closeExportDrawer(); }
function openUpperPDFDrawer() { openUpperExportDrawer(); }
function closeUpperPDFDrawer() { closeUpperExportDrawer(); }

/**
 * Load export list from API
 */
async function loadExportList() {
  const exportListElement = document.getElementById('export-list') || document.getElementById('pdf-list');
  if (!exportListElement) return;

  try {
    exportListElement.innerHTML = '<div class="export-loading">Loading exports...</div>';
    
    // Detect which dashboard we're on
    const isUpperAirDashboard = document.getElementById('upper-export-drawer') !== null;
    const levelFilter = isUpperAirDashboard ? 'UPPERAIRMAP' : 'SURFACE';
    
    console.log(`Loading exports for dashboard: ${isUpperAirDashboard ? 'Upper Air' : 'Surface'}, filtering by level: ${levelFilter}`);
    
    const normalizedApiBaseUrl = config.apiBaseUrl.endsWith('/') ? config.apiBaseUrl : `${config.apiBaseUrl}/`;
  const response = await fetch(apiUrl(`api/export-list/?level=${levelFilter}`));
    
    if (!response.ok) {
      throw new Error('Failed to load exports');
    }
    
    const exports = await response.json();
    
    // Additional client-side filtering to ensure we only show correct level
    const filteredExports = exports.filter(exp => exp.level === levelFilter);
    
    if (filteredExports.length === 0) {
      exportListElement.innerHTML = '<div class="export-loading">No exports found</div>';
      return;
    }
    
    // Create export list items
    exportListElement.innerHTML = '';
    filteredExports.forEach(exportItem => {
      const exportItemElement = createExportListItem(exportItem);
      exportListElement.appendChild(exportItemElement);
    });
    
  } catch (error) {
    console.error('Error loading export list:', error);
    exportListElement.innerHTML = '<div class="export-loading">Failed to load exports</div>';
    showWarning('Failed to load export list.', true);
  }
}

// Keep backward compatibility
function loadPDFList() { loadExportList(); }

/**
 * Create export list item element with format indicator and delete button
 * @param {Object} exportData - Export data from API
 * @returns {HTMLElement} Export item element
 */
function createExportListItem(exportData) {
  const item = document.createElement('div');
  item.className = 'export-item';
  item.dataset.exportId = exportData.id;
  
  const itemContent = document.createElement('div');
  itemContent.className = 'export-item-content';
  
  const name = document.createElement('div');
  name.className = 'export-item-name';
  
  // Create format badge
  const formatBadge = document.createElement('span');
  formatBadge.className = `export-item-format ${exportData.map_type.toLowerCase()}`;
  formatBadge.textContent = exportData.map_type;
  
  // Create filename text
  const filenameText = document.createElement('span');
  filenameText.textContent = exportData.file_name || 'Unnamed Export';
  
  name.appendChild(formatBadge);
  name.appendChild(filenameText);
  
  const meta = document.createElement('div');
  meta.className = 'export-item-meta';
  const createdDate = new Date(exportData.created_at).toLocaleString();
  const level = exportData.level || 'Unknown';
  meta.textContent = `${level} • ${createdDate}`;
  
  itemContent.appendChild(name);
  itemContent.appendChild(meta);
  
  // Create delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'export-item-delete';
  deleteBtn.innerHTML = 'Delete';
  deleteBtn.title = 'Delete export';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteExport(exportData.id);
  });
  
  // Create view button
  const viewBtn = document.createElement('button');
  viewBtn.className = 'export-item-view';
  viewBtn.innerHTML = 'View';
  viewBtn.title = 'View export';
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showLightbox(exportData);
  });
  
  item.appendChild(itemContent);
  // append view then delete for clarity
  item.appendChild(viewBtn);
  item.appendChild(deleteBtn);
  
  // Click handler for export preview in lightbox
  itemContent.addEventListener('click', () => {
    selectExportItem(item);
    showLightbox(exportData);
  });
  
  return item;
}

// Keep backward compatibility
function createPDFListItem(pdf) {
  return createExportListItem(pdf);
}

/**
 * Select export item and update UI
 * @param {HTMLElement} selectedItem - The selected export item
 */
function selectExportItem(selectedItem) {
  // Remove previous selection
  document.querySelectorAll('.export-item.selected, .pdf-item.selected').forEach(item => {
    item.classList.remove('selected');
  });
  
  // Add selection to current item
  selectedItem.classList.add('selected');
}

/**
 * Preview export file in the preview pane
 * @param {Object} exportData - Export data from API
 */
function previewExport(exportData) {
  const previewFrame = document.getElementById('export-preview-frame') || document.getElementById('pdf-preview-frame');
  const placeholder = document.querySelector('.export-preview-placeholder') || document.querySelector('.pdf-preview-placeholder');
  
  if (previewFrame && placeholder) {
    try {
      const normalizedApiBaseUrl = config.apiBaseUrl.endsWith('/') ? config.apiBaseUrl : `${config.apiBaseUrl}/`;
      const exportUrl = `${normalizedApiBaseUrl}api/export-download/${exportData.id}/`;
      
      // For images, we can preview directly. For PDFs, use iframe
      if (exportData.map_type === 'PDF') {
        previewFrame.src = exportUrl;
        previewFrame.style.display = 'block';
        placeholder.style.display = 'none';
      } else {
        // For PNG/JPEG, create an img element inside the preview area
        const previewContainer = previewFrame.parentElement;
        let imgElement = previewContainer.querySelector('.export-image-preview');
        
        if (!imgElement) {
          imgElement = document.createElement('img');
          imgElement.className = 'export-image-preview';
          imgElement.style.maxWidth = '100%';
          imgElement.style.maxHeight = '100%';
          imgElement.style.objectFit = 'contain';
          previewContainer.appendChild(imgElement);
        }
        
        imgElement.src = exportUrl;
        imgElement.style.display = 'block';
        previewFrame.style.display = 'none';
        placeholder.style.display = 'none';
      }
      
    } catch (error) {
      console.error('Error previewing export:', error);
      showWarning('Failed to preview export.', true);
    }
  }
}

/**
 * Show export in lightbox
 * @param {Object} exportData - Export data from API
 */
function showLightbox(exportData) {
  const normalizedApiBaseUrl = config.apiBaseUrl.endsWith('/') ? config.apiBaseUrl : `${config.apiBaseUrl}/`;
  const exportUrl = `${normalizedApiBaseUrl}api/export-download/${exportData.id}/`;
  
  // Create lightbox if it doesn't exist
  let lightbox = document.getElementById('export-lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'export-lightbox';
    lightbox.className = 'export-lightbox';
    lightbox.innerHTML = `
      <div class="lightbox-overlay"></div>
      <div class="lightbox-content">
        <button class="lightbox-close">×</button>
        <div class="lightbox-body">
          <img class="lightbox-image" style="display: none;" />
          <iframe class="lightbox-iframe" style="display: none;"></iframe>
        </div>
        <div class="lightbox-info">
          <span class="lightbox-filename"></span>
          <a class="lightbox-download" download>Download</a>
        </div>
      </div>
    `;
    document.body.appendChild(lightbox);
    
    // Inline styles to ensure proper centering and scaling without relying on external CSS
    // Container covers viewport and centers content
    lightbox.style.position = 'fixed';
    lightbox.style.inset = '0';
    lightbox.style.display = 'none';
    lightbox.style.alignItems = 'center';
    lightbox.style.justifyContent = 'center';
    lightbox.style.zIndex = '9999';

    // Overlay dims background
    const overlay = lightbox.querySelector('.lightbox-overlay');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.6)';

    // Modal content area
    const content = lightbox.querySelector('.lightbox-content');
    content.style.position = 'relative';
    content.style.background = '#fff';
    content.style.borderRadius = '8px';
    content.style.overflow = 'hidden';
    content.style.maxWidth = '95vw';
    content.style.maxHeight = '90vh';
    content.style.width = '90vw';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';

    // Close button
    const closeBtn = content.querySelector('.lightbox-close');
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '8px';
    closeBtn.style.right = '8px';
    closeBtn.style.background = '#ef4444';
    closeBtn.style.color = '#fff';
    closeBtn.style.border = 'none';
    closeBtn.style.width = '32px';
    closeBtn.style.height = '32px';
    closeBtn.style.borderRadius = '16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.lineHeight = '32px';

    // Body centers preview
    const body = content.querySelector('.lightbox-body');
    body.style.flex = '1 1 auto';
    body.style.display = 'flex';
    body.style.alignItems = 'center';
    body.style.justifyContent = 'center';
    body.style.background = '#fff';
    body.style.minHeight = '60vh';
    body.style.padding = '10px';

    // Footer
    const info = content.querySelector('.lightbox-info');
    info.style.display = 'flex';
    info.style.alignItems = 'center';
    info.style.justifyContent = 'space-between';
    info.style.gap = '12px';
    info.style.padding = '10px 12px';
    info.style.borderTop = '1px solid #eee';

    // Preview elements scale to fit
    const imgEl = content.querySelector('.lightbox-image');
    imgEl.style.maxWidth = '100%';
    imgEl.style.maxHeight = '80vh';
    imgEl.style.objectFit = 'contain';
    imgEl.style.display = 'none';

    const iframeEl = content.querySelector('.lightbox-iframe');
    iframeEl.style.width = '100%';
    iframeEl.style.height = '80vh';
    iframeEl.style.border = 'none';
    iframeEl.style.display = 'none';

    // Close handlers
    lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    lightbox.querySelector('.lightbox-overlay').addEventListener('click', closeLightbox);
    
    // ESC key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.style.display === 'flex') {
        closeLightbox();
      }
    });
  }
  
  const lightboxImage = lightbox.querySelector('.lightbox-image');
  const lightboxIframe = lightbox.querySelector('.lightbox-iframe');
  const lightboxFilename = lightbox.querySelector('.lightbox-filename');
  const lightboxDownload = lightbox.querySelector('.lightbox-download');
  
  // Update lightbox content
  lightboxFilename.textContent = exportData.file_name || 'Unnamed Export';
  lightboxDownload.href = exportUrl;
  lightboxDownload.download = exportData.file_name || 'export';
  
  if (exportData.map_type === 'PDF') {
    lightboxImage.style.display = 'none';
    lightboxIframe.src = exportUrl;
    lightboxIframe.style.display = 'block';
  } else {
    lightboxIframe.style.display = 'none';
    lightboxImage.src = exportUrl;
    lightboxImage.style.display = 'block';
  }
  
  // Show lightbox
  lightbox.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/**
 * Close lightbox
 */
function closeLightbox() {
  const lightbox = document.getElementById('export-lightbox');
  if (lightbox) {
    lightbox.style.display = 'none';
    document.body.style.overflow = '';
  }
}

/**
 * Delete export
 * @param {number} exportId - Export ID
 */
async function deleteExport(exportId) {
  if (!confirm('Are you sure you want to delete this export?')) {
    return;
  }
  
  try {
    showSpinner();
    const normalizedApiBaseUrl = config.apiBaseUrl.endsWith('/') ? config.apiBaseUrl : `${config.apiBaseUrl}/`;
  const response = await fetch(apiUrl(`api/export-delete/${exportId}/`), {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete export');
    }
    
    showWarning('Export deleted successfully.', false);
    loadExportList(); // Reload the list
  } catch (error) {
    console.error('Error deleting export:', error);
    showWarning('Failed to delete export.', true);
  } finally {
    hideSpinner();
  }
}

// Keep backward compatibility functions
function selectPDFItem(selectedItem) { selectExportItem(selectedItem); }
function previewPDF(pdf) { previewExport(pdf); }