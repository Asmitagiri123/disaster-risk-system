// Loads backend data into the shapes the render functions expect.
// Pages call loadLive*() then re-render.

const LIVE = {
  stats: null,
  alerts: [],
  predictions: [],
  sensors: [],
  timeline: [],
  disasterTypes: [],
  weeklyTrend: [],
  riskTrend: null,
  sensorRadar: null,
  mapMarkers: [],
};

// ── Alert location scope ──
// The logged-in user's district/province (from the profile) is the default
// scope for alert views. A browse-only "show all" override lives in localStorage.

function locationScope() {
  const u = API.getUser() || {};
  const district = (u.district || '').trim();
  const province = (u.province || '').trim();
  if (district) return { district, province };
  if (province) return { province };
  return null;
}

function effectiveScope() {
  // Browse-only "show all" override — resets when the tab/session closes.
  if (sessionStorage.getItem('flds_scope_off') === '1') return null;
  return locationScope();
}

// Query params that scope alert fetches to the user's location.
function scopeParams() {
  const s = effectiveScope();
  if (!s) return '';
  return s.district
    ? `&district=${encodeURIComponent(s.district)}`
    : `&province=${encodeURIComponent(s.province)}`;
}

function scopeLabel() {
  const s = locationScope();
  if (!s) return null;
  return s.district ? `${s.province} · ${s.district}` : `${s.province} Province`;
}

function setScopeOverride(off) {
  if (off) sessionStorage.setItem('flds_scope_off', '1');
  else sessionStorage.removeItem('flds_scope_off');
}

const SEVERITY_DISPLAY = { critical: 'critical', high: 'high', moderate: 'medium', low: 'low' };
const TYPE_DISPLAY = { flood: 'Flood', landslide: 'Landslide', earthquake: 'Earthquake' };
const TYPE_ICON = { Flood: '🌊', Landslide: '⛰️', Earthquake: '🏚️' };
const TYPE_COLOR = { Flood: '#3b82f6', Landslide: '#8b5cf6', Earthquake: '#f97316' };
const SENSOR_ICONS = {
  seismic: '📳', hydrological: '🌊', meteorological: '🌦️', geotechnical: '⛰️',
};

function timeAgo(iso) {
  if (!iso) return '—';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

// Cap the displayed probability to its risk band (mirrors the backend), so a
// moderate alert never reads as "100%". Accepts both API and display severity.
const RISK_PROBABILITY_CAPS = { high: 0.95, moderate: 0.70, medium: 0.70, low: 0.40 };
function displayProbability(prob, riskLevel) {
  const raw = Number(prob);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const cap = RISK_PROBABILITY_CAPS[String(riskLevel || '').toLowerCase()];
  if (cap === undefined) return Math.min(95, Math.round(raw * 100));
  return Math.round(Math.min(raw, cap) * 100);
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Rainfall-rule cross-check from the prediction. Agreeing alerts get the
// "cross-verified" badge.
function alertVerification(a) {
  const pred = (a && a.predictionId) || {};
  const v = pred.verification || (a && a.verification) || null;
  if (!v || !v.method) return null;
  return {
    method: v.method,
    ruleAgreed: !!v.ruleAgreed,
    ruleRiskLevel: v.ruleRiskLevel || null,
    modelRiskLevel: v.modelRiskLevel || null,
    checkedAt: v.checkedAt || null,
  };
}

// The alert's prediction inputData, shown as "live evidence" on cards,
// modals and map popups.
function buildAlertEvidence(a) {
  const pred = (a && a.predictionId) || {};
  const input = pred.inputData || {};
  const hasValues = Object.values(input).some(v => v !== undefined && v !== null);
  if (!hasValues) return null;

  // Input keys may be snake_case (ML service) or camelCase (app) — accept both
  const pick = (...keys) => {
    for (const k of keys) {
      const v = input[k];
      if (v !== undefined && v !== null) return v;
    }
    return null;
  };
  const fmt = (v, suffix, digits = 1) =>
    (v === null || v === undefined) ? null : `${Number(v).toFixed(digits)}${suffix}`;
  const hum = pick('humidity');
  const soil = pick('soilMoisture', 'soil_moisture');

  return {
    rainfall: fmt(pick('rainfall'), ' mm'),
    humidity: hum === null ? null : `${Math.round(hum)}%`,
    temperature: fmt(pick('temperature'), '°C'),
    riverFlow: fmt(pick('riverFlow', 'discharge'), ' m³/s'),
    windSpeed: fmt(pick('windSpeed', 'wind_speed'), ' km/h'),
    soilMoisture: soil === null ? null : `${Math.round(soil)}%`,
    modelVersion: pred.modelVersion || '1.0.0',
    source: pred.predictedBy || 'external',
  };
}

// One-line evidence summary (numbers only, safe for innerHTML).
function evidenceChips(ev) {
  if (!ev) return '';
  const parts = [
    ev.rainfall && `🌧 Rainfall ${ev.rainfall}`,
    ev.humidity && `💧 Humidity ${ev.humidity}`,
    ev.temperature && `🌡 Temp ${ev.temperature}`,
    ev.windSpeed && `💨 Wind ${ev.windSpeed}`,
    ev.soilMoisture && `🪨 Soil ${ev.soilMoisture}`,
    ev.riverFlow && `🏞 Flow ${ev.riverFlow}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

const EVIDENCE_SOURCE_LABEL = { external: 'Open-Meteo live weather feed', manual: 'Manual evaluation', sensor: 'Live IoT sensor' };

// Dashboard chart aggregations, computed from backend data.

// Alerts raised vs resolved per day, last 7 days.
function buildWeeklyTrend(activeAlerts, resolvedAlerts) {
  const days = [];
  const labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    days.push({ y: d.getFullYear(), m: d.getMonth(), day: d.getDate() });
  }
  const bucketIndex = iso => {
    const d = new Date(iso);
    return days.findIndex(x => x.y === d.getFullYear() && x.m === d.getMonth() && x.day === d.getDate());
  };
  const raised = new Array(7).fill(0);
  const resolved = new Array(7).fill(0);
  activeAlerts.forEach(a => { const i = bucketIndex(a.createdAt); if (i >= 0) raised[i] += 1; });
  resolvedAlerts.forEach(a => { const i = bucketIndex(a.resolvedAt || a.createdAt); if (i >= 0) resolved[i] += 1; });
  return labels.map((day, i) => ({ day, alerts: raised[i], resolved: resolved[i] }));
}

// Hourly max probability over the last 24h, from saved predictions.
function buildRiskTrend(predictions) {
  const HOUR = 3600000;
  const now = Date.now();
  const data = new Array(24).fill(null);
  predictions.forEach(p => {
    const t = (p._raw && p._raw.createdAt) ? new Date(p._raw.createdAt).getTime() : now;
    const hoursAgo = (now - t) / HOUR;
    if (hoursAgo < 0 || hoursAgo > 24) return;
    const idx = 23 - Math.floor(hoursAgo);
    if (idx >= 0 && idx < 24) data[idx] = Math.max(data[idx] ?? 0, p.probability);
  });
  const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  return { labels, data };
}

// Sensor radar "vs threshold" — latest reading scaled against each metric's
// alert threshold (so rainfall 150mm, humidity 95%, etc. all map to ~100%).
const SENSOR_RADAR_META = {
  rainfall: { label: 'Rainfall', threshold: 150 },
  humidity: { label: 'Humidity', threshold: 95 },
  temperature: { label: 'Temp', threshold: 35 },
  riverFlow: { label: 'River Flow', threshold: 1500 },
  windSpeed: { label: 'Wind', threshold: 60 },
  soilMoisture: { label: 'Soil Moisture', threshold: 60 },
};

function buildSensorRadar(latest) {
  const readings = (latest && latest.readings) || {};
  const labels = [];
  const values = [];
  Object.entries(SENSOR_RADAR_META).forEach(([key, meta]) => {
    const v = readings[key];
    if (v === undefined || v === null) return;
    labels.push(meta.label);
    values.push(Math.min(100, Math.round((v / meta.threshold) * 100)));
  });
  return labels.length ? { labels, values } : null;
}

// Dashboard
async function loadLiveDashboard() {
  const overview = await API.dashboard.overview();
  const s = overview.data || {};
  const summary = s.summary || {};

  LIVE.stats = {
    activeAlerts: summary.activeAlerts ?? 0,
    criticalZones: summary.criticalZones ?? 0, // server-side counts (no undercount)
    monitored: 77,
    accuracy: null,
    responseTime: null,
    resolved24h: summary.resolved24h ?? 0,
    rainfallPeak: null,
    soilSaturation: null,
  };

  // Model accuracy from the ML service training metadata
  try {
    const info = await API.predictions.modelInfo();
    const models = info.data && info.data.training && info.data.training.models;
    const accs = Object.values(models || {}).map(m => m.metrics && m.metrics.accuracy).filter(Number.isFinite);
    if (accs.length) {
      LIVE.stats.accuracy = Math.round(accs.reduce((a, b) => a + b, 0) / accs.length * 1000) / 10;
      LIVE.stats.modelVersion = (info.data.training && info.data.training.version) || null;
    }
  } catch (err) {
    // ML service unreachable — accuracy stays "—"
  }

  LIVE.predictions = (s.recentPredictions || []).map(p => ({
    type: TYPE_DISPLAY[p.disasterType] || p.disasterType,
    icon: TYPE_ICON[TYPE_DISPLAY[p.disasterType]] || '📊',
    location: (p.location && (p.location.city || p.location.address)) || 'Nepal',
    probability: displayProbability(p.probability, p.riskLevel),
    riskLevel: p.riskLevel,
    trend: 'stable',
    color: TYPE_COLOR[TYPE_DISPLAY[p.disasterType]] || '#94a3b8',
    _raw: p,
  }));

  const recentSensors = s.recentSensors || [];
  LIVE.sensors = recentSensors.slice(0, 9).map(sd => {
    const readings = sd.readings || {};
    const firstKey = Object.keys(readings)[0];
    return {
      name: capitalize((sd.sensorType || firstKey || 'sensor').replace('_', ' ')),
      icon: SENSOR_ICONS[sd.sensorType] || '📡',
      value: firstKey ? `${readings[firstKey]}` : sd.sensorId,
      status: 'active',
    };
  });
  LIVE.sensorRadar = buildSensorRadar(recentSensors[0]);

  // Sensor count from the backend (one weather feed per district)
  try {
    const latest = await API.sensors.latest();
    LIVE.sensorsTotal = (latest.count) || LIVE.sensors.length;
  } catch (err) {
    LIVE.sensorsTotal = LIVE.sensors.length;
  }

  const [activeRes, resolvedRes] = await Promise.allSettled([
    API.alerts.list('?active=true' + scopeParams()),
    // Recent resolved window only; the full set would be huge on each refresh.
    API.alerts.list('?active=false&limit=500' + scopeParams()),
  ]);
  const activeAlerts = (activeRes.status === 'fulfilled' && activeRes.value.data.alerts) || [];
  const resolvedAlerts = (resolvedRes.status === 'fulfilled' && resolvedRes.value.data.alerts) || [];

  LIVE.stats.rainfallPeak = activeAlerts.reduce((max, a) => {
    const rain = a.predictionId && a.predictionId.inputData && a.predictionId.inputData.rainfall;
    return typeof rain === 'number' ? Math.max(max, rain) : max;
  }, 0) || null;

  // Avg soil moisture from the latest sensor readings
  const soilVals = recentSensors.map(sd => sd.readings && sd.readings.soilMoisture).filter(v => Number.isFinite(v));
  if (soilVals.length) {
    LIVE.stats.soilSaturation = Math.round(soilVals.reduce((a, b) => a + b, 0) / soilVals.length);
  }

  LIVE.weeklyTrend = buildWeeklyTrend(activeAlerts, resolvedAlerts);
  LIVE.riskTrend = buildRiskTrend(LIVE.predictions);

  // Live activity feed: raised + resolved events, newest first.
  const raised = activeAlerts.slice(0, 6).map(a => ({
    at: new Date(a.createdAt).getTime(),
    time: timeAgo(a.createdAt),
    title: `🚨 ${capitalize(a.disasterType)} alert raised — ${(a.location && a.location.city) || 'Nepal'}`,
    desc: `${a.riskLevel} risk ${a.disasterType} — ${displayProbability(a.probability, a.riskLevel)}% model probability`,
    type: a.riskLevel === 'critical' || a.riskLevel === 'high' ? 'critical' : 'warning',
  }));
  const resolved = resolvedAlerts.slice(0, 5).map(a => ({
    at: new Date(a.resolvedAt || a.createdAt).getTime(),
    time: timeAgo(a.resolvedAt || a.createdAt),
    title: `✅ ${capitalize(a.disasterType)} alert resolved — ${(a.location && a.location.city) || 'Nepal'}`,
    desc: 'Conditions no longer warrant an active alert.',
    type: 'resolved',
  }));
  LIVE.timeline = [...raised, ...resolved].sort((x, y) => y.at - x.at).slice(0, 8);
}

// Alerts (scoped to the user's location by default)
async function loadLiveAlerts() {
  const res = await API.alerts.list('?active=true' + scopeParams());
  const items = (res.data && res.data.alerts) || [];
  LIVE.alerts = items.map(a => {
    const location = (a.location && (a.location.city || a.location.address)) || 'Nepal';
    const evidence = buildAlertEvidence(a);
    const prob = displayProbability(a.probability, a.riskLevel);
    const verification = alertVerification(a);
    const gt = a.groundTruth || {}; // field report: pending/confirmed/not-confirmed
    return {
      id: a._id,
      type: TYPE_DISPLAY[a.disasterType] || a.disasterType,
      severity: SEVERITY_DISPLAY[a.riskLevel] || a.riskLevel,
      riskLevel: a.riskLevel,
      location,
      province: nepalProvinceOf(location),
      magnitude: `Prob ${prob}%`,
      // Built from parts so legacy records can't show a contradictory "100%".
      desc: `${a.riskLevel} risk ${a.disasterType} near ${location} — ${prob}% model probability`,
      time: timeAgo(a.createdAt),
      coords: a.location && a.location.coordinates ? [a.location.coordinates[1], a.location.coordinates[0]] : [28.1, 84.0],
      evidence,
      evidenceChips: evidenceChips(evidence),
      verification,
      crossVerified: !!(verification && verification.ruleAgreed),
      groundTruth: {
        status: gt.status || 'pending',
        by: gt.by || null,
        at: gt.at || null,
        note: gt.note || '',
      },
      _raw: a,
    };
  });
  LIVE.mapMarkers = LIVE.alerts.map(a => ({
    coords: a.coords,
    type: a.type.toLowerCase(),
    severity: a.severity,
    province: a.province,
    district: a.location,
    evidence: a.evidenceChips,
    label: escapeHtml(`${a.type} — ${a.location}${a.province ? ` · ${a.province}` : ''} (${a.magnitude})`),
  }));
  // Keep header + sidebar badges in sync with the count
  document.querySelectorAll('.notif-badge').forEach(b => { b.textContent = items.length; b.style.display = items.length ? '' : 'none'; });
  document.querySelectorAll('.nav-badge').forEach(b => { b.textContent = items.length; });

  // Reflect the scope on this page (banner + header chip)
  LIVE.scope = effectiveScope();
  LIVE.scopeLabel = scopeLabel();
  renderScopeUI();
  return LIVE.alerts;
}

// Scope banner + header chip. Safe to call on any page; missing elements are
// simply skipped.
function renderScopeUI() {
  const override = sessionStorage.getItem('flds_scope_off') === '1';
  const scoped = !!LIVE.scope && !override;

  // Header chip shows the saved profile location (not the temporary override)
  const chip = document.getElementById('location-chip');
  if (chip) {
    const label = scopeLabel() || 'All Nepal';
    chip.innerHTML = `📍 ${label}`;
    chip.title = 'Click to change your alert location';
  }

  const banner = document.getElementById('scope-banner');
  if (banner) {
    if (scoped) {
      const loc = escapeHtml(scopeLabel());
      banner.style.display = '';
      banner.innerHTML = `
        📍 <strong>Showing alerts for ${loc}</strong>
        <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px;" onclick="window.showAllNepal()">Show All Nepal</button>
      `;
    } else {
      banner.style.display = 'none';
    }
  }

  const sub = document.getElementById('page-header-sub');
  if (sub && scoped) sub.textContent = `Real-time monitoring — scoped to ${scopeLabel()}`;
}

// Browse-only reset: view nationwide without touching the saved profile scope.
window.showAllNepal = function () {
  setScopeOverride(true);
  window.location.reload();
};

// True when a location is inside the current scope (used by the SSE feed to
// skip alerts that don't concern the logged-in user's location). Matches on
// district tokens so free-form locations like "Koshi River, Sunsari" still hit
// a Sunsari scope.
function alertInScope(loc) {
  const scope = (window.LIVE && LIVE.scope) || null;
  if (!scope || !loc) return true;
  const tokens = String(loc).toLowerCase()
    .split(/[,;|/–—-]+/)
    .map(t => t.replace(/\s+district$/, '').trim())
    .filter(Boolean);
  if (scope.district) {
    const d = scope.district.toLowerCase();
    return tokens.some(t => t === d || t.startsWith(d + ' '));
  }
  if (scope.province) {
    const p = (typeof nepalProvinceOf === 'function') ? nepalProvinceOf(loc) : null;
    return !p || p.toLowerCase() === scope.province.toLowerCase();
  }
  return true;
}

window.locationScope = locationScope;
window.effectiveScope = effectiveScope;
window.scopeParams = scopeParams;
window.scopeLabel = scopeLabel;
window.setScopeOverride = setScopeOverride;
window.renderScopeUI = renderScopeUI;
window.alertInScope = alertInScope;

// Predictions
async function loadLivePredictions() {
  const res = await API.predictions.list('?limit=20');
  const items = (res.data && res.data.predictions) || [];
  LIVE.predictions = items.map(p => ({
    type: TYPE_DISPLAY[p.disasterType] || p.disasterType,
    icon: TYPE_ICON[TYPE_DISPLAY[p.disasterType]] || '📊',
    location: (p.location && (p.location.city || p.location.address)) || 'Nepal',
    probability: displayProbability(p.probability, p.riskLevel),
    riskLevel: p.riskLevel,
    trend: 'stable',
    color: TYPE_COLOR[TYPE_DISPLAY[p.disasterType]] || '#94a3b8',
    _raw: p,
  }));
  return LIVE.predictions;
}

// Prediction stats
async function loadLiveDisasterTypes() {
  try {
    const stats = await API.predictions.stats();
    const byType = (stats.data && stats.data.byType) || [];
    const total = byType.reduce((sum, t) => sum + (t.count || 0), 0) || 1;
    LIVE.disasterTypes = byType.map(t => ({
      label: TYPE_DISPLAY[t._id] || t._id,
      value: Math.round(((t.count || 0) / total) * 100),
      color: TYPE_COLOR[TYPE_DISPLAY[t._id]] || '#94a3b8',
    }));
  } catch (err) {
    // Stats is admin/responder-only — fall back to loaded predictions
    const counts = {};
    LIVE.predictions.forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });
    const total = LIVE.predictions.length || 1;
    LIVE.disasterTypes = Object.entries(counts).map(([label, count]) => ({
      label, value: Math.round((count / total) * 100), color: TYPE_COLOR[label] || '#94a3b8',
    }));
  }
}

// Reports
async function loadLiveReports() {
  // The alerts list endpoint defaults to active-only, so totals come from the
  // stats endpoint while the active + resolved lists feed trends and tables.
  const [activeRes, resolvedRes, predsRes, statsRes] = await Promise.allSettled([
    API.alerts.list('?active=true&limit=2000'),
    API.alerts.list('?active=false&limit=2000'),
    API.predictions.list('?limit=200'),
    API.alerts.stats(),
  ]);
  const activeAlerts = (activeRes.status === 'fulfilled' && activeRes.value.data.alerts) || [];
  const resolvedAlerts = (resolvedRes.status === 'fulfilled' && resolvedRes.value.data.alerts) || [];
  const preds = (predsRes.status === 'fulfilled' && predsRes.value.data.predictions) || [];
  const stats = (statsRes.status === 'fulfilled' && statsRes.value.data) || null;

  // Active + resolved together for the 12-month trend and table.
  const alerts = [...activeAlerts, ...resolvedAlerts];

  const now = Date.now();
  const monthAgo = now - 30 * 24 * 3600000;
  const recentAlerts = alerts.filter(a => new Date(a.createdAt).getTime() >= monthAgo);
  const resolvedCount = stats
    ? Math.max(0, (stats.total || 0) - (stats.active || 0))
    : alerts.filter(a => !a.isActive).length;

  LIVE.reports = {
    totalAlerts: stats ? (stats.total || alerts.length) : alerts.length,
    totalPredictions: preds.length,
    resolved: resolvedCount,
    resolved30d: recentAlerts.filter(a => !a.isActive).length,
    resolutionRate: stats && stats.total ? Math.round((resolvedCount / stats.total) * 100) : 0,
    recent30d: recentAlerts.length,
    peopleAffected: alerts.reduce((sum, a) => sum + (a.affectedRadius || 0), 0),
  };

  // Alerts per month, last 12 months (flood vs landslide)
  const months = [];
  const monthLabels = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    monthLabels.push(d.toLocaleDateString('en-US', { month: 'short' }));
    months.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  const flood = new Array(12).fill(0);
  const landslide = new Array(12).fill(0);
  alerts.forEach(a => {
    const d = new Date(a.createdAt);
    const idx = months.findIndex(x => x.y === d.getFullYear() && x.m === d.getMonth());
    if (idx >= 0) {
      if (a.disasterType === 'flood') flood[idx] += 1;
      else if (a.disasterType === 'landslide') landslide[idx] += 1;
    }
  });
  LIVE.monthlyTrend = { labels: monthLabels, flood, landslide };

  // Table rows from real alerts, plus one summary row for predictions
  LIVE.reportsRows = [
    ...recentAlerts.slice(0, 6).map(a => {
      const city = escapeHtml((a.location && (a.location.city || a.location.address)) || 'Nepal');
      const province = nepalProvinceOf(city);
      return {
        name: `${capitalize(a.disasterType)} alert — ${city}`,
        type: TYPE_DISPLAY[a.disasterType] || a.disasterType,
        district: province ? `${city} (${province})` : city,
        province,
        count: 1,
        date: new Date(a.createdAt).toISOString().slice(0, 10),
        size: '—',
      };
    }),
    {
      name: 'All-time prediction summary',
      type: 'Summary',
      district: 'All Nepal',
      province: null,
      count: preds.length,
      date: new Date(now).toISOString().slice(0, 10),
      size: '—',
    },
  ];

  LIVE.reportTypeColors = { Flood: 'badge-info', Landslide: 'badge-medium', Earthquake: 'badge-critical', Summary: 'badge-high' };
}

// Ground-truth counts (single /alerts/stats call), shared by both pages.
async function loadLiveGroundTruth() {
  try {
    const stats = await API.alerts.stats();
    LIVE.groundTruth = (stats.data && stats.data.groundTruth) || null;
  } catch (err) {
    LIVE.groundTruth = null;
  }
  return LIVE.groundTruth;
}

// Resolve an alert via the API and drop it from the local list
async function resolveLiveAlert(id) {
  await API.alerts.resolve(id);
  LIVE.alerts = LIVE.alerts.filter(a => String(a._raw && a._raw._id) !== String(id));
}

window.LIVE = LIVE;
window.displayProbability = displayProbability;
window.loadLiveDashboard = loadLiveDashboard;
window.loadLiveAlerts = loadLiveAlerts;
window.loadLivePredictions = loadLivePredictions;
window.loadLiveDisasterTypes = loadLiveDisasterTypes;
window.loadLiveReports = loadLiveReports;
window.loadLiveGroundTruth = loadLiveGroundTruth;
window.resolveLiveAlert = resolveLiveAlert;
window.buildAlertEvidence = buildAlertEvidence;
window.evidenceChips = evidenceChips;
window.alertVerification = alertVerification;
window.EVIDENCE_SOURCE_LABEL = EVIDENCE_SOURCE_LABEL;
