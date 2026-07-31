// Mock data — Nepal Flood & Landslide Early Warning System
// Replace with API calls when backend is ready
// const API_BASE_URL = 'http://localhost:8000/api';

const MOCK = {
  stats: {
    activeAlerts: 9,
    criticalZones: 4,
    monitored: 77,   // 77 districts of Nepal
    accuracy: 91.8,
    responseTime: '3.6m',
    resolved24h: 5
  },

  alerts: [
    { id: 1, type: 'Flood',     severity: 'critical', location: 'Koshi River, Sunsari',      magnitude: 'Level 4', time: '8 min ago',  coords: [26.68, 87.17] },
    { id: 2, type: 'Landslide', severity: 'critical', location: 'Sindhupalchok District',    magnitude: 'Major',   time: '22 min ago', coords: [27.95, 85.68] },
    { id: 3, type: 'Flood',     severity: 'high',     location: 'Rapti River, Dang',         magnitude: 'Level 3', time: '1h ago',     coords: [28.05, 82.30] },
    { id: 4, type: 'Landslide', severity: 'high',     location: 'Myagdi District',           magnitude: 'Risk 3',  time: '2h ago',     coords: [28.35, 83.57] },
    { id: 5, type: 'Flood',     severity: 'high',     location: 'Bagmati River, Sarlahi',    magnitude: 'Level 3', time: '2h ago',     coords: [27.00, 85.58] },
    { id: 6, type: 'Landslide', severity: 'medium',   location: 'Kaski District',            magnitude: 'Risk 2',  time: '3h ago',     coords: [28.21, 83.98] },
    { id: 7, type: 'Flood',     severity: 'medium',   location: 'Narayani River, Chitwan',   magnitude: 'Level 2', time: '4h ago',     coords: [27.53, 84.35] },
    { id: 8, type: 'Landslide', severity: 'low',      location: 'Dolakha District',          magnitude: 'Watch',   time: '5h ago',     coords: [27.67, 86.08] },
    { id: 9, type: 'Flood',     severity: 'low',      location: 'Karnali River, Surkhet',    magnitude: 'Level 1', time: '6h ago',     coords: [28.60, 81.62] },
  ],

  predictions: [
    { type: 'Flood',     icon: '🌊', location: 'Koshi Basin, Province 1',      probability: 84, trend: 'up',     color: '#3b82f6' },
    { type: 'Landslide', icon: '⛰️', location: 'Sindhupalchok, Bagmati Zone',  probability: 79, trend: 'up',     color: '#8b5cf6' },
    { type: 'Flood',     icon: '🌊', location: 'Rapti Basin, Lumbini Province', probability: 71, trend: 'stable', color: '#3b82f6' },
    { type: 'Landslide', icon: '⛰️', location: 'Myagdi, Gandaki Province',     probability: 65, trend: 'up',     color: '#8b5cf6' },
    { type: 'Flood',     icon: '🌊', location: 'Bagmati Basin, Madhesh',        probability: 58, trend: 'stable', color: '#3b82f6' },
    { type: 'Landslide', icon: '⛰️', location: 'Dolakha, Bagmati Province',    probability: 42, trend: 'down',   color: '#8b5cf6' },
  ],

  sensors: [
    { name: 'Rainfall',    icon: '🌧️', value: '187 mm',  status: 'warning' },
    { name: 'River Level', icon: '🌊', value: '+3.2 m',  status: 'warning' },
    { name: 'Soil Moist.', icon: '🌱', value: 'Sat.',    status: 'warning' },
    { name: 'Flow Rate',   icon: '💧', value: '1840 m³/s', status: 'active' },
    { name: 'Humidity',    icon: '💦', value: '94%',     status: 'active'  },
    { name: 'Wind Speed',  icon: '💨', value: '42 km/h', status: 'active'  },
    { name: 'Temperature', icon: '🌡️', value: '24.1°C', status: 'active'  },
    { name: 'Slope Stab.', icon: '📐', value: 'Unstable',status: 'offline' },
    { name: 'Sediment',    icon: '🪨', value: 'High',    status: 'warning' },
  ],

  timeline: [
    { time: '14:52', title: 'Koshi River flood Level 4',       desc: 'Sunsari — Embankment breach risk. NDRRMA alerted.',         type: 'critical' },
    { time: '14:30', title: 'Major landslide — Sindhupalchok', desc: 'Road blockage on Araniko Highway. Rescue teams dispatched.', type: 'critical' },
    { time: '13:45', title: 'Rapti River flood warning',       desc: 'Dang district — Level 3 alert. Evacuation advisory issued.', type: 'warning'  },
    { time: '12:20', title: 'Landslide risk elevated — Myagdi',desc: 'Continuous rainfall >150mm. Slope monitoring active.',       type: 'warning'  },
    { time: '11:00', title: 'Bagmati flood watch cleared',     desc: 'Lalitpur — River receding. Watch downgraded to advisory.',   type: 'resolved' },
    { time: '09:30', title: 'Kaski landslide watch issued',    desc: 'Pokhara outskirts — Soil saturation at 92%.',               type: 'warning'  },
  ],

  disasterTypes: [
    { label: 'Flood',     value: 58, color: '#3b82f6' },
    { label: 'Landslide', value: 42, color: '#8b5cf6' },
  ],

  weeklyTrend: [
    { day: 'Mon', alerts: 5,  resolved: 4 },
    { day: 'Tue', alerts: 8,  resolved: 6 },
    { day: 'Wed', alerts: 6,  resolved: 6 },
    { day: 'Thu', alerts: 11, resolved: 7 },
    { day: 'Fri', alerts: 9,  resolved: 6 },
    { day: 'Sat', alerts: 7,  resolved: 5 },
    { day: 'Sun', alerts: 9,  resolved: 4 },
  ],

  mapMarkers: [
    { coords: [26.68, 87.17], type: 'flood',     severity: 'critical', label: 'Koshi River — Level 4 Flood'       },
    { coords: [27.95, 85.68], type: 'landslide', severity: 'critical', label: 'Sindhupalchok — Major Landslide'   },
    { coords: [28.05, 82.30], type: 'flood',     severity: 'high',     label: 'Rapti River — Level 3 Flood'       },
    { coords: [28.35, 83.57], type: 'landslide', severity: 'high',     label: 'Myagdi — Landslide Risk 3'         },
    { coords: [27.00, 85.58], type: 'flood',     severity: 'high',     label: 'Bagmati River — Level 3 Flood'     },
    { coords: [28.21, 83.98], type: 'landslide', severity: 'medium',   label: 'Kaski — Landslide Risk 2'          },
    { coords: [27.53, 84.35], type: 'flood',     severity: 'medium',   label: 'Narayani River — Level 2 Flood'    },
    { coords: [27.67, 86.08], type: 'landslide', severity: 'low',      label: 'Dolakha — Landslide Watch'         },
    { coords: [28.60, 81.62], type: 'flood',     severity: 'low',      label: 'Karnali River — Level 1 Flood'     },
  ]
};

// Simulate live data updates — swap with WebSocket/SSE when backend ready
function simulateLiveUpdate(callback) {
  setInterval(() => {
    const delta = Math.floor(Math.random() * 3) - 1;
    callback(delta);
  }, 5000);
}
