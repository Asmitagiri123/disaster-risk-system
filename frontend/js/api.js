// api.js — Backend integration layer
const API_BASE = 'http://localhost:5000/api/v1';

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('flds_token'),
  getUser: () => {
    try { return JSON.parse(localStorage.getItem('flds_user') || 'null'); }
    catch { return null; }
  },
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

function getLoginPath() {
  return window.location.pathname.includes('/pages/') ? '../login.html' : 'login.html';
}

// ─── FETCH WRAPPER ────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // If JSON parsing fails, or text is empty, provide a more specific message
    payload = { message: text || `Server responded with status ${res.status} but no valid JSON.`, success: false };
  }

  if (res.status === 401) {
    Auth.clear();
    window.location.href = getLoginPath();
    return null;
  }

  if (!res.ok) {
    throw payload || { success: false, message: 'Request failed' };
  }

  return payload || { success: true };
}

// ─── AUTH GUARD ───────────────────────────────────────────────────────────────
function requireAuth() {
  if (!Auth.isLoggedIn()) {
    window.location.href = getLoginPath();
  }
}

async function refreshSessionUser() {
  if (!Auth.isLoggedIn()) return null;
  try {
    const res = await apiGetMe();
    if (res?.success && res.data?.user) {
      Auth.save(Auth.getToken(), res.data.user);
      return res.data.user;
    }
  } catch (err) {
    console.warn('Unable to refresh session user', err);
  }
  return null;
}

// ─── AUTH API ─────────────────────────────────────────────────────────────────
async function apiLogin(email, password, options = {}) {
  const body = { email, password, ...options };
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function apiRegister(name, email, password, phone, location, options = {}) {
  const body = { name, email, password, phone, location, ...options };
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function apiGetMe() {
  return apiFetch('/auth/me');
}

async function apiUpdateProfile(updates) {
  return apiFetch('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

async function apiChangePassword(currentPassword, newPassword) {
  return apiFetch('/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ─── DATA API ─────────────────────────────────────────────────────────────────
async function apiGetAlerts(filters = {}, extraQuery = '') {
  const params = new URLSearchParams(filters).toString();
  const qs = params ? (extraQuery ? '?' + params + '&' + extraQuery : '?' + params) : (extraQuery ? '?' + extraQuery : '');
  return apiFetch(`/alerts${qs}`);
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

async function apiGetDashboardOverview() {
  return apiFetch('/dashboard/overview');
}

window.API = {
  BASE_URL: API_BASE,
  auth: {
    login: apiLogin,
    register: apiRegister,
    me: apiGetMe,
    updateProfile: apiUpdateProfile,
    changePassword: apiChangePassword,
  },
  alerts: {
    list: apiGetAlerts,
    stats: apiGetAlertStats,
    resolve: apiResolveAlert,
  },
  predictions: {
    list: apiGetPredictions,
    stats: apiGetPredictionStats,
    modelInfo: async () => apiFetch('/predictions/models/info'),
  },
  sensors: {
    latest: apiGetSensors,
  },
  dashboard: {
    overview: apiGetDashboardOverview,
  },
  getToken: Auth.getToken,
  getUser: Auth.getUser,
  setSession: Auth.save,
  clearSession: Auth.clear,
  isLoggedIn: Auth.isLoggedIn,
};
window.Auth = Auth;
window.requireAuth = requireAuth;
window.refreshSessionUser = refreshSessionUser;
window.apiFetch = apiFetch;
window.apiLogin = apiLogin;
window.apiRegister = apiRegister;
window.apiGetMe = apiGetMe;
window.apiUpdateProfile = apiUpdateProfile;
window.apiChangePassword = apiChangePassword;
window.apiGetAlerts = apiGetAlerts;
window.apiGetAlertStats = apiGetAlertStats;
window.apiGetPredictions = apiGetPredictions;
window.apiGetPredictionStats = apiGetPredictionStats;
window.apiGetSensors = apiGetSensors;
window.apiResolveAlert = apiResolveAlert;
window.apiGetDashboardOverview = apiGetDashboardOverview;
