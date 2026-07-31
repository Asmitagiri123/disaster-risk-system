// map.js — Leaflet map initialization — Nepal Flood & Landslide focus

let mapInstance = null;

const MARKER_COLORS = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e'
};

const DISASTER_ICONS = {
  flood:     '🌊',
  landslide: '⛰️',
};

function initMap(containerId = 'leaflet-map') {
  const el = document.getElementById(containerId);
  if (!el || mapInstance) return;

  mapInstance = L.map(containerId, {
    center: [28.1, 84.0],   // Center of Nepal
    zoom: 7,
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
  }).addTo(mapInstance);

  MOCK.mapMarkers.forEach(marker => addMarker(marker));

  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

  return mapInstance;
}

function addMarker({ coords, type, severity, label }) {
  if (!mapInstance) return;

  const color = MARKER_COLORS[severity] || '#94a3b8';
  const icon  = DISASTER_ICONS[type] || '⚠️';

  const markerIcon = L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="
          width:32px;height:32px;
          background:rgba(${hexToRgb(color)},0.2);
          border:2px solid ${color};
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:14px;
          box-shadow:0 0 12px rgba(${hexToRgb(color)},0.5);
          animation:pulse-marker 2s infinite;
        ">${icon}</div>
        ${severity === 'critical' ? `<div style="
          position:absolute;
          width:48px;height:48px;
          border:1px solid rgba(${hexToRgb(color)},0.3);
          border-radius:50%;
          animation:pulse-ring 2s infinite;
        "></div>` : ''}
      </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });

  const popup = L.popup({
    className: 'custom-popup',
    closeButton: false,
    offset: [0, -10],
  }).setContent(`
    <div style="
      background:#1a2235;border:1px solid #2d3748;border-radius:8px;
      padding:10px 14px;min-width:180px;font-family:Inter,sans-serif;
    ">
      <div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">${label}</div>
      <div style="font-size:11px;color:#94a3b8;text-transform:capitalize;">
        ${type} · <span style="color:${color};font-weight:600;">${severity}</span>
      </div>
    </div>
  `);

  L.marker(coords, { icon: markerIcon }).bindPopup(popup).addTo(mapInstance);
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)].join(',');
}

const mapStyles = document.createElement('style');
mapStyles.textContent = `
  @keyframes pulse-marker { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
  @keyframes pulse-ring { 0%{transform:scale(0.8);opacity:1} 100%{transform:scale(1.6);opacity:0} }
  .leaflet-popup-content-wrapper,.leaflet-popup-tip{background:transparent!important;box-shadow:none!important;border:none!important;}
  .leaflet-popup-content{margin:0!important;}
`;
document.head.appendChild(mapStyles);
