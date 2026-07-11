// app.js — Dashboard rendering + full interactivity

document.addEventListener('DOMContentLoaded', () => {
  renderStats();
  renderAlerts();
  renderPredictions();
  renderSensors();
  renderTimeline();
  renderDisasterTypeDonut();
  initWeeklyTrendChart('weeklyTrendChart');
  initRiskTrendChart('riskTrendChart');
  initSensorRadarChart('sensorRadarChart');
  initMap('leaflet-map');
  startClock();
  startLiveCounter();
  wireStatCards();
  wireMapFilter();
  wireTableRows();
  wireExportBtn();
  wireRecentEventsTabs();
});

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderStats() {
  const s = MOCK.stats;
  document.getElementById('stat-alerts').textContent    = s.activeAlerts;
  document.getElementById('stat-critical').textContent  = s.criticalZones;
  document.getElementById('stat-monitored').textContent = s.monitored;
  document.getElementById('stat-accuracy').textContent  = s.accuracy + '%';
  document.getElementById('stat-response').textContent  = s.responseTime;
  document.getElementById('stat-resolved').textContent  = s.resolved24h;
}

function renderAlerts() {
  const container = document.getElementById('alerts-list');
  if (!container) return;
  container.innerHTML = MOCK.alerts.map(a => `
    <div class="alert-item fade-in" data-id="${a.id}" style="cursor:pointer;">
      <div class="alert-dot ${a.severity}"></div>
      <div style="flex:1;min-width:0;">
        <div class="alert-title">${a.type} — ${a.location}</div>
        <div class="alert-meta">${a.magnitude} &nbsp;·&nbsp; ${a.time}</div>
      </div>
      <span class="badge badge-${a.severity}">${a.severity}</span>
    </div>
  `).join('');

  container.querySelectorAll('.alert-item').forEach(el => {
    el.addEventListener('click', () => {
      const alert = MOCK.alerts.find(a => a.id === +el.dataset.id);
      if (alert) showAlertDetailModal(alert);
    });
  });
}

function renderPredictions() {
  const container = document.getElementById('predictions-list');
  if (!container) return;
  container.innerHTML = MOCK.predictions.map((p, i) => {
    const trendIcon  = p.trend === 'up' ? '↑' : p.trend === 'down' ? '↓' : '→';
    const trendColor = p.trend === 'up' ? 'var(--accent-red)' : p.trend === 'down' ? 'var(--accent-green)' : 'var(--text-muted)';
    return `
      <div class="prediction-card fade-in" data-idx="${i}" style="cursor:pointer;">
        <div class="prediction-icon" style="background:rgba(${hexToRgbStr(p.color)},0.15);">${p.icon}</div>
        <div class="prediction-info">
          <div class="prediction-name">${p.type}</div>
          <div class="prediction-location">📍 ${p.location}</div>
          <div class="prediction-prob">
            <span class="prob-value" style="color:${p.color}">${p.probability}%</span>
            <div class="prob-bar"><div class="prob-fill" style="width:${p.probability}%;background:${p.color};"></div></div>
            <span style="font-size:12px;color:${trendColor};font-weight:700;">${trendIcon}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.prediction-card').forEach(el => {
    el.addEventListener('click', () => {
      const p = MOCK.predictions[+el.dataset.idx];
      showPredictionDetailModal(p);
    });
  });
}

function renderSensors() {
  const container = document.getElementById('sensor-grid');
  if (!container) return;
  container.innerHTML = MOCK.sensors.map((s, i) => `
    <div class="sensor-item ${s.status}" data-idx="${i}" style="cursor:pointer;">
      <div class="sensor-icon">${s.icon}</div>
      <div class="sensor-value">${s.value}</div>
      <div class="sensor-name">${s.name}</div>
      <div class="sensor-status ${s.status}">${s.status}</div>
    </div>
  `).join('');

  container.querySelectorAll('.sensor-item').forEach(el => {
    el.addEventListener('click', () => {
      const s = MOCK.sensors[+el.dataset.idx];
      showSensorModal(s);
    });
  });
}

function renderTimeline() {
  const container = document.getElementById('timeline');
  if (!container) return;
  container.innerHTML = MOCK.timeline.map(t => `
    <div class="timeline-item ${t.type}" style="cursor:pointer;" data-title="${t.title}" data-desc="${t.desc}" data-time="${t.time}">
      <div class="timeline-time">${t.time}</div>
      <div class="timeline-title">${t.title}</div>
      <div class="timeline-desc">${t.desc}</div>
    </div>
  `).join('');

  container.querySelectorAll('.timeline-item').forEach(el => {
    el.addEventListener('click', () => {
      showModal({
        title: `🕐 ${el.dataset.time} — Event Detail`,
        size: 'sm',
        body: `
          <div style="font-size:14px;font-weight:600;margin-bottom:8px;">${el.dataset.title}</div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">${el.dataset.desc}</div>
        `,
        actions: [{ id: 'ok', label: 'Close', style: 'secondary' }]
      });
    });
  });
}

function renderDisasterTypeDonut() {
  const container = document.getElementById('donut-legend');
  if (!container) return;
  container.innerHTML = MOCK.disasterTypes.map(d => `
    <div class="donut-legend-item" style="cursor:pointer;" data-label="${d.label}">
      <div class="donut-legend-dot" style="background:${d.color}"></div>
      <span class="donut-legend-label">${d.label}</span>
      <span class="donut-legend-val">${d.value}%</span>
    </div>
  `).join('');
  initDisasterTypeChart('disasterTypeChart');

  container.querySelectorAll('.donut-legend-item').forEach(el => {
    el.addEventListener('click', () => {
      const label = el.dataset.label;
      const filtered = MOCK.alerts.filter(a => a.type === label);
      showModal({
        title: `${label === 'Flood' ? '🌊' : '⛰️'} ${label} Events`,
        body: filtered.length
          ? filtered.map(a => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-secondary);border-radius:var(--radius-sm);margin-bottom:8px;">
                <div class="alert-dot ${a.severity}" style="flex-shrink:0;"></div>
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:600;">${a.location}</div>
                  <div style="font-size:11px;color:var(--text-muted);">${a.magnitude} · ${a.time}</div>
                </div>
                <span class="badge badge-${a.severity}">${a.severity}</span>
              </div>`).join('')
          : '<p style="color:var(--text-muted);font-size:13px;">No active events for this type.</p>',
        actions: [{ id: 'close', label: 'Close', style: 'secondary' }]
      });
    });
  });
}

// ─── STAT CARD CLICKS ────────────────────────────────────────────────────────
function wireStatCards() {
  const statCards = document.querySelectorAll('.stat-card');
  statCards.forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      const label = card.querySelector('.stat-label')?.textContent?.trim();
      if (label === 'Active Alerts' || label === 'Critical Zones') {
        window.location.href = 'pages/alerts.html';
      } else if (label === 'Districts Monitored') {
        window.location.href = 'pages/map.html';
      } else if (label === 'Prediction Accuracy') {
        window.location.href = 'pages/predictions.html';
      } else if (label === 'Resolved (24h)') {
        window.location.href = 'pages/reports.html';
      } else {
        const value = card.querySelector('.stat-value')?.textContent;
        const change = card.querySelector('.stat-change')?.textContent;
        showModal({
          title: label,
          size: 'sm',
          body: `
            <div style="text-align:center;padding:16px 0;">
              <div style="font-size:48px;font-weight:800;letter-spacing:-2px;margin-bottom:8px;">${value}</div>
              <div style="font-size:13px;color:var(--text-muted);">${change || ''}</div>
            </div>`,
          actions: [{ id: 'close', label: 'Close', style: 'secondary' }]
        });
      }
    });
  });
}

// ─── MAP FILTER SELECT ───────────────────────────────────────────────────────
function wireMapFilter() {
  const sel = document.querySelector('.filter-select');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const val = sel.value;
    if (!mapInstance) return;
    mapInstance.eachLayer(layer => {
      if (layer instanceof L.Marker) mapInstance.removeLayer(layer);
    });
    const filtered = val === 'All Events' ? MOCK.mapMarkers
      : val === 'Flood Only'     ? MOCK.mapMarkers.filter(m => m.type === 'flood')
      : val === 'Landslide Only' ? MOCK.mapMarkers.filter(m => m.type === 'landslide')
      : MOCK.mapMarkers;
    filtered.forEach(m => addMarker(m));
    showToast(`Map filtered: ${val}`, 'info', 2000);
  });
}

// ─── RECENT EVENTS TABLE TABS ────────────────────────────────────────────────
const TABLE_ROWS_DATA = [
  { event: '🌊 Flood Level 4',   location: 'Koshi River, Sunsari',   severity: 'critical', time: '14:52', status: 'Active',     type: 'Flood'     },
  { event: '⛰️ Major Landslide', location: 'Sindhupalchok',          severity: 'critical', time: '14:30', status: 'Active',     type: 'Landslide' },
  { event: '🌊 Flood Level 3',   location: 'Rapti River, Dang',      severity: 'high',     time: '13:45', status: 'Monitoring', type: 'Flood'     },
  { event: '⛰️ Landslide Risk 3',location: 'Myagdi District',        severity: 'high',     time: '12:20', status: 'Monitoring', type: 'Landslide' },
  { event: '🌊 Flood Level 3',   location: 'Bagmati River, Sarlahi', severity: 'high',     time: '12:00', status: 'Monitoring', type: 'Flood'     },
  { event: '🌊 Flood Watch',     location: 'Bagmati, Lalitpur',      severity: 'medium',   time: '11:00', status: 'Resolved',   type: 'Flood'     },
  { event: '⛰️ Landslide Risk 2',location: 'Kaski District',         severity: 'medium',   time: '09:30', status: 'Watch',      type: 'Landslide' },
];

const statusTextColors = { Active: 'var(--accent-red)', Monitoring: 'var(--accent-orange)', Resolved: 'var(--accent-green)', Watch: 'var(--accent-yellow)' };

function renderTableRows(filter = 'All') {
  const tbody = document.querySelector('.data-table tbody');
  if (!tbody) return;
  const rows = filter === 'All' ? TABLE_ROWS_DATA : TABLE_ROWS_DATA.filter(r => r.type === filter);
  tbody.innerHTML = rows.map(r => `
    <tr style="cursor:pointer;" data-event="${r.event}" data-location="${r.location}" data-severity="${r.severity}" data-status="${r.status}">
      <td>${r.event}</td>
      <td>${r.location}</td>
      <td><span class="badge badge-${r.severity}">${r.severity}</span></td>
      <td>${r.time}</td>
      <td><span style="color:${statusTextColors[r.status]};font-size:11px;font-weight:600;">● ${r.status}</span></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => {
      showModal({
        title: `${row.dataset.event}`,
        size: 'sm',
        body: `
          <div style="display:grid;gap:8px;">
            <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
              <span style="font-size:12px;color:var(--text-muted);">Location</span>
              <span style="font-size:12px;font-weight:600;">📍 ${row.dataset.location}</span>
            </div>
            <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
              <span style="font-size:12px;color:var(--text-muted);">Severity</span>
              <span class="badge badge-${row.dataset.severity}">${row.dataset.severity}</span>
            </div>
            <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
              <span style="font-size:12px;color:var(--text-muted);">Status</span>
              <span style="font-size:12px;font-weight:600;color:${statusTextColors[row.dataset.status]};">● ${row.dataset.status}</span>
            </div>
          </div>`,
        actions: [
          { id: 'view', label: '🔍 View Full Alert', style: 'primary', onClick: () => window.location.href = 'pages/alerts.html' },
          { id: 'close', label: 'Close', style: 'secondary' }
        ]
      });
    });
  });
}

function wireTableRows() {
  renderTableRows('All');
}

function wireRecentEventsTabs() {
  document.addEventListener('click', e => {
    if (!e.target.classList.contains('tab-btn')) return;
    const tabs = e.target.closest('.tabs');
    if (!tabs) return;
    tabs.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    const label = e.target.textContent.trim();
    if (label === 'All' || label === 'Flood' || label === 'Landslide') {
      renderTableRows(label);
    }
  });
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────
function wireExportBtn() {
  document.querySelectorAll('.btn-secondary').forEach(btn => {
    if (btn.textContent.includes('Export')) {
      btn.addEventListener('click', () => {
        exportCSV(
          MOCK.alerts.map(a => ({ type: a.type, severity: a.severity, location: a.location, magnitude: a.magnitude, time: a.time })),
          'nepal-flds-alerts.csv'
        );
      });
    }
  });
}

// ─── DETAIL MODALS ───────────────────────────────────────────────────────────
function showAlertDetailModal(a) {
  const colors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
  showModal({
    title: `${a.type === 'Flood' ? '🌊' : '⛰️'} ${a.type} — ${a.location}`,
    size: 'md',
    body: `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <span class="badge badge-${a.severity}" style="font-size:12px;">${a.severity}</span>
        <span style="font-size:12px;color:var(--text-muted);">🕐 ${a.time}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">Magnitude</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px;color:${colors[a.severity]};">${a.magnitude}</div>
        </div>
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">Coordinates</div>
          <div style="font-size:13px;font-weight:600;margin-top:4px;">${a.coords[0].toFixed(2)}°N, ${a.coords[1].toFixed(2)}°E</div>
        </div>
      </div>
      <div style="background:rgba(${a.severity === 'critical' ? '239,68,68' : '249,115,22'},0.08);border:1px solid rgba(${a.severity === 'critical' ? '239,68,68' : '249,115,22'},0.2);border-radius:var(--radius-sm);padding:12px;font-size:13px;color:var(--text-secondary);line-height:1.6;">
        This ${a.type.toLowerCase()} event is currently at <strong style="color:${colors[a.severity]};">${a.severity}</strong> severity level. Monitoring teams have been notified and response protocols are in effect.
      </div>`,
    actions: [
      { id: 'map', label: '🗺️ View on Map', style: 'secondary', onClick: () => window.location.href = (window.location.pathname.includes('pages') ? '' : 'pages/') + 'map.html' },
      { id: 'respond', label: '⚡ Respond', style: 'primary', onClick: () => showToast(`Response team dispatched to ${a.location}`, 'success') }
    ]
  });
}

function showPredictionDetailModal(p) {
  const riskLevel = p.probability >= 75 ? 'critical' : p.probability >= 60 ? 'high' : p.probability >= 40 ? 'medium' : 'low';
  showModal({
    title: `${p.icon} ${p.type} Prediction`,
    size: 'sm',
    body: `
      <div style="text-align:center;padding:12px 0 20px;">
        <div style="font-size:48px;font-weight:800;color:${p.color};letter-spacing:-2px;">${p.probability}%</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">Probability in next 72h</div>
        <span class="badge badge-${riskLevel}" style="margin-top:8px;display:inline-flex;">${riskLevel} risk</span>
      </div>
      <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:8px;">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Location</div>
        <div style="font-size:13px;font-weight:600;">📍 ${p.location}</div>
      </div>
      <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:12px 14px;">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Trend</div>
        <div style="font-size:13px;font-weight:600;color:${p.trend === 'up' ? 'var(--accent-red)' : p.trend === 'down' ? 'var(--accent-green)' : 'var(--text-muted)'};">
          ${p.trend === 'up' ? '↑ Increasing' : p.trend === 'down' ? '↓ Decreasing' : '→ Stable'}
        </div>
      </div>`,
    actions: [
      { id: 'full', label: '🔮 Full Predictions', style: 'primary', onClick: () => window.location.href = (window.location.pathname.includes('pages') ? '' : 'pages/') + 'predictions.html' },
      { id: 'close', label: 'Close', style: 'secondary' }
    ]
  });
}

function showSensorModal(s) {
  const statusColors = { active: 'var(--accent-green)', warning: 'var(--accent-yellow)', offline: 'var(--accent-red)' };
  const thresholds = {
    'Rainfall': '150 mm/24h', 'River Level': '+2.5 m', 'Soil Moist.': '85%',
    'Flow Rate': '1500 m³/s', 'Humidity': '95%', 'Wind Speed': '60 km/h',
    'Temperature': '35°C', 'Slope Stab.': 'Stable', 'Sediment': 'Moderate'
  };
  showModal({
    title: `${s.icon} ${s.name} Sensor`,
    size: 'sm',
    body: `
      <div style="text-align:center;padding:12px 0 20px;">
        <div style="font-size:40px;margin-bottom:8px;">${s.icon}</div>
        <div style="font-size:36px;font-weight:800;letter-spacing:-1px;">${s.value}</div>
        <div style="margin-top:8px;">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${statusColors[s.status]};">● ${s.status}</span>
        </div>
      </div>
      <div style="display:grid;gap:8px;">
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-muted);">Alert Threshold</span>
          <span style="font-size:12px;font-weight:600;">${thresholds[s.name] || 'N/A'}</span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-muted);">Last Updated</span>
          <span style="font-size:12px;font-weight:600;">${new Date().toLocaleTimeString()}</span>
        </div>
      </div>`,
    actions: [
      { id: 'close', label: 'Close', style: 'secondary' },
      ...(s.status === 'offline' ? [{ id: 'ping', label: '🔄 Ping Sensor', style: 'primary', onClick: () => showToast(`Ping sent to ${s.name} sensor`, 'info') }] : [])
    ]
  });
}

// ─── CLOCK & LIVE COUNTER ────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const update = () => { el.textContent = new Date().toUTCString().replace(' GMT', ' UTC'); };
  update();
  setInterval(update, 1000);
}

function startLiveCounter() {
  simulateLiveUpdate(delta => {
    const el = document.getElementById('stat-alerts');
    if (!el) return;
    const next = Math.max(0, parseInt(el.textContent) + delta);
    el.textContent = next;
    if (delta > 0) { el.style.color = 'var(--accent-red)'; showToast('New alert detected in Nepal', 'warning', 3000); }
    else if (delta < 0) el.style.color = 'var(--accent-green)';
    setTimeout(() => el.style.color = '', 1200);
  });
}

// ─── UTIL ────────────────────────────────────────────────────────────────────
function hexToRgbStr(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)].join(',');
}
