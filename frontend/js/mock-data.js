// data.js — Real backend data loader. No mock data.

// ─── MAPPERS ──────────────────────────────────────────────────────────────────

function mapAlert(a) {
  const coords = a.location?.coordinates ? [a.location.coordinates[1], a.location.coordinates[0]] : null;
  return {
    id: a._id,
    type: a.disasterType === 'flood' ? 'Flood' : a.disasterType === 'landslide' ? 'Landslide' : a.disasterType,
    severity: a.riskLevel || 'low',
    location: a.location?.address || a.location?.city || 'Nepal',
    magnitude: a.probability ? `${Math.round(a.probability * 100)}%` : '—',
    time: timeAgo(a.createdAt),
    coords,
    isActive: a.isActive,
    message: a.message || '',
    disasterType: a.disasterType,
    createdAt: a.createdAt,
  };
}

function mapPrediction(p) {
  const isFlood = p.disasterType === 'flood';
  return {
    id: p._id,
    type: isFlood ? 'Flood' : 'Landslide',
    icon: isFlood ? '🌊' : '⛰️',
    location: p.location?.address || p.location?.city || 'Nepal',
    probability: Math.round((p.probability || 0) * 100),
    riskLevel: p.riskLevel || 'low',
    trend: 'stable',
    color: isFlood ? '#3b82f6' : '#8b5cf6',
    createdAt: p.createdAt,
  };
}

function mapSensor(s) {
  const r = s.readings || {};
  let val = '—', unit = '';
  if (r.rainfall !== undefined)    { val = r.rainfall;    unit = ' mm'; }
  else if (r.waterLevel !== undefined) { val = r.waterLevel; unit = ' m'; }
  else if (r.soilMoisture !== undefined) { val = r.soilMoisture; unit = '%'; }
  else if (r.riverFlow !== undefined)  { val = r.riverFlow;  unit = ' m³/s'; }
  else if (r.humidity !== undefined)   { val = r.humidity;   unit = '%'; }
  else if (r.temperature !== undefined){ val = r.temperature; unit = '°C'; }

  const iconMap = {
    hydrological: '🌊', meteorological: '🌧️',
    geotechnical: '📐', seismic: '📡',
  };
  return {
    id: s._id,
    sensorId: s.sensorId,
    name: s.sensorType || s.sensorId,
    icon: iconMap[s.sensorType] || '📡',
    value: `${val}${unit}`,
    status: s.status || 'active',
    disasterType: s.disasterType,
    location: s.location?.address || '',
    readings: r,
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
  if (diff < 1)    return 'just now';
  if (diff < 60)   return `${diff} min ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

// ─── SHARED STATE ─────────────────────────────────────────────────────────────

const DATA = {
  stats:        { activeAlerts: 0, highRiskZones: 0, monitored: 77, accuracy: '—', responseTime: '—', resolved24h: 0 },
  alerts:       [],
  predictions:  [],
  sensors:      [],
  timeline:     [],
  disasterTypes:[],
  weeklyTrend:  [],
  mapMarkers:   [],
};

// ─── LOAD ─────────────────────────────────────────────────────────────────────

async function loadDashboardData() {
  const [alertsRes, predictionsRes, sensorsRes, statsRes] = await Promise.allSettled([
    apiGetAlerts({ limit: 50 }),
    apiGetPredictions({ limit: 10 }),
    apiGetSensors(),
    apiGetAlertStats(),
  ]);

  // Alerts
  if (alertsRes.status === 'fulfilled' && alertsRes.value?.success) {
    const raw = alertsRes.value.data.alerts || [];
    DATA.alerts     = raw.map(mapAlert);
    DATA.mapMarkers = raw.map(mapMarker).filter(Boolean);
    DATA.stats.activeAlerts  = raw.filter(a => a.isActive).length;
    DATA.stats.highRiskZones = raw.filter(a => a.riskLevel === 'high' || a.riskLevel === 'critical').length;

    DATA.timeline = raw.slice(0, 6).map(a => ({
      time:  new Date(a.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      title: `${a.disasterType === 'flood' ? 'Flood' : 'Landslide'} — ${a.location?.address || a.location?.city || 'Nepal'}`,
      desc:  a.message || `${a.riskLevel} risk level detected.`,
      type:  (a.riskLevel === 'high' || a.riskLevel === 'critical') ? 'warning' : a.isActive ? 'warning' : 'resolved',
    }));

    const floodCount = raw.filter(a => a.disasterType === 'flood').length;
    const landCount  = raw.filter(a => a.disasterType === 'landslide').length;
    const total = floodCount + landCount || 1;
    DATA.disasterTypes = [
      { label: 'Flood',     value: Math.round(floodCount / total * 100), color: '#3b82f6' },
      { label: 'Landslide', value: Math.round(landCount  / total * 100), color: '#8b5cf6' },
    ];
  }

  // Predictions
  if (predictionsRes.status === 'fulfilled' && predictionsRes.value?.success) {
    const raw = predictionsRes.value.data?.predictions || predictionsRes.value.data || [];
    DATA.predictions = raw.map(mapPrediction);
    if (DATA.predictions.length) {
      const avg = DATA.predictions.reduce((s, p) => s + p.probability, 0) / DATA.predictions.length;
      DATA.stats.accuracy = avg.toFixed(1);
    }
  }

  // Sensors
  if (sensorsRes.status === 'fulfilled' && sensorsRes.value?.success) {
    DATA.sensors = (sensorsRes.value.data?.sensors || []).slice(0, 9).map(mapSensor);
  }

  // Stats
  if (statsRes.status === 'fulfilled' && statsRes.value?.success) {
    const s = statsRes.value.data;
    DATA.stats.resolved24h = s?.resolved24h || 0;
  }
}

// ─── LIVE POLL ────────────────────────────────────────────────────────────────

function startLivePoll(onUpdate) {
  setInterval(async () => {
    try {
      const res = await apiGetAlerts({ limit: 50 });
      if (!res?.success) return;
      const raw = res.data.alerts || [];
      const newCount = raw.filter(a => a.isActive).length;
      const delta = newCount - DATA.stats.activeAlerts;
      DATA.stats.activeAlerts = newCount;
      DATA.alerts     = raw.map(mapAlert);
      DATA.mapMarkers = raw.map(mapMarker).filter(Boolean);
      onUpdate(delta);
    } catch { /* silent */ }
  }, 15000);
}
