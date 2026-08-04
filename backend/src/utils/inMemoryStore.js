const users = [];
const alerts = [];
const predictions = [];
const sensorData = [];

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const applyFilters = (items, filters = {}) => {
  return items.filter((item) => {
    if (filters.disasterType && item.disasterType !== filters.disasterType) return false;
    if (filters.riskLevel && item.riskLevel !== filters.riskLevel) return false;
    if (filters.isActive !== undefined && item.isActive !== filters.isActive) return false;
    return true;
  });
};

module.exports = {
  users,
  alerts,
  predictions,
  sensorData,
  addUser(user) {
    users.push(user);
    return user;
  },
  findUserByEmail(email) {
    return users.find(user => user.email === email) || null;
  },
  findUserById(id) {
    return users.find(user => user._id === id) || null;
  },
  addAlert(alert) {
    const normalized = {
      ...alert,
      _id: alert._id || createId('alert'),
      isActive: alert.isActive !== false,
      notifications: alert.notifications || [],
      totalNotified: alert.totalNotified || 0,
      createdAt: alert.createdAt || new Date(),
      updatedAt: alert.updatedAt || new Date(),
    };
    alerts.push(normalized);
    return normalized;
  },
  getAlerts(filters = {}) {
    return applyFilters(alerts, filters).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  findAlertById(id) {
    return alerts.find(alert => alert._id === id || alert._id?.toString() === id) || null;
  },
  updateAlert(id, updates) {
    const index = alerts.findIndex(alert => alert._id === id || alert._id?.toString() === id);
    if (index === -1) return null;
    alerts[index] = { ...alerts[index], ...updates, updatedAt: new Date() };
    return alerts[index];
  },
  getAlertStats() {
    const total = alerts.length;
    const active = alerts.filter(alert => alert.isActive !== false).length;
    const byType = alerts.reduce((acc, alert) => {
      const key = alert.disasterType || 'unknown';
      if (!acc[key]) acc[key] = { _id: key, count: 0, totalNotified: 0 };
      acc[key].count += 1;
      acc[key].totalNotified += alert.totalNotified || 0;
      return acc;
    }, {});
    return { total, active, byType: Object.values(byType) };
  },
  addPrediction(prediction) {
    const normalized = {
      ...prediction,
      _id: prediction._id || createId('prediction'),
      alertTriggered: Boolean(prediction.alertTriggered),
      createdAt: prediction.createdAt || new Date(),
      updatedAt: prediction.updatedAt || new Date(),
    };
    predictions.push(normalized);
    return normalized;
  },
  updatePrediction(id, updates) {
    const index = predictions.findIndex(prediction => prediction._id === id || prediction._id?.toString() === id);
    if (index === -1) return null;
    predictions[index] = { ...predictions[index], ...updates, updatedAt: new Date() };
    return predictions[index];
  },
  getPredictions(filters = {}, page = 1, limit = 20) {
    const filtered = applyFilters(predictions, filters).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.max(1, parseInt(limit, 10) || 20);
    const start = (safePage - 1) * safeLimit;
    const sliced = filtered.slice(start, start + safeLimit);
    return {
      predictions: sliced,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: filtered.length,
        pages: Math.max(1, Math.ceil(filtered.length / safeLimit)),
      },
    };
  },
  getPredictionStats() {
    const byType = predictions.reduce((acc, item) => {
      const key = item.disasterType || 'unknown';
      if (!acc[key]) acc[key] = { _id: key, count: 0, avgProbability: 0 };
      acc[key].count += 1;
      acc[key].avgProbability += item.probability || 0;
      return acc;
    }, {});
    Object.values(byType).forEach((entry) => {
      entry.avgProbability = parseFloat((entry.avgProbability / entry.count).toFixed(4));
    });

    const byRisk = predictions.reduce((acc, item) => {
      const key = item.riskLevel || 'unknown';
      if (!acc[key]) acc[key] = { _id: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {});

    const recentPredictions = predictions.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

    return { byType: Object.values(byType), byRisk: Object.values(byRisk), recentPredictions };
  },
  addSensorData(item) {
    const normalized = {
      ...item,
      _id: item._id || createId('sensor'),
      createdAt: item.createdAt || new Date(),
      updatedAt: item.updatedAt || new Date(),
    };
    sensorData.push(normalized);
    return normalized;
  },
  getSensorData(filters = {}, limit = 50) {
    const filtered = applyFilters(sensorData, filters).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const safeLimit = Math.max(1, parseInt(limit, 10) || 50);
    return filtered.slice(0, safeLimit);
  },
  getLatestSensorData() {
    return sensorData.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
};
