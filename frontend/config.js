// config.js
function ensureTrailingSlash(s) {
  if (!s) return '/';
  return s.endsWith('/') ? s : `${s}/`;
}

// Prefer runtime-provided URL. If not set, use relative base ('/') so we can:
//  - proxy to Django in dev via Vite
//  - rely on same-origin in production behind a reverse proxy
const runtimeApi = (typeof window !== 'undefined' && window._env_ && window._env_.API_BASE_URL) ? window._env_.API_BASE_URL : '';
const apiBaseUrl = ensureTrailingSlash(runtimeApi);

export const config = {
  apiBaseUrl,
  // Use relative path by default to leverage Vite's proxy in dev
  geoserverUrl: (typeof window !== 'undefined' && window._env_ && window._env_.GEOSERVER_URL)
    ? window._env_.GEOSERVER_URL
    : '/geoserver/NepalAdmin/wms'
};

export function apiUrl(path = '') {
  const base = config.apiBaseUrl || '/';
  // trim and join safely
  const left = base.endsWith('/') ? base.slice(0, -1) : base;
  const right = path.startsWith('/') ? path : `/${path}`;
  return `${left}${right}`;
}

// export const extentLatLon = [35, 0, 115, 45];
export const extentLatLon = [50, 0, 100, 40];
