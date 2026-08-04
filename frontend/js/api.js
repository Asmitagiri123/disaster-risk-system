// Backend API client (same origin in production, localhost:5000 as a static file)

const API = (() => {
  const TOKEN_KEY = 'flds_token';
  const USER_KEY = 'flds_user';

  // Same-origin by default (frontend is served by Express); fallback for static dev
  const BASE_URL = (window.location.protocol === 'file:')
    ? 'http://localhost:5000/api/v1'
    : '/api/v1';

  let _token = localStorage.getItem(TOKEN_KEY) || '';
  let _user = null;
  try { _user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { _user = null; }

  const getToken = () => _token;
  const getUser = () => _user;

  function setSession(token, user) {
    _token = token || '';
    _user = user || null;
    if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY);
  }

  function clearSession() {
    _token = '';
    _user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;

    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Network failure — backend unreachable
      const error = new Error('Backend unreachable. Showing offline demo data.');
      error.offline = true;
      throw error;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.message || data.error || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  const get = (p) => request('GET', p);
  const post = (p, b) => request('POST', p, b);
  const put = (p, b) => request('PUT', p, b);
  const patch = (p, b) => request('PATCH', p, b);

  return {
    BASE_URL,
    getToken,
    getUser,
    setSession,
    clearSession,

    auth: {
      register: (body) => post('/auth/register', body),
      login: (body) => post('/auth/login', body),
      me: () => get('/auth/me'),
      updateProfile: (body) => put('/auth/profile', body),
    },

    dashboard: {
      overview: () => get('/dashboard/overview'),
    },

    alerts: {
      list: (params = '') => get(`/alerts${params}`),
      get: (id) => get(`/alerts/${id}`),
      stats: () => get('/alerts/stats'),
      resolve: (id) => patch(`/alerts/${id}/resolve`),
      confirm: (id, status, note = '') => patch(`/alerts/${id}/confirm`, { status, note }),
    },

    predictions: {
      list: (params = '') => get(`/predictions${params}`),
      stats: () => get('/predictions/stats'),
      create: (body) => post('/predictions', body),
      modelInfo: () => get('/predictions/models/info'),
    },

    sensors: {
      list: (params = '') => get(`/sensors/data${params}`),
      latest: () => get('/sensors/latest'),
      ingest: (body) => post('/sensors/data', body),
    },
  };
})();
