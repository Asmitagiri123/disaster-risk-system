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
    const lvl = current >= 75 ? 'high' : current >= 40 ? 'medium' : 'low';
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
