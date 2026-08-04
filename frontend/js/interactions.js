// Shared UI: toast, modal, confirm dialog, notification panel

// Toast
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:9999;
      display:flex; flex-direction:column; gap:8px; pointer-events:none;
    `;
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', broadcast: '📢' };
  const colors = {
    success: 'var(--accent-green)', error: 'var(--accent-red)',
    warning: 'var(--accent-yellow)', info: 'var(--accent-blue)', broadcast: 'var(--accent-orange)'
  };

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: var(--bg-card); border: 1px solid var(--border-light);
    border-left: 3px solid ${colors[type] || colors.info};
    border-radius: var(--radius-sm); padding: 12px 16px;
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: var(--text-primary);
    box-shadow: var(--shadow); pointer-events: all;
    animation: slideInRight 0.3s ease; min-width: 280px; max-width: 380px;
  `;
  toast.innerHTML = `<span style="font-size:16px;">${icons[type] || icons.info}</span><span style="flex:1;">${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Modal
function showModal({ title, body, actions = [], size = 'md' }) {
  closeModal();
  const widths = { sm: '400px', md: '560px', lg: '720px' };

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:8000;
    display:flex; align-items:center; justify-content:center; padding:20px;
    animation: fadeIn 0.2s ease;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: var(--bg-card); border: 1px solid var(--border-light);
    border-radius: var(--radius); width: 100%; max-width: ${widths[size]};
    max-height: 85vh; display: flex; flex-direction: column;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    animation: slideInUp 0.25s ease;
  `;

  const actionsHtml = actions.map(a =>
    `<button class="btn btn-${a.style || 'secondary'}" data-action="${a.id}">${a.label}</button>`
  ).join('');

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border);">
      <div style="font-size:15px;font-weight:700;">${title}</div>
      <button id="modal-close" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:4px;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">×</button>
    </div>
    <div style="padding:20px;overflow-y:auto;flex:1;">${body}</div>
    ${actionsHtml ? `<div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid var(--border);">${actionsHtml}</div>` : ''}
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  modal.querySelector('#modal-close').addEventListener('click', closeModal);

  actions.forEach(a => {
    const btn = modal.querySelector(`[data-action="${a.id}"]`);
    if (btn && a.onClick) btn.addEventListener('click', () => { a.onClick(); if (a.closeOnClick !== false) closeModal(); });
  });

  return modal;
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.remove();
}

// Confirm dialog
function showConfirm(message, onConfirm, confirmLabel = 'Confirm', confirmStyle = 'danger') {
  showModal({
    title: '⚠️ Confirm Action',
    body: `<p style="color:var(--text-secondary);font-size:14px;line-height:1.6;">${message}</p>`,
    size: 'sm',
    actions: [
      { id: 'cancel', label: 'Cancel', style: 'secondary' },
      { id: 'confirm', label: confirmLabel, style: confirmStyle, onClick: onConfirm },
    ]
  });
}

// Notification panel — live alerts plus the desktop-push toggle
function openNotificationPanel() {
  const alerts = (window.LIVE && LIVE.alerts) || [];
  const typeColors = { critical: 'var(--accent-red)', high: 'var(--accent-orange)', medium: 'var(--accent-yellow)', low: 'var(--accent-green)' };
  const desktopOn = localStorage.getItem('flds-desktop-notify') === 'on';

  showModal({
    title: `🔔 Live Notifications (${alerts.length} active)`,
    size: 'sm',
    body: `
      ${alerts.length ? alerts.slice(0, 10).map(n => `
        <div style="display:flex;gap:12px;padding:12px;border-radius:var(--radius-sm);background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.15);margin-bottom:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${typeColors[n.severity] || 'var(--accent-blue)'};margin-top:5px;flex-shrink:0;"></div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;margin-bottom:2px;">${n.type === 'Flood' ? '🌊' : '⛰️'} ${escapeHtml(n.type)} alert — ${escapeHtml(n.location)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(n.magnitude)} · ${escapeHtml(n.time)}</div>
          </div>
        </div>
      `).join('') : `
        <div style="text-align:center;padding:28px 12px;color:var(--text-muted);font-size:13px;">
          ${window.LIVE && LIVE.online === false ? '⚠️ Backend offline — no live notifications available' : 'No active alerts right now 🎉'}
        </div>`}
      <div style="margin-top:12px;padding:12px;border:1px dashed var(--border);border-radius:var(--radius-sm);background:rgba(59,130,246,0.03);">
        <div style="font-size:12px;font-weight:600;margin-bottom:2px;">🔔 Desktop push alerts</div>
        <div style="font-size:11px;color:var(--text-muted);">Native OS notifications when a new high/critical risk is detected — even in the background. Status: <strong id="desktop-notify-status">${desktopOn ? 'Enabled' : 'Off'}</strong></div>
      </div>`,
    actions: [
      {
        id: 'toggle-notify',
        label: desktopOn ? '🔕 Disable Desktop Alerts' : '🔔 Enable Desktop Alerts',
        style: desktopOn ? 'secondary' : 'primary',
        onClick: () => {
          const update = (on) => {
            const btn = document.querySelector('[data-action="toggle-notify"]');
            if (btn) {
              btn.textContent = on ? '🔕 Disable Desktop Alerts' : '🔔 Enable Desktop Alerts';
              btn.className = `btn ${on ? 'btn-secondary' : 'btn-primary'}`;
            }
            const statusEl = document.getElementById('desktop-notify-status');
            if (statusEl) statusEl.textContent = on ? 'Enabled' : 'Off';
          };
          if (desktopOn) {
            window.disableBrowserNotifications && window.disableBrowserNotifications();
            update(false);
          } else if (window.enableBrowserNotifications) {
            // Enable is async (permission prompt) — refresh UI when it settles
            Promise.resolve(window.enableBrowserNotifications()).then(on => update(!!on));
          }
        },
        closeOnClick: false
      },
      { id: 'close', label: 'Close', style: 'secondary' }
    ]
  });
}

// Broadcast modal
function openBroadcastModal() {
  showModal({
    title: '🚨 Broadcast Emergency Alert',
    size: 'md',
    body: `
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Alert Type</label>
        <select class="filter-select" style="width:100%;padding:10px;" id="bc-type">
          <option>Flood Warning</option>
          <option>Landslide Warning</option>
          <option>Evacuation Order</option>
          <option>All Clear</option>
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Target Area</label>
        <select class="filter-select" style="width:100%;padding:10px;" id="bc-area">
          <option>All Nepal</option>
          <option>Province 1 (Koshi)</option>
          <option>Province 2 (Madhesh)</option>
          <option>Province 3 (Bagmati)</option>
          <option>Province 4 (Gandaki)</option>
          <option>Province 5 (Lumbini)</option>
          <option>Province 6 (Karnali)</option>
          <option>Province 7 (Sudurpashchim)</option>
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Message</label>
        <textarea id="bc-msg" style="
          width:100%;background:var(--bg-secondary);border:1px solid var(--border);
          border-radius:var(--radius-sm);color:var(--text-primary);font-family:inherit;
          font-size:13px;padding:10px;resize:vertical;min-height:80px;outline:none;
        " placeholder="Enter broadcast message..."></textarea>
      </div>
      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-sm);padding:10px 12px;">
        <div style="font-size:12px;color:var(--accent-red);font-weight:600;">⚠️ This will send SMS alerts to all registered contacts in the target area.</div>
      </div>
    `,
    actions: [
      { id: 'cancel', label: 'Cancel', style: 'secondary' },
      { id: 'send', label: '🚨 Send Broadcast', style: 'danger', onClick: () => {
        const type = document.getElementById('bc-type')?.value;
        const area = document.getElementById('bc-area')?.value;
        showToast(`📢 Broadcast sent: "${type}" to ${area}`, 'broadcast', 5000);
      }}
    ]
  });
}

// CSV export
function exportCSV(data, filename) {
  if (!data || !data.length) { showToast('No data to export', 'warning'); return; }
  const headers = Object.keys(data[0]);
  const rows = data.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast(`📥 Exported ${filename}`, 'success');
}

// Profile modal
function openProfileModal() {
  const user = (typeof API !== 'undefined' && API.getUser) ? API.getUser() : null;
  const name = (user && user.name) || 'Bagale Dada';
  const email = (user && user.email) || 'admin@flds.demo';
  const role = (user && user.role) || 'admin';
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'BD';
  const roleLabel = role === 'admin' ? 'System Administrator' : role === 'responder' ? 'Responder' : 'User';

  showModal({
    title: `👤 ${name}`,
    size: 'sm',
    body: `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="width:64px;height:64px;border-radius:12px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;margin:0 auto 12px;">${initials}</div>
        <div style="font-size:16px;font-weight:700;">${name}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${email}</div>
      </div>
      <div style="display:grid;gap:8px;">
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-muted);">Role</span>
          <span style="font-size:12px;font-weight:600;">${roleLabel}</span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-muted);">Email</span>
          <span style="font-size:12px;font-weight:600;">${email}</span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-muted);">Access Level</span>
          <span style="font-size:12px;font-weight:600;color:var(--accent-green);">Full Access</span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:10px 14px;display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--text-muted);">Last Login</span>
          <span style="font-size:12px;font-weight:600;">Today, ${new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    `,
    actions: [{ id: 'close', label: 'Close', style: 'secondary' }]
  });
}

// Alert-location picker modal — change the district/province this account is
// scoped to. Persists to the profile via PUT /auth/profile.
function showLocationModal() {
  if (typeof NEPAL_PROVINCES === 'undefined') {
    showToast('Location data not loaded — open the dashboard first', 'warning');
    return;
  }
  const user = (typeof API.getUser === 'function') ? API.getUser() : null;
  const curProvince = ((user && user.province) || '').trim();
  const curDistrict = ((user && user.district) || '').trim();

  const provinceOptions = ['<option value="">🇳🇵 All Nepal</option>']
    .concat(NEPAL_PROVINCES.map(p =>
      `<option value="${p.name}" ${p.name === curProvince ? 'selected' : ''}>${p.icon} ${p.name}</option>`
    )).join('');

  const districtOptions = ['<option value="">All districts</option>']
    .concat(Object.entries(NEPAL_DISTRICT_PROVINCE)
      .filter(([, prov]) => !curProvince || prov === curProvince)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d]) => `<option value="${d}" ${d === curDistrict ? 'selected' : ''}>${d}</option>`)
    ).join('');

  showModal({
    title: '📍 Change Alert Location',
    size: 'sm',
    body: `
      <p style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:14px;">
        Alerts on the dashboard, the alerts page and your notifications are scoped to this location.
        Pick a province for province-wide alerts, or a district for its alerts only.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">Province</label>
          <select class="filter-select" style="width:100%;padding:10px;" id="loc-province">${provinceOptions}</select>
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px;">District</label>
          <select class="filter-select" style="width:100%;padding:10px;" id="loc-district">${districtOptions}</select>
        </div>
      </div>
    `,
    actions: [
      { id: 'cancel', label: 'Cancel', style: 'secondary' },
      {
        id: 'save', label: '💾 Save Location', style: 'primary', closeOnClick: false,
        onClick: async () => {
          const province = document.getElementById('loc-province').value;
          const district = document.getElementById('loc-district').value;
          try {
            const res = await API.auth.updateProfile({ province, district });
            if (res.data && res.data.user) API.setSession(API.getToken(), res.data.user);
            if (typeof window.setScopeOverride === 'function') window.setScopeOverride(false);
            closeModal();
            showToast(
              district ? `📍 Alerts scoped to ${province} · ${district}`
                : province ? `📍 Alerts scoped to ${province} Province`
                  : '🇳🇵 Alerts now show all of Nepal',
              'success'
            );
            setTimeout(() => window.location.reload(), 600);
          } catch (err) {
            showToast(`Could not save location: ${(err.data && err.data.message) || err.message}`, 'error');
          }
        }
      }
    ]
  });

  // Province → district cascade inside the modal
  const provSel = document.getElementById('loc-province');
  const distSel = document.getElementById('loc-district');
  provSel.addEventListener('change', () => populateDistrictSelect(distSel, provSel.value));
}

// Animation styles
const interactionStyles = document.createElement('style');
interactionStyles.textContent = `
  @keyframes slideInRight { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
  @keyframes slideOutRight { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(20px); } }
  @keyframes slideInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
`;
document.head.appendChild(interactionStyles);

// Global header wiring
document.addEventListener('DOMContentLoaded', () => {
  // Show the logged-in user's name in the sidebar footer
  const user = (typeof API !== 'undefined' && API.getUser) ? API.getUser() : null;
  document.querySelectorAll('.sidebar-footer .nav-item').forEach(el => {
    const name = (user && user.name) || el.textContent.trim();
    el.textContent = '';
    const icon = document.createElement('span');
    icon.className = 'nav-icon';
    icon.textContent = '👤';
    el.appendChild(icon);
    el.appendChild(document.createTextNode(name));
  });
  // Avatar initials
  document.querySelectorAll('.avatar').forEach(a => {
    if (user && user.name) {
      a.textContent = user.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    }
  });

  // Notification bell
  document.querySelectorAll('.header-btn').forEach(btn => {
    if (btn.textContent.includes('🔔')) btn.addEventListener('click', openNotificationPanel);
    if (btn.textContent.includes('🔄')) btn.addEventListener('click', () => {
      btn.style.animation = 'spin 0.6s linear';
      showToast('Data refreshed successfully', 'success');
      setTimeout(() => btn.style.animation = '', 700);
    });
  });

  // Avatar → profile
  document.querySelectorAll('.avatar').forEach(a => a.addEventListener('click', openProfileModal));

  // Broadcast button (any page)
  document.querySelectorAll('.btn-danger').forEach(btn => {
    if (btn.textContent.includes('Broadcast')) btn.addEventListener('click', openBroadcastModal);
  });
});
