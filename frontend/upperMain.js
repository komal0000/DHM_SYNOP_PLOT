import 'ol-layerswitcher/dist/ol-layerswitcher.css';
import './style.css';
import { Map, View } from 'ol';
import { fromLonLat, transformExtent, transform } from 'ol/proj';
import LayerSwitcher from 'ol-ext/control/LayerSwitcher';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Style from 'ol/style/Style';
import Stroke from 'ol/style/Stroke';
import Fill from 'ol/style/Fill';
import Circle from 'ol/style/Circle';
import Text from 'ol/style/Text.js';
import { config, extentLatLon, apiUrl } from './config.js';
import {
  baseLayers, grid, stationLayers, upperair_temperatureLayers,
  isobarLayers, isothermLayers, pressureCenterLayers, gridLayers, measureLayers
} from './layers.js';
import { addStationsToMap } from './stations.js';
import { synopObservation } from './uppeAirSynop.js';
import { createPopup, setupToolbarInteractions } from './interactions.js';
import { clearMeasureInteractions } from './measureInteractions.js';
import { editSource, editLayer } from './interactionLayers.js';
import { clearEditInteractions, addIsobarModifyInteraction, removeIsobarModifyInteraction, registerEraserSources, clearEraserSources } from './editInteractions.js';
import { showSpinner, hideSpinner, showWarning, hideWarning, fetchWithRetry, debounce, getWeatherIcon, getCountryFlag, getPressureTrendClass, getPressureTrendSymbol } from './utils.js';
import Modify from 'ol/interaction/Modify.js';
import Select from 'ol/interaction/Select.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';

// Initialize Map
const extent = transformExtent(extentLatLon, 'EPSG:4326', 'EPSG:3857');
const view = new View({
  center: fromLonLat([85.324, 27.6172]), // Center on Nepal
  zoom: 3,
  maxZoom: 12,
  extent: extent,
  constrainOnlyCenter: true
});

const select = new Select();

const modify = new Modify({
  features: select.getFeatures(),
});
const map = new Map({
  interactions: defaultInteractions().extend([select, modify]),
  target: 'map',
  layers: [
    baseLayers, grid, stationLayers, 
    isobarLayers, isothermLayers, upperair_temperatureLayers,measureLayers
  ],
  view: view
});

// Add Layer Switcher Control
const layerSwitcher = new LayerSwitcher({
  target: document.querySelector('.lyrSwitcher'),
  extent: true
});
map.addControl(layerSwitcher);

// ===== Layer Panel Collapse/Expand Enhancement =====
// Forces all layer groups to always render children in the DOM,
// then uses CSS class "layer-collapsed" + max-height transition for smooth animation.
// Clicking a group header (label text) toggles collapse. State persists across redraws.
(function initLayerCollapseUI() {
  // Track which groups are collapsed by their title
  var collapsedGroups = new Set();

  // Force all layer groups to render their children (openInLayerSwitcher = true)
  function forceGroupsOpen(layerCollection) {
    layerCollection.forEach(function (layer) {
      if (layer.getLayers) {
        layer.set('openInLayerSwitcher', true, true);
        forceGroupsOpen(layer.getLayers());
      }
    });
  }
  forceGroupsOpen(map.getLayers());
  layerSwitcher.drawPanel();

  var panel = document.querySelector('.lyrSwitcher .panel');
  if (!panel) return;

  /**
   * Wire up click-to-collapse on each layer-group <li>.
   * Restores collapsed state from `collapsedGroups` set.
   */
  function enhanceGroups() {
    panel.querySelectorAll('li.ol-layer-group').forEach(function (li) {
      var header = li.querySelector(':scope > .li-content');
      if (!header) return;

      // Get the group title from the label text
      var label = header.querySelector('label span');
      var title = label ? label.textContent.trim() : '';

      // Restore collapsed state
      if (title && collapsedGroups.has(title)) {
        li.classList.add('layer-collapsed');
      }

      // Skip if already wired
      if (li.dataset.collapseInit) return;
      li.dataset.collapseInit = '1';

      // Click the group label SPAN text (where the ▾ arrow is) to toggle collapse
      var labelSpan = header.querySelector('label span');
      if (labelSpan) {
        labelSpan.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();

          li.classList.toggle('layer-collapsed');
          // Persist state
          if (li.classList.contains('layer-collapsed')) {
            collapsedGroups.add(title);
          } else {
            collapsedGroups.delete(title);
          }
        });
      }
    });
  }

  // Initial enhancement
  enhanceGroups();

  // Re-enhance whenever ol-ext redraws the panel (e.g. layer added/removed)
  var isEnhancing = false;
  var observer = new MutationObserver(function () {
    if (isEnhancing) return;
    isEnhancing = true;
    forceGroupsOpen(map.getLayers());
    requestAnimationFrame(function () {
      enhanceGroups();
      isEnhancing = false;
    });
  });
  observer.observe(panel, { childList: true, subtree: true });
})();

// Setup Popup
const popup = createPopup(map);

// Store Weather Reports
let weatherReports = [];

/**
 * Updates the legend with the selected observation time.
 * @param {string} observationTime - ISO 8601 timestamp.
 */
// function updateLegendObservationTime(observationTime) {
//   const legendTimeElement = document.getElementById('legend-observation-time');
//   if (observationTime) {
//     legendTimeElement.textContent = `Observation Time: ${new Date(observationTime).toUTCString()}`;
//   } else {
//     legendTimeElement.textContent = 'Observation Time: N/A';
//   }
// }
function formatLevel(level) {
  return level.replace(/HPA$/, ' hPa');
}

function isUpperAirLevel(level) {
  return /HPA$/.test(level) && !/^SURFACE$/i.test(level);
}

function getObservationTimesEndpoint(level) {
  return isUpperAirLevel(level) ? 'upperair-observation-times' : 'observation-times';
}

function getReportEndpoint(level) {
  return isUpperAirLevel(level) ? 'upperair-reports' : 'reports';
}

function updateLegendObservation(observationTime, level) {
  const legendTimeElement = document.getElementById('legend-observation-time');
  const legendLevelElement = document.getElementById('legend-observation-level');

  if (legendTimeElement) {
    if (observationTime) {
      const date = new Date(observationTime);
      legendTimeElement.textContent = !isNaN(date)
        ? `Observation Time: ${date.toUTCString()}`
        : 'Observation Time: Invalid';
    } else {
      legendTimeElement.textContent = 'Observation Time: N/A';
    }
  }

  if (legendLevelElement) {
    legendLevelElement.textContent = level ? `Pressure Level: ${formatLevel(level)}` : 'Pressure Level: N/A';
  }
}

/**
 * Loads observation times based on selected level.
 */
function loadObservationTimes(level = '850HPA') {
  showSpinner();
  const endpoint = getObservationTimesEndpoint(level);
  const url = apiUrl(`api/${endpoint}/?level=${encodeURIComponent(level)}`);
  
  console.log(`Loading observation times for level: ${level}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Full URL: ${url}`);

  fetch(url)
    .then(res => {
      console.log(`Response status: ${res.status} ${res.statusText}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res.json();
    })
    .then(times => {
      console.log(`Received ${times.length} observation times:`, times);
      
      const select = document.getElementById('observation-time');
      
      // Clone the select element to remove all existing event listeners
      const newSelect = select.cloneNode(false); // Clone without children
      select.parentNode.replaceChild(newSelect, select);
      
      newSelect.innerHTML = '<option value="">Select Observation Time</option>';

      const normalizedTimes = times.map(time => time.replace(/\+00:00Z$/, 'Z').replace(/Z$/, 'Z'));
      
      // Filter for 3-hour intervals (00, 03, 06, 09, 12, 15, 18, 21 UTC)
      const filteredTimes = normalizedTimes.filter(timeStr => {
        const date = new Date(timeStr);
        if (isNaN(date)) return false;
        const hour = date.getUTCHours();
        const minutes = date.getUTCMinutes();
        const seconds = date.getUTCSeconds();
        return hour % 3 === 0 && minutes === 0 && seconds === 0;
      }).sort((a, b) => new Date(b) - new Date(a));

      console.log(`Filtered to ${filteredTimes.length} times at 3-hour intervals:`, filteredTimes);
      function formatObservationTime(isoString) {
        const date = new Date(isoString);
        
        // Format: "Oct 15, 2025 - 12:00 UTC"
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[date.getUTCMonth()];
        const day = date.getUTCDate();
        const year = date.getUTCFullYear();
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        
        return `${month} ${day}, ${year} - ${hours}:${minutes} UTC`;
      }

      // Populate dropdown with formatted labels
      filteredTimes.forEach(time => {
        const label = formatObservationTime(time);
        newSelect.add(new Option(label, time));
      });

      console.log('Filtered observation times (last 3 days):', filteredTimes);

      if (filteredTimes.length > 0) {
        newSelect.value = filteredTimes[0];
        refreshLayers(newSelect.value, level);
        updateLegendObservation(newSelect.value, level);
      } else {
        showWarning('No valid observation times available.');
        updateLegendObservation('', level);
      }

      newSelect.addEventListener('change', debounce((e) => {
        const selectedTime = e.target.value || filteredTimes[0] || '';
        refreshLayers(selectedTime, level);
        updateLegendObservation(selectedTime, level);
      }, 500));
    })
    .catch(error => {
      console.error('Error fetching observation times:', error);
      showWarning('Failed to load observation times.');
      updateLegendObservation('', level);
    })
    .finally(() => hideSpinner());
}

/**
 * Loads available pressure levels.
 */
async function loadAvailableLevels() {
  showSpinner();
  try {
    const response = await fetch(apiUrl('api/available-levels/'));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const levels = await response.json();
    console.log('Levels fetched:', levels);

    const levelSelect = document.getElementById('pressure-level');
    if (!levelSelect) {
      console.error('Dropdown element with id="pressure-level" not found!');
      return;
    }

    // Clone the select element to remove all existing event listeners
    const newLevelSelect = levelSelect.cloneNode(false);
    levelSelect.parentNode.replaceChild(newLevelSelect, levelSelect);

    // Always reset with default option
    newLevelSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Pressure Level';
    newLevelSelect.appendChild(defaultOption);

    // Populate levels
    levels.forEach(levelObj => {
      const option = document.createElement('option');
      option.value = levelObj.level;
      option.textContent = formatLevel(levelObj.level);
      newLevelSelect.appendChild(option);
    });

    if (levels.length > 0) {
      const defaultLevel = levels[0].level;
      newLevelSelect.value = defaultLevel;
      console.log(`Setting default pressure level: ${defaultLevel}`);
      loadObservationTimes(defaultLevel);
    } else {
      showWarning('No available pressure levels.');
    }

    // Listen for change
    newLevelSelect.addEventListener('change', (e) => {
      const selectedLevel = e.target.value;
      if (selectedLevel) {
        console.log(`Pressure level changed to: ${selectedLevel}`);
        loadObservationTimes(selectedLevel);
      }
    });

  } catch (error) {
    console.error('Error fetching available levels:', error);
    showWarning('Failed to load pressure levels.');
  } finally {
    hideSpinner();
  }
}


/**
 * Refreshes all map layers based on the selected observation time.
 * @param {string} observationTime - ISO 8601 timestamp.
 */
async function refreshLayers(observationTime, level = '850HPA') {
  hideWarning(); // Clear any previous warnings
  
  if (!observationTime) {
    showWarning('No observation time selected. Please select a valid time.');
    hideSpinner();
    updateLegendObservationTime('');
    return;
  }

  showSpinner();
  try {
    // Clear existing layers
    stationLayers.getLayers().clear();
    upperair_temperatureLayers.getLayers().clear();
    isobarLayers.getLayers().clear();
    isothermLayers.getLayers().clear();
    pressureCenterLayers.getLayers().clear();
    gridLayers.getLayers().clear();
    weatherReports = [];
    // Clear any drawn measurements or editable features from previous time
    try {
      clearMeasureInteractions(map);
    } catch (err) {
      console.warn('Failed to clear measure interactions:', err);
    }
    try {
      // Remove any active edit interactions (draw/modify/eraser)
      clearEditInteractions(map);
      removeIsobarModifyInteraction(map);
      clearEraserSources();
      editSource.clear();
        // Keep layer visibility as-is so user can draw immediately
    } catch (err) {
      console.warn('Failed to clear edit features or interactions:', err);
    }

    // Normalize apiBaseUrl
  // Always fetch upper-air stations
  const stationsResponse = await fetchWithRetry(apiUrl('api/upperair-stations/'));
    const stationData = await stationsResponse.json();
    const stations = Array.isArray(stationData) ? stationData : (stationData.features || []);
    if (stations.length > 0) {
      addStationsToMap(stations);
    } else {
      showWarning('No upper-air weather stations available.');
    }

    // Always fetch upper-air reports
  const reportUrl = apiUrl(`api/upperair-reports/?level=${encodeURIComponent(level)}&observation_time=${encodeURIComponent(observationTime)}`);
    console.log(`Fetching reports from: ${reportUrl}`);
    const reportsResponse = await fetchWithRetry(reportUrl);
    const reportData = await reportsResponse.json();

    weatherReports = (Array.isArray(reportData) ? reportData : (reportData.features || [])).map(report => {
      let geometry = report.geometry;
      if (typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch (err) {
          console.warn('Invalid geometry in report:', report.geometry);
          geometry = { coordinates: [85.324, 27.6172] };  // Kathmandu fallback
        }
      }

      const properties = report.properties || report;
      return {
        ...report,
        geometry,
        properties,
        temperature: properties.temperature,
        wind_speed: properties.wind_speed,
        wind_direction: properties.wind_direction,
        dew_point: properties.dew_point,
        pressure: properties.pressure,
        height: properties.height,
        observation_time: properties.observation_time
      };
    });

    if (weatherReports.length > 0) {
      synopObservation(weatherReports);
    } else {
      showWarning('No upper-air reports available for the selected time.');
    }
    
    const isobarStyleFunction = (feature) => {
      const pressure = feature.get('pressure'); // Use 'pressure' from GeoJSON properties
      return new Style({
        stroke: new Stroke({
          color: '#0000ff',
          width: 1
        }),
        text: new Text({
          text: pressure ? pressure.toString() : '', // Add 'hPa' for clarity
          font: '12px Calibri,sans-serif',
          fill: new Fill({ color: '#000' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
          placement: 'line',
          overflow: true
        })
      });
    };

    // Fetch and add isobars
  const isobarUrl = apiUrl(`api/upperair-isobars/?level=${encodeURIComponent(level)}&observation_time=${encodeURIComponent(observationTime)}`);
    console.log(`Fetching isobars from: ${isobarUrl}`);

    const isobarResponse = await fetchWithRetry(isobarUrl);
    const isobarData = await isobarResponse.json();
    console.log('Isobar data received:', isobarData); // Debug the response

    if (isobarData.features?.length > 0) {
      const isobarFeatures = new GeoJSON().readFeatures(isobarData, {
        featureProjection: 'EPSG:3857'
      });
      const isobarSource = new VectorSource({ features: isobarFeatures });
      const isobarLayer = new VectorLayer({
        title: 'Isobars',
        source: isobarSource,
        visible: false, // Set visible by default
        style: isobarStyleFunction
      });
      isobarLayers.getLayers().push(isobarLayer);

      // Make isobars editable (drag to reshape) and erasable
      addIsobarModifyInteraction(map, isobarSource);
      registerEraserSources([isobarSource]);
    } else {
      showWarning('No isobars available for the selected time. Check data or time range.');
      console.warn('No isobar features found in response:', isobarData);
    }


     // Fetch and add isotherms
  const isothermUrl = apiUrl(`api/upperair-isotherms/?level=${encodeURIComponent(level)}&observation_time=${encodeURIComponent(observationTime)}`);
    const isothermResponse = await fetchWithRetry(isothermUrl);
    const isothermData = await isothermResponse.json();
    if (isothermData.features?.length > 0) {
      const isothermFeatures = new GeoJSON().readFeatures(isothermData, {
        featureProjection: 'EPSG:3857'
      });
      const isothermSource = new VectorSource({ features: isothermFeatures });
      const isothermLayer = new VectorLayer({
        title: 'Isotherms',
        source: isothermSource,
        visible: false,
        style: new Style({
          stroke: new Stroke({
            color: 'red',
            width: 2,
            lineDash: [5, 5]
          })
        })
      });
      isothermLayers.getLayers().push(isothermLayer);
    } else {
      showWarning('No isotherms available for the selected time.');
    }


  } catch (error) {
    console.error('Error refreshing layers:', error);
    showWarning('Failed to load upper-air map data. Please try again.');
  } finally {
    hideSpinner();
  }
}


// Setup Click Handler for Popups
map.on('click', function (event) {
  console.log('Map clicked:', event.coordinate);
  console.log('Click position in lon/lat:', transform(event.coordinate, 'EPSG:3857', 'EPSG:4326')); // Debug coordinate
  popup.setPosition(undefined);
  popup.getElement().style.display = 'none';
  let popupShown = false;

  map.forEachFeatureAtPixel(event.pixel, function (feature, layer) {
    if (popupShown) return false;
    console.log('Feature clicked:', feature.getProperties(), 'Layer:', layer?.get('title'));
    if (feature.get('isStation')) {
      const props = feature.getProperties();
      const coordinates = props.coordinates;

      const report = weatherReports.find(r => {
        let reportCoords;
        try {
          const geometryObj = typeof r.geometry === 'string' ? JSON.parse(r.geometry) : r.geometry;
          reportCoords = geometryObj?.coordinates;
          if (!reportCoords) {
            console.warn('No coordinates in report:', report.geometry);
            return false;
          }
        } catch (err) {
          console.warn('Invalid geometry in report:', report.geometry, err);
          return false;
        }
        const precision = 0.001;
        return (
          reportCoords &&
          Math.abs(reportCoords[0] - coordinates[0]) < precision &&
          Math.abs(reportCoords[1] - coordinates[1]) < precision
        );
      });

      console.log('Matched report:', report);

      try {
        let content = `
          <div class="weather-popup">
            <div class="popup-header">
              <h3>${props.name || 'Unknown Station'}</h3>
              <div class="location-meta">
                <span class="country-flag">${getCountryFlag(props.country || 'Unknown')}</span>
                <span class="elevation">⛰️ ${props.elevation || 'N/A'}m</span>
              </div>
            </div>
            <div class="popup-content">
        `;
        if (report) {
          const weatherIcon = getWeatherIcon(report.weather || report.properties?.weather || 'Unknown');
          content += `
            <div class="weather-report">
              <div class="current-conditions">
                <div class="weather-icon">${weatherIcon}</div>
                <div class="temperature">${((report.properties?.temperature || report.temperature || 0)).toFixed(1)}°C</div>
              </div>
              <div class="weather-details">
                <div class="detail-row">
                  <span class="detail-label">Wind</span>
                  <span class="detail-value">
                    ${(report.properties?.wind_speed || report.wind_speed || 0).toFixed(1)} m/s 
                    <span class="wind-direction" style="transform: rotate(${(report.properties?.wind_direction || report.wind_direction || 0)}deg)">→</span>
                  </span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Dew Point</span>
                  <span class="detail-value">${((report.properties?.dew_point || report.dew_point || 0)).toFixed(1)}°C</span>
                </div>
                
              </div>
            </div>
          `;
        } else {
          content += `
            <div class="no-report">
              <div class="no-report-icon">❄️☀️🌧️</div>
              <p>No weather report available for this station</p>
            </div>
          `;
        }
        content += `
            </div>
            <div class="popup-footer">
              <small>Last updated: ${report?.observation_time ? new Date(report.observation_time).toLocaleString() : 'N/A'}</small>
            </div>
          </div>
        `;
        popup.getElement().innerHTML = content;
        popup.getElement().style.display = 'block';
        popup.setPosition(event.coordinate);
        // console.log('Popup set with content:', content, 'at position:', event.coordinate);
        popupShown = true;
      } catch (error) {
        console.error('Error rendering popup content:', error);
        showWarning('Failed to display station details.');
      }
    }
  }, { hitTolerance: 5 });
});

// Setup Toolbar Interactions
setupToolbarInteractions(map);

// Initialize Application
// Don't call loadObservationTimes() here - it will be called by loadAvailableLevels()
// after a pressure level is selected
loadAvailableLevels();
