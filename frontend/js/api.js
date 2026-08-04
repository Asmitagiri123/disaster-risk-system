// api.js — Backend integration layer
// Base URL matches backend server.js default port
const API_BASE = 'http://localhost:5000/api/v1';

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('flds_token'),
  getUser:  () => JSON.parse(localStorage.getItem('flds_user') || 'null'),
  save: (token, user) => {
    localStorage.setItem('flds_token', token);
    localStorage.setItem('flds_user', JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem('flds_token');
    localStorage.removeItem('flds_user');
  },
  isLoggedIn: () => !!localStorage.getItem('flds_token'),
};

// ─── FETCH WRAPPER ────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    Auth.clear();
    window.location.href = getLoginPath();
    return null;
  }

  return res.json();
}

function getLoginPath() {
  return window.location.pathname.includes('/pages/') ? '../login.html' : 'login.html';
}

// ─── AUTH GUARD ───────────────────────────────────────────────────────────────
function requireAuth() {
  if (!Auth.isLoggedIn()) {
    window.location.href = getLoginPath();
  }
}

// ─── AUTH API ─────────────────────────────────────────────────────────────────
async function apiLogin(email, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function apiRegister(name, email, password) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

async function apiGetMe() {
  return apiFetch('/auth/me');
}

// ─── DATA API ─────────────────────────────────────────────────────────────────
async function apiGetAlerts(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/alerts${params ? '?' + params : ''}`);
}

async function apiGetAlertStats() {
  return apiFetch('/alerts/stats');
}

async function apiGetPredictions(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiFetch(`/predictions${params ? '?' + params : ''}`);
}

async function apiGetPredictionStats() {
  return apiFetch('/predictions/stats');
}

async function apiGetSensors() {
  return apiFetch('/sensors/latest');
}

async function apiResolveAlert(id) {
  return apiFetch(`/alerts/${id}/resolve`, { method: 'PATCH' });
}
