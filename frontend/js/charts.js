// charts.js — All Chart.js chart initializations
// Requires Chart.js loaded via CDN

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
    }
  }
};

function initWeeklyTrendChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MOCK.weeklyTrend.map(d => d.day),
      datasets: [
        {
          label: 'New Alerts',
          data: MOCK.weeklyTrend.map(d => d.alerts),
          backgroundColor: 'rgba(239,68,68,0.7)',
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Resolved',
          data: MOCK.weeklyTrend.map(d => d.resolved),
          backgroundColor: 'rgba(34,197,94,0.7)',
          borderRadius: 4,
          borderSkipped: false,
        }
      ]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { grid: { color: 'rgba(30,41,59,0.8)' }, ticks: { color: '#475569', font: { size: 11 } }, border: { color: '#1e293b' } },
        y: { grid: { color: 'rgba(30,41,59,0.8)' }, ticks: { color: '#475569', font: { size: 11 }, stepSize: 5 }, border: { color: '#1e293b' } }
      },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, boxHeight: 10, borderRadius: 3 } }
      }
    }
  });
}

function initDisasterTypeChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: MOCK.disasterTypes.map(d => d.label),
      datasets: [{
        data: MOCK.disasterTypes.map(d => d.value),
        backgroundColor: MOCK.disasterTypes.map(d => d.color),
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: '72%',
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }
    }
  });
}

function initRiskTrendChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  // Monsoon-season risk pattern — peaks during afternoon rainfall
  const riskData = [38, 35, 32, 36, 48, 55, 52, 60, 68, 65, 72, 78, 75, 80, 84, 79, 74, 70, 76, 82, 85, 82, 78, 74];

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours,
      datasets: [{
        label: 'Risk Level',
        data: riskData,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#ef4444',
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569', font: { size: 10 }, maxTicksLimit: 8 }, border: { color: '#1e293b' } },
        y: { min: 0, max: 100, grid: { color: 'rgba(30,41,59,0.8)' }, ticks: { color: '#475569', font: { size: 10 }, callback: v => v + '%' }, border: { color: '#1e293b' } }
      }
    }
  });
}

function initPredictionAccuracyChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [{
        label: 'Accuracy %',
        data: [85, 86, 88, 87, 89, 90, 91, 92, 91, 93, 92, 91.8],
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#22c55e',
        pointBorderWidth: 0,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { grid: { display: false }, ticks: { color: '#475569', font: { size: 11 } }, border: { color: '#1e293b' } },
        y: { min: 80, max: 100, grid: { color: 'rgba(30,41,59,0.8)' }, ticks: { color: '#475569', font: { size: 11 }, callback: v => v + '%' }, border: { color: '#1e293b' } }
      }
    }
  });
}

function initSensorRadarChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  return new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Rainfall', 'River Level', 'Soil Moisture', 'Flow Rate', 'Humidity', 'Slope Stability'],
      datasets: [{
        label: 'Current',
        data: [92, 85, 95, 78, 94, 30],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.15)',
        borderWidth: 2,
        pointBackgroundColor: '#3b82f6',
        pointRadius: 3,
      }, {
        label: 'Alert Threshold',
        data: [80, 80, 80, 80, 80, 80],
        borderColor: 'rgba(239,68,68,0.5)',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        r: {
          min: 0, max: 100,
          grid: { color: 'rgba(30,41,59,0.8)' },
          angleLines: { color: 'rgba(30,41,59,0.8)' },
          ticks: { display: false },
          pointLabels: { color: '#94a3b8', font: { size: 11 } }
        }
      },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 10, boxHeight: 10 } }
      }
    }
  });
}
