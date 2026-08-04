// Chart.js helpers. Charts draw from LIVE data; empty states show a message.

// Track charts per canvas so re-renders destroy old instances
const _chartRegistry = {};

function createChart(canvasId, config) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  if (_chartRegistry[canvasId]) _chartRegistry[canvasId].destroy();
  const emptyEl = document.getElementById(`${canvasId}-empty`); // clear placeholder
  if (emptyEl) emptyEl.remove();
  _chartRegistry[canvasId] = new Chart(ctx, config);
  return _chartRegistry[canvasId];
}

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1a2235',
      borderColor: '#2d3748',
      borderWidth: 1,
      titleColor: '#f1f5f9',
      bodyColor: '#94a3b8',
      padding: 10,
      cornerRadius: 8,
    },
  },
};

// Show a simple message in the chart's card when there is no data yet.
function showEmpty(canvasId, message = 'Waiting for live data…') {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const card = ctx.closest('.card') || ctx.parentElement;
  let el = document.getElementById(`${canvasId}-empty`);
  if (!el) {
    el = document.createElement('div');
    el.id = `${canvasId}-empty`;
    el.style.cssText = 'text-align:center;color:var(--text-muted);font-size:12px;padding:24px 0;';
    card.appendChild(el);
  }
  el.textContent = message;
}

function initWeeklyTrendChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const trend = (window.LIVE && LIVE.weeklyTrend) || [];
  if (!trend.length) return showEmpty(canvasId, 'No alert history yet');

  return createChart(canvasId, {
    type: 'bar',
    data: {
      labels: trend.map(d => d.day),
      datasets: [
        {
          label: 'Raised',
          data: trend.map(d => d.alerts),
          backgroundColor: 'rgba(239,68,68,0.7)',
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Resolved',
          data: trend.map(d => d.resolved),
          backgroundColor: 'rgba(34,197,94,0.7)',
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { grid: { color: 'rgba(30,41,59,0.8)' }, ticks: { color: '#475569', font: { size: 11 } }, border: { color: '#1e293b' } },
        y: { grid: { color: 'rgba(30,41,59,0.8)' }, ticks: { color: '#475569', font: { size: 11 }, stepSize: 5 }, border: { color: '#1e293b' } },
      },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, boxHeight: 10, borderRadius: 3 } },
      },
    },
  });
}

function initDisasterTypeChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const types = (window.LIVE && LIVE.disasterTypes) || [];
  if (!types.length) return showEmpty(canvasId, 'No prediction data yet');

  return createChart(canvasId, {
    type: 'doughnut',
    data: {
      labels: types.map(d => d.label),
      datasets: [{
        data: types.map(d => d.value),
        backgroundColor: types.map(d => d.color),
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: '72%',
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
    },
  });
}

// Risk level over the last 24h — prediction probabilities per hour.
function initRiskTrendChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const rt = (window.LIVE && LIVE.riskTrend) || null;
  if (!rt || rt.data.every(v => v === null)) {
    const riskBadge = document.getElementById('risk-level-badge'); // clear stale label
    if (riskBadge) {
      riskBadge.textContent = '—';
      riskBadge.className = 'badge badge-info';
    }
    return showEmpty(canvasId, 'No predictions in the last 24h');
  }

  const data = rt.data.map(v => v ?? 0);
  const real = rt.data.filter(v => v !== null);
  const current = real.length ? real[real.length - 1] : 0;
  const peak = Math.max(...real, 0);
  const avg = Math.round(real.reduce((s, v) => s + v, 0) / real.length);

  const currentEl = document.getElementById('risk-current');
  const peakEl = document.getElementById('risk-peak');
  const avgEl = document.getElementById('risk-avg');
  if (currentEl) { currentEl.textContent = `${current}%`; currentEl.style.color = current >= 70 ? 'var(--accent-red)' : 'var(--text-secondary)'; }
  if (peakEl) { peakEl.textContent = `${peak}%`; peakEl.style.color = peak >= 70 ? 'var(--accent-orange)' : 'var(--text-secondary)'; }
  if (avgEl) { avgEl.textContent = `${avg}%`; avgEl.style.color = 'var(--text-secondary)'; }

  const riskBadge = document.getElementById('risk-level-badge');
  if (riskBadge) {
    const lvl = current >= 85 ? 'critical' : current >= 70 ? 'high' : current >= 40 ? 'medium' : 'low';
    riskBadge.textContent = lvl.toUpperCase();
    riskBadge.className = `badge badge-${lvl}`;
  }

  return createChart(canvasId, {
    type: 'line',
    data: {
      labels: rt.labels,
      datasets: [{
        label: 'Risk Level',
        data,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#ef4444',
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 8 }, border: { color: '#1e293b' } },
        y: { min: 0, max: 100, grid: { color: 'rgba(30,41,59,0.8)' }, ticks: { color: '#475569', font: { size: 10 }, callback: v => v + '%' }, border: { color: '#1e293b' } },
      },
    },
  });
}

// Latest sensor readings scaled against their alert thresholds.
function initSensorRadarChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const radar = (window.LIVE && LIVE.sensorRadar) || null;
  if (!radar || !radar.labels.length) return showEmpty(canvasId, 'No sensor readings yet');

  return createChart(canvasId, {
    type: 'radar',
    data: {
      labels: radar.labels,
      datasets: [
        {
          label: 'Current',
          data: radar.values,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.15)',
          borderWidth: 2,
          pointBackgroundColor: '#3b82f6',
          pointRadius: 3,
        },
        {
          label: 'Alert Threshold',
          data: radar.values.map(() => 80),
          borderColor: 'rgba(239,68,68,0.5)',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        r: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(30,41,59,0.8)' },
          angleLines: { color: 'rgba(30,41,59,0.8)' },
          ticks: { display: false },
          pointLabels: { color: '#94a3b8', font: { size: 11 } },
        },
      },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
      },
    },
  });
}
