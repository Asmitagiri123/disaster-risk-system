// Dashboard rendering + interactivity, reading only real data from LIVE.

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  renderAll();
  startClock();
  wireStatCards();
  wireMapFilter();
  wireTableRows();
  wireExportBtn();
  wireRecentEventsTabs();

  withLiveData(async () => {
    await Promise.all([
      loadLiveDashboard(),
      loadLiveAlerts(),
      loadLivePredictions(),
      loadLiveDisasterTypes(),
    ]);
    renderAll();
    // Alerts are in — draw map markers and the Recent Events table
    if (window.syncMapMarkers) syncMapMarkers();
    renderTableRows('All');
    startLiveFeed();
  });
});

// Renders everything from the LIVE data in live-data.js.
function renderAll() {
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
}

// Render functions read only from LIVE (no mock fallback; offline shows the
// auth.js banner and empty lists).
function data(key) {
  const live = window.LIVE && LIVE[key];
  return Array.isArray(live) ? live : (live || null);
}

// Rendering

function renderStats() {
  const s = data('stats');
  if (!s) return;
  document.getElementById('stat-alerts').textContent    = s.activeAlerts;
  document.getElementById('stat-critical').textContent  = s.criticalZones;
  document.getElementById('stat-monitored').textContent = s.monitored;
  document.getElementById('stat-accuracy').textContent  = s.accuracy ? s.accuracy + '%' : '—';
  document.getElementById('stat-response').textContent  = s.responseTime || '—';
  document.getElementById('stat-resolved').textContent  = s.resolved24h;
  // Peak 24h rainfall across alerted districts + avg soil moisture from sensors
  const rainEl = document.getElementById('stat-rainfall-peak');
  if (rainEl) rainEl.textContent = s.rainfallPeak !== null && s.rainfallPeak !== undefined ? `${s.rainfallPeak.toFixed(1)} mm` : '—';
  const soilEl = document.getElementById('stat-soil');
  if (soilEl) soilEl.textContent = s.soilSaturation ? `${s.soilSaturation}%` : '—';

  const accNote = document.getElementById('stat-accuracy-note');
  if (accNote) accNote.textContent = s.accuracy && s.modelVersion ? `XGBoost v${s.modelVersion} · 77 districts` : 'model validation';
  const soilNote = document.getElementById('stat-soil-note');
  if (soilNote) soilNote.textContent = s.soilSaturation ? 'avg live sensor soil' : 'live sensor avg';
}

function renderAlerts() {
  const container = document.getElementById('alerts-list');
  if (!container) return;
  const alerts = data('alerts');
  container.innerHTML = alerts.map(a => `
    <div class="alert-item fade-in" data-id="${a.id}" style="cursor:pointer;">
      <div class="alert-dot ${a.severity}"></div>
      <div style="flex:1;min-width:0;">
        <div class="alert-title">${a.type} — ${a.location}
          ${a.crossVerified ? '<span class="badge badge-info" style="font-size:9px;margin-left:6px;">✓ verified</span>' : ''}
        </div>
        <div class="alert-meta">${a.magnitude} &nbsp;·&nbsp; ${a.time}</div>
        ${a.evidenceChips ? `<div class="alert-evidence" title="Live weather evidence behind this alert">${a.evidenceChips}</div>` : ''}
      </div>
      <span class="badge badge-${a.severity}">${a.severity}</span>
    </div>
  `).join('');

  container.querySelectorAll('.alert-item').forEach(el => {
    el.addEventListener('click', () => {
      const alert = data('alerts').find(a => String(a.id) === String(el.dataset.id));
      if (alert) showAlertDetailModal(alert);
    });
  });
}

function renderPredictions() {
  const container = document.getElementById('predictions-list');
  if (!container) return;
  container.innerHTML = data('predictions').map((p, i) => {
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
      const p = data('predictions')[+el.dataset.idx];
      showPredictionDetailModal(p);
    });
  });
}

function renderSensors() {
  const container = document.getElementById('sensor-grid');
  if (!container) return;
  container.innerHTML = data('sensors').map((s, i) => `
    <div class="sensor-item ${s.status}" data-idx="${i}" style="cursor:pointer;">
      <div class="sensor-icon">${s.icon}</div>
      <div class="sensor-value">${s.value}</div>
      <div class="sensor-name">${s.name}</div>
      <div class="sensor-status ${s.status}">${s.status}</div>
    </div>
  `).join('');

  // Sensor total from the backend (one weather feed per district)
  const badge = document.getElementById('sensor-count-badge');
  if (badge) badge.textContent = `${(window.LIVE && LIVE.sensorsTotal) || data('sensors').length} Active`;

  container.querySelectorAll('.sensor-item').forEach(el => {
    el.addEventListener('click', () => {
      const s = data('sensors')[+el.dataset.idx];
      showSensorModal(s);
    });
  });
}

function renderTimeline() {
  const container = document.getElementById('timeline');
  if (!container) return;
  container.innerHTML = data('timeline').map(t => `
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
  container.innerHTML = data('disasterTypes').map(d => `
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
      const filtered = data('alerts').filter(a => a.type === label);
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

// Stat cards
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

// Map filter
function wireMapFilter() {
  const typeSel = document.getElementById('map-type-filter') || document.querySelector('.filter-select');
  if (!typeSel) return;

  const provSel = document.getElementById('map-province-filter');
  if (provSel) {
    NEPAL_PROVINCES.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = `${p.icon} ${p.name}`;
      provSel.appendChild(opt);
    });
  }

  const applyMapFilters = () => {
    if (!mapInstance) return;
    const src = (window.LIVE && LIVE.mapMarkers.length) ? LIVE.mapMarkers : [];
    mapInstance.eachLayer(layer => {
      if (layer instanceof L.Marker) mapInstance.removeLayer(layer);
    });

    let filtered = src;
    const typeVal = typeSel.value;
    if (typeVal === 'Flood Only')     filtered = filtered.filter(m => m.type === 'flood');
    else if (typeVal === 'Landslide Only') filtered = filtered.filter(m => m.type === 'landslide');

    const provVal = provSel ? provSel.value : 'all';
    if (provVal !== 'all') filtered = filtered.filter(m => (m.province || nepalProvinceOf(m.label || '')) === provVal);

    filtered.forEach(m => addMarker(m));
    const suffix = provVal !== 'all' ? ` · ${provVal}` : '';
    showToast(`Map filtered: ${typeVal}${suffix}`, 'info', 2000);
  };

  typeSel.addEventListener('change', applyMapFilters);
  if (provSel) provSel.addEventListener('change', applyMapFilters);
}

// Recent events tabs
const statusTextColors = { Active: 'var(--accent-red)', Monitoring: 'var(--accent-orange)', Resolved: 'var(--accent-green)', Watch: 'var(--accent-yellow)' };

// Recent events table, from LIVE alerts.
function renderTableRows(filter = 'All') {
  const tbody = document.querySelector('.data-table tbody');
  if (!tbody) return;
  const alerts = data('alerts');
  const rows = alerts.map(a => ({
    event: `${a.type === 'Flood' ? '🌊' : '⛰️'} ${a.type} alert`,
    location: a.location,
    severity: a.severity,
    time: a.time,
    status: 'Active',
    type: a.type,
  }));
  const filtered = filter === 'All' ? rows : rows.filter(r => r.type === filter);
  tbody.innerHTML = filtered.length ? filtered.map(r => `
    <tr style="cursor:pointer;" data-event="${r.event}" data-location="${r.location}" data-severity="${r.severity}" data-status="${r.status}">
      <td>${r.event}</td>
      <td>${r.location}</td>
      <td><span class="badge badge-${r.severity}">${r.severity}</span></td>
      <td>${r.time}</td>
      <td><span style="color:${statusTextColors[r.status]};font-size:11px;font-weight:600;">● ${r.status}</span></td>
    </tr>
  `).join('') : `
    <tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;font-size:13px;">
      ${window.LIVE && LIVE.online === false ? '⚠️ Backend offline — no live alerts available' : 'No active alerts right now'}
    </td></tr>`;

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

// Export
function wireExportBtn() {
  document.querySelectorAll('.btn-secondary').forEach(btn => {
    if (btn.textContent.includes('Export')) {
      btn.addEventListener('click', () => {
        exportCSV(
          data('alerts').map(a => ({ type: a.type, severity: a.severity, location: a.location, magnitude: a.magnitude, time: a.time })),
          'nepal-flds-alerts.csv'
        );
      });
    }
  });
}

// Detail modals
function showAlertDetailModal(a) {
  const colors = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
  const ev = a.evidence;
  const sourceLabel = (ev && (window.EVIDENCE_SOURCE_LABEL[ev.source] || ev.source)) || 'Live feed';
  const evidenceHtml = ev ? `
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);">📊 Why this alert — live evidence</div>
        <span class="badge badge-info" style="font-size:10px;">${escapeHtml(sourceLabel)}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:8px;">
        ${[
          ['Rainfall', ev.rainfall, '🌧'],
          ['Humidity', ev.humidity, '💧'],
          ['Temp', ev.temperature, '🌡'],
          ['River Flow', ev.riverFlow, '🏞'],
        ].filter(([, v]) => v).map(([label, value, icon]) => `
          <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 12px;text-align:center;">
            <div style="font-size:16px;">${icon}</div>
            <div style="font-size:16px;font-weight:700;margin-top:2px;">${escapeHtml(value)}</div>
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;">${label}</div>
          </div>
        `).join('')}
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">
        ⚙️ Model v${escapeHtml(ev.modelVersion)} · Source: ${escapeHtml(sourceLabel)}
        ${a.crossVerified ? '<br>✅ <strong style="color:var(--accent-green);">Cross-verified</strong> — model and rainfall rule agree' : ''}
      </div>
    </div>` : '';
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
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">Probability</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px;color:${colors[a.severity]};">${a.magnitude}</div>
        </div>
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">Coordinates</div>
          <div style="font-size:13px;font-weight:600;margin-top:4px;">${a.coords[0].toFixed(2)}°N, ${a.coords[1].toFixed(2)}°E</div>
        </div>
      </div>
      ${evidenceHtml}
      <div style="background:rgba(${a.severity === 'critical' ? '239,68,68' : '249,115,22'},0.08);border:1px solid rgba(${a.severity === 'critical' ? '239,68,68' : '249,115,22'},0.2);border-radius:var(--radius-sm);padding:12px;font-size:13px;color:var(--text-secondary);line-height:1.6;">
        This ${a.type.toLowerCase()} alert was raised by the prediction model at <strong style="color:${colors[a.severity]};">${a.severity}</strong> risk using the live weather readings above. Alerts auto-resolve once conditions no longer warrant them.
      </div>`,
    actions: [
      { id: 'map', label: '🗺️ View on Map', style: 'secondary', onClick: () => window.location.href = (window.location.pathname.includes('pages') ? '' : 'pages/') + 'map.html' },
      { id: 'respond', label: '⚡ Respond', style: 'primary', onClick: () => showToast(`Response team dispatched to ${a.location}`, 'success') }
    ]
  });
}

function showPredictionDetailModal(p) {
  // Prefer the model's risk label over one derived from the capped probability.
  const modelRisk = (p._raw && p._raw.riskLevel) || undefined;
  const severity = ({ critical: 'critical', high: 'high', moderate: 'medium', low: 'low' })[modelRisk]
    || (p.probability >= 75 ? 'critical' : p.probability >= 60 ? 'high' : p.probability >= 40 ? 'medium' : 'low');
  showModal({
    title: `${p.icon} ${p.type} Prediction`,
    size: 'sm',
    body: `
      <div style="text-align:center;padding:12px 0 20px;">
        <div style="font-size:48px;font-weight:800;color:${p.color};letter-spacing:-2px;">${p.probability}%</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">Model probability (risk class)</div>
        <span class="badge badge-${severity}" style="margin-top:8px;display:inline-flex;">${modelRisk || severity} risk</span>
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

// Clock
function startClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const update = () => { el.textContent = new Date().toUTCString().replace(' GMT', ' UTC'); };
  update();
  setInterval(update, 1000);
}

// Utilities
function hexToRgbStr(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)].join(',');
}
