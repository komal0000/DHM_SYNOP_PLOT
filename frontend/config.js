// config.js
export const config = {
  apiBaseUrl: window._env_?.API_BASE_URL?.endsWith('/') 
    ? window._env_.API_BASE_URL 
    : (window._env_?.API_BASE_URL || 'http://127.0.0.1:8001/') + '/',
  geoserverUrl: window._env_?.GEOSERVER_URL?.endsWith('/') 
    ? window._env_.GEOSERVER_URL 
    : (window._env_?.GEOSERVER_URL || 'http://localhost:8080/geoserver/NepalAdmin/wms') + '/'
};

// export const extentLatLon = [35, 0, 115, 45];
export const extentLatLon = [50, 0, 100, 40];
