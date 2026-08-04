// mock-data.js — Live data from backend API
// Shape kept identical so all render functions work unchanged.

const MOCK = {
  stats: { activeAlerts: 0, highRiskZones: 0, monitored: 77, accuracy: 0, responseTime: '—', resolved24h: 0 },
  alerts: [], predictions: [], sensors: [], timeline: [], disasterTypes: [], weeklyTrend: [], mapMarkers: []
};

// ─── MAPPERS ──────────────────────────────────────────────────────────────────

function mapAlert(a) {
  const coords = a.location?.coordinates ? [a.location.coordinates[1], a.location.coordinates[0]] : [28.0, 84.0];
  return {
    id: a._id,
    type: a.disasterType === 'flood' ? 'Flood' : 'Landslide',
    severity: a.riskLevel || 'low',
    location: a.location?.address || a.location?.city || 'Nepal',
    magnitude: a.magnitude || '—',
    time: timeAgo(a.createdAt),
    coords,
  };
}

function mapPrediction(p) {
  const isFlood = p.disasterType === 'flood';
  return {
    type: isFlood ? 'Flood' : 'Landslide',
    icon: isFlood ? '🌊' : '⛰️',
    location: p.location?.address || p.location?.city || 'Nepal',
    probability: Math.round((p.probability || 0) * 100),
    trend: 'stable',
    color: isFlood ? '#3b82f6' : '#8b5cf6',
  };
}

function mapSensor(s) {
  const r = s.readings || {};
  const val = r.rainfall ?? r.riverLevel ?? r.soilMoisture ?? r.value ?? '—';
  const unit = r.rainfall !== undefined ? ' mm' : r.riverLevel !== undefined ? ' m' : '';
  return {
    name: s.sensorType || s.sensorId || 'Sensor',
    icon: s.disasterType === 'flood' ? '🌊' : '📡',
    value: `${val}${unit}`,
    status: s.status || 'active',
  };
}

function mapMarker(a) {
  const coords = a.location?.coordinates ? [a.location.coordinates[1], a.location.coordinates[0]] : null;
  if (!coords) return null;
  return {
    coords,
    type: a.disasterType || 'flood',
    severity: a.riskLevel || 'low',
    label: `${a.disasterType === 'flood' ? 'Flood' : 'Landslide'} — ${a.location?.address || a.location?.city || 'Nepal'}`,
  };
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff} min ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

// ─── LOAD DATA ────────────────────────────────────────────────────────────────

async function loadDashboardData() {
  try {
    const [alertsRes, predictionsRes, sensorsRes, statsRes] = await Promise.allSettled([
      apiGetAlerts({ limit: 20 }),
      apiGetPredictions({ limit: 6 }),
      apiGetSensors(),
      apiGetAlertStats(),
    ]);

    // Alerts
    if (alertsRes.status === 'fulfilled' && alertsRes.value?.success) {
      const alerts = alertsRes.value.data.alerts || [];
      MOCK.alerts = alerts.map(mapAlert);
      MOCK.mapMarkers = alerts.map(mapMarker).filter(Boolean);
      MOCK.stats.activeAlerts = alertsRes.value.count || alerts.length;
      MOCK.stats.highRiskZones = alerts.filter(a => a.riskLevel === 'high').length;

      // Timeline from alerts
      MOCK.timeline = alerts.slice(0, 6).map(a => ({
        time: new Date(a.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        title: `${a.disasterType === 'flood' ? 'Flood' : 'Landslide'} — ${a.location?.address || a.location?.city || 'Nepal'}`,
        desc: a.description || `${a.riskLevel} risk level. Monitoring active.`,
        type: a.riskLevel === 'high' ? 'warning' : a.isActive ? 'warning' : 'resolved',
      }));

      // Disaster type distribution
      const floodCount = alerts.filter(a => a.disasterType === 'flood').length;
      const landCount = alerts.filter(a => a.disasterType === 'landslide').length;
      const total = floodCount + landCount || 1;
      MOCK.disasterTypes = [
        { label: 'Flood',     value: Math.round(floodCount / total * 100), color: '#3b82f6' },
        { label: 'Landslide', value: Math.round(landCount  / total * 100), color: '#8b5cf6' },
      ];
    }

    // Predictions
    if (predictionsRes.status === 'fulfilled' && predictionsRes.value?.success) {
      const preds = predictionsRes.value.data?.predictions || predictionsRes.value.data || [];
      MOCK.predictions = preds.map(mapPrediction);
    }

    // Sensors
    if (sensorsRes.status === 'fulfilled' && sensorsRes.value?.success) {
      MOCK.sensors = (sensorsRes.value.data?.sensors || []).slice(0, 9).map(mapSensor);
    }

    // Stats
    if (statsRes.status === 'fulfilled' && statsRes.value?.success) {
      MOCK.stats.resolved24h = statsRes.value.data?.resolved24h || 0;
    }

  } catch (err) {
    console.warn('API load failed, using fallback data:', err.message);
    loadFallback();
  }
}

// ─── FALLBACK (shown if backend is unreachable) ───────────────────────────────

function loadFallback() {
  MOCK.stats = { activeAlerts: 9, highRiskZones: 4, monitored: 77, accuracy: 91.8, responseTime: '3.6m', resolved24h: 5 };
  MOCK.alerts = [
    { id: 1, type: 'Flood',     severity: 'high',   location: 'Koshi River, Sunsari',    magnitude: 'Level 4', time: '8 min ago',  coords: [26.68, 87.17] },
    { id: 2, type: 'Landslide', severity: 'high',   location: 'Sindhupalchok District',  magnitude: 'Major',   time: '22 min ago', coords: [27.95, 85.68] },
    { id: 3, type: 'Flood',     severity: 'high',   location: 'Rapti River, Dang',       magnitude: 'Level 3', time: '1h ago',     coords: [28.05, 82.30] },
    { id: 4, type: 'Landslide', severity: 'high',   location: 'Myagdi District',         magnitude: 'Risk 3',  time: '2h ago',     coords: [28.35, 83.57] },
    { id: 5, type: 'Flood',     severity: 'high',   location: 'Bagmati River, Sarlahi',  magnitude: 'Level 3', time: '2h ago',     coords: [27.00, 85.58] },
    { id: 6, type: 'Landslide', severity: 'medium', location: 'Kaski District',          magnitude: 'Risk 2',  time: '3h ago',     coords: [28.21, 83.98] },
    { id: 7, type: 'Flood',     severity: 'medium', location: 'Narayani River, Chitwan', magnitude: 'Level 2', time: '4h ago',     coords: [27.53, 84.35] },
    { id: 8, type: 'Landslide', severity: 'low',    location: 'Dolakha District',        magnitude: 'Watch',   time: '5h ago',     coords: [27.67, 86.08] },
    { id: 9, type: 'Flood',     severity: 'low',    location: 'Karnali River, Surkhet',  magnitude: 'Level 1', time: '6h ago',     coords: [28.60, 81.62] },
  ];
  MOCK.predictions = [
    { type: 'Flood',     icon: '🌊', location: 'Koshi Basin, Province 1',      probability: 84, trend: 'up',     color: '#3b82f6' },
    { type: 'Landslide', icon: '⛰️', location: 'Sindhupalchok, Bagmati Zone',  probability: 79, trend: 'up',     color: '#8b5cf6' },
    { type: 'Flood',     icon: '🌊', location: 'Rapti Basin, Lumbini Province', probability: 71, trend: 'stable', color: '#3b82f6' },
    { type: 'Landslide', icon: '⛰️', location: 'Myagdi, Gandaki Province',     probability: 65, trend: 'up',     color: '#8b5cf6' },
    { type: 'Flood',     icon: '🌊', location: 'Bagmati Basin, Madhesh',        probability: 58, trend: 'stable', color: '#3b82f6' },
    { type: 'Landslide', icon: '⛰️', location: 'Dolakha, Bagmati Province',    probability: 42, trend: 'down',   color: '#8b5cf6' },
  ];
  MOCK.sensors = [
    { name: 'Rainfall',    icon: '🌧️', value: '187 mm',    status: 'warning' },
    { name: 'River Level', icon: '🌊', value: '+3.2 m',    status: 'warning' },
    { name: 'Soil Moist.', icon: '🌱', value: 'Sat.',      status: 'warning' },
    { name: 'Flow Rate',   icon: '💧', value: '1840 m³/s', status: 'active'  },
    { name: 'Humidity',    icon: '💦', value: '94%',       status: 'active'  },
    { name: 'Wind Speed',  icon: '💨', value: '42 km/h',   status: 'active'  },
    { name: 'Temperature', icon: '🌡️', value: '24.1°C',   status: 'active'  },
    { name: 'Slope Stab.', icon: '📐', value: 'Unstable',  status: 'offline' },
    { name: 'Sediment',    icon: '🪨', value: 'High',      status: 'warning' },
  ];
  MOCK.timeline = [
    { time: '14:52', title: 'Koshi River flood Level 4',        desc: 'Sunsari — Embankment breach risk.',          type: 'warning'  },
    { time: '14:30', title: 'Major landslide — Sindhupalchok',  desc: 'Road blockage on Araniko Highway.',          type: 'warning'  },
    { time: '13:45', title: 'Rapti River flood warning',        desc: 'Dang district — Level 3 alert.',             type: 'warning'  },
    { time: '12:20', title: 'Landslide risk elevated — Myagdi', desc: 'Continuous rainfall >150mm.',                type: 'warning'  },
    { time: '11:00', title: 'Bagmati flood watch cleared',      desc: 'Lalitpur — River receding.',                 type: 'resolved' },
    { time: '09:30', title: 'Kaski landslide watch issued',     desc: 'Pokhara outskirts — Soil saturation 92%.',   type: 'warning'  },
  ];
  MOCK.disasterTypes = [
    { label: 'Flood',     value: 58, color: '#3b82f6' },
    { label: 'Landslide', value: 42, color: '#8b5cf6' },
  ];
  MOCK.weeklyTrend = [
    { day: 'Mon', alerts: 5,  resolved: 4 },
    { day: 'Tue', alerts: 8,  resolved: 6 },
    { day: 'Wed', alerts: 6,  resolved: 6 },
    { day: 'Thu', alerts: 11, resolved: 7 },
    { day: 'Fri', alerts: 9,  resolved: 6 },
    { day: 'Sat', alerts: 7,  resolved: 5 },
    { day: 'Sun', alerts: 9,  resolved: 4 },
  ];
  MOCK.mapMarkers = MOCK.alerts.map(a => ({
    coords: a.coords, type: a.type.toLowerCase(), severity: a.severity,
    label: `${a.type} — ${a.location}`,
  }));
}

// weeklyTrend has no backend endpoint yet — always use static data
MOCK.weeklyTrend = [
  { day: 'Mon', alerts: 5,  resolved: 4 },
  { day: 'Tue', alerts: 8,  resolved: 6 },
  { day: 'Wed', alerts: 6,  resolved: 6 },
  { day: 'Thu', alerts: 11, resolved: 7 },
  { day: 'Fri', alerts: 9,  resolved: 6 },
  { day: 'Sat', alerts: 7,  resolved: 5 },
  { day: 'Sun', alerts: 9,  resolved: 4 },
];

// ─── LIVE UPDATE ──────────────────────────────────────────────────────────────
function simulateLiveUpdate(callback) {
  setInterval(async () => {
    try {
      const res = await apiGetAlerts({ limit: 1 });
      if (res?.success) {
        const newCount = res.count || 0;
        const delta = newCount - MOCK.stats.activeAlerts;
        MOCK.stats.activeAlerts = newCount;
        callback(delta);
      }
    } catch {
      // silent — no live update if offline
    }
  }, 15000);
}
