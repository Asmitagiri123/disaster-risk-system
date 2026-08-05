// Server-Sent Events feed. Reacts to backend events (alerts, predictions,
// sensor ingest) as they happen.

(function () {
  let source = null;
  let reconnectTimer = null;

  const RISK_LEVELS = { high: 'high', moderate: 'medium', low: 'low' };
  const TYPE_ICONS = { flood: '🌊', landslide: '⛰️', earthquake: '🏚️' };

  // Connection management
  window.startLiveFeed = function () {
    if (source) return;
    const token = API.getToken();
    if (!token) return;

    const base = API.BASE_URL.replace(/\/api\/v1\/?$/, '');
    source = new EventSource(`${base}/api/v1/events/stream?token=${encodeURIComponent(token)}`);

    source.addEventListener('connected', () => {
      setLiveStatus(true);
      console.info('[live-feed] Connected to real-time stream');
      // Backend just came back — retry the data load if we're showing offline.
      if (document.getElementById('offline-banner') && window.retryLiveData) {
        window.retryLiveData();
      }
    });

    source.addEventListener('error', () => {
      if (source && source.readyState === EventSource.CLOSED) return;
    });
    source.addEventListener('alert:new', (e) => onAlertNew(JSON.parse(e.data)));
    source.addEventListener('alert:resolved', (e) => onAlertResolved(JSON.parse(e.data)));
    source.addEventListener('alert:confirmed', (e) => onAlertConfirmed(JSON.parse(e.data)));
    source.addEventListener('prediction:new', (e) => onPredictionNew(JSON.parse(e.data)));
    source.addEventListener('sensor:ingest', (e) => onSensorIngest(JSON.parse(e.data)));

    source.onerror = () => {
      // EventSource auto-reconnects; just reflect status
      setLiveStatus(false);
    };
  };

  window.stopLiveFeed = function () {
    if (source) { source.close(); source = null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    setLiveStatus(false);
  };

  function setLiveStatus(connected) {
    document.querySelectorAll('.status-indicator').forEach((el) => {
      const dot = el.querySelector('.status-dot');
      if (dot) dot.classList.toggle('live-on', connected);
      el.setAttribute('data-live', connected ? 'on' : 'off');
      if (connected && !el.querySelector('.live-pill')) {
        const pill = document.createElement('span');
        pill.className = 'live-pill';
        pill.textContent = '● LIVE';
        el.appendChild(pill);
      } else if (!connected && el.querySelector('.live-pill')) {
        el.querySelector('.live-pill').remove();
      }
    });
  }

  // Browser push notifications (opt-in, stored in localStorage). Resolves to
  // the final enabled state so the panel can refresh after the permission prompt.
  window.enableBrowserNotifications = function () {
    if (!('Notification' in window)) {
      showToast('Desktop notifications are not supported by this browser', 'warning');
      return Promise.resolve(false);
    }
    if (Notification.permission === 'granted') {
      localStorage.setItem('flds-desktop-notify', 'on');
      showToast('🔔 Desktop alerts enabled — you will be notified on new high-risk alerts', 'success');
      return Promise.resolve(true);
    }
    if (Notification.permission === 'denied') {
      showToast('Notifications are blocked — allow them in your browser settings', 'warning');
      return Promise.resolve(false);
    }
    return Notification.requestPermission().then(p => {
      if (p === 'granted') {
        localStorage.setItem('flds-desktop-notify', 'on');
        showToast('🔔 Desktop alerts enabled — you will be notified on new high-risk alerts', 'success');
        return true;
      }
      showToast('Notifications not enabled — you can allow them in browser settings', 'warning');
      return false;
    });
  };

  window.disableBrowserNotifications = function () {
    localStorage.removeItem('flds-desktop-notify');
    showToast('🔕 Desktop alerts disabled', 'info');
  };

  function browserNotify(sev, type, loc, prob, message) {
    if (localStorage.getItem('flds-desktop-notify') !== 'on') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(`🚨 ${sev.toUpperCase()} ${type.toUpperCase()} RISK — ${loc}`, {
        body: `${prob}% probability. ${(message || 'Take immediate precautions.').slice(0, 120)}`,
        tag: `flds-${type}-${loc}`,
        renotify: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (err) { /* notifications unavailable — visual alerts still work */ }
  }

  // Real event handlers
  function onAlertNew(data) {
    const a = data.alert || {};
    // SSE carries `id`; expose it as _id too so pages resolve by the doc id.
    const alertId = a.id || a._id;
    const normalized = { ...a, _id: alertId, id: alertId };
    const type = (a.disasterType || 'alert').toLowerCase();
    const loc = (a.location && (a.location.city || a.location.address)) || 'Nepal';

    // Location-scoped accounts only hear about their own area.
    if (typeof window.alertInScope === 'function' && !window.alertInScope(loc)) return;
    const prob = window.displayProbability ? window.displayProbability(a.probability, a.riskLevel) : Math.round((a.probability || 0) * 100);
    const sev = a.riskLevel || 'high';

    if (sev === 'high') playAlertSound(sev);
    showToast(`🚨 NEW ${type.toUpperCase()} ALERT — ${loc} (${prob}%)`, sev === 'high' ? 'warning' : 'info', 8000);
    if (sev === 'high') browserNotify(sev, type, loc, prob, a.message);

    // Notify other pages (e.g. alerts page prepends a card) via DOM event
    document.dispatchEvent(new CustomEvent('flds:alert:new', { detail: { alert: normalized } }));

    // 1. Bump the Active Alerts stat
    const statAlerts = document.getElementById('stat-alerts');
    if (statAlerts) statAlerts.textContent = parseInt(statAlerts.textContent || '0', 10) + 1;

    // 2. Prepend to the dashboard alerts list
    const alertsList = document.getElementById('alerts-list');
    if (alertsList && window.LIVE) {
      const verification = (typeof window.alertVerification === 'function') ? window.alertVerification(normalized) : null;
      LIVE.alerts.unshift({
        id: alertId,
        type: TYPE_ICONS[type] === '🌊' ? 'Flood' : TYPE_ICONS[type] === '⛰️' ? 'Landslide' : 'Earthquake',
        severity: RISK_LEVELS[sev] || sev,
        riskLevel: a.riskLevel || sev,
        location: loc,
        magnitude: `Prob ${prob}%`,
        time: 'just now',
        coords: (a.location && a.location.coordinates) ? [a.location.coordinates[1], a.location.coordinates[0]] : [28.1, 84.0],
        verification,
        crossVerified: !!(verification && verification.ruleAgreed),
        _raw: normalized,
      });
      if (typeof renderAlerts === 'function') renderAlerts();
    }

    // 3. Prepend to the timeline (live activity feed)
    const timeline = document.getElementById('timeline');      if (timeline) {
      const item = document.createElement('div');
      item.className = `timeline-item ${sev === 'high' ? 'warning' : 'warning'} fade-in`;
      item.innerHTML = /*html*/`
        <div class="timeline-time">just now</div>
        <div class="timeline-title">🚨 ${TYPE_ICONS[type] || '⚠️'} ${type} alert raised — ${loc}</div>
        <div class="timeline-desc">${sev} risk ${type} — ${prob}% model probability</div>`;
      timeline.prepend(item);
      while (timeline.children.length > 8) timeline.lastChild.remove();
    }
    if (window.LIVE && window.LIVE.timeline) {
      window.LIVE.timeline.unshift({
        time: 'just now',
        title: `🚨 ${type} alert raised — ${loc}`,
        desc: `${sev} risk ${type} — ${prob}% model probability`,
        type: sev === 'high' ? 'warning' : 'warning',
      });
      window.LIVE.timeline = window.LIVE.timeline.slice(0, 8);
    }

    // Re-fetch the count so the badge doesn't drift from the server
    if (window.LIVE && typeof loadLiveAlerts === 'function') {
      loadLiveAlerts().then(() => {
        const statAlerts = document.getElementById('stat-alerts');
        if (statAlerts && window.LIVE) {
          statAlerts.textContent = LIVE.alerts.length;
        }
        if (typeof renderAlerts === 'function') renderAlerts();
      }).catch(() => {});
    }

    // 4. Bump notification badge
    const badge = document.querySelector('.notif-badge');
    if (badge) badge.textContent = parseInt(badge.textContent || '0', 10) + 1;

    if (typeof showToast === 'undefined') { /* interactions not loaded yet */ }
  }

  function onAlertResolved(data) {
    const id = String(data.alertId || '');
    if (!id) return;
    let location = 'Nepal';
    let disasterType = 'alert';
    if (window.LIVE) {
      const resolved = LIVE.alerts.find((x) => String(x._raw && x._raw._id) === id);
      if (resolved) {
        location = resolved.location;
        disasterType = resolved.type;
      }
      const before = LIVE.alerts.length;
      LIVE.alerts = LIVE.alerts.filter((x) => String(x._raw && x._raw._id) !== id);
      const after = LIVE.alerts.length;
      const statAlerts = document.getElementById('stat-alerts');
      if (statAlerts && after < before) {
        statAlerts.textContent = Math.max(0, parseInt(statAlerts.textContent || '0', 10) - 1);
      }
      if (typeof renderAlerts === 'function') renderAlerts();

      const timeline = document.getElementById('timeline');
      if (timeline) {
        const item = document.createElement('div');
        item.className = 'timeline-item resolved fade-in'; //
        item.innerHTML = `
          <div class="timeline-time">just now</div>
          <div class="timeline-title">✅ ${disasterType} alert resolved — ${location}</div>
          <div class="timeline-desc">Conditions no longer warrant an active alert</div>`;
        timeline.prepend(item);
        while (timeline.children.length > 8) timeline.lastChild.remove();
      }
      if (window.LIVE.timeline) {
        window.LIVE.timeline.unshift({
          time: 'just now',
          title: `✅ ${disasterType} alert resolved — ${location}`,
          desc: 'Conditions no longer warrant an active alert',
          type: 'resolved',
        });
        window.LIVE.timeline = window.LIVE.timeline.slice(0, 8);
      }
      // Let other pages (e.g. alerts page) remove the resolved card
      document.dispatchEvent(new CustomEvent('flds:alert:resolved', {
        detail: { alertId: id, location, disasterType },
      }));
    }
    showToast(`✅ ${disasterType} alert resolved — ${location}`, 'success');
  }

  function onAlertConfirmed(data) {
    const id = String(data.alertId || '');
    const status = data.status || '';
    if (!id) return;
    // Reflect the human field report in the live list + dashboard list
    if (window.LIVE) {
      const hit = LIVE.alerts.find((x) => String(x._raw && x._raw._id) === id);
      if (hit) {
        hit.groundTruth = {
          status,
          by: data.by || null,
          at: data.at || new Date().toISOString(),
          note: data.note || '',
        };
        if (typeof renderAlerts === 'function') renderAlerts();
      }
    }
    // Let other pages (alerts page) update badges + buttons
    document.dispatchEvent(new CustomEvent('flds:alert:confirmed', {
      detail: { alertId: id, status, note: data.note || '' },
    }));
    showToast(status === 'confirmed'
      ? '📋 Alert confirmed by field report'
      : '📋 Alert marked not confirmed (field report)', 'info', 4000);
  }

  function onPredictionNew(data) {
    const p = data.prediction || {};
    const type = (p.disasterType || '').toLowerCase();
    const loc = (p.location && (p.location.city || p.location.address)) || 'Nepal';
    const prob = window.displayProbability ? window.displayProbability(p.probability, p.riskLevel) : Math.round((p.probability || 0) * 100);
    if (p.alertTriggered) return; // alert:new handles the loud notification

    showToast(`🔮 ${type} prediction: ${prob}% at ${loc}`, 'info', 5000);

    if (window.LIVE && typeof loadLivePredictions === 'function') {
      // Refresh predictions asynchronously (non-blocking)
      loadLivePredictions().then(() => {
        if (typeof renderPredictions === 'function') renderPredictions();
      }).catch(() => {});
    }
  }

  function onSensorIngest(data) {
    const type = (data.disasterType || '').toLowerCase();
    const loc = (data.location && (data.location.city || data.location.address)) || 'Nepal';
    showToast(`📡 ${type} reading received from ${loc}`, 'info', 3500);
  }

  // Alert sound (Web Audio, no asset file)
  let audioCtx = null;
  function playAlertSound(severity) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const beep = (freq, delay, dur) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = audioCtx.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      };
      if (severity === 'high') { beep(880, 0, 0.15); beep(880, 0.2, 0.25); }
      else { beep(440, 0, 0.3); }
    } catch (err) {
      // Audio not available — visual alerts still work
    }
  }
})();
