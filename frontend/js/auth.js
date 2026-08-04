// auth.js — Authentication gate + data loading helper with offline fallback

(function () {
  // Redirect to login page if no valid token.
  window.requireAuth = function () {
    const token = API.getToken();
    if (!token) {
      const isLoginPage = window.location.pathname.split('/').pop() === 'login.html';
      if (!isLoginPage) {
        const inPagesDir = window.location.pathname.includes('/pages/');
        window.location.href = inPagesDir ? '../login.html' : 'login.html';
      }
      return false;
    }
    refreshSessionUser();
    return true;
  };

  // Sync the stored session user with the server profile (name, role, location
  // scope) so a scope changed elsewhere is picked up without a manual re-login.
  window.refreshSessionUser = function () {
    if (!API.getToken()) return Promise.resolve();
    return API.auth.me()
      .then(res => {
        const u = res.data && res.data.user;
        if (!u) return;
        const old = API.getUser() || {};
        API.setSession(API.getToken(), u);
        // Scope changed outside this session — reload once so the scoped views
        // re-fetch with the new profile (guarded against reload loops).
        const scopeChanged =
          (old.district || '') !== (u.district || '') ||
          (old.province || '') !== (u.province || '');
        if (scopeChanged && !sessionStorage.getItem('flds_scope_reloaded')) {
          sessionStorage.setItem('flds_scope_reloaded', '1');
          window.location.reload();
        } else {
          sessionStorage.removeItem('flds_scope_reloaded');
        }
      })
      .catch(() => {});
  };

  // Live-data loading with auto-recovery. On failure we show an offline
  // banner and retry in the background (no mock data). 401s log the user out.
  let _pendingLoad = null;
  let _retryTimer = null;
  let _retryCount = 0;
  const RETRY_INTERVAL_MS = 5000;
  const MAX_RETRIES = 60; // ~5 minutes of background retrying

  function handleLoadError(err) {
    if (window.LIVE) LIVE.online = false;
    if (err.status === 401 && API.getToken()) {
      API.clearSession();
      window.location.href = 'login.html';
      return;
    }
    showOfflineBanner('Backend unreachable — no live data. Retrying automatically…');
    scheduleRetry();
  }

  async function runLoad() {
    try {
      await _pendingLoad();
      _retryCount = 0;
      if (window.LIVE) LIVE.online = true;
      dismissOfflineBanner();
    } catch (err) {
      handleLoadError(err);
    }
  }

  function scheduleRetry() {
    if (_retryTimer || _retryCount >= MAX_RETRIES) return;
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      _retryCount += 1;
      runLoad();
    }, RETRY_INTERVAL_MS);
  }

  // Immediate retry — used by the banner button and the SSE reconnect hook.
  window.retryLiveData = function () {
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
    if (_pendingLoad) runLoad();
  };

  window.withLiveData = async function (load) {
    _pendingLoad = load;
    await runLoad();
  };

  function dismissOfflineBanner() {
    const existing = document.getElementById('offline-banner');
    if (existing) existing.remove();
  }

  window.dismissOfflineBanner = dismissOfflineBanner;

  function showOfflineBanner(message) {
    const existing = document.getElementById('offline-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      background: var(--accent-yellow, #eab308); color: #1a1a1a;
      text-align: center; padding: 6px 16px; font-size: 12px; font-weight: 700;
      font-family: Inter, sans-serif; display: flex; align-items: center;
      justify-content: center; gap: 12px; flex-wrap: wrap;
    `;
    const text = document.createElement('span');
    text.textContent = `⚠️ ${message}`;
    const retryBtn = document.createElement('button');
    retryBtn.textContent = '↻ Retry now';
    retryBtn.style.cssText = `
      background: #1a1a1a; color: #fff; border: none; border-radius: 12px;
      padding: 3px 12px; font-size: 11px; font-weight: 700; cursor: pointer;
    `;
    retryBtn.addEventListener('click', () => {
      dismissOfflineBanner();
      window.retryLiveData && window.retryLiveData();
    });
    banner.appendChild(text);
    banner.appendChild(retryBtn);
    document.body.prepend(banner);
  }
})();
